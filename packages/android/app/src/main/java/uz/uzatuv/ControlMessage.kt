package uz.uzatuv

import org.json.JSONObject

/**
 * CONTROL kanali (channel 0) xabarlari — PROTOCOL.md §3.
 *
 * Handshake xabarlari (CLIENT_HELLO, SERVER_HELLO, ...) bu yerda emas — ular
 * shifrlashgacha, alohida (transport ichida org.json bilan) ishlanadi.
 * Bu sealed class faqat handshakedan keyingi runtime control xabarlari uchun.
 */
sealed class ControlMessage {
    abstract val type: String

    // S→C: server oqimni qanday xohlashini aytadi
    data class StreamConfig(
        val codec: String,
        val maxWidth: Int,
        val maxHeight: Int,
        val fps: Int,
        val bitrateKbps: Int,
        val keyframeIntervalSec: Int,
    ) : ControlMessage() {
        override val type get() = "STREAM_CONFIG"
    }

    // C→S: encoder chiqargan config (SPS/PPS/VPS), Annex-B base64
    data class CodecConfig(
        val codec: String,
        val width: Int,
        val height: Int,
        val csdBase64: String,
    ) : ControlMessage() {
        override val type get() = "CODEC_CONFIG"
    }

    data object Start : ControlMessage() {
        override val type get() = "START"
    }

    data object Stop : ControlMessage() {
        override val type get() = "STOP"
    }

    // S→C: darhol IDR so'rovi
    data object KeyframeRequest : ControlMessage() {
        override val type get() = "KEYFRAME_REQUEST"
    }

    // S→C: adaptiv bitrate
    data class SetBitrate(val bitrateKbps: Int) : ControlMessage() {
        override val type get() = "SET_BITRATE"
    }

    // C→S: ekran aylandi/o'lchami o'zgardi
    data class Resize(val width: Int, val height: Int, val rotation: Int) : ControlMessage() {
        override val type get() = "RESIZE"
    }

    // ikkalasi: latency o'lchash
    data class Ping(val seq: Int, val tSentMs: Long) : ControlMessage() {
        override val type get() = "PING"
    }

    data class Pong(val seq: Int, val tSentMs: Long) : ControlMessage() {
        override val type get() = "PONG"
    }

    // C→S: ixtiyoriy telemetriya
    data class Stats(
        val fps: Int,
        val encBitrateKbps: Int,
        val encQueue: Int,
        val droppedFrames: Int,
        val tMs: Long,
    ) : ControlMessage() {
        override val type get() = "STATS"
    }

    // ikkalasi: toza uzilish
    data class Disconnect(val reason: String) : ControlMessage() {
        override val type get() = "DISCONNECT"
    }

    // ikkalasi: xato
    data class ErrorMsg(val code: String, val message: String) : ControlMessage() {
        override val type get() = "ERROR"
    }

    // Noma'lum type — forward-compat (e'tiborsiz qoldiriladi)
    data class Unknown(override val type: String) : ControlMessage()
}

/** ControlMessage ↔ JSON (org.json). */
object ControlCodec {

    fun encode(msg: ControlMessage): ByteArray = toJson(msg).toString().toByteArray(Charsets.UTF_8)

    fun toJson(msg: ControlMessage): JSONObject {
        val o = JSONObject().put("type", msg.type)
        return when (msg) {
            is ControlMessage.StreamConfig -> o
                .put("codec", msg.codec)
                .put("maxWidth", msg.maxWidth)
                .put("maxHeight", msg.maxHeight)
                .put("fps", msg.fps)
                .put("bitrateKbps", msg.bitrateKbps)
                .put("keyframeIntervalSec", msg.keyframeIntervalSec)

            is ControlMessage.CodecConfig -> o
                .put("codec", msg.codec)
                .put("width", msg.width)
                .put("height", msg.height)
                .put("csd", msg.csdBase64)

            is ControlMessage.SetBitrate -> o.put("bitrateKbps", msg.bitrateKbps)

            is ControlMessage.Resize -> o
                .put("width", msg.width)
                .put("height", msg.height)
                .put("rotation", msg.rotation)

            is ControlMessage.Ping -> o.put("seq", msg.seq).put("tSentMs", msg.tSentMs)
            is ControlMessage.Pong -> o.put("seq", msg.seq).put("tSentMs", msg.tSentMs)

            is ControlMessage.Stats -> o
                .put("fps", msg.fps)
                .put("encBitrateKbps", msg.encBitrateKbps)
                .put("encQueue", msg.encQueue)
                .put("droppedFrames", msg.droppedFrames)
                .put("tMs", msg.tMs)

            is ControlMessage.Disconnect -> o.put("reason", msg.reason)
            is ControlMessage.ErrorMsg -> o.put("code", msg.code).put("message", msg.message)

            ControlMessage.Start,
            ControlMessage.Stop,
            ControlMessage.KeyframeRequest,
            is ControlMessage.Unknown,
            -> o
        }
    }

    fun decode(bytes: ByteArray): ControlMessage = fromJson(JSONObject(String(bytes, Charsets.UTF_8)))

    fun fromJson(o: JSONObject): ControlMessage {
        return when (val type = o.optString("type")) {
            "STREAM_CONFIG" -> ControlMessage.StreamConfig(
                codec = o.optString("codec", "h264"),
                maxWidth = o.optInt("maxWidth", 0),
                maxHeight = o.optInt("maxHeight", 0),
                fps = o.optInt("fps", 60),
                bitrateKbps = o.optInt("bitrateKbps", 8000),
                keyframeIntervalSec = o.optInt("keyframeIntervalSec", 2),
            )
            "CODEC_CONFIG" -> ControlMessage.CodecConfig(
                codec = o.optString("codec", "h264"),
                width = o.optInt("width", 0),
                height = o.optInt("height", 0),
                csdBase64 = o.optString("csd", ""),
            )
            "START" -> ControlMessage.Start
            "STOP" -> ControlMessage.Stop
            "KEYFRAME_REQUEST" -> ControlMessage.KeyframeRequest
            "SET_BITRATE" -> ControlMessage.SetBitrate(o.optInt("bitrateKbps", 0))
            "RESIZE" -> ControlMessage.Resize(
                width = o.optInt("width", 0),
                height = o.optInt("height", 0),
                rotation = o.optInt("rotation", 0),
            )
            "PING" -> ControlMessage.Ping(o.optInt("seq", 0), o.optLong("tSentMs", 0))
            "PONG" -> ControlMessage.Pong(o.optInt("seq", 0), o.optLong("tSentMs", 0))
            "STATS" -> ControlMessage.Stats(
                fps = o.optInt("fps", 0),
                encBitrateKbps = o.optInt("encBitrateKbps", 0),
                encQueue = o.optInt("encQueue", 0),
                droppedFrames = o.optInt("droppedFrames", 0),
                tMs = o.optLong("tMs", 0),
            )
            "DISCONNECT" -> ControlMessage.Disconnect(o.optString("reason", ""))
            "ERROR" -> ControlMessage.ErrorMsg(o.optString("code", ""), o.optString("message", ""))
            else -> ControlMessage.Unknown(type)
        }
    }
}
