import admin from "firebase-admin";
import { logger } from "./logger";

function getOrInitApp(): admin.app.App | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    logger.warn("[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON not set");
    return null;
  }

  let sa: any;
  try {
    sa = JSON.parse(raw);
  } catch (err) {
    logger.error({ err }, "[firebase-admin] failed to parse service account JSON");
    return null;
  }

  // On Vercel serverless each cold-start is a fresh process, but on warm
  // instances the module is reused — check if already initialised first.
  const existing = admin.apps.find(a => a?.name === "[DEFAULT]");
  if (existing) return existing;

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id,
    });
    logger.info({ project: sa.project_id, key_id: sa.private_key_id }, "[firebase-admin] initialized");
    return app;
  } catch (err) {
    logger.error({ err }, "[firebase-admin] initializeApp failed");
    return null;
  }
}

export function getFirebaseAdmin(): admin.app.App | null {
  return getOrInitApp();
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
    logger.warn({ err }, "[firebase-admin] verifyIdToken failed");
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

export async function ensureEmailPasswordProvider(
  uid: string,
  email: string,
  password: string,
): Promise<void> {
  const a = getFirebaseAdmin();
  if (!a) return;
  try {
    await a.auth().updateUser(uid, { password });
    logger.info({ uid }, "[firebase-admin] password updated");
  } catch (err) {
    logger.warn({ err }, "[firebase-admin] ensureEmailPasswordProvider failed");
  }
}
