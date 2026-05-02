import admin from 'firebase-admin';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const defaultPassword = process.env.MIGRATION_DEFAULT_PASSWORD;
const dryRun = process.env.DRY_RUN !== 'false';

if (!serviceAccountJson) {
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON secret');
}

if (!defaultPassword || defaultPassword.length < 8) {
  throw new Error('MIGRATION_DEFAULT_PASSWORD must be at least 8 characters');
}

const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

function normalizePhone(phone) {
  return String(phone || '').replace(/\s+/g, '').replace(/^\+/, '');
}

function toLoginEmail(data) {
  const realEmail = String(data.email || '').trim().toLowerCase();
  if (realEmail && !realEmail.endsWith('@hasahisawi.app')) return realEmail;
  const phone = normalizePhone(data.phone);
  if (!phone) return null;
  return `${phone}@hasahisawi.app`;
}

async function ensureAuthUser(doc) {
  const data = doc.data();
  const uid = String(data.uid || doc.id).trim();
  const email = toLoginEmail(data);
  const displayName = String(data.name || data.fullName || 'مستخدم حصاحيصاوي').trim();

  if (!uid || !email) {
    return { status: 'skipped', uid, reason: 'missing uid or phone/email' };
  }

  try {
    await auth.getUser(uid);
    return { status: 'exists', uid, email };
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }

  if (!dryRun) {
    await auth.createUser({
      uid,
      email,
      password: defaultPassword,
      displayName,
      emailVerified: email.endsWith('@hasahisawi.app'),
      disabled: false,
    });

    await doc.ref.set({
      uid,
      email,
      authMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
      mustChangePassword: true,
      loginHint: email,
    }, { merge: true });
  }

  return { status: dryRun ? 'would_create' : 'created', uid, email };
}

const snap = await db.collection('users').get();
const summary = { total: snap.size, created: 0, exists: 0, skipped: 0, would_create: 0, failed: 0 };

for (const doc of snap.docs) {
  try {
    const result = await ensureAuthUser(doc);
    summary[result.status] = (summary[result.status] || 0) + 1;
    console.log(`${result.status}: ${result.uid || doc.id} ${result.email || ''} ${result.reason || ''}`);
  } catch (err) {
    summary.failed += 1;
    console.error(`failed: ${doc.id}`, err.message);
  }
}

console.log('SUMMARY', JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exitCode = 1;
