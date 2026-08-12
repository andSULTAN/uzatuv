# Uzatuv — Build qo'llanmasi (EXE + APK)

Ikkita artefakt: **Windows `.exe`** (Desktop, qabul qiluvchi) va **Android `.apk`**
(yuboruvchi). Ikkalasini yasab, bir xil WiFi'da bir-biriga ulab sinaladi.

---

## 1. Windows `.exe` (Desktop)

**Talab:** Node.js ≥ 18 (Windows).

### 1.1 Tayyorlash
```bash
cd packages/protocol && npm install && npm run build
cd ../desktop && npm install
```

### 1.2 Ikki build usuli

**A) Portable ilova papkasi (bu muhitda sinab ko'rilgan, ishlaydi):**
```bash
cd packages/desktop && npm run pack:win
```
Natija: `packages/desktop/release-pack/Uzatuv-win32-x64/Uzatuv.exe` —
o'rnatishsiz ishga tushadigan ilova. Papkani ko'chirib, `Uzatuv.exe` ni bosing.
> ✅ Tekshirildi: ishga tushadi, TCP server `0.0.0.0:8787` da tinglaydi (WiFi + USB).

**B) NSIS o'rnatuvchi + portable bitta `.exe` (sayqallangan, tavsiya — release uchun):**
```bash
cd packages/desktop && npm run dist:win
```
Natija: `packages/desktop/release/1.0.0/` ichida `Uzatuv-1.0.0-x64-nsis.exe`
(installer) va `Uzatuv-1.0.0-portable.exe`.

> ⚠️ **Muhim (Windows):** `dist:win` (electron-builder) `winCodeSign` paketini
> ochishda **symbolic link** yaratadi — buning uchun **Developer Mode** yoqilgan
> bo'lishi kerak (Windows Sozlamalar → Maxfiylik va xavfsizlik → Dasturchilar
> uchun → Developer Mode = Yoniq), yoki buyruqni **administrator** sifatida ishga
> tushiring. Aks holda "Cannot create symbolic link" xatosi chiqadi. Bu imzo (code
> signing) uchun; Developer Mode yoqilsa bir marta hal bo'ladi.
> Agar kerak bo'lmasa — **A usuli** (`pack:win`) bu talabsiz ishlaydi.

### 1.3 Dev rejimda ishga tushirish (build'siz)
```bash
cd packages/desktop && npm run dev
```

---

## 2. Android `.apk`

**Talab:** **Android Studio** (JDK 17 o'zida bor) yoki JDK 17 + Android SDK.
`minSdk 26` (Android 8.0+), `targetSdk 35`, `applicationId uz.uzatuv`.

> ✅ **APK build qilindi va tekshirildi** (CLI toolchain: JDK 17 + Android SDK
> platform-35 + build-tools 35 + Gradle 8.11.1). Natija: `app-debug.apk` (~41 MB),
> package `uz.uzatuv`, minSdk 26 / targetSdk 35, `mediaProjection` FGS ruxsati bilan.

### 2.1 Android Studio orqali (eng oson)
1. Android Studio'ni oching → **Open** → `packages/android` papkasini tanlang.
2. Studio Gradle sync qiladi va `gradle-wrapper.jar` ni avtomatik yaratadi.
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. Natija: `packages/android/app/build/outputs/apk/debug/app-debug.apk`.
5. APK'ni telefonga o'tkazing (USB yoki fayl) va o'rnating
   (Sozlamalar → "Noma'lum manbalar" ruxsati kerak bo'lishi mumkin).

### 2.2 Buyruq qatori orqali (gradle o'rnatilgan bo'lsa)
```bash
cd packages/android
gradle wrapper            # bir marta — wrapper jar yaratadi
./gradlew :app:assembleDebug
# Natija: app/build/outputs/apk/debug/app-debug.apk
```

Release (imzolangan) APK uchun `app/build.gradle.kts` da `signingConfigs`
qo'shib, `./gradlew :app:assembleRelease` ishlating.

### 2.3 CLI toolchain (Android Studio'siz — shu mashinada o'rnatilgan)

Bu loyihada APK **Android Studio'siz**, `D:\Android` ga o'rnatilgan vositalar
bilan yasaldi:
- JDK 17: `D:\Android\jdk17\jdk-17.0.20+8`
- Android SDK: `D:\Android\sdk` (platform-35, build-tools 35.0.0, platform-tools)
- Gradle 8.11.1: `D:\Android\gradle\gradle-8.11.1`
- `packages/android/local.properties` → `sdk.dir=D:/Android/sdk`

Qayta build (Git Bash yoki PowerShell'da JAVA_HOME + ANDROID_HOME bilan):
```bash
export JAVA_HOME='/d/Android/jdk17/jdk-17.0.20+8'
export ANDROID_HOME='/d/Android/sdk'
export PATH="$JAVA_HOME/bin:$PATH"
cd packages/android
/d/Android/gradle/gradle-8.11.1/bin/gradle :app:assembleDebug --console=plain
# → app/build/outputs/apk/debug/app-debug.apk
```

---

## 3. Ulash va sinash (EXE ↔ APK)

1. **PC:** `Uzatuv.exe` ni ishga tushiring → QR kodli oyna ochiladi.
2. **Telefon:** `app-debug.apk` o'rnatilgan Uzatuv ilovasini oching.
3. Telefon va PC **bir xil WiFi**da bo'lsin (yoki USB tethering yoqilgan bo'lsin).
4. Ilovada **QR skanerlash** → PC ekranidagi kodni ko'rsating.
5. **Uzatishni boshlash** → MediaProjection ruxsatini bering.
6. Telefon ekrani PC oynasida jonli ko'rinadi. Boshqa qurilma ulasangiz — grid,
   bittasini bosib fullscreen.

**USB tethering (WiFi bo'lmasa):** telefonni USB bilan ulang → Sozlamalar →
Modem rejimi → USB modem yoqing → PC oynasidagi **USB** QR'ni skanerlang.

---

## 4. Qisqacha (TL;DR)

| Artefakt | Buyruq | Natija |
|---|---|---|
| EXE (portable) | `cd packages/desktop && npm run pack:win` | `release-pack/Uzatuv-win32-x64/Uzatuv.exe` |
| EXE (installer) | `npm run dist:win` (Developer Mode) | `release/1.0.0/Uzatuv-1.0.0-x64-nsis.exe` |
| APK | Android Studio: Build → Build APK(s) | `app/build/outputs/apk/debug/app-debug.apk` |
