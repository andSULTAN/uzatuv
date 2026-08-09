# Uzatuv

**Android ekranini Windows kompyuterga jonli, yuqori sifat va past kechikish bilan uzatuvchi (mirroring) tizim.**

Yo'nalish faqat bitta: **Android → PC** (ko'rsatish). Masofadan boshqarish (input inject) **yo'q**.
scrcpy / AirDroid'ning ekran ko'rsatish qismiga o'xshaydi.

---

## Nima qiladi

- 📱 Android telefon/planshet ekranini bir xil WiFi tarmog'idagi PC ga uzatadi.
- 🔗 QR kod yoki qisqa raqamli kod orqali juda oson ulanish.
- 🔌 Qo'shimcha: USB (Type-C, USB tethering) orqali ulanish.
- 🖥️ Bir vaqtda **2–3 qurilma** bitta PC ga — ekranlar yonma-yon (grid), bittasi tanlab **fullscreen**.
- ⚡ Hardware kodek (H.264, imkon bo'lsa H.265), 1080p, adaptiv bitrate, minimal kechikish.
- 🔁 Uzilishda avtomatik qayta ulanish.
- 🇺🇿 UI to'liq o'zbek tilida (Android: telefon+planshet responsive).

## Nima QILMAYDI (v1)

- ❌ PC dan Android'ni boshqarish (mouse/klaviatura inject) — **yo'q**.
- ❌ Audio uzatish — v1'da yo'q (protokol audio kanalini **rezerv** qilib qo'ygan, keyin qo'shiladi).
- ❌ Internet orqali (faqat lokal tarmoq / USB).

---

## Monorepo tuzilishi

```
uzatuv/
  packages/
    protocol/     # Umumiy: xabar tiplari, framing, pairing, crypto (TS — yagona manba)
                  #   kotlin/ — Android uchun mirror qilingan konstantalar
    android/      # Kotlin ilova (capture + encode + transport client)
    desktop/      # Electron + React ilova (transport server + decode + render)
  docs/
    PROTOCOL.md      # Wire-protokol spetsifikatsiyasi (MUZLATILGAN kontrakt)
    ARCHITECTURE.md  # Modul interfeyslari/kontraktlari (MUZLATILGAN)
    TASKS.md         # Task board (rollar bo'yicha)
    PROGRESS.md      # Progress jurnali
    CONVENTIONS.md   # Kod uslubi, lint, nomlash, git strategiyasi
  README.md
```

## Tez boshlash (dev)

> To'liq qadamlar har paket ichidagi README'da. Umumiy oqim:

```bash
# 1) Protocol paketini build qilish (desktop unga bog'liq)
cd packages/protocol && npm install && npm run build

# 2) Desktop (PC — qabul qiluvchi)
cd ../desktop && npm install && npm run dev

# 3) Android — Android Studio'da packages/android ni ochib, telefon/emulyatorga o'rnatish
```

## Fazalar

| Faza | Mazmun | Holat |
|---|---|---|
| **0** | Poydevor: repo, protokol, arxitektura, task board | ✅ tayyor |
| **1** | Parallel skeletlar (Android capture/encode · Transport · Desktop decode/render · UI) | 🔄 |
| **2** | Integratsiya: 1 qurilma end-to-end WiFi mirroring | ⏳ |
| **3** | 2–3 qurilma + USB tethering | ⏳ |
| **4** | Sayqal: adaptiv bitrate, reconnect, latency, `.exe`/APK build | ⏳ |

Batafsil: [`docs/PROGRESS.md`](docs/PROGRESS.md), [`docs/TASKS.md`](docs/TASKS.md).

## Texnologiyalar

- **Android:** Kotlin, `MediaProjection` → `VirtualDisplay` → `MediaCodec` (HW encoder), Foreground Service.
- **Transport:** TCP (length-prefixed framing), mDNS/NSD discovery, AEAD shifrlash (sessionKey), multi-device.
- **Desktop:** Electron + React + TypeScript + Tailwind + shadcn/ui, WebCodecs `VideoDecoder` (HW), WebGL/Canvas render, `electron-builder` → NSIS `.exe`.

## Litsenziya

Ichki loyiha. (TODO: litsenziya tanlash.)
