import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── استخراج قيمة من نص إعداد Firebase إذا كان السر يحتوي على الكود كاملاً ───
function extractFirebaseValue(envKey: string, configKey: string, fallback: string): string {
  const raw = process.env[envKey] ?? "";
  // إذا كانت القيمة تبدأ مباشرة بالقيمة المطلوبة (مثل AIza...)
  if (raw && !raw.includes("initializeApp") && !raw.includes("//")) return raw;
  // محاولة استخراجها من snippet كاملة
  const match = raw.match(new RegExp(`${configKey}:\\s*["']([^"']+)["']`));
  if (match) return match[1];
  return fallback;
}

// القيم المستخرجة من مستودع الأسرار
const FIREBASE_CONFIG = {
  apiKey:            extractFirebaseValue("EXPO_PUBLIC_FIREBASE_API_KEY",            "apiKey",            "AIzaSyC0o8hr3Dp0hgqKovIDUM0PSCbqgBABvx8"),
  authDomain:        extractFirebaseValue("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",        "authDomain",        "hasahisawi.firebaseapp.com"),
  projectId:         extractFirebaseValue("EXPO_PUBLIC_FIREBASE_PROJECT_ID",         "projectId",         "hasahisawi"),
  storageBucket:     extractFirebaseValue("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",     "storageBucket",     "hasahisawi.firebasestorage.app"),
  messagingSenderId: extractFirebaseValue("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID","messagingSenderId", "133656291161"),
  appId:             extractFirebaseValue("EXPO_PUBLIC_FIREBASE_APP_ID",             "appId",             "1:133656291161:web:7d0a88a80d3be1af418e48"),
  measurementId:     "G-8NDWWB1735",
};

// مفاتيح Firebase للويب دائماً تبدأ بـ AIza
const isApiKeyValid =
  !!FIREBASE_CONFIG.apiKey &&
  FIREBASE_CONFIG.apiKey.startsWith("AIza") &&
  FIREBASE_CONFIG.apiKey.length > 20;

export const isFirebaseConfigured =
  isApiKeyValid && !!FIREBASE_CONFIG.projectId;

export const isFirestoreEnabled = isFirebaseConfigured;

let app: FirebaseApp;
if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
  } catch (e) {
    try {
      app = getApp();
    } catch {
      app = {} as FirebaseApp;
    }
  }
} else {
  app = {} as FirebaseApp;
}

export { app };
export { AsyncStorage };
