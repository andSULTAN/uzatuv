/**
 * Handshake authentication + key derivation + AEAD channel.
 * Spec: docs/PROTOCOL.md §2.3, §2.4.
 *
 * Uses Node's `crypto` (available in Electron main process). Android mirrors
 * this with javax.crypto (HMAC-SHA256, HKDF, AES/GCM/NoPadding).
 */

import {
  createHmac,
  hkdfSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "crypto";
import {
  AEAD_TAG_LEN,
  AEAD_NONCE_LEN,
  HKDF_INFO,
  HMAC_SERVER_LABEL,
  HMAC_CLIENT_LABEL,
  SESSION_KEY_LEN,
  NONCE_LEN,
} from "./constants";

/** Generate a fresh 32-byte session key (server-side, per session). */
export function generateSessionKey(): Uint8Array {
  return new Uint8Array(randomBytes(SESSION_KEY_LEN));
}

/** Generate a fresh 16-byte handshake nonce. */
export function generateNonce(): Uint8Array {
  return new Uint8Array(randomBytes(NONCE_LEN));
}

/**
 * HMAC_SHA256(sessionKey, label || clientNonce || serverNonce).
 * `label` is HMAC_SERVER_LABEL or HMAC_CLIENT_LABEL.
 */
export function hmacAuth(
  sessionKey: Uint8Array,
  label: string,
  clientNonce: Uint8Array,
  serverNonce: Uint8Array,
): Uint8Array {
  const h = createHmac("sha256", Buffer.from(sessionKey));
  h.update(Buffer.from(label, "utf8"));
  h.update(Buffer.from(clientNonce));
  h.update(Buffer.from(serverNonce));
  return new Uint8Array(h.digest());
}

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export interface SessionKeys {
  keyC2S: Uint8Array; // client -> server
  keyS2C: Uint8Array; // server -> client
  nonceFixC2S: Uint8Array; // 4 bytes
  nonceFixS2C: Uint8Array; // 4 bytes
}

/**
 * HKDF-SHA256 key derivation from sessionKey + nonces.
 * salt = clientNonce || serverNonce ; info = "uzatuv-v1" ; length = 88 bytes.
 */
export function deriveKeys(
  sessionKey: Uint8Array,
  clientNonce: Uint8Array,
  serverNonce: Uint8Array,
): SessionKeys {
  const salt = new Uint8Array(clientNonce.length + serverNonce.length);
  salt.set(clientNonce, 0);
  salt.set(serverNonce, clientNonce.length);

  const okm = new Uint8Array(
    hkdfSync("sha256", Buffer.from(sessionKey), Buffer.from(salt), Buffer.from(HKDF_INFO, "utf8"), 88),
  );

  return {
    keyC2S: okm.subarray(0, 32).slice(),
    keyS2C: okm.subarray(32, 64).slice(),
    nonceFixC2S: okm.subarray(64, 68).slice(),
    nonceFixS2C: okm.subarray(68, 72).slice(),
  };
}

/**
 * One direction of an AES-256-GCM encrypted channel with a monotonic nonce counter.
 * nonce (12 bytes) = fixedPrefix(4) || counter(uint64 BE, 8).
 *
 * Create one for sealing (outgoing) and one for opening (incoming) per direction.
 */
export class SecureChannel {
  private counter = 0n;

  constructor(
    private readonly key: Uint8Array,
    private readonly nonceFix: Uint8Array,
  ) {
    if (key.length !== 32) throw new Error("key must be 32 bytes");
    if (nonceFix.length !== 4) throw new Error("nonceFix must be 4 bytes");
  }

  private nextNonce(): Uint8Array {
    const nonce = new Uint8Array(AEAD_NONCE_LEN);
    nonce.set(this.nonceFix, 0);
    const dv = new DataView(nonce.buffer);
    dv.setBigUint64(4, this.counter, false); // big-endian counter
    this.counter += 1n;
    return nonce;
  }

  /** Encrypt plaintext → ciphertext||tag (tag appended, 16 bytes). */
  seal(plaintext: Uint8Array): Uint8Array {
    const nonce = this.nextNonce();
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(this.key), Buffer.from(nonce));
    const ct = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const tag = cipher.getAuthTag(); // 16 bytes
    return new Uint8Array(Buffer.concat([ct, tag]));
  }

  /** Decrypt ciphertext||tag → plaintext. Throws on auth failure. */
  open(sealed: Uint8Array): Uint8Array {
    if (sealed.length < AEAD_TAG_LEN) throw new Error("sealed frame too short");
    const nonce = this.nextNonce();
    const ct = sealed.subarray(0, sealed.length - AEAD_TAG_LEN);
    const tag = sealed.subarray(sealed.length - AEAD_TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(this.key), Buffer.from(nonce));
    decipher.setAuthTag(Buffer.from(tag));
    const pt = Buffer.concat([decipher.update(Buffer.from(ct)), decipher.final()]);
    return new Uint8Array(pt);
  }
}

/**
 * Build both directional channels for one peer.
 * @param role "server" or "client" — determines which key seals vs opens.
 */
export function makeSecureChannels(keys: SessionKeys, role: "server" | "client") {
  if (role === "server") {
    return {
      send: new SecureChannel(keys.keyS2C, keys.nonceFixS2C), // server -> client
      recv: new SecureChannel(keys.keyC2S, keys.nonceFixC2S), // client -> server
    };
  }
  return {
    send: new SecureChannel(keys.keyC2S, keys.nonceFixC2S), // client -> server
    recv: new SecureChannel(keys.keyS2C, keys.nonceFixS2C), // server -> client
  };
}
