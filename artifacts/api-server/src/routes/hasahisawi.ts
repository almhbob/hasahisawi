import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      max: 15,
      allowExitOnIdle: false,
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
    }).catch(() => {});
  } catch {}
}

const DEFAULT_ADMIN_PIN = process.env.DEFAULT_ADMIN_PIN ?? "4444";

// ── reCAPTCHA v2 verification ────────────────────────────────────────────────
async function verifyRecaptcha(token: string | undefined): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return true; // skip if not configured
  // [FIX-A] التطبيق المحمول لا يُرسل recaptcha_token — نتجاهله للموبايل
  if (!token)  return true;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${token}`,
      { method: "POST", signal: ctrl.signal }
    );
    clearTimeout(tid);
    const data = await res.json() as { success: boolean };
    return data.success === true;
  } catch {
    return true; // [FIX-A] عند فشل التحقق من رeCAPTCHA لا نحجب الطلب
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
  // ربط مشرف الشركة المُشغِّلة بالشركة (لعزل لوحة "مشوارك علينا" عن المنصة العامة)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS operator_id INTEGER`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_operator_id ON users(operator_id)`);

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

  // [FIX-4] فهارس حيوية مفقودة — بدونها كل طلب authenticated يُجري full table scan
  await query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_token      ON user_sessions(token)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_email              ON users(LOWER(email))`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_phone              ON users(phone)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_firebase_uid       ON users(firebase_uid)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_posts_author      ON social_posts(author_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_posts_created     ON social_posts(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_likes_post        ON social_likes(post_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_social_comments_post     ON social_comments(post_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user         ON push_tokens(user_id)`);
}

export default router;
