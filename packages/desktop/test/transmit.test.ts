/**
 * UZATISH rejimi — desktop uzatuvchi (ClientSession) ↔ desktop qabul qiluvchi
 * (SessionManager) loopback testi.
 *
 * Isbotlaydi: desktop HAM uzata (ClientSession), HAM qabul qila (SessionManager)
 * oladi — bir xil wire-protokolда. Handshake (klient tomonidan) → AES-256-GCM →
 * qabul qiluvchi KEYFRAME_REQUEST → uzatuvchi video keyframe → qabul qiluvchi
 * onVideo (baytlar aynan).
 *
 * Ishga tushirish: npm run test:transmit
 */

import net from "node:net";
import assert from "node:assert/strict";
import { SessionManager } from "../src/main/SessionManager";
import { ClientSession } from "../src/main/ClientSession";
import { sessionKeyFromPairing } from "@uzatuv/protocol";

const KEYFRAME = new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0, 0, 0, 1, 0x65, 0xb8, 0x11, 0x22]);

async function run(): Promise<void> {
  const receiver = new SessionManager();
  const { port, pairing } = await receiver.start();
  const sessionKey = sessionKeyFromPairing(pairing);

  let client: ClientSession | null = null;
  const cleanup = (): void => {
    try { client?.disconnect(); } catch { /* e'tiborsiz */ }
    try { receiver.stop(); } catch { /* e'tiborsiz */ }
  };

  const outcome = await new Promise<{ data: Uint8Array; isKeyframe: boolean; deviceId: string }>(
    (resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("transmit test timeout (5s)")), 5000);

      // Qabul qiluvchi (server) sessiyani oladi va video kadrni kutadi.
      receiver.onSession((session) => {
        session.onVideo((chunk) => {
          clearTimeout(timer);
          resolve({ data: chunk.data, isKeyframe: chunk.isKeyframe, deviceId: session.id });
        });
      });

      // Uzatuvchi (klient) — bu PC boshqa qabul qiluvchiga ulanadi.
      client = new ClientSession(
        { ip: "127.0.0.1", port, serverId: pairing.serverId, sessionKey },
        {
          deviceId: "desktop-transmitter",
          name: "Noutbuk",
          model: "PC",
          screen: { width: 1920, height: 1080, densityDpi: 96 },
        },
        ["h264"],
      );
      // Qabul qiluvchi KEYFRAME_REQUEST yuborganда — keyframe uzatamiz (real oqim kabi).
      client.onControl((m) => {
        if (m.type === "KEYFRAME_REQUEST") {
          client!.sendVideo({ data: KEYFRAME, ptsUs: 1_000_000n, isKeyframe: true });
        }
      });
      client.connect();
    },
  ).finally(cleanup);

  assert.equal(outcome.deviceId, "desktop-transmitter", "qabul qiluvchi uzatuvchi deviceId ni oldi");
  assert.ok(outcome.isKeyframe, "kadr keyframe deb belgilandi");
  assert.deepEqual([...outcome.data], [...KEYFRAME], "keyframe baytlari aynan yetib keldi");

  console.log("✔ desktop uzatuvchi (ClientSession) → qabul qiluvchi (SessionManager): OK");
  console.log("✔ handshake (klient) + AES-256-GCM + video keyframe aynan yetib keldi: OK");
  console.log("\n=== UZATISH rejimi loopback: BARCHA TASDIQLAR O'TDI ===");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("UZATISH TESTI XATO:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
