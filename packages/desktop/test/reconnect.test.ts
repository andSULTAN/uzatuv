/**
 * FAZA 4 — reconnect (qayta ulanish) mustahkamligi testi.
 *
 * Bir xil deviceId bilan IKKINCHI ulanish kelganda (qayta ulanish holati) server:
 *   - eski sessiyani yangisi bilan ALMASHTIRADI (dublikat yaratmaydi),
 *   - jami 1 ta sessiya saqlaydi,
 *   - yangi ulanishdan video oqadi (reattachment ishlaydi).
 *
 * Bu SessionManager'dagi reconnect reattachment tuzatishini isbotlaydi.
 * Transport qatlami testi. Ishga tushirish: npm run test:reconnect
 */

import net from "node:net";
import assert from "node:assert/strict";
import { SessionManager } from "../src/main/SessionManager";
import { sessionKeyFromPairing } from "@uzatuv/protocol";
import { TestClient } from "./testClient";

const CONFIG = new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0x00, 0x1f, 0, 0, 0, 1, 0x68, 0xce]);
const KEYFRAME = new Uint8Array([0, 0, 0, 1, 0x65, 0xb8, 0x00, 0x04, 0x99, 0x11, 0x22, 0x33]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
async function waitUntil(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout kutishda: ${what}`);
    await sleep(25);
  }
}

async function run(): Promise<void> {
  const manager = new SessionManager();
  const { port, pairing } = await manager.start();
  const sessionKey = sessionKeyFromPairing(pairing);
  const serverId = pairing.serverId;

  const socks: net.Socket[] = [];
  const cleanup = (): void => {
    for (const s of socks) { try { s.destroy(); } catch { /* e'tiborsiz */ } }
    try { manager.stop(); } catch { /* e'tiborsiz */ }
  };

  let videoCount = 0;
  manager.onSession((session) => {
    session.onVideo(() => videoCount++);
  });

  const connect = (deviceId: string): net.Socket => {
    const sock = net.connect(port, "127.0.0.1", () => client.start());
    sock.on("error", () => { /* uzilish kutilgan bo'lishi mumkin */ });
    const client = new TestClient(sock, sessionKey, serverId, deviceId, (c) =>
      c.sendKeyframe(CONFIG, KEYFRAME),
    );
    socks.push(sock);
    return sock;
  };

  try {
    // 1) Birinchi ulanish (dev-X) — video oqadi, 1 sessiya.
    connect("dev-X");
    await waitUntil(() => videoCount >= 1, 5000, "birinchi ulanishdan video");
    assert.equal(manager.getSessions().length, 1, "birinchi ulanish: 1 sessiya");
    console.log("✔ birinchi ulanish: video oqdi, 1 sessiya: OK");

    // 2) Eski sessiya HALI TIRIK bo'lsa-da, bir xil deviceId bilan qayta ulanamiz.
    //    Server eskisini almashtirishi kerak (dublikat emas).
    const videoBefore = videoCount;
    connect("dev-X");
    await waitUntil(() => videoCount > videoBefore, 5000, "qayta ulanishdan video");
    await sleep(200); // holat o'rnashsin

    assert.equal(manager.getSessions().length, 1, "qayta ulanishdan keyin ham AYNAN 1 sessiya (dublikat yo'q)");
    console.log("✔ qayta ulanish: eski almashtirildi, 1 sessiya, yangi'dan video oqdi: OK");

    console.log("\n=== FAZA 4 reconnect reattachment: BARCHA TASDIQLAR O'TDI ===");
  } finally {
    cleanup();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("RECONNECT TESTI XATO:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
