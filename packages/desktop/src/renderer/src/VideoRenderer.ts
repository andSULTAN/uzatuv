/**
 * VideoRenderer — WebCodecs `VideoDecoder` ustidagi qatlam.
 * Kontrakt: docs/ARCHITECTURE.md §5 (configure/decode/setFullscreen/dispose).
 *
 * Annex-B oqim: keyframe = "key", aks holda "delta"; timestamp = Number(ptsUs).
 * Dekod xatosida decoder reset qilinadi va yangi keyframe so'raladi.
 *
 * ⚠️ TODO (real qurilmasiz sinalmagan): H.264/H.265 uchun WebCodecs Annex-B
 *    (description'siz) rejimini Chrome/Electron qo'llaydi; kodek satri
 *    (`avc1.*`/`hvc1.*`) SPS'dan aniq chiqarilmagan — standart profil ishlatilgan.
 */

export interface DecodedChunk {
  data: Uint8Array;
  ptsUs: bigint;
  seq: number;
  isKeyframe: boolean;
  codec: string;
  config?: Uint8Array;
}

/** Codec kaliti → WebCodecs kodek satri (standart profil). */
function codecString(codec: string): string {
  if (codec === "h265") return "hvc1.1.6.L93.B0";
  return "avc1.42E01E"; // H.264 baseline 3.1 (majburiy baza)
}

/**
 * SPS/PPS(VPS) config NAL'larini IDR AU oldiga qo'shadi (Annex-B).
 * Ortiqcha parametr to'plami dekoder uchun zararsiz — bu IDR'ni self-contained qiladi.
 */
function prependConfig(config: Uint8Array, au: Uint8Array): Uint8Array {
  const out = new Uint8Array(config.length + au.length);
  out.set(config, 0);
  out.set(au, config.length);
  return out;
}

export interface VideoRendererStats {
  /** dekodlangan kadrlar soni */
  frames: number;
  /** o'lchangan FPS (~1s oynada) */
  fps: number;
  width: number;
  height: number;
}

export class VideoRenderer {
  private decoder: VideoDecoder | null = null;
  private readonly ctx: CanvasRenderingContext2D;
  private currentCodec = "";
  private configured = false;
  private sawKeyframe = false;
  private disposed = false;
  /**
   * Oxirgi CODEC_CONFIG (SPS/PPS/VPS, Annex-B). Annex-B rejimida dekoder
   * IDR'dan oldin parametr to'plamini talab qiladi; MediaCodec ularni har
   * IDR oldiga qo'shmaydi, shuning uchun biz har keyframe oldiga qo'shamiz
   * (reconnect/reset/paket yo'qolishiga chidamli — har keyframe o'zi-yetarli).
   */
  private lastConfig: Uint8Array | null = null;

  // FPS hisoblash
  private frames = 0;
  private fpsFrames = 0;
  private fpsWindowStart = performance.now();
  private fps = 0;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    /** Decoder reset bo'lganda main'dan yangi IDR so'rash uchun. */
    private readonly onNeedKeyframe?: () => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d konteksti olinmadi");
    this.ctx = ctx;
  }

  /** WebCodecs mavjudmi (Electron/Chromium'da bo'lishi kerak). */
  static isSupported(): boolean {
    return typeof window !== "undefined" && "VideoDecoder" in window;
  }

  /** Kodek va (ixtiyoriy) config bilan decoder'ni sozlaydi. */
  configure(codec: string, config?: Uint8Array): void {
    if (this.disposed) return;
    if (!VideoRenderer.isSupported()) return;

    this.reset();
    this.currentCodec = codec;

    this.decoder = new VideoDecoder({
      output: (frame) => this.onFrame(frame),
      error: (e) => this.onError(e),
    });

    const cfg: VideoDecoderConfig = {
      codec: codecString(codec),
      hardwareAcceleration: "prefer-hardware",
      optimizeForLatency: true,
    };
    // Annex-B rejimida description berilmaydi. Kelajakda avcC/hvcC ga o'tilsa,
    // `config` (SPS/PPS) shu yerda `description` sifatida beriladi.
    void config;

    try {
      this.decoder.configure(cfg);
      this.configured = true;
      this.sawKeyframe = false;
    } catch (err) {
      console.warn(`[uzatuv] decoder configure xato: ${(err as Error).message}`);
      this.configured = false;
    }
  }

  /** Bitta AU'ni dekodlaydi. Birinchi keyframe'gacha delta'lar tashlanadi. */
  decode(chunk: DecodedChunk): void {
    if (this.disposed) return;
    if (!VideoRenderer.isSupported()) return;

    // Yangi CODEC_CONFIG kelgan bo'lsa saqlaymiz (keyingi keyframe'larga qo'shish uchun).
    if (chunk.config && chunk.config.length > 0) this.lastConfig = chunk.config;

    // Kodek o'zgargan yoki hali sozlanmagan bo'lsa — qayta sozlaymiz.
    if (!this.configured || chunk.codec !== this.currentCodec) {
      this.configure(chunk.codec, this.lastConfig ?? undefined);
    }
    if (!this.decoder || this.decoder.state !== "configured") return;

    if (chunk.isKeyframe) this.sawKeyframe = true;
    if (!this.sawKeyframe) return; // keyframe'siz delta dekodlanmaydi

    // Keyframe bo'lsa — SPS/PPS(VPS) ni oldiga qo'shamiz (Annex-B, self-contained IDR).
    const data =
      chunk.isKeyframe && this.lastConfig ? prependConfig(this.lastConfig, chunk.data) : chunk.data;

    try {
      const ev = new EncodedVideoChunk({
        type: chunk.isKeyframe ? "key" : "delta",
        timestamp: Number(chunk.ptsUs),
        data,
      });
      this.decoder.decode(ev);
    } catch (err) {
      this.onError(err as Error);
    }
  }

  /** Canvas elementini native fullscreen'ga o'tkazadi (kontrakt metodi). */
  setFullscreen(on: boolean): void {
    if (on) {
      void this.canvas.requestFullscreen?.().catch(() => undefined);
    } else if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }

  stats(): VideoRendererStats {
    return {
      frames: this.frames,
      fps: this.fps,
      width: this.lastWidth,
      height: this.lastHeight,
    };
  }

  /** Barcha resurslarni bo'shatadi. */
  dispose(): void {
    this.disposed = true;
    this.reset();
  }

  // ---- Ichki ----

  private onFrame(frame: VideoFrame): void {
    try {
      const w = frame.displayWidth;
      const h = frame.displayHeight;
      if (w !== this.canvas.width || h !== this.canvas.height) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.lastWidth = w;
      this.lastHeight = h;
      this.ctx.drawImage(frame, 0, 0, w, h);
      this.tickFps();
    } finally {
      frame.close();
    }
  }

  private tickFps(): void {
    this.frames += 1;
    this.fpsFrames += 1;
    const now = performance.now();
    const dt = now - this.fpsWindowStart;
    if (dt >= 1000) {
      this.fps = Math.round((this.fpsFrames * 1000) / dt);
      this.fpsFrames = 0;
      this.fpsWindowStart = now;
    }
  }

  private onError(err: Error): void {
    console.warn(`[uzatuv] decode xato: ${err.message} — reset qilinmoqda`);
    this.configured = false;
    this.sawKeyframe = false;
    // Decoder'ni qayta yaratamiz va yangi keyframe so'raymiz.
    this.reset();
    this.onNeedKeyframe?.();
  }

  private reset(): void {
    if (this.decoder) {
      try {
        if (this.decoder.state !== "closed") this.decoder.close();
      } catch {
        /* e'tiborsiz */
      }
      this.decoder = null;
    }
    this.configured = false;
    this.sawKeyframe = false;
  }
}
