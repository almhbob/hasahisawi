import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            ?? "",
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? "",
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         ?? "",
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             ?? "",
  measurementId:     process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID     ?? "",
};

// مفاتيح Firebase للويب دائماً تبدأ بـ AIza
// إذا لم يكن المفتاح بهذه الصيغة فهو غير صالح
const isApiKeyValid =
  !!firebaseConfig.apiKey &&
  firebaseConfig.apiKey.startsWith("AIza") &&
  firebaseConfig.apiKey.length > 20;

export const isFirebaseConfigured =
  isApiKeyValid && !!firebaseConfig.projectId;

export const isFirestoreEnabled = isFirebaseConfigured;

let app: FirebaseApp;
if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  } catch (e) {
    try {
      app = getApp();
    } catch {
      // Firebase غير متاح — سيتم استخدام المصادقة الخلفية فقط
      app = {} as FirebaseApp;
    }
  }
} else {
  app = {} as FirebaseApp;
}

export { app };
export { AsyncStorage };
