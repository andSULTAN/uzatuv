/**
 * Electron main — ilova oynasi + TransportServer (SessionManager) + IPC ko'prik.
 * Butun tarmoq/crypto shu process'da; renderer faqat dekod + UI qiladi.
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { generateSessionKey } from "@uzatuv/protocol";
import { SessionManager } from "./SessionManager";
import type { Session, VideoChunk } from "./Session";
import { IPC } from "../shared/ipc";
import type { SessionView, VideoChunkIpc } from "../shared/ipc";

let mainWindow: BrowserWindow | null = null;
let manager: SessionManager;

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
  });
}

app.whenReady().then(async () => {
  createWindow();
  manager = new SessionManager(loadOrCreateIdentity());
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
