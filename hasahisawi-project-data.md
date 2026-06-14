# حصاحيصاوي — بيانات المشروع الكاملة
**آخر تحديث:** 13 يونيو 2026

---

## 🔴 التطبيق (Android)
| البيان | القيمة |
|---|---|
| اسم الحزمة | `com.almhbob.hasahisawi` |
| الإصدار الحالي | `6.5.2` |
| رمز الإصدار (versionCode) | `252` |
| slug | `al-hasahisa-service` |
| SHA1 (Google Play) | `7B:C4:A4:FC:7A:92:37:05:D3:66:53:B1:E0:67:79:4D:6B:D4:C2:08` |
| SHA1 (بدون نقطتين) | `7bc4a4fc7a923705d36653b1e067794d6bd4c208` |
| Keystore Alias | `hasahisawi` |
| Keystore Password | `Hasahisawi@2026#Secure` |

---

## 📥 روابط آخر إصدار (v6.5.2)
| الملف | الرابط |
|---|---|
| APK (تثبيت مباشر) | `https://github.com/almhbob/hasahisawi/releases/download/v6.5.2/hasahisawi-v6.5.2.apk` |
| AAB (Google Play) | `https://github.com/almhbob/hasahisawi/releases/download/v6.5.2/hasahisawi-v6.5.2.aab` |
| صفحة الإصدار | `https://github.com/almhbob/hasahisawi/releases/tag/v6.5.2` |

---

## 🌐 الويب (PWA)
| البيان | القيمة |
|---|---|
| **الأساسي (Cloudflare)** | `https://hasahisawi.pages.dev` |
| الاحتياطي (GitHub Pages) | `https://almhbob.github.io/hasahisawi/` |

---

## 🔌 الخادم (Vercel)
| البيان | القيمة |
|---|---|
| رابط الـ API | `https://api-server-gilt-ten.vercel.app` |
| معرف المشروع | `prj_7NqIloolEKoPpF5JKr3KVWjapKVw` |
| Team ID | `team_RTCz9oaxsbHBdJHrSJNyJr5q` |
| فحص الصحة | `/api/healthz` |

---

## 🗄️ قاعدة البيانات (Railway PostgreSQL)
| البيان | القيمة |
|---|---|
| Connection String | `postgresql://postgres:JzFpvcGozCtnlehdUsyubWpkOjVPyrzA@shuttle.proxy.rlwy.net:14053/railway` |
| المضيف | `shuttle.proxy.rlwy.net:14053` |

---

## 👤 حسابات الدخول
| الحساب | البريد / المستخدم | كلمة المرور |
|---|---|---|
| مدير التطبيق | `almhbob.iii@gmail.com` | `Almhbob2013#` |
| PIN المدير | — | `4444` |
| اتحاد الطلاب (اختبار) | `union_admin` | `Union@2025#` |

---

## 🔥 Firebase
| البيان | القيمة |
|---|---|
| معرف المشروع | `hasahisawi` |
| رقم المشروع | `133656291161` |
| App ID (Android) | `1:133656291161:android:c91938f519fa219d418e48` |
| App ID (Web) | `1:133656291161:web:7d0a88a80d3be1af418e48` |
| Auth Domain | `hasahisawi.firebaseapp.com` |
| Storage Bucket | `hasahisawi.firebasestorage.app` |
| Messaging Sender ID | `133656291161` |
| API Key | `AIzaSyC0o8hr3Dp0hgqKovIDUM0PSCbqgBABvx8` |

---

## ☁️ Cloudinary (رفع الصور)
| البيان | القيمة |
|---|---|
| Cloud Name | `dfyzdxupp` |
| API Key | `774914495635641` |
| API Secret | `CGRT0gQ-bG2DSVMvQckOF5_DS9M` |

---

## 🐙 GitHub
| البيان | القيمة |
|---|---|
| المستودع | `https://github.com/almhbob/hasahisawi` |
| الفرع الرئيسي | `master` |
| CI/CD Workflow | `.github/workflows/release-v6.yml` |
| تشغيل البناء | تعديل `.release-trigger` على master |

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
- إشعارات FCM مع نغمات مخصصة لكل قسم
- لوحة تحكم إدارية
- بوابة إدارة اتحاد الطلاب (منفصلة)

---

## 📝 ملاحظات مهمة
- **لا تستخدم EAS Build للإنتاج** — keystore مختلف عن keystore المستودع
- بناء APK/AAB يتم عبر GitHub Actions فقط (release-v6.yml)
- React Native 0.81.5 + Expo SDK 54، هيكلية جديدة (New Architecture) مفعّلة
- pnpm workspaces: المخزن الافتراضي في `node_modules/.pnpm/` من جذر المستودع
- Firebase يتهيأ عبر `google-services.json` تلقائياً عند تشغيل التطبيق
