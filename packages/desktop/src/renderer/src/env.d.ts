/// <reference types="vite/client" />

import type { UzatuvApi } from "../../shared/api";

declare global {
  interface Window {
    uzatuv: UzatuvApi;
  }
}

export {};
