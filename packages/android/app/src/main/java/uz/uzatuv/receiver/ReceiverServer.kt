package uz.uzatuv.receiver

import android.util.Base64
import android.util.Log
import android.view.Surface
import org.json.JSONArray
import org.json.JSONObject
import uz.uzatuv.protocol.Crypto
import uz.uzatuv.protocol.FrameParser
import uz.uzatuv.protocol.Framing
import uz.uzatuv.protocol.Proto
import uz.uzatuv.protocol.Video
import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * ReceiverServer — QABUL QILISH rejimi (server). TCP porti ochib tinglaydi,
 * uzatuvchi ulanganда handshake (SERVER tomonidan) qiladi, video AU'larni qabul
 * qilib [VideoDecoder] orqali Surface'ga chizadi.
 *
 * Handshake: CLIENT_HELLO → SERVER_HELLO (auth) → CLIENT_AUTH (tekshir) →
 * SERVER_READY → HKDF (server roli) → AES-256-GCM. Keyin STREAM_CONFIG/START/
 * KEYFRAME_REQUEST yuboriladi va video qabul qilinadi.
 *
 * Bir vaqtда bitta faol ulanish (bitta ekran ko'rsatiladi) — yangi ulanish eskisini
 * almashtiradi.
 */
class ReceiverServer(
    private val identity: ReceiverIdentity,
    /** state: "listening" | "connected" | "error"; peerName ulanganда. */
    private val onState: (state: String, peerName: String) -> Unit,
) {
    companion object {
        private const val TAG = "UzatuvReceiver"
    }

    private var serverSocket: ServerSocket? = null
    @Volatile private var running = false
    @Volatile private var surface: Surface? = null
    @Volatile private var conn: Conn? = null
    var port: Int = Proto.DEFAULT_PORT
        private set

    fun setSurface(s: Surface?) {
        surface = s
        if (s != null) conn?.requestKeyframe() // surface tayyor — yangi keyframe so'raymiz
    }

    /** Serverni ishga tushiradi. Port SINXRON aniqlanadi (URI shu portni ishlatadi). */
    fun start() {
        if (running) return
        var p = Proto.DEFAULT_PORT
        var server: ServerSocket? = null
        for (attempt in 0 until 20) {
            try {
                server = ServerSocket(p)
                break
            } catch (e: Exception) {
                p++
            }
        }
        if (server == null) {
            onState("error", "")
            return
        }
        port = p
        serverSocket = server
        running = true
        onState("listening", "")
        thread(name = "uzatuv-recv-accept", isDaemon = true) { runAccept(server) }
    }

    private fun runAccept(server: ServerSocket) {
        while (running) {
            try {
                val sock = server.accept()
                conn?.close()
                val c = Conn(sock)
                conn = c
                c.start()
            } catch (e: Exception) {
                if (running) Log.w(TAG, "accept xatosi: ${e.message}")
                break
            }
        }
    }

    fun stop() {
        running = false
        conn?.close()
        conn = null
        try {
            serverSocket?.close()
        } catch (_: Exception) {
        }
        serverSocket = null
    }

    private fun pickCodec(codecs: JSONArray?): String {
        if (codecs != null) {
            for (i in 0 until codecs.length()) {
                val c = codecs.optString(i)
                if (c == Proto.CODEC_H264 || c == Proto.CODEC_H265) return c
            }
        }
        return Proto.CODEC_H264
    }

    private inner class Conn(private val sock: Socket) {
        private var sendCh: Crypto.SecureChannel? = null
        private var out: OutputStream? = null
        private var decoder: VideoDecoder? = null
        private var lastConfig: ByteArray? = null
        private var mime = "video/avc"
        // Kadr yo'qolishini aniqlash (seq sakrasa → keyframe so'raymiz).
        private var lastVideoSeq = -1
        private var lastKeyframeReqMs = 0L
        private var pingThread: Thread? = null
        @Volatile private var closed = false
        @Volatile private var lastInbound = System.currentTimeMillis()
        private val sendLock = Any()

        fun start() {
            thread(name = "uzatuv-recv-conn", isDaemon = true) { run() }
        }

        fun requestKeyframe() {
            if (!closed && sendCh != null) {
                sendControl(JSONObject().put("type", "KEYFRAME_REQUEST"))
            }
        }

        private fun run() {
            try {
                sock.tcpNoDelay = true
                val input = sock.getInputStream()
                out = sock.getOutputStream()
                val parser = FrameParser()

                // 1) CLIENT_HELLO
                val hello = readPlainJson(input, parser)
                require(hello.optString("type") == "CLIENT_HELLO") {
                    "kutilmagan: ${hello.optString("type")}"
                }
                val clientNonce = Base64.decode(hello.getString("clientNonce"), Base64.NO_WRAP)
                val peerName = hello.optJSONObject("device")?.optString("name") ?: "Qurilma"
                val chosenCodec = pickCodec(hello.optJSONArray("codecs"))
                mime = if (chosenCodec == Proto.CODEC_H265) "video/hevc" else "video/avc"

                val serverNonce = Crypto.generateNonce()
                val serverAuth = Crypto.hmacAuth(
                    identity.sessionKey, Proto.HMAC_SERVER_LABEL, clientNonce, serverNonce,
                )
                // 2) SERVER_HELLO
                writePlain(
                    JSONObject()
                        .put("type", "SERVER_HELLO")
                        .put("protocolVersion", Proto.PROTOCOL_VERSION)
                        .put("serverNonce", Base64.encodeToString(serverNonce, Base64.NO_WRAP))
                        .put("chosenCodec", chosenCodec)
                        .put("serverAuth", Base64.encodeToString(serverAuth, Base64.NO_WRAP)),
                )

                // 3) CLIENT_AUTH
                val auth = readPlainJson(input, parser)
                require(auth.optString("type") == "CLIENT_AUTH") { "kutilmagan: ${auth.optString("type")}" }
                val expected = Crypto.hmacAuth(
                    identity.sessionKey, Proto.HMAC_CLIENT_LABEL, clientNonce, serverNonce,
                )
                val got = Base64.decode(auth.getString("clientAuth"), Base64.NO_WRAP)
                if (!Crypto.timingSafeEqual(expected, got)) {
                    writePlain(
                        JSONObject().put("type", "ERROR").put("code", "AUTH_FAILED")
                            .put("message", "auth mos emas"),
                    )
                    throw IllegalStateException("client auth failed")
                }

                // 4) SERVER_READY + kalitlar (server roli)
                writePlain(JSONObject().put("type", "SERVER_READY"))
                val keys = Crypto.deriveKeys(identity.sessionKey, clientNonce, serverNonce)
                val (send, recv) = Crypto.makeSecureChannels(keys, "server")
                sendCh = send

                onState("connected", peerName)
                Log.i(TAG, "ulandi: $peerName (kodek $chosenCodec)")

                // Oqim parametrlari + boshlash + birinchi keyframe
                sendControl(
                    // Lokal — 20 Mbps, 1080p'gача cheklangan (yuqori DPI ekran
                    // encoder'ni ochlik qoldirmasin), 30fps, qisqa GOP (1s).
                    JSONObject().put("type", "STREAM_CONFIG").put("codec", chosenCodec)
                        .put("maxWidth", 1920).put("maxHeight", 1080).put("fps", 30)
                        .put("bitrateKbps", 20000).put("keyframeIntervalSec", 1),
                )
                sendControl(JSONObject().put("type", "START"))
                sendControl(JSONObject().put("type", "KEYFRAME_REQUEST"))
                startPing()

                // Qabul sikli (shifrlangan frame'lar)
                val buf = ByteArray(64 * 1024)
                lastInbound = System.currentTimeMillis()
                while (!closed) {
                    val n = input.read(buf)
                    if (n < 0) break
                    parser.push(buf, n)
                    while (true) {
                        val sealed = parser.next() ?: break
                        val plain = recv.open(sealed)
                        lastInbound = System.currentTimeMillis()
                        val inner = Framing.decodeInner(plain)
                        when (inner.channel) {
                            Proto.CH_CONTROL -> handleControl(JSONObject(String(inner.payload, Charsets.UTF_8)))
                            Proto.CH_VIDEO -> handleVideo(inner.flags, inner.payload)
                            else -> { /* AUDIO=2 rezerv / noma'lum — e'tiborsiz */ }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "ulanish tugadi: ${e.message}")
            } finally {
                close()
            }
        }

        private fun handleControl(o: JSONObject) {
            when (o.optString("type")) {
                "CODEC_CONFIG" -> {
                    val csd = Base64.decode(o.optString("csd"), Base64.NO_WRAP)
                    lastConfig = csd
                    decoder?.setConfig(csd)
                }
                "PING" -> sendControl(
                    JSONObject().put("type", "PONG").put("seq", o.optInt("seq"))
                        .put("tSentMs", o.optLong("tSentMs")),
                )
                "PONG" -> { /* lastInbound yangilandi — yetarli */ }
                "DISCONNECT" -> close()
            }
        }

        private fun handleVideo(flags: Int, payload: ByteArray) {
            val vp = Video.unpackVideoPayload(payload)
            val isKey = (flags and Proto.FLAG_KEYFRAME) != 0

            // Kadr yo'qolgan bo'lsa (seq sakradi) — keyframe so'raymiz (debounce 500ms).
            if (!isKey && lastVideoSeq >= 0 && vp.seq > lastVideoSeq + 1) {
                val now = System.currentTimeMillis()
                if (now - lastKeyframeReqMs > 500) {
                    lastKeyframeReqMs = now
                    sendControl(JSONObject().put("type", "KEYFRAME_REQUEST"))
                }
            }
            lastVideoSeq = vp.seq

            val s = surface
            if (decoder == null && s != null) {
                decoder = VideoDecoder(s, mime).also { d -> lastConfig?.let { d.setConfig(it) } }
            }
            decoder?.decode(vp.au, vp.ptsUs, isKey)
        }

        private fun startPing() {
            pingThread = thread(isDaemon = true) {
                while (!closed) {
                    try {
                        Thread.sleep(Proto.PING_INTERVAL_MS)
                    } catch (_: InterruptedException) {
                        break
                    }
                    if (closed) break
                    if (System.currentTimeMillis() - lastInbound > Proto.PONG_TIMEOUT_MS) {
                        close()
                        break
                    }
                    sendControl(
                        JSONObject().put("type", "PING").put("seq", 0)
                            .put("tSentMs", System.currentTimeMillis()),
                    )
                }
            }
        }

        private fun sendControl(o: JSONObject) {
            val ch = sendCh ?: return
            val o2 = out ?: return
            synchronized(sendLock) {
                try {
                    val inner = Framing.encodeInner(Proto.CH_CONTROL, 0, o.toString().toByteArray(Charsets.UTF_8))
                    o2.write(Framing.frameWithLength(ch.seal(inner)))
                    o2.flush()
                } catch (e: Exception) {
                    close()
                }
            }
        }

        fun close() {
            if (closed) return
            closed = true
            pingThread?.interrupt()
            decoder?.release()
            decoder = null
            try {
                sock.close()
            } catch (_: Exception) {
            }
            if (conn === this) onState("listening", "")
        }

        /** Ochiq (handshake) frame yuborish. */
        private fun writePlain(o: JSONObject) {
            val o2 = out ?: return
            o2.write(Framing.frameWithLength(o.toString().toByteArray(Charsets.UTF_8)))
            o2.flush()
        }

        /** Bitta ochiq JSON frame o'qib qaytaradi (handshake bosqichi). */
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
}
