/**
 * Renderer'ga (window.uzatuv) ochiladigan API turi. Preload shu shaklga amal
 * qiladi; renderer faqat `import type` bilan ishlatadi.
 */

import type { PairingView, SessionView, VideoChunkIpc, TransmitChunkIpc, TransmitStartResult } from "./ipc";
import type { ControlMessage, ConnState } from "@uzatuv/protocol";

export interface UzatuvApi {
  // ---- QABUL QILISH rejimi (bu PC boshqalardan ekran oladi) ----
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

  // ---- UZATISH rejimi (bu PC ekranini boshqasiga uzatadi) ----
  /** Uzatishni boshlash — qabul qiluvchining uzatuv:// havolasi. */
  transmitStart(uri: string): Promise<TransmitStartResult>;
  /** Uzatishni to'xtatish. */
  transmitStop(): void;
  /** Encode qilingan video kadr (renderer → main → sim). */
  transmitChunk(chunk: TransmitChunkIpc): void;
  /** Uzatish ulanish holati o'zgarganda. */
  onTransmitState(cb: (state: ConnState) => void): () => void;
  /** Qabul qiluvchining control xabari (STREAM_CONFIG/KEYFRAME_REQUEST/SET_BITRATE). */
  onTransmitControl(cb: (msg: ControlMessage) => void): () => void;
}
