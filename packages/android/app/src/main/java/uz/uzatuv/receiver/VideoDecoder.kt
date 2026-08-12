package uz.uzatuv.receiver

import android.media.MediaCodec
import android.media.MediaFormat
import android.util.Log
import android.view.Surface
import java.nio.ByteBuffer

/**
 * VideoDecoder — kelayotgan H.264/H.265 (Annex-B) oqimini MediaCodec bilan
 * dekod qilib, to'g'ridan-to'g'ri [Surface]ga chizadi (SurfaceView).
 *
 * Config (SPS/PPS/VPS): CODEC_CONFIG orqali alohida kelishi mumkin (Android
 * uzatuvchi), yoki keyframe ichида (Annex-B inline — desktop uzatuvchi). Ikkala
 * holat ham qo'llab-quvvatlanadi.
 */
class VideoDecoder(
    private val surface: Surface,
    private val mime: String = "video/avc", // h264; h265 uchun "video/hevc"
) {
    companion object {
        private const val TAG = "UzatuvDecoder"
    }

    private var codec: MediaCodec? = null
    private var configured = false
    private var pendingCsd: ByteArray? = null // CODEC_CONFIG orqali kelgan

    /** CODEC_CONFIG (csd) — birinchi keyframe'дан oldin kelsa saqlaymiz. */
    fun setConfig(csd: ByteArray) {
        pendingCsd = csd
    }

    /** Bitta access unit'ni dekod qiladi. Birinchi keyframe'да decoder yaratiladi. */
    fun decode(au: ByteArray, ptsUs: Long, isKeyframe: Boolean) {
        if (!configured) {
            if (!isKeyframe) return // keyframe'siz boshlab bo'lmaydi
            val csd = pendingCsd ?: extractCsd(au)
            configure(csd)
            if (!configured) return
        }
        val c = codec ?: return
        try {
            val inIx = c.dequeueInputBuffer(10_000)
            if (inIx >= 0) {
                val buf: ByteBuffer? = c.getInputBuffer(inIx)
                if (buf != null) {
                    buf.clear()
                    buf.put(au)
                    val flags = if (isKeyframe) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
                    c.queueInputBuffer(inIx, 0, au.size, ptsUs, flags)
                }
            }
            drainOutputs(c)
        } catch (e: Exception) {
            Log.w(TAG, "dekod xatosi", e)
        }
    }

    private fun configure(csd: ByteArray?) {
        try {
            // O'lcham SPS'дан aniqlanadi; nominal qiymat beramiz (MediaCodec moslaydi).
            val format = MediaFormat.createVideoFormat(mime, 1920, 1080)
            if (csd != null && csd.isNotEmpty()) {
                format.setByteBuffer("csd-0", ByteBuffer.wrap(csd))
            }
            val c = MediaCodec.createDecoderByType(mime)
            c.configure(format, surface, null, 0)
            c.start()
            codec = c
            configured = true
            Log.i(TAG, "decoder yaratildi ($mime)")
        } catch (e: Exception) {
            Log.e(TAG, "decoder configure xatosi", e)
            configured = false
        }
    }

    private fun drainOutputs(c: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        var outIx = c.dequeueOutputBuffer(info, 0)
        while (outIx >= 0) {
            c.releaseOutputBuffer(outIx, true) // true = Surface'ga chiz
            outIx = c.dequeueOutputBuffer(info, 0)
        }
    }

    fun release() {
        try {
            codec?.stop()
        } catch (_: Exception) {
        }
        try {
            codec?.release()
        } catch (_: Exception) {
        }
        codec = null
        configured = false
    }

    /**
     * Annex-B keyframe'дан config NAL'larni (SPS=7, PPS=8; HEVC VPS=32/SPS=33/PPS=34)
     * ajratib oladi — IDR slice boshlangunча. `null` bo'lsa in-band config yo'q.
     */
    private fun extractCsd(au: ByteArray): ByteArray? {
        var i = 0
        var idrStart = -1
        val starts = ArrayList<Int>()
        while (i + 3 < au.size) {
            val sc = au[i] == 0.toByte() && au[i + 1] == 0.toByte() &&
                au[i + 2] == 0.toByte() && au[i + 3] == 1.toByte()
            val sc3 = au[i] == 0.toByte() && au[i + 1] == 0.toByte() && au[i + 2] == 1.toByte()
            if (sc || sc3) {
                val hdr = if (sc) i + 4 else i + 3
                if (hdr < au.size) {
                    val nalType = if (mime == "video/hevc") {
                        (au[hdr].toInt() shr 1) and 0x3f
                    } else {
                        au[hdr].toInt() and 0x1f
                    }
                    val isSlice = if (mime == "video/hevc") nalType in 16..21 else nalType == 5
                    if (isSlice) {
                        idrStart = i
                        break
                    }
                    starts.add(i)
                }
                i = hdr
            } else {
                i++
            }
        }
        if (idrStart <= 0 || starts.isEmpty()) return null
        return au.copyOfRange(0, idrStart) // barcha config NAL'lar (SPS/PPS...) IDR'gача
    }
}
