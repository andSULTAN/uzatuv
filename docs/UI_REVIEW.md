# Uzatuv — Desktop UI/UX ko'rigi

> Ko'rilgan qism: `packages/desktop/src/renderer` — ikki tomonlama (qabul + uzatish)
> yangi UI. Baholash usuli: kod va oqim tahlili (Electron `window.uzatuv` IPC +
> WebCodecs/canvas — brauzerda mustaqil render qilib bo'lmadi, shuning uchun
> Tailwind klasslari, matnlar va holat oqimi statik tekshirildi).
>
> Har topilma: **fayl:joy → muammo → tavsiya**. Muhimlik bo'yicha tartiblangan.

---

## Umumiy taassurot

Asos mustahkam: qorong'i mavzu bir xil, orqaga tugmalari bir uslubda, bo'sh/xato
holatlarning ko'pi qamrab olingan, QR + qisqa kod yaxshi ko'rsatilgan, HomeScreen'dagi
ikki rejim kartasi tushunarli. Asosiy kamchiliklar — **qabul va uzatish oqimlari
o'rtasidagi nomuvofiqlik** (yo'riqnoma uslubi, status ko'rsatkichi, aksent rang) va
**bir nechta xato/til nuqtasi**. Bular tuzatilsa, UI professional darajaga chiqadi.

Umumiy baho: **o'rta — bir nechta aniq tuzatish kerak** (kritik buzilish yo'q, lekin
oqim aniqligi va mutanosiblik bo'yicha sezilarli yaxshilash bor).

---

## Yuqori muhimlik

### 1. Uzatish yo'riqnomasi bitta paragraf — qabuldagi qadamlar bilan mos emas
**Fayl:** `components/TransmitScreen.tsx:118-123` (va taqqoslash uchun
`components/PairingScreen.tsx:86-105`)

**Muammo:** Qabul qilish ekranida ulanish yo'riqnomasi chiroyli raqamli qadamlar
bilan berilgan (`Step 1/2/3` — WiFi, QR, USB). Uzatish ekranida esa xuddi shu
darajada muhim "uzatuv:// havolani qayerdan olish va joylash" bo'yicha yo'riqnoma
bitta zich paragrafga siqilgan. Foydalanuvchi uchun eng chalkash qadam aynan shu
(havolani boshqa qurilmadan topib, nusxalab, bu yerga joylash), lekin u eng kam
tarkiblangan holda ko'rsatilgan. Bu ham **oqim aniqligi**, ham **mutanosiblik**
muammosi.

**Tavsiya:** Uzatish oqimini ham 2-3 raqamli qadamga bo'lish (PairingScreen'dagi
`Step` komponentiga o'xshash):
1. Qabul qiluvchi qurilmada Uzatuv'ni "Qabul qilish" rejimida oching.
2. U yerdagi `uzatuv://` havolani nusxalang.
3. Havolani quyidagi maydonga joylang va "Uzatishni boshlash"ni bosing.
Iloji bo'lsa `Step` komponentini umumiy qilib ikki ekranда qayta ishlatish.

---

### 2. Ekran ulashish rad etilganda xom inglizcha xato ko'rsatiladi
**Fayl:** `ScreenTransmitter.ts:52` (`getDisplayMedia`) → `TransmitScreen.tsx:50-53`
(`tx.start(cfg).catch((e) => setError(e.message))`)

**Muammo:** Foydalanuvchi ekran tanlash oynasida "Bekor qilish"ni bossa yoki ruxsat
bermasa, brauzer `NotAllowedError` xatosini beradi va uning `e.message` (masalan
"Permission denied" yoki "Permission dismissed") **to'g'ridan-to'g'ri, inglizcha**
foydalanuvchiga chiqadi. Butun UI o'zbekcha bo'lgani uchun bu keskin ajralib turadi
va tushunarsiz. Xuddi shu holat `encoder xato: ...` uchun ham amal qiladi. Bu — task
6-bandi ("ekran ulashish rad etildi") to'g'ridan-to'g'ri tegadigan joy.

**Tavsiya:** Umumiy xatolarni o'zbekchaga map qilish. Masalan `NotAllowedError` →
"Ekran ulashishga ruxsat berilmadi. Qayta urinib ko'ring."; nomsiz/noma'lum xato →
umumiy "Ekran uzatishni boshlab bo'lmadi." Xom `e.message` ni faqat texnik tafsilot
sifatida (ixtiyoriy, kichikroq) ko'rsatish.

---

### 3. Qabul va uzatishda status ikki xil ko'rinish va ikki xil so'z bilan
**Fayl:** `components/StatusBadge.tsx` (qabul) vs `components/TransmitScreen.tsx:169-180`
(uzatishning ichki `StateBadge`)

**Muammo:** Bir xil ulanish holatlari ikki ekranda butunlay boshqacha ko'rsatilgan:
- **Qabul (`StatusBadge`):** yumaloq "pill" + rangli nuqta, so'zlar: `Ulandi`,
  `Ulanmoqda`, `Tanishuv`, `Uzildi`.
- **Uzatish (`StateBadge`):** oddiy rangli matn, so'zlar: `● Uzatilmoqda`,
  `Ulanmoqda…`, `Uzildi`, `Tayyor`.

Ya'ni `READY` holati bir joyda "Ulandi", ikkinchisida "● Uzatilmoqda"; uslub (pill vs
oddiy matn) ham har xil. Bu **mutanosiblik** buzilishi va foydalanuvchida "bular
boshqa-boshqa narsa" degan taassurot qoldiradi.

**Tavsiya:** Bitta umumiy status komponentini ishlatish (yoki hech bo'lmasa bir xil
vizual uslub — pill + nuqta). So'zlarni ma'no bo'yicha moslash: kontekstga qarab
"Ulandi"/"Uzatilmoqda" farqi qolishi mumkin, lekin uslub va ranglar bir xil bo'lsin.

---

## O'rta muhimlik

### 4. Ko'rinadigan matnda kiril harfi aralashib qolgan
**Fayl:** `components/HomeScreen.tsx:25`

**Muammo:** "…shu kompyuter**да** ko'rsatish." — bu yerdagi "да" lotincha emas,
**kiril** harflari. Foydalanuvchiga ko'rinadigan matnda bo'lgani uchun shrift/ko'rinish
biroz g'alati chiqishi va tekshiruvda "xato" sifatida ko'zga tashlanishi mumkin.
(Xuddi shunday aralashuv `TransmitScreen.tsx:20` va `:96` da ham bor, lekin ular kod
izohi — ko'rinmaydi, past muhimlik.)

**Tavsiya:** "kompyuter**da**" (lotin "da") ga tuzatish. Butun renderer bo'yicha kiril
harflarini bir marta tekshirib chiqish tavsiya etiladi.

---

### 5. HomeScreen kartalaridagi badge semantikasi aralash
**Fayl:** `components/HomeScreen.tsx:26, 35`

**Muammo:** Ikki karta badge'i bir xil vizual joyda, lekin ma'no jihatidan har xil:
- Qabul kartasi: **jonli holat** — "2 ta ulangan" / "Tinglanmoqda".
- Uzatish kartasi: **xususiyat eslatmasi** — "Ekran + (tez orada ovoz)".

Foydalanuvchi ikkalasini ham status deb o'qishi mumkin, natijada "Ekran + (tez orada
ovoz)" chalkash tuyuladi. Bu **ierarxiya/ma'no** nomuvofiqligi.

**Tavsiya:** Uzatish badge'ini ham holatga aylantirish (masalan "Uzatishga tayyor"),
"ovoz keyin qo'shiladi" eslatmasini esa desc yoki kichik izoh sifatida ajratib berish.

---

### 6. Uzatishning faol holatida status prominence pastroq
**Fayl:** `components/TransmitScreen.tsx:151-154`

**Muammo:** Ekran uzatilayotganda foydalanuvchi uchun eng muhim ma'lumot — "hozir
ishlayaptimi va kimga uzatilmoqda". Ayni damda bu `text-sm` (StateBadge + "→ nomi")
bilan preview ostida kichik ko'rsatilgan. Video preview asosiy o'rinni egallaydi,
biroq holat/qabul qiluvchi nomi juda muted.

**Tavsiya:** Faol holatда statusni kattaroq/aniqroq qilish (masalan `text-base`,
qabul qiluvchi nomini oldinga chiqarish: "**Ali-PC** ga uzatilmoqda"). "To'xtatish"
tugmasi allaqachon yaxshi ajralib turadi — muvozanat uchun status ham ko'zga
tashlansin.

---

### 7. Aksent rang va sarlavha atamalari oqim bo'ylab uzluksiz emas
**Fayl:** `components/HomeScreen.tsx:36` (emerald aksent) vs
`components/TransmitScreen.tsx:141` (sky tugma); `App.tsx:51` vs `TransmitScreen.tsx:111`

**Muammo:**
- **Rang:** HomeScreen'da uzatish kartasi **emerald** aksent bilan belgilangan, lekin
  uzatish ekraniga kirilгач asosiy tugma va fokus rangi **sky** (qabul rangi). Ya'ni
  "uzatish = yashil" degan vizual ishora ekran ichida yo'qoladi — wayfinding uziladi.
- **Atama/uslub:** HomeScreen kartasi "**Uzatish**", ekran header'i esa "**Ekran
  uzatish**"; qabul header title `font-bold`, uzatish header title `font-semibold`.

**Tavsiya:** Uzatish oqimini emerald aksent bilan davom ettirish (tugma, fokus, badge)
yoki ataylab hamma joyda sky ga standartlashtirish — lekin bittasini tanlab, izchil
qilish. Header sarlavhalarини bir xil atama va bir xil qalinlikka keltirish.

---

## Past muhimlik

### 8. PairingScreen ichida takroriy katta "Uzatuv" sarlavhasi
**Fayl:** `components/PairingScreen.tsx:78`

**Muammo:** Qabul rejimida yuqori header allaqachon "Qabul qilish" deб turadi, lekin
o'ng ustunda yana `text-3xl` "Uzatuv" h1 bor. Ikki katta sarlavha bir ekranda —
ierarxiya biroz shovqinli.

**Tavsiya:** Bu yerdagi h1 ni kichraytirish yoki olib tashlab, to'g'ridan yo'riqnoma
matnidan boshlash (brend nomi header'да yetarli). Ahamiyatsiz, lekin toza bo'ladi.

### 9. "Uzatishni boshlash" bosilgach qisqa muddat feedback bo'lmasligi mumkin
**Fayl:** `components/TransmitScreen.tsx:80-97, 115`

**Muammo:** `transmitStart` muvaffaqiyatли bo'lsa-yu, holat hali `IDLE` bo'lib tursa
(qabul qiluvchidan `STREAM_CONFIG` kelmaguncha), sozlash ko'rinishi o'zgarmaydi va
foydalanuvchi "bosdimmi-yo'qmi" deб o'ylashi mumkin. Ekran tanlash oynasi ham faqat
`STREAM_CONFIG` kelgach ochiladi.

**Tavsiya:** Tugma bosilgach darhol yengil "Ulanmoqda…" holatiga o'tkazish yoki
tugmani "Ulanmoqda…" ko'rinishига o'zgartirib bloklash (ikki marta bosishning ham
oldini oladi).

### 10. Ovoz-toggle to'g'ri ko'rsatilgan (ijobiy eslatma)
**Fayl:** `components/TransmitScreen.tsx:132-135`

Ovoz checkbox'i `disabled` + `cursor-not-allowed` + kulrang + "(tez orada)" bilan
aniq ko'rsatilgan — bu **yaxshi bajarilgan**, foydalanuvchi buni ishlamaydigan/kelajak
funksiya deб tushunadi. O'zgartirish shart emas.

---

## Qisqa xulosa (ustuvorlik tartibida)

1. Uzatish yo'riqnomasini raqamli qadamlarга aylantirish (qabul bilan parity).
2. Ekran ulashish rad etilгандаги xatoni o'zbekchaga map qilish.
3. Status ko'rsatkichini (qabul/uzatish) bitta uslub + izchil so'zga keltirish.
4. HomeScreen'даги kiril "да" ni tuzatish.
5. Badge semantikasi, aksent rang va header atamalarini izchil qilish.

Kritik (ilovani buzadigan) muammo topilmadi. Yuqoridagilar tuzatilsa, oqim aniqligi
va professional ko'rinish sezilarли yaxshilanadi.
