# تشغيل ونشر المشروع بدون Replit

هذا المشروع لا يحتاج Replit كخدمة أساسية. البديل المقترح هو:

- **GitHub**: مصدر الكود وإدارة Pull Requests.
- **GitHub Actions**: الفحص الآلي عند كل Push أو Pull Request.
- **Render**: تشغيل `artifacts/api-server` كخدمة Web API.
- **Neon PostgreSQL**: قاعدة البيانات الإنتاجية عبر `DATABASE_URL`.
- **Firebase**: للمصادقة وقراءة مستخدمي Firebase Authentication عبر Firebase Admin SDK.
- **Vercel**: اختياري فقط للواجهات أو صفحات الويب إن وجدت.

## لماذا هذا البديل؟

Replit مفيد للتطوير السريع، لكنه ليس مطلوبًا للإنتاج. المشروع يحتوي بالفعل على إعداد `render.yaml` لتشغيل API على Render، كما أن قاعدة البيانات متصلة عبر PostgreSQL/Neon، لذلك الأفضل جعل GitHub + Render + Neon + Firebase هي البنية الأساسية.

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

أضف فقط المتغيرات التي يستخدمها الجزء المنشور فعليًا من التطبيق. يوجد ملف `.env.example` في الجذر يوضح الشكل الآمن للقيم بدون أسرار حقيقية.

## ربط Firebase باحترافية

1. من Firebase Console افتح:
   `Project settings` → `Service accounts` → `Generate new private key`.
2. انسخ محتوى ملف JSON كاملًا.
3. في Render افتح خدمة API ثم:
   `Environment` → أضف متغيرًا باسم:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON
```

4. ضع قيمة JSON كسطر واحد أو كما تقبلها لوحة Render.
5. أعد نشر الخدمة.
6. اختبر الربط من لوحة الإدارة أو عبر المسار:

```text
GET /api/admin/users-source-health
```

الاستجابة الاحترافية المتوقعة توضح:

- `firebase_admin_configured`: هل بيانات Firebase Admin مضبوطة.
- `firebase.project_id`: اسم مشروع Firebase المقروء من JSON.
- `firebase_users`: عدد مستخدمي Firebase Authentication.
- `postgres_users`: عدد مستخدمي قاعدة البيانات.
- `firebase_missing_in_postgres`: الفرق التقريبي قبل/بعد المزامنة.

لتنفيذ المزامنة يدويًا:

```text
POST /api/admin/sync-firebase-users
```

ولعرض المستخدمين مع مزامنة تلقائية:

```text
GET /api/admin/users
```

ولعرض المستخدمين بدون مزامنة تلقائية:

```text
GET /api/admin/users?sync=false
```

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
