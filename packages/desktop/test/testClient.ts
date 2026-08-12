/**
 * TestClient — mustaqil test-klient (Android o'rnida). Desktop `Session` bilan
 * hech qanday kod ulashmaydi; faqat `@uzatuv/protocol` primitivlaridan foydalanadi.
 * Integratsiya testlari (bitta va ko'p qurilma) shundan foydalanadi.
 */

import net from "node:net";
import assert from "node:assert/strict";
import {
  FrameParser,
  frameWithLength,
  encodeInner,
  decodeInner,
  encodeControl,
  decodeControl,
  generateNonce,
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

const b64 = (b: Uint8Array): string => Buffer.from(b).toString("base64");
const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"));

export class TestClient {
  private readonly parser = new FrameParser();
  private secure: ReturnType<typeof makeSecureChannels> | null = null;
  private ready = false;
  private readonly clientNonce = generateNonce();
  private videoSeq = 0;

  readonly received: ControlMessage[] = [];

  constructor(
    private readonly sock: net.Socket,
    private readonly sessionKey: Uint8Array,
    private readonly serverId: string,
    private readonly deviceId: string,
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
        deviceId: this.deviceId,
        name: `Test ${this.deviceId}`,
        model: "TEST-1",
        androidSdk: 34,
        screen: { width: 1080, height: 2340, densityDpi: 420 },
      },
      codecs: ["h264"],
    });
  }

  sendKeyframe(config: Uint8Array, au: Uint8Array): void {
    this.sendSecure(
      CHANNEL.CONTROL,
      0,
      encodeControl({ type: "CODEC_CONFIG", codec: "h264", width: 1080, height: 2340, csd: b64(config) }),
    );
    this.sendSecure(CHANNEL.VIDEO, FLAG.KEYFRAME, packVideoPayload(1_000_000n, this.videoSeq++, au));
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
      this.ready = true;
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

export { b64, unb64 };
