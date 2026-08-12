/**
 * Preload — main ↔ renderer o'rtasidagi xavfsiz ko'prik (contextIsolation).
 * Renderer'ga faqat kerakli, cheklangan API ochiladi (nodeIntegration yo'q).
 */

import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import { IPC } from "../shared/ipc";
import type { PairingView, SessionView, VideoChunkIpc, TransmitChunkIpc, TransmitStartResult } from "../shared/ipc";
import type { UzatuvApi } from "../shared/api";
import type { ControlMessage, ConnState } from "@uzatuv/protocol";

const api: UzatuvApi = {
  getPairing: () => ipcRenderer.invoke(IPC.GET_PAIRING) as Promise<PairingView | null>,

  onPairing: (cb) => {
    const handler = (_e: IpcRendererEvent, p: PairingView | null): void => cb(p);
    ipcRenderer.on(IPC.PAIRING, handler);
    return () => ipcRenderer.removeListener(IPC.PAIRING, handler);
  },

  onSessions: (cb) => {
    const handler = (_e: IpcRendererEvent, list: SessionView[]): void => cb(list);
    ipcRenderer.on(IPC.SESSIONS, handler);
    return () => ipcRenderer.removeListener(IPC.SESSIONS, handler);
  },

  onVideo: (cb) => {
    const handler = (_e: IpcRendererEvent, chunk: VideoChunkIpc): void => cb(chunk);
    ipcRenderer.on(IPC.VIDEO, handler);
    return () => ipcRenderer.removeListener(IPC.VIDEO, handler);
  },

  requestKeyframe: (deviceId) => ipcRenderer.send(IPC.REQUEST_KEYFRAME, deviceId),
  setBitrate: (deviceId, kbps) => ipcRenderer.send(IPC.SET_BITRATE, deviceId, kbps),

  transmitStart: (uri) => ipcRenderer.invoke(IPC.TRANSMIT_START, uri) as Promise<TransmitStartResult>,
  transmitStop: () => ipcRenderer.send(IPC.TRANSMIT_STOP),
  transmitChunk: (chunk: TransmitChunkIpc) => ipcRenderer.send(IPC.TRANSMIT_CHUNK, chunk),

  onTransmitState: (cb) => {
    const handler = (_e: IpcRendererEvent, state: ConnState): void => cb(state);
    ipcRenderer.on(IPC.TRANSMIT_STATE, handler);
    return () => ipcRenderer.removeListener(IPC.TRANSMIT_STATE, handler);
  },

  onTransmitControl: (cb) => {
    const handler = (_e: IpcRendererEvent, msg: ControlMessage): void => cb(msg);
    ipcRenderer.on(IPC.TRANSMIT_CONTROL, handler);
    return () => ipcRenderer.removeListener(IPC.TRANSMIT_CONTROL, handler);
  },
};

contextBridge.exposeInMainWorld("uzatuv", api);
