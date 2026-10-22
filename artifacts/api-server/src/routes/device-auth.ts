// الدخول بالبصمة: الجهاز يحصل على مفتاح سرّي عشوائي بعد تسجيل دخول عادي،
// يُحفظ في التخزين الآمن للجهاز (Keystore) ولا يُفتح إلا بعد التحقق من البصمة.
// الخادم يحفظ فقط بصمة SHA-256 للمفتاح، فتسريب قاعدة البيانات لا يكشف المفاتيح.
import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser } from "../lib/shared-db";
import { authLimiter } from "../lib/rate-limiters";

let ready: Promise<void> | null = null;
function ensureTable() {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS user_device_keys (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL UNIQUE,
      device_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_user_device_keys_user ON user_device_keys(user_id)`);
  })().catch((e) => { ready = null; throw e; }));
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function publicUser(u: Record<string, any>) {
  const { password_hash, national_id, ...rest } = u;
  const nid = String(national_id || "");
  return { ...rest, national_id_masked: nid ? (nid.length <= 4 ? "****" : "*".repeat(nid.length - 4) + nid.slice(-4)) : null, avatar_url: u.avatar_url ?? null };
}

const router = Router();

// POST /api/auth/device-key  (يتطلب جلسة) → { device_key }
router.post("/auth/device-key", async (req, res) => {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    if (user.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    await ensureTable();
    const key = randomBytes(32).toString("hex");
    const device = String(req.body?.device_name || "").slice(0, 80) || null;
    // جهاز واحد = مفتاح واحد؛ نحدّ عدد الأجهزة لكل مستخدم بـ 5
    const prev = req.body?.previous_key ? sha(String(req.body.previous_key)) : null;
    if (prev) await query(`DELETE FROM user_device_keys WHERE user_id=$1 AND key_hash=$2`, [user.id, prev]);
    await query(`INSERT INTO user_device_keys (user_id, key_hash, device_name) VALUES ($1,$2,$3)`, [user.id, sha(key), device]);
    await query(`DELETE FROM user_device_keys WHERE user_id=$1 AND id NOT IN (
      SELECT id FROM user_device_keys WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5)`, [user.id]);
    return res.json({ device_key: key });
  } catch (err: any) {
    logger.error({ err: err?.message }, "device-key");
    return res.status(500).json({ error: "تعذّر تفعيل البصمة" });
  }
});

// POST /api/auth/device-login { device_key } → { user, token }
router.post("/auth/device-login", authLimiter, async (req, res) => {
  try {
    const key = String(req.body?.device_key || "");
    if (!/^[a-f0-9]{64}$/.test(key)) return res.status(400).json({ error: "مفتاح غير صالح" });
    await ensureTable();
    const r = await query(
      `SELECT u.*, k.id AS _kid FROM user_device_keys k JOIN users u ON u.id=k.user_id WHERE k.key_hash=$1 LIMIT 1`, [sha(key)]);
    const row = r.rows[0];
    if (!row) return res.status(401).json({ error: "انتهت صلاحية البصمة على هذا الجهاز — سجّل الدخول بكلمة المرور ثم فعّلها من جديد", code: "DEVICE_KEY_INVALID" });
    if (row.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    const { _kid, ...user } = row;
    await query(`UPDATE user_device_keys SET last_used_at=NOW() WHERE id=$1`, [_kid]);
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: publicUser(user), token });
  } catch (err: any) {
    logger.error({ err: err?.message }, "device-login");
    return res.status(500).json({ error: "تعذّر الدخول بالبصمة" });
  }
});

// POST /api/auth/device-key/revoke { device_key }
router.post("/auth/device-key/revoke", async (req, res) => {
  try {
    const key = String(req.body?.device_key || "");
    if (key) { await ensureTable(); await query(`DELETE FROM user_device_keys WHERE key_hash=$1`, [sha(key)]); }
    return res.json({ ok: true });
  } catch { return res.json({ ok: true }); }
});

export default router;
