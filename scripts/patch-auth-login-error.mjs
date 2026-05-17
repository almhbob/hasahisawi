import { readFileSync, writeFileSync } from 'node:fs';

const file = 'artifacts/api-server/src/routes/hasahisawi.ts';
let src = readFileSync(file, 'utf8');
let changed = false;

function replaceOnce(from, to) {
  if (src.includes(to)) return;
  if (!src.includes(from)) throw new Error(`Expected source block was not found: ${from.slice(0, 80)}`);
  src = src.replace(from, to);
  changed = true;
}

const helper = `
function isValidBcryptHashForLogin(value: unknown): value is string {
  return typeof value === "string" && /^\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}$/.test(value);
}
`;

if (!src.includes('function isValidBcryptHashForLogin')) {
  src = src.replace('function safeCompare(a: string, b: string): boolean {', helper + '\nfunction safeCompare(a: string, b: string): boolean {');
  changed = true;
}

const firebaseExchangeRoute = `
// ── Firebase session exchange ───────────────────────────────────────────────
// يربط مستخدمي Firebase/Google بقاعدة Railway ويصدر backend token للتطبيق.
router.post("/auth/firebase-exchange", authLimiter, async (req: Request, res: Response) => {
  try {
    const { idToken, firebase_uid, name, email, role } = req.body as {
      idToken?: string;
      firebase_uid?: string;
      name?: string;
      email?: string | null;
      role?: string;
    };

    let uid = typeof firebase_uid === "string" ? firebase_uid.trim() : "";
    let cleanEmail = typeof email === "string" && email.includes("@") ? email.trim().toLowerCase() : null;
    let displayName = typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : "مستخدم";

    if (idToken) {
      const decoded = await verifyIdToken(idToken).catch(() => null);
      if (decoded?.uid) {
        uid = decoded.uid;
        cleanEmail = decoded.email ?? cleanEmail;
        displayName = decoded.name || displayName;
      }
    }

    if (!uid || uid.length < 6 || uid.length > 160) {
      return res.status(400).json({ error: "رمز Firebase غير صالح" });
    }

    await query(\`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128)\`);
    await query(\`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT\`);
    await query(\`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)\`);
    await query(\`ALTER TABLE users ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100)\`);
    await query(\`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL\`);

    let result = await query(\`SELECT * FROM users WHERE firebase_uid=$1\`, [uid]);
    let user = result.rows[0];

    if (!user && cleanEmail) {
      result = await query(\`SELECT * FROM users WHERE LOWER(email)=LOWER($1)\`, [cleanEmail]);
      user = result.rows[0];
      if (user && !user.firebase_uid) {
        const linked = await query(\`UPDATE users SET firebase_uid=$1 WHERE id=$2 RETURNING *\`, [uid, user.id]);
        user = linked.rows[0];
      }
    }

    if (!user) {
      const safeRole = ["admin", "moderator", "user"].includes(String(role)) ? String(role) : "user";
      const inserted = await query(
        \`INSERT INTO users (name, email, firebase_uid, password_hash, role)
         VALUES ($1,$2,$3,$4,$5) RETURNING *\`,
        [displayName, cleanEmail, uid, "firebase_only_account", safeRole],
      );
      user = inserted.rows[0];
    }

    const token = randomBytes(32).toString("hex");
    await query(\`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)\`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err: any) {
    if (err?.code === "23505") {
      return res.status(409).json({ error: "الحساب موجود مسبقاً. أعد المحاولة أو استخدم تسجيل الدخول." });
    }
    logger.error({ err }, "firebase exchange error");
    return res.status(500).json({ error: "تعذّر ربط حساب Firebase بالخادم" });
  }
});
`;

if (!src.includes('router.post("/auth/firebase-exchange"')) {
  const marker = 'router.post("/auth/login", authLimiter, async (req: Request, res: Response) => {';
  if (!src.includes(marker)) throw new Error('Login route marker was not found');
  src = src.replace(marker, firebaseExchangeRoute + '\n' + marker);
  changed = true;
}

const oldBlock = `    // مستخدم سجّل عبر Google/Firebase فقط — لا كلمة مرور مستقلة
    if (user.firebase_uid && !user.password_hash) {
      return res.status(401).json({ error: "هذا الحساب مرتبط بـ Google. يرجى تسجيل الدخول عبر زر Google." });
    }
    const valid = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
      // لا توجد كلمة مرور مطلقاً — الحساب Firebase/Google فقط
      if (!user.password_hash) {
        return res.status(401).json({ error: "هذا الحساب مرتبط بـ Google. يرجى تسجيل الدخول عبر زر Google." });
      }
      return res.status(401).json({ error: "بيانات غير صحيحة" });
    }`;

const newBlock = `    // مستخدم تم إنشاؤه/استيراده من Firebase أو Google بلا hash صالح لـ bcrypt.
    // لا نمرر قيماً مثل firebase_only_account إلى bcrypt.compare حتى لا يرمي Server error.
    if (!isValidBcryptHashForLogin(user.password_hash)) {
      return res.status(401).json({
        error: user.firebase_uid
          ? "هذا الحساب مرتبط بـ Google/Firebase. استخدم زر Google أو أعد تعيين كلمة المرور."
          : "هذا الحساب يحتاج إعادة تعيين كلمة المرور قبل الدخول."
      });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "بيانات غير صحيحة" });
    }`;

if (!src.includes(newBlock)) {
  replaceOnce(oldBlock, newBlock);
}

if (changed) {
  writeFileSync(file, src);
  console.log('Patched Firebase exchange and safe login.');
} else {
  console.log('Firebase exchange and safe login patches already applied.');
}
