/**
 * ScreenTransmitter — UZATISH rejimi (renderer).
 *
 * PC ekranini oladi (getDisplayMedia), WebCodecs `VideoEncoder` (H.264, realtime,
 * Annex-B) bilan encode qiladi va har kadrni callback orqali beradi (main'ga IPC
 * bilan yuboriladi). Foydalanuvchi manbani (butun ekran / oyna) tanlaydi.
 *
 * ⚠️ WebCodecs faqat Chromium/Electron renderer'да ishlaydi (Node'да emas).
 */

export interface TransmitConfig {
  codec: string; // "h264"
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
}

function codecString(codec: string): string {
  if (codec === "h265") return "hvc1.1.6.L93.B0";
  return "avc1.42E01E"; // H.264 baseline
}

function even(v: number): number {
  return v % 2 === 0 ? v : v - 1;
}

export class ScreenTransmitter {
  private encoder: VideoEncoder | null = null;
  private reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  private forceKeyframe = false;
  private frameCount = 0;

  constructor(
    private readonly onChunk: (data: Uint8Array, ptsUs: bigint, isKeyframe: boolean) => void,
    private readonly onPreview: (stream: MediaStream) => void,
    private readonly onEnded: (reason: string) => void,
  ) {}

  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "VideoEncoder" in window &&
      typeof (navigator.mediaDevices as MediaDevices | undefined)?.getDisplayMedia === "function"
    );
  }

  /** Ekranni tanlab, encode oqimini boshlaydi. */
  async start(cfg: TransmitConfig): Promise<void> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: cfg.fps },
      audio: false, // audio keyingi bosqichда
    });
    this.stream = stream;
    this.onPreview(stream);

    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("ekran manbasi topilmadi");
    // Foydalanuvchi "Ulashishni to'xtatish" bossa yoki manba yopilsa.
    track.addEventListener("ended", () => this.onEnded("ended"));

    const settings = track.getSettings();
    const width = even((settings.width as number | undefined) ?? cfg.width);
    const height = even((settings.height as number | undefined) ?? cfg.height);

    const encoder = new VideoEncoder({
      output: (chunk) => this.handleChunk(chunk),
      error: (e) => this.onEnded(`encoder xato: ${e.message}`),
    });
    const config: VideoEncoderConfig = {
      codec: codecString(cfg.codec),
      width,
      height,
      framerate: cfg.fps,
      bitrate: Math.max(1, cfg.bitrateKbps) * 1000,
      latencyMode: "realtime",
    };
    // Annex-B chiqishi (SPS/PPS keyframe ichida) — qabul qiluvchi shuni kutadi.
    (config as VideoEncoderConfig & { avc?: { format: string } }).avc = { format: "annexb" };
    encoder.configure(config);
    this.encoder = encoder;

    const processor = new MediaStreamTrackProcessor<VideoFrame>({ track });
    this.reader = processor.readable.getReader();
    this.running = true;
    void this.pump();
  }

  /** Keyingi kadrni keyframe (IDR) qilib chiqarish (KEYFRAME_REQUEST'ga javoban). */
  requestKeyframe(): void {
    this.forceKeyframe = true;
  }

  private async pump(): Promise<void> {
    const reader = this.reader;
    if (!reader) return;
    while (this.running) {
      const { value: frame, done } = await reader.read();
      if (done || !frame) break;
      try {
        if (this.encoder && this.encoder.state === "configured") {
          const keyFrame = this.forceKeyframe || this.frameCount === 0;
          this.forceKeyframe = false;
          this.encoder.encode(frame, { keyFrame });
          this.frameCount += 1;
        }
      } finally {
        frame.close();
      }
    }
  }

  private handleChunk(chunk: EncodedVideoChunk): void {
    const buf = new Uint8Array(chunk.byteLength);
    chunk.copyTo(buf);
    this.onChunk(buf, BigInt(chunk.timestamp), chunk.type === "key");
  }

  stop(): void {
    this.running = false;
    try {
      void this.reader?.cancel();
    } catch {
      /* e'tiborsiz */
    }
    this.reader = null;
    try {
      if (this.encoder && this.encoder.state !== "closed") this.encoder.close();
    } catch {
      /* e'tiborsiz */
    }
    this.encoder = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.frameCount = 0;
  }
}
