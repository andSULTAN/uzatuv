/**
 * Uzatuv protocol constants — single source of truth.
 * Kotlin mirror: packages/protocol/kotlin/Protocol.kt (must stay in sync).
 * Spec: docs/PROTOCOL.md §7.
 */

export const PROTOCOL_VERSION = 1;

/** Default TCP listen port for the desktop server. */
export const DEFAULT_PORT = 8787;

/** mDNS / NSD service type advertised by the desktop server. */
export const MDNS_SERVICE_TYPE = "_uzatuv._tcp";

/** Hard cap on a single wire frame (bytes). Larger => protocol error. */
export const MAX_FRAME_LEN = 16 * 1024 * 1024; // 16 MiB

/** Latency ping cadence and liveness timeout.
 * PONG_TIMEOUT yuqori (15s) — og'ir video oqimi PONG'ni biroz kechiktirsa ham
 * ulanish uzilmasin (davriy uzilishning oldini oladi). */
export const PING_INTERVAL_MS = 2000;
export const PONG_TIMEOUT_MS = 15000;

/** Short pairing code validity window. */
export const PAIR_CODE_TTL_MS = 120_000;

/** Reconnect backoff schedule (ms). Client walks this, then holds at last value. */
export const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;

/** Frame channels. AUDIO is reserved for a future version (v1 ignores it). */
export const CHANNEL = {
  CONTROL: 0,
  VIDEO: 1,
  AUDIO: 2,
} as const;
export type Channel = (typeof CHANNEL)[keyof typeof CHANNEL];

/** Video frame flags (bit field in the frame header). */
export const FLAG = {
  KEYFRAME: 0x01,
  CONFIG: 0x02,
  END_OF_STREAM: 0x04,
} as const;

/** Supported video codecs, base H.264 is mandatory on both sides. */
export const CODEC = {
  H264: "h264",
  H265: "h265",
} as const;
export type Codec = (typeof CODEC)[keyof typeof CODEC];

/** Crypto parameters (see docs/PROTOCOL.md §2.4). */
export const AEAD_ALGO = "aes-256-gcm";
export const AEAD_TAG_LEN = 16; // bytes
export const AEAD_NONCE_LEN = 12; // 4-byte fixed prefix + 8-byte counter
export const HKDF_INFO = "uzatuv-v1";
export const HMAC_SERVER_LABEL = "uzatuv-server";
export const HMAC_CLIENT_LABEL = "uzatuv-client";
export const SESSION_KEY_LEN = 32; // bytes
export const NONCE_LEN = 16; // handshake nonces (client/server), bytes

/** Pairing URI scheme. */
export const PAIRING_URI_SCHEME = "uzatuv";
