# إعداد النشر التلقائي على Google Play

## الخطوات (تُنفَّذ مرة واحدة فقط)

### الخطوة 1 — ربط Google Play بـ Google Cloud

1. افتح **Google Play Console**: https://play.google.com/console
2. اختر التطبيق → **Setup → API access**
3. اضغط **Link to a Google Cloud project**
4. اختر مشروعاً موجوداً أو أنشئ جديداً
5. اضغط **View in Google Cloud Console**

### الخطوة 2 — إنشاء Service Account

في **Google Cloud Console**:

1. من القائمة الجانبية: **IAM & Admin → Service Accounts**
2. اضغط **+ CREATE SERVICE ACCOUNT**
3. الاسم: `hasahisawi-play-publisher`
4. الوصف: `Automated Google Play publishing for Hasahisawi`
5. اضغط **CREATE AND CONTINUE**
6. في **Role**: اختر **Service Account Token Creator** ثم **CONTINUE** ثم **DONE**

### الخطوة 3 — إنشاء مفتاح JSON

1. انقر على حساب الخدمة الذي أنشأته
2. تبويب **KEYS** → **ADD KEY** → **Create new key**
3. اختر **JSON** → اضغط **CREATE**
4. سيُحمَّل ملف JSON تلقائياً — احتفظ به بأمان

### الخطوة 4 — منح الصلاحية في Play Console

1. عد إلى **Google Play Console → Setup → API access**
2. ابحث عن حساب الخدمة في القائمة
3. اضغط **Grant access**
4. في **Account permissions** اختر: **Release manager** أو **Admin**
5. اضغط **Apply** ثم **Save**

### الخطوة 5 — إضافة Secret إلى GitHub

1. افتح: https://github.com/almhbob/hasahisawi/settings/secrets/actions
2. اضغط **New repository secret**
3. الاسم: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
4. القيمة: الصق محتوى ملف JSON كاملاً
5. اضغط **Add secret**

---

## بعد إضافة الـ Secret

في البناء التالي، ستُنشر الـ AAB تلقائياً على **Internal Track** في Google Play بعد كل push على `.release-trigger`.

لترقية الإصدار من Internal إلى Production:
- افتح Play Console → الإصدار الداخلي → **Promote release → Production**
