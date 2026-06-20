# آخر تحديث للمستودع — حصاحيصاوي

## الفرع الحالي

`hardening/prelaunch-security-fixes`

## آخر التعديلات المضافة

### 1. معالجة فشل Vercel بسبب حد البناء

تمت إضافة:

- `vercel.json`
- `scripts/vercel-ignore-build.mjs`
- `VERCEL_FAILURE_FIX.md`

الغرض:

- منع Vercel من تشغيل Build عند تغييرات تطبيق الموبايل فقط.
- تقليل فشل `build-rate-limit`.
- فصل مسار بناء APK/AAB عن مشاريع Vercel.

> ملاحظة: إذا ظل فشل `build-rate-limit` ظاهرًا في لوحة GitHub، فهذا بسبب حساب Vercel/المشاريع المكررة ويحتاج ضبط Ignored Build Step داخل Vercel للمشاريع المرتبطة.

الأمر المطلوب داخل Vercel لكل مشروع مرتبط:

```bash
node scripts/vercel-ignore-build.mjs
```

المسار داخل Vercel:

`Project → Settings → Git → Ignored Build Step`

---

### 2. صفحات قانونية عامة للنشر

تمت إضافة:

- `privacy.html`
- `delete-account.html`

وتتوافق مع إعدادات `app.json`:

- `https://almhbob.github.io/hasahisawi/privacy.html`
- `https://almhbob.github.io/hasahisawi/delete-account.html`

---

### 3. إعداد بناء AAB عبر EAS

تم تحديث Workflow:

- `.github/workflows/eas-android-release.yml`

وهو يدعم:

- تشغيل يدوي عبر `workflow_dispatch`.
- بناء `production` لإنتاج ملف AAB.
- استخدام `EXPO_TOKEN` من GitHub Secrets.

رابط التشغيل:

`https://github.com/almhbob/hasahisawi/actions/workflows/eas-android-release.yml`

الإعداد المطلوب عند التشغيل:

- Branch: `hardening/prelaunch-security-fixes`
- Profile: `production`

---

### 4. إعداد بناء APK للتجربة

Workflow التجربة:

- `.github/workflows/release-v6.yml`

رابط التشغيل:

`https://github.com/almhbob/hasahisawi/actions/workflows/release-v6.yml`

الملف المتوقع بعد نجاح البناء:

- `hasahisawi-hardening-debug-apk`

---

## حالة مهمة

الكود أصبح مجهزًا لمسارات APK/AAB، لكن لا يتم اعتبار APK أو AAB جاهزًا إلا بعد نجاح GitHub Actions/EAS وظهور Artifact أو رابط EAS.

## ملاحظات تشغيل Vercel

المشروع الذي يجب اعتماده للإنتاج هو المشروع الذي يستخدم رابط API الحالي:

`https://api-server-gilt-ten.vercel.app`

أما مشاريع Vercel المكررة مثل:

- `hasahisawi-api`
- `hasahisawi-api-server`
- `hasahisawi-api-server-2yre`
- `hasahisawi-api-server-f6d8`
- `hasahisawi`

فينبغي ضبطها أو إيقاف ربطها بالمستودع إذا لم تكن مستخدمة حتى لا تستهلك حد البناء.

## الخطوة التالية المقترحة

1. ضبط Vercel للمشاريع الصحيحة فقط.
2. تشغيل APK للتجربة.
3. بعد نجاح التجربة، تشغيل AAB production للنشر على Google Play.
