/**
 * IPC kontrakti — main (transport server) ↔ renderer (dekod + UI) o'rtasidagi
 * kanal nomlari va yuk (payload) turlari. Main va preload bu faylni to'g'ridan
 * import qiladi; renderer faqat `import type` bilan (Node kodini tortmaslik uchun).
 */

import type { ConnState, DeviceInfo } from "@uzatuv/protocol";

/** IPC kanal nomlari (bir joyda — xato yozishning oldini oladi). */
export const IPC = {
  /** main → renderer: pairing URI/kod yangilandi */
  PAIRING: "uzatuv:pairing",
  /** renderer → main (invoke): joriy pairing ma'lumotini so'rash */
  GET_PAIRING: "uzatuv:get-pairing",
  /** main → renderer: sessiyalar ro'yxati yangilandi */
  SESSIONS: "uzatuv:sessions",
  /** main → renderer: bitta video access unit yetib keldi */
  VIDEO: "uzatuv:video",
  /** renderer → main: qurilmadan keyframe (IDR) so'rash */
  REQUEST_KEYFRAME: "uzatuv:request-keyframe",
  /** renderer → main: qurilma bitrate'ini o'zgartirish */
  SET_BITRATE: "uzatuv:set-bitrate",
} as const;

/** Pairing ma'lumoti — QR kod va qisqa kod uchun. */
export interface PairingView {
  /** uzatuv://pair?... URI (QR ichiga) */
  uri: string;
  ip: string;
  port: number;
  serverId: string;
  name: string;
  /** ko'rsatish uchun qisqa kod, masalan "482-193-706" (QR o'qilmasa) */
  shortCode: string;
}

/** UI uchun bitta sessiya holati (renderer'ga yuboriladigan yengil ko'rinish). */
export interface SessionView {
  id: string;
  device: DeviceInfo;
  state: ConnState;
  codec: string;
  /** oxirgi o'lchangan RTT (ms), yo'q bo'lsa null */
  rttMs: number | null;
}

/**
 * Bitta video AU — main'dan renderer'ga. `data`/`config` ArrayBuffer sifatida
 * (structured-clone bilan ko'chiriladi). `ptsUs` BigInt IPC muammosidan qochish
 * uchun string ko'rinishda (renderer'da `BigInt()`/`Number()` bilan ochiladi).
 */
export interface VideoChunkIpc {
  deviceId: string;
  ptsUs: string;
  seq: number;
  isKeyframe: boolean;
  codec: string;
  /** avvalgi CODEC_CONFIG (SPS/PPS/VPS) Annex-B baytlari, bor bo'lsa */
  config: ArrayBuffer | null;
  /** encode qilingan access unit (Annex-B) */
  data: ArrayBuffer;
}
