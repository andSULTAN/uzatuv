/// <reference types="vite/client" />

import type { UzatuvApi } from "../../shared/api";

declare global {
  interface Window {
    uzatuv: UzatuvApi;
  }

  /**
   * MediaStreamTrackProcessor — WebCodecs bilan MediaStreamTrack'dan VideoFrame
   * o'qish uchun (Chromium/Electron'да bor, lekin standart TS DOM lib'да yo'q).
   */
  class MediaStreamTrackProcessor<T = VideoFrame> {
    constructor(init: { track: MediaStreamTrack; maxBufferSize?: number });
    readable: ReadableStream<T>;
  }
}

export {};
