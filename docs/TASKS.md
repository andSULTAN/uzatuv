# Uzatuv — Task Board

> Rollar bo'yicha vazifalar. Holat: ⬜ boshlanmagan · 🔄 jarayonda · ✅ tayyor · 🚧 bloklangan
> Har agent o'z bo'limini yangilaydi. PM integratsiyani kuzatadi.

**Legenda:** `[F0]`=Faza 0, `[F1]`=skelet, `[F2]`=integratsiya, `[F3]`=multi/USB, `[F4]`=sayqal.

---

## PM / Bosh muhandis

- ✅ `[F0]` Monorepo tuzilishi
- ✅ `[F0]` `PROTOCOL.md` — wire-protokol
- ✅ `[F0]` `ARCHITECTURE.md` — modul kontraktlari
- ✅ `[F0]` `TASKS.md` + `PROGRESS.md`
- ✅ `[F0]` `CONVENTIONS.md` — kod uslubi + git strategiyasi
- 🔄 `[F0]` `packages/protocol` implementatsiyasi (TS) + Kotlin mirror
- ⬜ `[F2]` Integratsiya testi (1 qurilma end-to-end)
- ⬜ Konfliktlarni oldini olish, merge muvofiqlashtirish

## Android muhandisi (`packages/android`)

- ⬜ `[F1]` Gradle loyiha skeleti, `minSdk 26`, ruxsatlar (FOREGROUND_SERVICE, mediaProjection)
- ⬜ `[F1]` `MediaProjection` → `VirtualDisplay` → encoder `Surface` (ScreenCapture)
- ⬜ `[F1]` `MediaCodec` H.264 low-latency encoder → `EncodedFrame` sink (avval faylga/loopback)
- ⬜ `[F1]` Foreground Service (`mediaProjection`), doimiy bildirishnoma, Android 14 FGS
- ⬜ `[F1]` Orientation/resize dinamik boshqaruv → `RESIZE`
- ⬜ `[F2]` `TransportClient`ga ulash (real oqim)
- ⬜ `[F3]` H.265 handshake bo'yicha, encoder tanlov
- ⬜ `[F4]` `SET_BITRATE`/`KEYFRAME_REQUEST` ga reaksiya, barqarorlik

## Transport / Tarmoq muhandisi (`packages/protocol` + har ikki tomon)

- 🔄 `[F1]` Framing (length-prefixed) — TS (`protocol`) + Kotlin mirror, testlar bilan
- ⬜ `[F1]` Crypto: HMAC handshake + HKDF + AES-256-GCM — TS + Kotlin, cross-test
- ⬜ `[F1]` Pairing: QR/URI + qisqa kod encode/decode
- ⬜ `[F1]` mDNS/NSD discovery — Android (NSD) + Desktop (mdns/bonjour)
- ⬜ `[F1]` TCP client (Android) + TCP server multiplex (Desktop), dummy ma'lumot bilan
- ⬜ `[F3]` Multi-device (2–3 sessiya), USB tethering interfeys aniqlash
- ⬜ `[F4]` Reconnect backoff, PING/PONG latency, adaptiv signal

## Desktop muhandisi (`packages/desktop`)

- ⬜ `[F1]` Electron + React + TS + Tailwind + shadcn skeleti, main/renderer IPC
- ⬜ `[F1]` `TransportServer`/`SessionManager` (main process)
- ⬜ `[F1]` WebCodecs `VideoDecoder` (HW) + Canvas/WebGL render — namunaviy oqim bilan
- ⬜ `[F1]` Grid ko'rinish qobig'i (2–3 slot) + fullscreen toggle
- ⬜ `[F2]` Real sessiya bilan end-to-end
- ⬜ `[F4]` Jitter buffer, `electron-builder` NSIS `.exe` + portable

## UI/UX dizayner (o'zbekcha, responsive)

- ⬜ `[F1]` Android ekranlar: ulanish (QR skan/kod), status, bildirishnoma — telefon+planshet
- ⬜ `[F1]` Desktop ekranlar: bosh (QR ko'rsatish + kod), grid, fullscreen, sozlamalar
- ⬜ `[F1]` O'zbekcha matnlar (i18n lug'at), USB tethering qadam-baqadam yo'riqnoma
- ⬜ `[F4]` Sayqal: fullscreen UX, holat/xato bildirishlari

## QA / Test muhandisi

- ⬜ `[F1]` `protocol` unit testlari (framing, crypto, pairing) TS↔Kotlin mosligi
- ⬜ `[F2]` End-to-end latency o'lchash (glass-to-glass), sifat benchmark
- ⬜ `[F3]` 2–3 qurilma stress testi, reconnect testi
- ⬜ `[F4]` Bug ovi, regressiya, release checklist
