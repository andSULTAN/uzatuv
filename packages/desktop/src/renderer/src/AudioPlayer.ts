/**
 * AudioPlayer — qabul qilingan Opus audio'ni WebCodecs `AudioDecoder` bilan
 * dekod qilib, Web Audio (AudioContext) orqali chaladi.
 *
 * Kadrlar ketma-ket rejalanadi (nextTime) — kichik jitter uchun. Opus kadrlari
 * hammasi mustaqil (key), shuning uchun har biri alohida dekodlanadi.
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private decoder: AudioDecoder | null = null;
  private nextTime = 0;
  private configured = false;

  static isSupported(): boolean {
    return typeof window !== "undefined" && "AudioDecoder" in window;
  }

  configure(sampleRate: number, channels: number): void {
    if (!AudioPlayer.isSupported()) return;
    this.dispose();
    try {
      this.ctx = new AudioContext({ sampleRate });
      this.decoder = new AudioDecoder({
        output: (data) => this.playFrame(data),
        error: (e) => console.warn(`[uzatuv] audio decode xato: ${e.message}`),
      });
      this.decoder.configure({ codec: "opus", sampleRate, numberOfChannels: channels });
      this.nextTime = 0;
      this.configured = true;
    } catch (err) {
      console.warn(`[uzatuv] audio configure xato: ${(err as Error).message}`);
      this.configured = false;
    }
  }

  decode(data: Uint8Array, ptsUs: bigint): void {
    if (!this.configured || !this.decoder || this.decoder.state !== "configured") return;
    try {
      const chunk = new EncodedAudioChunk({
        type: "key", // Opus kadrlari mustaqil
        timestamp: Number(ptsUs),
        data,
      });
      this.decoder.decode(chunk);
    } catch (err) {
      console.warn(`[uzatuv] audio decode: ${(err as Error).message}`);
    }
  }

  private playFrame(data: AudioData): void {
    const ctx = this.ctx;
    if (!ctx) {
      data.close();
      return;
    }
    try {
      const nch = data.numberOfChannels;
      const frames = data.numberOfFrames;
      const sr = data.sampleRate;
      const buffer = ctx.createBuffer(nch, frames, sr);
      for (let ch = 0; ch < nch; ch++) {
        const arr = new Float32Array(frames);
        data.copyTo(arr, { planeIndex: ch, format: "f32-planar" });
        buffer.copyToChannel(arr, ch);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const now = ctx.currentTime;
      // Kichik bufer (60ms) — jitter yumshatish, lekin latency past.
      const start = Math.max(now + 0.06, this.nextTime);
      src.start(start);
      this.nextTime = start + buffer.duration;
    } catch (err) {
      console.warn(`[uzatuv] audio play xato: ${(err as Error).message}`);
    } finally {
      data.close();
    }
  }

  dispose(): void {
    try {
      if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    } catch {
      /* e'tiborsiz */
    }
    try {
      void this.ctx?.close();
    } catch {
      /* e'tiborsiz */
    }
    this.decoder = null;
    this.ctx = null;
    this.configured = false;
  }
}
