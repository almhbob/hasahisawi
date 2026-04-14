# دليل نقل API إلى Firebase + Neon

## الخطوة 1: إنشاء قاعدة بيانات Neon

1. افتح [neon.tech](https://neon.tech) وأنشئ حساباً مجانياً
2. أنشئ مشروعاً جديداً باسم **hasahisawi**
3. من صفحة **Dashboard → Connection Details**، انسخ **Connection String**
   - تبدو هكذا: `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. في Replit، افتح **Secrets** وأضف:
   - Key: `NEON_DATABASE_URL`
   - Value: connection string الذي نسخته

---

## الخطوة 2: نقل البيانات

في Replit Shell، نفّذ:
```bash
pnpm migrate:neon
```

هذا ينقل كل البيانات من PostgreSQL الحالي إلى Neon.

---

## الخطوة 3: نشر Firebase Functions

في جهازك المحلي (ليس Replit):

### 3.1 ثبّت Firebase CLI
```bash
npm install -g firebase-tools
```

### 3.2 سجّل الدخول
```bash
firebase login
```

### 3.3 انسخ المشروع
```bash
git clone <رابط_المشروع_من_GitHub>
cd hasahisawi
```

### 3.4 ضع متغير DATABASE_URL في Firebase Secrets
```bash
firebase functions:secrets:set DATABASE_URL
# الصق Neon connection string عند الطلب
```

### 3.5 انشر Functions + Hosting
```bash
npm --prefix artifacts/firebase-functions install
npm --prefix artifacts/firebase-functions run build
firebase deploy --only functions,hosting
```

---

## الخطوة 4: تأكيد عمل API

بعد النشر، اختبر:
```bash
curl https://hasahisawi.web.app/api/health
```

يجب أن يرجع: `{"status":"ok","server":"firebase-functions"}`

---

## الخطوة 5: بناء APK الجديد

في Replit Shell:
```bash
cd artifacts/hasahisawi
eas build --profile preview --platform android
```

الـ APK الجديد سيستخدم `hasahisawi.web.app` كـ API URL.

---

## ملاحظات مهمة

- **حساب المدير:** `Almhbob.iii@gmail.com` / `Hasahisawi2026`
- **Firebase Project ID:** `hasahisawi`
- **API الجديد:** `https://hasahisawi.web.app/api/...`
- **Firebase Hosting URL:** `https://hasahisawi.web.app`
- **Cloud Function:** `api` (منطقة us-central1)
