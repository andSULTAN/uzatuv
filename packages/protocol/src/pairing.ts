/**
 * Pairing payload: QR / URI encode-decode + short numeric code helpers.
 * Spec: docs/PROTOCOL.md §2.1.
 */

import { PAIRING_URI_SCHEME, PROTOCOL_VERSION } from "./constants";

export interface PairingInfo {
  v: number;
  ip: string;
  port: number;
  serverId: string;
  name: string;
  /** base64url, 32-byte session key */
  key: string;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
function fromBase64Url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

/** Encode a PairingInfo into a `uzatuv://pair?...` URI (embed in a QR code). */
export function encodePairingUri(p: PairingInfo): string {
  const params = new URLSearchParams({
    v: String(p.v),
    ip: p.ip,
    port: String(p.port),
    id: p.serverId,
    name: p.name,
    key: p.key,
  });
  return `${PAIRING_URI_SCHEME}://pair?${params.toString()}`;
}

/** Parse a `uzatuv://pair?...` URI back into PairingInfo. Throws on malformed input. */
export function decodePairingUri(uri: string): PairingInfo {
  const prefix = `${PAIRING_URI_SCHEME}://pair?`;
  if (!uri.startsWith(prefix)) throw new Error("not a uzatuv pairing uri");
  const params = new URLSearchParams(uri.slice(prefix.length));
  const ip = params.get("ip");
  const port = params.get("port");
  const id = params.get("id");
  const key = params.get("key");
  if (!ip || !port || !id || !key) throw new Error("pairing uri missing fields");
  return {
    v: Number(params.get("v") ?? PROTOCOL_VERSION),
    ip,
    port: Number(port),
    serverId: id,
    name: params.get("name") ?? "",
    key,
  };
}

/** Build a PairingInfo from a raw 32-byte session key + connection details. */
export function makePairingInfo(args: {
  ip: string;
  port: number;
  serverId: string;
  name: string;
  sessionKey: Uint8Array;
}): PairingInfo {
  return {
    v: PROTOCOL_VERSION,
    ip: args.ip,
    port: args.port,
    serverId: args.serverId,
    name: args.name,
    key: toBase64Url(args.sessionKey),
  };
}

/** Extract the raw 32-byte session key from a PairingInfo. */
export function sessionKeyFromPairing(p: PairingInfo): Uint8Array {
  return fromBase64Url(p.key);
}

/**
 * Format a 9-digit short pairing code as `123-456-789` for display.
 * The digits map to a server-side lookup that returns the session key
 * over the local network (TTL-limited, see PROTOCOL §2.1 B).
 */
export function formatShortCode(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.replace(/(\d{3})(?=\d)/g, "$1-");
}

export { toBase64Url, fromBase64Url };
