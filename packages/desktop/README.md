# @uzatuv/desktop

Uzatuv'ning **desktop** (PC) qismi — Android ekranini qabul qilib ko'rsatuvchi
Electron ilova. PC bu yerda **server** (qabul qiluvchi): TCP tinglaydi, ulangan
telefonlardan video oqimini oladi va ekranda ko'rsatadi.

Stack: **Electron + Vite + React + TypeScript (strict) + Tailwind CSS v4**.
Wire-protokol va crypto `@uzatuv/protocol` paketidan olinadi (nusxa ko'chirilmaydi).

## Tuzilma

```
src/
  main/            Electron main — TransportServer/SessionManager (net TCP, crypto)
    index.ts         ilova oynasi + IPC ko'prik
    SessionManager.ts  TCP listen, mDNS e'lon, pairing (QR/kod)
    Session.ts         bitta ulanish: handshake + AEAD + frame demux
  preload/         contextBridge orqali xavfsiz API (window.uzatuv)
  shared/          IPC kanal nomlari va turlar (main+preload+renderer)
  renderer/        React UI (o'zbekcha)
    src/
      VideoRenderer.ts  WebCodecs VideoDecoder ustidagi qatlam
      videoBus.ts       video AU'larni deviceId bo'yicha tarqatish
      components/       PairingScreen, DeviceGrid, DeviceView, FullscreenView
```

Butun tarmoq va crypto **faqat main process**da ishlaydi (Node `crypto`/`net`).
Renderer faqat dekod + render qiladi; `@uzatuv/protocol`dan faqat `import type`.

## Ishga tushirish (dev)

Avval `@uzatuv/protocol` build qilingan bo'lishi kerak (dist bor):

```bash
# monorepo ildizida
cd packages/protocol && npm install && npm run build

# so'ng desktop
cd ../desktop
npm install
npm run dev        # Electron + Vite HMR
```

Ilova ochilgach bosh ekranда QR kod chiqadi. Telefon (Android klient) shu QR'ni
skanerlab, bir xil WiFi (yoki USB tethering) orqali ulanadi.

## Skriptlar

| Skript | Vazifa |
|---|---|
| `npm run dev` | Electron'ni Vite HMR bilan ishga tushirish |
| `npm run build` | main + preload + renderer'ni `out/` ga build qilish |
| `npm run typecheck` | TS tekshiruvi (node + web loyihalari) |

## Holat (FAZA 1 skeleti)

Ishlaydi (kod to'liq, typecheck/build toza):
- TCP server, port band bo'lsa keyingi bo'shini tanlaydi.
- To'liq handshake: CLIENT_HELLO → SERVER_HELLO → CLIENT_AUTH → SERVER_READY,
  HMAC autentifikatsiya, HKDF kalit chiqarish, AES-256-GCM kanal.
- Handshakedan keyin STREAM_CONFIG + START + KEYFRAME_REQUEST yuboriladi.
- Video/control frame'larni ochish, `unpackVideoPayload`, IPC orqali renderer'ga.
- PING/PONG (2s) — liveness va RTT.
- QR kod (pairing URI), qisqa kod, WiFi/USB yo'riqnoma.
- Grid + fullscreen (ESC), holat/FPS/RTT ko'rsatkichlari.
- WebCodecs dekod pipeline'i to'liq yozilgan (keyframe gating, xatoda reset +
  yangi keyframe so'rash).

TODO / sinalmagan:
- **Real qurilmasiz dekod sinalmagan** — haqiqiy Android oqimisiz WebCodecs
  dekodi jonli tekshirilmadi. Video kelmaganda DeviceView namunaviy test-pattern
  chizadi (canvas render'i ishlayotgani shu bilan ko'rinadi).
- WebCodecs Annex-B rejimi: kodek satri (`avc1.*`/`hvc1.*`) SPS'dan aniq
  chiqarilmagan, standart profil ishlatilgan; kerak bo'lsa avcC/hvcC `description`
  ga o'tiladi.
- mDNS e'loni ixtiyoriy (`bonjour-service`); topilmasa QR/kod baribir ishlaydi.
- Qisqa kod → sessionKey server-side lookup hali ulanmagan (faqat ko'rsatiladi);
  to'liq ishlaydigan yo'l — QR (URI).
- FAZA 1 pairing soddalashtirilgan: server bitta `sessionKey` yaratadi va barcha
  ulanishlar shu bilan autentifikatsiya qiladi (har-sessiya alohida kalit — keyin).
