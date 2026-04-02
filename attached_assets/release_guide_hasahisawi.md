# 🚀 دليل الإصدار الاحترافي — تطبيق حصاحيصاوي

> معلومات التطبيق: `com.almhbob.hasahisawi` | الإصدار: `2.2.2` | versionCode: `17`

---

## الخطوة 1 — رفع الكود على GitHub

### من داخل Replit (الأسهل):
1. اضغط على أيقونة **Git** في الشريط الجانبي الأيسر (أيقونة تفرع الشجرة)
2. اضغط **"Connect to GitHub"**
3. اختر مستودعك أو أنشئ مستودعاً جديداً باسم `hasahisawi`
4. اضغط **"Push"** — سيُرفع كل شيء تلقائياً

### من Terminal على جهازك:
```bash
# أضف الـ Remote بعنوان مستودعك على GitHub
git remote add origin https://github.com/USERNAME/hasahisawi.git

# ادفع كل الكود
git push -u origin main
```

---

## الخطوة 2 — بناء ملف AAB (Android App Bundle)

> ⚠️ هذه الخطوة تحتاج التشغيل من جهازك الشخصي وليس من Replit.

### المتطلبات الأولية (مرة واحدة فقط):
```bash
# ثبّت EAS CLI
npm install -g eas-cli

# سجّل الدخول بحساب Expo الخاص بك
eas login
```

### بناء AAB للإنتاج:
```bash
# انتقل لمجلد التطبيق
cd artifacts/hasahisawi

# ابنِ الـ AAB (يأخذ 10-25 دقيقة)
eas build --platform android --profile production
```

### بعد انتهاء البناء:
- ستحصل على **رابط مباشر** لتحميل ملف `.aab`
- أو اذهب لـ: **https://expo.dev/accounts/[حسابك]/projects/hasahisawi/builds**
- حمّل الملف من هناك

---

## الخطوة 3 — رفع AAB على Google Play Console

1. افتح **https://play.google.com/console**
2. اختر تطبيق **حصاحيصاوي**
3. من القائمة الجانبية: **الإصدار** ← **الإصدار الداخلي** (Internal testing)
   - أو **الإصدار الإنتاجي** إن أردت النشر المباشر
4. اضغط **"إنشاء إصدار جديد"**
5. في قسم **"App bundles"** اضغط **"تحميل"** وارفع ملف `.aab`

---

## الخطوة 4 — ملاحظات الإصدار (إلزامية)

انسخ هذا النص في خانة ملاحظات الإصدار:

```
الإصدار 2.2.2 — آخر التحديثات:

• نظام مراقبة المحتوى بالذكاء الاصطناعي (منع الألفاظ البذيئة والمحتوى غير اللائق)
• البحث الشامل: مستخدمون، منشورات، مؤسسات، مجتمعات
• الملف الشخصي مع إحصائيات وتعديل السيرة
• شاشة الإعداد الأولي للمستخدمين الجدد
• استعادة كلمة المرور (3 خطوات)
• تحسينات الأداء والاستقرار
```

---

## الخطوة 5 — مراجعة وإرسال

1. اضغط **"حفظ"**
2. اضغط **"مراجعة الإصدار"** — ستظهر قائمة التحقق
3. تأكد من اكتمال جميع الخطوات الخضراء
4. اضغط **"إرسال إلى مراجعة Google"**

---

## الخطوة 6 — انتظار المراجعة

| الحالة | المدة المتوقعة |
|---|---|
| مراجعة أولية | بضع ساعات إلى يوم |
| مراجعة كاملة (إصدار جديد) | 1-3 أيام |
| التطبيق منشور سابقاً | ساعات فقط |

---

## ❗ ملاحظة بشأن المساحة الفارغة في Console

المساحة الفارغة التي تراها في Google Play Console **هي تصميم Google ذاته** وليست خللاً في تطبيقك. ستمتلئ هذه الصفحة تلقائياً حين:
- ترفع ملف AAB ✓
- تكتمل ملاحظات الإصدار ✓
- تُرسل للمراجعة ✓

---

## معلومات البناء المرجعية

```json
{
  "package": "com.almhbob.hasahisawi",
  "version": "2.2.2",
  "versionCode": 17,
  "buildProfile": "production",
  "buildType": "app-bundle",
  "platform": "android"
}
```

---

## الـ Commits الأخيرة المُرفوعة

```
da0e100  Add AI content moderation to prevent inappropriate posts and messages
ecd5e9a  Add comprehensive profile document and update video assets
6b2736b  Add video file for download to asset metadata
e37cfef  Add video advertisement, social media poster, and WhatsApp status
0153032  Add comprehensive search functionality and improve user profile features
6fb9cad  Update application icons and branding for a professional look
```

---

*حصاحيصاوي — مدينتنا · منصتنا | الإصدار 2.2.2*
