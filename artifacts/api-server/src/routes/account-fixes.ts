import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";

const router = Router();
const dbUrl = process.env.DATABASE_URL ?? "";
const enabled = !!dbUrl && !dbUrl.includes("placeholder") && !dbUrl.includes(".invalid") && !dbUrl.includes("nodb");
const pool = enabled ? new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, max: 10 }) : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try { return await client.query(sql, params); } finally { client.release(); }
}

function fail(res: Response, status: number, error: string) {
  return res.status(status).json({ ok: false, error });
}

function tokenFrom(req: Request) {
  const raw = req.header("authorization") || "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function maskNationalId(id?: string | null) {
  if (!id) return null;
  return id.length <= 4 ? "****" : "*".repeat(id.length - 4) + id.slice(-4);
}

function userPayload(row: any) {
  return {
    id: row.id,
    uid: row.firebase_uid ?? undefined,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    role: row.role ?? "user",
    neighborhood: row.neighborhood ?? null,
    avatar_url: row.avatar_url ?? null,
    gender: row.gender ?? null,
    national_id_masked: maskNationalId(row.national_id),
    permissions: [],
  };
}

async function ensureAuthTables() {
  await query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    national_id VARCHAR(30) UNIQUE,
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(200) UNIQUE,
    password_hash VARCHAR(255) NOT NULL DEFAULT '',
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await query(`ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT ''`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid_unique ON users(firebase_uid) WHERE firebase_uid IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email))`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_phone_fix ON users(phone)`);
  await query(`CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_token_fix ON user_sessions(token)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_fix ON user_sessions(expires_at)`);
  await query(`CREATE TABLE IF NOT EXISTS admin_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL)`);
  await query(`INSERT INTO admin_settings (key, value) VALUES ('transport_status', 'available') ON CONFLICT (key) DO NOTHING`);
}

async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  await query(`DELETE FROM user_sessions WHERE user_id=$1 OR expires_at < NOW()`, [userId]);
  await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1, $2)`, [userId, token]);
  return token;
}

async function currentUser(req: Request) {
  const token = tokenFrom(req);
  if (!token) return null;
  await ensureAuthTables();
  const r = await query(`SELECT u.* FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at > NOW() LIMIT 1`, [token]);
  return r.rows[0] ?? null;
}

router.post("/auth/firebase-exchange", async (req, res) => {
  try {
    await ensureAuthTables();
    const firebaseUid = String(req.body?.firebase_uid ?? req.body?.uid ?? "").trim();
    const name = String(req.body?.name ?? "مستخدم").trim() || "مستخدم";
    const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
    const role = ["admin", "moderator", "user"].includes(String(req.body?.role)) ? String(req.body.role) : "user";

    if (!firebaseUid) return fail(res, 400, "Firebase UID مفقود");

    let user = await query(`SELECT * FROM users WHERE firebase_uid=$1 LIMIT 1`, [firebaseUid]);

    if (!user.rows.length && rawEmail) {
      user = await query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`, [rawEmail]);
      if (user.rows.length) {
        user = await query(`UPDATE users SET firebase_uid=$2, name=COALESCE(NULLIF($3,''), name) WHERE id=$1 RETURNING *`, [user.rows[0].id, firebaseUid, name]);
      }
    }

    if (!user.rows.length) {
      const email = rawEmail || null;
      user = await query(
        `INSERT INTO users (name, email, firebase_uid, role, password_hash) VALUES ($1,$2,$3,$4,'') RETURNING *`,
        [name, email, firebaseUid, role],
      );
    }

    const token = await createSession(user.rows[0].id);
    return res.json({ ok: true, token, user: userPayload(user.rows[0]) });
  } catch (err: any) {
    console.error("firebase-exchange error:", err);
    if (err?.code === "DB_NOT_CONFIGURED") return fail(res, 503, "قاعدة البيانات غير مهيأة");
    return fail(res, 500, "تعذر ربط حساب Firebase بالسيرفر");
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const user = await currentUser(req);
    if (!user) return fail(res, 401, "يجب تسجيل الدخول أولاً");
    return res.json({ ok: true, user: userPayload(user) });
  } catch { return fail(res, 500, "تعذر جلب بيانات الحساب"); }
});

router.patch("/auth/me/gender", async (req, res) => {
  try {
    const gender = String(req.body?.gender ?? "").trim();
    if (!["male", "female"].includes(gender)) return fail(res, 400, "اختر النوع: ذكر أو أنثى");
    const user = await currentUser(req);
    if (!user) return fail(res, 401, "يجب تسجيل الدخول أولاً");
    const r = await query(`UPDATE users SET gender=$2 WHERE id=$1 RETURNING *`, [user.id, gender]);
    return res.json({ ok: true, user: userPayload(r.rows[0]), gender });
  } catch { return fail(res, 500, "تعذر تحديث النوع"); }
});

router.put("/auth/profile", async (req, res) => {
  try {
    const user = await currentUser(req);
    if (!user) return fail(res, 401, "يجب تسجيل الدخول أولاً");
    const name = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : null;
    const avatar = typeof req.body?.avatar_url === "string" ? req.body.avatar_url.trim() : null;
    const gender = typeof req.body?.gender === "string" ? req.body.gender.trim() : null;
    if (gender && !["male", "female"].includes(gender)) return fail(res, 400, "اختر النوع: ذكر أو أنثى");
    const r = await query(
      `UPDATE users SET name=COALESCE($2,name), avatar_url=COALESCE($3,avatar_url), gender=COALESCE($4,gender) WHERE id=$1 RETURNING *`,
      [user.id, name, avatar || null, gender || null],
    );
    return res.json({ ok: true, user: userPayload(r.rows[0]) });
  } catch { return fail(res, 500, "تعذر تحديث بيانات الحساب"); }
});

router.post("/auth/check-phone", async (req, res) => {
  try {
    await ensureAuthTables();
    const identifier = String(req.body?.identifier ?? req.body?.phone_or_email ?? req.body?.phone ?? req.body?.email ?? "").trim().replace(/\s+/g, "");
    if (!identifier) return fail(res, 400, "أدخل رقم الهاتف أو البريد الإلكتروني");
    const r = await query(`SELECT id,name,phone,email FROM users WHERE phone=$1 OR LOWER(email)=LOWER($1) LIMIT 1`, [identifier]);
    if (!r.rows.length) return res.json({ ok: true, exists: false });
    return res.json({ ok: true, exists: true, name: r.rows[0].name });
  } catch (err: any) {
    if (err?.code === "DB_NOT_CONFIGURED") return fail(res, 503, "قاعدة البيانات غير مهيأة");
    return fail(res, 500, "تعذر التحقق من الحساب");
  }
});

router.post("/auth/forgot-password", (_req, res) => {
  return fail(res, 409, "هذه الحسابات تُدار عبر Firebase. يلزم تفعيل رابط إعادة التعيين بالبريد أو كود SMS قبل تغيير كلمة المرور من التطبيق.");
});

router.get("/transport/settings", async (_req, res) => {
  try {
    await ensureAuthTables();
    const r = await query(`SELECT key,value FROM admin_settings WHERE key IN ('transport_status','transport_note','transport_phone')`);
    const map = Object.fromEntries(r.rows.map((x: any) => [x.key, x.value]));
    return res.json({ ok: true, transport_status: map.transport_status || "available", transport_note: map.transport_note || "", transport_phone: map.transport_phone || "" });
  } catch {
    return res.json({ ok: true, transport_status: "available", transport_note: "", transport_phone: "" });
  }
});

router.put("/admin/transport/settings", async (req, res) => {
  try {
    await ensureAuthTables();
    const status = ["available", "coming_soon", "maintenance"].includes(String(req.body?.transport_status)) ? String(req.body.transport_status) : "available";
    await query(`INSERT INTO admin_settings (key,value) VALUES ('transport_status',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [status]);
    return res.json({ ok: true, transport_status: status });
  } catch { return fail(res, 500, "تعذر حفظ إعدادات مشوارك علينا"); }
});

export default router;
