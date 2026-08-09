/**
 * Length-prefixed wire framing.
 * Spec: docs/PROTOCOL.md §1.1, §1.2.
 *
 * On-wire frame:  [uint32 frameLen BE] [payload...]
 * Decrypted payload: [uint8 channel] [uint8 flags] [channel-payload...]
 *
 * This module handles the *plaintext* inner frame (channel/flags/payload).
 * Encryption of the payload is layered on top by crypto.ts / SecureChannel.
 */

import { MAX_FRAME_LEN } from "./constants";

export interface InnerFrame {
  channel: number;
  flags: number;
  payload: Uint8Array;
}

/** Build the inner frame bytes: [channel][flags][payload]. */
export function encodeInner(channel: number, flags: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + payload.length);
  out[0] = channel & 0xff;
  out[1] = flags & 0xff;
  out.set(payload, 2);
  return out;
}

/** Parse inner frame bytes back into channel/flags/payload. */
export function decodeInner(inner: Uint8Array): InnerFrame {
  if (inner.length < 2) throw new Error("inner frame too short");
  return {
    channel: inner[0]!,
    flags: inner[1]!,
    payload: inner.subarray(2),
  };
}

/** Prefix a payload with its big-endian uint32 length → on-wire frame. */
export function frameWithLength(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_FRAME_LEN) {
    throw new Error(`frame too large: ${payload.length} > ${MAX_FRAME_LEN}`);
  }
  const out = new Uint8Array(4 + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, payload.length, false); // big-endian
  out.set(payload, 4);
  return out;
}

/**
 * Convenience: build a complete plaintext on-wire frame from channel/flags/payload.
 * (Used in tests / when no encryption layer is present.)
 */
export function encodeFrame(channel: number, flags: number, payload: Uint8Array): Uint8Array {
  return frameWithLength(encodeInner(channel, flags, payload));
}

/**
 * Streaming parser for the TCP byte stream. Feed arbitrary chunks with push(),
 * pull complete on-wire *payloads* (post length-prefix) with next().
 *
 * The returned payload is still the raw frame body — if encryption is active,
 * hand it to SecureChannel.open() before decodeInner().
 */
export class FrameParser {
  private buf: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): void {
    if (this.buf.length === 0) {
      this.buf = chunk.slice();
      return;
    }
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
  }

  /** Returns the next complete frame payload, or null if more bytes are needed. */
  next(): Uint8Array | null {
    if (this.buf.length < 4) return null;
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    const len = dv.getUint32(0, false);
    if (len > MAX_FRAME_LEN) {
      throw new Error(`frame too large: ${len} > ${MAX_FRAME_LEN}`);
    }
    if (this.buf.length < 4 + len) return null;
    const payload = this.buf.subarray(4, 4 + len).slice();
    this.buf = this.buf.subarray(4 + len).slice();
    return payload;
  }

  /** Bytes currently buffered (incomplete frame remainder). */
  get pending(): number {
    return this.buf.length;
  }
}
