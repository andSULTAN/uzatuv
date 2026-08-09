# Uzatuv — Progress Jurnali

> Eng yangi yozuv tepada. Har muhim qadam shu yerga yoziladi (sana, kim, nima, holat).

---

## 2026-08-09 — FAZA 0 (PM)

**Bajarildi:**
- Monorepo yaratildi: `packages/{protocol,android,desktop}`, `docs/`.
- `docs/PROTOCOL.md` — to'liq wire-protokol (framing, handshake, AEAD, control xabarlar, video/audio-rezerv, konstantalar). 🧊 muzlatildi.
- `docs/ARCHITECTURE.md` — modul kontraktlari (protocol/android/desktop interfeyslari). 🧊 muzlatildi.
- `docs/TASKS.md` — rollar bo'yicha task board.
- `docs/CONVENTIONS.md` — kod uslubi, nomlash, lint/format, git strategiyasi.
- `README.md` — loyiha umumiy ko'rinishi.
- `packages/protocol` (TS) — konstantalar, xabar tiplari, framing, crypto, pairing, video header + Kotlin mirror.

**Holat:** FAZA 0 poydevori tayyor. Kontraktlar muzlatildi → FAZA 1 parallel skeletlar boshlanadi.

**Keyingi:** FAZA 1 — Android/Transport/Desktop/UI skeletlari kelishilgan interfeyslarga qarshi.

---

## 2026-08-09 — FAZA 1 skeletlar (Desktop + Android, PM muvofiqlashtirdi)

**Desktop (`packages/desktop`) — Desktop agenti:**
- Electron + React + TS (strict) + Tailwind. Main: `SessionManager` (TCP server `net`, mDNS `bonjour-service`, QR pairing), `Session` (to'liq handshake + AES-256-GCM + PING/PONG + frame demux). Renderer (o'zbekcha): `PairingScreen` (QR + qisqa kod + WiFi/USB yo'riqnoma), `DeviceGrid`, `DeviceView` (WebCodecs `VideoDecoder` + canvas + placeholder), `FullscreenView` (ESC), `VideoRenderer` (ARCHITECTURE §5).
- ✅ Tekshirildi: `npm install`, `npm run typecheck` (node+web) **exit 0**, `npm run build` **exit 0**. PM mustaqil qayta ishga tushirdi — typecheck exit 0.
- TODO: Electron GUI jonli sinov (headless muhit), real qurilmasiz WebCodecs dekod, qisqa-kod→sessionKey lookup, avcC/hvcC codec string.

**Android (`packages/android`) — Android agenti:**
- Kotlin 2.1, AGP 8.7, Compose, `minSdk 26`/`target 35`. `ScreenCaptureEncoder` (MediaProjection→VirtualDisplay→MediaCodec, low-latency CBR), `MediaProjectionService` (FGS mediaProjection, Android 14 tartibi), `TransportClientImpl` (TCP+handshake+AEAD+reconnect+PING/PONG), `ControlMessage`/`Pairing`, UI (ConnectScreen+QrScanner CameraX/MLKit, StatusScreen, UsbTetherScreen — o'zbekcha).
- `Protocol.kt` mirror bayt-ma-bayt identik (PM `diff` bilan tasdiqladi ✓). Transport protokolni to'g'ri ishlatadi (PM ko'zdan kechirdi ✓).
- ⚠️ **Kompilyatsiya TEKSHIRILMADI:** bu muhitda Android SDK/Gradle/kotlinc yo'q (faqat Java 1.8). Kod to'liq va sintaktik to'g'ri, lekin real kompilyatorda tasdiqlanmagan. Android Studio bilan build kerak.
- TODO: mDNS/NSD discovery, raqamli qisqa kod (`PAIR_CODE`), real qurilmada test (latency/reconnect/orientation/USB), H.265, `gradle-wrapper.jar` (Android Studio yaratadi).

**Holat:** Ikkala skelet muzlatilgan protokolga qarshi mustaqil qurildi. Keyingi — FAZA 2 (1 qurilma end-to-end): real Android→PC oqim, WebCodecs dekodni haqiqiy H.264 bilan sinash.

---

## 2026-08-09 — FAZA 2 integratsiya (PM)

**Bajarildi:**
- **Haqiqiy end-to-end integratsiya testi** (`packages/desktop/test/integration.test.ts`): mustaqil test-klient (faqat `@uzatuv/protocol`dan foydalanadi, Android kabi) HAQIQIY desktop `Session` (server) bilan real TCP ustidan to'liq oqim: handshake → AES-256-GCM → server STREAM_CONFIG/START/KEYFRAME_REQUEST → klient CODEC_CONFIG + video keyframe → server `onVideo` (baytlar+config aynan). ✅ **exit 0** (`npm run test:integration`).
- Android oqim ulanishi (`MirrorController`) ko'zdan kechirildi — STREAM_CONFIG→encoder, config→CODEC_CONFIG, KEYFRAME_REQUEST→requestKeyframe, encoder→sendVideo to'g'ri. CODEC_CONFIG JSON kaliti `csd` ikki tomonda mos ✓.
- **Real integratsiya bug tuzatildi (Desktop `VideoRenderer`):** Android SPS/PPS(config)ni keyframe'dan alohida yuboradi; VideoRenderer avval uni e'tiborsiz qoldirardi → Annex-B rejimida dekoder IDR'ni ocholmasligi mumkin edi. Endi har keyframe oldiga saqlangan config qo'shiladi (self-contained IDR, reset/paket-yo'qolishiga chidamli).

**Halol chegara:** bu test TRANSPORT qatlamini isbotlaydi (protokol/shifrlash/framing/demux — ikki mustaqil implementatsiya). Sinalmagan: (1) real ekran capture — Android qurilma kerak; (2) WebCodecs GPU dekod — Electron renderer (Chromium) + real H.264 oqim kerak; (3) Android kompilyatsiya — SDK kerak. Bularni faqat foydalanuvchi o'z mashinasida sinaydi.

**Holat:** Transport end-to-end avtomatik tasdiqlandi. Keyingi — foydalanuvchi tomonda real qurilma sinovi (Desktop `npm run dev` + Android Studio APK), so'ng FAZA 3 (multi-device + USB) va FAZA 4 (adaptiv bitrate, `.exe`/APK build).

---

## Shablon (keyingi yozuvlar uchun)

```
## SANA — FAZA X (Agent nomi)
**Bajarildi:** ...
**Muammo/qaror:** ...
**Holat:** ...
**Keyingi:** ...
```
