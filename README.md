# 🍯 Milliy Holva — Rasmiy B2B Distribyutor Platformasi va Telegram Bot Tizimi

Ushbu tizim **Milliy Holva** brendi ostidagi mahsulotlarni (**Milliy holva premium** va **Milliy holva an'anaviy**) kofe xonalar, do'konlar va supermarketlarga yetkazib berish, mijozlardan onlayn buyurtma qabul qilish, markaziy ombor zaxirasini yuritish hamda **Real Telegram Bot** orqali tezkor bildirishnomalar olish uchun mo'ljallangan.

---

## 🔐 Tizimga Kirish Ma'lumotlari (Login va Parollar)

> **Muhim:** Xavfsizlik maqsadida login va parollar dasturning kirish (Login) sahifasida ko'rsatilmaydi. Quyidagi ma'lumotlar faqat biznes asoschilari uchun mo'ljallangan:

### 👑 1. Biznes Asoschilari (Adminlar — 2 ta hisob)
Ikkala asoschi ham tizimga kirganda **100% bir xil onlayn bulutli bazani** (mijozlar, lokatsiyalar, buyurtmalar, ombor qoldig'i, narxlar va harakatlar tarixini) ko'radi:

| Asoschi maqomi | Login | Parol | Huquqlari |
| :--- | :--- | :--- | :--- |
| **Asoschi #1 (Siz)** | `ibrohim` | `123456` | To'liq Admin: Buyurtmalar, Mijozlarni tahrirlash/o'chirish, Narxlarni o'zgartirish, Ombor, Telegram Bot |
| **Asoschi #2 (Do'stingiz / Hamkor)** | `dostim` | `123456` | To'liq Admin: Buyurtmalar, Mijozlarni tahrirlash/o'chirish, Narxlarni o'zgartirish, Ombor, Telegram Bot |

*(Eslatma: Admin panelidagi **"Real Telegram Bot & Asoschilar"** bo'limidan har bir asoschi o'z login va parolini istalgan vaqtda yangilashi mumkin).*

---

### ☕ 2. Namuna Mijoz Hisoblari (Sinab ko'rish uchun)
Mijozlar kirish oynasidagi **"Mijoz Ro'yxatdan O'tishi"** tugmasi orqali o'zlari yangi hisob ochishlari mumkin. Shuningdek, tayyor mijoz kabinetini tekshirib ko'rish uchun quyidagi namuna hisoblardan foydalanishingiz mumkin:

| Mijoz maskani | Turi | Login | Parol |
| :--- | :--- | :--- | :--- |
| **Navro'z Coffee Roasters** | Kofe xona | `navroz` | `123456` |
| **The Sweet Haven Confectionery** | Do'kon | `sweethaven` | `123456` |
| **Urban Coffee Hub** | Kofe xona | `urbancoffee` | `123456` |
| **Baraka Gourmet Market** | Supermarket | `baraka` | `123456` |

*(Mijoz o'z login va paroli bilan kirganda unga **faqatgina Buyurtma Berish Kabineti** ko'rinadi).*

---

## 💰 Mahsulot Narxlarini O'zgartirish
Admin sifatida tizimga kirgach:
1. Yuqori menyudan **"💰 Narxlar & Mahsulotlar"** bo'limiga o'ting.
2. **Milliy holva premium** va **Milliy holva an'anaviy** mahsulotlarining **Ulgurji narxi**, **Chakana tavsiya narxi**, **Qadoq vazni**, **Nomi** yoki **Suratini** o'zgartirib **"Narx va Ma'lumotlarni Saqlash"** tugmasini bosing.
3. Yangi narxlar shu zahoti barcha mijozlarning buyurtma oynasida, ombor hisob-kitobida va yangi yetkazmalarda avtomatik qo'llaniladi.

---

## 🤖 Haqiqiy Telegram Botni Ulash Qo'llanmasi
1. Telegramda **[@BotFather](https://t.me/BotFather)** ga kiring va `/newbot` buyrug'i orqali yangi bot yarating.
2. Berilgan **HTTP API Token**ni nusxalab oling.
3. Dasturga Admin bo'lib kiring va **"Real Telegram Bot & Asoschilar"** bo'limiga o'ting.
4. Tokenni kiritib **"Botni Ulash va Ishga Tushirish"** tugmasini bosing.
5. Telegramda o'z botingizga kirib **`/start`** tugmasini bosing — bot sizni va operatorlaringizni avtomatik ro'yxatga oladi.
6. Endi mijoz dasturdan buyurtma berishi bilan botingizga **do'kon nomi, mahsulot soni, kerakli sana va vaqt, telefon raqam va xaritadagi GPS lokatsiya pin** darhol yetib boradi!

---

## 🚀 Lokal Kompyuterda Ishga Tushirish
```bash
npm install
npm run dev
```
Dastur `http://localhost:3000` manzilida ishga tushadi.
