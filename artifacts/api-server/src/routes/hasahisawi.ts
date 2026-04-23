import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { checkContent } from "../lib/content-moderator";
import { authLimiter, pinLimiter } from "../lib/rate-limiters";
import { verifyIdToken } from "../lib/firebase-admin";

const router = Router();

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
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      max: 5,
    })
  : null;

if (pool) {
  pool.on("error", (err) => console.error("pg pool idle-client error:", err));
} else {
  console.warn("⚠️  DATABASE_URL not set or is a placeholder — DB features are disabled until a real URL is configured.");
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
      `SELECT token FROM push_tokens WHERE user_id=$1`,
      [userId]
    );
    if (!rows[0]?.token) return;
    const token = rows[0].token as string;
    if (!token.startsWith("ExponentPushToken[")) return;

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: token, title, body, data, sound: "default", badge: 1 }),
    }).catch(() => {});
  } catch {}
}

const DEFAULT_ADMIN_PIN = process.env.DEFAULT_ADMIN_PIN ?? "4444";

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

export async function initHasahisawiDb() {
  if (!pool) {
    console.warn("⚠️  initHasahisawiDb: skipped — no valid DATABASE_URL");
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
      console.log(`✅ تم تهيئة ${realLocations.length} حياً وقرية حقيقية في قاعدة البيانات`);
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
  await query(`ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS rep_photo_url TEXT`);
  await query(`ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS signed_contract_url TEXT`);
  await query(`ALTER TABLE institution_applications ADD COLUMN IF NOT EXISTS signed_contract_at TIMESTAMPTZ`);

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
  // ترحيل: إذا الجدول القديم يفتقر لعمود contact_phone — أعد الإنشاء
  {
    const { rows: orgCols } = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'organizations' AND column_name = 'contact_phone'
    `);
    if (orgCols.length === 0) {
      await query(`DROP TABLE IF EXISTS organizations CASCADE`);
    }
  }
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

  // ══ جدول خدمات المرأة ══
  // ترحيل: إذا الجدول القديم يفتقر لعمود rating — أعد الإنشاء
  {
    const { rows: wsCols } = await query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'women_services' AND column_name = 'rating'
    `);
    if (wsCols.length === 0) {
      await query(`DROP TABLE IF EXISTS women_services CASCADE`);
    }
  }
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

  console.log("✅ Hasahisawi DB initialized");
}

async function getSessionUser(req: Request): Promise<Record<string, unknown> | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const result = await query(`
    SELECT u.* FROM users u
    JOIN user_sessions s ON s.user_id = u.id
    WHERE s.token = $1 AND s.expires_at > NOW()
  `, [token]);
  return result.rows[0] || null;
}

// مساعد: هل المستخدم مدير أو مشرف ترحيل؟
function isTransportAdmin(role: unknown): boolean {
  return role === "admin" || role === "transport_supervisor";
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

router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const { name, national_id, phone, email, password, birth_date, neighborhood, gender } = req.body;
    if (!name || !password) return res.status(400).json({ error: "الاسم وكلمة المرور مطلوبان" });
    if (!phone && !email) return res.status(400).json({ error: "يرجى إدخال رقم الهاتف أو البريد الإلكتروني" });
    if (password.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    if (password.length > 128) return res.status(400).json({ error: "كلمة المرور طويلة جداً" });
    if (name.length > 100) return res.status(400).json({ error: "الاسم طويل جداً" });
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/admin/app/version", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// تحديث الملف الشخصي (الاسم + الصورة الشخصية)
router.put("/auth/profile", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const { name, avatar_url } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    if (name?.trim()) { updates.push(`name=$${params.length + 1}`); params.push(name.trim()); }
    if (avatar_url !== undefined) { updates.push(`avatar_url=$${params.length + 1}`); params.push(avatar_url || null); }
    if (updates.length === 0) return res.status(400).json({ error: "لا توجد تحديثات" });
    params.push(me.id);
    const result = await query(
      `UPDATE users SET ${updates.join(",")} WHERE id=$${params.length} RETURNING *`,
      params
    );
    return res.json({ user: safeUserPayload(result.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

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
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "بيانات غير صحيحة" });
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/auth/admin-login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1) AND role='admin'`, [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "بيانات غير صحيحة" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "بيانات غير صحيحة" });
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err) {
    console.error(err);
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
    console.error(err);
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
  } catch (err) { console.error(err); return res.status(500).json({ error: "Server error" }); }
});

// إنشاء مشرف ترحيل جديد (يتطلب كود المشرف الرئيسي)
router.post("/auth/register-transport-supervisor", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "المديرون فقط يمكنهم إنشاء مشرف ترحيل" });
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'transport_supervisor') RETURNING id, name, role`,
      [name, email, hash]
    );
    return res.status(201).json({ user: result.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") return res.status(400).json({ error: "البريد مستخدم بالفعل" });
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/name", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT value FROM admin_settings WHERE key='admin_name'`);
    return res.json({ name: result.rows[0]?.value || "المسؤول" });
  } catch (err) {
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/ratings", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    const { target_type, target_id, rating, comment } = req.body;
    await query(
      `INSERT INTO ratings (target_type, target_id, user_id, rating, comment) VALUES ($1,$2,$3,$4,$5)`,
      [target_type, target_id, user?.id || null, rating, comment || null]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/women-services", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM women_services ORDER BY name`);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/organizations", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM organizations ORDER BY name`);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
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
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/posts", async (req: Request, res: Response) => {
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/posts/:id/comments", async (req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM social_comments WHERE post_id=$1 ORDER BY created_at ASC`, [req.params.id]);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/posts/:id/comments", async (req: Request, res: Response) => {
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/posts/:id/like", async (req: Request, res: Response) => {
  try {
    const { device_id } = req.body;
    if (!device_id) return res.status(400).json({ error: "device_id مطلوب" });
    const existing = await query(`SELECT id FROM social_likes WHERE post_id=$1 AND device_id=$2`, [req.params.id, device_id]);
    if (existing.rows.length > 0) {
      await query(`DELETE FROM social_likes WHERE post_id=$1 AND device_id=$2`, [req.params.id, device_id]);
      return res.json({ liked: false });
    } else {
      await query(`INSERT INTO social_likes (post_id, device_id) VALUES ($1,$2)`, [req.params.id, device_id]);
      return res.json({ liked: true });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════
// Push Tokens — تسجيل وتحديث رمز الإشعارات
// ══════════════════════════════════════════════════════

router.post("/push-tokens", async (req: Request, res: Response) => {
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════════════

router.get("/notifications", async (_req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM notifications ORDER BY created_at DESC`);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/notifications", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { title, body, type } = req.body;
    const result = await query(
      `INSERT INTO notifications (title, body, type) VALUES ($1,$2,$3) RETURNING *`,
      [title, body, type || "general"]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/notifications/:id/read", async (req: Request, res: Response) => {
  try {
    await query(`UPDATE notifications SET is_read=true WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/notifications/read-all", async (_req: Request, res: Response) => {
  try {
    await query(`UPDATE notifications SET is_read=true`);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/notifications/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM notifications WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/news/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM city_news WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ══════════════════════════════════════════════
//  ADMIN DASHBOARD ROUTES
// ══════════════════════════════════════════════

router.get("/admin/users", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const result = await query(`
      SELECT id, name, phone, email, role, neighborhood, birth_date,
             national_id, is_banned, created_at
      FROM users
      ORDER BY created_at DESC
    `);
    const users = result.rows.map((u: any) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      email: u.email,
      role: u.role,
      neighborhood: u.neighborhood,
      birth_date: u.birth_date,
      national_id_masked: u.national_id ? String(u.national_id).slice(-4).padStart(String(u.national_id).length, "*") : null,
      is_banned: u.is_banned,
      created_at: u.created_at,
    }));
    return res.json(users);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/dashboard-stats", async (req: Request, res: Response) => {
  try {
    const user = await getSessionUser(req);
    if (!user || (user.role !== "admin" && user.role !== "moderator")) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const [totals, byNeighborhood, recent] = await Promise.all([
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
    ]);
    return res.json({
      totals: totals.rows[0],
      byNeighborhood: byNeighborhood.rows,
      recentUsers: recent.rows,
    });
  } catch (err) {
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    sendPushToUser(
      recipientId,
      `رسالة من ${me.name as string}`,
      notifBody,
      { chatId, otherName: me.name, screen: "chat" }
    );

    return res.json(msg);
  } catch (err) {
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
  } catch (err) {
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    const requestedRole = ["user", "admin", "moderator"].includes(role ?? "") ? (role as string) : "user";

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
    console.error("firebase-exchange error:", err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// حالة الذكاء الاصطناعي
router.get("/ai/status", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT value FROM admin_settings WHERE key='ai_enabled'`
    );
    const dbEnabled = rows[0]?.value === "true";
    // مفعّل تلقائيًا إذا كان GOOGLE_API_KEY موجودًا في البيئة
    const enabled = dbEnabled || !!process.env["GOOGLE_API_KEY"];
    return res.json({ enabled });
  } catch {
    return res.json({ enabled: !!process.env["GOOGLE_API_KEY"] });
  }
});

// دعم الذكاء الاصطناعي (Gemini free tier proxy)
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

    // يُستخدم GOOGLE_API_KEY من البيئة كاحتياطي إذا لم يكن المفتاح محفوظًا في الإعدادات
    const envApiKey = process.env["GOOGLE_API_KEY"];
    const apiKey = settings["ai_api_key"] || envApiKey;

    // إذا كان المفتاح البيئي متاحًا تُعامَل الخدمة كمفعّلة تلقائيًا
    const aiEnabled = settings["ai_enabled"] === "true" || !!envApiKey;
    if (!aiEnabled) {
      return res.status(503).json({ error: "خدمة الذكاء الاصطناعي غير مفعّلة حالياً" });
    }

    if (!apiKey) return res.status(503).json({ error: "لم يتم تكوين مفتاح API" });

    const systemPrompt = settings["ai_system_prompt"] ||
      "أنت مساعد ذكي لتطبيق حصاحيصاوي، مخصص لخدمة أهالي مدينة الحصاحيصا في السودان. أجب باللغة العربية بأسلوب ودود ومفيد. تخصصك في: المعلومات المحلية، الخدمات المتاحة في التطبيق، والإرشاد العام.";

    const contents = [
      ...(history || []),
      { role: "user", parts: [{ text: message }] },
    ];

    // جرّب الموديلات بالترتيب حتى ينجح أحدها
    const MODELS = [
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash-8b",
      "gemini-2.0-flash",
    ];

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    });

    let lastStatus = 500;
    let lastErrBody = "";

    for (const model of MODELS) {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body }
      );

      if (geminiRes.ok) {
        const data = await geminiRes.json() as any;
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text
          || "لم أتمكن من الإجابة، يرجى المحاولة مجدداً.";
        return res.json({ reply });
      }

      lastStatus = geminiRes.status;
      lastErrBody = await geminiRes.text();
      console.error(`Gemini error (${model}):`, lastErrBody);

      // لا فائدة من المحاولة التالية إذا كان خطأ في المفتاح
      if (lastStatus === 400 || lastStatus === 401 || lastStatus === 403) break;
    }

    // رسالة خطأ واضحة حسب نوع الخطأ
    if (lastStatus === 429) {
      return res.status(503).json({
        error: "الخدمة مشغولة حالياً بسبب كثرة الطلبات، حاول مرة أخرى بعد دقيقة."
      });
    }
    return res.status(502).json({ error: "خطأ في الاتصال بخدمة الذكاء الاصطناعي" });
  } catch (err) {
    console.error("AI chat error:", err);
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
    const parsedServices = JSON.parse(selected_services || "[]");
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

    return res.json({ application: result.rows[0] });
  } catch (err) {
    console.error("POST /institution-applications error:", err);
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
    console.error("PATCH /institution-applications/:id/signed-contract error:", err);
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
    console.error("POST /reports error:", err);
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
    console.error("GET /reports error:", err);
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
    console.error("POST /feedback error:", err);
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
        `SELECT id, name, description, category, phone FROM organizations
         WHERE name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1 LIMIT 10`,
        [like]
      ),
      query(
        `SELECT id, name, description, city FROM communities
         WHERE name ILIKE $1 OR description ILIKE $1 LIMIT 10`,
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
    console.error(err);
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
    console.error(err);
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
router.post("/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, email, identifier, new_password } = req.body;
    const lookup = (identifier || phone || email || "").trim();
    if (!lookup || !new_password) return res.status(400).json({ error: "أدخل رقم الهاتف أو البريد الإلكتروني وكلمة المرور الجديدة" });
    if (lookup.length > 200) return res.status(400).json({ error: "بيانات غير صالحة" });
    if (new_password.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    if (new_password.length > 128) return res.status(400).json({ error: "كلمة المرور طويلة جداً" });

    const isEmail = lookup.includes("@");
    const userR = isEmail
      ? await query(`SELECT id FROM users WHERE email=$1`, [lookup])
      : await query(`SELECT id FROM users WHERE phone=$1`, [lookup]);
    if (!userR.rows.length) return res.status(404).json({ error: "لم يتم العثور على حساب بهذا الرقم أو البريد" });

    const hashed = await bcrypt.hash(new_password, 10);
    await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hashed, userR.rows[0].id]);

    return res.json({ ok: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── تحقق من وجود رقم الهاتف أو البريد الإلكتروني ────────────────────────────
router.post("/auth/check-phone", async (req: Request, res: Response) => {
  try {
    const { phone, email, identifier } = req.body;
    const lookup = (identifier || phone || email || "").trim();
    if (!lookup) return res.status(400).json({ error: "أدخل رقم الهاتف أو البريد الإلكتروني" });
    const isEmail = lookup.includes("@");
    const userR = isEmail
      ? await query(`SELECT id, name FROM users WHERE email=$1`, [lookup])
      : await query(`SELECT id, name FROM users WHERE phone=$1`, [lookup]);
    if (!userR.rows.length) return res.json({ exists: false });
    return res.json({ exists: true, name: userR.rows[0].name });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    console.error(err);
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
    return res.json({ appointment: result.rows[0] });
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
    console.error("inst/login error:", err);
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
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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

// PUT /api/admin/transport/settings — تحديث إعدادات الخدمة (مدير فقط)
router.put("/admin/transport/settings", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── Admin Transport Routes ──

// GET /api/admin/transport/stats — إحصائيات الخدمة
router.get("/admin/transport/stats", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    const [drivers, trips, pending, revenue] = await Promise.all([
      query(`SELECT status, COUNT(*) as cnt FROM transport_drivers GROUP BY status`),
      query(`SELECT status, COUNT(*) as cnt FROM transport_trips GROUP BY status`),
      query(`SELECT COUNT(*) as cnt FROM transport_drivers WHERE status='pending'`),
      query(`SELECT COALESCE(SUM(actual_fare),0) AS total_fare, COALESCE(SUM(platform_revenue),0) AS platform_revenue, COALESCE(SUM(operator_revenue),0) AS operator_revenue FROM transport_trips WHERE status='completed'`),
    ]);
    return res.json({
      drivers: drivers.rows,
      trips: trips.rows,
      pendingDrivers: parseInt(pending.rows[0]?.cnt ?? "0"),
      revenue: revenue.rows[0],
    });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/transport/drivers — جميع السائقين
router.get("/admin/transport/drivers", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.query;
    let q = `SELECT d.*, u.name AS user_name_ref, o.name AS operator_name FROM transport_drivers d LEFT JOIN users u ON u.id=d.user_id LEFT JOIN transport_operators o ON o.id=d.operator_id`;
    const params: any[] = [];
    if (status && status !== "all") { q += ` WHERE d.status=$1`; params.push(status); }
    q += ` ORDER BY d.created_at DESC`;
    const { rows } = await query(q, params);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/transport/drivers/:id — قبول/رفض سائق
router.patch("/admin/transport/drivers/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    const { status, admin_note, operator_id } = req.body;
    await query(
      `UPDATE transport_drivers SET status=COALESCE($1,status), admin_note=COALESCE($2,admin_note), operator_id=COALESCE($3,operator_id) WHERE id=$4`,
      [status, admin_note, operator_id ?? null, req.params.id]
    );
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/transport/drivers/:id — حذف سائق
router.delete("/admin/transport/drivers/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM transport_drivers WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/transport/trips — جميع الرحلات
router.get("/admin/transport/trips", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    const { status } = req.query;
    let q = `SELECT t.*, d.name AS driver_name_ref, d.phone AS driver_phone, o.name AS operator_name
             FROM transport_trips t
             LEFT JOIN transport_drivers d ON d.id=t.driver_id
             LEFT JOIN transport_operators o ON o.id=t.operator_id`;
    const params: any[] = [];
    if (status && status !== "all") { q += ` WHERE t.status=$1`; params.push(status); }
    q += ` ORDER BY t.created_at DESC LIMIT 200`;
    const { rows } = await query(q, params);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/transport/trips/:id/complete — إتمام رحلة مع الأجرة الفعلية
router.patch("/admin/transport/trips/:id/complete", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    const { actual_fare, operator_id } = req.body;
    if (!actual_fare || actual_fare <= 0) return res.status(400).json({ error: "الأجرة الفعلية مطلوبة" });

    // احسب توزيع الأرباح بناءً على الشركة المشغّلة
    let platformRevenue = actual_fare;
    let operatorRevenue = 0;
    const opId = operator_id ?? null;

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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/transport/trips/:id — حذف رحلة
router.delete("/admin/transport/trips/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM transport_trips WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ── مسارات الشركات المشغّلة (Operators) ──

// GET /api/admin/transport/operators
router.get("/admin/transport/operators", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    return res.json(rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/transport/operators
router.post("/admin/transport/operators", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/transport/operators/:id
router.patch("/admin/transport/operators/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/transport/operators/:id
router.delete("/admin/transport/operators/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "المديرون فقط" });
    await query(`DELETE FROM transport_operators WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// مناطق التغطية — الأحياء والقرى
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/transport/neighborhoods — قائمة الأحياء العامة (المعتمدة)
router.get("/transport/neighborhoods", async (req: Request, res: Response) => {
  try {
    const r = await query(`SELECT id, name, zone_id, submitted_by, created_at FROM transport_neighborhoods WHERE status='active' ORDER BY zone_id, name`);
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
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
  } catch { return res.status(500).json({ error: "Server error" }); }
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/transport/neighborhoods — كل الأحياء (إداري)
router.get("/admin/transport/neighborhoods", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    const r = await query(`SELECT * FROM transport_neighborhoods ORDER BY status DESC, zone_id, name`);
    return res.json(r.rows);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/transport/neighborhoods — إضافة حي (إداري مباشر)
router.post("/admin/transport/neighborhoods", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    const { name, zone_id, notes } = req.body;
    if (!name || !zone_id) return res.status(400).json({ error: "الاسم والمنطقة مطلوبان" });
    const exists = await query(`SELECT id FROM transport_neighborhoods WHERE LOWER(name)=LOWER($1) AND zone_id=$2 AND status != 'rejected'`, [name, zone_id]);
    if (exists.rows.length > 0) return res.status(409).json({ error: "هذا الحي موجود بالفعل" });
    const r = await query(
      `INSERT INTO transport_neighborhoods (name, zone_id, status, submitted_by, notes) VALUES ($1,$2,'active',$3,$4) RETURNING *`,
      [name.trim(), zone_id, me.name || me.email, notes || ""]
    );
    return res.json(r.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/transport/neighborhoods/:id — تعديل حالة أو بيانات
router.patch("/admin/transport/neighborhoods/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/transport/neighborhoods/:id — حذف
router.delete("/admin/transport/neighborhoods/:id", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM transport_neighborhoods WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/transport/operators/:id/report — تقرير مفصّل لشركة مشغّلة
router.get("/admin/transport/operators/:id/report", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/transport/reports — تقارير الإيرادات الشاملة
router.get("/admin/transport/reports", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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
        FROM transport_trips`),
      query(`
        SELECT vehicle_preference,
          COUNT(*) FILTER (WHERE status='completed')::int AS trips,
          COALESCE(SUM(actual_fare) FILTER (WHERE status='completed'),0)::int AS revenue
        FROM transport_trips GROUP BY vehicle_preference ORDER BY trips DESC`),
      query(`
        SELECT o.id, o.name, o.operator_share_pct, o.platform_share_pct,
          COUNT(t.id) FILTER (WHERE t.status='completed')::int AS trips,
          COALESCE(SUM(t.actual_fare) FILTER (WHERE t.status='completed'),0)::int AS revenue,
          COALESCE(SUM(t.operator_revenue) FILTER (WHERE t.status='completed'),0)::int AS operator_share,
          COALESCE(SUM(t.platform_revenue) FILTER (WHERE t.status='completed'),0)::int AS platform_share
        FROM transport_operators o
        LEFT JOIN transport_trips t ON t.operator_id=o.id
        GROUP BY o.id ORDER BY revenue DESC`),
      query(`
        SELECT DATE_TRUNC('day', completed_at) AS day,
          COUNT(*)::int AS trips,
          COALESCE(SUM(actual_fare),0)::int AS revenue,
          COALESCE(SUM(platform_revenue),0)::int AS platform_revenue
        FROM transport_trips
        WHERE status='completed' AND completed_at >= NOW()-INTERVAL '30 days'
        GROUP BY day ORDER BY day DESC`),
      query(`
        SELECT t.*, o.name AS operator_name FROM transport_trips t
        LEFT JOIN transport_operators o ON o.id=t.operator_id
        WHERE t.status='completed' ORDER BY t.completed_at DESC LIMIT 20`),
    ]);
    return res.json({
      overall: overall.rows[0],
      byVehicle: byVehicle.rows,
      byOperator: byOperator.rows,
      daily: monthly.rows,
      recent: recent.rows,
    });
  } catch { return res.status(500).json({ error: "Server error" }); }
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/admin/transport/fares — تحديث خلية في مصفوفة التعرفة
router.put("/admin/transport/fares", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/admin/transport/fares/bulk — تحديث التعرفة بالكامل
router.put("/admin/transport/fares/bulk", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
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
  } catch { return res.status(500).json({ error: "Server error" }); }
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/transport/trips/:id/assign — تعيين سائق لرحلة
router.patch("/admin/transport/trips/:id/assign", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    const { driver_id, status, operator_id } = req.body;
    let driverName = null;
    let opId = operator_id ?? null;
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
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/transport/overview — نظرة عامة متكاملة للمدير
router.get("/admin/transport/overview", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || !isTransportAdmin(me.role)) return res.status(403).json({ error: "غير مصرح" });
    const [drivers, trips, fares, settings, operators] = await Promise.all([
      query(`SELECT status, vehicle_type, COUNT(*) as cnt FROM transport_drivers GROUP BY status, vehicle_type`),
      query(`SELECT status, trip_type, COUNT(*) as cnt FROM transport_trips GROUP BY status, trip_type`),
      query(`SELECT from_zone, to_zone, fare_car, fare_rickshaw, fare_delivery, fare_motorcycle FROM transport_fares ORDER BY from_zone, to_zone`),
      query(`SELECT key, value FROM admin_settings WHERE key IN ('transport_enabled','transport_status','transport_note','transport_phone')`),
      query(`SELECT id, name, status, operator_share_pct FROM transport_operators WHERE status='active' ORDER BY name`),
    ]);
    const settingsMap: Record<string, string> = {};
    for (const r of settings.rows) settingsMap[r.key] = r.value;
    return res.json({
      drivers: drivers.rows,
      trips: trips.rows,
      fares: fares.rows,
      settings: settingsMap,
      operators: operators.rows,
    });
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
  } catch (e) { console.error("student_libraries/merchant_spaces init:", e); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
});

// ── DELETE /api/phone-shops/:id/products/:pid ────────────────────
router.delete("/phone-shops/:id/products/:pid", async (req: Request, res: Response) => {
  try {
    const shopId = Number(req.params.id);
    if (!await isShopOwner(req, shopId)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM phone_products WHERE id=$1 AND shop_id=$2`, [req.params.pid, shopId]);
    await query(`UPDATE phone_shops SET products_count=GREATEST(products_count-1,0) WHERE id=$1`, [shopId]);
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
})().catch(e => console.error("events init:", e)));

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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error(e); return res.status(500).json({ error: "Server error" }); }
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
  } catch { return res.status(500).json({ error: "Server error" }); }
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
    });
  } catch (e: any) { console.error("full-stats error:", e?.message); return res.status(500).json({ error: "Server error" }); }
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
  } catch (e) { console.error("Push send error:", e); }
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
  } catch (e) { console.error("Broadcast error:", e); }
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

export default router;
