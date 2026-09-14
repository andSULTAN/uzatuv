package uz.uzatuv.protocol

/**
 * Uzatuv wire-protocol — Kotlin mirror of packages/protocol (TypeScript).
 *
 * This file is the single Kotlin source of the shared protocol logic. The Android
 * app (packages/android) references it; it MUST stay byte-compatible with the TS
 * implementation. Cross-language parity is verified with shared test vectors.
 *
 * Spec: docs/PROTOCOL.md, docs/ARCHITECTURE.md.
 */

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

// ---------------------------------------------------------------------------
// Constants (mirror of src/constants.ts §7)
// ---------------------------------------------------------------------------
object Proto {
    const val PROTOCOL_VERSION = 1
    const val DEFAULT_PORT = 8787
    const val MDNS_SERVICE_TYPE = "_uzatuv._tcp"
    const val MAX_FRAME_LEN = 16 * 1024 * 1024 // 16 MiB

    const val PING_INTERVAL_MS = 2000L
    const val PONG_TIMEOUT_MS = 15000L
    const val PAIR_CODE_TTL_MS = 120_000L
    val RECONNECT_BACKOFF_MS = longArrayOf(1000, 2000, 4000, 8000, 15000)

    // channels
    const val CH_CONTROL = 0
    const val CH_VIDEO = 1
    const val CH_AUDIO = 2 // reserved (v1 ignores)

    // flags
    const val FLAG_KEYFRAME = 0x01
    const val FLAG_CONFIG = 0x02
    const val FLAG_END_OF_STREAM = 0x04

    // codecs
    const val CODEC_H264 = "h264"
    const val CODEC_H265 = "h265"

    // crypto
    const val AEAD_TAG_LEN = 16
    const val AEAD_NONCE_LEN = 12
    const val HKDF_INFO = "uzatuv-v1"
    const val HMAC_SERVER_LABEL = "uzatuv-server"
    const val HMAC_CLIENT_LABEL = "uzatuv-client"
    const val SESSION_KEY_LEN = 32
    const val NONCE_LEN = 16

    const val PAIRING_URI_SCHEME = "uzatuv"
}

// ---------------------------------------------------------------------------
// Framing (mirror of src/framing.ts §1.1, §1.2)
// ---------------------------------------------------------------------------
object Framing {
    /** inner = [channel][flags][payload] */
    fun encodeInner(channel: Int, flags: Int, payload: ByteArray): ByteArray {
        val out = ByteArray(2 + payload.size)
        out[0] = (channel and 0xff).toByte()
        out[1] = (flags and 0xff).toByte()
        System.arraycopy(payload, 0, out, 2, payload.size)
        return out
    }

    data class InnerFrame(val channel: Int, val flags: Int, val payload: ByteArray)

    fun decodeInner(inner: ByteArray): InnerFrame {
        require(inner.size >= 2) { "inner frame too short" }
        return InnerFrame(inner[0].toInt() and 0xff, inner[1].toInt() and 0xff, inner.copyOfRange(2, inner.size))
    }

    /** [uint32 len BE][payload] */
    fun frameWithLength(payload: ByteArray): ByteArray {
        require(payload.size <= Proto.MAX_FRAME_LEN) { "frame too large: ${payload.size}" }
        val out = ByteArray(4 + payload.size)
        ByteBuffer.wrap(out).order(ByteOrder.BIG_ENDIAN).putInt(payload.size)
        System.arraycopy(payload, 0, out, 4, payload.size)
        return out
    }

    fun encodeFrame(channel: Int, flags: Int, payload: ByteArray): ByteArray =
        frameWithLength(encodeInner(channel, flags, payload))
}

/** Streaming length-prefix parser (mirror of TS FrameParser). */
class FrameParser {
    private var buf = ByteArray(0)

    fun push(chunk: ByteArray, len: Int = chunk.size) {
        val merged = ByteArray(buf.size + len)
        System.arraycopy(buf, 0, merged, 0, buf.size)
        System.arraycopy(chunk, 0, merged, buf.size, len)
        buf = merged
    }

    /** Next complete frame payload (post length-prefix), or null if incomplete. */
    fun next(): ByteArray? {
        if (buf.size < 4) return null
        val len = ByteBuffer.wrap(buf, 0, 4).order(ByteOrder.BIG_ENDIAN).int
        require(len <= Proto.MAX_FRAME_LEN) { "frame too large: $len" }
        if (buf.size < 4 + len) return null
        val payload = buf.copyOfRange(4, 4 + len)
        buf = buf.copyOfRange(4 + len, buf.size)
        return payload
    }

    val pending: Int get() = buf.size
}

// ---------------------------------------------------------------------------
// Crypto (mirror of src/crypto.ts §2.3, §2.4)
// ---------------------------------------------------------------------------
object Crypto {
    private val rng = SecureRandom()

    fun generateSessionKey(): ByteArray = ByteArray(Proto.SESSION_KEY_LEN).also { rng.nextBytes(it) }
    fun generateNonce(): ByteArray = ByteArray(Proto.NONCE_LEN).also { rng.nextBytes(it) }

    fun hmacAuth(sessionKey: ByteArray, label: String, clientNonce: ByteArray, serverNonce: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(sessionKey, "HmacSHA256"))
        mac.update(label.toByteArray(Charsets.UTF_8))
        mac.update(clientNonce)
        mac.update(serverNonce)
        return mac.doFinal()
    }

    fun timingSafeEqual(a: ByteArray, b: ByteArray): Boolean {
        if (a.size != b.size) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].toInt() xor b[i].toInt())
        return diff == 0
    }

    data class SessionKeys(
        val keyC2S: ByteArray, val keyS2C: ByteArray,
        val nonceFixC2S: ByteArray, val nonceFixS2C: ByteArray,
    )

    /** HKDF-SHA256 (RFC 5869) — extract + expand, 88-byte OKM. */
    fun deriveKeys(sessionKey: ByteArray, clientNonce: ByteArray, serverNonce: ByteArray): SessionKeys {
        val salt = clientNonce + serverNonce
        val okm = hkdfSha256(sessionKey, salt, Proto.HKDF_INFO.toByteArray(Charsets.UTF_8), 88)
        return SessionKeys(
            keyC2S = okm.copyOfRange(0, 32),
            keyS2C = okm.copyOfRange(32, 64),
            nonceFixC2S = okm.copyOfRange(64, 68),
            nonceFixS2C = okm.copyOfRange(68, 72),
        )
    }

    private fun hkdfSha256(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        // extract
        mac.init(SecretKeySpec(if (salt.isEmpty()) ByteArray(32) else salt, "HmacSHA256"))
        val prk = mac.doFinal(ikm)
        // expand
        mac.init(SecretKeySpec(prk, "HmacSHA256"))
        val out = ByteArray(length)
        var t = ByteArray(0)
        var pos = 0
        var counter = 1
        while (pos < length) {
            mac.reset()
            mac.update(t)
            mac.update(info)
            mac.update(counter.toByte())
            t = mac.doFinal()
            val n = minOf(t.size, length - pos)
            System.arraycopy(t, 0, out, pos, n)
            pos += n
            counter++
        }
        return out
    }

    /** One direction of an AES-256-GCM channel with a monotonic nonce counter. */
    class SecureChannel(private val key: ByteArray, private val nonceFix: ByteArray) {
        init {
            require(key.size == 32) { "key must be 32 bytes" }
            require(nonceFix.size == 4) { "nonceFix must be 4 bytes" }
        }

        private var counter = 0L

        private fun nextNonce(): ByteArray {
            val nonce = ByteArray(Proto.AEAD_NONCE_LEN)
            System.arraycopy(nonceFix, 0, nonce, 0, 4)
            ByteBuffer.wrap(nonce, 4, 8).order(ByteOrder.BIG_ENDIAN).putLong(counter)
            counter++
            return nonce
        }

        fun seal(plaintext: ByteArray): ByteArray {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(Proto.AEAD_TAG_LEN * 8, nextNonce()))
            return cipher.doFinal(plaintext) // ciphertext||tag
        }

        fun open(sealed: ByteArray): ByteArray {
            require(sealed.size >= Proto.AEAD_TAG_LEN) { "sealed frame too short" }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(Proto.AEAD_TAG_LEN * 8, nextNonce()))
            return cipher.doFinal(sealed)
        }
    }

    /** Build both directional channels for a peer role ("server" | "client"). */
    fun makeSecureChannels(keys: SessionKeys, role: String): Pair<SecureChannel, SecureChannel> {
        // returns (send, recv)
        return if (role == "server") {
            SecureChannel(keys.keyS2C, keys.nonceFixS2C) to SecureChannel(keys.keyC2S, keys.nonceFixC2S)
        } else {
            SecureChannel(keys.keyC2S, keys.nonceFixC2S) to SecureChannel(keys.keyS2C, keys.nonceFixS2C)
        }
    }
}

// ---------------------------------------------------------------------------
// Video payload (mirror of src/video.ts §4)
// ---------------------------------------------------------------------------
object Video {
    private const val HEADER_LEN = 12 // uint64 ptsUs + uint32 seq

    fun packVideoPayload(ptsUs: Long, seq: Int, au: ByteArray): ByteArray {
        val out = ByteArray(HEADER_LEN + au.size)
        val bb = ByteBuffer.wrap(out).order(ByteOrder.BIG_ENDIAN)
        bb.putLong(ptsUs)
        bb.putInt(seq)
        System.arraycopy(au, 0, out, HEADER_LEN, au.size)
        return out
    }

    data class VideoPayload(val ptsUs: Long, val seq: Int, val au: ByteArray)

    fun unpackVideoPayload(payload: ByteArray): VideoPayload {
        require(payload.size >= HEADER_LEN) { "video payload too short" }
        val bb = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN)
        val pts = bb.long
        val seq = bb.int
        return VideoPayload(pts, seq, payload.copyOfRange(HEADER_LEN, payload.size))
    }
}
// ---------------------------------------------------------------------------
// Audio payload (mirror of src/audio.ts §5)
// ---------------------------------------------------------------------------
object Audio {
    private const val HEADER_LEN = 8 // uint64 ptsUs

    fun packAudioPayload(ptsUs: Long, data: ByteArray): ByteArray {
        val out = ByteArray(HEADER_LEN + data.size)
        ByteBuffer.wrap(out).order(ByteOrder.BIG_ENDIAN).putLong(ptsUs)
        System.arraycopy(data, 0, out, HEADER_LEN, data.size)
        return out
    }

    data class AudioPayload(val ptsUs: Long, val data: ByteArray)

    fun unpackAudioPayload(payload: ByteArray): AudioPayload {
        require(payload.size >= HEADER_LEN) { "audio payload too short" }
        val bb = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN)
        val pts = bb.long
        return AudioPayload(pts, payload.copyOfRange(HEADER_LEN, payload.size))
    }
}
