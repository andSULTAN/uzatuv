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

## 2026-08-09 — FAZA 3 multi-device + USB (PM)

**Bajarildi:**
- **Multi-device:** `SessionManager` bir vaqtda `MAX_DEVICES=3` qurilma (Map bilan), 4-chi ulanish rad etiladi (socket yopiladi). Desktop grid allaqachon bir nechta sessiyani ko'rsatadi.
- **USB + WiFi endpoint'lar:** server barcha interfeyslarda tinglaydi (0.0.0.0). `SessionManager.endpoints()` barcha lokal IPv4 (WiFi + USB tethering) ni topib, har biriga alohida pairing URI beradi; USB heuristikasi (192.168.42/43.x yoki nom `usb/rndis/ncm/tether`). `PairingScreen` da WiFi/USB tanlagich — har biriga alohida QR.
- **Multi-device test** (`test/multidevice.test.ts`): HAQIQIY `SessionManager` ga 3 klient bir vaqtda ulanib video yubordi, 4-chi chegara sabab rad etildi. ✅ **exit 0**.
- `TestClient` alohida faylga ajratildi (`test/testClient.ts`), integration testi undan foydalanadi.

**Holat:** Transport ikkala test bilan tasdiqlandi (1 va 3 qurilma). USB yo'li — bir xil TCP, faqat IP boshqa (server 0.0.0.0 da). Keyingi — FAZA 4.

---

## 2026-08-09 — FAZA 4 sayqal + build (PM)

**Bajarildi:**
- **Adaptiv bitrate:** `Session` RTT (PONG)ga qarab `computeAdaptiveBitrate` (sof funksiya) bilan bitrate'ni moslaydi, sezilarli o'zgarishda `SET_BITRATE` yuboradi (yomon tarmoq→pasaytir, yaxshi→oshir, min 1500 / max 8000 kbps). Unit test `test/adaptive.test.ts` ✅ exit 0.
- **EXE build:** `electron-builder.yml` (NSIS installer + portable) + `pack:win` (@electron/packager, portable papka). `electron.vite.config` `@uzatuv/protocol` external qoldirildi (CJS `export *` ni rollup bundle qila olmaydi).
- **✅ HAQIQIY EXE yasaldi va ISHGA TUSHDI:** `npm run pack:win` → `Uzatuv.exe` (188MB). Ishga tushirib tekshirildi — Electron main process ishlaydi, TCP server `0.0.0.0:8787` (+IPv6) da tinglaydi (netstat bilan tasdiqlandi). Bu real qurilmasiz eng kuchli tasdiq.
- **`dist:win` (NSIS)** bu muhitda winCodeSign symlink privilege sabab yakunlanmadi (Windows Developer Mode/admin kerak — imzo qadamида, kod xatosi emas). `docs/BUILD.md` da aniq yozildi.
- **APK build:** Gradle sozlamasi izchil (Gradle 8.11.1, AGP 8.7.3, Kotlin 2.1.0, minSdk 26/target 35). Bu muhitda SDK/JDK17 yo'qligi sabab **build qilinmadi** — `docs/BUILD.md` da Android Studio orqali bir-buyruqli yo'l.
- `docs/BUILD.md` — EXE + APK to'liq build va ulash qo'llanmasi.

**Halol chegara (o'zgarmadi):** real ekran capture (Android qurilma), WebCodecs GPU dekod (real H.264 oqim), APK build — faqat foydalanuvchi mashinasida. Transport + EXE ishga tushishi shu yerda tasdiqlandi.

**Holat:** FAZA 0–4 kodi va build sozlamasi tayyor. EXE ishlaydigan holda yasaldi. APK — foydalanuvchi Android Studio'da yasaydi, so'ng ikkalasini WiFi'da ulab real sinov.

---

## 2026-08-12 — FAZA 4 sayqal davomi (PM)

**Bajarildi:**
- **Reconnect reattachment bug tuzatildi (`SessionManager`):** bir xil `deviceId` qayta ulanganда eski sessiya map'da qolib, yangisi ro'yxatga olinmasligi VA eski sessiya `close`'i yangisini o'chirib yuborishi mumkin edi. Endi: yangi READY bo'lganda eski almashtiriladi (avval map yangilanadi, keyin eski yopiladi); `onClose` identity tekshiruvi bilan faqat map'dagi aynan shu sessiyani o'chiradi. `test/reconnect.test.ts` ✅ exit 0.
- **QA stress test (`test/stress.test.ts`):** bitta klient 500 kadr burst yuboradi, server hammasini to'g'ri tartibda (seq 0..499) va baytlari aynan qabul qiladi — AEAD nonce-counter yuzlab kadr davomida sinxron qolishi + framing burst ostida to'g'riligi tasdiqlandi. ✅ exit 0.
- **UI holati:** `DeviceView` allaqachon sayqallangan (RTT ms, FPS, o'lcham, kodek, ulanganda darhol keyframe so'rovi, placeholder) — o'zgartirish shart bo'lmadi.

**Test to'plami (desktop `npm test`):** adaptive + integration + multidevice + reconnect + stress — **hammasi exit 0**.

**Holat:** FAZA 4 sayqal asosiy qismi tugadi. Qolgan (foydalanuvchi mashinasida): NSIS installer (Developer Mode kerak), real qurilma latency/sifat sozlash, APK build.

---

## Shablon (keyingi yozuvlar uchun)

```
## SANA — FAZA X (Agent nomi)
**Bajarildi:** ...
**Muammo/qaror:** ...
**Holat:** ...
**Keyingi:** ...
```
