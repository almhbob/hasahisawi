# حصاحيصاوي — Workspace

## نظرة عامة

pnpm monorepo متعدد التطبيقات. يحتوي على تطبيق موبايل حصاحيصاوي (Expo) وخادم API (Express).

## المكدّس التقني

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **تطبيق الجوال**: React Native 0.81 (Expo) — New Architecture
- **الخادم**: Express 5 + PostgreSQL
- **المصادقة**: Firebase Authentication
- **قاعدة البيانات**: PostgreSQL (مباشر عبر pg) + Drizzle ORM
- **التحقق**: Zod, drizzle-zod
- **API codegen**: Orval (من OpenAPI spec)
- **البناء**: esbuild

## الهيكل

```text
├── artifacts/
│   ├── hasahisawi/        # تطبيق React Native (Expo) — previewPath: /
│   │   ├── app/           # شاشات Expo Router
│   │   │   ├── (tabs)/    # 23 شاشة رئيسية
│   │   │   ├── login.tsx
│   │   │   ├── admin.tsx
│   │   │   ├── conversation.tsx
│   │   │   ├── report.tsx
│   │   │   └── notifications.tsx
│   │   ├── components/    # مكونات مشتركة
│   │   ├── constants/     # ألوان وثوابت
│   │   └── lib/           # Firebase, Auth, Translations, API
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
| index | الرئيسية — معالم وإعلانات |
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
| women | قسم المرأة |
| student | الطلاب |
| ads | الإعلانات |
| ai-support | الدعم بالذكاء الاصطناعي |
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

### ١. البوابة الاجتماعية — إعادة تصميم احترافية كاملة
- **ComposeBar**: شريط كتابة ذكي في أعلى القائمة بأيقونات صورة وفيديو
- **بطاقات المنشورات**: أفاتار ملوّن بالحرف الأول، بادج الفئة مع أيقونة، وقت نسبي
- **فلاتر الفئات**: شرائح أفقية مع أيقونات لكل فئة (عام، سؤال، خبر، إعلان، نقاش، شكر)
- **نافذة النشر الجديدة**: تنزلق من الأسفل، اختيار الفئة inline، زر نشر ملوّن
- **دعم الصور**: انتقاء الصورة من المعرض + رفع لـ Firebase Storage + عرض في البطاقة
- **دعم الفيديوهات**: انتقاء الفيديو + رفع + عرض مع زر تشغيل وoverlay
- **عرض الوسائط**: صور وفيديوهات بملء العرض في البطاقة مع overlay للفيديو
- **عرض التعليقات**: أفاتارات ملوّنة، تصميم محسّن، معاينة المنشور في الأعلى

### ٢. المصادقة — دعم كامل بدون Firebase
- دالة `backendLogin` تتصل بـ `POST /api/auth/login` مباشرة
- دالة `backendRegister` تتصل بـ `POST /api/auth/register` مباشرة
- `login()` و`register()`: تجرّب Firebase أولاً إذا كان متاحاً، تتراجع للـbackend تلقائياً
- لا رسائل خطأ "Firebase غير متاح" عند تسجيل الدخول أو إنشاء الحساب

### ٣. قاعدة البيانات — إضافة دعم الوسائط للمنشورات
- عمودا `image_url` و`video_url` في جدول `social_posts`
- Migration تلقائية عند كل إعادة تشغيل (ALTER TABLE IF NOT EXISTS)
- API `POST /api/posts` يقبل ويحفظ الوسائط
- API `GET /api/posts` يُعيد الوسائط ضمن كل منشور

### ٤. قسم ترويجي للمؤسسات (شاشة المنظمات)
- بانر JoinOrgBanner يدعو المؤسسات للتسجيل في التطبيق
- إحصائيات ومراحل التسجيل وأنواع المؤسسات المدعومة

### ٦. الصورة الشخصية للمستخدم
- عمود `avatar_url` في جدول users (migration تلقائي)
- `PUT /api/auth/profile` — تحديث الاسم والصورة الشخصية
- `updateProfile()` في auth-context — تحديث الحالة المحلية فوراً بعد الحفظ
- مكوّن `UserAvatar.tsx` — يعرض الصورة الحقيقية أو حرف ملوّن تلقائياً كـ fallback
- شاشة الإعدادات: بطاقة بروفايل احترافية (صورة + اسم + تعديل + خروج)
- زر الكاميرا على الأفاتار لتغيير الصورة من المعرض

### ٧. الرسائل احترافية (مثل Messenger)
- أفاتارات حقيقية في قائمة المحادثات وداخل المحادثة
- فواصل التاريخ بين الرسائل (اليوم / أمس / التاريخ الكامل)
- شارات القراءة (✓ / ✓✓) مع تلوين مختلف
- إرسال الصور مباشرة داخل المحادثات
- avatar + اسم الطرف الآخر في رأس المحادثة
- polling كل 3 ثوانٍ للرسائل الجديدة
- API `GET /api/chats` يرجع `user1_avatar` و`user2_avatar`

### ٨. منشور ترحيبي تلقائي
- عند تسجيل حساب جديد، يُنشئ الخادم تلقائياً منشوراً ترحيبياً في المجتمع
- المنشور يحمل اسم المستخدم الجديد ويُرتبط بـ author_id
- API `GET /api/posts` يرجع `author_avatar` لكل منشور (JOIN مع users)

### ٩. استقرار Firebase الكامل
- `isFirebaseAvailable()` — فحص runtime + startup
- معالجة خطأ `onAuthStateChanged` بالـ callback الثالث (يمنع kراش Hermes)
- `ErrorUtils.setGlobalHandler` + `LogBox.ignoreLogs` لمنع الـcrash على React Native
- استعادة الجلسة من AsyncStorage عند فشل Firebase

## المصدر

المستودع: https://github.com/almhbob/hasahisawi
