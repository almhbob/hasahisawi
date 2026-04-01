import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  indexedDBLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  PhoneAuthProvider,
  signInWithCredential,
  User,
  Auth,
} from "firebase/auth";
import { Platform } from "react-native";
import { app, isFirebaseConfigured } from "./index";

let _auth: Auth | null = null;

// علم لتتبع فشل Firebase أثناء التشغيل (مفتاح غير صالح مثلاً)
let _firebaseRuntimeFailed = false;

export function markFirebaseRuntimeFailed() {
  _firebaseRuntimeFailed = true;
}

export function isFirebaseAvailable() {
  return isFirebaseConfigured && !_firebaseRuntimeFailed;
}

function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  if (!isFirebaseAvailable()) throw new Error("Firebase not configured");
  try {
    if (Platform.OS !== "web") {
      _auth = initializeAuth(app, { persistence: inMemoryPersistence });
    } else {
      _auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
    }
  } catch {
    try {
      _auth = getAuth(app);
    } catch (e2) {
      _firebaseRuntimeFailed = true;
      throw new Error(`Firebase Auth init failed: ${e2}`);
    }
  }
  return _auth;
}

export function isFirebaseAuthAvailable(): boolean {
  if (!isFirebaseAvailable()) return false;
  try {
    getFirebaseAuth();
    return true;
  } catch {
    return false;
  }
}

export function onFirebaseAuthChange(cb: (user: User | null) => void) {
  if (!isFirebaseAvailable()) return () => {};
  try {
    const auth = getFirebaseAuth();
    // نمرر معالج الخطأ الثالث لـ onAuthStateChanged
    // هذا يمنع Firebase من رمي unhandled rejection عند مفاتيح غير صالحة
    return onAuthStateChanged(
      auth,
      cb,
      (error) => {
        const msg = (error as any)?.message ?? String(error);
        console.warn("[Firebase] Auth state error — disabling Firebase:", msg);
        _firebaseRuntimeFailed = true;
        cb(null); // تعامل كأن المستخدم غير مسجّل
      },
    );
  } catch (e) {
    console.warn("[Firebase] onAuthStateChanged setup failed:", e);
    _firebaseRuntimeFailed = true;
    return () => {};
  }
}

export async function firebaseLoginEmail(email: string, password: string) {
  if (!isFirebaseAvailable()) throw new Error("Firebase غير متاح");
  const auth = getFirebaseAuth();
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (e) {
    const msg = (e as any)?.code ?? "";
    if (msg === "auth/invalid-api-key" || msg === "auth/network-request-failed") {
      _firebaseRuntimeFailed = true;
    }
    throw e;
  }
}

export async function firebaseRegisterEmail(
  email: string,
  password: string,
  displayName: string,
) {
  if (!isFirebaseAvailable()) throw new Error("Firebase غير متاح");
  const auth = getFirebaseAuth();
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    return cred.user;
  } catch (e) {
    const msg = (e as any)?.code ?? "";
    if (msg === "auth/invalid-api-key") _firebaseRuntimeFailed = true;
    throw e;
  }
}

export async function firebaseLogout() {
  if (!isFirebaseAvailable()) return;
  try {
    const auth = getFirebaseAuth();
    await signOut(auth);
  } catch {}
}

export async function firebaseSendPasswordReset(email: string) {
  if (!isFirebaseAvailable()) throw new Error("Firebase غير متاح");
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email);
}

export function getCurrentFirebaseUser(): User | null {
  if (!isFirebaseAvailable()) return null;
  try {
    return getFirebaseAuth().currentUser;
  } catch {
    return null;
  }
}

export { PhoneAuthProvider, signInWithCredential };
export type { User };
