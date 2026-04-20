# حصاحيصاوي — بيانات المشروع الكاملة
**آخر تحديث:** 20 أبريل 2026

---

## 🔴 التطبيق (Android)
| البيان | القيمة |
|---|---|
| اسم الحزمة | `com.almhbob.hasahisawi` |
| الإصدار | `3.3.8` |
| رمز الإصدار (versionCode) | `137` |
| مشروع EAS | `0d3b27d0-5d06-49dd-9b21-be26fb7a5a1a` |
| مالك EAS | `almhbob2026` |
| slug | `al-hasahisa-service` |
| SHA1 (Google Play) | `7B:C4:A4:FC:7A:92:37:05:D3:66:53:B1:E0:67:79:4D:6B:D4:C2:08` |
| SHA1 (بدون نقطتين) | `7bc4a4fc7a923705d36653b1e067794d6bd4c208` |

---

## 🌐 الخادم (Render)
| البيان | القيمة |
|---|---|
| رابط الـ API | `https://hasahisawi.onrender.com` |
| معرف الخدمة | `srv-d7hnfmvaqgkc739ea5f0` |
| المنطقة | Frankfurt (EU) |
| أمر التشغيل | `node dist/index.mjs` |
| فحص الصحة | `/api/healthz` |
| rootDir | `artifacts/api-server` |

---

## 🗄️ قاعدة البيانات (Render PostgreSQL)
| البيان | القيمة |
|---|---|
| الاسم | `hasahisawi-db` |
| المعرف | `dpg-d7iqkae7r5hc73cd8icg-a` |
| المنطقة | Frankfurt (EU) |
| الخطة | Free (تنتهي 2026-05-20) |

---

## 👤 حساب المدير
| البيان | القيمة |
|---|---|
| البريد | `Almhbob.iii@gmail.com` |
| كلمة المرور | `Almhbob2013#` |
| الدور | `admin` |
| معرف المستخدم | `2` |
| رمز PIN الافتراضي | `4444` |

---

## 🔥 Firebase
| البيان | القيمة |
|---|---|
| معرف المشروع | `hasahisawi` |
| رقم المشروع | `133656291161` |
| App ID (Android) | `1:133656291161:android:a4f8b2c3d1e09876` |
| App ID (Web) | `1:133656291161:web:7d0a88a80d3be1af418e48` |
| Auth Domain | `hasahisawi.firebaseapp.com` |
| Storage Bucket | `hasahisawi.firebasestorage.app` |
| Messaging Sender ID | `133656291161` |
| API Key | `AIzaSyC0o8hr3Dp0hgqKovIDUM0PSCbqgBABvx8` |

---

## 📱 بناء AAB لـ Google Play

### الطريقة
```bash
cd artifacts/hasahisawi
eas build --platform android --profile production --non-interactive
```

### الشروط المطلوبة قبل البناء
- تسجيل الدخول: `eas login` (أو ضبط `EXPO_TOKEN`)
- التأكد من وجود keystore مرتبط بالمشروع في Expo

### بعد اكتمال البناء
- التحميل من: https://expo.dev/accounts/almhbob2026/projects/al-hasahisa-service/builds
- رفع ملف `.aab` إلى Google Play Console > Production

### إضافة SHA1 في Firebase
1. Firebase Console → hasahisawi → Project Settings → Your Apps → Android
2. أضف بصمة SHA-1: `7B:C4:A4:FC:7A:92:37:05:D3:66:53:B1:E0:67:79:4D:6B:D4:C2:08`
3. أعد تنزيل `google-services.json` واستبدل الملف الحالي

---

## 🐙 GitHub
| البيان | القيمة |
|---|---|
| المستودع | `https://github.com/almhbob/hasahisawi` |
| الفرع الرئيسي | `main` |

---

## 📋 الميزات الرئيسية
- مجتمع (منشورات، تعليقات، بحث)
- خدمات المرأة
- الأطباء والعيادات
- المفقودات والضائعات
- مشاويرك علينا (Transport)
- سوق (إعلانات تجارية)
- مناسبات وأفراح
- أذكار وصلوات (أوقات الصلاة + أذان)
- نظام مصادقة Firebase + JWT
- إشعارات محلية وFCM
- لوحة تحكم إدارية (ويب)

---

## 📝 ملاحظات مهمة
- قاعدة بيانات Render تنتهي **2026-05-20** (خطة مجانية 90 يوم) — يجب الترقية أو النسخ الاحتياطي قبل ذلك
- ملفات الرفع (uploads) تُخزن في `/tmp/uploads` على Render (مؤقتة، تُحذف عند إعادة التشغيل) — يُنصح بالانتقال لـ Cloud Storage
- مفتاح الـ adhan-channel لإشعارات وقت الصلاة: `adhan-channel`
