/**
 * Electron main — ilova oynasi + TransportServer (SessionManager) + IPC ko'prik.
 * Butun tarmoq/crypto shu process'da; renderer faqat dekod + UI qiladi.
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { generateSessionKey, decodePairingUri, sessionKeyFromPairing } from "@uzatuv/protocol";
import { SessionManager } from "./SessionManager";
import type { Session, VideoChunk, AudioChunk } from "./Session";
import { ClientSession } from "./ClientSession";
import { IPC } from "../shared/ipc";
import type {
  SessionView,
  VideoChunkIpc,
  TransmitChunkIpc,
  TransmitStartResult,
  AudioChunkIpc,
  AudioConfigIpc,
  TransmitAudioIpc,
} from "../shared/ipc";

let transmitClient: ClientSession | null = null;
let serverIdentity: { serverId: string; sessionKey: Uint8Array } | null = null;

let mainWindow: BrowserWindow | null = null;
let manager: SessionManager;

// MUHIM: oyna fokusda bo'lmasa yoki minimallashsa, Chromium renderer'ni
// sekinlashtiradi/to'xtatadi — natijada ekran uzatish qotib qoladi (oxirgi
// kadrda). Bu switch'lar throttling'ni butunlay o'chiradi (app ready'дан oldin
// o'rnatilishi shart). Encode uzatish davomida uzluksiz ishlashi uchun.
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

/**
 * Server identligini (serverId + sessionKey) userData faylidan o'qiydi yoki
 * yangi yaratib saqlaydi. Doimiy bo'lishi "qurilmani eslab qolish" uchun zarur:
 * telefon saqlagan sessionKey PC qayta ishga tushganda ham amal qilsin.
 */
function loadOrCreateIdentity(): { serverId: string; sessionKey: Uint8Array } {
  const file = join(app.getPath("userData"), "uzatuv-identity.json");
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as { serverId?: string; sessionKey?: string };
      if (j.serverId && j.sessionKey) {
        return { serverId: j.serverId, sessionKey: new Uint8Array(Buffer.from(j.sessionKey, "base64")) };
      }
    }
  } catch (err) {
    console.warn(`[uzatuv] identity o'qilmadi: ${(err as Error).message}`);
  }
  const identity = { serverId: randomUUID(), sessionKey: generateSessionKey() };
  try {
    writeFileSync(
      file,
      JSON.stringify({
        serverId: identity.serverId,
        sessionKey: Buffer.from(identity.sessionKey).toString("base64"),
      }),
    );
  } catch (err) {
    console.warn(`[uzatuv] identity saqlanmadi: ${(err as Error).message}`);
  }
  return identity;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0b0f1a",
    autoHideMenuBar: true,
    title: "Uzatuv",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false, // preload'da Node kerak (contextBridge orqali cheklangan API)
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // fon rejimida encode to'xtamasin
      autoplayPolicy: "no-user-gesture-required", // qabul qilingan ovoz avto chalinsin
    },
  });

  // electron-vite: dev'da HMR server URL, prod'da build qilingan HTML.
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function sessionView(s: Session): SessionView | null {
  if (!s.device) return null;
  return {
    id: s.id,
    device: s.device,
    state: s.state,
    codec: s.codec,
    rttMs: s.rttMs,
  };
}

function pushSessions(): void {
  if (!mainWindow) return;
  const views = manager
    .getSessions()
    .map(sessionView)
    .filter((v): v is SessionView => v !== null);
  mainWindow.webContents.send(IPC.SESSIONS, views);
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function forwardVideo(deviceId: string, chunk: VideoChunk): void {
  if (!mainWindow) return;
  const payload: VideoChunkIpc = {
    deviceId,
    ptsUs: chunk.ptsUs.toString(),
    seq: chunk.seq,
    isKeyframe: chunk.isKeyframe,
    codec: chunk.codec,
    config: chunk.config ? toArrayBuffer(chunk.config) : null,
    data: toArrayBuffer(chunk.data),
  };
  mainWindow.webContents.send(IPC.VIDEO, payload);
}

function forwardAudio(deviceId: string, chunk: AudioChunk): void {
  if (!mainWindow) return;
  const payload: AudioChunkIpc = {
    deviceId,
    ptsUs: chunk.ptsUs.toString(),
    data: toArrayBuffer(chunk.data),
  };
  mainWindow.webContents.send(IPC.AUDIO, payload);
}

function wireIpc(): void {
  ipcMain.handle(IPC.GET_PAIRING, () => manager.pairingView());

  ipcMain.on(IPC.REQUEST_KEYFRAME, (_e, id: string) => {
    manager.getSession(id)?.requestKeyframe();
  });
  ipcMain.on(IPC.SET_BITRATE, (_e, id: string, kbps: number) => {
    manager.getSession(id)?.setBitrate(kbps);
  });

  manager.onChange(() => pushSessions());
  manager.onSession((session) => {
    session.onVideo((chunk) => forwardVideo(session.id, chunk));
    session.onAudio((chunk) => forwardAudio(session.id, chunk));
    session.onControl((m) => {
      if (m.type === "AUDIO_CONFIG" && mainWindow) {
        const cfg: AudioConfigIpc = { deviceId: session.id, sampleRate: m.sampleRate, channels: m.channels };
        mainWindow.webContents.send(IPC.AUDIO_CONFIG, cfg);
      }
    });
  });

  // ---- UZATISH rejimi ----
  ipcMain.handle(IPC.TRANSMIT_START, (_e, uri: string): TransmitStartResult => {
    try {
      const pairing = decodePairingUri(uri);
      const target = {
        ip: pairing.ip,
        port: pairing.port,
        serverId: pairing.serverId,
        sessionKey: sessionKeyFromPairing(pairing),
      };
      transmitClient?.disconnect();
      const client = new ClientSession(target, {
        deviceId: serverIdentity?.serverId ?? "desktop",
        name: hostname() || "PC",
        model: "PC",
        screen: { width: 1920, height: 1080, densityDpi: 96 },
      });
      client.onState((state) => mainWindow?.webContents.send(IPC.TRANSMIT_STATE, state));
      client.onControl((msg) => mainWindow?.webContents.send(IPC.TRANSMIT_CONTROL, msg));
      transmitClient = client;
      client.connect();
      return { ok: true, name: pairing.name };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.on(IPC.TRANSMIT_CHUNK, (_e, chunk: TransmitChunkIpc) => {
    transmitClient?.sendVideo({
      data: new Uint8Array(chunk.data),
      ptsUs: BigInt(chunk.ptsUs),
      isKeyframe: chunk.isKeyframe,
    });
  });

  ipcMain.on(IPC.TRANSMIT_STOP, () => {
    transmitClient?.disconnect();
    transmitClient = null;
  });

  ipcMain.on(IPC.TRANSMIT_AUDIO_CONFIG, (_e, sampleRate: number, channels: number) => {
    transmitClient?.sendAudioConfig(sampleRate, channels);
  });
  ipcMain.on(IPC.TRANSMIT_AUDIO, (_e, chunk: TransmitAudioIpc) => {
    transmitClient?.sendAudio(BigInt(chunk.ptsUs), new Uint8Array(chunk.data));
  });
}

app.whenReady().then(async () => {
  createWindow();
  serverIdentity = loadOrCreateIdentity();
  manager = new SessionManager(serverIdentity);
  wireIpc();

  try {
    const { port, pairing } = await manager.start();
    console.log(`[uzatuv] server tinglayapti: ${pairing.ip}:${port}`);
    // Renderer tayyor bo'lgach pairing'ni yuboramiz.
    mainWindow?.webContents.on("did-finish-load", () => {
      mainWindow?.webContents.send(IPC.PAIRING, manager.pairingView());
      pushSessions();
    });
  } catch (err) {
    console.error(`[uzatuv] server ishga tushmadi: ${(err as Error).message}`);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  manager?.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => manager?.stop());
