package uz.uzatuv.receiver

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaFormat
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * AudioDecoderPlayer — qabul qilingan Opus audio'ni MediaCodec bilan dekod qilib,
 * AudioTrack orqali chaladi.
 *
 * MediaCodec Opus dekoderi uchun 3 csd bufer kerak (raw Opus paketlari uchun):
 *   csd-0: OpusHead (identifikatsiya sarlavhasi)
 *   csd-1: codec delay (pre-skip) nanosekundда, 8 bayt LE
 *   csd-2: seek preroll nanosekundда, 8 bayt LE
 *
 * ⚠️ Cross-stack (WebCodecs Opus ↔ MediaCodec Opus) real qurilmасiz sinalmagan.
 */
class AudioDecoderPlayer {
    companion object {
        private const val TAG = "UzatuvAudioDec"
        private const val MIME = "audio/opus"
        private const val PRE_SKIP_SAMPLES = 3840L // 80ms @ 48kHz (Opus standart)
    }

    private var codec: MediaCodec? = null
    private var audioTrack: AudioTrack? = null
    private var configured = false

    fun configure(sampleRate: Int, channels: Int) {
        release()
        try {
            val format = MediaFormat.createAudioFormat(MIME, sampleRate, channels)
            format.setByteBuffer("csd-0", ByteBuffer.wrap(opusHead(channels, sampleRate)))
            val delayNs = PRE_SKIP_SAMPLES * 1_000_000_000L / sampleRate
            format.setByteBuffer("csd-1", longLe(delayNs))
            format.setByteBuffer("csd-2", longLe(delayNs)) // seek preroll ~ pre-skip

            val mc = MediaCodec.createDecoderByType(MIME)
            mc.configure(format, null, null, 0)
            mc.start()
            codec = mc

            val channelMask =
                if (channels == 1) AudioFormat.CHANNEL_OUT_MONO else AudioFormat.CHANNEL_OUT_STEREO
            val minBuf = AudioTrack.getMinBufferSize(sampleRate, channelMask, AudioFormat.ENCODING_PCM_16BIT)
            val track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(channelMask)
                        .build(),
                )
                .setBufferSizeInBytes(minBuf * 2)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
            track.play()
            audioTrack = track
            configured = true
            Log.i(TAG, "Audio dekoder tayyor (Opus ${sampleRate}Hz ${channels}ch)")
        } catch (e: Exception) {
            Log.e(TAG, "audio configure xatosi", e)
            configured = false
        }
    }

    fun decode(data: ByteArray, ptsUs: Long) {
        val mc = codec ?: return
        if (!configured) return
        try {
            val inIx = mc.dequeueInputBuffer(5000)
            if (inIx >= 0) {
                val ib = mc.getInputBuffer(inIx)
                ib?.clear()
                ib?.put(data)
                mc.queueInputBuffer(inIx, 0, data.size, ptsUs, 0)
            }
            val info = MediaCodec.BufferInfo()
            var outIx = mc.dequeueOutputBuffer(info, 0)
            while (outIx >= 0) {
                val ob = mc.getOutputBuffer(outIx)
                if (ob != null && info.size > 0) {
                    val pcm = ByteArray(info.size)
                    ob.position(info.offset)
                    ob.limit(info.offset + info.size)
                    ob.get(pcm)
                    audioTrack?.write(pcm, 0, pcm.size)
                }
                mc.releaseOutputBuffer(outIx, false)
                outIx = mc.dequeueOutputBuffer(info, 0)
            }
        } catch (e: Exception) {
            Log.w(TAG, "audio dekod xatosi", e)
        }
    }

    fun release() {
        try { codec?.stop() } catch (_: Exception) {}
        try { codec?.release() } catch (_: Exception) {}
        codec = null
        try { audioTrack?.stop() } catch (_: Exception) {}
        try { audioTrack?.release() } catch (_: Exception) {}
        audioTrack = null
        configured = false
    }

    private fun opusHead(channels: Int, sampleRate: Int): ByteArray {
        val b = ByteBuffer.allocate(19).order(ByteOrder.LITTLE_ENDIAN)
        b.put("OpusHead".toByteArray(Charsets.US_ASCII)) // 8 bayt magic
        b.put(1) // version
        b.put(channels.toByte()) // kanallar soni
        b.putShort(PRE_SKIP_SAMPLES.toShort()) // pre-skip (namunalar)
        b.putInt(sampleRate) // kirish sample rate
        b.putShort(0) // output gain
        b.put(0) // mapping family (0 = mono/stereo)
        return b.array()
    }

    private fun longLe(v: Long): ByteBuffer =
        ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(v).apply { flip() }
}
