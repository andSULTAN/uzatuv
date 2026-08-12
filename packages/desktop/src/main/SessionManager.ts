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

/** Bir vaqtda ulanadigan qurilmalar chegarasi (talab: 2–3). */
const MAX_DEVICES = 3;

/** Ulanish nuqtasi — WiFi yoki USB tethering interfeysi. */
export interface PairingEndpoint {
  kind: "wifi" | "usb";
  ip: string;
  uri: string;
}

export class SessionManager {
  private server: net.Server | null = null;
  private readonly sessions = new Map<string, Session>();
  private readonly sessionCbs: SessionCb[] = [];
  private readonly changeCbs: ChangeCb[] = [];

  private readonly sessionKey: Uint8Array;
  private readonly serverId: string;
  private readonly serverName = os.hostname() || "PC-Uzatuv";
  private readonly shortCode = randomDigits(9);
  private advertiser: Advertiser | null = null;

  /**
   * @param identity — doimiy saqlangan server identligi (serverId + sessionKey).
   *   Berilmasa yangi yaratiladi. Doimiy bo'lishi "qurilmani eslab qolish" uchun
   *   zarur: telefon saqlagan sessionKey PC qayta ishga tushganda ham mos kelsin.
   */
  constructor(identity?: { serverId?: string; sessionKey?: Uint8Array }) {
    this.serverId = identity?.serverId ?? randomUUID();
    this.sessionKey = identity?.sessionKey ?? generateSessionKey();
  }

  /** Doimiy saqlash uchun joriy identity (main process faylga yozadi). */
  getIdentity(): { serverId: string; sessionKey: Uint8Array } {
    return { serverId: this.serverId, sessionKey: this.sessionKey };
  }

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
      endpoints: this.endpoints(),
    };
  }

  /**
   * Barcha lokal IPv4 ulanish nuqtalari (WiFi + USB tethering), har biriga
   * alohida pairing URI. Telefon o'z tarmog'iga mos QR'ni skanlaydi.
   * USB tethering odatda PC ga 192.168.42.x/43.x manzil beradi.
   */
  private endpoints(): PairingEndpoint[] {
    const list: PairingEndpoint[] = [];
    const ifaces = os.networkInterfaces();
    for (const [name, infos] of Object.entries(ifaces)) {
      for (const info of infos ?? []) {
        if (info.family !== "IPv4" || info.internal) continue;
        const kind = classifyInterface(name, info.address);
        const uri = encodePairingUri({
          v: PROTOCOL_VERSION,
          ip: info.address,
          port: this.port,
          serverId: this.serverId,
          name: this.serverName,
          key: this.pairing?.key ?? "",
        });
        list.push({ kind, ip: info.address, uri });
      }
    }
    // WiFi avval, USB keyin.
    return list.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "wifi" ? -1 : 1));
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
    // Chegara: bir vaqtda ko'pi bilan MAX_DEVICES qurilma.
    if (this.sessions.size >= MAX_DEVICES) {
      console.warn(`[uzatuv] qurilmalar chegarasi (${MAX_DEVICES}) — yangi ulanish rad etildi`);
      socket.destroy();
      return;
    }
    const session = new Session(socket, this.sessionKey, this.serverId);

    session.onState((state) => {
      if (state === "READY" && session.id) {
        // Reconnect: shu deviceId'ning eski sessiyasi hali map'da bo'lsa,
        // yangisini o'rnatib (almashtirib), eskisini yopamiz. Tartib muhim —
        // avval map'ni yangilaymiz, keyin eskini yopamiz (eski onClose identity
        // tekshiruvi tufayli yangisini o'chirmaydi).
        const existing = this.sessions.get(session.id);
        if (existing !== session) {
          this.sessions.set(session.id, session);
          if (existing) existing.close(); // eski uzilishni toza yopamiz
          for (const cb of this.sessionCbs) cb(session);
        }
      }
      this.emitChange();
    });

    session.onClose(() => {
      // Faqat map'dagi AYNAN shu sessiya bo'lsa o'chiramiz — reconnect'da eski
      // sessiyaning close'i yangi sessiyani o'chirib yubormasligi uchun.
      if (session.id && this.sessions.get(session.id) === session) {
        this.sessions.delete(session.id);
      }
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

/**
 * Interfeys turini aniqlaydi. USB tethering (telefon modem) odatda PC ga
 * 192.168.42.x yoki 192.168.43.x manzil beradi; interfeys nomi ham ba'zan
 * "usb"/"rndis"/"ncm"/"tether" bo'ladi. Aks holda — WiFi/LAN deb hisoblanadi.
 */
function classifyInterface(name: string, ip: string): "wifi" | "usb" {
  const n = name.toLowerCase();
  if (/usb|rndis|ncm|tether/.test(n)) return "usb";
  if (/^192\.168\.(42|43)\./.test(ip)) return "usb";
  return "wifi";
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
