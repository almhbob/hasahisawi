# حصاحيصاوي — ملف التسليم (آخر تحديث 2026-10-21)

مستودع: `almhbob/hasahisawi` (pnpm monorepo)
- `artifacts/api-server` — Express 5 + PostgreSQL (يعمل على Vercel، والتطبيق يستخدم https://api-server-gilt-ten.vercel.app)
- `artifacts/hasahisawi` — تطبيق Expo SDK 54 / React Native 0.81 (Expo Router)
- `artifacts/admin-dashboard` — لوحة الإدارة

## 1) الخادم وقاعدة البيانات — مستقر ✅
- قاعدة البيانات الأساسية الآن: Railway مشروع **lively-mindfulness** (Postgres، خدمة `984dd90a-…`).
  تم دمج القاعدتين يوم 2026-10-20: 869 مستخدم، 16 منشور، 3 محامين. Vercel وخدمة Railway `hasahisawi` يشيران إليها.
- القاعدة القديمة **sunny-peace** محفوظة أرشيفاً — **لا تُحذف**.
- نسخ احتياطية داخل نفس الخوادم: قواعد `backup_20261020_1639` في السيرفرين.
- سير عمل GitHub (تُشغَّل بدفع ملف trigger إلى master):
  - `.health-check-trigger` → تقرير صحة الـAPI (readyz، الإحصاءات، فحص الدخول، رفض رمز الإدارة الافتراضي)
  - `.db-backup-trigger` → نسخة احتياطية للقاعدتين مع التحقق من أعداد الصفوف
  - `.db-merge-trigger` (أول كلمة `dryrun` أو `apply`) → دمج sunny→lively (آمن لإعادة التشغيل)
  - `.sync-db-trigger` → تحديث DATABASE_URL في Vercel وRailway من قاعدة lively ثم إعادة النشر
- أسرار GitHub الموجودة: RAILWAY_TOKEN، VERCEL_TOKEN، KEYSTORE_BASE64، KEYSTORE_PASSWORD، KEY_ALIAS، KEY_PASSWORD.
- رمز الإدارة الافتراضي مُعطَّل (لا يُقبل إلا رمز قوي ≥8 أحرف).
- سجلان لم ينتقلا (جداولهما غير موجودة في lively): مؤسسة طبية واحدة ومشرف عيادة واحد — موجودان في sunny-peace.

## 2) تجديد الواجهة — الفرع `ui/redesign` (PR #37، غير مدموج بعد)
تم:
- رأس صفحة موحّد أبيض (`components/ui/ModernHeader.tsx`) مع عناصر مشتركة `headerUI`
  (iconBtn، primaryBtn، secondaryBtn، chip، segment، search، badge، statusPill). مُطبَّق على ~45 شاشة.
- تحويل الشاشات الداكنة/البنفسجية إلى النظام الفاتح: المحامون، المواصلات، السفريات، الطبي، الفعاليات،
  التهاني، لوحة الشرف، معرض التصاميم، الزواج، النقابات، الإعدادات، وغيرها.
- إضافة 74 نصاً عربياً كانت مفقودة (كانت تظهر مفاتيح مثل noNotificationsSub، وكانت شاشة الثقافة تنهار).
- الترحيب (onboarding) ببطاقات خدمات بدل الحلقات المتوهجة؛ أزرار الدخول خضراء صلبة.
- إصلاح `AnimatedPress` (التبويبات المقسّمة لم تعد تنكمش).
- إصلاح قص زر "الكل" في فلاتر: الوظائف، الطبي، السوق، الثقافة، المجتمعات.
- فحص الأنواع: 3 أخطاء فقط وكلها سابقة (chat.tsx:255، medical.tsx سطران).

متبقٍ في الواجهة:
- الصف الثاني من تبويبات شاشة الطبي ما زال مقصوصاً من اليسار (نفس نمط `isRTL ? "row-reverse"` المزدوج).
  النمط موجود في شاشات أخرى؛ القاعدة: التطبيق RTL على الجوال (forceRTL) وعلى الويب (dir=rtl)،
  لذا يجب استخدام `flexDirection: "row"` وليس `row-reverse`.
- ألوان أزرق سماوي في قسم الرجال، وأرقام إحصاءات ملوّنة منخفضة التباين في الرجال/المرأة/المنظمات.
- أداة اللقطات: `/var/tmp/shot/shoot.mjs` (Playwright) — بناء الويب: `npx expo export -p web --output-dir <dir>`.

## 3) الإصدار 6.5.7 للنشر على Google Play
- الفرع `release/6.5.7` (versionCode 257) جاهز، لم يُفتح له PR بعد.
- الخطوات بعد موافقة المالك على PR #37:
  1. دمج PR #37 في master.
  2. إعادة تأسيس `release/6.5.7` على master، فتح PR ودمجه.
  3. دفع الملف `.android-current-build-trigger` إلى master → يبني AAB موقّعاً بمفتاح الرفع الأصلي
     (سير العمل `android-apk-aab-current.yml` فقط). تحقق أن بصمة SHA1 في الملاحظات:
     `7B:C4:A4:FC:7A:92:37:05:D3:66:53:B1:E0:67:79:4D:6B:D4:C2:08`، الحزمة `com.almhbob.hasahisawi`.
- ⚠️ لا تستخدم EAS ولا `android-stable-apk-aab.yml` ولا `release-v6.yml` للنسخة النهائية (تولّد مفتاحاً مؤقتاً).
- ⚠️ لا تحذف بيانات أو مفاتيح، ولا تعيد كتابة تاريخ git.

## 4) أمور لاحقة
- أسرار سير النسخ الاحتياطي (DATABASE_URL، BACKUP_PASSPHRASE) غير مضبوطة.
- مفتاح نشر Cloudflare منتهي.
- اشتراك Railway (Hobby) يحتاج قرار تجديد خلال نحو شهر.
