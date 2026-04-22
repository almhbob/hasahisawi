import { Platform } from "react-native";
import { app, isFirebaseConfigured } from "./index";

let _initialized = false;

/**
 * تهيئة Firebase App Check.
 *
 * - الويب: يستخدم reCAPTCHA v3 / Enterprise (يحتاج `EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`).
 * - الموبايل (Android/iOS): SDK جافاسكريبت لا يفرض App Check على Native.
 *   لذا نتجاوز بأمان. الحماية الفعلية على Android تأتي من خلال
 *   تفعيل Play Integrity في Firebase Console + استخدام `@react-native-firebase/app-check`
 *   إذا أُريد فرضه من جانب العميل.
 */
export async function initAppCheck(): Promise<void> {
  if (_initialized) return;
  if (!isFirebaseConfigured) return;
  if (Platform.OS !== "web") return;

  const siteKey =
    process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY ||
    process.env.VITE_RECAPTCHA_SITE_KEY;

  if (!siteKey) {
    console.warn(
      "[App Check] لا يوجد EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY — تخطّي التهيئة.",
    );
    return;
  }

  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import(
      "firebase/app-check"
    );

    // وضع التطوير: يسمح بـ Debug Token تلقائياً
    if (__DEV__ && typeof window !== "undefined") {
      (window as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean })
        .FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });

    _initialized = true;
  } catch (e) {
    console.warn("[App Check] فشل التهيئة:", e);
  }
}
