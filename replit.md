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

## المصدر

المستودع: https://github.com/almhbob/hasahisawi
