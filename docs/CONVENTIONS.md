# Uzatuv — Kod Konvensiyalari va Git Strategiyasi

## 1. Til va nomlash

- **UI matnlari:** to'liq **o'zbek** (lotin). Kod ichi (o'zgaruvchi, funksiya, commit) — **ingliz**.
- **Fayl/paket nomlari:** `kebab-case` (TS), Kotlin — `PascalCase.kt`.
- **TS:** `camelCase` (o'zgaruvchi/funksiya), `PascalCase` (tip/klass), `UPPER_SNAKE` (const).
- **Kotlin:** `camelCase`, `PascalCase` (klass), `UPPER_SNAKE` (const).
- **Wire xabar `type`:** `UPPER_SNAKE` (`CLIENT_HELLO`, `SET_BITRATE`) — protokolga mos.

## 2. Format va lint

| Til | Format | Lint |
|---|---|---|
| TypeScript | Prettier (2 space, `;`, `"`) | ESLint (`@typescript-eslint`, strict) |
| Kotlin | ktlint / Android Studio default | Android Lint |

- TS: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitAny`. `any` ishlatilmaydi (zarur bo'lsa `unknown`).
- Commitdan oldin: TS tomonlarda `npm run typecheck` toza bo'lsin.

## 3. Umumiy turlar — faqat `packages/protocol`

- Wire bilan bog'liq har qanday tip/konstanta **faqat** `packages/protocol`da yashaydi.
- Desktop `import`, Android `kotlin/` mirror'ni ishlatadi. **Nusxa ko'chirish taqiqlanadi.**
- Mirror (`protocol/kotlin/`) TS bilan bir xilligi test orqali tekshiriladi (bir xil vektorlar).

## 4. Git strategiyasi

```
main        — barqaror, release. Faqat develop'dan merge.
develop     — integratsiya. Agentlar shu yerga PR qiladi.
feat/<rol>-<qisqa>   — har agentning ish branchi
  feat/android-capture, feat/transport-framing, feat/desktop-decode,
  feat/ui-connect-screen, feat/qa-latency-bench
```

- **Kichik, tez-tez merge** — katta branch to'planmasin (konflikt kamayadi).
- Har PR: bitta paketga tegadi (imkon qadar). Boshqa paketga tegish kerak bo'lsa — PM bilan.
- `protocol` o'zgarishi = **hamma**ga ta'sir → alohida PR, PM review, versiya oshirish.
- Commit xabari: ingliz, imperativ, aniq. Namuna:
  ```
  transport: add length-prefixed FrameParser with 16MiB guard

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

## 5. Modul chegaralari (qattiq qoida)

- Har agent **faqat o'z paketiga** yozadi (ARCHITECTURE.md 2-bo'lim egaligi).
- Kontrakt (interfeys) o'zgarishi = PM orqali + `ARCHITECTURE.md`/`PROTOCOL.md` yangilanadi.
- Boshqa paketning ichki detaliga tayanma — faqat eksport qilingan kontraktga.

## 6. Test

- `protocol`: har funksiya uchun unit test (framing round-trip, crypto vektorlar, pairing parse).
- Cross-language: TS va Kotlin bir xil test vektorlarida bir xil natija berishi shart.
- Desktop/Android: kamida "duxa" (smoke) test — modul yuklanadi, asosiy oqim ishga tushadi.

## 7. Xavfsizlik

- `sessionKey`, nonce, kalitlar **hech qachon** logga yozilmaydi.
- Crypto — standart kutubxonalar (Node `crypto`, Kotlin `javax.crypto`/Tink). O'zimiz shifr yozmaymiz.
- Handshake har doim autentifikatsiyalanadi (PROTOCOL 2.3).
