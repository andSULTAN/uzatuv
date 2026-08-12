/**
 * FAZA 4 — QA stress testi: yuqori kadr oqimi ostida transport barqarorligi.
 *
 * Bitta klient KETMA-KET ko'p (N) video AU yuboradi. Server hammasini:
 *   - to'g'ri TARTIBDA (seq 0..N-1, sakramasdan),
 *   - baytlari AYNAN,
 * qabul qilishini tekshiradi. Bu AEAD nonce-counter'ning yuzlab kadr davomida
 * ikki tomonda sinxron qolishini va framing'ning burst ostida to'g'riligini
 * isbotlaydi (real xavf sohasi).
 *
 * Ishga tushirish: npm run test:stress
 */

import net from "node:net";
import assert from "node:assert/strict";
import { Session } from "../src/main/Session";
import { generateSessionKey } from "@uzatuv/protocol";
import { TestClient } from "./testClient";

const N = 500; // yuboriladigan kadrlar soni
const CONFIG = new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0x00, 0x1f, 0, 0, 0, 1, 0x68, 0xce]);

/** Har kadr uchun aniqlanadigan (seq'ga bog'liq) bayt namunasi. */
function frameBytes(seq: number): Uint8Array {
  return new Uint8Array([0, 0, 0, 1, 0x61, seq & 0xff, (seq >> 8) & 0xff, 0x11, 0x22]);
}

async function run(): Promise<void> {
  const sessionKey = generateSessionKey();
  const serverId = "srv-stress-01";

  let session: Session | null = null;
  let clientSock: net.Socket | null = null;
  const server = net.createServer();
  const cleanup = (): void => {
    try { session?.close(); } catch { /* e'tiborsiz */ }
    try { clientSock?.destroy(); } catch { /* e'tiborsiz */ }
    try { server.close(); } catch { /* e'tiborsiz */ }
  };

  const result = await new Promise<{ seqs: number[]; bytesOk: boolean }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stress test timeout (10s)")), 10_000);
    const seqs: number[] = [];
    let bytesOk = true;
    let client: TestClient;

    server.on("connection", (socket) => {
      session = new Session(socket, sessionKey, serverId);
      session.onVideo((chunk) => {
        seqs.push(chunk.seq);
        // seq bo'yicha kutilgan baytlar bilan solishtiramiz (birinchi keyframe = seq 0).
        const expected = chunk.seq === 0 ? undefined : frameBytes(chunk.seq);
        if (expected && !bytesEqual(chunk.data, expected)) bytesOk = false;
        if (seqs.length >= N) {
          clearTimeout(timer);
          resolve({ seqs, bytesOk });
        }
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      clientSock = net.connect(port, "127.0.0.1", () => client.start());
      clientSock.on("error", reject);
      client = new TestClient(clientSock, sessionKey, serverId, "stress-dev", (c) => {
        // KEYFRAME_REQUEST kelgach: birinchi keyframe (config bilan), keyin N-1 delta burst.
        c.sendKeyframe(CONFIG, frameBytes(0));
        for (let i = 1; i < N; i++) c.sendVideoAu(frameBytes(i), false);
      });
    });
  }).finally(cleanup);

  // ---- Tasdiqlar ----
  assert.equal(result.seqs.length, N, `server aynan ${N} kadr oldi`);
  // Tartib: 0,1,2,...,N-1 — sakramasdan.
  for (let i = 0; i < N; i++) {
    assert.equal(result.seqs[i], i, `kadr ${i} to'g'ri tartibda (olindi: ${result.seqs[i]})`);
  }
  assert.ok(result.bytesOk, "har kadr baytlari aynan yetib keldi (AEAD/framing burst ostida to'g'ri)");

  console.log(`✔ ${N} kadr burst: hammasi to'g'ri tartibda (seq 0..${N - 1}): OK`);
  console.log("✔ AEAD nonce-counter sinxron, baytlar aynan: OK");
  console.log("\n=== FAZA 4 stress (burst) test: BARCHA TASDIQLAR O'TDI ===");
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("STRESS TESTI XATO:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
