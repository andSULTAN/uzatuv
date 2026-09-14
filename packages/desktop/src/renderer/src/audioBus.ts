/**
 * audioBus — main'dan keladigan audio kadrlar va AUDIO_CONFIG ni deviceId bo'yicha
 * tarqatadi (videoBus kabi, React state'siz).
 */

import type { AudioChunkIpc, AudioConfigIpc } from "../../shared/ipc";

interface AudioListener {
  onChunk: (chunk: AudioChunkIpc) => void;
  onConfig: (cfg: AudioConfigIpc) => void;
}

const listeners = new Map<string, Set<AudioListener>>();
let started = false;

function ensureStarted(): void {
  if (started) return;
  started = true;
  window.uzatuv.onAudio((chunk) => {
    const set = listeners.get(chunk.deviceId);
    if (set) for (const l of set) l.onChunk(chunk);
  });
  window.uzatuv.onAudioConfig((cfg) => {
    const set = listeners.get(cfg.deviceId);
    if (set) for (const l of set) l.onConfig(cfg);
  });
}

/** Bitta qurilma audio oqimiga obuna. Tozalash funksiyasini qaytaradi. */
export function subscribeAudio(deviceId: string, l: AudioListener): () => void {
  ensureStarted();
  let set = listeners.get(deviceId);
  if (!set) {
    set = new Set();
    listeners.set(deviceId, set);
  }
  set.add(l);
  return () => {
    set?.delete(l);
    if (set && set.size === 0) listeners.delete(deviceId);
  };
}
