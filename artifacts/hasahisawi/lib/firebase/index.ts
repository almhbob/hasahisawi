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

export const isFirebaseConfigured =
  !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

let app: FirebaseApp;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  app = getApp();
}

export { app };
export { AsyncStorage };
