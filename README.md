# حصاحيصاوي

تطبيق خدمات مجتمعية شامل لمدينة الحصاحيصا، السودان.

---

## نظرة عامة

حصاحيصاوي منصة رقمية تجمع أبناء مدينة الحصاحيصا في مكان واحد، تتيح التواصل ومشاركة الأخبار والمواعيد والخدمات والتقييمات.

## المميزات

- **الرئيسية** — معالم المدينة وإعلانات مميزة
- **المجتمع** — منشورات ونقاشات بين الأهالي
- **المواعيد** — أحداث وفعاليات المدينة
- **البلاغات** — الإبلاغ عن المشكلات والمقترحات
- **الطب** — دليل الأطباء والمستشفيات
- **التقييمات** — تقييم الخدمات والمؤسسات والموظفين
- **الدردشة** — محادثات فورية بين المستخدمين
- **لوحة الإدارة** — إدارة كاملة للمحتوى والمستخدمين

## التقنيات

| الطبقة | التقنية |
|--------|---------|
| تطبيق الجوال | React Native 0.81 (Expo) — New Architecture |
| الخادم | Express.js + PostgreSQL |
| المصادقة | Firebase Authentication + Firestore |
| البناء | GitHub Actions → AAB → Google Play |

## البناء

يتم البناء تلقائياً عبر GitHub Actions عند تشغيل workflow يدوي.

```
.github/workflows/android-build.yml
```

الـ Secrets المطلوبة في إعدادات المستودع:

| Secret | الوصف |
|--------|-------|
| `EXPO_PUBLIC_DOMAIN` | رابط سيرفر الـ API |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | مفتاح Firebase |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | نطاق Firebase Auth |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | معرّف مشروع Firebase |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | تخزين Firebase |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | معرّف إرسال Firebase |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | معرّف تطبيق Firebase |
| `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` | معرّف تحليلات Firebase |
| `ANDROID_KEYSTORE_BASE64` | Keystore مُشفَّر بـ Base64 |
| `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور الـ Keystore |
| `ANDROID_KEY_ALIAS` | اسم المفتاح |
| `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح |

## هيكل المشروع

```
artifacts/
├── hasahisawi/        # تطبيق React Native (Expo)
│   ├── app/           # شاشات التطبيق (Expo Router)
│   ├── components/    # مكونات مشتركة
│   └── lib/           # منطق ومساعدات
└── api-server/        # خادم Express.js + PostgreSQL
```

## المتجر

متاح على Google Play ضمن **Closed Testing**.

---

© 2026 حصاحيصاوي — الحصاحيصا، السودان
