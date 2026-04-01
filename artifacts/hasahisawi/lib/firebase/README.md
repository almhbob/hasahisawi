# Firebase Integration

## الخدمات المدعومة

| الملف | الخدمة |
|---|---|
| `index.ts` | Firebase App initialization |
| `auth.ts` | Firebase Authentication |
| `firestore.ts` | Cloud Firestore (Real-time DB) |
| `storage.ts` | Firebase Storage (File uploads) |
| `analytics.ts` | Firebase Analytics |
| `hooks.ts` | React hooks for Firestore |
| `context.tsx` | Firebase React Context |

## متغيرات البيئة المطلوبة (في .env)

```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

## Firestore Collections

- `users` — بيانات المستخدمين
- `posts` — المنشورات
- `reports` — البلاغات
- `appointments` — المواعيد
- `jobs` — الوظائف
- `events` — الفعاليات
- `announcements` — الإعلانات
- `missing_persons` — المفقودون
- `notifications` — الإشعارات
