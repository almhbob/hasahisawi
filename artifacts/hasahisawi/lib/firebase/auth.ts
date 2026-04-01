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

function getFirebaseAuth(): Auth {
  if (_auth) return _auth;
  if (!isFirebaseConfigured) throw new Error("Firebase not configured");
  try {
    if (Platform.OS !== "web") {
      _auth = initializeAuth(app, {
        persistence: inMemoryPersistence,
      });
    } else {
      _auth = initializeAuth(app, {
        persistence: indexedDBLocalPersistence,
      });
    }
  } catch {
    try {
      _auth = getAuth(app);
    } catch (e2) {
      throw new Error(`Firebase Auth init failed: ${e2}`);
    }
  }
  return _auth;
}

export function isFirebaseAuthAvailable(): boolean {
  if (!isFirebaseConfigured) return false;
  try {
    getFirebaseAuth();
    return true;
  } catch {
    return false;
  }
}

export async function firebaseLoginEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function firebaseRegisterEmail(
  email: string,
  password: string,
  displayName: string,
) {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  return cred.user;
}

export async function firebaseLogout() {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export async function firebaseSendPasswordReset(email: string) {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email);
}

export function onFirebaseAuthChange(cb: (user: User | null) => void) {
  if (!isFirebaseConfigured) return () => {};
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, cb);
}

export function getCurrentFirebaseUser(): User | null {
  if (!isFirebaseConfigured) return null;
  try {
    return getFirebaseAuth().currentUser;
  } catch {
    return null;
  }
}

export { PhoneAuthProvider, signInWithCredential };
export type { User };
