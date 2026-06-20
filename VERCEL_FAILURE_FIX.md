# معالجة فشل Vercel في مشروع حصاحيصاوي

## سبب الفشل الحالي
ظهور حالات فشل مثل:

`upgradeToPro=build-rate-limit`

يعني أن Vercel أوقف بعض عمليات البناء بسبب حد الاستخدام في الحساب، وليس بالضرورة بسبب خطأ في كود التطبيق.

## ما تم عمله
تمت إضافة ملف:

`vercel.json`

وفيه:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "node scripts/vercel-ignore-build.mjs"
}
```

كما تمت إضافة سكربت:

`scripts/vercel-ignore-build.mjs`

وظيفته منع Vercel من بناء تغييرات تطبيق الموبايل فقط، مثل تغييرات APK/AAB وملفات `artifacts/hasahisawi`، حتى لا يستهلك Vercel builds بدون حاجة.

## ما يجب فعله من لوحة Vercel
إذا استمر ظهور فشل `build-rate-limit`:

1. افتح Vercel Dashboard.
2. ادخل إلى كل مشروع مربوط بالمستودع.
3. من Settings → Git:
   - فعّل Ignored Build Step إن لم يلتقط `vercel.json`.
   - أو ضع الأمر:
     `node scripts/vercel-ignore-build.mjs`
4. عطّل المشاريع القديمة أو المكررة غير المستخدمة.
5. اترك فقط مشاريع API/Admin الضرورية.

## ملاحظة مهمة
فشل Vercel بسبب build limit لا يمنع بالضرورة بناء APK أو AAB عبر GitHub Actions/EAS، لكنه يؤثر على الخدمات التي تعتمد على API إذا كان API نفسه غير منشور أو متوقف.
