package uz.uzatuv.capture

import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.view.Surface
import uz.uzatuv.EncodedFrame
import uz.uzatuv.EncoderConfig
import uz.uzatuv.ScreenEncoder
import uz.uzatuv.protocol.Proto
import kotlin.math.min

/**
 * ScreenCaptureEncoder — ekranni oladi va H.264/H.265 HW encoder bilan encode qiladi.
 *
 * Oqim: MediaProjection → VirtualDisplay → (Surface) → MediaCodec → EncodedFrame → sink.
 *
 * Low-latency konfiguratsiya (ARCHITECTURE.md §4):
 *   - COLOR_FormatSurface (Surface input, nol nusxa)
 *   - CBR bitrate rejimi, qisqa GOP (I_FRAME_INTERVAL = keyframeIntervalSec)
 *   - KEY_PRIORITY = 0 (realtime), KEY_LOW_LATENCY/KEY_LATENCY (API 30+)
 *   - B-frame yo'q (baseline oqim)
 *
 * @param mediaProjection ruxsatdan olingan MediaProjection (service ichida yaratiladi)
 * @param sourceWidth  ekranning joriy piksel kengligi
 * @param sourceHeight ekranning joriy piksel balandligi
 * @param densityDpi   ekran zichligi (VirtualDisplay uchun)
 */
class ScreenCaptureEncoder(
    private val mediaProjection: MediaProjection,
    private var sourceWidth: Int,
    private var sourceHeight: Int,
    private val densityDpi: Int,
) : ScreenEncoder {

    private companion object {
        const val TAG = "UzatuvEncoder"
        const val VIRTUAL_DISPLAY_NAME = "uzatuv-mirror"
    }

    private var codec: MediaCodec? = null
    private var inputSurface: Surface? = null
    private var virtualDisplay: VirtualDisplay? = null

    private var codecThread: HandlerThread? = null
    private var codecHandler: Handler? = null

    @Volatile private var frameSink: ((EncodedFrame) -> Unit)? = null
    @Volatile private var running = false

    private var config: EncoderConfig = EncoderConfig(Proto.CODEC_H264, 0, 0, 60, 8000, 2)

    // MediaProjection.Callback — Android 14 da virtual display'dan OLDIN ro'yxatdan o'tishi shart
    private val projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
            Log.i(TAG, "MediaProjection to'xtatildi (tizim yoki foydalanuvchi)")
            stop()
        }
    }

    @Synchronized
    override fun start(config: EncoderConfig, sink: (EncodedFrame) -> Unit) {
        if (running) stop()
        this.config = config
        this.frameSink = sink
        running = true

        codecThread = HandlerThread("uzatuv-encoder").also { it.start() }
        codecHandler = Handler(codecThread!!.looper)

        mediaProjection.registerCallback(projectionCallback, codecHandler)
        startEncoderLocked()
    }

    /** Encoder + VirtualDisplay'ni joriy [config] va manba o'lchamiga qarab yaratadi. */
    private fun startEncoderLocked() {
        val (encW, encH) = computeSize(sourceWidth, sourceHeight, config.maxWidth, config.maxHeight)
        val mime = if (config.codec == Proto.CODEC_H265) MediaFormat.MIMETYPE_VIDEO_HEVC
        else MediaFormat.MIMETYPE_VIDEO_AVC

        val format = MediaFormat.createVideoFormat(mime, encW, encH).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, config.bitrateKbps * 1000)
            setInteger(MediaFormat.KEY_FRAME_RATE, config.fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, config.keyframeIntervalSec)
            setInteger(
                MediaFormat.KEY_BITRATE_MODE,
                MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR,
            )
            // Realtime prioritet — kechikishni kamaytiradi
            setInteger(MediaFormat.KEY_PRIORITY, 0)
            // B-frame yo'q (mavjud bo'lsa)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                setInteger(MediaFormat.KEY_MAX_B_FRAMES, 0)
            }
            // Low-latency (API 30+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
                setInteger(MediaFormat.KEY_LATENCY, 1)
            }
        }

        val mc = MediaCodec.createEncoderByType(mime)
        mc.setCallback(encoderCallback, codecHandler)
        mc.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = mc.createInputSurface()
        mc.start()
        codec = mc

        virtualDisplay = mediaProjection.createVirtualDisplay(
            VIRTUAL_DISPLAY_NAME,
            encW, encH, densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_PUBLIC or
                DisplayManager.VIRTUAL_DISPLAY_FLAG_PRESENTATION,
            inputSurface, null, codecHandler,
        )
        Log.i(TAG, "Encoder boshlandi: $mime ${encW}x$encH @${config.fps}fps ${config.bitrateKbps}kbps")
    }

    private val encoderCallback = object : MediaCodec.Callback() {
        // Surface input — input bufferlar kelmaydi, faqat output
        override fun onInputBufferAvailable(codec: MediaCodec, index: Int) { /* no-op */ }

        override fun onOutputBufferAvailable(
            codec: MediaCodec,
            index: Int,
            info: MediaCodec.BufferInfo,
        ) {
            try {
                val buffer = codec.getOutputBuffer(index)
                if (buffer != null && info.size > 0) {
                    val isConfig = (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0
                    val isKeyframe = (info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0

                    buffer.position(info.offset)
                    buffer.limit(info.offset + info.size)
                    val data = ByteArray(info.size)
                    buffer.get(data)

                    frameSink?.invoke(
                        EncodedFrame(
                            data = data,
                            ptsUs = info.presentationTimeUs,
                            isKeyframe = isKeyframe,
                            isConfig = isConfig,
                        ),
                    )
                }
            } catch (e: IllegalStateException) {
                Log.w(TAG, "output buffer o'qishda xato", e)
            } finally {
                try {
                    codec.releaseOutputBuffer(index, false)
                } catch (_: IllegalStateException) { /* encoder to'xtagan bo'lishi mumkin */ }
            }
        }

        override fun onError(codec: MediaCodec, e: MediaCodec.CodecException) {
            Log.e(TAG, "Encoder xatosi — qayta yaratilmoqda", e)
            // Encoder xatosi: qayta yaratish (ARCHITECTURE §7)
            recreateEncoder()
        }

        override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {
            // Surface encoder'da csd bu yerdan emas, CODEC_CONFIG bufer(BUFFER_FLAG_CODEC_CONFIG)dan keladi
            Log.i(TAG, "Output format o'zgardi: $format")
        }
    }

    override fun requestKeyframe() {
        val mc = codec ?: return
        try {
            mc.setParameters(Bundle().apply {
                putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0)
            })
        } catch (e: IllegalStateException) {
            Log.w(TAG, "requestKeyframe muvaffaqiyatsiz", e)
        }
    }

    override fun setBitrate(kbps: Int) {
        val mc = codec ?: return
        try {
            mc.setParameters(Bundle().apply {
                putInt(MediaCodec.PARAMETER_KEY_VIDEO_BITRATE, kbps * 1000)
            })
        } catch (e: IllegalStateException) {
            Log.w(TAG, "setBitrate muvaffaqiyatsiz", e)
        }
    }

    @Synchronized
    override fun onResize(width: Int, height: Int, rotation: Int) {
        if (!running) return
        if (width == sourceWidth && height == sourceHeight) return
        sourceWidth = width
        sourceHeight = height
        // Surface o'lchami encoderda qat'iy — encoder + VirtualDisplay'ni qayta yaratamiz
        Log.i(TAG, "onResize ${width}x$height rot=$rotation — encoder qayta yaratilmoqda")
        releaseEncoderLocked()
        startEncoderLocked()
    }

    @Synchronized
    private fun recreateEncoder() {
        if (!running) return
        releaseEncoderLocked()
        startEncoderLocked()
    }

    private fun releaseEncoderLocked() {
        virtualDisplay?.release(); virtualDisplay = null
        try { codec?.stop() } catch (_: IllegalStateException) {}
        codec?.release(); codec = null
        inputSurface?.release(); inputSurface = null
    }

    @Synchronized
    override fun stop() {
        if (!running && codec == null) return
        running = false
        releaseEncoderLocked()
        try { mediaProjection.unregisterCallback(projectionCallback) } catch (_: Exception) {}
        try { mediaProjection.stop() } catch (_: Exception) {}
        codecThread?.quitSafely()
        codecThread = null
        codecHandler = null
        frameSink = null
        Log.i(TAG, "Encoder to'xtatildi")
    }

    /**
     * Manba o'lchamini (w x h) server bergan qutiga (maxW x maxH) aspect saqlab sig'diradi.
     * Faqat kichraytiradi; max=0 bo'lsa tabiiy o'lcham. Natija juft songa yaxlitlanadi.
     */
    private fun computeSize(w: Int, h: Int, maxW: Int, maxH: Int): Pair<Int, Int> {
        if (maxW <= 0 || maxH <= 0) return even(w) to even(h)
        val scale = min(1f, min(maxW.toFloat() / w, maxH.toFloat() / h))
        return even((w * scale).toInt()) to even((h * scale).toInt())
    }

    // Ko'p encoderlar juft (ba'zan 16-ga bo'linadigan) o'lcham talab qiladi
    private fun even(v: Int): Int = (v and 1.inv()).coerceAtLeast(2)
}
