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

  // ---- UZATISH rejimi (bu PC boshqa qabul qiluvchiga ekran uzatadi) ----
  /** renderer → main (invoke): uzatishni boshlash — qabul qiluvchi uzatuv:// havolasi */
  TRANSMIT_START: "uzatuv:transmit-start",
  /** renderer → main: uzatishni to'xtatish */
  TRANSMIT_STOP: "uzatuv:transmit-stop",
  /** renderer → main: encode qilingan video kadr (Annex-B) */
  TRANSMIT_CHUNK: "uzatuv:transmit-chunk",
  /** main → renderer: uzatish ulanish holati (ConnState) */
  TRANSMIT_STATE: "uzatuv:transmit-state",
  /** main → renderer: qabul qiluvchining control xabari (STREAM_CONFIG/KEYFRAME_REQUEST/SET_BITRATE) */
  TRANSMIT_CONTROL: "uzatuv:transmit-control",

  // ---- Audio (kanal 2) ----
  /** main → renderer: qabul qilingan audio kadr (Opus) */
  AUDIO: "uzatuv:audio",
  /** main → renderer: audio format (AUDIO_CONFIG) */
  AUDIO_CONFIG: "uzatuv:audio-config",
  /** renderer → main: uzatish uchun audio format */
  TRANSMIT_AUDIO_CONFIG: "uzatuv:transmit-audio-config",
  /** renderer → main: uzatish uchun encode qilingan audio kadr */
  TRANSMIT_AUDIO: "uzatuv:transmit-audio",
} as const;

/** Bitta ulanish nuqtasi (WiFi yoki USB tethering interfeysi). */
export interface PairingEndpointView {
  kind: "wifi" | "usb";
  ip: string;
  uri: string;
}

/** Pairing ma'lumoti — QR kod va qisqa kod uchun. */
export interface PairingView {
  /** uzatuv://pair?... URI (asosiy — birinchi WiFi endpoint) */
  uri: string;
  ip: string;
  port: number;
  serverId: string;
  name: string;
  /** ko'rsatish uchun qisqa kod, masalan "482-193-706" (QR o'qilmasa) */
  shortCode: string;
  /** barcha ulanish nuqtalari (WiFi + USB) — har biriga alohida QR */
  endpoints: PairingEndpointView[];
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

/** UZATISH: renderer'daн main'ga encode qilingan video kadr. */
export interface TransmitChunkIpc {
  /** Annex-B access unit */
  data: ArrayBuffer;
  /** presentation timestamp (µs) — string (BigInt IPC muammosidan qochish) */
  ptsUs: string;
  isKeyframe: boolean;
}

/** Qabul qilingan audio kadr (Opus) — main'dan renderer'ga. */
export interface AudioChunkIpc {
  deviceId: string;
  ptsUs: string;
  data: ArrayBuffer;
}

/** Audio format — main'dan renderer'ga (dekoder sozlash uchun). */
export interface AudioConfigIpc {
  deviceId: string;
  sampleRate: number;
  channels: number;
}

/** UZATISH: renderer'dan main'ga encode qilingan audio kadr. */
export interface TransmitAudioIpc {
  ptsUs: string;
  data: ArrayBuffer;
}

/** UZATISH: boshlash natijasi (havola to'g'rimi). */
export interface TransmitStartResult {
  ok: boolean;
  /** qabul qiluvchi nomi (muvaffaqiyatли bo'lsa) */
  name?: string;
  /** xato sababi (ok=false bo'lsa) */
  error?: string;
}
