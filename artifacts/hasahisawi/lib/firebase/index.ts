import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";

const FIREBASE_CONFIG = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            || "AIzaSyC0o8hr3Dp0hgqKovIDUM0PSCbqgBABvx8",
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        || "hasahisawi.firebaseapp.com",
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         || "hasahisawi",
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     || "hasahisawi.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "133656291161",
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             || "1:133656291161:web:7d0a88a80d3be1af418e48",
  measurementId:     process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID     || "G-8NDWWB1735",
};

const isApiKeyValid =
  !!FIREBASE_CONFIG.apiKey &&
  FIREBASE_CONFIG.apiKey.startsWith("AIza") &&
  FIREBASE_CONFIG.apiKey.length > 20;

export const isFirebaseConfigured = isApiKeyValid && !!FIREBASE_CONFIG.projectId;
export const isFirestoreEnabled   = isFirebaseConfigured;

let app: FirebaseApp;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
  } catch {
    try { app = getApp(); } catch { app = {} as FirebaseApp; }
  }
} else {
  app = {} as FirebaseApp;
}

export { app };
export { isFirebaseAvailable } from "./auth";
