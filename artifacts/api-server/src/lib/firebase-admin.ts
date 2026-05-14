import admin from "firebase-admin";

let initialized = false;
let initError: string | null = null;

export function getFirebaseAdmin(): typeof admin | null {
  if (initialized) return initError ? null : admin;
  initialized = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    initError = "FIREBASE_SERVICE_ACCOUNT_JSON not set";
    console.warn("[firebase-admin]", initError);
    return null;
  }
  try {
    const sa = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id,
    });
    console.log("[firebase-admin] initialized for project:", sa.project_id);
    return admin;
  } catch (err) {
    initError = String(err);
    console.error("[firebase-admin] init failed:", err);
    return null;
  }
}

export async function verifyIdToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  name?: string;
  phone?: string;
} | null> {
  const a = getFirebaseAdmin();
  if (!a) return null;
  try {
    const decoded = await a.auth().verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: (decoded as { name?: string }).name,
      phone: decoded.phone_number,
    };
  } catch (err) {
    console.warn("[firebase-admin] verifyIdToken failed:", (err as Error).message);
    return null;
  }
}

export type FirebaseUserRecord = {
  uid: string;
  email?: string;
  displayName?: string;
  phoneNumber?: string;
  photoURL?: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt?: string;
  lastSignIn?: string;
  providers: string[];
};

/**
 * يُعيد قائمة بجميع مستخدمي Firebase Authentication (صفحة صفحة).
 */
export async function listAllFirebaseUsers(): Promise<FirebaseUserRecord[]> {
  const a = getFirebaseAdmin();
  if (!a) return [];
  const all: FirebaseUserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const result = await a.auth().listUsers(1000, pageToken);
    for (const u of result.users) {
      all.push({
        uid:           u.uid,
        email:         u.email,
        displayName:   u.displayName,
        phoneNumber:   u.phoneNumber,
        photoURL:      u.photoURL,
        emailVerified: u.emailVerified,
        disabled:      u.disabled,
        createdAt:     u.metadata?.creationTime,
        lastSignIn:    u.metadata?.lastSignInTime,
        providers:     (u.providerData ?? []).map(p => p.providerId),
      });
    }
    pageToken = result.pageToken;
  } while (pageToken);
  return all;
}

/**
 * يُضيف/يُحدّث كلمة مرور لحساب Firebase حتى لو كان مرتبطاً بـ Google.
 * يُستدعى بعد نجاح Backend Login — يُتيح تسجيل الدخول بالبريد+كلمة مرور لاحقاً.
 */
export async function ensureEmailPasswordProvider(
  uid: string,
  email: string,
  password: string,
): Promise<void> {
  const a = getFirebaseAdmin();
  if (!a) return;
  try {
    await a.auth().updateUser(uid, { password });
    console.log("[firebase-admin] password updated for uid:", uid);
  } catch (err: any) {
    console.warn("[firebase-admin] ensureEmailPasswordProvider failed:", err?.message);
  }
}
