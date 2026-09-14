/**
 * AUDIO channel (channel 2) payload pack/unpack.
 * Spec: docs/PROTOCOL.md §5.
 *
 * AUDIO payload layout: [uint64 ptsUs BE][encoded audio bytes...]
 * (channel/flags byte pair is handled by framing.ts.)
 *
 * Codec: Opus (realtime, low-latency). Format (sampleRate, channels) is announced
 * via the AUDIO_CONFIG control message before the first audio frame.
 */

const AUDIO_HEADER_LEN = 8; // uint64 ptsUs

/** Pack an encoded audio frame with its presentation timestamp (µs). */
export function packAudioPayload(ptsUs: bigint, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(AUDIO_HEADER_LEN + data.length);
  const dv = new DataView(out.buffer);
  dv.setBigUint64(0, ptsUs, false);
  out.set(data, AUDIO_HEADER_LEN);
  return out;
}

export interface AudioPayload {
  ptsUs: bigint;
  data: Uint8Array;
}

/** Unpack an AUDIO channel payload into ptsUs and the encoded audio bytes. */
export function unpackAudioPayload(payload: Uint8Array): AudioPayload {
  if (payload.length < AUDIO_HEADER_LEN) throw new Error("audio payload too short");
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    ptsUs: dv.getBigUint64(0, false),
    data: payload.subarray(AUDIO_HEADER_LEN).slice(),
  };
}

export { AUDIO_HEADER_LEN };
