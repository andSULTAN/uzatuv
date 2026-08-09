package uz.uzatuv.transport

import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import uz.uzatuv.ConnState
import uz.uzatuv.ControlCodec
import uz.uzatuv.ControlMessage
import uz.uzatuv.DeviceInfo
import uz.uzatuv.EncodedFrame
import uz.uzatuv.PairingInfo
import uz.uzatuv.TransportClient
import uz.uzatuv.protocol.Crypto
import uz.uzatuv.protocol.FrameParser
import uz.uzatuv.protocol.Framing
import uz.uzatuv.protocol.Proto
import uz.uzatuv.protocol.Video
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import kotlin.concurrent.thread
import kotlin.math.min

/**
 * TransportClientImpl — Android (klient) transport qatlami.
 *
 * Mas'uliyat (PROTOCOL.md §1, §2, §6):
 *   - TCP ulanish (TCP_NODELAY=true)
 *   - Handshake: CLIENT_HELLO → SERVER_HELLO (auth tekshir) → CLIENT_AUTH → SERVER_READY
 *   - Kalit hosil qilish (HKDF) + AEAD (AES-256-GCM) kanallari
 *   - Video/Control frame yuborish (seal + length-prefix)
 *   - Frame qabul qilish (open + decode), CONTROL xabarlarni tarqatish
 *   - PING/PONG (latency + o'liq ulanishni aniqlash)
 *   - Reconnect (backoff) — sessionKey saqlanadi
 *
 * Barcha protokol mantiqi `uz.uzatuv.protocol.*` (muzlatilgan mirror)dan ishlatiladi.
 */
class TransportClientImpl(
    private val device: DeviceInfo,
    private val codecs: List<String> = listOf(Proto.CODEC_H264),
) : TransportClient {

    private companion object {
        const val TAG = "UzatuvTransport"
        const val READ_BUF = 64 * 1024
    }

    private var pairing: PairingInfo? = null

    @Volatile private var socket: Socket? = null
    @Volatile private var output: OutputStream? = null
    @Volatile private var sendCh: Crypto.SecureChannel? = null
    @Volatile private var recvCh: Crypto.SecureChannel? = null

    @Volatile private var closed = false
    @Volatile private var state = ConnState.CLOSED

    private var connThread: Thread? = null
    private var pingThread: Thread? = null

    private var controlHandler: ((ControlMessage) -> Unit)? = null
    private var stateHandler: ((ConnState) -> Unit)? = null

    // Video AU ketma-ket raqami (har AU'da +1)
    private var videoSeq = 0

    // Yuborish (seal + write) qat'iy ketma-ketlikda bo'lishi shart — nonce counter tartibi uchun
    private val sendLock = Any()

    // PING/PONG holati
    @Volatile private var pingSeq = 0
    @Volatile private var lastInboundMs = 0L

    override fun connect(pairing: PairingInfo) {
        this.pairing = pairing
        closed = false
        videoSeq = 0
        connThread = thread(name = "uzatuv-conn", isDaemon = true) { runConnectionLoop() }
    }

    override fun onControl(handler: (ControlMessage) -> Unit) { controlHandler = handler }
    override fun onStateChange(handler: (ConnState) -> Unit) { stateHandler = handler }

    // -------------------------------------------------------------------------
    // Ulanish sikli + reconnect (backoff)
    // -------------------------------------------------------------------------
    private fun runConnectionLoop() {
        var attempt = 0
        while (!closed) {
            try {
                setState(if (attempt == 0) ConnState.CONNECTING else ConnState.RECONNECTING)
                openAndHandshake()
                attempt = 0
                lastInboundMs = System.currentTimeMillis()
                setState(ConnState.READY)
                startPingThread()
                readLoop() // socket yopilguncha bloklaydi
            } catch (e: Exception) {
                Log.w(TAG, "Ulanish uzildi: ${e.message}")
            }
            stopPingThread()
            closeSocketQuiet()
            if (closed) break
            val idx = min(attempt, Proto.RECONNECT_BACKOFF_MS.size - 1)
            val backoff = Proto.RECONNECT_BACKOFF_MS[idx]
            attempt++
            setState(ConnState.RECONNECTING)
            try { Thread.sleep(backoff) } catch (_: InterruptedException) { break }
        }
        setState(ConnState.CLOSED)
    }

    private fun openAndHandshake() {
        val p = pairing ?: error("pairing yo'q")
        val sock = Socket()
        sock.tcpNoDelay = true
        sock.connect(InetSocketAddress(p.ip, p.port), 8000)
        val input = sock.getInputStream()
        val out = sock.getOutputStream()
        socket = sock
        output = out

        val parser = FrameParser()

        // 1) CLIENT_HELLO (ochiq JSON)
        val clientNonce = Crypto.generateNonce()
        writePlain(out, buildClientHello(p, clientNonce))

        // 2) SERVER_HELLO
        val serverHello = readPlainJson(input, parser)
        require(serverHello.optString("type") == "SERVER_HELLO") {
            "kutilmagan javob: ${serverHello.optString("type")}"
        }
        val serverNonce = Base64.decode(serverHello.getString("serverNonce"), Base64.NO_WRAP)
        val chosenCodec = serverHello.optString("chosenCodec", Proto.CODEC_H264)
        val serverAuth = Base64.decode(serverHello.getString("serverAuth"), Base64.NO_WRAP)

        // Server sessionKey'ni biladimi — tekshir (MITM'dan himoya)
        val expectedServerAuth = Crypto.hmacAuth(
            p.sessionKey, Proto.HMAC_SERVER_LABEL, clientNonce, serverNonce,
        )
        require(Crypto.timingSafeEqual(serverAuth, expectedServerAuth)) { "SERVER_HELLO auth mos emas" }

        // 3) CLIENT_AUTH
        val clientAuth = Crypto.hmacAuth(
            p.sessionKey, Proto.HMAC_CLIENT_LABEL, clientNonce, serverNonce,
        )
        val clientAuthJson = JSONObject()
            .put("type", "CLIENT_AUTH")
            .put("clientAuth", Base64.encodeToString(clientAuth, Base64.NO_WRAP))
        writePlain(out, clientAuthJson.toString().toByteArray(Charsets.UTF_8))

        // 4) SERVER_READY (yoki ERROR)
        val ready = readPlainJson(input, parser)
        when (ready.optString("type")) {
            "SERVER_READY" -> { /* ok */ }
            "ERROR" -> error("server ERROR: ${ready.optString("code")} ${ready.optString("message")}")
            else -> error("kutilmagan: ${ready.optString("type")}")
        }

        // Kalit hosil qilish + AEAD kanallari (client roli)
        val keys = Crypto.deriveKeys(p.sessionKey, clientNonce, serverNonce)
        val (send, recv) = Crypto.makeSecureChannels(keys, "client")
        sendCh = send
        recvCh = recv

        Log.i(TAG, "Handshake tugadi. Kelishilgan kodek: $chosenCodec")

        // Parserda handshakedan qolgan bayt bo'lsa — u shifrlangan frame boshlanishi.
        // readLoop shu parserni davom ettiradi.
        this.handshakeParser = parser
    }

    private var handshakeParser: FrameParser? = null

    private fun buildClientHello(p: PairingInfo, clientNonce: ByteArray): ByteArray {
        val screen = JSONObject()
            .put("width", device.width)
            .put("height", device.height)
            .put("densityDpi", device.densityDpi)
        val deviceObj = JSONObject()
            .put("deviceId", device.deviceId)
            .put("name", device.name)
            .put("model", device.model)
            .put("androidSdk", device.androidSdk)
            .put("screen", screen)
        val codecsArr = JSONArray().apply { codecs.forEach { put(it) } }
        val hello = JSONObject()
            .put("type", "CLIENT_HELLO")
            .put("protocolVersion", Proto.PROTOCOL_VERSION)
            .put("clientNonce", Base64.encodeToString(clientNonce, Base64.NO_WRAP))
            .put("serverId", p.serverId)
            .put("device", deviceObj)
            .put("codecs", codecsArr)
        return hello.toString().toByteArray(Charsets.UTF_8)
    }

    // -------------------------------------------------------------------------
    // Qabul qilish (shifrlangan frame'lar)
    // -------------------------------------------------------------------------
    private fun readLoop() {
        val input = socket?.getInputStream() ?: return
        val parser = handshakeParser ?: FrameParser()
        handshakeParser = null
        val buf = ByteArray(READ_BUF)

        // Handshakedan qolgan bayt allaqachon parserda — avval ularni tekshiramiz
        drainFrames(parser)

        while (!closed) {
            val n = input.read(buf)
            if (n < 0) break
            parser.push(buf, n)
            drainFrames(parser)
        }
    }

    private fun drainFrames(parser: FrameParser) {
        while (true) {
            val sealed = parser.next() ?: break
            val plain = try {
                recvCh?.open(sealed) ?: break
            } catch (e: Exception) {
                // AEAD tag xato → protokol xatosi, ulanishni uzamiz
                Log.e(TAG, "AEAD open xatosi — ulanish uziladi", e)
                closeSocketQuiet()
                return
            }
            lastInboundMs = System.currentTimeMillis()
            val inner = Framing.decodeInner(plain)
            when (inner.channel) {
                Proto.CH_CONTROL -> handleControl(ControlCodec.decode(inner.payload))
                Proto.CH_VIDEO -> { /* klient video qabul qilmaydi — e'tiborsiz */ }
                else -> { /* noma'lum channel — forward-compat, e'tiborsiz */ }
            }
        }
    }

    private fun handleControl(msg: ControlMessage) {
        when (msg) {
            is ControlMessage.Ping -> {
                // Serverga PONG (uning tSentMs'ini qaytaramiz)
                sendControl(ControlMessage.Pong(msg.seq, msg.tSentMs))
            }
            is ControlMessage.Pong -> {
                // lastInboundMs allaqachon yangilandi — o'liq ulanish taymeri uchun yetarli
            }
            else -> {}
        }
        // Barcha xabarlarni yuqoriga (MirrorController) uzatamiz
        controlHandler?.invoke(msg)
    }

    // -------------------------------------------------------------------------
    // Yuborish
    // -------------------------------------------------------------------------
    override fun sendVideo(frame: EncodedFrame) {
        var flags = 0
        if (frame.isKeyframe) flags = flags or Proto.FLAG_KEYFRAME
        if (frame.isConfig) flags = flags or Proto.FLAG_CONFIG
        val payload = Video.packVideoPayload(frame.ptsUs, videoSeq++, frame.data)
        writeSealed(Proto.CH_VIDEO, flags, payload)
    }

    override fun sendControl(msg: ControlMessage) {
        writeSealed(Proto.CH_CONTROL, 0, ControlCodec.encode(msg))
    }

    private fun writeSealed(channel: Int, flags: Int, payload: ByteArray) {
        val ch = sendCh ?: return
        val out = output ?: return
        synchronized(sendLock) {
            try {
                val inner = Framing.encodeInner(channel, flags, payload)
                val sealed = ch.seal(inner)
                val frame = Framing.frameWithLength(sealed)
                out.write(frame)
                out.flush()
            } catch (e: Exception) {
                Log.w(TAG, "Yuborishda xato — ulanish uziladi", e)
                closeSocketQuiet() // readLoop chiqadi → reconnect
            }
        }
    }

    // -------------------------------------------------------------------------
    // PING/PONG — latency + o'liq ulanishni aniqlash
    // -------------------------------------------------------------------------
    private fun startPingThread() {
        stopPingThread()
        pingThread = thread(name = "uzatuv-ping", isDaemon = true) {
            while (!closed && socket?.isClosed == false) {
                try { Thread.sleep(Proto.PING_INTERVAL_MS) } catch (_: InterruptedException) { break }
                if (closed) break
                // Javob kelmayapti — o'lik ulanish
                if (System.currentTimeMillis() - lastInboundMs > Proto.PONG_TIMEOUT_MS) {
                    Log.w(TAG, "PONG timeout — ulanish uziladi")
                    closeSocketQuiet()
                    break
                }
                sendControl(ControlMessage.Ping(++pingSeq, System.currentTimeMillis()))
            }
        }
    }

    private fun stopPingThread() {
        pingThread?.interrupt()
        pingThread = null
    }

    // -------------------------------------------------------------------------
    // Uzilish
    // -------------------------------------------------------------------------
    override fun disconnect(reason: String) {
        closed = true
        // Iloji bo'lsa toza DISCONNECT yuboramiz
        try {
            if (sendCh != null && socket?.isClosed == false) {
                sendControl(ControlMessage.Disconnect(reason))
            }
        } catch (_: Exception) {}
        stopPingThread()
        closeSocketQuiet()
        connThread?.interrupt()
        setState(ConnState.CLOSED)
    }

    private fun closeSocketQuiet() {
        try { socket?.close() } catch (_: Exception) {}
        socket = null
        output = null
        sendCh = null
        recvCh = null
    }

    private fun setState(s: ConnState) {
        if (state == s) return
        state = s
        stateHandler?.invoke(s)
    }

    // -------------------------------------------------------------------------
    // Ochiq (plaintext) handshake yordamchi funksiyalari
    // -------------------------------------------------------------------------
    private fun writePlain(out: OutputStream, json: ByteArray) {
        out.write(Framing.frameWithLength(json))
        out.flush()
    }

    /** Bitta to'liq ochiq frame kelguncha bloklab o'qiydi, JSON qaytaradi. */
    private fun readPlainJson(input: InputStream, parser: FrameParser): JSONObject {
        val buf = ByteArray(8 * 1024)
        while (true) {
            val existing = parser.next()
            if (existing != null) return JSONObject(String(existing, Charsets.UTF_8))
            val n = input.read(buf)
            if (n < 0) error("handshake paytida ulanish uzildi")
            parser.push(buf, n)
        }
    }
}
