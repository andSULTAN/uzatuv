package uz.uzatuv

/**
 * Uzatuv Android — modul kontraktlari (ARCHITECTURE.md §4).
 *
 * Bu turlar Encoder va Transport qatlamlari o'zaro bog'lanadigan chegara.
 * Muzlatilgan interfeyslar — o'zgartirish faqat PM orqali.
 */

// -----------------------------------------------------------------------------
// Encode qilingan kadr — capture/encode qatlamidan transport qatlamiga
// -----------------------------------------------------------------------------
data class EncodedFrame(
    val data: ByteArray,      // Annex-B access unit (start-code bilan)
    val ptsUs: Long,          // presentation timestamp (mikrosekund)
    val isKeyframe: Boolean,  // IDR (mustaqil dekodlanadi)
    val isConfig: Boolean,    // SPS/PPS/VPS config buferi
) {
    // ByteArray data class'da equals/hashCode ma'noli bo'lishi uchun override
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is EncodedFrame) return false
        return ptsUs == other.ptsUs &&
            isKeyframe == other.isKeyframe &&
            isConfig == other.isConfig &&
            data.contentEquals(other.data)
    }

    override fun hashCode(): Int {
        var result = data.contentHashCode()
        result = 31 * result + ptsUs.hashCode()
        result = 31 * result + isKeyframe.hashCode()
        result = 31 * result + isConfig.hashCode()
        return result
    }
}

// -----------------------------------------------------------------------------
// Encoder sozlamalari (STREAM_CONFIG'dan keladi)
// -----------------------------------------------------------------------------
data class EncoderConfig(
    val codec: String,          // "h264" | "h265"
    val maxWidth: Int,          // 0 = tabiiy o'lcham
    val maxHeight: Int,
    val fps: Int,
    val bitrateKbps: Int,
    val keyframeIntervalSec: Int,
)

// -----------------------------------------------------------------------------
// Ekran olish + encode — ScreenEncoder
// -----------------------------------------------------------------------------
interface ScreenEncoder {
    /** Encode'ni boshlaydi; har tayyor kadrni [sink]ga beradi. */
    fun start(config: EncoderConfig, sink: (EncodedFrame) -> Unit)

    /** Darhol keyframe (IDR) chiqarishni so'raydi. */
    fun requestKeyframe()

    /** Encoder bitrate'ini adaptiv o'zgartiradi (kbps). */
    fun setBitrate(kbps: Int)

    /** Ekran o'lchami/aylanishi o'zgardi — VirtualDisplay'ni moslaydi. */
    fun onResize(width: Int, height: Int, rotation: Int)

    /** Encode'ni to'xtatadi va resurslarni bo'shatadi. */
    fun stop()
}

// -----------------------------------------------------------------------------
// Ulanish holati
// -----------------------------------------------------------------------------
enum class ConnState { CONNECTING, READY, RECONNECTING, CLOSED }

// -----------------------------------------------------------------------------
// Pairing ma'lumoti (QR/kod orqali olinadi) — PROTOCOL.md §2.1
// -----------------------------------------------------------------------------
data class PairingInfo(
    val version: Int,
    val ip: String,
    val port: Int,
    val serverId: String,
    val name: String,
    val sessionKey: ByteArray,   // 32 bayt sir
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is PairingInfo) return false
        return version == other.version && ip == other.ip && port == other.port &&
            serverId == other.serverId && name == other.name &&
            sessionKey.contentEquals(other.sessionKey)
    }

    override fun hashCode(): Int {
        var result = version
        result = 31 * result + ip.hashCode()
        result = 31 * result + port
        result = 31 * result + serverId.hashCode()
        result = 31 * result + name.hashCode()
        result = 31 * result + sessionKey.contentHashCode()
        return result
    }
}

// -----------------------------------------------------------------------------
// Qurilma ma'lumoti (CLIENT_HELLO.device)
// -----------------------------------------------------------------------------
data class DeviceInfo(
    val deviceId: String,
    val name: String,
    val model: String,
    val androidSdk: Int,
    val width: Int,
    val height: Int,
    val densityDpi: Int,
)

// -----------------------------------------------------------------------------
// Transport client — serverga ulanish, handshake, frame yuborish/qabul
// -----------------------------------------------------------------------------
interface TransportClient {
    fun connect(pairing: PairingInfo)
    fun sendVideo(frame: EncodedFrame)
    /** Encode qilingan audio kadr (Opus) — kanal 2. */
    fun sendAudio(ptsUs: Long, data: ByteArray)
    /** Audio format (Opus) — ovoz boshlanishida bir marta. */
    fun sendAudioConfig(sampleRate: Int, channels: Int)
    fun sendControl(msg: ControlMessage)
    fun onControl(handler: (ControlMessage) -> Unit)
    fun onStateChange(handler: (ConnState) -> Unit)
    fun disconnect(reason: String)
}
