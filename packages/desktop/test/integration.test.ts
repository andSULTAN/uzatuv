/**
 * FAZA 2 — end-to-end integratsiya testi (transport qatlami).
 *
 * Mustaqil TestClient (Android o'rnida) HAQIQIY desktop `Session` (server) bilan
 * real TCP ustidan to'liq oqim: handshake → AES-256-GCM → server
 * STREAM_CONFIG/START/KEYFRAME_REQUEST → klient CODEC_CONFIG + video keyframe →
 * server `onVideo` (baytlar+config aynan). PING/PONG ikki tomonlama.
 *
 * MUHIM (halol chegara): bu TRANSPORT testi — video baytlar shaffof, H.264
 * DEKOD qilinmaydi (WebCodecs faqat Electron/Chromium renderer'da). Bu test
 * protokol/shifrlash/framing/demux'ni isbotlaydi.
 *
 * Ishga tushirish: npm run test:integration  (chiqish 0 = OK, 1 = xato).
 */

import net from "node:net";
import assert from "node:assert/strict";
import { Session } from "../src/main/Session";
import { generateSessionKey } from "@uzatuv/protocol";
import { TestClient } from "./testClient";

async function run(): Promise<void> {
  const sessionKey = generateSessionKey();
  const serverId = "srv-test-01";
  const CONFIG = new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0x00, 0x1f, 0, 0, 0, 1, 0x68, 0xce]);
  const KEYFRAME = new Uint8Array([0, 0, 0, 1, 0x65, 0xb8, 0x00, 0x04, 0x99, 0x11, 0x22, 0x33]);

  let session: Session | null = null;
  let clientSock: net.Socket | null = null;
  const server = net.createServer();

  const cleanup = (): void => {
    try { session?.close(); } catch { /* e'tiborsiz */ }
    try { clientSock?.destroy(); } catch { /* e'tiborsiz */ }
    try { server.close(); } catch { /* e'tiborsiz */ }
  };

  const outcome = await new Promise<{
    chunk: { data: Uint8Array; isKeyframe: boolean; config?: Uint8Array; seq: number };
    clientMsgTypes: string[];
    deviceId: string;
  }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("test timeout (5s)")), 5000);
    let client: TestClient;

    server.on("connection", (socket) => {
      session = new Session(socket, sessionKey, serverId);
      session.onVideo((c) => {
        clearTimeout(timer);
        resolve({
          chunk: { data: c.data, isKeyframe: c.isKeyframe, config: c.config, seq: c.seq },
          clientMsgTypes: client.received.map((m) => m.type),
          deviceId: session!.id,
        });
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      clientSock = net.connect(port, "127.0.0.1", () => client.start());
      client = new TestClient(clientSock, sessionKey, serverId, "test-device-01", (c) =>
        c.sendKeyframe(CONFIG, KEYFRAME),
      );
      clientSock.on("error", reject);
    });
  }).finally(cleanup);

  assert.equal(outcome.deviceId, "test-device-01", "server client deviceId ni qabul qildi");
  assert.ok(outcome.clientMsgTypes.includes("STREAM_CONFIG"), "server STREAM_CONFIG yubordi");
  assert.ok(outcome.clientMsgTypes.includes("START"), "server START yubordi");
  assert.ok(outcome.clientMsgTypes.includes("KEYFRAME_REQUEST"), "server KEYFRAME_REQUEST yubordi");
  assert.ok(outcome.chunk.isKeyframe, "chunk keyframe deb belgilandi");
  assert.equal(outcome.chunk.seq, 0, "birinchi AU seq=0");
  assert.deepEqual([...outcome.chunk.data], [...KEYFRAME], "keyframe baytlari aynan yetib keldi");
  assert.ok(outcome.chunk.config, "CODEC_CONFIG (csd) chunk'ga biriktirildi");
  assert.deepEqual([...(outcome.chunk.config as Uint8Array)], [...CONFIG], "config baytlari to'g'ri");

  console.log("✔ handshake + AES-256-GCM shifrlash: OK");
  console.log("✔ server → STREAM_CONFIG / START / KEYFRAME_REQUEST: OK");
  console.log("✔ klient → CODEC_CONFIG + video keyframe: OK");
  console.log("✔ server onVideo: keyframe baytlari + config aynan yetib keldi: OK");
  console.log("\n=== FAZA 2 transport end-to-end: BARCHA TASDIQLAR O'TDI ===");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("INTEGRATSIYA TESTI XATO:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
