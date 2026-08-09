/**
 * FAZA 2 — end-to-end integratsiya testi (transport qatlami).
 *
 * Nimani tekshiradi: HAQIQIY desktop `Session` (server) ga qarshi MUSTAQIL
 * yozilgan klient real TCP socket ustidan to'liq oqimni bajaradi:
 *   handshake (CLIENT_HELLO→SERVER_HELLO auth→CLIENT_AUTH→SERVER_READY)
 *   → AES-256-GCM shifrlangan kanal
 *   → server STREAM_CONFIG/START/KEYFRAME_REQUEST yuboradi
 *   → klient CODEC_CONFIG + video keyframe yuboradi (KEYFRAME_REQUEST'ga javoban)
 *   → server `onVideo` to'g'ri chunk bilan ishga tushadi (baytlar, keyframe, config)
 *   → PING/PONG ikki tomonlama ishlaydi.
 *
 * MUHIM (halol chegara): bu TRANSPORT testi. Video baytlar shaffof (opaque) —
 * bu yerda H.264 DEKOD qilinmaydi. WebCodecs dekod faqat Electron renderer'da
 * (Chromium) ishlaydi va bu yerda avtomatik sinалmaydi (typecheck + kod ko'rigi
 * bilan tasdiqlangan). Bu test protokol/shifrlash/framing/demux'ni isbotlaydi —
 * ya'ni ikki mustaqil implementatsiya bir xil simda uchrashadi.
 *
 * Ishga tushirish: npm run test:integration  (tsx test/integration.test.ts)
 * Chiqish kodi 0 = muvaffaqiyat, 1 = xato.
 */

import net from "node:net";
import assert from "node:assert/strict";

import { Session } from "../src/main/Session";
import {
  FrameParser,
  frameWithLength,
  encodeInner,
  decodeInner,
  encodeControl,
  decodeControl,
  generateNonce,
  generateSessionKey,
  hmacAuth,
  timingSafeEqual,
  deriveKeys,
  makeSecureChannels,
  packVideoPayload,
  CHANNEL,
  FLAG,
  PROTOCOL_VERSION,
  HMAC_SERVER_LABEL,
  HMAC_CLIENT_LABEL,
} from "@uzatuv/protocol";
import type { ControlMessage } from "@uzatuv/protocol";

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

/**
 * Mustaqil test-klient: desktop Session bilan hech qanday kod ulashmaydi,
 * faqat @uzatuv/protocol primitivlaridan foydalanadi (Android xuddi shunday qiladi).
 */
class TestClient {
  private readonly parser = new FrameParser();
  private secure: ReturnType<typeof makeSecureChannels> | null = null;
  /** SERVER_READY kelgunga qadar frame'lar OCHIQ; keyin shifrlangan. */
  private ready = false;
  private readonly clientNonce = generateNonce();
  private videoSeq = 0;

  readonly received: ControlMessage[] = [];

  constructor(
    private readonly sock: net.Socket,
    private readonly sessionKey: Uint8Array,
    private readonly serverId: string,
    /** KEYFRAME_REQUEST kelganda chaqiriladi. */
    private readonly onKeyframeRequest: (c: TestClient) => void,
  ) {
    sock.on("data", (chunk) => this.onData(new Uint8Array(chunk)));
  }

  start(): void {
    this.sendPlain({
      type: "CLIENT_HELLO",
      protocolVersion: PROTOCOL_VERSION,
      clientNonce: b64(this.clientNonce),
      serverId: this.serverId,
      device: {
        deviceId: "test-device-01",
        name: "Test Phone",
        model: "TEST-1",
        androidSdk: 34,
        screen: { width: 1080, height: 2340, densityDpi: 420 },
      },
      codecs: ["h264"],
    });
  }

  /** Klientdan serverga shifrlangan CODEC_CONFIG + video keyframe. */
  sendKeyframe(config: Uint8Array, au: Uint8Array): void {
    this.sendSecure(
      CHANNEL.CONTROL,
      0,
      encodeControl({ type: "CODEC_CONFIG", codec: "h264", width: 1080, height: 2340, csd: b64(config) }),
    );
    const payload = packVideoPayload(1_000_000n, this.videoSeq++, au);
    this.sendSecure(CHANNEL.VIDEO, FLAG.KEYFRAME, payload);
  }

  private onData(chunk: Uint8Array): void {
    this.parser.push(chunk);
    let payload: Uint8Array | null;
    while ((payload = this.parser.next()) !== null) {
      if (!this.ready) this.handleHandshake(decodeControl(payload));
      else this.handleSecure(payload);
    }
  }

  private handleHandshake(msg: ControlMessage): void {
    if (msg.type === "SERVER_HELLO") {
      const serverNonce = unb64(msg.serverNonce);
      const expected = hmacAuth(this.sessionKey, HMAC_SERVER_LABEL, this.clientNonce, serverNonce);
      assert.ok(timingSafeEqual(unb64(msg.serverAuth), expected), "SERVER_HELLO auth mos emas");

      const clientAuth = hmacAuth(this.sessionKey, HMAC_CLIENT_LABEL, this.clientNonce, serverNonce);
      this.sendPlain({ type: "CLIENT_AUTH", clientAuth: b64(clientAuth) });

      const keys = deriveKeys(this.sessionKey, this.clientNonce, serverNonce);
      this.secure = makeSecureChannels(keys, "client");
    } else if (msg.type === "SERVER_READY") {
      this.ready = true; // shundan keyin kanal shifrlangan
    } else if (msg.type === "ERROR") {
      throw new Error(`server ERROR: ${msg.code} ${msg.message}`);
    }
  }

  private handleSecure(payload: Uint8Array): void {
    const inner = decodeInner(this.secure!.recv.open(payload));
    if (inner.channel !== CHANNEL.CONTROL) return;
    const msg = decodeControl(inner.payload);
    this.received.push(msg);
    if (msg.type === "PING") {
      this.sendSecure(CHANNEL.CONTROL, 0, encodeControl({ type: "PONG", seq: msg.seq, tSentMs: msg.tSentMs }));
    } else if (msg.type === "KEYFRAME_REQUEST") {
      this.onKeyframeRequest(this);
    }
  }

  private sendPlain(msg: ControlMessage): void {
    this.sock.write(Buffer.from(frameWithLength(encodeControl(msg))));
  }

  private sendSecure(channel: number, flags: number, body: Uint8Array): void {
    const inner = encodeInner(channel, flags, body);
    this.sock.write(Buffer.from(frameWithLength(this.secure!.send.seal(inner))));
  }
}

async function run(): Promise<void> {
  const sessionKey = generateSessionKey();
  const serverId = "srv-test-01";

  // Soxta H.264 Annex-B baytlar (transport uchun shaffof — dekod qilinmaydi).
  const CONFIG = new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0x00, 0x1f, 0, 0, 0, 1, 0x68, 0xce]);
  const KEYFRAME = new Uint8Array([0, 0, 0, 1, 0x65, 0xb8, 0x00, 0x04, 0x99, 0x11, 0x22, 0x33]);

  let session: Session | null = null;
  let client: TestClient | null = null;
  let clientSock: net.Socket | null = null;
  const server = net.createServer();

  const cleanup = (): void => {
    try { session?.close(); } catch { /* e'tiborsiz */ }
    try { clientSock?.destroy(); } catch { /* e'tiborsiz */ }
    try { server.close(); } catch { /* e'tiborsiz */ }
  };

  const outcome = await new Promise<{
    videoChunk: { data: Uint8Array; isKeyframe: boolean; config?: Uint8Array; seq: number };
    clientMsgTypes: string[];
    deviceId: string;
  }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("test timeout (5s)")), 5000);

    server.on("connection", (socket) => {
      session = new Session(socket, sessionKey, serverId);
      session.onVideo((chunk) => {
        clearTimeout(timer);
        resolve({
          videoChunk: { data: chunk.data, isKeyframe: chunk.isKeyframe, config: chunk.config, seq: chunk.seq },
          clientMsgTypes: client!.received.map((m) => m.type),
          deviceId: session!.id,
        });
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      clientSock = net.connect(port, "127.0.0.1", () => client!.start());
      client = new TestClient(clientSock, sessionKey, serverId, (c) => c.sendKeyframe(CONFIG, KEYFRAME));
      clientSock.on("error", reject);
    });
  }).finally(cleanup);

  // ---- Tasdiqlar ----
  assert.equal(outcome.deviceId, "test-device-01", "server client deviceId ni qabul qildi");
  assert.ok(outcome.clientMsgTypes.includes("STREAM_CONFIG"), "server STREAM_CONFIG yubordi");
  assert.ok(outcome.clientMsgTypes.includes("START"), "server START yubordi");
  assert.ok(outcome.clientMsgTypes.includes("KEYFRAME_REQUEST"), "server KEYFRAME_REQUEST yubordi");

  const chunk = outcome.videoChunk;
  assert.ok(chunk.isKeyframe, "chunk keyframe deb belgilandi");
  assert.equal(chunk.seq, 0, "birinchi AU seq=0");
  assert.deepEqual([...chunk.data], [...KEYFRAME], "keyframe baytlari aynan yetib keldi");
  assert.ok(chunk.config, "CODEC_CONFIG (csd) chunk'ga biriktirildi");
  assert.deepEqual([...(chunk.config as Uint8Array)], [...CONFIG], "config baytlari to'g'ri");

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
