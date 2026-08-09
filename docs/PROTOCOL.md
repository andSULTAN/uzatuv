# Uzatuv — Wire Protocol Spetsifikatsiyasi

> **Versiya:** 1 (`PROTOCOL_VERSION = 1`)
> **Holat:** 🧊 MUZLATILGAN kontrakt. O'zgartirish faqat PM orqali + versiya oshiriladi + bu hujjat yangilanadi.
> **Yagona implementatsiya manbasi:** [`packages/protocol`](../packages/protocol) (TypeScript).
> Android (Kotlin) shu hujjatga va [`packages/protocol/kotlin/`](../packages/protocol/kotlin) mirror konstantalariga amal qiladi.

Bu hujjat Android (klient) va PC (server) o'rtasidagi tarmoq protokolini to'liq belgilaydi.
Ikkala tomon **aynan shu qoidalarga** amal qiladi.

---

## 0. Rollar va atamalar

| Atama | Ma'no |
|---|---|
| **Server** | **PC** (desktop). TCP porti ochib **tinglaydi**, oqimni **qabul qilib** ko'rsatadi. |
| **Client** | **Android** qurilma. Serverga **ulanadi**, ekranini **encode qilib yuboradi**. |
| **Session** | Bitta Client ↔ Server TCP ulanishi. Server 2–3 sessiyani parallel boshqaradi. |
| **Frame** | Tarmoqdagi bitta length-prefixed paket (video access unit emas — pastga qarang). |
| **Access Unit (AU)** | Bitta to'liq encode qilingan video kadr (bir yoki bir nechta NAL). |

> ⚠️ Yo'nalish: video **Client → Server**. Control xabarlari **ikki tomonlama**.
> Bu **mirroring**, boshqaruv (input) YO'Q.

---

## 1. Transport qatlami

- **Protokol:** TCP. Har sessiya = bitta TCP ulanish.
- **Standart port:** `8787` (`DEFAULT_PORT`). Server band bo'lsa keyingi bo'sh portni tanlaydi; haqiqiy port mDNS va QR orqali e'lon qilinadi.
- **Byte tartibi:** hamma ko'p-baytli sonlar **big-endian** (network byte order).
- **TCP_NODELAY:** ikkala tomonda **yoqilgan** (Nagle o'chirilgan — kechikishni kamaytirish uchun).
- **USB yo'li:** USB tethering yoqilganda hosil bo'lgan tarmoq interfeysi (`usb0`, PC tomonda RNDIS/NCM) ustidan **xuddi shu** TCP protokoli ishlaydi. Farqi yo'q — faqat IP boshqa (odatda `192.168.42.x`).

### 1.1 Framing (length-prefixed)

Har bir tarmoq paketi (frame) quyidagi ko'rinishda:

```
+-----------------+----------------------------------+
| uint32 frameLen | payload (frameLen bayt)          |
| (big-endian)    |                                  |
+-----------------+----------------------------------+
```

- `frameLen` — undan keyingi `payload` uzunligi (baytlarda). `frameLen` o'ziga kirmaydi.
- Maksimal frame: `MAX_FRAME_LEN = 16 MiB` (16 * 1024 * 1024). Kattaroq → protokol xatosi, ulanish uziladi.
- Handshake tugagach, `payload` **shifrlangan** (2-bo'lim). Handshakegacha `payload` — ochiq JSON.

### 1.2 Ichki frame strukturasi (handshakedan keyin, deshifrlangandan so'ng)

Deshifrlangan `payload` quyidagicha ochiladi:

```
+-----------+---------+-------------------------------+
| uint8     | uint8   | channel-payload               |
| channel   | flags   |                               |
+-----------+---------+-------------------------------+
```

| `channel` | Nomi | Mazmun |
|---|---|---|
| `0` | `CONTROL` | JSON (UTF-8) control xabar (3-bo'lim) |
| `1` | `VIDEO` | Encode qilingan video AU (4-bo'lim) |
| `2` | `AUDIO` | 🔒 **REZERV** — v1'da ishlatilmaydi (5-bo'lim) |

`flags` — bit maydoni, channelga bog'liq:

| Bit | Nomi | Qo'llaniladi | Ma'no |
|---|---|---|---|
| 0 | `KEYFRAME` | VIDEO | Bu AU keyframe (IDR) |
| 1 | `CONFIG` | VIDEO | AU oldida codec config (SPS/PPS/VPS) bor |
| 2 | `END_OF_STREAM` | VIDEO | Oqim tugadi |
| 3–7 | — | — | 0 (rezerv) |

---

## 2. Xavfsizlik: pairing, handshake, shifrlash

Shifrlash **majburiy**. Asosi — pairing paytida almashinadigan `sessionKey` (32 bayt sir).

### 2.1 Pairing (ulanishni sozlash)

**Server (PC)** har sessiya uchun tasodifiy `sessionKey` (32 bayt) yaratadi va uni ikki usulda taqdim etadi:

**A) QR kod** — ichida JSON (keyin base64url) yoki `uzatuv://` URI:

```json
{
  "v": 1,
  "ip": "192.168.1.15",
  "port": 8787,
  "serverId": "b3f1c2a4-...-uuid",
  "name": "PC-Home",
  "key": "BASE64URL_32BYTE_SESSION_KEY"
}
```

URI ko'rinishi (bir qatorli, QR ichida):
```
uzatuv://pair?v=1&ip=192.168.1.15&port=8787&id=<serverId>&name=PC-Home&key=<base64url>
```

**B) Qisqa raqamli kod** — QR o'qib bo'lmasa. 6–9 xonali kod (`123-456-789`).
Server kodni `sessionKey` bilan bog'lab, mDNS orqali topilgan serverda saqlaydi.
Client kodni kiritadi → serverga `PAIR_CODE` bilan murojaat → server `sessionKey`ni beradi
(faqat mDNS/lokal tarmoqda, bir martalik, `PAIR_CODE_TTL = 120s`).

> `sessionKey` **hech qachon** ochiq tarmoqqa yuborilmaydi. QR — offline (ekrandan o'qiladi).
> Qisqa kod yo'lida almashinuvni himoyalash uchun SPAKE2/PAKE tavsiya etiladi (v1.1); v1'da
> qisqa kod faqat ishonchli lokal tarmoqda va TTL bilan cheklangan.

### 2.2 Discovery (mDNS / NSD)

- Server `_uzatuv._tcp.local` xizmatini e'lon qiladi. TXT yozuvlari: `v=1`, `id=<serverId>`, `name=<name>`.
- Client NSD (`android.net.nsd`) bilan xizmatni topadi, `name`/`ip`/`port`ni oladi.
- `sessionKey` mDNS'da **YO'Q** (sir) — u faqat QR yoki qisqa kod orqali.

### 2.3 Handshake (ochiq JSON, length-prefixed, shifrlashgacha)

Handshake xabarlari **ochiq** (shifrlanmagan), lekin `sessionKey` bilan **autentifikatsiya** qilinadi (HMAC).
Handshake tugagach kanal AEAD bilan shifrlanadi.

```
Client                                             Server
  |  (TCP connect)                                   |
  |------------------ CLIENT_HELLO ----------------->|
  |<----------------- SERVER_HELLO ------------------|
  |------------------ CLIENT_AUTH ------------------>|
  |<----------------- SERVER_READY ------------------|
  |  === shu nuqtadan keyin hamma frame AEAD shifrlangan ===
  |------------------ (STREAM_CONFIG, VIDEO...) ---->|
```

**1) `CLIENT_HELLO`** (Client → Server, ochiq JSON):
```json
{
  "type": "CLIENT_HELLO",
  "protocolVersion": 1,
  "clientNonce": "BASE64_16BYTE",
  "serverId": "b3f1c2a4-...",
  "device": {
    "deviceId": "android-uuid",
    "name": "Samsung A54",
    "model": "SM-A546E",
    "androidSdk": 34,
    "screen": { "width": 1080, "height": 2340, "densityDpi": 420 }
  },
  "codecs": ["h265", "h264"]
}
```
- `codecs` — Client qo'llaydigan encoderlar, **afzallik tartibida** (birinchisi eng afzal).
- `serverId` — Client qaysi serverga ulanayotganini tasdiqlaydi (mDNS/QR'dan).

**2) `SERVER_HELLO`** (Server → Client, ochiq JSON):
```json
{
  "type": "SERVER_HELLO",
  "protocolVersion": 1,
  "serverNonce": "BASE64_16BYTE",
  "chosenCodec": "h264",
  "serverAuth": "BASE64_HMAC"
}
```
- `chosenCodec` — Server ham, Client ham qo'llaydigan **kelishilgan** kodek.
  Tanlash: Client `codecs` ro'yxatidan Server qo'llaydigan **birinchisi**. Hech biri mos kelmasa → `h264` (majburiy baza) yoki `ERROR`.
- `serverAuth = HMAC_SHA256(sessionKey, "uzatuv-server" || clientNonce || serverNonce)` (base64).

**3) `CLIENT_AUTH`** (Client → Server, ochiq JSON):
Client avval `serverAuth`ni tekshiradi (server `sessionKey`ni biladimi). To'g'ri bo'lsa:
```json
{
  "type": "CLIENT_AUTH",
  "clientAuth": "BASE64_HMAC"
}
```
- `clientAuth = HMAC_SHA256(sessionKey, "uzatuv-client" || clientNonce || serverNonce)` (base64).

**4) `SERVER_READY`** (Server → Client, ochiq JSON):
Server `clientAuth`ni tekshiradi. To'g'ri bo'lsa:
```json
{ "type": "SERVER_READY" }
```
Xato bo'lsa (auth mos emas, versiya nomos, kodek yo'q):
```json
{ "type": "ERROR", "code": "AUTH_FAILED", "message": "..." }
```
va ulanish uziladi.

### 2.4 Kalit hosil qilish (key derivation) va AEAD

`SERVER_READY`dan **keyin** ikkala tomon quyidagini hisoblaydi:

```
salt = clientNonce (16B) || serverNonce (16B)          // 32 bayt
okm  = HKDF-SHA256(ikm=sessionKey, salt=salt, info="uzatuv-v1", length=88)
  key_c2s      = okm[0:32]     // Client → Server yo'nalish kaliti
  key_s2c      = okm[32:64]    // Server → Client yo'nalish kaliti
  nonce_c2s_fix= okm[64:68]    // 4 bayt fixed prefix
  nonce_s2c_fix= okm[68:72]    // 4 bayt fixed prefix
  (okm[72:88] rezerv)
```

- **AEAD shifri:** `AES-256-GCM` (majburiy baza; ikkala platformada mavjud).
  Muqobil: `XChaCha20-Poly1305` (libsodium) — kelishilsa `SERVER_HELLO`da `aead` maydoni bilan (v1'da AES-GCM standart).
- **Nonce (12 bayt):** `nonce_fix (4B) || counter (uint64 big-endian, 8B)`.
  `counter` har yo'nalish uchun **alohida**, `0`dan boshlanadi, har frame'da **+1**. Takrorlanmasligi shart.
- **AAD:** bo'sh (`frameLen` allaqachon TCP oqimida yaxlitlikni ta'minlaydi; GCM tag butunlikni himoyalaydi).
- **Shifrlangan payload:** `AES-256-GCM(key_dir, nonce, plaintext=[channel||flags||channelPayload])` → `ciphertext || tag(16B)`.
  Frame: `uint32 frameLen` + `ciphertext||tag`. (`frameLen = len(ciphertext)+16`.)

> Har counter `2^63` ga yetsa yoki reconnect bo'lsa — yangi handshake (yangi nonce'lar) qilinadi.

---

## 3. CONTROL kanali (channel 0) xabarlari

Hammasi JSON (UTF-8), `type` maydoni majburiy. Yo'nalish: **S→C** = Server→Client, **C→S** = Client→Server.

| `type` | Yo'nalish | Maqsad |
|---|---|---|
| `STREAM_CONFIG` | S→C | Server so'ragan oqim parametrlari (o'lcham, fps, bitrate, kodek) |
| `CODEC_CONFIG` | C→S | Encoder config (SPS/PPS/VPS) — birinchi kadrdan oldin va o'zgarsa |
| `START` | S→C | Oqimni boshlash |
| `STOP` | S→C | Oqimni to'xtatish (sessiya ochiq qoladi) |
| `KEYFRAME_REQUEST` | S→C | Darhol IDR (keyframe) so'rovi |
| `SET_BITRATE` | S→C | Adaptiv: encoder bitrate'ini o'zgartir |
| `RESIZE` | C→S | Ekran o'lchami/aylanishi o'zgardi (yangi kenglik/balandlik) |
| `PING` | ikkalasi | Latency o'lchash |
| `PONG` | ikkalasi | `PING`ga javob |
| `STATS` | C→S | Ixtiyoriy telemetriya (fps, drop, encoder queue) |
| `DISCONNECT` | ikkalasi | Toza uzilish (sabab bilan) |
| `ERROR` | ikkalasi | Xato (kod + xabar) |

### 3.1 Xabar sxemalari

**`STREAM_CONFIG`** (S→C) — Server oqimni qanday xohlashini aytadi:
```json
{
  "type": "STREAM_CONFIG",
  "codec": "h264",
  "maxWidth": 1080,
  "maxHeight": 1920,
  "fps": 60,
  "bitrateKbps": 8000,
  "keyframeIntervalSec": 2
}
```
- `maxWidth/maxHeight` — Client ekranini shu chegaraga moslab kichraytiradi (aspect saqlanadi).
  `0` = Client o'z tabiiy o'lchamini ishlatadi.

**`CODEC_CONFIG`** (C→S) — encoder chiqargan config (H.264: SPS+PPS; H.265: VPS+SPS+PPS):
```json
{
  "type": "CODEC_CONFIG",
  "codec": "h264",
  "width": 1080,
  "height": 2340,
  "csd": "BASE64_ANNEXB_CONFIG_NALS"
}
```
- `csd` — MediaCodec `BUFFER_FLAG_CODEC_CONFIG` bufer(lar)i, Annex-B (start-code `00 00 00 01`) formatda, base64.

**`START` / `STOP`**:
```json
{ "type": "START" }
{ "type": "STOP" }
```

**`KEYFRAME_REQUEST`** (S→C) — yangi ulanish, paket yo'qolishi, yoki fullscreen'ga o'tishda:
```json
{ "type": "KEYFRAME_REQUEST" }
```
Client darhol IDR chiqaradi (`MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME`).

**`SET_BITRATE`** (S→C) — adaptiv bitrate:
```json
{ "type": "SET_BITRATE", "bitrateKbps": 4000 }
```
Client `MediaCodec.PARAMETER_KEY_VIDEO_BITRATE` bilan darhol qo'llaydi.

**`RESIZE`** (C→S) — ekran aylandi/o'lchami o'zgardi:
```json
{ "type": "RESIZE", "width": 2340, "height": 1080, "rotation": 90 }
```
- `rotation` — 0/90/180/270. Server render'ni moslaydi. Odatda ketidan yangi `CODEC_CONFIG` + keyframe keladi.

**`PING` / `PONG`** — latency (RTT) o'lchash:
```json
{ "type": "PING", "seq": 42, "tSentMs": 1699999999999 }
{ "type": "PONG", "seq": 42, "tSentMs": 1699999999999 }
```
So'rovchi `PONG`da o'zining `tSentMs`ini qaytadan oladi → `RTT = now - tSentMs`. Standart interval `PING_INTERVAL = 2s`.

**`STATS`** (C→S, ixtiyoriy):
```json
{
  "type": "STATS",
  "fps": 58, "encBitrateKbps": 7800,
  "encQueue": 1, "droppedFrames": 0, "tMs": 1699999999999
}
```

**`DISCONNECT`**:
```json
{ "type": "DISCONNECT", "reason": "user_stopped" }
```
Sabablar: `user_stopped`, `screen_off`, `permission_revoked`, `server_shutdown`, `idle_timeout`.

**`ERROR`**:
```json
{ "type": "ERROR", "code": "PROTOCOL_ERROR", "message": "..." }
```
Kodlar: `AUTH_FAILED`, `VERSION_MISMATCH`, `NO_COMMON_CODEC`, `PROTOCOL_ERROR`, `INTERNAL`.

---

## 4. VIDEO kanali (channel 1)

`channel = 1` frame'ning payload'i (`channel||flags`dan keyin):

```
+---------------------+-----------+-------------------------------+
| uint64 ptsUs        | uint32 seq| encoded access unit (AU) bytes|
| (big-endian, µs)    |           | (Annex-B, start-code bilan)   |
+---------------------+-----------+-------------------------------+
```

- `ptsUs` — kadr presentation timestamp, mikrosekund (MediaCodec `bufferInfo.presentationTimeUs`).
- `seq` — 0'dan boshlanadi, har AU'da +1. Paket yo'qolishini aniqlash uchun.
- **AU formati:** H.264/H.265 **Annex-B** (NAL'lar `00 00 00 01` start-code bilan). Config (SPS/PPS/VPS)
  odatda `CODEC_CONFIG` control xabari orqali oldindan yuboriladi. Agar `flags.CONFIG` yoqilgan bo'lsa,
  config NAL'lar shu AU boshida keladi (keyframe bilan birga).
- `flags.KEYFRAME` — bu AU IDR (mustaqil dekodlanadi).

> Server kadrlarni `seq` bo'yicha tartibda kutadi. `seq` sakrasa (yo'qolish) → `KEYFRAME_REQUEST`.
> WebCodecs `VideoDecoder`: keyframe = `type:"key"`, aks holda `"delta"`; `timestamp = ptsUs`.

---

## 5. AUDIO kanali (channel 2) — 🔒 REZERV (v1'da yo'q)

Audio v1'da **implementatsiya qilinmaydi**, lekin protokol/transport uni **buzmasdan** qo'shishga tayyor:

- `channel = 2` allaqachon ajratilgan. v1 tomonlari `channel=2` frame kelsa **e'tiborsiz** qoldiradi (crash emas).
- Kelajakdagi format (hujjatlashtirilgan, majburiy emas):
  ```
  +---------------------+-------------------------------+
  | uint64 ptsUs        | encoded audio (Opus yoki AAC) |
  +---------------------+-------------------------------+
  ```
- Audio codec negotiation `CLIENT_HELLO.audioCodecs` (kelajak maydoni) orqali qo'shiladi.
- `STREAM_CONFIG`ga `audio: {codec, sampleRate, channels}` (kelajak) qo'shiladi.

> Shuning uchun `channel` maydoni allaqachon bor, `flags` kengaytiriladigan, framing audio'ga befarq.

---

## 6. Sessiya hayotiy sikli va reconnect

1. **Discovery** (mDNS) yoki **QR/kod** → Client server manzili + `sessionKey`ni oladi.
2. **TCP connect** → **Handshake** (2.3) → **key derivation** (2.4).
3. Server `STREAM_CONFIG` + `START` yuboradi. Client `CODEC_CONFIG` + video oqimini boshlaydi.
4. Davomida: `PING/PONG` (latency), `SET_BITRATE` (adaptiv), `KEYFRAME_REQUEST`, `RESIZE`.
5. **Uzilish:** TCP uzilsa yoki `PING` javobsiz qolsa (`PONG_TIMEOUT = 6s`):
   - Client `RECONNECT_BACKOFF` (1s, 2s, 4s… max 15s) bilan **qayta ulanadi**.
   - Reconnectda **yangi handshake** (yangi nonce'lar). `sessionKey` **o'sha** (agar hali amal qilsa).
   - Server yangi sessiyani eski `deviceId` bilan bog'lab, o'sha oynaga tiklaydi.
6. **Toza to'xtatish:** `DISCONNECT` → TCP yopiladi.

### 6.1 Adaptiv bitrate (Faza 4 mantiqi, protokol tayyor)

Server RTT (`PING/PONG`) va kadr yetib kelish ritmiga qarab `SET_BITRATE` yuboradi:
- RTT oshsa / kadrlar kechiksa → bitrate pasaytiriladi.
- Barqaror bo'lsa → asta oshiriladi (max `STREAM_CONFIG.bitrateKbps`gacha).
- Aniq algoritm `packages/desktop` da (Faza 4), lekin protokol xabari (`SET_BITRATE`) allaqachon bor.

---

## 7. Konstantalar (yagona manba: `packages/protocol/src/constants.ts`)

| Konstanta | Qiymat |
|---|---|
| `PROTOCOL_VERSION` | `1` |
| `DEFAULT_PORT` | `8787` |
| `MDNS_SERVICE_TYPE` | `_uzatuv._tcp` |
| `MAX_FRAME_LEN` | `16 * 1024 * 1024` (16 MiB) |
| `PING_INTERVAL_MS` | `2000` |
| `PONG_TIMEOUT_MS` | `6000` |
| `PAIR_CODE_TTL_MS` | `120000` |
| `RECONNECT_BACKOFF_MS` | `[1000, 2000, 4000, 8000, 15000]` |
| `CHANNEL.CONTROL` | `0` |
| `CHANNEL.VIDEO` | `1` |
| `CHANNEL.AUDIO` | `2` (rezerv) |
| `FLAG.KEYFRAME` | `0x01` |
| `FLAG.CONFIG` | `0x02` |
| `FLAG.END_OF_STREAM` | `0x04` |
| `AEAD` | `AES-256-GCM` |
| `HKDF_INFO` | `"uzatuv-v1"` |
| `HMAC_SERVER_LABEL` | `"uzatuv-server"` |
| `HMAC_CLIENT_LABEL` | `"uzatuv-client"` |

---

## 8. Baza kafolatlari (majburiy)

- **H.264 (AVC)** — ikkala tomonda **majburiy** baza kodek. H.265 faqat ikkalasi qo'llasa.
- Handshake **har doim** `sessionKey` bilan autentifikatsiyalanadi (MITM'dan himoya).
- Handshakedan keyin **hamma** frame shifrlangan (control ham, video ham).
- Noma'lum `channel` yoki `type` → **e'tiborsiz** qoldiriladi (forward-compat), crash emas.
- `frameLen > MAX_FRAME_LEN` yoki AEAD tag xato → ulanish darhol uziladi (`PROTOCOL_ERROR`).
