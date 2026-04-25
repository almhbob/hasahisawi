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
