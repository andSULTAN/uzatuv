/**
 * ClientSession — desktop UZATISH rejimi transporti (klient).
 *
 * Bu Session'ning teskarisi: PC boshqa qabul qiluvchiga (Android TV, boshqa PC)
 * ULANADI, o'z ekranini encode qilib yuboradi. Handshake KLIENT tomonidan
 * (CLIENT_HELLO→SERVER_HELLO→CLIENT_AUTH→SERVER_READY), keyin AEAD.
 *
 * Video/audio kadrlar renderer'da (WebCodecs) encode qilinib, IPC orqali shu
 * yerga keladi va simga yuboriladi. Qabul qiluvchining control xabarlari
 * (STREAM_CONFIG/START/KEYFRAME_REQUEST/SET_BITRATE) renderer'ga uzatiladi.
 *
 * Spec: docs/PROTOCOL.md §2, §3, §4.
 */

import net from "node:net";
import {
  FrameParser,
  frameWithLength,
  encodeInner,
  decodeInner,
  encodeControl,
  decodeControl,
  hmacAuth,
  timingSafeEqual,
  deriveKeys,
  makeSecureChannels,
  generateNonce,
  packVideoPayload,
  CHANNEL,
  FLAG,
  PROTOCOL_VERSION,
  HMAC_SERVER_LABEL,
  HMAC_CLIENT_LABEL,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  RECONNECT_BACKOFF_MS,
} from "@uzatuv/protocol";
import type { ControlMessage, ConnState, Codec } from "@uzatuv/protocol";

/** Ulanish manzili — qabul qiluvchining IP/port/serverId + saqlangan sessionKey. */
export interface ClientTarget {
  ip: string;
  port: number;
  serverId: string;
  sessionKey: Uint8Array; // 32 bayt
}

export interface OutgoingVideo {
  data: Uint8Array; // Annex-B access unit
  ptsUs: bigint;
  isKeyframe: boolean;
}

type ControlCb = (m: ControlMessage) => void;
type StateCb = (s: ConnState) => void;

const b64 = (u8: Uint8Array): string => Buffer.from(u8).toString("base64");
const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"));

/** TCP bufer chegarasi — undan oshsa delta kadrlar tashlanadi (backpressure). */
const MAX_SEND_BUFFER = 4 * 1024 * 1024; // 4 MB (~1.6s @ 20 Mbps)

export class ClientSession {
  private socket: net.Socket | null = null;
  private parser = new FrameParser();
  private secure: ReturnType<typeof makeSecureChannels> | null = null;
  private ready = false;
  private clientNonce: Uint8Array | null = null;
  private videoSeq = 0;
  private closed = false;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastInboundAt = Date.now();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly controlCbs: ControlCb[] = [];
  private readonly stateCbs: StateCb[] = [];

  constructor(
    private readonly target: ClientTarget,
    private readonly device: {
      deviceId: string;
      name: string;
      model: string;
      screen: { width: number; height: number; densityDpi: number };
    },
    private readonly codecs: Codec[] = ["h264"],
  ) {}

  onControl(cb: ControlCb): void {
    this.controlCbs.push(cb);
  }
  onState(cb: StateCb): void {
    this.stateCbs.push(cb);
  }

  connect(): void {
    this.closed = false;
    this.openSocket();
  }

  /** Renderer'daн kelgan encode qilingan video kadr — simga yuboriladi. */
  sendVideo(v: OutgoingVideo): void {
    if (!this.ready || !this.secure || !this.socket) return;
    // Backpressure: TCP bufer to'lgan bo'lsa delta kadrni TASHLAYMIZ — control
    // (PONG) bloklanmasin va latency o'smasin. Keyframe hamma vaqt yuboriladi.
    if (this.socket.writableLength > MAX_SEND_BUFFER && !v.isKeyframe) {
      return; // kadr tashlandi (tarmoq band)
    }
    const flags = v.isKeyframe ? FLAG.KEYFRAME : 0;
    const payload = packVideoPayload(v.ptsUs, this.videoSeq++, v.data);
    this.writeSecure(CHANNEL.VIDEO, flags, payload);
  }

  /** CODEC_CONFIG (SPS/PPS) — agar encoder alohida bersa (annexb'da ixtiyoriy). */
  sendCodecConfig(codec: Codec, width: number, height: number, csd: Uint8Array): void {
    this.sendControl({ type: "CODEC_CONFIG", codec, width, height, csd: b64(csd) });
  }

  sendControl(m: ControlMessage): void {
    if (!this.ready || !this.secure) return;
    this.writeSecure(CHANNEL.CONTROL, 0, encodeControl(m));
  }

  disconnect(): void {
    this.closed = true;
    try {
      if (this.ready) this.sendControl({ type: "DISCONNECT", reason: "user_stopped" });
    } catch {
      /* e'tiborsiz */
    }
    this.teardown();
    this.setState("CLOSED");
  }

  // ---- Ichki ----

  private openSocket(): void {
    this.setState(this.reconnectAttempt === 0 ? "CONNECTING" : "RECONNECTING");
    const sock = net.connect(this.target.port, this.target.ip, () => this.startHandshake());
    sock.setNoDelay(true);
    sock.on("data", (chunk) => this.onData(new Uint8Array(chunk)));
    sock.on("error", () => this.onSocketDown());
    sock.on("close", () => this.onSocketDown());
    this.socket = sock;
  }

  private startHandshake(): void {
    this.clientNonce = generateNonce();
    this.sendPlain({
      type: "CLIENT_HELLO",
      protocolVersion: PROTOCOL_VERSION,
      clientNonce: b64(this.clientNonce),
      serverId: this.target.serverId,
      device: {
        deviceId: this.device.deviceId,
        name: this.device.name,
        model: this.device.model,
        androidSdk: 0, // desktop
        screen: this.device.screen,
      },
      codecs: this.codecs,
    });
  }

  private onData(chunk: Uint8Array): void {
    this.lastInboundAt = Date.now();
    try {
      this.parser.push(chunk);
      let payload: Uint8Array | null;
      while ((payload = this.parser.next()) !== null) {
        if (!this.ready) this.handleHandshake(decodeControl(payload));
        else this.handleSecure(payload);
      }
    } catch {
      this.onSocketDown();
    }
  }

  private handleHandshake(msg: ControlMessage): void {
    if (msg.type === "SERVER_HELLO") {
      if (!this.clientNonce) return;
      const serverNonce = unb64(msg.serverNonce);
      const expected = hmacAuth(this.target.sessionKey, HMAC_SERVER_LABEL, this.clientNonce, serverNonce);
      if (!timingSafeEqual(unb64(msg.serverAuth), expected)) {
        this.onSocketDown();
        return;
      }
      const clientAuth = hmacAuth(this.target.sessionKey, HMAC_CLIENT_LABEL, this.clientNonce, serverNonce);
      this.sendPlain({ type: "CLIENT_AUTH", clientAuth: b64(clientAuth) });
      const keys = deriveKeys(this.target.sessionKey, this.clientNonce, serverNonce);
      this.secure = makeSecureChannels(keys, "client");
    } else if (msg.type === "SERVER_READY") {
      this.ready = true;
      this.reconnectAttempt = 0;
      this.setState("READY");
      this.startPing();
    } else if (msg.type === "ERROR") {
      this.onSocketDown();
    }
  }

  private handleSecure(payload: Uint8Array): void {
    if (!this.secure) return;
    const inner = decodeInner(this.secure.recv.open(payload));
    if (inner.channel !== CHANNEL.CONTROL) return; // klient video qabul qilmaydi
    const msg = decodeControl(inner.payload);
    if (msg.type === "PING") {
      this.sendControl({ type: "PONG", seq: msg.seq, tSentMs: msg.tSentMs });
    }
    for (const cb of this.controlCbs) cb(msg);
  }

  private startPing(): void {
    this.lastInboundAt = Date.now();
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastInboundAt > PONG_TIMEOUT_MS) {
        this.onSocketDown();
        return;
      }
      this.sendControl({ type: "PING", seq: 0, tSentMs: Date.now() });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private onSocketDown(): void {
    if (this.closed) return;
    this.teardownSocket();
    // Reconnect (backoff) — sessionKey saqlanadi.
    const idx = Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1);
    const backoff = RECONNECT_BACKOFF_MS[idx] ?? 15000;
    this.reconnectAttempt += 1;
    this.setState("RECONNECTING");
    this.reconnectTimer = setTimeout(() => {
      if (!this.closed) this.openSocket();
    }, backoff);
  }

  private sendPlain(msg: ControlMessage): void {
    this.socket?.write(Buffer.from(frameWithLength(encodeControl(msg))));
  }

  private writeSecure(channel: number, flags: number, body: Uint8Array): void {
    if (!this.secure || !this.socket) return;
    const inner = encodeInner(channel, flags, body);
    this.socket.write(Buffer.from(frameWithLength(this.secure.send.seal(inner))));
  }

  private setState(s: ConnState): void {
    for (const cb of this.stateCbs) cb(s);
  }

  private teardownSocket(): void {
    this.stopPing();
    this.ready = false;
    this.secure = null;
    this.videoSeq = 0;
    this.parser = new FrameParser();
    if (this.socket) {
      this.socket.removeAllListeners();
      try {
        this.socket.destroy();
      } catch {
        /* e'tiborsiz */
      }
      this.socket = null;
    }
  }

  private teardown(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.teardownSocket();
  }
}
