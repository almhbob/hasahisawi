# قائمة جاهزية النشر النهائي — حصاحيصاوي

## حالة المشروع
الفرع المعتمد للنشر:

`hardening/prelaunch-security-fixes`

## قبل بناء النسخة النهائية
- تشغيل فحص الخدمات:
  `node scripts/smoke-services-check.mjs`
- تشغيل سكربت التصحيح:
  `node scripts/patch-home-services-ui.mjs`
- التأكد من وجود GitHub Secret باسم:
  `EXPO_TOKEN`
- التأكد من أن API يعمل:
  `https://api-server-gilt-ten.vercel.app`
- التأكد من تفعيل Firebase Phone Authentication.
- التأكد من أن package name هو:
  `com.almhbob.hasahisawi`

## بناء نسخة اختبار داخلية
من GitHub Actions:

`EAS Android Release → Run workflow → preview`

الناتج المتوقع: APK داخلي للاختبار.

## بناء نسخة Google Play النهائية
من GitHub Actions:

`EAS Android Release → Run workflow → production`

الناتج المتوقع: AAB صالح للرفع على Google Play.

## اختبارات ضرورية على هاتف حقيقي
- فتح التطبيق بدون انهيار.
- تسجيل الدخول برقم الهاتف.
- التحقق من OTP.
- تجربة قسم مشوارك علينا.
- تجربة ظهور طلبات السائقين.
- تجربة الإشعارات داخل التطبيق.
- تجربة قسم المطاعم والكافتريات.
- تجربة قسم حواء والمنتجات وتكبير الصور.
- تجربة قسم الرجال والمنتجات وتكبير الصور.
- تجربة منشئ السيرة الذاتية وتحميل PDF.
- تجربة المجتمع والمنشورات.
- تجربة الأرقام المهمة والبلاغات.

## ملفات النشر
- `STORE_LISTING_AR.md`
- `PRIVACY_POLICY_AR.md`

## ملاحظات مهمة
- APK debug مناسب للاختبار فقط وليس للنشر العام.
- النشر على Google Play يحتاج AAB من profile الإنتاج.
- يجب توفير رابط سياسة خصوصية عام قبل إرسال التطبيق للمراجعة.
- يجب حل أي فشل حقيقي في API أو لوحة الإدارة إذا كانت الخدمات تعتمد عليها في النسخة المنشورة.
