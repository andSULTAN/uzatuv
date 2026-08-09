/**
 * CONTROL channel (channel 0) message types.
 * Wire form: JSON (UTF-8), discriminated by `type`.
 * Spec: docs/PROTOCOL.md §2.3, §3.
 */

import type { Codec } from "./constants";

export interface ScreenInfo {
  width: number;
  height: number;
  densityDpi: number;
}

export interface DeviceInfo {
  deviceId: string;
  name: string;
  model: string;
  androidSdk: number;
  screen: ScreenInfo;
}

// ---- Handshake (sent in the clear, HMAC-authenticated) ----

export interface ClientHello {
  type: "CLIENT_HELLO";
  protocolVersion: number;
  /** base64, 16 bytes */
  clientNonce: string;
  serverId: string;
  device: DeviceInfo;
  /** preferred first */
  codecs: Codec[];
}

export interface ServerHello {
  type: "SERVER_HELLO";
  protocolVersion: number;
  /** base64, 16 bytes */
  serverNonce: string;
  chosenCodec: Codec;
  /** base64 HMAC_SHA256(sessionKey, "uzatuv-server"||clientNonce||serverNonce) */
  serverAuth: string;
}

export interface ClientAuth {
  type: "CLIENT_AUTH";
  /** base64 HMAC_SHA256(sessionKey, "uzatuv-client"||clientNonce||serverNonce) */
  clientAuth: string;
}

export interface ServerReady {
  type: "SERVER_READY";
}

// ---- Stream control (encrypted) ----

export interface StreamConfig {
  type: "STREAM_CONFIG";
  codec: Codec;
  /** 0 = use device native dimension */
  maxWidth: number;
  maxHeight: number;
  fps: number;
  bitrateKbps: number;
  keyframeIntervalSec: number;
}

export interface CodecConfig {
  type: "CODEC_CONFIG";
  codec: Codec;
  width: number;
  height: number;
  /** base64 Annex-B config NAL units (SPS/PPS[/VPS]) */
  csd: string;
}

export interface Start {
  type: "START";
}
export interface Stop {
  type: "STOP";
}
export interface KeyframeRequest {
  type: "KEYFRAME_REQUEST";
}

export interface SetBitrate {
  type: "SET_BITRATE";
  bitrateKbps: number;
}

export interface Resize {
  type: "RESIZE";
  width: number;
  height: number;
  /** 0 | 90 | 180 | 270 */
  rotation: number;
}

export interface Ping {
  type: "PING";
  seq: number;
  tSentMs: number;
}
export interface Pong {
  type: "PONG";
  seq: number;
  tSentMs: number;
}

export interface Stats {
  type: "STATS";
  fps: number;
  encBitrateKbps: number;
  encQueue: number;
  droppedFrames: number;
  tMs: number;
}

export type DisconnectReason =
  | "user_stopped"
  | "screen_off"
  | "permission_revoked"
  | "server_shutdown"
  | "idle_timeout";

export interface Disconnect {
  type: "DISCONNECT";
  reason: DisconnectReason;
}

export type ErrorCode =
  | "AUTH_FAILED"
  | "VERSION_MISMATCH"
  | "NO_COMMON_CODEC"
  | "PROTOCOL_ERROR"
  | "INTERNAL";

export interface ErrorMsg {
  type: "ERROR";
  code: ErrorCode;
  message: string;
}

/** All control-channel messages. */
export type ControlMessage =
  | ClientHello
  | ServerHello
  | ClientAuth
  | ServerReady
  | StreamConfig
  | CodecConfig
  | Start
  | Stop
  | KeyframeRequest
  | SetBitrate
  | Resize
  | Ping
  | Pong
  | Stats
  | Disconnect
  | ErrorMsg;

export type ControlType = ControlMessage["type"];

/** Connection state exposed by transport layers (see ARCHITECTURE.md). */
export type ConnState =
  | "IDLE"
  | "CONNECTING"
  | "HANDSHAKING"
  | "READY"
  | "RECONNECTING"
  | "CLOSED";

/** Encode a control message to a UTF-8 JSON payload (channel 0 body). */
export function encodeControl(msg: ControlMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

/** Decode a channel-0 payload back into a control message. Throws on invalid JSON. */
export function decodeControl(payload: Uint8Array): ControlMessage {
  const text = new TextDecoder().decode(payload);
  const obj = JSON.parse(text) as ControlMessage;
  if (typeof obj !== "object" || obj === null || typeof (obj as { type?: unknown }).type !== "string") {
    throw new Error("invalid control message");
  }
  return obj;
}
