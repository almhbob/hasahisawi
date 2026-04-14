# حصاحيصاوي — Workspace

## نظرة عامة

pnpm monorepo متعدد التطبيقات. يحتوي على تطبيق موبايل حصاحيصاوي (Expo) وخادم API (Express).
بوابة ذكية لمدينة الحصاحيصا في السودان — سوق، مواصلات، توصيل، اجتماعي، رياضة، وظائف، دليل طبي، وأكثر.

## المكدّس التقني

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **تطبيق الجوال**: React Native 0.81 (Expo) — New Architecture
- **الخادم**: Express 5 + PostgreSQL
- **المصادقة**: Firebase Authentication (اختياري) + Backend مستقل
- **قاعدة البيانات**: PostgreSQL (مباشر عبر pg) + Drizzle ORM
- **التحقق**: Zod, drizzle-zod
- **API codegen**: Orval (من OpenAPI spec)
- **البناء**: esbuild

## الهيكل

```text
├── artifacts/
│   ├── hasahisawi/        # تطبيق React Native (Expo) — previewPath: /
│   │   ├── app/           # شاشات Expo Router
│   │   │   ├── (tabs)/    # 24 شاشة رئيسية
│   │   │   ├── login.tsx
│   │   │   ├── admin.tsx
│   │   │   ├── conversation.tsx
│   │   │   ├── report.tsx
│   │   │   └── notifications.tsx
│   │   ├── components/    # مكونات مشتركة
│   │   ├── constants/     # ألوان وثوابت (colors.ts, transport-zones.ts)
│   │   └── lib/           # Firebase, Auth, Translations, API
│   ├── admin-dashboard/   # لوحة تحكم ويب React+Vite — previewPath: /admin-dashboard
│   │   └── src/
│   │       ├── pages/     # 11 صفحة: Dashboard, Users, Posts, Merchants, PhoneShops, Transport, MapPlaces, Communities, Ads, Honored, Settings
│   │       ├── lib/       # auth.tsx (session), api.ts (fetch wrapper)
│   │       └── components/# Layout.tsx (sidebar + PageHeader)
│   └── api-server/        # Express API — previewPath: /api
│       └── src/routes/
│           ├── hasahisawi.ts  # كل مسارات حصاحيصاوي
│           └── health.ts
├── lib/
│   ├── api-spec/          # OpenAPI spec + Orval config
│   ├── api-client-react/  # React Query hooks مُولَّدة
│   ├── api-zod/           # Zod schemas مُولَّدة
│   └── db/                # Drizzle ORM
└── scripts/               # Scripts مساعدة
```

## شاشات التطبيق (Tabs)

| الشاشة | الوصف |
|--------|-------|
| index | الرئيسية — قاعة التكريم + معالم + إعلانات |
| social | المجتمع — منشورات ونقاشات |
| chat | الدردشة الفورية |
| medical | دليل الأطباء والمستشفيات |
| ratings | تقييم الخدمات |
| reports | البلاغات والمشكلات |
| calendar | الأحداث والفعاليات |
| appointments | المواعيد |
| market | السوق |
| jobs | الوظائف |
| orgs | المنظمات |
| missing | المفقودون |
| numbers | الأرقام الهامة |
| communities | المجتمعات |
| culture | الثقافة |
| sports | الرياضة |
| women | ركن المرأة — مقيّد بالجنس (إناث فقط) |
| student | الطلاب |
| ads | الإعلانات |
| ai-support | الدعم بالذكاء الاصطناعي |
| transport | المواصلات والتوصيل |
| settings | الإعدادات |

## أوامر التطوير

```bash
# تشغيل التطبيق
pnpm --filter @workspace/hasahisawi run dev

# تشغيل الخادم
pnpm --filter @workspace/api-server run dev

# تثبيت التبعيات
pnpm install

# codegen
pnpm --filter @workspace/api-spec run codegen
```

## متطلبات بيئة Firebase

| المتغير | الوصف |
|---------|-------|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | مفتاح Firebase |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | نطاق Firebase Auth |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | معرّف المشروع |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | التخزين |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | معرّف الإرسال |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | معرّف التطبيق |

## الميزات المضافة (آخر تحديث)

### ١. قسم المواصلات والتوصيل — مكتمل 100%

**الواجهة الأمامية (transport.tsx):**
- 5 مناطق (م1–م5) في `constants/transport-zones.ts`
- مصفوفة أسعار محفوظة في جدول `transport_fares` بقاعدة البيانات
- عرض بطاقات الرحلات مع حالة كل رحلة ووصف التوصيل
- أزرار تحديث حالة الرحلة (قيد الانتظار → مقبول → مكتمل/ملغي)
- نموذج تقييم السائق بعد إتمام الرحلة
- تبويب "كن سائقاً" مع اختبار تدريبي (10 أسئلة، يتطلب 7/10 للنجاح)
- حماية نموذج التسجيل حتى اجتياز الاختبار

**لوحة الإدارة (admin.tsx):**
- عرض جميع الرحلات مع تفاصيل التوصيل
- أزرار تحديث حالة الرحلة
- نافذة تعيين السائق من قائمة السائقين المعتمدين

**API (hasahisawi.ts):**
- `POST /api/transport/trips` — حجز رحلة جديدة
- `GET /api/transport/trips` — قائمة رحلات المستخدم
- `GET /api/admin/transport/trips` — جميع الرحلات (أدمن)
- `PATCH /api/transport/trips/:id/status` — تحديث الحالة
- `PATCH /api/admin/transport/trips/:id/assign-driver` — تعيين سائق
- `POST /api/transport/driver-register` — تسجيل سائق جديد
- `GET /api/admin/transport/drivers` — قائمة السائقين
- `PATCH /api/admin/transport/drivers/:id/status` — قبول/رفض سائق
- `POST /api/transport/trips/:id/rate` — تقييم الرحلة
- `GET /api/transport/fares` — مصفوفة الأسعار
- `GET /api/transport/status` — حالة تفعيل الخدمة

### ٢. التحكم في الوصول بناءً على الجنس

**قاعدة البيانات:**
- عمود `gender VARCHAR(10)` في جدول `users`
- `PATCH /api/auth/me/gender` — تحديث جنس المستخدم

**المصادقة (auth-context.tsx):**
- `AuthUser` يحتوي على `gender?: "male" | "female" | null`
- `register()` يقبل ويرسل معامل `gender`
- `setUserGender(gender)` — دالة جديدة تحدّث الجنس وتُحدّث الحالة فوراً

**نموذج التسجيل (login.tsx):**
- منتقي الجنس (ذكر/أنثى) بتصميم زرّي واضح

**ركن المرأة (women.tsx) — 3 حالات:**
- زائر/غير مسجّل: شاشة قفل مع زر "تسجيل الدخول"
- ذكر: رسالة احترامية بأن القسم للسيدات فحسب
- جنس غير محدّد: شاشة اختيار الجنس تحدّث الحساب فوراً

**الصفحة الرئيسية (index.tsx):**
- بطاقة "ركن المرأة" مخفية تلقائياً عن الذكور

### ٣. البوابة الاجتماعية

- **ComposeBar**: شريط كتابة ذكي بأيقونات صورة وفيديو
- **فلاتر الفئات**: شرائح أفقية (عام، سؤال، خبر، إعلان، نقاش، شكر)
- **دعم الوسائط**: صور وفيديوهات في المنشورات والتعليقات
- **منشور ترحيبي تلقائي** عند التسجيل

### ٤. المصادقة — دعم كامل بدون Firebase

- `backendLogin` / `backendRegister` تتصلان بالـ backend مباشرة
- تراجع تلقائي للـ backend عند غياب Firebase
- استعادة الجلسة من AsyncStorage

### ٥. الصورة الشخصية والملف الشخصي

- عمود `avatar_url` في جدول users
- `PUT /api/auth/profile` — تحديث الاسم والصورة
- مكوّن `UserAvatar.tsx` — صورة حقيقية أو حرف ملوّن كـ fallback
- شاشة الإعدادات: بطاقة بروفايل احترافية

### ٦. الرسائل (مثل Messenger)

- أفاتارات في قوائم المحادثات وداخلها
- فواصل التاريخ بين الرسائل
- شارات القراءة (✓ / ✓✓)
- إرسال الصور داخل المحادثات
- polling كل 3 ثوانٍ

### ٧. المفقودات والأرقام المهمة والرياضة — ترحيل كامل للـ Backend

**جداول قاعدة البيانات الجديدة:**
- `lost_items` — المفقودات والموجودات
- `emergency_numbers` — الأرقام المهمة (مع بيانات افتراضية: 8 أرقام)
- `sports_posts` — أخبار ومنشورات كرة القدم
- `sports_players` — اللاعبون
- `sports_matches` — المباريات

**مسارات API الجديدة:**
- `GET /api/emergency-numbers` — قائمة الأرقام المهمة
- `POST /api/admin/emergency-numbers` — إضافة رقم (أدمن)
- `PATCH /api/admin/emergency-numbers/:id` — تحديث رقم (أدمن)
- `DELETE /api/admin/emergency-numbers/:id` — حذف رقم (أدمن)
- `GET /api/lost-items` — قائمة المفقودات (مع فلتر `?status=lost|found`)
- `POST /api/lost-items` — الإبلاغ عن مفقود
- `PATCH /api/lost-items/:id/status` — تحديث حالة المفقود
- `DELETE /api/lost-items/:id` — حذف بلاغ
- `GET /api/sports/posts|players|matches` — بيانات الرياضة
- `POST/PATCH/DELETE /api/sports/*` — إدارة الرياضة (أدمن)

**شاشات مُحدَّثة:**
- `numbers.tsx` — يستخدم `GET /api/emergency-numbers` بدلاً من Firebase/AsyncStorage
- `missing.tsx` — يستخدم `GET /api/lost-items` مع نموذج إبلاغ داخلي
- `sports.tsx` — يستخدم `GET /api/sports/*` بدلاً من AsyncStorage
- `settings.tsx` — إدارة المفقودات عبر API
- `search.tsx` — البحث في المفقودات عبر API

**نظام مصادقة الأدمن المزدوج:**
- `isAdminRequest()` يدعم: Bearer token للمستخدمين المسجلين + رأس `x-admin-pin` للدخول بـ PIN
- `POST /api/admin/validate-pin` — التحقق من PIN

## ثوابت مهمة

- `ACCENT = "#F97316"` (برتقالي)، `ACCENT2 = "#FBBF24"`، `GREEN = "#3EFF9C"`، `BLUE = "#3E9CBF"`
- PIN الافتراضي للأدمن: `"4444"` (قابل للتغيير من `/api/admin/change-pin`)
- مناطق المواصلات: 5 مناطق (م1–م5) في `constants/transport-zones.ts`
- قيم الجنس في قاعدة البيانات: `"male"` | `"female"` (VARCHAR)
- نتيجة اجتياز اختبار السائق: 7/10

## المصدر

المستودع: https://github.com/almhbob/hasahisawi
