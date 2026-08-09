/**
 * SessionManager — TransportServer. TCP tinglaydi, har ulanishga Session ochadi,
 * mDNS orqali e'lon qiladi, QR uchun pairing ma'lumotini beradi.
 * Spec: docs/ARCHITECTURE.md §5, docs/PROTOCOL.md §1, §2.1, §2.2.
 *
 * FAZA 1 soddalashtirish: server ishga tushganda BITTA pairing `sessionKey`
 * yaratadi va QR'da ko'rsatadi; ulangan qurilmalar shu kalit bilan
 * autentifikatsiya qiladi. (Har-sessiya alohida kalit — keyingi faza.)
 */

import net from "node:net";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_PORT,
  MDNS_SERVICE_TYPE,
  PROTOCOL_VERSION,
  generateSessionKey,
  makePairingInfo,
  encodePairingUri,
  formatShortCode,
} from "@uzatuv/protocol";
import type { PairingInfo } from "@uzatuv/protocol";
import { Session } from "./Session";
import type { PairingView } from "../shared/ipc";

type SessionCb = (s: Session) => void;
type ChangeCb = () => void;

interface Advertiser {
  stop(): void;
}

export class SessionManager {
  private server: net.Server | null = null;
  private readonly sessions = new Map<string, Session>();
  private readonly sessionCbs: SessionCb[] = [];
  private readonly changeCbs: ChangeCb[] = [];

  private sessionKey = generateSessionKey();
  private readonly serverId = randomUUID();
  private readonly serverName = os.hostname() || "PC-Uzatuv";
  private readonly shortCode = randomDigits(9);
  private advertiser: Advertiser | null = null;

  private port = DEFAULT_PORT;
  private pairing: PairingInfo | null = null;

  /** Serverni ishga tushiradi. Band port bo'lsa keyingi bo'shini tanlaydi. */
  async start(preferredPort = DEFAULT_PORT): Promise<{ port: number; pairing: PairingInfo }> {
    this.port = await this.listen(preferredPort);
    this.pairing = makePairingInfo({
      ip: getLocalIp(),
      port: this.port,
      serverId: this.serverId,
      name: this.serverName,
      sessionKey: this.sessionKey,
    });
    this.advertise();
    return { port: this.port, pairing: this.pairing };
  }

  onSession(cb: SessionCb): void {
    this.sessionCbs.push(cb);
  }
  /** Sessiyalar ro'yxati/holati o'zgarganda (UI yangilash uchun). */
  onChange(cb: ChangeCb): void {
    this.changeCbs.push(cb);
  }

  getSessions(): Session[] {
    return [...this.sessions.values()];
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  pairingView(): PairingView | null {
    if (!this.pairing) return null;
    return {
      uri: encodePairingUri(this.pairing),
      ip: this.pairing.ip,
      port: this.pairing.port,
      serverId: this.pairing.serverId,
      name: this.pairing.name,
      shortCode: formatShortCode(this.shortCode),
    };
  }

  stop(): void {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
    this.advertiser?.stop();
    this.advertiser = null;
    this.server?.close();
    this.server = null;
  }

  // ---- Ichki ----

  private listen(startPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.onConnection(socket));
      this.server = server;
      let tries = 0;

      const tryPort = (p: number): void => {
        server.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE" && tries < 20) {
            tries += 1;
            tryPort(p + 1);
          } else {
            reject(err);
          }
        });
        server.listen(p, () => resolve(p));
      };
      tryPort(startPort);
    });
  }

  private onConnection(socket: net.Socket): void {
    const session = new Session(socket, this.sessionKey, this.serverId);

    session.onState((state) => {
      if (state === "READY" && session.id && !this.sessions.has(session.id)) {
        this.sessions.set(session.id, session);
        for (const cb of this.sessionCbs) cb(session);
      }
      this.emitChange();
    });

    session.onClose(() => {
      if (session.id) this.sessions.delete(session.id);
      this.emitChange();
    });
  }

  private emitChange(): void {
    for (const cb of this.changeCbs) cb();
  }

  private advertise(): void {
    // mDNS e'loni — ixtiyoriy. bonjour-service topilmasa yoki xato bersa,
    // QR/qisqa kod baribir ishlaydi (faqat avtomatik topish o'chadi).
    try {
      // Dinamik import: paket bo'lmasa butun ilova yiqilmasin.

      const { Bonjour } = require("bonjour-service") as typeof import("bonjour-service");
      const instance = new Bonjour();
      const service = instance.publish({
        name: this.serverName,
        type: MDNS_SERVICE_TYPE.replace(/^_/, "").replace(/\._tcp$/, ""),
        protocol: "tcp",
        port: this.port,
        txt: { v: String(PROTOCOL_VERSION), id: this.serverId, name: this.serverName },
      });
      this.advertiser = {
        stop: () => {
          try {
            service.stop?.(() => undefined);
            instance.destroy();
          } catch {
            /* e'tiborsiz */
          }
        },
      };
    } catch (err) {
      console.warn(`[uzatuv] mDNS e'lon qilinmadi: ${(err as Error).message}`);
      // TODO: mDNS ishlamasa qo'lda IP kiritish yo'li (UI'da IP ko'rsatilgan).
    }
  }
}

/** Birinchi ichki bo'lmagan IPv4 manzil (LAN IP). */
function getLocalIp(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "127.0.0.1";
}

function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}
