package uz.uzatuv

import android.os.Build
import android.util.Base64
import android.util.Log
import uz.uzatuv.capture.AudioCaptureEncoder
import uz.uzatuv.protocol.Proto
import kotlin.math.min

/**
 * MirrorController — Encoder va Transport'ni bir-biriga bog'laydi (ARCHITECTURE.md §4).
 *
 *   TransportClient.onControl  → ScreenEncoder boshqaruvi
 *      STREAM_CONFIG   → encoder.start(...)
 *      START           → oqim boshlanadi (config kelgan bo'lsa)
 *      STOP            → encoder.stop()
 *      KEYFRAME_REQUEST→ encoder.requestKeyframe()
 *      SET_BITRATE     → encoder.setBitrate(...)
 *   ScreenEncoder sink → TransportClient
 *      isConfig  → CODEC_CONFIG control xabari (SPS/PPS/VPS)
 *      aks holda → sendVideo(AU)
 *
 * Foreground Service ikkalasini ushlab turadi va shu controllerni yaratadi.
 */
class MirrorController(
    private val transport: TransportClient,
    private val encoder: ScreenEncoder,
    private val device: DeviceInfo,
    initialSourceWidth: Int,
    initialSourceHeight: Int,
    /** Ovoz uzatish (API 29+). null bo'lsa faqat video. */
    private val audioEncoder: AudioCaptureEncoder? = null,
) {
    private companion object { const val TAG = "UzatuvController" }

    private var sourceWidth = initialSourceWidth
    private var sourceHeight = initialSourceHeight

    private var chosenCodec = Proto.CODEC_H264
    private var currentConfig: EncoderConfig? = null
    private var encoderRunning = false
    private var audioStarted = false
    @Volatile private var audioMuted = false

    fun start(pairing: PairingInfo) {
        transport.onStateChange { state ->
            MirrorState.updateState(state)
            Log.i(TAG, "Holat: $state")
        }
        transport.onControl { msg -> handleControl(msg) }
        MirrorState.updatePeerName(pairing.name)
        transport.connect(pairing)
    }

    private fun handleControl(msg: ControlMessage) {
        when (msg) {
            is ControlMessage.StreamConfig -> {
                chosenCodec = msg.codec
                val cfg = EncoderConfig(
                    codec = msg.codec,
                    maxWidth = msg.maxWidth,
                    maxHeight = msg.maxHeight,
                    fps = msg.fps,
                    bitrateKbps = msg.bitrateKbps,
                    keyframeIntervalSec = msg.keyframeIntervalSec,
                )
                currentConfig = cfg
                startEncoder(cfg)
            }

            is ControlMessage.Start -> {
                val cfg = currentConfig
                if (cfg != null && !encoderRunning) startEncoder(cfg)
            }

            is ControlMessage.Stop -> {
                encoder.stop()
                encoderRunning = false
            }

            is ControlMessage.KeyframeRequest -> encoder.requestKeyframe()
            is ControlMessage.SetBitrate -> encoder.setBitrate(msg.bitrateKbps)

            else -> { /* PING/PONG transportda; qolgani e'tiborsiz */ }
        }
    }

    private fun startEncoder(cfg: EncoderConfig) {
        if (encoderRunning) encoder.stop()
        encoder.start(cfg) { frame -> onEncodedFrame(cfg, frame) }
        encoderRunning = true
        startAudioIfNeeded()
    }

    /** Ovoz uzatishни boshlaydi (API 29+, qo'llab-quvvatlanса). Bir marta. */
    private fun startAudioIfNeeded() {
        if (audioStarted) return
        val ae = audioEncoder ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        if (!ae.isSupported()) {
            Log.w(TAG, "Opus encoder yo'q — ovozsiz uzatiladi")
            return
        }
        audioStarted = true
        transport.sendAudioConfig(AudioCaptureEncoder.SAMPLE_RATE, AudioCaptureEncoder.CHANNELS)
        ae.start { data, pts -> if (!audioMuted) transport.sendAudio(pts, data) }
        Log.i(TAG, "Ovoz uzatish boshlandi")
    }

    /** Ovozni vaqtincha o'chirish/yoqish. */
    fun setAudioMuted(muted: Boolean) {
        audioMuted = muted
    }

    private fun onEncodedFrame(cfg: EncoderConfig, frame: EncodedFrame) {
        if (frame.isConfig) {
            // SPS/PPS/VPS — CODEC_CONFIG control xabari orqali (PROTOCOL §3)
            val (w, h) = fitSize(sourceWidth, sourceHeight, cfg.maxWidth, cfg.maxHeight)
            transport.sendControl(
                ControlMessage.CodecConfig(
                    codec = cfg.codec,
                    width = w,
                    height = h,
                    csdBase64 = Base64.encodeToString(frame.data, Base64.NO_WRAP),
                ),
            )
        } else {
            transport.sendVideo(frame)
        }
    }

    /** Ekran aylandi/o'lchami o'zgardi — encoder va serverni xabardor qiladi. */
    fun onScreenResize(width: Int, height: Int, rotation: Int) {
        sourceWidth = width
        sourceHeight = height
        encoder.onResize(width, height, rotation)
        transport.sendControl(ControlMessage.Resize(width, height, rotation))
    }

    fun stop(reason: String) {
        encoder.stop()
        encoderRunning = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) audioEncoder?.stop()
        audioStarted = false
        transport.disconnect(reason)
    }

    // ScreenCaptureEncoder bilan bir xil o'lcham hisobi (CODEC_CONFIG uchun informatsion)
    private fun fitSize(w: Int, h: Int, maxW: Int, maxH: Int): Pair<Int, Int> {
        if (maxW <= 0 || maxH <= 0) return even(w) to even(h)
        val scale = min(1f, min(maxW.toFloat() / w, maxH.toFloat() / h))
        return even((w * scale).toInt()) to even((h * scale).toInt())
    }

    private fun even(v: Int): Int = (v and 1.inv()).coerceAtLeast(2)
}
