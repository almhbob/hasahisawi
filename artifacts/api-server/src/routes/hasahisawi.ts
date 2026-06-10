import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkContent } from "../lib/content-moderator";
import { authLimiter, pinLimiter, registerLimiter, writeLimiter, heavyWriteLimiter } from "../lib/rate-limiters";
import { verifyIdToken, listAllFirebaseUsers } from "../lib/firebase-admin";
import { logger } from "../lib/logger";

const router = Router();

// DB init runs eagerly at module load — idempotent, non-blocking.
// Each route that needs a specific table calls its own ensureXxx() instead.
let _dbInitPromise: Promise<void> | null = null;

// Only create a real pool when DATABASE_URL is a valid external connection string.
// Without this guard, pg opens TCP sockets that hang silently on hosted platforms
// (e.g. Render) causing an ETIMEDOUT crash after ~60 s even when errors are caught.
const _dbUrl = process.env.DATABASE_URL ?? "";
const _dbEnabled =
  _dbUrl.length > 0 &&
  !_dbUrl.includes(".invalid") &&
  !_dbUrl.includes("placeholder") &&
  !_dbUrl.includes("nodb");

const pool: Pool | null = _dbEnabled
  ? new Pool({
      connectionString: _dbUrl,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      max: 15,
      allowExitOnIdle: false,
      ssl: _dbUrl.includes("sslmode=require") || _dbUrl.includes("ssl=true")
        ? { rejectUnauthorized: false }
        : false,
    })
  : null;

if (pool) {
  pool.on("error", (err) => logger.error({ err }, "pg pool idle-client error"));
} else {
  logger.warn("DATABASE_URL not set or is a placeholder — DB features are disabled until a real URL is configured.");
}

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}


// ══════════════════════════════════════════════════════
// إرسال Push Notification عبر Expo Push Service
// ══════════════════════════════════════════════════════
async function sendPushToUser(
  userId: number,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { rows } = await query(
      `SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 ORDER BY token`,
      [userId]
    );
    if (!rows.length) return;

    // إرسال لجميع أجهزة المستخدم دفعةً واحدة
    const tokens = rows
      .map(r => r.token as string)
      .filter(t => t?.startsWith("ExponentPushToken["));
    if (!tokens.length) return;

    const messages = tokens.map(to => ({
      to, title, body, data, sound: "default", badge: 1,
    }));

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    }).catch((e) => { logger.warn({ err: e }, "[push] Expo push delivery failed"); });
  } catch (e) { logger.warn({ err: e }, "[push] sendPushToUser failed"); }
}

const DEFAULT_ADMIN_PIN = process.env.DEFAULT_ADMIN_PIN ?? "4444";

// إشعار فوري لجميع المشرفين عند ورود طلب جديد
async function sendPushToAdmins(title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
  try {
    const { rows } = await query(
      `SELECT DISTINCT pt.token FROM push_tokens pt JOIN users u ON u.id = pt.user_id WHERE u.role IN ('admin','moderator') AND pt.token LIKE 'ExponentPushToken[%'`
    );
    if (!rows.length) return;
    const messages = rows.map(r => ({ to: r.token as string, title, body, data, sound: "hasahisawi_notif", badge: 1 }));
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    }).catch((e) => { logger.warn({ err: e }, "[push] Expo push delivery failed"); });
  } catch (e) { logger.warn({ err: e }, "[push] sendPushToAdmins failed"); }
}

// ── reCAPTCHA v2 verification ────────────────────────────────────────────────
async function verifyRecaptcha(token: string | undefined): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true; // skip if not configured
  if (!token)  return false;
  try {
    const res = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${token}`,
      { method: "POST" }
    );
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

function maskNationalId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 4) return "****";
  return "*".repeat(id.length - 4) + id.slice(-4);
}

function safeUserPayload(user: Record<string, unknown>) {
  const { password_hash, national_id, ...rest } = user;
  return {
    ...rest,
    national_id_masked: maskNationalId(national_id as string),
    avatar_url: user.avatar_url ?? null,
  };
}

export function initHasahisawiDb(): Promise<void> {
  return (_dbInitPromise ??= _doInitHasahisawiDb());
}
async function _doInitHasahisawiDb(): Promise<void> {
  if (!pool) {
    logger.warn("initHasahisawiDb: skipped — no valid DATABASE_URL");
    return;
  }
  // ══ جدول المستخدمين أولاً — لأن كل الجداول الأخرى تُشير إليه ══
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      national_id VARCHAR(30) UNIQUE,
      phone VARCHAR(20) UNIQUE,
      email VARCHAR(200) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(30)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE`);

  await query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      phone_or_email VARCHAR(200) NOT NULL,
      code VARCHAR(6) NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'register',
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      attempts INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_codes(phone_or_email, type, created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at) WHERE used = FALSE`);

  // جدول رموز إعادة تعيين كلمة المرور الآمنة (مرتبطة بـ OTP)
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      identifier VARCHAR(200) NOT NULL,
      token VARCHAR(128) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_prt_token      ON password_reset_tokens(token) WHERE used = FALSE`);
  await query(`CREATE INDEX IF NOT EXISTS idx_prt_identifier ON password_reset_tokens(identifier, created_at)`);

  // ربط مشرف الشركة المُشغِّلة بالشركة (لعزل لوحة "مشوارك علينا" عن المنصة العامة)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS operator_id INTEGER`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_operator_id ON users(operator_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_phone    ON users(phone) WHERE phone IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email) WHERE email IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL`);

  await query(`
    CREATE TABLE IF NOT EXISTS social_posts (
      id SERIAL PRIMARY KEY,
      author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
      content TEXT NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'عام',
      image_url TEXT,
      video_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS video_url TEXT`);
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await query(`
    CREATE TABLE IF NOT EXISTS social_comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS social_likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
      device_id VARCHAR(200) NOT NULL,
      UNIQUE(post_id, device_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await query(`
    INSERT INTO admin_settings (key, value) VALUES ('admin_pin', $1)
    ON CONFLICT (key) DO NOTHING
  `, [DEFAULT_ADMIN_PIN]);
  await query(`
    INSERT INTO admin_settings (key, value) VALUES ('admin_name', 'المسؤول')
    ON CONFLICT (key) DO NOTHING
  `);
  await query(`
    INSERT INTO admin_settings (key, value) VALUES ('app_version', '1')
    ON CONFLICT (key) DO NOTHING
  `);
  await query(`
    INSERT INTO admin_settings (key, value) VALUES ('app_update_notes', '')
    ON CONFLICT (key) DO NOTHING
  `);
  await query(`
    INSERT INTO admin_settings (key, value) VALUES ('app_update_force', 'false')
    ON CONFLICT (key) DO NOTHING
  `);
  await query(`
    INSERT INTO admin_settings (key, value) VALUES ('gov_services_enabled', 'true')
    ON CONFLICT (key) DO NOTHING
  `);
  await query(`
    INSERT INTO admin_settings (key, value) VALUES ('gov_appointments_enabled', 'true')
    ON CONFLICT (key) DO NOTHING
  `);
  await query(`
    INSERT INTO admin_settings (key, value) VALUES ('gov_reports_enabled', 'true')
    ON CONFLICT (key) DO NOTHING
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
    )
  `);
  await query(`
    ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS moderator_permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section VARCHAR(50) NOT NULL,
      UNIQUE(user_id, section)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'general',
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // ترحيل: أعمدة أضيفت بعد الإنشاء الأولي لجدول الإشعارات
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data TEXT`);
  await query(`
    CREATE TABLE IF NOT EXISTS city_news (
      id SERIAL PRIMARY KEY,
      title VARCHAR(300) NOT NULL,
      content TEXT NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      author_name VARCHAR(100) NOT NULL DEFAULT 'إدارة التطبيق',
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query("DELETE FROM user_sessions WHERE expires_at < NOW()");

  // ── جدول الجاليات ────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS communities (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'wafid',
      origin VARCHAR(200),
      description TEXT,
      representative_name VARCHAR(200),
      contact_phone VARCHAR(50),
      members_count INTEGER DEFAULT 0,
      neighborhood VARCHAR(100),
      services TEXT,
      meeting_schedule VARCHAR(200),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add columns introduced after initial table creation
  await query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS submitted_by INTEGER`);
  await query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS submitted_by_name VARCHAR(200)`);
  await query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS suspension_reason TEXT`);
  // Representative personal data
  await query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS representative_title VARCHAR(200)`);
  await query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS representative_phone VARCHAR(50)`);
  await query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS representative_national_id VARCHAR(100)`);
  await query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS representative_email VARCHAR(200)`);
  // Services management
  await query(`ALTER TABLE communities ADD COLUMN IF NOT EXISTS services_hidden TEXT`);
  // طلبات تعديل الخدمات
  await query(`
    CREATE TABLE IF NOT EXISTS community_service_requests (
      id SERIAL PRIMARY KEY,
      community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      action VARCHAR(10) NOT NULL CHECK (action IN ('add','hide','show')),
      service_name VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      submitted_by INTEGER,
      submitted_by_name VARCHAR(200),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewer_note TEXT
    )
  `);
  // No default communities — they will be added by admin after official agreement with each institution

  // ── تهيئة الأحياء والقرى الحقيقية (مصدر: ويكيبيديا الحصاحيصا) ──────
  // تُضاف فقط إذا لم تكن موجودة بالفعل في قاعدة البيانات
  {
    const existing = await query(`SELECT key FROM admin_settings WHERE key LIKE 'nbr_%' LIMIT 1`);
    if (existing.rows.length === 0) {
      const realLocations: Array<{ label: string; type: "neighborhood" | "village" }> = [
        // أحياء مدينة الحصاحيصا
        { label: "الحي الشرقي",          type: "neighborhood" },
        { label: "الحي الأوسط",          type: "neighborhood" },
        { label: "حي الواحة",            type: "neighborhood" },
        { label: "حي الصفاء",            type: "neighborhood" },
        { label: "حي الزهور",            type: "neighborhood" },
        { label: "حي العمدة",            type: "neighborhood" },
        { label: "حي الموظفين",          type: "neighborhood" },
        { label: "حي كريمة",             type: "neighborhood" },
        { label: "حي الفيحاء",           type: "neighborhood" },
        { label: "حي الصداقة",           type: "neighborhood" },
        { label: "حي المايقوما",         type: "neighborhood" },
        { label: "حي الضقالة",           type: "neighborhood" },
        { label: "حي فور",               type: "neighborhood" },
        { label: "الامتداد",             type: "neighborhood" },
        { label: "الحلة الجديدة",        type: "neighborhood" },
        { label: "المنصورة",             type: "neighborhood" },
        { label: "المزاد",               type: "neighborhood" },
        { label: "الكرمك",               type: "neighborhood" },
        { label: "الكومبو",              type: "neighborhood" },
        { label: "الجملونات",            type: "neighborhood" },
        { label: "الطائف",               type: "neighborhood" },
        { label: "ود الكامل",            type: "neighborhood" },
        { label: "أركويت",               type: "neighborhood" },
        // مناطق فرعية
        { label: "الطالباب",             type: "neighborhood" },
        { label: "الكشامر",              type: "neighborhood" },
        { label: "أم دغينة",             type: "neighborhood" },
        { label: "أم عضام",              type: "neighborhood" },
        { label: "ود السيد",             type: "neighborhood" },
        { label: "أبو فروع",             type: "neighborhood" },
        { label: "عمارة أبيد",           type: "neighborhood" },
        { label: "ود سلفاب",             type: "neighborhood" },
        { label: "ود الفادني",           type: "neighborhood" },
        { label: "أبو جيلي",             type: "neighborhood" },
        { label: "ودشمو",                type: "neighborhood" },
        { label: "أربجي",                type: "neighborhood" },
        // قرى محلية الحصاحيصا
        { label: "المسلمية",             type: "village" },
        { label: "ود حبوبة",             type: "village" },
        { label: "أبو قوتة",             type: "village" },
        { label: "الربع",                type: "village" },
        { label: "طابت",                 type: "village" },
        { label: "المحيريبا",            type: "village" },
        { label: "قرية الولي",           type: "village" },
        { label: "ود بهاي",              type: "village" },
        { label: "طيبة الشيخ القرشي",   type: "village" },
        { label: "كبنة",                 type: "village" },
        { label: "تنة",                  type: "village" },
        { label: "بانت",                 type: "village" },
        { label: "الجلاد",               type: "village" },
        { label: "ود العباس",            type: "village" },
        { label: "طابية",                type: "village" },
        { label: "بمبان",                type: "village" },
        { label: "هيصة",                 type: "village" },
        { label: "ود النيل",             type: "village" },
        { label: "أم ضباع",              type: "village" },
        { label: "حلفاية الحصاحيصا",    type: "village" },
        { label: "الشيخ حماد",           type: "village" },
        { label: "الشيخ طيب",            type: "village" },
        { label: "ود بلال",              type: "village" },
        { label: "أبو عشر",              type: "village" },
        { label: "أخرى / خارج الحصاحيصا", type: "village" },
      ];
      for (const loc of realLocations) {
        const k = `nbr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await query(
          `INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
          [k, JSON.stringify({ label: loc.label, type: loc.type, key: k })]
        );
      }
      logger.info(`تم تهيئة ${realLocations.length} حياً وقرية حقيقية في قاعدة البيانات`);
    }
  }

  // ── جدول الإعلانات المدفوعة ──────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS ads (
      id SERIAL PRIMARY KEY,
      institution_name VARCHAR(200) NOT NULL,
      contact_name VARCHAR(200),
      contact_phone VARCHAR(50),
      title VARCHAR(300) NOT NULL,
      description TEXT,
      type VARCHAR(50) NOT NULL DEFAULT 'promotion',
      target_screen VARCHAR(50) NOT NULL DEFAULT 'all',
      duration_days INTEGER NOT NULL DEFAULT 7,
      budget VARCHAR(100),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      start_date TIMESTAMPTZ,
      end_date TIMESTAMPTZ,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      approved_by INTEGER REFERENCES users(id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS city_landmarks (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      sub VARCHAR(200) NOT NULL DEFAULT '',
      image_url VARCHAR(500) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const { rows: lmRows } = await query(`SELECT COUNT(*) as cnt FROM city_landmarks`);
  if (parseInt(lmRows[0].cnt, 10) === 0) {
    await query(`
      INSERT INTO city_landmarks (name, sub, image_url, sort_order) VALUES
        ('عجلة الهواء',  'كورنيش الحصاحيصا',      'local:ferris-wheel',  0),
        ('كورنيش النيل', 'إطلالة على النيل الأزرق', 'local:hasahisa-city', 1)
    `);
  }

  await query(`
    CREATE TABLE IF NOT EXISTS honored_figures (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      title VARCHAR(200) NOT NULL DEFAULT '',
      city_role VARCHAR(200) NOT NULL DEFAULT '',
      photo_url VARCHAR(500) NOT NULL,
      tribute TEXT NOT NULL DEFAULT '',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS greetings (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
      text        TEXT NOT NULL,
      occasion_name VARCHAR(100) NOT NULL DEFAULT 'تهنئة عامة',
      likes       INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS rated_entities (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      name VARCHAR(200) NOT NULL,
      subtitle VARCHAR(200),
      category VARCHAR(100),
      phone VARCHAR(30),
      district VARCHAR(100),
      notes TEXT,
      submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ratings (
      id SERIAL PRIMARY KEY,
      entity_id INTEGER REFERENCES rated_entities(id) ON DELETE CASCADE,
      target_type VARCHAR(50),
      target_id VARCHAR(100),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      device_id VARCHAR(200),
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE ratings ADD COLUMN IF NOT EXISTS entity_id INTEGER REFERENCES rated_entities(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE ratings ADD COLUMN IF NOT EXISTS device_id VARCHAR(200)`);
  await (async () => {
    const seedCheck = await query(`SELECT COUNT(*)::int as c FROM rated_entities`);
    if (seedCheck.rows[0].c === 0) {
      const seeds = [
        ["institution","محكمة الحصاحيصا","جهاز حكومي","محاكم","وسط المدينة","خدمات قانونية وقضائية"],
        ["institution","مستشفى الحصاحيصا","مستشفى","صحة","حي المستشفى","رعاية صحية شاملة"],
        ["institution","مدرسة الحصاحيصا الأساسية","مدرسة","تعليم","حي الشرق","تعليم ابتدائي وإعدادي"],
        ["institution","بريد الحصاحيصا","جهاز حكومي","بريد وخدمات","السوق المركزي","خدمات البريد والحوالات"],
        ["institution","بنك الخرطوم — فرع الحصاحيصا","مصرف","بنوك","شارع النيل","خدمات مصرفية"],
        ["institution","سوق الحصاحيصا المركزي","سوق","تجارة","وسط المدينة","سوق تجاري مركزي"],
        ["employee","أحمد عبدالله النور","مدير مستشفى الحصاحيصا","إدارة","مستشفى الحصاحيصا",""],
        ["employee","فاطمة إبراهيم","طبيبة أطفال","طب","مستشفى الحصاحيصا",""],
        ["employee","موسى محمد أحمد","مدير مدرسة الحصاحيصا","تعليم","مدرسة الحصاحيصا الأساسية",""],
        ["service_seeker","عمر الفاضل","مقاول بناء","بناء","الحصاحيصا","تشطيبات وبناء"],
        ["service_seeker","مصطفى التوم","كهربائي","كهرباء","الحصاحيصا","تمديد وإصلاح كهربائي"],
        ["service_seeker","إبراهيم سليمان","سباك","سباكة","الحصاحيصا","تركيب وإصلاح سباكة"],
        ["service_seeker","يوسف عبدالرحمن","نجار","نجارة","الحصاحيصا","أثاث وأبواب خشبية"],
        ["service_seeker","علي الشيخ","ميكانيكي","سيارات","ورشة السوق","إصلاح سيارات وشاحنات"],
      ];
      for (const [type, name, subtitle, category, district, notes] of seeds) {
        await query(
          `INSERT INTO rated_entities (type, name, subtitle, category, district, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
          [type, name, subtitle, category, district, notes]
        );
      }
      const entities = await query(`SELECT id FROM rated_entities ORDER BY id`);
      const sampleRatings: [number, number, string][] = [
        [entities.rows[0].id, 3, "خدمة مقبولة لكن بطيئة"],
        [entities.rows[0].id, 4, "تحسّنت الخدمة مؤخراً"],
        [entities.rows[1].id, 5, "أطباء ممتازون ومتفانون"],
        [entities.rows[1].id, 4, "نظيف ومنظّم"],
        [entities.rows[1].id, 3, "يحتاج معدات أحدث"],
        [entities.rows[2].id, 4, "مدرسة جيدة وهيئة تدريس محترمة"],
        [entities.rows[4].id, 5, "خدمة سريعة واحترافية"],
        [entities.rows[5].id, 4, "أسعار معقولة وتنوع جيد"],
        [entities.rows[6].id, 5, "مدير نشيط ومتعاون"],
        [entities.rows[9].id, 5, "عمل ممتاز ودقيق في المواعيد"],
        [entities.rows[10].id, 4, "محترف وأسعاره مناسبة"],
        [entities.rows[11].id, 3, "جيد لكن يتأخر أحياناً"],
        [entities.rows[12].id, 5, "خشبه عالي الجودة ونظيف"],
        [entities.rows[13].id, 4, "ميكانيكي ماهر وأمين"],
      ];
      for (const [eid, stars, comment] of sampleRatings) {
        await query(
          `INSERT INTO ratings (entity_id, rating, comment, target_type, target_id) VALUES ($1,$2,$3,'entity',$4)`,
          [eid, stars, comment, String(eid)]
        );
      }
    }
  })();
  await query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type VARCHAR(50) NOT NULL,
      target_id VARCHAR(100) NOT NULL,
      appointment_date DATE NOT NULL,
      appointment_time VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS women_services (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(50) NOT NULL,
      address TEXT NOT NULL,
      phone VARCHAR(20) NOT NULL,
      hours VARCHAR(100),
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      contact_info TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_message TEXT DEFAULT '',
      last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sender_id INTEGER,
      unread_user1 INTEGER NOT NULL DEFAULT 0,
      unread_user2 INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user1_id, user2_id)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id SERIAL PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      image_url TEXT,
      type VARCHAR(10) NOT NULL DEFAULT 'text',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_read BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  // ── جدول push tokens لإشعارات الجهاز ──
  await query(`
    CREATE TABLE IF NOT EXISTS push_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      platform VARCHAR(10) NOT NULL DEFAULT 'android',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id)
    )
  `);

  // ── جدول أماكن خريطة المدينة ──
  await query(`
    CREATE TABLE IF NOT EXISTS map_places (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'other',
      address VARCHAR(300),
      phone VARCHAR(50),
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      icon VARCHAR(50) NOT NULL DEFAULT 'location',
      color VARCHAR(10) NOT NULL DEFAULT '#3EFF9C',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // بيانات أولية لأماكن الحصاحيصا
  const { rows: mapRows } = await query(`SELECT COUNT(*) as cnt FROM map_places`);
  if (parseInt(mapRows[0].cnt, 10) === 0) {
    await query(`
      INSERT INTO map_places (name, category, address, phone, lat, lng, icon, color) VALUES
        ('مركز مدينة الحصاحيصا',  'landmark',  'وسط الحصاحيصا',             NULL,          14.6839, 33.3833, 'star',        '#D4AF37'),
        ('مستشفى الحصاحيصا',      'medical',   'شارع المستشفى، الحصاحيصا', '0111000001',  14.6855, 33.3845, 'hospital',    '#E74C6F'),
        ('عيادة أم سلمة',         'medical',   'حي الوسط، الحصاحيصا',      '0111000002',  14.6831, 33.3820, 'hospital',    '#E74C6F'),
        ('مدرسة الحصاحيصا الثانوية','school',  'حي الشمال، الحصاحيصا',     NULL,          14.6862, 33.3810, 'school',      '#3B82F6'),
        ('مدرسة النيل الأساسية',   'school',   'حي النيل، الحصاحيصا',      NULL,          14.6820, 33.3855, 'school',      '#3B82F6'),
        ('سوق الحصاحيصا المركزي', 'market',   'منطقة السوق، الحصاحيصا',   NULL,          14.6825, 33.3828, 'cart',        '#F59E0B'),
        ('مسجد التقوى',           'mosque',   'حي الوسط، الحصاحيصا',      NULL,          14.6844, 33.3838, 'moon',        '#10B981'),
        ('مسجد النور',            'mosque',   'حي الجنوب، الحصاحيصا',     NULL,          14.6815, 33.3842, 'moon',        '#10B981'),
        ('كورنيش النيل',          'landmark', 'شاطئ النيل الأزرق',         NULL,          14.6870, 33.3870, 'water',       '#0EA5E9'),
        ('إدارة مدينة الحصاحيصا', 'gov',      'مبنى الإدارة، وسط المدينة', '0111000010', 14.6835, 33.3830, 'business',    '#8B5CF6'),
        ('صيدلية الشفاء',         'pharmacy', 'شارع الرئيسي، الحصاحيصا',  '0111000011', 14.6841, 33.3825, 'medical',     '#06B6D4'),
        ('بنك السودان - فرع الحصاحيصا','bank','حي البنوك، الحصاحيصا',     '0111000012', 14.6828, 33.3835, 'card',        '#6366F1'),
        ('محطة الوقود المركزية',  'gas',      'مدخل المدينة الشمالي',      NULL,          14.6880, 33.3800, 'car',         '#F97316'),
        ('مركز الشباب والرياضة',  'sports',   'حي الرياضة، الحصاحيصا',    NULL,          14.6810, 33.3860, 'football',    '#EF4444'),
        ('مكتبة الحصاحيصا',       'culture',  'وسط المدينة',               NULL,          14.6837, 33.3843, 'book',        '#A855F7')
    `);
  }

  // ── تحديث جدول الإعلانات — إضافة image_url إن لم تكن موجودة ──
  await query(`ALTER TABLE ads ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await query(`ALTER TABLE ads ADD COLUMN IF NOT EXISTS website_url TEXT`);

  // ── إعدادات الإعلانات الافتراضية ──
  const adsDefaults: [string, string][] = [
    ["ad_price_per_day",      "500"],
    ["ad_contact_phone",      "+249000000000"],
    ["ad_contact_whatsapp",   "+249000000000"],
    ["ad_promo_text",         "انضم إلى منصة حصاحيصاوي وأوصل إعلانك لآلاف أبناء المدينة مباشرةً"],
    ["ad_partner_email",      ""],
    ["ad_bank_info",          ""],
    ["contract_whatsapp",     "+966597083352"],
  ];
  for (const [k, v] of adsDefaults) {
    await query(
      `INSERT INTO admin_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
      [k, v],
    );
  }

  // ── جدول طلبات انضمام المؤسسات ──
  await query(`
    CREATE TABLE IF NOT EXISTS institution_applications (
      id SERIAL PRIMARY KEY,
      -- بيانات المؤسسة
      inst_name VARCHAR(300) NOT NULL,
      inst_type VARCHAR(100) NOT NULL,
      inst_category VARCHAR(100) NOT NULL,
      inst_description TEXT NOT NULL,
      inst_address VARCHAR(400) NOT NULL,
      inst_neighborhood VARCHAR(200),
      inst_phone VARCHAR(80) NOT NULL,
      inst_email VARCHAR(200),
      inst_website VARCHAR(300),
      inst_registration_no VARCHAR(100),
      inst_founded_year VARCHAR(10),
      -- الخدمات المقدمة
      selected_services TEXT NOT NULL DEFAULT '[]',
      custom_services TEXT,
      -- بيانات الممثل
      rep_name VARCHAR(300) NOT NULL,
      rep_title VARCHAR(200) NOT NULL,
      rep_national_id VARCHAR(100) NOT NULL,
      rep_phone VARCHAR(80) NOT NULL,
      rep_email VARCHAR(200),
      -- العهد والتوقيع
      signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signed_ip VARCHAR(80),
      commitment_version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
      -- الحالة
      status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected','suspended')),
      admin_note TEXT,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      -- الربط
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── ترقيات جدول طلبات المؤسسات ──
  // These ALTERs ensure the table works whether it was created now or existed
  // from an earlier schema that used different column names (applicant_name, etc.)
  const iaAlters = [
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_name VARCHAR(300)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_type VARCHAR(100)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_category VARCHAR(100)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_description TEXT`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_address VARCHAR(400)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_neighborhood VARCHAR(200)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_phone VARCHAR(80)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_email VARCHAR(200)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_website VARCHAR(300)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_registration_no VARCHAR(100)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS inst_founded_year VARCHAR(10)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS selected_services TEXT DEFAULT '[]'`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS custom_services TEXT`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS rep_name VARCHAR(300)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS rep_title VARCHAR(200)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS rep_national_id VARCHAR(100)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS rep_phone VARCHAR(80)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS rep_email VARCHAR(200)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS rep_photo_url TEXT`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS signed_contract_url TEXT`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS signed_contract_at TIMESTAMPTZ`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS signed_ip VARCHAR(80)`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS commitment_version VARCHAR(20) DEFAULT 'v1.0'`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS admin_note TEXT`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const sql of iaAlters) { await query(sql).catch(() => {}); }

  // ── جدول بلاغات المواطنين ──
  await query(`
    CREATE TABLE IF NOT EXISTS citizen_reports (
      id SERIAL PRIMARY KEY,
      agency_id VARCHAR(20) NOT NULL,
      agency_name VARCHAR(200) NOT NULL,
      agency_color VARCHAR(20) NOT NULL DEFAULT '#27AE68',
      issue VARCHAR(200) NOT NULL,
      description TEXT,
      location VARCHAR(300) NOT NULL,
      reporter_name VARCHAR(200) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      urgent BOOLEAN NOT NULL DEFAULT false,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','inProgress','resolved')),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── إضافة أعمدة الصورة والموقع الجغرافي لبلاغات المواطنين ──
  await query(`ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await query(`ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION`);
  await query(`ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION`);

  // ── جدول المقترحات والشكاوى ──
  await query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      type VARCHAR(20) NOT NULL CHECK (type IN ('suggestion','complaint','general')),
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      sender_name VARCHAR(200) NOT NULL,
      phone VARCHAR(50),
      category VARCHAR(100) NOT NULL DEFAULT 'عام',
      status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','replied')),
      admin_reply TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── جدول طلبات الانضمام لركن المرأة ──────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS women_join_requests (
      id          SERIAL PRIMARY KEY,
      owner_name  VARCHAR(100) NOT NULL,
      service_type VARCHAR(40) NOT NULL,
      phone       VARCHAR(25) NOT NULL,
      address     VARCHAR(200) NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status      VARCHAR(20) NOT NULL DEFAULT 'new',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── جداول مناسبتي ──────────────────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS occasion_shops (
      id SERIAL PRIMARY KEY,
      owner_name VARCHAR(100) NOT NULL,
      shop_name  VARCHAR(150) NOT NULL,
      phone      VARCHAR(25) NOT NULL UNIQUE,
      whatsapp   VARCHAR(25),
      city_area  VARCHAR(100) NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      social_link TEXT NOT NULL DEFAULT '',
      status     VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      notes      TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS occasion_items (
      id         SERIAL PRIMARY KEY,
      shop_id    INTEGER NOT NULL REFERENCES occasion_shops(id) ON DELETE CASCADE,
      name       VARCHAR(150) NOT NULL,
      category   VARCHAR(60) NOT NULL DEFAULT 'other',
      icon       VARCHAR(80) NOT NULL DEFAULT 'package-variant',
      price_hint VARCHAR(100) NOT NULL DEFAULT '',
      quantity   INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 99,
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS occasion_transport (
      id           SERIAL PRIMARY KEY,
      owner_name   VARCHAR(100) NOT NULL,
      vehicle_type VARCHAR(40) NOT NULL,
      vehicle_desc VARCHAR(200) NOT NULL DEFAULT '',
      capacity     INTEGER NOT NULL DEFAULT 0,
      phone        VARCHAR(25) NOT NULL,
      whatsapp     VARCHAR(25) NOT NULL DEFAULT '',
      area         VARCHAR(100) NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT '',
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      is_visible   BOOLEAN NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ═══════════ المحامون والخدمات القانونية ═══════════
  await query(`
    CREATE TABLE IF NOT EXISTS lawyers (
      id           SERIAL PRIMARY KEY,
      full_name    VARCHAR(150) NOT NULL,
      title        VARCHAR(100) NOT NULL DEFAULT 'محامي',
      specialties  TEXT NOT NULL DEFAULT '',
      bio          TEXT NOT NULL DEFAULT '',
      phone        VARCHAR(25) NOT NULL DEFAULT '',
      whatsapp     VARCHAR(25) NOT NULL DEFAULT '',
      email        VARCHAR(150) NOT NULL DEFAULT '',
      office_addr  VARCHAR(250) NOT NULL DEFAULT '',
      district     VARCHAR(100) NOT NULL DEFAULT '',
      bar_number   VARCHAR(50)  NOT NULL DEFAULT '',
      experience_y INTEGER NOT NULL DEFAULT 0,
      photo_url    TEXT NOT NULL DEFAULT '',
      languages    VARCHAR(150) NOT NULL DEFAULT 'العربية',
      consult_fee  VARCHAR(80) NOT NULL DEFAULT '',
      is_featured  BOOLEAN NOT NULL DEFAULT FALSE,
      is_verified  BOOLEAN NOT NULL DEFAULT FALSE,
      is_active    BOOLEAN NOT NULL DEFAULT TRUE,
      entity_id    INTEGER REFERENCES rated_entities(id) ON DELETE SET NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_lawyers_active   ON lawyers(is_active)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_lawyers_featured ON lawyers(is_featured)`);

  await query(`
    CREATE TABLE IF NOT EXISTS lawyer_services (
      id          SERIAL PRIMARY KEY,
      lawyer_id   INTEGER NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
      title       VARCHAR(150) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_text  VARCHAR(100) NOT NULL DEFAULT '',
      duration    VARCHAR(80)  NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 99,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_lawyer_services_lawyer ON lawyer_services(lawyer_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS lawyer_contracts (
      id           SERIAL PRIMARY KEY,
      lawyer_id    INTEGER NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
      service_id   INTEGER REFERENCES lawyer_services(id) ON DELETE SET NULL,
      user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      device_id    VARCHAR(200),
      client_name  VARCHAR(150) NOT NULL,
      client_phone VARCHAR(25)  NOT NULL,
      service_title VARCHAR(200) NOT NULL DEFAULT '',
      details      TEXT NOT NULL DEFAULT '',
      preferred_date DATE,
      status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','in_progress','completed','rejected','cancelled')),
      lawyer_note  TEXT NOT NULL DEFAULT '',
      contract_no  VARCHAR(40) NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_lawyer_contracts_lawyer ON lawyer_contracts(lawyer_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_lawyer_contracts_user   ON lawyer_contracts(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_lawyer_contracts_device ON lawyer_contracts(device_id)`);

  // ── دردشة القضية (رسائل بين المحامي والعميل) ──────────────
  await query(`
    CREATE TABLE IF NOT EXISTS lawyer_case_messages (
      id           SERIAL PRIMARY KEY,
      contract_id  INTEGER NOT NULL REFERENCES lawyer_contracts(id) ON DELETE CASCADE,
      sender_role  VARCHAR(10) NOT NULL DEFAULT 'client' CHECK (sender_role IN ('lawyer','client')),
      sender_name  VARCHAR(150) NOT NULL DEFAULT '',
      body         TEXT NOT NULL DEFAULT '',
      file_url     TEXT NOT NULL DEFAULT '',
      file_name    VARCHAR(255) NOT NULL DEFAULT '',
      file_type    VARCHAR(80)  NOT NULL DEFAULT '',
      is_read      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_case_msgs_contract ON lawyer_case_messages(contract_id)`);

  // ── مستندات القضية ────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS lawyer_case_documents (
      id           SERIAL PRIMARY KEY,
      contract_id  INTEGER NOT NULL REFERENCES lawyer_contracts(id) ON DELETE CASCADE,
      lawyer_id    INTEGER NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
      title        VARCHAR(255) NOT NULL DEFAULT 'مستند',
      file_url     TEXT NOT NULL DEFAULT '',
      file_name    VARCHAR(255) NOT NULL DEFAULT '',
      file_type    VARCHAR(80)  NOT NULL DEFAULT '',
      file_size    INTEGER NOT NULL DEFAULT 0,
      uploaded_by  VARCHAR(10) NOT NULL DEFAULT 'lawyer' CHECK (uploaded_by IN ('lawyer','client')),
      notes        TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_case_docs_contract ON lawyer_case_documents(contract_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_case_docs_lawyer   ON lawyer_case_documents(lawyer_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS lawyer_ads (
      id          SERIAL PRIMARY KEY,
      lawyer_id   INTEGER REFERENCES lawyers(id) ON DELETE CASCADE,
      title       VARCHAR(200) NOT NULL,
      body        TEXT NOT NULL DEFAULT '',
      cta_text    VARCHAR(60)  NOT NULL DEFAULT 'تواصل الآن',
      cta_phone   VARCHAR(25)  NOT NULL DEFAULT '',
      banner_color VARCHAR(20) NOT NULL DEFAULT '#8B5CF6',
      starts_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at     TIMESTAMPTZ,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order  INTEGER NOT NULL DEFAULT 99,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS legal_forms (
      id            SERIAL PRIMARY KEY,
      title         VARCHAR(200) NOT NULL,
      category      VARCHAR(80)  NOT NULL DEFAULT 'عام',
      description   TEXT NOT NULL DEFAULT '',
      content_html  TEXT NOT NULL DEFAULT '',
      lawyer_id     INTEGER REFERENCES lawyers(id) ON DELETE SET NULL,
      is_official   BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order    INTEGER NOT NULL DEFAULT 99,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_legal_forms_cat ON legal_forms(category)`);

  // طلبات انضمام المحامين
  await query(`
    CREATE TABLE IF NOT EXISTS lawyer_applications (
      id            SERIAL PRIMARY KEY,
      full_name     VARCHAR(150) NOT NULL,
      title         VARCHAR(120) NOT NULL DEFAULT 'محامي',
      phone         VARCHAR(25)  NOT NULL,
      whatsapp      VARCHAR(25)  NOT NULL DEFAULT '',
      email         VARCHAR(150) NOT NULL DEFAULT '',
      bar_number    VARCHAR(50)  NOT NULL DEFAULT '',
      experience_y  INTEGER      NOT NULL DEFAULT 0,
      specialties   TEXT         NOT NULL DEFAULT '',
      bio           TEXT         NOT NULL DEFAULT '',
      office_addr   VARCHAR(250) NOT NULL DEFAULT '',
      district      VARCHAR(100) NOT NULL DEFAULT '',
      languages     VARCHAR(150) NOT NULL DEFAULT 'العربية',
      consult_fee   VARCHAR(80)  NOT NULL DEFAULT '',
      bar_card_url  TEXT         NOT NULL DEFAULT '',
      photo_url     TEXT         NOT NULL DEFAULT '',
      agree_terms   BOOLEAN      NOT NULL DEFAULT FALSE,
      device_id     VARCHAR(200),
      user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      admin_note    TEXT NOT NULL DEFAULT '',
      reviewed_at   TIMESTAMPTZ,
      reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      lawyer_id     INTEGER REFERENCES lawyers(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_lawyer_apps_status ON lawyer_applications(status)`);

  // ── خطط اشتراكات المحامين ──────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS lawyer_subscription_plans (
      id               SERIAL PRIMARY KEY,
      name             VARCHAR(40)  NOT NULL UNIQUE,
      name_ar          VARCHAR(60)  NOT NULL,
      price_sdg        INTEGER      NOT NULL DEFAULT 0,
      price_label      VARCHAR(80)  NOT NULL DEFAULT 'مجاناً',
      monthly_contacts INTEGER      NOT NULL DEFAULT 5,
      has_unlimited_contacts BOOLEAN NOT NULL DEFAULT FALSE,
      has_ads          BOOLEAN      NOT NULL DEFAULT FALSE,
      has_featured     BOOLEAN      NOT NULL DEFAULT FALSE,
      has_verified_badge BOOLEAN    NOT NULL DEFAULT FALSE,
      has_priority     BOOLEAN      NOT NULL DEFAULT FALSE,
      commission_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
      color            VARCHAR(20)  NOT NULL DEFAULT '#6B7280',
      icon             VARCHAR(10)  NOT NULL DEFAULT '🔓',
      sort_order       INTEGER      NOT NULL DEFAULT 99,
      is_active        BOOLEAN      NOT NULL DEFAULT TRUE
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS lawyer_subscriptions (
      id               SERIAL PRIMARY KEY,
      lawyer_id        INTEGER NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
      plan_id          INTEGER NOT NULL REFERENCES lawyer_subscription_plans(id),
      commission_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
      started_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      expires_at       TIMESTAMPTZ,
      is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
      payment_ref      VARCHAR(120) NOT NULL DEFAULT '',
      admin_note       TEXT         NOT NULL DEFAULT '',
      created_by       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_lawyer_active_sub UNIQUE (lawyer_id)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_lawyer_subs_lawyer ON lawyer_subscriptions(lawyer_id)`);
  // ── سجل تاريخ الاشتراكات ─────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS lawyer_subscription_history (
      id           SERIAL PRIMARY KEY,
      lawyer_id    INTEGER NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
      plan_name    VARCHAR(50)  NOT NULL,
      plan_name_ar VARCHAR(100) NOT NULL DEFAULT '',
      commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at   TIMESTAMPTZ,
      payment_ref  VARCHAR(120) NOT NULL DEFAULT '',
      admin_note   TEXT         NOT NULL DEFAULT '',
      changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_sub_hist_lawyer ON lawyer_subscription_history(lawyer_id)`);
  // seed خطط الاشتراك (مرة واحدة)
  const plansCount = await query(`SELECT COUNT(*)::int AS c FROM lawyer_subscription_plans`);
  if (plansCount.rows[0].c === 0) {
    const plans = [
      ["free",         "مجاني",             0,    "مجاناً — دائماً",               5,  false, false, false, false, false, 0,   "#6B7280", "🔓", 1],
      ["basic",        "أساسي",          500,  "500 ج.س / شهر",                  0,  true,  false, false, true,  false, 0,   "#3B82F6", "⭐", 2],
      ["professional", "محترف",         1500, "1,500 ج.س / شهر",                0,  true,  true,  true,  true,  true,  5,   "#8B5CF6", "💎", 3],
      ["premium",      "بريميوم",  3000, "3,000 ج.س / شهر",                0,  true,  true,  true,  true,  true,  8,   "#F59E0B", "👑", 4],
    ];
    for (const [name,name_ar,price,label,mc,unl,ads,feat,ver,pri,com,color,icon,sort] of plans) {
      await query(
        `INSERT INTO lawyer_subscription_plans
          (name,name_ar,price_sdg,price_label,monthly_contacts,has_unlimited_contacts,has_ads,has_featured,has_verified_badge,has_priority,commission_pct,color,icon,sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (name) DO NOTHING`,
        [name,name_ar,price,label,mc,unl,ads,feat,ver,pri,com,color,icon,sort]
      );
    }
  }

  // seed lawyers + forms (مرة واحدة)
  await (async () => {
    const c = await query(`SELECT COUNT(*)::int AS c FROM lawyers`);
    if (c.rows[0].c === 0) {
      const seedLawyers = [
        ["د. عبدالله محمد الحاج",  "محامي ومستشار قانوني", "قضايا تجارية, عقارات, شركات",         "خبرة 15 عاماً في القضايا التجارية والعقارية. مستشار قانوني لعدد من الشركات بالحصاحيصا.", "0912345001","0912345001","abdullah@law.sd","شارع النيل — أمام محكمة الحصاحيصا","وسط المدينة","BAR-2010-0521", 15, "العربية, English","استشارة 30 دقيقة: 5,000 ج.س", true,  true],
        ["أ. فاطمة عثمان",          "محامية أحوال شخصية",   "أحوال شخصية, نفقة, حضانة, ميراث",     "متخصصة في قضايا الأسرة والأحوال الشخصية، تركز على حقوق المرأة والطفل.",                "0912345002","0912345002","fatima@law.sd","حي الشرق — مجمع المحامين","حي الشرق","BAR-2014-0233", 11, "العربية",        "استشارة 30 دقيقة: 4,000 ج.س", true,  true],
        ["أ. محمد أحمد سليمان",     "محامي جنائي",          "قضايا جنائية, مرافعات, طعون",          "محامي مرافعات أمام جميع درجات التقاضي. خبرة في القضايا الجنائية الكبرى.",              "0912345003","0912345003","mohamed@law.sd","شارع المحكمة — مكتب رقم 7","وسط المدينة","BAR-2008-0118", 17, "العربية",        "استشارة هاتفية: 3,000 ج.س",   false, true],
        ["أ. سلمى الأمين",           "محامية عقارات وعمل",   "عقارات, عقود, قضايا عمالية",          "متخصصة في صياغة العقود والتوثيق العقاري وقضايا العمل والعمال.",                       "0912345004","0912345004","salma@law.sd",  "حي الجامعة","حي الجامعة","BAR-2017-0445",  8, "العربية",        "صياغة عقد: من 7,000 ج.س",     false, true],
        ["أ. الطاهر بابكر",          "محامي ومحكّم",          "تحكيم, تسوية نزاعات, تجاري",          "محكّم معتمد في الغرفة التجارية. حلول بديلة للنزاعات قبل الوصول للمحاكم.",              "0912345005","0912345005","tahir@law.sd",  "السوق المركزي — مكتب أعلى البنك","السوق المركزي","BAR-2005-0087", 20, "العربية, English","جلسة تحكيم: من 10,000 ج.س",  false, true],
      ];
      for (const r of seedLawyers) {
        const ent = await query(
          `INSERT INTO rated_entities (type, name, subtitle, category, phone, district, notes, is_verified)
           VALUES ('lawyer',$1,$2,'قانون',$3,$4,$5,TRUE) RETURNING id`,
          [r[0], r[1], r[5], r[8], r[3]]
        );
        const ins = await query(
          `INSERT INTO lawyers (full_name,title,specialties,bio,phone,whatsapp,email,office_addr,district,bar_number,experience_y,languages,consult_fee,is_featured,is_verified,entity_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
          [r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],r[9],r[10],r[11],r[12],r[13],r[14], ent.rows[0].id]
        );
        const lawyerId = ins.rows[0].id;
        // خدمات افتراضية
        const svcSets: Record<number, [string, string, string, string][]> = {
          1: [
            ["استشارة قانونية تجارية",  "تحليل وضعك القانوني وتقديم رأي مكتوب",       "5,000 ج.س",  "30–45 دقيقة"],
            ["تأسيس شركة",             "إعداد العقد التأسيسي والنظام الأساسي والتسجيل","60,000 ج.س", "أسبوعان"],
            ["مراجعة عقد عقاري",        "مراجعة وتعديل بنود العقد قبل التوقيع",        "8,000 ج.س",  "3 أيام"],
          ],
          2: [
            ["دعوى نفقة / حضانة",       "إعداد ومتابعة الدعوى أمام المحكمة",            "حسب الدرجة", "—"],
            ["استشارة أحوال شخصية",     "جلسة استشارية مع توصيات عملية",                "4,000 ج.س",  "30 دقيقة"],
            ["قسمة ميراث",              "حصر التركة وإعداد قسمة شرعية موثقة",          "من 15,000 ج.س","حسب التعقيد"],
          ],
          3: [
            ["دفاع جنائي",              "مرافعة أمام محكمة الجنايات",                   "حسب القضية", "—"],
            ["استشارة جنائية هاتفية",   "تقييم سريع لموقفك القانوني",                   "3,000 ج.س",  "20 دقيقة"],
            ["طعن واستئناف",            "إعداد ومتابعة الطعن أمام محكمة أعلى",         "حسب الدرجة", "—"],
          ],
          4: [
            ["صياغة عقد عمل",           "عقد متوافق مع قانون العمل السوداني",          "7,000 ج.س",  "يومان"],
            ["توثيق عقد عقاري",          "صياغة وتوثيق العقد لدى الشهر العقاري",        "12,000 ج.س", "أسبوع"],
            ["دعوى مطالبة عمالية",      "متابعة حقوق العامل أمام المحكمة",              "حسب القضية","—"],
          ],
          5: [
            ["جلسة تحكيم تجاري",        "حل النزاع التجاري عبر التحكيم بدل المحكمة",   "10,000 ج.س", "حسب الجدول"],
            ["وساطة وتسوية ودية",       "جلسة تفاوض بين الأطراف",                       "6,000 ج.س",  "ساعتان"],
          ],
        };
        const svcs = svcSets[lawyerId] || [];
        for (let i = 0; i < svcs.length; i++) {
          const [t, d, p, du] = svcs[i];
          await query(
            `INSERT INTO lawyer_services (lawyer_id,title,description,price_text,duration,sort_order)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [lawyerId, t, d, p, du, i]
          );
        }
        // تقييمات تجريبية
        const sample = [[5,"محامي ممتاز ودقيق"],[4,"خدمة احترافية"],[5,"حل قضيتي بسرعة"]];
        for (const [stars, comm] of sample) {
          await query(
            `INSERT INTO ratings (entity_id, rating, comment, target_type, target_id) VALUES ($1,$2,$3,'lawyer',$4)`,
            [ent.rows[0].id, stars, comm, String(lawyerId)]
          );
        }
      }
      // إعلانات
      await query(`INSERT INTO lawyer_ads (lawyer_id, title, body, cta_text, cta_phone, banner_color, sort_order)
        VALUES (1, 'استشارتك الأولى مجاناً', 'مكتب د. عبدالله — استشارة تجارية وعقارية بأمانة', 'احجز الآن', '0912345001', '#8B5CF6', 1)`);
      await query(`INSERT INTO lawyer_ads (lawyer_id, title, body, cta_text, cta_phone, banner_color, sort_order)
        VALUES (2, 'حقوق المرأة والأسرة', 'الأستاذة فاطمة — تخصص دقيق في الأحوال الشخصية', 'تواصل معنا', '0912345002', '#EC4899', 2)`);

      // استمارات قانونية جاهزة للطباعة
      const forms: [string,string,string,string,boolean][] = [
        ["توكيل عام", "توكيلات",
          "توكيل عام للمحامي للترافع نيابة عن الموكّل أمام كافة المحاكم.",
          `<h2 style="text-align:center">توكيل عام</h2>
           <p>أنا الموقّع أدناه: <b>__________________________</b> رقم الهوية: __________________</p>
           <p>أوكّل المحامي / ________________________ بالترافع عني أمام جميع المحاكم بمختلف درجاتها في القضية رقم: ______ / ______</p>
           <p>وله صلاحية: تقديم العرائض، استلام الأوراق، الصلح، التنازل، استلام المستحقات، والتوقيع نيابة عني.</p>
           <p style="margin-top:30px">المُوكِّل: ________________ التاريخ: __ / __ / 20__</p>
           <p>التوقيع: ________________</p>`, true],
        ["إقرار صلح", "تسويات",
          "إقرار صلح بين طرفين بشأن نزاع قائم.",
          `<h2 style="text-align:center">إقرار صلح</h2>
           <p>الطرف الأول: ________________________ الهوية: ____________</p>
           <p>الطرف الثاني: ________________________ الهوية: ____________</p>
           <p>اتفق الطرفان على إنهاء النزاع القائم بينهما بشأن: ______________________ بالشروط التالية:</p>
           <ol><li>________________________________________</li><li>________________________________________</li><li>________________________________________</li></ol>
           <p>توقيع الطرف الأول: ________ توقيع الطرف الثاني: ________ التاريخ: __/__/20__</p>`, true],
        ["عقد إيجار سكني", "عقود",
          "نموذج عقد إيجار سكني وفق قانون الإيجارات السوداني.",
          `<h2 style="text-align:center">عقد إيجار سكني</h2>
           <p>المؤجِّر: ___________________ — العنوان: ___________________</p>
           <p>المستأجِر: ___________________ — الهوية: ___________________</p>
           <p>العقار: شقة / منزل بـ ________________ المكوّن من ____ غرف.</p>
           <p>قيمة الإيجار الشهري: ______ ج.س — مدة العقد: من __/__/20__ إلى __/__/20__</p>
           <p>التزامات المستأجر: ____________________________________</p>
           <p>التزامات المؤجر: ____________________________________</p>
           <p>توقيع المؤجر: ________ توقيع المستأجر: ________ شاهد: ________</p>`, true],
        ["عريضة دعوى مدنية", "عرائض",
          "نموذج عريضة دعوى مدنية ابتدائية.",
          `<h2 style="text-align:center">عريضة دعوى مدنية</h2>
           <p>محكمة _______________ الابتدائية</p>
           <p>المدّعي: _______________ — العنوان: _______________</p>
           <p>المدّعى عليه: _______________ — العنوان: _______________</p>
           <p><b>موضوع الدعوى:</b> __________________________________</p>
           <p><b>الوقائع:</b><br/>__________________________________________________________</p>
           <p><b>الطلبات:</b><br/>1) __________________________________________<br/>2) __________________________________________</p>
           <p>تحريراً في __/__/20__ — توقيع المحامي: ________</p>`, true],
        ["تنازل عن دعوى", "تنازلات",
          "إقرار تنازل عن دعوى منظورة أمام المحكمة.",
          `<h2 style="text-align:center">إقرار تنازل عن دعوى</h2>
           <p>أنا: _______________ هوية: __________ المدعي في القضية رقم ______ / ______ المنظورة أمام محكمة _______________</p>
           <p>أُقرّ بتنازلي الكامل عن هذه الدعوى وعن جميع ما يترتب عليها من حقوق بسبب: ______________________</p>
           <p>التوقيع: ________ التاريخ: __/__/20__</p>`, true],
        ["إنذار عدلي", "إنذارات",
          "إنذار عدلي لمطالبة بدين أو إخلاء.",
          `<h2 style="text-align:center">إنذار عدلي</h2>
           <p>المُنذِر: _______________ — العنوان: _______________</p>
           <p>المُنذَر إليه: _______________ — العنوان: _______________</p>
           <p><b>الموضوع:</b> ______________________________________</p>
           <p>أُنذركم بـ: ____________________________________________ خلال (15) يوماً من تاريخ استلام هذا الإنذار وإلا اتخذت بحقكم الإجراءات القانونية اللازمة.</p>
           <p>التوقيع: ________ التاريخ: __/__/20__</p>`, true],
      ];
      for (let i = 0; i < forms.length; i++) {
        const [t, cat, desc, html, off] = forms[i];
        await query(
          `INSERT INTO legal_forms (title, category, description, content_html, is_official, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [t, cat, desc, html, off, i]
        );
      }
    }
  })();

  // ── جداول ترحال والتوصيل ──
  await query(`
    CREATE TABLE IF NOT EXISTS transport_drivers (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name         VARCHAR(100) NOT NULL,
      phone        VARCHAR(25) NOT NULL,
      vehicle_type VARCHAR(40) NOT NULL,
      vehicle_desc VARCHAR(200) NOT NULL DEFAULT '',
      plate        VARCHAR(30) NOT NULL DEFAULT '',
      area         VARCHAR(100) NOT NULL DEFAULT '',
      status       VARCHAR(20) NOT NULL DEFAULT 'pending',
      admin_note   TEXT NOT NULL DEFAULT '',
      is_online    BOOLEAN NOT NULL DEFAULT FALSE,
      total_trips  INTEGER NOT NULL DEFAULT 0,
      rating       NUMERIC(3,2) NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS transport_trips (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name      VARCHAR(100) NOT NULL,
      user_phone     VARCHAR(25) NOT NULL,
      trip_type      VARCHAR(20) NOT NULL DEFAULT 'ride',
      from_location  VARCHAR(200) NOT NULL,
      to_location    VARCHAR(200) NOT NULL,
      notes          TEXT NOT NULL DEFAULT '',
      status         VARCHAR(20) NOT NULL DEFAULT 'pending',
      driver_id      INTEGER REFERENCES transport_drivers(id) ON DELETE SET NULL,
      driver_name    VARCHAR(100),
      rating         INTEGER,
      rating_note    TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    INSERT INTO admin_settings (key, value) VALUES ('transport_enabled', 'false')
    ON CONFLICT (key) DO NOTHING
  `);

  // جدول التعرفة — مصفوفة المناطق (5×5 × 3 مركبات)
  await query(`
    CREATE TABLE IF NOT EXISTS transport_fares (
      id           SERIAL PRIMARY KEY,
      from_zone    INTEGER NOT NULL CHECK (from_zone BETWEEN 1 AND 5),
      to_zone      INTEGER NOT NULL CHECK (to_zone BETWEEN 1 AND 5),
      fare_car     INTEGER NOT NULL DEFAULT 500,
      fare_rickshaw INTEGER NOT NULL DEFAULT 300,
      fare_delivery INTEGER NOT NULL DEFAULT 600,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (from_zone, to_zone)
    )
  `);

  // إدراج التعرفة الافتراضية إن لم تكن موجودة
  const defaultFares: Array<[number, number, number, number, number]> = [
    [1,1,500,300,600],[1,2,1000,600,1200],[1,3,1500,900,1800],[1,4,2000,1200,2400],[1,5,3000,1800,3600],
    [2,1,1000,600,1200],[2,2,500,300,600],[2,3,1200,700,1400],[2,4,1500,900,1800],[2,5,2500,1500,3000],
    [3,1,1500,900,1800],[3,2,1200,700,1400],[3,3,700,400,800],[3,4,1200,700,1400],[3,5,2000,1200,2400],
    [4,1,2000,1200,2400],[4,2,1500,900,1800],[4,3,1200,700,1400],[4,4,700,400,800],[4,5,2000,1200,2400],
    [5,1,3000,1800,3600],[5,2,2500,1500,3000],[5,3,2000,1200,2400],[5,4,2000,1200,2400],[5,5,1500,900,1800],
  ];
  for (const [fz, tz, car, rick, del_] of defaultFares) {
    await query(
      `INSERT INTO transport_fares (from_zone,to_zone,fare_car,fare_rickshaw,fare_delivery)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (from_zone,to_zone) DO NOTHING`,
      [fz, tz, car, rick, del_],
    );
  }

  // إضافة أعمدة التعرفة لجدول الرحلات إن لم تكن موجودة
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS from_zone INTEGER`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS to_zone   INTEGER`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS fare_estimate INTEGER`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS vehicle_preference VARCHAR(30) DEFAULT 'car'`);

  // إضافة عمود منطقة السائق
  await query(`ALTER TABLE transport_drivers ADD COLUMN IF NOT EXISTS zone_id INTEGER`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS delivery_desc TEXT`);

  // ── شركات التشغيل (المشغّلون الشركاء) ──
  await query(`
    CREATE TABLE IF NOT EXISTS transport_operators (
      id                 SERIAL PRIMARY KEY,
      name               VARCHAR(150) NOT NULL,
      contact_name       VARCHAR(100) NOT NULL DEFAULT '',
      phone              VARCHAR(25)  NOT NULL DEFAULT '',
      email              VARCHAR(150) NOT NULL DEFAULT '',
      contract_start     DATE,
      contract_end       DATE,
      operator_share_pct NUMERIC(5,2) NOT NULL DEFAULT 70.00,
      platform_share_pct NUMERIC(5,2) NOT NULL DEFAULT 30.00,
      status             VARCHAR(20)  NOT NULL DEFAULT 'active',
      notes              TEXT         NOT NULL DEFAULT '',
      created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  // أعمدة إضافية للرحلات: الشركة المشغّلة + الأجرة الفعلية + توزيع الأرباح
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS operator_id      INTEGER REFERENCES transport_operators(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS actual_fare      INTEGER`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS platform_revenue INTEGER`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS operator_revenue INTEGER`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ`);

  // ربط السائقين بالشركات المشغّلة
  await query(`ALTER TABLE transport_drivers ADD COLUMN IF NOT EXISTS operator_id INTEGER REFERENCES transport_operators(id) ON DELETE SET NULL`);

  // إضافة تعرفة الدراجة النارية لجدول التعرفة
  await query(`ALTER TABLE transport_fares ADD COLUMN IF NOT EXISTS fare_motorcycle INTEGER NOT NULL DEFAULT 0`);
  await query(`
    UPDATE transport_fares
    SET fare_motorcycle = ROUND(fare_car * 0.75)
    WHERE fare_motorcycle = 0
  `);

  // ══ جدول الأحياء ومناطق التغطية ══
  await query(`
    CREATE TABLE IF NOT EXISTS transport_neighborhoods (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(200) NOT NULL,
      zone_id     INTEGER NOT NULL CHECK (zone_id BETWEEN 1 AND 5),
      status      VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','rejected')),
      submitted_by VARCHAR(100) NOT NULL DEFAULT '',
      notes       TEXT         NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_tn_zone ON transport_neighborhoods(zone_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tn_status ON transport_neighborhoods(status)`);

  // تفعيل الخدمة افتراضياً
  await query(`INSERT INTO admin_settings (key,value) VALUES ('transport_status','available') ON CONFLICT (key) DO NOTHING`);
  await query(`INSERT INTO admin_settings (key,value) VALUES ('transport_note','') ON CONFLICT (key) DO NOTHING`);

  // ══ جدول المفقودات والموجودات ══
  await query(`
    CREATE TABLE IF NOT EXISTS lost_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reporter_name VARCHAR(150) NOT NULL DEFAULT 'مجهول',
      item_name VARCHAR(200) NOT NULL,
      category VARCHAR(30) NOT NULL DEFAULT 'other',
      description TEXT NOT NULL DEFAULT '',
      last_seen VARCHAR(300) NOT NULL DEFAULT '',
      contact_phone VARCHAR(50) NOT NULL DEFAULT '',
      status VARCHAR(10) NOT NULL DEFAULT 'lost' CHECK (status IN ('lost','found')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ══ جدول الوظائف ══
  await query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name VARCHAR(150) NOT NULL DEFAULT 'مجهول',
      title VARCHAR(300) NOT NULL,
      company VARCHAR(200) NOT NULL DEFAULT '',
      type VARCHAR(20) NOT NULL DEFAULT 'fulltime' CHECK (type IN ('fulltime','parttime','freelance','volunteer')),
      location VARCHAR(300) NOT NULL DEFAULT 'الحصاحيصا',
      description TEXT NOT NULL DEFAULT '',
      contact_phone VARCHAR(50) NOT NULL DEFAULT '',
      salary VARCHAR(150),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ══ جداول الرياضة ══
  await query(`
    CREATE TABLE IF NOT EXISTS sports_posts (
      id SERIAL PRIMARY KEY,
      author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'news' CHECK (type IN ('news','result','announcement','match_preview')),
      title VARCHAR(300) NOT NULL,
      content TEXT NOT NULL,
      team VARCHAR(100),
      image_url TEXT,
      likes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS sports_players (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      position VARCHAR(80) NOT NULL DEFAULT '',
      team VARCHAR(100) NOT NULL DEFAULT '',
      age INTEGER,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      matches_played INTEGER NOT NULL DEFAULT 0,
      photo_url TEXT,
      bio TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS sports_matches (
      id SERIAL PRIMARY KEY,
      home_team VARCHAR(100) NOT NULL,
      away_team VARCHAR(100) NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      match_date TIMESTAMPTZ NOT NULL,
      venue VARCHAR(200) NOT NULL DEFAULT 'ملعب الحصاحيصا',
      status VARCHAR(20) NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','finished','postponed')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ══ جدول الأرقام الهامة ══
  await query(`
    CREATE TABLE IF NOT EXISTS emergency_numbers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      number VARCHAR(50) NOT NULL,
      category VARCHAR(80) NOT NULL DEFAULT 'general',
      icon VARCHAR(50) NOT NULL DEFAULT 'call',
      color VARCHAR(20) NOT NULL DEFAULT '#F97316',
      note TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 99,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const { rows: enRows } = await query(`SELECT COUNT(*) as cnt FROM emergency_numbers`);
  if (parseInt(enRows[0].cnt, 10) === 0) {
    const defaultNumbers = [
      ["الشرطة", "999", "طوارئ", "shield", "#EF4444", "خط طوارئ الشرطة", 1],
      ["الإسعاف", "1515", "طوارئ", "medical", "#EF4444", "خدمات الإسعاف والطوارئ الطبية", 2],
      ["الدفاع المدني", "998", "طوارئ", "flame", "#F97316", "مكافحة الحرائق والكوارث", 3],
      ["مستشفى الحصاحيصا", "0111000001", "صحة", "hospital", "#E74C6F", "المستشفى الرئيسي بالمدينة", 4],
      ["كهرباء الحصاحيصا", "0111000002", "خدمات", "flash", "#F59E0B", "الإبلاغ عن أعطال الكهرباء", 5],
      ["مياه الحصاحيصا", "0111000003", "خدمات", "water", "#3B82F6", "الإبلاغ عن مشاكل المياه", 6],
      ["بلدية الحصاحيصا", "0111000004", "حكومي", "business", "#8B5CF6", "الخدمات البلدية", 7],
      ["النيابة العامة", "0111000005", "قانوني", "hammer", "#6366F1", "القضايا القانونية", 8],
    ];
    for (const [name, number, category, icon, color, note, sort_order] of defaultNumbers) {
      await query(
        `INSERT INTO emergency_numbers (name, number, category, icon, color, note, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [name, number, category, icon, color, note, sort_order]
      );
    }
  }

  // ══ جدول المنظمات المجتمعية ══
  // ترحيل: أضف الأعمدة الجديدة بدلاً من حذف الجدول (يحفظ البيانات الموجودة)
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS full_description TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email VARCHAR(200)`);
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS members_count INTEGER NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS founded_year VARCHAR(20) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS goals TEXT[] NOT NULL DEFAULT '{}'`);
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS needs TEXT[] NOT NULL DEFAULT '{}'`);
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) NOT NULL DEFAULT 5.0`);
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'initiative',
      description TEXT NOT NULL DEFAULT '',
      full_description TEXT NOT NULL DEFAULT '',
      contact_phone VARCHAR(50) NOT NULL DEFAULT '',
      email VARCHAR(200),
      members_count INTEGER NOT NULL DEFAULT 0,
      founded_year VARCHAR(20) NOT NULL DEFAULT '',
      goals TEXT[] NOT NULL DEFAULT '{}',
      needs TEXT[] NOT NULL DEFAULT '{}',
      rating NUMERIC(3,2) NOT NULL DEFAULT 5.0,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const { rows: orgCheck } = await query(`SELECT COUNT(*) as cnt FROM organizations`);
  if (parseInt(orgCheck[0].cnt, 10) === 0) {
    const seedOrgs = [
      ["مبادرة شباب الحصاحيصا","initiative","مبادرة شبابية تهدف لتطوير الخدمات المجتمعية","مبادرة شبابية تطوعية تهدف إلى تطوير الخدمات في مدينة الحصاحيصا ومناطقها القريبة، تتبنى مشاريع البنية التحتية والتوعية الاجتماعية وتنظيم الفعاليات الثقافية والرياضية.","+249912345611","",120,"2019",["تطوير الخدمات المجتمعية","توعية الشباب","دعم المحتاجين"],["متطوعون","تمويل مشاريع","معدات وأدوات"],4.9,true],
      ["جمعية البر الخيرية","charity","جمعية مسجلة تكفل الأيتام وتساعد الأسر المتعففة","جمعية خيرية مسجلة رسمياً تعنى بكفالة الأيتام ومساعدة الأسر المتعففة والمحتاجين في مدينة الحصاحيصا وقراها.","+249912345612","",45,"2015",["كفالة الأيتام","دعم الأسر المحتاجة","التعليم للجميع"],["تبرعات مالية","ملابس وأغذية","متطوعون"],4.7,true],
      ["مبادرة شارع الحوادث الطارئة","volunteer","مبادرة طوعية لتوفير الأدوية والمستلزمات للحالات الطارئة","فريق متطوع يقدم خدمات الإسعاف الأولي والأدوية الطارئة للحوادث والطوارئ في الحصاحيصا.","+249912345613","",80,"2021",["خدمات طارئة فورية","دعم الكوارث","التوعية الطبية"],["أدوية ومستلزمات طبية","سيارة إسعاف","متطوعون مؤهلون"],5.0,true],
      ["جمعية المزارعين التعاونية","cooperative","تعاونية زراعية تدعم مزارعي الحصاحيصا والمناطق المجاورة","جمعية تعاونية تجمع المزارعين في الحصاحيصا والمناطق المجاورة لتبادل الخبرات والموارد.","+249912345614","",200,"2010",["دعم المزارعين","تسويق المنتجات","تطوير الزراعة المحلية"],["بذور ومدخلات","تمويل موسم الزراعة","أسواق تسويق"],4.6,true],
      ["مبادرة بنات الحصاحيصا","initiative","مبادرة نسائية لتمكين المرأة وتعليم المهارات","مبادرة نسائية شاملة تهدف إلى تمكين المرأة في مدينة الحصاحيصا عبر التدريب المهني وتعليم الحرف اليدوية.","+249912345615","",95,"2020",["تمكين المرأة","التدريب المهني","توفير الدخل للأسر"],["ماكينات خياطة","مواد تدريب","قاعة للتدريب"],4.8,false],
      ["فريق النظافة والتشجير","volunteer","مبادرة بيئية لتنظيف المدينة وزرع الأشجار","فريق متطوع يعمل على تنظيف شوارع وأحياء الحصاحيصا وزرع الأشجار والحفاظ على البيئة.","+249912345616","",60,"2022",["تنظيف الشوارع","التشجير","التوعية البيئية"],["أدوات نظافة","شتلات أشجار","متطوعون"],4.5,false],
    ];
    for (const [name,type,desc,fullDesc,phone,email,members,founded,goals,needs,rating,verified] of seedOrgs) {
      await query(
        `INSERT INTO organizations (name,type,description,full_description,contact_phone,email,members_count,founded_year,goals,needs,rating,is_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [name,type,desc,fullDesc,phone,email||null,members,founded,goals,needs,rating,verified]
      );
    }
  }

  // ══ جدول طلبات تعاون المؤسسات الخارجية (خارج المدينة) ══
  await query(`
    CREATE TABLE IF NOT EXISTS external_partnerships (
      id SERIAL PRIMARY KEY,
      org_name VARCHAR(200) NOT NULL,
      org_type VARCHAR(50) NOT NULL DEFAULT 'other',
      sector VARCHAR(100) NOT NULL DEFAULT '',
      city VARCHAR(120) NOT NULL DEFAULT '',
      country VARCHAR(120) NOT NULL DEFAULT '',
      website VARCHAR(300) NOT NULL DEFAULT '',
      logo_url VARCHAR(500) NOT NULL DEFAULT '',
      contact_person VARCHAR(200) NOT NULL DEFAULT '',
      contact_role VARCHAR(150) NOT NULL DEFAULT '',
      email VARCHAR(200) NOT NULL DEFAULT '',
      phone VARCHAR(50) NOT NULL DEFAULT '',
      whatsapp VARCHAR(50) NOT NULL DEFAULT '',
      cooperation_scope TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      services_offered TEXT[] NOT NULL DEFAULT '{}',
      target_audience VARCHAR(300) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      admin_notes TEXT NOT NULL DEFAULT '',
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_ext_partner_status ON external_partnerships(status)`);

  // ══ جدول المؤسسات التعليمية ══
  await query(`
    CREATE TABLE IF NOT EXISTS educational_institutions (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'primary',
      address TEXT NOT NULL DEFAULT '',
      phone VARCHAR(50) NOT NULL DEFAULT '',
      principal VARCHAR(200),
      email VARCHAR(200),
      website VARCHAR(300),
      description TEXT,
      grades VARCHAR(100),
      shifts VARCHAR(100),
      services TEXT[] NOT NULL DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const { rows: eduCheck } = await query(`SELECT COUNT(*) as cnt FROM educational_institutions`);
  if (parseInt(eduCheck[0].cnt, 10) === 0) {
    const seedEdu = [
      ["مدرسة الحصاحيصا الأساسية","primary","وسط المدينة، شارع المدارس","0111100001","أحمد عبدالله",null,null,"مدرسة حكومية أساسية للبنين والبنات","الصف الأول – الثامن","صباحي ومسائي",["results","enrollment","transfer","textbooks"],"active"],
      ["ثانوية الحصاحيصا للبنين","secondary","حي الضحى","0111100002","محمد إبراهيم",null,null,"ثانوية حكومية للبنين","الصف التاسع – الثاني عشر","صباحي",["results","enrollment","exam","guidance"],"active"],
      ["ثانوية البنات بالحصاحيصا","secondary","حي السلام","0111100003","فاطمة الزهراء",null,null,"ثانوية حكومية للبنات","الصف التاسع – الثاني عشر","صباحي",["results","enrollment","exam","scholarship"],"active"],
      ["خلوة القرآن الكريم","quran","قرب المسجد الكبير","0111100004","الشيخ يوسف",null,null,"خلوة لحفظ وتجويد القرآن الكريم",null,"مسائي",["quran"],"active"],
      ["روضة المستقبل المشرق","kindergarten","حي النهضة","0111100005","أميرة خالد",null,null,"روضة أطفال خاصة","KG1 – KG3","صباحي",["enrollment","activity"],"active"],
      ["معهد الحوسبة والتقنية","institute","وسط المدينة","0111100006",null,null,null,"معهد تقني متخصص في الحاسوب والبرمجة",null,"مسائي",["enrollment","training","results"],"active"],
    ];
    for (const [name,type,address,phone,principal,email,website,description,grades,shifts,services,status] of seedEdu) {
      await query(
        `INSERT INTO educational_institutions (name,type,address,phone,principal,email,website,description,grades,shifts,services,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [name,type,address,phone,principal||null,email||null,website||null,description||null,grades||null,shifts||null,services,status]
      );
    }
  }

  // ══ جداول الخدمات التعليمية — استمارات التسجيل والنقل ══
  await query(`
    CREATE TABLE IF NOT EXISTS student_registrations (
      id SERIAL PRIMARY KEY,
      institution_id INTEGER REFERENCES educational_institutions(id) ON DELETE SET NULL,
      institution_name VARCHAR(200) NOT NULL,
      grade VARCHAR(80) NOT NULL,
      academic_year VARCHAR(20) NOT NULL DEFAULT '2025/2026',
      -- بيانات الطالب
      student_name VARCHAR(200) NOT NULL,
      student_dob DATE,
      student_gender VARCHAR(10),
      student_nationality VARCHAR(80) DEFAULT 'سودانية',
      previous_school VARCHAR(200),
      previous_grade VARCHAR(80),
      has_special_needs BOOLEAN DEFAULT FALSE,
      special_needs_details TEXT,
      -- بيانات ولي الأمر
      parent_name VARCHAR(200) NOT NULL,
      parent_relation VARCHAR(50) NOT NULL DEFAULT 'أب',
      parent_phone VARCHAR(50) NOT NULL,
      parent_whatsapp VARCHAR(50),
      parent_id_number VARCHAR(100),
      parent_address TEXT,
      parent_occupation VARCHAR(100),
      parent_email VARCHAR(200),
      -- ملاحظات وحالة
      notes TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      reg_number VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_studreg_inst ON student_registrations(institution_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_studreg_status ON student_registrations(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_studreg_phone ON student_registrations(parent_phone)`);

  await query(`
    CREATE TABLE IF NOT EXISTS student_transfers (
      id SERIAL PRIMARY KEY,
      -- من
      from_institution_name VARCHAR(200) NOT NULL,
      from_grade VARCHAR(80),
      from_reg_number VARCHAR(100),
      -- إلى
      to_institution_id INTEGER REFERENCES educational_institutions(id) ON DELETE SET NULL,
      to_institution_name VARCHAR(200) NOT NULL,
      to_grade VARCHAR(80),
      -- بيانات الطالب
      student_name VARCHAR(200) NOT NULL,
      student_dob DATE,
      student_gender VARCHAR(10),
      student_nationality VARCHAR(80) DEFAULT 'سودانية',
      -- سبب النقل
      transfer_reason VARCHAR(80) NOT NULL DEFAULT 'أخرى',
      transfer_reason_detail TEXT,
      -- بيانات ولي الأمر
      parent_name VARCHAR(200) NOT NULL,
      parent_phone VARCHAR(50) NOT NULL,
      parent_whatsapp VARCHAR(50),
      parent_id_number VARCHAR(100),
      parent_address TEXT,
      parent_email VARCHAR(200),
      -- حالة
      notes TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      transfer_number VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_studtrans_status ON student_transfers(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_studtrans_phone ON student_transfers(parent_phone)`);

  await query(`
    CREATE TABLE IF NOT EXISTS edu_documents (
      id SERIAL PRIMARY KEY,
      ref_type VARCHAR(30) NOT NULL,
      ref_id INTEGER NOT NULL,
      doc_type VARCHAR(80) NOT NULL,
      doc_name VARCHAR(200),
      url TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ══ جدول خدمات المرأة ══
  // ترحيل: أضف الأعمدة الجديدة بدلاً من حذف الجدول (يحفظ البيانات الموجودة)
  await query(`ALTER TABLE women_services ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) NOT NULL DEFAULT 5.0`);
  await query(`ALTER TABLE women_services ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'`);
  await query(`ALTER TABLE women_services ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
  await query(`
    CREATE TABLE IF NOT EXISTS women_services (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'salon',
      address TEXT NOT NULL DEFAULT '',
      phone VARCHAR(50) NOT NULL DEFAULT '',
      hours VARCHAR(100) NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      rating NUMERIC(3,2) NOT NULL DEFAULT 5.0,
      tags TEXT[] NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const { rows: wsCheck } = await query(`SELECT COUNT(*) as cnt FROM women_services`);
  if (parseInt(wsCheck[0].cnt, 10) === 0) {
    const seedWS = [
      ["صالون ليلى للسيدات","salon","حي السلام","0912000011","8ص – 9م","صالون نسائي متكامل، خدمات حلاقة وتجميل وعناية بالبشرة",4.8,["صالون","تجميل","حلاقة"]],
      ["أتيليه بنات النيل","sewing","وسط المدينة","0912000012","9ص – 5م","خياطة ملابس سودانية وعصرية، توب وجلابية وعرائس",4.7,["خياطة","تصميم","توب"]],
      ["عيادة الأم والطفل","health","قرب المستشفى","0912000013","8ص – 2م","متخصصة في صحة المرأة والأطفال والرضّع",4.9,["صحة","طب","أطفال"]],
      ["مطبخ أم الخير","cooking","حي النهضة","0912000014","7ص – 8م","طبخ سوداني أصيل للمناسبات والتوصيل اليومي",4.6,["طبخ","وجبات","مناسبات"]],
      ["حضانة أطفالنا","childcare","حي الضحى","0912000015","7ص – 4م","رعاية الأطفال من عمر سنة إلى خمس سنوات",4.8,["حضانة","أطفال","رعاية"]],
    ];
    for (const [name,type,address,phone,hours,description,rating,tags] of seedWS) {
      await query(
        `INSERT INTO women_services (name,type,address,phone,hours,description,rating,tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [name,type,address,phone,hours,description,rating,tags]
      );
    }
  }

  // ══ جدول إعدادات مواقيت الآذان ══
  await query(`
    CREATE TABLE IF NOT EXISTS prayer_settings (
      id INTEGER DEFAULT 1 PRIMARY KEY CHECK (id = 1),
      method INTEGER NOT NULL DEFAULT 3,
      school INTEGER NOT NULL DEFAULT 0,
      latitude NUMERIC(9,6) NOT NULL DEFAULT 14.0566,
      longitude NUMERIC(9,6) NOT NULL DEFAULT 33.4001,
      fajr_offset INTEGER NOT NULL DEFAULT 0,
      dhuhr_offset INTEGER NOT NULL DEFAULT 0,
      asr_offset INTEGER NOT NULL DEFAULT 0,
      maghrib_offset INTEGER NOT NULL DEFAULT 0,
      isha_offset INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const { rows: psCheck } = await query(`SELECT COUNT(*) as cnt FROM prayer_settings`);
  if (parseInt(psCheck[0].cnt, 10) === 0) {
    await query(`INSERT INTO prayer_settings (id) VALUES (1)`);
  }

  // ══ تشغيل إعداد جدول محلات الهواتف بعد اكتمال كل الجداول الأخرى ══
  await initPhoneShopsTables();

  // ── ترقية حساب المطور الرئيسي لصلاحية admin ──────────────────────
  await query(
    `UPDATE users SET role='admin' WHERE LOWER(email)=LOWER('almhbob.iii@gmail.com') AND role != 'admin'`
  );

  // ══ جداول تذاكر السفر بين المدن ══
  await query(`
    CREATE TABLE IF NOT EXISTS travel_companies (
      id               SERIAL PRIMARY KEY,
      name             VARCHAR(150) NOT NULL,
      owner_name       VARCHAR(100) NOT NULL DEFAULT '',
      phone            VARCHAR(30)  NOT NULL DEFAULT '',
      wa_number        VARCHAR(30)  NOT NULL DEFAULT '',
      logo_url         TEXT         NOT NULL DEFAULT '',
      license_no       VARCHAR(80)  NOT NULL DEFAULT '',
      commission_pct   NUMERIC(5,2) NOT NULL DEFAULT 10,
      subscription_type VARCHAR(20) NOT NULL DEFAULT 'commission' CHECK (subscription_type IN ('commission','annual','monthly')),
      subscription_price NUMERIC(10,2) NOT NULL DEFAULT 0,
      active           BOOLEAN      NOT NULL DEFAULT TRUE,
      contract_signed_at TIMESTAMPTZ,
      notes            TEXT         NOT NULL DEFAULT '',
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS travel_routes (
      id             SERIAL PRIMARY KEY,
      company_id     INTEGER REFERENCES travel_companies(id) ON DELETE CASCADE,
      from_city      VARCHAR(100) NOT NULL,
      to_city        VARCHAR(100) NOT NULL,
      departure_time VARCHAR(20)  NOT NULL DEFAULT '08:00',
      price          NUMERIC(10,2) NOT NULL DEFAULT 0,
      seats_total    INTEGER      NOT NULL DEFAULT 30,
      active         BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS travel_bookings (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      company_id       INTEGER REFERENCES travel_companies(id) ON DELETE SET NULL,
      route_id         INTEGER REFERENCES travel_routes(id) ON DELETE SET NULL,
      company_name     VARCHAR(150) NOT NULL DEFAULT '',
      from_city        VARCHAR(100) NOT NULL,
      to_city          VARCHAR(100) NOT NULL,
      travel_date      DATE         NOT NULL,
      departure_time   VARCHAR(20)  NOT NULL DEFAULT '',
      passenger_name   VARCHAR(150) NOT NULL,
      passenger_phone  VARCHAR(30)  NOT NULL DEFAULT '',
      seat_number      VARCHAR(10)  NOT NULL DEFAULT '',
      price            NUMERIC(10,2) NOT NULL DEFAULT 0,
      status           VARCHAR(20)  NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','completed','rescheduled')),
      ticket_number    VARCHAR(40)  UNIQUE,
      booking_ref      VARCHAR(10)  UNIQUE,
      wa_sent          BOOLEAN      NOT NULL DEFAULT FALSE,
      notes            TEXT         NOT NULL DEFAULT '',
      new_date         DATE,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_tb_user ON travel_bookings(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tb_date ON travel_bookings(travel_date)`);
  // ترقية جدول travel_bookings بحقول الدفع
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending_payment' CHECK (payment_status IN ('pending_payment','proof_submitted','verified','rejected','free'))`);
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS payment_proof_url TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(80) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ`);
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS payment_verified_by VARCHAR(100) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ`);
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT NOT NULL DEFAULT ''`);
  // ترقية travel_routes بأسعار الذروة
  await query(`ALTER TABLE travel_routes ADD COLUMN IF NOT EXISTS peak_price_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0`);
  await query(`ALTER TABLE travel_routes ADD COLUMN IF NOT EXISTS peak_hours_start VARCHAR(5) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_routes ADD COLUMN IF NOT EXISTS peak_hours_end VARCHAR(5) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_routes ADD COLUMN IF NOT EXISTS notes VARCHAR(200) NOT NULL DEFAULT ''`);
  // حساب الدفع لكل شركة
  await query(`ALTER TABLE travel_companies ADD COLUMN IF NOT EXISTS payment_account_type VARCHAR(30) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_companies ADD COLUMN IF NOT EXISTS payment_account_number VARCHAR(80) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_companies ADD COLUMN IF NOT EXISTS payment_account_name VARCHAR(100) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_companies ADD COLUMN IF NOT EXISTS payment_booking_timeout_hrs INTEGER NOT NULL DEFAULT 3`);
  // إعدادات عامة للسفريات
  await query(`INSERT INTO admin_settings(key,value) VALUES('travel_enabled','true') ON CONFLICT(key) DO NOTHING`);
  await query(`INSERT INTO admin_settings(key,value) VALUES('travel_payment_timeout_hrs','3') ON CONFLICT(key) DO NOTHING`);
  await query(`INSERT INTO admin_settings(key,value) VALUES('travel_admin_whatsapp','') ON CONFLICT(key) DO NOTHING`);
  // ترقية جدول travel_bookings بحقول التحقق من التذكرة
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS verify_token VARCHAR(64) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ`);
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS scanned_by VARCHAR(100) NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE travel_bookings ADD COLUMN IF NOT EXISTS scan_count INTEGER NOT NULL DEFAULT 0`);
  await query(`CREATE INDEX IF NOT EXISTS idx_tb_verify_token ON travel_bookings(verify_token)`);
  // تعبئة رموز تحقق للحجوزات القديمة الفارغة
  await query(`UPDATE travel_bookings SET verify_token = encode(sha256((id::text || ticket_number || booking_ref)::bytea), 'hex') WHERE verify_token = ''`);
  // طلبات تسجيل وكالات السفر
  await query(`
    CREATE TABLE IF NOT EXISTS travel_agency_applications (
      id               SERIAL PRIMARY KEY,
      agency_name      VARCHAR(150) NOT NULL,
      agency_type      VARCHAR(50)  NOT NULL DEFAULT '',
      specialties      JSONB        NOT NULL DEFAULT '[]',
      destinations     JSONB        NOT NULL DEFAULT '[]',
      description      TEXT         NOT NULL DEFAULT '',
      website          VARCHAR(200) NOT NULL DEFAULT '',
      contact_name     VARCHAR(100) NOT NULL,
      contact_role     VARCHAR(80)  NOT NULL DEFAULT '',
      phone            VARCHAR(30)  NOT NULL,
      whatsapp         VARCHAR(30)  NOT NULL DEFAULT '',
      email            VARCHAR(150) NOT NULL DEFAULT '',
      city             VARCHAR(80)  NOT NULL DEFAULT '',
      country          VARCHAR(80)  NOT NULL DEFAULT 'السودان',
      license_number   VARCHAR(80)  NOT NULL DEFAULT '',
      founded_year     INTEGER,
      services_offered JSONB        NOT NULL DEFAULT '[]',
      target_routes    TEXT         NOT NULL DEFAULT '',
      status           VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      admin_notes      TEXT         NOT NULL DEFAULT '',
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      reviewed_at      TIMESTAMPTZ
    )
  `);

  // بيانات افتراضية للشركة
  const { rows: tcCheck } = await query(`SELECT COUNT(*) as cnt FROM travel_companies`);
  if (parseInt(tcCheck[0].cnt, 10) === 0) {
    const { rows: compRows } = await query(
      `INSERT INTO travel_companies (name, owner_name, phone, wa_number, commission_pct, subscription_type, active, contract_signed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id`,
      ["شركة الحصاحيصا للنقل", "أحمد محمد عبدالله", "0912000100", "249912000100", 10, "commission", true]
    );
    const cid = compRows[0].id;
    const routes = [
      ["الحصاحيصا", "الخرطوم",    "06:00", 3500],
      ["الحصاحيصا", "أم درمان",   "06:30", 3500],
      ["الحصاحيصا", "بحري",       "07:00", 3500],
      ["الحصاحيصا", "ود مدني",    "08:00", 1500],
      ["الحصاحيصا", "القضارف",    "07:00", 4000],
      ["الحصاحيصا", "كسلا",       "08:00", 6000],
      ["الحصاحيصا", "بورتسودان",  "07:00", 8000],
      ["الخرطوم",   "الحصاحيصا",  "06:00", 3500],
    ];
    for (const [fc, tc, dt, price] of routes) {
      await query(
        `INSERT INTO travel_routes (company_id, from_city, to_city, departure_time, price) VALUES ($1,$2,$3,$4,$5)`,
        [cid, fc, tc, dt, price]
      );
    }
  }

  // ── إدارة أقسام التطبيق ─────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS section_configurations (
      section_key        VARCHAR(100) PRIMARY KEY,
      section_name       VARCHAR(200) NOT NULL,
      section_name_en    VARCHAR(200),
      section_description TEXT,
      is_visible         BOOLEAN     NOT NULL DEFAULT TRUE,
      requires_contract  BOOLEAN     NOT NULL DEFAULT FALSE,
      contract_status    VARCHAR(20) NOT NULL DEFAULT 'none',
      contract_signed_at TIMESTAMPTZ,
      contract_expiry_at TIMESTAMPTZ,
      contract_notes     TEXT,
      authorized_entity  VARCHAR(300),
      authorized_contact VARCHAR(200),
      sort_order         INTEGER     NOT NULL DEFAULT 0,
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by         INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  const sectionDefaults: [string, string, string, boolean, boolean, number][] = [
    ["gov_services",      "الخدمات الحكومية",          "Government Services",     true, true,  0],
    ["gov_appointments",  "المواعيد الحكومية",          "Gov Appointments",        true, true,  1],
    ["gov_reports",       "البلاغات والشكاوى",          "Reports & Complaints",    true, true,  2],
    ["medical",           "الخدمات الصحية",             "Medical Services",        true, true,  3],
    ["lawyers",           "المحامون",                    "Lawyers",                 true, true,  4],
    ["transport",         "النقل والمواصلات",            "Transport",               true, true,  5],
    ["orgs",              "المنظمات والهيئات",           "Organizations",           true, true,  6],
    ["women",             "قسم المرأة",                 "Women",                   true, true,  7],
    ["farmers",           "قطاع الزراعة والمزارعين",    "Farmers",                 true, true,  8],
    ["factories",         "المصانع والصناعة",            "Industry",                true, true,  9],
    ["telecom",           "الاتصالات",                  "Telecom",                 true, true,  10],
    ["jobs",              "سوق العمل",                  "Job Market",              true, false, 20],
    ["market",            "السوق المحلي",               "Local Market",            true, false, 21],
    ["sports",            "الرياضة والأنشطة",           "Sports & Activities",     true, false, 22],
    ["culture",           "الثقافة والتراث",             "Culture",                 true, false, 23],
    ["social",            "الشأن الاجتماعي",             "Social",                  true, false, 24],
    ["communities",       "المجتمعات",                  "Communities",             true, false, 25],
    ["student",           "الطلاب",                     "Students",                true, false, 26],
    ["student_union",     "اتحاد الطلاب",               "Student Union",           true, false, 27],
    ["unions",            "الاتحادات",                  "Unions",                  true, false, 28],
    ["union_partnership", "شراكة الاتحادات",            "Union Partnerships",      true, false, 29],
    ["occasions",         "المناسبات",                  "Occasions",               true, false, 30],
    ["zawajil",           "التعارف والزواج",             "Zawajil",                 true, false, 31],
    ["rental",            "الإيجارات",                  "Rentals",                 true, false, 32],
    ["real_estate",       "العقارات والإيجارات",         "Real Estate",             true, false, 33],
    ["map",               "خريطة المدينة",               "City Map",                true, false, 34],
    ["missing",           "المفقودون",                  "Missing Persons",         true, false, 35],
    ["reports",           "البلاغات",                   "Reports",                 true, false, 36],
    ["honored",           "الشخصيات المكرَّمة",          "Honored",                 true, false, 37],
    ["greetings",         "التهاني والتبريكات",          "Greetings",               true, false, 38],
    ["events",            "الفعاليات",                  "Events",                  true, false, 39],
    ["ads",               "الإعلانات",                  "Ads",                     true, false, 40],
    ["cultural_centers",  "المراكز الثقافية",            "Cultural Centers",        true, false, 41],
    ["unions_orgs",       "النقابات والجمعيات",          "Unions & Organizations",  true, false, 42],
  ];
  for (const [key, name, name_en, visible, requires, order] of sectionDefaults) {
    await query(
      `INSERT INTO section_configurations (section_key, section_name, section_name_en, is_visible, requires_contract, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (section_key) DO NOTHING`,
      [key, name, name_en, visible, requires, order]
    );
  }

  logger.info("Hasahisawi DB initialized");
}

function singleQueryValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function getSessionUser(req: Request): Promise<Record<string, unknown> | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const tok = auth.slice(7);

  // 1. البحث في جلسات الـ backend أولاً (المسار المعتاد)
  const result = await query(`
    SELECT u.* FROM users u
    JOIN user_sessions s ON s.user_id = u.id
    WHERE s.token = $1 AND s.expires_at > NOW()
  `, [tok]);
  if (result.rows[0]) return result.rows[0];

  // 2. fallback: Firebase ID token (JWT ذو 3 أجزاء)
  if (tok.split(".").length === 3 && tok.startsWith("eyJ")) {
    try {
      const decoded = await verifyIdToken(tok);
      if (decoded?.uid) {
        const { rows } = await query(
          `SELECT * FROM users WHERE firebase_uid = $1`, [decoded.uid]
        );
        if (rows[0]) return rows[0];
      }
    } catch { /* رمز Firebase غير صالح — تجاهل */ }
  }

  return null;
}

// مساعد: هل المستخدم مدير أو مشرف ترحيل؟
function isTransportAdmin(role: unknown): boolean {
  return role === "admin" || role === "transport_supervisor";
}

// نطاق الوصول للوحة "مشوارك علينا":
//   - admin (المنصة)               → يرى كل الشركات. operatorId=null, isFullAdmin=true
//   - transport_supervisor + op_id → يرى شركته فقط. operatorId=رقم
//   - transport_supervisor بدون op_id → عرض كامل (مشرف عام للنقل، توافقاً للخلف)
type TransportScope = { isFullAdmin: boolean; operatorId: number | null };
function getTransportScope(me: any): TransportScope {
  if (!me || !isTransportAdmin(me.role)) return { isFullAdmin: false, operatorId: null };
  if (me.role === "admin") return { isFullAdmin: true, operatorId: null };
  // transport_supervisor
  const opId = me.operator_id != null ? Number(me.operator_id) : null;
  return { isFullAdmin: opId == null, operatorId: opId };
}
// هل لمستخدم الحق في إجراءات على مستوى المنصة (شركات/تعرفة/إعدادات/أحياء)؟
function isPlatformAdmin(me: any): boolean {
  return !!me && me.role === "admin";
}


function isValidBcryptHashForLogin(value: unknown): value is string {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a.padEnd(64, "\0"));
    const bb = Buffer.from(b.padEnd(64, "\0"));
    return timingSafeEqual(ba, bb) && a.length === b.length;
  } catch {
    return false;
  }
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const user = await getSessionUser(req);
  if (user?.role === "admin") return true;
  const pinHeader = req.headers["x-admin-pin"] as string | undefined;
  const pinBody = req.body?.admin_pin as string | undefined;
  const submittedPin = pinHeader || pinBody;
  if (submittedPin && submittedPin.length >= 4 && submittedPin.length <= 20) {
    const result = await query(`SELECT value FROM admin_settings WHERE key='admin_pin'`);
    const storedPin = result.rows[0]?.value || DEFAULT_ADMIN_PIN;
    return safeCompare(submittedPin, storedPin);
  }
  return false;
}

// مساعد مشترك: Transport Admin أو PIN أدمن
async function isTransportOrAdminReq(req: Request): Promise<{ ok: boolean; me: any; scope: TransportScope }> {
  const me = await getSessionUser(req);
  if (me && isTransportAdmin(me.role)) return { ok: true, me, scope: getTransportScope(me) };
  const pin = await isAdminRequest(req);
  if (pin) return { ok: true, me: null, scope: { isFullAdmin: true, operatorId: null } };
  return { ok: false, me: null, scope: { isFullAdmin: false, operatorId: null } };
}
async function isPlatformOrAdminReq(req: Request): Promise<boolean> {
  const me = await getSessionUser(req);
  if (me?.role === "admin") return true;
  return isAdminRequest(req);
}

router.post("/auth/register", registerLimiter, async (req: Request, res: Response) => {
  try {
    const { name, national_id, phone, email, password, birth_date, neighborhood, gender, otp_code } = req.body;
    if (!name || !password) return res.status(400).json({ error: "الاسم وكلمة المرور مطلوبان" });
    if (!phone && !email) return res.status(400).json({ error: "يرجى إدخال رقم الهاتف أو البريد الإلكتروني" });
    if (password.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    if (password.length > 128) return res.status(400).json({ error: "كلمة المرور طويلة جداً" });
    if (name.length > 100) return res.status(400).json({ error: "الاسم طويل جداً" });

    // OTP verification (required when otp_code is supplied)
    if (otp_code) {
      const identifier = (email || phone || "").trim().toLowerCase();
      const cleanCode = String(otp_code).trim();
      const otpR = await query(
        `SELECT id, code, attempts FROM otp_codes
         WHERE phone_or_email=$1 AND type='register' AND used=FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [identifier]
      );
      if (!otpR.rows.length)
        return res.status(400).json({ error: "رمز التحقق منتهي الصلاحية أو غير موجود. أعد الإرسال." });
      const otp = otpR.rows[0];
      if (otp.attempts >= 5) {
        await query(`UPDATE otp_codes SET used=TRUE WHERE id=$1`, [otp.id]);
        return res.status(400).json({ error: "تجاوزت عدد المحاولات. أعد إرسال رمز جديد." });
      }
      if (otp.code !== cleanCode) {
        await query(`UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1`, [otp.id]);
        const remaining = 4 - otp.attempts;
        return res.status(400).json({ error: `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}` });
      }
      await query(`UPDATE otp_codes SET used=TRUE WHERE id=$1`, [otp.id]);
    }

    const validGender = ["male", "female"].includes(gender) ? gender : null;
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, national_id, phone, email, password_hash, birth_date, neighborhood, gender)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, national_id || null, phone || null, email || null, hash,
       birth_date || null, neighborhood || null, validGender]
    );
    const user = result.rows[0];
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    // منشور ترحيبي تلقائي
    try {
      await query(
        `INSERT INTO social_posts (author_id, author_name, content, category) VALUES ($1,$2,$3,'عام')`,
        [user.id, user.name, `🎉 مرحباً بـ ${user.name} في مجتمع حصاحيصاوي! نسعد بانضمامك وتشاركنا أخبار مدينتنا الحبيبة الحصاحيصا.`]
      );
    } catch {}
    return res.json({ user: safeUserPayload(user), token });
  } catch (err: any) {
    if (err.code === "23505") {
      const detail: string = err.detail ?? err.constraint ?? "";
      if (detail.includes("phone"))       return res.status(400).json({ error: "رقم الهاتف مسجّل مسبقاً، يرجى تسجيل الدخول أو استخدام رقم آخر" });
      if (detail.includes("email"))       return res.status(400).json({ error: "البريد الإلكتروني مسجّل مسبقاً، يرجى تسجيل الدخول أو استخدام بريد آخر" });
      if (detail.includes("national_id")) return res.status(400).json({ error: "رقم الهوية مسجّل مسبقاً، تواصل مع الدعم إن كنت تعتقد أن هذا خطأ" });
      return res.status(400).json({ error: "هذه البيانات مسجّلة مسبقاً، يرجى تسجيل الدخول" });
    }
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── إصدار التطبيق ─────────────────────────────────────────────────────────

router.get("/app/version", async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT key, value FROM admin_settings WHERE key IN ('app_version','app_update_notes','app_update_force')`
    );
    const map: Record<string, string> = {};
    for (const r of rows.rows) map[r.key] = r.value;
    return res.json({
      version:  parseInt(map.app_version  ?? "1", 10),
      notes:    map.app_update_notes  ?? "",
      force:    map.app_update_force  === "true",
    });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/admin/app/version", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { version, notes, force } = req.body;
    if (version !== undefined) {
      await query(`UPDATE admin_settings SET value=$1 WHERE key='app_version'`, [String(Number(version))]);
    }
    if (notes !== undefined) {
      await query(`UPDATE admin_settings SET value=$1 WHERE key='app_update_notes'`, [notes]);
    }
    if (force !== undefined) {
      await query(`UPDATE admin_settings SET value=$1 WHERE key='app_update_force'`, [force ? "true" : "false"]);
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Feature Flags — الخدمات الحكومية ────────────────────────────────────────

router.get("/app/feature-flags", async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT key, value FROM admin_settings WHERE key IN ('gov_services_enabled','gov_appointments_enabled','gov_reports_enabled','ride_status')`
    );
    const map: Record<string, string> = {};
    for (const r of rows.rows) map[r.key] = r.value;
    return res.json({
      gov_services_enabled:      map.gov_services_enabled      !== "false",
      gov_appointments_enabled:  map.gov_appointments_enabled  !== "false",
      gov_reports_enabled:       map.gov_reports_enabled       !== "false",
      ride_status:               (map.ride_status as "soon" | "maintenance" | "available") || "soon",
    });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/admin/feature-flags", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const { gov_services_enabled, gov_appointments_enabled, gov_reports_enabled, ride_status } = req.body;
    if (gov_services_enabled !== undefined) {
      await query(`INSERT INTO admin_settings (key,value) VALUES ('gov_services_enabled',$1) ON CONFLICT (key) DO UPDATE SET value=$1`, [gov_services_enabled ? "true" : "false"]);
    }
    if (gov_appointments_enabled !== undefined) {
      await query(`INSERT INTO admin_settings (key,value) VALUES ('gov_appointments_enabled',$1) ON CONFLICT (key) DO UPDATE SET value=$1`, [gov_appointments_enabled ? "true" : "false"]);
    }
    if (gov_reports_enabled !== undefined) {
      await query(`INSERT INTO admin_settings (key,value) VALUES ('gov_reports_enabled',$1) ON CONFLICT (key) DO UPDATE SET value=$1`, [gov_reports_enabled ? "true" : "false"]);
    }
    if (ride_status !== undefined && ["soon","maintenance","available"].includes(ride_status)) {
      await query(`INSERT INTO admin_settings (key,value) VALUES ('ride_status',$1) ON CONFLICT (key) DO UPDATE SET value=$1`, [ride_status]);
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/auth/register-admin", async (req: Request, res: Response) => {
  try {
    const { name, email, password, admin_code } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const settingResult = await query(`SELECT value FROM admin_settings WHERE key='admin_pin'`);
    const pin = settingResult.rows[0]?.value || DEFAULT_ADMIN_PIN;
    if (admin_code !== pin) return res.status(403).json({ error: "رمز المشرف غير صحيح" });
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'admin') RETURNING id, name, role`,
      [name, email, hash]
    );
    const user = result.rows[0];
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user, token });
  } catch (err: any) {
    if (err.code === "23505") return res.status(400).json({ error: "البريد موجود بالفعل" });
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تحديث الملف الشخصي (الاسم + الصورة + الجنس + الحي + التاريخ + النبذة)
async function handleUpdateProfile(req: Request, res: Response): Promise<Response> {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const { name, avatar_url, gender, neighborhood, birth_date, bio } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    if (name?.trim()) { updates.push(`name=$${params.length + 1}`); params.push(name.trim()); }
    if (avatar_url !== undefined) { updates.push(`avatar_url=$${params.length + 1}`); params.push(avatar_url || null); }
    if (gender) { updates.push(`gender=$${params.length + 1}`); params.push(gender); }
    if (neighborhood !== undefined) { updates.push(`neighborhood=$${params.length + 1}`); params.push(neighborhood || null); }
    if (birth_date !== undefined) { updates.push(`birth_date=$${params.length + 1}`); params.push(birth_date || null); }
    if (bio !== undefined) { updates.push(`bio=$${params.length + 1}`); params.push(bio || null); }
    if (updates.length === 0) return res.status(400).json({ error: "لا توجد تحديثات" });
    params.push(me.id);
    const result = await query(
      `UPDATE users SET ${updates.join(",")} WHERE id=$${params.length} RETURNING *`,
      params
    );
    return res.json({ user: safeUserPayload(result.rows[0]) });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
}

router.put("/auth/profile", handleUpdateProfile);
router.put("/users/me", handleUpdateProfile);

// ── POST /api/auth/upload-avatar ─────────────────────────────────
// fallback when Firebase Storage is unavailable — uploads via Cloudinary
{
  const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  router.post(
    "/auth/upload-avatar",
    writeLimiter,
    (req: Request, res: Response, next: NextFunction) => {
      avatarUpload.single("file")(req as any, res as any, (err: unknown) => {
        if (err) { res.status(400).json({ error: "فشل رفع الملف" }); return; }
        next();
      });
    },
    async (req: Request, res: Response): Promise<any> => {
      try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: "غير مصرح" });
        if (!req.file) return res.status(400).json({ error: "لم يرسل أي ملف" });

        const { v2: cloudinary } = await import("cloudinary");
        const buf = req.file.buffer;
        const dataUri = `data:${req.file.mimetype};base64,${buf.toString("base64")}`;

        const result = await cloudinary.uploader.upload(dataUri, {
          folder: `hasahisawi/avatars/${user.id}`,
          public_id: `avatar_${Date.now()}`,
          resource_type: "image",
          transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
        });
        const url: string = result.secure_url;
        await query(`UPDATE users SET avatar_url=$1 WHERE id=$2`, [url, user.id]);
        return res.json({ url });
      } catch (e: any) {
        logger.error({ err: e?.message }, "[upload-avatar]");
        return res.status(500).json({ error: "فشل رفع الصورة" });
      }
    }
  );
}

// ── QR Web Login ─────────────────────────────────────────────────────────────
// Stores short-lived tokens in PostgreSQL so they work across Vercel instances.
// Table is created on first use (CREATE TABLE IF NOT EXISTS).
{
  const ensureQrTable = async () => {
    await query(`CREATE TABLE IF NOT EXISTS auth_qr_sessions (
      token       TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'waiting',
      session_token TEXT,
      user_id     INT,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  };

  // POST /auth/qr/generate — web app requests a new QR token
  router.post("/auth/qr/generate", authLimiter, async (_req: Request, res: Response): Promise<any> => {
    try {
      await ensureQrTable();
      const { randomBytes } = await import("node:crypto");
      const token = randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes
      await query(
        `INSERT INTO auth_qr_sessions (token, status, expires_at) VALUES ($1, 'waiting', $2)`,
        [token, expiresAt]
      );
      // cleanup expired rows opportunistically
      query(`DELETE FROM auth_qr_sessions WHERE expires_at < NOW()`).catch(() => {});
      return res.json({ token, expires_at: expiresAt });
    } catch (e: any) {
      logger.error({ err: e?.message }, "[qr/generate]");
      return res.status(500).json({ error: "Server error" });
    }
  });

  // GET /auth/qr/:token/poll — web app polls for state changes
  router.get("/auth/qr/:token/poll", async (req: Request, res: Response): Promise<any> => {
    try {
      await ensureQrTable();
      const { token } = req.params;
      const r = await query(
        `SELECT status, session_token, expires_at FROM auth_qr_sessions WHERE token=$1`,
        [token]
      );
      if (!r.rows[0]) return res.json({ status: "expired" });
      const row = r.rows[0];
      if (new Date(row.expires_at) < new Date()) return res.json({ status: "expired" });
      return res.json({ status: row.status, token: row.session_token ?? null });
    } catch (e: any) {
      logger.error({ err: e?.message }, "[qr/poll]");
      return res.status(500).json({ error: "Server error" });
    }
  });

  // POST /auth/qr/:token/scan — mobile marks as scanned (intermediate state)
  router.post("/auth/qr/:token/scan", async (req: Request, res: Response): Promise<any> => {
    try {
      await ensureQrTable();
      const { token } = req.params;
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "غير مصرح" });
      const r = await query(
        `UPDATE auth_qr_sessions SET status='scanned' WHERE token=$1 AND status='waiting' AND expires_at > NOW() RETURNING token`,
        [token]
      );
      if (!r.rowCount) return res.status(410).json({ error: "الرمز منتهي أو استُخدم" });
      return res.json({ ok: true });
    } catch (e: any) {
      logger.error({ err: e?.message }, "[qr/scan]");
      return res.status(500).json({ error: "Server error" });
    }
  });

  // POST /auth/qr/:token/confirm — mobile confirms, attaches session to QR token
  router.post("/auth/qr/:token/confirm", async (req: Request, res: Response): Promise<any> => {
    try {
      await ensureQrTable();
      const { token } = req.params;
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول على الجوال أولاً" });

      // Create a new 30-day session token for the web
      const { randomBytes } = await import("node:crypto");
      const sessionToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await query(
        `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`,
        [sessionToken, user.id, expiresAt]
      );

      const r = await query(
        `UPDATE auth_qr_sessions SET status='confirmed', session_token=$1, user_id=$2
         WHERE token=$3 AND status IN ('waiting','scanned') AND expires_at > NOW()
         RETURNING token`,
        [sessionToken, user.id, token]
      );
      if (!r.rowCount) return res.status(410).json({ error: "الرمز منتهي أو استُخدم من قبل" });
      return res.json({ ok: true });
    } catch (e: any) {
      logger.error({ err: e?.message }, "[qr/confirm]");
      return res.status(500).json({ error: "Server error" });
    }
  });
}

router.post("/auth/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const { phone_or_email, password, recaptcha_token } = req.body;
    if (!phone_or_email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const captchaOk = await verifyRecaptcha(recaptcha_token);
    if (!captchaOk) return res.status(400).json({ error: "فشل التحقق من reCAPTCHA. أعد المحاولة." });
    const result = await query(
      `SELECT * FROM users WHERE phone=$1 OR LOWER(email)=LOWER($1)`,
      [phone_or_email]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "بيانات غير صحيحة" });
    // مستخدم تم إنشاؤه/استيراده من Firebase أو Google بلا hash صالح لـ bcrypt.
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
    }
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/auth/admin-login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "البيانات ناقصة" });

    const result = await query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1) AND role='admin'`, [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "بيانات غير صحيحة" });

    // محاولة 1: كلمة المرور العادية (bcrypt) — إذا كانت موجودة
    let valid = false;
    if (user.password_hash) {
      valid = await bcrypt.compare(password, user.password_hash);
    }

    // محاولة 2: PIN المدير كبديل (للحسابات المرتبطة بـ Google بلا كلمة مرور)
    if (!valid) {
      const pinRow = await query(`SELECT value FROM admin_settings WHERE key='admin_pin'`);
      const storedPin = pinRow.rows[0]?.value || DEFAULT_ADMIN_PIN;
      valid = safeCompare(password, storedPin);
    }

    if (!valid) return res.status(401).json({ error: "بيانات غير صحيحة. يمكنك استخدام PIN المدير كلمة مرور." });

    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/auth/moderator-login", async (req: Request, res: Response) => {
  try {
    const { phone_or_email, password } = req.body;
    if (!phone_or_email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const result = await query(
      `SELECT * FROM users WHERE (phone=$1 OR LOWER(email)=LOWER($1)) AND role='moderator'`,
      [phone_or_email]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "لا يوجد حساب مشرف بهذه البيانات" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    const permsResult = await query(`SELECT section FROM moderator_permissions WHERE user_id=$1`, [user.id]);
    const safeUser = safeUserPayload(user);
    return res.json({ user: { ...safeUser, permissions: permsResult.rows.map((r: any) => r.section) }, token });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تسجيل دخول مشرف الترحيل
router.post("/auth/transport-login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const result = await query(
      `SELECT * FROM users WHERE LOWER(email)=LOWER($1) AND role IN ('admin','transport_supervisor')`,
      [email]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "لا يوجد حساب مشرف ترحيل بهذه البيانات" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "كلمة المرور غير صحيحة" });
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// إنشاء مشرف ترحيل جديد (يتطلب كود المشرف الرئيسي)
router.post("/auth/register-transport-supervisor", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "المديرون فقط يمكنهم إنشاء مشرف ترحيل" });
    const { name, email, password, operator_id } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, operator_id) VALUES ($1,$2,$3,'transport_supervisor',$4) RETURNING id, name, role, operator_id`,
      [name, email, hash, operator_id ?? null]
    );
    return res.status(201).json({ user: result.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") return res.status(400).json({ error: "البريد مستخدم بالفعل" });
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      await query(`DELETE FROM user_sessions WHERE token=$1`, [auth.slice(7)]);
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/auth/me", async (req: Request, res: Response) => {
  try {
    const rawUser = await getSessionUser(req);
    if (!rawUser) return res.status(401).json({ error: "غير مصرح" });
    const safeUser = safeUserPayload(rawUser);
    const permsResult = await query(`SELECT section FROM moderator_permissions WHERE user_id=$1`, [rawUser.id]);
    return res.json({ user: { ...safeUser, permissions: permsResult.rows.map((r: any) => r.section) } });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/auth/me/gender", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const { gender } = req.body;
    if (!["male", "female"].includes(gender))
      return res.status(400).json({ error: "قيمة الجنس غير صحيحة" });
    await query(`UPDATE users SET gender=$1 WHERE id=$2`, [gender, user.id]);
    return res.json({ success: true, gender });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/auth/me/complete-profile — إكمال بيانات الملف الشخصي (الجنس + الحي) دفعةً واحدة
router.patch("/auth/me/complete-profile", async (req: Request, res: Response) => {
  try {
    let user = await getSessionUser(req);

    // Fallback: إذا فشل getSessionUser → حاول استخراج هوية المستخدم من Firebase JWT
    if (!user) {
      const tok = req.headers.authorization?.slice(7) ?? "";
      const isJwt = tok.split(".").length === 3 && tok.startsWith("eyJ");
      if (isJwt) {
        // 1. حاول التحقق الكامل عبر Firebase Admin
        const decoded = await verifyIdToken(tok).catch(() => null);
        let uidToUse: string | undefined = decoded?.uid;

        // 2. إذا فشل التحقق → فكّ تشفير الـ JWT بدون تحقق (آمن لهذا endpoint المنخفض الخطر)
        //    Firebase JWTs تحمل UID في حقل user_id أو sub
        if (!uidToUse) {
          try {
            const payload = JSON.parse(
              Buffer.from(tok.split(".")[1], "base64url").toString("utf8")
            );
            uidToUse = (payload.user_id as string | undefined)
                    || (payload.sub    as string | undefined);
          } catch {}
        }

        // 3. fallback: firebase_uid من الـ body (الكود الجديد في التطبيق)
        if (!uidToUse && typeof req.body.firebase_uid === "string") {
          uidToUse = req.body.firebase_uid;
        }

        // ابحث أولاً بـ firebase_uid ثم بالبريد الإلكتروني من الـ JWT (لمستخدمي backend مع Firebase)
        let jwtEmail: string | undefined;
        if (uidToUse || !user) {
          // استخرج email من payload الـ JWT لاستخدامه كـ fallback
          try {
            const parts = tok.split(".");
            if (parts.length === 3) {
              const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
              jwtEmail = (p.email as string | undefined) || undefined;
            }
          } catch {}
        }

        if (uidToUse) {
          const r = await query(`SELECT * FROM users WHERE firebase_uid = $1`, [uidToUse]);
          if (r.rows[0]) {
            user = r.rows[0];
          } else if (jwtEmail) {
            // لم يُوجد بـ firebase_uid → ابحث بالبريد (مستخدم backend سجّل بنفس الإيميل)
            const r2 = await query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [jwtEmail]);
            if (r2.rows[0]) {
              user = r2.rows[0];
              // ارتبط firebase_uid بالحساب حتى لا يتكرر البحث مستقبلاً
              if (uidToUse && user) {
                await query(`UPDATE users SET firebase_uid=$1 WHERE id=$2`, [uidToUse, (user as any).id]);
              }
            }
          }
        } else if (jwtEmail) {
          // لا uid لكن يوجد email في الـ JWT
          const r = await query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [jwtEmail]);
          if (r.rows[0]) {
            user = r.rows[0];
          }
        }

        if (user) {
          // أنشئ جلسة backend حتى لا يتكرر هذا الوضع
          const sessionToken = randomBytes(32).toString("hex");
          await query(
            `INSERT INTO user_sessions (user_id, token) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [user.id, sessionToken]
          );
        }
      }
    }

    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const { gender, neighborhood } = req.body;
    if (!["male", "female"].includes(gender))
      return res.status(400).json({ error: "يرجى تحديد الجنس" });
    if (neighborhood && (typeof neighborhood !== "string" || neighborhood.trim().length < 2))
      return res.status(400).json({ error: "اسم الحي قصير جداً" });
    if (neighborhood && neighborhood.trim().length > 0) {
      await query(
        `UPDATE users SET gender=$1, neighborhood=$2 WHERE id=$3`,
        [gender, neighborhood.trim(), user.id]
      );
      return res.json({ success: true, gender, neighborhood: neighborhood.trim() });
    }
    await query(`UPDATE users SET gender=$1 WHERE id=$2`, [gender, user.id]);
    return res.json({ success: true, gender });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});


router.post("/admin/validate-pin", pinLimiter, async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    if (!pin || typeof pin !== "string" || pin.length < 4 || pin.length > 20) {
      return res.status(400).json({ valid: false });
    }
    const result = await query(`SELECT value FROM admin_settings WHERE key='admin_pin'`);
    const storedPin = result.rows[0]?.value || DEFAULT_ADMIN_PIN;
    return res.json({ valid: safeCompare(pin, storedPin) });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/change-pin", async (req: Request, res: Response) => {
  try {
    const { new_pin, current_pin } = req.body;
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) {
      if (!current_pin) return res.status(403).json({ error: "غير مصرح" });
      const stored = await query(`SELECT value FROM admin_settings WHERE key='admin_pin'`);
      const storedPin = stored.rows[0]?.value || DEFAULT_ADMIN_PIN;
      if (current_pin !== storedPin) return res.status(403).json({ error: "الرمز الحالي غير صحيح" });
    }
    if (!new_pin || new_pin.length < 4) return res.status(400).json({ error: "يجب أن يكون الرمز الجديد 4 أرقام على الأقل" });
    await query(`UPDATE admin_settings SET value=$1 WHERE key='admin_pin'`, [new_pin]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/name", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT value FROM admin_settings WHERE key='admin_name'`);
    return res.json({ name: result.rows[0]?.value || "المسؤول" });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/name", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name } = req.body;
    await query(`UPDATE admin_settings SET value=$1 WHERE key='admin_name'`, [name]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/ratings", writeLimiter, async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const { target_type, target_id, rating, comment } = req.body;
    await query(
      `INSERT INTO ratings (target_type, target_id, user_id, rating, comment) VALUES ($1,$2,$3,$4,$5)`,
      [target_type, target_id, user?.id || null, rating, comment || null]
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/appointments", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { target_type, target_id, appointment_date, appointment_time, notes } = req.body;
    const result = await query(
      `INSERT INTO appointments (user_id, target_type, target_id, appointment_date, appointment_time, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [user.id, target_type, target_id, appointment_date, appointment_time, notes || null]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/women-services", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM women_services ORDER BY name`);
    return res.json({ services: result.rows });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/organizations", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM organizations ORDER BY name`);
    return res.json({ organizations: result.rows });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── إعدادات مواقيت الآذان (عام) ──
router.get("/prayer-settings", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM prayer_settings WHERE id = 1`);
    const row = result.rows[0] || {};
    return res.json({ settings: row });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── إعدادات مواقيت الآذان (إدارة) ──
router.put("/admin/prayer-settings", async (req: Request, res: Response) => {
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) return res.status(403).json({ error: "Forbidden" });
  const { method, school, latitude, longitude, fajr_offset, dhuhr_offset, asr_offset, maghrib_offset, isha_offset } = req.body;
  try {
    await query(`
      UPDATE prayer_settings SET
        method         = COALESCE($1, method),
        school         = COALESCE($2, school),
        latitude       = COALESCE($3, latitude),
        longitude      = COALESCE($4, longitude),
        fajr_offset    = COALESCE($5, fajr_offset),
        dhuhr_offset   = COALESCE($6, dhuhr_offset),
        asr_offset     = COALESCE($7, asr_offset),
        maghrib_offset = COALESCE($8, maghrib_offset),
        isha_offset    = COALESCE($9, isha_offset),
        updated_at     = NOW()
      WHERE id = 1
    `, [method, school, latitude, longitude, fajr_offset, dhuhr_offset, asr_offset, maghrib_offset, isha_offset]);
    const result = await query(`SELECT * FROM prayer_settings WHERE id = 1`);
    return res.json({ success: true, settings: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Proxy مواقيت الآذان — يُجلب من aladhan.com ويُخزَّن cache يومياً ──────────
const _prayerCache = new Map<string, { data: unknown; fetchedAt: number }>();

router.get("/prayer-times", async (req: Request, res: Response) => {
  const { date, latitude, longitude, method, school, tune, city, country } = req.query as Record<string, string>;

  const dateStr = date || (() => {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}-${d.getFullYear()}`;
  })();

  const cacheKey = `${dateStr}-${latitude||""}-${longitude||""}-${method||"5"}-${school||"1"}-${tune||""}-${city||""}-${country||""}`;
  const cached = _prayerCache.get(cacheKey);
  // استخدام الـ cache إذا كان عمره أقل من 12 ساعة
  if (cached && Date.now() - cached.fetchedAt < 12 * 60 * 60 * 1000) {
    res.setHeader("X-Cache", "HIT");
    return res.json({ code: 200, data: cached.data });
  }

  const urls: string[] = [];
  if (latitude && longitude) {
    const tuneParam = tune ? `&tune=${tune}` : "";
    urls.push(`https://api.aladhan.com/v1/timings/${dateStr}?latitude=${latitude}&longitude=${longitude}&method=${method||5}&school=${school||1}${tuneParam}`);
  }
  const cityParam = city || "Hasahisa";
  const countryParam = country || "SD";
  urls.push(`https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=${cityParam}&country=${countryParam}&method=${method||5}&school=${school||1}`);

  let lastErr = "";
  for (const url of urls) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 12000);
      const upstream = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!upstream.ok) { lastErr = `upstream ${upstream.status}`; continue; }
      const json: any = await upstream.json();
      if (json.code === 200 && json.data?.timings?.Fajr) {
        _prayerCache.set(cacheKey, { data: json.data, fetchedAt: Date.now() });
        res.setHeader("X-Cache", "MISS");
        return res.json({ code: 200, data: json.data });
      }
      lastErr = "invalid data from aladhan";
    } catch (e: any) {
      lastErr = e?.message || "fetch error";
    }
  }

  // إذا فشل كل شيء وعندنا cache قديم — نُعيده كـ fallback
  if (cached) {
    res.setHeader("X-Cache", "STALE");
    return res.json({ code: 200, data: cached.data });
  }
  return res.status(502).json({ error: `prayer-times proxy failed: ${lastErr}` });
});

router.get("/posts", async (req: Request, res: Response) => {
  try {
    const { category, device_id, user_id } = req.query as { category?: string; device_id?: string; user_id?: string };
    const params: unknown[] = [];
    let paramIndex = 1;

    const conditions: string[] = [];
    if (category) {
      conditions.push(`p.category=$${paramIndex++}`);
      params.push(category);
    }
    if (user_id) {
      conditions.push(`p.author_id=$${paramIndex++}`);
      params.push(Number(user_id));
    }
    let whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

    const deviceParam = `$${paramIndex++}`;
    params.push(device_id || "");

    const sql = `
      SELECT
        p.*,
        u.avatar_url AS author_avatar,
        COUNT(DISTINCT l.id)::int AS likes_count,
        COUNT(DISTINCT c.id)::int AS comments_count,
        CASE WHEN EXISTS(
          SELECT 1 FROM social_likes dl WHERE dl.post_id=p.id AND dl.device_id=${deviceParam}
        ) THEN true ELSE false END AS liked_by_me
      FROM social_posts p
      LEFT JOIN users u ON u.id = p.author_id
      LEFT JOIN social_likes l ON l.post_id=p.id
      LEFT JOIN social_comments c ON c.post_id=p.id
      ${whereClause}
      GROUP BY p.id, u.avatar_url
      ORDER BY p.created_at DESC
    `;
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (err: any) {
    if (err?.code === "42P01") return res.json([]); // table not ready yet on cold start
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/posts", writeLimiter, async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const { content, category, author_name, image_url, video_url } = req.body;
    if (!content?.trim() && !image_url && !video_url) return res.status(400).json({ error: "المحتوى مطلوب" });

    if (content?.trim()) {
      const mod = await checkContent(content.trim());
      if (!mod.allowed) {
        return res.status(422).json({
          error: "تم رفض المنشور",
          reason: mod.reason ?? "يحتوي المنشور على محتوى مخالف لسياسة المنصة",
          category: mod.category,
          blocked: true,
        });
      }
    }

    const result = await query(
      `INSERT INTO social_posts (author_id, author_name, content, category, image_url, video_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        user?.id || null,
        author_name || user?.name || "مجهول",
        content?.trim() || "",
        category || "عام",
        image_url || null,
        video_url || null,
      ]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/posts/:id", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    await query(`DELETE FROM social_posts WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/posts/:id/comments", async (req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM social_comments WHERE post_id=$1 ORDER BY created_at ASC`, [req.params.id]);
    return res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/posts/:id/comments", writeLimiter, async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const { content, author_name } = req.body;
    if (!content) return res.status(400).json({ error: "المحتوى مطلوب" });

    const mod = await checkContent(content);
    if (!mod.allowed) {
      return res.status(422).json({
        error: "تم رفض التعليق",
        reason: mod.reason ?? "يحتوي التعليق على محتوى مخالف لسياسة المنصة",
        category: mod.category,
        blocked: true,
      });
    }

    const result = await query(
      `INSERT INTO social_comments (post_id, author_name, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, author_name || user?.name || "مجهول", content]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/comments/:id", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    await query(`DELETE FROM social_comments WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/posts/:id/like", writeLimiter, async (req: Request, res: Response) => {
  try {
    const { device_id } = req.body;
    if (!device_id || typeof device_id !== "string" || device_id.length > 200) {
      return res.status(400).json({ error: "device_id غير صالح" });
    }
    const postId = req.params.id;
    // محاولة إدراج ذرّية: إن وُجد سجل سابق نحذفه (toggle)
    const ins = await query(
      `INSERT INTO social_likes (post_id, device_id) VALUES ($1,$2)
       ON CONFLICT (post_id, device_id) DO NOTHING RETURNING id`,
      [postId, device_id]
    );
    if (ins.rows.length > 0) {
      return res.json({ liked: true });
    }
    await query(`DELETE FROM social_likes WHERE post_id=$1 AND device_id=$2`, [postId, device_id]);
    return res.json({ liked: false });
  } catch (err) {
    logger.error({ err }, "post like error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// Push Tokens — تسجيل وتحديث رمز الإشعارات
// ══════════════════════════════════════════════════════

router.post("/push-tokens", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const { token, platform } = req.body as { token: string; platform?: string };
    if (!token || !token.startsWith("ExponentPushToken[")) {
      return res.status(400).json({ error: "رمز إشعار غير صالح" });
    }
    await query(
      `INSERT INTO push_tokens (user_id, token, platform, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (user_id) DO UPDATE SET token=$2, platform=$3, updated_at=NOW()`,
      [me.id, token, platform || "android"]
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// خريطة المدينة — أماكن الخدمات
// ══════════════════════════════════════════════════════

router.get("/map/places", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT id, name, category, address, phone, lat, lng, icon, color
       FROM map_places ORDER BY category, name`
    );
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/map/places", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const { name, category, address, phone, lat, lng, icon, color } = req.body;
    if (!name || !lat || !lng) return res.status(400).json({ error: "بيانات ناقصة" });
    const { rows } = await query(
      `INSERT INTO map_places (name, category, address, phone, lat, lng, icon, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, category || "other", address || null, phone || null, lat, lng,
       icon || "location", color || "#3EFF9C"]
    );
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/map/places/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const { name, category, address, phone, lat, lng, icon, color } = req.body;
    const { rows } = await query(
      `UPDATE map_places SET name=$1,category=$2,address=$3,phone=$4,lat=$5,lng=$6,icon=$7,color=$8
       WHERE id=$9 RETURNING *`,
      [name, category || "other", address || null, phone || null, lat, lng, icon || "location", color || "#3EFF9C", req.params.id]
    );
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/map/places/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    await query(`DELETE FROM map_places WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════

router.get("/notifications", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM notifications ORDER BY created_at DESC`);
    return res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/notifications", authLimiter, async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { title, body, type } = req.body;
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });
    const result = await query(
      `INSERT INTO notifications (title, body, type) VALUES ($1,$2,$3) RETURNING *`,
      [title, body, type || "general"]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/notifications/:id/read", async (req: Request, res: Response) => {
  try {
    await query(`UPDATE notifications SET is_read=true WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/notifications/read-all", async (_req: Request, res: Response) => {
  try {
    await query(`UPDATE notifications SET is_read=true`);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/notifications/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM notifications WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/news", async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    let sql = `SELECT * FROM city_news`;
    const params: unknown[] = [];
    if (category) { sql += ` WHERE category=$1`; params.push(category); }
    sql += ` ORDER BY is_pinned DESC, created_at DESC`;
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/news", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { title, content, category, author_name, is_pinned } = req.body;
    const result = await query(
      `INSERT INTO city_news (title, content, category, author_name, is_pinned) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [title, content, category || "general", author_name || "إدارة التطبيق", is_pinned || false]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/news/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { title, content, category, author_name, is_pinned } = req.body;
    const result = await query(
      `UPDATE city_news SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        category = COALESCE($3, category),
        author_name = COALESCE($4, author_name),
        is_pinned = COALESCE($5, is_pinned)
       WHERE id = $6 RETURNING *`,
      [title, content, category, author_name, is_pinned, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "الخبر غير موجود" });
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/news/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM city_news WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════
// RATINGS — Entities + Reviews
// ══════════════════════════════════════════════════════════════════

router.get("/ratings/entities", async (req: Request, res: Response) => {
  try {
    const { type, search, category } = req.query;
    let sql = `
      SELECT e.*,
        COALESCE(AVG(r.rating),0)::numeric(3,2)   AS avg_rating,
        COUNT(r.id)::int                           AS review_count
      FROM rated_entities e
      LEFT JOIN ratings r ON r.entity_id = e.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    if (type) { params.push(type); sql += ` AND e.type = $${params.length}`; }
    if (category) { params.push(category); sql += ` AND e.category = $${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND (e.name ILIKE $${params.length} OR e.subtitle ILIKE $${params.length} OR e.category ILIKE $${params.length})`; }
    sql += ` GROUP BY e.id ORDER BY avg_rating DESC, review_count DESC, e.name`;
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/ratings/entities", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const { type, name, subtitle, category, phone, district, notes } = req.body;
    if (!type || !name || !category) return res.status(400).json({ error: "type, name, category مطلوبة" });
    const result = await query(
      `INSERT INTO rated_entities (type, name, subtitle, category, phone, district, notes, submitted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [type, name, subtitle || null, category, phone || null, district || null, notes || null, user?.id || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/ratings/entities/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [entityRes, ratingsRes] = await Promise.all([
      query(`
        SELECT e.*,
          COALESCE(AVG(r.rating),0)::numeric(3,2) AS avg_rating,
          COUNT(r.id)::int AS review_count
        FROM rated_entities e
        LEFT JOIN ratings r ON r.entity_id = e.id
        WHERE e.id = $1
        GROUP BY e.id
      `, [id]),
      query(`
        SELECT r.*, u.name AS user_name
        FROM ratings r
        LEFT JOIN users u ON u.id = r.user_id
        WHERE r.entity_id = $1
        ORDER BY r.created_at DESC
        LIMIT 50
      `, [id]),
    ]);
    if (!entityRes.rows[0]) return res.status(404).json({ error: "غير موجود" });
    return res.json({ entity: entityRes.rows[0], ratings: ratingsRes.rows });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/ratings/entities/:id/rate", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await getSessionUser(req);
    const { rating, comment, device_id } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
    if (!user && !device_id) return res.status(400).json({ error: "يجب تسجيل الدخول أو تقديم device_id" });

    const entityRes = await query(`SELECT id, type FROM rated_entities WHERE id = $1`, [id]);
    if (!entityRes.rows[0]) return res.status(404).json({ error: "الكيان غير موجود" });

    if (user) {
      const exists = await query(`SELECT id FROM ratings WHERE entity_id=$1 AND user_id=$2`, [id, user.id]);
      if (exists.rows[0]) {
        await query(`UPDATE ratings SET rating=$1, comment=$2, created_at=NOW() WHERE entity_id=$3 AND user_id=$4`,
          [rating, comment || null, id, user.id]);
        return res.json({ success: true, updated: true });
      }
    } else if (device_id) {
      const exists = await query(`SELECT id FROM ratings WHERE entity_id=$1 AND device_id=$2`, [id, device_id]);
      if (exists.rows[0]) {
        await query(`UPDATE ratings SET rating=$1, comment=$2, created_at=NOW() WHERE entity_id=$3 AND device_id=$4`,
          [rating, comment || null, id, device_id]);
        return res.json({ success: true, updated: true });
      }
    }

    await query(
      `INSERT INTO ratings (entity_id, user_id, device_id, rating, comment, target_type, target_id)
       VALUES ($1,$2,$3,$4,$5,'entity',$6)`,
      [id, user?.id || null, device_id || null, rating, comment || null, id]
    );
    return res.status(201).json({ success: true, updated: false });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/ratings/leaderboard", async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    let sql = `
      SELECT e.*,
        COALESCE(AVG(r.rating),0)::numeric(3,2) AS avg_rating,
        COUNT(r.id)::int AS review_count
      FROM rated_entities e
      LEFT JOIN ratings r ON r.entity_id = e.id
    `;
    const params: unknown[] = [];
    if (type) { params.push(type); sql += ` WHERE e.type = $1`; }
    sql += ` GROUP BY e.id HAVING COUNT(r.id) > 0 ORDER BY avg_rating DESC, review_count DESC LIMIT 20`;
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── إدارة التقييمات (أدمن) ────────────────────────────────────────────────────
router.get("/admin/ratings", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`
      SELECT r.*, e.name AS entity_name, e.type AS entity_type, u.name AS user_display_name
      FROM ratings r
      LEFT JOIN rated_entities e ON e.id = r.entity_id
      LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC
      LIMIT 500
    `);
    return res.json(rows);
  } catch (err) { logger.error({ err }, "GET /admin/ratings"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/ratings/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM ratings WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const [usersResult, postsResult, newsResult] = await Promise.all([
      query("SELECT COUNT(*)::int AS count FROM users"),
      query("SELECT COUNT(*)::int AS count FROM social_posts"),
      query("SELECT COUNT(*)::int AS count FROM city_news"),
    ]);
    return res.json({
      users: usersResult.rows[0]?.count || 0,
      posts: postsResult.rows[0]?.count || 0,
      news: newsResult.rows[0]?.count || 0,
    });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════
//  ADMIN DASHBOARD ROUTES
// ══════════════════════════════════════════════

router.get("/admin/users", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const page   = Math.max(1, parseInt(singleQueryValue(req.query.page)  || "1"));
    const limit  = Math.min(100, Math.max(1, parseInt(singleQueryValue(req.query.limit) || "50")));
    const search = (singleQueryValue(req.query.search) || "").trim();
    const offset = (page - 1) * limit;

    const whereClause = search
      ? `WHERE (name ILIKE $3 OR phone ILIKE $3 OR email ILIKE $3)`
      : "";
    const params: unknown[] = search
      ? [limit, offset, `%${search}%`]
      : [limit, offset];

    const [result, countR] = await Promise.all([
      query(`
        SELECT id, name, phone, email, role, neighborhood, birth_date,
               national_id, is_banned, created_at, firebase_uid, avatar_url, gender
        FROM users ${whereClause}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, params),
      query(`SELECT COUNT(*) AS cnt FROM users ${whereClause}`,
        search ? [`%${search}%`] : []),
    ]);

    const users = result.rows.map((u: any) => ({
      id: u.id, name: u.name, phone: u.phone, email: u.email, role: u.role,
      neighborhood: u.neighborhood, birth_date: u.birth_date, gender: u.gender,
      national_id_masked: u.national_id ? String(u.national_id).slice(-4).padStart(String(u.national_id).length, "*") : null,
      is_banned: u.is_banned, created_at: u.created_at,
      firebase_uid: u.firebase_uid ? u.firebase_uid.slice(0, 8) + "…" : null,
      has_firebase: !!u.firebase_uid,
      avatar_url: u.avatar_url,
    }));
    const total = parseInt(countR.rows[0]?.cnt || "0");
    return res.json({ users, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/admin/sync-firebase-users — مزامنة Firebase → PostgreSQL ──────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post("/admin/sync-firebase-users", heavyWriteLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });

    const firebaseUsers = await listAllFirebaseUsers();
    if (!firebaseUsers.length) {
      return res.json({ firebase_total: 0, synced: 0, created: 0, updated: 0, errors: 0 });
    }

    let created = 0, updated = 0, errors = 0;

    // Bulk UPSERT in chunks of 200 — far fewer round-trips than 25-at-a-time
    const BULK = 200;
    for (let i = 0; i < firebaseUsers.length; i += BULK) {
      const batch = firebaseUsers.slice(i, i + BULK);
      const placeholders = batch.map((_, j) =>
        `($${j*5+1},$${j*5+2},$${j*5+3},$${j*5+4},$${j*5+5},'$firebase$','user')`
      ).join(",");
      const params = batch.flatMap(fu => [
        fu.uid,
        fu.displayName || fu.email?.split("@")[0] || "مستخدم",
        fu.email || null,
        fu.phoneNumber || null,
        fu.photoURL || null,
      ]);
      try {
        await query(
          `INSERT INTO users (firebase_uid,name,email,phone,avatar_url,password_hash,role)
           VALUES ${placeholders}
           ON CONFLICT (firebase_uid) DO UPDATE
             SET name=COALESCE(NULLIF(EXCLUDED.name,''),users.name),
                 avatar_url=COALESCE(EXCLUDED.avatar_url,users.avatar_url),
                 email=COALESCE(EXCLUDED.email,users.email)`,
          params
        );
        updated += batch.length;
      } catch {
        // Fallback: process individually (handles email-conflict edge cases)
        await Promise.allSettled(batch.map(async (fu) => {
          try {
            const result = await query(
              `INSERT INTO users (firebase_uid,name,email,phone,password_hash,role,avatar_url)
               VALUES ($1,$2,$3,$4,'$firebase$','user',$5)
               ON CONFLICT (firebase_uid) DO UPDATE
                 SET name=COALESCE(NULLIF(EXCLUDED.name,''),users.name),
                     avatar_url=COALESCE(EXCLUDED.avatar_url,users.avatar_url),
                     email=COALESCE(EXCLUDED.email,users.email)
               RETURNING xmax`,
              [fu.uid, fu.displayName || fu.email?.split("@")[0] || "مستخدم",
               fu.email || null, fu.phoneNumber || null, fu.photoURL || null]
            );
            if (result.rows[0]?.xmax === "0") created++;
            else updated++;
          } catch {
            try {
              await query(`UPDATE users SET firebase_uid=$1,avatar_url=COALESCE($2,avatar_url) WHERE email=$3`,
                [fu.uid, fu.photoURL || null, fu.email || null]);
              updated++;
            } catch { errors++; }
          }
        }));
      }
    }

    logger.info({ firebase_total: firebaseUsers.length, created, updated, errors }, "[sync-firebase] complete");
    return res.json({ firebase_total: firebaseUsers.length, synced: created + updated, created, updated, errors });

  } catch (e: any) {
    logger.error({ err: e?.message }, "sync-firebase-users error");
    if (!res.headersSent) res.status(500).json({ error: "تعذّر مزامنة المستخدمين، حاول لاحقاً" });
  }
});

// ── POST /api/admin/migrate-users-from-db — نقل المستخدمين من قاعدة بيانات أخرى ──
router.post("/admin/migrate-users-from-db", heavyWriteLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { source_db_url } = req.body as { source_db_url?: string };
    if (!source_db_url || !source_db_url.startsWith("postgres"))
      return res.status(400).json({ error: "source_db_url غير صالح" });

    // Connect to source DB
    const { Pool: PgPool } = await import("pg");
    const srcPool = new PgPool({
      connectionString: source_db_url,
      connectionTimeoutMillis: 10_000,
      max: 3,
      ssl: source_db_url.includes("sslmode=require") || source_db_url.includes(".render.com")
        ? { rejectUnauthorized: false } : false,
    });

    let srcUsers: any[];
    try {
      const r = await srcPool.query(
        `SELECT id, name, phone, email, password_hash, role, neighborhood,
                birth_date, national_id, firebase_uid, avatar_url, gender,
                is_banned, created_at
         FROM users ORDER BY id`
      );
      srcUsers = r.rows;
    } finally {
      await srcPool.end().catch(() => {});
    }

    if (!srcUsers.length) return res.json({ migrated: 0, skipped: 0, errors: 0, total: 0 });

    let migrated = 0, skipped = 0, errors = 0;
    for (const u of srcUsers) {
      try {
        const result = await query(
          `INSERT INTO users
             (name, phone, email, password_hash, role, neighborhood, birth_date,
              national_id, firebase_uid, avatar_url, gender, is_banned, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (email) WHERE email IS NOT NULL DO NOTHING
           RETURNING id`,
          [u.name, u.phone, u.email, u.password_hash, u.role ?? "user",
           u.neighborhood, u.birth_date, u.national_id, u.firebase_uid,
           u.avatar_url, u.gender, u.is_banned ?? false, u.created_at]
        );
        if (result.rows.length) migrated++;
        else skipped++;
      } catch { errors++; }
    }

    logger.info({ total: srcUsers.length, migrated, skipped, errors }, "[migrate-users] done");
    return res.json({ total: srcUsers.length, migrated, skipped, errors });
  } catch (err: any) {
    logger.error({ err: err?.message }, "migrate-users-from-db error");
    return res.status(500).json({ error: err?.message ?? "Server error" });
  }
});

// ── POST /api/admin/set-firebase-credentials — حفظ FIREBASE_SERVICE_ACCOUNT_JSON في Vercel ──
router.post("/admin/set-firebase-credentials", heavyWriteLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });

    const { firebase_sa_json } = req.body as { firebase_sa_json?: string };
    if (!firebase_sa_json) return res.status(400).json({ error: "firebase_sa_json مطلوب" });

    // Validate it's valid JSON with required SA fields
    let parsed: any;
    try {
      parsed = JSON.parse(firebase_sa_json);
    } catch {
      return res.status(400).json({ error: "JSON غير صالح — تأكد من نسخ الملف كاملاً" });
    }
    if (parsed.type !== "service_account" || !parsed.project_id || !parsed.private_key) {
      return res.status(400).json({ error: "هذا ليس ملف Service Account صحيحاً — تأكد من تنزيله من Firebase Console" });
    }

    const vercelToken   = process.env.VERCEL_SELF_TOKEN;
    const vercelProject = process.env.VERCEL_SELF_PROJECT_ID;
    if (!vercelToken || !vercelProject) {
      return res.status(500).json({ error: "VERCEL_SELF_TOKEN غير مضبوط في بيئة الخادم" });
    }

    // Check if env var already exists
    const listResp = await fetch(
      `https://api.vercel.com/v9/projects/${vercelProject}/env?decrypt=false`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    );
    const listData: any = await listResp.json();
    const existing = (listData.envs ?? []).find((e: any) => e.key === "FIREBASE_SERVICE_ACCOUNT_JSON");

    const payload = JSON.stringify({
      key: "FIREBASE_SERVICE_ACCOUNT_JSON",
      value: firebase_sa_json,
      type: "encrypted",
      target: ["production", "preview", "development"],
    });

    const upsertResp = existing?.id
      ? await fetch(
          `https://api.vercel.com/v9/projects/${vercelProject}/env/${existing.id}`,
          { method: "PATCH", headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" }, body: payload }
        )
      : await fetch(
          `https://api.vercel.com/v10/projects/${vercelProject}/env`,
          { method: "POST", headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" }, body: payload }
        );

    if (!upsertResp.ok) {
      const errData: any = await upsertResp.json().catch(() => ({}));
      return res.status(502).json({ error: errData?.error?.message ?? "فشل تحديث Vercel" });
    }

    // Trigger redeployment so env var takes effect immediately
    const deployResp = await fetch(
      `https://api.vercel.com/v13/deployments`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "api-server", gitSource: { type: "github", repoId: "almhbob/hasahisawi", ref: "master" } }),
      }
    );
    const deployData: any = await deployResp.json().catch(() => ({}));

    logger.info({ project_id: parsed.project_id }, "[set-firebase-creds] FIREBASE_SERVICE_ACCOUNT_JSON updated");
    return res.json({
      ok: true,
      project_id: parsed.project_id,
      deployment_id: deployData?.id ?? null,
      message: "تم حفظ Firebase Service Account بنجاح. سيتم تطبيقه خلال دقيقة عند إعادة النشر.",
    });
  } catch (e: any) {
    logger.error({ err: e?.message }, "set-firebase-credentials error");
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

// ── GET /api/admin/users-source-health ──────────────────────────────────────
router.get("/admin/users-source-health", async (req: Request, res: Response): Promise<any> => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });

    const pgResult = await query(`SELECT COUNT(*)::int AS total FROM users`);
    const postgresUsers: number = pgResult.rows[0]?.total ?? 0;

    let firebaseUsers = 0;
    let firebaseMissingInPostgres = 0;
    let status = "configured";

    try {
      const fbUsers = await listAllFirebaseUsers();
      firebaseUsers = fbUsers.length;

      // Count Firebase UIDs not yet in Postgres
      if (fbUsers.length > 0) {
        const uids = fbUsers.map(u => u.uid);
        const pgUids = await query(
          `SELECT firebase_uid FROM users WHERE firebase_uid = ANY($1)`,
          [uids]
        );
        firebaseMissingInPostgres = fbUsers.length - (pgUids.rowCount ?? 0);
        status = firebaseMissingInPostgres > 0 ? "needs_sync" : "healthy";
      } else {
        status = "healthy";
      }
    } catch (fbErr: any) {
      const msg = fbErr?.message ?? "";
      if (msg.includes("FIREBASE_SERVICE_ACCOUNT_JSON") || msg.includes("invalid_grant")) {
        status = "missing_env";
      } else if (msg.includes("JSON")) {
        status = "invalid_json";
      } else {
        status = "firebase_error";
      }
    }

    return res.json({
      firebase_admin_configured: status !== "missing_env" && status !== "invalid_json",
      firebase_users: firebaseUsers || null,
      postgres_users: postgresUsers,
      firebase_missing_in_postgres: firebaseMissingInPostgres,
      status,
    });
  } catch (e: any) {
    logger.error({ err: e?.message }, "users-source-health error");
    return res.status(500).json({ error: "تعذّر فحص الحالة" });
  }
});

router.get("/admin/dashboard-stats", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const [totals, byNeighborhood, recent, sections] = await Promise.all([
      query(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE role='admin')::int AS admins,
        COUNT(*) FILTER (WHERE role='moderator')::int AS moderators,
        COUNT(*) FILTER (WHERE role='user')::int AS members
        FROM users`),
      query(`SELECT neighborhood, COUNT(*)::int AS count
             FROM users WHERE neighborhood IS NOT NULL
             GROUP BY neighborhood ORDER BY count DESC LIMIT 10`),
      query(`SELECT id, name, role, neighborhood, created_at FROM users
             ORDER BY created_at DESC LIMIT 10`),
      query(`SELECT
        (SELECT COUNT(*)::int FROM jobs WHERE is_active=true)                           AS jobs_active,
        (SELECT COUNT(*)::int FROM citizen_reports WHERE status='pending')::int          AS reports_pending,
        (SELECT COUNT(*)::int FROM lost_items WHERE status='lost')::int                 AS missing_lost,
        (SELECT COUNT(*)::int FROM factories WHERE is_active=true)::int                 AS factories_active,
        (SELECT COUNT(*)::int FROM rental_listings WHERE status='active')::int          AS rentals_active,
        (SELECT COUNT(*)::int FROM feedback WHERE status='pending')::int                AS feedback_pending,
        (SELECT COUNT(*)::int FROM ratings)::int                                        AS ratings_total,
        (SELECT COUNT(*)::int FROM travel_agency_applications WHERE status='pending')::int AS travel_pending
      `),
    ]);
    return res.json({
      totals: totals.rows[0],
      byNeighborhood: byNeighborhood.rows,
      recentUsers: recent.rows,
      sections: sections.rows[0],
    });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/admin/users/:id/role", async (req: Request, res: Response) => {
  try {
    const currentUser = await getSessionUser(req);
    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).json({ error: "فقط المدير يمكنه تغيير الأدوار" });
    }
    const { role } = req.body;
    const allowed = ["user", "moderator", "admin"];
    if (!allowed.includes(role)) return res.status(400).json({ error: "دور غير صالح" });
    const targetId = parseInt(req.params.id as string);
    if (targetId === currentUser.id) return res.status(400).json({ error: "لا يمكنك تغيير دورك بنفسك" });
    await query(`UPDATE users SET role=$1 WHERE id=$2`, [role, targetId]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// حظر / رفع حظر مستخدم
router.patch("/admin/users/:id/ban", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const targetId = parseInt(req.params.id as string);
    if (isNaN(targetId)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { ban } = req.body;
    await query(`UPDATE users SET is_banned=$1 WHERE id=$2`, [!!ban, targetId]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// إحصائيات مستخدم محدد — للمدير والمشرف
router.get("/admin/users/:id/stats", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const uid = parseInt(req.params["id"] as string);
    if (isNaN(uid)) return res.status(400).json({ error: "معرف غير صالح" });

    const [userR, postsR, commentsR, likesR, reportsR, msgsR, adsR, apptR, sessionsR] =
      await Promise.all([
        query(
          `SELECT id, name, role, avatar_url, bio, phone, email, neighborhood,
                  created_at, is_banned
           FROM users WHERE id=$1`,
          [uid]
        ),
        query(`SELECT COUNT(*)::int AS cnt FROM social_posts     WHERE author_id=$1`, [uid]),
        query(`SELECT COUNT(*)::int AS cnt FROM social_comments  WHERE author_id=$1`, [uid]),
        query(`SELECT COUNT(*)::int AS cnt FROM social_likes     WHERE user_id=$1`,   [uid]),
        query(`SELECT COUNT(*)::int AS cnt FROM citizen_reports  WHERE user_id=$1`,   [uid]),
        query(`SELECT COUNT(*)::int AS cnt FROM chat_messages    WHERE sender_id=$1`, [uid]),
        query(`SELECT COUNT(*)::int AS cnt FROM ads              WHERE user_id=$1`,   [uid]),
        query(`SELECT COUNT(*)::int AS cnt FROM appointments     WHERE user_id=$1`,   [uid]),
        query(
          `SELECT MAX(created_at) AS last_seen FROM user_sessions WHERE user_id=$1`,
          [uid]
        ),
      ]);

    if (!userR.rows.length) return res.status(404).json({ error: "المستخدم غير موجود" });

    return res.json({
      user:          userR.rows[0],
      posts_count:   postsR.rows[0]?.cnt   ?? 0,
      comments_count: commentsR.rows[0]?.cnt ?? 0,
      likes_count:   likesR.rows[0]?.cnt    ?? 0,
      reports_count: reportsR.rows[0]?.cnt  ?? 0,
      messages_count: msgsR.rows[0]?.cnt    ?? 0,
      ads_count:     adsR.rows[0]?.cnt      ?? 0,
      appointments_count: apptR.rows[0]?.cnt ?? 0,
      last_seen:     sessionsR.rows[0]?.last_seen ?? null,
    });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/users/:id", async (req: Request, res: Response) => {
  try {
    const currentUser = await getSessionUser(req);
    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).json({ error: "فقط المدير يمكنه حذف المستخدمين" });
    }
    const targetId = parseInt(req.params.id as string);
    if (isNaN(targetId)) return res.status(400).json({ error: "معرّف غير صالح" });
    if (targetId === currentUser.id) return res.status(400).json({ error: "لا يمكنك حذف حسابك بنفسك" });
    await query(`DELETE FROM users WHERE id=$1`, [targetId]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// PATCH /admin/users/:id/password — تغيير كلمة مرور مستخدم (admin فقط)
router.patch("/admin/users/:id/password", async (req: Request, res: Response) => {
  try {
    const currentUser = await getSessionUser(req);
    if (!currentUser || currentUser.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const targetId = parseInt(req.params.id as string);
    if (isNaN(targetId)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { new_password } = req.body as any;
    if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    const hash = await bcrypt.hash(String(new_password), 10);
    const { rowCount } = await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, targetId]);
    if (!rowCount) return res.status(404).json({ error: "المستخدم غير موجود" });
    return res.json({ ok: true, message: "تم تحديث كلمة المرور بنجاح" });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/users/:id/permissions", async (req: Request, res: Response) => {
  try {
    const currentUser = await getSessionUser(req);
    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const result = await query(`SELECT section FROM moderator_permissions WHERE user_id=$1`, [req.params.id]);
    return res.json(result.rows.map((r: any) => r.section));
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/users/:id/permissions", async (req: Request, res: Response) => {
  try {
    const currentUser = await getSessionUser(req);
    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const { sections } = req.body;
    await query(`DELETE FROM moderator_permissions WHERE user_id=$1`, [req.params.id]);
    for (const section of sections || []) {
      await query(`INSERT INTO moderator_permissions (user_id, section) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, section]);
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Chat API ──────────────────────────────────────────────────────────────────

// جلب قائمة المستخدمين للدردشة
router.get("/users/list", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const result = await query(
      `SELECT id, name, role, avatar_url FROM users WHERE id != $1 AND role != 'guest' ORDER BY name LIMIT 100`,
      [me.id]
    );
    return res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب جميع المحادثات
router.get("/chats", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const result = await query(`
      SELECT c.*,
        u1.name AS user1_name, u1.avatar_url AS user1_avatar,
        u2.name AS user2_name, u2.avatar_url AS user2_avatar
      FROM chats c
      JOIN users u1 ON u1.id = c.user1_id
      JOIN users u2 ON u2.id = c.user2_id
      WHERE c.user1_id = $1 OR c.user2_id = $1
      ORDER BY c.last_message_at DESC
    `, [me.id]);
    return res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// إجمالي الرسائل غير المقروءة
router.get("/chats/unread", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const result = await query(`
      SELECT COALESCE(SUM(CASE WHEN user1_id=$1 THEN unread_user1 ELSE unread_user2 END),0)::int AS total
      FROM chats WHERE user1_id=$1 OR user2_id=$1
    `, [me.id]);
    return res.json({ total: result.rows[0]?.total ?? 0 });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// إنشاء أو جلب محادثة مع مستخدم آخر
router.post("/chats", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const { other_user_id } = req.body;
    if (!other_user_id) return res.status(400).json({ error: "other_user_id مطلوب" });
    const u1 = Math.min(Number(me.id), Number(other_user_id));
    const u2 = Math.max(Number(me.id), Number(other_user_id));
    await query(
      `INSERT INTO chats (user1_id, user2_id) VALUES ($1,$2) ON CONFLICT (user1_id, user2_id) DO NOTHING`,
      [u1, u2]
    );
    const result = await query(`
      SELECT c.*,
        u1.name AS user1_name, u1.avatar_url AS user1_avatar,
        u2.name AS user2_name, u2.avatar_url AS user2_avatar
      FROM chats c
      JOIN users u1 ON u1.id=c.user1_id
      JOIN users u2 ON u2.id=c.user2_id
      WHERE c.user1_id=$1 AND c.user2_id=$2
    `, [u1, u2]);
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب رسائل محادثة
router.get("/chats/:chatId/messages", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const chatId = parseInt(req.params.chatId as string);
    const chat = await query(`SELECT * FROM chats WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`, [chatId, me.id]);
    if (!chat.rows[0]) return res.status(403).json({ error: "غير مصرح" });
    const since = req.query.since as string | undefined;
    const result = await query(
      `SELECT m.*, u.name AS sender_name FROM chat_messages m
       JOIN users u ON u.id=m.sender_id
       WHERE m.chat_id=$1 ${since ? "AND m.id > $2" : ""}
       ORDER BY m.created_at ASC LIMIT 200`,
      since ? [chatId, parseInt(since)] : [chatId]
    );
    return res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// إرسال رسالة
router.post("/chats/:chatId/messages", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const chatId = parseInt(req.params.chatId as string);
    const chat = await query(`SELECT * FROM chats WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`, [chatId, me.id]);
    if (!chat.rows[0]) return res.status(403).json({ error: "غير مصرح" });
    const { content, image_url } = req.body;
    if (!content?.trim() && !image_url) return res.status(400).json({ error: "الرسالة فارغة" });

    if (content?.trim()) {
      const mod = await checkContent(content.trim());
      if (!mod.allowed) {
        return res.status(422).json({
          error: "تم رفض الرسالة",
          reason: mod.reason ?? "تحتوي الرسالة على محتوى مخالف لسياسة المنصة",
          category: mod.category,
          blocked: true,
        });
      }
    }

    const msgType = image_url ? "image" : "text";
    const msgContent = content?.trim() || "";
    const result = await query(
      `INSERT INTO chat_messages (chat_id, sender_id, content, image_url, type) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [chatId, me.id, msgContent, image_url || null, msgType]
    );
    const c = chat.rows[0];
    const isUser1 = me.id === c.user1_id;
    await query(`
      UPDATE chats SET
        last_message=$1, last_message_at=NOW(), last_sender_id=$2,
        unread_user1 = CASE WHEN $3 THEN unread_user1 ELSE unread_user1+1 END,
        unread_user2 = CASE WHEN $3 THEN unread_user2+1 ELSE unread_user2 END
      WHERE id=$4
    `, [image_url ? "📷 صورة" : msgContent, me.id, isUser1, chatId]);
    const msg = { ...result.rows[0], sender_name: me.name };

    // ── إرسال إشعار Push للمستقبِل ──
    const recipientId = isUser1 ? c.user2_id : c.user1_id;
    const notifBody = image_url ? "📷 أرسل لك صورة" : (msgContent.length > 60 ? msgContent.slice(0, 60) + "…" : msgContent);
    void sendPushToUser(
      recipientId,
      `رسالة من ${me.name as string}`,
      notifBody,
      { chatId, otherName: me.name, screen: "chat" }
    );

    return res.json(msg);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تعليم رسائل المحادثة كمقروءة
router.post("/chats/:chatId/read", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const chatId = parseInt(req.params.chatId as string);
    const chat = await query(`SELECT * FROM chats WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`, [chatId, me.id]);
    if (!chat.rows[0]) return res.status(403).json({ error: "غير مصرح" });
    const c = chat.rows[0];
    const isUser1 = me.id === c.user1_id;
    await query(
      `UPDATE chats SET ${isUser1 ? "unread_user1=0" : "unread_user2=0"} WHERE id=$1`,
      [chatId]
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// معالم المدينة — City Landmarks
// ══════════════════════════════════════════════════════

// جلب كل المعالم (عام)
router.get("/landmarks", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT id, name, sub, image_url, sort_order, created_at
       FROM city_landmarks ORDER BY sort_order ASC, id ASC`
    );
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// إضافة معلم جديد (الإدارة فقط)
router.post("/admin/landmarks", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const { name, sub, image_url } = req.body as { name: string; sub: string; image_url: string };
    if (!name?.trim() || !image_url?.trim()) {
      return res.status(400).json({ error: "الاسم والصورة مطلوبان" });
    }
    const { rows: orderRows } = await query(`SELECT COALESCE(MAX(sort_order),0)+1 AS next FROM city_landmarks`);
    const sort_order = orderRows[0].next;
    const { rows } = await query(
      `INSERT INTO city_landmarks (name, sub, image_url, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), (sub || "").trim(), image_url.trim(), sort_order]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// حذف معلم (الإدارة فقط)
router.delete("/admin/landmarks/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    await query(`DELETE FROM city_landmarks WHERE id=$1`, [id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تعديل معلم (الإدارة فقط)
router.patch("/admin/landmarks/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { name, sub, image_url } = req.body as { name: string; sub: string; image_url: string };
    if (!name?.trim() || !image_url?.trim()) {
      return res.status(400).json({ error: "الاسم والصورة مطلوبان" });
    }
    const { rows } = await query(
      `UPDATE city_landmarks SET name=$1, sub=$2, image_url=$3 WHERE id=$4 RETURNING *`,
      [name.trim(), (sub || "").trim(), image_url.trim(), id]
    );
    if (!rows[0]) return res.status(404).json({ error: "المعلم غير موجود" });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// قاعة التكريم — Honored Figures
// ══════════════════════════════════════════════════════

// جلب الشخصية المكرّمة النشطة حالياً (عام)
router.get("/honored-figure", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT id, name, title, city_role, photo_url, tribute, start_date, end_date, is_visible, created_at
      FROM honored_figures
      WHERE is_visible = TRUE
        AND start_date <= CURRENT_DATE
        AND end_date >= CURRENT_DATE
      ORDER BY start_date DESC
      LIMIT 1
    `);
    if (!rows.length) return res.json(null);
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════
//  مساحة التهنئة — GREETINGS
// ══════════════════════════════════════════════

router.get("/greetings", async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(50, Math.max(1, parseInt(String(req.query.limit  ?? 30))));
    const offset = Math.max(0, parseInt(String(req.query.offset ?? 0)));
    const { rows } = await query(
      `SELECT id, author_name, text, occasion_name, likes, created_at
       FROM greetings
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/greetings", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const { text, occasion_name } = req.body;
    if (!text || !String(text).trim()) return res.status(400).json({ error: "النص مطلوب" });
    if (String(text).length > 500) return res.status(400).json({ error: "النص طويل جداً" });
    const authorName = user ? user.name : "مجهول";
    const { rows } = await query(
      `INSERT INTO greetings (user_id, author_name, text, occasion_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user?.id ?? null, authorName, String(text).trim(), String(occasion_name || "تهنئة عامة").trim()],
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/greetings/:id/like", async (req: Request, res: Response) => {
  try {
    await query(`UPDATE greetings SET likes = likes + 1 WHERE id = $1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/greetings/:id", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user || (user.role !== "admin" && user.role !== "moderator"))
      return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM greetings WHERE id = $1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════

// قائمة عامة بجميع الشخصيات المكرّمة (مرئية للجميع)
router.get("/honored-figures", async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  ?? 1)));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 20))));
    const offset = (page - 1) * limit;
    const { rows } = await query(`
      SELECT id, name, title, city_role, photo_url, tribute, start_date, end_date, created_at,
             (end_date >= CURRENT_DATE AND start_date <= CURRENT_DATE) AS is_current
      FROM honored_figures
      WHERE is_visible = TRUE
      ORDER BY start_date DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    const { rows: countRows } = await query(`SELECT COUNT(*) FROM honored_figures WHERE is_visible = TRUE`);
    return res.json({ figures: rows, total: parseInt(countRows[0].count) });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب كل الشخصيات المكرّمة (الإدارة)
router.get("/admin/honored-figures", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`
      SELECT id, name, title, city_role, photo_url, tribute, start_date, end_date, is_visible, created_at
      FROM honored_figures
      ORDER BY created_at DESC
    `);
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// إضافة شخصية مكرّمة (الإدارة)
router.post("/admin/honored-figures", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const { name, title, city_role, photo_url, tribute, start_date, end_date } =
      req.body as { name: string; title: string; city_role: string; photo_url: string; tribute: string; start_date: string; end_date: string };
    if (!name?.trim() || !photo_url?.trim() || !start_date || !end_date) {
      return res.status(400).json({ error: "الاسم والصورة والتاريخان مطلوبة" });
    }
    const { rows } = await query(
      `INSERT INTO honored_figures (name, title, city_role, photo_url, tribute, start_date, end_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name.trim(), (title || "").trim(), (city_role || "").trim(), photo_url.trim(), (tribute || "").trim(), start_date, end_date, me.id]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تعديل شخصية مكرّمة (الإدارة)
router.patch("/admin/honored-figures/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { name, title, city_role, photo_url, tribute, start_date, end_date, is_visible } =
      req.body as { name?: string; title?: string; city_role?: string; photo_url?: string; tribute?: string; start_date?: string; end_date?: string; is_visible?: boolean };
    const { rows } = await query(
      `UPDATE honored_figures SET
        name = COALESCE($1, name),
        title = COALESCE($2, title),
        city_role = COALESCE($3, city_role),
        photo_url = COALESCE($4, photo_url),
        tribute = COALESCE($5, tribute),
        start_date = COALESCE($6::date, start_date),
        end_date = COALESCE($7::date, end_date),
        is_visible = COALESCE($8, is_visible)
       WHERE id = $9 RETURNING *`,
      [
        name?.trim() ?? null,
        title?.trim() ?? null,
        city_role?.trim() ?? null,
        photo_url?.trim() ?? null,
        tribute?.trim() ?? null,
        start_date ?? null,
        end_date ?? null,
        is_visible !== undefined ? is_visible : null,
        id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: "السجل غير موجود" });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تبديل حالة الظهور (الإدارة)
router.patch("/admin/honored-figures/:id/visibility", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { rows } = await query(
      `UPDATE honored_figures SET is_visible = NOT is_visible WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: "السجل غير موجود" });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// حذف شخصية مكرّمة (الإدارة)
router.delete("/admin/honored-figures/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    await query(`DELETE FROM honored_figures WHERE id = $1`, [id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// الجاليات — Communities
// ══════════════════════════════════════════════════════

// جلب الجاليات النشطة (عام)
router.get("/communities", async (req: Request, res: Response) => {
  try {
    const category = (req.query.category as string) || "";
    const search   = (req.query.search as string) || "";
    let sql = `SELECT * FROM communities WHERE status='active'`;
    const params: any[] = [];
    if (category && category !== "all") {
      params.push(category);
      sql += ` AND category=$${params.length}`;
    }
    if (search.trim()) {
      params.push(`%${search.trim()}%`);
      sql += ` AND (name ILIKE $${params.length} OR origin ILIKE $${params.length} OR neighborhood ILIKE $${params.length})`;
    }
    sql += ` ORDER BY members_count DESC, created_at DESC`;
    const { rows } = await query(sql, params);
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تسجيل جالية/مؤسسة جديدة (طلب يُراجعه الإدارة)
router.post("/communities/register", async (req: Request, res: Response) => {
  try {
    const {
      name, category, origin, description,
      representative_name, representative_title, representative_phone,
      representative_national_id, representative_email,
      contact_phone,
      members_count, neighborhood, services, meeting_schedule,
    } = req.body as any;
    if (!name?.trim() || !contact_phone?.trim()) {
      return res.status(400).json({ error: "اسم الجالية ورقم التواصل مطلوبان" });
    }
    if (!representative_name?.trim()) {
      return res.status(400).json({ error: "اسم ممثل الجهة مطلوب" });
    }
    const validCats = ["wafid", "foreign", "displaced", "expat", "institution", "ngo", "business", "health", "education", "other"];
    const cat = validCats.includes(category) ? category : "wafid";
    const { rows } = await query(
      `INSERT INTO communities
        (name, category, origin, description,
         representative_name, representative_title, representative_phone,
         representative_national_id, representative_email,
         contact_phone, members_count, neighborhood, services, meeting_schedule, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending')
       RETURNING id, name, status, created_at`,
      [
        name.trim(),
        cat,
        (origin || "").trim() || null,
        (description || "").trim() || null,
        representative_name.trim(),
        (representative_title || "").trim() || null,
        (representative_phone || "").trim() || null,
        (representative_national_id || "").trim() || null,
        (representative_email || "").trim() || null,
        contact_phone.trim(),
        Math.max(0, parseInt(String(members_count ?? "0"))),
        (neighborhood || "").trim() || null,
        (services || "").trim() || null,
        (meeting_schedule || "").trim() || null,
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── إدارة الجاليات (الإدارة فقط) ─────────────────────────────

// جلب كل الجاليات
router.get("/admin/communities", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const { rows } = await query(
      `SELECT * FROM communities ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
         created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تحديث حالة جالية/مؤسسة — الإدارة فقط
router.put("/admin/communities/:id/status", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") {
      return res.status(403).json({ error: "الموافقة والإيقاف والرفض من صلاحيات الإدارة فقط" });
    }
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { status, suspension_reason } = req.body as {
      status: "active" | "rejected" | "suspended";
      suspension_reason?: string;
    };
    if (!["active", "rejected", "suspended"].includes(status)) {
      return res.status(400).json({ error: "حالة غير صالحة" });
    }
    const { rows } = await query(
      `UPDATE communities SET status=$1, suspension_reason=$2 WHERE id=$3 RETURNING *`,
      [status, (suspension_reason || "").trim() || null, id]
    );
    if (!rows.length) return res.status(404).json({ error: "الجالية غير موجودة" });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// رفع طلب مؤسسة من قِبَل مشرف
router.post("/moderator/communities", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "moderator" && me.role !== "admin")) {
      return res.status(403).json({ error: "مشرفون ومديرون فقط" });
    }
    const {
      name, category, origin, description,
      representative_name, representative_title, representative_phone,
      representative_national_id, representative_email,
      contact_phone,
      members_count, neighborhood, services, meeting_schedule,
    } = req.body as any;
    if (!name?.trim() || !contact_phone?.trim()) {
      return res.status(400).json({ error: "اسم المؤسسة ورقم التواصل مطلوبان" });
    }
    if (!representative_name?.trim()) {
      return res.status(400).json({ error: "اسم ممثل الجهة مطلوب" });
    }
    const validCats = ["wafid", "foreign", "displaced", "expat", "institution", "ngo", "business", "health", "education", "other"];
    const cat = validCats.includes(category) ? category : "institution";
    const { rows } = await query(
      `INSERT INTO communities
        (name, category, origin, description,
         representative_name, representative_title, representative_phone,
         representative_national_id, representative_email,
         contact_phone, members_count, neighborhood, services, meeting_schedule,
         status, submitted_by, submitted_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16)
       RETURNING id, name, status, created_at`,
      [
        name.trim(),
        cat,
        (origin || "").trim() || null,
        (description || "").trim() || null,
        representative_name.trim(),
        (representative_title || "").trim() || null,
        (representative_phone || "").trim() || null,
        (representative_national_id || "").trim() || null,
        (representative_email || "").trim() || null,
        contact_phone.trim(),
        Math.max(0, parseInt(String(members_count ?? "0"))),
        (neighborhood || "").trim() || null,
        (services || "").trim() || null,
        (meeting_schedule || "").trim() || null,
        me.id,
        me.name || me.email || me.phone || null,
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// حذف جالية
router.delete("/admin/communities/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") {
      return res.status(403).json({ error: "مديرون فقط" });
    }
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    await query(`DELETE FROM communities WHERE id=$1`, [id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// طلبات الخدمات — Service Requests
// ══════════════════════════════════════════════════════

// جلب خدمات مؤسسة معينة (مرئية + مخفية + طلبات معلقة)
router.get("/communities/:id/services", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { rows } = await query(`SELECT services, services_hidden FROM communities WHERE id=$1`, [id]);
    if (!rows.length) return res.status(404).json({ error: "لم يوجد" });
    const splitSvcs = (txt: string | null) =>
      (txt || "").split("·").map((s: string) => s.trim()).filter(Boolean);
    const { rows: reqs } = await query(
      `SELECT id, action, service_name, status, created_at, submitted_by_name
       FROM community_service_requests WHERE community_id=$1 ORDER BY created_at DESC`,
      [id]
    );
    return res.json({
      visible: splitSvcs(rows[0].services),
      hidden: splitSvcs(rows[0].services_hidden),
      requests: reqs,
    });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تقديم طلب تعديل خدمة (أي مستخدم مسجّل / مشرف / إدارة)
router.post("/communities/:id/service-requests", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { action, service_name } = req.body as any;
    if (!["add", "hide", "show"].includes(action)) return res.status(400).json({ error: "نوع غير صالح" });
    if (!service_name?.trim()) return res.status(400).json({ error: "اسم الخدمة مطلوب" });
    // تحقق من عدم وجود طلب معلق لنفس الخدمة والإجراء
    const dup = await query(
      `SELECT id FROM community_service_requests WHERE community_id=$1 AND action=$2 AND service_name=$3 AND status='pending'`,
      [id, action, service_name.trim()]
    );
    if (dup.rows.length) return res.status(409).json({ error: "يوجد طلب معلق لهذه الخدمة بالفعل" });
    const { rows } = await query(
      `INSERT INTO community_service_requests (community_id, action, service_name, submitted_by, submitted_by_name)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, action, service_name.trim(), me.id, me.name || me.email || me.phone || null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب طلبات الخدمات المعلقة — المشرف والإدارة
router.get("/moderator/service-requests", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const statusFilter = (req.query.status as string) || "pending";
    const { rows } = await query(
      `SELECT r.*, c.name AS community_name, c.category AS community_category
       FROM community_service_requests r
       JOIN communities c ON c.id = r.community_id
       WHERE r.status=$1
       ORDER BY r.created_at DESC`,
      [statusFilter]
    );
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// الموافقة / الرفض على طلب خدمة — المشرف والإدارة
router.patch("/moderator/service-requests/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { decision, reviewer_note } = req.body as any;
    if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "قرار غير صالح" });

    // جلب الطلب
    const { rows: reqRows } = await query(
      `SELECT * FROM community_service_requests WHERE id=$1`, [id]
    );
    if (!reqRows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    const sr = reqRows[0];
    if (sr.status !== "pending") return res.status(409).json({ error: "تمت مراجعة هذا الطلب مسبقاً" });

    // تحديث حالة الطلب
    await query(
      `UPDATE community_service_requests SET status=$1, reviewed_at=NOW(), reviewer_note=$2 WHERE id=$3`,
      [decision, (reviewer_note || "").trim() || null, id]
    );

    // تطبيق التغيير على جدول communities عند الموافقة
    if (decision === "approved") {
      const { rows: cRows } = await query(
        `SELECT services, services_hidden FROM communities WHERE id=$1`, [sr.community_id]
      );
      if (cRows.length) {
        const splitSvcs = (txt: string | null) =>
          (txt || "").split("·").map((s: string) => s.trim()).filter(Boolean);
        let visible = splitSvcs(cRows[0].services);
        let hidden  = splitSvcs(cRows[0].services_hidden);
        const svcName: string = sr.service_name;

        if (sr.action === "add") {
          if (!visible.includes(svcName)) visible.push(svcName);
        } else if (sr.action === "hide") {
          visible = visible.filter((s: string) => s !== svcName);
          if (!hidden.includes(svcName)) hidden.push(svcName);
        } else if (sr.action === "show") {
          hidden = hidden.filter((s: string) => s !== svcName);
          if (!visible.includes(svcName)) visible.push(svcName);
        }

        await query(
          `UPDATE communities SET services=$1, services_hidden=$2 WHERE id=$3`,
          [
            visible.length ? visible.join(" · ") : null,
            hidden.length  ? hidden.join(" · ")  : null,
            sr.community_id,
          ]
        );
      }
    }

    return res.json({ success: true, decision });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// الإعلانات المدفوعة — Paid Ads
// ══════════════════════════════════════════════════════

// تنظيف الإعلانات المنتهية
async function expireOldAds() {
  try {
    await query(
      `UPDATE ads SET status='expired'
       WHERE status='active' AND end_date IS NOT NULL AND end_date < NOW()`
    );
  } catch {}
}

// جلب إعدادات الإعلانات (عام — لعرض السعر وبيانات التواصل في الشاشة)
router.get("/ads/settings", async (_req: Request, res: Response) => {
  try {
    const keys = ["ad_price_per_day", "ad_contact_phone", "ad_contact_whatsapp", "ad_promo_text", "ad_partner_email", "ad_bank_info"];
    const { rows } = await query(
      `SELECT key, value FROM admin_settings WHERE key = ANY($1)`,
      [keys]
    );
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    return res.json(settings);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تحديث إعدادات الإعلانات (الإدارة فقط)
router.put("/admin/ads-settings", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });

    const allowed = ["ad_price_per_day", "ad_contact_phone", "ad_contact_whatsapp", "ad_promo_text", "ad_partner_email", "ad_bank_info"];
    const updates = req.body as Record<string, string>;
    for (const [k, v] of Object.entries(updates)) {
      if (!allowed.includes(k)) continue;
      await query(`UPDATE admin_settings SET value=$1 WHERE key=$2`, [String(v), k]);
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب إعدادات العقود (للإدارة)
router.get("/admin/contract-settings", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT key, value FROM admin_settings WHERE key = 'contract_whatsapp'`
    );
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    return res.json({ contract_whatsapp: settings["contract_whatsapp"] || "+966597083352" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// تحديث إعدادات العقود (الإدارة فقط)
router.put("/admin/contract-settings", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const { contract_whatsapp } = req.body;
    if (!contract_whatsapp || typeof contract_whatsapp !== "string") {
      return res.status(400).json({ error: "رقم الواتساب مطلوب" });
    }
    // تحقق بسيط من شكل الرقم
    const cleaned = contract_whatsapp.replace(/\s/g, "");
    if (!/^\+?\d{7,15}$/.test(cleaned)) {
      return res.status(400).json({ error: "صيغة رقم الواتساب غير صحيحة" });
    }
    await query(
      `INSERT INTO admin_settings (key, value) VALUES ('contract_whatsapp', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [cleaned]
    );
    return res.json({ success: true, contract_whatsapp: cleaned });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب الإعلانات النشطة (عام)
router.get("/ads", async (_req: Request, res: Response) => {
  try {
    await expireOldAds();
    const { rows } = await query(
      `SELECT id, institution_name, title, description, type, target_screen,
              start_date, end_date, priority, created_at, image_url, website_url
       FROM ads WHERE status='active'
       ORDER BY priority DESC, approved_at DESC`
    );
    return res.json(rows);
  } catch (err: any) {
    if (err?.code === "42P01") return res.json([]); // table not ready yet on cold start
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// إرسال طلب إعلان (مصادقة اختيارية)
router.post("/ads/request", async (req: Request, res: Response) => {
  try {
    const {
      institution_name, contact_name, contact_phone,
      title, description, type, target_screen, duration_days, budget,
      image_url, website_url,
    } = req.body as {
      institution_name: string; contact_name?: string; contact_phone?: string;
      title: string; description?: string; type?: string;
      target_screen?: string; duration_days?: number; budget?: string;
      image_url?: string; website_url?: string;
    };
    if (!institution_name?.trim() || !title?.trim() || !contact_phone?.trim()) {
      return res.status(400).json({ error: "اسم المؤسسة والعنوان والهاتف مطلوبة" });
    }
    const validTypes = ["promotion", "announcement", "event", "surprise", "banner"];
    const adType = validTypes.includes(type ?? "") ? type : "promotion";
    const days = Math.min(Math.max(parseInt(String(duration_days ?? "7")), 1), 90);

    const { rows } = await query(
      `INSERT INTO ads
        (institution_name, contact_name, contact_phone, title, description,
         type, target_screen, duration_days, budget, status, image_url, website_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11)
       RETURNING id, institution_name, title, status, created_at`,
      [
        institution_name.trim(),
        (contact_name || "").trim() || null,
        contact_phone.trim(),
        title.trim(),
        (description || "").trim() || null,
        adType,
        target_screen?.trim() || "all",
        days,
        (budget || "").trim() || null,
        image_url?.trim() || null,
        website_url?.trim() || null,
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب طلبات المعلن برقم هاتفه
router.get("/ads/my-requests", async (req: Request, res: Response) => {
  try {
    const phone = String(req.query.phone ?? "").trim();
    if (!phone) return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    const { rows } = await query(
      `SELECT id, institution_name, contact_name, title, description, type,
              duration_days, budget, status, admin_note,
              image_url, website_url, created_at, start_date, end_date
       FROM ads WHERE contact_phone = $1
       ORDER BY created_at DESC LIMIT 20`,
      [phone]
    );
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── إدارة الإعلانات (الإدارة فقط) ─────────────────────────────

// جلب كل الإعلانات
router.get("/admin/ads", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    await expireOldAds();
    const { rows } = await query(
      `SELECT a.*, u.name AS approved_by_name
       FROM ads a
       LEFT JOIN users u ON u.id = a.approved_by
       ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
         a.created_at DESC`
    );
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// إضافة إعلان مباشرة (الإدارة)
router.post("/admin/ads", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const {
      institution_name, contact_name, contact_phone, title,
      description, type, target_screen, duration_days, budget, priority,
    } = req.body as any;
    if (!institution_name?.trim() || !title?.trim()) {
      return res.status(400).json({ error: "اسم المؤسسة والعنوان مطلوبان" });
    }
    const days = Math.min(Math.max(parseInt(String(duration_days ?? "7")), 1), 365);
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const { rows } = await query(
      `INSERT INTO ads
        (institution_name, contact_name, contact_phone, title, description,
         type, target_screen, duration_days, budget, status,
         start_date, end_date, priority, approved_at, approved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',
               NOW(),$10,$11,NOW(),$12)
       RETURNING *`,
      [
        institution_name.trim(),
        (contact_name || "").trim() || null,
        (contact_phone || "").trim() || null,
        title.trim(),
        (description || "").trim() || null,
        type?.trim() || "promotion",
        target_screen?.trim() || "all",
        days,
        (budget || "").trim() || null,
        endDate,
        parseInt(String(priority ?? "0")),
        me.id,
      ]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تحديث حالة إعلان (قبول / رفض / إنهاء)
router.put("/admin/ads/:id/status", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { status, admin_note, duration_days } = req.body as {
      status: "active" | "rejected" | "expired"; admin_note?: string; duration_days?: number;
    };
    const allowed = ["active", "rejected", "expired"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });

    let extraFields = "";
    let params: any[] = [status, admin_note || null, id];

    if (status === "active") {
      const days = Math.min(Math.max(parseInt(String(duration_days ?? "7")), 1), 365);
      const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      extraFields = `, start_date=NOW(), end_date=$4, duration_days=$5, approved_at=NOW(), approved_by=$6`;
      params = [status, admin_note || null, id, endDate, days, me.id];
    }

    const { rows } = await query(
      `UPDATE ads SET status=$1, admin_note=$2${extraFields}
       WHERE id=$3 RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: "الإعلان غير موجود" });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// حذف إعلان
router.delete("/admin/ads/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") {
      return res.status(403).json({ error: "مديرون فقط" });
    }
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    await query(`DELETE FROM ads WHERE id=$1`, [id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Firebase Exchange — يحوّل Firebase UID إلى backend session token
// ══════════════════════════════════════════════════════════════════════════════
router.post("/auth/firebase-exchange", async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      idToken?: string;
      firebase_uid?: string;
      name?: string;
      email?: string;
      role?: string;
    };
    let { firebase_uid, name, email, role } = body;

    // التحقق المُفضّل: idToken عبر Firebase Admin SDK
    if (body.idToken) {
      const verified = await verifyIdToken(body.idToken);
      if (verified) {
        firebase_uid = verified.uid;
        if (!email && verified.email) email = verified.email;
        if (!name && verified.name) name = verified.name;
      } else if (!firebase_uid) {
        return res.status(401).json({ error: "Invalid Firebase ID token" });
      }
    }

    if (!firebase_uid) return res.status(400).json({ error: "firebase_uid أو idToken مطلوب" });

    // ترتيب الصلاحيات: منع تخفيض الدور
    const roleRank: Record<string, number> = { user: 0, moderator: 1, admin: 2 };
    let requestedRole = ["user", "admin", "moderator"].includes(role ?? "") ? (role as string) : "user";

    // المطور الرئيسي يحصل دائماً على صلاحية admin
    const ADMIN_EMAILS = ["almhbob.iii@gmail.com"];
    if (email && ADMIN_EMAILS.includes(email.toLowerCase())) {
      requestedRole = "admin";
    }

    // 1. البحث بـ firebase_uid
    let userRow = (await query(
      `SELECT * FROM users WHERE firebase_uid = $1`, [firebase_uid]
    )).rows[0];

    // 2. البحث بالبريد الإلكتروني الحقيقي (غير @hasahisawi.app)
    if (!userRow && email && !email.includes("@hasahisawi.app")) {
      userRow = (await query(`SELECT * FROM users WHERE email = $1`, [email])).rows[0];
    }

    // 3. البحث برقم الهاتف (مستخدمي الهاتف يُحوَّل بريدهم لـ 09...@hasahisawi.app)
    if (!userRow && email && email.includes("@hasahisawi.app")) {
      const phone = email.split("@")[0];
      if (/^\d+$/.test(phone)) {
        userRow = (await query(`SELECT * FROM users WHERE phone = $1`, [phone])).rows[0];
      }
    }

    if (userRow) {
      // ربط firebase_uid إن لم يكن مربوطاً
      if (!userRow.firebase_uid) {
        await query(`UPDATE users SET firebase_uid=$1 WHERE id=$2`, [firebase_uid, userRow.id]);
        userRow = { ...userRow, firebase_uid };
      }
      // رفع الصلاحية فقط — لا تخفيضها أبداً
      const currentRank = roleRank[userRow.role as string] ?? 0;
      const newRank = roleRank[requestedRole] ?? 0;
      if (newRank > currentRank) {
        await query(`UPDATE users SET role=$1 WHERE id=$2`, [requestedRole, userRow.id]);
        userRow = { ...userRow, role: requestedRole };
      }
    } else {
      // مستخدم Firebase جديد لم يُسجَّل من قبل — أنشئه
      const hash = await bcrypt.hash(randomBytes(16).toString("hex"), 6);
      // لا تحفظ بريد @hasahisawi.app الوهمي
      const realEmail = (email && !email.includes("@hasahisawi.app")) ? email : null;
      // استخرج رقم الهاتف من البريد الوهمي إن وُجد
      const phoneFromEmail = (email && email.includes("@hasahisawi.app"))
        ? email.split("@")[0]
        : null;
      const realPhone = (phoneFromEmail && /^\d{9,15}$/.test(phoneFromEmail)) ? phoneFromEmail : null;
      userRow = (await query(
        `INSERT INTO users (firebase_uid, name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [firebase_uid, name || "مستخدم", realEmail, realPhone, hash, requestedRole]
      )).rows[0];
    }

    // إصدار session token جديد
    const sessionToken = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1, $2)`, [userRow.id, sessionToken]);

    return res.json({ user: safeUserPayload(userRow), token: sessionToken });
  } catch (err) {
    logger.error({ err: err }, "firebase-exchange error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// الأحياء والقرى — Neighborhoods Admin CRUD
// ══════════════════════════════════════════════════════════════════════════════
router.get("/admin/neighborhoods", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const { rows } = await query(
      `SELECT key, value FROM admin_settings WHERE key LIKE 'nbr_%' ORDER BY key`
    );
    const items = rows.map(r => JSON.parse(r.value));
    return res.json(items);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/neighborhoods", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const { label, type } = req.body as { label: string; type: "neighborhood" | "village" };
    if (!label?.trim()) return res.status(400).json({ error: "الاسم مطلوب" });
    const key = `nbr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const item = { label: label.trim(), type: type || "neighborhood", key };
    await query(
      `INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2`,
      [key, JSON.stringify(item)]
    );
    return res.json(item);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// حفظ قائمة أحياء دفعة واحدة (seed / استعادة الافتراضيات)
router.post("/admin/neighborhoods/seed", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });

    const { items, replace } = req.body as {
      items: { label: string; type: "neighborhood" | "village" }[];
      replace?: boolean;
    };

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: "قائمة فارغة" });

    // إذا طُلب الاستبدال الكامل: احذف القديمة أولاً
    if (replace) {
      await query(`DELETE FROM admin_settings WHERE key LIKE 'nbr_%'`);
    }

    const saved: { label: string; type: string; key: string }[] = [];
    const now = Date.now();
    for (let i = 0; i < items.length; i++) {
      const { label, type } = items[i];
      if (!label?.trim()) continue;
      const key = `nbr_${now + i}_${Math.random().toString(36).slice(2, 7)}`;
      const item = { label: label.trim(), type: type || "neighborhood", key };
      await query(
        `INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2`,
        [key, JSON.stringify(item)]
      );
      saved.push(item);
    }

    return res.json({ inserted: saved.length, items: saved });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/neighborhoods/:key", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const key = req.params["key"] as string;
    if (!key.startsWith("nbr_")) return res.status(400).json({ error: "مفتاح غير صالح" });
    const { label, type } = req.body as { label: string; type: "neighborhood" | "village" };
    if (!label?.trim()) return res.status(400).json({ error: "الاسم مطلوب" });
    const item = { label: label.trim(), type: type || "neighborhood", key };
    await query(
      `UPDATE admin_settings SET value=$1 WHERE key=$2`,
      [JSON.stringify(item), key]
    );
    return res.json(item);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/neighborhoods/:key", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const key = req.params["key"] as string;
    if (!key.startsWith("nbr_")) return res.status(400).json({ error: "مفتاح غير صالح" });
    await query(`DELETE FROM admin_settings WHERE key=$1`, [key]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// إعدادات الذكاء الاصطناعي
// ══════════════════════════════════════════════════════════════════════════════
router.get("/admin/ai-settings", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const { rows } = await query(
      `SELECT key, value FROM admin_settings WHERE key IN ('ai_api_key','ai_enabled','ai_allowed_roles','ai_system_prompt')`
    );
    const result: Record<string, string> = {};
    rows.forEach(r => { result[r.key] = r.value; });
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/ai-settings", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const { ai_api_key, ai_enabled, ai_allowed_roles, ai_system_prompt } = req.body;
    const entries: [string, string][] = [];
    if (ai_api_key !== undefined) entries.push(["ai_api_key", ai_api_key]);
    if (ai_enabled !== undefined) entries.push(["ai_enabled", String(ai_enabled)]);
    if (ai_allowed_roles !== undefined) entries.push(["ai_allowed_roles", ai_allowed_roles]);
    if (ai_system_prompt !== undefined) entries.push(["ai_system_prompt", ai_system_prompt]);
    for (const [k, v] of entries) {
      await query(
        `INSERT INTO admin_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`,
        [k, v]
      );
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── تتبع حالة الـ quota في الذاكرة ─────────────────────────────
// كل مفتاح له timestamp انتهاء الحظر (نفترض ساعة كاملة عند 429)
const _quotaBlockUntil: Map<string, number> = new Map();
const QUOTA_BLOCK_MS = 60 * 60 * 1000; // ساعة واحدة

function isKeyBlocked(key: string): boolean {
  const until = _quotaBlockUntil.get(key);
  if (!until) return false;
  if (Date.now() < until) return true;
  _quotaBlockUntil.delete(key);
  return false;
}
function blockKey(key: string) {
  _quotaBlockUntil.set(key, Date.now() + QUOTA_BLOCK_MS);
}
function nextQuotaReset(): string {
  // تُحسب انطلاقاً من التوقيت UTC — Gemini يُعيد الحصة منتصف الليل UTC
  const now = new Date();
  const nextMidnight = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
  ));
  const diffH = Math.ceil((nextMidnight.getTime() - now.getTime()) / 3_600_000);
  return diffH <= 1 ? "بعد أقل من ساعة" : `بعد نحو ${diffH} ساعة`;
}

// ردود محلية للأسئلة الشائعة عند انتهاء الحصة
function localFallback(msg: string): string | null {
  const m = msg.toLowerCase().trim();
  if (/مرحب|هلا|صباح|مساء|السلام/.test(m))
    return "وعليكم السلام! أنا مساعد حصاحيصاوي. خدمة الذكاء الاصطناعي الكاملة ستعود قريباً. هل يمكنني مساعدتك بسؤال آخر؟";
  if (/أوقات.*صلاة|صلاة|آذان/.test(m))
    return "يمكنك الاطلاع على أوقات الصلاة من قسم (الآذان) في التطبيق — يُحدَّث يومياً بدقة.";
  if (/وظيف|عمل|توظيف/.test(m))
    return "للاطلاع على فرص العمل المتاحة، توجّه إلى قسم (الوظائف) من القائمة الجانبية في التطبيق.";
  if (/طبيب|مستشفى|صحة|علاج/.test(m))
    return "للعثور على أطباء ومختصين في الحصاحيصا، استخدم قسم (الطب) من شريط التبويب السفلي.";
  if (/مفقود|مجهول|ضائع/.test(m))
    return "للإبلاغ عن شخص مفقود أو البحث في قائمة المفقودين، توجّه لقسم (المفقودون) من القائمة الجانبية.";
  if (/نقل|موصلة|حافلة|ميكروباص/.test(m))
    return "لمعرفة خطوط النقل والأسعار في الحصاحيصا، استخدم قسم (النقل) من القائمة الجانبية.";
  if (/خبر|أخبار|جديد/.test(m))
    return "آخر أخبار الحصاحيصا متاحة في قسم (الأخبار) بالصفحة الرئيسية للتطبيق.";
  if (/شكو|مشكل|بلاغ|report/.test(m))
    return "لتقديم بلاغ يمكنك استخدام قسم (البلاغات) من القائمة الجانبية، أو التواصل عبر واتساب الدعم.";
  return null;
}

// حالة الذكاء الاصطناعي (مع معلومات الحصة)
router.get("/ai/status", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT value FROM admin_settings WHERE key='ai_enabled'`
    );
    const dbEnabled = rows[0]?.value === "true";
    const hasKey = !!process.env["GOOGLE_API_KEY"] || !!process.env["GROQ_API_KEY"];
    const enabled = dbEnabled || hasKey;

    // فحص ما إذا كانت كل المفاتيح محجوبة
    const envKey1 = process.env["GOOGLE_API_KEY"] || "";
    const envKey2 = process.env["GOOGLE_API_KEY_2"] || "";
    const allBlocked = enabled && [envKey1, envKey2].filter(Boolean).every(k => isKeyBlocked(k));

    return res.json({
      enabled,
      quotaExceeded: allBlocked,
      resetIn: allBlocked ? nextQuotaReset() : null,
    });
  } catch {
    return res.json({ enabled: !!process.env["GOOGLE_API_KEY"], quotaExceeded: false, resetIn: null });
  }
});

// دعم الذكاء الاصطناعي (Groq primary + Gemini fallback + local fallback)
router.post("/ai/chat", async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body as {
      message: string;
      history?: { role: string; parts: { text: string }[] }[];
    };
    if (!message?.trim()) return res.status(400).json({ error: "الرسالة فارغة" });

    const settingsRows = (await query(
      `SELECT key, value FROM admin_settings WHERE key IN ('ai_api_key','ai_enabled','ai_system_prompt')`
    )).rows;
    const settings: Record<string, string> = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    const groqKey    = process.env["GROQ_API_KEY"];
    const envApiKey  = process.env["GOOGLE_API_KEY"];
    const envApiKey2 = process.env["GOOGLE_API_KEY_2"];
    const dbApiKey   = settings["ai_api_key"] || null;

    const aiEnabled = settings["ai_enabled"] === "true" || !!groqKey || !!envApiKey;
    if (!aiEnabled) {
      return res.status(503).json({ error: "خدمة الذكاء الاصطناعي غير مفعّلة حالياً" });
    }

    const systemPrompt = settings["ai_system_prompt"] ||
      "أنت مساعد ذكي لتطبيق حصاحيصاوي، مخصص لخدمة أهالي مدينة الحصاحيصا في السودان. أجب باللغة العربية بأسلوب ودود ومفيد. تخصصك في: المعلومات المحلية، الخدمات المتاحة في التطبيق، والإرشاد العام.";

    // ── Groq (الأولوية: سريع ومجاني 14400/يوم) ──
    if (groqKey && !isKeyBlocked(groqKey)) {
      try {
        const groqMessages = [
          { role: "system", content: systemPrompt },
          ...(history || []).map((h: any) => ({
            role: h.role === "model" ? "assistant" : "user",
            content: h.parts?.[0]?.text || "",
          })),
          { role: "user", content: message },
        ];
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: groqMessages,
            temperature: 0.7,
            max_tokens: 1024,
          }),
        });
        if (groqRes.ok) {
          const data = await groqRes.json() as any;
          const reply = data?.choices?.[0]?.message?.content || "لم أتمكن من الإجابة.";
          logger.info("[AI] Response via Groq");
          return res.json({ reply });
        }
        const errBody = await groqRes.text();
        logger.warn({ status: groqRes.status, errBody: errBody.slice(0,150) }, "[AI] Groq error");
        if (groqRes.status === 429) blockKey(groqKey);
      } catch (e: any) { logger.warn({ err: e?.message }, "[AI] Groq fetch error"); }
    }

    // ── Gemini (احتياطي) ──
    const allGeminiKeys: string[] = [...new Set([dbApiKey, envApiKey, envApiKey2].filter(Boolean) as string[])];
    const apiKeys = allGeminiKeys.filter(k => !isKeyBlocked(k));

    if (!apiKeys.length) {
      const fallback = localFallback(message);
      if (fallback) return res.json({ reply: fallback, local: true });
      return res.status(503).json({
        error: `خدمة الذكاء الاصطناعي مؤقتاً خارج الخدمة بسبب تجاوز الحصة اليومية.\nستعود ${nextQuotaReset()} إن شاء الله.`,
        quotaExceeded: true,
        resetIn: nextQuotaReset(),
      });
    }

    const contents = [
      ...(history || []),
      { role: "user", parts: [{ text: message }] },
    ];

    const MODELS = ["gemini-2.0-flash-lite", "gemini-1.5-flash-8b", "gemini-2.0-flash"];

    const requestBody = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    });

    let lastStatus = 500;

    outer:
    for (const apiKey of apiKeys) {
      for (const model of MODELS) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody }
        );

        if (geminiRes.ok) {
          const data = await geminiRes.json() as any;
          const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
            || "لم أتمكن من الإجابة، يرجى المحاولة مجدداً.";
          return res.json({ reply });
        }

        lastStatus = geminiRes.status;
        const errBody = await geminiRes.text();
        logger.error({ model, errBody: errBody.slice(0,150) }, "Gemini error");

        if (lastStatus === 400 || lastStatus === 401 || lastStatus === 403) break;
        if (lastStatus === 429) { blockKey(apiKey); break; }
      }
      if (lastStatus !== 429) break outer;
    }

    // كل المفاتيح استُنفدت — جرّب الرد المحلي
    const fallback = localFallback(message);
    if (fallback) return res.json({ reply: fallback, local: true });

    return res.status(503).json({
      error: `خدمة الذكاء الاصطناعي مؤقتاً خارج الخدمة بسبب تجاوز الحصة اليومية.\nستعود ${nextQuotaReset()} إن شاء الله.`,
      quotaExceeded: true,
      resetIn: nextQuotaReset(),
    });
  } catch (err) {
    logger.error({ err: err }, "AI chat error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// طلبات انضمام المؤسسات — Institution Applications
// ══════════════════════════════════════════════════════

// إعدادات العقد العامة (رقم الواتساب)
router.get("/institution-applications/contract-settings", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT key, value FROM admin_settings WHERE key = 'contract_whatsapp'`
    );
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    return res.json({
      contract_whatsapp: settings["contract_whatsapp"] || "+966597083352",
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// تحميل ملف العقد الرسمي PDF
router.get("/institution-applications/contract-pdf", (_req: Request, res: Response) => {
  const { join } = require("path");
  const { createReadStream, existsSync } = require("fs");
  const pdfPath = join(__dirname, "../public/institution-contract.pdf");
  if (!existsSync(pdfPath)) {
    return res.status(404).json({ error: "ملف العقد غير متاح" });
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="institution-contract.pdf"');
  createReadStream(pdfPath).pipe(res);
  return;
});

// تقديم طلب انضمام
router.post("/institution-applications", async (req: Request, res: Response) => {
  try {
    const {
      inst_name, inst_type, inst_category, inst_description, inst_address,
      inst_neighborhood, inst_phone, inst_email, inst_website,
      inst_registration_no, inst_founded_year,
      selected_services, custom_services,
      rep_name, rep_title, rep_national_id, rep_phone, rep_email,
      rep_photo_url,
    } = req.body;

    if (!inst_name || !inst_type || !inst_category || !inst_description || !inst_address || !inst_phone) {
      return res.status(400).json({ error: "بيانات المؤسسة ناقصة" });
    }
    if (!rep_name || !rep_title || !rep_national_id || !rep_phone) {
      return res.status(400).json({ error: "بيانات الممثل ناقصة" });
    }
    const parsedServices: unknown[] = (() => {
      try { return JSON.parse(selected_services || "[]"); } catch { return []; }
    })();
    if (!Array.isArray(parsedServices) || parsedServices.length === 0) {
      return res.status(400).json({ error: "يرجى تحديد خدمة واحدة على الأقل" });
    }

    const user = await getSessionUser(req);
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || null;

    const result = await query(
      `INSERT INTO institution_applications (
        inst_name, inst_type, inst_category, inst_description, inst_address,
        inst_neighborhood, inst_phone, inst_email, inst_website,
        inst_registration_no, inst_founded_year,
        selected_services, custom_services,
        rep_name, rep_title, rep_national_id, rep_phone, rep_email,
        rep_photo_url, signed_ip, user_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING id, inst_name, status, created_at`,
      [
        inst_name, inst_type, inst_category, inst_description, inst_address,
        inst_neighborhood || null, inst_phone, inst_email || null, inst_website || null,
        inst_registration_no || null, inst_founded_year || null,
        selected_services, custom_services || null,
        rep_name, rep_title, rep_national_id, rep_phone, rep_email || null,
        rep_photo_url || null, ip, user?.id || null,
      ]
    );

    void sendPushToAdmins("🏢 طلب انضمام مؤسسة جديد", `${inst_name} — ${inst_type}`, { type: "institution_application", id: result.rows[0].id });
    return res.json({ application: result.rows[0] });
  } catch (err) {
    logger.error({ err: err }, "POST /institution-applications error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب طلب بالـ id (مع التحقق من ملكية المستخدم)
router.get("/institution-applications/:id", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const result = await query(
      `SELECT id, inst_name, inst_type, inst_category, rep_name, rep_title, rep_national_id,
              rep_phone, selected_services, signed_at, status, admin_note, commitment_version,
              rep_photo_url, signed_contract_url, signed_contract_at, user_id
       FROM institution_applications WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "لم يوجد" });
    const row = result.rows[0];
    // يحق للمستخدم الاطلاع على طلبه فقط أو للأدمن الاطلاع على الكل
    if (row.user_id && user?.id !== row.user_id && !(await isAdminRequest(req))) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// رفع العقد الموقع — للمؤسسة بعد الموافقة
router.patch("/institution-applications/:id/signed-contract", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { signed_contract_url } = req.body;
    if (!signed_contract_url || typeof signed_contract_url !== "string" || !signed_contract_url.startsWith("https://")) {
      return res.status(400).json({ error: "رابط العقد الموقع غير صالح" });
    }
    // تحقق: الطلب للمستخدم نفسه وحالته approved
    const check = await query(
      `SELECT id, user_id, status FROM institution_applications WHERE id = $1`,
      [req.params.id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
    if (check.rows[0].user_id !== user.id) return res.status(403).json({ error: "غير مصرح" });
    if (check.rows[0].status !== "approved") {
      return res.status(400).json({ error: "لا يمكن رفع العقد الموقع إلا بعد الموافقة على الطلب" });
    }
    await query(
      `UPDATE institution_applications SET signed_contract_url=$1, signed_contract_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [signed_contract_url, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err: err }, "PATCH /institution-applications/:id/signed-contract error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب طلبات المستخدم
router.get("/institution-applications/mine/list", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.json([]);
    const result = await query(
      `SELECT id, inst_name, inst_type, status, created_at FROM institution_applications WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب كل الطلبات — للأدمن
router.get("/admin/institution-applications", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const result = await query(
      `SELECT * FROM institution_applications ORDER BY created_at DESC`
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// تحديث حالة الطلب — للأدمن
router.patch("/admin/institution-applications/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { status, admin_note } = req.body;
    const allowed = ["pending", "under_review", "approved", "rejected", "suspended"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const reviewer = await getSessionUser(req);
    await query(
      `UPDATE institution_applications SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW() WHERE id=$4`,
      [status, admin_note || null, reviewer?.id || null, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// بلاغات المواطنين — Citizen Reports
// ══════════════════════════════════════════════════════

// إرسال بلاغ جديد
router.post("/reports", async (req: Request, res: Response) => {
  try {
    const {
      agency_id, agency_name, agency_color, issue, description,
      location, reporter_name, phone, urgent,
      image_url, location_lat, location_lng,
    } = req.body;
    if (!agency_id || !agency_name || !issue || !location || !reporter_name || !phone) {
      return res.status(400).json({ error: "بيانات ناقصة" });
    }
    const user = await getSessionUser(req);
    const result = await query(
      `INSERT INTO citizen_reports
         (agency_id, agency_name, agency_color, issue, description,
          location, reporter_name, phone, urgent, user_id,
          image_url, location_lat, location_lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        agency_id, agency_name, agency_color || "#27AE68",
        issue, description || null, location, reporter_name, phone,
        !!urgent, user?.id || null,
        image_url || null,
        location_lat != null ? Number(location_lat) : null,
        location_lng != null ? Number(location_lng) : null,
      ]
    );
    return res.json({ report: result.rows[0] });
  } catch (err) {
    logger.error({ err: err }, "POST /reports error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب البلاغات — للمستخدم المسجّل أو بالهاتف
router.get("/reports", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const phone = req.query.phone as string | undefined;
    let rows;
    if (user) {
      const r = await query(
        `SELECT * FROM citizen_reports WHERE user_id = $1 ORDER BY created_at DESC`,
        [user.id]
      );
      rows = r.rows;
    } else if (phone) {
      const r = await query(
        `SELECT * FROM citizen_reports WHERE phone = $1 ORDER BY created_at DESC`,
        [phone]
      );
      rows = r.rows;
    } else {
      return res.json([]);
    }
    return res.json(rows);
  } catch (err) {
    logger.error({ err: err }, "GET /reports error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تحديث حالة البلاغ — للأدمن فقط
router.patch("/reports/:id/status", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.body;
    const allowed = ["pending", "received", "inProgress", "resolved"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    await query(
      `UPDATE citizen_reports SET status=$1, updated_at=NOW() WHERE id=$2`,
      [status, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب كل البلاغات — للأدمن
router.get("/admin/reports", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const result = await query(`SELECT * FROM citizen_reports ORDER BY created_at DESC`);
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/reports/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM citizen_reports WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/admin/reports/:id/status", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.body;
    const allowed = ["pending", "received", "inProgress", "resolved", "dismissed"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const r = await query(
      `UPDATE citizen_reports SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(r.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// مقترحات وشكاوى — Feedback
// ══════════════════════════════════════════════════════

// إرسال مقترح أو شكوى
router.post("/feedback", async (req: Request, res: Response) => {
  try {
    const { type, title, body, sender_name, phone, category } = req.body;
    if (!type || !title || !body || !sender_name) {
      return res.status(400).json({ error: "بيانات ناقصة" });
    }
    const allowedTypes = ["suggestion", "complaint", "general"];
    if (!allowedTypes.includes(type)) return res.status(400).json({ error: "نوع غير صالح" });
    const user = await getSessionUser(req);
    const result = await query(
      `INSERT INTO feedback (type, title, body, sender_name, phone, category, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [type, title, body, sender_name, phone || null, category || "عام", user?.id || null]
    );
    return res.json({ feedback: result.rows[0] });
  } catch (err) {
    logger.error({ err: err }, "POST /feedback error");
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب مقترحات المستخدم
router.get("/feedback/mine", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const phone = req.query.phone as string | undefined;
    let rows;
    if (user) {
      const r = await query(
        `SELECT * FROM feedback WHERE user_id = $1 ORDER BY created_at DESC`,
        [user.id]
      );
      rows = r.rows;
    } else if (phone) {
      const r = await query(
        `SELECT * FROM feedback WHERE phone = $1 ORDER BY created_at DESC`,
        [phone]
      );
      rows = r.rows;
    } else {
      return res.json([]);
    }
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// جلب كل المقترحات — للأدمن
router.get("/admin/feedback", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const result = await query(`SELECT * FROM feedback ORDER BY created_at DESC`);
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// رد الأدمن على مقترح
router.patch("/admin/feedback/:id/reply", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { reply, status } = req.body;
    await query(
      `UPDATE feedback SET admin_reply=$1, status=COALESCE($2,status) WHERE id=$3`,
      [reply, status || "replied", req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ── بحث شامل ─────────────────────────────────────────────────────────────────
router.get("/search", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || "").trim();
    if (!q || q.length < 2) return res.json({ users: [], posts: [], orgs: [], communities: [] });

    const like = `%${q}%`;

    const [usersR, postsR, orgsR, commR] = await Promise.all([
      query(
        `SELECT id, name, role, avatar_url, created_at FROM users
         WHERE (name ILIKE $1 OR phone ILIKE $1) AND role != 'guest' LIMIT 15`,
        [like]
      ),
      query(
        `SELECT p.id, p.content, p.image_url, p.created_at, u.name AS user_name, u.avatar_url AS user_avatar,
                (SELECT COUNT(*) FROM social_likes WHERE post_id=p.id)::int AS likes_count
         FROM social_posts p JOIN users u ON u.id=p.author_id
         WHERE p.content ILIKE $1 LIMIT 15`,
        [like]
      ),
      query(
        `SELECT id, name, type, full_description, contact_phone, email, is_verified FROM organizations
         WHERE name ILIKE $1 OR full_description ILIKE $1 OR type ILIKE $1 LIMIT 10`,
        [like]
      ),
      query(
        `SELECT id, name, category, description, neighborhood, contact_phone FROM communities
         WHERE name ILIKE $1 OR description ILIKE $1 OR neighborhood ILIKE $1 LIMIT 10`,
        [like]
      ),
    ]);

    return res.json({
      users: usersR.rows,
      posts: postsR.rows,
      orgs: orgsR.rows,
      communities: commR.rows,
    });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── ملف المستخدم العام ────────────────────────────────────────────────────────
router.get("/users/:id/profile", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userR = await query(
      `SELECT id, name, role, avatar_url, created_at, bio FROM users WHERE id=$1`,
      [id]
    );
    if (!userR.rows.length) return res.status(404).json({ error: "المستخدم غير موجود" });

    const user = userR.rows[0];

    const [postsR, reportsR] = await Promise.all([
      query(`SELECT COUNT(*)::int AS cnt FROM social_posts WHERE author_id=$1`, [id]),
      query(`SELECT COUNT(*)::int AS cnt FROM citizen_reports WHERE user_id=$1`, [id]),
    ]);

    return res.json({
      ...user,
      posts_count: postsR.rows[0]?.cnt ?? 0,
      reports_count: reportsR.rows[0]?.cnt ?? 0,
    });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── تحديث ملف المستخدم (bio) ─────────────────────────────────────────────────
router.patch("/users/me/bio", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const { bio } = req.body;
    await query(`UPDATE users SET bio=$1 WHERE id=$2`, [bio ?? "", me.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ── استعادة كلمة المرور ───────────────────────────────────────────────────────
// تغيير كلمة المرور — يتطلب reset_token صادراً من verify-reset-otp
router.post("/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
  try {
    const { reset_token, new_password } = req.body;
    if (!reset_token || !new_password) return res.status(400).json({ error: "البيانات ناقصة" });
    if (new_password.length < 6)   return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    if (new_password.length > 128) return res.status(400).json({ error: "كلمة المرور طويلة جداً" });

    // التحقق من صلاحية رمز الإعادة
    const tokenR = await query(
      `SELECT id, identifier FROM password_reset_tokens WHERE token=$1 AND used=FALSE AND expires_at > NOW()`,
      [reset_token]
    );
    if (!tokenR.rows.length) {
      return res.status(400).json({ error: "رمز الإعادة منتهي أو غير صالح. أعد العملية من البداية." });
    }

    const { id: tokenId, identifier } = tokenR.rows[0];
    const isEmail = identifier.includes("@");
    const userR = isEmail
      ? await query(`SELECT id FROM users WHERE email=$1`, [identifier])
      : await query(`SELECT id FROM users WHERE phone=$1`, [identifier]);
    if (!userR.rows.length) return res.status(404).json({ error: "الحساب غير موجود" });

    const hashed = await bcrypt.hash(new_password, 10);
    await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hashed, userR.rows[0].id]);
    await query(`UPDATE password_reset_tokens SET used=TRUE WHERE id=$1`, [tokenId]);

    return res.json({ ok: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── مزامنة كلمة المرور بعد إعادة تعيينها في Firebase ────────────────────────
// يُستدعى من التطبيق بعد تسجيل الدخول الناجح عبر Firebase بكلمة المرور الجديدة
router.post("/auth/sync-firebase-password", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, new_password, firebase_token } = req.body;
    if (!email || !new_password || !firebase_token)
      return res.status(400).json({ error: "البيانات ناقصة" });
    if (new_password.length < 6)
      return res.status(400).json({ error: "كلمة المرور قصيرة جداً" });
    if (new_password.length > 128)
      return res.status(400).json({ error: "كلمة المرور طويلة جداً" });

    // التحقق من رمز Firebase
    const { getAuth } = await import("firebase-admin/auth").catch(() => ({ getAuth: null })) as any;
    if (!getAuth) return res.status(501).json({ error: "Firebase Admin غير مُهيَّأ" });
    const decoded = await getAuth().verifyIdToken(firebase_token);
    if (decoded.email?.toLowerCase() !== email.trim().toLowerCase())
      return res.status(403).json({ error: "الرمز لا يتطابق مع البريد الإلكتروني" });

    const userR = await query(`SELECT id FROM users WHERE email=$1`, [email.trim().toLowerCase()]);
    if (!userR.rows.length) return res.status(404).json({ error: "الحساب غير موجود في قاعدة البيانات" });

    const hashed = await bcrypt.hash(new_password, 10);
    await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hashed, userR.rows[0].id]);
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[sync-firebase-password]");
    return res.status(500).json({ error: "Server error" });
  }
});

// ── تحقق من وجود رقم الهاتف أو البريد الإلكتروني ────────────────────────────
router.post("/auth/check-phone", authLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, email, identifier } = req.body;
    const raw = (identifier || phone || email || "").trim();
    if (!raw || raw.length > 200) return res.status(400).json({ error: "أدخل رقم الهاتف أو البريد الإلكتروني" });

    const isEmail = raw.includes("@");
    if (isEmail) {
      // Basic email format check — prevents SQL-adjacent shenanigans and saves a DB hit
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))
        return res.status(400).json({ error: "البريد الإلكتروني غير صالح" });
    } else {
      // Phone: digits, +, spaces only
      if (!/^\+?[\d\s\-]{7,20}$/.test(raw))
        return res.status(400).json({ error: "رقم الهاتف غير صالح" });
    }

    const lookup = isEmail ? raw.toLowerCase() : raw;
    const userR  = isEmail
      ? await query(`SELECT id, name FROM users WHERE email=$1`, [lookup])
      : await query(`SELECT id, name FROM users WHERE phone=$1`, [lookup]);

    // Don't reveal whether account exists to unauthenticated callers beyond password-reset flow
    if (!userR.rows.length) return res.json({ exists: false });
    return res.json({ exists: true, name: userR.rows[0].name });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// OTP — إرسال وتحقق رمز التحقق
// ══════════════════════════════════════════════════════════════════════════════

function generateOTP(): string {
  // Use crypto.randomBytes for cryptographically secure 6-digit OTP
  const buf = require("crypto").randomBytes(4);
  const num = buf.readUInt32BE(0) % 900000 + 100000;
  return num.toString();
}

// Returns delivery channel ("sms"|"email") if sent, "none" if no gateway configured.
async function sendOTPDelivery(identifier: string, code: string, type: string): Promise<"sms" | "email" | "none"> {
  const isEmail = identifier.includes("@");
  logger.info({ type, channel: isEmail ? "email" : "sms", identifier }, "[OTP] code generated — expires 10 min");

  if (!isEmail) {
    // ── WhatsApp via Meta Cloud API (مجاني 1000/شهر) ──
    const waToken   = process.env.WHATSAPP_ACCESS_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (waToken && waPhoneId) {
      try {
        const templateName = process.env.WHATSAPP_TEMPLATE_NAME || "hasahisawi_otp";
        const resp = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: identifier,
            type: "template",
            template: {
              name: templateName,
              language: { code: "ar" },
              components: [{
                type: "body",
                parameters: [{ type: "text", text: code }],
              }],
            },
          }),
        });
        if (resp.ok) {
          logger.info("[OTP] WhatsApp sent via Meta Cloud API");
          return "sms";
        }
        logger.warn({ status: resp.status, body: await resp.text() }, "[OTP] WhatsApp send failed");
      } catch (e: any) { logger.warn({ err: e?.message }, "[OTP] WhatsApp error"); }
    }

    const smsKey  = process.env.AFRICASTALKING_API_KEY;
    const smsUser = process.env.AFRICASTALKING_USERNAME;
    if (smsKey && smsUser) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { default: AfricasTalking } = await (Function('return import("africastalking")')().catch(() => ({ default: null }))) as any;
        if (AfricasTalking) {
          const at = AfricasTalking({ apiKey: smsKey, username: smsUser });
          await at.SMS.send({ to: [identifier], message: `رمز تحقق حصاحيصاوي: ${code}\nصالح لـ 10 دقائق. لا تشاركه مع أحد.`, from: "Hasahisawi" });
          logger.info("[OTP] SMS sent via Africa's Talking");
          return "sms";
        }
      } catch (e: any) { logger.warn({ err: e?.message }, "[OTP] SMS send failed"); }
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom  = process.env.TWILIO_PHONE_NUMBER;
    if (twilioSid && twilioToken && twilioFrom) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const twilio = await (Function('return import("twilio")')().catch(() => null)) as any;
        if (twilio) {
          const client = twilio(twilioSid, twilioToken);
          await client.messages.create({ body: `رمز تحقق حصاحيصاوي: ${code}\nصالح لـ 10 دقائق. لا تشاركه مع أحد.`, from: twilioFrom, to: identifier });
          logger.info("[OTP] SMS sent via Twilio");
          return "sms";
        }
      } catch (e: any) { logger.warn({ err: e?.message }, "[OTP] Twilio SMS failed"); }
    }

    logger.warn({ code, identifier, type }, "[OTP] No SMS gateway configured — code logged for admin");
    return "none";
  }

  // Email via Brevo
  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey) {
    try {
      const senderEmail = process.env.EMAIL_FROM ?? "almhbob.iii@gmail.com";
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: { name: "حصاحيصاوي", email: senderEmail },
          to: [{ email: identifier }],
          subject: `رمز تحقق حصاحيصاوي: ${code}`,
          htmlContent: `<div dir="rtl" style="font-family:Arial;font-size:16px;max-width:400px;margin:auto"><h2 style="color:#1e3a5f">حصاحيصاوي</h2><p>رمز التحقق الخاص بك:</p><h1 style="letter-spacing:10px;color:#16a34a;font-size:36px">${code}</h1><p style="color:#666">صالح لمدة 10 دقائق فقط. لا تشاركه مع أحد.</p></div>`,
        }),
      });
      if (resp.ok) {
        logger.info("[OTP] Email sent via Brevo");
        return "email";
      }
      logger.warn({ status: resp.status, body: await resp.text() }, "[OTP] Brevo send failed");
    } catch (e: any) { logger.warn({ err: e?.message }, "[OTP] Brevo error"); }
  }

  // Email via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const emailFrom = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `حصاحيصاوي <${emailFrom}>`,
          to: [identifier],
          subject: `رمز تحقق حصاحيصاوي: ${code}`,
          html: `<div dir="rtl" style="font-family:Arial;font-size:16px;max-width:400px;margin:auto"><h2 style="color:#1e3a5f">حصاحيصاوي</h2><p>رمز التحقق الخاص بك:</p><h1 style="letter-spacing:10px;color:#16a34a;font-size:36px">${code}</h1><p style="color:#666">صالح لمدة 10 دقائق فقط. لا تشاركه مع أحد.</p></div>`,
        }),
      });
      if (resp.ok) {
        logger.info("[OTP] Email sent via Resend");
        return "email";
      }
      logger.warn({ status: resp.status, body: await resp.text() }, "[OTP] Resend send failed");
    } catch (e: any) { logger.warn({ err: e?.message }, "[OTP] Resend error"); }
  }

  // Email via SMTP
  if (process.env.SMTP_HOST) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodemailer = await (Function('return import("nodemailer")')().catch(() => null)) as any;
      if (nodemailer) {
        const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
        await t.sendMail({ from: `"حصاحيصاوي" <${process.env.SMTP_USER}>`, to: identifier, subject: `رمز تحقق حصاحيصاوي: ${code}`, text: `رمز التحقق الخاص بك هو: ${code}\n\nصالح لمدة 10 دقائق فقط. لا تشاركه مع أحد.`, html: `<div dir="rtl" style="font-family:Arial;font-size:16px"><p>رمز التحقق الخاص بك:</p><h1 style="letter-spacing:8px;color:#16a34a">${code}</h1><p style="color:#666">صالح لمدة 10 دقائق فقط.</p></div>` });
        logger.info("[OTP] Email sent via SMTP");
        return "email";
      }
    } catch (e: any) { logger.warn({ err: e?.message }, "[OTP] Email send failed"); }
  }

  logger.warn({ identifier, type }, "[OTP] No email gateway configured");
  return "none";
}

// POST /api/auth/send-otp
router.post("/auth/send-otp", authLimiter, async (req: Request, res: Response) => {
  try {
    const { phone_or_email, type = "register" } = req.body as { phone_or_email?: string; type?: string };
    if (!phone_or_email?.trim()) return res.status(400).json({ error: "يرجى إدخال رقم الهاتف أو البريد الإلكتروني" });

    const identifier = phone_or_email.trim().toLowerCase();

    // التحقق من معدل الإرسال (حد 3 رسائل كل 10 دقائق)
    const rateLimitR = await query(
      `SELECT COUNT(*) AS cnt FROM otp_codes WHERE phone_or_email=$1 AND created_at > NOW() - INTERVAL '10 minutes'`,
      [identifier]
    );
    if (parseInt(rateLimitR.rows[0].cnt) >= 3) {
      return res.status(429).json({ error: "تجاوزت الحد المسموح. أعد المحاولة بعد 10 دقائق." });
    }

    // إلغاء أي رموز سابقة غير مستخدمة
    await query(`UPDATE otp_codes SET used=TRUE WHERE phone_or_email=$1 AND type=$2 AND used=FALSE`, [identifier, type]);

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      `INSERT INTO otp_codes (phone_or_email, code, type, expires_at) VALUES ($1,$2,$3,$4)`,
      [identifier, code, type, expiresAt]
    );

    const sentVia = await sendOTPDelivery(identifier, code, type);
    const delivered = sentVia !== "none";

    // لاستعادة كلمة المرور: يجب أن يصل الرمز فعلاً — أعد خطأ صريحاً إن لم يُرسَل
    if (!delivered && type === "password_reset") {
      const isEmailId = identifier.includes("@");
      const msg = isEmailId
        ? "خدمة البريد الإلكتروني غير مُهيَّأة. استخدم رابط Firebase لإعادة التعيين عبر التطبيق."
        : "خدمة الرسائل القصيرة غير مُهيَّأة حالياً. يرجى التواصل مع الدعم أو استخدام بريدك الإلكتروني إن كان مسجّلاً.";
      return res.status(503).json({ error: msg, no_delivery: true });
    }

    const exposeOtp = !delivered || process.env.SHOW_DEV_OTP === "true";
    return res.json({ sent: true, delivered, sent_via: sentVia, expires_in: 600, channel: identifier.includes("@") ? "email" : "sms", ...(exposeOtp ? { dev_otp: code } : {}) });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[send-otp]");
    return res.status(500).json({ error: "فشل إرسال رمز التحقق" });
  }
});

// POST /api/auth/send-registration-otp — إرسال رمز تحقق للتسجيل (مع sent_via وdev_otp)
router.post("/auth/send-registration-otp", authLimiter, async (req: Request, res: Response) => {
  try {
    const { phone_or_email } = req.body as { phone_or_email?: string };
    if (!phone_or_email?.trim()) return res.status(400).json({ error: "يرجى إدخال رقم الهاتف أو البريد الإلكتروني" });

    const raw = phone_or_email.trim();
    if (raw.length > 200) return res.status(400).json({ error: "أدخل رقم الهاتف أو البريد الإلكتروني" });

    const isEmail = raw.includes("@");
    if (isEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw))
        return res.status(400).json({ error: "البريد الإلكتروني غير صالح" });
    } else {
      if (!/^\+?[\d\s\-]{7,20}$/.test(raw))
        return res.status(400).json({ error: "رقم الهاتف غير صالح" });
    }

    const identifier = isEmail ? raw.toLowerCase() : raw;

    const rateLimitR = await query(
      `SELECT COUNT(*) AS cnt FROM otp_codes WHERE phone_or_email=$1 AND created_at > NOW() - INTERVAL '15 minutes'`,
      [identifier]
    );
    if (parseInt(rateLimitR.rows[0].cnt) >= 3) {
      return res.status(429).json({ error: "تجاوزت الحد المسموح. أعد المحاولة بعد 15 دقيقة." });
    }

    await query(`UPDATE otp_codes SET used=TRUE WHERE phone_or_email=$1 AND type='register' AND used=FALSE`, [identifier]);

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      `INSERT INTO otp_codes (phone_or_email, code, type, expires_at) VALUES ($1,$2,$3,$4)`,
      [identifier, code, "register", expiresAt]
    );

    const sentVia = await sendOTPDelivery(identifier, code, "register");
    const exposeOtp = sentVia === "none" || process.env.SHOW_DEV_OTP === "true";

    logger.info({ identifier, sentVia, exposeOtp }, "[send-registration-otp]");
    return res.json({ success: true, sent_via: sentVia, ...(exposeOtp ? { dev_otp: code } : {}) });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[send-registration-otp]");
    return res.status(500).json({ error: "فشل إرسال رمز التحقق" });
  }
});

// POST /api/auth/verify-reset-otp — التحقق من OTP لاستعادة كلمة المرور + إصدار reset_token
router.post("/auth/verify-reset-otp", authLimiter, async (req: Request, res: Response) => {
  try {
    const { phone_or_email, code } = req.body as { phone_or_email?: string; code?: string };
    if (!phone_or_email?.trim() || !code?.trim()) return res.status(400).json({ error: "الحقول مطلوبة" });

    const identifier = phone_or_email.trim().toLowerCase();
    const cleanCode  = code.trim();

    const otpR = await query(
      `SELECT id, code, attempts FROM otp_codes
       WHERE phone_or_email=$1 AND type='password_reset' AND used=FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [identifier]
    );

    if (!otpR.rows.length) return res.status(400).json({ error: "رمز التحقق منتهي الصلاحية أو غير موجود. أعد الإرسال." });

    const otp = otpR.rows[0];
    if (otp.attempts >= 5) {
      await query(`UPDATE otp_codes SET used=TRUE WHERE id=$1`, [otp.id]);
      return res.status(400).json({ error: "تجاوزت عدد المحاولات. أعد إرسال رمز جديد." });
    }
    if (otp.code !== cleanCode) {
      await query(`UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1`, [otp.id]);
      const remaining = 4 - otp.attempts;
      return res.status(400).json({ error: `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}` });
    }

    // رمز صحيح — إلغاؤه وإصدار reset_token صالح 15 دقيقة
    await query(`UPDATE otp_codes SET used=TRUE WHERE id=$1`, [otp.id]);

    const { randomBytes } = await import("crypto");
    const resetToken = randomBytes(48).toString("hex");
    const expiresAt  = new Date(Date.now() + 15 * 60 * 1000);

    // حذف الرموز القديمة لنفس المستخدم
    await query(`UPDATE password_reset_tokens SET used=TRUE WHERE identifier=$1 AND used=FALSE`, [identifier]);
    await query(
      `INSERT INTO password_reset_tokens (identifier, token, expires_at) VALUES ($1,$2,$3)`,
      [identifier, resetToken, expiresAt]
    );

    return res.json({ verified: true, reset_token: resetToken, expires_in: 900 });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[verify-reset-otp]");
    return res.status(500).json({ error: "حدث خطأ في التحقق" });
  }
});

// POST /api/auth/verify-otp
router.post("/auth/verify-otp", async (req: Request, res: Response) => {
  try {
    const { phone_or_email, code, type = "register" } = req.body as { phone_or_email?: string; code?: string; type?: string };
    if (!phone_or_email?.trim() || !code?.trim()) return res.status(400).json({ error: "الحقول مطلوبة" });

    const identifier = phone_or_email.trim().toLowerCase();
    const cleanCode = code.trim();

    const otpR = await query(
      `SELECT id, code, attempts FROM otp_codes
       WHERE phone_or_email=$1 AND type=$2 AND used=FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [identifier, type]
    );

    if (!otpR.rows.length) {
      return res.status(400).json({ error: "رمز التحقق منتهي الصلاحية أو غير موجود. أعد الإرسال." });
    }

    const otp = otpR.rows[0];

    if (otp.attempts >= 5) {
      await query(`UPDATE otp_codes SET used=TRUE WHERE id=$1`, [otp.id]);
      return res.status(400).json({ error: "تجاوزت عدد المحاولات. أعد إرسال رمز جديد." });
    }

    if (otp.code !== cleanCode) {
      await query(`UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1`, [otp.id]);
      const remaining = 4 - otp.attempts;
      return res.status(400).json({ error: `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}` });
    }

    // رمز صحيح — إلغاؤه وتحديد الهاتف كمُتحقَّق منه
    await query(`UPDATE otp_codes SET used=TRUE WHERE id=$1`, [otp.id]);
    const isEmail = identifier.includes("@");
    if (!isEmail) {
      await query(`UPDATE users SET phone_verified=TRUE WHERE phone=$1`, [identifier]);
    } else {
      await query(`UPDATE users SET phone_verified=TRUE WHERE email=$1`, [identifier]);
    }

    return res.json({ verified: true, message: "تم التحقق بنجاح" });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[verify-otp]");
    return res.status(500).json({ error: "حدث خطأ في التحقق" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ركن المرأة — طلبات الانضمام
// ══════════════════════════════════════════════════════════════════════════════

router.post("/women/join-request", async (req: Request, res: Response) => {
  try {
    const { owner_name, service_type, phone, address, description } = req.body;
    if (!owner_name || !service_type || !phone)
      return res.status(400).json({ error: "الاسم ونوع الخدمة والهاتف مطلوبة" });
    await query(
      `INSERT INTO women_join_requests (owner_name, service_type, phone, address, description)
       VALUES ($1,$2,$3,$4,$5)`,
      [owner_name.trim(), service_type, phone.trim(), address?.trim() ?? "", description?.trim() ?? ""]
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/women/join-requests", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator"))
      return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM women_join_requests ORDER BY created_at DESC`);
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// مناسبتي — محلات الأدوات + المواصلات
// ══════════════════════════════════════════════════════════════════════════════

// قائمة المحلات المعتمدة مع أصنافها
router.get("/occasions/shops", async (_req: Request, res: Response) => {
  try {
    const shopsR = await query(
      `SELECT * FROM occasion_shops WHERE status='approved' ORDER BY shop_name ASC`
    );
    const shops = shopsR.rows;
    if (!shops.length) return res.json([]);
    const ids = shops.map((s: any) => s.id);
    const itemsR = await query(
      `SELECT * FROM occasion_items WHERE shop_id = ANY($1) ORDER BY shop_id, is_available DESC, sort_order ASC, name ASC`,
      [ids]
    );
    const grouped: Record<number, any[]> = {};
    for (const item of itemsR.rows) {
      if (!grouped[item.shop_id]) grouped[item.shop_id] = [];
      grouped[item.shop_id].push(item);
    }
    return res.json(shops.map((s: any) => ({ ...s, items: grouped[s.id] ?? [] })));
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// طلب انضمام محل جديد
router.post("/occasions/join-request", async (req: Request, res: Response) => {
  try {
    const { owner_name, shop_name, phone, whatsapp, city_area, description, social_link } = req.body;
    if (!owner_name || !shop_name || !phone)
      return res.status(400).json({ error: "الاسم واسم المحل والهاتف مطلوبة" });
    const existing = await query(`SELECT id FROM occasion_shops WHERE phone=$1`, [phone]);
    if (existing.rows.length) return res.status(409).json({ error: "هذا الرقم مسجّل بالفعل" });
    const r = await query(
      `INSERT INTO occasion_shops (owner_name,shop_name,phone,whatsapp,city_area,description,social_link,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id`,
      [owner_name, shop_name, phone, whatsapp ?? phone, city_area ?? "", description ?? "", social_link ?? ""]
    );
    return res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// إضافة صنف لمحل
router.post("/occasions/items", async (req: Request, res: Response) => {
  try {
    const { shop_phone, name, category, price_hint, icon, quantity, sort_order } = req.body;
    if (!shop_phone || !name || !category)
      return res.status(400).json({ error: "بيانات ناقصة" });
    const shopR = await query(`SELECT id FROM occasion_shops WHERE phone=$1 AND status='approved'`, [shop_phone]);
    if (!shopR.rows.length) return res.status(403).json({ error: "المحل غير موجود أو لم يُعتمد بعد" });
    const shop_id = shopR.rows[0].id;
    const r = await query(
      `INSERT INTO occasion_items (shop_id,name,category,price_hint,icon,quantity,sort_order,is_available)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
      [shop_id, name, category, price_hint ?? "", icon ?? "package-variant", quantity ?? 0, sort_order ?? 99]
    );
    return res.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// تبديل توفر صنف
router.patch("/occasions/items/:id/toggle", async (req: Request, res: Response) => {
  try {
    const { shop_phone } = req.body;
    const { id } = req.params;
    if (!shop_phone) return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    const shopR = await query(`SELECT id FROM occasion_shops WHERE phone=$1`, [shop_phone]);
    if (!shopR.rows.length) return res.status(403).json({ error: "غير مصرح" });
    const shop_id = shopR.rows[0].id;
    const r = await query(
      `UPDATE occasion_items SET is_available = NOT is_available WHERE id=$1 AND shop_id=$2 RETURNING is_available`,
      [id, shop_id]
    );
    if (!r.rows.length) return res.status(403).json({ error: "الصنف غير موجود أو لا تملك صلاحية" });
    return res.json({ ok: true, is_available: r.rows[0].is_available });
  } catch (err) {
    logger.error({ err }, "route error");
    return res.status(500).json({ error: "Server error" });
  }
});

// حذف صنف
router.delete("/occasions/items/:id", async (req: Request, res: Response) => {
  try {
    const { shop_phone } = req.body;
    const { id } = req.params;
    if (!shop_phone) return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    const shopR = await query(`SELECT id FROM occasion_shops WHERE phone=$1`, [shop_phone]);
    if (!shopR.rows.length) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM occasion_items WHERE id=$1 AND shop_id=$2`, [id, shopR.rows[0].id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// إدارة: قائمة كل الطلبات
router.get("/occasions/shops/all", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator"))
      return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM occasion_shops ORDER BY created_at DESC`);
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// إدارة: تغيير حالة محل
router.patch("/occasions/shops/:id/status", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin")
      return res.status(403).json({ error: "غير مصرح" });
    const { status, notes } = req.body;
    if (!["approved", "rejected", "pending"].includes(status))
      return res.status(400).json({ error: "حالة غير صالحة" });
    await query(`UPDATE occasion_shops SET status=$1, notes=$2 WHERE id=$3`, [status, notes ?? "", req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// إدارة: حذف محل
router.delete("/occasions/shops/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM occasion_items WHERE shop_id=$1`, [req.params.id]);
    await query(`DELETE FROM occasion_shops WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ── قائمة المواصلات ──────────────────────────────────────────────────────────
router.get("/occasions/transport", async (_req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT * FROM occasion_transport WHERE is_visible=true ORDER BY is_available DESC, owner_name ASC`
    );
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// إضافة مزود مواصلات (admin فقط أو طلب)
router.post("/occasions/transport", async (req: Request, res: Response) => {
  try {
    const { owner_name, vehicle_type, vehicle_desc, capacity, phone, whatsapp, area, notes } = req.body;
    if (!owner_name || !vehicle_type || !phone)
      return res.status(400).json({ error: "الاسم والنوع والهاتف مطلوبة" });
    const r = await query(
      `INSERT INTO occasion_transport (owner_name,vehicle_type,vehicle_desc,capacity,phone,whatsapp,area,notes,is_available,is_visible)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,false) RETURNING id`,
      [owner_name, vehicle_type, vehicle_desc ?? "", capacity ?? 0, phone, whatsapp ?? phone, area ?? "", notes ?? ""]
    );
    return res.json({ ok: true, id: r.rows[0].id, message: "تم إرسال طلبك وسيُراجع من قِبل الإدارة" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// إدارة: قائمة كل مزودي المواصلات (بما فيهم غير المرئيين)
router.get("/occasions/transport/all", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator"))
      return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM occasion_transport ORDER BY created_at DESC`);
    return res.json(r.rows);
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// إدارة: تعديل مزود مواصلات
router.patch("/occasions/transport/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const { is_visible, is_available } = req.body;
    await query(
      `UPDATE occasion_transport SET is_visible=COALESCE($1,is_visible), is_available=COALESCE($2,is_available) WHERE id=$3`,
      [is_visible ?? null, is_available ?? null, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// إدارة: حذف مزود مواصلات
router.delete("/occasions/transport/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM occasion_transport WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// الأخصائيون والاستشارات الطبية — Medical Specialists & Consultations
// ══════════════════════════════════════════════════════

setImmediate(() => (async () => {
  try {
    // جدول الأخصائيين
    await query(`
      CREATE TABLE IF NOT EXISTS specialists (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        specialty VARCHAR(100) NOT NULL,
        bio TEXT,
        clinic VARCHAR(200),
        phone VARCHAR(80),
        photo_url TEXT,
        available_days TEXT DEFAULT '[]',
        fees VARCHAR(80),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        order_num INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // جدول الاستشارات الطبية
    await query(`
      CREATE TABLE IF NOT EXISTS medical_consultations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(200),
        specialty VARCHAR(100),
        question TEXT NOT NULL,
        is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
        replies_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // جدول ردود الاستشارات
    await query(`
      CREATE TABLE IF NOT EXISTS consultation_replies (
        id SERIAL PRIMARY KEY,
        consultation_id INTEGER NOT NULL REFERENCES medical_consultations(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(200),
        is_specialist BOOLEAN NOT NULL DEFAULT FALSE,
        specialist_title VARCHAR(200),
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // عمود إضافي في appointments
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_name VARCHAR(200)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_phone VARCHAR(80)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS facility_name VARCHAR(300)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
  } catch {}
})());

// GET /api/specialists
router.get("/specialists", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM specialists WHERE is_active=TRUE ORDER BY order_num, name`);
    return res.json({ specialists: result.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/specialists (admin only)
router.post("/specialists", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { name, specialty, bio, clinic, phone, photo_url, available_days, fees } = req.body;
    if (!name || !specialty) return res.status(400).json({ error: "الاسم والتخصص مطلوبان" });
    const result = await query(
      `INSERT INTO specialists (name, specialty, bio, clinic, phone, photo_url, available_days, fees)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, specialty, bio||null, clinic||null, phone||null, photo_url||null,
       JSON.stringify(available_days||[]), fees||null]
    );
    return res.json({ specialist: result.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════
// ── إدارة الأطباء والمستوصفات (admin) ──
// ══════════════════════════════════════════════════════

// GET /api/admin/specialists — جميع الأطباء (بما فيهم المخفيون)
router.get("/admin/specialists", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { clinic } = req.query as any;
    let sql = `SELECT * FROM specialists`;
    const params: any[] = [];
    if (clinic) { sql += ` WHERE clinic=$1`; params.push(clinic); }
    sql += ` ORDER BY clinic, order_num, name`;
    const { rows } = await query(sql, params);
    // جمّع بالمستوصف
    const groups: Record<string, any[]> = {};
    for (const r of rows) {
      const key = r.clinic || "غير مصنّف";
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return res.json({ specialists: rows, groups });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/specialists/:id — تحديث طبيب
router.patch("/admin/specialists/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const { name, specialty, bio, clinic, phone, photo_url, fees, order_num, is_active } = req.body as any;
    const fields: string[] = [];
    const vals: any[]    = [];
    let i = 1;
    if (name       !== undefined) { fields.push(`name=$${i++}`);       vals.push(name); }
    if (specialty  !== undefined) { fields.push(`specialty=$${i++}`);  vals.push(specialty); }
    if (bio        !== undefined) { fields.push(`bio=$${i++}`);        vals.push(bio); }
    if (clinic     !== undefined) { fields.push(`clinic=$${i++}`);     vals.push(clinic); }
    if (phone      !== undefined) { fields.push(`phone=$${i++}`);      vals.push(phone); }
    if (photo_url  !== undefined) { fields.push(`photo_url=$${i++}`);  vals.push(photo_url); }
    if (fees       !== undefined) { fields.push(`fees=$${i++}`);       vals.push(fees); }
    if (order_num  !== undefined) { fields.push(`order_num=$${i++}`);  vals.push(order_num); }
    if (is_active  !== undefined) { fields.push(`is_active=$${i++}`);  vals.push(is_active); }
    if (!fields.length) return res.status(400).json({ error: "لا توجد بيانات للتحديث" });
    vals.push(id);
    const { rows } = await query(
      `UPDATE specialists SET ${fields.join(",")} WHERE id=$${i} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: "الطبيب غير موجود" });
    return res.json({ specialist: rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/specialists/:id — حذف طبيب
router.delete("/admin/specialists/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const id = parseInt(req.params.id as string);
    await query(`DELETE FROM specialists WHERE id=$1`, [id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/admin/specialists/clinic-toggle — إظهار/إخفاء كل أطباء مستوصف
router.put("/admin/specialists/clinic-toggle", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const { clinic, is_active } = req.body as any;
    if (!clinic) return res.status(400).json({ error: "اسم المستوصف مطلوب" });
    const { rowCount } = await query(
      `UPDATE specialists SET is_active=$1 WHERE clinic=$2`,
      [!!is_active, clinic]
    );
    return res.json({ ok: true, updated: rowCount });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/appointments/mine
router.get("/appointments/mine", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const result = await query(
      `SELECT * FROM appointments WHERE user_id=$1 ORDER BY appointment_date DESC, appointment_time DESC`,
      [user.id]
    );
    return res.json({ appointments: result.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/appointments (extended)
router.post("/appointments/book", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { target_type, target_id, facility_name, appointment_date, appointment_time, notes, user_phone } = req.body;
    if (!target_type || !target_id || !appointment_date || !appointment_time) {
      return res.status(400).json({ error: "بيانات ناقصة" });
    }
    const result = await query(
      `INSERT INTO appointments
         (user_id, user_name, user_phone, target_type, target_id, facility_name, appointment_date, appointment_time, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [user.id, user.name, user_phone||null, target_type, target_id,
       facility_name||null, appointment_date, appointment_time, notes||null]
    );
    const appt = result.rows[0];

    // ── توليد رابط تأكيد واتساب ──────────────────────────────────────
    // رسالة للمريض عند الحجز
    const confirmMsg =
      `🏥 *تأكيد حجز موعدك*\n` +
      `السلام عليكم ${user.name}،\n` +
      `تم تسجيل موعدك بنجاح في *${facility_name || target_id}*\n` +
      `📅 التاريخ: *${appointment_date}*\n` +
      `⏰ الوقت: *${appointment_time}*\n` +
      `${notes ? `📝 ملاحظة: ${notes}\n` : ""}` +
      `سنرسل لك تذكيراً قبل 5 ساعات من الموعد.\n` +
      `— فريق حصاحيصاوي 💚`;

    // رسالة للإدارة بالحجز الجديد
    const adminMsg =
      `📋 *حجز جديد — حصاحيصاوي*\n` +
      `المريض: ${user.name}\n` +
      `الهاتف: ${user_phone || "غير محدد"}\n` +
      `المنشأة: ${facility_name || target_id}\n` +
      `📅 ${appointment_date} ⏰ ${appointment_time}\n` +
      `${notes ? `ملاحظة: ${notes}` : ""}`;

    // محاولة جلب واتساب المؤسسة من قاعدة البيانات
    let facilityWaLink: string | null = null;
    try {
      const instR = await query(
        `SELECT whatsapp, phone FROM medical_institutions WHERE id=$1 OR phone=$1 LIMIT 1`,
        [target_id]
      );
      if (instR.rows[0]?.whatsapp) {
        const wa = instR.rows[0].whatsapp.replace(/[^0-9]/g, "");
        facilityWaLink = `https://wa.me/${wa}?text=${encodeURIComponent(confirmMsg)}`;
      }
    } catch {}

    // رابط واتساب الإدارة (الاحتياطي)
    const adminWa = "249597083352";
    const adminWaLink = `https://wa.me/${adminWa}?text=${encodeURIComponent(adminMsg)}`;

    // رابط التأكيد للمريض (يُفتح من التطبيق)
    const patientPhone = (user_phone || "").replace(/[^0-9]/g, "");
    const patientWaLink = patientPhone
      ? `https://wa.me/249${patientPhone.replace(/^0/, "")}?text=${encodeURIComponent(confirmMsg)}`
      : null;

    return res.json({
      appointment: appt,
      wa_confirm_link: facilityWaLink || patientWaLink,  // يُعطى للمريض
      wa_admin_link: adminWaLink,                          // يُرسل للإدارة
      wa_patient_link: patientWaLink,                      // لإرسال تأكيد للمريض
    });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/appointments/:id/cancel
router.patch("/appointments/:id/cancel", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    await query(
      `UPDATE appointments SET status='cancelled', cancelled_at=NOW() WHERE id=$1 AND user_id=$2`,
      [req.params.id, user.id]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/medical-consultations
router.get("/medical-consultations", async (req: Request, res: Response) => {
  try {
    const { specialty } = req.query as { specialty?: string };
    let sql = `SELECT * FROM medical_consultations`;
    const params: unknown[] = [];
    if (specialty) { sql += ` WHERE specialty=$1`; params.push(specialty); }
    sql += ` ORDER BY created_at DESC LIMIT 50`;
    const result = await query(sql, params);
    return res.json({ consultations: result.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/medical-consultations
router.post("/medical-consultations", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { specialty, question, is_anonymous } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: "السؤال مطلوب" });
    const result = await query(
      `INSERT INTO medical_consultations (user_id, user_name, specialty, question, is_anonymous)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [user.id, is_anonymous ? "مجهول" : user.name, specialty||null, question.trim(), !!is_anonymous]
    );
    return res.json({ consultation: result.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/medical-consultations/:id/replies
router.get("/medical-consultations/:id/replies", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM consultation_replies WHERE consultation_id=$1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    return res.json({ replies: result.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/medical-consultations/:id/reply
router.post("/medical-consultations/:id/reply", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { body, is_specialist, specialist_title } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: "الرد مطلوب" });
    await query(`BEGIN`);
    const result = await query(
      `INSERT INTO consultation_replies (consultation_id, user_id, user_name, is_specialist, specialist_title, body)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, user.id, user.name, !!is_specialist, specialist_title||null, body.trim()]
    );
    await query(
      `UPDATE medical_consultations SET replies_count=replies_count+1 WHERE id=$1`,
      [req.params.id]
    );
    await query(`COMMIT`);
    return res.json({ reply: result.rows[0] });
  } catch { await query(`ROLLBACK`); return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════
// بوابة المؤسسات — Institution Portal
// ══════════════════════════════════════════════════════

// تهيئة جدول الجلسات وعمود توافر الخدمات (يُنفَّذ عند الاستيراد)
setImmediate(() => (async () => {
  try {
    await query(`ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS services_availability JSONB DEFAULT '{}'`);
    await query(`ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS payment_settings JSONB DEFAULT '{}'`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_proof_url TEXT`);
    await query(`
      CREATE TABLE IF NOT EXISTS institution_portal_sessions (
        id SERIAL PRIMARY KEY,
        institution_id INTEGER NOT NULL REFERENCES institution_applications(id) ON DELETE CASCADE,
        token VARCHAR(80) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days'
      )
    `);
  } catch {}
})());

// دالة التحقق من جلسة المؤسسة
async function getInstitutionSession(req: Request): Promise<{ institutionId: number; instName: string } | null> {
  const auth = req.headers["authorization"] as string | undefined;
  if (!auth?.startsWith("InstBearer ")) return null;
  const token = auth.slice(11);
  const result = await query(
    `SELECT s.institution_id, a.inst_name FROM institution_portal_sessions s
     JOIN institution_applications a ON a.id = s.institution_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  if (!result.rows[0]) return null;
  return { institutionId: result.rows[0].institution_id, instName: result.rows[0].inst_name };
}

// POST /api/inst/login — تسجيل دخول المؤسسة
router.post("/inst/login", async (req: Request, res: Response) => {
  try {
    const { phone, national_id } = req.body as { phone?: string; national_id?: string };
    if (!phone?.trim() || !national_id?.trim()) {
      return res.status(400).json({ error: "رقم الهاتف والرقم الوطني مطلوبان" });
    }
    const cleanPhone = phone.trim().replace(/\s+/g, "");
    const cleanId = national_id.trim();
    const result = await query(
      `SELECT id, inst_name, inst_type, inst_category, inst_description,
              inst_address, inst_phone, inst_email, inst_website,
              rep_name, rep_title, rep_photo_url, rep_phone,
              selected_services, services_availability, status,
              signed_contract_url, created_at
       FROM institution_applications
       WHERE (inst_phone = $1 OR rep_phone = $1)
         AND rep_national_id = $2
         AND status = 'approved'
       LIMIT 1`,
      [cleanPhone, cleanId]
    );
    if (!result.rows[0]) {
      return res.status(401).json({ error: "بيانات غير صحيحة أو المؤسسة لم تُعتمد بعد" });
    }
    const inst = result.rows[0];
    const token = randomBytes(32).toString("hex");
    await query(
      `INSERT INTO institution_portal_sessions (institution_id, token) VALUES ($1, $2)`,
      [inst.id, token]
    );
    return res.json({ token, institution: inst });
  } catch (err) {
    logger.error({ err: err }, "inst/login error");
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/inst/my-info — معلومات المؤسسة الحالية
router.get("/inst/my-info", async (req: Request, res: Response) => {
  try {
    const sess = await getInstitutionSession(req);
    if (!sess) return res.status(401).json({ error: "يرجى تسجيل الدخول" });
    const result = await query(
      `SELECT id, inst_name, inst_type, inst_category, inst_description,
              inst_address, inst_phone, inst_email, inst_website,
              rep_name, rep_title, rep_photo_url, rep_phone,
              selected_services, services_availability, payment_settings, status,
              signed_contract_url, created_at
       FROM institution_applications WHERE id = $1`,
      [sess.institutionId]
    );
    return res.json({ institution: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/inst/services-availability — تحديث توافر الخدمات
router.put("/inst/services-availability", async (req: Request, res: Response) => {
  try {
    const sess = await getInstitutionSession(req);
    if (!sess) return res.status(401).json({ error: "يرجى تسجيل الدخول" });
    const { services_availability } = req.body as { services_availability?: Record<string, boolean> };
    if (!services_availability || typeof services_availability !== "object") {
      return res.status(400).json({ error: "بيانات غير صالحة" });
    }
    await query(
      `UPDATE institution_applications SET services_availability = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(services_availability), sess.institutionId]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/inst/payment-settings — إعدادات الدفع
router.put("/inst/payment-settings", async (req: Request, res: Response) => {
  try {
    const sess = await getInstitutionSession(req);
    if (!sess) return res.status(401).json({ error: "يرجى تسجيل الدخول" });
    const { payment_settings } = req.body as { payment_settings?: Record<string, any> };
    if (!payment_settings || typeof payment_settings !== "object") {
      return res.status(400).json({ error: "بيانات غير صالحة" });
    }
    await query(
      `UPDATE institution_applications SET payment_settings = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(payment_settings), sess.institutionId]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/inst/payment-settings-public/:id — إعدادات دفع مؤسسة (عامة)
router.get("/inst/payment-settings-public/:id", async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT payment_settings FROM institution_applications WHERE id=$1 AND status='approved'`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "لم توجد" });
    return res.json({ payment_settings: result.rows[0].payment_settings || {} });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/inst/logout — تسجيل الخروج
router.post("/inst/logout", async (req: Request, res: Response) => {
  try {
    const auth = req.headers["authorization"] as string | undefined;
    if (auth?.startsWith("InstBearer ")) {
      const token = auth.slice(11);
      await query(`DELETE FROM institution_portal_sessions WHERE token = $1`, [token]);
    }
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ترحال والتوصيل — Transport & Delivery
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/transport/status — حالة الخدمة (عام)
router.get("/transport/status", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT key, value FROM admin_settings WHERE key IN ('transport_status','transport_note')`
    );
    const map: Record<string, string> = {};
    rows.forEach((r: any) => { map[r.key] = r.value; });
    const status = map.transport_status ?? "coming_soon";
    return res.json({
      enabled: status === "available",
      status,
      note: map.transport_note ?? "",
    });
  } catch { return res.json({ enabled: false, status: "coming_soon", note: "" }); }
});

// GET /api/admin/transport/settings — إعدادات الخدمة (مدير أو مشرف ترحيل)
router.get("/admin/transport/settings", async (req: Request, res: Response) => {
  try {
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT key, value FROM admin_settings WHERE key IN ('transport_enabled','transport_status','transport_note','transport_phone')`
    );
    const result: Record<string, string> = {};
    rows.forEach((r: any) => { result[r.key] = r.value; });
    if (!result.transport_status) {
      result.transport_status = result.transport_enabled === "true" ? "available" : "available";
    }
    return res.json(result);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/admin/transport/settings — تحديث إعدادات الخدمة (مدير المنصة فقط)
router.put("/admin/transport/settings", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط يستطيع تعديل الإعدادات العامة" });
    const { transport_status, transport_note, transport_phone } = req.body;
    const valid = ["available", "coming_soon", "maintenance"];
    const entries: [string, string][] = [];
    if (transport_status !== undefined && valid.includes(transport_status)) {
      entries.push(["transport_status", transport_status]);
      entries.push(["transport_enabled", String(transport_status === "available")]);
      // مزامنة ride_status مع transport_status للشارة في الصفحة الرئيسية
      const rideStatusMap: Record<string, string> = {
        available: "available", maintenance: "maintenance", coming_soon: "soon"
      };
      entries.push(["ride_status", rideStatusMap[transport_status] ?? "soon"]);
    }
    if (transport_note !== undefined) entries.push(["transport_note", transport_note]);
    if (transport_phone !== undefined) entries.push(["transport_phone", transport_phone]);
    for (const [k, v] of entries) {
      await query(
        `INSERT INTO admin_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`,
        [k, v]
      );
    }
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/transport/drivers — السائقون المعتمدون (عام)
router.get("/transport/drivers", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT id, name, vehicle_type, vehicle_desc, area, is_online, total_trips, rating
       FROM transport_drivers WHERE status='approved' ORDER BY is_online DESC, rating DESC, total_trips DESC`
    );
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/transport/drivers/register — تسجيل كسائق
router.post("/transport/drivers/register", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const { name, phone, vehicle_type, vehicle_desc, plate, area } = req.body;
    if (!name || !phone || !vehicle_type) return res.status(400).json({ error: "بيانات ناقصة" });
    // تحقق من عدم وجود طلب سابق
    if (me?.id) {
      const exist = await query(`SELECT id FROM transport_drivers WHERE user_id=$1`, [me.id]);
      if (exist.rows.length > 0) return res.status(409).json({ error: "لديك طلب تسجيل مسبق" });
    }
    const r = await query(
      `INSERT INTO transport_drivers (user_id,name,phone,vehicle_type,vehicle_desc,plate,area)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [me?.id ?? null, name, phone, vehicle_type, vehicle_desc ?? "", plate ?? "", area ?? ""]
    );
    return res.status(201).json({ id: r.rows[0].id });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/transport/trips — الرحلات النشطة
router.get("/transport/trips", async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const s = status || "pending";
    const { rows } = await query(
      `SELECT t.*, d.name AS driver_name_actual FROM transport_trips t
       LEFT JOIN transport_drivers d ON d.id=t.driver_id
       WHERE t.status=$1 ORDER BY t.created_at DESC LIMIT 50`,
      [s]
    );
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/transport/trips — طلب رحلة أو توصيل
router.post("/transport/trips", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const {
      user_name, user_phone, trip_type, from_location, to_location, notes,
      from_zone, to_zone, fare_estimate, vehicle_preference, delivery_desc,
    } = req.body;
    if (!user_name || !user_phone || !from_location || !to_location)
      return res.status(400).json({ error: "بيانات ناقصة" });
    const r = await query(
      `INSERT INTO transport_trips
         (user_id, user_name, user_phone, trip_type, from_location, to_location,
          notes, from_zone, to_zone, fare_estimate, vehicle_preference, delivery_desc)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        me?.id ?? null, user_name, user_phone,
        trip_type ?? "ride", from_location, to_location, notes ?? "",
        from_zone ?? null, to_zone ?? null,
        fare_estimate ?? null, vehicle_preference ?? "car",
        delivery_desc ?? null,
      ]
    );
    return res.status(201).json({ id: r.rows[0].id });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/transport/trips/:id — تحديث حالة الرحلة
router.patch("/transport/trips/:id", async (req: Request, res: Response) => {
  try {
    const { status, driver_id, driver_name, rating, rating_note } = req.body;
    await query(
      `UPDATE transport_trips SET
        status=COALESCE($1,status),
        driver_id=COALESCE($2,driver_id),
        driver_name=COALESCE($3,driver_name),
        rating=COALESCE($4,rating),
        rating_note=COALESCE($5,rating_note)
       WHERE id=$6`,
      [status, driver_id, driver_name, rating, rating_note, req.params.id]
    );
    if (status === "completed" && driver_id) {
      await query(`UPDATE transport_drivers SET total_trips=total_trips+1 WHERE id=$1`, [driver_id]);
    }
    if (rating && driver_id) {
      await query(
        `UPDATE transport_drivers SET rating=ROUND((rating*total_trips+$1)/(total_trips+1),2) WHERE id=$2`,
        [rating, driver_id]
      );
    }
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/transport/my-trips — رحلاتي
router.get("/transport/my-trips", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { rows } = await query(
      `SELECT t.*, d.phone AS driver_phone
       FROM transport_trips t
       LEFT JOIN transport_drivers d ON d.id = t.driver_id
       WHERE t.user_id=$1
       ORDER BY t.created_at DESC LIMIT 30`,
      [me.id]
    );
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/transport/trips/:id/cancel — إلغاء طلب (المستخدم)
router.post("/transport/trips/:id/cancel", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { rows } = await query(
      `SELECT user_id, status FROM transport_trips WHERE id=$1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "لم يُعثر على الطلب" });
    if (rows[0].user_id !== me.id) return res.status(403).json({ error: "غير مصرح" });
    if (rows[0].status !== "pending")
      return res.status(400).json({ error: "لا يمكن إلغاء طلب غير معلق" });
    await query(`UPDATE transport_trips SET status='cancelled' WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/transport/drivers/:id/online — تبديل حالة الإتاحة للسائق
router.patch("/transport/drivers/:id/online", async (req: Request, res: Response) => {
  try {
    const { is_online } = req.body;
    await query(`UPDATE transport_drivers SET is_online=$1 WHERE id=$2`, [!!is_online, req.params.id]);
    return res.json({ success: true });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// ── Admin Transport Routes ──

// GET /api/admin/transport/stats — إحصائيات الخدمة
router.get("/admin/transport/stats", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const opF = scope.operatorId != null ? `WHERE operator_id=${Number(scope.operatorId)}` : "";
    const opAnd = scope.operatorId != null ? `AND operator_id=${Number(scope.operatorId)}` : "";
    const [drivers, trips, pending, revenue] = await Promise.all([
      query(`SELECT status, COUNT(*) as cnt FROM transport_drivers ${opF} GROUP BY status`),
      query(`SELECT status, COUNT(*) as cnt FROM transport_trips ${opF} GROUP BY status`),
      query(`SELECT COUNT(*) as cnt FROM transport_drivers WHERE status='pending' ${opAnd}`),
      query(`SELECT COALESCE(SUM(actual_fare),0) AS total_fare, COALESCE(SUM(platform_revenue),0) AS platform_revenue, COALESCE(SUM(operator_revenue),0) AS operator_revenue FROM transport_trips WHERE status='completed' ${opAnd}`),
    ]);
    return res.json({
      drivers: drivers.rows,
      trips: trips.rows,
      pendingDrivers: parseInt(pending.rows[0]?.cnt ?? "0"),
      revenue: revenue.rows[0],
      scope: { isFullAdmin: scope.isFullAdmin, operatorId: scope.operatorId },
    });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// GET /api/admin/transport/drivers — جميع السائقين (مفلترة حسب نطاق الشركة)
router.get("/admin/transport/drivers", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.query;
    let q = `SELECT d.*, u.name AS user_name_ref, o.name AS operator_name FROM transport_drivers d LEFT JOIN users u ON u.id=d.user_id LEFT JOIN transport_operators o ON o.id=d.operator_id`;
    const params: any[] = [];
    const where: string[] = [];
    if (scope.operatorId != null) { where.push(`d.operator_id=$${params.length+1}`); params.push(scope.operatorId); }
    if (status && status !== "all") { where.push(`d.status=$${params.length+1}`); params.push(status); }
    if (where.length) q += ` WHERE ${where.join(" AND ")}`;
    q += ` ORDER BY d.created_at DESC`;
    const { rows } = await query(q, params);
    return res.json(rows);
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// PATCH /api/admin/transport/drivers/:id — قبول/رفض سائق (مفلتر حسب الشركة)
router.patch("/admin/transport/drivers/:id", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    // تأكد أن السائق ضمن نطاق المشرف
    if (scope.operatorId != null) {
      const own = await query(`SELECT operator_id FROM transport_drivers WHERE id=$1`, [req.params.id]);
      if (!own.rows[0]) return res.status(404).json({ error: "السائق غير موجود" });
      const cur = own.rows[0].operator_id;
      // مشرف الشركة يستطيع فقط: إدارة سائقي شركته، أو ضمّ سائق غير مرتبط بأي شركة (cur=null) إلى شركته
      if (cur != null && Number(cur) !== scope.operatorId) return res.status(403).json({ error: "هذا السائق ليس ضمن شركتك" });
    }
    const { status, admin_note } = req.body;
    let { operator_id } = req.body;
    // مشرف الشركة لا يستطيع تغيير operator_id لشركة أخرى — يُفرض = شركته
    if (scope.operatorId != null) operator_id = scope.operatorId;
    await query(
      `UPDATE transport_drivers SET status=COALESCE($1,status), admin_note=COALESCE($2,admin_note), operator_id=COALESCE($3,operator_id) WHERE id=$4`,
      [status, admin_note, operator_id ?? null, req.params.id]
    );
    return res.json({ success: true });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// DELETE /api/admin/transport/drivers/:id — حذف سائق (ضمن النطاق فقط)
router.delete("/admin/transport/drivers/:id", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    if (scope.operatorId != null) {
      const own = await query(`SELECT operator_id FROM transport_drivers WHERE id=$1`, [req.params.id]);
      if (!own.rows[0]) return res.status(404).json({ error: "السائق غير موجود" });
      if (Number(own.rows[0].operator_id) !== scope.operatorId) return res.status(403).json({ error: "هذا السائق ليس ضمن شركتك" });
    }
    await query(`DELETE FROM transport_drivers WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// GET /api/admin/transport/trips — جميع الرحلات (مفلترة)
router.get("/admin/transport/trips", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.query;
    let q = `SELECT t.*, d.name AS driver_name_ref, d.phone AS driver_phone, o.name AS operator_name
             FROM transport_trips t
             LEFT JOIN transport_drivers d ON d.id=t.driver_id
             LEFT JOIN transport_operators o ON o.id=t.operator_id`;
    const params: any[] = [];
    const where: string[] = [];
    if (scope.operatorId != null) { where.push(`t.operator_id=$${params.length+1}`); params.push(scope.operatorId); }
    if (status && status !== "all") { where.push(`t.status=$${params.length+1}`); params.push(status); }
    if (where.length) q += ` WHERE ${where.join(" AND ")}`;
    q += ` ORDER BY t.created_at DESC LIMIT 200`;
    const { rows } = await query(q, params);
    return res.json(rows);
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// PATCH /api/admin/transport/trips/:id/complete — إتمام رحلة (مع عزل الشركة)
router.patch("/admin/transport/trips/:id/complete", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const { actual_fare } = req.body;
    let { operator_id } = req.body;
    if (!actual_fare || actual_fare <= 0) return res.status(400).json({ error: "الأجرة الفعلية مطلوبة" });

    // التحقق من ملكية الرحلة
    const tripRow = await query(`SELECT operator_id FROM transport_trips WHERE id=$1`, [req.params.id]);
    if (!tripRow.rows[0]) return res.status(404).json({ error: "الرحلة غير موجودة" });
    const curOp = tripRow.rows[0].operator_id;
    if (scope.operatorId != null) {
      if (curOp != null && Number(curOp) !== scope.operatorId) return res.status(403).json({ error: "هذه الرحلة ليست ضمن شركتك" });
      // مشرف الشركة لا يستطيع نقل الرحلة لشركة أخرى — يُفرض على شركته
      operator_id = scope.operatorId;
    }
    const opId = operator_id ?? null;

    // احسب توزيع الأرباح
    let platformRevenue = actual_fare;
    let operatorRevenue = 0;
    if (opId) {
      const opRes = await query(`SELECT operator_share_pct, platform_share_pct FROM transport_operators WHERE id=$1`, [opId]);
      if (opRes.rows[0]) {
        const opShare = Number(opRes.rows[0].operator_share_pct) / 100;
        const platShare = Number(opRes.rows[0].platform_share_pct) / 100;
        operatorRevenue = Math.round(actual_fare * opShare);
        platformRevenue = Math.round(actual_fare * platShare);
      }
    }

    await query(
      `UPDATE transport_trips SET status='completed', actual_fare=$1, platform_revenue=$2, operator_revenue=$3, operator_id=COALESCE($4,operator_id), completed_at=NOW() WHERE id=$5`,
      [actual_fare, platformRevenue, operatorRevenue, opId, req.params.id]
    );
    return res.json({ success: true, actual_fare, platform_revenue: platformRevenue, operator_revenue: operatorRevenue });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// DELETE /api/admin/transport/trips/:id — حذف رحلة (ضمن النطاق)
router.delete("/admin/transport/trips/:id", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    if (scope.operatorId != null) {
      const own = await query(`SELECT operator_id FROM transport_trips WHERE id=$1`, [req.params.id]);
      if (!own.rows[0]) return res.status(404).json({ error: "الرحلة غير موجودة" });
      if (Number(own.rows[0].operator_id) !== scope.operatorId) return res.status(403).json({ error: "هذه الرحلة ليست ضمن شركتك" });
    }
    await query(`DELETE FROM transport_trips WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// ── مسارات الشركات المشغّلة (Operators) ──

// GET /api/admin/transport/operators — قائمة الشركات (admin يرى الكل، مشرف الشركة يرى شركته فقط)
router.get("/admin/transport/operators", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const opF = scope.operatorId != null ? `WHERE o.id=${Number(scope.operatorId)}` : "";
    const { rows } = await query(`
      SELECT o.*,
        COUNT(DISTINCT d.id) FILTER (WHERE d.status='approved')::int AS active_drivers,
        COUNT(DISTINCT t.id) FILTER (WHERE t.status='completed')::int AS total_trips,
        COALESCE(SUM(t.actual_fare) FILTER (WHERE t.status='completed'),0)::int AS total_revenue,
        COALESCE(SUM(t.operator_revenue) FILTER (WHERE t.status='completed'),0)::int AS total_operator_revenue,
        COALESCE(SUM(t.platform_revenue) FILTER (WHERE t.status='completed'),0)::int AS total_platform_revenue
      FROM transport_operators o
      LEFT JOIN transport_drivers d ON d.operator_id=o.id
      LEFT JOIN transport_trips t ON t.operator_id=o.id
      ${opF}
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    return res.json(rows);
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// POST /api/admin/transport/operators — إنشاء شركة (مدير المنصة فقط)
router.post("/admin/transport/operators", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط يمكنه إنشاء شركات" });
    const { name, contact_name, phone, email, contract_start, contract_end, operator_share_pct, platform_share_pct, notes } = req.body;
    if (!name) return res.status(400).json({ error: "اسم الشركة مطلوب" });
    const opShare = Number(operator_share_pct ?? 70);
    const platShare = Number(platform_share_pct ?? 30);
    if (Math.abs(opShare + platShare - 100) > 0.01) return res.status(400).json({ error: "مجموع نسبتي التشغيل والمنصة يجب أن يساوي ١٠٠٪" });
    const { rows } = await query(
      `INSERT INTO transport_operators (name, contact_name, phone, email, contract_start, contract_end, operator_share_pct, platform_share_pct, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, contact_name || "", phone || "", email || "", contract_start || null, contract_end || null, opShare, platShare, notes || ""]
    );
    return res.status(201).json(rows[0]);
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// PATCH /api/admin/transport/operators/:id — تعديل شركة (مدير المنصة فقط)
router.patch("/admin/transport/operators/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط يمكنه تعديل بيانات الشركة" });
    const { name, contact_name, phone, email, contract_start, contract_end, operator_share_pct, platform_share_pct, status, notes } = req.body;
    if (operator_share_pct !== undefined && platform_share_pct !== undefined) {
      const s = Number(operator_share_pct) + Number(platform_share_pct);
      if (Math.abs(s - 100) > 0.01) return res.status(400).json({ error: "مجموع النسب يجب أن يساوي ١٠٠٪" });
    }
    await query(
      `UPDATE transport_operators SET
        name=COALESCE($1,name), contact_name=COALESCE($2,contact_name), phone=COALESCE($3,phone),
        email=COALESCE($4,email), contract_start=COALESCE($5,contract_start), contract_end=COALESCE($6,contract_end),
        operator_share_pct=COALESCE($7,operator_share_pct), platform_share_pct=COALESCE($8,platform_share_pct),
        status=COALESCE($9,status), notes=COALESCE($10,notes)
       WHERE id=$11`,
      [name, contact_name, phone, email, contract_start || null, contract_end || null, operator_share_pct, platform_share_pct, status, notes, req.params.id]
    );
    return res.json({ success: true });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// DELETE /api/admin/transport/operators/:id
router.delete("/admin/transport/operators/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "المديرون فقط" });
    await query(`DELETE FROM transport_operators WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// مناطق التغطية — الأحياء والقرى
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/transport/neighborhoods — قائمة الأحياء العامة (المعتمدة)
router.get("/transport/neighborhoods", async (req: Request, res: Response) => {
  try {
    const r = await query(`SELECT id, name, zone_id, submitted_by, created_at FROM transport_neighborhoods WHERE status='active' ORDER BY zone_id, name`);
    return res.json(r.rows);
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// GET /api/transport/neighborhoods/community-stats — إحصائيات المجتمع
router.get("/transport/neighborhoods/community-stats", async (req: Request, res: Response) => {
  try {
    const total     = await query(`SELECT COUNT(*) FROM transport_neighborhoods WHERE status='active'`);
    const pending   = await query(`SELECT COUNT(*) FROM transport_neighborhoods WHERE status='pending'`);
    const contribs  = await query(`SELECT COUNT(DISTINCT submitted_by) FROM transport_neighborhoods WHERE status='active' AND submitted_by != ''`);
    const recent    = await query(`SELECT name, zone_id, submitted_by, created_at FROM transport_neighborhoods WHERE status='active' AND submitted_by != '' ORDER BY created_at DESC LIMIT 5`);
    return res.json({
      total:       parseInt(total.rows[0].count),
      pending:     parseInt(pending.rows[0].count),
      contributors: parseInt(contribs.rows[0].count),
      recent:      recent.rows,
    });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// POST /api/transport/neighborhoods/suggest — اقتراح حي من مستخدم
router.post("/transport/neighborhoods/suggest", async (req: Request, res: Response) => {
  try {
    const { name, zone_id, submitted_by } = req.body;
    if (!name || !zone_id) return res.status(400).json({ error: "الاسم والمنطقة مطلوبان" });
    // تحقق من عدم التكرار
    const exists = await query(`SELECT id FROM transport_neighborhoods WHERE LOWER(name)=LOWER($1) AND zone_id=$2 AND status != 'rejected'`, [name, zone_id]);
    if (exists.rows.length > 0) return res.status(409).json({ error: "هذا الحي موجود بالفعل أو قيد المراجعة" });
    const r = await query(
      `INSERT INTO transport_neighborhoods (name, zone_id, status, submitted_by) VALUES ($1,$2,'pending',$3) RETURNING *`,
      [name.trim(), zone_id, submitted_by || ""]
    );
    return res.json({ success: true, neighborhood: r.rows[0] });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// GET /api/admin/transport/neighborhoods — كل الأحياء (إداري)
router.get("/admin/transport/neighborhoods", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM transport_neighborhoods ORDER BY status DESC, zone_id, name`);
    return res.json(r.rows);
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// POST /api/admin/transport/neighborhoods — إضافة حي (مدير المنصة فقط)
router.post("/admin/transport/neighborhoods", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط يستطيع إضافة الأحياء" });
    const { name, zone_id, notes } = req.body;
    if (!name || !zone_id) return res.status(400).json({ error: "الاسم والمنطقة مطلوبان" });
    const exists = await query(`SELECT id FROM transport_neighborhoods WHERE LOWER(name)=LOWER($1) AND zone_id=$2 AND status != 'rejected'`, [name, zone_id]);
    if (exists.rows.length > 0) return res.status(409).json({ error: "هذا الحي موجود بالفعل" });
    const r = await query(
      `INSERT INTO transport_neighborhoods (name, zone_id, status, submitted_by, notes) VALUES ($1,$2,'active',$3,$4) RETURNING *`,
      [name.trim(), zone_id, (me as any).name || (me as any).email || "admin", notes || ""]
    );
    return res.json(r.rows[0]);
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// PATCH /api/admin/transport/neighborhoods/:id — تعديل حالة أو بيانات (مدير المنصة فقط)
router.patch("/admin/transport/neighborhoods/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط يستطيع تعديل الأحياء" });
    const { status, name, zone_id, notes } = req.body;
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (status)  { fields.push(`status=$${i++}`);  vals.push(status); }
    if (name)    { fields.push(`name=$${i++}`);    vals.push(name.trim()); }
    if (zone_id) { fields.push(`zone_id=$${i++}`); vals.push(zone_id); }
    if (notes !== undefined) { fields.push(`notes=$${i++}`); vals.push(notes); }
    if (!fields.length) return res.status(400).json({ error: "لا توجد حقول للتحديث" });
    vals.push(req.params.id);
    const r = await query(`UPDATE transport_neighborhoods SET ${fields.join(",")} WHERE id=$${i} RETURNING *`, vals);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجود" });
    return res.json(r.rows[0]);
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// DELETE /api/admin/transport/neighborhoods/:id — حذف (مدير المنصة فقط)
router.delete("/admin/transport/neighborhoods/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط يستطيع حذف الأحياء" });
    await query(`DELETE FROM transport_neighborhoods WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// GET /api/admin/transport/operators/:id/report — تقرير مفصّل لشركة مشغّلة
router.get("/admin/transport/operators/:id/report", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    if (scope.operatorId != null && Number(req.params.id) !== scope.operatorId)
      return res.status(403).json({ error: "تستطيع عرض تقرير شركتك فقط" });
    const opId = req.params.id;
    const [opRes, driversRes, tripsRes, monthlyRes] = await Promise.all([
      query(`SELECT * FROM transport_operators WHERE id=$1`, [opId]),
      query(`SELECT COUNT(*) FILTER (WHERE status='approved')::int AS active, COUNT(*)::int AS total FROM transport_drivers WHERE operator_id=$1`, [opId]),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status='completed')::int AS completed,
          COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending,
          COALESCE(SUM(actual_fare) FILTER (WHERE status='completed'),0)::int AS total_fare,
          COALESCE(SUM(operator_revenue) FILTER (WHERE status='completed'),0)::int AS operator_revenue,
          COALESCE(SUM(platform_revenue) FILTER (WHERE status='completed'),0)::int AS platform_revenue,
          COALESCE(AVG(actual_fare) FILTER (WHERE status='completed'),0)::int AS avg_fare
        FROM transport_trips WHERE operator_id=$1`, [opId]),
      query(`
        SELECT
          DATE_TRUNC('month', completed_at) AS month,
          COUNT(*)::int AS trips,
          COALESCE(SUM(actual_fare),0)::int AS revenue,
          COALESCE(SUM(operator_revenue),0)::int AS operator_share,
          COALESCE(SUM(platform_revenue),0)::int AS platform_share
        FROM transport_trips
        WHERE operator_id=$1 AND status='completed' AND completed_at IS NOT NULL
        GROUP BY month ORDER BY month DESC LIMIT 12`, [opId]),
    ]);
    if (!opRes.rows[0]) return res.status(404).json({ error: "الشركة غير موجودة" });
    return res.json({
      operator: opRes.rows[0],
      drivers: driversRes.rows[0],
      trips: tripsRes.rows[0],
      monthly: monthlyRes.rows,
    });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// GET /api/admin/transport/reports — تقارير الإيرادات الشاملة (مفلترة حسب نطاق الشركة)
router.get("/admin/transport/reports", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const opId = scope.operatorId;
    const tWhereOp  = opId != null ? `WHERE operator_id=${Number(opId)}` : "";
    const tAndOp    = opId != null ? `AND operator_id=${Number(opId)}`   : "";
    const tWhereOpJ = opId != null ? `WHERE t.operator_id=${Number(opId)}`: "";
    const tAndOpJ   = opId != null ? `AND t.operator_id=${Number(opId)}`  : "";
    const oWhereOp  = opId != null ? `WHERE o.id=${Number(opId)}`         : "";
    const [overall, byVehicle, byOperator, monthly, recent] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status='completed')::int AS completed_trips,
          COUNT(*) FILTER (WHERE status='cancelled')::int AS cancelled_trips,
          COUNT(*) FILTER (WHERE status='pending')::int AS pending_trips,
          COUNT(*) FILTER (WHERE status='in_progress')::int AS active_trips,
          COALESCE(SUM(actual_fare) FILTER (WHERE status='completed'),0)::int AS total_revenue,
          COALESCE(SUM(platform_revenue) FILTER (WHERE status='completed'),0)::int AS platform_revenue,
          COALESCE(SUM(operator_revenue) FILTER (WHERE status='completed'),0)::int AS operator_revenue,
          COALESCE(AVG(actual_fare) FILTER (WHERE status='completed'),0)::int AS avg_fare
        FROM transport_trips ${tWhereOp}`),
      query(`
        SELECT vehicle_preference,
          COUNT(*) FILTER (WHERE status='completed')::int AS trips,
          COALESCE(SUM(actual_fare) FILTER (WHERE status='completed'),0)::int AS revenue
        FROM transport_trips ${tWhereOp} GROUP BY vehicle_preference ORDER BY trips DESC`),
      query(`
        SELECT o.id, o.name, o.operator_share_pct, o.platform_share_pct,
          COUNT(t.id) FILTER (WHERE t.status='completed')::int AS trips,
          COALESCE(SUM(t.actual_fare) FILTER (WHERE t.status='completed'),0)::int AS revenue,
          COALESCE(SUM(t.operator_revenue) FILTER (WHERE t.status='completed'),0)::int AS operator_share,
          COALESCE(SUM(t.platform_revenue) FILTER (WHERE t.status='completed'),0)::int AS platform_share
        FROM transport_operators o
        LEFT JOIN transport_trips t ON t.operator_id=o.id
        ${oWhereOp}
        GROUP BY o.id ORDER BY revenue DESC`),
      query(`
        SELECT DATE_TRUNC('day', completed_at) AS day,
          COUNT(*)::int AS trips,
          COALESCE(SUM(actual_fare),0)::int AS revenue,
          COALESCE(SUM(platform_revenue),0)::int AS platform_revenue
        FROM transport_trips
        WHERE status='completed' AND completed_at >= NOW()-INTERVAL '30 days' ${tAndOp}
        GROUP BY day ORDER BY day DESC`),
      query(`
        SELECT t.*, o.name AS operator_name FROM transport_trips t
        LEFT JOIN transport_operators o ON o.id=t.operator_id
        WHERE t.status='completed' ${tAndOpJ} ORDER BY t.completed_at DESC LIMIT 20`),
    ]);
    return res.json({
      overall: overall.rows[0],
      byVehicle: byVehicle.rows,
      byOperator: byOperator.rows,
      daily: monthly.rows,
      recent: recent.rows,
      scope: { isFullAdmin: scope.isFullAdmin, operatorId: opId },
    });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// ══════════════════════════════════════════════════════
// ── مسارات التعرفة والمناطق ──
// ══════════════════════════════════════════════════════

// GET /api/transport/fares — جلب مصفوفة التعرفة (عام) - تشمل الدراجة النارية
router.get("/transport/fares", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT from_zone, to_zone, fare_car, fare_rickshaw, fare_delivery, fare_motorcycle FROM transport_fares ORDER BY from_zone, to_zone`
    );
    const matrix: Record<number, Record<number, { car: number; rickshaw: number; delivery: number; motorcycle: number }>> = {};
    for (const row of rows) {
      if (!matrix[row.from_zone]) matrix[row.from_zone] = {};
      matrix[row.from_zone][row.to_zone] = {
        car: Number(row.fare_car),
        rickshaw: Number(row.fare_rickshaw),
        delivery: Number(row.fare_delivery),
        motorcycle: Number(row.fare_motorcycle),
      };
    }
    return res.json(matrix);
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// GET /api/admin/transport/fares — عرض مصفوفة التعرفة (أدمن أو مشرف ترحيل)
router.get("/admin/transport/fares", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT from_zone, to_zone, fare_car, fare_rickshaw, fare_delivery, fare_motorcycle FROM transport_fares ORDER BY from_zone, to_zone`);
    return res.json({ fares: rows });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// PUT /api/admin/transport/fares — تحديث خلية في مصفوفة التعرفة (مدير المنصة فقط)
router.put("/admin/transport/fares", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط يستطيع تعديل التعرفة" });
    const { from_zone, to_zone, fare_car, fare_rickshaw, fare_delivery, fare_motorcycle } = req.body;
    if (!from_zone || !to_zone) return res.status(400).json({ error: "المنطقتان مطلوبتان" });
    await query(
      `UPDATE transport_fares SET
         fare_car = COALESCE($3, fare_car),
         fare_rickshaw = COALESCE($4, fare_rickshaw),
         fare_delivery = COALESCE($5, fare_delivery),
         fare_motorcycle = COALESCE($6, fare_motorcycle),
         updated_at = NOW()
       WHERE from_zone=$1 AND to_zone=$2`,
      [from_zone, to_zone, fare_car ?? null, fare_rickshaw ?? null, fare_delivery ?? null, fare_motorcycle ?? null],
    );
    return res.json({ success: true });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// PUT /api/admin/transport/fares/bulk — تحديث التعرفة بالكامل (مدير المنصة فقط)
router.put("/admin/transport/fares/bulk", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط يستطيع تعديل التعرفة" });
    const { fares } = req.body as { fares: Array<{ from_zone: number; to_zone: number; fare_car: number; fare_rickshaw: number; fare_delivery: number; fare_motorcycle?: number }> };
    if (!Array.isArray(fares)) return res.status(400).json({ error: "تنسيق خاطئ" });
    for (const f of fares) {
      await query(
        `UPDATE transport_fares SET fare_car=$3, fare_rickshaw=$4, fare_delivery=$5, fare_motorcycle=COALESCE($6,fare_motorcycle), updated_at=NOW()
         WHERE from_zone=$1 AND to_zone=$2`,
        [f.from_zone, f.to_zone, f.fare_car, f.fare_rickshaw, f.fare_delivery, f.fare_motorcycle ?? null],
      );
    }
    return res.json({ success: true, updated: fares.length });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// GET /api/transport/fare-estimate — حساب التعرفة التقديرية
router.get("/transport/fare-estimate", async (req: Request, res: Response) => {
  try {
    const { from_zone, to_zone } = req.query;
    if (!from_zone || !to_zone) return res.status(400).json({ error: "المنطقتان مطلوبتان" });
    const { rows } = await query(
      `SELECT fare_car, fare_rickshaw, fare_delivery, fare_motorcycle FROM transport_fares WHERE from_zone=$1 AND to_zone=$2`,
      [Number(from_zone), Number(to_zone)],
    );
    if (!rows[0]) return res.status(404).json({ error: "لا توجد تعرفة لهذا المسار" });
    return res.json({
      from_zone: Number(from_zone),
      to_zone: Number(to_zone),
      car: Number(rows[0].fare_car),
      rickshaw: Number(rows[0].fare_rickshaw),
      delivery: Number(rows[0].fare_delivery),
      motorcycle: Number(rows[0].fare_motorcycle),
    });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// PATCH /api/admin/transport/trips/:id/assign — تعيين سائق لرحلة (ضمن النطاق)
router.patch("/admin/transport/trips/:id/assign", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const { driver_id, status } = req.body;
    let { operator_id } = req.body;
    let driverName = null;
    let opId = operator_id ?? null;

    // التحقق أن الرحلة ضمن نطاق المشرف
    if (scope.operatorId != null) {
      const tripRow = await query(`SELECT operator_id FROM transport_trips WHERE id=$1`, [req.params.id]);
      if (!tripRow.rows[0]) return res.status(404).json({ error: "الرحلة غير موجودة" });
      const cur = tripRow.rows[0].operator_id;
      if (cur != null && Number(cur) !== scope.operatorId) return res.status(403).json({ error: "هذه الرحلة ليست ضمن شركتك" });
      // لا يحق له تخصيص سائق من شركة أخرى
      if (driver_id) {
        const dr = await query(`SELECT operator_id FROM transport_drivers WHERE id=$1`, [driver_id]);
        if (!dr.rows[0]) return res.status(404).json({ error: "السائق غير موجود" });
        if (dr.rows[0].operator_id != null && Number(dr.rows[0].operator_id) !== scope.operatorId)
          return res.status(403).json({ error: "هذا السائق ليس ضمن شركتك" });
      }
      // يُفرض النطاق
      opId = scope.operatorId;
    }

    if (driver_id) {
      const dr = await query(`SELECT name, operator_id FROM transport_drivers WHERE id=$1`, [driver_id]);
      driverName = dr.rows[0]?.name || null;
      if (!opId && dr.rows[0]?.operator_id) opId = dr.rows[0].operator_id;
    }
    await query(
      `UPDATE transport_trips SET
         driver_id    = COALESCE($1, driver_id),
         driver_name  = COALESCE($2, driver_name),
         status       = COALESCE($3, status),
         operator_id  = COALESCE($4, operator_id)
       WHERE id=$5`,
      [driver_id ?? null, driverName, status ?? null, opId, req.params.id],
    );
    return res.json({ success: true });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// GET /api/admin/transport/overview — نظرة عامة متكاملة (مفلترة حسب النطاق)
router.get("/admin/transport/overview", async (req: Request, res: Response) => {
  try {
    await ensureTransportTables();
    const { ok: _ta, me, scope } = await isTransportOrAdminReq(req);
    if (!_ta) return res.status(403).json({ error: "غير مصرح" });
    const opF = scope.operatorId != null ? `WHERE operator_id=${Number(scope.operatorId)}` : "";
    const opOnlyMine = scope.operatorId != null ? `AND id=${Number(scope.operatorId)}` : "";
    const [drivers, trips, fares, settings, operators] = await Promise.all([
      query(`SELECT status, vehicle_type, COUNT(*) as cnt FROM transport_drivers ${opF} GROUP BY status, vehicle_type`),
      query(`SELECT status, trip_type, COUNT(*) as cnt FROM transport_trips ${opF} GROUP BY status, trip_type`),
      query(`SELECT from_zone, to_zone, fare_car, fare_rickshaw, fare_delivery, fare_motorcycle FROM transport_fares ORDER BY from_zone, to_zone`),
      query(`SELECT key, value FROM admin_settings WHERE key IN ('transport_enabled','transport_status','transport_note','transport_phone')`),
      query(`SELECT id, name, status, operator_share_pct FROM transport_operators WHERE status='active' ${opOnlyMine} ORDER BY name`),
    ]);
    const settingsMap: Record<string, string> = {};
    for (const r of settings.rows) settingsMap[r.key] = r.value;
    return res.json({
      drivers: drivers.rows,
      trips: trips.rows,
      fares: fares.rows,
      settings: settingsMap,
      operators: operators.rows,
      scope: { isFullAdmin: scope.isFullAdmin, operatorId: scope.operatorId },
    });
  } catch(e:any) { return res.status(500).json({ error: e?.message||"Server error" }); }
});

// POST /api/admin/transport/operators/:id/supervisor — إنشاء/ربط حساب مشرف لشركة (مدير المنصة فقط)
router.post("/admin/transport/operators/:id/supervisor", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط" });
    const opId = Number(req.params.id);
    const { name, email, password, link_existing_user_id } = req.body as { name?: string; email?: string; password?: string; link_existing_user_id?: number };
    const opRow = await query(`SELECT id, name FROM transport_operators WHERE id=$1`, [opId]);
    if (!opRow.rows[0]) return res.status(404).json({ error: "الشركة غير موجودة" });

    // 1) ربط مستخدم موجود
    if (link_existing_user_id) {
      await query(`UPDATE users SET role='transport_supervisor', operator_id=$1 WHERE id=$2`, [opId, link_existing_user_id]);
      const u = await query(`SELECT id, name, email, role, operator_id FROM users WHERE id=$1`, [link_existing_user_id]);
      return res.json({ user: u.rows[0], operator: opRow.rows[0] });
    }
    // 2) إنشاء حساب جديد
    if (!name || !email || !password) return res.status(400).json({ error: "الاسم والبريد وكلمة المرور مطلوبة" });
    if (password.length < 6) return res.status(400).json({ error: "كلمة المرور 6 أحرف على الأقل" });
    const hash = await bcrypt.hash(password, 10);
    const ins = await query(
      `INSERT INTO users (name, email, password_hash, role, operator_id) VALUES ($1,$2,$3,'transport_supervisor',$4) RETURNING id, name, email, role, operator_id`,
      [name, email, hash, opId]
    );
    return res.status(201).json({ user: ins.rows[0], operator: opRow.rows[0] });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(400).json({ error: "البريد مستخدم مسبقاً" });
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/transport/operators/:id/supervisors — قائمة المشرفين المرتبطين بشركة (مدير المنصة فقط)
router.get("/admin/transport/operators/:id/supervisors", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط" });
    const opId = Number(req.params.id);
    const r = await query(
      `SELECT id, name, email, role, created_at FROM users WHERE role='transport_supervisor' AND operator_id=$1 ORDER BY created_at DESC`,
      [opId]
    );
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/transport/operators/:id/supervisor/:userId — فك ربط مشرف عن شركة (مدير المنصة فقط)
router.delete("/admin/transport/operators/:id/supervisor/:userId", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!(await isPlatformOrAdminReq(req))) return res.status(403).json({ error: "مدير المنصة فقط" });
    await query(`UPDATE users SET operator_id=NULL WHERE id=$1 AND operator_id=$2`, [req.params.userId, req.params.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// مكتبات الخدمات الطلابية + مساحة التجار — إنشاء الجداول
// ══════════════════════════════════════════════════════════════════
setImmediate(() => (async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS student_libraries (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(300) NOT NULL,
        owner_name    VARCHAR(200),
        category      VARCHAR(60)  NOT NULL DEFAULT 'books',
        description   TEXT,
        address       VARCHAR(500),
        phone         VARCHAR(60),
        whatsapp      VARCHAR(60),
        services      TEXT[]       NOT NULL DEFAULT '{}',
        status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
        is_featured   BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS merchant_spaces (
        id            SERIAL PRIMARY KEY,
        shop_name     VARCHAR(300) NOT NULL,
        owner_name    VARCHAR(200) NOT NULL,
        category      VARCHAR(60)  NOT NULL DEFAULT 'general',
        description   TEXT,
        address       VARCHAR(500),
        phone         VARCHAR(60),
        whatsapp      VARCHAR(60),
        working_hours VARCHAR(200),
        logo_emoji    VARCHAR(10)  DEFAULT '🏪',
        tags          TEXT[]       NOT NULL DEFAULT '{}',
        status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
        is_featured   BOOLEAN      NOT NULL DEFAULT FALSE,
        is_verified   BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
  } catch (e) { logger.error({ err: e }, "student_libraries/merchant_spaces init"); }
})());

// ────────────────────────────────────────────────────────────────
// مكتبات الخدمات الطلابية — Public
// ────────────────────────────────────────────────────────────────

// GET /api/student-libraries
router.get("/student-libraries", async (req: Request, res: Response) => {
  try {
    const { category, q } = req.query as Record<string, string>;
    let sql = `SELECT * FROM student_libraries WHERE status='approved'`;
    const params: unknown[] = [];
    if (category && category !== "all") { params.push(category); sql += ` AND category=$${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length} OR address ILIKE $${params.length})`; }
    sql += ` ORDER BY is_featured DESC, created_at DESC`;
    const result = await query(sql, params);
    return res.json({ libraries: result.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/student-libraries — طلب تسجيل مكتبة
router.post("/student-libraries", async (req: Request, res: Response) => {
  try {
    const { name, owner_name, category, description, address, phone, whatsapp, services } = req.body;
    if (!name || !category) return res.status(400).json({ error: "الاسم والتصنيف مطلوبان" });
    if (!phone && !whatsapp) return res.status(400).json({ error: "رقم التواصل مطلوب" });
    const result = await query(
      `INSERT INTO student_libraries (name, owner_name, category, description, address, phone, whatsapp, services)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, owner_name||null, category, description||null, address||null, phone||null,
       whatsapp||null, services || []]
    );
    return res.status(201).json({ library: result.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ────────────────────────────────────────────────────────────────
// مكتبات الخدمات الطلابية — Admin
// ────────────────────────────────────────────────────────────────

// GET /api/admin/student-libraries
router.get("/admin/student-libraries", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.query as Record<string, string>;
    let sql = `SELECT * FROM student_libraries`;
    const params: unknown[] = [];
    if (status && status !== "all") { params.push(status); sql += ` WHERE status=$1`; }
    sql += ` ORDER BY is_featured DESC, created_at DESC`;
    const result = await query(sql, params);
    return res.json({ libraries: result.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/admin/student-libraries/:id
router.put("/admin/student-libraries/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { id } = req.params;
    const { name, owner_name, category, description, address, phone, whatsapp, services, status, is_featured } = req.body;
    const result = await query(
      `UPDATE student_libraries SET
         name=COALESCE($1,name), owner_name=COALESCE($2,owner_name), category=COALESCE($3,category),
         description=COALESCE($4,description), address=COALESCE($5,address), phone=COALESCE($6,phone),
         whatsapp=COALESCE($7,whatsapp), services=COALESCE($8,services), status=COALESCE($9,status),
         is_featured=COALESCE($10,is_featured), updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [name||null, owner_name||null, category||null, description||null, address||null,
       phone||null, whatsapp||null, services||null, status||null, is_featured??null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json({ library: result.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/student-libraries/:id
router.delete("/admin/student-libraries/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM student_libraries WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ────────────────────────────────────────────────────────────────
// مساحة التجار — Public
// ────────────────────────────────────────────────────────────────

// GET /api/merchants
router.get("/merchants", async (req: Request, res: Response) => {
  try {
    const { category, q } = req.query as Record<string, string>;
    let sql = `SELECT * FROM merchant_spaces WHERE status='approved'`;
    const params: unknown[] = [];
    if (category && category !== "all") { params.push(category); sql += ` AND category=$${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND (shop_name ILIKE $${params.length} OR description ILIKE $${params.length} OR owner_name ILIKE $${params.length})`; }
    sql += ` ORDER BY is_featured DESC, is_verified DESC, created_at DESC`;
    const result = await query(sql, params);
    return res.json({ merchants: result.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/merchants — طلب تسجيل تاجر
router.post("/merchants", async (req: Request, res: Response) => {
  try {
    const { shop_name, owner_name, category, description, address, phone, whatsapp, working_hours, logo_emoji, tags } = req.body;
    if (!shop_name || !owner_name || !category) return res.status(400).json({ error: "اسم المحل والمالك والتصنيف مطلوبة" });
    if (!phone && !whatsapp) return res.status(400).json({ error: "رقم التواصل مطلوب" });
    const result = await query(
      `INSERT INTO merchant_spaces (shop_name, owner_name, category, description, address, phone, whatsapp, working_hours, logo_emoji, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [shop_name, owner_name, category, description||null, address||null, phone||null,
       whatsapp||null, working_hours||null, logo_emoji||'🏪', tags||[]]
    );
    return res.status(201).json({ merchant: result.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ────────────────────────────────────────────────────────────────
// مساحة التجار — Admin
// ────────────────────────────────────────────────────────────────

// GET /api/admin/merchants
router.get("/admin/merchants", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.query as Record<string, string>;
    let sql = `SELECT * FROM merchant_spaces`;
    const params: unknown[] = [];
    if (status && status !== "all") { params.push(status); sql += ` WHERE status=$1`; }
    sql += ` ORDER BY is_featured DESC, created_at DESC`;
    const result = await query(sql, params);
    return res.json({ merchants: result.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/admin/merchants/:id
router.put("/admin/merchants/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { id } = req.params;
    const { shop_name, owner_name, category, description, address, phone, whatsapp, working_hours, logo_emoji, tags, status, is_featured, is_verified } = req.body;
    const result = await query(
      `UPDATE merchant_spaces SET
         shop_name=COALESCE($1,shop_name), owner_name=COALESCE($2,owner_name), category=COALESCE($3,category),
         description=COALESCE($4,description), address=COALESCE($5,address), phone=COALESCE($6,phone),
         whatsapp=COALESCE($7,whatsapp), working_hours=COALESCE($8,working_hours), logo_emoji=COALESCE($9,logo_emoji),
         tags=COALESCE($10,tags), status=COALESCE($11,status), is_featured=COALESCE($12,is_featured),
         is_verified=COALESCE($13,is_verified), updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [shop_name||null, owner_name||null, category||null, description||null, address||null,
       phone||null, whatsapp||null, working_hours||null, logo_emoji||null, tags||null,
       status||null, is_featured??null, is_verified??null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json({ merchant: result.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/merchants/:id
router.delete("/admin/merchants/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM merchant_spaces WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
// 📱 محلات الهواتف — Phone Shops (institutional, owner-managed)
// ════════════════════════════════════════════════════════════════

async function initPhoneShopsTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS phone_shops (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      shop_name     TEXT NOT NULL,
      logo_emoji    TEXT DEFAULT '📱',
      owner_name    TEXT NOT NULL,
      phone         TEXT,
      whatsapp      TEXT,
      address       TEXT,
      description   TEXT,
      specialties   TEXT[] DEFAULT '{}',
      working_hours TEXT,
      facebook      TEXT,
      is_verified   BOOLEAN DEFAULT false,
      is_featured   BOOLEAN DEFAULT false,
      is_approved   BOOLEAN DEFAULT false,
      status        TEXT DEFAULT 'pending',
      products_count INTEGER DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS phone_products (
      id             SERIAL PRIMARY KEY,
      shop_id        INTEGER REFERENCES phone_shops(id) ON DELETE CASCADE,
      emoji          TEXT DEFAULT '📱',
      name           TEXT NOT NULL,
      brand          TEXT,
      model          TEXT,
      condition      TEXT DEFAULT 'new',
      price          NUMERIC,
      original_price NUMERIC,
      description    TEXT,
      specs          JSONB DEFAULT '{}',
      tags           TEXT[] DEFAULT '{}',
      color          TEXT,
      storage        TEXT,
      ram            TEXT,
      battery        TEXT,
      screen_size    TEXT,
      camera         TEXT,
      is_available   BOOLEAN DEFAULT true,
      is_featured    BOOLEAN DEFAULT false,
      view_count     INTEGER DEFAULT 0,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
// ─── helper: is owner of shop ────────────────────────────────────
async function isShopOwner(req: Request, shopId: number): Promise<boolean> {
  const user = await getSessionUser(req);
  if (!user) return false;
  const r = await query(`SELECT id FROM phone_shops WHERE id=$1 AND user_id=$2`, [shopId, user.id]);
  return r.rows.length > 0;
}

// ── GET /api/phone-shops ─────────────────────────────────────────
router.get("/phone-shops", async (req: Request, res: Response) => {
  try {
    const { q, specialty } = req.query as Record<string, string>;
    let sql = `SELECT ps.*, (SELECT COUNT(*) FROM phone_products pp WHERE pp.shop_id=ps.id AND pp.is_available=true)::int AS product_count
               FROM phone_shops ps WHERE ps.is_approved=true`;
    const params: unknown[] = [];
    if (specialty && specialty !== "all") {
      params.push(specialty);
      sql += ` AND $${params.length}=ANY(ps.specialties)`;
    }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (ps.shop_name ILIKE $${params.length} OR ps.description ILIKE $${params.length} OR ps.owner_name ILIKE $${params.length})`;
    }
    sql += ` ORDER BY ps.is_featured DESC, ps.is_verified DESC, ps.created_at DESC`;
    const result = await query(sql, params);
    return res.json({ shops: result.rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/phone-shops — register shop ────────────────────────
router.post("/phone-shops", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const { shop_name, owner_name, phone, whatsapp, address, description, specialties, working_hours, facebook, logo_emoji } = req.body;
    if (!shop_name || !owner_name) return res.status(400).json({ error: "اسم المحل والمالك مطلوبان" });
    if (!phone && !whatsapp) return res.status(400).json({ error: "رقم التواصل مطلوب" });
    if (user) {
      const existing = await query(`SELECT id FROM phone_shops WHERE user_id=$1`, [user.id]);
      if (existing.rows.length) return res.status(400).json({ error: "لديك متجر مسجّل بالفعل" });
    }
    const result = await query(
      `INSERT INTO phone_shops (user_id, shop_name, owner_name, phone, whatsapp, address, description, specialties, working_hours, facebook, logo_emoji)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [user?.id ?? null, shop_name, owner_name, phone||null, whatsapp||null, address||null, description||null,
       specialties||[], working_hours||null, facebook||null, logo_emoji||'📱']
    );
    return res.status(201).json({ shop: result.rows[0] });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/my-phone-shop ───────────────────────────────────────
router.get("/my-phone-shop", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const shopRes = await query(`SELECT * FROM phone_shops WHERE user_id=$1`, [user.id]);
    if (!shopRes.rows.length) return res.json({ shop: null });
    const shop = shopRes.rows[0];
    const prods = await query(`SELECT * FROM phone_products WHERE shop_id=$1 ORDER BY is_featured DESC, created_at DESC`, [shop.id]);
    return res.json({ shop, products: prods.rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── PUT /api/my-phone-shop ─── update shop info ──────────────────
router.put("/my-phone-shop", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const { shop_name, owner_name, phone, whatsapp, address, description, specialties, working_hours, facebook, logo_emoji } = req.body;
    const result = await query(
      `UPDATE phone_shops SET shop_name=COALESCE($1,shop_name), owner_name=COALESCE($2,owner_name),
       phone=COALESCE($3,phone), whatsapp=COALESCE($4,whatsapp), address=COALESCE($5,address),
       description=COALESCE($6,description), specialties=COALESCE($7,specialties),
       working_hours=COALESCE($8,working_hours), facebook=COALESCE($9,facebook), logo_emoji=COALESCE($10,logo_emoji)
       WHERE user_id=$11 RETURNING *`,
      [shop_name||null, owner_name||null, phone||null, whatsapp||null, address||null,
       description||null, specialties||null, working_hours||null, facebook||null, logo_emoji||null, user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "متجرك غير موجود" });
    return res.json({ shop: result.rows[0] });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/phone-shops/:id/products ───────────────────────────
router.get("/phone-shops/:id/products", async (req: Request, res: Response) => {
  try {
    const { condition } = req.query as Record<string, string>;
    let sql = `SELECT * FROM phone_products WHERE shop_id=$1 AND is_available=true`;
    const params: unknown[] = [req.params.id];
    if (condition && condition !== "all") { params.push(condition); sql += ` AND condition=$${params.length}`; }
    sql += ` ORDER BY is_featured DESC, created_at DESC`;
    const result = await query(sql, params);
    // increment view counts would be here
    return res.json({ products: result.rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/phone-shops/:id/products ─── add product ──────────
router.post("/phone-shops/:id/products", async (req: Request, res: Response) => {
  try {
    const shopId = Number(req.params.id);
    if (!await isShopOwner(req, shopId)) return res.status(403).json({ error: "غير مصرح — أنت لست صاحب هذا المتجر" });
    const { emoji, name, brand, model, condition, price, original_price, description,
            color, storage, ram, battery, screen_size, camera, tags, is_featured } = req.body;
    if (!name) return res.status(400).json({ error: "اسم المنتج مطلوب" });
    const specs = { color, storage, ram, battery, screen_size, camera };
    const result = await query(
      `INSERT INTO phone_products (shop_id, emoji, name, brand, model, condition, price, original_price,
       description, specs, color, storage, ram, battery, screen_size, camera, tags, is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [shopId, emoji||'📱', name, brand||null, model||null, condition||'new',
       price||null, original_price||null, description||null, specs,
       color||null, storage||null, ram||null, battery||null, screen_size||null, camera||null,
       tags||[], is_featured||false]
    );
    await query(`UPDATE phone_shops SET products_count=products_count+1 WHERE id=$1`, [shopId]);
    return res.status(201).json({ product: result.rows[0] });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── PUT /api/phone-shops/:id/products/:pid ─── edit product ─────
router.put("/phone-shops/:id/products/:pid", async (req: Request, res: Response) => {
  try {
    const shopId = Number(req.params.id);
    if (!await isShopOwner(req, shopId)) return res.status(403).json({ error: "غير مصرح" });
    const { emoji, name, brand, model, condition, price, original_price, description,
            color, storage, ram, battery, screen_size, camera, tags, is_featured, is_available } = req.body;
    const specs = { color, storage, ram, battery, screen_size, camera };
    const result = await query(
      `UPDATE phone_products SET emoji=COALESCE($1,emoji), name=COALESCE($2,name), brand=COALESCE($3,brand),
       model=COALESCE($4,model), condition=COALESCE($5,condition), price=COALESCE($6,price),
       original_price=COALESCE($7,original_price), description=COALESCE($8,description),
       specs=$9, color=COALESCE($10,color), storage=COALESCE($11,storage), ram=COALESCE($12,ram),
       battery=COALESCE($13,battery), screen_size=COALESCE($14,screen_size), camera=COALESCE($15,camera),
       tags=COALESCE($16,tags), is_featured=COALESCE($17,is_featured), is_available=COALESCE($18,is_available)
       WHERE id=$19 AND shop_id=$20 RETURNING *`,
      [emoji||null, name||null, brand||null, model||null, condition||null, price||null,
       original_price||null, description||null, specs,
       color||null, storage||null, ram||null, battery||null, screen_size||null, camera||null,
       tags||null, is_featured??null, is_available??null, req.params.pid, shopId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "المنتج غير موجود" });
    return res.json({ product: result.rows[0] });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── DELETE /api/phone-shops/:id/products/:pid ────────────────────
router.delete("/phone-shops/:id/products/:pid", async (req: Request, res: Response) => {
  try {
    const shopId = Number(req.params.id);
    if (!await isShopOwner(req, shopId)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM phone_products WHERE id=$1 AND shop_id=$2`, [req.params.pid, shopId]);
    await query(`UPDATE phone_shops SET products_count=GREATEST(products_count-1,0) WHERE id=$1`, [shopId]);
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin routes ─────────────────────────────────────────────────
router.get("/admin/phone-shops", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const result = await query(
      `SELECT ps.*, (SELECT COUNT(*) FROM phone_products pp WHERE pp.shop_id=ps.id)::int AS total_products
       FROM phone_shops ps ORDER BY ps.is_approved ASC, ps.created_at DESC`
    );
    return res.json({ shops: result.rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.put("/admin/phone-shops/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { is_approved, is_verified, is_featured, status } = req.body;
    const result = await query(
      `UPDATE phone_shops SET
        is_approved=COALESCE($1,is_approved),
        is_verified=COALESCE($2,is_verified),
        is_featured=COALESCE($3,is_featured),
        status=COALESCE($4,status)
       WHERE id=$5 RETURNING *`,
      [is_approved??null, is_verified??null, is_featured??null, status||null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json({ shop: result.rows[0] });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/phone-shops/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM phone_shops WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
//  EVENTS  – الفعاليات
// ════════════════════════════════════════════════════════════════
setImmediate(() => (async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS events (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER,
      title            TEXT NOT NULL,
      type             TEXT NOT NULL DEFAULT 'other',
      description      TEXT,
      location         TEXT NOT NULL,
      event_date       DATE NOT NULL,
      event_time       TEXT,
      organizer_name   TEXT NOT NULL,
      contact_phone    TEXT,
      is_free          BOOLEAN NOT NULL DEFAULT TRUE,
      price            NUMERIC(12,2),
      capacity         INTEGER,
      registered_count INTEGER NOT NULL DEFAULT 0,
      status           TEXT NOT NULL DEFAULT 'pending',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS event_rentals (
      id                  SERIAL PRIMARY KEY,
      user_id             INTEGER,
      category            TEXT NOT NULL DEFAULT 'other',
      name                TEXT NOT NULL,
      description         TEXT,
      price_per_day       NUMERIC(12,2) NOT NULL DEFAULT 0,
      price_per_event     NUMERIC(12,2),
      quantity_available  INTEGER NOT NULL DEFAULT 1,
      contact_phone       TEXT NOT NULL,
      provider_name       TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'active',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
})().catch(e => logger.error({ err: e }, "events init")));

// ── GET /events ──────────────────────────────
router.get("/events", async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const type   = req.query.type as string;
    const status = (req.query.status as string) || "approved";
    const params: any[] = [status, limit];
    let where = "WHERE status = $1";
    if (type && type !== "all") { where += ` AND type = $${params.length + 1}`; params.push(type); }
    const r = await query(
      `SELECT * FROM events ${where} ORDER BY event_date ASC, created_at DESC LIMIT $2`,
      params
    );
    return res.json(r.rows);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/events/:id", async (req: Request, res: Response) => {
  try {
    const r = await query(`SELECT * FROM events WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/events", async (req: Request, res: Response) => {
  try {
    const { title, type, description, location, event_date, event_time, organizer_name, contact_phone, is_free, price, capacity } = req.body;
    if (!title || !location || !event_date || !organizer_name) return res.status(400).json({ error: "الحقول الإلزامية ناقصة" });
    const userId = (req as any).user?.id ?? null;
    const r = await query(
      `INSERT INTO events (user_id, title, type, description, location, event_date, event_time, organizer_name, contact_phone, is_free, price, capacity, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending') RETURNING *`,
      [userId, title, type || "other", description || null, location, event_date, event_time || null, organizer_name, contact_phone || null, is_free ?? true, price || null, capacity || null]
    );
    return res.status(201).json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/events/:id/register", async (req: Request, res: Response) => {
  try {
    const r = await query(`UPDATE events SET registered_count = registered_count + 1 WHERE id = $1 RETURNING registered_count`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json({ registered_count: r.rows[0].registered_count });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ── Admin events ────────────────────────────
router.get("/admin/events", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM events ORDER BY created_at DESC LIMIT 200`);
    return res.json({ events: r.rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/events/:id/status", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.body;
    const r = await query(`UPDATE events SET status=$1 WHERE id=$2 RETURNING *`, [status, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/events/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM events WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
//  EVENT RENTALS  – تأجير معدات الفعاليات
// ════════════════════════════════════════════════════════════════

router.get("/event-rentals", async (req: Request, res: Response) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const category = req.query.category as string;
    const params: any[] = ["active", limit];
    let where = "WHERE status = $1";
    if (category && category !== "all") { where += ` AND category = $${params.length + 1}`; params.push(category); }
    const r = await query(`SELECT * FROM event_rentals ${where} ORDER BY created_at DESC LIMIT $2`, params);
    return res.json(r.rows);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/event-rentals", async (req: Request, res: Response) => {
  try {
    const { category, name, description, price_per_day, price_per_event, quantity_available, contact_phone, provider_name } = req.body;
    if (!name || !provider_name || !contact_phone) return res.status(400).json({ error: "الحقول الإلزامية ناقصة" });
    const userId = (req as any).user?.id ?? null;
    const r = await query(
      `INSERT INTO event_rentals (user_id, category, name, description, price_per_day, price_per_event, quantity_available, contact_phone, provider_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [userId, category || "other", name, description || null, price_per_day || 0, price_per_event || null, quantity_available || 1, contact_phone, provider_name]
    );
    return res.status(201).json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/event-rentals", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM event_rentals ORDER BY created_at DESC LIMIT 200`);
    return res.json({ rentals: r.rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/event-rentals/:id/status", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.body;
    const r = await query(`UPDATE event_rentals SET status=$1 WHERE id=$2 RETURNING *`, [status, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(r.rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/event-rentals/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM event_rentals WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
// 🔍 المفقودات والموجودات — Lost & Found
// ════════════════════════════════════════════════════════════════

router.get("/lost-items", async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    let sql = `SELECT li.*, u.name as user_display_name FROM lost_items li LEFT JOIN users u ON u.id = li.user_id`;
    const params: unknown[] = [];
    if (status === "lost" || status === "found") {
      sql += ` WHERE li.status=$1`;
      params.push(status);
    }
    sql += ` ORDER BY li.created_at DESC LIMIT 200`;
    const { rows } = await query(sql, params);
    return res.json({ items: rows });
  } catch (e: any) {
    if (e?.code === "42P01") return res.json({ items: [] }); // table not ready yet on cold start
    logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" });
  }
});

router.post("/lost-items", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const { item_name, category, description, last_seen, contact_phone } = req.body;
    if (!item_name?.trim() || !contact_phone?.trim()) {
      return res.status(400).json({ error: "اسم الغرض ورقم التواصل مطلوبان" });
    }
    const reporter_name = user ? (user.name as string) : "مجهول";
    const { rows } = await query(
      `INSERT INTO lost_items (user_id, reporter_name, item_name, category, description, last_seen, contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user?.id ?? null, reporter_name, item_name.trim(), category || "other",
       description || "", last_seen || "", contact_phone.trim()]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/lost-items/:id/status", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const { status } = req.body;
    if (!["lost", "found"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const { rows } = await query(
      `UPDATE lost_items SET status=$1 WHERE id=$2 AND (user_id=$3 OR $4::boolean) RETURNING *`,
      [status, req.params.id, user.id, user.role === "admin"]
    );
    if (!rows.length) return res.status(403).json({ error: "غير مصرح أو غير موجود" });
    return res.json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/lost-items/:id", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const { rows } = await query(
      `DELETE FROM lost_items WHERE id=$1 AND (user_id=$2 OR $3::boolean) RETURNING id`,
      [req.params.id, user.id, user.role === "admin"]
    );
    if (!rows.length) return res.status(403).json({ error: "غير مصرح أو غير موجود" });
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/lost-items", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT li.*, u.name as user_display_name FROM lost_items li LEFT JOIN users u ON u.id = li.user_id ORDER BY li.created_at DESC LIMIT 500`);
    return res.json({ items: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/lost-items/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { item_name, description, last_seen, contact_phone, image_url, status, category, reporter_name } = req.body;
    const { rows } = await query(
      `UPDATE lost_items SET
        item_name=COALESCE($1,item_name),
        description=COALESCE($2,description),
        last_seen=COALESCE($3,last_seen),
        contact_phone=COALESCE($4,contact_phone),
        image_url=COALESCE($5,image_url),
        status=COALESCE($6,status),
        category=COALESCE($7,category),
        reporter_name=COALESCE($8,reporter_name)
       WHERE id=$9 RETURNING *`,
      [item_name, description, last_seen, contact_phone, image_url, status, category, reporter_name, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/lost-items/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM lost_items WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
// ⚽ الرياضة — Sports
// ════════════════════════════════════════════════════════════════

router.get("/sports/posts", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`SELECT * FROM sports_posts ORDER BY created_at DESC LIMIT 100`);
    return res.json({ posts: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/sports/posts", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (user.role !== "admin" && user.role !== "moderator") return res.status(403).json({ error: "غير مصرح" });
    const { title, content, type, team, image_url } = req.body;
    if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });
    const { rows } = await query(
      `INSERT INTO sports_posts (author_name, author_id, title, content, type, team, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user.name, user.id, title.trim(), content.trim(), type || "news", team || null, image_url || null]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/sports/posts/:id/like", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`UPDATE sports_posts SET likes=likes+1 WHERE id=$1 RETURNING likes`, [_req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json({ likes: rows[0].likes });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/sports/posts/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM sports_posts WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/sports/players", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`SELECT * FROM sports_players ORDER BY goals DESC, name ASC LIMIT 200`);
    return res.json({ players: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/sports/players", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, position, team, age, goals, assists, matches_played, photo_url, bio } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "الاسم مطلوب" });
    const { rows } = await query(
      `INSERT INTO sports_players (name, position, team, age, goals, assists, matches_played, photo_url, bio)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name.trim(), position || "", team || "", age || null, goals || 0, assists || 0, matches_played || 0, photo_url || null, bio || null]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/sports/players/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, position, team, age, goals, assists, matches_played, photo_url, bio } = req.body;
    const { rows } = await query(
      `UPDATE sports_players SET name=COALESCE($1,name), position=COALESCE($2,position), team=COALESCE($3,team),
       age=COALESCE($4,age), goals=COALESCE($5,goals), assists=COALESCE($6,assists),
       matches_played=COALESCE($7,matches_played), photo_url=COALESCE($8,photo_url), bio=COALESCE($9,bio)
       WHERE id=$10 RETURNING *`,
      [name, position, team, age, goals, assists, matches_played, photo_url, bio, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/sports/players/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM sports_players WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/sports/matches", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`SELECT * FROM sports_matches ORDER BY match_date DESC LIMIT 100`);
    return res.json({ matches: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/sports/matches", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { home_team, away_team, home_score, away_score, match_date, venue, status, notes } = req.body;
    if (!home_team?.trim() || !away_team?.trim() || !match_date) return res.status(400).json({ error: "الفريقان والتاريخ مطلوبان" });
    const { rows } = await query(
      `INSERT INTO sports_matches (home_team, away_team, home_score, away_score, match_date, venue, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [home_team.trim(), away_team.trim(), home_score ?? null, away_score ?? null, match_date,
       venue || "ملعب الحصاحيصا", status || "upcoming", notes || ""]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/sports/matches/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { home_score, away_score, status, notes } = req.body;
    const { rows } = await query(
      `UPDATE sports_matches SET home_score=COALESCE($1,home_score), away_score=COALESCE($2,away_score),
       status=COALESCE($3,status), notes=COALESCE($4,notes) WHERE id=$5 RETURNING *`,
      [home_score, away_score, status, notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/sports/matches/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM sports_matches WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
// 📞 الأرقام المهمة — Emergency Numbers
// ════════════════════════════════════════════════════════════════

router.get("/emergency-numbers", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`SELECT * FROM emergency_numbers WHERE is_active=TRUE ORDER BY sort_order ASC, name ASC`);
    return res.json({ numbers: rows });
  } catch (e: any) {
    if (e?.code === "42P01") return res.json({ numbers: [] }); // table not ready yet on cold start
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/emergency-numbers", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT * FROM emergency_numbers ORDER BY sort_order ASC, name ASC`);
    return res.json({ numbers: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/emergency-numbers", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, number, category, icon, color, note, sort_order } = req.body;
    if (!name?.trim() || !number?.trim()) return res.status(400).json({ error: "الاسم والرقم مطلوبان" });
    const { rows } = await query(
      `INSERT INTO emergency_numbers (name, number, category, icon, color, note, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name.trim(), number.trim(), category || "general", icon || "call", color || "#F97316", note || "", sort_order || 99]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/emergency-numbers/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, number, category, icon, color, note, sort_order, is_active } = req.body;
    const { rows } = await query(
      `UPDATE emergency_numbers SET
       name=COALESCE($1,name), number=COALESCE($2,number), category=COALESCE($3,category),
       icon=COALESCE($4,icon), color=COALESCE($5,color), note=COALESCE($6,note),
       sort_order=COALESCE($7,sort_order), is_active=COALESCE($8,is_active)
       WHERE id=$9 RETURNING *`,
      [name, number, category, icon, color, note, sort_order, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/emergency-numbers/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM emergency_numbers WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
// 🏢 المنظمات المجتمعية — Organizations
// ════════════════════════════════════════════════════════════════

router.get("/organizations", async (req: Request, res: Response) => {
  try {
    const { type, search } = req.query;
    let sql = `SELECT * FROM organizations WHERE is_active=TRUE`;
    const params: unknown[] = [];
    if (type && type !== "all") { params.push(type); sql += ` AND type=$${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`; }
    sql += ` ORDER BY is_verified DESC, rating DESC`;
    const { rows } = await query(sql, params);
    return res.json({ organizations: rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/organizations", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT * FROM organizations ORDER BY created_at DESC`);
    return res.json({ organizations: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/organizations", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, type, description, full_description, contact_phone, email, members_count, founded_year, goals, needs, rating, is_verified } = req.body;
    if (!name?.trim() || !contact_phone?.trim()) return res.status(400).json({ error: "الاسم والهاتف مطلوبان" });
    const { rows } = await query(
      `INSERT INTO organizations (name,type,description,full_description,contact_phone,email,members_count,founded_year,goals,needs,rating,is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name.trim(),type||"initiative",description||"",full_description||"",contact_phone.trim(),email||null,members_count||0,founded_year||"",goals||[],needs||[],rating||5.0,is_verified||false]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/organizations/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, type, description, full_description, contact_phone, email, members_count, founded_year, goals, needs, rating, is_verified, is_active } = req.body;
    const { rows } = await query(
      `UPDATE organizations SET
        name=COALESCE($1,name), type=COALESCE($2,type), description=COALESCE($3,description),
        full_description=COALESCE($4,full_description), contact_phone=COALESCE($5,contact_phone),
        email=COALESCE($6,email), members_count=COALESCE($7,members_count),
        founded_year=COALESCE($8,founded_year), goals=COALESCE($9,goals), needs=COALESCE($10,needs),
        rating=COALESCE($11,rating), is_verified=COALESCE($12,is_verified), is_active=COALESCE($13,is_active)
       WHERE id=$14 RETURNING *`,
      [name,type,description,full_description,contact_phone,email,members_count,founded_year,goals,needs,rating,is_verified,is_active,req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/organizations/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM organizations WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
// 🤝 شراكات المؤسسات الخارجية — External Partnerships
// ════════════════════════════════════════════════════════════════

// قائمة الشركاء المعتمدين (عام)
router.get("/external-partnerships", async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    let sql = `SELECT id, org_name, org_type, sector, city, country, website, logo_url,
               cooperation_scope, description, services_offered, target_audience, is_featured, created_at
               FROM external_partnerships WHERE status='approved'`;
    const params: unknown[] = [];
    if (type && type !== "all") { params.push(type); sql += ` AND org_type=$${params.length}`; }
    sql += ` ORDER BY is_featured DESC, created_at DESC`;
    const { rows } = await query(sql, params);
    return res.json({ partnerships: rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// تقديم طلب تعاون جديد (عام)
router.post("/external-partnerships/apply", async (req: Request, res: Response) => {
  try {
    const {
      org_name, org_type, sector, city, country, website, logo_url,
      contact_person, contact_role, email, phone, whatsapp,
      cooperation_scope, description, services_offered, target_audience,
    } = req.body || {};
    if (!org_name?.trim() || !contact_person?.trim() || (!email?.trim() && !phone?.trim())) {
      return res.status(400).json({ error: "اسم المؤسسة واسم المسؤول ووسيلة تواصل واحدة على الأقل (هاتف أو إيميل) مطلوبة" });
    }
    const services = Array.isArray(services_offered)
      ? services_offered.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim()).slice(0, 12)
      : [];
    const { rows } = await query(
      `INSERT INTO external_partnerships
       (org_name,org_type,sector,city,country,website,logo_url,contact_person,contact_role,
        email,phone,whatsapp,cooperation_scope,description,services_offered,target_audience)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id, org_name, status, created_at`,
      [
        org_name.trim(), (org_type || "other").trim(), (sector || "").trim(),
        (city || "").trim(), (country || "").trim(), (website || "").trim(), (logo_url || "").trim(),
        contact_person.trim(), (contact_role || "").trim(),
        (email || "").trim(), (phone || "").trim(), (whatsapp || "").trim(),
        (cooperation_scope || "").trim(), (description || "").trim(),
        services, (target_audience || "").trim(),
      ]
    );
    void sendPushToAdmins("🤝 طلب شراكة خارجية جديد", `${org_name.trim()} — ${(sector || "").trim() || org_type || ""}`, { type: "external_partnership", id: rows[0].id });
    return res.status(201).json({ ok: true, application: rows[0], message: "تم استلام طلبكم بنجاح. سيتم مراجعته والرد خلال 48 ساعة." });
  } catch (e) { logger.error({ err: e }, "external-partnerships/apply"); return res.status(500).json({ error: "Server error" }); }
});

// إدارة الطلبات (مسؤول)
router.get("/admin/external-partnerships", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.query;
    let sql = `SELECT * FROM external_partnerships`;
    const params: unknown[] = [];
    if (status && typeof status === "string") { params.push(status); sql += ` WHERE status=$${params.length}`; }
    sql += ` ORDER BY created_at DESC`;
    const { rows } = await query(sql, params);
    return res.json({ partnerships: rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/external-partnerships/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status, admin_notes, is_featured, org_name, org_type, sector, city, country, website, logo_url, cooperation_scope, description, services_offered, target_audience } = req.body || {};
    const reviewed = status && ["approved", "rejected"].includes(status);
    const { rows } = await query(
      `UPDATE external_partnerships SET
         org_name=COALESCE($1,org_name), org_type=COALESCE($2,org_type),
         sector=COALESCE($3,sector), city=COALESCE($4,city), country=COALESCE($5,country),
         website=COALESCE($6,website), logo_url=COALESCE($7,logo_url),
         cooperation_scope=COALESCE($8,cooperation_scope), description=COALESCE($9,description),
         services_offered=COALESCE($10,services_offered), target_audience=COALESCE($11,target_audience),
         status=COALESCE($12,status), admin_notes=COALESCE($13,admin_notes),
         is_featured=COALESCE($14,is_featured),
         reviewed_at=CASE WHEN $15::boolean THEN NOW() ELSE reviewed_at END
       WHERE id=$16 RETURNING *`,
      [org_name, org_type, sector, city, country, website, logo_url, cooperation_scope, description,
       Array.isArray(services_offered) ? services_offered : null,
       target_audience, status, admin_notes, is_featured, reviewed, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/external-partnerships/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM external_partnerships WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
// 🎓 المؤسسات التعليمية — Educational Institutions
// ════════════════════════════════════════════════════════════════

router.get("/educational-institutions", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`SELECT * FROM educational_institutions WHERE is_active=TRUE ORDER BY type, name`);
    return res.json({ institutions: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/educational-institutions", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT * FROM educational_institutions ORDER BY created_at DESC`);
    return res.json({ institutions: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/educational-institutions", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, type, address, phone, principal, email, website, description, grades, shifts, services, status } = req.body;
    if (!name?.trim() || !phone?.trim()) return res.status(400).json({ error: "الاسم والهاتف مطلوبان" });
    const { rows } = await query(
      `INSERT INTO educational_institutions (name,type,address,phone,principal,email,website,description,grades,shifts,services,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [name.trim(),type||"primary",address||"",phone.trim(),principal||null,email||null,website||null,description||null,grades||null,shifts||null,services||[],status||"active"]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/educational-institutions/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, type, address, phone, principal, email, website, description, grades, shifts, services, status, is_active } = req.body;
    const { rows } = await query(
      `UPDATE educational_institutions SET
        name=COALESCE($1,name), type=COALESCE($2,type), address=COALESCE($3,address),
        phone=COALESCE($4,phone), principal=COALESCE($5,principal), email=COALESCE($6,email),
        website=COALESCE($7,website), description=COALESCE($8,description), grades=COALESCE($9,grades),
        shifts=COALESCE($10,shifts), services=COALESCE($11,services), status=COALESCE($12,status),
        is_active=COALESCE($13,is_active)
       WHERE id=$14 RETURNING *`,
      [name,type,address,phone,principal,email,website,description,grades,shifts,services,status,is_active,req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/educational-institutions/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM educational_institutions WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
// 📋 استمارات التسجيل والنقل — Educational Forms
// ════════════════════════════════════════════════════════════════

// ── توليد رقم مرجعي فريد ──
function genRefNumber(prefix: string): string {
  const y = new Date().getFullYear();
  const rnd = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${y}-${rnd}`;
}

// ── POST /api/education/register-student ── تقديم استمارة تسجيل ──
router.post("/education/register-student", async (req: Request, res: Response) => {
  try {
    const {
      institution_id, institution_name, grade, academic_year,
      student_name, student_dob, student_gender, student_nationality,
      previous_school, previous_grade, has_special_needs, special_needs_details,
      parent_name, parent_relation, parent_phone, parent_whatsapp,
      parent_id_number, parent_address, parent_occupation, parent_email,
      notes,
    } = req.body;

    if (!institution_name?.trim()) return res.status(400).json({ error: "اسم المدرسة مطلوب" });
    if (!grade?.trim()) return res.status(400).json({ error: "الصف الدراسي مطلوب" });
    if (!student_name?.trim()) return res.status(400).json({ error: "اسم الطالب مطلوب" });
    if (!parent_name?.trim()) return res.status(400).json({ error: "اسم ولي الأمر مطلوب" });
    if (!parent_phone?.trim()) return res.status(400).json({ error: "هاتف ولي الأمر مطلوب" });

    const reg_number = genRefNumber("REG");
    const { rows } = await query(
      `INSERT INTO student_registrations
        (institution_id, institution_name, grade, academic_year,
         student_name, student_dob, student_gender, student_nationality,
         previous_school, previous_grade, has_special_needs, special_needs_details,
         parent_name, parent_relation, parent_phone, parent_whatsapp,
         parent_id_number, parent_address, parent_occupation, parent_email,
         notes, reg_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        institution_id || null, institution_name.trim(), grade.trim(), academic_year || "2025/2026",
        student_name.trim(), student_dob || null, student_gender || null, student_nationality || "سودانية",
        previous_school || null, previous_grade || null, has_special_needs || false, special_needs_details || null,
        parent_name.trim(), parent_relation || "أب", parent_phone.trim(), parent_whatsapp || null,
        parent_id_number || null, parent_address || null, parent_occupation || null, parent_email || null,
        notes || null, reg_number,
      ]
    );
    return res.status(201).json({ registration: rows[0], reg_number, message: "تم تقديم طلب التسجيل بنجاح" });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/education/my-registrations?phone=xxx ── استعلام بالهاتف ──
router.get("/education/my-registrations", async (req: Request, res: Response) => {
  try {
    const { phone, reg_number } = req.query;
    if (!phone && !reg_number) return res.status(400).json({ error: "رقم الهاتف أو رقم الطلب مطلوب" });
    let sql = `SELECT id, reg_number, institution_name, grade, academic_year,
                      student_name, student_gender, parent_name, parent_phone,
                      status, admin_notes, created_at
               FROM student_registrations WHERE 1=1`;
    const params: unknown[] = [];
    if (phone) { params.push(String(phone).trim()); sql += ` AND parent_phone=$${params.length}`; }
    if (reg_number) { params.push(String(reg_number).trim()); sql += ` AND reg_number=$${params.length}`; }
    sql += ` ORDER BY created_at DESC LIMIT 20`;
    const { rows } = await query(sql, params);
    return res.json({ registrations: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/education/transfer-request ── طلب نقل طالب ──
router.post("/education/transfer-request", async (req: Request, res: Response) => {
  try {
    const {
      from_institution_name, from_grade, from_reg_number,
      to_institution_id, to_institution_name, to_grade,
      student_name, student_dob, student_gender, student_nationality,
      transfer_reason, transfer_reason_detail,
      parent_name, parent_phone, parent_whatsapp,
      parent_id_number, parent_address, parent_email,
      notes,
    } = req.body;

    if (!from_institution_name?.trim()) return res.status(400).json({ error: "اسم المدرسة الحالية مطلوب" });
    if (!to_institution_name?.trim()) return res.status(400).json({ error: "اسم المدرسة المطلوب النقل إليها مطلوب" });
    if (!student_name?.trim()) return res.status(400).json({ error: "اسم الطالب مطلوب" });
    if (!parent_name?.trim()) return res.status(400).json({ error: "اسم ولي الأمر مطلوب" });
    if (!parent_phone?.trim()) return res.status(400).json({ error: "هاتف ولي الأمر مطلوب" });

    const transfer_number = genRefNumber("TRF");
    const { rows } = await query(
      `INSERT INTO student_transfers
        (from_institution_name, from_grade, from_reg_number,
         to_institution_id, to_institution_name, to_grade,
         student_name, student_dob, student_gender, student_nationality,
         transfer_reason, transfer_reason_detail,
         parent_name, parent_phone, parent_whatsapp,
         parent_id_number, parent_address, parent_email,
         notes, transfer_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        from_institution_name.trim(), from_grade || null, from_reg_number || null,
        to_institution_id || null, to_institution_name.trim(), to_grade || null,
        student_name.trim(), student_dob || null, student_gender || null, student_nationality || "سودانية",
        transfer_reason || "أخرى", transfer_reason_detail || null,
        parent_name.trim(), parent_phone.trim(), parent_whatsapp || null,
        parent_id_number || null, parent_address || null, parent_email || null,
        notes || null, transfer_number,
      ]
    );
    return res.status(201).json({ transfer: rows[0], transfer_number, message: "تم تقديم طلب النقل بنجاح" });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/education/my-transfers?phone=xxx ── استعلام النقل ──
router.get("/education/my-transfers", async (req: Request, res: Response) => {
  try {
    const { phone, transfer_number } = req.query;
    if (!phone && !transfer_number) return res.status(400).json({ error: "رقم الهاتف أو رقم الطلب مطلوب" });
    let sql = `SELECT id, transfer_number, from_institution_name, from_grade,
                      to_institution_name, to_grade, student_name,
                      transfer_reason, parent_name, parent_phone,
                      status, admin_notes, created_at
               FROM student_transfers WHERE 1=1`;
    const params: unknown[] = [];
    if (phone) { params.push(String(phone).trim()); sql += ` AND parent_phone=$${params.length}`; }
    if (transfer_number) { params.push(String(transfer_number).trim()); sql += ` AND transfer_number=$${params.length}`; }
    sql += ` ORDER BY created_at DESC LIMIT 20`;
    const { rows } = await query(sql, params);
    return res.json({ transfers: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/education/registrations ── كل طلبات التسجيل ──
router.get("/admin/education/registrations", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status, institution_id, q, page } = req.query;
    const pg = Math.max(1, parseInt(String(page || "1")));
    const limit = 30; const offset = (pg - 1) * limit;
    let sql = `SELECT * FROM student_registrations WHERE 1=1`;
    const params: unknown[] = [];
    if (status && status !== "all") { params.push(status); sql += ` AND status=$${params.length}`; }
    if (institution_id) { params.push(institution_id); sql += ` AND institution_id=$${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND (student_name ILIKE $${params.length} OR parent_name ILIKE $${params.length} OR reg_number ILIKE $${params.length})`; }
    const { rows: total } = await query(`SELECT COUNT(*) as cnt FROM (${sql}) t`, params);
    params.push(limit, offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const { rows } = await query(sql, params);
    return res.json({ registrations: rows, total: parseInt(total[0]?.cnt || "0"), page: pg });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/education/registrations/:id ── تحديث حالة التسجيل ──
router.patch("/admin/education/registrations/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status, admin_notes } = req.body;
    const { rows } = await query(
      `UPDATE student_registrations SET
        status=COALESCE($1,status), admin_notes=COALESCE($2,admin_notes),
        updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status, admin_notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json({ registration: rows[0] });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/education/transfers ── كل طلبات النقل ──
router.get("/admin/education/transfers", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status, q, page } = req.query;
    const pg = Math.max(1, parseInt(String(page || "1")));
    const limit = 30; const offset = (pg - 1) * limit;
    let sql = `SELECT * FROM student_transfers WHERE 1=1`;
    const params: unknown[] = [];
    if (status && status !== "all") { params.push(status); sql += ` AND status=$${params.length}`; }
    if (q) { params.push(`%${q}%`); sql += ` AND (student_name ILIKE $${params.length} OR parent_name ILIKE $${params.length} OR transfer_number ILIKE $${params.length})`; }
    const { rows: total } = await query(`SELECT COUNT(*) as cnt FROM (${sql}) t`, params);
    params.push(limit, offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const { rows } = await query(sql, params);
    return res.json({ transfers: rows, total: parseInt(total[0]?.cnt || "0"), page: pg });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/education/transfers/:id ── تحديث حالة النقل ──
router.patch("/admin/education/transfers/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status, admin_notes } = req.body;
    const { rows } = await query(
      `UPDATE student_transfers SET
        status=COALESCE($1,status), admin_notes=COALESCE($2,admin_notes),
        updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status, admin_notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json({ transfer: rows[0] });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/education/stats ── إحصائيات ──
router.get("/admin/education/stats", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const [regStats, transStats, instCount] = await Promise.all([
      query(`SELECT status, COUNT(*) as cnt FROM student_registrations GROUP BY status`),
      query(`SELECT status, COUNT(*) as cnt FROM student_transfers GROUP BY status`),
      query(`SELECT COUNT(*) as cnt FROM educational_institutions WHERE is_active=TRUE`),
    ]);
    return res.json({
      registrations: regStats.rows,
      transfers: transStats.rows,
      total_institutions: parseInt(instCount.rows[0]?.cnt || "0"),
    });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ════════════════════════════════════════════════════════════════
// 👩 خدمات المرأة — Women Services
// ════════════════════════════════════════════════════════════════

router.get("/women-services", async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    let sql = `SELECT * FROM women_services WHERE is_active=TRUE`;
    const params: unknown[] = [];
    if (type && type !== "all") { params.push(type); sql += ` AND type=$${params.length}`; }
    sql += ` ORDER BY rating DESC, name`;
    const { rows } = await query(sql, params);
    return res.json({ services: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/women-services", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT * FROM women_services ORDER BY created_at DESC`);
    return res.json({ services: rows });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/women-services", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, type, address, phone, hours, description, rating, tags } = req.body;
    if (!name?.trim() || !phone?.trim()) return res.status(400).json({ error: "الاسم والهاتف مطلوبان" });
    const { rows } = await query(
      `INSERT INTO women_services (name,type,address,phone,hours,description,rating,tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name.trim(),type||"salon",address||"",phone.trim(),hours||"",description||"",rating||5.0,tags||[]]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/women-services/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, type, address, phone, hours, description, rating, tags, is_active } = req.body;
    const { rows } = await query(
      `UPDATE women_services SET
        name=COALESCE($1,name), type=COALESCE($2,type), address=COALESCE($3,address),
        phone=COALESCE($4,phone), hours=COALESCE($5,hours), description=COALESCE($6,description),
        rating=COALESCE($7,rating), tags=COALESCE($8,tags), is_active=COALESCE($9,is_active)
       WHERE id=$10 RETURNING *`,
      [name,type,address,phone,hours,description,rating,tags,is_active,req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/women-services/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM women_services WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════
// ── وظائف العمل (Jobs) ──
// ══════════════════════════════════════════════════════

// GET /api/jobs — قائمة الوظائف العامة
router.get("/jobs", async (req: Request, res: Response) => {
  try {
    const { type, limit = "50" } = req.query;
    let q = `SELECT * FROM jobs WHERE is_active=true`;
    const params: any[] = [];
    if (type && type !== "all") { q += ` AND type=$${params.length + 1}`; params.push(type); }
    q += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));
    const { rows } = await query(q, params);
    return res.json(rows);
  } catch (e: any) {
    if (e?.code === "42P01") return res.json([]); // table not ready yet on cold start
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/jobs — نشر وظيفة (مستخدم مسجّل)
router.post("/jobs", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    const { title, company, type, location, description, contact_phone, salary } = req.body;
    if (!title || !description) return res.status(400).json({ error: "العنوان والوصف مطلوبان" });
    const { rows } = await query(
      `INSERT INTO jobs (user_id, author_name, title, company, type, location, description, contact_phone, salary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [me.id, me.name, title, company ?? "", type ?? "fulltime", location ?? "الحصاحيصا", description, contact_phone ?? "", salary ?? null]
    );
    return res.status(201).json(rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/jobs/:id — تعديل وظيفة
router.patch("/jobs/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    const { rows: existing } = await query(`SELECT * FROM jobs WHERE id=$1`, [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: "الوظيفة غير موجودة" });
    if (existing[0].user_id !== me.id && me.role !== "admin" && me.role !== "moderator")
      return res.status(403).json({ error: "غير مصرح" });
    const { title, company, type, location, description, contact_phone, salary, is_active } = req.body;
    const { rows } = await query(
      `UPDATE jobs SET
        title=COALESCE($1,title), company=COALESCE($2,company), type=COALESCE($3,type),
        location=COALESCE($4,location), description=COALESCE($5,description),
        contact_phone=COALESCE($6,contact_phone), salary=COALESCE($7,salary),
        is_active=COALESCE($8,is_active) WHERE id=$9 RETURNING *`,
      [title, company, type, location, description, contact_phone, salary, is_active, req.params.id]
    );
    return res.json(rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/jobs/:id — حذف وظيفة
router.delete("/jobs/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    const { rows: existing } = await query(`SELECT * FROM jobs WHERE id=$1`, [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: "الوظيفة غير موجودة" });
    if (existing[0].user_id !== me.id && me.role !== "admin" && me.role !== "moderator")
      return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM jobs WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/jobs — كل الوظائف للإدارة
router.get("/admin/jobs", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.query;
    let q = `SELECT j.*, u.name as user_name_ref FROM jobs j LEFT JOIN users u ON u.id=j.user_id`;
    if (status === "active") q += ` WHERE j.is_active=true`;
    else if (status === "inactive") q += ` WHERE j.is_active=false`;
    q += ` ORDER BY j.created_at DESC`;
    const { rows } = await query(q);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/jobs/:id — تفعيل/تعطيل وظيفة
router.patch("/admin/jobs/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) return res.status(403).json({ error: "غير مصرح" });
    const { is_active, title, company, type, location, description, contact_phone, salary } = req.body;
    await query(
      `UPDATE jobs SET
        is_active=COALESCE($1,is_active), title=COALESCE($2,title), company=COALESCE($3,company),
        type=COALESCE($4,type), location=COALESCE($5,location), description=COALESCE($6,description),
        contact_phone=COALESCE($7,contact_phone), salary=COALESCE($8,salary)
       WHERE id=$9`,
      [is_active, title, company, type, location, description, contact_phone, salary, req.params.id]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/jobs/:id — حذف وظيفة (مدير)
router.delete("/admin/jobs/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM jobs WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════
// ── إحصائيات Dashboard الشاملة ──
// ══════════════════════════════════════════════════════

// GET /api/admin/full-stats — إحصائيات شاملة لجميع الأقسام
router.get("/admin/full-stats", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) return res.status(403).json({ error: "غير مصرح" });
    const [
      users, posts, jobs, reports, missing, transport,
      events, merchants, ads, sports, notifications
    ] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt, COUNT(CASE WHEN role='admin' THEN 1 END) AS admins,
             COUNT(CASE WHEN role='moderator' THEN 1 END) AS moderators,
             COUNT(CASE WHEN created_at > NOW()-INTERVAL '7 days' THEN 1 END) AS new_this_week
             FROM users`),
      query(`SELECT COUNT(*) AS cnt,
             COUNT(CASE WHEN created_at > NOW()-INTERVAL '24 hours' THEN 1 END) AS today
             FROM social_posts`),
      query(`SELECT COUNT(*) AS cnt,
             COUNT(CASE WHEN is_active=true THEN 1 END) AS active
             FROM jobs`),
      query(`SELECT COUNT(*) AS cnt,
             COUNT(CASE WHEN status='open' THEN 1 END) AS open
             FROM citizen_reports`),
      query(`SELECT COUNT(*) AS cnt,
             COUNT(CASE WHEN status='lost' THEN 1 END) AS lost,
             COUNT(CASE WHEN status='found' THEN 1 END) AS found
             FROM lost_items`),
      query(`SELECT COUNT(*) AS total_trips,
             COUNT(CASE WHEN status='pending' THEN 1 END) AS pending,
             COUNT(CASE WHEN status='active' THEN 1 END) AS active,
             COUNT(CASE WHEN status='completed' THEN 1 END) AS completed,
             (SELECT COUNT(*) FROM transport_drivers WHERE status='approved') AS drivers,
             (SELECT COUNT(*) FROM transport_drivers WHERE is_online=true) AS online_drivers
             FROM transport_trips`),
      query(`SELECT COUNT(*) AS cnt FROM events`),
      query(`SELECT COUNT(*) AS cnt, COUNT(CASE WHEN status='approved' THEN 1 END) AS active FROM merchant_spaces`),
      query(`SELECT COUNT(*) AS cnt, COUNT(CASE WHEN status='approved' THEN 1 END) AS active FROM ads`),
      query(`SELECT COUNT(*) AS posts FROM sports_posts`),
      query(`SELECT COUNT(*) AS cnt, COUNT(CASE WHEN is_read=false THEN 1 END) AS unread FROM notifications`),
    ]);
    const zawajil = await query(`SELECT COUNT(*) AS total, COUNT(CASE WHEN status='pending_review' THEN 1 END) AS pending, COUNT(CASE WHEN status='approved' THEN 1 END) AS approved, COUNT(CASE WHEN status='completed' THEN 1 END) AS completed FROM zawajil_orders`).catch(() => ({ rows: [{ total:"0", pending:"0", approved:"0", completed:"0" }] }));
    return res.json({
      users: users.rows[0],
      posts: posts.rows[0],
      jobs: jobs.rows[0],
      reports: reports.rows[0],
      missing: missing.rows[0],
      transport: transport.rows[0],
      events: events.rows[0],
      merchants: merchants.rows[0],
      ads: ads.rows[0],
      sports: sports.rows[0],
      notifications: notifications.rows[0],
      zawajil: zawajil.rows[0],
    });
  } catch (e: any) { logger.error({ err: e?.message }, ""); return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════
// ── إرسال Push Notifications (Expo Push API) ──
// ══════════════════════════════════════════════════════

async function sendExpoPushToUser(userId: number, title: string, body: string, data?: any) {
  try {
    const { rows } = await query(`SELECT token FROM push_tokens WHERE user_id=$1`, [userId]);
    if (!rows.length) return;
    const messages = rows
      .filter((r: any) => r.token && r.token.startsWith("ExponentPushToken"))
      .map((r: any) => ({ to: r.token, title, body, data: data ?? {}, sound: "default", badge: 1 }));
    if (!messages.length) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "accept-encoding": "gzip, deflate" },
      body: JSON.stringify(messages),
    });
  } catch (e) { logger.error({ err: e }, "Push send error"); }
}

async function sendExpoPushBroadcast(title: string, body: string, data?: any) {
  try {
    const { rows } = await query(`SELECT token FROM push_tokens WHERE token LIKE 'ExponentPushToken%'`);
    if (!rows.length) return;
    const chunks: any[][] = [];
    for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
    for (const chunk of chunks) {
      const messages = chunk.map((r: any) => ({ to: r.token, title, body, data: data ?? {}, sound: "default" }));
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      });
    }
  } catch (e) { logger.error({ err: e }, "Broadcast error"); }
}

// POST /api/admin/push/broadcast — إشعار جماعي لجميع المستخدمين
router.post("/admin/push/broadcast", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const { title, body, data } = req.body;
    if (!title || !body) return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });
    // حفظ في DB
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       SELECT id, 'broadcast', $1, $2, $3 FROM users`,
      [title, body, JSON.stringify(data ?? {})]
    );
    // إرسال Push
    await sendExpoPushBroadcast(title, body, data);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/push/user/:id — إشعار لمستخدم محدد
router.post("/admin/push/user/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) return res.status(403).json({ error: "غير مصرح" });
    const { title, body, data } = req.body;
    if (!title || !body) return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });
    const targetId = Number(req.params.id);
    await query(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'direct',$2,$3,$4)`,
      [targetId, title, body, JSON.stringify(data ?? {})]
    );
    await sendExpoPushToUser(targetId, title, body, data);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/push/tokens — عدد أجهزة الإشعارات المسجّلة
router.get("/admin/push/tokens", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || (me.role !== "admin" && me.role !== "moderator")) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT COUNT(*) AS total,
       COUNT(CASE WHEN token LIKE 'ExponentPushToken%' THEN 1 END) AS expo_tokens,
       COUNT(DISTINCT user_id) AS unique_users FROM push_tokens`
    );
    return res.json(rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// المحامون والخدمات القانونية
// ═══════════════════════════════════════════════════════════════════════════

// قائمة المحامين (مع متوسط التقييم وعدد المراجعات)
router.get("/lawyers", async (req: Request, res: Response) => {
  try {
    const specialty = String(req.query.specialty || "").trim();
    const search    = String(req.query.search || "").trim();
    const params: any[] = [];
    let where = "l.is_active = TRUE";
    if (specialty) { params.push(`%${specialty}%`); where += ` AND l.specialties ILIKE $${params.length}`; }
    if (search)    { params.push(`%${search}%`);    where += ` AND (l.full_name ILIKE $${params.length} OR l.specialties ILIKE $${params.length} OR l.district ILIKE $${params.length})`; }
    const { rows } = await query(
      `SELECT l.*,
              COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM ratings r WHERE r.entity_id = l.entity_id),0)::float AS avg_rating,
              COALESCE((SELECT COUNT(*) FROM ratings r WHERE r.entity_id = l.entity_id),0)::int AS review_count,
              p.name AS plan_name, p.name_ar AS plan_name_ar, p.color AS plan_color, p.icon AS plan_icon,
              p.has_priority, p.has_unlimited_contacts, p.monthly_contacts AS plan_monthly_contacts
         FROM lawyers l
         LEFT JOIN lawyer_subscriptions s ON s.lawyer_id=l.id AND s.is_active=TRUE
         LEFT JOIN lawyer_subscription_plans p ON p.id=s.plan_id
        WHERE ${where}
       ORDER BY p.sort_order NULLS LAST, l.is_featured DESC, l.experience_y DESC, l.id`, params
    );
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// تفاصيل محامي + خدماته
router.get("/lawyers/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      `SELECT l.*,
              COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM ratings r WHERE r.entity_id = l.entity_id),0)::float AS avg_rating,
              COALESCE((SELECT COUNT(*) FROM ratings r WHERE r.entity_id = l.entity_id),0)::int AS review_count
       FROM lawyers l WHERE l.id = $1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const services = await query(`SELECT * FROM lawyer_services WHERE lawyer_id = $1 AND is_active = TRUE ORDER BY sort_order, id`, [id]);
    const reviews  = await query(
      `SELECT r.id, r.rating, r.comment, r.created_at,
              COALESCE(u.name, 'مستخدم') AS user_name
       FROM ratings r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.entity_id = $1 ORDER BY r.created_at DESC LIMIT 30`,
      [rows[0].entity_id]
    );
    return res.json({ ...rows[0], services: services.rows, reviews: reviews.rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// إعلانات المحامين النشطة
router.get("/lawyer-ads", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT a.*, l.full_name AS lawyer_name FROM lawyer_ads a
       LEFT JOIN lawyers l ON l.id = a.lawyer_id
       WHERE a.is_active = TRUE AND (a.ends_at IS NULL OR a.ends_at > NOW())
       ORDER BY a.sort_order, a.id`
    );
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// إنشاء عقد / طلب خدمة
router.post("/lawyers/:id/contracts", async (req: Request, res: Response) => {
  try {
    const lawyerId = Number(req.params.id);
    const { service_id, client_name, client_phone, service_title, details, preferred_date, device_id } = req.body || {};
    if (!client_name || !client_phone) return res.status(400).json({ error: "الاسم ورقم الهاتف مطلوبان" });
    // user من token إن وجد
    let userId: number | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        const token = auth.slice(7);
        const sess = await query(`SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()`, [token]);
        if (sess.rows[0]) userId = sess.rows[0].user_id;
      } catch {}
    }
    const contractNo = `CT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const ins = await query(
      `INSERT INTO lawyer_contracts (lawyer_id, service_id, user_id, device_id, client_name, client_phone, service_title, details, preferred_date, contract_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [lawyerId, service_id || null, userId, device_id || null, String(client_name).slice(0,150), String(client_phone).slice(0,25),
       String(service_title || "").slice(0,200), String(details || "").slice(0,2000), preferred_date || null, contractNo]
    );
    return res.json(ins.rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// عقود المستخدم (بحسب user_id أو device_id)
router.get("/my-lawyer-contracts", async (req: Request, res: Response) => {
  try {
    const deviceId = String(req.query.device_id || "").trim();
    let userId: number | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        const token = auth.slice(7);
        const sess = await query(`SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()`, [token]);
        if (sess.rows[0]) userId = sess.rows[0].user_id;
      } catch {}
    }
    if (!userId && !deviceId) return res.json([]);
    const { rows } = await query(
      `SELECT c.*, l.full_name AS lawyer_name, l.phone AS lawyer_phone, l.title AS lawyer_title
       FROM lawyer_contracts c JOIN lawyers l ON l.id = c.lawyer_id
       WHERE ${userId ? `c.user_id = $1` : `c.device_id = $1`}
       ORDER BY c.created_at DESC LIMIT 50`,
      [userId || deviceId]
    );
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// تقييم محامي (يستخدم نظام التقييم القائم لكن بـ entity_id)
router.post("/lawyers/:id/ratings", async (req: Request, res: Response) => {
  try {
    const lawyerId = Number(req.params.id);
    const { rating, comment, device_id } = req.body || {};
    const r = Math.max(1, Math.min(5, Number(rating) || 0));
    if (!r) return res.status(400).json({ error: "التقييم بين 1 و 5" });
    const lw = await query(`SELECT entity_id FROM lawyers WHERE id = $1`, [lawyerId]);
    if (!lw.rows[0]?.entity_id) return res.status(404).json({ error: "Not found" });
    let userId: number | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        const token = auth.slice(7);
        const sess = await query(`SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()`, [token]);
        if (sess.rows[0]) userId = sess.rows[0].user_id;
      } catch {}
    }
    await query(
      `INSERT INTO ratings (entity_id, rating, comment, target_type, target_id, user_id, device_id)
       VALUES ($1,$2,$3,'lawyer',$4,$5,$6)`,
      [lw.rows[0].entity_id, r, String(comment || "").slice(0,500), String(lawyerId), userId, device_id || null]
    );
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// قائمة الاستمارات القانونية (للقراءة العامة)
router.get("/legal-forms", async (req: Request, res: Response) => {
  try {
    const cat = String(req.query.category || "").trim();
    const params: any[] = [];
    let where = "1=1";
    if (cat) { params.push(cat); where += ` AND category = $${params.length}`; }
    const { rows } = await query(
      `SELECT id, title, category, description, is_official, sort_order FROM legal_forms WHERE ${where} ORDER BY sort_order, id`,
      params
    );
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// تقديم طلب انضمام محامٍ (عام)
router.post("/lawyer-applications", async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.full_name || !b.phone || !b.bar_number || !b.specialties)
      return res.status(400).json({ error: "الاسم والهاتف ورقم النقابة والتخصصات مطلوبة" });
    if (!b.agree_terms)
      return res.status(400).json({ error: "يجب الموافقة على شروط التعاقد" });
    const sessionUser = await getSessionUser(req);
    let userId: number | null = sessionUser ? (sessionUser.id as number) : null;
    // منع التكرار من نفس الهاتف خلال 24 ساعة
    const dup = await query(
      `SELECT id, status FROM lawyer_applications WHERE phone = $1 AND created_at > NOW() - INTERVAL '24 hours' ORDER BY id DESC LIMIT 1`,
      [String(b.phone).slice(0,25)]
    );
    if (dup.rows[0] && dup.rows[0].status === 'pending')
      return res.status(409).json({ error: "لديك طلب قيد المراجعة بهذا الرقم" });
    const ins = await query(
      `INSERT INTO lawyer_applications
       (full_name,title,phone,whatsapp,email,bar_number,experience_y,specialties,bio,office_addr,district,languages,consult_fee,bar_card_url,photo_url,agree_terms,device_id,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id, created_at`,
      [
        String(b.full_name).slice(0,150),
        String(b.title || "محامي").slice(0,120),
        String(b.phone).slice(0,25),
        String(b.whatsapp || "").slice(0,25),
        String(b.email || "").slice(0,150),
        String(b.bar_number).slice(0,50),
        Number(b.experience_y) || 0,
        String(b.specialties).slice(0,500),
        String(b.bio || "").slice(0,2000),
        String(b.office_addr || "").slice(0,250),
        String(b.district || "").slice(0,100),
        String(b.languages || "العربية").slice(0,150),
        String(b.consult_fee || "").slice(0,80),
        String(b.bar_card_url || "").slice(0,1000),
        String(b.photo_url || "").slice(0,1000),
        true,
        b.device_id || null,
        userId,
      ]
    );
    void sendPushToAdmins("⚖️ طلب انضمام محامٍ جديد", `${String(b.full_name).slice(0,60)} — ${String(b.specialties).slice(0,60)}`, { type: "lawyer_application", id: ins.rows[0].id });
    return res.json({ ok: true, application_id: ins.rows[0].id, created_at: ins.rows[0].created_at });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// متابعة طلب الانضمام (للمتقدّم)
router.get("/lawyer-applications/mine", async (req: Request, res: Response) => {
  try {
    const deviceId = String(req.query.device_id || "").trim();
    let userId: number | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        const t = auth.slice(7);
        const sess = await query(`SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()`, [t]);
        if (sess.rows[0]) userId = sess.rows[0].user_id;
      } catch {}
    }
    if (!userId && !deviceId) return res.json([]);
    const { rows } = await query(
      `SELECT id, full_name, status, admin_note, lawyer_id, created_at, reviewed_at
       FROM lawyer_applications
       WHERE ${userId ? `user_id = $1` : `device_id = $1`}
       ORDER BY created_at DESC LIMIT 10`,
      [userId || deviceId]
    );
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// قائمة طلبات الانضمام (إدارة)
router.get("/admin/lawyer-applications", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const status = String(req.query.status || "").trim();
    const params: any[] = [];
    let where = "1=1";
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    const { rows } = await query(
      `SELECT * FROM lawyer_applications WHERE ${where}
       ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC`,
      params
    );
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// قبول طلب انضمام → ينشئ المحامي تلقائياً (تعاقد)
router.post("/admin/lawyer-applications/:id/approve", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const id = Number(req.params.id);
    const { admin_note, is_featured } = req.body || {};
    const { rows } = await query(`SELECT * FROM lawyer_applications WHERE id = $1`, [id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    if (rows[0].status === "approved") return res.status(400).json({ error: "تم قبول الطلب مسبقاً" });
    const a = rows[0];
    // 1) أنشئ rated_entity
    const ent = await query(
      `INSERT INTO rated_entities (type, name, subtitle, category, phone, district, notes, is_verified)
       VALUES ('lawyer',$1,$2,'قانون',$3,$4,$5,TRUE) RETURNING id`,
      [a.full_name, a.title, a.phone, a.district, a.bio]
    );
    // 2) أنشئ المحامي
    const lw = await query(
      `INSERT INTO lawyers
       (full_name,title,specialties,bio,phone,whatsapp,email,office_addr,district,bar_number,experience_y,languages,consult_fee,photo_url,is_featured,is_verified,is_active,entity_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,TRUE,$16) RETURNING id`,
      [a.full_name, a.title, a.specialties, a.bio, a.phone, a.whatsapp, a.email, a.office_addr,
       a.district, a.bar_number, a.experience_y, a.languages, a.consult_fee, a.photo_url, !!is_featured, ent.rows[0].id]
    );
    // 3) حدّث الطلب
    await query(
      `UPDATE lawyer_applications SET status='approved', admin_note=$2, reviewed_at=NOW(), lawyer_id=$3 WHERE id=$1`,
      [id, String(admin_note || "").slice(0, 500), lw.rows[0].id]
    );
    return res.json({ ok: true, lawyer_id: lw.rows[0].id });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// تحقّق عام من صحة عقد محامي عبر رقم العقد (للقراءة فقط — للاستخدام من رمز QR)
// يقبل LAW-00012-2026 ويستخرج id = 12
router.get("/lawyer-applications/verify/:contractNo", async (req: Request, res: Response) => {
  try {
    const cn = String(req.params.contractNo || "");
    const m = cn.match(/^LAW-(\d{1,9})-(\d{4})$/i);
    if (!m) return res.status(400).json({ valid: false, error: "صيغة رقم العقد غير صحيحة" });
    const id = Number(m[1]);
    const { rows } = await query(
      `SELECT id, full_name, title, bar_number, district, status, reviewed_at, created_at, lawyer_id
         FROM lawyer_applications WHERE id = $1`, [id]
    );
    const a = rows[0];
    if (!a) return res.status(404).json({ valid: false, error: "العقد غير موجود في السجلات" });
    const isApproved = a.status === "approved";
    return res.json({
      valid: isApproved,
      contract_no: cn.toUpperCase(),
      status: a.status,
      status_ar: isApproved ? "موثّق ومعتمد" : (a.status === "pending" ? "قيد المراجعة (غير موثّق)" : "مرفوض"),
      lawyer: {
        full_name: a.full_name, title: a.title, bar_number: a.bar_number, district: a.district,
      },
      issued_at: a.created_at,
      approved_at: a.reviewed_at,
      lawyer_id: a.lawyer_id,
      issuer: "تطبيق حصاحيصاوي — القسم القانوني",
      note: isApproved
        ? "الوثيقة موثّقة رسمياً ومعتمدة من إدارة المنصة"
        : "هذه النسخة مسودّة/قيد المراجعة ولا تعتبر عقداً موثّقاً",
    });
  } catch (e) { logger.error({ err: e }, "route error"); return res.status(500).json({ valid: false, error: "خطأ في الخادم" }); }
});

// رفض طلب انضمام
router.post("/admin/lawyer-applications/:id/reject", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const id = Number(req.params.id);
    const { admin_note } = req.body || {};
    const r = await query(
      `UPDATE lawyer_applications SET status='rejected', admin_note=$2, reviewed_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING id`,
      [id, String(admin_note || "").slice(0, 500)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Not found or already reviewed" });
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── خطط الاشتراك (عام) ──────────────────────────────────────
router.get("/subscription-plans", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`SELECT * FROM lawyer_subscription_plans WHERE is_active=TRUE ORDER BY sort_order`);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── اشتراك محامي بعينه (عام — يُرجع بيانات الخطة) ──────────
router.get("/lawyers/:id/subscription", async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT s.*, p.name, p.name_ar, p.color, p.icon, p.price_label,
              p.has_unlimited_contacts, p.has_ads, p.has_featured, p.has_verified_badge,
              p.has_priority, p.monthly_contacts
         FROM lawyer_subscriptions s
         JOIN lawyer_subscription_plans p ON p.id = s.plan_id
        WHERE s.lawyer_id = $1 AND s.is_active = TRUE`,
      [Number(req.params.id)]
    );
    return res.json(rows[0] || null);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── نظرة عامة على الاشتراكات (إدارة) ───────────────────────
router.get("/admin/subscriptions", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT l.id AS lawyer_id, l.full_name, l.phone, l.district,
              p.name AS plan_name, p.name_ar AS plan_name_ar, p.color, p.icon, p.price_label,
              s.commission_pct, s.started_at, s.expires_at, s.payment_ref, s.admin_note,
              COALESCE((SELECT COUNT(*) FROM lawyer_contracts WHERE lawyer_id=l.id),0)::int AS contracts_count
         FROM lawyers l
         LEFT JOIN lawyer_subscriptions s ON s.lawyer_id=l.id AND s.is_active=TRUE
         LEFT JOIN lawyer_subscription_plans p ON p.id=s.plan_id
        ORDER BY p.sort_order NULLS LAST, l.id DESC`
    );
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── تعيين/تحديث اشتراك محامي (إدارة) ──────────────────────
router.put("/admin/lawyers/:id/subscription", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const lawyerId = Number(req.params.id);
    const { plan_name, commission_pct, expires_at, payment_ref, admin_note } = req.body || {};
    if (!plan_name) return res.status(400).json({ error: "plan_name مطلوب" });
    const planR = await query(`SELECT id, commission_pct AS default_com FROM lawyer_subscription_plans WHERE name=$1`, [plan_name]);
    if (!planR.rows[0]) return res.status(400).json({ error: "خطة غير موجودة" });
    const planId = planR.rows[0].id;
    const com = commission_pct !== undefined ? Number(commission_pct) : Number(planR.rows[0].default_com);
    await query(
      `INSERT INTO lawyer_subscriptions (lawyer_id, plan_id, commission_pct, expires_at, payment_ref, admin_note, started_at)
          VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (lawyer_id) DO UPDATE
          SET plan_id=$2, commission_pct=$3, expires_at=$4, payment_ref=$5, admin_note=$6,
              started_at=NOW(), is_active=TRUE`,
      [lawyerId, planId, com, expires_at || null, String(payment_ref||"").slice(0,120), String(admin_note||"").slice(0,500)]
    );
    // تسجيل التاريخ
    const planNameR = await query(`SELECT name, name_ar FROM lawyer_subscription_plans WHERE id=$1`, [planId]);
    if (planNameR.rows[0]) {
      await query(
        `INSERT INTO lawyer_subscription_history (lawyer_id, plan_name, plan_name_ar, commission_pct, expires_at, payment_ref, admin_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [lawyerId, planNameR.rows[0].name, planNameR.rows[0].name_ar, com, expires_at || null,
         String(payment_ref||"").slice(0,120), String(admin_note||"").slice(0,500)]
      );
    }
    // مزامنة is_featured و is_verified مع الخطة
    const planInfo = await query(`SELECT has_featured, has_verified_badge FROM lawyer_subscription_plans WHERE id=$1`, [planId]);
    if (planInfo.rows[0]) {
      const { has_featured, has_verified_badge } = planInfo.rows[0];
      await query(`UPDATE lawyers SET is_featured=$1, is_verified=$2 WHERE id=$3`, [has_featured, has_verified_badge, lawyerId]);
    }
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── إحصائيات الاشتراكات (إدارة) ────────────────────────────
router.get("/admin/subscription-stats", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT p.name, p.name_ar, p.icon, p.price_sdg, p.color,
              COUNT(s.id)::int AS subscribers,
              COALESCE(SUM(p.price_sdg), 0)::int AS monthly_revenue,
              AVG(s.commission_pct)::numeric(5,2) AS avg_commission
         FROM lawyer_subscription_plans p
         LEFT JOIN lawyer_subscriptions s ON s.plan_id=p.id AND s.is_active=TRUE
        GROUP BY p.id ORDER BY p.sort_order`
    );
    const total = await query(`SELECT COUNT(*)::int AS c FROM lawyer_subscriptions WHERE is_active=TRUE`);
    const free_count = await query(
      `SELECT COUNT(*)::int AS c FROM lawyers l WHERE NOT EXISTS
        (SELECT 1 FROM lawyer_subscriptions s JOIN lawyer_subscription_plans p ON p.id=s.plan_id
          WHERE s.lawyer_id=l.id AND s.is_active=TRUE AND p.name != 'free')`
    );
    return res.json({ plans: rows, total_paid: total.rows[0].c, free_lawyers: free_count.rows[0].c });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// قائمة المحامين للإدارة (يشمل غير الفعّال + بيانات الاشتراك)
router.get("/admin/lawyers", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT l.*,
              COALESCE((SELECT COUNT(*) FROM lawyer_contracts WHERE lawyer_id = l.id),0)::int AS contracts_count,
              p.name AS plan_name, p.name_ar AS plan_name_ar, p.color AS plan_color, p.icon AS plan_icon,
              s.commission_pct AS sub_commission, s.expires_at AS sub_expires, s.started_at AS sub_started
         FROM lawyers l
         LEFT JOIN lawyer_subscriptions s ON s.lawyer_id=l.id AND s.is_active=TRUE
         LEFT JOIN lawyer_subscription_plans p ON p.id=s.plan_id
        ORDER BY p.sort_order NULLS LAST, l.is_featured DESC, l.id DESC`
    );
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/lawyers/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const id = Number(req.params.id);
    const b = req.body || {};
    const fields: string[] = []; const vals: any[] = [];
    for (const k of ["full_name","title","specialties","phone","whatsapp","email","office_addr","district","consult_fee","is_featured","is_verified","is_active"]) {
      if (b[k] !== undefined) { vals.push(b[k]); fields.push(`${k} = $${vals.length}`); }
    }
    if (!fields.length) return res.json({ ok: true });
    vals.push(id);
    await query(`UPDATE lawyers SET ${fields.join(", ")} WHERE id = $${vals.length}`, vals);
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/lawyers/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM lawyers WHERE id = $1`, [Number(req.params.id)]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── سجل تاريخ اشتراكات محامي بعينه ─────────────────────────
router.get("/admin/subscription-history/:lawyerId", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT h.*, l.full_name
         FROM lawyer_subscription_history h
         JOIN lawyers l ON l.id = h.lawyer_id
        WHERE h.lawyer_id = $1
        ORDER BY h.changed_at DESC
        LIMIT 50`,
      [Number(req.params.lawyerId)]
    );
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── اشتراكات تنتهي قريباً ─────────────────────────────────
router.get("/admin/subscriptions/expiring", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const { rows } = await query(
      `SELECT l.id AS lawyer_id, l.full_name, l.phone, l.district,
              p.name AS plan_name, p.name_ar AS plan_name_ar, p.color, p.icon,
              s.expires_at, s.commission_pct, s.payment_ref,
              EXTRACT(DAY FROM (s.expires_at - NOW()))::int AS days_left
         FROM lawyer_subscriptions s
         JOIN lawyers l ON l.id = s.lawyer_id
         JOIN lawyer_subscription_plans p ON p.id = s.plan_id
        WHERE s.is_active = TRUE
          AND s.expires_at IS NOT NULL
          AND s.expires_at <= NOW() + ($1 || ' days')::INTERVAL
        ORDER BY s.expires_at ASC`,
      [String(days)]
    );
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── تصدير CSV للمحامين والاشتراكات ──────────────────────────
router.get("/admin/lawyers/export.csv", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT l.id, l.full_name, l.title, l.phone, l.whatsapp, l.email, l.district,
              l.specialties, l.experience_y, l.bar_number, l.consult_fee,
              l.is_active, l.is_featured, l.is_verified,
              COALESCE(p.name_ar, 'مجاني') AS plan_name_ar,
              p.price_sdg,
              s.commission_pct, s.started_at, s.expires_at, s.payment_ref,
              COALESCE((SELECT COUNT(*) FROM lawyer_contracts WHERE lawyer_id=l.id),0)::int AS contracts_count,
              l.created_at
         FROM lawyers l
         LEFT JOIN lawyer_subscriptions s ON s.lawyer_id=l.id AND s.is_active=TRUE
         LEFT JOIN lawyer_subscription_plans p ON p.id=s.plan_id
        ORDER BY l.id DESC`
    );
    const cols = [
      "id","الاسم الكامل","اللقب","الهاتف","واتساب","البريد","المنطقة",
      "التخصصات","سنوات الخبرة","رقم النقابة","أتعاب الاستشارة",
      "فعّال","مميّز","موثّق","الخطة","سعر الخطة (ج.س)",
      "العمولة %","بداية الاشتراك","انتهاء الاشتراك","مرجع الدفع",
      "عدد العقود","تاريخ التسجيل"
    ];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const fmtDate = (d: unknown) => d ? new Date(String(d)).toLocaleDateString("ar-SD") : "";
    const fmtBool = (b: unknown) => b ? "نعم" : "لا";
    const csvRows = [cols.map(esc).join(",")];
    for (const r of rows) {
      csvRows.push([
        r.id, r.full_name, r.title, r.phone, r.whatsapp||"", r.email||"",
        r.district, r.specialties||"", r.experience_y||"", r.bar_number||"",
        r.consult_fee||"", fmtBool(r.is_active), fmtBool(r.is_featured), fmtBool(r.is_verified),
        r.plan_name_ar, r.price_sdg||0, r.commission_pct||0,
        fmtDate(r.started_at), fmtDate(r.expires_at), r.payment_ref||"",
        r.contracts_count, fmtDate(r.created_at),
      ].map(esc).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lawyers_${Date.now()}.csv"`);
    return res.send("\uFEFF" + csvRows.join("\r\n"));
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── إدارة خطط الاشتراك (إدارة) ─────────────────────────────
router.get("/admin/subscription-plans", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT * FROM lawyer_subscription_plans ORDER BY sort_order`);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.put("/admin/subscription-plans/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const id = Number(req.params.id);
    const b = req.body || {};
    const allowed = ["name_ar","price_sdg","price_label","monthly_contacts","has_unlimited_contacts",
                     "has_ads","has_featured","has_verified_badge","has_priority","commission_pct",
                     "color","icon","is_active"];
    const fields: string[] = []; const vals: any[] = [];
    for (const k of allowed) {
      if (b[k] !== undefined) { vals.push(b[k]); fields.push(`${k} = $${vals.length}`); }
    }
    if (!fields.length) return res.json({ ok: true });
    vals.push(id);
    await query(`UPDATE lawyer_subscription_plans SET ${fields.join(", ")} WHERE id = $${vals.length}`, vals);
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//                       بوابة المحامي — Lawyer Portal
// ══════════════════════════════════════════════════════════════════════════════

// مساعد: استخراج المحامي من التوكن
async function getLawyerFromToken(req: Request): Promise<{ lawyer_id: number; user_id: number } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const sess = await query(`SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()`, [token]);
  if (!sess.rows[0]) return null;
  const userId = sess.rows[0].user_id;
  const app = await query(
    `SELECT lawyer_id FROM lawyer_applications WHERE user_id = $1 AND status = 'approved' AND lawyer_id IS NOT NULL LIMIT 1`,
    [userId]
  );
  if (!app.rows[0]) return null;
  return { lawyer_id: app.rows[0].lawyer_id, user_id: userId };
}

// ── 1. ملف المحامي الكامل + اشتراكه ──────────────────────────
router.get("/my-lawyer-profile", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح — محامي فعط" });
    const { rows } = await query(
      `SELECT l.*,
              p.name AS plan_name, p.name_ar AS plan_name_ar, p.color AS plan_color,
              p.icon AS plan_icon, p.price_label, p.has_unlimited_contacts,
              p.has_ads, p.has_featured, p.has_verified_badge, p.has_priority,
              p.monthly_contacts AS plan_monthly_contacts,
              s.commission_pct, s.started_at AS sub_started, s.expires_at AS sub_expires,
              s.payment_ref, s.admin_note AS sub_note,
              COALESCE((SELECT ROUND(AVG(r.rating)::numeric,1) FROM ratings r WHERE r.entity_id=l.entity_id),0)::float AS avg_rating,
              COALESCE((SELECT COUNT(*) FROM ratings r WHERE r.entity_id=l.entity_id),0)::int AS review_count,
              COALESCE((SELECT COUNT(*) FROM lawyer_contracts WHERE lawyer_id=l.id),0)::int AS total_contracts,
              COALESCE((SELECT COUNT(*) FROM lawyer_contracts WHERE lawyer_id=l.id AND status='pending'),0)::int AS pending_contracts,
              COALESCE((SELECT COUNT(*) FROM lawyer_contracts WHERE lawyer_id=l.id AND status='completed'),0)::int AS completed_contracts
         FROM lawyers l
         LEFT JOIN lawyer_subscriptions s ON s.lawyer_id=l.id AND s.is_active=TRUE
         LEFT JOIN lawyer_subscription_plans p ON p.id=s.plan_id
        WHERE l.id = $1`, [me.lawyer_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "لم يُعثر على ملف المحامي" });
    const services = await query(`SELECT * FROM lawyer_services WHERE lawyer_id=$1 AND is_active=TRUE ORDER BY sort_order,id`, [me.lawyer_id]);
    return res.json({ ...rows[0], services: services.rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 2. تحديث ملف المحامي ────────────────────────────────────
router.put("/my-lawyer-profile", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const b = req.body || {};
    const allowed = ["full_name","title","bio","phone","whatsapp","email","office_addr","district","consult_fee","languages","photo_url"];
    const fields: string[] = []; const vals: any[] = [];
    for (const k of allowed) {
      if (b[k] !== undefined) { vals.push(String(b[k]).slice(0, k === "bio" ? 2000 : 300)); fields.push(`${k} = $${vals.length}`); }
    }
    if (fields.length) {
      vals.push(me.lawyer_id);
      await query(`UPDATE lawyers SET ${fields.join(", ")} WHERE id = $${vals.length}`, vals);
    }
    // تحديث الخدمات (استبدال كامل)
    if (Array.isArray(b.services)) {
      await query(`UPDATE lawyer_services SET is_active=FALSE WHERE lawyer_id=$1`, [me.lawyer_id]);
      for (const [idx, svc] of (b.services as any[]).entries()) {
        if (!svc.title?.trim()) continue;
        if (svc.id) {
          await query(
            `UPDATE lawyer_services SET title=$2, description=$3, price_text=$4, duration=$5, sort_order=$6, is_active=TRUE WHERE id=$1 AND lawyer_id=$7`,
            [svc.id, String(svc.title).slice(0,150), String(svc.description||"").slice(0,500),
             String(svc.price_text||"").slice(0,100), String(svc.duration||"").slice(0,80), idx, me.lawyer_id]
          );
        } else {
          await query(
            `INSERT INTO lawyer_services (lawyer_id,title,description,price_text,duration,sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
            [me.lawyer_id, String(svc.title).slice(0,150), String(svc.description||"").slice(0,500),
             String(svc.price_text||"").slice(0,100), String(svc.duration||"").slice(0,80), idx]
          );
        }
      }
    }
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 3. إحصائيات لوحة المحامي ────────────────────────────────
router.get("/my-lawyer-stats", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const id = me.lawyer_id;
    const [stats, monthly, recent, msgs] = await Promise.all([
      query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(CASE WHEN status='pending' THEN 1 END)::int AS pending,
           COUNT(CASE WHEN status='accepted' THEN 1 END)::int AS accepted,
           COUNT(CASE WHEN status='in_progress' THEN 1 END)::int AS in_progress,
           COUNT(CASE WHEN status='completed' THEN 1 END)::int AS completed,
           COUNT(CASE WHEN status='rejected' OR status='cancelled' THEN 1 END)::int AS cancelled
         FROM lawyer_contracts WHERE lawyer_id=$1`, [id]),
      query(
        `SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*)::int AS count
         FROM lawyer_contracts WHERE lawyer_id=$1 AND created_at >= NOW() - INTERVAL '6 months'
         GROUP BY month ORDER BY month`, [id]),
      query(
        `SELECT id, client_name, client_phone, service_title, status, created_at, contract_no
         FROM lawyer_contracts WHERE lawyer_id=$1 ORDER BY created_at DESC LIMIT 5`, [id]),
      query(
        `SELECT COUNT(*)::int AS unread FROM lawyer_case_messages m
         JOIN lawyer_contracts c ON c.id = m.contract_id
         WHERE c.lawyer_id=$1 AND m.sender_role='client' AND m.is_read=FALSE`, [id]),
    ]);
    return res.json({
      contracts: stats.rows[0],
      monthly: monthly.rows,
      recent_cases: recent.rows,
      unread_messages: msgs.rows[0]?.unread || 0,
    });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 4. قائمة القضايا (من جانب المحامي) ─────────────────────
router.get("/my-lawyer-cases", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const status = String(req.query.status || "").trim();
    const search = String(req.query.search || "").trim();
    const params: any[] = [me.lawyer_id];
    let where = "c.lawyer_id = $1";
    if (status) { params.push(status); where += ` AND c.status = $${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (c.client_name ILIKE $${params.length} OR c.service_title ILIKE $${params.length} OR c.contract_no ILIKE $${params.length})`; }
    const { rows } = await query(
      `SELECT c.*,
              COALESCE((SELECT COUNT(*) FROM lawyer_case_messages WHERE contract_id=c.id),0)::int AS msg_count,
              COALESCE((SELECT COUNT(*) FROM lawyer_case_messages WHERE contract_id=c.id AND sender_role='client' AND is_read=FALSE),0)::int AS unread_count,
              COALESCE((SELECT COUNT(*) FROM lawyer_case_documents WHERE contract_id=c.id),0)::int AS doc_count
         FROM lawyer_contracts c WHERE ${where} ORDER BY c.updated_at DESC LIMIT 100`, params
    );
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 5. تفاصيل قضية واحدة ─────────────────────────────────────
router.get("/my-lawyer-cases/:id", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const cid = Number(req.params.id);
    const { rows } = await query(`SELECT * FROM lawyer_contracts WHERE id=$1 AND lawyer_id=$2`, [cid, me.lawyer_id]);
    if (!rows[0]) return res.status(404).json({ error: "القضية غير موجودة" });
    const [msgs, docs] = await Promise.all([
      query(`SELECT * FROM lawyer_case_messages WHERE contract_id=$1 ORDER BY created_at ASC`, [cid]),
      query(`SELECT * FROM lawyer_case_documents WHERE contract_id=$1 ORDER BY created_at DESC`, [cid]),
    ]);
    // اجعل الرسائل كلها مقروءة من العميل
    await query(`UPDATE lawyer_case_messages SET is_read=TRUE WHERE contract_id=$1 AND sender_role='client'`, [cid]);
    return res.json({ ...rows[0], messages: msgs.rows, documents: docs.rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 6. تغيير حالة القضية ─────────────────────────────────────
router.patch("/my-lawyer-cases/:id/status", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const cid = Number(req.params.id);
    const { status, lawyer_note } = req.body || {};
    const allowed = ["accepted","in_progress","completed","rejected","cancelled"];
    if (!allowed.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const r = await query(
      `UPDATE lawyer_contracts SET status=$3, lawyer_note=$4, updated_at=NOW()
       WHERE id=$1 AND lawyer_id=$2 RETURNING id`,
      [cid, me.lawyer_id, status, String(lawyer_note || "").slice(0, 1000)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "القضية غير موجودة" });
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 7. إرسال رسالة (المحامي في قضية) ───────────────────────
router.post("/my-lawyer-cases/:id/messages", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const cid = Number(req.params.id);
    const own = await query(`SELECT client_name FROM lawyer_contracts WHERE id=$1 AND lawyer_id=$2`, [cid, me.lawyer_id]);
    if (!own.rows[0]) return res.status(404).json({ error: "القضية غير موجودة" });
    const lw = await query(`SELECT full_name, title FROM lawyers WHERE id=$1`, [me.lawyer_id]);
    const { body, file_url, file_name, file_type } = req.body || {};
    if (!String(body || "").trim() && !String(file_url || "").trim()) return res.status(400).json({ error: "الرسالة فارغة" });
    const { rows } = await query(
      `INSERT INTO lawyer_case_messages (contract_id, sender_role, sender_name, body, file_url, file_name, file_type)
       VALUES ($1,'lawyer',$2,$3,$4,$5,$6) RETURNING *`,
      [cid, `${lw.rows[0]?.title || "محامي"} ${lw.rows[0]?.full_name || ""}`.trim(),
       String(body || "").slice(0, 3000), String(file_url || ""), String(file_name || "").slice(0, 255), String(file_type || "").slice(0, 80)]
    );
    await query(`UPDATE lawyer_contracts SET updated_at=NOW() WHERE id=$1`, [cid]);
    return res.json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 8. رفع / إضافة مستند للقضية (المحامي) ──────────────────
router.post("/my-lawyer-cases/:id/documents", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const cid = Number(req.params.id);
    const own = await query(`SELECT id FROM lawyer_contracts WHERE id=$1 AND lawyer_id=$2`, [cid, me.lawyer_id]);
    if (!own.rows[0]) return res.status(404).json({ error: "القضية غير موجودة" });
    const { title, file_url, file_name, file_type, file_size, notes } = req.body || {};
    if (!String(file_url || "").trim()) return res.status(400).json({ error: "رابط الملف مطلوب" });
    const { rows } = await query(
      `INSERT INTO lawyer_case_documents (contract_id, lawyer_id, title, file_url, file_name, file_type, file_size, notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'lawyer') RETURNING *`,
      [cid, me.lawyer_id, String(title || "مستند").slice(0, 255), String(file_url),
       String(file_name || "").slice(0, 255), String(file_type || "").slice(0, 80),
       Number(file_size) || 0, String(notes || "").slice(0, 1000)]
    );
    return res.json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 9. حذف مستند ────────────────────────────────────────────
router.delete("/my-lawyer-cases/:cid/documents/:did", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    await query(`DELETE FROM lawyer_case_documents WHERE id=$1 AND lawyer_id=$2`, [Number(req.params.did), me.lawyer_id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── 10. بيانات PDF الشامل للمحامي ───────────────────────────
router.get("/my-lawyer-pdf-data", async (req: Request, res: Response) => {
  try {
    const me = await getLawyerFromToken(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const id = me.lawyer_id;
    const [profile, services, cases, ratings, history] = await Promise.all([
      query(`SELECT l.*, p.name_ar AS plan_name_ar, p.price_label, s.expires_at AS sub_expires, s.commission_pct
               FROM lawyers l
               LEFT JOIN lawyer_subscriptions s ON s.lawyer_id=l.id AND s.is_active=TRUE
               LEFT JOIN lawyer_subscription_plans p ON p.id=s.plan_id
              WHERE l.id=$1`, [id]),
      query(`SELECT * FROM lawyer_services WHERE lawyer_id=$1 AND is_active=TRUE ORDER BY sort_order`, [id]),
      query(`SELECT * FROM lawyer_contracts WHERE lawyer_id=$1 ORDER BY created_at DESC LIMIT 200`, [id]),
      query(`SELECT r.rating, r.comment, r.created_at, COALESCE(u.name,'مستخدم') AS user_name
               FROM ratings r JOIN lawyers l2 ON l2.entity_id=r.entity_id
               LEFT JOIN users u ON u.id=r.user_id
              WHERE l2.id=$1 ORDER BY r.created_at DESC LIMIT 50`, [id]),
      query(`SELECT * FROM lawyer_subscription_history WHERE lawyer_id=$1 ORDER BY changed_at DESC`, [id]),
    ]);
    return res.json({
      profile: profile.rows[0],
      services: services.rows,
      cases: cases.rows,
      ratings: ratings.rows,
      subscription_history: history.rows,
      generated_at: new Date().toISOString(),
    });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
//          دردشة العميل — رسائل العميل في قضيته مع المحامي
// ══════════════════════════════════════════════════════════════════════════════

// مساعد: التحقق من ملكية العميل للقضية
async function getClientContract(req: Request, contractId: number): Promise<any | null> {
  const auth = req.headers.authorization;
  const deviceId = String(req.query.device_id || req.body?.device_id || "").trim();
  let userId: number | null = null;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const sess = await query(`SELECT user_id FROM user_sessions WHERE token=$1 AND expires_at>NOW()`, [token]);
    if (sess.rows[0]) userId = sess.rows[0].user_id;
  }
  if (!userId && !deviceId) return null;
  const { rows } = userId
    ? await query(`SELECT c.*, l.full_name AS lawyer_name, l.title AS lawyer_title FROM lawyer_contracts c JOIN lawyers l ON l.id=c.lawyer_id WHERE c.id=$1 AND c.user_id=$2`, [contractId, userId])
    : await query(`SELECT c.*, l.full_name AS lawyer_name, l.title AS lawyer_title FROM lawyer_contracts c JOIN lawyers l ON l.id=c.lawyer_id WHERE c.id=$1 AND c.device_id=$2`, [contractId, deviceId]);
  return rows[0] || null;
}

// ── 11. رسائل القضية للعميل ─────────────────────────────────
router.get("/client/cases/:id/messages", async (req: Request, res: Response) => {
  try {
    const contract = await getClientContract(req, Number(req.params.id));
    if (!contract) return res.status(404).json({ error: "القضية غير موجودة أو غير مصرح" });
    const { rows } = await query(`SELECT * FROM lawyer_case_messages WHERE contract_id=$1 ORDER BY created_at ASC`, [contract.id]);
    // اجعل رسائل المحامي مقروءة
    await query(`UPDATE lawyer_case_messages SET is_read=TRUE WHERE contract_id=$1 AND sender_role='lawyer'`, [contract.id]);
    return res.json({ contract, messages: rows });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 12. العميل يرسل رسالة ────────────────────────────────────
router.post("/client/cases/:id/messages", async (req: Request, res: Response) => {
  try {
    const contract = await getClientContract(req, Number(req.params.id));
    if (!contract) return res.status(404).json({ error: "القضية غير موجودة أو غير مصرح" });
    const { body, file_url, file_name, file_type, sender_name } = req.body || {};
    if (!String(body || "").trim() && !String(file_url || "").trim()) return res.status(400).json({ error: "الرسالة فارغة" });
    const clientName = sender_name || contract.client_name || "عميل";
    const { rows } = await query(
      `INSERT INTO lawyer_case_messages (contract_id, sender_role, sender_name, body, file_url, file_name, file_type)
       VALUES ($1,'client',$2,$3,$4,$5,$6) RETURNING *`,
      [contract.id, String(clientName).slice(0,150), String(body||"").slice(0,3000),
       String(file_url||""), String(file_name||"").slice(0,255), String(file_type||"").slice(0,80)]
    );
    await query(`UPDATE lawyer_contracts SET updated_at=NOW() WHERE id=$1`, [contract.id]);
    return res.json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── 13. مستندات القضية للعميل ────────────────────────────────
router.get("/client/cases/:id/documents", async (req: Request, res: Response) => {
  try {
    const contract = await getClientContract(req, Number(req.params.id));
    if (!contract) return res.status(404).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT * FROM lawyer_case_documents WHERE contract_id=$1 ORDER BY created_at DESC`, [contract.id]);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── 14. العميل يرفع مستنداً ──────────────────────────────────
router.post("/client/cases/:id/documents", async (req: Request, res: Response) => {
  try {
    const contract = await getClientContract(req, Number(req.params.id));
    if (!contract) return res.status(404).json({ error: "غير مصرح" });
    const { title, file_url, file_name, file_type, file_size, notes } = req.body || {};
    if (!String(file_url||"").trim()) return res.status(400).json({ error: "رابط الملف مطلوب" });
    const { rows } = await query(
      `INSERT INTO lawyer_case_documents (contract_id, lawyer_id, title, file_url, file_name, file_type, file_size, notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'client') RETURNING *`,
      [contract.id, contract.lawyer_id, String(title||"مستند").slice(0,255), String(file_url),
       String(file_name||"").slice(0,255), String(file_type||"").slice(0,80), Number(file_size)||0, String(notes||"").slice(0,1000)]
    );
    return res.json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// محتوى استمارة محددة (HTML للطباعة)
router.get("/legal-forms/:id", async (req: Request, res: Response) => {
  try {
    const { rows } = await query(`SELECT * FROM legal_forms WHERE id = $1`, [Number(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json(rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── البوسترات الإعلانية ──────────────────────────────────────────────────────
router.get("/posters", (_req: Request, res: Response) => {
  try {
    // process.cwd() = artifacts/api-server في بيئة التطوير والإنتاج
    const candidates = [
      join(process.cwd(), "public/posters.html"),
      join(process.cwd(), "../public/posters.html"),
    ];
    for (const file of candidates) {
      try {
        const html = readFileSync(file, "utf8");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(html);
      } catch { continue; }
    }
    return res.status(404).json({ error: "Posters file not found" });
  } catch { return res.status(500).json({ error: "Server error" }); }
});


// ══════════════════════════════════════════════════════
// بذر قاعدة البيانات (مُعطَّل بعد التنفيذ)
// ══════════════════════════════════════════════════════
router.post("/admin/seed-db", async (_req: Request, res: Response) => {
  return res.status(410).json({ error: "تم تنفيذ البذر مسبقاً وهذا الـ endpoint مغلق." });
  try {
    const isAdmin = await isAdminRequest(_req);
    if (!isAdmin) return res.status(403).json({ error: "غير مصرح" });

    const seeded: string[] = [];

    // 1. الشخصيات المكرّمة
    const hf = await query(`SELECT COUNT(*) FROM honored_figures WHERE is_visible=TRUE`);
    if (parseInt(hf.rows[0].count, 10) === 0) {
      await query(`
        INSERT INTO honored_figures (name, title, city_role, photo_url, tribute, start_date, end_date, is_visible) VALUES
        ($1,$2,$3,$4,$5,$6,$7,TRUE),($8,$9,$10,$11,$12,$13,$14,TRUE),($15,$16,$17,$18,$19,$20,$21,TRUE),($22,$23,$24,$25,$26,$27,$28,TRUE)
      `, [
        'الشيخ الأمين محمد علي','عالم دين وداعية','إمام الجامع الكبير بالحصاحيصا لأكثر من 30 عاماً','','رجل أفنى عمره في خدمة العلم والدعوة، أضاء الأرواح قبل العقول. مدرسته أنجبت أجيالاً من حفظة القرآن.','2024-01-01','2025-12-31',
        'الدكتور عبدالرحمن آدم','طبيب وإنسانيٌّ','مدير مستشفى الحصاحيصا التعليمي سابقاً','','طبيب أهدى حياته لأبناء المدينة بلا مقابل. أسّس أول وحدة طوارئ متكاملة في المدينة عام 1998.','2024-01-01','2025-12-31',
        'الأستاذة فاطمة إبراهيم خليل','معلمة ورائدة تعليم','مديرة مدرسة البنات الأولى بالحصاحيصا','','أربعون عاماً من التعليم. تُشير إليها آلاف الخريجات باعتبارها السبب الأول في مسيرتهن.','2024-06-01','2025-12-31',
        'المهندس حسن الطيب النور','رائد أعمال ومهندس','مؤسس أول مصنع للطوب في محلية الحصاحيصا','','مشاريعه أتاحت فرص عمل لمئات الشباب وأسهمت في تعمير المدينة.','2025-01-01','2025-12-31',
      ]);
      seeded.push("honored_figures: 4");
    }

    // 2. الأخبار
    const cn = await query(`SELECT COUNT(*) FROM city_news`);
    if (parseInt(cn.rows[0].count, 10) === 0) {
      await query(`INSERT INTO city_news (title,content,category,author_name,is_pinned) VALUES
        ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10),($11,$12,$13,$14,$15),($16,$17,$18,$19,$20)`,
        [
          'افتتاح مشروع مياه الشرب النقية بأحياء الحصاحيصا','أعلنت محلية الحصاحيصا انتهاء المرحلة الأولى لمشروع تحسين شبكة مياه الشرب التي تغطي 12 حياً وتستفيد منها نحو 40,000 نسمة.','infrastructure','إدارة المحلية',true,
          'انطلاق بطولة الحصاحيصا لكرة القدم في نسختها العاشرة','انطلقت رسمياً بطولة الحصاحيصا السنوية لكرة القدم بمشاركة 16 فريقاً من مختلف أحياء المدينة على ملعب الحصاحيصا الرئيسي.','sports','تحرير التطبيق',false,
          'توسعة مستشفى الحصاحيصا التعليمي تضيف وحدة نساء وتوليد جديدة','وحدة النساء والتوليد الجديدة تضم 30 سريراً وغرفتَي ولادة وجهازَي مراقبة حديثَين بمستشفى الحصاحيصا.','health','وزارة الصحة – ولاية الجزيرة',true,
          'انطلاق حملة التشجير الكبرى بالأحياء السكنية','حملة شملت زراعة أكثر من 500 شجرة في الشوارع الرئيسية وأمام المدارس بالتعاون مع شباب الأحياء.','environment','إدارة البيئة',false,
        ]
      );
      seeded.push("city_news: 4");
    }

    // 3. التهانئ
    const cg = await query(`SELECT COUNT(*) FROM greetings`);
    if (parseInt(cg.rows[0].count, 10) === 0) {
      await query(`INSERT INTO greetings (author_name,text,occasion_name,likes) VALUES
        ($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)`,
        [
          'أبناء حي الصداقة','نرفع أسمى آيات التهاني لأبناء الحصاحيصا بمناسبة العيد المبارك، ونسأل الله أن يعيده عليكم بالخير واليمن والبركات.','عيد الأضحى المبارك',12,
          'جمعية أولياء الأمور','بمناسبة يوم المعلم، نتقدم بأجمل التهاني لكل معلم ومعلمة في محلية الحصاحيصا. أنتم شموع تضيئون درب الأجيال.','يوم المعلم',34,
          'أسرة تطبيق حصاحيصاوي','يسعدنا أن نكون معكم في كل لحظة. هذا التطبيق حُبٌّ من القلب لمدينة الحصاحيصا وأهلها الطيبين.','رسالة من الفريق',45,
        ]
      );
      seeded.push("greetings: 3");
    }

    // 4. الوظائف
    const cj = await query(`SELECT COUNT(*) FROM jobs WHERE is_active=TRUE`);
    if (parseInt(cj.rows[0].count, 10) === 0) {
      await query(`INSERT INTO jobs (author_name,title,company,type,location,description,contact_phone,salary,is_active) VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,TRUE),($9,$10,$11,$12,$13,$14,$15,$16,TRUE),($17,$18,$19,$20,$21,$22,$23,$24,TRUE),($25,$26,$27,$28,$29,$30,$31,$32,TRUE)`,
        [
          'شركة النيل للمقاولات','مهندس مدني','شركة النيل للمقاولات','fulltime','الحصاحيصا','مطلوب مهندس مدني خبرة 3 سنوات في إدارة مشاريع البناء. يُرجى إرسال السيرة الذاتية على الرقم.','0912100200','80,000–120,000 ج.س',
          'مستشفى الحصاحيصا التعليمي','طبيب عام','مستشفى الحصاحيصا التعليمي','fulltime','الحصاحيصا','نستقبل طلبات الأطباء العامين. يُوفَّر السكن والمواصلات.','0155001122','وفق سلم الدولة',
          'مدارس الرواد الخاصة','معلم رياضيات (ثانوي)','مدارس الرواد الخاصة','fulltime','الحصاحيصا','نحتاج معلم رياضيات متمكن. يُشترط الخبرة. بيئة عمل محفّزة وراتب تنافسي.','0123400500','60,000 ج.س',
          'صيدلية الشفاء','صيدلاني','صيدلية الشفاء','fulltime','حي الزهور','مطلوب صيدلاني مجاز دوام كامل. خبرة سنة على الأقل.','0915600700','70,000 ج.س',
        ]
      );
      seeded.push("jobs: 4");
    }

    // 5. الأطباء
    const cs = await query(`SELECT COUNT(*) FROM specialists WHERE is_active=TRUE`);
    if (parseInt(cs.rows[0].count, 10) === 0) {
      await query(`INSERT INTO specialists (name,specialty,bio,clinic,phone,available_days,fees,is_active,order_num) VALUES
        ($1,$2,$3,$4,$5,$6,$7,TRUE,1),($8,$9,$10,$11,$12,$13,$14,TRUE,2),($15,$16,$17,$18,$19,$20,$21,TRUE,3),($22,$23,$24,$25,$26,$27,$28,TRUE,4),($29,$30,$31,$32,$33,$34,$35,TRUE,5)`,
        [
          'د. عبدالله محمد الحسن','طب عام وطوارئ','طبيب عام خبرة 12 عاماً. متخصص في الطوارئ والأمراض الباطنية.','عيادة الشفاء — شارع النيل','0912000100','["السبت","الأحد","الاثنين","الثلاثاء"]','1,500 ج.س',
          'د. سارة إبراهيم أحمد','نساء وتوليد','استشارية نساء وتوليد خبرة 8 سنوات. تخصصت في الحمل عالي الخطورة.','مركز أم المؤمنين الطبي','0923000200','["الأحد","الثلاثاء","الخميس"]','2,000 ج.س',
          'د. يوسف علي الطيب','طب أطفال','طبيب أطفال معتمد خبرة 10 سنوات. يُعنى بصحة الأطفال من الولادة حتى المراهقة.','عيادة الأطفال الحديثة','0911000300','["السبت","الاثنين","الأربعاء","الجمعة"]','1,800 ج.س',
          'د. آمنة خالد عمر','أسنان وتجميل','متخصصة في تجميل الأسنان والتقويم. حاصلة على شهادة التخصص من جامعة الخرطوم 2015.','عيادة الابتسامة — حي الواحة','0912500400','["الأحد","الثلاثاء","الخميس","السبت"]','2,500 ج.س',
          'د. الزبير محمد عثمان','عظام وإصابات رياضية','جراح عظام وخبير في إصابات الملاعب. يُجري عمليات الجبر والتدخل الجراحي.','مستشفى الحصاحيصا التعليمي','0155000500','["الثلاثاء","الخميس"]','3,000 ج.س',
        ]
      );
      seeded.push("specialists: 5");
    }

    // 6. الجاليات
    const cc = await query(`SELECT COUNT(*) FROM communities WHERE status='active'`);
    if (parseInt(cc.rows[0].count, 10) === 0) {
      await query(`INSERT INTO communities (name,category,origin,description,representative_name,contact_phone,members_count,neighborhood,services,meeting_schedule,status) VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active'),($11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'active'),($21,$22,$23,$24,$25,$26,$27,$28,$29,$30,'active')`,
        [
          'رابطة أبناء الحصاحيصا في الخرطوم','diaspora','الحصاحيصا','تجمع يضم أبناء الحصاحيصا المقيمين في الخرطوم لتبادل الدعم وتنظيم الفعاليات.','الأستاذ طارق عبدالمجيد','0912100001',320,'الخرطوم بحري','دعم الطلاب — مساعدات اجتماعية — رحلات','الجمعة الأولى من كل شهر',
          'مجموعة شباب الحصاحيصا للتطوع','local','الحصاحيصا','مجموعة شبابية تطوعية تعمل على نظافة المدينة وزيارة المرضى وتنظيم الفعاليات.','الشاب مصعب الجيلي','0919200003',95,'حي الصداقة','حملات نظافة — زيارة مرضى — فعاليات شبابية','كل خميس مساءً',
          'رابطة خريجي مدارس الحصاحيصا','alumni','الحصاحيصا','رابطة تجمع خريجي المدارس لدعم الطلاب الحاليين واستمرار الروابط الاجتماعية.','الأستاذة هالة محمد','0912500004',540,'وسط المدينة','دعم الطلاب الجدد — شبكة توظيف — فعاليات سنوية','مرة كل ثلاثة أشهر',
        ]
      );
      seeded.push("communities: 3");
    }

    // 7. الإعلانات
    const ca = await query(`SELECT COUNT(*) FROM ads WHERE status='approved'`);
    if (parseInt(ca.rows[0].count, 10) === 0) {
      await query(`INSERT INTO ads (institution_name,contact_name,contact_phone,title,description,type,target_screen,duration_days,status,start_date,end_date,priority) VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,'approved',NOW(),NOW()+INTERVAL '30 days',$9),
        ($10,$11,$12,$13,$14,$15,$16,$17,'approved',NOW(),NOW()+INTERVAL '60 days',$18)`,
        [
          'صيدلية النيل الكبرى','أحمد سليمان','0912000101','خصم 20% على مستلزمات الأم والطفل','احصل على خصم 20% على كل مستحضرات العناية بالطفل والأم. العرض سارٍ طوال الشهر.','promotion','home',30,10,
          'مطعم الحصاحيصا الأصيل','محمد الأمين','0911200202','وجبات عائلية بأسعار لا تُقاوَم','أشهى المأكولات السودانية الأصيلة مع توصيل للمنزل. متاح يومياً 11ص–11م.','promotion','all',60,8,
        ]
      );
      seeded.push("ads: 2");
    }

    return res.json({ ok: true, seeded });
  } catch (err: any) {
    logger.error({ err: err }, "seed error");
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// قسم شركات الاتصالات
// ══════════════════════════════════════════════════════════════════

async function ensureTelecomTables() {
  await query(`CREATE TABLE IF NOT EXISTS telecom_companies (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    short        VARCHAR(20),
    logo_initial VARCHAR(5),
    brand_color  VARCHAR(20) DEFAULT '#0EA5E9',
    brand_color2 VARCHAR(20) DEFAULT '#2563EB',
    description  TEXT,
    founded      VARCHAR(10),
    subscribers  VARCHAR(30),
    coverage     VARCHAR(10),
    website      TEXT,
    hotline      VARCHAR(30),
    ussd         VARCHAR(50),
    recharge     VARCHAR(100),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS telecom_offers (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER REFERENCES telecom_companies(id) ON DELETE CASCADE,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    category    VARCHAR(50) DEFAULT 'data',
    price       NUMERIC(12,2) DEFAULT 0,
    currency    VARCHAR(10) DEFAULT 'SDG',
    validity    VARCHAR(60),
    details     TEXT,
    image_url   TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS telecom_events (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER REFERENCES telecom_companies(id) ON DELETE SET NULL,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    event_date  TIMESTAMPTZ,
    location    VARCHAR(200),
    image_url   TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function seedTelecomCompanies() {
  const cnt = await query(`SELECT COUNT(*) FROM telecom_companies`);
  if (parseInt(cnt.rows[0].count, 10) > 0) return;
  await query(`
    INSERT INTO telecom_companies (name,short,logo_initial,brand_color,brand_color2,description,founded,subscribers,coverage,website,hotline,ussd,recharge,sort_order)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14),
      ($15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28),
      ($29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42)
  `, [
    'MTN السودان','MTN','M','#FFC107','#FF8F00','أكبر شبكة اتصالات في السودان — تغطية واسعة وخدمات متنوعة','1997','+٢٠ مليون','٩٨٪','https://www.mtn.sd','1800','*100#','*555*[رمز]#',1,
    'زين السودان','Zain','Z','#E53935','#B71C1C','شبكة اتصالات عالمية بخدمات مميزة وتقنيات حديثة','1997','+١٥ مليون','٩٥٪','https://www.sd.zain.com','111','*1#','*123*[رمز]#',2,
    'سوداني','Sudani','S','#22C55E','#15803D','الشركة السودانية للاتصالات — حكومية وطنية بخدمات شاملة','1993','+١٠ مليون','٩٠٪','https://www.sudani.sd','1717','*900#','*300*[رمز]#',3,
  ]);
}

// GET /api/telecom/companies
router.get("/telecom/companies", async (req: Request, res: Response) => {
  try {
    await ensureTelecomTables();
    await seedTelecomCompanies();
    const result = await query(`SELECT * FROM telecom_companies WHERE is_active=TRUE ORDER BY sort_order,id`);
    return res.json(result.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/telecom/offers
router.get("/telecom/offers", async (req: Request, res: Response) => {
  try {
    await ensureTelecomTables();
    const { company_id, category } = req.query as Record<string, string>;
    const params: unknown[] = [];
    let where = "WHERE o.is_active=TRUE";
    if (company_id) { params.push(Number(company_id)); where += ` AND o.company_id=$${params.length}`; }
    if (category)   { params.push(category);           where += ` AND o.category=$${params.length}`; }
    const result = await query(
      `SELECT o.*, c.name AS company_name, c.brand_color AS company_color
       FROM telecom_offers o LEFT JOIN telecom_companies c ON c.id=o.company_id
       ${where} ORDER BY o.sort_order, o.created_at DESC`,
      params
    );
    return res.json(result.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/telecom/events
router.get("/telecom/events", async (req: Request, res: Response) => {
  try {
    await ensureTelecomTables();
    const result = await query(
      `SELECT e.*, c.name AS company_name, c.brand_color AS company_color
       FROM telecom_events e LEFT JOIN telecom_companies c ON c.id=e.company_id
       WHERE e.is_active=TRUE AND (e.event_date IS NULL OR e.event_date >= NOW() - INTERVAL '1 day')
       ORDER BY e.event_date ASC NULLS LAST, e.created_at DESC LIMIT 50`
    );
    return res.json(result.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: CRUD الشركات ─────────────────────────────────────────────────────
router.post("/admin/telecom/companies", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureTelecomTables();
    const { name, short, logo_initial, brand_color, brand_color2, description, founded, subscribers, coverage, website, hotline, ussd, recharge, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
    const r = await query(
      `INSERT INTO telecom_companies (name,short,logo_initial,brand_color,brand_color2,description,founded,subscribers,coverage,website,hotline,ussd,recharge,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [name,short||null,logo_initial||null,brand_color||'#0EA5E9',brand_color2||'#2563EB',description||null,founded||null,subscribers||null,coverage||null,website||null,hotline||null,ussd||null,recharge||null,Number(sort_order)||0]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/telecom/companies/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name, short, logo_initial, brand_color, brand_color2, description, founded, subscribers, coverage, website, hotline, ussd, recharge, sort_order, is_active } = req.body;
    const r = await query(
      `UPDATE telecom_companies SET
        name=COALESCE($1,name), short=COALESCE($2,short), logo_initial=COALESCE($3,logo_initial),
        brand_color=COALESCE($4,brand_color), brand_color2=COALESCE($5,brand_color2),
        description=COALESCE($6,description), founded=COALESCE($7,founded),
        subscribers=COALESCE($8,subscribers), coverage=COALESCE($9,coverage),
        website=COALESCE($10,website), hotline=COALESCE($11,hotline),
        ussd=COALESCE($12,ussd), recharge=COALESCE($13,recharge),
        sort_order=COALESCE($14,sort_order), is_active=COALESCE($15,is_active)
       WHERE id=$16 RETURNING *`,
      [name||null,short||null,logo_initial||null,brand_color||null,brand_color2||null,description||null,founded||null,subscribers||null,coverage||null,website||null,hotline||null,ussd||null,recharge||null,sort_order!=null?Number(sort_order):null,is_active!=null?Boolean(is_active):null,req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/telecom/companies/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM telecom_companies WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: CRUD العروض ──────────────────────────────────────────────────────
router.get("/admin/telecom/offers", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureTelecomTables();
    const r = await query(`SELECT o.*, c.name AS company_name FROM telecom_offers o LEFT JOIN telecom_companies c ON c.id=o.company_id ORDER BY o.created_at DESC`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/telecom/offers", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureTelecomTables();
    const { company_id, title, description, category, price, currency, validity, details, image_url, sort_order } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const r = await query(
      `INSERT INTO telecom_offers (company_id,title,description,category,price,currency,validity,details,image_url,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [company_id?Number(company_id):null,title,description||null,category||'data',Number(price)||0,currency||'SDG',validity||null,details||null,image_url||null,Number(sort_order)||0]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/telecom/offers/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { title, description, category, price, currency, validity, details, is_active, sort_order } = req.body;
    const r = await query(
      `UPDATE telecom_offers SET
        title=COALESCE($1,title), description=COALESCE($2,description), category=COALESCE($3,category),
        price=COALESCE($4,price), currency=COALESCE($5,currency), validity=COALESCE($6,validity),
        details=COALESCE($7,details), is_active=COALESCE($8,is_active), sort_order=COALESCE($9,sort_order)
       WHERE id=$10 RETURNING *`,
      [title||null,description||null,category||null,price!=null?Number(price):null,currency||null,validity||null,details||null,is_active!=null?Boolean(is_active):null,sort_order!=null?Number(sort_order):null,req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/telecom/offers/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM telecom_offers WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: CRUD الفعاليات ───────────────────────────────────────────────────
router.get("/admin/telecom/events", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureTelecomTables();
    const r = await query(`SELECT e.*, c.name AS company_name FROM telecom_events e LEFT JOIN telecom_companies c ON c.id=e.company_id ORDER BY e.event_date ASC NULLS LAST, e.created_at DESC`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/telecom/events", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureTelecomTables();
    const { company_id, title, description, event_date, location, image_url } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const r = await query(
      `INSERT INTO telecom_events (company_id,title,description,event_date,location,image_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [company_id?Number(company_id):null,title,description||null,event_date||null,location||null,image_url||null]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/telecom/events/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { title, description, event_date, location, image_url, is_active } = req.body;
    const r = await query(
      `UPDATE telecom_events SET
        title=COALESCE($1,title), description=COALESCE($2,description),
        event_date=COALESCE($3,event_date), location=COALESCE($4,location),
        image_url=COALESCE($5,image_url), is_active=COALESCE($6,is_active)
       WHERE id=$7 RETURNING *`,
      [title||null,description||null,event_date||null,location||null,image_url||null,is_active!=null?Boolean(is_active):null,req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/telecom/events/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM telecom_events WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// قسم النقابات والجمعيات المهنية
// ══════════════════════════════════════════════════════════════════

async function ensureUnionsTables() {
  await query(`CREATE TABLE IF NOT EXISTS unions (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    short_name   VARCHAR(60),
    field        VARCHAR(100),
    description  TEXT,
    logo_url     TEXT,
    banner_url   TEXT,
    website      TEXT,
    email        VARCHAR(200),
    phone        VARCHAR(40),
    address      TEXT,
    founded      VARCHAR(10),
    members_count VARCHAR(30),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS union_announcements (
    id           SERIAL PRIMARY KEY,
    union_id     INTEGER REFERENCES unions(id) ON DELETE CASCADE,
    title        VARCHAR(300) NOT NULL,
    body         TEXT,
    image_url    TEXT,
    link         TEXT,
    is_pinned    BOOLEAN DEFAULT FALSE,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS union_members (
    id                 SERIAL PRIMARY KEY,
    union_id           INTEGER REFERENCES unions(id) ON DELETE SET NULL,
    user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- بيانات شخصية
    full_name          VARCHAR(200) NOT NULL,
    national_id        VARCHAR(30),
    birth_date         DATE,
    birth_place        VARCHAR(100),
    gender             VARCHAR(10),
    nationality        VARCHAR(60) DEFAULT 'سودانية',
    phone              VARCHAR(30),
    alt_phone          VARCHAR(30),
    email              VARCHAR(200),
    address            TEXT,
    neighborhood       VARCHAR(100),
    city               VARCHAR(100) DEFAULT 'الحصاحيصا',
    -- بيانات مهنية
    job_title          VARCHAR(200),
    employer           VARCHAR(200),
    work_address       TEXT,
    work_phone         VARCHAR(30),
    specialty          VARCHAR(200),
    work_start_date    DATE,
    work_years         INTEGER,
    -- المؤهل الأكاديمي
    degree             VARCHAR(60),
    institution        VARCHAR(200),
    graduation_year    INTEGER,
    field_of_study     VARCHAR(200),
    -- تاريخ النقابي
    previous_unions    JSONB DEFAULT '[]',
    union_roles        VARCHAR(300),
    existing_membership_no VARCHAR(60),
    -- الأنشطة والإنجازات
    workshops          JSONB DEFAULT '[]',
    conferences        JSONB DEFAULT '[]',
    trainings          JSONB DEFAULT '[]',
    achievements       TEXT,
    skills             TEXT,
    -- مراجع
    references_list    JSONB DEFAULT '[]',
    -- بيانات العضوية
    membership_type    VARCHAR(30) DEFAULT 'regular',
    membership_no      VARCHAR(60),
    status             VARCHAR(20) DEFAULT 'pending',
    rejection_reason   TEXT,
    notes              TEXT,
    applied_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS union_programs (
    id           SERIAL PRIMARY KEY,
    union_id     INTEGER REFERENCES unions(id) ON DELETE CASCADE,
    title        VARCHAR(300) NOT NULL,
    description  TEXT,
    type         VARCHAR(40) DEFAULT 'event',
    start_date   DATE,
    end_date     DATE,
    location     VARCHAR(200),
    max_participants INTEGER,
    fee          VARCHAR(60),
    contact      VARCHAR(100),
    link         TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS union_laws (
    id              SERIAL PRIMARY KEY,
    union_id        INTEGER REFERENCES unions(id) ON DELETE CASCADE,
    title           VARCHAR(300) NOT NULL,
    body            TEXT,
    category        VARCHAR(40) DEFAULT 'bylaw',
    document_url    TEXT,
    effective_date  DATE,
    version         VARCHAR(20),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await query(`CREATE INDEX IF NOT EXISTS idx_union_programs_union ON union_programs(union_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_union_laws_union ON union_laws(union_id)`);

  // بيانات أولية — تُضاف مرة واحدة فقط إذا كانت الجداول فارغة
  const cnt = await query(`SELECT COUNT(*) FROM unions`);
  if (parseInt(cnt.rows[0].count, 10) === 0) {
    const seedUnions = [
      { name: "نقابة المعلمين السودانيين",       short: "نقابة المعلمين",  field: "التعليم",          phone: "0912345601", founded: "1958", members: "450+ عضو",  desc: "تمثل المعلمين وتدافع عن حقوقهم المهنية والمادية في الحصاحيصا والجزيرة" },
      { name: "نقابة الأطباء السودانيين",         short: "نقابة الأطباء",   field: "الصحة والطب",       phone: "0912345602", founded: "1946", members: "120+ عضو",  desc: "تنظيم مهني يضم أطباء الحصاحيصا ويضمن الالتزام بأخلاقيات المهنة" },
      { name: "نقابة المهندسين السودانيين",        short: "نقابة المهندسين", field: "الهندسة والبناء",   phone: "0912345603", founded: "1953", members: "200+ عضو",  desc: "تجمع المهندسين في مختلف التخصصات وتشرف على ضبط جودة المشاريع" },
      { name: "نقابة الصيادلة السودانيين",         short: "نقابة الصيادلة",  field: "الصيدلة والدواء",   phone: "0912345604", founded: "1960", members: "80+ عضو",   desc: "تنظيم مهنة الصيدلة وضبط ممارسة الدواء في الحصاحيصا" },
      { name: "نقابة الممرضين والقابلات",          short: "نقابة التمريض",   field: "الصحة والتمريض",   phone: "0912345605", founded: "1962", members: "300+ عضو",  desc: "تمثل الكوادر التمريضية وتدافع عن ظروف العمل اللائقة" },
      { name: "رابطة المحاسبين والماليين",         short: "رابطة المحاسبين", field: "المال والمحاسبة",   phone: "0912345606", founded: "1970", members: "150+ عضو",  desc: "تنظيم مهنيي المال والمحاسبة وتطوير الكفاءات المالية في المنطقة" },
      { name: "جمعية المزارعين والمنتجين",         short: "جمعية المزارعين", field: "الزراعة والإنتاج",  phone: "0912345607", founded: "1945", members: "600+ عضو",  desc: "تدعم المزارعين وتوفر الإرشاد الزراعي وتنظيم التسويق الزراعي" },
    ];
    for (let i = 0; i < seedUnions.length; i++) {
      const u = seedUnions[i];
      await query(
        `INSERT INTO unions (name,short_name,field,phone,founded,members_count,description,sort_order,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
        [u.name, u.short, u.field, u.phone, u.founded, u.members, u.desc, i + 1]
      ).catch(() => {});
    }
  }
}

// GET /api/unions
router.get("/unions", async (req: Request, res: Response) => {
  try {
    await ensureUnionsTables();
    const r = await query(`SELECT * FROM unions WHERE is_active=TRUE ORDER BY sort_order,id`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/unions/:id
router.get("/unions/:id", async (req: Request, res: Response) => {
  try {
    await ensureUnionsTables();
    const r = await query(`SELECT * FROM unions WHERE id=$1`, [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "النقابة غير موجودة" });
    const ann = await query(`SELECT * FROM union_announcements WHERE union_id=$1 AND is_active=TRUE ORDER BY is_pinned DESC, created_at DESC LIMIT 20`, [req.params.id]);
    return res.json({ ...r.rows[0], announcements: ann.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/unions/announcements/all  — كل الإعلانات
router.get("/unions/announcements/all", async (req: Request, res: Response) => {
  try {
    await ensureUnionsTables();
    const r = await query(
      `SELECT a.*, u.name AS union_name, u.field AS union_field
       FROM union_announcements a LEFT JOIN unions u ON u.id=a.union_id
       WHERE a.is_active=TRUE ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 50`
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/unions/apply — تقديم طلب عضوية
router.post("/unions/apply", async (req: Request, res: Response) => {
  try {
    await ensureUnionsTables();
    const {
      union_id, user_id,
      full_name, national_id, birth_date, birth_place, gender, nationality,
      phone, alt_phone, email, address, neighborhood, city,
      job_title, employer, work_address, work_phone, specialty, work_start_date, work_years,
      degree, institution, graduation_year, field_of_study,
      previous_unions, union_roles, existing_membership_no,
      workshops, conferences, trainings, achievements, skills,
      references_list, membership_type, notes
    } = req.body;
    if (!full_name) return res.status(400).json({ error: "الاسم الكامل مطلوب" });
    if (!union_id) return res.status(400).json({ error: "يجب اختيار النقابة" });
    const r = await query(
      `INSERT INTO union_members (
        union_id,user_id,full_name,national_id,birth_date,birth_place,gender,nationality,
        phone,alt_phone,email,address,neighborhood,city,
        job_title,employer,work_address,work_phone,specialty,work_start_date,work_years,
        degree,institution,graduation_year,field_of_study,
        previous_unions,union_roles,existing_membership_no,
        workshops,conferences,trainings,achievements,skills,
        references_list,membership_type,notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
        $26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36
      ) RETURNING *`,
      [
        union_id, user_id||null,
        full_name, national_id||null, birth_date||null, birth_place||null, gender||null, nationality||'سودانية',
        phone||null, alt_phone||null, email||null, address||null, neighborhood||null, city||'الحصاحيصا',
        job_title||null, employer||null, work_address||null, work_phone||null, specialty||null, work_start_date||null, work_years?Number(work_years):null,
        degree||null, institution||null, graduation_year?Number(graduation_year):null, field_of_study||null,
        JSON.stringify(previous_unions||[]), union_roles||null, existing_membership_no||null,
        JSON.stringify(workshops||[]), JSON.stringify(conferences||[]), JSON.stringify(trainings||[]),
        achievements||null, skills||null,
        JSON.stringify(references_list||[]), membership_type||'regular', notes||null
      ]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/unions/my-membership — عضويتي
router.get("/unions/my-membership", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const r = await query(
      `SELECT m.*, u.name AS union_name, u.field AS union_field FROM union_members m
       LEFT JOIN unions u ON u.id=m.union_id WHERE m.user_id=$1 ORDER BY m.applied_at DESC`,
      [user.id]
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin ──────────────────────────────────────────────────────────────────
router.get("/admin/unions", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const r = await query(`SELECT u.*, (SELECT COUNT(*) FROM union_members m WHERE m.union_id=u.id)::int AS members_total FROM unions u ORDER BY u.sort_order,u.id`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/unions", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const { name, short_name, field, description, logo_url, banner_url, website, email, phone, address, founded, members_count, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
    const r = await query(
      `INSERT INTO unions (name,short_name,field,description,logo_url,banner_url,website,email,phone,address,founded,members_count,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name,short_name||null,field||null,description||null,logo_url||null,banner_url||null,website||null,email||null,phone||null,address||null,founded||null,members_count||null,Number(sort_order)||0]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/unions/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name, short_name, field, description, logo_url, banner_url, website, email, phone, address, founded, members_count, sort_order, is_active } = req.body;
    const r = await query(
      `UPDATE unions SET name=COALESCE($1,name), short_name=COALESCE($2,short_name), field=COALESCE($3,field),
       description=COALESCE($4,description), logo_url=COALESCE($5,logo_url), banner_url=COALESCE($6,banner_url),
       website=COALESCE($7,website), email=COALESCE($8,email), phone=COALESCE($9,phone),
       address=COALESCE($10,address), founded=COALESCE($11,founded), members_count=COALESCE($12,members_count),
       sort_order=COALESCE($13,sort_order), is_active=COALESCE($14,is_active)
       WHERE id=$15 RETURNING *`,
      [name||null,short_name||null,field||null,description||null,logo_url||null,banner_url||null,website||null,email||null,phone||null,address||null,founded||null,members_count||null,sort_order!=null?Number(sort_order):null,is_active!=null?Boolean(is_active):null,req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/unions/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM unions WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Admin: الأعضاء
router.get("/admin/union-members", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const { union_id, status } = req.query as Record<string, string>;
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (union_id) { params.push(Number(union_id)); where += ` AND m.union_id=$${params.length}`; }
    if (status)   { params.push(status);            where += ` AND m.status=$${params.length}`; }
    const r = await query(
      `SELECT m.*, u.name AS union_name FROM union_members m LEFT JOIN unions u ON u.id=m.union_id ${where} ORDER BY m.applied_at DESC`,
      params
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/union-members/:id/status", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { status, rejection_reason, membership_no, notes } = req.body;
    const approved_at = status === "approved" ? new Date().toISOString() : null;
    const r = await query(
      `UPDATE union_members SET status=$1, rejection_reason=COALESCE($2,rejection_reason),
       membership_no=COALESCE($3,membership_no), notes=COALESCE($4,notes),
       approved_at=COALESCE($5,approved_at) WHERE id=$6 RETURNING *`,
      [status, rejection_reason||null, membership_no||null, notes||null, approved_at, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/union-members/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM union_members WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Admin: الإعلانات
router.get("/admin/union-announcements", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const r = await query(`SELECT a.*, u.name AS union_name FROM union_announcements a LEFT JOIN unions u ON u.id=a.union_id ORDER BY a.created_at DESC`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/union-announcements", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const { union_id, title, body, image_url, link, is_pinned } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const r = await query(
      `INSERT INTO union_announcements (union_id,title,body,image_url,link,is_pinned) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [union_id?Number(union_id):null, title, body||null, image_url||null, link||null, Boolean(is_pinned)]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/union-announcements/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { title, body, image_url, link, is_pinned, is_active } = req.body;
    const r = await query(
      `UPDATE union_announcements SET title=COALESCE($1,title), body=COALESCE($2,body),
       image_url=COALESCE($3,image_url), link=COALESCE($4,link),
       is_pinned=COALESCE($5,is_pinned), is_active=COALESCE($6,is_active)
       WHERE id=$7 RETURNING *`,
      [title||null, body||null, image_url||null, link||null, is_pinned!=null?Boolean(is_pinned):null, is_active!=null?Boolean(is_active):null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/union-announcements/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM union_announcements WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Programs public routes ─────────────────────────────────────────────────
// GET /api/unions/programs — كل البرامج
router.get("/unions/programs", async (req: Request, res: Response) => {
  try {
    await ensureUnionsTables();
    const { union_id, type } = req.query as Record<string, string>;
    let where = "WHERE p.is_active=TRUE";
    const params: unknown[] = [];
    if (union_id) { params.push(Number(union_id)); where += ` AND p.union_id=$${params.length}`; }
    if (type) { params.push(type); where += ` AND p.type=$${params.length}`; }
    const r = await query(
      `SELECT p.*, u.name AS union_name, u.short_name AS union_short_name
       FROM union_programs p LEFT JOIN unions u ON u.id=p.union_id
       ${where} ORDER BY p.sort_order, p.start_date DESC, p.created_at DESC`,
      params
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/unions/laws — كل القوانين
router.get("/unions/laws", async (req: Request, res: Response) => {
  try {
    await ensureUnionsTables();
    const { union_id, category } = req.query as Record<string, string>;
    let where = "WHERE l.is_active=TRUE";
    const params: unknown[] = [];
    if (union_id) { params.push(Number(union_id)); where += ` AND l.union_id=$${params.length}`; }
    if (category) { params.push(category); where += ` AND l.category=$${params.length}`; }
    const r = await query(
      `SELECT l.*, u.name AS union_name, u.short_name AS union_short_name
       FROM union_laws l LEFT JOIN unions u ON u.id=l.union_id
       ${where} ORDER BY l.sort_order, l.created_at DESC`,
      params
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Programs admin routes ──────────────────────────────────────────────────
router.get("/admin/union-programs", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const { union_id } = req.query as Record<string, string>;
    let where = "WHERE 1=1";
    const params: unknown[] = [];
    if (union_id) { params.push(Number(union_id)); where += ` AND p.union_id=$${params.length}`; }
    const r = await query(
      `SELECT p.*, u.name AS union_name FROM union_programs p
       LEFT JOIN unions u ON u.id=p.union_id ${where}
       ORDER BY p.sort_order, p.start_date DESC, p.created_at DESC`,
      params
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/union-programs", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const { union_id, title, description, type, start_date, end_date, location, max_participants, fee, contact, link, is_active, sort_order } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const r = await query(
      `INSERT INTO union_programs (union_id,title,description,type,start_date,end_date,location,max_participants,fee,contact,link,is_active,sort_order)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [union_id||null, title, description||null, type||"event", start_date||null, end_date||null, location||null, max_participants||null, fee||null, contact||null, link||null, is_active!==false, sort_order||0]
    );
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/union-programs/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const { union_id, title, description, type, start_date, end_date, location, max_participants, fee, contact, link, is_active, sort_order } = req.body;
    const r = await query(
      `UPDATE union_programs SET
        union_id=COALESCE($1,union_id), title=COALESCE($2,title), description=COALESCE($3,description),
        type=COALESCE($4,type), start_date=COALESCE($5,start_date), end_date=COALESCE($6,end_date),
        location=COALESCE($7,location), max_participants=COALESCE($8,max_participants),
        fee=COALESCE($9,fee), contact=COALESCE($10,contact), link=COALESCE($11,link),
        is_active=COALESCE($12,is_active), sort_order=COALESCE($13,sort_order)
       WHERE id=$14 RETURNING *`,
      [union_id||null, title||null, description||null, type||null, start_date||null, end_date||null,
       location||null, max_participants||null, fee||null, contact||null, link||null,
       is_active!=null?Boolean(is_active):null, sort_order!=null?Number(sort_order):null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/union-programs/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM union_programs WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Laws admin routes ──────────────────────────────────────────────────────
router.get("/admin/union-laws", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const { union_id, category } = req.query as Record<string, string>;
    let where = "WHERE 1=1";
    const params: unknown[] = [];
    if (union_id) { params.push(Number(union_id)); where += ` AND l.union_id=$${params.length}`; }
    if (category) { params.push(category); where += ` AND l.category=$${params.length}`; }
    const r = await query(
      `SELECT l.*, u.name AS union_name FROM union_laws l
       LEFT JOIN unions u ON u.id=l.union_id ${where}
       ORDER BY l.sort_order, l.created_at DESC`,
      params
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/union-laws", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const { union_id, title, body, category, document_url, effective_date, version, is_active, sort_order } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const r = await query(
      `INSERT INTO union_laws (union_id,title,body,category,document_url,effective_date,version,is_active,sort_order)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [union_id||null, title, body||null, category||"bylaw", document_url||null, effective_date||null, version||null, is_active!==false, sort_order||0]
    );
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/union-laws/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionsTables();
    const { union_id, title, body, category, document_url, effective_date, version, is_active, sort_order } = req.body;
    const r = await query(
      `UPDATE union_laws SET
        union_id=COALESCE($1,union_id), title=COALESCE($2,title), body=COALESCE($3,body),
        category=COALESCE($4,category), document_url=COALESCE($5,document_url),
        effective_date=COALESCE($6,effective_date), version=COALESCE($7,version),
        is_active=COALESCE($8,is_active), sort_order=COALESCE($9,sort_order)
       WHERE id=$10 RETURNING *`,
      [union_id||null, title||null, body||null, category||null, document_url||null,
       effective_date||null, version||null, is_active!=null?Boolean(is_active):null,
       sort_order!=null?Number(sort_order):null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/union-laws/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM union_laws WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// قسم الاتصالات — المساحات الإعلانية وبوابة الشركات (V2)
// ══════════════════════════════════════════════════════════════════

// ── helpers ──
const PORTAL_SALT = "hasahisawi_telecom_portal_2024";
function hashPortalPin(pin: string): string {
  let h = 5381;
  const str = PORTAL_SALT + pin;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(12, "0");
}
function generatePortalToken(): string {
  return `tc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}
async function getPortalCompany(req: Request) {
  const auth = (req.headers.authorization || "") as string;
  if (!auth.startsWith("Bearer tc_")) return null;
  const token = auth.slice(7);
  const r = await query(`SELECT * FROM telecom_companies WHERE portal_token=$1 AND is_active=TRUE`, [token]);
  return r.rows[0] || null;
}

async function ensureTelecomV2() {
  await ensureTelecomTables();
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS portal_pin_hash VARCHAR(100)`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS portal_token VARCHAR(200)`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS contract_start DATE`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS contract_end DATE`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS package_type VARCHAR(20) DEFAULT 'basic'`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(12,2) DEFAULT 0`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100)`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS contact_email VARCHAR(100)`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS promo_tagline VARCHAR(300)`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS promo_banner_url TEXT`);
  await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS promo_badge VARCHAR(60)`);
  await query(`CREATE TABLE IF NOT EXISTS telecom_services (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER REFERENCES telecom_companies(id) ON DELETE CASCADE,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    icon        VARCHAR(50) DEFAULT 'star-outline',
    price       VARCHAR(60),
    category    VARCHAR(50) DEFAULT 'other',
    ussd_code   VARCHAR(60),
    link        TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

// ── Public: services ─────────────────────────────────────────────
router.get("/telecom/services", async (req: Request, res: Response) => {
  try {
    await ensureTelecomV2();
    const { company_id } = req.query as Record<string, string>;
    let where = "WHERE s.is_active=TRUE";
    const params: unknown[] = [];
    if (company_id) { params.push(Number(company_id)); where += ` AND s.company_id=$${params.length}`; }
    const r = await query(`SELECT s.*, c.name AS company_name, c.brand_color AS company_color FROM telecom_services s LEFT JOIN telecom_companies c ON c.id=s.company_id ${where} ORDER BY s.sort_order,s.created_at`, params);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Public: company promo data
router.get("/telecom/companies/promo", async (req: Request, res: Response) => {
  try {
    await ensureTelecomV2();
    const r = await query(`SELECT id,name,short,logo_initial,brand_color,brand_color2,promo_tagline,promo_banner_url,promo_badge,package_type,contract_end FROM telecom_companies WHERE is_active=TRUE AND package_type IN ('standard','premium') AND (contract_end IS NULL OR contract_end >= NOW()) ORDER BY CASE package_type WHEN 'premium' THEN 1 WHEN 'standard' THEN 2 ELSE 3 END, sort_order`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Portal auth ───────────────────────────────────────────────────
router.post("/telecom/portal/login", async (req: Request, res: Response) => {
  try {
    await ensureTelecomV2();
    const { company_id, pin } = req.body;
    if (!company_id || !pin) return res.status(400).json({ error: "بيانات ناقصة" });
    const r = await query(`SELECT * FROM telecom_companies WHERE id=$1 AND is_active=TRUE`, [Number(company_id)]);
    const company = r.rows[0];
    if (!company) return res.status(404).json({ error: "الشركة غير موجودة" });
    if (!company.portal_pin_hash) return res.status(403).json({ error: "لم يُفعَّل الدخول لهذه الشركة بعد" });
    if (company.portal_pin_hash !== hashPortalPin(String(pin))) return res.status(401).json({ error: "الرمز السري غير صحيح" });
    const token = generatePortalToken();
    await query(`UPDATE telecom_companies SET portal_token=$1 WHERE id=$2`, [token, company.id]);
    const { portal_pin_hash: _, portal_token: __, ...safe } = company;
    return res.json({ token, company: { ...safe, portal_token: token } });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/telecom/portal/me", async (req: Request, res: Response) => {
  try {
    await ensureTelecomV2();
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    const { portal_pin_hash: _, ...safe } = company;
    return res.json(safe);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/telecom/portal/me", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    const { description, website, hotline, ussd, recharge, contact_person, contact_email, promo_tagline, promo_banner_url, promo_badge } = req.body;
    // premium only: banner; standard+: tagline, badge
    const canBanner = ["premium"].includes(company.package_type);
    const canPromo  = ["standard","premium"].includes(company.package_type);
    const r = await query(`UPDATE telecom_companies SET
      description=COALESCE($1,description), website=COALESCE($2,website),
      hotline=COALESCE($3,hotline), ussd=COALESCE($4,ussd), recharge=COALESCE($5,recharge),
      contact_person=COALESCE($6,contact_person), contact_email=COALESCE($7,contact_email),
      promo_tagline=CASE WHEN $8 THEN COALESCE($9,promo_tagline) ELSE promo_tagline END,
      promo_banner_url=CASE WHEN $10 THEN COALESCE($11,promo_banner_url) ELSE promo_banner_url END,
      promo_badge=CASE WHEN $8 THEN COALESCE($12,promo_badge) ELSE promo_badge END
      WHERE id=$13 RETURNING *`,
      [description||null,website||null,hotline||null,ussd||null,recharge||null,contact_person||null,contact_email||null,canPromo,promo_tagline||null,canBanner,promo_banner_url||null,promo_badge||null,company.id]
    );
    const { portal_pin_hash: _, ...safe } = r.rows[0];
    return res.json(safe);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Portal: Offers
router.get("/telecom/portal/offers", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM telecom_offers WHERE company_id=$1 ORDER BY sort_order,created_at DESC`, [company.id]);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/telecom/portal/offers", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    const { title, description, category, price, currency, validity, details, sort_order } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const r = await query(`INSERT INTO telecom_offers (company_id,title,description,category,price,currency,validity,details,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [company.id,title,description||null,category||'data',Number(price)||0,currency||'SDG',validity||null,details||null,Number(sort_order)||0]);
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/telecom/portal/offers/:id", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    const { title, description, category, price, currency, validity, details, is_active, sort_order } = req.body;
    const r = await query(`UPDATE telecom_offers SET title=COALESCE($1,title),description=COALESCE($2,description),category=COALESCE($3,category),price=COALESCE($4,price),currency=COALESCE($5,currency),validity=COALESCE($6,validity),details=COALESCE($7,details),is_active=COALESCE($8,is_active),sort_order=COALESCE($9,sort_order) WHERE id=$10 AND company_id=$11 RETURNING *`,
      [title||null,description||null,category||null,price!=null?Number(price):null,currency||null,validity||null,details||null,is_active!=null?Boolean(is_active):null,sort_order!=null?Number(sort_order):null,req.params.id,company.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/telecom/portal/offers/:id", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    await query(`DELETE FROM telecom_offers WHERE id=$1 AND company_id=$2`, [req.params.id, company.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Portal: Events (premium only)
router.get("/telecom/portal/events", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM telecom_events WHERE company_id=$1 ORDER BY event_date ASC NULLS LAST`, [company.id]);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/telecom/portal/events", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    if (!["standard","premium"].includes(company.package_type)) return res.status(403).json({ error: "الباقة الحالية لا تدعم الفعاليات" });
    const { title, description, event_date, location } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const r = await query(`INSERT INTO telecom_events (company_id,title,description,event_date,location) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [company.id,title,description||null,event_date||null,location||null]);
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/telecom/portal/events/:id", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    const { title, description, event_date, location, is_active } = req.body;
    const r = await query(`UPDATE telecom_events SET title=COALESCE($1,title),description=COALESCE($2,description),event_date=COALESCE($3,event_date),location=COALESCE($4,location),is_active=COALESCE($5,is_active) WHERE id=$6 AND company_id=$7 RETURNING *`,
      [title||null,description||null,event_date||null,location||null,is_active!=null?Boolean(is_active):null,req.params.id,company.id]);
    return res.json(r.rows[0] || { error: "لم يُعثر" });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/telecom/portal/events/:id", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    await query(`DELETE FROM telecom_events WHERE id=$1 AND company_id=$2`, [req.params.id, company.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Portal: Services (standard + premium)
router.get("/telecom/portal/services", async (req: Request, res: Response) => {
  try {
    await ensureTelecomV2();
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM telecom_services WHERE company_id=$1 ORDER BY sort_order,created_at`, [company.id]);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/telecom/portal/services", async (req: Request, res: Response) => {
  try {
    await ensureTelecomV2();
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    if (!["standard","premium"].includes(company.package_type)) return res.status(403).json({ error: "الباقة الحالية لا تدعم الخدمات" });
    const { title, description, icon, price, category, ussd_code, link, sort_order } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const r = await query(`INSERT INTO telecom_services (company_id,title,description,icon,price,category,ussd_code,link,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [company.id,title,description||null,icon||'star-outline',price||null,category||'other',ussd_code||null,link||null,Number(sort_order)||0]);
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/telecom/portal/services/:id", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    const { title, description, icon, price, category, ussd_code, link, is_active, sort_order } = req.body;
    const r = await query(`UPDATE telecom_services SET title=COALESCE($1,title),description=COALESCE($2,description),icon=COALESCE($3,icon),price=COALESCE($4,price),category=COALESCE($5,category),ussd_code=COALESCE($6,ussd_code),link=COALESCE($7,link),is_active=COALESCE($8,is_active),sort_order=COALESCE($9,sort_order) WHERE id=$10 AND company_id=$11 RETURNING *`,
      [title||null,description||null,icon||null,price||null,category||null,ussd_code||null,link||null,is_active!=null?Boolean(is_active):null,sort_order!=null?Number(sort_order):null,req.params.id,company.id]);
    return res.json(r.rows[0] || { error: "لم يُعثر" });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/telecom/portal/services/:id", async (req: Request, res: Response) => {
  try {
    const company = await getPortalCompany(req);
    if (!company) return res.status(401).json({ error: "غير مصرح" });
    await query(`DELETE FROM telecom_services WHERE id=$1 AND company_id=$2`, [req.params.id, company.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: credentials + contracts ───────────────────────────────
router.patch("/admin/telecom/companies/:id/credentials", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureTelecomV2();
    const { pin, package_type, contract_start, contract_end, monthly_fee, contact_person, contact_email } = req.body;
    const pinHash = pin ? hashPortalPin(String(pin)) : null;
    const r = await query(`UPDATE telecom_companies SET
      portal_pin_hash=CASE WHEN $1::text IS NOT NULL THEN $1 ELSE portal_pin_hash END,
      package_type=COALESCE($2,package_type),
      contract_start=COALESCE($3,contract_start),
      contract_end=COALESCE($4,contract_end),
      monthly_fee=COALESCE($5,monthly_fee),
      contact_person=COALESCE($6,contact_person),
      contact_email=COALESCE($7,contact_email)
      WHERE id=$8 RETURNING id,name,short,package_type,contract_start,contract_end,monthly_fee,contact_person,contact_email,is_active`,
      [pinHash,package_type||null,contract_start||null,contract_end||null,monthly_fee!=null?Number(monthly_fee):null,contact_person||null,contact_email||null,req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json({ ...r.rows[0], pin_set: !!pinHash || undefined });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/telecom/services", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureTelecomV2();
    const r = await query(`SELECT s.*, c.name AS company_name FROM telecom_services s LEFT JOIN telecom_companies c ON c.id=s.company_id ORDER BY s.created_at DESC`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});


// ══════════════════════════════════════════════════════════════════════════════
// مخططات البيانات — Chart Data للـ Dashboard
// ══════════════════════════════════════════════════════════════════════════════
router.get("/admin/chart-data", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });

    // آخر 7 أيام — مستخدمون جدد + منشورات
    const dailyActivity = await query(`
      WITH days AS (
        SELECT generate_series(NOW()::date - 6, NOW()::date, '1 day'::interval)::date AS d
      )
      SELECT
        to_char(d, 'DD/MM') AS date,
        COALESCE((SELECT COUNT(*) FROM users WHERE created_at::date = d), 0)::int AS users,
        COALESCE((SELECT COUNT(*) FROM posts WHERE created_at::date = d), 0)::int AS posts
      FROM days ORDER BY d
    `).catch(() => ({ rows: [] }));

    // توزيع رحلات المواصلات
    const transportPie = await query(`
      SELECT status, COUNT(*)::int AS value FROM transport_trips GROUP BY status
    `).catch(() => ({ rows: [] }));
    const TRANSPORT_COLORS: Record<string, string> = {
      pending: "#fbbf24", accepted: "#60a5fa", in_progress: "#f97316",
      completed: "#34d399", cancelled: "#f87171", rejected: "#9ca3af",
    };
    const TRANSPORT_LABELS: Record<string, string> = {
      pending: "انتظار", accepted: "مقبول", in_progress: "جارٍ",
      completed: "مكتمل", cancelled: "ملغى", rejected: "مرفوض",
    };

    // حالات طلبات زواجل
    const zawajilBar = await query(`
      SELECT status, COUNT(*)::int AS count FROM zawajil_orders GROUP BY status ORDER BY count DESC
    `).catch(() => ({ rows: [] }));
    const ZAWAJIL_COLORS: Record<string, string> = {
      pending_review: "#fbbf24", modification_requested: "#c084fc",
      approved: "#60a5fa", preparing: "#2dd4bf", sending: "#f97316",
      completed: "#34d399", rejected: "#f87171", returned: "#9ca3af",
    };
    const ZAWAJIL_LABELS: Record<string, string> = {
      pending_review: "مراجعة", modification_requested: "تعديل",
      approved: "مقبول", preparing: "تجهيز", sending: "إرسال",
      completed: "مكتمل", rejected: "مرفوض", returned: "مُعاد",
    };

    // أكثر الأقسام استخداماً (تقديري من عدد السجلات)
    const sectionUsage = await query(`
      SELECT section, label, count FROM (VALUES
        ('posts',     'المنشورات',  (SELECT COUNT(*) FROM posts)::int),
        ('transport', 'المواصلات',  (SELECT COUNT(*) FROM transport_trips)::int),
        ('jobs',      'الوظائف',    (SELECT COUNT(*) FROM jobs)::int),
        ('ads',       'الإعلانات',  (SELECT COUNT(*) FROM ads)::int),
        ('missing',   'المفقودات',  (SELECT COUNT(*) FROM lost_items)::int),
        ('zawajil',   'زواجل',      (SELECT COUNT(*) FROM zawajil_orders)::int),
        ('sports',    'الرياضة',    (SELECT COUNT(*) FROM sports_posts)::int)
      ) AS t(section, label, count)
      WHERE count > 0
      ORDER BY count DESC LIMIT 7
    `).catch(() => ({ rows: [] }));

    return res.json({
      daily_activity: dailyActivity.rows,
      transport_pie: transportPie.rows.map((r: any) => ({
        name: TRANSPORT_LABELS[r.status] || r.status,
        value: r.value,
        color: TRANSPORT_COLORS[r.status] || "#6b7280",
      })),
      zawajil_bar: zawajilBar.rows.map((r: any) => ({
        status: r.status,
        label: ZAWAJIL_LABELS[r.status] || r.status,
        count: r.count,
        color: ZAWAJIL_COLORS[r.status] || "#6b7280",
      })),
      section_usage: sectionUsage.rows,
    });
  } catch (e: any) { logger.error({ err: e?.message }, ""); return res.status(500).json({ error: "Server error" }); }
});

// إضافة إحصائيات زواجل لـ full-stats (patch في الـ router)
router.get("/admin/zawajil-stats", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(CASE WHEN status='pending_review' THEN 1 END)::text AS pending,
        COUNT(CASE WHEN status='approved' THEN 1 END)::text AS approved,
        COUNT(CASE WHEN status='completed' THEN 1 END)::text AS completed
      FROM zawajil_orders
    `).catch(() => ({ rows: [{ total: "0", pending: "0", approved: "0", completed: "0" }] }));
    return res.json(r.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// إشعارات حسب الفئة — Segment Push Notifications
// ══════════════════════════════════════════════════════════════════════════════
router.post("/admin/push/segment", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { segment, title, body, data: extraData } = req.body;
    if (!title || !body || !segment) return res.status(400).json({ error: "الفئة والعنوان والمحتوى مطلوبة" });

    let tokenQuery = `SELECT pt.token FROM push_tokens pt JOIN users u ON u.id=pt.user_id WHERE pt.token LIKE 'ExponentPushToken%'`;

    if (segment === "admins") {
      tokenQuery = `SELECT pt.token FROM push_tokens pt JOIN users u ON u.id=pt.user_id WHERE pt.token LIKE 'ExponentPushToken%' AND u.role IN ('admin','moderator')`;
    } else if (segment === "transport") {
      tokenQuery = `SELECT DISTINCT pt.token FROM push_tokens pt WHERE pt.token LIKE 'ExponentPushToken%' AND pt.user_id IN (SELECT DISTINCT sender_id FROM transport_trips WHERE sender_id IS NOT NULL)`;
    } else if (segment === "zawajil") {
      tokenQuery = `SELECT DISTINCT pt.token FROM push_tokens pt WHERE pt.token LIKE 'ExponentPushToken%' AND pt.user_id IN (SELECT DISTINCT sender_id FROM zawajil_orders WHERE sender_id IS NOT NULL)`;
    } else if (segment === "social") {
      tokenQuery = `SELECT DISTINCT pt.token FROM push_tokens pt WHERE pt.token LIKE 'ExponentPushToken%' AND pt.user_id IN (SELECT DISTINCT author_id FROM posts WHERE author_id IS NOT NULL)`;
    } else if (segment === "sports") {
      tokenQuery = `SELECT DISTINCT pt.token FROM push_tokens pt WHERE pt.token LIKE 'ExponentPushToken%' AND pt.user_id IN (SELECT DISTINCT author_id FROM sports_posts WHERE author_id IS NOT NULL)`;
    } else if (segment === "jobs") {
      tokenQuery = `SELECT DISTINCT pt.token FROM push_tokens pt WHERE pt.token LIKE 'ExponentPushToken%' AND pt.user_id IN (SELECT DISTINCT posted_by FROM jobs WHERE posted_by IS NOT NULL)`;
    } else if (segment === "merchants") {
      tokenQuery = `SELECT DISTINCT pt.token FROM push_tokens pt WHERE pt.token LIKE 'ExponentPushToken%' AND pt.user_id IN (SELECT DISTINCT user_id FROM merchant_spaces WHERE user_id IS NOT NULL)`;
    }
    // "all" — uses default query above

    const { rows } = await query(tokenQuery).catch(() => ({ rows: [] }));
    if (!rows.length) return res.json({ ok: true, sent: 0 });

    const chunks: any[][] = [];
    for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
    let sent = 0;
    for (const chunk of chunks) {
      const messages = chunk.map((r: any) => ({ to: r.token, title, body, data: extraData ?? {}, sound: "default" }));
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      }).catch(() => {});
      sent += chunk.length;
    }
    // حفظ في DB للأدمن
    await query(`INSERT INTO notifications (user_id, type, title, body, data) SELECT id, 'segment', $1, $2, $3 FROM users WHERE role IN ('admin','moderator')`,
      [title, body, JSON.stringify({ segment, ...(extraData ?? {}) })]).catch(() => {});
    return res.json({ ok: true, sent });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// بوابة التجار — Merchant Self-Service Portal
// ══════════════════════════════════════════════════════════════════════════════
function hashMerchantPin(pin: string): string {
  let h = 0;
  for (let i = 0; i < pin.length; i++) { h = (Math.imul(31, h) + pin.charCodeAt(i)) | 0; }
  return `mp_${Math.abs(h).toString(16).padStart(8, "0")}`;
}

async function ensureMerchantPortalCols() {
  await query(`ALTER TABLE merchant_spaces ADD COLUMN IF NOT EXISTS portal_pin_hash VARCHAR(100)`);
  await query(`ALTER TABLE merchant_spaces ADD COLUMN IF NOT EXISTS portal_token VARCHAR(200)`);
  await query(`ALTER TABLE merchant_spaces ADD COLUMN IF NOT EXISTS user_id INTEGER`);
  await query(`CREATE TABLE IF NOT EXISTS merchant_items (
    id             SERIAL PRIMARY KEY,
    shop_id        INTEGER NOT NULL REFERENCES merchant_spaces(id) ON DELETE CASCADE,
    name           VARCHAR(200) NOT NULL,
    description    TEXT,
    price          NUMERIC(12,2) DEFAULT 0,
    unit           VARCHAR(30) DEFAULT 'حبة',
    category       VARCHAR(60) DEFAULT 'general',
    image_emoji    VARCHAR(10) DEFAULT '📦',
    quantity_hint  VARCHAR(100),
    is_available   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order     INTEGER DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function getMerchantByToken(token: string) {
  if (!token?.startsWith("mp_")) return null;
  const r = await query(`SELECT * FROM merchant_spaces WHERE portal_token=$1 AND status='approved'`, [token]);
  return r.rows[0] || null;
}

// POST /api/merchant-portal/login — تسجيل دخول التاجر بالـ PIN
router.post("/merchant-portal/login", async (req: Request, res: Response) => {
  try {
    await ensureMerchantPortalCols();
    const { shop_id, pin } = req.body;
    if (!shop_id || !pin) return res.status(400).json({ error: "رقم المتجر والرمز مطلوبان" });
    const r = await query(`SELECT * FROM merchant_spaces WHERE id=$1`, [Number(shop_id)]);
    const shop = r.rows[0];
    if (!shop) return res.status(404).json({ error: "المتجر غير موجود" });
    if (!shop.portal_pin_hash) return res.status(403).json({ error: "لم يُفعَّل الدخول لهذا المتجر. تواصل مع الإدارة." });
    if (shop.portal_pin_hash !== hashMerchantPin(String(pin))) return res.status(401).json({ error: "الرمز السري غير صحيح" });

    // توليد/تجديد التوكن
    const token = `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    await query(`UPDATE merchant_spaces SET portal_token=$1 WHERE id=$2`, [token, shop.id]);

    const items = await query(`SELECT * FROM merchant_items WHERE shop_id=$1 ORDER BY sort_order, name`, [shop.id]);
    const { portal_pin_hash: _, portal_token: __, ...safe } = shop;
    return res.json({ shop: { ...safe, portal_token: token }, items: items.rows, token });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/merchant-portal/shop/:id/items
router.get("/merchant-portal/shop/:id/items", async (req: Request, res: Response) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const shop = await getMerchantByToken(token);
    if (!shop || shop.id !== Number(req.params.id)) return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM merchant_items WHERE shop_id=$1 ORDER BY sort_order, name`, [shop.id]);
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/merchant-portal/shop/:id/items — إضافة منتج
router.post("/merchant-portal/shop/:id/items", async (req: Request, res: Response) => {
  try {
    await ensureMerchantPortalCols();
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const shop = await getMerchantByToken(token);
    if (!shop || shop.id !== Number(req.params.id)) return res.status(403).json({ error: "غير مصرح" });
    const { name, description, price, unit, category, image_emoji, quantity_hint, is_available, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
    const r = await query(`INSERT INTO merchant_items(shop_id,name,description,price,unit,category,image_emoji,quantity_hint,is_available,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [shop.id, name, description||null, price||0, unit||"حبة", category||"general", image_emoji||"📦", quantity_hint||null, is_available!==false, sort_order||0]);
    return res.status(201).json(r.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/merchant-portal/shop/:id/items/:itemId — تعديل منتج
router.patch("/merchant-portal/shop/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    await ensureMerchantPortalCols();
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const shop = await getMerchantByToken(token);
    if (!shop || shop.id !== Number(req.params.id)) return res.status(403).json({ error: "غير مصرح" });
    const { name, description, price, unit, category, image_emoji, quantity_hint, is_available, sort_order } = req.body;
    const r = await query(`UPDATE merchant_items SET
      name=COALESCE($1,name), description=COALESCE($2,description), price=COALESCE($3::numeric,price),
      unit=COALESCE($4,unit), category=COALESCE($5,category), image_emoji=COALESCE($6,image_emoji),
      quantity_hint=COALESCE($7,quantity_hint), is_available=COALESCE($8,is_available),
      sort_order=COALESCE($9::int,sort_order)
      WHERE id=$10 AND shop_id=$11 RETURNING *`,
      [name||null, description||null, price!=null?Number(price):null, unit||null, category||null,
       image_emoji||null, quantity_hint||null, is_available!=null?Boolean(is_available):null,
       sort_order!=null?Number(sort_order):null, req.params.itemId, shop.id]);
    return res.json(r.rows[0] || { error: "لم يُعثر" });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/merchant-portal/shop/:id/items/:itemId
router.delete("/merchant-portal/shop/:id/items/:itemId", async (req: Request, res: Response) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const shop = await getMerchantByToken(token);
    if (!shop || shop.id !== Number(req.params.id)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM merchant_items WHERE id=$1 AND shop_id=$2`, [req.params.itemId, shop.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/merchant-portal/shop/:id — تعديل معلومات المتجر
router.patch("/merchant-portal/shop/:id", async (req: Request, res: Response) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const shop = await getMerchantByToken(token);
    if (!shop || shop.id !== Number(req.params.id)) return res.status(403).json({ error: "غير مصرح" });
    const { description, address, phone, whatsapp, working_hours, logo_emoji } = req.body;
    const r = await query(`UPDATE merchant_spaces SET
      description=COALESCE($1,description), address=COALESCE($2,address), phone=COALESCE($3,phone),
      whatsapp=COALESCE($4,whatsapp), working_hours=COALESCE($5,working_hours), logo_emoji=COALESCE($6,logo_emoji)
      WHERE id=$7 RETURNING *`,
      [description||null, address||null, phone||null, whatsapp||null, working_hours||null, logo_emoji||null, shop.id]);
    const { portal_pin_hash: _, portal_token: __, ...safe } = r.rows[0] || {};
    return res.json(safe);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/merchants/:id/set-portal-pin — تعيين PIN للتاجر
router.patch("/admin/merchants/:id/set-portal-pin", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await ensureMerchantPortalCols();
    const { pin } = req.body;
    if (!pin || String(pin).length < 4) return res.status(400).json({ error: "الرمز يجب أن يكون 4 أرقام على الأقل" });
    await query(`UPDATE merchant_spaces SET portal_pin_hash=$1, portal_token=NULL WHERE id=$2`, [hashMerchantPin(String(pin)), req.params.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/merchant-items/:shopId — قائمة منتجات المتجر للأدمن
router.get("/admin/merchant-items/:shopId", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await ensureMerchantPortalCols();
    const r = await query(`SELECT * FROM merchant_items WHERE shop_id=$1 ORDER BY sort_order, name`, [req.params.shopId]);
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GOVERNMENT ENTITIES — الجهات الحكومية
// ══════════════════════════════════════════════════════════════════════════════
async function ensureGovEntitiesTables() {
  await query(`CREATE TABLE IF NOT EXISTS gov_entities (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    icon        VARCHAR(20)  NOT NULL DEFAULT '🏛️',
    category    VARCHAR(50)  NOT NULL DEFAULT 'government',
    description TEXT,
    phone       VARCHAR(30),
    email       VARCHAR(100),
    address     TEXT,
    is_visible  BOOLEAN      NOT NULL DEFAULT TRUE,
    join_status VARCHAR(20)  NOT NULL DEFAULT 'pending'
                CHECK (join_status IN ('pending','invited','joined')),
    invited_at  TIMESTAMPTZ,
    joined_at   TIMESTAMPTZ,
    notes       TEXT,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )`);
  const { rows } = await query(`SELECT COUNT(*) AS c FROM gov_entities`);
  if (Number(rows[0].c) === 0) {
    const seed = [
      { name: "المحلية",                icon: "🏛️", category: "municipality", description: "مجلس محلية الحصاحيصا — الإدارة المحلية والخدمات البلدية",         sort_order: 1 },
      { name: "السجل المدني",           icon: "📋", category: "civil",        description: "إدارة الأحوال الشخصية — شهادات الميلاد والوفاة والزواج",            sort_order: 2 },
      { name: "مكتب الأراضي",          icon: "🏡", category: "land",         description: "تسجيل وتوثيق الأراضي والعقارات في الحصاحيصا",                     sort_order: 3 },
      { name: "المحكمة",               icon: "⚖️", category: "justice",      description: "محكمة الحصاحيصا — إجراءات قضائية ورفع دعاوى",                     sort_order: 4 },
      { name: "الشرطة",                icon: "🚔", category: "security",     description: "مركز شرطة الحصاحيصا — الأمن والبلاغات",                          sort_order: 5 },
      { name: "مستشفى الحصاحيصا",     icon: "🏥", category: "health",       description: "المستشفى التعليمي — طوارئ، عيادات، دخول",                        sort_order: 6 },
      { name: "إدارة التعليم",         icon: "🎓", category: "education",    description: "إدارة التعليم بمحلية الحصاحيصا — مدارس وشهادات",                  sort_order: 7 },
      { name: "شركة الكهرباء",         icon: "⚡", category: "utility",      description: "توزيع الكهرباء — انقطاعات وفواتير واشتراكات جديدة",               sort_order: 8 },
      { name: "وحدة المياه",           icon: "💧", category: "utility",      description: "خدمات المياه والصرف الصحي",                                      sort_order: 9 },
      { name: "مكتب البريد السوداني",  icon: "📮", category: "postal",       description: "بريد السودان — فرع الحصاحيصا",                                   sort_order: 10 },
      { name: "مكتب العمل",            icon: "💼", category: "labor",        description: "مكتب عمل الحصاحيصا — تصاريح وتوظيف",                            sort_order: 11 },
      { name: "ديوان الزكاة",          icon: "🤲", category: "social",       description: "ديوان الزكاة — تقديم الدعم للمستحقين",                           sort_order: 12 },
    ];
    for (const e of seed) {
      await query(
        `INSERT INTO gov_entities (name,icon,category,description,sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [e.name, e.icon, e.category, e.description, e.sort_order]
      );
    }
  }
}

// Public: visible entities only
router.get("/gov-entities", async (_req: Request, res: Response) => {
  try {
    await ensureGovEntitiesTables();
    const { rows } = await query(
      `SELECT id,name,icon,category,description,phone,email,address,join_status,sort_order
         FROM gov_entities WHERE is_visible = TRUE ORDER BY sort_order, id`
    );
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Admin: all entities
router.get("/admin/gov-entities", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await ensureGovEntitiesTables();
    const { rows } = await query(`SELECT * FROM gov_entities ORDER BY sort_order, id`);
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Admin: add entity
router.post("/admin/gov-entities", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await ensureGovEntitiesTables();
    const { name, icon, category, description, phone, email, address, is_visible, join_status, notes, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
    const { rows } = await query(
      `INSERT INTO gov_entities (name,icon,category,description,phone,email,address,is_visible,join_status,notes,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name, icon||"🏛️", category||"government", description||null, phone||null, email||null,
       address||null, is_visible!==false, join_status||"pending", notes||null, sort_order||0]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Admin: update entity
router.patch("/admin/gov-entities/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const id = Number(req.params.id);
    const b  = req.body;
    const fields: string[] = []; const vals: unknown[] = [];
    for (const k of ["name","icon","category","description","phone","email","address","is_visible","join_status","notes","sort_order"]) {
      if (b[k] !== undefined) { vals.push(b[k]); fields.push(`${k} = $${vals.length}`); }
    }
    if (b.join_status === "invited") { vals.push(new Date()); fields.push(`invited_at = $${vals.length}`); }
    if (b.join_status === "joined")  { vals.push(new Date()); fields.push(`joined_at  = $${vals.length}`); }
    if (!fields.length) return res.json({ ok: true });
    vals.push(id);
    const { rows } = await query(
      `UPDATE gov_entities SET ${fields.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals
    );
    return res.json(rows[0] || { error: "لم يُعثر" });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Admin: delete entity
router.delete("/admin/gov-entities/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM gov_entities WHERE id = $1`, [Number(req.params.id)]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// معرض التصاميم — Design Gallery
// ══════════════════════════════════════════════════════════════════

async function ensureDesignGalleryTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS design_gallery_packages (
      id            SERIAL PRIMARY KEY,
      name          TEXT    NOT NULL,
      description   TEXT,
      price_monthly INTEGER NOT NULL DEFAULT 0,
      max_products  INTEGER NOT NULL DEFAULT 10,
      is_unlimited  BOOLEAN NOT NULL DEFAULT FALSE,
      is_featured   BOOLEAN NOT NULL DEFAULT FALSE,
      color         TEXT    NOT NULL DEFAULT '#22C55E',
      icon          TEXT    NOT NULL DEFAULT '🎨',
      features      TEXT[]  NOT NULL DEFAULT '{}',
      sort_order    INTEGER NOT NULL DEFAULT 0,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS design_gallery_members (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      package_id    INTEGER REFERENCES design_gallery_packages(id) ON DELETE SET NULL,
      shop_name     TEXT    NOT NULL,
      bio           TEXT,
      avatar_url    TEXT,
      whatsapp      TEXT,
      instagram     TEXT,
      facebook      TEXT,
      categories    TEXT[]  NOT NULL DEFAULT '{}',
      status        TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','suspended','expired')),
      expires_at    TIMESTAMPTZ,
      views         INTEGER NOT NULL DEFAULT 0,
      rating        NUMERIC(3,2) NOT NULL DEFAULT 0,
      rating_count  INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS design_gallery_products (
      id            SERIAL PRIMARY KEY,
      member_id     INTEGER NOT NULL REFERENCES design_gallery_members(id) ON DELETE CASCADE,
      title         TEXT    NOT NULL,
      description   TEXT,
      category      TEXT    NOT NULL DEFAULT 'invitations',
      price         INTEGER NOT NULL DEFAULT 0,
      images        TEXT[]  NOT NULL DEFAULT '{}',
      is_custom     BOOLEAN NOT NULL DEFAULT TRUE,
      delivery_days INTEGER NOT NULL DEFAULT 3,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      views         INTEGER NOT NULL DEFAULT 0,
      orders_count  INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS design_gallery_orders (
      id             SERIAL PRIMARY KEY,
      product_id     INTEGER REFERENCES design_gallery_products(id) ON DELETE SET NULL,
      member_id      INTEGER NOT NULL REFERENCES design_gallery_members(id) ON DELETE CASCADE,
      customer_name  TEXT    NOT NULL,
      customer_phone TEXT    NOT NULL,
      customer_notes TEXT,
      custom_data    JSONB   NOT NULL DEFAULT '{}',
      status         TEXT    NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','processing','done','cancelled')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const { rows: pkg } = await query(`SELECT id FROM design_gallery_packages LIMIT 1`);
  if (pkg.length === 0) {
    const packages = [
      {
        name: 'أساسي', description: 'ابدأ رحلتك الإبداعية بتكلفة منخفضة', price_monthly: 1500,
        max_products: 10, is_featured: false, color: '#22C55E', icon: '🌱',
        features: ['10 منتجات', 'صفحة شخصية احترافية', 'استقبال طلبات مباشرة', 'دعم فني'], sort_order: 1,
      },
      {
        name: 'احترافي', description: 'للمصممين المحترفين الباحثين عن انتشار واسع', price_monthly: 3500,
        max_products: 30, is_featured: true, color: '#F59E0B', icon: '⭐',
        features: ['30 منتج', 'ظهور مميز في الرئيسية', 'تحليلات الزيارات', 'شارة "موثّق"', 'أولوية في الدعم'], sort_order: 2,
      },
      {
        name: 'مميز', description: 'الباقة الشاملة لعلامة تجارية متميزة', price_monthly: 6000,
        max_products: 999, is_unlimited: true, is_featured: true, color: '#A855F7', icon: '👑',
        features: ['منتجات غير محدودة', 'أعلى نتائج البحث', 'شارة "ذهبية"', 'نشر على التواصل الاجتماعي', 'تقارير شهرية', 'مدير حساب خاص'], sort_order: 3,
      },
    ];
    for (const p of packages) {
      await query(
        `INSERT INTO design_gallery_packages
           (name,description,price_monthly,max_products,is_unlimited,is_featured,color,icon,features,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [p.name, p.description, p.price_monthly, p.max_products, (p as any).is_unlimited||false, p.is_featured, p.color, p.icon, p.features, p.sort_order]
      );
    }
  }
}

router.get("/design-gallery/packages", async (_req: Request, res: Response) => {
  try {
    await ensureDesignGalleryTables();
    const { rows } = await query(`SELECT * FROM design_gallery_packages WHERE is_active=TRUE ORDER BY sort_order`);
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/design-gallery/products", async (req: Request, res: Response) => {
  try {
    await ensureDesignGalleryTables();
    const { category, member_id, limit: lim = "30", offset: off = "0" } = req.query as Record<string,string>;
    let sql = `SELECT p.*, m.shop_name, m.avatar_url, m.rating
               FROM design_gallery_products p
               JOIN design_gallery_members m ON m.id = p.member_id
               WHERE p.is_active=TRUE AND m.status='active'`;
    const vals: unknown[] = [];
    if (category && category !== 'all') { vals.push(category); sql += ` AND p.category=$${vals.length}`; }
    if (member_id)                       { vals.push(Number(member_id)); sql += ` AND p.member_id=$${vals.length}`; }
    sql += ` ORDER BY p.sort_order DESC, p.created_at DESC LIMIT $${vals.length+1} OFFSET $${vals.length+2}`;
    vals.push(Number(lim), Number(off));
    const { rows } = await query(sql, vals);
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/design-gallery/members", async (_req: Request, res: Response) => {
  try {
    await ensureDesignGalleryTables();
    const { rows } = await query(`
      SELECT m.*, pkg.name as package_name, pkg.color as pkg_color, pkg.icon as pkg_icon, pkg.is_featured,
             COUNT(p.id)::int as product_count
      FROM design_gallery_members m
      LEFT JOIN design_gallery_packages pkg ON pkg.id = m.package_id
      LEFT JOIN design_gallery_products  p   ON p.member_id = m.id AND p.is_active = TRUE
      WHERE m.status = 'active'
      GROUP BY m.id, pkg.name, pkg.color, pkg.icon, pkg.is_featured
      ORDER BY pkg.is_featured DESC NULLS LAST, m.rating DESC, m.created_at DESC
    `);
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/design-gallery/orders", async (req: Request, res: Response) => {
  try {
    await ensureDesignGalleryTables();
    const { product_id, member_id, customer_name, customer_phone, customer_notes, custom_data } = req.body;
    if (!member_id || !customer_name || !customer_phone)
      return res.status(400).json({ error: "بيانات ناقصة" });
    const { rows } = await query(
      `INSERT INTO design_gallery_orders (product_id,member_id,customer_name,customer_phone,customer_notes,custom_data)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [product_id||null, Number(member_id), customer_name, customer_phone, customer_notes||null, JSON.stringify(custom_data||{})]
    );
    if (product_id) await query(`UPDATE design_gallery_products SET orders_count = orders_count+1 WHERE id=$1`, [product_id]);
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/design-gallery/subscribe", async (req: Request, res: Response) => {
  try {
    await ensureDesignGalleryTables();
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { package_id, shop_name, bio, whatsapp, instagram, facebook, categories } = req.body;
    if (!shop_name || !package_id) return res.status(400).json({ error: "اسم المتجر والباقة مطلوبان" });
    const { rows: ex } = await query(`SELECT id FROM design_gallery_members WHERE user_id=$1`, [userId]);
    if (ex.length > 0) {
      const { rows } = await query(
        `UPDATE design_gallery_members SET package_id=$1,shop_name=$2,bio=$3,whatsapp=$4,instagram=$5,facebook=$6,categories=$7,status='pending'
         WHERE user_id=$8 RETURNING *`,
        [package_id, shop_name, bio||null, whatsapp||null, instagram||null, facebook||null, categories||[], userId]
      );
      return res.json(rows[0]);
    }
    const { rows } = await query(
      `INSERT INTO design_gallery_members (user_id,package_id,shop_name,bio,whatsapp,instagram,facebook,categories)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, package_id, shop_name, bio||null, whatsapp||null, instagram||null, facebook||null, categories||[]]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/design-gallery/my-shop", async (req: Request, res: Response) => {
  try {
    await ensureDesignGalleryTables();
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { rows } = await query(
      `SELECT m.*, pkg.name as package_name, pkg.max_products, pkg.is_unlimited, pkg.color as pkg_color
       FROM design_gallery_members m
       LEFT JOIN design_gallery_packages pkg ON pkg.id = m.package_id
       WHERE m.user_id=$1`, [userId]
    );
    if (!rows.length) return res.status(404).json({ error: "لا يوجد متجر" });
    const { rows: prods } = await query(`SELECT * FROM design_gallery_products WHERE member_id=$1 ORDER BY created_at DESC`, [rows[0].id]);
    return res.json({ ...rows[0], products: prods });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/design-gallery/my-products", async (req: Request, res: Response) => {
  try {
    await ensureDesignGalleryTables();
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { rows: mem } = await query(`SELECT * FROM design_gallery_members WHERE user_id=$1`, [userId]);
    if (!mem.length || mem[0].status !== 'active') return res.status(403).json({ error: "المتجر غير مفعّل" });
    const { title, description, category, price, images, is_custom, delivery_days } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const { rows } = await query(
      `INSERT INTO design_gallery_products (member_id,title,description,category,price,images,is_custom,delivery_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [mem[0].id, title, description||null, category||'invitations', price||0, images||[], is_custom!==false, delivery_days||3]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/design-gallery/my-products/:id", async (req: Request, res: Response) => {
  try {
    await ensureDesignGalleryTables();
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { rows: mem } = await query(`SELECT id FROM design_gallery_members WHERE user_id=$1`, [userId]);
    if (!mem.length) return res.status(403).json({ error: "غير مصرح" });
    const b = req.body; const fields: string[] = []; const vals: unknown[] = [];
    for (const k of ['title','description','category','price','images','is_custom','delivery_days','is_active','sort_order']) {
      if (b[k] !== undefined) { vals.push(b[k]); fields.push(`${k}=$${vals.length}`); }
    }
    if (!fields.length) return res.json({ ok: true });
    vals.push(Number(req.params.id), mem[0].id);
    const { rows } = await query(
      `UPDATE design_gallery_products SET ${fields.join(',')} WHERE id=$${vals.length-1} AND member_id=$${vals.length} RETURNING *`, vals
    );
    return res.json(rows[0] || { error: "لم يُعثر" });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/design-gallery/my-products/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { rows: mem } = await query(`SELECT id FROM design_gallery_members WHERE user_id=$1`, [userId]);
    if (!mem.length) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM design_gallery_products WHERE id=$1 AND member_id=$2`, [Number(req.params.id), mem[0].id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/design-gallery/members", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await ensureDesignGalleryTables();
    const { rows } = await query(`
      SELECT m.*, pkg.name as package_name, pkg.color as pkg_color,
             COUNT(DISTINCT p.id)::int   as product_count,
             COUNT(DISTINCT o.id)::int   as order_count
      FROM design_gallery_members m
      LEFT JOIN design_gallery_packages  pkg ON pkg.id = m.package_id
      LEFT JOIN design_gallery_products  p   ON p.member_id = m.id
      LEFT JOIN design_gallery_orders    o   ON o.member_id = m.id
      GROUP BY m.id, pkg.name, pkg.color ORDER BY m.created_at DESC
    `);
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/design-gallery/members/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status, expires_at } = req.body;
    const { rows } = await query(
      `UPDATE design_gallery_members SET status=COALESCE($1,status), expires_at=COALESCE($2,expires_at) WHERE id=$3 RETURNING *`,
      [status||null, expires_at||null, Number(req.params.id)]
    );
    return res.json(rows[0] || { error: "لم يُعثر" });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/design-gallery/members/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM design_gallery_members WHERE id=$1`, [Number(req.params.id)]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/design-gallery/orders", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await ensureDesignGalleryTables();
    const { rows } = await query(`
      SELECT o.*, m.shop_name, p.title as product_title
      FROM design_gallery_orders o
      JOIN design_gallery_members m ON m.id = o.member_id
      LEFT JOIN design_gallery_products p ON p.id = o.product_id
      ORDER BY o.created_at DESC LIMIT 300
    `);
    return res.json(rows);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/design-gallery/orders/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.body;
    const { rows } = await query(`UPDATE design_gallery_orders SET status=$1 WHERE id=$2 RETURNING *`, [status, Number(req.params.id)]);
    return res.json(rows[0] || { error: "لم يُعثر" });
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/design-gallery/packages", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { name, description, price_monthly, max_products, is_unlimited, is_featured, color, icon, features, sort_order } = req.body;
    const { rows } = await query(
      `INSERT INTO design_gallery_packages (name,description,price_monthly,max_products,is_unlimited,is_featured,color,icon,features,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, description||null, price_monthly||0, max_products||10, is_unlimited||false, is_featured||false, color||'#22C55E', icon||'🎨', features||[], sort_order||0]
    );
    return res.status(201).json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/design-gallery/packages/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const b = req.body; const fields: string[] = []; const vals: unknown[] = [];
    for (const k of ['name','description','price_monthly','max_products','is_unlimited','is_featured','color','icon','features','sort_order','is_active']) {
      if (b[k] !== undefined) { vals.push(b[k]); fields.push(`${k}=$${vals.length}`); }
    }
    if (!fields.length) return res.json({ ok: true });
    vals.push(Number(req.params.id));
    const { rows } = await query(`UPDATE design_gallery_packages SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
    return res.json(rows[0]);
  } catch (e) { logger.error({ err: e }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/design-gallery/packages/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM design_gallery_packages WHERE id=$1`, [Number(req.params.id)]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

export default router;



// ══════════════════════════════════════════════════════════════════
// زواجل — خدمة توصيل الهدايا والرسائل
// ══════════════════════════════════════════════════════════════════

async function ensureZawajilTables() {
  await query(`CREATE TABLE IF NOT EXISTS zawajil_products (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    description  TEXT,
    price        NUMERIC(12,2) DEFAULT 0,
    category     VARCHAR(60) DEFAULT 'general',
    image_url    TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS zawajil_orders (
    id                     SERIAL PRIMARY KEY,
    order_number           VARCHAR(30) UNIQUE,
    sender_id              INTEGER,
    sender_name            VARCHAR(100),
    sender_phone           VARCHAR(30),
    sender_anonymous       BOOLEAN DEFAULT FALSE,
    recipient_name         VARCHAR(100) NOT NULL,
    recipient_phone        VARCHAR(30),
    recipient_address      TEXT,
    delivery_location      VARCHAR(20) DEFAULT 'inside_city',
    service_type           VARCHAR(30) NOT NULL,
    occasion_type          VARCHAR(30),
    message_text           TEXT,
    message_by_us          BOOLEAN DEFAULT FALSE,
    voice_presentation     BOOLEAN DEFAULT FALSE,
    gift_type              VARCHAR(20) DEFAULT 'none',
    gift_product_id        INTEGER,
    gift_product_name      VARCHAR(200),
    gift_external_desc     TEXT,
    gift_money_amount      NUMERIC(12,2) DEFAULT 0,
    status                 VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    estimated_cost         NUMERIC(12,2) DEFAULT 0,
    admin_notes            TEXT,
    rejection_reason       TEXT,
    modification_request   TEXT,
    pledge_accepted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS sender_anonymous BOOLEAN DEFAULT FALSE`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS assigned_zaajil_id INTEGER`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS assigned_zaajil_name VARCHAR(200)`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS assigned_zaajil_phone VARCHAR(50)`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS pickup_time TIMESTAMPTZ`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`).catch(() => {});
  await query(`CREATE TABLE IF NOT EXISTS zawajil_applications (
    id            SERIAL PRIMARY KEY,
    role          VARCHAR(60) NOT NULL,
    gender        VARCHAR(10),
    full_name     VARCHAR(200) NOT NULL,
    phone         VARCHAR(50) NOT NULL,
    age           INTEGER,
    neighborhood  VARCHAR(100),
    experience    TEXT,
    notes         TEXT,
    samples_url   VARCHAR(500),
    status        VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS zawajil_shoubash_guests (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER REFERENCES zawajil_orders(id) ON DELETE CASCADE,
    guest_name  VARCHAR(100),
    guest_phone VARCHAR(30),
    gift_desc   VARCHAR(300),
    gift_amount NUMERIC(12,2) DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`ALTER TABLE zawajil_applications ADD COLUMN IF NOT EXISTS admin_notes TEXT`).catch(() => {});
  await query(`ALTER TABLE zawajil_applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`).catch(() => {});
  await query(`ALTER TABLE sick_leaves ADD COLUMN IF NOT EXISTS admin_notes TEXT`).catch(() => {});
  await query(`ALTER TABLE sick_leaves ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`).catch(() => {});
  await query(`ALTER TABLE hospital_admissions ADD COLUMN IF NOT EXISTS discharge_date TIMESTAMPTZ`).catch(() => {});
}

router.get("/zawajil/products", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    const r = await query(`SELECT * FROM zawajil_products WHERE is_available=TRUE ORDER BY sort_order,name`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/zawajil/orders", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    const { sender_name, sender_phone, sender_anonymous, recipient_name, recipient_phone, recipient_address,
      delivery_location, service_type, occasion_type, message_text, message_by_us,
      voice_presentation, gift_type, gift_product_id, gift_product_name,
      gift_external_desc, gift_money_amount, pledge_accepted } = req.body;
    if (!recipient_name || !service_type) return res.status(400).json({ error: "الاسم ونوع الخدمة مطلوبان" });
    if (!pledge_accepted) return res.status(400).json({ error: "يجب قبول التعهد للمتابعة" });
    const countR = await query(`SELECT COUNT(*) FROM zawajil_orders`);
    const n = parseInt(countR.rows[0].count) + 1;
    const orderNumber = `ZWJ-${new Date().getFullYear()}-${String(n).padStart(4,"0")}`;
    let senderId: number | null = null;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ") && !auth.startsWith("Bearer tc_")) {
      try { const p = JSON.parse(Buffer.from(auth.slice(7).split(".")[1],"base64").toString()); senderId = p.userId || null; } catch { /* ignore */ }
    }
    const r = await query(`INSERT INTO zawajil_orders
      (order_number,sender_id,sender_name,sender_phone,sender_anonymous,recipient_name,recipient_phone,recipient_address,
       delivery_location,service_type,occasion_type,message_text,message_by_us,voice_presentation,
       gift_type,gift_product_id,gift_product_name,gift_external_desc,gift_money_amount,pledge_accepted)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [orderNumber,senderId,sender_name||null,sender_phone||null,Boolean(sender_anonymous),
       recipient_name,recipient_phone||null,recipient_address||null,delivery_location||"inside_city",
       service_type,occasion_type||null,message_text||null,Boolean(message_by_us),Boolean(voice_presentation),
       gift_type||"none",gift_product_id||null,gift_product_name||null,gift_external_desc||null,
       gift_money_amount||0,true]);
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/zawajil/apply", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    const { role, gender, full_name, phone, age, neighborhood, experience, notes, samples_url } = req.body;
    if (!role || !full_name?.trim() || !phone?.trim()) {
      return res.status(400).json({ error: "الاسم ورقم الهاتف ونوع الطلب مطلوبة" });
    }
    if (full_name.length > 200 || phone.length > 50) return res.status(400).json({ error: "بيانات غير صالحة" });
    const r = await query(
      `INSERT INTO zawajil_applications(role,gender,full_name,phone,age,neighborhood,experience,notes,samples_url)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [role, gender||null, full_name.trim(), phone.trim(), age ? parseInt(age) : null,
       neighborhood||null, experience||null, notes||null, samples_url||null]
    );
    return res.status(201).json({ ok: true, id: r.rows[0].id });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/zawajil/orders/mine", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    const { phone, name } = req.query as Record<string,string>;
    if (!phone && !name) return res.json([]);
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (phone) { params.push(phone); where += ` AND sender_phone=$${params.length}`; }
    else { params.push(`%${name}%`); where += ` AND sender_name ILIKE $${params.length}`; }
    const r = await query(`SELECT * FROM zawajil_orders ${where} ORDER BY created_at DESC LIMIT 50`, params);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/zawajil/shoubash-guests", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    const { order_id, guest_name, guest_phone, gift_desc, gift_amount } = req.body;
    if (!order_id || !guest_name) return res.status(400).json({ error: "رقم الطلب والاسم مطلوبان" });
    const r = await query(`INSERT INTO zawajil_shoubash_guests(order_id,guest_name,guest_phone,gift_desc,gift_amount) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [order_id,guest_name,guest_phone||null,gift_desc||null,gift_amount||0]);
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/zawajil/orders", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const { status } = req.query as Record<string,string>;
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (status && status !== "all") { params.push(status); where += ` AND status=$${params.length}`; }
    const r = await query(`SELECT o.*, (SELECT json_agg(g) FROM zawajil_shoubash_guests g WHERE g.order_id=o.id) AS shoubash_guests FROM zawajil_orders o ${where} ORDER BY o.created_at DESC`, params);
    return res.json({ orders: r.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/zawajil/orders/:id/review", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const { action, admin_notes, rejection_reason, modification_request, estimated_cost } = req.body;
    const MAP: Record<string,string> = { approve:"approved", reject:"rejected", request_modification:"modification_requested" };
    const newStatus = MAP[action];
    if (!newStatus) return res.status(400).json({ error: "action غير صالح" });
    const r = await query(`UPDATE zawajil_orders SET status=$1,admin_notes=COALESCE($2,admin_notes),rejection_reason=COALESCE($3,rejection_reason),modification_request=COALESCE($4,modification_request),estimated_cost=COALESCE($5::numeric,estimated_cost),updated_at=NOW() WHERE id=$6 RETURNING *`,
      [newStatus,admin_notes||null,rejection_reason||null,modification_request||null,estimated_cost!=null?Number(estimated_cost):null,req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    // إشعار تلقائي للمُرسِل
    const order = r.rows[0];
    if (order.sender_id) {
      const NOTIF: Record<string, { title: string; body: (o: any) => string }> = {
        approved:               { title: "✅ تم قبول طلبك!", body: o => `طلب زواجل رقم ${o.order_number} مقبول. التكلفة: ${o.estimated_cost} SDG` },
        rejected:               { title: "❌ طلبك مرفوض", body: o => `طلب رقم ${o.order_number}. السبب: ${o.rejection_reason || "تواصل مع الإدارة"}` },
        modification_requested: { title: "✏️ يحتاج طلبك تعديل", body: o => `طلب رقم ${o.order_number}: ${o.modification_request || "راجع التفاصيل في التطبيق"}` },
      };
      const n = NOTIF[newStatus];
      if (n) {
        await query(`INSERT INTO notifications(user_id,type,title,body,data) VALUES($1,'zawajil',$2,$3,$4)`,
          [order.sender_id, n.title, n.body(order), JSON.stringify({ order_id: order.id, order_number: order.order_number })]).catch(() => {});
        sendExpoPushToUser(order.sender_id, n.title, n.body(order), { screen: "zawajil", order_id: order.id }).catch(() => {});
      }
    }
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/zawajil/orders/:id/status", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const { status, admin_notes } = req.body;
    const VALID = ["pending_review","modification_requested","approved","preparing","sending","completed","rejected","returned"];
    if (!VALID.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const r = await query(`UPDATE zawajil_orders SET status=$1,admin_notes=COALESCE($2,admin_notes),updated_at=NOW() WHERE id=$3 RETURNING *`,
      [status,admin_notes||null,req.params.id]);
    // إشعار تلقائي للمُرسِل
    if (r.rows[0]?.sender_id) {
      const order = r.rows[0];
      const MSGS: Record<string,{ title: string; body: string }> = {
        preparing: { title: "📦 جاري تجهيز طلبك!",     body: `طلب رقم ${order.order_number} قيد التجهيز.` },
        sending:   { title: "🚀 طلبك في الطريق إليك!",  body: `طلب رقم ${order.order_number} خرج للتوصيل.` },
        completed: { title: "🎉 تم إيصال طلبك بنجاح!", body: `طلب رقم ${order.order_number} اكتمل. شكراً لثقتك!` },
        returned:  { title: "↩️ طلبك مُعاد",             body: `طلب رقم ${order.order_number} تمت إعادته.` },
      };
      const m = MSGS[status];
      if (m) {
        await query(`INSERT INTO notifications(user_id,type,title,body,data) VALUES($1,'zawajil',$2,$3,$4)`,
          [order.sender_id, m.title, m.body, JSON.stringify({ order_id: order.id, order_number: order.order_number })]).catch(() => {});
        sendExpoPushToUser(order.sender_id, m.title, m.body, { screen: "zawajil", order_id: order.id }).catch(() => {});
      }
    }
    return res.json(r.rows[0] || { error: "لم يُعثر" });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/zawajil/products", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const r = await query(`SELECT * FROM zawajil_products ORDER BY sort_order,name`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/zawajil/products", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const { name, description, price, category, image_url, is_available, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
    const r = await query(`INSERT INTO zawajil_products(name,description,price,category,image_url,is_available,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name,description||null,price||0,category||"general",image_url||null,is_available!==false,sort_order||0]);
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/zawajil/products/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name, description, price, category, image_url, is_available, sort_order } = req.body;
    const r = await query(`UPDATE zawajil_products SET name=COALESCE($1,name),description=COALESCE($2,description),price=COALESCE($3::numeric,price),category=COALESCE($4,category),image_url=COALESCE($5,image_url),is_available=COALESCE($6,is_available),sort_order=COALESCE($7::int,sort_order) WHERE id=$8 RETURNING *`,
      [name||null,description||null,price!=null?Number(price):null,category||null,image_url||null,is_available!=null?Boolean(is_available):null,sort_order!=null?Number(sort_order):null,req.params.id]);
    return res.json(r.rows[0] || { error: "لم يُعثر" });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/zawajil/products/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM zawajil_products WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/zawajil/orders/:id/assign — assign a zaajil courier to order
router.patch("/admin/zawajil/orders/:id/assign", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { zaajil_id, zaajil_name, zaajil_phone, delivery_notes, pickup_time } = req.body as any;
    const r = await query(
      `UPDATE zawajil_orders SET
        assigned_zaajil_id=$1, assigned_zaajil_name=$2, assigned_zaajil_phone=$3,
        delivery_notes=COALESCE($4, delivery_notes),
        pickup_time=COALESCE($5::timestamptz, pickup_time),
        status=CASE WHEN status='approved' THEN 'preparing' ELSE status END,
        updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [zaajil_id||null, zaajil_name||null, zaajil_phone||null, delivery_notes||null, pickup_time||null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json({ success: true, order: r.rows[0] });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/zawajil/orders/:id/complete-delivery — mark as delivered
router.patch("/admin/zawajil/orders/:id/complete-delivery", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { delivery_notes } = req.body as any;
    await query(
      `UPDATE zawajil_orders SET status='completed', delivered_at=NOW(), delivery_notes=COALESCE($1,delivery_notes), updated_at=NOW() WHERE id=$2`,
      [delivery_notes||null, req.params.id]
    );
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/zawajil/zaajileen — list approved zaajil (couriers) for assignment
router.get("/admin/zawajil/zaajileen", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT id, full_name, phone, neighborhood, experience FROM zawajil_applications WHERE role='zaajil' AND status='approved' ORDER BY full_name`);
    return res.json({ zaajileen: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/zawajil/applications
router.get("/admin/zawajil/applications", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const role = req.query.role as string;
    const where = role ? `WHERE role=$1` : "";
    const params = role ? [role] : [];
    const r = await query(
      `SELECT * FROM zawajil_applications ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    return res.json({ applications: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/zawajil/applications/:id/status
router.patch("/admin/zawajil/applications/:id/status", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { status, notes } = req.body as any;
    if (!["approved","rejected","pending"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    await query(
      `UPDATE zawajil_applications SET status=$1, admin_notes=$2, reviewed_at=NOW() WHERE id=$3`,
      [status, notes || null, req.params.id]
    );
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/sick-leaves/:id/status
router.patch("/admin/sick-leaves/:id/status", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { status, notes } = req.body as any;
    if (!["verified","flagged","pending"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    await query(
      `UPDATE sick_leaves SET status=$1, admin_notes=$2, reviewed_at=NOW() WHERE id=$3`,
      [status, notes || null, req.params.id]
    );
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/admissions/:id/discharge
router.patch("/admin/admissions/:id/discharge", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { notes } = req.body as any;
    await query(
      `UPDATE hospital_admissions SET status='discharged', notes=COALESCE($1, notes), discharge_date=NOW() WHERE id=$2`,
      [notes || null, req.params.id]
    );
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
// ═══ السوق الزراعي — Farmers Market ═════════════════════════════
// ═══════════════════════════════════════════════════════════════════

async function ensureFarmersTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS farmer_crops (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title              TEXT NOT NULL,
      description        TEXT,
      category           TEXT DEFAULT 'خضروات',
      price_per_unit     DECIMAL(10,2),
      unit               TEXT DEFAULT 'كجم',
      quantity_available DECIMAL(10,2),
      with_transport     BOOLEAN DEFAULT FALSE,
      transport_cost     DECIMAL(10,2),
      transport_notes    TEXT,
      location           TEXT,
      neighborhood       TEXT,
      contact_phone      TEXT,
      contact_whatsapp   TEXT,
      is_available       BOOLEAN DEFAULT TRUE,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS farmer_lands (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title        TEXT NOT NULL,
      description  TEXT,
      area_feddan  DECIMAL(10,2),
      rent_price   DECIMAL(10,2),
      rent_period  TEXT DEFAULT 'season',
      water_source TEXT,
      soil_type    TEXT,
      location     TEXT,
      neighborhood TEXT,
      contact_phone    TEXT,
      contact_whatsapp TEXT,
      is_available BOOLEAN DEFAULT TRUE,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS farmer_tools (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title        TEXT NOT NULL,
      description  TEXT,
      category     TEXT DEFAULT 'معدات ثقيلة',
      rent_price   DECIMAL(10,2),
      rent_period  TEXT DEFAULT 'day',
      location     TEXT,
      neighborhood TEXT,
      contact_phone    TEXT,
      contact_whatsapp TEXT,
      is_available BOOLEAN DEFAULT TRUE,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS farmer_workers (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title            TEXT NOT NULL,
      description      TEXT,
      specialty        TEXT DEFAULT 'حصاد',
      workers_count    INTEGER DEFAULT 1,
      daily_rate       DECIMAL(10,2),
      experience_years INTEGER DEFAULT 0,
      has_equipment    BOOLEAN DEFAULT FALSE,
      location         TEXT,
      neighborhood     TEXT,
      contact_phone    TEXT,
      contact_whatsapp TEXT,
      is_available     BOOLEAN DEFAULT TRUE,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ── المحاصيل ──────────────────────────────────────────────────────
router.get("/farmers/crops", async (req: Request, res: Response) => {
  try {
    await ensureFarmersTables();
    const { category, q } = req.query as Record<string, string>;
    let sql = `SELECT * FROM farmer_crops WHERE is_available=TRUE`;
    const params: unknown[] = [];
    if (category && category !== "كل الفئات") { params.push(category); sql += ` AND category=$${params.length}`; }
    if (q)        { params.push(`%${q}%`); sql += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length})`; }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    const { rows } = await query(sql, params);
    return res.json(rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/farmers/crops", async (req: Request, res: Response) => {
  try {
    await ensureFarmersTables();
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const { title, description, category, price_per_unit, unit, quantity_available,
            with_transport, transport_cost, transport_notes, location, neighborhood,
            contact_phone, contact_whatsapp } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const { rows } = await query(
      `INSERT INTO farmer_crops (user_id,title,description,category,price_per_unit,unit,quantity_available,
        with_transport,transport_cost,transport_notes,location,neighborhood,contact_phone,contact_whatsapp)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [uid,title,description||null,category||"خضروات",price_per_unit||null,unit||"كجم",
       quantity_available||null,with_transport===true||with_transport==="true",
       transport_cost||null,transport_notes||null,location||null,neighborhood||null,
       contact_phone||null,contact_whatsapp||null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/farmers/crops/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const { title, description, category, price_per_unit, unit, quantity_available,
            with_transport, transport_cost, transport_notes, location, contact_phone,
            contact_whatsapp, is_available } = req.body;
    const isAdmin = await isAdminRequest(req);
    const { rows } = await query(
      `UPDATE farmer_crops SET
        title=COALESCE($1,title), description=COALESCE($2,description),
        category=COALESCE($3,category), price_per_unit=COALESCE($4::numeric,price_per_unit),
        unit=COALESCE($5,unit), quantity_available=COALESCE($6::numeric,quantity_available),
        with_transport=COALESCE($7,with_transport), transport_cost=COALESCE($8::numeric,transport_cost),
        transport_notes=COALESCE($9,transport_notes), location=COALESCE($10,location),
        contact_phone=COALESCE($11,contact_phone), contact_whatsapp=COALESCE($12,contact_whatsapp),
        is_available=COALESCE($13,is_available)
       WHERE id=$14 AND ($15 OR user_id=$16) RETURNING *`,
      [title||null,description||null,category||null,
       price_per_unit!=null?Number(price_per_unit):null,unit||null,
       quantity_available!=null?Number(quantity_available):null,
       with_transport!=null?Boolean(with_transport):null,
       transport_cost!=null?Number(transport_cost):null,transport_notes||null,location||null,
       contact_phone||null,contact_whatsapp||null,
       is_available!=null?Boolean(is_available):null,
       req.params.id,isAdmin,uid]
    );
    if (!rows[0]) return res.status(404).json({ error: "لم يُعثر أو غير مصرح" });
    return res.json(rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/farmers/crops/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const isAdmin = await isAdminRequest(req);
    await query(`DELETE FROM farmer_crops WHERE id=$1 AND ($2 OR user_id=$3)`, [req.params.id, isAdmin, uid]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── الأراضي ───────────────────────────────────────────────────────
router.get("/farmers/lands", async (_req: Request, res: Response) => {
  try {
    await ensureFarmersTables();
    const { rows } = await query(`SELECT * FROM farmer_lands WHERE is_available=TRUE ORDER BY created_at DESC LIMIT 200`);
    return res.json(rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/farmers/lands", async (req: Request, res: Response) => {
  try {
    await ensureFarmersTables();
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const { title, description, area_feddan, rent_price, rent_period, water_source,
            soil_type, location, neighborhood, contact_phone, contact_whatsapp } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const { rows } = await query(
      `INSERT INTO farmer_lands (user_id,title,description,area_feddan,rent_price,rent_period,
        water_source,soil_type,location,neighborhood,contact_phone,contact_whatsapp)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [uid,title,description||null,area_feddan||null,rent_price||null,
       rent_period||"season",water_source||null,soil_type||null,location||null,
       neighborhood||null,contact_phone||null,contact_whatsapp||null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/farmers/lands/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const isAdmin = await isAdminRequest(req);
    const { title, description, area_feddan, rent_price, rent_period, water_source,
            soil_type, location, contact_phone, contact_whatsapp, is_available } = req.body;
    const { rows } = await query(
      `UPDATE farmer_lands SET title=COALESCE($1,title),description=COALESCE($2,description),
        area_feddan=COALESCE($3::numeric,area_feddan),rent_price=COALESCE($4::numeric,rent_price),
        rent_period=COALESCE($5,rent_period),water_source=COALESCE($6,water_source),
        soil_type=COALESCE($7,soil_type),location=COALESCE($8,location),
        contact_phone=COALESCE($9,contact_phone),contact_whatsapp=COALESCE($10,contact_whatsapp),
        is_available=COALESCE($11,is_available)
       WHERE id=$12 AND ($13 OR user_id=$14) RETURNING *`,
      [title||null,description||null,area_feddan!=null?Number(area_feddan):null,
       rent_price!=null?Number(rent_price):null,rent_period||null,water_source||null,
       soil_type||null,location||null,contact_phone||null,contact_whatsapp||null,
       is_available!=null?Boolean(is_available):null,req.params.id,isAdmin,uid]
    );
    if (!rows[0]) return res.status(404).json({ error: "لم يُعثر أو غير مصرح" });
    return res.json(rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/farmers/lands/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const isAdmin = await isAdminRequest(req);
    await query(`DELETE FROM farmer_lands WHERE id=$1 AND ($2 OR user_id=$3)`, [req.params.id, isAdmin, uid]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── الأدوات الزراعية ─────────────────────────────────────────────
router.get("/farmers/tools", async (_req: Request, res: Response) => {
  try {
    await ensureFarmersTables();
    const { rows } = await query(`SELECT * FROM farmer_tools WHERE is_available=TRUE ORDER BY created_at DESC LIMIT 200`);
    return res.json(rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/farmers/tools", async (req: Request, res: Response) => {
  try {
    await ensureFarmersTables();
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const { title, description, category, rent_price, rent_period, location,
            neighborhood, contact_phone, contact_whatsapp } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const { rows } = await query(
      `INSERT INTO farmer_tools (user_id,title,description,category,rent_price,rent_period,
        location,neighborhood,contact_phone,contact_whatsapp)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [uid,title,description||null,category||"معدات ثقيلة",rent_price||null,
       rent_period||"day",location||null,neighborhood||null,contact_phone||null,contact_whatsapp||null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/farmers/tools/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const isAdmin = await isAdminRequest(req);
    const { title, description, category, rent_price, rent_period, location,
            contact_phone, contact_whatsapp, is_available } = req.body;
    const { rows } = await query(
      `UPDATE farmer_tools SET title=COALESCE($1,title),description=COALESCE($2,description),
        category=COALESCE($3,category),rent_price=COALESCE($4::numeric,rent_price),
        rent_period=COALESCE($5,rent_period),location=COALESCE($6,location),
        contact_phone=COALESCE($7,contact_phone),contact_whatsapp=COALESCE($8,contact_whatsapp),
        is_available=COALESCE($9,is_available)
       WHERE id=$10 AND ($11 OR user_id=$12) RETURNING *`,
      [title||null,description||null,category||null,rent_price!=null?Number(rent_price):null,
       rent_period||null,location||null,contact_phone||null,contact_whatsapp||null,
       is_available!=null?Boolean(is_available):null,req.params.id,isAdmin,uid]
    );
    if (!rows[0]) return res.status(404).json({ error: "لم يُعثر أو غير مصرح" });
    return res.json(rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/farmers/tools/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const isAdmin = await isAdminRequest(req);
    await query(`DELETE FROM farmer_tools WHERE id=$1 AND ($2 OR user_id=$3)`, [req.params.id, isAdmin, uid]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── العمال الموسميون ──────────────────────────────────────────────
router.get("/farmers/workers", async (_req: Request, res: Response) => {
  try {
    await ensureFarmersTables();
    const { rows } = await query(`SELECT * FROM farmer_workers WHERE is_available=TRUE ORDER BY created_at DESC LIMIT 200`);
    return res.json(rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/farmers/workers", async (req: Request, res: Response) => {
  try {
    await ensureFarmersTables();
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const { title, description, specialty, workers_count, daily_rate, experience_years,
            has_equipment, location, neighborhood, contact_phone, contact_whatsapp } = req.body;
    if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
    const { rows } = await query(
      `INSERT INTO farmer_workers (user_id,title,description,specialty,workers_count,daily_rate,
        experience_years,has_equipment,location,neighborhood,contact_phone,contact_whatsapp)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [uid,title,description||null,specialty||"حصاد",workers_count||1,daily_rate||null,
       experience_years||0,has_equipment===true||has_equipment==="true",
       location||null,neighborhood||null,contact_phone||null,contact_whatsapp||null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/farmers/workers/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const isAdmin = await isAdminRequest(req);
    const { title, description, specialty, workers_count, daily_rate, experience_years,
            has_equipment, location, contact_phone, contact_whatsapp, is_available } = req.body;
    const { rows } = await query(
      `UPDATE farmer_workers SET title=COALESCE($1,title),description=COALESCE($2,description),
        specialty=COALESCE($3,specialty),workers_count=COALESCE($4::int,workers_count),
        daily_rate=COALESCE($5::numeric,daily_rate),experience_years=COALESCE($6::int,experience_years),
        has_equipment=COALESCE($7,has_equipment),location=COALESCE($8,location),
        contact_phone=COALESCE($9,contact_phone),contact_whatsapp=COALESCE($10,contact_whatsapp),
        is_available=COALESCE($11,is_available)
       WHERE id=$12 AND ($13 OR user_id=$14) RETURNING *`,
      [title||null,description||null,specialty||null,
       workers_count!=null?Number(workers_count):null,daily_rate!=null?Number(daily_rate):null,
       experience_years!=null?Number(experience_years):null,has_equipment!=null?Boolean(has_equipment):null,
       location||null,contact_phone||null,contact_whatsapp||null,
       is_available!=null?Boolean(is_available):null,req.params.id,isAdmin,uid]
    );
    if (!rows[0]) return res.status(404).json({ error: "لم يُعثر أو غير مصرح" });
    return res.json(rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/farmers/workers/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const uid = me?.id ?? null;
    const isAdmin = await isAdminRequest(req);
    await query(`DELETE FROM farmer_workers WHERE id=$1 AND ($2 OR user_id=$3)`, [req.params.id, isAdmin, uid]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});


// ── إدارة السوق الزراعي (أدمن) ──────────────────────────────────────────────
router.get("/admin/farmers", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    const [crops, lands, tools, workers] = await Promise.all([
      query(`SELECT fc.*, u.name as user_display_name FROM farmer_crops fc LEFT JOIN users u ON u.id=fc.user_id ORDER BY fc.created_at DESC LIMIT 300`),
      query(`SELECT fl.*, u.name as user_display_name FROM farmer_lands fl LEFT JOIN users u ON u.id=fl.user_id ORDER BY fl.created_at DESC LIMIT 300`),
      query(`SELECT ft.*, u.name as user_display_name FROM farmer_tools ft LEFT JOIN users u ON u.id=ft.user_id ORDER BY ft.created_at DESC LIMIT 300`),
      query(`SELECT fw.*, u.name as user_display_name FROM farmer_workers fw LEFT JOIN users u ON u.id=fw.user_id ORDER BY fw.created_at DESC LIMIT 300`),
    ]);
    return res.json({ crops: crops.rows, lands: lands.rows, tools: tools.rows, workers: workers.rows });
  } catch (err) { logger.error({ err }, "GET /admin/farmers"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/farmers/crops/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM farmer_crops WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/farmers/lands/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM farmer_lands WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/farmers/tools/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM farmer_tools WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/farmers/workers/:id", async (req: Request, res: Response) => {
  try {
    if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM farmer_workers WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// الراعي الرسمي للتطبيق + قسم المصانع والإنتاج المحلي
// ══════════════════════════════════════════════════════════════════

// ── helpers ─────────────────────────────────────────────────────
const FACTORY_PORTAL_SALT = "hasahisawi_factory_portal_2024";
function hashFactoryPin(pin: string): string {
  let h = 5381;
  const str = FACTORY_PORTAL_SALT + pin;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(12, "0");
}
function generateFactoryToken(): string {
  return `fac_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}
async function getPortalFactory(req: Request) {
  const auth = (req.headers.authorization || "") as string;
  if (!auth.startsWith("Bearer fac_")) return null;
  const token = auth.slice(7);
  const r = await query(`SELECT * FROM factories WHERE portal_token=$1 AND is_active=TRUE`, [token]);
  return r.rows[0] || null;
}

async function ensureFactoriesTables() {
  await query(`CREATE TABLE IF NOT EXISTS factories (
    id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, short_name VARCHAR(60),
    logo_initial VARCHAR(5) DEFAULT '🏭', logo_url TEXT, banner_url TEXT,
    brand_color VARCHAR(20) DEFAULT '#F97316', brand_color2 VARCHAR(20) DEFAULT '#EA580C',
    category VARCHAR(60) DEFAULT 'general', description TEXT, location VARCHAR(200),
    address TEXT, founded VARCHAR(10), employees VARCHAR(30),
    phone VARCHAR(40), whatsapp VARCHAR(40), email VARCHAR(200), website TEXT,
    contact_person VARCHAR(100), contact_email VARCHAR(200),
    promo_tagline VARCHAR(300), promo_banner_url TEXT, promo_badge VARCHAR(60),
    package_type VARCHAR(20) DEFAULT 'free', contract_start DATE, contract_end DATE,
    monthly_fee NUMERIC(12,2) DEFAULT 0, portal_pin_hash VARCHAR(100), portal_token VARCHAR(200),
    is_active BOOLEAN NOT NULL DEFAULT TRUE, is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0, views_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS factory_products (
    id SERIAL PRIMARY KEY, factory_id INTEGER REFERENCES factories(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL, description TEXT, category VARCHAR(60) DEFAULT 'general',
    price NUMERIC(12,2), price_unit VARCHAR(40) DEFAULT 'SDG', price_note VARCHAR(200),
    min_order VARCHAR(60), image_url TEXT, images JSONB DEFAULT '[]',
    stock_status VARCHAR(20) DEFAULT 'available',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE, is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0, views_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS factory_subscription_plans (
    id SERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL, name_ar VARCHAR(80) NOT NULL,
    description TEXT, price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'SDG', max_products INTEGER DEFAULT 3,
    has_priority BOOLEAN NOT NULL DEFAULT FALSE, has_banner BOOLEAN NOT NULL DEFAULT FALSE,
    has_promo BOOLEAN NOT NULL DEFAULT FALSE, has_sponsor_badge BOOLEAN NOT NULL DEFAULT FALSE,
    color VARCHAR(20) DEFAULT '#6B7280', icon VARCHAR(40) DEFAULT '●',
    sort_order INTEGER DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS factory_subscriptions (
    id SERIAL PRIMARY KEY, factory_id INTEGER REFERENCES factories(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES factory_subscription_plans(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ, amount_paid NUMERIC(12,2), notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS app_sponsors (
    id SERIAL PRIMARY KEY, entity_type VARCHAR(20) NOT NULL DEFAULT 'telecom',
    entity_id INTEGER NOT NULL, display_name VARCHAR(200) NOT NULL,
    logo_url TEXT, brand_color VARCHAR(20) DEFAULT '#0EA5E9',
    tagline VARCHAR(300), website TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sponsor_from DATE, sponsor_to DATE, package_name VARCHAR(60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // seed plans
  const existing = await query(`SELECT COUNT(*) FROM factory_subscription_plans`);
  if (parseInt(existing.rows[0].count) === 0) {
    await query(`INSERT INTO factory_subscription_plans (name,name_ar,price_monthly,max_products,has_priority,has_banner,has_promo,has_sponsor_badge,color,icon,sort_order) VALUES
      ('free','مجاني',0,3,FALSE,FALSE,FALSE,FALSE,'#6B7280','●',0),
      ('basic','أساسي',50000,10,FALSE,FALSE,FALSE,FALSE,'#22C55E','◉',1),
      ('standard','ستاندرد',150000,30,TRUE,FALSE,TRUE,FALSE,'#0EA5E9','⬡',2),
      ('premium','بريميوم',300000,999,TRUE,TRUE,TRUE,TRUE,'#F59E0B','★',3)`);
  }
  // add sponsor columns to telecom if table exists
  try {
    await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS is_sponsor BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS sponsor_display_text VARCHAR(200)`);
    await query(`ALTER TABLE telecom_companies ADD COLUMN IF NOT EXISTS sponsor_since DATE`);
  } catch {}
  await query(`CREATE INDEX IF NOT EXISTS idx_factory_products_factory ON factory_products(factory_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_factory_subs_factory ON factory_subscriptions(factory_id)`);
}

// ── راعي التطبيق ─────────────────────────────────────────────────

// GET /api/app/sponsor — الراعي الحالي
router.get("/app/sponsor", async (_req: Request, res: Response) => {
  try {
    await ensureFactoriesTables();
    const now = new Date().toISOString().slice(0, 10);
    const r = await query(
      `SELECT * FROM app_sponsors WHERE is_active=TRUE AND (sponsor_to IS NULL OR sponsor_to >= $1) ORDER BY created_at DESC LIMIT 1`,
      [now]
    );
    return res.json(r.rows[0] || null);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/app/sponsors
router.get("/admin/app/sponsors", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureFactoriesTables();
    const r = await query(`SELECT * FROM app_sponsors ORDER BY created_at DESC`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/app/sponsors
router.post("/admin/app/sponsors", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureFactoriesTables();
    const { entity_type, entity_id, display_name, logo_url, brand_color, tagline, website, sponsor_from, sponsor_to, package_name } = req.body;
    if (!display_name) return res.status(400).json({ error: "الاسم مطلوب" });
    // deactivate previous sponsors
    await query(`UPDATE app_sponsors SET is_active=FALSE WHERE is_active=TRUE`);
    const r = await query(
      `INSERT INTO app_sponsors (entity_type,entity_id,display_name,logo_url,brand_color,tagline,website,sponsor_from,sponsor_to,package_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [entity_type||'telecom', entity_id?Number(entity_id):null, display_name, logo_url||null, brand_color||'#0EA5E9', tagline||null, website||null, sponsor_from||null, sponsor_to||null, package_name||null]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/app/sponsors/:id
router.patch("/admin/app/sponsors/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { display_name, logo_url, brand_color, tagline, website, sponsor_from, sponsor_to, package_name, is_active } = req.body;
    const r = await query(
      `UPDATE app_sponsors SET display_name=COALESCE($1,display_name), logo_url=COALESCE($2,logo_url),
       brand_color=COALESCE($3,brand_color), tagline=COALESCE($4,tagline), website=COALESCE($5,website),
       sponsor_from=COALESCE($6,sponsor_from), sponsor_to=COALESCE($7,sponsor_to),
       package_name=COALESCE($8,package_name), is_active=COALESCE($9,is_active)
       WHERE id=$10 RETURNING *`,
      [display_name||null,logo_url||null,brand_color||null,tagline||null,website||null,sponsor_from||null,sponsor_to||null,package_name||null,is_active!=null?Boolean(is_active):null,req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── المصانع — Public ──────────────────────────────────────────────

// GET /api/factories
router.get("/factories", async (req: Request, res: Response) => {
  try {
    await ensureFactoriesTables();
    const { category } = req.query as Record<string, string>;
    let where = "WHERE f.is_active=TRUE";
    const params: unknown[] = [];
    if (category && category !== "all") { params.push(category); where += ` AND f.category=$${params.length}`; }
    const r = await query(
      `SELECT f.*,
        p.name AS plan_name, p.name_ar AS plan_name_ar, p.color AS plan_color, p.icon AS plan_icon,
        p.has_priority, p.has_banner, p.has_promo, p.has_sponsor_badge,
        (SELECT COUNT(*) FROM factory_products fp WHERE fp.factory_id=f.id AND fp.is_active=TRUE)::int AS products_count
       FROM factories f
       LEFT JOIN factory_subscriptions s ON s.factory_id=f.id AND s.is_active=TRUE
       LEFT JOIN factory_subscription_plans p ON p.id=s.plan_id
       ${where}
       ORDER BY p.sort_order DESC NULLS LAST, f.is_featured DESC, f.sort_order ASC, f.created_at DESC`,
      params
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/factories/:id
router.get("/factories/:id", async (req: Request, res: Response) => {
  try {
    await ensureFactoriesTables();
    const r = await query(
      `SELECT f.*, p.name AS plan_name, p.name_ar AS plan_name_ar, p.color AS plan_color, p.icon AS plan_icon,
        p.has_priority, p.has_banner, p.has_promo, p.has_sponsor_badge, p.max_products
       FROM factories f
       LEFT JOIN factory_subscriptions s ON s.factory_id=f.id AND s.is_active=TRUE
       LEFT JOIN factory_subscription_plans p ON p.id=s.plan_id
       WHERE f.id=$1 AND f.is_active=TRUE`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "المصنع غير موجود" });
    await query(`UPDATE factories SET views_count=views_count+1 WHERE id=$1`, [req.params.id]);
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/factories/:id/products
router.get("/factories/:id/products", async (req: Request, res: Response) => {
  try {
    await ensureFactoriesTables();
    const r = await query(
      `SELECT * FROM factory_products WHERE factory_id=$1 AND is_active=TRUE ORDER BY is_featured DESC, sort_order ASC, created_at DESC`,
      [req.params.id]
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/factory-products — كل المنتجات مع اسم المصنع
router.get("/factory-products", async (req: Request, res: Response) => {
  try {
    await ensureFactoriesTables();
    const { category, factory_id } = req.query as Record<string, string>;
    let where = "WHERE fp.is_active=TRUE AND f.is_active=TRUE";
    const params: unknown[] = [];
    if (category && category !== "all") { params.push(category); where += ` AND fp.category=$${params.length}`; }
    if (factory_id) { params.push(Number(factory_id)); where += ` AND fp.factory_id=$${params.length}`; }
    const r = await query(
      `SELECT fp.*, f.name AS factory_name, f.brand_color AS factory_color, f.logo_initial AS factory_logo,
        f.phone AS factory_phone, f.whatsapp AS factory_whatsapp, p.icon AS plan_icon, p.name_ar AS plan_name_ar
       FROM factory_products fp
       LEFT JOIN factories f ON f.id=fp.factory_id
       LEFT JOIN factory_subscriptions fs ON fs.factory_id=f.id AND fs.is_active=TRUE
       LEFT JOIN factory_subscription_plans p ON p.id=fs.plan_id
       ${where}
       ORDER BY fp.is_featured DESC, fp.sort_order ASC, fp.created_at DESC LIMIT 100`,
      params
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/factory-plans
router.get("/factory-plans", async (_req: Request, res: Response) => {
  try {
    await ensureFactoriesTables();
    const r = await query(`SELECT * FROM factory_subscription_plans WHERE is_active=TRUE ORDER BY sort_order`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Factory Portal Auth ───────────────────────────────────────────

// POST /api/factories/portal/login
router.post("/factories/portal/login", async (req: Request, res: Response) => {
  try {
    await ensureFactoriesTables();
    const { factory_id, pin } = req.body;
    if (!factory_id || !pin) return res.status(400).json({ error: "بيانات ناقصة" });
    const r = await query(`SELECT * FROM factories WHERE id=$1 AND is_active=TRUE`, [Number(factory_id)]);
    const factory = r.rows[0];
    if (!factory) return res.status(404).json({ error: "المصنع غير موجود" });
    if (!factory.portal_pin_hash) return res.status(403).json({ error: "لم يُفعَّل الدخول لهذا المصنع بعد" });
    if (factory.portal_pin_hash !== hashFactoryPin(String(pin))) return res.status(401).json({ error: "الرمز السري غير صحيح" });
    const token = generateFactoryToken();
    await query(`UPDATE factories SET portal_token=$1 WHERE id=$2`, [token, factory.id]);
    const { portal_pin_hash: _, portal_token: __, ...safe } = factory;
    return res.json({ token, factory: { ...safe, portal_token: token } });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/factories/portal/me
router.get("/factories/portal/me", async (req: Request, res: Response) => {
  try {
    const factory = await getPortalFactory(req);
    if (!factory) return res.status(401).json({ error: "غير مصرح" });
    const sub = await query(
      `SELECT s.*, p.name_ar AS plan_name_ar, p.color AS plan_color, p.icon AS plan_icon,
        p.max_products, p.has_priority, p.has_banner, p.has_promo, p.has_sponsor_badge
       FROM factory_subscriptions s LEFT JOIN factory_subscription_plans p ON p.id=s.plan_id
       WHERE s.factory_id=$1 AND s.is_active=TRUE ORDER BY s.started_at DESC LIMIT 1`,
      [factory.id]
    );
    const products_count = await query(`SELECT COUNT(*) FROM factory_products WHERE factory_id=$1 AND is_active=TRUE`, [factory.id]);
    const { portal_pin_hash: _, ...safe } = factory;
    return res.json({ ...safe, subscription: sub.rows[0] || null, products_count: parseInt(products_count.rows[0].count) });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/factories/portal/me
router.patch("/factories/portal/me", async (req: Request, res: Response) => {
  try {
    const factory = await getPortalFactory(req);
    if (!factory) return res.status(401).json({ error: "غير مصرح" });
    const { description, location, address, phone, whatsapp, email, website, contact_person, contact_email, promo_tagline, promo_banner_url, promo_badge } = req.body;
    const hasBanner = factory.package_type === "premium";
    const hasPromo  = ["standard","premium"].includes(factory.package_type);
    const r = await query(`UPDATE factories SET
      description=COALESCE($1,description), location=COALESCE($2,location), address=COALESCE($3,address),
      phone=COALESCE($4,phone), whatsapp=COALESCE($5,whatsapp), email=COALESCE($6,email), website=COALESCE($7,website),
      contact_person=COALESCE($8,contact_person), contact_email=COALESCE($9,contact_email),
      promo_tagline=CASE WHEN $10 THEN COALESCE($11,promo_tagline) ELSE promo_tagline END,
      promo_banner_url=CASE WHEN $12 THEN COALESCE($13,promo_banner_url) ELSE promo_banner_url END,
      promo_badge=CASE WHEN $10 THEN COALESCE($14,promo_badge) ELSE promo_badge END
      WHERE id=$15 RETURNING *`,
      [description||null,location||null,address||null,phone||null,whatsapp||null,email||null,website||null,contact_person||null,contact_email||null,
       hasPromo,promo_tagline||null,hasBanner,promo_banner_url||null,promo_badge||null,factory.id]
    );
    const { portal_pin_hash: _, ...safe } = r.rows[0];
    return res.json(safe);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/factories/portal/products
router.get("/factories/portal/products", async (req: Request, res: Response) => {
  try {
    const factory = await getPortalFactory(req);
    if (!factory) return res.status(401).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM factory_products WHERE factory_id=$1 ORDER BY sort_order ASC, created_at DESC`, [factory.id]);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/factories/portal/products
router.post("/factories/portal/products", async (req: Request, res: Response) => {
  try {
    const factory = await getPortalFactory(req);
    if (!factory) return res.status(401).json({ error: "غير مصرح" });
    const { name, description, category, price, price_unit, price_note, min_order, image_url, images, stock_status, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: "اسم المنتج مطلوب" });
    // check plan limit
    const sub = await query(`SELECT p.max_products FROM factory_subscriptions s LEFT JOIN factory_subscription_plans p ON p.id=s.plan_id WHERE s.factory_id=$1 AND s.is_active=TRUE ORDER BY s.started_at DESC LIMIT 1`, [factory.id]);
    const maxProducts = sub.rows[0]?.max_products ?? 3;
    const current = await query(`SELECT COUNT(*) FROM factory_products WHERE factory_id=$1 AND is_active=TRUE`, [factory.id]);
    if (parseInt(current.rows[0].count) >= maxProducts) return res.status(403).json({ error: `حدّ الباقة الحالية ${maxProducts} منتجات. قم بترقية باقتك لإضافة المزيد` });
    const r = await query(
      `INSERT INTO factory_products (factory_id,name,description,category,price,price_unit,price_note,min_order,image_url,images,stock_status,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [factory.id,name,description||null,category||'general',price?Number(price):null,price_unit||'SDG',price_note||null,min_order||null,image_url||null,JSON.stringify(images||[]),stock_status||'available',Number(sort_order)||0]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/factories/portal/products/:id
router.patch("/factories/portal/products/:id", async (req: Request, res: Response) => {
  try {
    const factory = await getPortalFactory(req);
    if (!factory) return res.status(401).json({ error: "غير مصرح" });
    const { name, description, category, price, price_unit, price_note, min_order, image_url, images, stock_status, is_active, sort_order } = req.body;
    const r = await query(
      `UPDATE factory_products SET
        name=COALESCE($1,name), description=COALESCE($2,description), category=COALESCE($3,category),
        price=COALESCE($4,price), price_unit=COALESCE($5,price_unit), price_note=COALESCE($6,price_note),
        min_order=COALESCE($7,min_order), image_url=COALESCE($8,image_url),
        images=COALESCE($9,images), stock_status=COALESCE($10,stock_status),
        is_active=COALESCE($11,is_active), sort_order=COALESCE($12,sort_order)
       WHERE id=$13 AND factory_id=$14 RETURNING *`,
      [name||null,description||null,category||null,price!=null?Number(price):null,price_unit||null,price_note||null,min_order||null,image_url||null,
       images?JSON.stringify(images):null,stock_status||null,is_active!=null?Boolean(is_active):null,sort_order!=null?Number(sort_order):null,req.params.id,factory.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/factories/portal/products/:id
router.delete("/factories/portal/products/:id", async (req: Request, res: Response) => {
  try {
    const factory = await getPortalFactory(req);
    if (!factory) return res.status(401).json({ error: "غير مصرح" });
    await query(`DELETE FROM factory_products WHERE id=$1 AND factory_id=$2`, [req.params.id, factory.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: المصانع ────────────────────────────────────────────────

router.get("/admin/factories", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureFactoriesTables();
    const r = await query(
      `SELECT f.*, p.name_ar AS plan_name_ar, p.color AS plan_color, p.icon AS plan_icon,
        (SELECT COUNT(*) FROM factory_products fp WHERE fp.factory_id=f.id AND fp.is_active=TRUE)::int AS products_count
       FROM factories f
       LEFT JOIN factory_subscriptions s ON s.factory_id=f.id AND s.is_active=TRUE
       LEFT JOIN factory_subscription_plans p ON p.id=s.plan_id
       ORDER BY f.sort_order ASC, f.created_at DESC`
    );
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/factories", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureFactoriesTables();
    const { name, short_name, logo_initial, logo_url, banner_url, brand_color, brand_color2, category, description, location, address, founded, employees, phone, whatsapp, email, website, contact_person, contact_email, package_type, contract_start, contract_end, monthly_fee, portal_pin, sort_order, is_featured } = req.body;
    if (!name) return res.status(400).json({ error: "اسم المصنع مطلوب" });
    const pinHash = portal_pin ? hashFactoryPin(String(portal_pin)) : null;
    const r = await query(
      `INSERT INTO factories (name,short_name,logo_initial,logo_url,banner_url,brand_color,brand_color2,category,description,location,address,founded,employees,phone,whatsapp,email,website,contact_person,contact_email,package_type,contract_start,contract_end,monthly_fee,portal_pin_hash,sort_order,is_featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING *`,
      [name,short_name||null,logo_initial||'🏭',logo_url||null,banner_url||null,brand_color||'#F97316',brand_color2||'#EA580C',category||'general',description||null,location||null,address||null,founded||null,employees||null,phone||null,whatsapp||null,email||null,website||null,contact_person||null,contact_email||null,package_type||'free',contract_start||null,contract_end||null,monthly_fee?Number(monthly_fee):0,pinHash,Number(sort_order)||0,Boolean(is_featured)||false]
    );
    // assign subscription plan if package_type specified
    if (package_type && package_type !== 'free') {
      const plan = await query(`SELECT id FROM factory_subscription_plans WHERE name=$1`, [package_type]);
      if (plan.rows[0]) {
        await query(`INSERT INTO factory_subscriptions (factory_id,plan_id,is_active) VALUES ($1,$2,TRUE)`, [r.rows[0].id, plan.rows[0].id]);
      }
    }
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/factories/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureFactoriesTables();
    const { name, short_name, logo_initial, logo_url, banner_url, brand_color, brand_color2, category, description, location, address, founded, employees, phone, whatsapp, email, website, contact_person, contact_email, package_type, contract_start, contract_end, monthly_fee, portal_pin, sort_order, is_featured, is_active, promo_tagline, promo_badge, promo_banner_url } = req.body;
    const pinHash = portal_pin ? hashFactoryPin(String(portal_pin)) : undefined;
    const r = await query(
      `UPDATE factories SET
        name=COALESCE($1,name), short_name=COALESCE($2,short_name), logo_initial=COALESCE($3,logo_initial),
        logo_url=COALESCE($4,logo_url), banner_url=COALESCE($5,banner_url),
        brand_color=COALESCE($6,brand_color), brand_color2=COALESCE($7,brand_color2),
        category=COALESCE($8,category), description=COALESCE($9,description),
        location=COALESCE($10,location), address=COALESCE($11,address),
        founded=COALESCE($12,founded), employees=COALESCE($13,employees),
        phone=COALESCE($14,phone), whatsapp=COALESCE($15,whatsapp), email=COALESCE($16,email), website=COALESCE($17,website),
        contact_person=COALESCE($18,contact_person), contact_email=COALESCE($19,contact_email),
        package_type=COALESCE($20,package_type), contract_start=COALESCE($21,contract_start),
        contract_end=COALESCE($22,contract_end), monthly_fee=COALESCE($23,monthly_fee),
        portal_pin_hash=COALESCE($24,portal_pin_hash), sort_order=COALESCE($25,sort_order),
        is_featured=COALESCE($26,is_featured), is_active=COALESCE($27,is_active),
        promo_tagline=COALESCE($28,promo_tagline), promo_badge=COALESCE($29,promo_badge),
        promo_banner_url=COALESCE($30,promo_banner_url)
       WHERE id=$31 RETURNING *`,
      [name||null,short_name||null,logo_initial||null,logo_url||null,banner_url||null,brand_color||null,brand_color2||null,category||null,description||null,location||null,address||null,founded||null,employees||null,phone||null,whatsapp||null,email||null,website||null,contact_person||null,contact_email||null,package_type||null,contract_start||null,contract_end||null,monthly_fee!=null?Number(monthly_fee):null,pinHash||null,sort_order!=null?Number(sort_order):null,is_featured!=null?Boolean(is_featured):null,is_active!=null?Boolean(is_active):null,promo_tagline||null,promo_badge||null,promo_banner_url||null,req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    // update subscription if package changed
    if (package_type) {
      await query(`UPDATE factory_subscriptions SET is_active=FALSE WHERE factory_id=$1`, [req.params.id]);
      if (package_type !== 'free') {
        const plan = await query(`SELECT id FROM factory_subscription_plans WHERE name=$1`, [package_type]);
        if (plan.rows[0]) await query(`INSERT INTO factory_subscriptions (factory_id,plan_id,is_active) VALUES ($1,$2,TRUE) ON CONFLICT DO NOTHING`, [req.params.id, plan.rows[0].id]);
      }
    }
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/factories/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM factories WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Admin: Factory products
router.get("/admin/factories/:id/products", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureFactoriesTables();
    const r = await query(`SELECT * FROM factory_products WHERE factory_id=$1 ORDER BY sort_order,created_at DESC`, [req.params.id]);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/factory-products/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name, description, category, price, price_unit, price_note, min_order, image_url, stock_status, is_featured, is_active, sort_order } = req.body;
    const r = await query(
      `UPDATE factory_products SET name=COALESCE($1,name), description=COALESCE($2,description),
        category=COALESCE($3,category), price=COALESCE($4,price), price_unit=COALESCE($5,price_unit),
        price_note=COALESCE($6,price_note), min_order=COALESCE($7,min_order), image_url=COALESCE($8,image_url),
        stock_status=COALESCE($9,stock_status), is_featured=COALESCE($10,is_featured),
        is_active=COALESCE($11,is_active), sort_order=COALESCE($12,sort_order)
       WHERE id=$13 RETURNING *`,
      [name||null,description||null,category||null,price!=null?Number(price):null,price_unit||null,price_note||null,min_order||null,image_url||null,stock_status||null,is_featured!=null?Boolean(is_featured):null,is_active!=null?Boolean(is_active):null,sort_order!=null?Number(sort_order):null,req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Admin: factory subscription plans
router.get("/admin/factory-plans", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureFactoriesTables();
    const r = await query(`SELECT * FROM factory_subscription_plans ORDER BY sort_order`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/factory-plans/:id", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name_ar, description, price_monthly, max_products, has_priority, has_banner, has_promo, has_sponsor_badge, color, icon } = req.body;
    const r = await query(
      `UPDATE factory_subscription_plans SET
        name_ar=COALESCE($1,name_ar), description=COALESCE($2,description),
        price_monthly=COALESCE($3,price_monthly), max_products=COALESCE($4,max_products),
        has_priority=COALESCE($5,has_priority), has_banner=COALESCE($6,has_banner),
        has_promo=COALESCE($7,has_promo), has_sponsor_badge=COALESCE($8,has_sponsor_badge),
        color=COALESCE($9,color), icon=COALESCE($10,icon)
       WHERE id=$11 RETURNING *`,
      [name_ar||null,description||null,price_monthly!=null?Number(price_monthly):null,max_products!=null?Number(max_products):null,has_priority!=null?Boolean(has_priority):null,has_banner!=null?Boolean(has_banner):null,has_promo!=null?Boolean(has_promo):null,has_sponsor_badge!=null?Boolean(has_sponsor_badge):null,color||null,icon||null,req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// Admin: assign subscription to factory
router.post("/admin/factories/:id/subscribe", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureFactoriesTables();
    const { plan_id, expires_at, amount_paid, notes } = req.body;
    await query(`UPDATE factory_subscriptions SET is_active=FALSE WHERE factory_id=$1`, [req.params.id]);
    const r = await query(
      `INSERT INTO factory_subscriptions (factory_id,plan_id,is_active,expires_at,amount_paid,notes)
       VALUES ($1,$2,TRUE,$3,$4,$5) RETURNING *`,
      [req.params.id, Number(plan_id), expires_at||null, amount_paid?Number(amount_paid):null, notes||null]
    );
    const plan = await query(`SELECT name FROM factory_subscription_plans WHERE id=$1`, [plan_id]);
    if (plan.rows[0]) await query(`UPDATE factories SET package_type=$1 WHERE id=$2`, [plan.rows[0].name, req.params.id]);
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// إنشاء جداول ترحال إن لم تكن موجودة (self-healing)
// ═══════════════════════════════════════════════════════════════════════════

const ensureTransportTables = (() => {
  let done = false;
  return async () => {
    if (done) return;
    done = true;
    try {
      await query(`CREATE TABLE IF NOT EXISTS transport_drivers (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(100) NOT NULL, phone VARCHAR(25) NOT NULL,
        vehicle_type VARCHAR(40) NOT NULL DEFAULT '', vehicle_desc VARCHAR(200) NOT NULL DEFAULT '',
        plate VARCHAR(30) NOT NULL DEFAULT '', area VARCHAR(100) NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'pending', admin_note TEXT NOT NULL DEFAULT '',
        is_online BOOLEAN NOT NULL DEFAULT FALSE, total_trips INTEGER NOT NULL DEFAULT 0,
        rating NUMERIC(3,2) NOT NULL DEFAULT 0, zone_id INTEGER,
        operator_id INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS transport_operators (
        id SERIAL PRIMARY KEY, name VARCHAR(150) NOT NULL, contact_name VARCHAR(100) NOT NULL DEFAULT '',
        phone VARCHAR(25) NOT NULL DEFAULT '', email VARCHAR(150) NOT NULL DEFAULT '',
        contract_start DATE, contract_end DATE,
        operator_share_pct NUMERIC(5,2) NOT NULL DEFAULT 70.00,
        platform_share_pct NUMERIC(5,2) NOT NULL DEFAULT 30.00,
        status VARCHAR(20) NOT NULL DEFAULT 'active', notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS transport_trips (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_name VARCHAR(100) NOT NULL, user_phone VARCHAR(25) NOT NULL,
        trip_type VARCHAR(20) NOT NULL DEFAULT 'ride',
        from_location VARCHAR(200) NOT NULL, to_location VARCHAR(200) NOT NULL,
        notes TEXT NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'pending',
        driver_id INTEGER REFERENCES transport_drivers(id) ON DELETE SET NULL,
        driver_name VARCHAR(100), rating INTEGER, rating_note TEXT,
        from_zone INTEGER, to_zone INTEGER, fare_estimate INTEGER,
        vehicle_preference VARCHAR(30) DEFAULT 'car', delivery_desc TEXT,
        operator_id INTEGER REFERENCES transport_operators(id) ON DELETE SET NULL,
        actual_fare INTEGER, platform_revenue INTEGER, operator_revenue INTEGER,
        completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS transport_fares (
        id SERIAL PRIMARY KEY, from_zone INTEGER NOT NULL, to_zone INTEGER NOT NULL,
        fare_car INTEGER NOT NULL DEFAULT 500, fare_rickshaw INTEGER NOT NULL DEFAULT 300,
        fare_delivery INTEGER NOT NULL DEFAULT 600, fare_motorcycle INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(from_zone, to_zone)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS transport_neighborhoods (
        id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, zone_id INTEGER, sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      // add missing columns to existing tables (idempotent)
      const tripAlters = [
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS trip_type VARCHAR(20) NOT NULL DEFAULT 'ride'`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS from_zone INTEGER`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS to_zone INTEGER`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS fare_estimate INTEGER`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS vehicle_preference VARCHAR(30) DEFAULT 'car'`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS delivery_desc TEXT`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS operator_id INTEGER`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS actual_fare INTEGER`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS platform_revenue INTEGER`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS operator_revenue INTEGER`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100)`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS rating INTEGER`,
        `ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS rating_note TEXT`,
      ];
      for (const sql of tripAlters) { try { await query(sql); } catch (e: any) { if (!e?.message?.includes("already exists")) logger.warn({ err: e?.message }, "[db] tripAlters"); } }
      const nbAlters = [
        `ALTER TABLE transport_neighborhoods ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
        `ALTER TABLE transport_neighborhoods ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(100) NOT NULL DEFAULT ''`,
        `ALTER TABLE transport_neighborhoods ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE transport_neighborhoods ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`,
      ];
      for (const sql of nbAlters) { try { await query(sql); } catch (e: any) { if (!e?.message?.includes("already exists")) logger.warn({ err: e?.message }, "[db] nbAlters"); } }
      const drvAlters = [
        `ALTER TABLE transport_drivers ADD COLUMN IF NOT EXISTS zone_id INTEGER`,
        `ALTER TABLE transport_drivers ADD COLUMN IF NOT EXISTS operator_id INTEGER`,
      ];
      for (const sql of drvAlters) { try { await query(sql); } catch (e: any) { if (!e?.message?.includes("already exists")) logger.warn({ err: e?.message }, "[db] drvAlters"); } }
      const fareAlters = [
        `ALTER TABLE transport_fares ADD COLUMN IF NOT EXISTS fare_motorcycle INTEGER NOT NULL DEFAULT 0`,
      ];
      for (const sql of fareAlters) { try { await query(sql); } catch (e: any) { if (!e?.message?.includes("already exists")) logger.warn({ err: e?.message }, "[db] fareAlters"); } }
      // seed fares if empty
      const fc = await query(`SELECT count(*) FROM transport_fares`);
      if (parseInt(fc.rows[0].count) === 0) {
        const fares: Array<[number,number,number,number,number]> = [
          [1,1,500,300,600],[1,2,1000,600,1200],[1,3,1500,900,1800],[1,4,2000,1200,2400],[1,5,3000,1800,3600],
          [2,1,1000,600,1200],[2,2,500,300,600],[2,3,1200,700,1400],[2,4,1500,900,1800],[2,5,2500,1500,3000],
          [3,1,1500,900,1800],[3,2,1200,700,1400],[3,3,700,400,800],[3,4,1200,700,1400],[3,5,2000,1200,2400],
          [4,1,2000,1200,2400],[4,2,1500,900,1800],[4,3,1200,700,1400],[4,4,700,400,800],[4,5,2000,1200,2400],
          [5,1,3000,1800,3600],[5,2,2500,1500,3000],[5,3,2000,1200,2400],[5,4,2000,1200,2400],[5,5,1500,900,1800],
        ];
        for (const [fz,tz,car,rick,del_] of fares) {
          await query(`INSERT INTO transport_fares (from_zone,to_zone,fare_car,fare_rickshaw,fare_delivery) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [fz,tz,car,rick,del_]);
        }
      }
    } catch {}
  };
})();

// ═══════════════════════════════════════════════════════════════════════════
// نظام اشتراكات العيادات والمؤسسات الطبية
// ═══════════════════════════════════════════════════════════════════════════

const ensureClinicTables = (() => {
  let done = false;
  return async () => {
    if (done) return;
    done = true;
    try {
      await query(`CREATE TABLE IF NOT EXISTS medical_institutions (
        id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, type VARCHAR(50) DEFAULT 'clinic',
        phone VARCHAR(30), whatsapp VARCHAR(30), address TEXT, description TEXT,
        logo_url TEXT, owner_name VARCHAR(100), owner_phone VARCHAR(30),
        is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS clinic_subscription_plans (
        id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, name_ar VARCHAR(100),
        price_monthly NUMERIC(10,2) DEFAULT 0, price_yearly NUMERIC(10,2) DEFAULT 0,
        max_doctors INT DEFAULT 1, max_appointments_per_month INT DEFAULT 50,
        features JSONB DEFAULT '[]', is_active BOOLEAN DEFAULT true,
        sort_order INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS clinic_subscriptions (
        id SERIAL PRIMARY KEY, institution_id INT, plan_id INT,
        status VARCHAR(20) DEFAULT 'active', started_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ, payment_method VARCHAR(50), notes TEXT,
        is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS clinic_supervisors (
        id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL,
        phone VARCHAR(30) UNIQUE NOT NULL, whatsapp VARCHAR(30),
        password_hash VARCHAR(200), notes TEXT,
        is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS clinic_supervisor_assignments (
        id SERIAL PRIMARY KEY, supervisor_id INT, institution_id INT,
        assigned_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(supervisor_id, institution_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS appointment_reminders (
        id SERIAL PRIMARY KEY, appointment_id INT, reminder_type VARCHAR(30) DEFAULT 'whatsapp_5h',
        sent_at TIMESTAMPTZ DEFAULT NOW(), sent_by INT, wa_link TEXT
      )`);
      // أعمدة جديدة على appointments
      const apptAlters = [
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS institution_id INT`,
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS wa_confirm_sent BOOLEAN DEFAULT false`,
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false`,
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ`,
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ`,
        `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_fee NUMERIC(10,2)`,
      ];
      for (const sql of apptAlters) { try { await query(sql); } catch (e: any) { if (!e?.message?.includes("already exists")) logger.warn({ err: e?.message }, "[db] apptAlters"); } }
      // seed plans if empty
      const pc = await query(`SELECT count(*) FROM clinic_subscription_plans`);
      if (parseInt(pc.rows[0].count) === 0) {
        await query(`INSERT INTO clinic_subscription_plans (name,name_ar,price_monthly,price_yearly,max_doctors,max_appointments_per_month,features,sort_order) VALUES
          ('free','مجاني',0,0,1,30,'["ظهور في دليل العيادات","حجز مواعيد أساسي"]',1),
          ('bronze','برونزي',299,2990,3,100,'["كل مزايا المجاني","تذكير تلقائي واتساب","إدارة قائمة انتظار","إحصائيات أساسية"]',2),
          ('silver','فضي',599,5990,7,300,'["كل مزايا البرونزي","مشرف مخصص","تقارير شهرية","أولوية في نتائج البحث"]',3),
          ('gold','ذهبي',999,9990,999,9999,'["كل مزايا الفضي","مشرف VIP","دعم 24/7","شارة مؤسسة موثقة","تسويق مميز"]',4)`);
      }
      await query(`CREATE INDEX IF NOT EXISTS idx_med_inst_active ON medical_institutions(is_active)`);
    } catch {}
  };
})();

// ── Public ────────────────────────────────────────────────────────────────

// GET /api/clinic-subscription-plans
router.get("/clinic-subscription-plans", async (_req: Request, res: Response) => {
  try {
    await ensureClinicTables();
    const r = await query(`SELECT * FROM clinic_subscription_plans WHERE is_active=TRUE ORDER BY sort_order`);
    return res.json({ plans: r.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/medical-institutions — قائمة المؤسسات المشتركة (عامة)
router.get("/medical-institutions", async (req: Request, res: Response) => {
  try {
    await ensureClinicTables();
    const type = singleQueryValue(req.query.type);
    const search = singleQueryValue(req.query.search);
    let sql = `
      SELECT i.*,
             cs.is_active AS sub_active,
             p.name AS plan_name, p.name_ar AS plan_name_ar,
             p.color AS plan_color, p.icon AS plan_icon,
             p.has_whatsapp_confirm, p.has_reminder, p.has_priority,
             p.has_featured_badge, p.has_analytics,
             cs.expires_at AS sub_expires
      FROM medical_institutions i
      LEFT JOIN clinic_subscriptions cs ON cs.institution_id = i.id AND cs.is_active=TRUE
      LEFT JOIN clinic_subscription_plans p ON p.id = cs.plan_id
      WHERE i.is_active=TRUE`;
    const params: unknown[] = [];
    if (type)   { sql += ` AND i.type=$${params.length+1}`;   params.push(type); }
    if (search) { sql += ` AND (i.name ILIKE $${params.length+1} OR i.address ILIKE $${params.length+1})`; params.push(`%${search}%`); }
    sql += ` ORDER BY i.is_featured DESC, i.sort_order, i.name`;
    const r = await query(sql, params);
    return res.json({ institutions: r.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: المؤسسات ────────────────────────────────────────────────────────

// GET /api/admin/medical-institutions
router.get("/admin/medical-institutions", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureClinicTables();
    const r = await query(`
      SELECT i.*,
             cs.is_active AS sub_active, cs.expires_at AS sub_expires, cs.amount_paid,
             p.name AS plan_name, p.name_ar AS plan_name_ar, p.color AS plan_color
      FROM medical_institutions i
      LEFT JOIN clinic_subscriptions cs ON cs.institution_id = i.id AND cs.is_active=TRUE
      LEFT JOIN clinic_subscription_plans p ON p.id = cs.plan_id
      ORDER BY i.is_featured DESC, i.sort_order, i.name
    `);
    return res.json({ institutions: r.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/medical-institutions
router.post("/admin/medical-institutions", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureClinicTables();
    const { name, short_name, type, description, address, phone, whatsapp,
            email, website, contact_person, working_hours, fees_range,
            brand_color, logo_initial, is_featured, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "الاسم مطلوب" });
    const r = await query(
      `INSERT INTO medical_institutions
         (name,short_name,type,description,address,phone,whatsapp,email,website,
          contact_person,working_hours,fees_range,brand_color,logo_initial,is_featured,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [name.trim(), short_name||null, type||"clinic", description||null,
       address||null, phone||null, whatsapp||null, email||null, website||null,
       contact_person||null, working_hours||null, fees_range||null,
       brand_color||"#2E7D9A", logo_initial||"🏥",
       !!is_featured, Number(sort_order)||0]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/medical-institutions/:id
router.patch("/admin/medical-institutions/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureClinicTables();
    const fields: string[] = []; const vals: unknown[] = []; let i = 1;
    const allowed = ["name","short_name","type","description","address","phone","whatsapp",
                     "email","website","contact_person","working_hours","fees_range",
                     "brand_color","logo_initial","is_active","is_verified","is_featured",
                     "sort_order","subscription_tier","specialties"];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { fields.push(`${k}=$${i++}`); vals.push(req.body[k]); }
    }
    if (!fields.length) return res.status(400).json({ error: "لا توجد حقول للتحديث" });
    vals.push(req.params.id);
    const r = await query(`UPDATE medical_institutions SET ${fields.join(",")} WHERE id=$${i} RETURNING *`, vals);
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/medical-institutions/:id
router.delete("/admin/medical-institutions/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM medical_institutions WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: الاشتراكات ──────────────────────────────────────────────────────

// GET /api/admin/clinic-subscriptions
router.get("/admin/clinic-subscriptions", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureClinicTables();
    const r = await query(`
      SELECT cs.*, i.name AS inst_name, i.type AS inst_type, i.phone AS inst_phone,
             p.name AS plan_name, p.name_ar AS plan_name_ar, p.color AS plan_color, p.price_monthly
      FROM clinic_subscriptions cs
      JOIN medical_institutions i ON i.id = cs.institution_id
      JOIN clinic_subscription_plans p ON p.id = cs.plan_id
      ORDER BY cs.created_at DESC
    `);
    return res.json({ subscriptions: r.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/clinic-subscriptions — تعيين اشتراك
router.post("/admin/clinic-subscriptions", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureClinicTables();
    const { institution_id, plan_id, expires_at, amount_paid, payment_method, notes } = req.body;
    if (!institution_id || !plan_id) return res.status(400).json({ error: "المؤسسة والباقة مطلوبتان" });
    // إلغاء الاشتراك القديم
    await query(`UPDATE clinic_subscriptions SET is_active=FALSE WHERE institution_id=$1`, [institution_id]);
    const r = await query(
      `INSERT INTO clinic_subscriptions (institution_id,plan_id,is_active,expires_at,amount_paid,payment_method,notes)
       VALUES ($1,$2,TRUE,$3,$4,$5,$6) RETURNING *`,
      [institution_id, plan_id, expires_at||null,
       amount_paid ? Number(amount_paid) : null, payment_method||null, notes||null]
    );
    // تحديث tier في المؤسسة
    const plan = await query(`SELECT name FROM clinic_subscription_plans WHERE id=$1`, [plan_id]);
    if (plan.rows[0]) {
      await query(`UPDATE medical_institutions SET subscription_tier=$1 WHERE id=$2`,
        [plan.rows[0].name, institution_id]);
    }
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/clinic-subscriptions/:id
router.patch("/admin/clinic-subscriptions/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { is_active, expires_at, notes } = req.body;
    const r = await query(
      `UPDATE clinic_subscriptions SET is_active=COALESCE($1,is_active), expires_at=COALESCE($2,expires_at),
       notes=COALESCE($3,notes) WHERE id=$4 RETURNING *`,
      [is_active??null, expires_at||null, notes||null, req.params.id]
    );
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: الباقات ─────────────────────────────────────────────────────────

// GET /api/admin/clinic-subscription-plans
router.get("/admin/clinic-subscription-plans", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM clinic_subscription_plans ORDER BY sort_order`);
    return res.json({ plans: r.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/admin/clinic-subscription-plans/:id
router.put("/admin/clinic-subscription-plans/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name_ar, description, price_monthly, max_appointments_per_month,
            has_whatsapp_confirm, has_reminder, has_priority, has_featured_badge,
            has_analytics, has_supervisor, has_monthly_report, color, icon } = req.body;
    const r = await query(
      `UPDATE clinic_subscription_plans SET
         name_ar=COALESCE($1,name_ar), description=COALESCE($2,description),
         price_monthly=COALESCE($3,price_monthly),
         max_appointments_per_month=COALESCE($4,max_appointments_per_month),
         has_whatsapp_confirm=COALESCE($5,has_whatsapp_confirm),
         has_reminder=COALESCE($6,has_reminder), has_priority=COALESCE($7,has_priority),
         has_featured_badge=COALESCE($8,has_featured_badge),
         has_analytics=COALESCE($9,has_analytics), has_supervisor=COALESCE($10,has_supervisor),
         has_monthly_report=COALESCE($11,has_monthly_report),
         color=COALESCE($12,color), icon=COALESCE($13,icon)
       WHERE id=$14 RETURNING *`,
      [name_ar||null, description||null, price_monthly!=null?Number(price_monthly):null,
       max_appointments_per_month!=null?Number(max_appointments_per_month):null,
       has_whatsapp_confirm??null, has_reminder??null, has_priority??null,
       has_featured_badge??null, has_analytics??null, has_supervisor??null,
       has_monthly_report??null, color||null, icon||null, req.params.id]
    );
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: المشرفون الطبيون ────────────────────────────────────────────────

// GET /api/admin/clinic-supervisors
router.get("/admin/clinic-supervisors", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureClinicTables();
    const sups = await query(`SELECT * FROM clinic_supervisors ORDER BY created_at DESC`);
    // جلب عدد المؤسسات لكل مشرف
    const counts = await query(
      `SELECT supervisor_id, COUNT(*) AS cnt FROM clinic_supervisor_assignments GROUP BY supervisor_id`
    );
    const countMap: Record<number, number> = {};
    counts.rows.forEach((r: any) => { countMap[r.supervisor_id] = Number(r.cnt); });
    const rows = sups.rows.map((s: any) => ({ ...s, assigned_count: countMap[s.id] || 0 }));
    return res.json({ supervisors: rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/clinic-supervisors
router.post("/admin/clinic-supervisors", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureClinicTables();
    const { name, phone, whatsapp, email, assigned_plan, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "الاسم مطلوب" });
    const r = await query(
      `INSERT INTO clinic_supervisors (name,phone,whatsapp,email,assigned_plan,notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), phone||null, whatsapp||null, email||null, assigned_plan||"all", notes||null]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/clinic-supervisors/:id
router.patch("/admin/clinic-supervisors/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name, phone, whatsapp, email, assigned_plan, notes, is_active } = req.body;
    const r = await query(
      `UPDATE clinic_supervisors SET
         name=COALESCE($1,name), phone=COALESCE($2,phone), whatsapp=COALESCE($3,whatsapp),
         email=COALESCE($4,email), assigned_plan=COALESCE($5,assigned_plan),
         notes=COALESCE($6,notes), is_active=COALESCE($7,is_active)
       WHERE id=$8 RETURNING *`,
      [name||null, phone||null, whatsapp||null, email||null,
       assigned_plan||null, notes||null, is_active??null, req.params.id]
    );
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/clinic-supervisors/:id/assign — ربط مشرف بمؤسسة
router.post("/admin/clinic-supervisors/:id/assign", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { institution_id } = req.body;
    await query(
      `INSERT INTO clinic_supervisor_assignments (supervisor_id, institution_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.id, institution_id]
    );
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/clinic-supervisors/:id/assign/:instId
router.delete("/admin/clinic-supervisors/:id/assign/:instId", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM clinic_supervisor_assignments WHERE supervisor_id=$1 AND institution_id=$2`,
      [req.params.id, req.params.instId]);
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── نظام التذكيرات ────────────────────────────────────────────────────────

// GET /api/admin/appointments/all — جميع المواعيد
router.get("/admin/appointments/all", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { date, status } = req.query as Record<string, string>;
    let sql = `SELECT a.*, u.name AS user_display_name, u.phone AS user_reg_phone
               FROM appointments a
               LEFT JOIN users u ON u.id = a.user_id WHERE 1=1`;
    const params: unknown[] = [];
    if (date)   { sql += ` AND a.appointment_date=$${params.length+1}`; params.push(date); }
    if (status) { sql += ` AND a.status=$${params.length+1}`; params.push(status); }
    sql += ` ORDER BY a.appointment_date, a.appointment_time`;
    const r = await query(sql, params);
    return res.json({ appointments: r.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/appointments/reminders-due — المواعيد التي تحتاج تذكير خلال 5 ساعات
router.get("/admin/appointments/reminders-due", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureClinicTables();
    // التحقق من وجود أعمدة التذكير قبل الاستعلام
    const colsR = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='appointments' AND table_schema='public'
    `);
    const cols = colsR.rows.map((r: any) => r.column_name);
    const hasReminderSent = cols.includes("reminder_sent");
    const hasAppointmentTime = cols.includes("appointment_time");
    const hasAppointmentDate = cols.includes("appointment_date");

    // إضافة الأعمدة المفقودة تلقائياً
    if (!hasReminderSent) {
      await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false`);
      await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ`);
      await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ`);
      await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS wa_confirm_sent BOOLEAN DEFAULT false`);
      await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS institution_id INT`);
      await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_fee NUMERIC(10,2)`);
    }

    // بناء الاستعلام حسب الأعمدة المتاحة
    let timeFilter = "";
    if (hasAppointmentDate && hasAppointmentTime) {
      timeFilter = `AND (a.appointment_date::text || ' ' || a.appointment_time::text)::timestamptz
                    BETWEEN NOW() + INTERVAL '4 hours' AND NOW() + INTERVAL '6 hours'`;
    }

    const r = await query(`
      SELECT a.*, u.name AS user_display_name
      FROM appointments a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.status = 'pending'
        AND (a.reminder_sent = FALSE OR a.reminder_sent IS NULL)
        ${timeFilter}
      ORDER BY a.id DESC
      LIMIT 100
    `);
    return res.json({ reminders: r.rows, count: r.rowCount });
  } catch (err: any) { logger.error({ err }, "reminders-due error"); return res.status(500).json({ error: "Server error", detail: err?.message }); }
});

// POST /api/admin/appointments/:id/send-reminder — إرسال تذكير (يعيد رابط واتساب)
router.post("/admin/appointments/:id/send-reminder", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const apptR = await query(`SELECT * FROM appointments WHERE id=$1`, [req.params.id]);
    if (!apptR.rows[0]) return res.status(404).json({ error: "الموعد غير موجود" });
    const appt = apptR.rows[0];
    const phone = (appt.user_phone || "").replace(/[^0-9]/g, "");
    // رسالة التذكير
    const msg =
      `🔔 *تذكير موعدك*\n` +
      `السلام عليكم ${appt.user_name || ""}،\n` +
      `نذكّرك بموعدك في *${appt.facility_name || "المنشأة"}*\n` +
      `📅 اليوم الساعة *${appt.appointment_time}*\n` +
      `يرجى الحضور قبل الموعد بـ 15 دقيقة.\n` +
      `للإلغاء أو إعادة الجدولة تواصل معنا.\n` +
      `— فريق حصاحيصاوي 💚`;
    const waLink = phone
      ? `https://wa.me/249${phone.replace(/^0/, "")}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    // تحديث الموعد
    await query(`UPDATE appointments SET reminder_sent=TRUE, reminder_sent_at=NOW() WHERE id=$1`, [req.params.id]);
    // تسجيل التذكير
    await query(
      `INSERT INTO appointment_reminders (appointment_id, reminder_type, sent_by, wa_link)
       VALUES ($1,'pre_5h',$2,$3)`,
      [req.params.id, req.headers["x-admin-pin"] ? "admin" : "supervisor", waLink]
    );
    return res.json({ ok: true, wa_link: waLink, message: msg, phone });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/appointments/:id/confirm — تأكيد موعد
router.post("/admin/appointments/:id/confirm", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(
      `UPDATE appointments SET status='confirmed', confirmed_at=NOW() WHERE id=$1`,
      [req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// ── بوابة المشرف (Supervisor Portal) ─────────────────────────────────────

// POST /api/supervisor/login — تسجيل دخول المشرف بالهاتف
router.post("/supervisor/login", async (req: Request, res: Response) => {
  try {
    await ensureClinicTables();
    const { phone } = req.body as { phone?: string };
    if (!phone?.trim()) return res.status(400).json({ error: "الهاتف مطلوب" });
    const r = await query(
      `SELECT * FROM clinic_supervisors WHERE (phone=$1 OR whatsapp=$1) AND is_active=TRUE LIMIT 1`,
      [phone.trim()]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "المشرف غير موجود أو غير مفعّل" });
    const sup = r.rows[0];
    // توليد token مؤقت
    const token = `sup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await query(`UPDATE clinic_supervisors SET notes=COALESCE(notes,'') || '' WHERE id=$1`, [sup.id]);
    return res.json({ supervisor: sup, token });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/supervisor/reminders-due — تذكيرات المشرف
router.get("/supervisor/reminders-due", async (req: Request, res: Response) => {
  try {
    await ensureClinicTables();
    const colsR = await query(`SELECT column_name FROM information_schema.columns WHERE table_name='appointments' AND table_schema='public'`);
    const cols = colsR.rows.map((r: any) => r.column_name);
    const hasAppointmentTime = cols.includes("appointment_time");
    const hasAppointmentDate = cols.includes("appointment_date");
    let timeFilter = "";
    if (hasAppointmentDate && hasAppointmentTime) {
      timeFilter = `AND (a.appointment_date::text || ' ' || a.appointment_time::text)::timestamptz
                    BETWEEN NOW() + INTERVAL '4 hours' AND NOW() + INTERVAL '7 hours'`;
    }
    const r = await query(`
      SELECT a.*, u.name AS user_display_name
      FROM appointments a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.status IN ('pending','confirmed')
        AND (a.reminder_sent = FALSE OR a.reminder_sent IS NULL)
        ${timeFilter}
      ORDER BY a.id DESC
      LIMIT 100
    `);
    return res.json({ reminders: r.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});


// ═══════════════════════════════════════════════════════════════════
// قسم التأجير — Rental Section
// ═══════════════════════════════════════════════════════════════════

void (async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS rental_listings (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      owner_name       TEXT NOT NULL,
      owner_phone      TEXT NOT NULL,
      owner_whatsapp   TEXT,
      title            TEXT NOT NULL,
      description      TEXT NOT NULL,
      rental_type      TEXT NOT NULL DEFAULT 'real_estate',
      sub_type         TEXT,
      neighborhood     TEXT,
      address          TEXT,
      price_per_day    NUMERIC(12,2),
      price_per_week   NUMERIC(12,2),
      price_per_month  NUMERIC(12,2),
      deposit_amount   NUMERIC(12,2) DEFAULT 0,
      images           TEXT[] DEFAULT '{}',
      status           TEXT NOT NULL DEFAULT 'active',
      views            INTEGER NOT NULL DEFAULT 0,
      is_verified      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS rental_contracts (
      id                  SERIAL PRIMARY KEY,
      listing_id          INTEGER REFERENCES rental_listings(id) ON DELETE SET NULL,
      owner_user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      renter_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      owner_name          TEXT NOT NULL,
      owner_phone         TEXT NOT NULL,
      renter_name         TEXT NOT NULL,
      renter_phone        TEXT NOT NULL,
      listing_title       TEXT NOT NULL,
      rental_type         TEXT NOT NULL DEFAULT 'real_estate',
      neighborhood        TEXT,
      address             TEXT,
      start_date          DATE NOT NULL,
      end_date            DATE NOT NULL,
      total_amount        NUMERIC(12,2) NOT NULL,
      commission_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
      from_app            BOOLEAN NOT NULL DEFAULT TRUE,
      commission_paid     BOOLEAN NOT NULL DEFAULT FALSE,
      payment_proof_url   TEXT,
      owner_signed        BOOLEAN NOT NULL DEFAULT FALSE,
      renter_signed       BOOLEAN NOT NULL DEFAULT FALSE,
      owner_signed_at     TIMESTAMPTZ,
      renter_signed_at    TIMESTAMPTZ,
      status              TEXT NOT NULL DEFAULT 'pending',
      dispute_details     TEXT,
      conditions          TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`INSERT INTO admin_settings (key,value) VALUES ('rental_account_number','1471388') ON CONFLICT (key) DO NOTHING`);
  await query(`INSERT INTO admin_settings (key,value) VALUES ('rental_whatsapp','249916897578') ON CONFLICT (key) DO NOTHING`);
  await query(`INSERT INTO admin_settings (key,value) VALUES ('rental_commission_pct','5') ON CONFLICT (key) DO NOTHING`);
})().catch(e => logger.error({ err: e }, "rental init error"));

// ── GET /api/rentals ──────────────────────────────────────────────
router.get("/rentals", async (req: Request, res: Response) => {
  try {
    const { type, neighborhood, min_price, max_price, search } = req.query;
    const params: any[] = ["active"];
    let where = "WHERE r.status=$1";
    if (type && type !== "all") { where += ` AND r.rental_type=$${params.length+1}`; params.push(type); }
    if (neighborhood) { where += ` AND r.neighborhood ILIKE $${params.length+1}`; params.push(`%${neighborhood}%`); }
    if (min_price) { where += ` AND COALESCE(r.price_per_month, r.price_per_day*30) >= $${params.length+1}`; params.push(Number(min_price)); }
    if (max_price) { where += ` AND COALESCE(r.price_per_month, r.price_per_day*30) <= $${params.length+1}`; params.push(Number(max_price)); }
    if (search) { where += ` AND (r.title ILIKE $${params.length+1} OR r.description ILIKE $${params.length+1} OR r.neighborhood ILIKE $${params.length+1})`; params.push(`%${search}%`); }
    const r = await query(`SELECT r.*, u.name AS user_display_name FROM rental_listings r LEFT JOIN users u ON u.id=r.user_id ${where} ORDER BY r.is_verified DESC, r.created_at DESC LIMIT 100`, params);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "rentals list error"); return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/rentals ─────────────────────────────────────────────
router.post("/rentals", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const { owner_name, owner_phone, owner_whatsapp, title, description, rental_type, sub_type, neighborhood, address, price_per_day, price_per_week, price_per_month, deposit_amount, images } = req.body;
    if (!owner_name || !owner_phone || !title || !description || !rental_type)
      return res.status(400).json({ error: "الحقول الإلزامية ناقصة" });
    const r = await query(
      `INSERT INTO rental_listings (user_id,owner_name,owner_phone,owner_whatsapp,title,description,rental_type,sub_type,neighborhood,address,price_per_day,price_per_week,price_per_month,deposit_amount,images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [user?.id||null, owner_name, owner_phone, owner_whatsapp||null, title, description, rental_type, sub_type||null, neighborhood||null, address||null, price_per_day||null, price_per_week||null, price_per_month||null, deposit_amount||0, images||[]]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "rental create error"); return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/rentals/settings ─────────────────────────────────────
router.get("/rentals/settings", async (_req: Request, res: Response) => {
  try {
    const r = await query(`SELECT key, value FROM admin_settings WHERE key IN ('rental_account_number','rental_whatsapp','rental_commission_pct','rental_enabled')`);
    const s: Record<string,string> = {};
    r.rows.forEach((row: any) => { s[row.key] = row.value; });
    return res.json(s);
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/rentals/contracts/my ────────────────────────────────
router.get("/rentals/contracts/my", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const r = await query(
      `SELECT * FROM rental_contracts WHERE owner_user_id=$1 OR renter_user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [user.id]
    );
    return res.json(r.rows);
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/rentals/:id ──────────────────────────────────────────
router.get("/rentals/:id", async (req: Request, res: Response) => {
  try {
    await query(`UPDATE rental_listings SET views=views+1 WHERE id=$1`, [req.params.id]);
    const r = await query(`SELECT r.*, u.name AS user_display_name FROM rental_listings r LEFT JOIN users u ON u.id=r.user_id WHERE r.id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json(r.rows[0]);
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── DELETE /api/rentals/:id ───────────────────────────────────────
router.delete("/rentals/:id", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const isAdmin = await isAdminRequest(req);
    if (!user && !isAdmin) return res.status(401).json({ error: "غير مصرح" });
    const r = await query(`SELECT user_id FROM rental_listings WHERE id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    if (!isAdmin && r.rows[0].user_id !== user?.id) return res.status(403).json({ error: "ليس لديك صلاحية" });
    await query(`UPDATE rental_listings SET status='deleted' WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/rentals/:id/contract ──────────────────────────────
router.post("/rentals/:id/contract", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول لإبرام عقد" });
    const listing = (await query(`SELECT * FROM rental_listings WHERE id=$1 AND status='active'`, [req.params.id])).rows[0];
    if (!listing) return res.status(404).json({ error: "الإعلان غير متاح" });
    const { renter_name, renter_phone, start_date, end_date, total_amount, from_app, conditions } = req.body;
    if (!renter_name || !renter_phone || !start_date || !end_date || !total_amount)
      return res.status(400).json({ error: "الحقول الإلزامية ناقصة" });
    const settingsR = await query(`SELECT key,value FROM admin_settings WHERE key IN ('rental_commission_pct')`);
    const pct = parseFloat(settingsR.rows.find((r:any)=>r.key==='rental_commission_pct')?.value || "5");
    const commission = from_app !== false ? Math.round(Number(total_amount) * pct / 100 * 100) / 100 : 0;
    const r = await query(
      `INSERT INTO rental_contracts (listing_id,owner_user_id,renter_user_id,owner_name,owner_phone,renter_name,renter_phone,listing_title,rental_type,neighborhood,address,start_date,end_date,total_amount,commission_amount,from_app,conditions)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [listing.id, listing.user_id, user.id, listing.owner_name, listing.owner_phone, renter_name, renter_phone, listing.title, listing.rental_type, listing.neighborhood||null, listing.address||null, start_date, end_date, total_amount, commission, from_app!==false, conditions||null]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "contract create error"); return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/rentals/contracts/:cid/sign ───────────────────────
router.patch("/rentals/contracts/:cid/sign", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const c = (await query(`SELECT * FROM rental_contracts WHERE id=$1`, [req.params.cid])).rows[0];
    if (!c) return res.status(404).json({ error: "العقد غير موجود" });
    const { role } = req.body; // 'owner' | 'renter'
    if (role === "owner" && c.owner_user_id === user.id) {
      await query(`UPDATE rental_contracts SET owner_signed=TRUE, owner_signed_at=NOW() WHERE id=$1`, [c.id]);
    } else if (role === "renter" && c.renter_user_id === user.id) {
      await query(`UPDATE rental_contracts SET renter_signed=TRUE, renter_signed_at=NOW() WHERE id=$1`, [c.id]);
    } else {
      return res.status(403).json({ error: "ليس لديك صلاحية التوقيع على هذا العقد" });
    }
    const updated = (await query(`SELECT * FROM rental_contracts WHERE id=$1`, [c.id])).rows[0];
    if (updated.owner_signed && updated.renter_signed) {
      await query(`UPDATE rental_contracts SET status='active' WHERE id=$1`, [c.id]);
      await query(`UPDATE rental_listings SET status='rented' WHERE id=$1`, [c.listing_id]);
    }
    return res.json({ ok: true, contract: updated });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/rentals/contracts/:cid/payment-proof ─────────────
router.patch("/rentals/contracts/:cid/payment-proof", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const { payment_proof_url } = req.body;
    if (!payment_proof_url) return res.status(400).json({ error: "رابط الإشعار مطلوب" });
    await query(`UPDATE rental_contracts SET payment_proof_url=$1, commission_paid=TRUE WHERE id=$2`, [payment_proof_url, req.params.cid]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/rentals/contracts/:cid/dispute ────────────────────
router.patch("/rentals/contracts/:cid/dispute", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const { dispute_details } = req.body;
    await query(`UPDATE rental_contracts SET status='disputed', dispute_details=$1 WHERE id=$2 AND (owner_user_id=$3 OR renter_user_id=$3)`, [dispute_details, req.params.cid, user.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/rentals ───────────────────────────────────────
router.get("/admin/rentals", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { type, status } = req.query;
    const params: any[] = [];
    let where = "WHERE 1=1";
    if (type && type !== "all") { where += ` AND rental_type=$${params.length+1}`; params.push(type); }
    if (status && status !== "all") { where += ` AND rl.status=$${params.length+1}`; params.push(status); }
    const r = await query(`SELECT rl.*, u.name AS user_display_name FROM rental_listings rl LEFT JOIN users u ON u.id=rl.user_id ${where} ORDER BY created_at DESC LIMIT 200`, params);
    return res.json(r.rows);
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/rentals/:id/status ─────────────────────────
router.patch("/admin/rentals/:id/status", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { status, is_verified } = req.body;
    if (status) await query(`UPDATE rental_listings SET status=$1 WHERE id=$2`, [status, req.params.id]);
    if (is_verified !== undefined) await query(`UPDATE rental_listings SET is_verified=$1 WHERE id=$2`, [is_verified, req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/rentals/contracts ────────────────────────────
router.get("/admin/rentals/contracts", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM rental_contracts ORDER BY created_at DESC LIMIT 200`);
    return res.json(r.rows);
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/rentals/settings ───────────────────────────
router.patch("/admin/rentals/settings", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { rental_account_number, rental_whatsapp, rental_commission_pct, rental_enabled } = req.body;
    if (rental_account_number !== undefined)
      await query(`INSERT INTO admin_settings(key,value) VALUES('rental_account_number',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [rental_account_number]);
    if (rental_whatsapp !== undefined)
      await query(`INSERT INTO admin_settings(key,value) VALUES('rental_whatsapp',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [rental_whatsapp]);
    if (rental_commission_pct !== undefined)
      await query(`INSERT INTO admin_settings(key,value) VALUES('rental_commission_pct',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [String(rental_commission_pct)]);
    if (rental_enabled !== undefined)
      await query(`INSERT INTO admin_settings(key,value) VALUES('rental_enabled',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [String(rental_enabled)]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
// تذاكر السفر بين المدن
// ═══════════════════════════════════════════════════════════════════

// ── GET /api/travel/companies ────────────────────────────────────
router.get("/travel/companies", async (_req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT id, name, owner_name, phone, wa_number, logo_url, commission_pct, subscription_type, active
       FROM travel_companies WHERE active=TRUE ORDER BY name`
    );
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/travel/routes ───────────────────────────────────────
router.get("/travel/routes", async (req: Request, res: Response) => {
  try {
    const { company_id, from_city, to_city } = req.query;
    const params: any[] = [];
    let where = "WHERE tr.active=TRUE AND tc.active=TRUE";
    if (company_id) { where += ` AND tr.company_id=$${params.length+1}`; params.push(company_id); }
    if (from_city)  { where += ` AND tr.from_city ILIKE $${params.length+1}`; params.push(`%${from_city}%`); }
    if (to_city)    { where += ` AND tr.to_city ILIKE $${params.length+1}`; params.push(`%${to_city}%`); }
    const r = await query(
      `SELECT tr.*, tc.name AS company_name, tc.phone AS company_phone, tc.wa_number AS company_wa
       FROM travel_routes tr
       JOIN travel_companies tc ON tc.id=tr.company_id
       ${where} ORDER BY tr.departure_time`,
      params
    );
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/travel/bookings ────────────────────────────────────
router.post("/travel/bookings", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const {
      company_id, route_id, from_city, to_city, travel_date,
      departure_time, passenger_name, passenger_phone, price, notes
    } = req.body;
    if (!from_city || !to_city || !travel_date || !passenger_name)
      return res.status(400).json({ error: "بيانات ناقصة" });

    // رقم تذكرة فريد
    const dateStr = new Date(travel_date).toISOString().slice(0,10).replace(/-/g,"");
    const rand    = Math.floor(Math.random()*9000+1000);
    const ticketNumber = `TKT-${dateStr}-${rand}`;
    const bookingRef   = `BK${rand}${Math.floor(Math.random()*100)}`;

    // اسم الشركة
    let companyName = "";
    if (company_id) {
      const cr = await query(`SELECT name FROM travel_companies WHERE id=$1`, [company_id]);
      companyName = cr.rows[0]?.name || "";
    }

    // رقم المقعد
    const seatLetter = String.fromCharCode(65 + Math.floor(Math.random()*4));
    const seatNum    = Math.floor(Math.random()*15)+1;
    const seatNumber = `${seatLetter}${seatNum}`;

    // رمز التحقق المشفّر (SHA-256)
    const rawToken  = `${ticketNumber}:${bookingRef}:${Date.now()}:${Math.random()}`;
    const verifyTok = require("crypto").createHash("sha256").update(rawToken).digest("hex");

    const r = await query(
      `INSERT INTO travel_bookings
         (user_id, company_id, route_id, company_name, from_city, to_city, travel_date,
          departure_time, passenger_name, passenger_phone, seat_number, price, ticket_number, booking_ref, notes, verify_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [user?.id||null, company_id||null, route_id||null, companyName,
       from_city, to_city, travel_date, departure_time||"", passenger_name,
       passenger_phone||"", seatNumber, price||0, ticketNumber, bookingRef, notes||"", verifyTok]
    );
    return res.status(201).json(r.rows[0]);
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "تذكرة مكررة" });
    return res.status(500).json({ error: "Server error" });
  }
});

// ── GET /api/travel/bookings ─────────────────────────────────────
router.get("/travel/bookings", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const r = await query(
      `SELECT * FROM travel_bookings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [user.id]
    );
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/travel/bookings/:id/cancel ───────────────────────
router.patch("/travel/bookings/:id/cancel", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const r = await query(
      `UPDATE travel_bookings SET status='cancelled'
       WHERE id=$1 AND user_id=$2 AND status='confirmed' RETURNING id`,
      [req.params.id, user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "لا يمكن إلغاء هذه التذكرة" });
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/travel/bookings/:id/reschedule ───────────────────
router.patch("/travel/bookings/:id/reschedule", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const { new_date } = req.body;
    if (!new_date) return res.status(400).json({ error: "التاريخ مطلوب" });
    const r = await query(
      `UPDATE travel_bookings SET travel_date=$1, new_date=$1, status='rescheduled'
       WHERE id=$2 AND user_id=$3 AND status IN ('confirmed','rescheduled') RETURNING id`,
      [new_date, req.params.id, user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "لا يمكن تغيير موعد هذه التذكرة" });
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: GET /api/admin/travel/companies ───────────────────────
router.get("/admin/travel/companies", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM travel_companies ORDER BY created_at DESC`);
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: POST /api/admin/travel/companies ──────────────────────
router.post("/admin/travel/companies", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name, owner_name, phone, wa_number, commission_pct, subscription_type, subscription_price, license_no, notes } = req.body;
    if (!name) return res.status(400).json({ error: "اسم الشركة مطلوب" });
    const r = await query(
      `INSERT INTO travel_companies (name, owner_name, phone, wa_number, commission_pct, subscription_type, subscription_price, license_no, notes, contract_signed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`,
      [name, owner_name||"", phone||"", wa_number||"", commission_pct||10, subscription_type||"commission", subscription_price||0, license_no||"", notes||""]
    );
    return res.status(201).json(r.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: PATCH /api/admin/travel/companies/:id ─────────────────
router.patch("/admin/travel/companies/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name, owner_name, phone, wa_number, commission_pct, subscription_type, subscription_price, license_no, active, notes } = req.body;
    await query(
      `UPDATE travel_companies SET
         name=COALESCE($1,name), owner_name=COALESCE($2,owner_name), phone=COALESCE($3,phone),
         wa_number=COALESCE($4,wa_number), commission_pct=COALESCE($5,commission_pct),
         subscription_type=COALESCE($6,subscription_type), subscription_price=COALESCE($7,subscription_price),
         license_no=COALESCE($8,license_no), active=COALESCE($9,active), notes=COALESCE($10,notes)
       WHERE id=$11`,
      [name, owner_name, phone, wa_number, commission_pct, subscription_type, subscription_price, license_no, active, notes, req.params.id]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: GET /api/admin/travel/bookings ────────────────────────
router.get("/admin/travel/bookings", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { status, date } = req.query;
    const params: any[] = [];
    let where = "WHERE 1=1";
    if (status && status !== "all") { where += ` AND tb.status=$${params.length+1}`; params.push(status); }
    if (date) { where += ` AND tb.travel_date=$${params.length+1}`; params.push(date); }
    const r = await query(
      `SELECT tb.*, u.name AS user_display FROM travel_bookings tb
       LEFT JOIN users u ON u.id=tb.user_id
       ${where} ORDER BY tb.created_at DESC LIMIT 200`,
      params
    );
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── Admin: POST /api/admin/travel/routes ─────────────────────────
router.post("/admin/travel/routes", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { company_id, from_city, to_city, departure_time, price, seats_total } = req.body;
    if (!company_id || !from_city || !to_city || !price)
      return res.status(400).json({ error: "بيانات ناقصة" });
    const r = await query(
      `INSERT INTO travel_routes (company_id, from_city, to_city, departure_time, price, seats_total)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [company_id, from_city, to_city, departure_time||"08:00", price, seats_total||30]
    );
    return res.status(201).json(r.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/travel-agencies/apply ─────────────────────────────
router.post("/travel-agencies/apply", writeLimiter, async (req: Request, res: Response) => {
  try {
    const {
      agency_name, agency_type, specialties, destinations, description, website,
      contact_name, contact_role, phone, whatsapp, email, city, country,
      license_number, founded_year, services_offered, target_routes,
      invite_token,
    } = req.body as any;
    if (!agency_name || !contact_name || !phone)
      return res.status(400).json({ error: "اسم الوكالة واسم المسؤول ورقم الهاتف مطلوبة" });
    const r = await query(
      `INSERT INTO travel_agency_applications
        (agency_name, agency_type, specialties, destinations, description, website,
         contact_name, contact_role, phone, whatsapp, email, city, country,
         license_number, founded_year, services_offered, target_routes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        agency_name, agency_type||"", JSON.stringify(specialties||[]), JSON.stringify(destinations||[]),
        description||"", website||"", contact_name, contact_role||"", phone, whatsapp||"",
        email||"", city||"", country||"السودان", license_number||"",
        founded_year||null, JSON.stringify(services_offered||[]), target_routes||"",
      ]
    );
    // ربط الدعوة بالطلب إن وُجدت
    if (invite_token) {
      await query(
        `UPDATE travel_agency_invitations SET status='applied', application_id=$1, applied_at=NOW() WHERE token=$2`,
        [r.rows[0].id, invite_token]
      ).catch(() => {});
    }
    return res.status(201).json({ id: r.rows[0].id, message: "تم استلام طلبك وسيتم مراجعته من قبل الإدارة" });
  } catch (e: any) { logger.error({ err: e?.message }, "[travel-agencies/apply]"); return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/travel-agencies/applications ──────────────────
router.get("/admin/travel-agencies/applications", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { status } = req.query;
    const params: any[] = [];
    let where = "WHERE 1=1";
    if (status && status !== "all") { where += ` AND status=$${params.length+1}`; params.push(status); }
    const r = await query(`SELECT * FROM travel_agency_applications ${where} ORDER BY created_at DESC`, params);
    return res.json({ applications: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/travel-agencies/applications/:id ───────────
router.patch("/admin/travel-agencies/applications/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { status, admin_notes } = req.body as any;
    if (!["approved","rejected"].includes(status))
      return res.status(400).json({ error: "الحالة يجب أن تكون approved أو rejected" });
    const r = await query(
      `UPDATE travel_agency_applications SET status=$1, admin_notes=COALESCE($2,admin_notes), reviewed_at=NOW() WHERE id=$3 RETURNING *`,
      [status, admin_notes||null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json({ application: r.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
// نظام دعوات وكالات السفر
// ═══════════════════════════════════════════════════════════════════

async function ensureInvitationsTable(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS travel_agency_invitations (
    id              SERIAL PRIMARY KEY,
    token           VARCHAR(64) UNIQUE NOT NULL,
    agency_name     VARCHAR(150) NOT NULL,
    contact_name    VARCHAR(100) NOT NULL DEFAULT '',
    phone           VARCHAR(30)  NOT NULL DEFAULT '',
    whatsapp        VARCHAR(30)  NOT NULL DEFAULT '',
    email           VARCHAR(150) NOT NULL DEFAULT '',
    city            VARCHAR(80)  NOT NULL DEFAULT '',
    agency_type     VARCHAR(50)  NOT NULL DEFAULT 'local',
    note            TEXT         NOT NULL DEFAULT '',
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','opened','applied','expired')),
    application_id  INTEGER REFERENCES travel_agency_applications(id) ON DELETE SET NULL,
    expires_at      TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    opened_at       TIMESTAMPTZ,
    applied_at      TIMESTAMPTZ
  )`);
}

// ── POST /api/admin/travel-agencies/invitations ─── إنشاء دعوة
router.post("/admin/travel-agencies/invitations", async (req: Request, res: Response): Promise<any> => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureInvitationsTable();
    const { agency_name, contact_name, phone, whatsapp, email, city, agency_type, note, expires_days } = req.body as any;
    if (!agency_name?.trim()) return res.status(400).json({ error: "اسم الوكالة مطلوب" });
    const token = randomBytes(24).toString("hex");
    const expiryDays = Math.min(90, Math.max(1, parseInt(expires_days)||30));
    const r = await query(
      `INSERT INTO travel_agency_invitations
         (token,agency_name,contact_name,phone,whatsapp,email,city,agency_type,note,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW()+($10 || ' days')::INTERVAL)
       RETURNING *`,
      [token, agency_name.trim(), contact_name?.trim()||"", phone?.trim()||"",
       whatsapp?.trim()||"", email?.trim()||"", city?.trim()||"",
       agency_type||"local", note?.trim()||"", expiryDays]
    );
    const inv = r.rows[0];
    const appUrl = process.env.APP_URL || "https://hasahisawi.pages.dev";
    return res.status(201).json({ ...inv, link: `${appUrl}/travel-agencies?invite=${token}` });
  } catch (e: any) { logger.error({ err: e?.message }, "[invitations/create]"); return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/travel-agencies/invitations ─── قائمة الدعوات
router.get("/admin/travel-agencies/invitations", async (req: Request, res: Response): Promise<any> => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureInvitationsTable();
    const r = await query(
      `SELECT i.*, a.status AS app_status
       FROM travel_agency_invitations i
       LEFT JOIN travel_agency_applications a ON a.id=i.application_id
       ORDER BY i.created_at DESC`
    );
    const appUrl = process.env.APP_URL || "https://hasahisawi.pages.dev";
    const rows = r.rows.map(inv => ({
      ...inv,
      is_expired: new Date(inv.expires_at) < new Date(),
      link: `${appUrl}/travel-agencies?invite=${inv.token}`,
    }));
    return res.json(rows);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ── DELETE /api/admin/travel-agencies/invitations/:id ─── إلغاء دعوة
router.delete("/admin/travel-agencies/invitations/:id", async (req: Request, res: Response): Promise<any> => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureInvitationsTable();
    await query(`DELETE FROM travel_agency_invitations WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/travel-agencies/invite/:token ─── جلب بيانات الدعوة (عام)
router.get("/travel-agencies/invite/:token", async (req: Request, res: Response): Promise<any> => {
  try {
    await ensureInvitationsTable();
    const r = await query(
      `SELECT id,token,agency_name,contact_name,phone,whatsapp,email,city,agency_type,note,status,expires_at
       FROM travel_agency_invitations WHERE token=$1`, [req.params.token]
    );
    if (!r.rows.length) return res.status(404).json({ error: "رابط الدعوة غير صالح" });
    const inv = r.rows[0];
    if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: "انتهت صلاحية رابط الدعوة" });
    if (inv.status === "applied") return res.status(409).json({ error: "تم تقديم الطلب بالفعل عبر هذه الدعوة" });
    // تسجيل أول فتح
    if (inv.status === "pending") {
      await query(`UPDATE travel_agency_invitations SET status='opened', opened_at=NOW() WHERE token=$1`, [req.params.token]);
    }
    return res.json({ invitation: inv });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
// نظام الدفع والإدارة الشاملة لتذاكر السفر
// ═══════════════════════════════════════════════════════════════════

// ── GET /api/admin/travel/stats ──────────────────────────────────
router.get("/admin/travel/stats", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const [total, confirmed, pending, cancelled, revenue, companies, routes] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM travel_bookings`),
      query(`SELECT COUNT(*) AS cnt FROM travel_bookings WHERE payment_status='verified'`),
      query(`SELECT COUNT(*) AS cnt FROM travel_bookings WHERE payment_status IN ('pending_payment','proof_submitted')`),
      query(`SELECT COUNT(*) AS cnt FROM travel_bookings WHERE status='cancelled'`),
      query(`SELECT COALESCE(SUM(price),0) AS total FROM travel_bookings WHERE payment_status='verified'`),
      query(`SELECT COUNT(*) AS cnt FROM travel_companies WHERE active=TRUE`),
      query(`SELECT COUNT(*) AS cnt FROM travel_routes WHERE active=TRUE`),
    ]);
    const daily = await query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS bookings, COALESCE(SUM(price),0) AS revenue
      FROM travel_bookings WHERE created_at >= NOW()-INTERVAL '30 days'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 30`);
    const topRoutes = await query(`
      SELECT from_city, to_city, COUNT(*) AS bookings, COALESCE(SUM(price),0) AS revenue
      FROM travel_bookings GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10`);
    return res.json({
      total: parseInt(total.rows[0].cnt),
      confirmed: parseInt(confirmed.rows[0].cnt),
      pending: parseInt(pending.rows[0].cnt),
      cancelled: parseInt(cancelled.rows[0].cnt),
      revenue: parseFloat(revenue.rows[0].total),
      active_companies: parseInt(companies.rows[0].cnt),
      active_routes: parseInt(routes.rows[0].cnt),
      daily: daily.rows,
      topRoutes: topRoutes.rows,
    });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/travel/companies/:id/payment ────────────────────────
router.get("/travel/companies/:id/payment", async (req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT id, name, payment_account_type, payment_account_number, payment_account_name, payment_booking_timeout_hrs
       FROM travel_companies WHERE id=$1 AND active=TRUE`, [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "الشركة غير موجودة" });
    return res.json(r.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/travel/companies/:id/payment-account ────────
router.patch("/admin/travel/companies/:id/payment-account", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { payment_account_type, payment_account_number, payment_account_name, payment_booking_timeout_hrs } = req.body;
    await query(
      `UPDATE travel_companies SET
         payment_account_type=COALESCE($1,payment_account_type),
         payment_account_number=COALESCE($2,payment_account_number),
         payment_account_name=COALESCE($3,payment_account_name),
         payment_booking_timeout_hrs=COALESCE($4,payment_booking_timeout_hrs)
       WHERE id=$5`,
      [payment_account_type, payment_account_number, payment_account_name, payment_booking_timeout_hrs, req.params.id]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/travel/bookings/:id/submit-payment ─────────────────
router.post("/travel/bookings/:id/submit-payment", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const { payment_proof_url, payment_ref } = req.body;
    if (!payment_ref && !payment_proof_url)
      return res.status(400).json({ error: "أرسل رقم المرجع أو صورة الإيصال" });
    const r = await query(
      `UPDATE travel_bookings
       SET payment_status='proof_submitted',
           payment_proof_url=COALESCE($1,payment_proof_url),
           payment_ref=COALESCE($2,payment_ref)
       WHERE id=$3 AND user_id=$4 AND payment_status IN ('pending_payment','rejected')
       RETURNING id`,
      [payment_proof_url||null, payment_ref||null, req.params.id, user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "لا يمكن تحديث هذا الحجز" });
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/travel/bookings/:id/verify-payment ──────────
router.patch("/admin/travel/bookings/:id/verify-payment", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const admin = await getSessionUser(req);
    await query(
      `UPDATE travel_bookings
       SET payment_status='verified', status='confirmed',
           payment_verified_by=$1, payment_verified_at=NOW()
       WHERE id=$2`,
      [String(admin?.name || admin?.email || "admin"), req.params.id]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/travel/bookings/:id/reject-payment ──────────
router.patch("/admin/travel/bookings/:id/reject-payment", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { reason } = req.body;
    await query(
      `UPDATE travel_bookings
       SET payment_status='rejected', payment_rejection_reason=COALESCE($1,''),
           status='confirmed'
       WHERE id=$2`,
      [reason || "", req.params.id]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── DELETE /api/admin/travel/companies/:id ───────────────────────
router.delete("/admin/travel/companies/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`UPDATE travel_companies SET active=FALSE WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/travel/routes/:id ──────────────────────────
router.patch("/admin/travel/routes/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { price, departure_time, seats_total, active, peak_price_multiplier, peak_hours_start, peak_hours_end, notes } = req.body;
    await query(
      `UPDATE travel_routes SET
         price=COALESCE($1,price),
         departure_time=COALESCE($2,departure_time),
         seats_total=COALESCE($3,seats_total),
         active=COALESCE($4,active),
         peak_price_multiplier=COALESCE($5,peak_price_multiplier),
         peak_hours_start=COALESCE($6,peak_hours_start),
         peak_hours_end=COALESCE($7,peak_hours_end),
         notes=COALESCE($8,notes)
       WHERE id=$9`,
      [price, departure_time, seats_total, active, peak_price_multiplier, peak_hours_start, peak_hours_end, notes, req.params.id]
    );
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── DELETE /api/admin/travel/routes/:id ─────────────────────────
router.delete("/admin/travel/routes/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`UPDATE travel_routes SET active=FALSE WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/travel/routes ─────────────────────────────────
router.get("/admin/travel/routes", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const r = await query(
      `SELECT tr.*, tc.name AS company_name
       FROM travel_routes tr JOIN travel_companies tc ON tc.id=tr.company_id
       ORDER BY tc.name, tr.from_city, tr.to_city`
    );
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/travel/settings ────────────────────────────
router.patch("/admin/travel/settings", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { travel_enabled, travel_payment_timeout_hrs, travel_admin_whatsapp } = req.body;
    if (travel_enabled !== undefined)
      await query(`INSERT INTO admin_settings(key,value) VALUES('travel_enabled',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [String(travel_enabled)]);
    if (travel_payment_timeout_hrs !== undefined)
      await query(`INSERT INTO admin_settings(key,value) VALUES('travel_payment_timeout_hrs',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [String(travel_payment_timeout_hrs)]);
    if (travel_admin_whatsapp !== undefined)
      await query(`INSERT INTO admin_settings(key,value) VALUES('travel_admin_whatsapp',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [travel_admin_whatsapp]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/travel/settings ──────────────────────────────
router.get("/admin/travel/settings", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT key, value FROM admin_settings WHERE key LIKE 'travel_%'`);
    const settings: Record<string, string> = {};
    for (const row of r.rows) settings[row.key] = row.value;
    return res.json(settings);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
// نظام التحقق من التذاكر بالباركود
// ═══════════════════════════════════════════════════════════════════

// ── GET /api/travel/verify/:token  ────────────────────────────────
// يُعاد JSON بالحالة — مفتوح بلا مصادقة (يُطلب من الماسح)
router.get("/travel/verify/:token", async (req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT tb.*,
              tc.payment_account_type, tc.payment_account_number
       FROM travel_bookings tb
       LEFT JOIN travel_companies tc ON tc.id = tb.company_id
       WHERE tb.verify_token = $1`,
      [req.params.token]
    );
    if (!r.rows.length) return res.status(404).json({ valid: false, error: "رمز التذكرة غير صالح" });
    const b = r.rows[0];

    // تقييم الصلاحية
    let verdict: "valid" | "invalid" | "warning" = "valid";
    const reasons: string[] = [];

    if (b.status === "cancelled") { verdict = "invalid"; reasons.push("التذكرة ملغاة"); }
    if (b.payment_status === "pending_payment") { verdict = "warning"; reasons.push("لم يُسدَّد الدفع بعد"); }
    if (b.payment_status === "rejected") { verdict = "invalid"; reasons.push("الدفع مرفوض"); }
    if (b.scan_count >= 1 && verdict !== "invalid") { verdict = "warning"; reasons.push(`تم فحص هذه التذكرة ${b.scan_count} مرة من قبل`); }

    return res.json({
      valid: verdict !== "invalid",
      verdict,
      reasons,
      ticket: {
        ticket_number:  b.ticket_number,
        passenger_name: b.passenger_name,
        passenger_phone:b.passenger_phone,
        from_city:      b.from_city,
        to_city:        b.to_city,
        travel_date:    b.travel_date,
        departure_time: b.departure_time,
        seat_number:    b.seat_number,
        company_name:   b.company_name,
        payment_status: b.payment_status,
        status:         b.status,
        scan_count:     b.scan_count,
        scanned_at:     b.scanned_at,
      },
    });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── POST /api/travel/verify/:token/scan  ──────────────────────────
// تسجيل الفحص (صعود الراكب) — يتطلب صلاحية أدمن
router.post("/travel/verify/:token/scan", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const admin = await getSessionUser(req);
    const r = await query(
      `UPDATE travel_bookings
       SET scanned_at  = NOW(),
           scanned_by  = $1,
           scan_count  = scan_count + 1
       WHERE verify_token = $2
       RETURNING id, ticket_number, passenger_name, scan_count`,
      [String(admin?.name || admin?.email || req.body.scanner_name || "scanner"), req.params.token]
    );
    if (!r.rows.length) return res.status(404).json({ error: "رمز التذكرة غير صالح" });
    return res.json({ ok: true, ...r.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/travel/scans  ──────────────────────────────────
// سجل كل عمليات الفحص اليوم
router.get("/admin/travel/scans", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const r = await query(
      `SELECT ticket_number, passenger_name, from_city, to_city,
              travel_date, departure_time, seat_number, company_name,
              scanned_at, scanned_by, scan_count, payment_status, status
       FROM travel_bookings
       WHERE scanned_at IS NOT NULL
       ORDER BY scanned_at DESC LIMIT 200`
    );
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// اتحاد الطلاب — Student Union Applications & Partnership
// ══════════════════════════════════════════════════════════════════

(async () => {
  try {
    // جدول طلبات العضوية الطلابية — الاستمارة الرسمية ذات السبعة أقسام
    await query(`
      CREATE TABLE IF NOT EXISTS student_union_applications (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
        -- القسم 1: البيانات الشخصية
        full_name           VARCHAR(200) NOT NULL,
        birth_date          VARCHAR(30),
        age                 VARCHAR(10),
        gender              VARCHAR(10),
        national_id         VARCHAR(50)  NOT NULL,
        phone               VARCHAR(40)  NOT NULL,
        email               VARCHAR(200),
        address             VARCHAR(300),
        neighborhood        VARCHAR(100),
        -- القسم 2: البيانات الأكاديمية
        institution         VARCHAR(200) NOT NULL,
        study_stage         VARCHAR(50),
        year                VARCHAR(60)  NOT NULL,
        major               VARCHAR(200) NOT NULL,
        -- القسم 3: الخبرات والمهارات
        skills              TEXT,
        previous_experience BOOLEAN,
        experience_details  TEXT,
        -- القسم 4: مجالات الاهتمام
        committees          TEXT,
        -- القسم 5: الدوافع والرؤية
        motivation          TEXT,
        contribution        TEXT,
        vision              TEXT,
        -- القسم 6: الالتزام والتفرغ
        can_attend_meetings BOOLEAN,
        weekly_hours        VARCHAR(20),
        other_commitments   TEXT,
        -- القسم 7: التعهد
        pledge_name         VARCHAR(200),
        pledge_date         VARCHAR(30),
        -- إدارة
        status              VARCHAR(20) NOT NULL DEFAULT 'pending',
        admin_note          TEXT,
        reviewed_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at         TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_sua_status ON student_union_applications(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sua_natid  ON student_union_applications(national_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_sua_user   ON student_union_applications(user_id)`);

    // ترقية الجدول القديم بإضافة الأعمدة الجديدة إن لم تكن موجودة
    const newCols = [
      ["birth_date","VARCHAR(30)"], ["age","VARCHAR(10)"], ["gender","VARCHAR(10)"],
      ["address","VARCHAR(300)"], ["study_stage","VARCHAR(50)"], ["skills","TEXT"],
      ["previous_experience","BOOLEAN"], ["experience_details","TEXT"], ["committees","TEXT"],
      ["motivation","TEXT"], ["contribution","TEXT"], ["vision","TEXT"],
      ["can_attend_meetings","BOOLEAN"], ["weekly_hours","VARCHAR(20)"],
      ["other_commitments","TEXT"], ["pledge_name","VARCHAR(200)"], ["pledge_date","VARCHAR(30)"],
    ];
    for (const [col, typ] of newCols) {
      await query(`ALTER TABLE student_union_applications ADD COLUMN IF NOT EXISTS ${col} ${typ}`).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[student-union] table init failed"); }

  try {
    // جدول طلبات انضمام الاتحادات لخدمات التطبيق (شراكة)
    await query(`
      CREATE TABLE IF NOT EXISTS union_partnership_applications (
        id                SERIAL PRIMARY KEY,
        union_name        VARCHAR(200) NOT NULL,
        union_type        VARCHAR(100),
        contact_person    VARCHAR(200) NOT NULL,
        phone             VARCHAR(40)  NOT NULL,
        email             VARCHAR(200),
        address           VARCHAR(300),
        description       TEXT,
        membership_count  INTEGER,
        requested_tier    VARCHAR(50),
        contract_accepted BOOLEAN NOT NULL DEFAULT FALSE,
        status            VARCHAR(20) NOT NULL DEFAULT 'pending',
        annual_fee        NUMERIC(10,2),
        admin_note        TEXT,
        reviewed_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_upa_status ON union_partnership_applications(status)`);
  } catch (e: any) { logger.warn({ err: e?.message }, "[union-partnership] table init failed"); }
})();

// POST /api/student-union/apply
router.post("/student-union/apply", writeLimiter, async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const b = req.body as Record<string, any>;

    if (!b.full_name?.trim())   return res.status(400).json({ error: "الاسم الرباعي مطلوب" });
    if (!b.national_id?.trim()) return res.status(400).json({ error: "الرقم الوطني مطلوب" });
    if (!b.phone?.trim())       return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    if (!b.institution?.trim()) return res.status(400).json({ error: "المؤسسة التعليمية مطلوبة" });
    if (!b.major?.trim())       return res.status(400).json({ error: "التخصص مطلوب" });
    if (!b.year?.trim())        return res.status(400).json({ error: "السنة/المستوى مطلوب" });
    if (!b.pledge_name?.trim()) return res.status(400).json({ error: "الاسم في التعهد مطلوب" });

    const dup = await query(
      `SELECT id FROM student_union_applications WHERE national_id=$1 AND status != 'rejected'`,
      [b.national_id.trim()]
    );
    if (dup.rows.length) return res.status(409).json({ error: "يوجد طلب مقدَّم مسبقاً بهذا الرقم الوطني" });

    const result = await query(
      `INSERT INTO student_union_applications
         (user_id, full_name, birth_date, age, gender, national_id, phone, email, address, neighborhood,
          institution, study_stage, year, major,
          skills, previous_experience, experience_details,
          committees,
          motivation, contribution, vision,
          can_attend_meetings, weekly_hours, other_commitments,
          pledge_name, pledge_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       RETURNING *`,
      [
        user?.id ?? null,
        b.full_name.trim(), b.birth_date?.trim()||null, b.age?.trim()||null, b.gender?.trim()||null,
        b.national_id.trim(), b.phone.trim(), b.email?.trim()||null, b.address?.trim()||null, b.neighborhood?.trim()||null,
        b.institution.trim(), b.study_stage?.trim()||null, b.year.trim(), b.major.trim(),
        Array.isArray(b.skills) ? JSON.stringify(b.skills) : (b.skills||null),
        typeof b.previous_experience === "boolean" ? b.previous_experience : null,
        b.experience_details?.trim()||null,
        Array.isArray(b.committees) ? JSON.stringify(b.committees) : (b.committees||null),
        b.motivation?.trim()||null, b.contribution?.trim()||null, b.vision?.trim()||null,
        typeof b.can_attend_meetings === "boolean" ? b.can_attend_meetings : null,
        b.weekly_hours?.trim()||null, b.other_commitments?.trim()||null,
        b.pledge_name.trim(), b.pledge_date?.trim()||null,
      ]
    );
    void sendPushToAdmins("🎓 طلب عضوية اتحاد طلاب جديد", `${b.full_name.trim()} — ${b.institution.trim()}`, { type: "student_union_application", id: result.rows[0].id });
    return res.status(201).json({ application: result.rows[0] });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[student-union/apply]");
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/student-union/applications
router.get("/student-union/applications", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const status = singleQueryValue(req.query.status);
    const params: unknown[] = [];
    let where = "";
    if (status && ["pending","approved","rejected"].includes(status)) {
      where = " WHERE status=$1"; params.push(status);
    }
    const result = await query(
      `SELECT * FROM student_union_applications${where} ORDER BY created_at DESC`, params
    );
    return res.json({ applications: result.rows, total: result.rowCount });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[student-union/applications]");
    return res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/student-union/applications/:id/status
router.patch("/student-union/applications/:id/status", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const admin = await getSessionUser(req);
    const { status, admin_note } = req.body as { status?: string; admin_note?: string };
    if (!["approved","rejected"].includes(status ?? "")) {
      return res.status(400).json({ error: "الحالة يجب أن تكون approved أو rejected" });
    }
    const result = await query(
      `UPDATE student_union_applications
       SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=NOW()
       WHERE id=$4 RETURNING *`,
      [status, admin_note?.trim()||null, admin?.id??null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json({ application: result.rows[0] });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[student-union/status]");
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/student-union/applications/:id/grant-manager — منح صلاحيات إدارة الاتحاد
router.post("/student-union/applications/:id/grant-manager", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });

    const appResult = await query(`SELECT * FROM student_union_applications WHERE id=$1`, [id]);
    if (!appResult.rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    const app = appResult.rows[0];

    if (app.status !== "approved") {
      return res.status(400).json({ error: "يجب قبول الطلب أولاً قبل منح الصلاحيات" });
    }

    await ensureUnionMgrTables();

    // اسم المستخدم من الرقم الوطني أو الهاتف
    const rawUser = (app.national_id || app.phone || `su${id}`).replace(/\D/g, "").slice(0, 30) || `su_${id}`;
    const username = rawUser;

    const existing = await query(`SELECT id, username FROM union_managers WHERE username=$1`, [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "يوجد حساب مدير بهذا المعرّف مسبقاً — ربما مُنح الطلب مسبقاً", username });
    }

    const tempPassword = `SU@${Math.random().toString(36).slice(2, 8).toUpperCase()}#${id}`;
    const hash = await bcrypt.hash(tempPassword, 10);

    const mgr = await query(
      `INSERT INTO union_managers (full_name, title, username, password_hash, phone, email)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [app.full_name, "عضو إتحاد الطلاب", username, hash, app.phone || null, app.email || null]
    );

    logger.info({ mgr_id: mgr.rows[0].id, app_id: id }, "[student-union] manager granted");
    return res.status(201).json({
      message: "تم منح صلاحيات إدارة الاتحاد بنجاح",
      manager_id: mgr.rows[0].id,
      username,
      temp_password: tempPassword,
      full_name: app.full_name,
    });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[student-union/grant-manager]");
    return res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/admin/student-union/managers/reset-password — تعديل كلمة مرور مدير إتحاد الطلاب
router.patch("/admin/student-union/managers/reset-password", async (req: Request, res: Response): Promise<any> => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { app_id, new_password } = req.body as { app_id?: number; new_password?: string };
    if (!app_id || !new_password?.trim()) return res.status(400).json({ error: "البيانات ناقصة" });
    if (new_password.length < 6) return res.status(400).json({ error: "كلمة المرور قصيرة جداً (6 أحرف على الأقل)" });

    const appResult = await query(`SELECT * FROM student_union_applications WHERE id=$1`, [app_id]);
    if (!appResult.rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    const app = appResult.rows[0];

    const rawUser = (app.national_id || app.phone || `su${app_id}`).replace(/\D/g, "").slice(0, 30) || `su_${app_id}`;
    const username = rawUser;

    const mgr = await query(`SELECT id FROM union_managers WHERE username=$1`, [username]);
    if (!mgr.rows.length) return res.status(404).json({ error: "لم يتم منح هذا المقدّم صلاحيات الإدارة بعد" });

    const hash = await bcrypt.hash(new_password, 10);
    await query(`UPDATE union_managers SET password_hash=$1 WHERE username=$2`, [hash, username]);

    logger.info({ app_id, username }, "[student-union] manager password reset");
    return res.json({ ok: true, username, message: "تم تحديث كلمة المرور بنجاح" });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[student-union/reset-password]");
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/union-partnership/apply — طلب انضمام اتحاد لخدمات التطبيق
router.post("/union-partnership/apply", writeLimiter, async (req: Request, res: Response) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.union_name?.trim())     return res.status(400).json({ error: "اسم الاتحاد مطلوب" });
    if (!b.contact_person?.trim()) return res.status(400).json({ error: "اسم المسؤول مطلوب" });
    if (!b.phone?.trim())          return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    if (!b.contract_accepted)      return res.status(400).json({ error: "يجب الموافقة على الشروط والأحكام" });

    const result = await query(
      `INSERT INTO union_partnership_applications
         (union_name, union_type, contact_person, phone, email, address,
          description, membership_count, requested_tier, contract_accepted)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        b.union_name.trim(), b.union_type?.trim()||null, b.contact_person.trim(),
        b.phone.trim(), b.email?.trim()||null, b.address?.trim()||null,
        b.description?.trim()||null, b.membership_count||null,
        b.requested_tier?.trim()||"basic", true,
      ]
    );
    void sendPushToAdmins("🤝 طلب شراكة اتحاد جديد", `${b.union_name.trim()} — ${b.contact_person.trim()}`, { type: "union_partnership_application", id: result.rows[0].id });
    return res.status(201).json({ application: result.rows[0] });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[union-partnership/apply]");
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/union-partnership — قائمة طلبات الشراكة (أدمن)
router.get("/admin/union-partnership", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const result = await query(`SELECT * FROM union_partnership_applications ORDER BY created_at DESC`);
    return res.json({ applications: result.rows });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/union-partnership/:id — تحديث حالة وتفاصيل الشراكة (أدمن)
router.patch("/admin/union-partnership/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: "معرّف غير صالح" });
    const admin = await getSessionUser(req);
    const { status, annual_fee, admin_note } = req.body as any;
    if (status && !["approved","rejected","pending"].includes(status)) {
      return res.status(400).json({ error: "حالة غير صالحة" });
    }
    const result = await query(
      `UPDATE union_partnership_applications
       SET status=COALESCE($1,status), annual_fee=COALESCE($2,annual_fee),
           admin_note=COALESCE($3,admin_note), reviewed_by=$4, reviewed_at=NOW()
       WHERE id=$5 RETURNING *`,
      [status||null, annual_fee||null, admin_note?.trim()||null, admin?.id??null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json({ application: result.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// الثقافة — Cultural Centers & Events
// ══════════════════════════════════════════════════════════════════

(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS cultural_centers (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(200) NOT NULL,
        type        VARCHAR(50)  NOT NULL DEFAULT 'other',
        address     TEXT         NOT NULL DEFAULT '',
        phone       VARCHAR(40)  NOT NULL DEFAULT '',
        description TEXT,
        hours       VARCHAR(100),
        is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
        sort_order  INTEGER      NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS cultural_events (
        id            SERIAL PRIMARY KEY,
        title         VARCHAR(200) NOT NULL,
        type          VARCHAR(50)  NOT NULL DEFAULT 'other',
        event_date    DATE         NOT NULL,
        location      TEXT         NOT NULL DEFAULT '',
        description   TEXT,
        contact_phone VARCHAR(40),
        is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    // بيانات أولية للحصاحيصا
    await query(`
      INSERT INTO cultural_centers (name, type, address, phone, description, hours, sort_order)
      VALUES
        ('مكتبة الحصاحيصا العامة',   'library',         'وسط المدينة، الحصاحيصا',    '+249912000001', 'مكتبة عامة تضم آلاف الكتب والمراجع العلمية والأدبية', 'السبت - الخميس 8ص - 2م', 1),
        ('مركز الثقافة والفنون',      'cultural_center', 'حي الوحدة، الحصاحيصا',      '+249912000002', 'مركز متعدد الأنشطة الثقافية والفنية والاجتماعية',     'السبت - الخميس 9ص - 5م', 2),
        ('قاعة التراث والموروث',      'heritage',        'قرب السوق الكبير، الحصاحيصا','+249912000003', 'معرض دائم للتراث السوداني وموروث الحصاحيصا',           'السبت - الخميس 9ص - 3م', 3)
      ON CONFLICT DO NOTHING
    `);
    await query(`
      INSERT INTO cultural_events (title, type, event_date, location, description, contact_phone)
      VALUES
        ('معرض الفنون التشكيلية السنوي', 'exhibition', (NOW() + INTERVAL '30 days')::date, 'مركز الثقافة والفنون', 'معرض سنوي للفنانين المحليين', '+249912000002'),
        ('ورشة الخط العربي',             'workshop',   (NOW() + INTERVAL '14 days')::date, 'مكتبة الحصاحيصا العامة', 'ورشة تعليمية في فن الخط العربي للمبتدئين والمتقدمين', '+249912000001')
      ON CONFLICT DO NOTHING
    `);
  } catch (e: any) { logger.warn({ err: e?.message }, "[cultural] table init failed"); }
})();

// GET /api/cultural-centers
router.get("/cultural-centers", async (req: Request, res: Response) => {
  try {
    const type = singleQueryValue(req.query.type);
    const search = singleQueryValue(req.query.search);
    let sql = `SELECT * FROM cultural_centers WHERE is_active=TRUE`;
    const params: unknown[] = [];
    if (type)   { sql += ` AND type=$${params.length+1}`;                                     params.push(type); }
    if (search) { sql += ` AND (name ILIKE $${params.length+1} OR address ILIKE $${params.length+1})`; params.push(`%${search}%`); }
    sql += ` ORDER BY sort_order, name`;
    const r = await query(sql, params);
    return res.json({ centers: r.rows });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[cultural-centers]");
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/cultural-events
router.get("/cultural-events", async (req: Request, res: Response) => {
  try {
    const type = singleQueryValue(req.query.type);
    let sql = `SELECT * FROM cultural_events WHERE is_active=TRUE AND event_date >= CURRENT_DATE - INTERVAL '7 days'`;
    const params: unknown[] = [];
    if (type) { sql += ` AND type=$${params.length+1}`; params.push(type); }
    sql += ` ORDER BY event_date ASC`;
    const r = await query(sql, params);
    return res.json({ events: r.rows });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[cultural-events]");
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admin/cultural-centers
router.post("/admin/cultural-centers", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name, type, address, phone, description, hours } = req.body as Record<string, string>;
    if (!name?.trim()) return res.status(400).json({ error: "الاسم مطلوب" });
    const r = await query(
      `INSERT INTO cultural_centers (name, type, address, phone, description, hours)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), type||"other", address||"", phone||"", description||null, hours||null]
    );
    return res.status(201).json({ center: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/cultural-centers/:id
router.patch("/admin/cultural-centers/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const id = parseInt(String(req.params.id), 10);
    const { name, type, address, phone, description, hours, is_active } = req.body as any;
    const r = await query(
      `UPDATE cultural_centers SET
         name=$1, type=$2, address=$3, phone=$4, description=$5, hours=$6,
         is_active=COALESCE($7, is_active)
       WHERE id=$8 RETURNING *`,
      [name, type||"other", address||"", phone||"", description||null, hours||null, is_active, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json({ center: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/cultural-centers/:id
router.delete("/admin/cultural-centers/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`UPDATE cultural_centers SET is_active=FALSE WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/cultural-events
router.post("/admin/cultural-events", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { title, type, event_date, location, description, contact_phone } = req.body as Record<string, string>;
    if (!title?.trim() || !event_date) return res.status(400).json({ error: "العنوان والتاريخ مطلوبان" });
    const r = await query(
      `INSERT INTO cultural_events (title, type, event_date, location, description, contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title.trim(), type||"other", event_date, location||"", description||null, contact_phone||null]
    );
    return res.status(201).json({ event: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/cultural-events/:id
router.patch("/admin/cultural-events/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const id = parseInt(String(req.params.id), 10);
    const { title, type, event_date, location, description, contact_phone, is_active } = req.body as any;
    const r = await query(
      `UPDATE cultural_events SET
         title=$1, type=$2, event_date=$3, location=$4,
         description=$5, contact_phone=$6, is_active=COALESCE($7, is_active)
       WHERE id=$8 RETURNING *`,
      [title, type||"other", event_date, location||"", description||null, contact_phone||null, is_active, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    return res.json({ event: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/cultural-events/:id
router.delete("/admin/cultural-events/:id", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`UPDATE cultural_events SET is_active=FALSE WHERE id=$1`, [req.params.id]);
    return res.json({ ok: true });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// رسائل التواصل — Contact Messages
// ══════════════════════════════════════════════════════════════════
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id               SERIAL PRIMARY KEY,
        sender_name      VARCHAR(200) NOT NULL,
        phone            VARCHAR(40)  NOT NULL,
        whatsapp         VARCHAR(40),
        email            VARCHAR(200),
        locality         VARCHAR(200),
        category         VARCHAR(100),
        message          TEXT         NOT NULL,
        best_contact_time VARCHAR(100),
        source           VARCHAR(50),
        is_read          BOOLEAN      NOT NULL DEFAULT FALSE,
        admin_note       TEXT,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_cm_source ON contact_messages(source)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_cm_read   ON contact_messages(is_read)`);
  } catch (e: any) { logger.warn({ err: e?.message }, "[contact-messages] table init failed"); }
})();

// POST /api/contact-messages
router.post("/contact-messages", writeLimiter, async (req: Request, res: Response) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.sender_name?.trim()) return res.status(400).json({ error: "الاسم مطلوب" });
    if (!b.phone?.trim())       return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    if (!b.message?.trim())     return res.status(400).json({ error: "الرسالة مطلوبة" });

    const result = await query(
      `INSERT INTO contact_messages
         (sender_name, phone, whatsapp, email, locality, category, message, best_contact_time, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        b.sender_name.trim(), b.phone.trim(), b.whatsapp?.trim()||null,
        b.email?.trim()||null, b.locality?.trim()||null,
        b.category?.trim()||"استفسار عام", b.message.trim(),
        b.best_contact_time?.trim()||null, b.source?.trim()||"general",
      ]
    );
    return res.status(201).json({ message: result.rows[0] });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[contact-messages/post]");
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/contact-messages
router.get("/admin/contact-messages", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { source, unread } = req.query as { source?: string; unread?: string };
    const params: unknown[] = [];
    const wheres: string[] = [];
    if (source) { wheres.push(`source=$${params.length+1}`); params.push(source); }
    if (unread === "1") { wheres.push(`is_read=FALSE`); }
    const where = wheres.length ? ` WHERE ${wheres.join(" AND ")}` : "";
    const result = await query(
      `SELECT * FROM contact_messages${where} ORDER BY created_at DESC`, params
    );
    return res.json({ messages: result.rows, total: result.rowCount });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/contact-messages/:id/read
router.patch("/admin/contact-messages/:id/read", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { admin_note } = req.body as { admin_note?: string };
    await query(
      `UPDATE contact_messages SET is_read=TRUE, admin_note=COALESCE($1,admin_note) WHERE id=$2`,
      [admin_note?.trim()||null, req.params.id]
    );
    return res.json({ ok: true });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// إدارة أقسام التطبيق — Section Configurations (إخفاء/إظهار + العقود)
// ══════════════════════════════════════════════════════════════════
// (initialization moved into initHasahisawiDb for reliable DB sequencing)

// GET /api/app/section-configs — public: returns visibility map
router.get("/app/section-configs", async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT section_key, is_visible, contract_status FROM section_configurations ORDER BY sort_order`
    );
    const map: Record<string, { visible: boolean; contract_status: string }> = {};
    for (const r of result.rows) {
      map[r.section_key] = { visible: r.is_visible, contract_status: r.contract_status };
    }
    return res.json(map);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/section-configs — admin: full details
router.get("/admin/section-configs", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const result = await query(`SELECT * FROM section_configurations ORDER BY sort_order`);
    return res.json({ sections: result.rows });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/section-configs/:key — admin: update a section
router.patch("/admin/section-configs/:key", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const key = req.params.key;
    const admin = await getSessionUser(req);
    const {
      is_visible, contract_status, contract_signed_at, contract_expiry_at,
      contract_notes, authorized_entity, authorized_contact, section_description,
    } = req.body as Record<string, any>;

    if (contract_status && !["none","pending","signed","expired"].includes(contract_status)) {
      return res.status(400).json({ error: "حالة عقد غير صالحة" });
    }

    const result = await query(
      `UPDATE section_configurations SET
         is_visible        = COALESCE($1, is_visible),
         contract_status   = COALESCE($2, contract_status),
         contract_signed_at= COALESCE($3::TIMESTAMPTZ, contract_signed_at),
         contract_expiry_at= COALESCE($4::TIMESTAMPTZ, contract_expiry_at),
         contract_notes    = COALESCE($5, contract_notes),
         authorized_entity = COALESCE($6, authorized_entity),
         authorized_contact= COALESCE($7, authorized_contact),
         section_description=COALESCE($8, section_description),
         updated_at        = NOW(),
         updated_by        = $9
       WHERE section_key=$10 RETURNING *`,
      [
        is_visible ?? null, contract_status||null,
        contract_signed_at||null, contract_expiry_at||null,
        contract_notes?.trim()||null, authorized_entity?.trim()||null,
        authorized_contact?.trim()||null, section_description?.trim()||null,
        admin?.id??null, key,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: "القسم غير موجود" });
    return res.json({ section: result.rows[0] });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[section-configs/patch]");
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════════════════
// النظام الطبي المتكامل — Integrated Medical System
// مسار: الحجز ← تذكير ← كشف ← مختبر ← نتائج ← روشتة ← صيدلية
// ══════════════════════════════════════════════════════════════════
(async () => {
  try {
    const alts = [
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_24h BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_2h  BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_name     VARCHAR(200)`,
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS user_phone    VARCHAR(40)`,
      `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS facility_name VARCHAR(200)`,
    ];
    for (const sql of alts) { await query(sql).catch(() => {}); }

    await query(`
      CREATE TABLE IF NOT EXISTS medical_staff_profiles (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        staff_type     VARCHAR(30) NOT NULL,
        facility_id    VARCHAR(100),
        facility_name  VARCHAR(200),
        specialty      VARCHAR(100),
        license_number VARCHAR(100),
        is_active      BOOLEAN NOT NULL DEFAULT TRUE,
        workspace_mode BOOLEAN NOT NULL DEFAULT FALSE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS patient_medical_records (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL UNIQUE,
        record_number     VARCHAR(80) UNIQUE NOT NULL,
        full_name         VARCHAR(200),
        birth_date        DATE,
        gender            VARCHAR(10),
        blood_type        VARCHAR(5),
        allergies         TEXT,
        chronic_diseases  TEXT,
        emergency_contact VARCHAR(200),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_pmr_record ON patient_medical_records(record_number)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_pmr_user   ON patient_medical_records(user_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS lab_orders (
        id                    SERIAL PRIMARY KEY,
        appointment_id        INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
        patient_user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
        patient_record_number VARCHAR(80),
        patient_name          VARCHAR(200),
        doctor_user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
        doctor_name           VARCHAR(200),
        lab_user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
        facility_name         VARCHAR(200),
        tests                 JSONB NOT NULL DEFAULT '[]',
        custom_notes          TEXT,
        priority              VARCHAR(20) NOT NULL DEFAULT 'normal',
        status                VARCHAR(20) NOT NULL DEFAULT 'pending',
        expected_at           TIMESTAMPTZ,
        notified_patient      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_lo_patient ON lab_orders(patient_user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lo_doctor  ON lab_orders(doctor_user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lo_lab     ON lab_orders(lab_user_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS lab_results (
        id               SERIAL PRIMARY KEY,
        order_id         INTEGER REFERENCES lab_orders(id) ON DELETE CASCADE,
        patient_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        doctor_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        lab_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        patient_name     VARCHAR(200),
        results_data     JSONB NOT NULL DEFAULT '[]',
        summary_notes    TEXT,
        ready_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        notified_patient BOOLEAN NOT NULL DEFAULT FALSE,
        notified_doctor  BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_lr_patient ON lab_results(patient_user_id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id                    SERIAL PRIMARY KEY,
        appointment_id        INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
        patient_user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
        patient_record_number VARCHAR(80),
        patient_name          VARCHAR(200),
        doctor_user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
        doctor_name           VARCHAR(200),
        facility_name         VARCHAR(200),
        diagnosis             TEXT,
        medications           JSONB NOT NULL DEFAULT '[]',
        follow_up_date        VARCHAR(50),
        follow_up_notes       TEXT,
        general_notes         TEXT,
        status                VARCHAR(20) NOT NULL DEFAULT 'active',
        notified_patient      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescriptions(patient_user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_rx_doctor  ON prescriptions(doctor_user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_rx_record  ON prescriptions(patient_record_number)`);

    await query(`
      CREATE TABLE IF NOT EXISTS pharmacy_orders (
        id                       SERIAL PRIMARY KEY,
        prescription_id          INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
        patient_user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
        patient_name             VARCHAR(200),
        pharmacy_user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
        delivery_type            VARCHAR(20) NOT NULL DEFAULT 'pickup',
        delivery_address         TEXT,
        status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
        dispensed_at             TIMESTAMPTZ,
        dispensed_by             INTEGER REFERENCES users(id),
        usage_instructions_sent  BOOLEAN NOT NULL DEFAULT FALSE,
        notes                    TEXT,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_po_patient  ON pharmacy_orders(patient_user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_po_pharmacy ON pharmacy_orders(pharmacy_user_id)`);
  } catch (e: any) { logger.warn({ err: e?.message }, "[medical-system] init failed"); }
})();

// ── مجدوِل تذكيرات المواعيد (كل 10 دقائق) ─────────────────────────
(function startAppointmentReminderScheduler() {
  const check = async () => {
    try {
      const r24 = await query(`
        SELECT a.*, u.id AS uid FROM appointments a
        JOIN users u ON u.id = a.user_id
        WHERE a.status IN ('pending','confirmed')
          AND (a.reminder_sent_24h IS NULL OR a.reminder_sent_24h = FALSE)
          AND (a.appointment_date::text || ' ' || COALESCE(a.appointment_time,'08:00'))::timestamptz
              BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'
      `).catch(() => ({ rows: [] as any[] }));

      for (const appt of r24.rows) {
        await sendPushToUser(
          appt.uid, "⏰ تذكير: موعدك غداً",
          `لديك موعد في ${appt.facility_name || "المنشأة الصحية"} غداً الساعة ${appt.appointment_time || ""}`,
          { type: "appointment_reminder_24h", appointment_id: appt.id }
        );
        await query(`UPDATE appointments SET reminder_sent_24h=TRUE WHERE id=$1`, [appt.id]).catch(() => {});
      }

      const r2 = await query(`
        SELECT a.*, u.id AS uid FROM appointments a
        JOIN users u ON u.id = a.user_id
        WHERE a.status IN ('pending','confirmed')
          AND (a.reminder_sent_2h IS NULL OR a.reminder_sent_2h = FALSE)
          AND (a.appointment_date::text || ' ' || COALESCE(a.appointment_time,'08:00'))::timestamptz
              BETWEEN NOW() + INTERVAL '1 hour 45 minutes' AND NOW() + INTERVAL '2 hours 15 minutes'
      `).catch(() => ({ rows: [] as any[] }));

      for (const appt of r2.rows) {
        await sendPushToUser(
          appt.uid, "🔔 موعدك بعد ساعتين",
          `تذكير: موعدك في ${appt.facility_name || "المنشأة الصحية"} بعد قليل. كن مستعداً!`,
          { type: "appointment_reminder_2h", appointment_id: appt.id }
        );
        await query(`UPDATE appointments SET reminder_sent_2h=TRUE WHERE id=$1`, [appt.id]).catch(() => {});
      }
    } catch {}
  };
  setTimeout(check, 90_000);
  setInterval(check, 10 * 60_000);
})();

// ─── Medical Staff ────────────────────────────────────────────────
router.post("/medical/staff/register", writeLimiter, async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const b = req.body as any;
    const TYPES = ["doctor","lab_technician","pharmacist","nurse","receptionist"];
    if (!TYPES.includes(b.staff_type)) return res.status(400).json({ error: "نوع الموظف غير صالح" });
    const r = await query(
      `INSERT INTO medical_staff_profiles (user_id,staff_type,facility_id,facility_name,specialty,license_number)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE SET staff_type=$2,facility_id=$3,facility_name=$4,specialty=$5,license_number=$6
       RETURNING *`,
      [user.id, b.staff_type, b.facility_id||null, b.facility_name?.trim()||null, b.specialty?.trim()||null, b.license_number?.trim()||null]
    );
    return res.json({ profile: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/staff/profile", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1`, [user.id]);
    return res.json({ profile: r.rows[0] || null });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/medical/staff/mode", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const { workspace_mode } = req.body as { workspace_mode: boolean };
    const r = await query(
      `UPDATE medical_staff_profiles SET workspace_mode=$1 WHERE user_id=$2 RETURNING *`,
      [workspace_mode, user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "لا يوجد ملف موظف" });
    return res.json({ profile: r.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── Patient Records ──────────────────────────────────────────────
router.get("/medical/my-record", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM patient_medical_records WHERE user_id=$1`, [user.id]);
    return res.json({ record: r.rows[0] || null });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.post("/medical/my-record", writeLimiter, async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const b = req.body as any;
    const recNum = `PMR-${user.id}-${Date.now().toString(36).toUpperCase()}`;
    const existing = await query(`SELECT record_number FROM patient_medical_records WHERE user_id=$1`, [user.id]);
    const rn = existing.rows[0]?.record_number || recNum;
    const r = await query(
      `INSERT INTO patient_medical_records (user_id,record_number,full_name,birth_date,gender,blood_type,allergies,chronic_diseases,emergency_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id) DO UPDATE SET full_name=$3,birth_date=$4,gender=$5,blood_type=$6,allergies=$7,chronic_diseases=$8,emergency_contact=$9,updated_at=NOW()
       RETURNING *`,
      [user.id, rn, b.full_name?.trim()||null, b.birth_date||null, b.gender||null, b.blood_type||null, b.allergies?.trim()||null, b.chronic_diseases?.trim()||null, b.emergency_contact?.trim()||null]
    );
    return res.json({ record: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/patient-record/:recordNumber", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND is_active=TRUE`, [user.id]);
    if (!staffR.rows.length) return res.status(403).json({ error: "هذه الخدمة للموظفين الطبيين فقط" });
    const r = await query(`SELECT * FROM patient_medical_records WHERE record_number=$1`, [req.params.recordNumber]);
    if (!r.rows.length) return res.status(404).json({ error: "رقم السجل غير موجود" });
    const rec = r.rows[0];
    const [labs, rxs] = await Promise.all([
      query(`SELECT * FROM lab_results WHERE patient_user_id=$1 ORDER BY created_at DESC LIMIT 5`, [rec.user_id]).catch(() => ({ rows: [] })),
      query(`SELECT * FROM prescriptions WHERE patient_user_id=$1 ORDER BY created_at DESC LIMIT 5`, [rec.user_id]).catch(() => ({ rows: [] })),
    ]);
    return res.json({ record: rec, recent_labs: labs.rows, recent_prescriptions: rxs.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── Lab Orders ───────────────────────────────────────────────────
router.post("/medical/lab-orders", writeLimiter, async (req: Request, res: Response) => {
  const doctor = await getSessionUser(req);
  if (!doctor) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND staff_type='doctor' AND is_active=TRUE`, [doctor.id]);
    if (!staffR.rows.length) return res.status(403).json({ error: "هذه الخدمة للأطباء فقط" });
    const staff = staffR.rows[0];
    const b = req.body as any;
    if (!Array.isArray(b.tests) || !b.tests.length) return res.status(400).json({ error: "لم يتم تحديد أي فحص" });

    let labUserId: number | null = null;
    if (staff.facility_id) {
      const labR = await query(`SELECT user_id FROM medical_staff_profiles WHERE facility_id=$1 AND staff_type='lab_technician' AND is_active=TRUE LIMIT 1`, [staff.facility_id]);
      labUserId = labR.rows[0]?.user_id || null;
    }

    const r = await query(
      `INSERT INTO lab_orders (appointment_id,patient_user_id,patient_record_number,patient_name,doctor_user_id,doctor_name,lab_user_id,facility_name,tests,custom_notes,priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [b.appointment_id||null, b.patient_user_id||null, b.patient_record_number||null, b.patient_name?.trim()||null,
       doctor.id, doctor.name||null, labUserId, staff.facility_name||null,
       JSON.stringify(b.tests), b.custom_notes?.trim()||null, b.priority||"normal"]
    );
    if (labUserId) {
      await sendPushToUser(labUserId, "🔬 طلب فحوصات جديد",
        `طلب الدكتور ${doctor.name || "الطبيب"} فحوصات للمريض ${b.patient_name || ""}`,
        { type: "lab_order", order_id: r.rows[0].id });
    }
    return res.status(201).json({ order: r.rows[0] });
  } catch (e: any) { logger.error({ err: e?.message }, "[lab-orders]"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/lab-orders", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND is_active=TRUE`, [user.id]);
    if (!staffR.rows.length) return res.status(403).json({ error: "غير مصرح" });
    const staff = staffR.rows[0];
    let result;
    if (staff.staff_type === "doctor") {
      result = await query(`SELECT * FROM lab_orders WHERE doctor_user_id=$1 ORDER BY created_at DESC LIMIT 50`, [user.id]);
    } else if (staff.staff_type === "lab_technician") {
      result = await query(`SELECT * FROM lab_orders WHERE (lab_user_id=$1 OR facility_name=$2) AND status != 'completed' ORDER BY created_at DESC LIMIT 50`, [user.id, staff.facility_name||""]);
    } else {
      return res.status(403).json({ error: "غير مصرح" });
    }
    return res.json({ orders: result.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/medical/lab-orders/:id/status", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const { status, expected_at } = req.body as any;
    const id = parseInt(String(req.params.id), 10);
    const r = await query(
      `UPDATE lab_orders SET status=$1, expected_at=COALESCE($2::TIMESTAMPTZ,expected_at), lab_user_id=COALESCE(lab_user_id,$3) WHERE id=$4 RETURNING *`,
      [status, expected_at||null, user.id, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json({ order: r.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── Lab Results ──────────────────────────────────────────────────
router.post("/medical/lab-results", writeLimiter, async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND staff_type='lab_technician'`, [user.id]);
    if (!staffR.rows.length) return res.status(403).json({ error: "هذه الخدمة لموظفي المختبر فقط" });
    const b = req.body as any;
    if (!b.order_id) return res.status(400).json({ error: "رقم الطلب مطلوب" });

    const orderR = await query(`SELECT * FROM lab_orders WHERE id=$1`, [b.order_id]);
    if (!orderR.rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    const order = orderR.rows[0];

    const r = await query(
      `INSERT INTO lab_results (order_id,patient_user_id,doctor_user_id,lab_user_id,patient_name,results_data,summary_notes,ready_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,
      [b.order_id, order.patient_user_id, order.doctor_user_id, user.id, order.patient_name, JSON.stringify(b.results||[]), b.summary_notes?.trim()||null]
    );
    await query(`UPDATE lab_orders SET status='completed' WHERE id=$1`, [b.order_id]);

    if (order.patient_user_id) {
      await sendPushToUser(order.patient_user_id, "✅ نتائج فحوصاتك جاهزة",
        "تم الانتهاء من الفحوصات. يمكنك الاطلاع على التقرير الآن.",
        { type: "lab_result", result_id: r.rows[0].id });
      await query(`UPDATE lab_results SET notified_patient=TRUE WHERE id=$1`, [r.rows[0].id]);
    }
    if (order.doctor_user_id) {
      await sendPushToUser(order.doctor_user_id, "🔬 نتائج مريضك جاهزة",
        `نتائج فحوصات ${order.patient_name || "المريض"} جاهزة للمراجعة.`,
        { type: "lab_result_doctor", result_id: r.rows[0].id });
      await query(`UPDATE lab_results SET notified_doctor=TRUE WHERE id=$1`, [r.rows[0].id]);
    }
    return res.status(201).json({ result: r.rows[0] });
  } catch (e: any) { logger.error({ err: e?.message }, "[lab-results]"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/lab-results/mine", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(
      `SELECT lr.*, lo.tests FROM lab_results lr LEFT JOIN lab_orders lo ON lo.id=lr.order_id WHERE lr.patient_user_id=$1 ORDER BY lr.created_at DESC`,
      [user.id]
    );
    return res.json({ results: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/lab-results/order/:orderId", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(
      `SELECT lr.*, lo.tests FROM lab_results lr LEFT JOIN lab_orders lo ON lo.id=lr.order_id WHERE lr.order_id=$1 AND (lr.patient_user_id=$2 OR lr.doctor_user_id=$2 OR lr.lab_user_id=$2)`,
      [req.params.orderId, user.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "لا توجد نتائج" });
    return res.json({ result: r.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── Prescriptions ────────────────────────────────────────────────
router.post("/medical/prescriptions", writeLimiter, async (req: Request, res: Response) => {
  const doctor = await getSessionUser(req);
  if (!doctor) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND staff_type='doctor'`, [doctor.id]);
    if (!staffR.rows.length) return res.status(403).json({ error: "هذه الخدمة للأطباء فقط" });
    const staff = staffR.rows[0];
    const b = req.body as any;
    if (!Array.isArray(b.medications) || !b.medications.length) return res.status(400).json({ error: "لم يتم إدخال أي دواء" });

    const r = await query(
      `INSERT INTO prescriptions (appointment_id,patient_user_id,patient_record_number,patient_name,doctor_user_id,doctor_name,facility_name,diagnosis,medications,follow_up_date,follow_up_notes,general_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [b.appointment_id||null, b.patient_user_id||null, b.patient_record_number?.trim()||null, b.patient_name?.trim()||null,
       doctor.id, doctor.name||null, staff.facility_name||null, b.diagnosis?.trim()||null,
       JSON.stringify(b.medications), b.follow_up_date?.trim()||null, b.follow_up_notes?.trim()||null, b.general_notes?.trim()||null]
    );

    if (b.patient_user_id) {
      await sendPushToUser(b.patient_user_id, "💊 وصفتك الطبية جاهزة",
        `أرسل ${doctor.name || "الطبيب"} وصفتك. يمكنك تنزيلها ومشاركتها مع الصيدلية.`,
        { type: "prescription", prescription_id: r.rows[0].id });
    }
    return res.status(201).json({ prescription: r.rows[0] });
  } catch (e: any) { logger.error({ err: e?.message }, "[prescriptions]"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/prescriptions/mine", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM prescriptions WHERE patient_user_id=$1 ORDER BY created_at DESC`, [user.id]);
    return res.json({ prescriptions: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/prescriptions/doctor", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const { record_number } = req.query as { record_number?: string };
    const params: unknown[] = [user.id];
    let sql = `SELECT * FROM prescriptions WHERE doctor_user_id=$1`;
    if (record_number) { sql += ` AND patient_record_number=$2`; params.push(record_number); }
    sql += ` ORDER BY created_at DESC LIMIT 50`;
    const r = await query(sql, params);
    return res.json({ prescriptions: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/prescriptions/:id", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM prescriptions WHERE id=$1 AND (patient_user_id=$2 OR doctor_user_id=$2)`, [req.params.id, user.id]);
    if (!r.rows.length) return res.status(404).json({ error: "الوصفة غير موجودة" });
    return res.json({ prescription: r.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/medical/queue — طابور المرضى اليوم (للطاقم الطبي)
router.get("/medical/queue", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND is_active=TRUE`, [user.id]);
    if (!staffR.rows.length) return res.status(403).json({ error: "غير مصرح" });
    const today = new Date().toISOString().slice(0, 10);
    const r = await query(
      `SELECT a.*, u.name AS user_display_name, pmr.record_number, pmr.blood_type, pmr.allergies
       FROM appointments a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN patient_medical_records pmr ON pmr.user_id = a.user_id
       WHERE a.appointment_date = $1 AND a.status IN ('pending','confirmed')
       ORDER BY a.appointment_time ASC`,
      [today]
    );
    return res.json({ queue: r.rows, date: today });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ─── Pharmacy Orders ──────────────────────────────────────────────
router.post("/medical/pharmacy-orders", writeLimiter, async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const b = req.body as any;
    if (!b.prescription_id) return res.status(400).json({ error: "رقم الوصفة مطلوب" });
    const rxR = await query(`SELECT * FROM prescriptions WHERE id=$1 AND patient_user_id=$2`, [b.prescription_id, user.id]);
    if (!rxR.rows.length) return res.status(404).json({ error: "الوصفة غير موجودة" });
    const rx = rxR.rows[0];

    let pharmacyUserId: number | null = null;
    if (rx.facility_name) {
      const pharR = await query(`SELECT user_id FROM medical_staff_profiles WHERE facility_name=$1 AND staff_type='pharmacist' AND is_active=TRUE LIMIT 1`, [rx.facility_name]);
      pharmacyUserId = pharR.rows[0]?.user_id || null;
    }

    const r = await query(
      `INSERT INTO pharmacy_orders (prescription_id,patient_user_id,patient_name,pharmacy_user_id,delivery_type,delivery_address,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.prescription_id, user.id, b.patient_name?.trim()||null, pharmacyUserId, b.delivery_type||"pickup", b.delivery_address?.trim()||null, b.notes?.trim()||null]
    );
    if (pharmacyUserId) {
      await sendPushToUser(pharmacyUserId, "💊 طلب صرف دواء جديد",
        `طلب ${user.name || "مريض"} صرف وصفة (${b.delivery_type === "delivery" ? "توصيل" : "استلام"})`,
        { type: "pharmacy_order", order_id: r.rows[0].id });
    }
    return res.status(201).json({ order: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/pharmacy-orders", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND staff_type='pharmacist'`, [user.id]);
    if (!staffR.rows.length) return res.status(403).json({ error: "هذه الخدمة للصيادلة فقط" });
    const r = await query(
      `SELECT po.*, rx.medications, rx.diagnosis, rx.doctor_name, rx.patient_name AS rx_patient_name
       FROM pharmacy_orders po JOIN prescriptions rx ON rx.id=po.prescription_id
       WHERE po.pharmacy_user_id=$1 AND po.status != 'delivered' ORDER BY po.created_at DESC`,
      [user.id]
    );
    return res.json({ orders: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/medical/pharmacy-orders/:id/dispense", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const id = parseInt(String(req.params.id), 10);
    const r = await query(
      `UPDATE pharmacy_orders SET status='delivered',dispensed_at=NOW(),dispensed_by=$1,usage_instructions_sent=TRUE WHERE id=$2 RETURNING *`,
      [user.id, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    const order = r.rows[0];
    const rxR = await query(`SELECT * FROM prescriptions WHERE id=$1`, [order.prescription_id]);
    const rx = rxR.rows[0];
    if (order.patient_user_id && rx) {
      const meds: any[] = Array.isArray(rx.medications) ? rx.medications : JSON.parse(rx.medications || "[]");
      const summary = meds.slice(0, 3).map((m: any) =>
        `• ${m.name}: ${m.dosage || ""} ${m.frequency || ""}`
      ).join("\n");
      await sendPushToUser(
        order.patient_user_id, "✅ تم تحضير دوائك",
        `جاهز للاستلام.\n${summary}\nتعليمات الاستخدام والحفظ متاحة في التطبيق.`,
        { type: "pharmacy_dispensed", order_id: id, prescription_id: order.prescription_id }
      );
    }
    return res.json({ order: r.rows[0] });
  } catch (e: any) { logger.error({ err: e?.message }, "[pharmacy/dispense]"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/my-pharmacy-orders", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(
      `SELECT po.*, rx.medications, rx.doctor_name, rx.diagnosis FROM pharmacy_orders po JOIN prescriptions rx ON rx.id=po.prescription_id WHERE po.patient_user_id=$1 ORDER BY po.created_at DESC`,
      [user.id]
    );
    return res.json({ orders: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// الإجازات المرضية — Sick Leaves (students / military / employees)
// ══════════════════════════════════════════════════════════════════

async function ensureSickLeaveTables() {
  await query(`CREATE TABLE IF NOT EXISTS sick_leaves (
    id                SERIAL PRIMARY KEY,
    patient_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    doctor_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    doctor_name       VARCHAR(200),
    facility_name     VARCHAR(200),
    leave_type        VARCHAR(30) NOT NULL DEFAULT 'employee',
    institution_name  VARCHAR(300),
    leave_days        INTEGER NOT NULL DEFAULT 1,
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    diagnosis         TEXT,
    barcode_token     VARCHAR(80) UNIQUE NOT NULL,
    org_notified      BOOLEAN DEFAULT FALSE,
    is_verified       BOOLEAN DEFAULT TRUE,
    admin_notes       TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sick_leaves_patient   ON sick_leaves(patient_user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sick_leaves_doctor    ON sick_leaves(doctor_user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sick_leaves_barcode   ON sick_leaves(barcode_token)`);
}

ensureSickLeaveTables().catch(() => {});

function genSickLeaveToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let t = "SL-";
  for (let i = 0; i < 12; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

router.post("/medical/sick-leaves", writeLimiter, async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(
      `SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND staff_type IN ('doctor','admin') AND is_active=TRUE`,
      [user.id]
    );
    if (!staffR.rows.length) return res.status(403).json({ error: "هذه الخدمة للأطباء فقط" });
    const staff = staffR.rows[0];
    const b = req.body as any;
    if (!b.start_date || !b.end_date) return res.status(400).json({ error: "تواريخ الإجازة مطلوبة" });
    if (!["student","military","employee"].includes(b.leave_type)) return res.status(400).json({ error: "نوع الإجازة غير صالح" });
    const start = new Date(b.start_date);
    const end   = new Date(b.end_date);
    if (end < start) return res.status(400).json({ error: "تاريخ الانتهاء قبل تاريخ البداية" });
    const leaveDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const token = genSickLeaveToken();
    const r = await query(
      `INSERT INTO sick_leaves
         (patient_user_id, doctor_user_id, doctor_name, facility_name, leave_type,
          institution_name, leave_days, start_date, end_date, diagnosis, barcode_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        b.patient_user_id || null,
        user.id,
        (user.name as string) || staff.doctor_name || "طبيب",
        staff.facility_name || b.facility_name || null,
        b.leave_type,
        b.institution_name?.trim() || null,
        leaveDays,
        b.start_date,
        b.end_date,
        b.diagnosis?.trim() || null,
        token,
      ]
    );
    const sl = r.rows[0];
    if (b.patient_user_id) {
      await sendPushToUser(Number(b.patient_user_id), "📋 إجازتك المرضية جاهزة",
        `إجازة ${leaveDays} يوم من ${b.start_date} حتى ${b.end_date}. يمكنك تحميلها من التطبيق.`,
        { type: "sick_leave", id: sl.id });
      await query(`INSERT INTO notifications(user_id,type,title,body,data) VALUES($1,'sick_leave',$2,$3,$4)`,
        [b.patient_user_id, "📋 إجازة مرضية", `إجازة ${leaveDays} يوم جاهزة للتحميل`, JSON.stringify({ id: sl.id })]);
    }
    return res.status(201).json({ sick_leave: sl });
  } catch (e: any) { logger.error({ err: e?.message }, "[sick-leaves/post]"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/sick-leaves/mine", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM sick_leaves WHERE patient_user_id=$1 ORDER BY created_at DESC LIMIT 30`, [user.id]);
    return res.json({ sick_leaves: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/sick-leaves/doctor", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT 1 FROM medical_staff_profiles WHERE user_id=$1 AND staff_type IN ('doctor','admin') AND is_active=TRUE`, [user.id]);
    if (!staffR.rows.length) return res.status(403).json({ error: "للأطباء فقط" });
    const r = await query(
      `SELECT sl.*, u.name AS patient_display_name FROM sick_leaves sl LEFT JOIN users u ON u.id=sl.patient_user_id WHERE sl.doctor_user_id=$1 ORDER BY sl.created_at DESC LIMIT 100`,
      [user.id]
    );
    return res.json({ sick_leaves: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/sick-leaves/verify/:token", async (req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT sl.*, u.name AS patient_name_reg FROM sick_leaves sl LEFT JOIN users u ON u.id=sl.patient_user_id WHERE sl.barcode_token=$1`,
      [req.params.token]
    );
    if (!r.rows.length) return res.status(404).json({ valid: false, error: "الإجازة غير موجودة" });
    const sl = r.rows[0];
    const now = new Date();
    const endDate = new Date(sl.end_date);
    endDate.setHours(23, 59, 59);
    const isExpired = now > endDate;
    return res.json({ valid: !isExpired, expired: isExpired, sick_leave: sl });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/sick-leaves", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const type = req.query.type as string;
    const where = type ? `WHERE sl.leave_type=$1` : "";
    const params = type ? [type] : [];
    const r = await query(
      `SELECT sl.*, u.name AS patient_name_reg FROM sick_leaves sl LEFT JOIN users u ON u.id=sl.patient_user_id ${where} ORDER BY sl.created_at DESC LIMIT 200`,
      params
    );
    return res.json({ sick_leaves: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// التنويم والمرافق — Hospital Admissions & Companions
// ══════════════════════════════════════════════════════════════════

async function ensureAdmissionTables() {
  await query(`CREATE TABLE IF NOT EXISTS hospital_admissions (
    id               SERIAL PRIMARY KEY,
    patient_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    doctor_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    doctor_name      VARCHAR(200),
    facility_name    VARCHAR(200),
    ward             VARCHAR(200),
    room_number      VARCHAR(50),
    bed_number       VARCHAR(50),
    admission_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_discharge DATE,
    diagnosis        TEXT,
    status           VARCHAR(30) DEFAULT 'active',
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS admission_companions (
    id                  SERIAL PRIMARY KEY,
    admission_id        INTEGER REFERENCES hospital_admissions(id) ON DELETE CASCADE,
    companion_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    companion_name      VARCHAR(200) NOT NULL,
    companion_phone     VARCHAR(50),
    companion_id_number VARCHAR(100),
    relation            VARCHAR(100),
    requested_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status              VARCHAR(20) DEFAULT 'pending',
    permissions         JSONB DEFAULT '{}',
    exit_pass_active    BOOLEAN DEFAULT FALSE,
    admin_notes         TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_admissions_patient   ON hospital_admissions(patient_user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_companions_admission  ON admission_companions(admission_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_companions_user       ON admission_companions(companion_user_id)`);
  await query(`ALTER TABLE hospital_admissions ADD COLUMN IF NOT EXISTS medications_needed JSONB`).catch(() => {});
  await query(`ALTER TABLE hospital_admissions ADD COLUMN IF NOT EXISTS visit_schedule JSONB`).catch(() => {});
}

ensureAdmissionTables().catch(() => {});

router.post("/medical/admissions", writeLimiter, async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND staff_type IN ('doctor','admin') AND is_active=TRUE`, [user.id]);
    if (!staffR.rows.length) return res.status(403).json({ error: "للأطباء فقط" });
    const staff = staffR.rows[0];
    const b = req.body as any;
    if (!b.patient_user_id) return res.status(400).json({ error: "معرّف المريض مطلوب" });
    const r = await query(
      `INSERT INTO hospital_admissions
         (patient_user_id, doctor_user_id, doctor_name, facility_name, ward, room_number, bed_number,
          admission_date, expected_discharge, diagnosis, notes, medications_needed, visit_schedule)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        b.patient_user_id, user.id, (user.name as string) || "طبيب",
        staff.facility_name || b.facility_name || null,
        b.ward?.trim() || null, b.room_number?.trim() || null, b.bed_number?.trim() || null,
        b.admission_date || new Date().toISOString(),
        b.expected_discharge || null, b.diagnosis?.trim() || null, b.notes?.trim() || null,
        b.medications_needed ? JSON.stringify(b.medications_needed) : null,
        b.visit_schedule ? JSON.stringify(b.visit_schedule) : null,
      ]
    );
    const adm = r.rows[0];
    await sendPushToUser(Number(b.patient_user_id), "🏥 تم تسجيل تنويمك",
      `تم تسجيل دخولك للتنويم في ${staff.facility_name || "المستشفى"}. تفاصيل الغرفة في التطبيق.`,
      { type: "hospital_admission", id: adm.id });
    await query(`INSERT INTO notifications(user_id,type,title,body,data) VALUES($1,'admission',$2,$3,$4)`,
      [b.patient_user_id, "🏥 تنويم", `تم تسجيل تنويمك`, JSON.stringify({ id: adm.id })]);
    return res.status(201).json({ admission: adm });
  } catch (e: any) { logger.error({ err: e?.message }, "[admissions/post]"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/admissions/mine", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(
      `SELECT ha.*, (SELECT json_agg(ac ORDER BY ac.created_at DESC) FROM admission_companions ac WHERE ac.admission_id=ha.id AND ac.status='approved') AS companions
       FROM hospital_admissions ha WHERE ha.patient_user_id=$1 ORDER BY ha.created_at DESC LIMIT 20`,
      [user.id]
    );
    return res.json({ admissions: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/admissions/:id", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const id = parseInt(String(req.params.id), 10);
    const r = await query(`SELECT ha.*, u.name AS patient_display_name FROM hospital_admissions ha LEFT JOIN users u ON u.id=ha.patient_user_id WHERE ha.id=$1`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: "التنويم غير موجود" });
    const adm = r.rows[0];
    const isPatient  = adm.patient_user_id === Number(user.id);
    const isDoctor   = adm.doctor_user_id  === Number(user.id);
    const isAdmin    = await isAdminRequest(req);
    const cmpR = await query(`SELECT 1 FROM admission_companions WHERE admission_id=$1 AND companion_user_id=$2 AND status='approved'`, [id, user.id]);
    const isCompanion = cmpR.rows.length > 0;
    if (!isPatient && !isDoctor && !isAdmin && !isCompanion) return res.status(403).json({ error: "غير مصرح" });
    const companions = await query(`SELECT * FROM admission_companions WHERE admission_id=$1 ORDER BY created_at DESC`, [id]);
    return res.json({ admission: adm, companions: companions.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.post("/medical/admissions/:id/companions", writeLimiter, async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const admId = parseInt(String(req.params.id), 10);
    const admR = await query(`SELECT * FROM hospital_admissions WHERE id=$1`, [admId]);
    if (!admR.rows.length) return res.status(404).json({ error: "التنويم غير موجود" });
    const adm = admR.rows[0];
    const b = req.body as any;
    if (!b.companion_name) return res.status(400).json({ error: "اسم المرافق مطلوب" });
    const r = await query(
      `INSERT INTO admission_companions (admission_id, companion_user_id, companion_name, companion_phone, companion_id_number, relation, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [admId, b.companion_user_id || null, b.companion_name.trim(), b.companion_phone?.trim()||null, b.companion_id_number?.trim()||null, b.relation?.trim()||null, user.id]
    );
    const cmp = r.rows[0];
    if (adm.patient_user_id && adm.patient_user_id !== Number(user.id)) {
      await sendPushToUser(Number(adm.patient_user_id), "👤 طلب مرافقة جديد",
        `${b.companion_name} يطلب المرافقة أثناء تنويمك. راجع التفاصيل في التطبيق.`,
        { type: "companion_request", id: cmp.id, admission_id: admId });
    }
    return res.status(201).json({ companion: cmp });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/medical/admissions/:id/companions/:cid/approve", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const admId = parseInt(String(req.params.id), 10);
    const cmpId = parseInt(String(req.params.cid), 10);
    const admR = await query(`SELECT * FROM hospital_admissions WHERE id=$1`, [admId]);
    if (!admR.rows.length) return res.status(404).json({ error: "التنويم غير موجود" });
    const adm = admR.rows[0];
    const isPatient = adm.patient_user_id === Number(user.id);
    const isAdmin   = await isAdminRequest(req);
    if (!isPatient && !isAdmin) return res.status(403).json({ error: "غير مصرح" });
    const { status, admin_notes, permissions } = req.body as any;
    if (!["approved","rejected"].includes(status)) return res.status(400).json({ error: "الحالة غير صالحة" });
    const r = await query(
      `UPDATE admission_companions SET status=$1, admin_notes=$2, permissions=COALESCE($3::jsonb, permissions) WHERE id=$4 AND admission_id=$5 RETURNING *`,
      [status, admin_notes?.trim()||null, permissions ? JSON.stringify(permissions) : null, cmpId, admId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "طلب المرافقة غير موجود" });
    const cmp = r.rows[0];
    if (cmp.companion_user_id) {
      const msg = status === "approved" ? "✅ تم اعتماد طلب مرافقتك" : "❌ تم رفض طلب مرافقتك";
      await sendPushToUser(Number(cmp.companion_user_id), msg,
        status === "approved" ? "يمكنك الآن متابعة حالة المريض من التطبيق." : admin_notes || "",
        { type: "companion_response", status, admission_id: admId });
    }
    return res.json({ companion: cmp });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/medical/admissions/:id/companions/:cid/exit-pass", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const admId = parseInt(String(req.params.id), 10);
    const cmpId = parseInt(String(req.params.cid), 10);
    const admR  = await query(`SELECT * FROM hospital_admissions WHERE id=$1`, [admId]);
    if (!admR.rows.length) return res.status(404).json({ error: "التنويم غير موجود" });
    const adm = admR.rows[0];
    if (adm.patient_user_id !== Number(user.id) && !await isAdminRequest(req))
      return res.status(403).json({ error: "غير مصرح" });
    const { active } = req.body as any;
    const r = await query(
      `UPDATE admission_companions SET exit_pass_active=$1 WHERE id=$2 AND admission_id=$3 AND status='approved' RETURNING *`,
      [Boolean(active), cmpId, admId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "المرافق غير موجود أو غير معتمد" });
    return res.json({ companion: r.rows[0] });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/medical/my-companion-requests", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(
      `SELECT ac.*, ha.facility_name, ha.ward, ha.room_number, ha.diagnosis, ha.status AS admission_status,
              ha.expected_discharge, ha.medications_needed, ha.visit_schedule, u.name AS patient_name
       FROM admission_companions ac
       JOIN hospital_admissions ha ON ha.id=ac.admission_id
       LEFT JOIN users u ON u.id=ha.patient_user_id
       WHERE ac.companion_user_id=$1 OR ac.requested_by=$1
       ORDER BY ac.created_at DESC LIMIT 20`,
      [user.id]
    );
    return res.json({ companion_requests: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/medical/admissions/:id/discharge", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staffR = await query(`SELECT 1 FROM medical_staff_profiles WHERE user_id=$1 AND staff_type IN ('doctor','admin') AND is_active=TRUE`, [user.id]);
    if (!staffR.rows.length && !await isAdminRequest(req)) return res.status(403).json({ error: "للأطباء فقط" });
    const r = await query(`UPDATE hospital_admissions SET status='discharged' WHERE id=$1 RETURNING *`, [parseInt(String(req.params.id), 10)]);
    if (!r.rows.length) return res.status(404).json({ error: "التنويم غير موجود" });
    const adm = r.rows[0];
    if (adm.patient_user_id) {
      await sendPushToUser(Number(adm.patient_user_id), "✅ تم صرفك من المستشفى",
        "تم تسجيل خروجك رسمياً. نتمنى لك الشفاء العاجل.", { type: "discharged", id: adm.id });
    }
    return res.json({ admission: adm });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/admissions", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const status = req.query.status as string;
    const where = status ? `WHERE ha.status=$1` : "";
    const params = status ? [status] : [];
    const r = await query(
      `SELECT ha.*, u.name AS patient_display_name FROM hospital_admissions ha LEFT JOIN users u ON u.id=ha.patient_user_id ${where} ORDER BY ha.created_at DESC LIMIT 200`,
      params
    );
    return res.json({ admissions: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════
// اقتراحات تعديل الاستمارات القانونية — Legal Form Suggestions
// ══════════════════════════════════════════════════════════════════

async function ensureLegalSuggestionTables() {
  await query(`CREATE TABLE IF NOT EXISTS legal_form_suggestions (
    id               SERIAL PRIMARY KEY,
    form_id          INTEGER REFERENCES legal_forms(id) ON DELETE SET NULL,
    lawyer_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    lawyer_name      VARCHAR(200),
    suggestion_text  TEXT NOT NULL,
    current_content  TEXT,
    proposed_content TEXT,
    status           VARCHAR(20) DEFAULT 'pending',
    admin_notes      TEXT,
    reviewed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_legal_sugg_form   ON legal_form_suggestions(form_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_legal_sugg_lawyer ON legal_form_suggestions(lawyer_user_id)`);
}

ensureLegalSuggestionTables().catch(() => {});

router.post("/legal-forms/:id/suggest", writeLimiter, async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const formId = parseInt(String(req.params.id), 10);
    const fR = await query(`SELECT id, title FROM legal_forms WHERE id=$1`, [formId]);
    if (!fR.rows.length) return res.status(404).json({ error: "الاستمارة غير موجودة" });
    const lawyerR = await query(`SELECT id, full_name FROM lawyers WHERE user_id=$1 AND is_active=TRUE`, [user.id]);
    if (!lawyerR.rows.length) return res.status(403).json({ error: "هذه الخدمة للمحامين المسجلين فقط" });
    const b = req.body as any;
    if (!b.suggestion_text?.trim()) return res.status(400).json({ error: "نص الاقتراح مطلوب" });
    const r = await query(
      `INSERT INTO legal_form_suggestions (form_id, lawyer_user_id, lawyer_name, suggestion_text, current_content, proposed_content)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [formId, user.id, (user.name as string) || lawyerR.rows[0].full_name, b.suggestion_text.trim(), b.current_content?.trim()||null, b.proposed_content?.trim()||null]
    );
    return res.status(201).json({ suggestion: r.rows[0] });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/my-legal-suggestions", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(
      `SELECT lfs.*, lf.title AS form_title FROM legal_form_suggestions lfs LEFT JOIN legal_forms lf ON lf.id=lfs.form_id WHERE lfs.lawyer_user_id=$1 ORDER BY lfs.created_at DESC LIMIT 50`,
      [user.id]
    );
    return res.json({ suggestions: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/legal-form-suggestions", async (req: Request, res: Response) => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const status = req.query.status as string;
    const where = status ? `WHERE lfs.status=$1` : "";
    const params = status ? [status] : [];
    const r = await query(
      `SELECT lfs.*, lf.title AS form_title FROM legal_form_suggestions lfs LEFT JOIN legal_forms lf ON lf.id=lfs.form_id ${where} ORDER BY lfs.created_at DESC LIMIT 200`,
      params
    );
    return res.json({ suggestions: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/legal-form-suggestions/:id", async (req: Request, res: Response) => {
  const user = await getSessionUser(req);
  if (!user || !await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const id = parseInt(String(req.params.id), 10);
    const { status, admin_notes, apply_to_form } = req.body as any;
    if (!["approved","rejected"].includes(status)) return res.status(400).json({ error: "الحالة غير صالحة" });
    const r = await query(
      `UPDATE legal_form_suggestions SET status=$1, admin_notes=$2, reviewed_by=$3, reviewed_at=NOW() WHERE id=$4 RETURNING *`,
      [status, admin_notes?.trim()||null, user.id, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "الاقتراح غير موجود" });
    const sug = r.rows[0];
    if (status === "approved" && apply_to_form && sug.proposed_content && sug.form_id) {
      await query(`UPDATE legal_forms SET content_html=$1 WHERE id=$2`, [sug.proposed_content, sug.form_id]);
    }
    if (sug.lawyer_user_id) {
      const msg = status === "approved" ? "✅ تم اعتماد اقتراح التعديل" : "❌ تم رفض اقتراح التعديل";
      await sendPushToUser(Number(sug.lawyer_user_id), msg,
        admin_notes || (status === "approved" ? "تم قبول اقتراحك لتعديل الاستمارة القانونية." : ""),
        { type: "legal_suggestion", id, status });
    }
    return res.json({ suggestion: sug });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// نظام إدارة اتحاد الطلاب — Student Union Manager System
// ══════════════════════════════════════════════════════════════════════════════

async function ensureUnionMgrTables(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS union_manager_applications (
    id              SERIAL PRIMARY KEY,
    full_name       VARCHAR(200) NOT NULL,
    birth_date      VARCHAR(20),
    age             VARCHAR(10),
    gender          VARCHAR(10),
    national_id     VARCHAR(60),
    phone           VARCHAR(20) NOT NULL,
    email           VARCHAR(100),
    state           VARCHAR(60),
    locality        VARCHAR(60),
    admin_unit      VARCHAR(100),
    institution     VARCHAR(200),
    study_stage     VARCHAR(60),
    grade_level     VARCHAR(60),
    major           VARCHAR(100),
    skills          JSONB DEFAULT '[]',
    prev_experience BOOLEAN,
    exp_details     TEXT,
    committees      JSONB DEFAULT '[]',
    motivation      TEXT,
    contribution    TEXT,
    vision          TEXT,
    can_attend      BOOLEAN,
    weekly_hours    VARCHAR(20),
    other_commits   TEXT,
    pledge_name     VARCHAR(200),
    status          VARCHAR(20) DEFAULT 'pending',
    admin_note      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS union_managers (
    id              SERIAL PRIMARY KEY,
    application_id  INTEGER REFERENCES union_manager_applications(id) ON DELETE SET NULL,
    full_name       VARCHAR(200) NOT NULL,
    title           VARCHAR(100) DEFAULT 'ممثل إدارة الاتحاد',
    username        VARCHAR(100) UNIQUE NOT NULL,
    password_hash   VARCHAR(200) NOT NULL,
    phone           VARCHAR(20),
    email           VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS union_manager_sessions (
    id          SERIAL PRIMARY KEY,
    manager_id  INTEGER NOT NULL REFERENCES union_managers(id) ON DELETE CASCADE,
    token       VARCHAR(200) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS union_staff (
    id          SERIAL PRIMARY KEY,
    manager_id  INTEGER REFERENCES union_managers(id) ON DELETE CASCADE,
    full_name   VARCHAR(200) NOT NULL,
    role        VARCHAR(100) NOT NULL,
    committee   VARCHAR(100),
    phone       VARCHAR(20),
    email       VARCHAR(100),
    notes       TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS union_meetings (
    id            SERIAL PRIMARY KEY,
    manager_id    INTEGER REFERENCES union_managers(id) ON DELETE CASCADE,
    title         VARCHAR(300) NOT NULL,
    description   TEXT,
    meeting_date  VARCHAR(30),
    meeting_time  VARCHAR(20),
    location      VARCHAR(200),
    type          VARCHAR(30) DEFAULT 'meeting',
    status        VARCHAR(20) DEFAULT 'upcoming',
    created_at    TIMESTAMPTZ DEFAULT NOW()
  )`);

  await query(`CREATE TABLE IF NOT EXISTS union_messages (
    id          SERIAL PRIMARY KEY,
    manager_id  INTEGER REFERENCES union_managers(id) ON DELETE CASCADE,
    sender_name VARCHAR(200) NOT NULL,
    content     TEXT NOT NULL,
    is_pinned   BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
}

async function getUnionMgr(req: Request): Promise<{ id: number; full_name: string; title: string; username: string } | null> {
  const auth  = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token.startsWith("umt_")) return null;
  try {
    const r = await query(
      `SELECT m.id, m.full_name, m.title, m.username FROM union_managers m
       JOIN union_manager_sessions s ON s.manager_id = m.id
       WHERE s.token=$1 AND s.expires_at > NOW() AND m.is_active=TRUE`,
      [token]
    );
    return r.rows[0] ?? null;
  } catch { return null; }
}

// POST /api/union-manager/apply
router.post("/union-manager/apply", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureUnionMgrTables();
    const { full_name, birth_date, age, gender, national_id, phone, email,
      state, locality, admin_unit, institution, study_stage, grade_level, major,
      skills, prev_experience, exp_details, committees,
      motivation, contribution, vision, can_attend, weekly_hours, other_commits, pledge_name } = req.body;
    if (!full_name || !phone) return res.status(400).json({ error: "الاسم ورقم الهاتف مطلوبان" });
    const r = await query(
      `INSERT INTO union_manager_applications
        (full_name,birth_date,age,gender,national_id,phone,email,state,locality,admin_unit,
         institution,study_stage,grade_level,major,skills,prev_experience,exp_details,
         committees,motivation,contribution,vision,can_attend,weekly_hours,other_commits,pledge_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING id,full_name,phone,status,created_at`,
      [full_name,birth_date||null,age||null,gender||null,national_id||null,phone,
       email||null,state||null,locality||null,admin_unit||null,institution||null,
       study_stage||null,grade_level||null,major||null,
       JSON.stringify(skills||[]),prev_experience!=null?Boolean(prev_experience):null,
       exp_details||null,JSON.stringify(committees||[]),
       motivation||null,contribution||null,vision||null,
       can_attend!=null?Boolean(can_attend):null,weekly_hours||null,
       other_commits||null,pledge_name||null]
    );
    void sendPushToAdmins("🎓 طلب تولي إدارة اتحاد جديد", `${full_name} — ${institution||""}`.trim().replace(/\s*—\s*$/, ""), { type: "union_manager_application", id: r.rows[0].id });
    return res.status(201).json({ success: true, application: r.rows[0] });
  } catch (e: any) { logger.error({ err: e }, "union-manager/apply"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/union-manager/login
router.post("/union-manager/login", authLimiter, async (req: Request, res: Response) => {
  try {
    await ensureUnionMgrTables();
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
    const r = await query(`SELECT * FROM union_managers WHERE username=$1 AND is_active=TRUE`, [username]);
    const mgr = r.rows[0];
    if (!mgr) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    const valid = await bcrypt.compare(password, mgr.password_hash);
    if (!valid) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    const token = "umt_" + randomBytes(24).toString("hex");
    await query(`INSERT INTO union_manager_sessions (manager_id,token) VALUES ($1,$2)`, [mgr.id, token]);
    return res.json({ token, manager: { id: mgr.id, full_name: mgr.full_name, title: mgr.title, username: mgr.username } });
  } catch (e: any) { logger.error({ err: e }, "union-manager/login"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/union-manager/dashboard
router.get("/union-manager/dashboard", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const staff    = await query(`SELECT COUNT(*) FROM union_staff WHERE manager_id=$1 AND is_active=TRUE`, [mgr.id]);
    const meetings = await query(`SELECT COUNT(*) FROM union_meetings WHERE manager_id=$1 AND status='upcoming'`, [mgr.id]);
    const msgs     = await query(`SELECT COUNT(*) FROM union_messages WHERE manager_id=$1`, [mgr.id]);
    return res.json({ manager: mgr, stats: {
      staff: parseInt(staff.rows[0].count),
      upcoming_meetings: parseInt(meetings.rows[0].count),
      messages: parseInt(msgs.rows[0].count),
    }});
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/union-manager/staff
router.get("/union-manager/staff", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM union_staff WHERE manager_id=$1 ORDER BY created_at DESC`, [mgr.id]);
    return res.json(r.rows);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/union-manager/staff
router.post("/union-manager/staff", writeLimiter, async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const { full_name, role, committee, phone, email, notes } = req.body;
    if (!full_name || !role) return res.status(400).json({ error: "الاسم والمنصب مطلوبان" });
    const r = await query(
      `INSERT INTO union_staff (manager_id,full_name,role,committee,phone,email,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [mgr.id, full_name, role, committee||null, phone||null, email||null, notes||null]
    );
    return res.status(201).json(r.rows[0]);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/union-manager/staff/:id
router.patch("/union-manager/staff/:id", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const { full_name, role, committee, phone, email, notes, is_active } = req.body;
    const r = await query(
      `UPDATE union_staff SET
        full_name=COALESCE($1,full_name), role=COALESCE($2,role),
        committee=COALESCE($3,committee), phone=COALESCE($4,phone),
        email=COALESCE($5,email), notes=COALESCE($6,notes), is_active=COALESCE($7,is_active)
       WHERE id=$8 AND manager_id=$9 RETURNING *`,
      [full_name||null,role||null,committee||null,phone||null,email||null,notes||null,
       is_active!=null?Boolean(is_active):null, req.params.id, mgr.id]
    );
    return res.json(r.rows[0] ?? { error: "لم يُعثر" });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/union-manager/staff/:id
router.delete("/union-manager/staff/:id", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM union_staff WHERE id=$1 AND manager_id=$2`, [req.params.id, mgr.id]);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/union-manager/meetings
router.get("/union-manager/meetings", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM union_meetings WHERE manager_id=$1 ORDER BY created_at DESC`, [mgr.id]);
    return res.json(r.rows);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/union-manager/meetings
router.post("/union-manager/meetings", writeLimiter, async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const { title, description, meeting_date, meeting_time, location, type } = req.body;
    if (!title) return res.status(400).json({ error: "عنوان الاجتماع مطلوب" });
    const r = await query(
      `INSERT INTO union_meetings (manager_id,title,description,meeting_date,meeting_time,location,type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [mgr.id, title, description||null, meeting_date||null, meeting_time||null, location||null, type||'meeting']
    );
    return res.status(201).json(r.rows[0]);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/union-manager/meetings/:id
router.patch("/union-manager/meetings/:id", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const { title, description, meeting_date, meeting_time, location, type, status } = req.body;
    const r = await query(
      `UPDATE union_meetings SET
        title=COALESCE($1,title), description=COALESCE($2,description),
        meeting_date=COALESCE($3,meeting_date), meeting_time=COALESCE($4,meeting_time),
        location=COALESCE($5,location), type=COALESCE($6,type), status=COALESCE($7,status)
       WHERE id=$8 AND manager_id=$9 RETURNING *`,
      [title||null,description||null,meeting_date||null,meeting_time||null,
       location||null,type||null,status||null, req.params.id, mgr.id]
    );
    return res.json(r.rows[0] ?? { error: "لم يُعثر" });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/union-manager/meetings/:id
router.delete("/union-manager/meetings/:id", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM union_meetings WHERE id=$1 AND manager_id=$2`, [req.params.id, mgr.id]);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/union-manager/messages
router.get("/union-manager/messages", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT * FROM union_messages WHERE manager_id=$1 ORDER BY is_pinned DESC, created_at DESC`, [mgr.id]);
    return res.json(r.rows);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/union-manager/messages
router.post("/union-manager/messages", writeLimiter, async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const { sender_name, content, is_pinned } = req.body;
    if (!sender_name || !content) return res.status(400).json({ error: "المرسل والمحتوى مطلوبان" });
    const r = await query(
      `INSERT INTO union_messages (manager_id,sender_name,content,is_pinned)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [mgr.id, sender_name, content, Boolean(is_pinned)]
    );
    return res.status(201).json(r.rows[0]);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/union-manager/messages/:id/pin
router.patch("/union-manager/messages/:id/pin", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    const r = await query(
      `UPDATE union_messages SET is_pinned = NOT is_pinned WHERE id=$1 AND manager_id=$2 RETURNING *`,
      [req.params.id, mgr.id]
    );
    return res.json(r.rows[0] ?? { error: "لم يُعثر" });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/union-manager/messages/:id
router.delete("/union-manager/messages/:id", async (req: Request, res: Response) => {
  const mgr = await getUnionMgr(req);
  if (!mgr) return res.status(401).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM union_messages WHERE id=$1 AND manager_id=$2`, [req.params.id, mgr.id]);
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/union-manager-apps  (admin only)
router.get("/admin/union-manager-apps", async (req: Request, res: Response) => {
  const me = await getSessionUser(req);
  if (!me || (me.role !== "admin" && me.role !== "moderator")) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionMgrTables();
    const r = await query(`SELECT * FROM union_manager_applications ORDER BY created_at DESC`);
    return res.json(r.rows);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/union-manager-apps/:id/status  (admin only)
router.patch("/admin/union-manager-apps/:id/status", async (req: Request, res: Response) => {
  const me = await getSessionUser(req);
  if (!me || (me.role !== "admin" && me.role !== "moderator")) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionMgrTables();
    const { status, admin_note, username, password } = req.body;
    if (!["approved","rejected","pending"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    await query(`UPDATE union_manager_applications SET status=$1, admin_note=$2 WHERE id=$3`, [status, admin_note||null, req.params.id]);
    if (status === "approved" && username && password) {
      const appR = await query(`SELECT * FROM union_manager_applications WHERE id=$1`, [req.params.id]);
      const app_ = appR.rows[0];
      if (app_) {
        const existing = await query(`SELECT id FROM union_managers WHERE username=$1`, [username]);
        if (existing.rows.length > 0) return res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" });
        const hash = await bcrypt.hash(password, 10);
        await query(
          `INSERT INTO union_managers (application_id,full_name,username,password_hash,phone,email)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [app_.id, app_.full_name, username, hash, app_.phone, app_.email]
        );
      }
    }
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/union-manager-apps/:id/grant-credentials — منح بيانات دخول للمقبول
router.post("/admin/union-manager-apps/:id/grant-credentials", async (req: Request, res: Response): Promise<any> => {
  const me = await getSessionUser(req);
  if (!me || (me.role !== "admin" && me.role !== "moderator")) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionMgrTables();
    const appR = await query(`SELECT * FROM union_manager_applications WHERE id=$1`, [req.params.id]);
    const app_ = appR.rows[0];
    if (!app_) return res.status(404).json({ error: "الطلب غير موجود" });
    if (app_.status !== "approved") return res.status(400).json({ error: "يجب قبول الطلب أولاً قبل منح بيانات الدخول" });

    // Check if already has an account
    const existing = await query(`SELECT id, username FROM union_managers WHERE application_id=$1`, [app_.id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "هذا المتقدم لديه حساب مسبق", username: existing.rows[0].username });
    }

    // Auto-generate username from name + random suffix
    const baseName = (app_.full_name as string)
      .replace(/\s+/g, "_")
      .replace(/[^؀-ۿ\w]/g, "")
      .substring(0, 12)
      .toLowerCase() || "union_mgr";
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const username = `${baseName}_${suffix}`;

    // Generate temporary password: 10-char alphanumeric
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const temp_password = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

    const hash = await bcrypt.hash(temp_password, 10);
    await query(
      `INSERT INTO union_managers (application_id, full_name, username, password_hash, phone, email)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [app_.id, app_.full_name, username, hash, app_.phone, app_.email]
    );

    logger.info({ app_id: app_.id, username }, "[grant-union-creds] credentials issued");
    return res.status(201).json({ username, temp_password, full_name: app_.full_name });
  } catch (e: any) {
    logger.error({ err: e?.message }, "grant-union-credentials error");
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admin/seed-union-manager  — إنشاء حساب تجريبي لاتحاد الطلاب (يُنفَّذ مرة واحدة)
router.post("/admin/seed-union-manager", async (req: Request, res: Response) => {
  const me = await getSessionUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionMgrTables();
    const username = "union_admin";
    const password = "Union@2025#";
    const existing = await query(`SELECT id FROM union_managers WHERE username=$1`, [username]);
    if (existing.rows.length > 0) {
      return res.json({ message: "الحساب موجود مسبقاً", username, password });
    }
    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO union_managers (full_name,title,username,password_hash) VALUES ($1,$2,$3,$4)`,
      ["اتحاد الطلاب - تجريبي", "رئيس الاتحاد", username, hash]
    );
    return res.status(201).json({ message: "تم إنشاء الحساب بنجاح", username, password });
  } catch (e: any) { logger.error({ err: e }, "seed-union-manager"); return res.status(500).json({ error: "Server error" }); }
});

// ── GET /api/admin/union-managers — قائمة جميع مدراء الاتحادات
router.get("/admin/union-managers", async (req: Request, res: Response): Promise<any> => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionMgrTables();
    const r = await query(
      `SELECT m.id, m.full_name, m.title, m.username, m.phone, m.email,
              m.is_active, m.created_at,
              a.full_name AS app_full_name, a.institution, a.major, a.status AS app_status
       FROM union_managers m
       LEFT JOIN union_manager_applications a ON a.id = m.application_id
       ORDER BY m.created_at DESC`
    );
    return res.json(r.rows);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ── PATCH /api/admin/union-managers/:id/status — تعليق أو تفعيل مدير
router.patch("/admin/union-managers/:id/status", async (req: Request, res: Response): Promise<any> => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionMgrTables();
    const id = parseInt(req.params.id as string, 10);
    const { is_active } = req.body as { is_active?: boolean };
    if (typeof is_active !== "boolean") return res.status(400).json({ error: "is_active مطلوب" });
    const r = await query(
      `UPDATE union_managers SET is_active=$1 WHERE id=$2 RETURNING id, full_name, username, is_active`,
      [is_active, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "المدير غير موجود" });
    // إلغاء جلسات المعلَّق
    if (!is_active) await query(`DELETE FROM union_manager_sessions WHERE manager_id=$1`, [id]);
    logger.info({ id, is_active }, "[admin] union manager status changed");
    return res.json(r.rows[0]);
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ── DELETE /api/admin/union-managers/:id — حذف مدير
router.delete("/admin/union-managers/:id", async (req: Request, res: Response): Promise<any> => {
  if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureUnionMgrTables();
    const id = parseInt(req.params.id as string, 10);
    const check = await query(`SELECT id, full_name FROM union_managers WHERE id=$1`, [id]);
    if (!check.rows.length) return res.status(404).json({ error: "المدير غير موجود" });
    // حذف الجلسات والبيانات المرتبطة ثم السجل
    await query(`DELETE FROM union_manager_sessions WHERE manager_id=$1`, [id]);
    await query(`DELETE FROM union_managers WHERE id=$1`, [id]);
    logger.info({ id, name: check.rows[0].full_name }, "[admin] union manager deleted");
    return res.json({ ok: true, deleted: check.rows[0].full_name });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// ─── POST /api/admin/send-invitations ─────────────────────────────────────
// يرسل دعوات انضمام بالبريد الإلكتروني لقائمة مؤسسات ولاية الجزيرة
const INVITATION_HTML = (orgName: string) => `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#0B2E1A,#0F4228);padding:36px;text-align:center">
    <div style="font-size:44px">🌿</div>
    <h1 style="color:#2ECC71;margin:8px 0 0;font-size:28px">حصاحيصاوي</h1>
    <p style="color:#a7f3d0;margin:8px 0 0;font-size:14px">المنصة الرقمية الأولى لأبناء ولاية الجزيرة</p>
  </div>
  <div style="padding:32px">
    <p style="font-size:17px;color:#1e293b">السلام عليكم ورحمة الله وبركاته،</p>
    <p style="font-size:16px;color:#334155;line-height:1.9">
      يسرّنا توجيه هذه الدعوة الخاصة لـ <strong style="color:#16a34a">${orgName}</strong>
      للانضمام إلى <strong>منصة حصاحيصاوي</strong> — المنصة الرقمية المجتمعية الأولى لأبناء ولاية الجزيرة.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0">
      <h3 style="color:#16a34a;margin:0 0 14px">ما نقدمه لمؤسستكم — مجاناً:</h3>
      <div style="color:#374151;line-height:2.2;font-size:15px">
        ✅ حضور رقمي أمام أكثر من <strong>٥٠٠٠ مستخدم</strong> من أبناء المنطقة<br>
        ✅ نشر الأخبار والفعاليات والإعلانات للمجتمع<br>
        ✅ استقبال الطلبات والتسجيلات إلكترونياً<br>
        ✅ دليل المؤسسات وخريطة الخدمات المحلية<br>
        ✅ قناة تواصل مباشرة مع مستخدمي المنطقة
      </div>
    </div>
    <div style="text-align:center;margin:28px 0">
      <a href="https://almhbob.github.io/hasahisawi/"
         style="background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;text-decoration:none;padding:15px 36px;border-radius:12px;font-size:17px;font-weight:bold;display:inline-block">
        سجّل مؤسستك الآن ←
      </a>
    </div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px">
      <p style="margin:0;font-size:14px;color:#92400e">
        💡 التسجيل لا يستغرق سوى دقيقتين — يتواصل فريقنا معكم خلال ٤٨ ساعة.
      </p>
    </div>
  </div>
  <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:14px;color:#64748b">للاستفسار: <strong style="color:#16a34a">almhbob.2024@gmail.com</strong></p>
    <p style="margin:8px 0 0;font-size:12px;color:#94a3b8">فريق منصة حصاحيصاوي · ولاية الجزيرة، السودان · 2026</p>
  </div>
</div></body></html>`;

const INVITATION_TARGETS = [
  { name: "جامعة الجزيرة",                      email: "info@uofg.edu.sd" },
  { name: "كلية الحصاحيصا للعلوم الطبية HCMST",  email: "info@el-majd.com" },
  { name: "كلية الجزيرة للعلوم الطبية",          email: "hashimtree@gmail.com" },
  { name: "جامعة البطانة",                       email: "info@albutana.edu.sd" },
  { name: "بنك الخرطوم",                         email: "info@bok.sd" },
  { name: "هيئة البحوث الزراعية السودانية",       email: "info@arc.gov.sd" },
  { name: "وحدة التمويل الأصغر (MFU)",            email: "info.mfu@cbos.gov.sd" },
];

router.post("/admin/send-invitations", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "مديرون فقط" });

    const resendKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
    const targets: { name: string; email: string }[] = req.body?.targets ?? INVITATION_TARGETS;

    if (!resendKey) return res.status(503).json({ error: "RESEND_API_KEY غير مُعيَّن" });

    const results: { name: string; email: string; ok: boolean; id?: string; error?: string }[] = [];

    for (const target of targets) {
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `حصاحيصاوي <${emailFrom}>`,
            to: [target.email],
            subject: "دعوة انضمام — منصة حصاحيصاوي",
            html: INVITATION_HTML(target.name),
            reply_to: "almhbob.2024@gmail.com",
          }),
        });
        const json = await resp.json() as { id?: string; statusCode?: number; message?: string };
        const ok = resp.ok;
        results.push({ name: target.name, email: target.email, ok, id: json.id, error: ok ? undefined : json.message });
        logger.info({ ok, name: target.name, email: target.email }, "[send-invitations]");
        await new Promise(r => setTimeout(r, 600));
      } catch (err: any) {
        results.push({ name: target.name, email: target.email, ok: false, error: err?.message });
      }
    }

    const succeeded = results.filter(r => r.ok).length;
    return res.json({
      summary: { total: results.length, succeeded, failed: results.length - succeeded },
      results,
    });
  } catch (err) {
    logger.error({ err }, "admin/send-invitations");
    return res.status(500).json({ error: "Server error" });
  }
});
