# تشغيل ونشر المشروع بدون Replit

هذا المشروع لا يحتاج Replit كخدمة أساسية. البديل المقترح هو:

- **GitHub**: مصدر الكود وإدارة Pull Requests.
- **GitHub Actions**: الفحص الآلي عند كل Push أو Pull Request.
- **Render**: تشغيل `artifacts/api-server` كخدمة Web API.
- **Neon PostgreSQL**: قاعدة البيانات الإنتاجية عبر `DATABASE_URL`.
- **Firebase**: للخدمات التي تعتمد على Firebase Admin أو Cloud Functions عند الحاجة.
- **Vercel**: اختياري فقط للواجهات أو صفحات الويب إن وجدت.

## لماذا هذا البديل؟

Replit مفيد للتطوير السريع، لكنه ليس مطلوبًا للإنتاج. المشروع يحتوي بالفعل على إعداد `render.yaml` لتشغيل API على Render، كما أن قاعدة البيانات متصلة عبر PostgreSQL/Neon، لذلك الأفضل جعل GitHub + Render + Neon هي البنية الأساسية.

## متغيرات البيئة المطلوبة

لا تضع أي أسرار داخل المستودع. أضف هذه القيم داخل لوحة Render أو منصة الاستضافة المستخدمة:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
FIREBASE_SERVICE_ACCOUNT_JSON={...}
OPENAI_API_KEY=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
RECAPTCHA_SECRET=...
VITE_RECAPTCHA_SITE_KEY=...
```

أضف فقط المتغيرات التي يستخدمها الجزء المنشور فعليًا من التطبيق.

## تشغيل API على Render

المشروع يحتوي ملف `render.yaml` في الجذر. Render يقرأ منه:

- `buildCommand`: تثبيت الحزم وبناء `artifacts/api-server`.
- `startCommand`: تشغيل `artifacts/api-server/dist/index.mjs`.
- `healthCheckPath`: `/api/healthz`.

بعد ربط المستودع في Render، فعّل Auto Deploy من فرع `master`.

## الفحص الآلي عبر GitHub Actions

تمت إضافة Workflow في:

```text
.github/workflows/ci.yml
```

يقوم بالتالي:

1. تثبيت pnpm.
2. تثبيت الاعتمادات.
3. تشغيل TypeScript typecheck.
4. تشغيل build.

## إجراء أمني عاجل بعد حذف Replit

تم حذف ملف `.replit` لأنه كان يحتوي إعدادات ومتغيرات بيئة حساسة. الحذف من آخر نسخة لا يكفي إذا كانت الأسرار ظهرت سابقًا في سجل Git.

نفّذ فورًا:

1. إلغاء وتوليد Firebase service account جديد.
2. إلغاء Vercel token القديم وتوليد Token جديد إن كنت ستستخدم Vercel.
3. تغيير Render deploy hook.
4. تغيير مفاتيح reCAPTCHA عند الحاجة.
5. التأكد من عدم وجود `DATABASE_URL` أو مفاتيح أخرى في سجل Git.

## تشغيل محلي بدون Replit

```bash
pnpm install
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

للتطوير:

```bash
pnpm --filter @workspace/api-server run dev
```

تأكد من وجود ملف `.env` محلي غير مرفوع إلى Git يحتوي القيم المطلوبة.
