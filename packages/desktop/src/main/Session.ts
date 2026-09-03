/**
 * Session — bitta Client (Android) ↔ Server (PC) TCP ulanishi.
 * Handshake (CLIENT_HELLO→SERVER_HELLO→CLIENT_AUTH→SERVER_READY), keyin AEAD
 * bilan shifrlangan frame'larni ochadi va video/control ni yuqoriga uzatadi.
 *
 * Spec: docs/PROTOCOL.md §2, §3, §4 · docs/ARCHITECTURE.md §5.
 * Butun crypto/net FAQAT shu (main) process'da ishlaydi.
 */

import type { Socket } from "node:net";
import {
  FrameParser,
  encodeInner,
  decodeInner,
  frameWithLength,
  encodeControl,
  decodeControl,
  hmacAuth,
  deriveKeys,
  makeSecureChannels,
  timingSafeEqual,
  generateNonce,
  unpackVideoPayload,
  CHANNEL,
  FLAG,
  CODEC,
  PROTOCOL_VERSION,
  HMAC_SERVER_LABEL,
  HMAC_CLIENT_LABEL,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
} from "@uzatuv/protocol";
import type {
  ControlMessage,
  DeviceInfo,
  ConnState,
  Codec,
} from "@uzatuv/protocol";

/** Renderer'ga uzatiladigan bitta video AU (main ichidagi ko'rinish). */
export interface VideoChunk {
  data: Uint8Array;
  ptsUs: bigint;
  seq: number;
  isKeyframe: boolean;
  codec: string;
  /** CODEC_CONFIG (SPS/PPS/VPS) baytlari — faqat o'zgarganda biriktiriladi */
  config?: Uint8Array;
}

type VideoCb = (chunk: VideoChunk) => void;
type ControlCb = (m: ControlMessage) => void;
type StateCb = (s: ConnState) => void;
type CloseCb = () => void;

/** Server qo'llaydigan kodeklar (afzallik emas — client tartibi hal qiladi). */
const SERVER_CODECS: readonly Codec[] = [CODEC.H265, CODEC.H264];

/**
 * Adaptiv bitrate chegaralari (kbps). Lokal tarmoq uchun YUQORI sifat: 20 Mbps
 * cap, 8 Mbps floor. Floor yuqori bo'lgani uchun scroll (yuqori harakat) paytida
 * ham tasvir xiralashmaydi.
 */
const MIN_BITRATE_KBPS = 8000;
const MAX_BITRATE_KBPS = 20000;
/** Bitrate'ni yangilash uchun minimal o'zgarish (spam'ni oldini oladi). */
const BITRATE_CHANGE_THRESHOLD = 0.1;

/**
 * Adaptiv bitrate: RTT (ping/pong)ga qarab keyingi maqsad bitrate.
 * Sof funksiya — testlanadi. LOKAL tarmoq uchun YUMSHOQ: faqat tarmoq jiddiy
 * to'lganда (yuqori RTT) pasaytiradi. Scroll paytидаги qisqa RTT sakrashi sifatni
 * tushirmaydi (aks holda gorizontal xira chiziqlar chiqadi).
 * Spec: docs/PROTOCOL.md §6.1.
 */
export function computeAdaptiveBitrate(
  currentKbps: number,
  rttMs: number,
  minKbps: number,
  maxKbps: number,
): number {
  let next = currentKbps;
  if (rttMs > 500) next = currentKbps * 0.8; // tarmoq jiddiy to'lgan
  else if (rttMs > 250) next = currentKbps * 0.92; // mo'tadil
  else if (rttMs < 100) next = currentKbps * 1.08; // barqaror — asta oshiramiz
  return Math.round(Math.min(maxKbps, Math.max(minKbps, next)));
}

export class Session {
  /** deviceId (CLIENT_HELLO.device.deviceId). Handshake tugaguncha bo'sh. */
  public id = "";
  public device: DeviceInfo | null = null;
  public state: ConnState = "HANDSHAKING";
  public codec: Codec = CODEC.H264;
  public rttMs: number | null = null;

  private readonly parser = new FrameParser();
  private clientNonce: Uint8Array | null = null;
  private serverNonce: Uint8Array | null = null;

  // Ready bo'lgach shifrlangan kanallar (server roli).
  private secure: ReturnType<typeof makeSecureChannels> | null = null;

  // Oxirgi CODEC_CONFIG csd baytlari + "o'zgardi" bayrog'i.
  private lastConfig: Uint8Array | null = null;
  private configDirty = false;

  // Kadr yo'qolishini aniqlash (seq sakrasa → keyframe so'raymiz, tez tiklanish).
  private lastVideoSeq = -1;
  private lastKeyframeReqAt = 0;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPongAt = Date.now();
  private pingSeq = 0;
  private closed = false;

  // Adaptiv bitrate holati.
  private maxBitrateKbps = 8000;
  private currentBitrateKbps = 8000;

  private readonly videoCbs: VideoCb[] = [];
  private readonly controlCbs: ControlCb[] = [];
  private readonly stateCbs: StateCb[] = [];
  private readonly closeCbs: CloseCb[] = [];

  constructor(
    private readonly socket: Socket,
    /** Server ushbu ulanish uchun QR/kod orqali bergan sessionKey (32 bayt). */
    private readonly sessionKey: Uint8Array,
    private readonly serverId: string,
  ) {
    socket.setNoDelay(true); // TCP_NODELAY — kechikishni kamaytirish
    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("error", (err) => this.fail(`socket error: ${err.message}`));
    socket.on("close", () => this.onSocketClose());
  }

  // ---- Ommaviy API (ARCHITECTURE.md §5 Session kontrakti) ----

  onVideo(cb: VideoCb): void {
    this.videoCbs.push(cb);
  }
  onControl(cb: ControlCb): void {
    this.controlCbs.push(cb);
  }
  onState(cb: StateCb): void {
    this.stateCbs.push(cb);
  }
  onClose(cb: CloseCb): void {
    this.closeCbs.push(cb);
  }

  /** Control xabar yuborish (faqat READY bo'lgach shifrlab). */
  send(m: ControlMessage): void {
    if (this.state !== "READY" || !this.secure) return;
    const inner = encodeInner(CHANNEL.CONTROL, 0, encodeControl(m));
    this.write(this.secure.send.seal(inner));
  }

  requestKeyframe(): void {
    this.send({ type: "KEYFRAME_REQUEST" });
  }

  setBitrate(bitrateKbps: number): void {
    this.currentBitrateKbps = bitrateKbps;
    this.send({ type: "SET_BITRATE", bitrateKbps });
  }

  close(): void {
    if (this.closed) return;
    this.send({ type: "DISCONNECT", reason: "server_shutdown" });
    this.teardown();
    this.socket.end();
  }

  // ---- Ichki: qabul qilingan baytlar ----

  private onData(chunk: Buffer): void {
    try {
      this.parser.push(new Uint8Array(chunk));
      let payload: Uint8Array | null;
      while ((payload = this.parser.next()) !== null) {
        this.handleFrame(payload);
      }
    } catch (err) {
      this.fail(`frame error: ${(err as Error).message}`);
    }
  }

  private handleFrame(payload: Uint8Array): void {
    if (this.state !== "READY") {
      // Handshakegacha — ochiq JSON (shifrlanmagan).
      this.handleHandshake(decodeControl(payload));
      return;
    }
    // READY — shifrlangan. Ochamiz, keyin ichki frame'ni ajratamiz.
    if (!this.secure) return;
    const inner = decodeInner(this.secure.recv.open(payload));
    switch (inner.channel) {
      case CHANNEL.CONTROL:
        this.handleControl(decodeControl(inner.payload));
        break;
      case CHANNEL.VIDEO:
        this.handleVideo(inner.flags, inner.payload);
        break;
      default:
        // Noma'lum kanal (masalan AUDIO=2 rezerv) → e'tiborsiz (forward-compat).
        break;
    }
  }

  // ---- Handshake (server tomoni) ----

  private handleHandshake(msg: ControlMessage): void {
    if (msg.type === "CLIENT_HELLO") {
      if (msg.protocolVersion !== PROTOCOL_VERSION) {
        this.sendPlain({
          type: "ERROR",
          code: "VERSION_MISMATCH",
          message: `kutilgan v${PROTOCOL_VERSION}`,
        });
        this.fail("protocol version mismatch");
        return;
      }
      this.device = msg.device;
      this.id = msg.device.deviceId;
      this.clientNonce = fromBase64(msg.clientNonce);
      this.serverNonce = generateNonce();

      const chosen = this.chooseCodec(msg.codecs);
      if (!chosen) {
        this.sendPlain({
          type: "ERROR",
          code: "NO_COMMON_CODEC",
          message: "umumiy kodek yo'q",
        });
        this.fail("no common codec");
        return;
      }
      this.codec = chosen;

      const serverAuth = hmacAuth(
        this.sessionKey,
        HMAC_SERVER_LABEL,
        this.clientNonce,
        this.serverNonce,
      );
      this.sendPlain({
        type: "SERVER_HELLO",
        protocolVersion: PROTOCOL_VERSION,
        serverNonce: toBase64(this.serverNonce),
        chosenCodec: chosen,
        serverAuth: toBase64(serverAuth),
      });
      return;
    }

    if (msg.type === "CLIENT_AUTH") {
      if (!this.clientNonce || !this.serverNonce) {
        this.fail("CLIENT_AUTH before CLIENT_HELLO");
        return;
      }
      const expected = hmacAuth(
        this.sessionKey,
        HMAC_CLIENT_LABEL,
        this.clientNonce,
        this.serverNonce,
      );
      const got = fromBase64(msg.clientAuth);
      if (!timingSafeEqual(expected, got)) {
        this.sendPlain({
          type: "ERROR",
          code: "AUTH_FAILED",
          message: "auth mos emas",
        });
        this.fail("client auth failed");
        return;
      }
      // Auth OK → SERVER_READY (hali ochiq), keyin kalitlar chiqariladi.
      this.sendPlain({ type: "SERVER_READY" });
      const keys = deriveKeys(this.sessionKey, this.clientNonce, this.serverNonce);
      this.secure = makeSecureChannels(keys, "server");
      this.setState("READY");
      this.startStream();
      this.startPing();
      return;
    }

    // Handshake bosqichida boshqa xabar kutilmaydi.
  }

  private chooseCodec(clientCodecs: Codec[]): Codec | null {
    // Client afzalligi bo'yicha birinchi mos kodek; hech biri bo'lmasa null.
    for (const c of clientCodecs) {
      if (SERVER_CODECS.includes(c)) return c;
    }
    return null;
  }

  private startStream(): void {
    // Server oqim parametrlarini so'raydi, keyin START, so'ng birinchi keyframe.
    // Lokal tarmoq — yuqori bitrate (20 Mbps). O'lcham 1080p'gача cheklanadi:
    // yuqori DPI planshet (masalan 3200×2136) native holда encoder ochlik qoladi
    // va tasvir xiralashadi/artefakt beradi. 1080p @ 30fps @ 20Mbps — o'tkir sifat.
    this.maxBitrateKbps = MAX_BITRATE_KBPS;
    this.currentBitrateKbps = MAX_BITRATE_KBPS;
    this.send({
      type: "STREAM_CONFIG",
      codec: this.codec,
      maxWidth: 1920,
      maxHeight: 1080,
      fps: 30,
      bitrateKbps: this.maxBitrateKbps,
      keyframeIntervalSec: 1, // qisqa GOP — kadr yo'qolса tez tiklanadi
    });
    this.send({ type: "START" });
    this.send({ type: "KEYFRAME_REQUEST" });
  }

  // ---- Control (READY) ----

  private handleControl(msg: ControlMessage): void {
    switch (msg.type) {
      case "CODEC_CONFIG":
        this.lastConfig = fromBase64(msg.csd);
        this.configDirty = true;
        break;
      case "PING":
        // Client PING → biz PONG qaytaramiz.
        this.send({ type: "PONG", seq: msg.seq, tSentMs: msg.tSentMs });
        break;
      case "PONG":
        this.lastPongAt = Date.now();
        this.rttMs = Date.now() - msg.tSentMs;
        this.adaptBitrate(this.rttMs);
        break;
      case "DISCONNECT":
        this.teardown();
        this.socket.end();
        break;
      default:
        // STATS, RESIZE, ERROR va boshqalar — yuqoriga uzatamiz.
        break;
    }
    for (const cb of this.controlCbs) cb(msg);
  }

  private handleVideo(flags: number, payload: Uint8Array): void {
    const { ptsUs, seq, au } = unpackVideoPayload(payload);
    const isKeyframe = (flags & FLAG.KEYFRAME) !== 0;

    // Kadr yo'qolgan bo'lsa (seq sakradi) — mos-kadr yo'q, artefakt chiqadi.
    // Darhol keyframe so'raymiz (debounce 500ms) — dekoder tez tiklansin.
    if (!isKeyframe && this.lastVideoSeq >= 0 && seq > this.lastVideoSeq + 1) {
      const now = Date.now();
      if (now - this.lastKeyframeReqAt > 500) {
        this.lastKeyframeReqAt = now;
        this.send({ type: "KEYFRAME_REQUEST" });
      }
    }
    this.lastVideoSeq = seq;

    const chunk: VideoChunk = {
      data: au,
      ptsUs,
      seq,
      isKeyframe,
      codec: this.codec,
    };
    // CODEC_CONFIG o'zgargan bo'lsa (yoki inline CONFIG bayrog'i) — biriktiramiz.
    if (this.configDirty && this.lastConfig) {
      chunk.config = this.lastConfig;
      this.configDirty = false;
    }
    for (const cb of this.videoCbs) cb(chunk);
  }

  /** RTT'ga qarab bitrate'ni moslaydi va sezilarli o'zgarishda SET_BITRATE yuboradi. */
  private adaptBitrate(rttMs: number): void {
    const target = computeAdaptiveBitrate(
      this.currentBitrateKbps,
      rttMs,
      MIN_BITRATE_KBPS,
      this.maxBitrateKbps,
    );
    const delta = Math.abs(target - this.currentBitrateKbps) / this.currentBitrateKbps;
    if (delta >= BITRATE_CHANGE_THRESHOLD) {
      this.currentBitrateKbps = target;
      this.send({ type: "SET_BITRATE", bitrateKbps: target });
    }
  }

  // ---- PING/PONG liveness ----

  private startPing(): void {
    this.lastPongAt = Date.now();
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastPongAt > PONG_TIMEOUT_MS) {
        // PONG kelmadi — ulanish o'lgan deb hisoblaymiz.
        this.setState("RECONNECTING");
        this.fail("pong timeout");
        return;
      }
      this.send({ type: "PING", seq: this.pingSeq++, tSentMs: Date.now() });
    }, PING_INTERVAL_MS);
  }

  // ---- Yuborish yordamchilari ----

  /** Handshake bosqichi: ochiq JSON frame. */
  private sendPlain(msg: ControlMessage): void {
    this.write(encodeControl(msg));
  }

  private write(payload: Uint8Array): void {
    if (this.closed) return;
    this.socket.write(Buffer.from(frameWithLength(payload)));
  }

  private setState(s: ConnState): void {
    this.state = s;
    for (const cb of this.stateCbs) cb(s);
  }

  private onSocketClose(): void {
    if (this.closed) return;
    this.teardown();
    this.setState("CLOSED");
    for (const cb of this.closeCbs) cb();
  }

  private fail(reason: string): void {
    console.warn(`[uzatuv] session ${this.id || "?"}: ${reason}`);
    if (this.closed) return;
    this.teardown();
    this.socket.destroy();
  }

  private teardown(): void {
    this.closed = true;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /** Handshake tasdiqlash uchun serverId (QR'dagi bilan mos kelishini tekshirish). */
  get expectedServerId(): string {
    return this.serverId;
  }
}

function toBase64(b: Uint8Array): string {
  return Buffer.from(b).toString("base64");
}
function fromBase64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}
