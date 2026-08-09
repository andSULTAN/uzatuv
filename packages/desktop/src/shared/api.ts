/**
 * Renderer'ga (window.uzatuv) ochiladigan API turi. Preload shu shaklga amal
 * qiladi; renderer faqat `import type` bilan ishlatadi.
 */

import type { PairingView, SessionView, VideoChunkIpc } from "./ipc";

export interface UzatuvApi {
  /** Joriy pairing (QR URI + qisqa kod). */
  getPairing(): Promise<PairingView | null>;
  /** Pairing yangilanganda. Tozalash funksiyasini qaytaradi. */
  onPairing(cb: (p: PairingView | null) => void): () => void;
  /** Ulangan sessiyalar ro'yxati yangilanganda. */
  onSessions(cb: (list: SessionView[]) => void): () => void;
  /** Video AU yetib kelganda. */
  onVideo(cb: (chunk: VideoChunkIpc) => void): () => void;
  /** Qurilmadan keyframe (IDR) so'rash. */
  requestKeyframe(deviceId: string): void;
  /** Qurilma bitrate'ini o'zgartirish (kbps). */
  setBitrate(deviceId: string, kbps: number): void;
}
