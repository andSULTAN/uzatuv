/**
 * Round-trip tests for the protocol primitives.
 * Run: npm run build && npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  encodeFrame,
  FrameParser,
  encodeInner,
  decodeInner,
} from "./framing";
import {
  generateSessionKey,
  generateNonce,
  hmacAuth,
  timingSafeEqual,
  deriveKeys,
  makeSecureChannels,
} from "./crypto";
import {
  makePairingInfo,
  encodePairingUri,
  decodePairingUri,
  sessionKeyFromPairing,
  formatShortCode,
} from "./pairing";
import { packVideoPayload, unpackVideoPayload } from "./video";
import { packAudioPayload, unpackAudioPayload } from "./audio";
import { encodeControl, decodeControl } from "./messages";
import { CHANNEL, FLAG, HMAC_SERVER_LABEL, HMAC_CLIENT_LABEL } from "./constants";

test("framing: single frame round-trip", () => {
  const payload = new Uint8Array([1, 2, 3, 4, 5]);
  const frame = encodeFrame(CHANNEL.VIDEO, FLAG.KEYFRAME, payload);
  const parser = new FrameParser();
  parser.push(frame);
  const body = parser.next();
  assert.ok(body);
  const inner = decodeInner(body!);
  assert.equal(inner.channel, CHANNEL.VIDEO);
  assert.equal(inner.flags, FLAG.KEYFRAME);
  assert.deepEqual([...inner.payload], [1, 2, 3, 4, 5]);
  assert.equal(parser.next(), null);
});

test("framing: split across chunks and multiple frames", () => {
  const f1 = encodeFrame(CHANNEL.CONTROL, 0, new Uint8Array([9]));
  const f2 = encodeFrame(CHANNEL.VIDEO, 0, new Uint8Array([7, 7, 7]));
  const joined = new Uint8Array(f1.length + f2.length);
  joined.set(f1, 0);
  joined.set(f2, f1.length);

  const parser = new FrameParser();
  // Feed byte-by-byte to stress the streaming parser.
  for (const b of joined) parser.push(new Uint8Array([b]));

  const b1 = parser.next();
  const b2 = parser.next();
  assert.ok(b1 && b2);
  assert.equal(decodeInner(b1!).channel, CHANNEL.CONTROL);
  assert.deepEqual([...decodeInner(b2!).payload], [7, 7, 7]);
});

test("crypto: HMAC handshake auth matches on both sides", () => {
  const sk = generateSessionKey();
  const cn = generateNonce();
  const sn = generateNonce();
  const serverAuth = hmacAuth(sk, HMAC_SERVER_LABEL, cn, sn);
  const clientAuth = hmacAuth(sk, HMAC_CLIENT_LABEL, cn, sn);
  // Recomputed independently → equal.
  assert.ok(timingSafeEqual(serverAuth, hmacAuth(sk, HMAC_SERVER_LABEL, cn, sn)));
  assert.ok(timingSafeEqual(clientAuth, hmacAuth(sk, HMAC_CLIENT_LABEL, cn, sn)));
  // Wrong key → mismatch.
  assert.ok(!timingSafeEqual(serverAuth, hmacAuth(generateSessionKey(), HMAC_SERVER_LABEL, cn, sn)));
});

test("crypto: AEAD channel client<->server round-trip", () => {
  const sk = generateSessionKey();
  const cn = generateNonce();
  const sn = generateNonce();
  const keys = deriveKeys(sk, cn, sn);
  const server = makeSecureChannels(keys, "server");
  const client = makeSecureChannels(keys, "client");

  // client sends -> server receives
  const msg = new TextEncoder().encode("salom, ekran!");
  const sealed = client.send.seal(msg);
  const opened = server.recv.open(sealed);
  assert.deepEqual([...opened], [...msg]);

  // server sends -> client receives (second frame, counter=1)
  const msg2 = new TextEncoder().encode("keyframe kerak");
  const sealed2 = server.send.seal(msg2);
  const opened2 = client.recv.open(sealed2);
  assert.deepEqual([...opened2], [...msg2]);
});

test("crypto: tampered ciphertext fails auth", () => {
  const sk = generateSessionKey();
  const cn = generateNonce();
  const sn = generateNonce();
  const keys = deriveKeys(sk, cn, sn);
  const client = makeSecureChannels(keys, "client");
  const server = makeSecureChannels(keys, "server");
  const sealed = client.send.seal(new Uint8Array([1, 2, 3]));
  sealed[0] = (sealed[0]! ^ 0xff) & 0xff; // tamper
  assert.throws(() => server.recv.open(sealed));
});

test("pairing: URI round-trip preserves session key", () => {
  const sk = generateSessionKey();
  const info = makePairingInfo({
    ip: "192.168.1.15",
    port: 8787,
    serverId: "abc-123",
    name: "PC-Home",
    sessionKey: sk,
  });
  const uri = encodePairingUri(info);
  const parsed = decodePairingUri(uri);
  assert.equal(parsed.ip, "192.168.1.15");
  assert.equal(parsed.port, 8787);
  assert.deepEqual([...sessionKeyFromPairing(parsed)], [...sk]);
});

test("pairing: short code formatting", () => {
  assert.equal(formatShortCode("123456789"), "123-456-789");
  assert.equal(formatShortCode("12 34 56"), "123-456");
});

test("video: payload header round-trip", () => {
  const au = new Uint8Array([0, 0, 0, 1, 0x65, 0x88]);
  const packed = packVideoPayload(1234567890123n, 42, au);
  const { ptsUs, seq, au: out } = unpackVideoPayload(packed);
  assert.equal(ptsUs, 1234567890123n);
  assert.equal(seq, 42);
  assert.deepEqual([...out], [...au]);
});

test("audio: payload header round-trip", () => {
  const data = new Uint8Array([0xfc, 0x01, 0x02, 0x03]);
  const packed = packAudioPayload(987654321n, data);
  const { ptsUs, data: out } = unpackAudioPayload(packed);
  assert.equal(ptsUs, 987654321n);
  assert.deepEqual([...out], [...data]);
});

test("messages: control encode/decode round-trip", () => {
  const enc = encodeControl({ type: "SET_BITRATE", bitrateKbps: 4000 });
  const dec = decodeControl(enc);
  assert.equal(dec.type, "SET_BITRATE");
  assert.equal((dec as { bitrateKbps: number }).bitrateKbps, 4000);
});
