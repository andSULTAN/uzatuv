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

## 2026-08-12 — APK build (PM)

**Bajarildi:**
- Bu mashinaga Android CLI toolchain o'rnatildi (`D:\Android`): JDK 17 (Temurin), Android SDK platform-35 + build-tools 35.0.0 + platform-tools, Gradle 8.11.1. Litsenziyalar qabul qilindi. `packages/android/local.properties` yaratildi.
- **`gradle :app:assembleDebug` ishga tushirildi — real kompilyatsiya bug topdi:** `Pairing.kt` da `import uz.uzatuv.protocol.Proto` yetishmasdi (8 ta "Unresolved reference 'Proto'"). Bu faqat haqiqiy build'da chiqadigan xato. Tuzatildi.
- **✅ BUILD SUCCESSFUL:** `app-debug.apk` (~41 MB) yasaldi. aapt bilan tekshirildi: package `uz.uzatuv`, versionName 1.0, minSdk 26/target 35, `FOREGROUND_SERVICE_MEDIA_PROJECTION` ruxsati, launcher `MainActivity`, label "Uzatuv". Debug keystore bilan imzolangan — o'rnatishga tayyor.
- `docs/BUILD.md` yangilandi (CLI toolchain yo'li qo'shildi).

**Holat:** Ikkala artefakt tayyor — **EXE** (ishga tushishi tasdiqlangan) va **APK** (yasaldi, imzolangan, o'rnatishga tayyor). Keyingi — foydalanuvchi APK'ni telefonga o'rnatib, EXE bilan bir xil WiFi'da ulab REAL mirroring sinovi.

---

## 2026-08-12 — NSIS installer build (PM)

**Bajarildi:**
- **NSIS installer + portable EXE yasaldi** (`npm run dist:win`, electron-builder):
  - `Uzatuv-Setup-1.0.0.exe` (~82 MB) — o'rnatuvchi
  - `Uzatuv-1.0.0-portable.exe` (~82 MB) — portable (asar bilan, packager 188MB'dan ancha kichik)
  - Ikkalasi ham to'g'ri PE (MZ) Windows exe. `dist/` ga nusxalandi.
- **winCodeSign symlink muammosi admin'siz hal qilindi:** electron-builder winCodeSign'ni ochishда macOS symlink yaratmoqchi bo'lardi (admin/Developer Mode kerak). Yechim: winCodeSign'ni `darwin` papkasisiz (`7za x ... -xr!darwin`) oldindan cache (`winCodeSign-2.6.0`) ga ochildi → electron-builder qayta ochmaydi. `docs/BUILD.md` da yozildi.
- `electron-builder.yml`: `win.artifactName`da ishlamaydigan `${target}` makrosi olib tashlandi; nom har target uchun alohida (`nsis.artifactName` + `portable.artifactName`).
- Imzo: sertifikat yo'q → `CSC_IDENTITY_AUTO_DISCOVERY=false`, imzo o'tkazib yuboriladi (imzosiz installer — SmartScreen ogohlantirishi mumkin, normal).

**Holat:** Uchala artefakt tayyor (`dist/`): APK, portable EXE, NSIS installer. Keyingi — foydalanuvchi real qurilmada mirroring sinovi.

---

## 2026-08-12 — "Qurilmani eslab qolish" funksiyasi (PM)

**Talab:** har safar QR skanlashsiz, bir marta ulangan PC'ni eslab qolib, ro'yxatdan tanlab to'g'ridan ulanish.

**Bajarildi:**
- **Desktop identity doimiy saqlash:** `SessionManager` konstruktori endi `identity?{serverId,sessionKey}` qabul qiladi; `main/index.ts` uni `userData/uzatuv-identity.json` ga yozib/o'qiydi. Avval har ishga tushishда yangi sessionKey yaratilardi → saqlangan kalit mos kelmasdi. **Tekshirildi:** portable EXE ikki marta ishga tushirildi — serverId+sessionKey o'zgarmadi (`%APPDATA%/@uzatuv/desktop/uzatuv-identity.json`).
- **Android `SavedDevices`:** pairing ro'yxati SharedPreferences'da JSON (serverId noyob kalit). `list/save/remove/isSaved`.
- **Taklif:** `StatusScreen` — ulangач (READY) va saqlanmagan bo'lsa "Bu kompyuterni eslab qolaymi? [Ha/Yo'q]" kartasi.
- **Ro'yxat:** `ConnectScreen` asosiy ekranда "Saqlangan qurilmalar" — bosilsa QR'siz to'g'ridan ulanadi ("Unut" bilan o'chiriladi).
- `MainActivity` hammasini bog'ladi (`current` pairing, `saved` ro'yxat, taklif holati).
- Build: desktop typecheck+5 test exit 0; APK BUILD SUCCESSFUL; ikkala EXE qayta yig'ildi.

**Eslatma:** saqlangan `ip` PC IP'si o'zgarsa eskirishi mumkin (DHCP) — hozircha IP bo'yicha ulanadi; kelajakda mDNS orqali serverId bo'yicha avto-topish (keyingi ish).

---

## 2026-08-12 — mDNS avtomatik topish (PM)

**Talab:** saqlangan qurilma IP'si o'zgarsa (DHCP) ham ulanaversin — serverId bo'yicha joriy IP'ni topish.

**Bajarildi:**
- **Android `DeviceDiscovery`** (`NsdManager`): `_uzatuv._tcp` xizmatlarini topadi, resolve navbati + MulticastLock bilan (ishonchli mDNS). Har PC uchun `DiscoveredPc{serverId, name, host(joriy IPv4), port}`.
- **`ConnectScreen`:** ochilганда `DisposableEffect` bilan topishni ishga tushiradi; saqlangan qurilma tarmoqда topilsa "● Tarmoqда — ulanishga tayyor" (yashil) ko'rsatiladi va bosilganда **JORIY IP** bilan ulanadi (`pairing.copy(ip=fresh.host, port=fresh.port)`); topilmasa saqlangan IP bilan urinadi.
- **Desktop:** allaqachon `bonjour-service` bilan `_uzatuv._tcp` e'lon qiladi (TXT: v, id=serverId, name). **Tekshirildi:** portable EXE ishga tushirilib, Node mDNS browse bilan topildi — `id` doimiy serverId (d2ebe33d…) bilan mos.

**Natija:** saqlangan qurilma IP o'zgarsa ham ishlaydi. `sessionKey` mDNS'да YO'Q (sir) — u faqat saqlangan pairing'да; discovery faqat IP'ni yangilaydi.

**Build:** APK BUILD SUCCESSFUL. Desktop o'zgarmadi (avvalgi build amal qiladi).

---

## 2026-08-12 — Ikki tomonlama, 1-bosqich: Desktop UZATISH (PM)

**Talab:** ikkala platforma ham uzatish, ham qabul qilish; audio (yoqish/o'chirish); UI mukammal + ui-reviewer tekshiradi.

**1-bosqich bajarildi (Desktop ikki tomonlama):**
- **`ClientSession`** (main) — desktop UZATISH transporti (klient): boshqa qabul qiluvchiga ulanadi, handshake (klient) + AES-256-GCM, video yuboradi, reconnect+ping. **Loopback test** (`test/transmit.test.ts`): ClientSession → SessionManager qabul qildi (baytlar aynan) — desktop ham uzata, ham qabul qila oladi. ✅ exit 0.
- **`ScreenTransmitter`** (renderer) — `getDisplayMedia` + WebCodecs `VideoEncoder` (H.264, realtime, Annex-B) → encode → IPC → main.
- **UI:** `HomeScreen` (rejim menyusi: Qabul qilish / Uzatish), `TransmitScreen` (havola joylash → ekran tanlash → uzatish, preview, holat, To'xtatish, ovoz-toggle placeholder). `App.tsx` marshrutlash. Qabul qiluvchi doim tinglaydi (fonда).
- IPC: TRANSMIT_START/STOP/CHUNK/STATE/CONTROL.
- Desktop typecheck + 6 test + build — hammasi exit 0.

**Keyingi:** 2-bosqich — Android QABUL QILISH (MediaCodec dekoder + server + rejim menyusi + Android TV leanback). 3-bosqich — audio (kanal 2). So'ng ui-reviewer.

---

## 2026-08-12 — UI-reviewer ko'rigi + tuzatishlar (Desktop, PM)

**Oqim:** ui-reviewer agent desktop UI'ni tekshirdi → `docs/UI_REVIEW.md` (umumiy baho: o'rta, kritik yo'q) → kod yozuvchi (PM) tuzatdi.

**Qo'llangan tuzatishlar:**
1. **Uzatish yo'riqnomasi** endi 3 raqamli qadam (`Step` umumiy komponent — qabul + uzatishда bir xil; qabul=sky, uzatish=emerald).
2. **Ekran ulashish xatosi** o'zbekchaga map qilindi (`NotAllowedError`→"ruxsat berilmadi", va h.k.) — xom inglizcha xato yo'q.
3. **Status ko'rsatkichi** birlashtirildi — `StatusBadge` (pill+nuqta) ikkala oqimда; uzatishда READY→"Uzatilmoqda", `size="md"` faol holatда prominent.
4. **Kiril "да"→lotin "da"** — butun desktop/src bo'ylab (14 ta, ko'rinadigan + izoh).
5. **HomeScreen** badge holatga aylandi ("Uzatishga tayyor"), ovoz-eslatma desc'ga.
6. **Aksent izchilligi** — uzatish oqimi to'liq emerald (tugma, fokus, qadam, badge); header "Uzatish" `font-bold` (qabul bilan bir xil).
7. **Darhol feedback** — "Uzatishni boshlash" bosilgach tugma "Ulanmoqda…" bo'lib bloklanadi.
8. PairingScreen'даги takroriy katta "Uzatuv" h1 kichraytirildi.

typecheck + 6 test — exit 0.

---

## 2026-08-12 — 2-bosqich: Android QABUL QILISH + Android TV (PM)

**Bajarildi (bitta APK — telefon + TV):**
- **`ReceiverServer`** — Android SERVER bo'ladi: TCP tinglaydi, server-tomon handshake (CLIENT_HELLO→SERVER_HELLO auth→CLIENT_AUTH tekshir→SERVER_READY→HKDF server roli→AES-256-GCM), STREAM_CONFIG/START/KEYFRAME_REQUEST yuboradi, video qabul qiladi, PING/PONG. Bitta faol ulanish.
- **`VideoDecoder`** — MediaCodec (video/avc, h265 ham) → Surface. CODEC_CONFIG (alohida) yoki keyframe ichидан (Annex-B inline — desktop uzatuvchi) SPS/PPS ajratib configure qiladi.
- **`ReceiverIdentity`** — qurilma doimiy serverId+sessionKey (SharedPreferences) + `uzatuv://` pairing URI + LAN IPv4.
- **`ReceiveScreen`** — QR (ZXing) + havola (nusxalash) + yo'riqnoma; ulanганда SurfaceView'да video. `HomeScreen` (Uzatish/Qabul qilish rejim menyusi). `MainActivity` marshrutlash + tizim Orqaga.
- **Android TV:** manifest leanback + `LEANBACK_LAUNCHER` + banner + touchscreen not-required. aapt tasdiqladi: `leanback-launchable-activity` bor. Bitta APK ikkala qurilmada.
- Build: **BUILD SUCCESSFUL** (birinchi urinishда), APK ~43MB.

**Oqim:** telefon→TV — TV "Qabul qilish" (QR ko'rsatadi), telefon "Uzatish" QR skanlaydi. PC→TV — PC "Uzatish" havolani joylaydi (TV'дан nusxalanadi/o'qiladi).

**Halol chegara:** Android dekod (MediaCodec→Surface), TV real qurilmасiz sinalmadi — kompilyatsiya toza, jonli sinov foydalanuvchida. Keyingi — 3-bosqich: ovoz.

---

## Shablon (keyingi yozuvlar uchun)

```
## SANA — FAZA X (Agent nomi)
**Bajarildi:** ...
**Muammo/qaror:** ...
**Holat:** ...
**Keyingi:** ...
```
