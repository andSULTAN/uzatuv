package uz.uzatuv.capture

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import kotlin.concurrent.thread

/**
 * AudioCaptureEncoder — tizim (ilova) ovozini oladi va Opus'ga encode qiladi.
 *
 * Oqim: MediaProjection → AudioPlaybackCaptureConfiguration → AudioRecord (PCM)
 * → MediaCodec (Opus) → sink(data, ptsUs).
 *
 * ⚠️ Faqat Android 10 (API 29)+: AudioPlaybackCapture va Opus encoder shu versiyadan.
 * Eski qurilmalarда ovoz uzatilmaydi (faqat video). RECORD_AUDIO ruxsati kerak.
 */
@RequiresApi(Build.VERSION_CODES.Q)
class AudioCaptureEncoder(
    private val mediaProjection: MediaProjection,
) {
    companion object {
        private const val TAG = "UzatuvAudioEnc"
        const val SAMPLE_RATE = 48000
        const val CHANNELS = 2
        private const val MIME = "audio/opus"
        private const val BITRATE = 128000
    }

    private var record: AudioRecord? = null
    private var codec: MediaCodec? = null
    private var worker: Thread? = null
    @Volatile private var running = false

    /** Opus encoder mavjudmi (ba'zi eski qurilmalarда yo'q). */
    fun isSupported(): Boolean = runCatching {
        MediaCodec.createEncoderByType(MIME).also { it.release() }
        true
    }.getOrDefault(false)

    @SuppressLint("MissingPermission") // RECORD_AUDIO MainActivity'да so'raladi
    fun start(sink: (data: ByteArray, ptsUs: Long) -> Unit) {
        if (running) return
        val captureConfig = AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()

        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_STEREO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val rec = AudioRecord.Builder()
            .setAudioPlaybackCaptureConfig(captureConfig)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                    .build(),
            )
            .setBufferSizeInBytes(minBuf * 2)
            .build()

        val format = MediaFormat.createAudioFormat(MIME, SAMPLE_RATE, CHANNELS).apply {
            setInteger(MediaFormat.KEY_BIT_RATE, BITRATE)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, minBuf * 2)
        }
        val enc = MediaCodec.createEncoderByType(MIME)
        enc.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)

        record = rec
        codec = enc
        running = true

        enc.start()
        rec.startRecording()

        worker = thread(name = "uzatuv-audio-enc", isDaemon = true) { loop(rec, enc, sink) }
        Log.i(TAG, "Audio encoder boshlandi (Opus ${SAMPLE_RATE}Hz ${CHANNELS}ch)")
    }

    private fun loop(rec: AudioRecord, enc: MediaCodec, sink: (ByteArray, Long) -> Unit) {
        val pcm = ByteArray(2048)
        val info = MediaCodec.BufferInfo()
        var totalSamples = 0L
        try {
            while (running) {
                val inIx = enc.dequeueInputBuffer(10_000)
                if (inIx >= 0) {
                    val ib = enc.getInputBuffer(inIx)
                    ib?.clear()
                    val n = rec.read(pcm, 0, minOf(pcm.size, ib?.remaining() ?: pcm.size))
                    if (n > 0) {
                        ib?.put(pcm, 0, n)
                        val ptsUs = totalSamples * 1_000_000L / (SAMPLE_RATE.toLong() * CHANNELS)
                        // 16-bit stereo → n/ (2*CHANNELS)? sample = 2 bayt; kanal soni CHANNELS
                        totalSamples += (n / 2).toLong() // 16-bit namunalar soni (kanallar bilan)
                        enc.queueInputBuffer(inIx, 0, n, ptsUs, 0)
                    } else {
                        enc.queueInputBuffer(inIx, 0, 0, 0, 0)
                    }
                }
                var outIx = enc.dequeueOutputBuffer(info, 0)
                while (outIx >= 0) {
                    val ob = enc.getOutputBuffer(outIx)
                    val isConfig = (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0
                    if (ob != null && info.size > 0 && !isConfig) {
                        ob.position(info.offset)
                        ob.limit(info.offset + info.size)
                        val data = ByteArray(info.size)
                        ob.get(data)
                        sink(data, info.presentationTimeUs)
                    }
                    enc.releaseOutputBuffer(outIx, false)
                    outIx = enc.dequeueOutputBuffer(info, 0)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "audio encode xatosi", e)
        }
    }

    fun stop() {
        running = false
        worker?.interrupt()
        worker = null
        try { record?.stop() } catch (_: Exception) {}
        try { record?.release() } catch (_: Exception) {}
        record = null
        try { codec?.stop() } catch (_: Exception) {}
        try { codec?.release() } catch (_: Exception) {}
        codec = null
        Log.i(TAG, "Audio encoder to'xtatildi")
    }
}
