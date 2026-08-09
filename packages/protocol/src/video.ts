/**
 * VIDEO channel (channel 1) payload header pack/unpack.
 * Spec: docs/PROTOCOL.md §4.
 *
 * VIDEO payload layout: [uint64 ptsUs BE][uint32 seq BE][access unit bytes...]
 * (The channel/flags byte pair is handled by framing.ts; keyframe is a flag.)
 */

const VIDEO_HEADER_LEN = 12; // 8 (ptsUs) + 4 (seq)

/** Pack a video access unit with its presentation timestamp and sequence number. */
export function packVideoPayload(ptsUs: bigint, seq: number, au: Uint8Array): Uint8Array {
  const out = new Uint8Array(VIDEO_HEADER_LEN + au.length);
  const dv = new DataView(out.buffer);
  dv.setBigUint64(0, ptsUs, false);
  dv.setUint32(8, seq >>> 0, false);
  out.set(au, VIDEO_HEADER_LEN);
  return out;
}

export interface VideoPayload {
  ptsUs: bigint;
  seq: number;
  au: Uint8Array;
}

/** Unpack a VIDEO channel payload into ptsUs, seq, and the raw access unit. */
export function unpackVideoPayload(payload: Uint8Array): VideoPayload {
  if (payload.length < VIDEO_HEADER_LEN) throw new Error("video payload too short");
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    ptsUs: dv.getBigUint64(0, false),
    seq: dv.getUint32(8, false),
    au: payload.subarray(VIDEO_HEADER_LEN).slice(),
  };
}

export { VIDEO_HEADER_LEN };
