# Uzatuv — Arxitektura va Modul Kontraktlari

> **Holat:** 🧊 MUZLATILGAN. Interfeyslar bir marta kelishiladi, keyin har agent shularga qarshi ishlaydi.
> O'zgartirish faqat PM orqali + [`PROTOCOL.md`](PROTOCOL.md) bilan sinxron.

Maqsad: har agent (Android / Transport / Desktop / UI) **boshqasini kutmasdan**, kelishilgan
interfeyslarga qarshi parallel ishlashi. "Kontrakt" = modul chegarasidagi turlar va funksiyalar.

---

## 1. Umumiy oqim (end-to-end)

```
┌─────────────────────────── ANDROID (Client) ───────────────────────────┐
│ ScreenCapture        Encoder            TransportClient                  │
│ MediaProjection ──▶  MediaCodec  ──▶   (TCP + AEAD + framing)            │
│  VirtualDisplay      (H.264/265)        Control kanali ◀──▶              │
│      ▲ Surface           │ AU               │                            │
│  Orientation/resize      └── CodecConfig ───┘                            │
└─────────────────────────────────┬───────────────────────────────────────┘
                                   │  TCP (WiFi yoki USB tethering)
                                   ▼
┌─────────────────────────── DESKTOP (Server, Electron) ──────────────────┐
│ TransportServer       Decoder             Renderer            UI (React) │
│ (TCP listen, mDNS, ─▶ WebCodecs      ─▶   Canvas/WebGL   ─▶  Grid /      │
│  AEAD, multiplex)     VideoDecoder        jitter buffer      Fullscreen  │
│      │ control ◀──────────┘                                  o'zbekcha   │
│  SessionManager (2–3 sessiya)                                            │
└──────────────────────────────────────────────────────────────────────── ┘
```

- **Yagona haqiqat manbai** — [`packages/protocol`](../packages/protocol). Barcha turlar/konstantalar shu yerdan
  import qilinadi (Desktop TS'da import, Android Kotlin `kotlin/` mirror'dan). **Nusxa ko'chirilmaydi.**

---

## 2. Paketlar va egalik

| Paket | Egasi (agent) | Til | Mas'uliyat |
|---|---|---|---|
| `packages/protocol` | **PM** | TypeScript (+ Kotlin mirror) | Turlar, framing, crypto, pairing. Muzlatilgan. |
| `packages/android` | **Android muhandisi** | Kotlin | Capture, encode, orientation, transport **client** |
| `packages/desktop` | **Desktop muhandisi** | TS/React/Electron | Transport **server**, decode, render, grid/fullscreen, build |
| (transport qatlami) | **Transport muhandisi** | Kotlin + TS | Discovery, pairing, framing, crypto, multiplex — **har ikki** paketda |
| (UI ekranlari) | **UI/UX** | Kotlin Compose + React/Tailwind | O'zbekcha responsive ekranlar |
| (testlar) | **QA** | — | Benchmark, stress, reconnect, bug ovi |

> **Chegara qoidasi:** har agent faqat o'z paketiga yozadi. Transport va UI "kesib o'tuvchi" —
> ular ikki paketda ishlaydi, lekin PM kelishgan interfeyslar orqali (pastda).

---

## 3. `packages/protocol` — umumiy kontrakt (TypeScript)

Eksport qilinadigan asosiy yuzalar (implementatsiya shu paketda):

```typescript
// constants.ts
export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 8787;
export const MDNS_SERVICE_TYPE = "_uzatuv._tcp";
export const MAX_FRAME_LEN = 16 * 1024 * 1024;
export const CHANNEL = { CONTROL: 0, VIDEO: 1, AUDIO: 2 } as const;
export const FLAG = { KEYFRAME: 0x01, CONFIG: 0x02, END_OF_STREAM: 0x04 } as const;
// ... (PROTOCOL.md 7-bo'lim)

// messages.ts — barcha CONTROL xabar tiplari (discriminated union)
export type ControlMessage =
  | ClientHello | ServerHello | ClientAuth | ServerReady
  | StreamConfig | CodecConfig | Start | Stop
  | KeyframeRequest | SetBitrate | Resize | Ping | Pong | Stats
  | Disconnect | ErrorMsg;

// framing.ts — length-prefixed frame encode/decode (+ streaming parser)
export function encodeFrame(channel: number, flags: number, payload: Uint8Array): Uint8Array;
export class FrameParser {                 // TCP oqimidan frame'larni ajratadi
  push(chunk: Uint8Array): void;
  next(): { channel: number; flags: number; payload: Uint8Array } | null;
}

// crypto.ts — handshake HMAC + HKDF + AEAD (AES-256-GCM)
export function hmacAuth(sessionKey, label, clientNonce, serverNonce): Uint8Array;
export function deriveKeys(sessionKey, clientNonce, serverNonce): SessionKeys;
export class SecureChannel {                // nonce-counter bilan encrypt/decrypt
  seal(plaintext: Uint8Array): Uint8Array;
  open(ciphertext: Uint8Array): Uint8Array;
}

// pairing.ts — QR/URI/qisqa kod encode-decode
export function encodePairingUri(p: PairingInfo): string;   // uzatuv://pair?...
export function decodePairingUri(uri: string): PairingInfo;
export function generateSessionKey(): Uint8Array;           // 32 bayt

// video.ts — VIDEO payload header pack/unpack
export function packVideoPayload(ptsUs: bigint, seq: number, au: Uint8Array): Uint8Array;
export function unpackVideoPayload(payload: Uint8Array): { ptsUs: bigint; seq: number; au: Uint8Array };
```

Kotlin tomon: `packages/protocol/kotlin/Protocol.kt` — **aynan shu** konstantalar va framing/crypto
mantiqi Kotlin'da mirror qilinadi (test bilan bir xilligini tekshiramiz).

---

## 4. `packages/android` kontraktlari (Kotlin)

Android ilova ichki interfeyslari — Transport va Encoder mustaqil rivojlanishi uchun:

```kotlin
// Encode qilingan kadr — capture/encode qatlamidan transport qatlamiga
data class EncodedFrame(
    val data: ByteArray,      // Annex-B access unit
    val ptsUs: Long,          // presentation timestamp (µs)
    val isKeyframe: Boolean,
    val isConfig: Boolean     // SPS/PPS/VPS config buffer
)

// Ekran olish + encode — ScreenCaptureEncoder
interface ScreenEncoder {
    fun start(config: EncoderConfig, sink: (EncodedFrame) -> Unit)
    fun requestKeyframe()
    fun setBitrate(kbps: Int)
    fun onResize(width: Int, height: Int, rotation: Int)
    fun stop()
}
data class EncoderConfig(
    val codec: String,        // "h264" | "h265"
    val maxWidth: Int, val maxHeight: Int,
    val fps: Int, val bitrateKbps: Int, val keyframeIntervalSec: Int
)

// Transport client — serverga ulanish, handshake, frame yuborish/qabul
interface TransportClient {
    fun connect(pairing: PairingInfo)
    fun sendVideo(frame: EncodedFrame)
    fun sendControl(msg: ControlMessage)
    fun onControl(handler: (ControlMessage) -> Unit)   // STREAM_CONFIG, KEYFRAME_REQUEST...
    fun onStateChange(handler: (ConnState) -> Unit)    // CONNECTING/READY/RECONNECTING/CLOSED
    fun disconnect(reason: String)
}
```

**Bog'lanish:** `TransportClient.onControl` → `ScreenEncoder`ni boshqaradi (STREAM_CONFIG→start,
KEYFRAME_REQUEST→requestKeyframe, SET_BITRATE→setBitrate). `ScreenEncoder` sink → `TransportClient.sendVideo`.
Foreground Service ikkalasini ushlab turadi.

---

## 5. `packages/desktop` kontraktlari (TypeScript)

Electron **main** process — transport server; **renderer** — decode + render + UI.

```typescript
// SessionManager — 2–3 sessiyani boshqaradi (main process)
interface SessionManager {
  start(port?: number): Promise<{ port: number; pairing: PairingInfo }>; // + mDNS e'lon
  onSession(cb: (s: Session) => void): void;      // yangi qurilma ulandi
  getSessions(): Session[];
  stop(): void;
}
interface Session {
  id: string;                 // deviceId
  device: DeviceInfo;         // CLIENT_HELLO.device
  state: ConnState;
  onVideo(cb: (chunk: VideoChunk) => void): void; // renderer'ga IPC orqali
  onControl(cb: (m: ControlMessage) => void): void;
  send(m: ControlMessage): void;                  // KEYFRAME_REQUEST, SET_BITRATE...
  requestKeyframe(): void;
  close(): void;
}
interface VideoChunk {
  data: Uint8Array;           // Annex-B AU
  ptsUs: bigint;
  seq: number;
  isKeyframe: boolean;
  codec: string;              // "h264" | "h265"
  config?: Uint8Array;        // agar CODEC_CONFIG bilan kelgan bo'lsa
}

// Renderer: dekod + render — DeviceView (React komponent)
interface VideoRenderer {                          // WebCodecs VideoDecoder ustida
  configure(codec: string, config: Uint8Array): void;
  decode(chunk: VideoChunk): void;                 // → VideoFrame → canvas
  setFullscreen(on: boolean): void;
  dispose(): void;
}
```

**IPC chegarasi:** main (transport, tugunlab qo'yilgan `net` socket) → renderer (WebCodecs). Video AU'lar
`ArrayBuffer` sifatida IPC orqali (yoki `MessagePort`). Control xabarlar ham IPC orqali.

**UI holati:** `useSessions()` hook — barcha sessiyalar ro'yxati; grid komponenti har biriga `DeviceView`.

---

## 6. Modullararo bog'liqlik grafi

```
protocol  ◀──────── android (kotlin mirror)
   ▲
   └───────────────  desktop (TS import)
```

- `protocol` **hech kimga** bog'liq emas (0 dependency, faqat runtime crypto).
- `android`, `desktop` **faqat** `protocol` kontraktiga bog'liq.
- `android` ↔ `desktop` **bevosita** bog'liq emas — faqat wire-protokol orqali (tarmoqda uchrashadi).

Shuning uchun 4 ta agent parallel ishlay oladi: kontrakt (`protocol`) muzlatilgan bo'lsa,
har biri o'z tomonini mustaqil quradi va Faza 2'da tarmoqda birlashadi.

---

## 7. Xatolarga chidamlilik (barcha modullar)

| Holat | Xatti-harakat |
|---|---|
| TCP uzildi | Client backoff bilan reconnect (PROTOCOL 6.5); Server sessiyani `RECONNECTING` qiladi |
| Keyframe yo'qoldi (`seq` sakradi) | Server `KEYFRAME_REQUEST` yuboradi; Decoder oxirgi kadrni ushlab turadi |
| Encoder xatosi | Android: encoder qayta yaratiladi, `CODEC_CONFIG` qayta yuboriladi |
| Decoder xatosi | Desktop: decoder reset + `requestKeyframe()` |
| Permission bekor qilindi | Android: `DISCONNECT{permission_revoked}`, service to'xtaydi |
| Noma'lum xabar/channel | E'tiborsiz qoldiriladi (forward-compat) |

---

## 8. Nima MUZLATILGAN, nima erkin

**Muzlatilgan (PM ruxsatisiz o'zgarmaydi):**
- Wire-protokol ([`PROTOCOL.md`](PROTOCOL.md)) — framing, handshake, xabar tiplari, konstantalar.
- Bu hujjatdagi modul interfeyslari (3–5 bo'limlar).

**Erkin (har agent o'zi hal qiladi):**
- Ichki implementatsiya detallari (thread modeli, buffer o'lchamlari, UI komponent tuzilishi).
- Kutubxona tanlovi (agar kontraktni buzmasa).
- Optimizatsiya (jitter buffer o'lchami, adaptiv algoritm) — Faza 4.
