/**
 * videoBus — main'dan keladigan video AU'larni deviceId bo'yicha tarqatadi.
 * React state ishlatmaydi (har kadrda qayta render bo'lmasligi uchun).
 */

import type { VideoChunkIpc } from "../../shared/ipc";

type Listener = (chunk: VideoChunkIpc) => void;

const listeners = new Map<string, Set<Listener>>();
let started = false;

function ensureStarted(): void {
  if (started) return;
  started = true;
  window.uzatuv.onVideo((chunk) => {
    const set = listeners.get(chunk.deviceId);
    if (set) for (const fn of set) fn(chunk);
  });
}

/** Bitta qurilma oqimiga obuna bo'lish. Tozalash funksiyasini qaytaradi. */
export function subscribeVideo(deviceId: string, fn: Listener): () => void {
  ensureStarted();
  let set = listeners.get(deviceId);
  if (!set) {
    set = new Set();
    listeners.set(deviceId, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
    if (set && set.size === 0) listeners.delete(deviceId);
  };
}
