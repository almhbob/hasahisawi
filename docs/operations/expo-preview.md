# معاينة التطبيق عبر Expo

هذا الدليل يوضح طريقة تشغيل ومعاينة تطبيق حصاحيصاوي عبر Expo على الهاتف أو المتصفح.

## أين يوجد تطبيق Expo؟

تطبيق Expo موجود في:

```bash
artifacts/hasahisawi
```

ويستخدم:

- `expo-router/entry`
- Expo SDK 54 تقريباً
- React Native 0.81
- pnpm workspace

## قبل التشغيل

يجب تثبيت:

- Node.js 20 أو أحدث.
- pnpm.
- تطبيق Expo Go على الهاتف.

## تشغيل نسخة master الحالية

```bash
git clone https://github.com/almhbob/hasahisawi.git
cd hasahisawi
pnpm install
cd artifacts/hasahisawi
pnpm exec expo start --tunnel
```

بعد تشغيل الأمر، افتح تطبيق Expo Go وامسح QR Code.

## تشغيل المعاينة عبر المتصفح

داخل نفس المسار:

```bash
pnpm exec expo start --web
```

## تشغيل آخر عمل على المرحلة الأولى

المرحلة الأولى الخاصة بالأدوار ومساحات العمل موجودة في PR #11.
لمعاينتها:

```bash
git fetch origin pull/11/head:preview-phase-1
 git checkout preview-phase-1
pnpm install
cd artifacts/hasahisawi
pnpm exec expo start --tunnel
```

## ما الذي يمكن معاينته الآن؟

### موجود في master

- التطبيق الحالي كما هو في الفرع الرئيسي.
- توثيق آلية تشغيل القسم الطبي داخل:

```bash
docs/operations/medical-workflow-and-section-updates.md
```

### موجود في PR #11

- نواة الأدوار الأساسية داخل:

```bash
artifacts/hasahisawi/lib/roles.ts
```

- نواة مساحات العمل داخل:

```bash
artifacts/hasahisawi/lib/workspaces.ts
```

هذه النواة لا تغيّر الواجهة بصرياً بعد، لكنها تؤسس لربط الواجهات حسب الدور في المرحلة التالية.

## ملاحظات مهمة

- PR #2 غير مناسب للمعاينة العامة حالياً لأن فحوصات Vercel المرتبطة به فاشلة.
- فشل Vercel الحالي في بعض الفحوصات مرتبط أيضاً بقيود build-rate-limit، لذلك لا تعتمد عليه وحده للحكم على معاينة Expo المحلية.
- في حال لم يعمل tunnel، جرّب:

```bash
pnpm exec expo start --lan
```

أو:

```bash
pnpm exec expo start --localhost
```

## أوامر مفيدة

تنظيف الكاش:

```bash
pnpm exec expo start --clear --tunnel
```

فحص TypeScript للتطبيق:

```bash
cd artifacts/hasahisawi
pnpm run typecheck
```

تشغيل Android محلياً بعد إعداد Android Studio:

```bash
cd artifacts/hasahisawi
pnpm run android
```
