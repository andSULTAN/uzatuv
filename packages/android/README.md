# Uzatuv — Android klient (yuboruvchi)

Android ekranini Windows PC ga jonli uzatuvchi (mirroring) ilovaning **klient** qismi.
Ekranni oladi (MediaProjection), H.264/H.265 (HW encoder) bilan encode qiladi va
shifrlangan TCP orqali PC serverga yuboradi.

- **Til:** Kotlin · **UI:** Jetpack Compose
- **minSdk:** 26 · **targetSdk / compileSdk:** 35
- **Protokol:** [`docs/PROTOCOL.md`](../../docs/PROTOCOL.md) (v1, muzlatilgan)
- **Arxitektura kontraktlari:** [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) §4

---

## Talablar

- **Android Studio** (Ladybug yoki yangiroq) — eng oson yo'l.
- Yoki: JDK 17 + Android SDK (Platform 35, Build-Tools) + Gradle 8.11+.
- Qurilma: Android 8.0 (API 26) va undan yuqori, HW H.264 encoder bilan (deyarli barchasi).

> ⚠️ MediaProjection va HW encoder **emulyatorda cheklangan** — real qurilmada sinang.

---

## Ochish va qurish (Android Studio)

1. Android Studio'da **Open** → shu papkani (`packages/android`) tanlang.
2. Studio Gradle sync qiladi va **Gradle wrapper**ni (agar yo'q bo'lsa) avtomatik yaratadi.
3. SDK topilmasa: `File → Project Structure → SDK Location` yoki `local.properties`da:
   ```
   sdk.dir=C:\\Users\\<siz>\\AppData\\Local\\Android\\Sdk
   ```
4. **Run ▶** (yoki `Build → Build APK(s)`).

## Buyruq qatoridan (Gradle o'rnatilgan bo'lsa)

Wrapper jar repoda yo'q (binary saqlanmaydi). Bir marta yarating:

```bash
cd packages/android
gradle wrapper --gradle-version 8.11.1   # gradlew/gradlew.bat + jar yaratadi
./gradlew :app:assembleDebug             # APK
./gradlew :app:compileDebugKotlin        # faqat Kotlin kompilyatsiyasi
```

APK: `app/build/outputs/apk/debug/app-debug.apk`.

---

## Ruxsatlar (nega kerak)

| Ruxsat | Sabab |
|---|---|
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PROJECTION` | Ekran uzatilishi davomida ishlab turish (Android 14 talabi) |
| `POST_NOTIFICATIONS` | "Ekran uzatilmoqda" bildirishnomasi (Android 13+) |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` | TCP ulanish, tarmoq holati |
| `CHANGE_WIFI_MULTICAST_STATE` | mDNS/NSD orqali PC ni topish (kelajak faza) |
| `CAMERA` | QR kodni skanlash (ixtiyoriy — kod/havola bilan ham ulanish mumkin) |

MediaProjection ruxsati har safar tizim dialogi orqali so'raladi (saqlanmaydi).

---

## Ishlash oqimi

1. **Ulanish** ekrani: PC dagi QR kodni skanlang yoki `uzatuv://pair?...` havolani kiriting.
2. Bildirishnoma + **ekran olish** ruxsatlari so'raladi.
3. `MediaProjectionService` ishga tushadi → serverga ulanadi (handshake + AEAD).
4. **Holat** ekrani: ulangan PC nomi, holat (Ulanmoqda / Faol / Qayta ulanmoqda), **To'xtatish**.
5. WiFi bo'lmasa — **USB tethering** yo'riqnomasi (Sozlamalar → Modem rejimi → USB modem).

---

## Kod tuzilishi (`app/src/main/java/uz/uzatuv`)

| Fayl | Vazifa |
|---|---|
| `protocol/Protocol.kt` | Muzlatilgan protokol mirror'i (framing, crypto, video) — **o'zgartirilmaydi** |
| `Contracts.kt` | `EncodedFrame`, `ScreenEncoder`, `EncoderConfig`, `TransportClient`, `ConnState`, `PairingInfo`, `DeviceInfo` |
| `ControlMessage.kt` | CONTROL kanali xabarlari (sealed class) + JSON codec |
| `Pairing.kt` | QR/URI → `PairingInfo` (`decodePairingUri`) |
| `capture/ScreenCaptureEncoder.kt` | MediaProjection → VirtualDisplay → MediaCodec (low-latency) |
| `transport/TransportClientImpl.kt` | TCP + handshake + AEAD + reconnect + PING/PONG |
| `MirrorController.kt` | Encoder ↔ Transport bog'lash mantiqi |
| `MirrorState.kt` | Service ↔ UI umumiy holat (StateFlow) |
| `service/MediaProjectionService.kt` | Foreground service (mediaProjection type) |
| `MainActivity.kt`, `ui/*` | Compose ekranlari (o'zbekcha, responsive) |

---

## Hozircha TODO (keyingi fazalar)

- **mDNS/NSD discovery** — PC ni avtomatik topish va sof raqamli qisqa kod (`PAIR_CODE`)
  orqali `sessionKey` olish. Hozir QR yoki `uzatuv://` havola kerak.
- **Real qurilmada test** — encode latency, reconnect, orientation, USB tethering yo'li.
- **H.265** — qurilma qo'llasa `CLIENT_HELLO.codecs`ga qo'shish (baza — H.264).
- **Adaptiv bitrate** — server `SET_BITRATE` yuboradi (transport tayyor), sozlash Faza 4.
