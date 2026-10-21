# 🤖 Telegram Botni 24/7 Kechayu-Kunduz Bepul Ishlatish Qo'llanmasi

Ushbu qo'llanmada Telegram botingiz kompyuteringiz yoki brauzeringiz o'chiq bo'lgan vaqtda ham **24/7 kechayu-kunduz mutlaqo BEPUL** ishlab turishi va bot orqali tushgan barcha yangi bemorlar hamda qabullar **CRM saytiga uzluksiz kelib turishini** ta'minlash yo'li tushuntirilgan.

---

## ❓ 1. Nima sababdan oflayn turgan vaqtda bot ishlamay qoladi?

- **Sababi:** Google AI Studio yoki brauzeringizdagi test oynasi — bu vaqtinchalik ishlab chiquvchi muhiti (sandbox).
- Siz brauzer oynasini yopganingizda yoki kompyuteringizni o'chirganingizda, bulutli muhit resurslarni tejash uchun **avtomatik uyqu (Sleep / Pause)** rejimiga o'tadi.
- Server jarayoni to'xtagani sababli Telegram bot ham vaqtincha xabarlarga javob bermay qoladi. Siz qayta saytga kirganingizda muhit qayta uyg'onadi va bot yana ishlay boshlaydi.

---

## 🚀 2. Botni 24/7 BEPUL Doimiy Ishlatish Yechimi (0$ xarajat)

Biz ushbu loyihada ma'lumotlar bazasini allaqachon **Google Cloud Firestore (24/7 doimiy bulut)** bilan integratsiya qilib qo'yganmiz. Shu sababli, botni istalgan bepul serverda ishga tushirsangiz ham, barcha ma'lumotlar to'g'ridan-to'g'ri umumiy bulutga yoziladi va **saytingizga darhol kelib turaveradi**!

### 🌟 1-USUL: Render.com orqali 100% BEPUL 24/7 yoqish (Eng oson va tavsiya etiladi)

1. **GitHub-ga yuklash:**
   - Ushbu loyihani o'zingizning GitHub hisobingizga yuklang (Push qiling).
2. **Render.com-da hisob ochish:**
   - [Render.com](https://render.com) saytiga kiring va bepul (Free) ro'yxatdan o'ting.
3. **Yangi xizmat qo'shish:**
   - **"New +"** tugmasini bosing -> **"Web Service"** ni tanlang.
   - GitHub profilingizdagi ushbu loyihani tanlang.
4. **Sozlamalar (Render.yaml avtomatik aniqlaydi):**
   - **Build Command:** `npm install --legacy-peer-deps && npm run build`
   - **Start Command:** `npm run start`
   - **Plan:** Free ($0/month)
5. **Environment Variables (Atrof-muhit o'zgaruvchilari):**
   - `TELEGRAM_BOT_TOKEN` = O'zingizning Telegram Bot tokeningiz (`@BotFather` dan olingan).
   - `CLINIC_NAME` = Sizning klinikangiz nomi (masalan: `Stomatologiya Klinikasi`).
   - `GEMINI_API_KEY` = AI tahlil uchun Gemini API kaliti (ixtiyoriy).
6. **"Create Web Service"** tugmasini bosing!
   - 1 daqiqada sizga shaxsiy doimiy havola (masalan: `https://my-dental-clinic.onrender.com`) beriladi.
   - Bot ham, CRM sayti ham 24/7 kechayu-kunduz hech qanday uzilishsiz bepul ishlaydi!

---

### 💻 2-USUL: O'z kompyuteringiz yoki VPS-da mustaqil fon rejimida yoqish

Loyihada **`bot-standalone.ts`** mustaqil bot yurgizgichi yaratilgan.

Terminalda quyidagi bitta buyruqni bering:
```bash
npm run bot
```
yoki:
```bash
npx tsx bot-standalone.ts
```

Agar Linux yoki VPS serveringiz bo'lsa, **PM2** yordamida uni fonda abadiy ishlab turadigan qilib qo'yishingiz mumkin:
```bash
npm install -g pm2
pm2 start "npx tsx bot-standalone.ts" --name "dental-telegram-bot"
pm2 save
pm2 startup
```

---

## 🔄 3. Saytga ma'lumotlar qanday qilib kelib turadi?

1. Bemor Telegram botga kirib **/start** bosadi yoki yangi navbat band qiladi.
2. Bot bemorning F.I.Sh, telefon raqami, shikoyati va tanlagan shifokori hamda vaqtini qabul qiladi.
3. Ushbu ma'lumot darhol **Google Cloud Firestore** doimiy bulutli bazasiga saqlanadi.
4. Serverdagi **SSE (Server-Sent Events) jonli oqim** orqali administratorning kompyuteridagi CRM dasturiga (Bosh sahifa, Bemorlar, Qabullar va Moliyaga) yangi bildirishnoma yetib keladi va jadval avtomatik yangilanadi!
5. Agar brauzer yopiq bo'lsa ham, keyingi safar sayt ochilganda barcha yangi bemorlar va buyurtmalar to'liq saqlanib turgan bo'ladi!

---

## 🛠 4. CRM Ichidan Bot Tokenini O'rnatish

Endi server kodlarini o'zgartirish shart emas:
1. CRM saytida **Sozlamalar (Settings)** -> **🤖 Telegram Bot** bo'limiga o'ting.
2. O'zingizning Telegram Bot tokeningizni kiriting.
3. **"💾 Saqlash va Botni ishga tushirish"** tugmasini bosing.
4. Bot bir zumda yangi token bilan ishga tushadi!
