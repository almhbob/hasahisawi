import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import multer from "multer";
import * as path from "node:path";
import * as fs from "node:fs";

// ── إعداد رفع الملفات ────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function uploadToCloudinary(buffer: Buffer, mimeType: string, folder = "hasahisawi"): Promise<string> {
  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return new Promise((resolve, reject) => {
    const isVideo = mimeType.startsWith("video/");
    // لا نُحدّد format — Cloudinary يحوّل تلقائياً إلى صيغة متوافقة مع الويب
    // تحديد format: "heic" مثلاً يُفشل الرفع لأن Cloudinary لا يحفظ بصيغة heic
    const uploadOptions: Record<string, any> = {
      folder,
      resource_type: isVideo ? "video" : "image",
    };
    // للصور فقط: حوّل HEIC/HEIF إلى jpg تلقائياً
    if (!isVideo && (mimeType.includes("heic") || mimeType.includes("heif"))) {
      uploadOptions.format = "jpg";
    }
    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (err, result) => {
        if (err || !result) return reject(err || new Error("فشل رفع الملف إلى Cloudinary"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

function saveLocally(buffer: Buffer, originalName: string): string {
  // على Vercel (serverless) لا يوجد تخزين دائم — نستخدم /tmp كـ fallback مؤقت فقط
  const uploadsDir = process.env.VERCEL ? "/tmp/uploads" : path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const ext = path.extname(originalName) || ".jpg";
  const fname = `${Date.now()}_${randomBytes(4).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, fname), buffer);
  return `/api/files/${fname}`;
}

// ── Expo Push Notifications ───────────────────────────────────────────────────
const PUSH_CHANNEL_IDS: Record<string, string> = {
  DEFAULT:   "hasahisawi-default",
  CHAT:      "hasahisawi-chat",
  URGENT:    "hasahisawi-urgent",
  TRANSPORT: "hasahisawi-transport",
  PRAYER:    "hasahisawi-prayer",
};
const PUSH_CHANNEL_SOUNDS: Record<string, string> = {
  DEFAULT:   "hasahisawi_notif.wav",
  CHAT:      "hasahisawi_chat.wav",
  URGENT:    "hasahisawi_urgent.wav",
  TRANSPORT: "hasahisawi_notif.wav",
  PRAYER:    "hasahisawi_prayer.wav",
};

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  channel: keyof typeof PUSH_CHANNEL_IDS = "DEFAULT",
): Promise<void> {
  const validTokens = tokens.filter(t => t && t.startsWith("ExponentPushToken["));
  if (!validTokens.length) return;
  const channelId = PUSH_CHANNEL_IDS[channel] ?? PUSH_CHANNEL_IDS["DEFAULT"];
  const sound     = PUSH_CHANNEL_SOUNDS[channel] ?? PUSH_CHANNEL_SOUNDS["DEFAULT"];
  const priority  = channel === "URGENT" ? "high" : "normal";

  const messages = validTokens.map(to => ({
    to, title, body, data: { ...data, channelId },
    sound,           // iOS: ملف الصوت بالامتداد
    channelId,       // Android: يحدد القناة وصوتها
    priority,
    badge: 1,
  }));

  // Expo يقبل 100 رسالة كحد أقصى في كل طلب
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    }).catch(e => console.error("Expo Push error:", e));
  }
}

// إرسال Push لكل مستخدمي التطبيق
async function broadcastPush(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  channel: keyof typeof PUSH_CHANNEL_IDS = "DEFAULT",
): Promise<void> {
  try {
    const r = await query("SELECT DISTINCT token FROM push_tokens WHERE token IS NOT NULL");
    const tokens = r.rows.map((row: any) => row.token as string);
    await sendExpoPush(tokens, title, body, data, channel);
  } catch (e) { console.error("broadcastPush error:", e); }
}

// حفظ إشعار في قاعدة البيانات (null=بث عام، userId=إشعار شخصي)
async function saveUserNotif(
  title: string,
  body: string,
  type: string = "general",
  userId?: number,
): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (title, body, type, user_id) VALUES ($1, $2, $3, $4)`,
      [title.substring(0, 200), body.substring(0, 1000), type.substring(0, 50), userId ?? null],
    );
  } catch {}
}

// إرسال Push لمستخدم بعينه (بواسطة user_id)
async function pushToUser(
  userId: number,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  channel: keyof typeof PUSH_CHANNEL_IDS = "DEFAULT",
  save = true,
): Promise<void> {
  try {
    const r = await query("SELECT token FROM push_tokens WHERE user_id = $1", [userId]);
    const tokens = r.rows.map((row: any) => row.token as string);
    await sendExpoPush(tokens, title, body, data, channel);
    if (save) void saveUserNotif(title, body, (data.type as string) || channel.toLowerCase(), userId);
  } catch (e) { console.error("pushToUser error:", e); }
}

// إرسال Push لكل المشرفين والمدراء عند ورود طلب جديد
async function pushToAdmins(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  channel: keyof typeof PUSH_CHANNEL_IDS = "DEFAULT",
): Promise<void> {
  try {
    const r = await query(
      `SELECT DISTINCT pt.token FROM push_tokens pt
       JOIN users u ON u.id = pt.user_id
       WHERE u.role IN ('admin','moderator') AND pt.token IS NOT NULL`,
    );
    const tokens = r.rows.map((row: any) => row.token as string);
    await sendExpoPush(tokens, title, body, data, channel);
  } catch (e) { console.error("pushToAdmins error:", e); }
}

async function sendAdminNotifEmail(subject: string, rows: Record<string, string>): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const adminEmail = process.env.ADMIN_EMAIL || "almhbob.iii@gmail.com";
  const tableRows = Object.entries(rows)
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:bold;background:#f3f4f6;color:#374151">${k}</td><td style="padding:6px 12px;color:#111827">${v}</td></tr>`)
    .join("");
  const html = `<div dir="rtl" style="font-family:Cairo,Arial,sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9fafb;border-radius:12px">
    <h2 style="color:#1d4ed8;border-bottom:2px solid #e5e7eb;padding-bottom:12px">${subject}</h2>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">${tableRows}</table>
    <p style="color:#6b7280;font-size:12px;margin-top:16px">تطبيق حصاحيصاوي — إشعار تلقائي</p>
  </div>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "onboarding@resend.dev", to: [adminEmail], subject, html }),
    });
  } catch {}
}

const DEFAULT_ADMIN_PIN = "4444";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function initDb() {
  // Social tables
  await query(`
    CREATE TABLE IF NOT EXISTS social_posts (
      id SERIAL PRIMARY KEY,
      author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
      content TEXT NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'عام',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
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
  // Admin settings table
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
  // Users table
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
  // Migrations: add columns if they don't exist
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(30) UNIQUE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128) UNIQUE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS video_url TEXT`);
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES social_comments(id) ON DELETE CASCADE`);
  await query(`CREATE TABLE IF NOT EXISTS social_reactions (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    device_id VARCHAR(200) NOT NULL,
    reaction VARCHAR(20) NOT NULL DEFAULT 'like',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, device_id)
  )`);
  // Sessions table
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
    )
  `);
  // Migration: add expires_at if missing
  await query(`
    ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
  `);

  // Push tokens table
  await query(`CREATE TABLE IF NOT EXISTS push_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(300) NOT NULL UNIQUE,
    platform VARCHAR(10) NOT NULL DEFAULT 'android',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // OTP tokens table — create + migrate
  await query(`
    CREATE TABLE IF NOT EXISTS otp_tokens (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(200) NOT NULL,
      otp VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE otp_tokens ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE otp_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  // QR login sessions table
  await query(`
    CREATE TABLE IF NOT EXISTS qr_sessions (
      id SERIAL PRIMARY KEY,
      token VARCHAR(64) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      auth_token VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 minutes')
    )
  `);
  // Moderator permissions table
  await query(`
    CREATE TABLE IF NOT EXISTS moderator_permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section VARCHAR(50) NOT NULL,
      UNIQUE(user_id, section)
    )
  `);
  // Notifications table
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
  // إضافة user_id للإشعارات الشخصية (null = بث عام)
  await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`).catch(() => {});
  // City news table
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
  // Clean up expired sessions on startup
  await query("DELETE FROM user_sessions WHERE expires_at < NOW()");

  // Bootstrap: ensure admin account exists
  const adminEmail = "almhbob.iii@gmail.com";
  const existingAdmin = await query("SELECT id FROM users WHERE LOWER(email) = LOWER($1)", [adminEmail]);
  if (existingAdmin.rows.length === 0) {
    const adminHash = await bcrypt.hash("Almhbob2013#", 10);
    await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      ["المحبوب", adminEmail, adminHash]
    );
  } else {
    // Ensure admin role is always set
    await query(
      `UPDATE users SET role='admin' WHERE LOWER(email)=LOWER($1) AND role != 'admin'`,
      [adminEmail]
    );
  }

  // New Tables for Enhanced Features
  // 1. Ratings Table
  await query(`
    CREATE TABLE IF NOT EXISTS ratings (
      id SERIAL PRIMARY KEY,
      target_type VARCHAR(50) NOT NULL, -- 'facility', 'org', 'salon', 'employee'
      target_id VARCHAR(100) NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 2. Appointments Table
  await query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type VARCHAR(50) NOT NULL, -- 'clinic', 'salon'
      target_id VARCHAR(100) NOT NULL,
      appointment_date DATE NOT NULL,
      appointment_time VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'completed'
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 3. Women's Services Table
  await query(`
    CREATE TABLE IF NOT EXISTS women_services (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(50) NOT NULL, -- 'salon', 'service'
      address TEXT NOT NULL,
      phone VARCHAR(20) NOT NULL,
      hours VARCHAR(100),
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 4. Organizations & Initiatives Table
  await query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(50) NOT NULL, -- 'charity', 'initiative'
      description TEXT NOT NULL,
      contact_info TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // 5. Chat Tables
  await query(`
    CREATE TABLE IF NOT EXISTS chats (
      id SERIAL PRIMARY KEY,
      user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_message TEXT,
      last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      unread_user1 INTEGER NOT NULL DEFAULT 0,
      unread_user2 INTEGER NOT NULL DEFAULT 0,
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
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ── Seed: حساب الآدمن الافتراضي ─────────────────────────────────────────
  try {
    const adminEmail = "almhbob.iii@gmail.com";
    const existing = await query("SELECT id FROM users WHERE email=$1", [adminEmail]);
    if (!existing.rows[0]) {
      const hash = await bcrypt.hash("Almhbob2013#", 10);
      await query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'admin')
         ON CONFLICT (email) DO UPDATE SET role='admin', password_hash=$3`,
        ["عاصم عبدالرحمن", adminEmail, hash]
      );
    } else {
      // تأكد من أن الدور admin
      await query("UPDATE users SET role='admin' WHERE email=$1 AND role!='admin'", [adminEmail]);
    }
  } catch {}
}

async function getAdminPinFromDb(): Promise<string> {
  const result = await query("SELECT value FROM admin_settings WHERE key = 'admin_pin'");
  return result.rows[0]?.value || DEFAULT_ADMIN_PIN;
}

// ── Data protection helpers ────────────────────────────────────────────────

/** Mask a national ID: show only the last 4 digits, rest as stars */
function maskNationalId(nid: string | null | undefined): string | null {
  if (!nid) return null;
  if (nid.length <= 4) return "****";
  return "*".repeat(nid.length - 4) + nid.slice(-4);
}

/** Strip sensitive fields and mask national_id before sending to client */
function safeUser(user: Record<string, unknown>): Record<string, unknown> {
  const { password_hash: _, national_id, ...rest } = user;
  return {
    ...rest,
    national_id_masked: maskNationalId(national_id as string),
  };
}

// ── In-memory rate limiter ─────────────────────────────────────────────────
// Allows MAX_ATTEMPTS per window (per IP)
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress
    || "unknown";
}

// ── Session helpers ────────────────────────────────────────────────────────

async function getSessionUser(req: Request): Promise<{ id: number; role: string; name: string; permissions?: string[] } | null> {
  try {
    const auth = req.headers["authorization"] || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return null;
    const result = await query(
      `SELECT u.id, u.role, u.name, u.is_banned FROM users u
       JOIN user_sessions s ON s.user_id = u.id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    const user = result.rows[0];
    if (!user) return null;
    if (user.is_banned) return null;
    if (user.role === "moderator") {
      const perms = await query("SELECT section FROM moderator_permissions WHERE user_id = $1", [user.id]);
      user.permissions = perms.rows.map((r: any) => r.section);
    }
    return user;
  } catch { return null; }
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const user = await getSessionUser(req);
  return user?.role === "admin" || false;
}

async function isAdminOrModRequest(req: Request): Promise<boolean> {
  const user = await getSessionUser(req);
  return user?.role === "admin" || user?.role === "moderator" || false;
}

async function isAdminOrModeratorForSection(req: Request, section: string): Promise<boolean> {
  const user = await getSessionUser(req);
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role === "moderator" && user.permissions?.includes(section)) return true;
  return false;
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

const SESSION_EXPIRY_INTERVAL = "30 days";

export async function registerRoutes(app: Express): Promise<Server> {

  await initDb();

  // ── POST /api/auth/register ────────────────────────────────────────────────
  // User registration: name + national_id + (phone OR email) + password
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    if (!checkRateLimit(getClientIp(req))) {
      return res.status(429).json({ error: "طلبات كثيرة جداً، انتظر قليلاً وحاول مجدداً" });
    }
    try {
      const { name, national_id, phone, email, password } = req.body;
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: "الاسم مطلوب" });
      }
      let cleanNationalId = null;
      if (national_id && national_id.trim().length > 0) {
        cleanNationalId = national_id.trim().replace(/\s+/g, "");
        if (!/^\d{8,20}$/.test(cleanNationalId)) {
          return res.status(400).json({ error: "الرقم الوطني غير صحيح (8-20 رقماً)" });
        }
      }
      if (!phone && !email) {
        return res.status(400).json({ error: "رقم الهاتف أو البريد الإلكتروني مطلوب" });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      }
      // Check if national_id already exists
      if (cleanNationalId) {
        const existingNid = await query("SELECT id FROM users WHERE national_id = $1", [cleanNationalId]);
        if (existingNid.rows.length > 0) {
          return res.status(409).json({ error: "الرقم الوطني مسجل مسبقاً، لا يمكن فتح حسابين بنفس الرقم" });
        }
      }
      // Check if phone/email already exists
      if (phone) {
        const existing = await query("SELECT id FROM users WHERE phone = $1", [phone.trim()]);
        if (existing.rows.length > 0) return res.status(409).json({ error: "رقم الهاتف مسجل مسبقاً" });
      }
      if (email) {
        const existing = await query("SELECT id FROM users WHERE email = $1", [email.trim().toLowerCase()]);
        if (existing.rows.length > 0) return res.status(409).json({ error: "البريد الإلكتروني مسجل مسبقاً" });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await query(
        `INSERT INTO users (name, national_id, phone, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'user') RETURNING id, name, national_id, phone, email, role, created_at`,
        [
          name.trim().substring(0, 100),
          cleanNationalId,
          phone ? phone.trim() : null,
          email ? email.trim().toLowerCase() : null,
          passwordHash,
        ]
      );
      const user = result.rows[0];
      const token = generateToken();
      await query(
        `INSERT INTO user_sessions (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '${SESSION_EXPIRY_INTERVAL}')`,
        [user.id, token]
      );
      res.status(201).json({ user: safeUser(user), token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/auth/register-admin ─────────────────────────────────────────
  // Admin registration: name + email + password + admin_code (current PIN)
  app.post("/api/auth/register-admin", async (req: Request, res: Response) => {
    try {
      const { name, email, password, admin_code } = req.body;
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: "الاسم مطلوب" });
      }
      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "البريد الإلكتروني مطلوب للمشرفين" });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      }
      // Verify admin registration code
      const currentPin = await getAdminPinFromDb();
      if (admin_code !== currentPin) {
        return res.status(403).json({ error: "رمز التسجيل غير صحيح" });
      }
      const existing = await query("SELECT id FROM users WHERE email = $1", [email.trim().toLowerCase()]);
      if (existing.rows.length > 0) return res.status(409).json({ error: "البريد الإلكتروني مسجل مسبقاً" });

      const passwordHash = await bcrypt.hash(password, 10);
      const result = await query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, 'admin') RETURNING id, name, email, role, created_at`,
        [name.trim().substring(0, 100), email.trim().toLowerCase(), passwordHash]
      );
      const user = result.rows[0];
      const token = generateToken();
      await query(
        `INSERT INTO user_sessions (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '${SESSION_EXPIRY_INTERVAL}')`,
        [user.id, token]
      );
      res.status(201).json({ user: safeUser(user), token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/auth/login ───────────────────────────────────────────────────
  // Login: (phone OR email) + password
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    if (!checkRateLimit(getClientIp(req))) {
      return res.status(429).json({ error: "محاولات كثيرة جداً، انتظر 15 دقيقة وحاول مجدداً" });
    }
    try {
      const { phone_or_email, password } = req.body;
      if (!phone_or_email || !password) {
        return res.status(400).json({ error: "بيانات الدخول ناقصة" });
      }
      const identifier = phone_or_email.trim().toLowerCase();
      const result = await query(
        `SELECT * FROM users WHERE email = $1 OR phone = $2`,
        [identifier, phone_or_email.trim()]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "البيانات غير صحيحة" });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: "البيانات غير صحيحة" });
      }
      // Clean up expired sessions for this user
      await query("DELETE FROM user_sessions WHERE user_id = $1 AND expires_at < NOW()", [user.id]);
      const token = generateToken();
      await query(
        `INSERT INTO user_sessions (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '${SESSION_EXPIRY_INTERVAL}')`,
        [user.id, token]
      );
      res.json({ user: safeUser(user), token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/auth/admin-login ─────────────────────────────────────────────
  // Admin/Moderator login: email + password (role must be admin or moderator)
  app.post("/api/auth/admin-login", async (req: Request, res: Response) => {
    if (!checkRateLimit(getClientIp(req))) {
      return res.status(429).json({ error: "محاولات كثيرة جداً، انتظر 15 دقيقة وحاول مجدداً" });
    }
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "البريد وكلمة المرور مطلوبان" });
      }
      const result = await query(
        `SELECT * FROM users WHERE email = $1 AND role IN ('admin', 'moderator')`,
        [email.trim().toLowerCase()]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: "البيانات غير صحيحة" });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: "البيانات غير صحيحة" });
      }
      await query("DELETE FROM user_sessions WHERE user_id = $1 AND expires_at < NOW()", [user.id]);
      const token = generateToken();
      await query(
        `INSERT INTO user_sessions (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '${SESSION_EXPIRY_INTERVAL}')`,
        [user.id, token]
      );
      const safeU = safeUser(user);
      if (user.role === "moderator") {
        const perms = await query("SELECT section FROM moderator_permissions WHERE user_id = $1", [user.id]);
        (safeU as any).permissions = perms.rows.map((r: any) => r.section);
      }
      res.json({ user: safeU, token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/auth/logout ──────────────────────────────────────────────────
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const auth = req.headers["authorization"] || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (token) await query("DELETE FROM user_sessions WHERE token = $1", [token]);
      // احذف push token الجهاز إن أُرسل مع الطلب
      const { pushToken } = req.body || {};
      if (pushToken) await query("DELETE FROM push_tokens WHERE token = $1", [pushToken]).catch(() => {});
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── GET /api/auth/me ───────────────────────────────────────────────────────
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "غير مسجل الدخول" });
      res.json({ user });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── PATCH /api/auth/me/gender ─────────────────────────────────────────────
  app.patch("/api/auth/me/gender", async (req: Request, res: Response) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "غير مسجل الدخول" });
      const { gender } = req.body;
      if (gender !== "male" && gender !== "female") return res.status(400).json({ error: "الجنس غير صالح" });
      // Gender can only be set once — never overwritten
      const existing = await query(`SELECT gender FROM users WHERE id=$1`, [user.id]);
      if (existing.rows[0]?.gender) return res.status(400).json({ error: "الجنس محدد مسبقاً ولا يمكن تغييره" });
      await query(`UPDATE users SET gender=$1 WHERE id=$2`, [gender, user.id]);
      const updated = await query(`SELECT id, name, email, phone, role, bio, neighborhood, gender, avatar_url FROM users WHERE id=$1`, [user.id]);
      res.json({ user: updated.rows[0] });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── POST /api/auth/qr/generate ────────────────────────────────────────────
  app.post("/api/auth/qr/generate", async (req: Request, res: Response) => {
    try {
      // Clean up expired sessions first
      await query("DELETE FROM qr_sessions WHERE expires_at < NOW()");
      const token = generateToken();
      await query("INSERT INTO qr_sessions (token) VALUES ($1)", [token]);
      res.json({ token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── GET /api/auth/qr/:token/poll ──────────────────────────────────────────
  app.get("/api/auth/qr/:token/poll", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const r = await query(
        "SELECT status, auth_token, expires_at FROM qr_sessions WHERE token = $1",
        [token]
      );
      if (!r.rows.length) return res.json({ status: "expired" });
      const row = r.rows[0];
      if (new Date(row.expires_at) < new Date()) {
        await query("DELETE FROM qr_sessions WHERE token = $1", [token]);
        return res.json({ status: "expired" });
      }
      res.json({
        status: row.status,
        token: row.status === "confirmed" ? row.auth_token : undefined,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/auth/qr/:token/scan — marks QR as scanned (mobile seen it) ─
  app.post("/api/auth/qr/:token/scan", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "غير مسجل الدخول" });
      await query(
        "UPDATE qr_sessions SET status = 'scanned' WHERE token = $1 AND status = 'pending' AND expires_at > NOW()",
        [token]
      );
      res.json({ ok: true });
    } catch {
      res.json({ ok: true });
    }
  });

  // ── POST /api/auth/qr/:token/confirm ─────────────────────────────────────
  app.post("/api/auth/qr/:token/confirm", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "غير مسجل الدخول" });

      const r = await query(
        "SELECT id FROM qr_sessions WHERE token = $1 AND status IN ('pending','scanned') AND expires_at > NOW()",
        [token]
      );
      if (!r.rows.length) return res.status(404).json({ error: "رمز QR منتهي الصلاحية أو غير صحيح" });

      // Create a new session for the web device
      const webToken = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await query(
        "INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)",
        [user.id, webToken, expiresAt]
      );
      await query(
        "UPDATE qr_sessions SET status = 'confirmed', user_id = $1, auth_token = $2 WHERE token = $3",
        [user.id, webToken, token]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/admin/validate-pin ──────────────────────────────────────────
  app.post("/api/admin/validate-pin", async (req: Request, res: Response) => {
    try {
      const { pin } = req.body;
      const storedPin = await getAdminPinFromDb();
      res.json({ valid: pin === storedPin });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/admin/change-pin ────────────────────────────────────────────
  app.post("/api/admin/change-pin", async (req: Request, res: Response) => {
    try {
      const { currentPin, newPin } = req.body;
      const storedPin = await getAdminPinFromDb();
      if (currentPin !== storedPin) {
        return res.status(401).json({ error: "رمز PIN الحالي غير صحيح" });
      }
      if (!newPin || newPin.length < 4) {
        return res.status(400).json({ error: "رمز PIN الجديد يجب أن يكون 4 أرقام على الأقل" });
      }
      await query("UPDATE admin_settings SET value = $1 WHERE key = 'admin_pin'", [newPin]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── GET /api/admin/name ───────────────────────────────────────────────────
  app.get("/api/admin/name", async (_req: Request, res: Response) => {
    try {
      const result = await query("SELECT value FROM admin_settings WHERE key = 'admin_name'");
      res.json({ name: result.rows[0]?.value || "المسؤول" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/admin/name ──────────────────────────────────────────────────
  app.post("/api/admin/name", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const { name } = req.body;
      const safeName = (name || "المسؤول").substring(0, 100);
      await query("UPDATE admin_settings SET value = $1 WHERE key = 'admin_name'", [safeName]);
      res.json({ success: true, name: safeName });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── GET /api/admin/users ──────────────────────────────────────────────────
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const result = await query(
        "SELECT id, name, national_id, phone, email, role, created_at FROM users ORDER BY created_at DESC"
      );
      const permsResult = await query("SELECT user_id, section FROM moderator_permissions");
      const permsMap: Record<number, string[]> = {};
      for (const row of permsResult.rows) {
        if (!permsMap[row.user_id]) permsMap[row.user_id] = [];
        permsMap[row.user_id].push(row.section);
      }
      const maskedUsers = result.rows.map(u => ({
        id: u.id,
        name: u.name,
        national_id_masked: maskNationalId(u.national_id),
        phone: u.phone,
        email: u.email,
        role: u.role,
        created_at: u.created_at,
        permissions: u.role === "moderator" ? (permsMap[u.id] || []) : undefined,
      }));
      res.json(maskedUsers);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── DELETE /api/admin/users/:id ───────────────────────────────────────────
  app.delete("/api/admin/users/:id", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      await query("DELETE FROM users WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Ratings API ──────────────────────────────────────────────────────────
  app.post("/api/ratings", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    const { target_type, target_id, rating, comment } = req.body;
    if (!target_type || !target_id || !rating) return res.status(400).json({ error: "بيانات ناقصة" });
    try {
      await query(
        "INSERT INTO ratings (target_type, target_id, user_id, rating, comment) VALUES ($1, $2, $3, $4, $5)",
        [target_type, target_id, user?.id || null, rating, comment]
      );
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "خطأ في الخادم" }); }
  });

  // ── Appointments API ─────────────────────────────────────────────────────
  app.post("/api/appointments", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { target_type, target_id, date, time, notes } = req.body;
    try {
      await query(
        "INSERT INTO appointments (user_id, target_type, target_id, appointment_date, appointment_time, notes) VALUES ($1, $2, $3, $4, $5, $6)",
        [user.id, target_type, target_id, date, time, notes]
      );
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "خطأ في الخادم" }); }
  });

  // ── Women Services API ───────────────────────────────────────────────────
  app.get("/api/women-services", async (req: Request, res: Response) => {
    try {
      const result = await query("SELECT * FROM women_services ORDER BY created_at DESC");
      res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "خطأ في الخادم" }); }
  });

  // ── Organizations API ────────────────────────────────────────────────────
  app.get("/api/organizations", async (req: Request, res: Response) => {
    try {
      const result = await query("SELECT * FROM organizations ORDER BY created_at DESC");
      res.json(result.rows);
    } catch (err) { res.status(500).json({ error: "خطأ في الخادم" }); }
  });

  // ── GET /api/posts ─────────────────────────────────────────────────────────
  app.get("/api/posts", async (req: Request, res: Response) => {
    try {
      const deviceId = (req.query.device_id as string) || "";
      const category = (req.query.category as string) || "";
      const page = Math.max(1, parseInt((req.query.page as string) || "1") || 1);
      const limit2 = Math.min(50, Math.max(1, parseInt((req.query.limit as string) || "30") || 30));
      const offset = (page - 1) * limit2;
      const catFilter = category && category !== "الكل" ? "AND p.category = $2" : "";
      const params: any[] = category && category !== "الكل" ? [deviceId, category] : [deviceId];
      const result = await query(
        `SELECT
           p.id, p.author_name, p.content, p.category,
           p.image_url, p.video_url, p.is_pinned,
           COALESCE(p.views_count, 0) AS views_count,
           p.created_at,
           COUNT(DISTINCT c.id)::int AS comments_count,
           COUNT(DISTINCT sl.id)::int AS likes_count,
           BOOL_OR(sl.device_id = $1) AS liked_by_me,
           (SELECT sr.reaction FROM social_reactions sr WHERE sr.post_id=p.id AND sr.device_id=$1 LIMIT 1) AS my_reaction
         FROM social_posts p
         LEFT JOIN social_comments c ON c.post_id = p.id AND c.parent_id IS NULL
         LEFT JOIN social_likes sl ON sl.post_id = p.id
         WHERE 1=1 ${catFilter}
         GROUP BY p.id
         ORDER BY p.is_pinned DESC, p.created_at DESC
         LIMIT ${limit2} OFFSET ${offset}`,
        params
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/posts ────────────────────────────────────────────────────────
  app.post("/api/posts", async (req: Request, res: Response) => {
    try {
      const { author_name, content, category, image_url, video_url } = req.body;
      if ((!content || content.trim().length === 0) && !image_url && !video_url) {
        return res.status(400).json({ error: "المحتوى مطلوب" });
      }
      if (content && content.trim().length > 1000) {
        return res.status(400).json({ error: "المحتوى طويل جداً (الحد الأقصى 1000 حرف)" });
      }
      const result = await query(
        `INSERT INTO social_posts (author_name, content, category, image_url, video_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING *,
           0::int AS comments_count,
           0::int AS likes_count,
           false AS liked_by_me`,
        [
          (author_name || "مجهول").substring(0, 100),
          (content || "").trim(),
          (category || "عام").substring(0, 50),
          image_url || null,
          video_url || null,
        ]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/posts/:id/view ───────────────────────────────────────────────
  app.post("/api/posts/:id/view", async (req: Request, res: Response) => {
    try {
      await query("UPDATE social_posts SET views_count = views_count + 1 WHERE id = $1", [req.params.id]);
      res.json({ ok: true });
    } catch { res.json({ ok: true }); }
  });

  // ── POST /api/posts/:id/react ─────────────────────────────────────────────
  app.post("/api/posts/:id/react", async (req: Request, res: Response) => {
    try {
      const { device_id, reaction } = req.body;
      if (!device_id) return res.status(400).json({ error: "device_id مطلوب" });
      const validReactions = ["like", "love", "haha", "wow", "sad", "angry"];
      const r = validReactions.includes(reaction) ? reaction : "like";
      const existing = await query(
        "SELECT id, reaction FROM social_reactions WHERE post_id=$1 AND device_id=$2",
        [req.params.id, device_id]
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0].reaction === r) {
          await query("DELETE FROM social_reactions WHERE post_id=$1 AND device_id=$2", [req.params.id, device_id]);
          // keep social_likes in sync
          await query("DELETE FROM social_likes WHERE post_id=$1 AND device_id=$2", [req.params.id, device_id]);
          return res.json({ reacted: false, reaction: null });
        }
        await query("UPDATE social_reactions SET reaction=$3 WHERE post_id=$1 AND device_id=$2", [req.params.id, device_id, r]);
        return res.json({ reacted: true, reaction: r });
      }
      await query("INSERT INTO social_reactions (post_id, device_id, reaction) VALUES ($1,$2,$3) ON CONFLICT (post_id,device_id) DO UPDATE SET reaction=$3", [req.params.id, device_id, r]);
      await query("INSERT INTO social_likes (post_id, device_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.params.id, device_id]);
      return res.json({ reacted: true, reaction: r });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── DELETE /api/posts/:id (admin or social moderator) ─────────────────────
  app.delete("/api/posts/:id", async (req: Request, res: Response) => {
    if (!await isAdminOrModeratorForSection(req, "social")) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query("DELETE FROM social_posts WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── GET /api/posts/:id/comments ───────────────────────────────────────────
  app.get("/api/posts/:id/comments", async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT *, COALESCE(parent_id::text, '') AS parent_id_str
         FROM social_comments WHERE post_id = $1 ORDER BY created_at ASC`,
        [req.params.id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/posts/:id/comments ──────────────────────────────────────────
  app.post("/api/posts/:id/comments", async (req: Request, res: Response) => {
    try {
      const { author_name, content, parent_id } = req.body;
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "التعليق مطلوب" });
      }
      if (content.trim().length > 500) {
        return res.status(400).json({ error: "التعليق طويل جداً" });
      }
      const postCheck = await query("SELECT id FROM social_posts WHERE id = $1", [req.params.id]);
      if (postCheck.rows.length === 0) return res.status(404).json({ error: "المنشور غير موجود" });

      const result = await query(
        `INSERT INTO social_comments (post_id, author_name, content, parent_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.params.id, (author_name || "مجهول").substring(0, 100), content.trim(), parent_id || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── DELETE /api/comments/:id (admin or social moderator) ──────────────────
  app.delete("/api/comments/:id", async (req: Request, res: Response) => {
    if (!await isAdminOrModeratorForSection(req, "social")) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query("DELETE FROM social_comments WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/posts/:id/like ──────────────────────────────────────────────
  app.post("/api/posts/:id/like", async (req: Request, res: Response) => {
    try {
      const { device_id } = req.body;
      if (!device_id) return res.status(400).json({ error: "device_id مطلوب" });

      const existing = await query(
        "SELECT id FROM social_likes WHERE post_id = $1 AND device_id = $2",
        [req.params.id, device_id]
      );

      if (existing.rows.length > 0) {
        await query("DELETE FROM social_likes WHERE post_id = $1 AND device_id = $2", [req.params.id, device_id]);
        res.json({ liked: false });
      } else {
        await query("INSERT INTO social_likes (post_id, device_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.params.id, device_id]);
        res.json({ liked: true });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── GET /api/admin/users-source-health ────────────────────────────────────
  app.get("/api/admin/users-source-health", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const pgTotal  = Number((await query("SELECT COUNT(*) FROM users")).rows[0].count);
      const withFb   = Number((await query("SELECT COUNT(*) FROM users WHERE firebase_uid IS NOT NULL")).rows[0].count);
      const apiKey   = process.env.FIREBASE_API_KEY || process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
      // Firebase Admin SDK غير مُهيَّأ — نستخدم REST API للتحقق من الإتاحة فقط
      let firebaseReachable = false;
      if (apiKey) {
        try {
          const r = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
            { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken: "probe" }), signal: AbortSignal.timeout(5000) }
          );
          firebaseReachable = r.status === 400 || r.status === 200;
        } catch {}
      }
      // الحالة: Firebase Admin SDK غير متاح، لكن يمكننا إظهار إحصائيات DB
      const status = !apiKey ? "missing_env" : firebaseReachable ? "configured" : "firebase_error";
      res.json({
        firebase_admin_configured: false,
        firebase_users: null,
        postgres_users: pgTotal,
        firebase_uid_linked: withFb,
        firebase_missing_in_postgres: null,
        status,
        note: "Firebase Admin SDK غير مُهيَّأ — المستخدمون المُسجَّلون عبر Firebase يظهرون في قاعدة البيانات بعد أول تسجيل دخول.",
      });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/admin/sync-firebase-users ────────────────────────────────────
  app.post("/api/admin/sync-firebase-users", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const pgTotal = Number((await query("SELECT COUNT(*) FROM users")).rows[0].count);
      const withFb  = Number((await query("SELECT COUNT(*) FROM users WHERE firebase_uid IS NOT NULL")).rows[0].count);
      // Firebase Admin SDK غير مُهيَّأ — لا يمكن استيراد المستخدمين مباشرةً من Firebase
      res.json({
        success: true,
        firebase_total: withFb,
        postgres_total: pgTotal,
        created: 0,
        updated: 0,
        errors: 0,
        message: "Firebase Admin SDK غير مُهيَّأ. المستخدمون الموجودون في قاعدة البيانات: " + pgTotal + " · مرتبط بـ Firebase: " + withFb,
      });
    } catch (err) {
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── PUT /api/admin/users/:id/role ─────────────────────────────────────────
  // Admin only: change user role (user ↔ moderator). Cannot change admin roles.
  app.put("/api/admin/users/:id/role", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const { role } = req.body;
      if (!role || !["user", "moderator"].includes(role)) {
        return res.status(400).json({ error: "الدور غير صالح" });
      }
      const targetUser = await query("SELECT id, role FROM users WHERE id = $1", [req.params.id]);
      if (targetUser.rows.length === 0) return res.status(404).json({ error: "المستخدم غير موجود" });
      if (targetUser.rows[0].role === "admin") {
        return res.status(403).json({ error: "لا يمكن تغيير دور المسؤول" });
      }
      await query("UPDATE users SET role = $1 WHERE id = $2", [role, req.params.id]);
      if (role === "user") {
        await query("DELETE FROM moderator_permissions WHERE user_id = $1", [req.params.id]);
      }
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── GET /api/admin/users/:id/permissions ─────────────────────────────────
  app.get("/api/admin/users/:id/permissions", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const result = await query("SELECT section FROM moderator_permissions WHERE user_id = $1", [req.params.id]);
      res.json({ permissions: result.rows.map((r: any) => r.section) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── PUT /api/admin/users/:id/permissions ─────────────────────────────────
  // Admin only: set moderator sections (replaces all existing permissions)
  app.put("/api/admin/users/:id/permissions", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const { sections } = req.body;
      if (!Array.isArray(sections)) return res.status(400).json({ error: "الأقسام مطلوبة" });
      const validSections = ["medical", "schools", "institutions", "sports", "culture", "lost", "jobs", "market", "social", "calendar"];
      const filtered = sections.filter((s: string) => validSections.includes(s));
      await query("DELETE FROM moderator_permissions WHERE user_id = $1", [req.params.id]);
      for (const section of filtered) {
        await query("INSERT INTO moderator_permissions (user_id, section) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.params.id, section]);
      }
      res.json({ success: true, permissions: filtered });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Push Tokens ────────────────────────────────────────────────────────────
  app.post("/api/push-tokens", async (req: Request, res: Response) => {
    try {
      const user = await getSessionUser(req);
      const { token, platform } = req.body;
      if (!token || !token.startsWith("ExponentPushToken[")) {
        return res.status(400).json({ error: "توكن غير صالح" });
      }
      if (user) {
        await query(
          `INSERT INTO push_tokens (user_id, token, platform, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (token) DO UPDATE SET user_id=$1, platform=$3, updated_at=NOW()`,
          [user.id, token, platform || "android"]
        );
      } else {
        // حفظ الرمز بدون مستخدم (حالة نادرة)
        await query(
          `INSERT INTO push_tokens (token, platform, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (token) DO UPDATE SET platform=$2, updated_at=NOW()`,
          [token, platform || "android"]
        );
      }
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/push-tokens", async (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (token) await query("DELETE FROM push_tokens WHERE token = $1", [token]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── GET /api/notifications ────────────────────────────────────────────────────────────────────────────────────
  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const user = await getSessionUser(req).catch(() => null);
      const userId = user?.id ?? null;
      const result = await query(
        `SELECT * FROM notifications WHERE user_id IS NULL OR user_id = $1
         ORDER BY created_at DESC LIMIT 80`,
        [userId],
      );
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/notifications (admin only) ────────────────────────────────────────────────────────────────────────────────
  app.post("/api/notifications", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const { title, body, type, channel } = req.body;
      if (!title || !body) return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });
      const result = await query(
        "INSERT INTO notifications (title, body, type) VALUES ($1, $2, $3) RETURNING *",
        [title.substring(0, 200), body.substring(0, 1000), (type || "general").substring(0, 50)]
      );
      // إرسال Push Notification لجميع المستخدمين تلقائياً
      const pushChannel = (channel?.toUpperCase() ?? "DEFAULT") as keyof typeof PUSH_CHANNEL_IDS;
      broadcastPush(title, body, { notifId: result.rows[0].id, type: type || "general" }, pushChannel).catch(() => {});
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── PUT /api/notifications/:id/read ────────────────────────────────────────────────────────────────────────────────
  app.put("/api/notifications/:id/read", async (req: Request, res: Response) => {
    try {
      await query("UPDATE notifications SET is_read = TRUE WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── PUT /api/notifications/read-all ────────────────────────────────────────────────────────────────────────────────
  app.put("/api/notifications/read-all", async (req: Request, res: Response) => {
    try {
      const user = await getSessionUser(req).catch(() => null);
      const userId = user?.id ?? null;
      await query(
        `UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE AND (user_id IS NULL OR user_id = $1)`,
        [userId],
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── DELETE /api/notifications/:id (admin only) ────────────────────────────────────────────────────────────────────────────────
  app.delete("/api/notifications/:id", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      await query("DELETE FROM notifications WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── التهنئات المجتمعية ────────────────────────────────────────────────────────
  async function ensureGreetingsTables() {
    await query(`CREATE TABLE IF NOT EXISTS greeting_posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
      text TEXT NOT NULL,
      occasion_name VARCHAR(100) NOT NULL DEFAULT 'تهنئة عامة',
      occasion_key VARCHAR(50),
      card_style VARCHAR(30),
      likes_count INTEGER NOT NULL DEFAULT 0,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS greeting_likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES greeting_posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      device_id VARCHAR(200)
    )`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS greeting_likes_unique_idx
      ON greeting_likes (post_id, COALESCE(user_id::text, device_id))`).catch(() => {});
    await query(`ALTER TABLE greeting_posts ADD COLUMN IF NOT EXISTS occasion_key VARCHAR(50)`).catch(() => {});
    await query(`ALTER TABLE greeting_posts ADD COLUMN IF NOT EXISTS card_style VARCHAR(30)`).catch(() => {});
    await query(`ALTER TABLE greeting_posts ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0`).catch(() => {});
    await query(`ALTER TABLE greeting_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE`).catch(() => {});
  }

  app.get("/api/greetings", async (req: Request, res: Response) => {
    try {
      await ensureGreetingsTables();
      const limit = Math.min(parseInt(String(req.query.limit || "40")) || 40, 100);
      const occ = req.query.occasion as string | undefined;
      let sql = `SELECT g.*, u.name as user_display_name FROM greeting_posts g
                 LEFT JOIN users u ON u.id = g.user_id`;
      const params: any[] = [];
      if (occ) { sql += ` WHERE g.occasion_key = $1`; params.push(occ); }
      sql += ` ORDER BY g.is_pinned DESC, g.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);
      const r = await query(sql, params);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/greetings", async (req: Request, res: Response) => {
    try {
      await ensureGreetingsTables();
      const user = await getSessionUser(req);
      const { text, occasion_name, occasion_key, card_style } = req.body;
      if (!text?.trim()) return res.status(400).json({ error: "نص التهنئة مطلوب" });
      if (text.length > 600) return res.status(400).json({ error: "النص طويل جداً (الحد 600 حرف)" });
      const authorName = user?.name ?? "مجهول";
      const r = await query(
        `INSERT INTO greeting_posts (user_id, author_name, text, occasion_name, occasion_key, card_style)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user?.id ?? null, authorName, text.trim(), occasion_name || "تهنئة عامة", occasion_key || null, card_style || null]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/greetings/:id/like", async (req: Request, res: Response) => {
    try {
      await ensureGreetingsTables();
      const user = await getSessionUser(req);
      const { device_id } = req.body;
      const postId = parseInt(req.params.id);
      try {
        await query(
          `INSERT INTO greeting_likes (post_id, user_id, device_id) VALUES ($1, $2, $3)`,
          [postId, user?.id ?? null, device_id || null]
        );
        await query(`UPDATE greeting_posts SET likes_count = likes_count + 1 WHERE id = $1`, [postId]);
        res.json({ liked: true });
      } catch {
        // already liked — unlike
        await query(`DELETE FROM greeting_likes WHERE post_id=$1 AND (user_id=$2 OR device_id=$3)`,
          [postId, user?.id ?? null, device_id || null]);
        await query(`UPDATE greeting_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1`, [postId]);
        res.json({ liked: false });
      }
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/greetings/:id", async (req: Request, res: Response) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "غير مصرح" });
      await query(`DELETE FROM greeting_posts WHERE id=$1 AND (user_id=$2 OR $3)`,
        [req.params.id, user.id, user.role === "admin"]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── GET /api/news ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  app.get("/api/news", async (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      let sql = "SELECT * FROM city_news";
      const params: unknown[] = [];
      if (category && category !== "all") {
        sql += " WHERE category = $1";
        params.push(category);
      }
      sql += " ORDER BY is_pinned DESC, created_at DESC LIMIT 100";
      const result = await query(sql, params);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/news (admin only) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  app.post("/api/news", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const { title, content, category, author_name, is_pinned } = req.body;
      if (!title || !content) return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });
      const result = await query(
        "INSERT INTO city_news (title, content, category, author_name, is_pinned) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [
          title.substring(0, 300),
          content.substring(0, 5000),
          (category || "general").substring(0, 50),
          (author_name || "إدارة التطبيق").substring(0, 100),
          is_pinned === true
        ]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── PUT /api/news/:id (admin only) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  app.put("/api/news/:id", async (req: Request, res: Response) => {
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
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── DELETE /api/news/:id (admin only) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  app.delete("/api/news/:id", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      await query("DELETE FROM city_news WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── GET /api/stats (public stats for landing page) ────────────────────────────────────────────────────────────────────────────────
  app.get("/api/stats", async (_req: Request, res: Response) => {
    try {
      const [usersResult, postsResult, newsResult] = await Promise.all([
        query("SELECT COUNT(*)::int AS count FROM users"),
        query("SELECT COUNT(*)::int AS count FROM social_posts"),
        query("SELECT COUNT(*)::int AS count FROM city_news"),
      ]);
      res.json({
        users: usersResult.rows[0]?.count || 0,
        posts: postsResult.rows[0]?.count || 0,
        news: newsResult.rows[0]?.count || 0,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Health check ─────────────────────────────────────────────────────────
  app.get("/api/healthz", (_req: Request, res: Response) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  // ── Ban / Unban user (admin only) ─────────────────────────────────────────
  app.post("/api/admin/users/:id/ban", async (req: Request, res: Response) => {
    try {
      if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const { banned, reason } = req.body;
      await query(
        `UPDATE users SET is_banned=$1 WHERE id=$2`,
        [banned === true, req.params.id]
      );
      res.json({ success: true, banned: banned === true, reason });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Update user profile ───────────────────────────────────────────────────
  app.put("/api/users/me", async (req: Request, res: Response) => {
    try {
      const me = await getSessionUser(req);
      if (!me) return res.status(401).json({ error: "غير مصرح" });
      const { name, bio, neighborhood, gender, birth_date, avatar_url } = req.body;

      // الجنس يُحدَّد مرة واحدة فقط ولا يمكن تعديله لاحقاً (حماية من التلاعب)
      const existingUser = await query("SELECT gender FROM users WHERE id=$1", [me.id]);
      const existingGender = existingUser.rows[0]?.gender;
      const genderToSet = existingGender ? existingGender : (gender || null);

      await query(
        `UPDATE users SET
          name = COALESCE($1, name),
          bio = COALESCE($2, bio),
          neighborhood = COALESCE($3, neighborhood),
          gender = COALESCE($4, gender),
          birth_date = COALESCE($5, birth_date),
          avatar_url = COALESCE($6, avatar_url)
         WHERE id = $7`,
        [name || null, bio || null, neighborhood || null, genderToSet, birth_date || null, avatar_url || null, me.id]
      );
      const updated = await query(
        `SELECT id, name, email, phone, role, bio, neighborhood, gender, avatar_url, created_at FROM users WHERE id=$1`,
        [me.id]
      );
      res.json({ user: updated.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Get user profile ───────────────────────────────────────────────────────
  app.get("/api/users/:id/profile", async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT id, name, role, bio, neighborhood, avatar_url, created_at FROM users WHERE id=$1`,
        [req.params.id]
      );
      if (!result.rows[0]) return res.status(404).json({ error: "المستخدم غير موجود" });
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Firebase token exchange ────────────────────────────────────────────────
  app.post("/api/auth/firebase-exchange", async (req: Request, res: Response) => {
    try {
      const { idToken, name: displayName } = req.body;
      if (!idToken) return res.status(400).json({ error: "idToken مطلوب" });

      // Verify Firebase token via REST API
      const apiKey = process.env.FIREBASE_API_KEY || process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Firebase غير مُعدّ على الخادم" });

      const verifyRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) }
      );
      if (!verifyRes.ok) return res.status(401).json({ error: "التوكن غير صالح" });
      const verifyData: any = await verifyRes.json();
      const firebaseUser = verifyData.users?.[0];
      if (!firebaseUser) return res.status(401).json({ error: "التوكن غير صالح" });

      const uid = firebaseUser.localId as string;
      const email = (firebaseUser.email as string || "").toLowerCase();
      const fbName = displayName || firebaseUser.displayName || "مستخدم";

      // Find or create user
      let userRow = (await query(`SELECT * FROM users WHERE firebase_uid=$1`, [uid])).rows[0];
      if (!userRow && email) {
        userRow = (await query(`SELECT * FROM users WHERE LOWER(email)=$1`, [email])).rows[0];
        if (userRow) {
          await query(`UPDATE users SET firebase_uid=$1 WHERE id=$2`, [uid, userRow.id]);
        }
      }
      if (!userRow) {
        const inserted = await query(
          `INSERT INTO users (name, email, firebase_uid, password_hash, role)
           VALUES ($1, $2, $3, '', 'user') RETURNING *`,
          [fbName.substring(0, 100), email || null, uid]
        );
        userRow = inserted.rows[0];
      }
      if (userRow.is_banned) return res.status(403).json({ error: "تم حظر هذا الحساب" });

      // Auto-promote admin email
      if (email === "almhbob.iii@gmail.com" && userRow.role !== "admin") {
        await query(`UPDATE users SET role='admin' WHERE id=$1`, [userRow.id]);
        userRow.role = "admin";
      }

      const token = generateToken();
      await query(
        `INSERT INTO user_sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
        [userRow.id, token]
      );
      // needs_profile=true إذا لم يُحدَّد الجنس بعد (مستخدم Google جديد)
      const needs_profile = !userRow.gender;
      res.json({ user: safeUser(userRow), token, needs_profile });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── Chat API ──────────────────────────────────────────────────────────────

  // قائمة المستخدمين (للبدء بمحادثة جديدة)
  app.get("/api/users/list", async (req: Request, res: Response) => {
    try {
      const me = await getSessionUser(req);
      if (!me) return res.status(401).json({ error: "غير مصرح" });
      const result = await query(
        `SELECT id, name, role, NULL::text AS avatar_url FROM users WHERE id != $1 ORDER BY name LIMIT 100`,
        [me.id]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // جلب إجمالي الرسائل غير المقروءة
  app.get("/api/chats/unread", async (req: Request, res: Response) => {
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
      res.status(500).json({ error: "Server error" });
    }
  });

  // جلب جميع المحادثات
  app.get("/api/chats", async (req: Request, res: Response) => {
    try {
      const me = await getSessionUser(req);
      if (!me) return res.status(401).json({ error: "غير مصرح" });
      const result = await query(`
        SELECT c.*,
          u1.name AS user1_name,
          u2.name AS user2_name
        FROM chats c
        JOIN users u1 ON u1.id = c.user1_id
        JOIN users u2 ON u2.id = c.user2_id
        WHERE c.user1_id = $1 OR c.user2_id = $1
        ORDER BY c.last_message_at DESC
      `, [me.id]);
      return res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // إنشاء أو جلب محادثة مع مستخدم آخر
  app.post("/api/chats", async (req: Request, res: Response) => {
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
          u1.name AS user1_name,
          u2.name AS user2_name
        FROM chats c
        JOIN users u1 ON u1.id = c.user1_id
        JOIN users u2 ON u2.id = c.user2_id
        WHERE c.user1_id = $1 AND c.user2_id = $2
      `, [u1, u2]);
      return res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // جلب رسائل محادثة
  app.get("/api/chats/:chatId/messages", async (req: Request, res: Response) => {
    try {
      const me = await getSessionUser(req);
      if (!me) return res.status(401).json({ error: "غير مصرح" });
      const chatId = parseInt(req.params.chatId as string);
      const chat = await query(
        `SELECT * FROM chats WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`,
        [chatId, me.id]
      );
      if (!chat.rows[0]) return res.status(403).json({ error: "غير مصرح" });
      const since = req.query.since as string | undefined;
      const result = await query(
        `SELECT m.*, u.name AS sender_name
         FROM chat_messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.chat_id=$1 ${since ? "AND m.id > $2" : ""}
         ORDER BY m.created_at ASC LIMIT 200`,
        since ? [chatId, parseInt(since)] : [chatId]
      );
      return res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // إرسال رسالة
  app.post("/api/chats/:chatId/messages", async (req: Request, res: Response) => {
    try {
      const me = await getSessionUser(req);
      if (!me) return res.status(401).json({ error: "غير مصرح" });
      const chatId = parseInt(req.params.chatId as string);
      const chat = await query(
        `SELECT * FROM chats WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`,
        [chatId, me.id]
      );
      if (!chat.rows[0]) return res.status(403).json({ error: "غير مصرح" });
      const { content, image_url } = req.body;
      if (!content?.trim() && !image_url) return res.status(400).json({ error: "الرسالة فارغة" });
      const msgType = image_url ? "image" : "text";
      const msgContent = content?.trim() || "";
      const result = await query(
        `INSERT INTO chat_messages (chat_id, sender_id, content, image_url, type)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
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
      return res.json(msg);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // تعليم رسائل المحادثة كمقروءة
  app.post("/api/chats/:chatId/read", async (req: Request, res: Response) => {
    try {
      const me = await getSessionUser(req);
      if (!me) return res.status(401).json({ error: "غير مصرح" });
      const chatId = parseInt(req.params.chatId as string);
      const chat = await query(
        `SELECT * FROM chats WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`,
        [chatId, me.id]
      );
      if (!chat.rows[0]) return res.status(403).json({ error: "غير مصرح" });
      const isUser1 = me.id === chat.rows[0].user1_id;
      await query(
        `UPDATE chats SET ${isUser1 ? "unread_user1=0" : "unread_user2=0"} WHERE id=$1`,
        [chatId]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // قسم شركات الاتصالات
  // ══════════════════════════════════════════════════════════════════

  await query(`
    CREATE TABLE IF NOT EXISTS telecom_companies (
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
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS telecom_offers (
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
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS telecom_events (
      id          SERIAL PRIMARY KEY,
      company_id  INTEGER REFERENCES telecom_companies(id) ON DELETE SET NULL,
      title       VARCHAR(200) NOT NULL,
      description TEXT,
      event_date  TIMESTAMPTZ,
      location    VARCHAR(200),
      image_url   TEXT,
      is_active   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed شركات الاتصالات الافتراضية
  const tcCount = await query(`SELECT COUNT(*) FROM telecom_companies`);
  if (parseInt(tcCount.rows[0].count, 10) === 0) {
    await query(`
      INSERT INTO telecom_companies (name,short,logo_initial,brand_color,brand_color2,description,founded,subscribers,coverage,website,hotline,ussd,recharge,sort_order)
      VALUES
        ('MTN السودان','MTN','M','#FFC107','#FF8F00','أكبر شبكة اتصالات في السودان — تغطية واسعة وخدمات متنوعة','1997','+٢٠ مليون','٩٨٪','https://www.mtn.sd','1800','*100#','*555*[رمز]#',1),
        ('زين السودان','Zain','Z','#E53935','#B71C1C','شبكة اتصالات عالمية بخدمات مميزة وتقنيات حديثة','1997','+١٥ مليون','٩٥٪','https://www.sd.zain.com','111','*1#','*123*[رمز]#',2),
        ('سوداني','Sudani','S','#22C55E','#15803D','الشركة السودانية للاتصالات — حكومية وطنية بخدمات شاملة','1993','+١٠ مليون','٩٠٪','https://www.sudani.sd','1717','*900#','*300*[رمز]#',3)
    `);
  }

  // ── GET /api/telecom/companies ────────────────────────────────────────────
  app.get("/api/telecom/companies", async (req: Request, res: Response) => {
    try {
      const result = await query(`SELECT * FROM telecom_companies WHERE is_active=TRUE ORDER BY sort_order,id`);
      res.json(result.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── GET /api/telecom/offers ───────────────────────────────────────────────
  app.get("/api/telecom/offers", async (req: Request, res: Response) => {
    try {
      const { company_id, category } = req.query as any;
      const result = await query(
        `SELECT o.*, c.name AS company_name, c.brand_color AS company_color
         FROM telecom_offers o
         LEFT JOIN telecom_companies c ON c.id = o.company_id
         WHERE o.is_active=TRUE
           ${company_id && !isNaN(parseInt(company_id)) ? `AND o.company_id=${parseInt(company_id)}` : ""}
           ${category ? `AND o.category=$1` : ""}
         ORDER BY o.sort_order, o.created_at DESC`,
        category ? [category] : []
      );
      res.json(result.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── GET /api/telecom/events ───────────────────────────────────────────────
  app.get("/api/telecom/events", async (req: Request, res: Response) => {
    try {
      const result = await query(
        `SELECT e.*, c.name AS company_name, c.brand_color AS company_color
         FROM telecom_events e
         LEFT JOIN telecom_companies c ON c.id = e.company_id
         WHERE e.is_active=TRUE AND (e.event_date IS NULL OR e.event_date >= NOW() - INTERVAL '1 day')
         ORDER BY e.event_date ASC NULLS LAST, e.created_at DESC LIMIT 50`
      );
      res.json(result.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── Admin: CRUD الشركات ───────────────────────────────────────────────────
  app.post("/api/admin/telecom/companies", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { name, short, logo_initial, brand_color, brand_color2, description, founded, subscribers, coverage, website, hotline, ussd, recharge, sort_order } = req.body;
      if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
      const r = await query(
        `INSERT INTO telecom_companies (name,short,logo_initial,brand_color,brand_color2,description,founded,subscribers,coverage,website,hotline,ussd,recharge,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [name, short||null, logo_initial||null, brand_color||'#0EA5E9', brand_color2||'#2563EB', description||null, founded||null, subscribers||null, coverage||null, website||null, hotline||null, ussd||null, recharge||null, Number(sort_order)||0]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/telecom/companies/:id", async (req: Request, res: Response) => {
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
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/admin/telecom/companies/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM telecom_companies WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── Admin: CRUD العروض ────────────────────────────────────────────────────
  app.get("/api/admin/telecom/offers", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const r = await query(`SELECT o.*, c.name AS company_name FROM telecom_offers o LEFT JOIN telecom_companies c ON c.id=o.company_id ORDER BY o.created_at DESC`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/admin/telecom/offers", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { company_id, title, description, category, price, currency, validity, details, image_url, sort_order } = req.body;
      if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
      const r = await query(
        `INSERT INTO telecom_offers (company_id,title,description,category,price,currency,validity,details,image_url,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [company_id?Number(company_id):null,title,description||null,category||'data',Number(price)||0,currency||'SDG',validity||null,details||null,image_url||null,Number(sort_order)||0]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/telecom/offers/:id", async (req: Request, res: Response) => {
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
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/admin/telecom/offers/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM telecom_offers WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── Admin: CRUD الفعاليات ─────────────────────────────────────────────────
  app.get("/api/admin/telecom/events", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const r = await query(`SELECT e.*, c.name AS company_name FROM telecom_events e LEFT JOIN telecom_companies c ON c.id=e.company_id ORDER BY e.event_date ASC NULLS LAST, e.created_at DESC`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/admin/telecom/events", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { company_id, title, description, event_date, location, image_url } = req.body;
      if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
      const r = await query(
        `INSERT INTO telecom_events (company_id,title,description,event_date,location,image_url)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [company_id?Number(company_id):null,title,description||null,event_date||null,location||null,image_url||null]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/telecom/events/:id", async (req: Request, res: Response) => {
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
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/admin/telecom/events/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM telecom_events WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ══════════════════════════════════════════════════════════════════
  // قسم الاتصالات V2 — بوابة الشركات والخدمات
  // ══════════════════════════════════════════════════════════════════
  const PORTAL_SALT2 = "hasahisawi_telecom_portal_2024";
  function hashPortalPin2(pin: string): string {
    let h = 5381; const str = PORTAL_SALT2 + pin;
    for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36).padStart(12, "0");
  }
  function generatePortalToken2(): string {
    return `tc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
  }
  async function getPortalCompany2(req: Request) {
    const auth = (req.headers.authorization || "") as string;
    if (!auth.startsWith("Bearer tc_")) return null;
    const r = await query(`SELECT * FROM telecom_companies WHERE portal_token=$1 AND is_active=TRUE`, [auth.slice(7)]);
    return r.rows[0] || null;
  }
  async function ensureTelecomV2() {
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
      id SERIAL PRIMARY KEY, company_id INTEGER REFERENCES telecom_companies(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL, description TEXT, icon VARCHAR(50) DEFAULT 'star-outline',
      price VARCHAR(60), category VARCHAR(50) DEFAULT 'other', ussd_code VARCHAR(60), link TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  app.get("/api/telecom/services", async (req: Request, res: Response) => {
    try {
      await ensureTelecomV2();
      const { company_id } = req.query as Record<string, string>;
      let w = "WHERE s.is_active=TRUE"; const p: unknown[] = [];
      if (company_id) { p.push(Number(company_id)); w += ` AND s.company_id=$${p.length}`; }
      const r = await query(`SELECT s.*, c.name AS company_name, c.brand_color AS company_color FROM telecom_services s LEFT JOIN telecom_companies c ON c.id=s.company_id ${w} ORDER BY s.sort_order,s.created_at`, p);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/telecom/companies/promo", async (req: Request, res: Response) => {
    try {
      await ensureTelecomV2();
      const r = await query(`SELECT id,name,short,logo_initial,brand_color,brand_color2,promo_tagline,promo_banner_url,promo_badge,package_type,contract_end FROM telecom_companies WHERE is_active=TRUE AND package_type IN ('standard','premium') AND (contract_end IS NULL OR contract_end >= NOW()) ORDER BY CASE package_type WHEN 'premium' THEN 1 WHEN 'standard' THEN 2 ELSE 3 END, sort_order`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/telecom/portal/login", async (req: Request, res: Response) => {
    try {
      await ensureTelecomV2();
      const { company_id, pin } = req.body;
      if (!company_id || !pin) return res.status(400).json({ error: "بيانات ناقصة" });
      const r = await query(`SELECT * FROM telecom_companies WHERE id=$1 AND is_active=TRUE`, [Number(company_id)]);
      const company = r.rows[0];
      if (!company) return res.status(404).json({ error: "الشركة غير موجودة" });
      if (!company.portal_pin_hash) return res.status(403).json({ error: "لم يُفعَّل الدخول لهذه الشركة بعد" });
      if (company.portal_pin_hash !== hashPortalPin2(String(pin))) return res.status(401).json({ error: "الرمز السري غير صحيح" });
      const token = generatePortalToken2();
      await query(`UPDATE telecom_companies SET portal_token=$1 WHERE id=$2`, [token, company.id]);
      const { portal_pin_hash: _, ...safe } = company;
      res.json({ token, company: { ...safe, portal_token: token } });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/telecom/portal/me", async (req: Request, res: Response) => {
    try {
      await ensureTelecomV2();
      const company = await getPortalCompany2(req);
      if (!company) return res.status(401).json({ error: "غير مصرح" });
      const { portal_pin_hash: _, ...safe } = company;
      res.json(safe);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/telecom/portal/me", async (req: Request, res: Response) => {
    try {
      const company = await getPortalCompany2(req);
      if (!company) return res.status(401).json({ error: "غير مصرح" });
      const { description, website, hotline, ussd, recharge, contact_person, contact_email, promo_tagline, promo_banner_url, promo_badge } = req.body;
      const canBanner = company.package_type === "premium";
      const canPromo  = ["standard","premium"].includes(company.package_type);
      const r = await query(`UPDATE telecom_companies SET description=COALESCE($1,description),website=COALESCE($2,website),hotline=COALESCE($3,hotline),ussd=COALESCE($4,ussd),recharge=COALESCE($5,recharge),contact_person=COALESCE($6,contact_person),contact_email=COALESCE($7,contact_email),promo_tagline=CASE WHEN $8 THEN COALESCE($9,promo_tagline) ELSE promo_tagline END,promo_banner_url=CASE WHEN $10 THEN COALESCE($11,promo_banner_url) ELSE promo_banner_url END,promo_badge=CASE WHEN $8 THEN COALESCE($12,promo_badge) ELSE promo_badge END WHERE id=$13 RETURNING *`,
        [description||null,website||null,hotline||null,ussd||null,recharge||null,contact_person||null,contact_email||null,canPromo,promo_tagline||null,canBanner,promo_banner_url||null,promo_badge||null,company.id]);
      const { portal_pin_hash: _, ...safe } = r.rows[0];
      res.json(safe);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // Portal: offers
  app.get("/api/telecom/portal/offers", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      const r = await query(`SELECT * FROM telecom_offers WHERE company_id=$1 ORDER BY sort_order,created_at DESC`, [c.id]);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/telecom/portal/offers", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      const { title, description, category, price, currency, validity, details, sort_order } = req.body;
      if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
      const r = await query(`INSERT INTO telecom_offers (company_id,title,description,category,price,currency,validity,details,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [c.id,title,description||null,category||'data',Number(price)||0,currency||'SDG',validity||null,details||null,Number(sort_order)||0]);
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/telecom/portal/offers/:id", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      const { title, description, category, price, currency, validity, details, is_active, sort_order } = req.body;
      const r = await query(`UPDATE telecom_offers SET title=COALESCE($1,title),description=COALESCE($2,description),category=COALESCE($3,category),price=COALESCE($4,price),currency=COALESCE($5,currency),validity=COALESCE($6,validity),details=COALESCE($7,details),is_active=COALESCE($8,is_active),sort_order=COALESCE($9,sort_order) WHERE id=$10 AND company_id=$11 RETURNING *`,
        [title||null,description||null,category||null,price!=null?Number(price):null,currency||null,validity||null,details||null,is_active!=null?Boolean(is_active):null,sort_order!=null?Number(sort_order):null,req.params.id,c.id]);
      res.json(r.rows[0] || {});
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/telecom/portal/offers/:id", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      await query(`DELETE FROM telecom_offers WHERE id=$1 AND company_id=$2`, [req.params.id, c.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // Portal: events
  app.get("/api/telecom/portal/events", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      const r = await query(`SELECT * FROM telecom_events WHERE company_id=$1 ORDER BY event_date ASC NULLS LAST`, [c.id]);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/telecom/portal/events", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      if (!["standard","premium"].includes(c.package_type)) return res.status(403).json({ error: "الباقة الحالية لا تدعم الفعاليات" });
      const { title, description, event_date, location } = req.body;
      if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
      const r = await query(`INSERT INTO telecom_events (company_id,title,description,event_date,location) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [c.id,title,description||null,event_date||null,location||null]);
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/telecom/portal/events/:id", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      const { title, description, event_date, location, is_active } = req.body;
      const r = await query(`UPDATE telecom_events SET title=COALESCE($1,title),description=COALESCE($2,description),event_date=COALESCE($3,event_date),location=COALESCE($4,location),is_active=COALESCE($5,is_active) WHERE id=$6 AND company_id=$7 RETURNING *`,
        [title||null,description||null,event_date||null,location||null,is_active!=null?Boolean(is_active):null,req.params.id,c.id]);
      res.json(r.rows[0] || {});
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/telecom/portal/events/:id", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      await query(`DELETE FROM telecom_events WHERE id=$1 AND company_id=$2`, [req.params.id, c.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // Portal: services
  app.get("/api/telecom/portal/services", async (req: Request, res: Response) => {
    try {
      await ensureTelecomV2();
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      const r = await query(`SELECT * FROM telecom_services WHERE company_id=$1 ORDER BY sort_order,created_at`, [c.id]);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/telecom/portal/services", async (req: Request, res: Response) => {
    try {
      await ensureTelecomV2();
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      if (!["standard","premium"].includes(c.package_type)) return res.status(403).json({ error: "الباقة الحالية لا تدعم الخدمات" });
      const { title, description, icon, price, category, ussd_code, link, sort_order } = req.body;
      if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
      const r = await query(`INSERT INTO telecom_services (company_id,title,description,icon,price,category,ussd_code,link,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [c.id,title,description||null,icon||'star-outline',price||null,category||'other',ussd_code||null,link||null,Number(sort_order)||0]);
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/telecom/portal/services/:id", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      const { title, description, icon, price, category, ussd_code, link, is_active, sort_order } = req.body;
      const r = await query(`UPDATE telecom_services SET title=COALESCE($1,title),description=COALESCE($2,description),icon=COALESCE($3,icon),price=COALESCE($4,price),category=COALESCE($5,category),ussd_code=COALESCE($6,ussd_code),link=COALESCE($7,link),is_active=COALESCE($8,is_active),sort_order=COALESCE($9,sort_order) WHERE id=$10 AND company_id=$11 RETURNING *`,
        [title||null,description||null,icon||null,price||null,category||null,ussd_code||null,link||null,is_active!=null?Boolean(is_active):null,sort_order!=null?Number(sort_order):null,req.params.id,c.id]);
      res.json(r.rows[0] || {});
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/telecom/portal/services/:id", async (req: Request, res: Response) => {
    try {
      const c = await getPortalCompany2(req);
      if (!c) return res.status(401).json({ error: "غير مصرح" });
      await query(`DELETE FROM telecom_services WHERE id=$1 AND company_id=$2`, [req.params.id, c.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // Admin: credentials + contracts
  app.patch("/api/admin/telecom/companies/:id/credentials", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTelecomV2();
      const { pin, package_type, contract_start, contract_end, monthly_fee, contact_person, contact_email } = req.body;
      const pinHash = pin ? hashPortalPin2(String(pin)) : null;
      const r = await query(`UPDATE telecom_companies SET portal_pin_hash=CASE WHEN $1::text IS NOT NULL THEN $1 ELSE portal_pin_hash END,package_type=COALESCE($2,package_type),contract_start=COALESCE($3,contract_start),contract_end=COALESCE($4,contract_end),monthly_fee=COALESCE($5,monthly_fee),contact_person=COALESCE($6,contact_person),contact_email=COALESCE($7,contact_email) WHERE id=$8 RETURNING id,name,short,package_type,contract_start,contract_end,monthly_fee,contact_person,contact_email,is_active`,
        [pinHash,package_type||null,contract_start||null,contract_end||null,monthly_fee!=null?Number(monthly_fee):null,contact_person||null,contact_email||null,req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
      res.json({ ...r.rows[0], pin_set: !!pinHash });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/admin/telecom/services", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTelecomV2();
      const r = await query(`SELECT s.*, c.name AS company_name FROM telecom_services s LEFT JOIN telecom_companies c ON c.id=s.company_id ORDER BY s.created_at DESC`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
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
      id                   SERIAL PRIMARY KEY,
      union_id             INTEGER REFERENCES unions(id) ON DELETE SET NULL,
      user_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,
      full_name            VARCHAR(200) NOT NULL,
      national_id          VARCHAR(30),
      birth_date           DATE,
      birth_place          VARCHAR(100),
      gender               VARCHAR(10),
      nationality          VARCHAR(60) DEFAULT 'سودانية',
      phone                VARCHAR(30),
      alt_phone            VARCHAR(30),
      email                VARCHAR(200),
      address              TEXT,
      neighborhood         VARCHAR(100),
      city                 VARCHAR(100) DEFAULT 'الحصاحيصا',
      job_title            VARCHAR(200),
      employer             VARCHAR(200),
      work_address         TEXT,
      work_phone           VARCHAR(30),
      specialty            VARCHAR(200),
      work_start_date      DATE,
      work_years           INTEGER,
      degree               VARCHAR(60),
      institution          VARCHAR(200),
      graduation_year      INTEGER,
      field_of_study       VARCHAR(200),
      previous_unions      JSONB DEFAULT '[]',
      union_roles          VARCHAR(300),
      existing_membership_no VARCHAR(60),
      workshops            JSONB DEFAULT '[]',
      conferences          JSONB DEFAULT '[]',
      trainings            JSONB DEFAULT '[]',
      achievements         TEXT,
      skills               TEXT,
      references_list      JSONB DEFAULT '[]',
      membership_type      VARCHAR(30) DEFAULT 'regular',
      membership_no        VARCHAR(60),
      status               VARCHAR(20) DEFAULT 'pending',
      rejection_reason     TEXT,
      notes                TEXT,
      applied_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at          TIMESTAMPTZ,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  app.get("/api/unions", async (req: Request, res: Response) => {
    try {
      await ensureUnionsTables();
      const r = await query(`SELECT * FROM unions WHERE is_active=TRUE ORDER BY sort_order,id`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/unions/announcements/all", async (req: Request, res: Response) => {
    try {
      await ensureUnionsTables();
      const r = await query(`SELECT a.*, u.name AS union_name FROM union_announcements a LEFT JOIN unions u ON u.id=a.union_id WHERE a.is_active=TRUE ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 50`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/unions/my-membership", async (req: Request, res: Response) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
      const r = await query(`SELECT m.*, u.name AS union_name, u.field AS union_field FROM union_members m LEFT JOIN unions u ON u.id=m.union_id WHERE m.user_id=$1 ORDER BY m.applied_at DESC`, [user.id]);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/unions/:id", async (req: Request, res: Response) => {
    try {
      await ensureUnionsTables();
      const r = await query(`SELECT * FROM unions WHERE id=$1`, [req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "النقابة غير موجودة" });
      const ann = await query(`SELECT * FROM union_announcements WHERE union_id=$1 AND is_active=TRUE ORDER BY is_pinned DESC, created_at DESC LIMIT 20`, [req.params.id]);
      res.json({ ...r.rows[0], announcements: ann.rows });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/unions/programs", async (req: Request, res: Response) => {
    try {
      await ensureUnionsTables();
      await query(`CREATE TABLE IF NOT EXISTS union_programs (id SERIAL PRIMARY KEY, union_id INTEGER REFERENCES unions(id) ON DELETE CASCADE, title VARCHAR(300) NOT NULL, description TEXT, start_date DATE, end_date DATE, status VARCHAR(30) DEFAULT 'upcoming', created_at TIMESTAMPTZ DEFAULT NOW())`);
      const union_id = req.query.union_id;
      const r = union_id
        ? await query(`SELECT * FROM union_programs WHERE union_id=$1 ORDER BY start_date DESC LIMIT 50`, [union_id])
        : await query(`SELECT * FROM union_programs ORDER BY start_date DESC LIMIT 100`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/unions/laws", async (req: Request, res: Response) => {
    try {
      await ensureUnionsTables();
      await query(`CREATE TABLE IF NOT EXISTS union_laws (id SERIAL PRIMARY KEY, union_id INTEGER REFERENCES unions(id) ON DELETE CASCADE, title VARCHAR(300) NOT NULL, content TEXT, category VARCHAR(100), effective_date DATE, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const union_id = req.query.union_id;
      const r = union_id
        ? await query(`SELECT * FROM union_laws WHERE union_id=$1 ORDER BY created_at DESC LIMIT 50`, [union_id])
        : await query(`SELECT * FROM union_laws ORDER BY created_at DESC LIMIT 100`);
      res.json(r.rows);
    } catch { res.json([]); }
  });

  app.post("/api/unions/apply", async (req: Request, res: Response) => {
    try {
      await ensureUnionsTables();
      const { union_id, user_id, full_name, national_id, birth_date, birth_place, gender, nationality, phone, alt_phone, email, address, neighborhood, city, job_title, employer, work_address, work_phone, specialty, work_start_date, work_years, degree, institution, graduation_year, field_of_study, previous_unions, union_roles, existing_membership_no, workshops, conferences, trainings, achievements, skills, references_list, membership_type, notes } = req.body;
      if (!full_name) return res.status(400).json({ error: "الاسم الكامل مطلوب" });
      if (!union_id) return res.status(400).json({ error: "يجب اختيار النقابة" });
      const r = await query(
        `INSERT INTO union_members (union_id,user_id,full_name,national_id,birth_date,birth_place,gender,nationality,phone,alt_phone,email,address,neighborhood,city,job_title,employer,work_address,work_phone,specialty,work_start_date,work_years,degree,institution,graduation_year,field_of_study,previous_unions,union_roles,existing_membership_no,workshops,conferences,trainings,achievements,skills,references_list,membership_type,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36) RETURNING *`,
        [union_id,user_id||null,full_name,national_id||null,birth_date||null,birth_place||null,gender||null,nationality||'سودانية',phone||null,alt_phone||null,email||null,address||null,neighborhood||null,city||'الحصاحيصا',job_title||null,employer||null,work_address||null,work_phone||null,specialty||null,work_start_date||null,work_years?Number(work_years):null,degree||null,institution||null,graduation_year?Number(graduation_year):null,field_of_study||null,JSON.stringify(previous_unions||[]),union_roles||null,existing_membership_no||null,JSON.stringify(workshops||[]),JSON.stringify(conferences||[]),JSON.stringify(trainings||[]),achievements||null,skills||null,JSON.stringify(references_list||[]),membership_type||'regular',notes||null]
      );
      sendAdminNotifEmail("🏛️ طلب انضمام نقابة جديد", {
        "الاسم الكامل": full_name, "الهاتف": phone||"",
        "البريد الإلكتروني": email||"", "المهنة": job_title||"",
        "جهة العمل": employer||"", "التخصص": specialty||"",
        "نوع العضوية": membership_type||"regular",
      });
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // Admin
  app.get("/api/admin/unions", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureUnionsTables();
      const r = await query(`SELECT u.*, (SELECT COUNT(*) FROM union_members m WHERE m.union_id=u.id)::int AS members_total FROM unions u ORDER BY u.sort_order,u.id`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/admin/unions", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureUnionsTables();
      const { name, short_name, field, description, logo_url, banner_url, website, email, phone, address, founded, members_count, sort_order } = req.body;
      if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
      const r = await query(`INSERT INTO unions (name,short_name,field,description,logo_url,banner_url,website,email,phone,address,founded,members_count,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [name,short_name||null,field||null,description||null,logo_url||null,banner_url||null,website||null,email||null,phone||null,address||null,founded||null,members_count||null,Number(sort_order)||0]);
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/unions/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { name, short_name, field, description, website, email, phone, address, founded, members_count, sort_order, is_active } = req.body;
      const r = await query(`UPDATE unions SET name=COALESCE($1,name), short_name=COALESCE($2,short_name), field=COALESCE($3,field), description=COALESCE($4,description), website=COALESCE($5,website), email=COALESCE($6,email), phone=COALESCE($7,phone), address=COALESCE($8,address), founded=COALESCE($9,founded), members_count=COALESCE($10,members_count), sort_order=COALESCE($11,sort_order), is_active=COALESCE($12,is_active) WHERE id=$13 RETURNING *`, [name||null,short_name||null,field||null,description||null,website||null,email||null,phone||null,address||null,founded||null,members_count||null,sort_order!=null?Number(sort_order):null,is_active!=null?Boolean(is_active):null,req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/admin/unions/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM unions WHERE id=$1`, [req.params.id]); res.json({ success: true }); }
    catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/admin/union-members", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureUnionsTables();
      const { union_id, status } = req.query as Record<string, string>;
      const params: unknown[] = []; let where = "WHERE 1=1";
      if (union_id) { params.push(Number(union_id)); where += ` AND m.union_id=$${params.length}`; }
      if (status)   { params.push(status);            where += ` AND m.status=$${params.length}`; }
      const r = await query(`SELECT m.*, u.name AS union_name FROM union_members m LEFT JOIN unions u ON u.id=m.union_id ${where} ORDER BY m.applied_at DESC`, params);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/union-members/:id/status", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { status, rejection_reason, membership_no, notes } = req.body;
      const approved_at = status === "approved" ? new Date().toISOString() : null;
      const r = await query(`UPDATE union_members SET status=$1, rejection_reason=COALESCE($2,rejection_reason), membership_no=COALESCE($3,membership_no), notes=COALESCE($4,notes), approved_at=COALESCE($5,approved_at) WHERE id=$6 RETURNING *`, [status,rejection_reason||null,membership_no||null,notes||null,approved_at,req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/admin/union-members/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM union_members WHERE id=$1`, [req.params.id]); res.json({ success: true }); }
    catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/admin/union-announcements", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureUnionsTables();
      const r = await query(`SELECT a.*, u.name AS union_name FROM union_announcements a LEFT JOIN unions u ON u.id=a.union_id ORDER BY a.created_at DESC`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/admin/union-announcements", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureUnionsTables();
      const { union_id, title, body, image_url, link, is_pinned } = req.body;
      if (!title) return res.status(400).json({ error: "العنوان مطلوب" });
      const r = await query(`INSERT INTO union_announcements (union_id,title,body,image_url,link,is_pinned) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [union_id?Number(union_id):null,title,body||null,image_url||null,link||null,Boolean(is_pinned)]);
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/union-announcements/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { title, body, image_url, link, is_pinned, is_active } = req.body;
      const r = await query(`UPDATE union_announcements SET title=COALESCE($1,title), body=COALESCE($2,body), image_url=COALESCE($3,image_url), link=COALESCE($4,link), is_pinned=COALESCE($5,is_pinned), is_active=COALESCE($6,is_active) WHERE id=$7 RETURNING *`, [title||null,body||null,image_url||null,link||null,is_pinned!=null?Boolean(is_pinned):null,is_active!=null?Boolean(is_active):null,req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/admin/union-announcements/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM union_announcements WHERE id=$1`, [req.params.id]); res.json({ success: true }); }
    catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

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
    await query(`CREATE TABLE IF NOT EXISTS zawajil_shoubash_guests (
      id          SERIAL PRIMARY KEY,
      order_id    INTEGER REFERENCES zawajil_orders(id) ON DELETE CASCADE,
      guest_name  VARCHAR(100),
      guest_phone VARCHAR(30),
      gift_desc   VARCHAR(300),
      gift_amount NUMERIC(12,2) DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  app.get("/api/zawajil/products", async (_req: Request, res: Response) => {
    try { await ensureZawajilTables(); const r = await query(`SELECT * FROM zawajil_products WHERE is_available=TRUE ORDER BY sort_order,name`); res.json(r.rows); }
    catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/zawajil/orders", async (req: Request, res: Response) => {
    try {
      await ensureZawajilTables();
      const { sender_name, sender_phone, recipient_name, recipient_phone, recipient_address, delivery_location, service_type, occasion_type, message_text, message_by_us, voice_presentation, gift_type, gift_product_id, gift_product_name, gift_external_desc, gift_money_amount, pledge_accepted } = req.body;
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
      const r = await query(`INSERT INTO zawajil_orders (order_number,sender_id,sender_name,sender_phone,recipient_name,recipient_phone,recipient_address,delivery_location,service_type,occasion_type,message_text,message_by_us,voice_presentation,gift_type,gift_product_id,gift_product_name,gift_external_desc,gift_money_amount,pledge_accepted) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [orderNumber,senderId,sender_name||null,sender_phone||null,recipient_name,recipient_phone||null,recipient_address||null,delivery_location||"inside_city",service_type,occasion_type||null,message_text||null,Boolean(message_by_us),Boolean(voice_presentation),gift_type||"none",gift_product_id||null,gift_product_name||null,gift_external_desc||null,gift_money_amount||0,true]);
      void pushToAdmins("🎁 طلب زواجل جديد", `طلب ${orderNumber} — المستلم: ${recipient_name}`, { screen: "zawajil", orderId: r.rows[0].id });
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/zawajil/orders/mine", async (req: Request, res: Response) => {
    try {
      await ensureZawajilTables();
      const { phone, name } = req.query as Record<string,string>;
      if (!phone && !name) return res.json([]);
      const params: unknown[] = []; let where = "WHERE 1=1";
      if (phone) { params.push(phone); where += ` AND sender_phone=$${params.length}`; }
      else { params.push(`%${name}%`); where += ` AND sender_name ILIKE $${params.length}`; }
      const r = await query(`SELECT * FROM zawajil_orders ${where} ORDER BY created_at DESC LIMIT 50`, params);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/zawajil/shoubash-guests", async (req: Request, res: Response) => {
    try {
      await ensureZawajilTables();
      const { order_id, guest_name, guest_phone, gift_desc, gift_amount } = req.body;
      if (!order_id || !guest_name) return res.status(400).json({ error: "رقم الطلب والاسم مطلوبان" });
      const r = await query(`INSERT INTO zawajil_shoubash_guests(order_id,guest_name,guest_phone,gift_desc,gift_amount) VALUES($1,$2,$3,$4,$5) RETURNING *`, [order_id,guest_name,guest_phone||null,gift_desc||null,gift_amount||0]);
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/admin/zawajil/orders", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureZawajilTables();
      const { status } = req.query as Record<string,string>;
      const params: unknown[] = []; let where = "WHERE 1=1";
      if (status && status !== "all") { params.push(status); where += ` AND status=$${params.length}`; }
      const r = await query(`SELECT o.*, (SELECT json_agg(g) FROM zawajil_shoubash_guests g WHERE g.order_id=o.id) AS shoubash_guests FROM zawajil_orders o ${where} ORDER BY o.created_at DESC`, params);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/zawajil/orders/:id/review", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureZawajilTables();
      const { action, admin_notes, rejection_reason, modification_request, estimated_cost } = req.body;
      const MAP: Record<string,string> = { approve:"approved", reject:"rejected", request_modification:"modification_requested" };
      const newStatus = MAP[action]; if (!newStatus) return res.status(400).json({ error: "action غير صالح" });
      const r = await query(`UPDATE zawajil_orders SET status=$1,admin_notes=COALESCE($2,admin_notes),rejection_reason=COALESCE($3,rejection_reason),modification_request=COALESCE($4,modification_request),estimated_cost=COALESCE($5::numeric,estimated_cost),updated_at=NOW() WHERE id=$6 RETURNING *`,
        [newStatus,admin_notes||null,rejection_reason||null,modification_request||null,estimated_cost!=null?Number(estimated_cost):null,req.params.id]);
      if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" }); res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/zawajil/orders/:id/status", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureZawajilTables();
      const { status, admin_notes } = req.body;
      const VALID = ["pending_review","modification_requested","approved","preparing","sending","completed","rejected","returned"];
      if (!VALID.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
      const r = await query(`UPDATE zawajil_orders SET status=$1,admin_notes=COALESCE($2,admin_notes),updated_at=NOW() WHERE id=$3 RETURNING *`, [status,admin_notes||null,req.params.id]);
      res.json(r.rows[0] || { error: "لم يُعثر" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/admin/zawajil/products", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureZawajilTables(); const r = await query(`SELECT * FROM zawajil_products ORDER BY sort_order,name`); res.json(r.rows); }
    catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/admin/zawajil/products", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureZawajilTables();
      const { name, description, price, category, image_url, is_available, sort_order } = req.body;
      if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
      const r = await query(`INSERT INTO zawajil_products(name,description,price,category,image_url,is_available,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name,description||null,price||0,category||"general",image_url||null,is_available!==false,sort_order||0]);
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/zawajil/products/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { name, description, price, category, image_url, is_available, sort_order } = req.body;
      const r = await query(`UPDATE zawajil_products SET name=COALESCE($1,name),description=COALESCE($2,description),price=COALESCE($3::numeric,price),category=COALESCE($4,category),image_url=COALESCE($5,image_url),is_available=COALESCE($6,is_available),sort_order=COALESCE($7::int,sort_order) WHERE id=$8 RETURNING *`,
        [name||null,description||null,price!=null?Number(price):null,category||null,image_url||null,is_available!=null?Boolean(is_available):null,sort_order!=null?Number(sort_order):null,req.params.id]);
      res.json(r.rows[0] || { error: "لم يُعثر" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/admin/zawajil/products/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM zawajil_products WHERE id=$1`, [req.params.id]); res.json({ success: true }); }
    catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // إصلاح النقص — Endpoints مفقودة من الواجهة الأمامية
  // ═══════════════════════════════════════════════════════════════════════════

  // ── تحديد كلمة المرور (نسيت كلمة المرور) ───────────────────────────────
  app.post("/api/auth/check-phone", async (req: Request, res: Response) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "رقم الهاتف مطلوب" });
      const r = await query("SELECT id, name, phone FROM users WHERE phone=$1", [phone]);
      if (!r.rows[0]) return res.status(404).json({ error: "لا يوجد حساب بهذا الرقم" });
      res.json({ exists: true, name: r.rows[0].name });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── POST /api/auth/send-registration-otp ─────────────────────────────────
  app.post("/api/auth/send-registration-otp", async (req: Request, res: Response) => {
    try {
      const { phone_or_email } = req.body;
      if (!phone_or_email) return res.status(400).json({ error: "رقم الهاتف أو البريد الإلكتروني مطلوب" });
      const identifier = phone_or_email.trim();
      const isEmail = identifier.includes("@");

      // Rate limit: max 3 OTPs per identifier per 15 minutes
      // Count only unexpired tokens to avoid blocking after legitimate expiry
      const recentR = await query(
        "SELECT COUNT(*)::int AS cnt FROM otp_tokens WHERE phone=$1 AND created_at > NOW() - INTERVAL '15 minutes'",
        [identifier]
      );
      if ((recentR.rows[0]?.cnt ?? 0) >= 3) {
        return res.status(429).json({ error: "طلبات كثيرة، انتظر 15 دقيقة وحاول مجدداً" });
      }

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      // 10-minute expiry — matches server verify check
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      const otpHash = await bcrypt.hash(otp, 6);

      await query("DELETE FROM otp_tokens WHERE phone=$1", [identifier]);
      await query(
        "INSERT INTO otp_tokens(phone, otp, expires_at, attempts) VALUES($1,$2,$3,0)",
        [identifier, otpHash, expires]
      );

      let sentVia: "sms" | "email" | "none" = "none";

      // ── 1. Twilio SMS (للأرقام) ──────────────────────────────────────────────
      if (!isEmail && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_FROM) {
        try {
          const rawPhone = identifier.replace(/^0/, "");
          const toPhone = identifier.startsWith("+") ? identifier : `+249${rawPhone}`;
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
          const authHeader = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
          const smsBody = new URLSearchParams({
            To: toPhone,
            From: process.env.TWILIO_PHONE_FROM,
            Body: `رمز التحقق لـ حصاحيصاوي: ${otp}\nصالح 10 دقائق. لا تشاركه مع أحد.`,
          });
          const twilioRes = await fetch(twilioUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${authHeader}` },
            body: smsBody,
          });
          if (twilioRes.status < 300) {
            sentVia = "sms";
          } else {
            const errBody = await twilioRes.text().catch(() => "");
            console.error("[OTP] Twilio rejected:", twilioRes.status, errBody);
          }
        } catch (smsErr) {
          console.error("[OTP] Twilio error:", smsErr);
        }
      }

      // ── 2. Email via Resend API (للبريد الإلكتروني) ────────────────────────
      if (isEmail && process.env.RESEND_API_KEY) {
        try {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM || "onboarding@resend.dev",
              to: [identifier],
              subject: "رمز التحقق — حصاحيصاوي",
              html: `
                <div dir="rtl" style="font-family:Cairo,Arial,sans-serif;max-width:480px;margin:auto;padding:32px;background:#f9fafb;border-radius:16px">
                  <h2 style="color:#2563EB;margin-bottom:8px">رمز التحقق</h2>
                  <p style="color:#374151;margin-bottom:24px">استخدم الرمز التالي لإكمال تسجيلك في تطبيق حصاحيصاوي:</p>
                  <div style="background:#2563EB;color:#fff;font-size:36px;font-weight:bold;letter-spacing:10px;padding:20px 32px;border-radius:12px;text-align:center;margin-bottom:24px">
                    ${otp}
                  </div>
                  <p style="color:#6B7280;font-size:13px">الرمز صالح لمدة 10 دقائق فقط. لا تشاركه مع أي شخص.</p>
                </div>
              `,
            }),
          });
          if (emailRes.status < 300) {
            sentVia = "email";
          } else {
            console.error("[OTP] Resend error:", emailRes.status, await emailRes.text().catch(() => ""));
          }
        } catch (emailErr) {
          console.error("[OTP] Email error:", emailErr);
        }
      }

      // ── 3. Fallback: إعادة الرمز في الاستجابة عند غياب أي خدمة إرسال ────────
      // يُستخدم عندما لا يكون Twilio أو Resend مربوطاً، أو عند SHOW_DEV_OTP=true
      const noDeliveryConfigured =
        (isEmail && !process.env.RESEND_API_KEY) ||
        (!isEmail && !process.env.TWILIO_ACCOUNT_SID);
      const forceShow = process.env.SHOW_DEV_OTP === "true";
      const exposeOtp = sentVia === "none" && (noDeliveryConfigured || forceShow);

      console.log(`[OTP] identifier=${identifier} sentVia=${sentVia} exposeOtp=${exposeOtp}`);

      res.json({
        success: true,
        sent_via: sentVia,
        ...(exposeOtp ? { dev_otp: otp } : {}),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/auth/verify-otp ─────────────────────────────────────────────
  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
    try {
      const { phone_or_email, code } = req.body;
      if (!phone_or_email || !code) return res.status(400).json({ error: "بيانات ناقصة" });
      const identifier = phone_or_email.trim();

      const r = await query(
        "SELECT otp, expires_at, attempts FROM otp_tokens WHERE phone=$1",
        [identifier]
      );
      if (!r.rows[0]) return res.status(400).json({ error: "لم يتم إرسال رمز لهذا الرقم أو انتهت صلاحيته" });

      const { otp: storedHash, expires_at, attempts } = r.rows[0];

      if (new Date(expires_at) < new Date()) {
        await query("DELETE FROM otp_tokens WHERE phone=$1", [identifier]);
        return res.status(400).json({ error: "انتهت صلاحية الرمز، اطلب رمزاً جديداً" });
      }
      if ((attempts ?? 0) >= 5) {
        await query("DELETE FROM otp_tokens WHERE phone=$1", [identifier]);
        return res.status(429).json({ error: "تجاوزت عدد المحاولات المسموح بها، اطلب رمزاً جديداً" });
      }

      await query("UPDATE otp_tokens SET attempts = attempts + 1 WHERE phone=$1", [identifier]);

      const valid = await bcrypt.compare(String(code), storedHash);
      if (!valid) {
        const remaining = 4 - (attempts ?? 0);
        return res.status(400).json({ error: `الرمز غير صحيح، متبقي ${remaining} محاولات` });
      }

      await query("DELETE FROM otp_tokens WHERE phone=$1", [identifier]);
      res.json({ valid: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── POST /api/auth/send-otp (legacy — password reset only) ───────────────
  app.post("/api/auth/send-otp", async (req: Request, res: Response) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "رقم الهاتف مطلوب" });
      const r = await query("SELECT id FROM users WHERE phone=$1", [phone]);
      if (!r.rows[0]) return res.status(404).json({ error: "الرقم غير مسجل" });
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      const otpHash = await bcrypt.hash(otp, 6);
      await query("DELETE FROM otp_tokens WHERE phone=$1", [phone]);
      await query("INSERT INTO otp_tokens(phone,otp,expires_at) VALUES($1,$2,$3)", [phone, otpHash, expires]);

      let smsSent = false;
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_FROM) {
        try {
          const rawPhone = phone.replace(/^0/, "");
          const toPhone = phone.startsWith("+") ? phone : `+249${rawPhone}`;
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
          const authHeader = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
          const body = new URLSearchParams({
            To: toPhone, From: process.env.TWILIO_PHONE_FROM,
            Body: `رمز استعادة كلمة المرور لـ حصاحيصاوي: ${otp}\nصالح 10 دقائق.`,
          });
          const twilioRes = await fetch(twilioUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${authHeader}` },
            body,
          });
          smsSent = twilioRes.status < 300;
        } catch {}
      }
      const isDev = process.env.NODE_ENV !== "production" || process.env.SHOW_DEV_OTP === "true";
      res.json({ success: true, sent: smsSent, ...(isDev && !smsSent ? { dev_otp: otp } : {}) });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/auth/verify-reset-otp", async (req: Request, res: Response) => {
    try {
      const { phone, otp } = req.body;
      if (!phone || !otp) return res.status(400).json({ error: "بيانات ناقصة" });
      const r = await query("SELECT otp, expires_at FROM otp_tokens WHERE phone=$1 AND expires_at>NOW()", [phone]);
      if (!r.rows[0]) return res.status(400).json({ error: "الرمز غير صحيح أو منتهي الصلاحية" });
      const valid = await bcrypt.compare(String(otp), r.rows[0].otp);
      if (!valid) return res.status(400).json({ error: "الرمز غير صحيح أو منتهي الصلاحية" });
      res.json({ valid: true });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { phone, otp, new_password } = req.body;
      if (!phone || !otp || !new_password) return res.status(400).json({ error: "بيانات ناقصة" });
      const tkn = await query("SELECT otp, expires_at FROM otp_tokens WHERE phone=$1 AND expires_at>NOW()", [phone]);
      if (!tkn.rows[0]) return res.status(400).json({ error: "الرمز غير صحيح أو منتهي الصلاحية" });
      const valid = await bcrypt.compare(String(otp), tkn.rows[0].otp);
      if (!valid) return res.status(400).json({ error: "الرمز غير صحيح أو منتهي الصلاحية" });
      const hash = await bcrypt.hash(new_password, 10);
      await query("UPDATE users SET password_hash=$1 WHERE phone=$2", [hash, phone]);
      await query("DELETE FROM otp_tokens WHERE phone=$1", [phone]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── رسائل التواصل (اتحاد الطلاب والتواصل العام) ──────────────────────────
  app.post("/api/contact-messages", async (req: Request, res: Response) => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY, full_name VARCHAR(200) NOT NULL,
        phone VARCHAR(20), whatsapp VARCHAR(20), email VARCHAR(100),
        state VARCHAR(60), locality VARCHAR(60),
        inquiry_type VARCHAR(50), message TEXT NOT NULL,
        best_time VARCHAR(50), source VARCHAR(50) DEFAULT 'general',
        status VARCHAR(20) DEFAULT 'new', created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      const { full_name, phone, whatsapp, email, state, locality, inquiry_type, message, best_time, source } = req.body;
      if (!full_name || !message) return res.status(400).json({ error: "الاسم والرسالة مطلوبان" });
      const r = await query(
        `INSERT INTO contact_messages(full_name,phone,whatsapp,email,state,locality,inquiry_type,message,best_time,source)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,status`,
        [full_name,phone||null,whatsapp||null,email||null,state||null,locality||null,
         inquiry_type||null,message,best_time||null,source||'general']
      );
      res.status(201).json({ success: true, id: r.rows[0].id });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/admin/contact-messages", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const r = await query(`CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY, full_name VARCHAR(200) NOT NULL, phone VARCHAR(20), message TEXT, source VARCHAR(50), status VARCHAR(20) DEFAULT 'new', created_at TIMESTAMPTZ DEFAULT NOW()
      ); SELECT * FROM contact_messages ORDER BY created_at DESC`);
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── الشراكات الخارجية ──────────────────────────────────────────────────────
  app.get("/api/external-partnerships", async (req: Request, res: Response) => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS external_partnerships (
        id SERIAL PRIMARY KEY, org_name VARCHAR(200) NOT NULL, org_type VARCHAR(50),
        description TEXT, logo_url VARCHAR(300), website VARCHAR(200),
        contact_name VARCHAR(100), contact_phone VARCHAR(20), contact_email VARCHAR(100),
        partnership_level VARCHAR(30) DEFAULT 'standard',
        status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      const r = await query("SELECT * FROM external_partnerships WHERE status='active' ORDER BY created_at DESC");
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/external-partnerships/apply", async (req: Request, res: Response) => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS external_partnership_applications (
        id SERIAL PRIMARY KEY,
        org_name VARCHAR(200) NOT NULL, org_type VARCHAR(50), sector VARCHAR(100),
        city VARCHAR(100), country VARCHAR(100), website VARCHAR(200),
        contact_person VARCHAR(100), contact_name VARCHAR(100), contact_role VARCHAR(100),
        phone VARCHAR(20) NOT NULL, email VARCHAR(100), whatsapp VARCHAR(20),
        cooperation_scope TEXT, description TEXT, services_offered JSONB DEFAULT '[]',
        target_audience TEXT, requested_level VARCHAR(30) DEFAULT 'standard',
        status VARCHAR(20) DEFAULT 'pending', admin_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      // support both contact_person (new form) and contact_name (old form)
      const {
        org_name, org_type, sector, city, country, website,
        contact_person, contact_name, contact_role, phone, email, whatsapp,
        cooperation_scope, description, services_offered, target_audience, requested_level,
      } = req.body;
      const contactDisplay = contact_person || contact_name || "";
      if (!org_name || !contactDisplay || !phone) return res.status(400).json({ error: "البيانات الأساسية مطلوبة" });
      const r = await query(
        `INSERT INTO external_partnership_applications(
           org_name,org_type,sector,city,country,website,
           contact_person,contact_name,contact_role,phone,email,whatsapp,
           cooperation_scope,description,services_offered,target_audience,requested_level)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id,status`,
        [
          org_name, org_type||null, sector||null, city||null, country||null, website||null,
          contactDisplay, contactDisplay, contact_role||null, phone, email||null, whatsapp||null,
          cooperation_scope||null, description||null,
          JSON.stringify(services_offered||[]), target_audience||null, requested_level||'standard',
        ]
      );
      sendAdminNotifEmail("🤝 طلب شراكة خارجية جديد", {
        "اسم المنظمة": org_name, "نوعها": org_type||"", "القطاع": sector||"",
        "جهة الاتصال": contactDisplay, "الهاتف": phone,
        "البريد الإلكتروني": email||"", "المدينة": city||"", "الدولة": country||"",
      });
      res.status(201).json({ success: true, application: r.rows[0] });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── شراكة النقابات ───────────────────────────────────────────────────────
  app.post("/api/union-partnership/apply", async (req: Request, res: Response) => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS union_partnership_applications (
        id SERIAL PRIMARY KEY, union_name VARCHAR(200) NOT NULL, union_type VARCHAR(50),
        contact_person VARCHAR(100) NOT NULL, phone VARCHAR(20) NOT NULL,
        email VARCHAR(100), description TEXT, membership_count INTEGER,
        requested_tier VARCHAR(30) DEFAULT 'basic', annual_fee NUMERIC(10,2),
        status VARCHAR(20) DEFAULT 'pending', admin_note TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      const { union_name, union_type, contact_person, phone, email, description, membership_count, requested_tier } = req.body;
      if (!union_name || !contact_person || !phone) return res.status(400).json({ error: "البيانات الأساسية مطلوبة" });
      const r = await query(
        `INSERT INTO union_partnership_applications(union_name,union_type,contact_person,phone,email,description,membership_count,requested_tier)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status`,
        [union_name,union_type||null,contact_person,phone,email||null,description||null,membership_count||null,requested_tier||'basic']
      );
      sendAdminNotifEmail("🤝 طلب شراكة نقابية جديد", {
        "اسم النقابة": union_name, "نوعها": union_type||"",
        "جهة الاتصال": contact_person, "الهاتف": phone,
        "البريد الإلكتروني": email||"", "عدد الأعضاء": membership_count?.toString()||"",
        "مستوى الشراكة": requested_tier||"basic",
      });
      res.status(201).json({ success: true, application: r.rows[0] });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/admin/union-partnership", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS union_partnership_applications (
        id SERIAL PRIMARY KEY, union_name VARCHAR(200), contact_person VARCHAR(100), phone VARCHAR(20),
        status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      const r = await query("SELECT * FROM union_partnership_applications ORDER BY created_at DESC");
      res.json({ applications: r.rows });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/union-partnership/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { status, admin_note, annual_fee } = req.body;
      const r = await query(
        `UPDATE union_partnership_applications SET status=COALESCE($1,status), admin_note=COALESCE($2,admin_note), annual_fee=COALESCE($3,annual_fee) WHERE id=$4 RETURNING *`,
        [status||null, admin_note||null, annual_fee||null, req.params.id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر" });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── المواعيد — mine, book, cancel ────────────────────────────────────────
  app.get("/api/appointments/mine", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      const r = await query(
        "SELECT * FROM appointments WHERE user_id=$1 ORDER BY appointment_date DESC, appointment_time DESC LIMIT 50",
        [user.id]
      );
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/appointments/book", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      const { target_type, target_id, target_name, date, time, notes } = req.body;
      if (!date || !time) return res.status(400).json({ error: "التاريخ والوقت مطلوبان" });
      const r = await query(
        `INSERT INTO appointments(user_id,target_type,target_id,appointment_date,appointment_time,notes)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [user.id, target_type||'general', target_id||'0', date, time, notes||null]
      );
      void pushToAdmins("🏥 موعد طبي جديد", `${user.name} — ${target_name||target_type||"موعد"} ${date} ${time}`, { screen: "medical", appointmentId: r.rows[0].id });
      res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/appointments/:id/cancel", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      const r = await query(
        "UPDATE appointments SET status='cancelled' WHERE id=$1 AND user_id=$2 RETURNING *",
        [req.params.id, user.id]
      );
      if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
      res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── السجلات الطبية والصيدلية ──────────────────────────────────────────────
  async function ensureMedicalTables() {
    await query(`CREATE TABLE IF NOT EXISTS medical_records (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      blood_type VARCHAR(5), allergies TEXT, chronic_conditions TEXT,
      current_medications TEXT, emergency_contact_name VARCHAR(100),
      emergency_contact_phone VARCHAR(20), notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS lab_results (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      test_name VARCHAR(200) NOT NULL, result TEXT, unit VARCHAR(50),
      reference_range VARCHAR(100), status VARCHAR(20) DEFAULT 'normal',
      test_date VARCHAR(20), facility VARCHAR(200), doctor VARCHAR(100),
      notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS prescriptions (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      medication_name VARCHAR(200) NOT NULL, dosage VARCHAR(100),
      frequency VARCHAR(100), duration VARCHAR(100), doctor VARCHAR(100),
      facility VARCHAR(200), notes TEXT, is_active BOOLEAN DEFAULT TRUE,
      prescribed_date VARCHAR(20), created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS pharmacy_orders (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      medications TEXT NOT NULL, delivery_address TEXT, phone VARCHAR(20),
      notes TEXT, status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS hospital_admissions (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      patient_name VARCHAR(200) NOT NULL, hospital VARCHAR(200) NOT NULL,
      room_number VARCHAR(20), ward VARCHAR(100), admission_date VARCHAR(20),
      expected_discharge VARCHAR(20), diagnosis TEXT, notes TEXT,
      status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS admission_companions (
      id SERIAL PRIMARY KEY,
      admission_id INTEGER REFERENCES hospital_admissions(id) ON DELETE CASCADE,
      requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      companion_name VARCHAR(200) NOT NULL, relation VARCHAR(50),
      phone VARCHAR(20), status VARCHAR(20) DEFAULT 'pending',
      approved_at TIMESTAMPTZ, exit_pass_issued BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }

  app.get("/api/medical/record", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const r = await query("SELECT * FROM medical_records WHERE user_id=$1", [user.id]);
      res.json(r.rows[0] || null);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/medical/record", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const { blood_type, allergies, chronic_conditions, current_medications, emergency_contact_name, emergency_contact_phone, notes } = req.body;
      const existing = await query("SELECT id FROM medical_records WHERE user_id=$1", [user.id]);
      if (existing.rows[0]) {
        await query(
          `UPDATE medical_records SET blood_type=$1,allergies=$2,chronic_conditions=$3,current_medications=$4,
           emergency_contact_name=$5,emergency_contact_phone=$6,notes=$7,updated_at=NOW() WHERE user_id=$8`,
          [blood_type||null,allergies||null,chronic_conditions||null,current_medications||null,
           emergency_contact_name||null,emergency_contact_phone||null,notes||null,user.id]
        );
      } else {
        await query(
          `INSERT INTO medical_records(user_id,blood_type,allergies,chronic_conditions,current_medications,emergency_contact_name,emergency_contact_phone,notes)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [user.id,blood_type||null,allergies||null,chronic_conditions||null,current_medications||null,
           emergency_contact_name||null,emergency_contact_phone||null,notes||null]
        );
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── /api/medical/my-record — GET / PUT ──────────────────────────────
  app.get("/api/medical/my-record", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      await query(`ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS height_cm NUMERIC`);
      await query(`ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS weight_kg NUMERIC`);
      await query(`ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(100)`);
      const r = await query("SELECT * FROM medical_records WHERE user_id=$1", [user.id]);
      res.json({ record: r.rows[0] || null });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.put("/api/medical/my-record", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      await query(`ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS height_cm NUMERIC`);
      await query(`ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS weight_kg NUMERIC`);
      await query(`ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(100)`);
      const {
        blood_type, allergies, chronic_conditions, current_medications,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
        height_cm, weight_kg, notes,
      } = req.body;
      const existing = await query("SELECT id FROM medical_records WHERE user_id=$1", [user.id]);
      if (existing.rows[0]) {
        await query(
          `UPDATE medical_records SET blood_type=$1,allergies=$2,chronic_conditions=$3,current_medications=$4,
           emergency_contact_name=$5,emergency_contact_phone=$6,emergency_contact_relation=$7,
           height_cm=$8,weight_kg=$9,notes=$10,updated_at=NOW() WHERE user_id=$11`,
          [blood_type||null,allergies||null,chronic_conditions||null,current_medications||null,
           emergency_contact_name||null,emergency_contact_phone||null,emergency_contact_relation||null,
           height_cm||null,weight_kg||null,notes||null,user.id]
        );
      } else {
        await query(
          `INSERT INTO medical_records(user_id,blood_type,allergies,chronic_conditions,current_medications,
           emergency_contact_name,emergency_contact_phone,emergency_contact_relation,height_cm,weight_kg,notes)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [user.id,blood_type||null,allergies||null,chronic_conditions||null,current_medications||null,
           emergency_contact_name||null,emergency_contact_phone||null,emergency_contact_relation||null,
           height_cm||null,weight_kg||null,notes||null]
        );
      }
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/medical/lab-results/mine", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const r = await query("SELECT * FROM lab_results WHERE user_id=$1 ORDER BY created_at DESC", [user.id]);
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/medical/prescriptions/mine", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const r = await query("SELECT * FROM prescriptions WHERE user_id=$1 ORDER BY created_at DESC", [user.id]);
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/medical/my-pharmacy-orders", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const r = await query("SELECT * FROM pharmacy_orders WHERE user_id=$1 ORDER BY created_at DESC", [user.id]);
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/medical/pharmacy-orders", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const { medications, delivery_address, phone, notes } = req.body;
      if (!medications) return res.status(400).json({ error: "قائمة الأدوية مطلوبة" });
      const r = await query(
        "INSERT INTO pharmacy_orders(user_id,medications,delivery_address,phone,notes) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [user.id, medications, delivery_address||null, phone||null, notes||null]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── Medical Staff Portal ──────────────────────────────────────────────────────
  async function ensureMedicalStaffTables() {
    await ensureMedicalTables();
    await query(`CREATE TABLE IF NOT EXISTS medical_staff (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      specialty VARCHAR(100),
      license_no VARCHAR(100),
      role VARCHAR(50) DEFAULT 'doctor',
      facility VARCHAR(200),
      shift VARCHAR(50),
      is_verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS medical_prescriptions (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER REFERENCES medical_staff(id) ON DELETE CASCADE,
      patient_name VARCHAR(200),
      patient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      medications JSONB DEFAULT '[]',
      diagnosis TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS medical_lab_orders (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER REFERENCES medical_staff(id) ON DELETE CASCADE,
      patient_name VARCHAR(200),
      patient_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      tests JSONB DEFAULT '[]',
      priority VARCHAR(20) DEFAULT 'normal',
      status VARCHAR(30) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS medical_lab_results (
      id SERIAL PRIMARY KEY,
      lab_order_id INTEGER REFERENCES medical_lab_orders(id) ON DELETE CASCADE,
      results JSONB DEFAULT '{}',
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`ALTER TABLE pharmacy_orders ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending'`);
  }
  app.post("/api/medical/staff/register", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalStaffTables();
      const { specialty, license_no, role, facility, shift } = req.body;
      const r = await query(
        `INSERT INTO medical_staff (user_id, specialty, license_no, role, facility, shift) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id) DO UPDATE SET specialty=$2, license_no=$3, role=$4, facility=$5, shift=$6 RETURNING *`,
        [me.id, specialty||null, license_no||null, role||'doctor', facility||null, shift||null]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/medical/staff/profile", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalStaffTables();
      const r = await query(`SELECT ms.*, u.name, u.email FROM medical_staff ms JOIN users u ON u.id=ms.user_id WHERE ms.user_id=$1`, [me.id]);
      res.json(r.rows[0] || null);
    } catch { res.json(null); }
  });
  app.get("/api/medical/staff/patients", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalStaffTables();
      const q = req.query.q as string | undefined;
      let sql = `SELECT u.id, u.name, u.phone FROM users u WHERE u.role='user'`;
      const params: any[] = [];
      if (q) { params.push(`%${q}%`); sql += ` AND (u.name ILIKE $1 OR u.phone ILIKE $1)`; }
      sql += ` LIMIT 50`;
      const r = await query(sql, params);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/medical/staff/prescriptions", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalStaffTables();
      const staff = (await query(`SELECT id FROM medical_staff WHERE user_id=$1`, [me.id])).rows[0];
      if (!staff) return res.json([]);
      const r = await query(`SELECT * FROM medical_prescriptions WHERE staff_id=$1 ORDER BY created_at DESC LIMIT 100`, [staff.id]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/medical/staff/prescriptions", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalStaffTables();
      const staff = (await query(`SELECT id FROM medical_staff WHERE user_id=$1`, [me.id])).rows[0];
      if (!staff) return res.status(403).json({ error: "لست مسجلاً كطاقم طبي" });
      const { patient_name, patient_id, medications, diagnosis, notes } = req.body;
      const r = await query(
        `INSERT INTO medical_prescriptions (staff_id, patient_name, patient_id, medications, diagnosis, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [staff.id, patient_name, patient_id||null, JSON.stringify(medications||[]), diagnosis||null, notes||null]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/medical/staff/lab-orders", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalStaffTables();
      const staff = (await query(`SELECT id FROM medical_staff WHERE user_id=$1`, [me.id])).rows[0];
      if (!staff) return res.status(403).json({ error: "لست مسجلاً كطاقم طبي" });
      const { patient_name, patient_id, tests, priority } = req.body;
      const r = await query(
        `INSERT INTO medical_lab_orders (staff_id, patient_name, patient_id, tests, priority) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [staff.id, patient_name, patient_id||null, JSON.stringify(tests||[]), priority||'normal']
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/medical/lab/orders", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalStaffTables();
      const r = await query(`SELECT mlo.*, ms.role as staff_role, u.name as staff_name FROM medical_lab_orders mlo LEFT JOIN medical_staff ms ON ms.id=mlo.staff_id LEFT JOIN users u ON u.id=ms.user_id ORDER BY mlo.created_at DESC LIMIT 100`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/medical/lab/results", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalStaffTables();
      const { lab_order_id, results, notes } = req.body;
      await query(`UPDATE medical_lab_orders SET status='completed' WHERE id=$1`, [lab_order_id]);
      const r = await query(`INSERT INTO medical_lab_results (lab_order_id, results, notes, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [lab_order_id, JSON.stringify(results||{}), notes||null, me.id]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/medical/pharmacy/orders", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalStaffTables();
      const q = req.query.q as string | undefined;
      const status = req.query.status as string | undefined;
      let sql = `SELECT po.*, u.name as patient_name FROM pharmacy_orders po LEFT JOIN users u ON u.id=po.user_id WHERE 1=1`;
      const params: any[] = [];
      if (status) { params.push(status); sql += ` AND po.status=$${params.length}`; }
      if (q) { params.push(`%${q}%`); sql += ` AND (u.name ILIKE $${params.length} OR po.phone ILIKE $${params.length})`; }
      sql += ` ORDER BY po.created_at DESC LIMIT 100`;
      const r = await query(sql, params);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.patch("/api/medical/pharmacy/orders/:id/status", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`UPDATE pharmacy_orders SET status=$1 WHERE id=$2`, [req.body.status||'pending', parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── قبول المرضى في المستشفى ───────────────────────────────────────────────
  app.get("/api/medical/admissions/mine", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      // Add missing columns gracefully
      await query(`ALTER TABLE hospital_admissions ADD COLUMN IF NOT EXISTS bed_number VARCHAR(20)`);
      await query(`ALTER TABLE hospital_admissions ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(200)`);
      await query(`ALTER TABLE hospital_admissions ADD COLUMN IF NOT EXISTS medications_needed JSONB`);
      await query(`ALTER TABLE hospital_admissions ADD COLUMN IF NOT EXISTS visit_schedule JSONB`);
      await query(`ALTER TABLE hospital_admissions ADD COLUMN IF NOT EXISTS expected_discharge VARCHAR(20)`);
      const admsR = await query("SELECT * FROM hospital_admissions WHERE user_id=$1 ORDER BY created_at DESC", [user.id]);
      const admissions = await Promise.all(admsR.rows.map(async (adm: any) => {
        const cmpR = await query("SELECT * FROM admission_companions WHERE admission_id=$1 ORDER BY created_at DESC", [adm.id]);
        const companions = cmpR.rows.map((c: any) => ({
          ...c,
          exit_pass_active: c.exit_pass_issued,
          companion_name: c.companion_name,
          companion_phone: c.phone,
        }));
        return {
          ...adm,
          facility_name: adm.facility_name || adm.hospital,
          companions,
        };
      }));
      res.json({ admissions });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/medical/admissions", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const { patient_name, hospital, room_number, ward, admission_date, diagnosis, notes } = req.body;
      if (!patient_name || !hospital) return res.status(400).json({ error: "اسم المريض والمستشفى مطلوبان" });
      const r = await query(
        "INSERT INTO hospital_admissions(user_id,patient_name,hospital,room_number,ward,admission_date,diagnosis,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [user.id,patient_name,hospital,room_number||null,ward||null,admission_date||null,diagnosis||null,notes||null]
      );
      sendAdminNotifEmail("🏥 طلب دخول مستشفى جديد", {
        "اسم المريض": patient_name, "المستشفى": hospital,
        "الجناح": ward||"", "رقم الغرفة": room_number||"",
        "تاريخ الدخول": admission_date||"", "التشخيص": diagnosis||"",
        "ملاحظات": notes||"",
      });
      res.status(201).json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/medical/my-companion-requests", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const r = await query(
        `SELECT c.*, a.patient_name, a.hospital as facility_name, a.ward, a.diagnosis, a.expected_discharge,
                c.exit_pass_issued as exit_pass_active
         FROM admission_companions c
         JOIN hospital_admissions a ON a.id=c.admission_id
         WHERE c.requester_id=$1 ORDER BY c.created_at DESC`,
        [user.id]
      );
      res.json({ companion_requests: r.rows });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/medical/admissions/:admId/companions", async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const { companion_name, relation, phone, companion_phone } = req.body;
      if (!companion_name) return res.status(400).json({ error: "اسم المرافق مطلوب" });
      const phoneVal = phone || companion_phone || null;
      const r = await query(
        "INSERT INTO admission_companions(admission_id,requester_id,companion_name,relation,phone) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [req.params.admId, user.id, companion_name, relation||null, phoneVal]
      );
      res.status(201).json({ companion: r.rows[0] });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  const approveCompanionHandler = async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const status = req.body?.status || "approved";
      const r = await query(
        `UPDATE admission_companions SET status=$1, approved_at=${status === "approved" ? "NOW()" : "NULL"} WHERE id=$2 AND admission_id=$3 RETURNING *`,
        [status, req.params.cmpId, req.params.admId]
      );
      res.json({ companion: r.rows[0] || null });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  };
  app.post("/api/medical/admissions/:admId/companions/:cmpId/approve", approveCompanionHandler);
  app.patch("/api/medical/admissions/:admId/companions/:cmpId/approve", approveCompanionHandler);

  const exitPassHandler = async (req: Request, res: Response) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    try {
      await ensureMedicalTables();
      const active = req.body?.active !== undefined ? req.body.active : true;
      const r = await query(
        "UPDATE admission_companions SET exit_pass_issued=$1 WHERE id=$2 AND admission_id=$3 RETURNING *",
        [active, req.params.cmpId, req.params.admId]
      );
      res.json({ companion: r.rows[0] || null });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  };
  app.post("/api/medical/admissions/:admId/companions/:cmpId/exit-pass", exitPassHandler);
  app.patch("/api/medical/admissions/:admId/companions/:cmpId/exit-pass", exitPassHandler);

  // ── بوابة المؤسسات التعليمية ──────────────────────────────────────────────
  async function ensureInstTables() {
    await query(`CREATE TABLE IF NOT EXISTS institutions (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL,
      type VARCHAR(50) DEFAULT 'school', address TEXT, phone VARCHAR(20),
      email VARCHAR(100), username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(200) NOT NULL, is_active BOOLEAN DEFAULT TRUE,
      payment_methods JSONB DEFAULT '[]',
      services_availability JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS institution_sessions (
      id SERIAL PRIMARY KEY, inst_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
      token VARCHAR(200) UNIQUE NOT NULL, expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
    )`);
  }

  async function getInstFromRequest(req: Request): Promise<any | null> {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || !token.startsWith("inst_")) return null;
    try {
      const r = await query(
        `SELECT i.id,i.name,i.type,i.address,i.phone,i.email,i.username,i.payment_methods,i.services_availability
         FROM institutions i JOIN institution_sessions s ON s.inst_id=i.id
         WHERE s.token=$1 AND s.expires_at>NOW() AND i.is_active=TRUE`,
        [token]
      );
      return r.rows[0] || null;
    } catch { return null; }
  }

  app.post("/api/inst/login", async (req: Request, res: Response) => {
    try {
      await ensureInstTables();
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "بيانات الدخول مطلوبة" });
      const r = await query("SELECT * FROM institutions WHERE username=$1 AND is_active=TRUE", [username]);
      const inst = r.rows[0];
      if (!inst) return res.status(401).json({ error: "بيانات غير صحيحة" });
      const valid = await bcrypt.compare(password, inst.password_hash);
      if (!valid) return res.status(401).json({ error: "بيانات غير صحيحة" });
      const token = "inst_" + randomBytes(24).toString("hex");
      await query("INSERT INTO institution_sessions(inst_id,token) VALUES($1,$2)", [inst.id, token]);
      res.json({ token, institution: { id: inst.id, name: inst.name, type: inst.type, username: inst.username } });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/inst/logout", async (req: Request, res: Response) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token) await query("DELETE FROM institution_sessions WHERE token=$1", [token]).catch(() => {});
    res.json({ success: true });
  });

  app.get("/api/inst/my-info", async (req: Request, res: Response) => {
    const inst = await getInstFromRequest(req);
    if (!inst) return res.status(401).json({ error: "غير مصرح" });
    res.json(inst);
  });

  app.get("/api/inst/payment-settings", async (req: Request, res: Response) => {
    const inst = await getInstFromRequest(req);
    if (!inst) return res.status(401).json({ error: "غير مصرح" });
    try {
      const r = await query("SELECT payment_methods FROM institutions WHERE id=$1", [inst.id]);
      res.json({ payment_methods: r.rows[0]?.payment_methods || [] });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/inst/payment-settings", async (req: Request, res: Response) => {
    const inst = await getInstFromRequest(req);
    if (!inst) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { payment_methods } = req.body;
      await query("UPDATE institutions SET payment_methods=$1 WHERE id=$2", [JSON.stringify(payment_methods||[]), inst.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/inst/services-availability", async (req: Request, res: Response) => {
    const inst = await getInstFromRequest(req);
    if (!inst) return res.status(401).json({ error: "غير مصرح" });
    try {
      const r = await query("SELECT services_availability FROM institutions WHERE id=$1", [inst.id]);
      res.json(r.rows[0]?.services_availability || {});
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/inst/services-availability", async (req: Request, res: Response) => {
    const inst = await getInstFromRequest(req);
    if (!inst) return res.status(401).json({ error: "غير مصرح" });
    try {
      const updates = req.body;
      await query("UPDATE institutions SET services_availability=$1 WHERE id=$2", [JSON.stringify(updates), inst.id]);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── ضبط الأقسام ──────────────────────────────────────────────────────────
  const APP_SECTIONS_SEED = [
    // الأقسام الحكومية (تتطلب تصاريح وعقوداً)
    { key: "medical",    name: "الصحة والطب",          name_en: "Medical",            requires_contract: true,  order: 1  },
    { key: "transport",  name: "المواصلات والسفر",      name_en: "Transport & Travel", requires_contract: true,  order: 2  },
    { key: "lawyers",    name: "المحامون",               name_en: "Lawyers",            requires_contract: true,  order: 3  },
    { key: "orgs",       name: "المنظمات والهيئات",     name_en: "Organizations",      requires_contract: true,  order: 4  },
    { key: "women",      name: "قسم المرأة",            name_en: "Women",              requires_contract: true,  order: 5  },
    { key: "farmers",    name: "قطاع الزراعة والمزارعين", name_en: "Farmers",          requires_contract: true,  order: 6  },
    { key: "factories",  name: "المصانع والصناعة",      name_en: "Industry",           requires_contract: true,  order: 7  },
    { key: "telecom",    name: "الاتصالات",             name_en: "Telecom",            requires_contract: true,  order: 8  },
    // الأقسام العامة
    { key: "jobs",       name: "الوظائف والتوظيف",      name_en: "Jobs",               requires_contract: false, order: 20 },
    { key: "market",     name: "السوق والتجارة",         name_en: "Market",             requires_contract: false, order: 21 },
    { key: "sports",     name: "الرياضة",               name_en: "Sports",             requires_contract: false, order: 22 },
    { key: "culture",    name: "الثقافة والتراث",        name_en: "Culture",            requires_contract: false, order: 23 },
    { key: "social",     name: "الشأن الاجتماعي",        name_en: "Social",             requires_contract: false, order: 24 },
    { key: "communities",name: "المجتمعات",             name_en: "Communities",        requires_contract: false, order: 25 },
    { key: "student",    name: "الطلاب",                name_en: "Students",           requires_contract: false, order: 26 },
    { key: "unions",     name: "الاتحادات",             name_en: "Unions",             requires_contract: false, order: 27 },
    { key: "occasions",  name: "المناسبات",             name_en: "Occasions",          requires_contract: false, order: 28 },
    { key: "zawajil",    name: "التعارف والزواج",        name_en: "Zawajil",            requires_contract: false, order: 29 },
    { key: "rental",     name: "الإيجارات",             name_en: "Rentals",            requires_contract: false, order: 30 },
    { key: "map",        name: "خريطة المدينة",          name_en: "City Map",           requires_contract: false, order: 31 },
    { key: "missing",    name: "المفقودون",             name_en: "Missing Persons",    requires_contract: false, order: 32 },
    { key: "reports",    name: "البلاغات",              name_en: "Reports",            requires_contract: false, order: 33 },
    { key: "honored",    name: "الشخصيات المكرَّمة",    name_en: "Honored",            requires_contract: false, order: 34 },
    { key: "greetings",  name: "التهاني والتبريكات",     name_en: "Greetings",          requires_contract: false, order: 35 },
    { key: "events",     name: "الفعاليات",             name_en: "Events",             requires_contract: false, order: 36 },
    { key: "ads",        name: "الإعلانات",             name_en: "Ads",                requires_contract: false, order: 37 },
  ];

  async function ensureSectionConfigsTable() {
    await query(`CREATE TABLE IF NOT EXISTS app_section_configs (
      id SERIAL PRIMARY KEY,
      section_key VARCHAR(50) UNIQUE NOT NULL,
      section_name VARCHAR(100) NOT NULL,
      section_name_en VARCHAR(100),
      section_description TEXT,
      is_visible BOOLEAN DEFAULT TRUE,
      requires_contract BOOLEAN DEFAULT FALSE,
      contract_status VARCHAR(20) DEFAULT 'none',
      contract_signed_at DATE,
      contract_expiry_at DATE,
      contract_notes TEXT,
      authorized_entity VARCHAR(200),
      authorized_contact VARCHAR(200),
      sort_order INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    // seed missing rows
    for (const sec of APP_SECTIONS_SEED) {
      await query(
        `INSERT INTO app_section_configs(section_key,section_name,section_name_en,requires_contract,sort_order)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT(section_key) DO NOTHING`,
        [sec.key, sec.name, sec.name_en, sec.requires_contract, sec.order]
      );
    }
  }

  // Public: section visibility map used by FeatureFlagsProvider
  app.get("/api/app/section-configs", async (_req: Request, res: Response) => {
    try {
      await ensureSectionConfigsTable();
      const r = await query("SELECT section_key, is_visible, contract_status FROM app_section_configs");
      const map: Record<string, { visible: boolean; contract_status: string }> = {};
      for (const row of r.rows) {
        map[row.section_key] = { visible: row.is_visible, contract_status: row.contract_status };
      }
      res.json(map);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // Admin: full section list with contract details
  app.get("/api/admin/section-configs", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureSectionConfigsTable();
      const r = await query("SELECT * FROM app_section_configs ORDER BY sort_order, section_key");
      res.json({ sections: r.rows });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // Admin: update section visibility + contract info
  app.patch("/api/admin/section-configs/:key", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureSectionConfigsTable();
      const k = req.params.key;
      const {
        is_visible, contract_status, contract_signed_at, contract_expiry_at,
        contract_notes, authorized_entity, authorized_contact, section_description,
      } = req.body;
      const r = await query(
        `UPDATE app_section_configs SET
          is_visible          = COALESCE($1, is_visible),
          contract_status     = COALESCE($2, contract_status),
          contract_signed_at  = COALESCE($3::DATE, contract_signed_at),
          contract_expiry_at  = COALESCE($4::DATE, contract_expiry_at),
          contract_notes      = COALESCE($5, contract_notes),
          authorized_entity   = COALESCE($6, authorized_entity),
          authorized_contact  = COALESCE($7, authorized_contact),
          section_description = COALESCE($8, section_description),
          updated_at          = NOW()
         WHERE section_key=$9 RETURNING *`,
        [
          is_visible != null ? Boolean(is_visible) : null,
          contract_status || null,
          contract_signed_at || null,
          contract_expiry_at || null,
          contract_notes != null ? String(contract_notes) : null,
          authorized_entity != null ? String(authorized_entity) : null,
          authorized_contact != null ? String(authorized_contact) : null,
          section_description != null ? String(section_description) : null,
          k,
        ]
      );
      if (!r.rows[0]) return res.status(404).json({ error: "القسم غير موجود" });
      res.json({ section: r.rows[0] });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // نظام إدارة اتحاد الطلاب — Student Union Management System
  // ═══════════════════════════════════════════════════════════════════════════

  async function ensureStudentUnionMgmtTables() {
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

    // push tokens per manager device
    await query(`CREATE TABLE IF NOT EXISTS union_manager_push_tokens (
      id         SERIAL PRIMARY KEY,
      manager_id INTEGER NOT NULL REFERENCES union_managers(id) ON DELETE CASCADE,
      token      VARCHAR(300) UNIQUE NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }

  async function pushToUnionManagers(title: string, body: string, data: Record<string, unknown> = {}): Promise<void> {
    try {
      const r = await query(`SELECT DISTINCT token FROM union_manager_push_tokens WHERE token IS NOT NULL`);
      const tokens = r.rows.map((row: any) => row.token as string);
      await sendExpoPush(tokens, title, body, data, "DEFAULT");
    } catch (e) { console.error("pushToUnionManagers error:", e); }
  }

  async function getManagerFromRequest(req: Request): Promise<{ id: number; full_name: string; title: string; username: string } | null> {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || !token.startsWith("umt_")) return null;
    try {
      const r = await query(
        `SELECT m.id, m.full_name, m.title, m.username FROM union_managers m
         JOIN union_manager_sessions s ON s.manager_id = m.id
         WHERE s.token = $1 AND s.expires_at > NOW() AND m.is_active = TRUE`,
        [token]
      );
      return r.rows[0] || null;
    } catch { return null; }
  }

  // ── استمارة طلب الانضمام للإدارة (عام) ──────────────────────────────
  app.post("/api/union-manager/apply", async (req: Request, res: Response) => {
    try {
      await ensureStudentUnionMgmtTables();
      const { full_name, birth_date, age, gender, national_id, phone, email,
        state, locality, admin_unit, institution, study_stage, grade_level, major,
        skills, prev_experience, exp_details, committees,
        motivation, contribution, vision,
        can_attend, weekly_hours, other_commits, pledge_name } = req.body;
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
      sendAdminNotifEmail("📋 طلب انضمام لإدارة الاتحاد جديد", {
        "الاسم الكامل": full_name, "الهاتف": phone,
        "البريد الإلكتروني": email||"", "المؤسسة": institution||"",
        "التخصص": major||"", "مرحلة الدراسة": study_stage||"",
      });
      res.status(201).json({ success: true, application: r.rows[0] });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── تسجيل دخول مدير الاتحاد ──────────────────────────────────────
  app.post("/api/union-manager/login", async (req: Request, res: Response) => {
    try {
      await ensureStudentUnionMgmtTables();
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
      const r = await query(`SELECT * FROM union_managers WHERE username=$1 AND is_active=TRUE`, [username]);
      const mgr = r.rows[0];
      if (!mgr) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      const valid = await bcrypt.compare(password, mgr.password_hash);
      if (!valid) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      const token = "umt_" + randomBytes(24).toString("hex");
      await query(`INSERT INTO union_manager_sessions (manager_id,token) VALUES ($1,$2)`, [mgr.id, token]);
      res.json({ token, manager: { id: mgr.id, full_name: mgr.full_name, title: mgr.title, username: mgr.username } });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── تسجيل push token لمسؤول الاتحاد ─────────────────────────────
  app.put("/api/union-manager/push-token", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { pushToken } = req.body;
      if (!pushToken) return res.status(400).json({ error: "pushToken مطلوب" });
      await query(
        `INSERT INTO union_manager_push_tokens (manager_id, token, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (token) DO UPDATE SET manager_id=$1, updated_at=NOW()`,
        [mgr.id, pushToken]
      );
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── تغيير كلمة المرور ────────────────────────────────────────────
  app.post("/api/union-manager/change-password", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { current_password, new_password } = req.body;
      if (!current_password || !new_password) return res.status(400).json({ error: "كلمة المرور الحالية والجديدة مطلوبتان" });
      if (new_password.length < 8) return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل" });
      const r = await query(`SELECT password_hash FROM union_managers WHERE id=$1`, [mgr.id]);
      const valid = await bcrypt.compare(current_password, r.rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
      const newHash = await bcrypt.hash(new_password, 12);
      await query(`UPDATE union_managers SET password_hash=$1 WHERE id=$2`, [newHash, mgr.id]);
      // إلغاء جميع الجلسات الأخرى
      const authToken = (req.headers.authorization || "").replace("Bearer ", "");
      await query(`DELETE FROM union_manager_sessions WHERE manager_id=$1 AND token != $2`, [mgr.id, authToken]);
      res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── طلبات الانضمام (للمسؤول) ─────────────────────────────────────
  app.get("/api/union-manager/join-requests", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureStudentUnionMgmtTables();
      const status = req.query.status as string | undefined;
      const r = status && status !== "all"
        ? await query(`SELECT * FROM union_manager_applications WHERE status=$1 ORDER BY created_at DESC`, [status])
        : await query(`SELECT * FROM union_manager_applications ORDER BY created_at DESC`);
      res.json({ applications: r.rows });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/union-manager/join-requests/:id/status", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { status, admin_note } = req.body;
      if (!["pending","approved","rejected"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
      const r = await query(
        `UPDATE union_manager_applications SET status=$1, admin_note=$2 WHERE id=$3 RETURNING *`,
        [status, admin_note || null, req.params.id]
      );
      if (!r.rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── لوحة التحكم (dashboard) ───────────────────────────────────────
  app.get("/api/union-manager/dashboard", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const staff   = await query(`SELECT COUNT(*) FROM union_staff WHERE manager_id=$1 AND is_active=TRUE`, [mgr.id]);
      const meetings= await query(`SELECT COUNT(*) FROM union_meetings WHERE manager_id=$1 AND status='upcoming'`, [mgr.id]);
      const msgs    = await query(`SELECT COUNT(*) FROM union_messages WHERE manager_id=$1`, [mgr.id]);
      res.json({
        manager: mgr,
        stats: {
          staff: parseInt(staff.rows[0].count),
          upcoming_meetings: parseInt(meetings.rows[0].count),
          messages: parseInt(msgs.rows[0].count),
        }
      });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── الموظفون ─────────────────────────────────────────────────────
  app.get("/api/union-manager/staff", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const r = await query(`SELECT * FROM union_staff WHERE manager_id=$1 ORDER BY created_at DESC`, [mgr.id]);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/union-manager/staff", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { full_name, role, committee, phone, email, notes } = req.body;
      if (!full_name || !role) return res.status(400).json({ error: "الاسم والمنصب مطلوبان" });
      const r = await query(
        `INSERT INTO union_staff (manager_id,full_name,role,committee,phone,email,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [mgr.id, full_name, role, committee||null, phone||null, email||null, notes||null]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/union-manager/staff/:id", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { full_name, role, committee, phone, email, notes, is_active } = req.body;
      const r = await query(
        `UPDATE union_staff SET
          full_name=COALESCE($1,full_name), role=COALESCE($2,role),
          committee=COALESCE($3,committee), phone=COALESCE($4,phone),
          email=COALESCE($5,email), notes=COALESCE($6,notes),
          is_active=COALESCE($7,is_active)
         WHERE id=$8 AND manager_id=$9 RETURNING *`,
        [full_name||null,role||null,committee||null,phone||null,email||null,notes||null,
         is_active!=null?Boolean(is_active):null, req.params.id, mgr.id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/union-manager/staff/:id", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM union_staff WHERE id=$1 AND manager_id=$2`, [req.params.id, mgr.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── الاجتماعات ────────────────────────────────────────────────────
  app.get("/api/union-manager/meetings", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const r = await query(`SELECT * FROM union_meetings WHERE manager_id=$1 ORDER BY created_at DESC`, [mgr.id]);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/union-manager/meetings", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { title, description, meeting_date, meeting_time, location, type } = req.body;
      if (!title) return res.status(400).json({ error: "عنوان الاجتماع مطلوب" });
      const r = await query(
        `INSERT INTO union_meetings (manager_id,title,description,meeting_date,meeting_time,location,type)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [mgr.id, title, description||null, meeting_date||null, meeting_time||null, location||null, type||'meeting']
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/union-manager/meetings/:id", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
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
      res.json(r.rows[0] || { error: "لم يُعثر" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/union-manager/meetings/:id", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM union_meetings WHERE id=$1 AND manager_id=$2`, [req.params.id, mgr.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── التواصل الداخلي ───────────────────────────────────────────────
  app.get("/api/union-manager/messages", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const r = await query(`SELECT * FROM union_messages WHERE manager_id=$1 ORDER BY is_pinned DESC, created_at DESC`, [mgr.id]);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/union-manager/messages", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { sender_name, content, is_pinned } = req.body;
      if (!sender_name || !content) return res.status(400).json({ error: "المرسل والمحتوى مطلوبان" });
      const r = await query(
        `INSERT INTO union_messages (manager_id,sender_name,content,is_pinned)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [mgr.id, sender_name, content, Boolean(is_pinned)]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/union-manager/messages/:id/pin", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const r = await query(
        `UPDATE union_messages SET is_pinned = NOT is_pinned WHERE id=$1 AND manager_id=$2 RETURNING *`,
        [req.params.id, mgr.id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/union-manager/messages/:id", async (req: Request, res: Response) => {
    const mgr = await getManagerFromRequest(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM union_messages WHERE id=$1 AND manager_id=$2`, [req.params.id, mgr.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── إدارة الطلبات من قبل المشرف الرئيسي ──────────────────────────
  app.get("/api/admin/union-manager-apps", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureStudentUnionMgmtTables();
      const r = await query(`SELECT * FROM union_manager_applications ORDER BY created_at DESC`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/union-manager-apps/:id/status", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureStudentUnionMgmtTables();
      const { status, admin_note, username, password } = req.body;
      if (!["approved","rejected","pending"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });

      await query(`UPDATE union_manager_applications SET status=$1, admin_note=$2 WHERE id=$3`, [status, admin_note||null, req.params.id]);

      if (status === "approved" && username && password) {
        const appR = await query(`SELECT * FROM union_manager_applications WHERE id=$1`, [req.params.id]);
        const app_ = appR.rows[0];
        if (app_) {
          const hash = await bcrypt.hash(password, 10);
          const existing = await query(`SELECT id FROM union_managers WHERE username=$1`, [username]);
          if (existing.rows.length > 0) return res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" });
          await query(
            `INSERT INTO union_managers (application_id,full_name,username,password_hash,phone,email)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [app_.id, app_.full_name, username, hash, app_.phone, app_.email]
          );
        }
      }
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── الـ endpoint المفقود لطلبات عضوية اتحاد الطلاب ───────────────
  app.post("/api/student-union/apply", async (req: Request, res: Response) => {
    try {
      await ensureStudentUnionMgmtTables();
      const { full_name, phone, national_id, institution, study_stage, major, year,
        skills, committees, motivation, contribution, can_attend_meetings,
        weekly_hours, pledge_name, gender, birth_date, email, address,
        previous_experience, experience_details, vision, other_commitments, pledge_date } = req.body;
      if (!full_name || !phone) return res.status(400).json({ error: "الاسم ورقم الهاتف مطلوبان" });
      const r = await query(
        `INSERT INTO union_manager_applications
          (full_name,phone,national_id,institution,study_stage,grade_level,major,
           skills,committees,motivation,contribution,can_attend,weekly_hours,pledge_name,
           gender,birth_date,email,admin_unit,prev_experience,exp_details,vision,other_commits)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING id,full_name,status`,
        [full_name,phone,national_id||null,institution||null,study_stage||null,year||null,major||null,
         JSON.stringify(skills||[]),JSON.stringify(committees||[]),
         motivation||null,contribution||null,can_attend_meetings!=null?Boolean(can_attend_meetings):null,
         weekly_hours||null,pledge_name||null,gender||null,birth_date||null,email||null,
         address||null,previous_experience!=null?Boolean(previous_experience):null,
         experience_details||null,vision||null,other_commitments||null]
      );
      sendAdminNotifEmail("🎓 طلب عضوية اتحاد الطلاب جديد", {
        "الاسم الكامل": full_name, "الهاتف": phone,
        "البريد الإلكتروني": email||"", "المؤسسة": institution||"",
        "التخصص": major||"", "مرحلة الدراسة": study_stage||"",
      });
      pushToUnionManagers(
        "🎓 طلب انضمام جديد",
        `${full_name} — ${institution || study_stage || "طالب"} يطلب الانضمام للاتحاد`,
        { screen: "union-manager-portal", tab: "requests" }
      ).catch(() => {});
      res.status(201).json({ success: true, application: r.rows[0] });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/student-union/applications", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureStudentUnionMgmtTables();
      const r = await query(`SELECT * FROM union_manager_applications ORDER BY created_at DESC`);
      res.json({ applications: r.rows });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/student-union/applications/:id/status", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { status, admin_note } = req.body;
      const r = await query(
        `UPDATE union_manager_applications SET status=$1, admin_note=$2 WHERE id=$3 RETURNING *`,
        [status, admin_note||null, req.params.id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── الكوادر الطبية ───────────────────────────────────────────────────────────
  async function ensureMedicalStaffTables() {
    await query(`
      CREATE TABLE IF NOT EXISTS medical_staff (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) UNIQUE NOT NULL,
        staff_type VARCHAR(30) NOT NULL,
        full_name VARCHAR(150) NOT NULL,
        license_number VARCHAR(80),
        specialization VARCHAR(100),
        workplace VARCHAR(150),
        phone VARCHAR(30),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id SERIAL PRIMARY KEY,
        doctor_id INTEGER REFERENCES medical_staff(id),
        patient_name VARCHAR(150) NOT NULL,
        patient_id VARCHAR(80),
        medication VARCHAR(200) NOT NULL,
        dosage VARCHAR(100),
        frequency VARCHAR(100),
        duration VARCHAR(80),
        notes TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS lab_orders (
        id SERIAL PRIMARY KEY,
        doctor_id INTEGER REFERENCES medical_staff(id),
        patient_name VARCHAR(150) NOT NULL,
        patient_id VARCHAR(80),
        test_name VARCHAR(200) NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'normal',
        notes TEXT,
        result TEXT,
        result_unit VARCHAR(50),
        reference_range VARCHAR(100),
        result_status VARCHAR(30),
        lab_technician_id INTEGER REFERENCES medical_staff(id),
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
  await ensureMedicalStaffTables();

  app.post("/api/medical-staff/register", async (req: Request, res: Response) => {
    const uid = (req as any).userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const { staff_type, full_name, license_number, specialization, workplace, phone } = req.body || {};
    if (!staff_type || !full_name) return res.status(400).json({ error: "نوع الكادر والاسم مطلوبان" });
    try {
      const r = await query(
        `INSERT INTO medical_staff (user_id,staff_type,full_name,license_number,specialization,workplace,phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id) DO UPDATE SET staff_type=$2,full_name=$3,license_number=$4,specialization=$5,workplace=$6,phone=$7
         RETURNING *`,
        [uid, staff_type, full_name, license_number||null, specialization||null, workplace||null, phone||null]
      );
      sendAdminNotifEmail("⚕️ تسجيل كادر طبي جديد", {
        "الاسم الكامل": full_name, "نوع الكادر": staff_type,
        "رقم الترخيص": license_number||"", "التخصص": specialization||"",
        "جهة العمل": workplace||"", "الهاتف": phone||"",
      });
      res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/medical-staff/profile", async (req: Request, res: Response) => {
    const uid = (req as any).userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    try {
      const r = await query("SELECT * FROM medical_staff WHERE user_id=$1", [uid]);
      if (!r.rows[0]) return res.status(404).json({ error: "غير مسجل" });
      res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/medical-staff/prescriptions", async (req: Request, res: Response) => {
    const uid = (req as any).userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const { patient_name, patient_id, medication, dosage, frequency, duration, notes } = req.body || {};
    if (!patient_name || !medication) return res.status(400).json({ error: "اسم المريض والدواء مطلوبان" });
    try {
      const staff = await query("SELECT id FROM medical_staff WHERE user_id=$1", [uid]);
      if (!staff.rows[0]) return res.status(403).json({ error: "غير مسجل كطاقم طبي" });
      const r = await query(
        `INSERT INTO prescriptions (doctor_id,patient_name,patient_id,medication,dosage,frequency,duration,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [staff.rows[0].id, patient_name, patient_id||null, medication, dosage||null, frequency||null, duration||null, notes||null]
      );
      res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/medical-staff/prescriptions", async (req: Request, res: Response) => {
    const uid = (req as any).userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    try {
      const staff = await query("SELECT id FROM medical_staff WHERE user_id=$1", [uid]);
      if (!staff.rows[0]) return res.status(403).json({ error: "غير مسجل" });
      const r = await query("SELECT * FROM prescriptions WHERE doctor_id=$1 ORDER BY created_at DESC LIMIT 50", [staff.rows[0].id]);
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/medical-staff/lab-orders", async (req: Request, res: Response) => {
    const uid = (req as any).userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const { patient_name, patient_id, test_name, priority, notes } = req.body || {};
    if (!patient_name || !test_name) return res.status(400).json({ error: "اسم المريض والفحص مطلوبان" });
    try {
      const staff = await query("SELECT id FROM medical_staff WHERE user_id=$1", [uid]);
      if (!staff.rows[0]) return res.status(403).json({ error: "غير مسجل" });
      const r = await query(
        `INSERT INTO lab_orders (doctor_id,patient_name,patient_id,test_name,priority,notes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [staff.rows[0].id, patient_name, patient_id||null, test_name, priority||"normal", notes||null]
      );
      res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/medical-staff/lab/orders", async (_req: Request, res: Response) => {
    try {
      const r = await query("SELECT * FROM lab_orders WHERE status='pending' ORDER BY created_at ASC LIMIT 100");
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/medical-staff/lab/results", async (req: Request, res: Response) => {
    const uid = (req as any).userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const { order_id, result, result_unit, reference_range, result_status } = req.body || {};
    if (!order_id || !result) return res.status(400).json({ error: "رقم الطلب والنتيجة مطلوبان" });
    try {
      const staff = await query("SELECT id FROM medical_staff WHERE user_id=$1", [uid]);
      if (!staff.rows[0]) return res.status(403).json({ error: "غير مسجل" });
      const r = await query(
        `UPDATE lab_orders SET result=$1, result_unit=$2, reference_range=$3, result_status=$4,
         lab_technician_id=$5, status='completed' WHERE id=$6 RETURNING *`,
        [result, result_unit||null, reference_range||null, result_status||"normal", staff.rows[0].id, order_id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر على الطلب" });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.get("/api/medical-staff/pharmacy/orders", async (req: Request, res: Response) => {
    const uid = (req as any).userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const { status } = req.query;
    try {
      const cond = status && status !== "all" ? "WHERE status=$1" : "";
      const params = status && status !== "all" ? [status] : [];
      const r = await query(`SELECT * FROM prescriptions ${cond} ORDER BY created_at DESC LIMIT 100`, params);
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/medical-staff/pharmacy/orders/:id/status", async (req: Request, res: Response) => {
    const uid = (req as any).userId;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ error: "الحالة مطلوبة" });
    try {
      const r = await query("UPDATE prescriptions SET status=$1 WHERE id=$2 RETURNING *", [status, req.params.id]);
      res.json(r.rows[0] || { error: "لم يُعثر" });
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  // ── رفع الملفات ──────────────────────────────────────────────────────────────
  app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "لم يتم إرسال أي ملف" });
    const { buffer, originalname, mimetype } = req.file;
    try {
      let url: string;
      if (
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
      ) {
        url = await uploadToCloudinary(buffer, mimetype);
      } else {
        url = saveLocally(buffer, originalname);
      }
      res.json({ url });
    } catch (err: any) {
      console.error("Upload error:", err);
      res.status(500).json({ error: err?.message || "فشل رفع الملف" });
    }
  });

  // ── تقديم الملفات المحلية ─────────────────────────────────────────────────────
  app.get("/api/files/:filename", (req: Request, res: Response) => {
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.join(uploadsDir, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "الملف غير موجود" });
    res.sendFile(filePath);
  });

  // ── زواجل — نظام مدير مستقل ─────────────────────────────────────────────────
  async function ensureZawajilManagerTables() {
    await query(`CREATE TABLE IF NOT EXISTS zawajil_managers (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(200) NOT NULL,
      username VARCHAR(80) UNIQUE NOT NULL,
      password_hash VARCHAR(200) NOT NULL,
      email VARCHAR(100),
      phone VARCHAR(20),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS zawajil_manager_sessions (
      id SERIAL PRIMARY KEY,
      manager_id INTEGER NOT NULL REFERENCES zawajil_managers(id) ON DELETE CASCADE,
      token VARCHAR(80) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    // Seed default manager on first run
    const existing = await query(`SELECT id FROM zawajil_managers LIMIT 1`);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash("2026", 10);
      await query(
        `INSERT INTO zawajil_managers (full_name, username, password_hash, email)
         VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
        ["مدير زواجل", "almhbob.iii@gmail.com", hash, "almhbob.iii@gmail.com"]
      );
    }
  }

  async function getZawajilManager(req: Request): Promise<{ id: number; full_name: string; username: string } | null> {
    const auth = req.headers.authorization || "";
    const tok = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!tok || !tok.startsWith("zmt_")) return null;
    try {
      const r = await query(
        `SELECT m.id, m.full_name, m.username FROM zawajil_managers m
         JOIN zawajil_manager_sessions s ON s.manager_id = m.id
         WHERE s.token = $1 AND s.expires_at > NOW() AND m.is_active = TRUE`,
        [tok]
      );
      return r.rows[0] || null;
    } catch { return null; }
  }

  // ── تسجيل دخول مدير زواجل ─────────────────────────────────────────────────
  app.post("/api/zawajil-manager/login", async (req: Request, res: Response) => {
    try {
      await ensureZawajilManagerTables();
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "اسم المستخدم وكلمة المرور مطلوبان" });
      const r = await query(`SELECT * FROM zawajil_managers WHERE username=$1 AND is_active=TRUE`, [username]);
      const mgr = r.rows[0];
      if (!mgr) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      const valid = await bcrypt.compare(password, mgr.password_hash);
      if (!valid) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      const token = "zmt_" + randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await query(`INSERT INTO zawajil_manager_sessions (manager_id,token,expires_at) VALUES ($1,$2,$3)`, [mgr.id, token, expiresAt]);
      res.json({ token, manager: { id: mgr.id, full_name: mgr.full_name, username: mgr.username } });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── تسجيل خروج ─────────────────────────────────────────────────────────────
  app.post("/api/zawajil-manager/logout", async (req: Request, res: Response) => {
    const auth = req.headers.authorization || "";
    const tok = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (tok) { try { await query(`DELETE FROM zawajil_manager_sessions WHERE token=$1`, [tok]); } catch {} }
    res.json({ success: true });
  });

  // ── لوحة التحكم ────────────────────────────────────────────────────────────
  app.get("/api/zawajil-manager/dashboard", async (req: Request, res: Response) => {
    const mgr = await getZawajilManager(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureZawajilTables();
      const total     = await query(`SELECT COUNT(*) FROM zawajil_orders`);
      const pending   = await query(`SELECT COUNT(*) FROM zawajil_orders WHERE status='pending_review'`);
      const completed = await query(`SELECT COUNT(*) FROM zawajil_orders WHERE status='completed'`);
      const revenue   = await query(`SELECT COALESCE(SUM(estimated_cost),0) AS total FROM zawajil_orders WHERE status='completed'`);
      res.json({
        manager: mgr,
        stats: {
          total_orders: parseInt(total.rows[0].count),
          pending: parseInt(pending.rows[0].count),
          completed: parseInt(completed.rows[0].count),
          revenue: parseFloat(revenue.rows[0].total),
        }
      });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── قائمة الطلبات ──────────────────────────────────────────────────────────
  app.get("/api/zawajil-manager/orders", async (req: Request, res: Response) => {
    const mgr = await getZawajilManager(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureZawajilTables();
      const { status } = req.query;
      const where = status && status !== "all" ? "WHERE o.status=$1" : "";
      const params = status && status !== "all" ? [status] : [];
      const r = await query(
        `SELECT o.*, (SELECT json_agg(g) FROM zawajil_shoubash_guests g WHERE g.order_id=o.id) AS shoubash_guests
         FROM zawajil_orders o ${where} ORDER BY o.created_at DESC`,
        params
      );
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── تحديث حالة الطلب ───────────────────────────────────────────────────────
  app.patch("/api/zawajil-manager/orders/:id/status", async (req: Request, res: Response) => {
    const mgr = await getZawajilManager(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { status, admin_notes } = req.body;
      if (!status) return res.status(400).json({ error: "الحالة مطلوبة" });
      const r = await query(
        `UPDATE zawajil_orders SET status=$1, admin_notes=COALESCE($2,admin_notes), updated_at=NOW() WHERE id=$3 RETURNING *`,
        [status, admin_notes || null, req.params.id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر على الطلب" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── مراجعة الطلب (موافقة / رفض) ───────────────────────────────────────────
  app.patch("/api/zawajil-manager/orders/:id/review", async (req: Request, res: Response) => {
    const mgr = await getZawajilManager(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { action, admin_notes, rejection_reason, estimated_cost } = req.body;
      if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "الإجراء غير صالح" });
      const newStatus = action === "approve" ? "approved" : "rejected";
      const r = await query(
        `UPDATE zawajil_orders SET status=$1, admin_notes=COALESCE($2,admin_notes),
         rejection_reason=COALESCE($3,rejection_reason),
         estimated_cost=COALESCE($4::numeric,estimated_cost), updated_at=NOW()
         WHERE id=$5 RETURNING *`,
        [newStatus, admin_notes || null, rejection_reason || null, estimated_cost || null, req.params.id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر على الطلب" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── المنتجات (مدير زواجل) ──────────────────────────────────────────────────
  app.get("/api/zawajil-manager/products", async (req: Request, res: Response) => {
    const mgr = await getZawajilManager(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureZawajilTables();
      const r = await query(`SELECT * FROM zawajil_products ORDER BY sort_order, name`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/zawajil-manager/products", async (req: Request, res: Response) => {
    const mgr = await getZawajilManager(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureZawajilTables();
      const { name, description, price, category, image_url, is_available, sort_order } = req.body;
      if (!name) return res.status(400).json({ error: "اسم المنتج مطلوب" });
      const r = await query(
        `INSERT INTO zawajil_products(name,description,price,category,image_url,is_available,sort_order)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [name, description || null, price || 0, category || "general", image_url || null, is_available !== false, sort_order || 0]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/zawajil-manager/products/:id", async (req: Request, res: Response) => {
    const mgr = await getZawajilManager(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { name, description, price, category, image_url, is_available, sort_order } = req.body;
      const r = await query(
        `UPDATE zawajil_products SET
         name=COALESCE($1,name), description=COALESCE($2,description),
         price=COALESCE($3::numeric,price), category=COALESCE($4,category),
         image_url=COALESCE($5,image_url), is_available=COALESCE($6,is_available),
         sort_order=COALESCE($7::int,sort_order)
         WHERE id=$8 RETURNING *`,
        [name || null, description || null, price || null, category || null,
         image_url || null, is_available != null ? Boolean(is_available) : null,
         sort_order || null, req.params.id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر على المنتج" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/zawajil-manager/products/:id", async (req: Request, res: Response) => {
    const mgr = await getZawajilManager(req);
    if (!mgr) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM zawajil_products WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── إدارة مديري زواجل (من قبل الأدمن) ────────────────────────────────────
  app.get("/api/admin/zawajil-managers", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureZawajilManagerTables();
      const r = await query(`SELECT id,full_name,username,email,phone,is_active,created_at FROM zawajil_managers ORDER BY created_at DESC`);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/admin/zawajil-managers", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureZawajilManagerTables();
      const { full_name, username, password, email, phone } = req.body;
      if (!full_name || !username || !password) return res.status(400).json({ error: "الاسم واسم المستخدم وكلمة المرور مطلوبة" });
      const existing = await query(`SELECT id FROM zawajil_managers WHERE username=$1`, [username]);
      if (existing.rows.length > 0) return res.status(409).json({ error: "اسم المستخدم مستخدم مسبقاً" });
      const hash = await bcrypt.hash(password, 10);
      const r = await query(
        `INSERT INTO zawajil_managers (full_name,username,password_hash,email,phone)
         VALUES ($1,$2,$3,$4,$5) RETURNING id,full_name,username,email,phone,is_active,created_at`,
        [full_name, username, hash, email || null, phone || null]
      );
      res.status(201).json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/zawajil-managers/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { full_name, is_active, email, phone } = req.body;
      const r = await query(
        `UPDATE zawajil_managers SET
         full_name=COALESCE($1,full_name), is_active=COALESCE($2,is_active),
         email=COALESCE($3,email), phone=COALESCE($4,phone)
         WHERE id=$5 RETURNING id,full_name,username,email,phone,is_active,created_at`,
        [full_name || null, is_active != null ? Boolean(is_active) : null, email || null, phone || null, req.params.id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر على المدير" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/admin/zawajil-managers/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM zawajil_managers WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ── وكالات السفر والسياحة ───────────────────────────────────────────────────
  async function ensureTravelAgencyTables() {
    await query(`CREATE TABLE IF NOT EXISTS travel_agencies (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      name_en VARCHAR(200),
      agency_type VARCHAR(40) NOT NULL DEFAULT 'local',
      specialties TEXT[] DEFAULT '{}',
      destinations TEXT[] DEFAULT '{}',
      description TEXT,
      logo_url VARCHAR(500),
      website VARCHAR(300),
      phone VARCHAR(30),
      whatsapp VARCHAR(30),
      email VARCHAR(100),
      city VARCHAR(100),
      country VARCHAR(100) DEFAULT 'السودان',
      license_number VARCHAR(80),
      founded_year INTEGER,
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      is_approved BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS travel_agency_applications (
      id SERIAL PRIMARY KEY,
      agency_name VARCHAR(200) NOT NULL,
      agency_type VARCHAR(40) NOT NULL,
      specialties TEXT[] DEFAULT '{}',
      destinations TEXT[] DEFAULT '{}',
      description TEXT,
      website VARCHAR(300),
      contact_name VARCHAR(100) NOT NULL,
      contact_role VARCHAR(100),
      phone VARCHAR(30),
      whatsapp VARCHAR(30),
      email VARCHAR(100),
      city VARCHAR(100),
      country VARCHAR(100),
      license_number VARCHAR(80),
      founded_year INTEGER,
      services_offered TEXT,
      target_routes TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  }

  app.get("/api/travel-agencies", async (_req: Request, res: Response) => {
    try {
      await ensureTravelAgencyTables();
      const r = await query(
        `SELECT * FROM travel_agencies WHERE is_approved = TRUE ORDER BY is_featured DESC, sort_order ASC, created_at DESC`
      );
      res.json({ agencies: r.rows });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/travel-agencies/apply", async (req: Request, res: Response) => {
    try {
      await ensureTravelAgencyTables();
      const {
        agency_name, agency_type, specialties, destinations, description,
        website, contact_name, contact_role, phone, whatsapp, email,
        city, country, license_number, founded_year, services_offered, target_routes,
      } = req.body;
      if (!agency_name?.trim() || !contact_name?.trim()) {
        return res.status(400).json({ error: "اسم الوكالة واسم المسؤول مطلوبان" });
      }
      const r = await query(
        `INSERT INTO travel_agency_applications
         (agency_name,agency_type,specialties,destinations,description,website,
          contact_name,contact_role,phone,whatsapp,email,city,country,
          license_number,founded_year,services_offered,target_routes)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [agency_name,agency_type||"local",specialties||[],destinations||[],description,
         website,contact_name,contact_role,phone,whatsapp,email,city,country||"السودان",
         license_number,founded_year||null,services_offered,target_routes]
      );
      await sendAdminNotifEmail("🛫 طلب انضمام وكالة سفر جديدة", {
        "الوكالة": agency_name,
        "النوع": agency_type,
        "المسؤول": contact_name,
        "الهاتف": phone || whatsapp || "",
        "الإيميل": email || "",
        "المدينة": `${city || ""} — ${country || ""}`,
      }).catch(() => {});
      res.json({ success: true, id: r.rows[0].id, message: "تم استلام طلبكم بنجاح — سيتم مراجعته خلال 48 ساعة" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // إدارة وكالات السفر (admin)
  app.get("/api/admin/travel-agencies", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTravelAgencyTables();
      const r = await query(`SELECT * FROM travel_agencies ORDER BY sort_order ASC, created_at DESC`);
      const apps = await query(`SELECT * FROM travel_agency_applications ORDER BY created_at DESC`);
      res.json({ agencies: r.rows, applications: apps.rows });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/admin/travel-agencies", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTravelAgencyTables();
      const { name, name_en, agency_type, specialties, destinations, description, logo_url,
              website, phone, whatsapp, email, city, country, license_number, founded_year, is_featured } = req.body;
      const r = await query(
        `INSERT INTO travel_agencies (name,name_en,agency_type,specialties,destinations,description,logo_url,website,phone,whatsapp,email,city,country,license_number,founded_year,is_featured,is_approved,status)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE,'approved') RETURNING *`,
        [name,name_en||null,agency_type||"local",specialties||[],destinations||[],description,
         logo_url||null,website||null,phone||null,whatsapp||null,email||null,city||null,
         country||"السودان",license_number||null,founded_year||null,!!is_featured]
      );
      res.json(r.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/travel-agencies/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { is_approved, is_featured, status, admin_note, sort_order } = req.body;
      const r = await query(
        `UPDATE travel_agencies SET
         is_approved=COALESCE($1,is_approved), is_featured=COALESCE($2,is_featured),
         status=COALESCE($3,status), admin_note=COALESCE($4,admin_note), sort_order=COALESCE($5,sort_order)
         WHERE id=$6 RETURNING *`,
        [is_approved!=null?Boolean(is_approved):null, is_featured!=null?Boolean(is_featured):null,
         status||null, admin_note||null, sort_order!=null?Number(sort_order):null, req.params.id]
      );
      res.json(r.rows[0] || { error: "لم يُعثر على الوكالة" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.delete("/api/admin/travel-agencies/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM travel_agencies WHERE id=$1`, [req.params.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/travel-agency-applications/:id", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { status, admin_note } = req.body;
      await query(
        `UPDATE travel_agency_applications SET status=$1, admin_note=$2 WHERE id=$3`,
        [status, admin_note||null, req.params.id]
      );
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ── MISSING ROUTES — added to fix broken API calls across all screens ──────
  // ════════════════════════════════════════════════════════════════════════════

  // ── Landmarks ────────────────────────────────────────────────────────────────
  async function ensureLandmarksTable() {
    await query(`CREATE TABLE IF NOT EXISTS landmarks (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      category VARCHAR(50),
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      image_url TEXT,
      is_featured BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/landmarks", async (_req, res) => {
    try {
      await ensureLandmarksTable();
      const r = await query(`SELECT * FROM landmarks ORDER BY is_featured DESC, created_at DESC`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/admin/landmarks", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureLandmarksTable();
      const r = await query(`SELECT * FROM landmarks ORDER BY created_at DESC`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/admin/landmarks", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureLandmarksTable();
      const { name, description, category, lat, lng, image_url, is_featured } = req.body;
      const r = await query(
        `INSERT INTO landmarks (name,description,category,lat,lng,image_url,is_featured) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [name, description||null, category||null, lat||null, lng||null, image_url||null, !!is_featured]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.put("/api/admin/landmarks/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureLandmarksTable();
      const { name, description, category, lat, lng, image_url, is_featured } = req.body;
      const r = await query(
        `UPDATE landmarks SET name=COALESCE($1,name), description=COALESCE($2,description), category=COALESCE($3,category), lat=COALESCE($4,lat), lng=COALESCE($5,lng), image_url=COALESCE($6,image_url), is_featured=COALESCE($7,is_featured) WHERE id=$8 RETURNING *`,
        [name||null, description||null, category||null, lat||null, lng||null, image_url||null, is_featured!=null?!!is_featured:null, parseInt(req.params.id)]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/landmarks/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM landmarks WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Ads ───────────────────────────────────────────────────────────────────────
  async function ensureAdsTable() {
    await query(`CREATE TABLE IF NOT EXISTS ads (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      image_url TEXT,
      contact_phone VARCHAR(30),
      category VARCHAR(50),
      status VARCHAR(20) DEFAULT 'pending',
      is_featured BOOLEAN DEFAULT FALSE,
      price NUMERIC(12,2),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS ads_settings (
      key VARCHAR(50) PRIMARY KEY,
      value TEXT
    )`).catch(() => {});
  }
  app.get("/api/ads", async (_req, res) => {
    try {
      await ensureAdsTable();
      const r = await query(`SELECT * FROM ads WHERE status='approved' ORDER BY is_featured DESC, created_at DESC LIMIT 100`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/ads/my-requests", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureAdsTable();
      const r = await query(`SELECT * FROM ads WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/ads/settings", async (_req, res) => {
    try {
      await ensureAdsTable();
      const r = await query(`SELECT key, value FROM ads_settings`);
      const s: Record<string,string> = {};
      for (const row of r.rows) s[row.key] = row.value;
      res.json(s);
    } catch { res.json({}); }
  });
  app.post("/api/ads/request", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureAdsTable();
      const { title, description, image_url, contact_phone, category, price } = req.body;
      const r = await query(
        `INSERT INTO ads (user_id,title,description,image_url,contact_phone,category,price,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
        [me.id, title, description||null, image_url||null, contact_phone||null, category||null, price||null]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/ads", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureAdsTable();
      const r = await query(`SELECT a.*, u.name as user_name FROM ads a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.put("/api/admin/ads/:id/status", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { status, is_featured } = req.body;
      await query(`UPDATE ads SET status=COALESCE($1,status), is_featured=COALESCE($2,is_featured) WHERE id=$3`,
        [status||null, is_featured!=null?is_featured:null, req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/ads/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM ads WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/ads-settings", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureAdsTable();
      const r = await query(`SELECT key, value FROM ads_settings`).catch(() => ({ rows: [] }));
      const settings: Record<string, any> = {};
      for (const row of r.rows) settings[row.key] = row.value;
      res.json(settings);
    } catch { res.json({}); }
  });
  app.put("/api/admin/ads-settings", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureAdsTable();
      for (const [k, v] of Object.entries(req.body)) {
        await query(`INSERT INTO ads_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2`, [k, String(v)]);
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin Contract Settings ───────────────────────────────────────────────────
  app.get("/api/admin/contract-settings", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS contract_settings (key VARCHAR(100) PRIMARY KEY, value TEXT)`);
      const r = await query(`SELECT key, value FROM contract_settings`);
      const s: Record<string, any> = {};
      for (const row of r.rows) s[row.key] = row.value;
      res.json(s);
    } catch { res.json({}); }
  });
  app.put("/api/admin/contract-settings", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS contract_settings (key VARCHAR(100) PRIMARY KEY, value TEXT)`);
      for (const [k, v] of Object.entries(req.body)) {
        await query(`INSERT INTO contract_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2`, [k, String(v)]);
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin Neighborhoods GET ───────────────────────────────────────────────────
  app.get("/api/admin/neighborhoods", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTransportTables();
      const r = await query(`SELECT * FROM transport_neighborhoods ORDER BY name`);
      res.json(r.rows);
    } catch { res.json([]); }
  });

  // ── Admin External Partnerships ───────────────────────────────────────────────
  app.get("/api/admin/external-partnerships", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const status = req.query.status as string | undefined;
      let sql = `SELECT ep.*, u.name as user_name FROM external_partnership_applications ep LEFT JOIN users u ON u.id=ep.user_id WHERE 1=1`;
      const params: any[] = [];
      if (status && status !== "all") { params.push(status); sql += ` AND ep.status=$${params.length}`; }
      sql += ` ORDER BY ep.created_at DESC`;
      const r = await query(sql, params).catch(() => ({ rows: [] }));
      res.json({ partnerships: r.rows });
    } catch { res.json({ partnerships: [] }); }
  });
  // support both PATCH and PUT for compatibility
  const patchExtPartner = async (req: Request, res: Response) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { status, admin_note } = req.body;
      await query(`UPDATE external_partnership_applications SET status=COALESCE($1,status), admin_note=COALESCE($2,admin_note), updated_at=NOW() WHERE id=$3`,
        [status||null, admin_note||null, parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  };
  app.put("/api/admin/external-partnerships/:id", patchExtPartner);
  app.patch("/api/admin/external-partnerships/:id", patchExtPartner);
  app.delete("/api/admin/external-partnerships/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM external_partnership_applications WHERE id=$1`, [parseInt(req.params.id)]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin Lawyer Applications Approve/Reject ──────────────────────────────────
  app.post("/api/admin/lawyer-applications/:id/approve", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const app_row = (await query(`SELECT * FROM lawyer_applications WHERE id=$1`, [parseInt(req.params.id)])).rows[0];
      if (!app_row) return res.status(404).json({ error: "غير موجود" });
      await query(`UPDATE lawyer_applications SET status='approved' WHERE id=$1`, [parseInt(req.params.id)]);
      // Create lawyer record
      await query(`INSERT INTO lawyers (user_id, name, phone, specialty, status) VALUES ($1,$2,$3,$4,'approved') ON CONFLICT DO NOTHING`, [app_row.user_id, app_row.full_name||'', app_row.phone||null, app_row.specialty||null]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/admin/lawyer-applications/:id/reject", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { admin_note } = req.body;
      await query(`UPDATE lawyer_applications SET status='rejected', admin_note=$1 WHERE id=$2`, [admin_note||null, parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin Phone Shops PUT/DELETE ──────────────────────────────────────────────
  app.put("/api/admin/phone-shops/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { is_approved, is_verified, is_featured } = req.body;
      await query(`UPDATE phone_shops SET is_approved=COALESCE($1,is_approved), is_verified=COALESCE($2,is_verified), is_featured=COALESCE($3,is_featured) WHERE id=$4`, [is_approved??null, is_verified??null, is_featured??null, parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/phone-shops/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM phone_shops WHERE id=$1`, [parseInt(req.params.id)]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Jobs ──────────────────────────────────────────────────────────────────────
  async function ensureJobsTable() {
    await query(`CREATE TABLE IF NOT EXISTS jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      company VARCHAR(200),
      description TEXT,
      requirements TEXT,
      location VARCHAR(100),
      salary_range VARCHAR(100),
      job_type VARCHAR(50) DEFAULT 'full_time',
      category VARCHAR(100),
      contact_phone VARCHAR(30),
      contact_email VARCHAR(150),
      status VARCHAR(20) DEFAULT 'active',
      deadline DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/jobs", async (req, res) => {
    try {
      await ensureJobsTable();
      const q = req.query.q as string | undefined;
      const cat = req.query.category as string | undefined;
      let sql = `SELECT * FROM jobs WHERE status='active'`;
      const params: any[] = [];
      if (q) { params.push(`%${q}%`); sql += ` AND (title ILIKE $${params.length} OR company ILIKE $${params.length} OR description ILIKE $${params.length})`; }
      if (cat) { params.push(cat); sql += ` AND category=$${params.length}`; }
      sql += ` ORDER BY created_at DESC LIMIT 100`;
      const r = await query(sql, params);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/jobs", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureJobsTable();
      const { title, company, description, requirements, location, salary_range, job_type, category, contact_phone, contact_email, deadline } = req.body;
      const r = await query(
        `INSERT INTO jobs (user_id,title,company,description,requirements,location,salary_range,job_type,category,contact_phone,contact_email,deadline)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [me.id, title, company||null, description||null, requirements||null, location||null, salary_range||null, job_type||'full_time', category||null, contact_phone||null, contact_email||null, deadline||null]
      );
      void pushToAdmins("💼 وظيفة جديدة", `${title}${company ? " — "+company : ""}`, { screen: "jobs", jobId: r.rows[0].id });
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/jobs", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureJobsTable();
      const r = await query(`SELECT j.*, u.name as poster_name FROM jobs j LEFT JOIN users u ON u.id=j.user_id ORDER BY j.created_at DESC`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.patch("/api/admin/jobs/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`UPDATE jobs SET status=$1 WHERE id=$2`, [req.body.status||'active', req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/jobs/:id", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      const r = await query(`SELECT user_id FROM jobs WHERE id=$1`, [req.params.id]);
      if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
      if (r.rows[0].user_id !== me.id && me.role !== "admin" && me.role !== "moderator") return res.status(403).json({ error: "غير مصرح" });
      await query(`DELETE FROM jobs WHERE id=$1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Search ────────────────────────────────────────────────────────────────────
  app.get("/api/search", async (req, res) => {
    try {
      const q = ((req.query.q as string) || "").trim();
      if (!q || q.length < 2) return res.json({ users: [], posts: [], news: [], jobs: [] });
      const like = `%${q}%`;
      const [users, posts, news, jobs] = await Promise.all([
        query(`SELECT id, name, neighborhood, avatar_url, role FROM users WHERE name ILIKE $1 LIMIT 10`, [like]),
        query(`SELECT id, content, created_at FROM posts WHERE content ILIKE $1 ORDER BY created_at DESC LIMIT 10`, [like]),
        query(`SELECT id, title, summary, image_url, created_at FROM news WHERE title ILIKE $1 OR summary ILIKE $1 ORDER BY created_at DESC LIMIT 10`, [like]).catch(() => ({ rows: [] })),
        query(`SELECT id, title, company, location, created_at FROM jobs WHERE (title ILIKE $1 OR company ILIKE $1) AND status='active' LIMIT 10`, [like]).catch(() => ({ rows: [] })),
      ]);
      res.json({ users: users.rows, posts: posts.rows, news: news.rows, jobs: jobs.rows });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Emergency Numbers ─────────────────────────────────────────────────────────
  async function ensureEmergencyNumbersTable() {
    await query(`CREATE TABLE IF NOT EXISTS emergency_numbers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      number VARCHAR(50) NOT NULL,
      category VARCHAR(50) DEFAULT 'general',
      icon VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`INSERT INTO emergency_numbers (name,number,category,icon) VALUES
      ('الشرطة','999','police','shield'),
      ('الإسعاف','998','medical','medical'),
      ('الإطفاء','998','fire','flame'),
      ('الدفاع المدني','1030','civil','warning'),
      ('مستشفى الحصاحيصا','0511844211','hospital','hospital'),
      ('السلطة المحلية','0511844200','government','business')
      ON CONFLICT DO NOTHING`).catch(() => {});
  }
  app.get("/api/emergency-numbers", async (_req, res) => {
    try {
      await ensureEmergencyNumbersTable();
      const r = await query(`SELECT * FROM emergency_numbers ORDER BY category, name`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/admin/emergency-numbers", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureEmergencyNumbersTable(); const r = await query(`SELECT * FROM emergency_numbers ORDER BY category, name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/admin/emergency-numbers", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureEmergencyNumbersTable();
      const { name, number, category, icon } = req.body;
      const r = await query(`INSERT INTO emergency_numbers (name,number,category,icon) VALUES ($1,$2,$3,$4) RETURNING *`, [name,number,category||'general',icon||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.put("/api/admin/emergency-numbers/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { name, number, category, icon } = req.body;
      await query(`UPDATE emergency_numbers SET name=COALESCE($1,name),number=COALESCE($2,number),category=COALESCE($3,category),icon=COALESCE($4,icon) WHERE id=$5`,
        [name||null, number||null, category||null, icon||null, req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/emergency-numbers/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM emergency_numbers WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Transport ─────────────────────────────────────────────────────────────────
  async function ensureTransportTables() {
    await query(`CREATE TABLE IF NOT EXISTS transport_neighborhoods (
      id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE,
      fare NUMERIC(8,2) DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, sort_order INTEGER DEFAULT 0
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS transport_trips (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      from_neighborhood VARCHAR(100), to_neighborhood VARCHAR(100),
      seats INTEGER DEFAULT 1, status VARCHAR(20) DEFAULT 'active',
      notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS transport_drivers (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      vehicle_type VARCHAR(50), plate_number VARCHAR(30),
      phone VARCHAR(30), neighborhood VARCHAR(100),
      status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/transport/neighborhoods", async (_req, res) => {
    try { await ensureTransportTables(); const r = await query(`SELECT * FROM transport_neighborhoods WHERE is_active=TRUE ORDER BY sort_order, name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/transport/fares", async (_req, res) => {
    try { await ensureTransportTables(); const r = await query(`SELECT name, fare FROM transport_neighborhoods WHERE is_active=TRUE ORDER BY sort_order, name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/transport/trips", async (_req, res) => {
    try {
      await ensureTransportTables();
      const r = await query(`SELECT t.*, u.name as user_name FROM transport_trips t LEFT JOIN users u ON u.id=t.user_id WHERE t.status='active' ORDER BY t.created_at DESC LIMIT 50`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/transport/my-trips", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try { await ensureTransportTables(); const r = await query(`SELECT * FROM transport_trips WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/transport/trips", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureTransportTables();
      const { from_neighborhood, to_neighborhood, seats, notes } = req.body;
      const r = await query(
        `INSERT INTO transport_trips (user_id,from_neighborhood,to_neighborhood,seats,notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [me.id, from_neighborhood||null, to_neighborhood||null, seats||1, notes||null]
      );
      void pushToAdmins("🚗 طلب مشوار جديد", `${me.name}: ${from_neighborhood||"?"} ← ${to_neighborhood||"?"}`, { screen: "transport", tripId: r.rows[0].id }, "TRANSPORT");
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/transport/drivers", async (_req, res) => {
    try { await ensureTransportTables(); const r = await query(`SELECT d.*, u.name as user_name FROM transport_drivers d LEFT JOIN users u ON u.id=d.user_id WHERE d.status='approved' ORDER BY d.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/transport/drivers/register", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureTransportTables();
      const { vehicle_type, plate_number, phone, neighborhood } = req.body;
      const r = await query(
        `INSERT INTO transport_drivers (user_id,vehicle_type,plate_number,phone,neighborhood) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [me.id, vehicle_type||null, plate_number||null, phone||null, neighborhood||null]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/transport/status", async (_req, res) => { res.json({ active: true, message: "خدمة النقل متاحة" }); });
  app.get("/api/transport/neighborhoods/suggest", async (req, res) => {
    try {
      await ensureTransportTables();
      const q = ((req.query.q as string)||"").trim();
      const r = await query(`SELECT name, fare FROM transport_neighborhoods WHERE name ILIKE $1 AND is_active=TRUE LIMIT 10`, [`%${q}%`]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/transport/neighborhoods/community-stats", async (_req, res) => {
    try {
      await ensureTransportTables();
      const r = await query(`SELECT from_neighborhood as neighborhood, COUNT(*) as trip_count FROM transport_trips GROUP BY from_neighborhood ORDER BY trip_count DESC LIMIT 10`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/admin/transport/stats", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTransportTables();
      const [trips, drivers] = await Promise.all([
        query(`SELECT COUNT(*) as total FROM transport_trips`),
        query(`SELECT COUNT(*) as total FROM transport_drivers`),
      ]);
      res.json({ trips: Number(trips.rows[0].total), drivers: Number(drivers.rows[0].total) });
    } catch { res.json({ trips: 0, drivers: 0 }); }
  });
  app.get("/api/admin/transport/trips", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureTransportTables(); const r = await query(`SELECT t.*, u.name as user_name FROM transport_trips t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 200`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/admin/transport/drivers", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureTransportTables(); const r = await query(`SELECT d.*, u.name as user_name FROM transport_drivers d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.patch("/api/admin/transport/drivers/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`UPDATE transport_drivers SET status=$1 WHERE id=$2`, [req.body.status||'pending', req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.put("/api/admin/neighborhoods", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTransportTables();
      const { neighborhoods } = req.body; // array of {name, fare}
      if (Array.isArray(neighborhoods)) {
        for (const n of neighborhoods) {
          await query(`INSERT INTO transport_neighborhoods (name, fare) VALUES ($1,$2) ON CONFLICT(name) DO UPDATE SET fare=$2`, [n.name, n.fare||0]);
        }
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/admin/neighborhoods/seed", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTransportTables();
      const defaultNeighborhoods = ["الحصاحيصا وسط","حلة سيد","حلة كاكوما","ود النيل","الخوض","البساتين","المزاد","القروض","حلة الصافية","الإمتداد"];
      for (const name of defaultNeighborhoods) {
        await query(`INSERT INTO transport_neighborhoods (name) VALUES ($1) ON CONFLICT DO NOTHING`, [name]);
      }
      res.json({ ok: true, count: defaultNeighborhoods.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin Transport — Extended Routes ─────────────────────────────────────────
  async function ensureTransportOperatorsTables() {
    await ensureTransportTables();
    await query(`CREATE TABLE IF NOT EXISTS transport_operators (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      phone VARCHAR(30),
      license_no VARCHAR(100),
      vehicle_type VARCHAR(100),
      capacity INTEGER DEFAULT 0,
      route VARCHAR(200),
      status VARCHAR(20) DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS transport_operator_supervisors (
      operator_id INTEGER REFERENCES transport_operators(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (operator_id, user_id)
    )`);
    await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES transport_drivers(id) ON DELETE SET NULL`);
    await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
  }

  app.get("/api/admin/transport/settings", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const r = await query(`SELECT * FROM transport_neighborhoods ORDER BY name`).catch(() => ({ rows: [] }));
      res.json({ neighborhoods: r.rows, max_riders: 4, booking_window_hours: 24 });
    } catch { res.json({ neighborhoods: [], max_riders: 4, booking_window_hours: 24 }); }
  });
  app.post("/api/admin/transport/settings", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { neighborhoods } = req.body;
      if (Array.isArray(neighborhoods)) {
        for (const n of neighborhoods) {
          await query(`INSERT INTO transport_neighborhoods (name, fare) VALUES ($1,$2) ON CONFLICT(name) DO UPDATE SET fare=$2`, [n.name, n.fare||0]);
        }
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/transport/reports", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTransportTables();
      const [byNeighborhood, byDay, recent] = await Promise.all([
        query(`SELECT from_neighborhood, COUNT(*) as count FROM transport_trips GROUP BY from_neighborhood ORDER BY count DESC LIMIT 20`).catch(() => ({ rows: [] })),
        query(`SELECT DATE(created_at) as date, COUNT(*) as count FROM transport_trips GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30`).catch(() => ({ rows: [] })),
        query(`SELECT t.*, u.name as user_name FROM transport_trips t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 50`).catch(() => ({ rows: [] })),
      ]);
      res.json({ by_neighborhood: byNeighborhood.rows, by_day: byDay.rows, recent: recent.rows });
    } catch { res.json({ by_neighborhood: [], by_day: [], recent: [] }); }
  });
  app.get("/api/admin/transport/operators", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureTransportOperatorsTables(); const r = await query(`SELECT * FROM transport_operators ORDER BY created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/admin/transport/operators", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTransportOperatorsTables();
      const { name, phone, license_no, vehicle_type, capacity, route, notes } = req.body;
      const r = await query(`INSERT INTO transport_operators (name,phone,license_no,vehicle_type,capacity,route,notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name,phone||null,license_no||null,vehicle_type||null,capacity||0,route||null,notes||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.patch("/api/admin/transport/operators/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { name, phone, license_no, vehicle_type, capacity, route, status, notes } = req.body;
      const r = await query(`UPDATE transport_operators SET name=COALESCE($1,name),phone=COALESCE($2,phone),license_no=COALESCE($3,license_no),vehicle_type=COALESCE($4,vehicle_type),capacity=COALESCE($5,capacity),route=COALESCE($6,route),status=COALESCE($7,status),notes=COALESCE($8,notes) WHERE id=$9 RETURNING *`, [name||null,phone||null,license_no||null,vehicle_type||null,capacity||null,route||null,status||null,notes||null,parseInt(req.params.id)]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/transport/operators/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM transport_operators WHERE id=$1`, [parseInt(req.params.id)]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/transport/operators/:id/supervisors", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTransportOperatorsTables();
      const r = await query(`SELECT u.id, u.name, u.email FROM transport_operator_supervisors ts JOIN users u ON u.id=ts.user_id WHERE ts.operator_id=$1`, [parseInt(req.params.id)]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/admin/transport/operators/:id/supervisor", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureTransportOperatorsTables();
      const { user_id } = req.body;
      await query(`INSERT INTO transport_operator_supervisors (operator_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [parseInt(req.params.id), user_id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/transport/operators/:id/supervisor/:uid", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM transport_operator_supervisors WHERE operator_id=$1 AND user_id=$2`, [parseInt(req.params.id), parseInt(req.params.uid)]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/transport/drivers/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM transport_drivers WHERE id=$1`, [parseInt(req.params.id)]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/transport/trips/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM transport_trips WHERE id=$1`, [parseInt(req.params.id)]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/admin/transport/trips/:id/assign", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { driver_id } = req.body;
      await query(`UPDATE transport_trips SET driver_id=$1, status='assigned' WHERE id=$2`, [driver_id, parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/admin/transport/trips/:id/complete", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`UPDATE transport_trips SET status='completed', completed_at=NOW() WHERE id=$1`, [parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/admin/transport/fares/bulk", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { fares } = req.body; // array of {name, fare}
      if (Array.isArray(fares)) {
        for (const f of fares) {
          await query(`INSERT INTO transport_neighborhoods (name, fare) VALUES ($1,$2) ON CONFLICT(name) DO UPDATE SET fare=$2`, [f.name, f.fare||0]);
        }
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.patch("/api/transport/trips/:id/cancel", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`UPDATE transport_trips SET status='cancelled' WHERE id=$1 AND user_id=$2`, [parseInt(req.params.id), me.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Communities ───────────────────────────────────────────────────────────────
  async function ensureCommunitiesTable() {
    await query(`CREATE TABLE IF NOT EXISTS communities (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      leader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      member_count INTEGER DEFAULT 0,
      is_approved BOOLEAN DEFAULT FALSE,
      image_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS community_members (
      id SERIAL PRIMARY KEY,
      community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) DEFAULT 'member',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(community_id, user_id)
    )`).catch(() => {});
  }
  app.get("/api/communities", async (_req, res) => {
    try {
      await ensureCommunitiesTable();
      const r = await query(`SELECT c.*, u.name as leader_name FROM communities c LEFT JOIN users u ON u.id=c.leader_id WHERE c.is_approved=TRUE ORDER BY c.member_count DESC`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/communities/register", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureCommunitiesTable();
      const { name, description, category } = req.body;
      const r = await query(
        `INSERT INTO communities (name,description,category,leader_id) VALUES ($1,$2,$3,$4) RETURNING *`,
        [name, description||null, category||null, me.id]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/communities/:id/services", async (req, res) => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS community_services (id SERIAL PRIMARY KEY, community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE, title VARCHAR(200) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const r = await query(`SELECT * FROM community_services WHERE community_id=$1 AND is_active=TRUE ORDER BY created_at DESC`, [parseInt(req.params.id)]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/communities/:id/service-requests", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS community_service_requests (id SERIAL PRIMARY KEY, community_id INTEGER REFERENCES communities(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), service_type VARCHAR(200), description TEXT, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW())`);
      const { service_type, description } = req.body;
      const r = await query(`INSERT INTO community_service_requests (community_id, user_id, service_type, description) VALUES ($1,$2,$3,$4) RETURNING *`, [parseInt(req.params.id), me.id, service_type||null, description||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/communities", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureCommunitiesTable(); const r = await query(`SELECT c.*, u.name as leader_name FROM communities c LEFT JOIN users u ON u.id=c.leader_id ORDER BY c.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.patch("/api/admin/communities/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`UPDATE communities SET is_approved=$1 WHERE id=$2`, [!!req.body.is_approved, req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Events ────────────────────────────────────────────────────────────────────
  async function ensureEventsTables() {
    await query(`CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL, description TEXT, category VARCHAR(100),
      event_date TIMESTAMPTZ, location VARCHAR(200), image_url TEXT,
      is_approved BOOLEAN DEFAULT FALSE, max_attendees INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS event_rentals (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, description TEXT,
      category VARCHAR(100), phone VARCHAR(30), price_per_day NUMERIC(12,2),
      image_url TEXT, is_available BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/events", async (_req, res) => {
    try {
      await ensureEventsTables();
      const r = await query(`SELECT e.*, u.name as organizer_name FROM events e LEFT JOIN users u ON u.id=e.user_id WHERE e.is_approved=TRUE ORDER BY e.event_date DESC LIMIT 50`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/events", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureEventsTables();
      const { title, description, category, event_date, location, image_url, max_attendees } = req.body;
      const r = await query(
        `INSERT INTO events (user_id,title,description,category,event_date,location,image_url,max_attendees) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [me.id, title, description||null, category||null, event_date||null, location||null, image_url||null, max_attendees||null]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/event-rentals", async (_req, res) => {
    try { await ensureEventsTables(); const r = await query(`SELECT * FROM event_rentals WHERE is_available=TRUE ORDER BY created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });

  // ── Sports ────────────────────────────────────────────────────────────────────
  async function ensureSportsTables() {
    await query(`CREATE TABLE IF NOT EXISTS sports_posts (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      content TEXT NOT NULL, image_url TEXT, sport_type VARCHAR(50),
      likes_count INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS sports_players (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(200) NOT NULL, sport_type VARCHAR(50), position VARCHAR(100),
      neighborhood VARCHAR(100), phone VARCHAR(30), image_url TEXT,
      is_verified BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS sports_matches (
      id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, description TEXT,
      sport_type VARCHAR(50), team_a VARCHAR(100), team_b VARCHAR(100),
      match_date TIMESTAMPTZ, location VARCHAR(200), result VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/sports/posts", async (_req, res) => {
    try { await ensureSportsTables(); const r = await query(`SELECT p.*, u.name as user_name, u.avatar_url FROM sports_posts p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 50`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/sports/posts", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureSportsTables();
      const { content, image_url, sport_type } = req.body;
      const r = await query(`INSERT INTO sports_posts (user_id,content,image_url,sport_type) VALUES ($1,$2,$3,$4) RETURNING *`, [me.id, content, image_url||null, sport_type||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/sports/players", async (_req, res) => {
    try { await ensureSportsTables(); const r = await query(`SELECT * FROM sports_players ORDER BY is_verified DESC, created_at DESC LIMIT 100`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/sports/matches", async (_req, res) => {
    try { await ensureSportsTables(); const r = await query(`SELECT * FROM sports_matches ORDER BY match_date DESC LIMIT 50`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.patch("/api/sports/posts/:id/like", async (req, res) => {
    try {
      await ensureSportsTables();
      await query(`UPDATE sports_posts SET likes = COALESCE(likes,0)+1 WHERE id=$1`, [parseInt(req.params.id)]);
      res.json({ success: true });
    } catch { res.json({ success: false }); }
  });
  app.delete("/api/sports/posts/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM sports_posts WHERE id=$1`, [parseInt(req.params.id)]); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/sports/players", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureSportsTables();
      const { name, sport_type, position, birth_date, phone, bio, image_url } = req.body;
      const r = await query(`INSERT INTO sports_players (name,sport_type,position,birth_date,phone,bio,image_url,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [name,sport_type||null,position||null,birth_date||null,phone||null,bio||null,image_url||null,me.id]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.patch("/api/sports/players/:id", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { name, sport_type, position, birth_date, phone, bio, image_url } = req.body;
      const r = await query(`UPDATE sports_players SET name=COALESCE($1,name), sport_type=COALESCE($2,sport_type), position=COALESCE($3,position), bio=COALESCE($4,bio), image_url=COALESCE($5,image_url) WHERE id=$6 RETURNING *`, [name||null,sport_type||null,position||null,bio||null,image_url||null,parseInt(req.params.id)]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/sports/players/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM sports_players WHERE id=$1`, [parseInt(req.params.id)]); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/sports/matches", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureSportsTables();
      const { team_a, team_b, match_date, location, sport_type, score_a, score_b, notes } = req.body;
      const r = await query(`INSERT INTO sports_matches (team_a,team_b,match_date,location,sport_type,score_a,score_b,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [team_a,team_b,match_date||null,location||null,sport_type||null,score_a||null,score_b||null,notes||null,me.id]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/sports/matches/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM sports_matches WHERE id=$1`, [parseInt(req.params.id)]); res.json({ success: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Prayer Times ──────────────────────────────────────────────────────────────
  app.get("/api/prayer-times", async (_req, res) => {
    // توقيت تقريبي لمدينة الحصاحيصا — يُحدَّث بالـ admin أو يُحسب من الـ latitude/longitude
    res.json({
      city: "الحصاحيصا", date: new Date().toLocaleDateString("ar-SA"),
      fajr: "04:30", dhuhr: "12:15", asr: "15:45", maghrib: "18:30", isha: "19:45",
      note: "أوقات تقريبية — يُرجى التحقق من التقويم المحلي"
    });
  });
  app.get("/api/prayer-settings", async (_req, res) => {
    res.json({ adhan_enabled: true, notification_before: 15, city: "الحصاحيصا", method: "MWL" });
  });

  // ── Map Places ────────────────────────────────────────────────────────────────
  app.get("/api/map/places", async (req, res) => {
    try {
      await ensureLandmarksTable();
      const r = await query(`SELECT id, name, description, category, lat, lng, image_url FROM landmarks WHERE lat IS NOT NULL AND lng IS NOT NULL`);
      res.json(r.rows);
    } catch { res.json([]); }
  });

  // ── Lost Items ────────────────────────────────────────────────────────────────
  async function ensureLostItemsTable() {
    await query(`CREATE TABLE IF NOT EXISTS lost_items (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL, description TEXT, category VARCHAR(50),
      item_type VARCHAR(20) DEFAULT 'lost', location VARCHAR(200),
      contact_phone VARCHAR(30), image_url TEXT, is_resolved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/lost-items", async (req, res) => {
    try {
      await ensureLostItemsTable();
      const type = req.query.type as string | undefined;
      let sql = `SELECT l.*, u.name as user_name FROM lost_items l LEFT JOIN users u ON u.id=l.user_id WHERE l.is_resolved=FALSE`;
      const params: any[] = [];
      if (type) { params.push(type); sql += ` AND l.item_type=$${params.length}`; }
      sql += ` ORDER BY l.created_at DESC LIMIT 100`;
      const r = await query(sql, params);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/lost-items", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLostItemsTable();
      const { title, description, category, item_type, location, contact_phone, image_url } = req.body;
      const r = await query(
        `INSERT INTO lost_items (user_id,title,description,category,item_type,location,contact_phone,image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [me.id, title, description||null, category||null, item_type||'lost', location||null, contact_phone||null, image_url||null]
      );
      const typeLabel = item_type === 'found' ? 'عثر على' : 'مفقود';
      void pushToAdmins(`🔍 ${typeLabel}: ${title}`, `${me.name}${location ? " — "+location : ""}`, { screen: "missing", itemId: r.rows[0].id }, "URGENT");
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/lost-items/:id", async (req, res) => {
    try {
      await ensureLostItemsTable();
      const r = await query(`SELECT l.*, u.name as user_name FROM lost_items l LEFT JOIN users u ON u.id=l.user_id WHERE l.id=$1`, [parseInt(req.params.id)]);
      if (!r.rows[0]) return res.status(404).json({ error: "غير موجود" });
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.patch("/api/lost-items/:id/status", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { status } = req.body;
      const resolved = status === "resolved" || status === "found";
      await query(`UPDATE lost_items SET is_resolved=$1, status=$2 WHERE id=$3 AND user_id=$4`, [resolved, status||'pending', parseInt(req.params.id), me.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/lost-items/:id", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM lost_items WHERE id=$1 AND (user_id=$2 OR $3=TRUE)`, [parseInt(req.params.id), me.id, me.role === "admin"]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Medical Consultations & Specialists ───────────────────────────────────────
  async function ensureMedicalExtTables() {
    await query(`CREATE TABLE IF NOT EXISTS medical_consultations (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      question TEXT NOT NULL, specialty VARCHAR(100), status VARCHAR(20) DEFAULT 'pending',
      answer TEXT, answered_by INTEGER REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS medical_specialists (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, specialty VARCHAR(100) NOT NULL,
      qualifications TEXT, clinic_name VARCHAR(200), phone VARCHAR(30),
      neighborhood VARCHAR(100), available_days TEXT, image_url TEXT,
      is_verified BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/medical-consultations", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalExtTables();
      const r = await query(`SELECT * FROM medical_consultations WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/medical-consultations", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureMedicalExtTables();
      const { question, specialty } = req.body;
      const r = await query(`INSERT INTO medical_consultations (user_id,question,specialty) VALUES ($1,$2,$3) RETURNING *`, [me.id, question, specialty||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/medical-consultations/:id/replies", async (req, res) => {
    try {
      await ensureMedicalExtTables();
      await query(`CREATE TABLE IF NOT EXISTS consultation_replies (id SERIAL PRIMARY KEY, consultation_id INTEGER REFERENCES medical_consultations(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), reply TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const r = await query(
        `SELECT cr.*, u.name as author_name, u.role as author_role FROM consultation_replies cr LEFT JOIN users u ON u.id=cr.user_id WHERE cr.consultation_id=$1 ORDER BY cr.created_at ASC`,
        [parseInt(req.params.id)]
      );
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/medical-consultations/:id/reply", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS consultation_replies (id SERIAL PRIMARY KEY, consultation_id INTEGER REFERENCES medical_consultations(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), reply TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const { reply } = req.body;
      if (!reply?.trim()) return res.status(400).json({ error: "الرد مطلوب" });
      const r = await query(`INSERT INTO consultation_replies (consultation_id, user_id, reply) VALUES ($1,$2,$3) RETURNING *`, [parseInt(req.params.id), me.id, reply.trim()]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/specialists", async (req, res) => {
    try {
      await ensureMedicalExtTables();
      const spec = req.query.specialty as string | undefined;
      let sql = `SELECT * FROM medical_specialists WHERE is_verified=TRUE`;
      const params: any[] = [];
      if (spec) { params.push(spec); sql += ` AND specialty ILIKE $${params.length}`; }
      sql += ` ORDER BY name`;
      const r = await query(sql, params);
      res.json(r.rows);
    } catch { res.json([]); }
  });

  // ── Rentals ───────────────────────────────────────────────────────────────────
  async function ensureRentalsTable() {
    await query(`CREATE TABLE IF NOT EXISTS rentals (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL, description TEXT, category VARCHAR(100),
      price_per_day NUMERIC(12,2), location VARCHAR(200), phone VARCHAR(30),
      image_url TEXT, status VARCHAR(20) DEFAULT 'available', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS rental_contracts (
      id SERIAL PRIMARY KEY, rental_id INTEGER REFERENCES rentals(id) ON DELETE SET NULL,
      renter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      start_date DATE, end_date DATE, total_price NUMERIC(12,2),
      status VARCHAR(20) DEFAULT 'active', notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/rentals", async (req, res) => {
    try {
      await ensureRentalsTable();
      const r = await query(`SELECT r.*, u.name as owner_name FROM rentals r LEFT JOIN users u ON u.id=r.user_id WHERE r.status='available' ORDER BY r.created_at DESC LIMIT 100`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/rentals/contracts/my", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureRentalsTable();
      const r = await query(`SELECT rc.*, r.title as rental_title FROM rental_contracts rc LEFT JOIN rentals r ON r.id=rc.rental_id WHERE rc.renter_id=$1 OR rc.owner_id=$1 ORDER BY rc.created_at DESC`, [me.id]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/rentals/settings", async (_req, res) => {
    res.json({ commission_rate: 0.05, min_days: 1, max_days: 90, currency: "SDG" });
  });
  app.post("/api/rentals", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureRentalsTable();
      const { title, description, category, price_per_day, location, images } = req.body;
      const r = await query(
        `INSERT INTO rentals (user_id, title, description, category, price_per_day, location, images) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [me.id, title, description||null, category||null, price_per_day||0, location||null, JSON.stringify(images||[])]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/rentals/:id/contract", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureRentalsTable();
      const rental = await query(`SELECT * FROM rentals WHERE id=$1`, [parseInt(req.params.id)]);
      if (!rental.rows[0]) return res.status(404).json({ error: "العقار غير موجود" });
      const { start_date, end_date, terms } = req.body;
      const r = await query(
        `INSERT INTO rental_contracts (rental_id, renter_id, owner_id, start_date, end_date, terms, status) VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
        [parseInt(req.params.id), me.id, rental.rows[0].user_id, start_date, end_date, terms||null]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/rentals/contracts/:id/sign", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`UPDATE rental_contracts SET status='signed', signed_at=NOW() WHERE id=$1 AND (renter_id=$2 OR owner_id=$2)`, [parseInt(req.params.id), me.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Reports & Feedback ────────────────────────────────────────────────────────
  async function ensureReportsTables() {
    await query(`CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type VARCHAR(50) DEFAULT 'general', message TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target_type VARCHAR(50), target_id INTEGER, reason TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/feedback", async (req, res) => {
    try { await ensureReportsTables(); const r = await query(`SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/feedback/mine", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try { await ensureReportsTables(); const r = await query(`SELECT * FROM feedback WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/feedback", async (req, res) => {
    const me = await getSessionUser(req);
    try {
      await ensureReportsTables();
      const { type, message } = req.body;
      const r = await query(`INSERT INTO feedback (user_id,type,message) VALUES ($1,$2,$3) RETURNING *`, [me?.id||null, type||'general', message]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/reports", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureReportsTables();
      const r = await query(`SELECT * FROM reports WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/reports", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureReportsTables();
      const { target_type, target_id, reason } = req.body;
      const r = await query(`INSERT INTO reports (user_id,target_type,target_id,reason) VALUES ($1,$2,$3,$4) RETURNING *`, [me.id, target_type||null, target_id||null, reason]);
      void pushToAdmins("🚨 بلاغ جديد", `${me.name} أرسل بلاغاً: ${reason||""}`, { screen: "reports", reportId: r.rows[0].id }, "URGENT");
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Farmers ───────────────────────────────────────────────────────────────────
  async function ensureFarmersTables() {
    await query(`CREATE TABLE IF NOT EXISTS farmers_items (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      item_type VARCHAR(20) NOT NULL, title VARCHAR(200) NOT NULL,
      description TEXT, quantity VARCHAR(100), unit VARCHAR(50),
      price NUMERIC(12,2), location VARCHAR(200), image_url TEXT,
      contact_phone VARCHAR(30), status VARCHAR(20) DEFAULT 'available',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/farmers/crops", async (_req, res) => {
    try { await ensureFarmersTables(); const r = await query(`SELECT * FROM farmers_items WHERE item_type='crop' AND status='available' ORDER BY created_at DESC LIMIT 50`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/farmers/lands", async (_req, res) => {
    try { await ensureFarmersTables(); const r = await query(`SELECT * FROM farmers_items WHERE item_type='land' AND status='available' ORDER BY created_at DESC LIMIT 50`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/farmers/tools", async (_req, res) => {
    try { await ensureFarmersTables(); const r = await query(`SELECT * FROM farmers_items WHERE item_type='tool' AND status='available' ORDER BY created_at DESC LIMIT 50`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/farmers/workers", async (_req, res) => {
    try { await ensureFarmersTables(); const r = await query(`SELECT * FROM farmers_items WHERE item_type='worker' AND status='available' ORDER BY created_at DESC LIMIT 50`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/farmers/:type", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const allowedTypes = ["crops","lands","tools","workers"];
    const typeMap: Record<string,string> = { crops:"crop", lands:"land", tools:"tool", workers:"worker" };
    const paramType = req.params.type;
    if (!allowedTypes.includes(paramType)) return res.status(400).json({ error: "نوع غير صحيح" });
    try {
      await ensureFarmersTables();
      const { title, description, quantity, unit, price, location, image_url, contact_phone } = req.body;
      const r = await query(
        `INSERT INTO farmers_items (user_id,item_type,title,description,quantity,unit,price,location,image_url,contact_phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [me.id, typeMap[paramType], title, description||null, quantity||null, unit||null, price||null, location||null, image_url||null, contact_phone||null]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Market (Merchants & Phone Shops) ─────────────────────────────────────────
  async function ensureMarketTables() {
    await query(`CREATE TABLE IF NOT EXISTS merchants (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      shop_name VARCHAR(200) NOT NULL, description TEXT, category VARCHAR(100),
      phone VARCHAR(30), whatsapp VARCHAR(30), location VARCHAR(200),
      image_url TEXT, logo_url TEXT, is_featured BOOLEAN DEFAULT FALSE,
      status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS phone_shops (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      shop_name VARCHAR(200) NOT NULL, brands TEXT[], services TEXT[],
      phone VARCHAR(30), location VARCHAR(200), image_url TEXT,
      status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/merchants", async (req, res) => {
    try {
      await ensureMarketTables();
      const cat = req.query.category as string | undefined;
      let sql = `SELECT m.*, u.name as owner_name FROM merchants m LEFT JOIN users u ON u.id=m.user_id WHERE m.status='active'`;
      const params: any[] = [];
      if (cat) { params.push(cat); sql += ` AND m.category=$${params.length}`; }
      sql += ` ORDER BY m.is_featured DESC, m.created_at DESC LIMIT 100`;
      const r = await query(sql, params);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/phone-shops", async (_req, res) => {
    try { await ensureMarketTables(); const r = await query(`SELECT * FROM phone_shops WHERE status='active' ORDER BY created_at DESC LIMIT 50`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/my-phone-shop", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try { await ensureMarketTables(); const r = await query(`SELECT * FROM phone_shops WHERE user_id=$1 LIMIT 1`, [me.id]); res.json(r.rows[0] || null); }
    catch { res.json(null); }
  });
  app.get("/api/admin/merchants", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureMarketTables(); const r = await query(`SELECT m.*, u.name as owner_name FROM merchants m LEFT JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/admin/phone-shops", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureMarketTables(); const r = await query(`SELECT ps.*, u.name as owner_name FROM phone_shops ps LEFT JOIN users u ON u.id=ps.user_id ORDER BY ps.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });

  // ── AI Support ────────────────────────────────────────────────────────────────
  app.get("/api/ai/status", async (_req, res) => {
    res.json({ available: true, model: "hasahisawi-assistant", message: "المساعد الذكي جاهز للمساعدة" });
  });
  app.post("/api/ai/chat", async (req, res) => {
    const me = await getSessionUser(req);
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "الرسالة مطلوبة" });
    // ردود ذكية محددة مسبقاً — يمكن ربطها بـ LLM API لاحقاً
    const responses: Record<string, string> = {
      default: "أهلاً بك في حصاحيصاوي! كيف يمكنني مساعدتك اليوم؟",
      help: "يمكنني مساعدتك في: الأخبار، الوظائف، النقل، الخدمات الطبية، ومعلومات المدينة.",
      مرحبا: "أهلاً وسهلاً! أنا المساعد الذكي لتطبيق حصاحيصاوي. كيف أخدمك؟",
      وظائف: "يمكنك الاطلاع على آخر الوظائف المتاحة في قسم الوظائف بالتطبيق.",
      نقل: "خدمة النقل متاحة في قسم التنقل. يمكنك حجز رحلة أو تقديم رحلة مشتركة.",
    };
    const lower = message.toLowerCase().trim();
    let reply = responses.default;
    for (const [key, val] of Object.entries(responses)) {
      if (lower.includes(key)) { reply = val; break; }
    }
    res.json({ reply, timestamp: new Date().toISOString(), user: me?.name });
  });

  // ── Ratings Entities ──────────────────────────────────────────────────────────
  async function ensureRatedEntitiesTables() {
    await query(`
      CREATE TABLE IF NOT EXISTS rated_entities (
        id            SERIAL PRIMARY KEY,
        type          VARCHAR(30) NOT NULL,
        name          VARCHAR(200) NOT NULL,
        subtitle      TEXT,
        category      VARCHAR(100),
        phone         VARCHAR(30),
        district      VARCHAR(100),
        notes         TEXT,
        is_verified   BOOLEAN DEFAULT FALSE,
        avg_rating    NUMERIC(3,1) DEFAULT 0,
        review_count  INTEGER DEFAULT 0,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS entity_reviews (
        id         SERIAL PRIMARY KEY,
        entity_id  INTEGER REFERENCES rated_entities(id) ON DELETE CASCADE,
        user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        device_id  VARCHAR(100),
        rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment    TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS entity_reviews_device_entity_idx ON entity_reviews(entity_id, device_id) WHERE device_id IS NOT NULL`);
  }

  app.get("/api/ratings/entities", async (req, res) => {
    try {
      await ensureRatedEntitiesTables();
      const type   = req.query.type   as string | undefined;
      const search = req.query.search as string | undefined;
      let sql = `SELECT * FROM rated_entities WHERE ($1::text IS NULL OR type=$1)`;
      const params: any[] = [type || null];
      if (search) { sql += ` AND name ILIKE $2`; params.push(`%${search}%`); }
      sql += ` ORDER BY avg_rating DESC, review_count DESC LIMIT 100`;
      const r = await query(sql, params);
      res.json(r.rows);
    } catch { res.json([]); }
  });

  app.get("/api/ratings/entities/:id", async (req, res) => {
    try {
      await ensureRatedEntitiesTables();
      const id = parseInt(req.params.id);
      const entity = await query(`SELECT * FROM rated_entities WHERE id=$1`, [id]);
      if (!entity.rows[0]) return res.status(404).json({ error: "غير موجود" });
      const ratings = await query(
        `SELECT er.id, er.rating, er.comment, u.name as user_name, er.created_at
         FROM entity_reviews er LEFT JOIN users u ON u.id=er.user_id
         WHERE er.entity_id=$1 ORDER BY er.created_at DESC LIMIT 50`, [id]
      );
      res.json({ entity: entity.rows[0], ratings: ratings.rows });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ratings/entities/:id/rate", async (req, res) => {
    try {
      await ensureRatedEntitiesTables();
      const id        = parseInt(req.params.id);
      const user      = await getSessionUser(req);
      const { rating, comment, device_id } = req.body;
      if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "تقييم غير صالح" });
      // Upsert review (one per device or user)
      await query(
        `INSERT INTO entity_reviews (entity_id, user_id, device_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (entity_id, device_id) WHERE device_id IS NOT NULL
         DO UPDATE SET rating=$4, comment=$5, created_at=NOW()`,
        [id, user?.id || null, device_id || null, rating, comment || null]
      );
      // Update aggregates
      await query(
        `UPDATE rated_entities SET
           avg_rating   = (SELECT ROUND(AVG(rating)::numeric,1) FROM entity_reviews WHERE entity_id=$1),
           review_count = (SELECT COUNT(*) FROM entity_reviews WHERE entity_id=$1)
         WHERE id=$1`, [id]
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/ratings/entities", async (req, res) => {
    try {
      await ensureRatedEntitiesTables();
      const { type, name, subtitle, category, phone, district, notes } = req.body;
      if (!name?.trim() || !type) return res.status(400).json({ error: "الاسم والنوع مطلوبان" });
      const r = await query(
        `INSERT INTO rated_entities (type, name, subtitle, category, phone, district, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [type, name.trim(), subtitle||null, category||null, phone||null, district||null, notes||null]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin Dashboard Stats ─────────────────────────────────────────────────────
  app.get("/api/admin/dashboard-stats", async (req, res) => {
    try {
      if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
      const [users, posts, news, notifications] = await Promise.all([
        query(`SELECT COUNT(*) FROM users`).catch(() => ({ rows: [{ count: 0 }] })),
        query(`SELECT COUNT(*) FROM posts`).catch(() => ({ rows: [{ count: 0 }] })),
        query(`SELECT COUNT(*) FROM news`).catch(() => ({ rows: [{ count: 0 }] })),
        query(`SELECT COUNT(*) FROM notifications`).catch(() => ({ rows: [{ count: 0 }] })),
      ]);
      res.json({
        users: Number(users.rows[0].count),
        posts: Number(posts.rows[0].count),
        news: Number(news.rows[0].count),
        notifications: Number(notifications.rows[0].count),
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── App Version ───────────────────────────────────────────────────────────────
  async function ensureAppVersionTable() {
    await query(`CREATE TABLE IF NOT EXISTS app_version_config (
      id SERIAL PRIMARY KEY,
      version VARCHAR(20) NOT NULL DEFAULT '6.3.7',
      version_code INTEGER NOT NULL DEFAULT 237,
      force_update BOOLEAN NOT NULL DEFAULT FALSE,
      message TEXT,
      notes TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).catch(() => {});
    // seed initial row if empty
    await query(`INSERT INTO app_version_config (id, version, version_code, force_update)
      VALUES (1, '6.3.7', 237, FALSE)
      ON CONFLICT (id) DO NOTHING`).catch(() => {});
  }

  app.get("/api/app/version", async (_req, res) => {
    try {
      await ensureAppVersionTable();
      const r = await query("SELECT version, version_code, force_update, message FROM app_version_config WHERE id=1");
      const row = r.rows[0];
      if (!row) return res.json({ version: "6.3.7", versionCode: 237, forceUpdate: false, message: null });
      res.json({ version: row.version, versionCode: row.version_code, forceUpdate: row.force_update, message: row.message });
    } catch { res.json({ version: "6.3.7", versionCode: 237, forceUpdate: false, message: null }); }
  });

  app.get("/api/admin/app/version", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureAppVersionTable();
      const r = await query("SELECT * FROM app_version_config WHERE id=1");
      const row = r.rows[0];
      if (!row) return res.json({ version: "6.3.7", versionCode: 237, forceUpdate: false, message: null, notes: null });
      res.json({ version: row.version, versionCode: row.version_code, forceUpdate: row.force_update, message: row.message, notes: row.notes });
    } catch { res.json({ version: "6.3.7", versionCode: 237, forceUpdate: false, message: null }); }
  });

  app.patch("/api/admin/app/version", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureAppVersionTable();
      const { version, notes, force } = req.body;
      if (!version) return res.status(400).json({ error: "رقم الإصدار مطلوب" });
      const versionStr = String(version).substring(0, 20);
      await query(
        `UPDATE app_version_config SET version=$1, force_update=$2, notes=$3, updated_at=NOW() WHERE id=1`,
        [versionStr, !!force, notes ? String(notes).substring(0, 500) : null]
      );
      res.json({ ok: true, version: versionStr, forceUpdate: !!force });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Feature Flags ─────────────────────────────────────────────────────────────
  async function ensureFeatureFlagsTable() {
    await query(`CREATE TABLE IF NOT EXISTS feature_flags (
      key VARCHAR(100) PRIMARY KEY, value BOOLEAN DEFAULT TRUE,
      description TEXT, updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/app/feature-flags", async (_req, res) => {
    try {
      await ensureFeatureFlagsTable();
      const r = await query(`SELECT key, value FROM feature_flags WHERE value=TRUE`);
      const flags: Record<string,boolean> = {};
      for (const row of r.rows) flags[row.key] = row.value;
      res.json(flags);
    } catch { res.json({}); }
  });
  app.get("/api/admin/feature-flags", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureFeatureFlagsTable();
      const r = await query(`SELECT * FROM feature_flags ORDER BY key`);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.put("/api/admin/feature-flags", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureFeatureFlagsTable();
      const { key, value, description } = req.body;
      await query(`INSERT INTO feature_flags(key,value,description) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=$2,description=COALESCE($3,feature_flags.description),updated_at=NOW()`,
        [key, !!value, description||null]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Women Join Request ────────────────────────────────────────────────────────
  async function ensureWomenTable() {
    await query(`CREATE TABLE IF NOT EXISTS women_join_requests (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(200) NOT NULL, phone VARCHAR(30), neighborhood VARCHAR(100),
      interest TEXT, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.post("/api/women/join-request", async (req, res) => {
    const me = await getSessionUser(req);
    try {
      await ensureWomenTable();
      const { name, phone, neighborhood, interest } = req.body;
      const r = await query(`INSERT INTO women_join_requests (user_id,name,phone,neighborhood,interest) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [me?.id||null, name, phone||null, neighborhood||null, interest||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Zawajil Apply ─────────────────────────────────────────────────────────────
  async function ensureZawajilApplyTable() {
    await query(`CREATE TABLE IF NOT EXISTS zawajil_applications (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      full_name VARCHAR(200) NOT NULL, age INTEGER, gender VARCHAR(10),
      neighborhood VARCHAR(100), phone VARCHAR(30), occupation VARCHAR(100),
      notes TEXT, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.post("/api/zawajil/apply", async (req, res) => {
    const me = await getSessionUser(req);
    try {
      await ensureZawajilApplyTable();
      const { full_name, age, gender, neighborhood, phone, occupation, notes } = req.body;
      const r = await query(`INSERT INTO zawajil_applications (user_id,full_name,age,gender,neighborhood,phone,occupation,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [me?.id||null, full_name, age||null, gender||null, neighborhood||null, phone||null, occupation||null, notes||null]);
      void pushToAdmins("🎁 طلب انضمام زواجل", `${full_name}${neighborhood ? " — "+neighborhood : ""}`, { screen: "zawajil", applicationId: r.rows[0].id });
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Auth: upload avatar & update profile ──────────────────────────────────────
  app.post("/api/auth/upload-avatar", async (req, res) => {
    // Redirect to the main upload endpoint
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    // The actual upload is handled by /api/upload — this just updates avatar_url from body
    try {
      const { avatar_url } = req.body;
      if (!avatar_url) return res.status(400).json({ error: "avatar_url مطلوب" });
      await query(`UPDATE users SET avatar_url=$1 WHERE id=$2`, [avatar_url, me.id]);
      const r = await query(`SELECT * FROM users WHERE id=$1`, [me.id]);
      res.json({ user: r.rows[0] ? safeUser(r.rows[0]) : null });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.put("/api/auth/profile", async (req, res) => {
    // Alias for PUT /api/users/me
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { name, bio, neighborhood, gender, birth_date, avatar_url } = req.body;
      await query(
        `UPDATE users SET name=COALESCE($1,name), bio=COALESCE($2,bio), neighborhood=COALESCE($3,neighborhood), gender=COALESCE($4,gender), birth_date=COALESCE($5,birth_date), avatar_url=COALESCE($6,avatar_url) WHERE id=$7`,
        [name||null, bio||null, neighborhood||null, gender||null, birth_date||null, avatar_url||null, me.id]
      );
      const r = await query(`SELECT * FROM users WHERE id=$1`, [me.id]);
      res.json({ user: r.rows[0] ? safeUser(r.rows[0]) : null });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.put("/api/users/me/bio", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`UPDATE users SET bio=$1 WHERE id=$2`, [req.body.bio||null, me.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin Honored Figures ────────────────────────────────────────────────────
  async function ensureHonoredFiguresTable() {
    await query(`CREATE TABLE IF NOT EXISTS honored_figures (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, title VARCHAR(200),
      description TEXT, image_url TEXT, category VARCHAR(100),
      birth_year INTEGER, neighborhood VARCHAR(100),
      is_featured BOOLEAN DEFAULT FALSE, sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/honored-figures", async (_req, res) => {
    try { await ensureHonoredFiguresTable(); const r = await query(`SELECT * FROM honored_figures ORDER BY is_featured DESC, sort_order, name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  // alias for singular form used in index screen
  app.get("/api/honored-figure", async (_req, res) => {
    try { await ensureHonoredFiguresTable(); const r = await query(`SELECT * FROM honored_figures WHERE is_featured=TRUE ORDER BY sort_order, name LIMIT 10`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/admin/honored-figures", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureHonoredFiguresTable(); const r = await query(`SELECT * FROM honored_figures ORDER BY sort_order, name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/admin/honored-figures", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureHonoredFiguresTable();
      const { name, title, description, image_url, category, birth_year, neighborhood, is_featured, sort_order } = req.body;
      const r = await query(
        `INSERT INTO honored_figures (name,title,description,image_url,category,birth_year,neighborhood,is_featured,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [name, title||null, description||null, image_url||null, category||null, birth_year||null, neighborhood||null, !!is_featured, sort_order||0]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.put("/api/admin/honored-figures/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { name, title, description, image_url, category, birth_year, neighborhood, is_featured, sort_order } = req.body;
      await query(
        `UPDATE honored_figures SET name=COALESCE($1,name),title=COALESCE($2,title),description=COALESCE($3,description),image_url=COALESCE($4,image_url),category=COALESCE($5,category),birth_year=COALESCE($6,birth_year),neighborhood=COALESCE($7,neighborhood),is_featured=COALESCE($8,is_featured),sort_order=COALESCE($9,sort_order) WHERE id=$10`,
        [name||null, title||null, description||null, image_url||null, category||null, birth_year||null, neighborhood||null, is_featured!=null?is_featured:null, sort_order||null, req.params.id]
      );
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/honored-figures/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM honored_figures WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── AI Settings (admin) ───────────────────────────────────────────────────────
  async function ensureAiSettingsTable() {
    await query(`CREATE TABLE IF NOT EXISTS ai_settings (key VARCHAR(100) PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
  }
  app.put("/api/admin/ai-settings", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureAiSettingsTable();
      for (const [k, v] of Object.entries(req.body)) {
        await query(`INSERT INTO ai_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2,updated_at=NOW()`, [k, String(v)]);
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/ai-settings", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureAiSettingsTable();
      const r = await query(`SELECT key, value FROM ai_settings`);
      const s: Record<string,string> = {};
      for (const row of r.rows) s[row.key] = row.value;
      res.json(s);
    } catch { res.json({}); }
  });

  // ── Admin Student Libraries ───────────────────────────────────────────────────
  async function ensureStudentLibrariesTable() {
    await query(`CREATE TABLE IF NOT EXISTS student_libraries (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, location VARCHAR(200),
      phone VARCHAR(30), open_hours VARCHAR(100), description TEXT,
      image_url TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/student-libraries", async (_req, res) => {
    try { await ensureStudentLibrariesTable(); const r = await query(`SELECT * FROM student_libraries WHERE is_active=TRUE ORDER BY name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/admin/student-libraries", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureStudentLibrariesTable(); const r = await query(`SELECT * FROM student_libraries ORDER BY name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/admin/student-libraries", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureStudentLibrariesTable();
      const { name, location, phone, open_hours, description, image_url } = req.body;
      const r = await query(`INSERT INTO student_libraries (name,location,phone,open_hours,description,image_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, location||null, phone||null, open_hours||null, description||null, image_url||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Educational Institutions ──────────────────────────────────────────────────
  async function ensureEducationTables() {
    await query(`CREATE TABLE IF NOT EXISTS educational_institutions (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, type VARCHAR(50),
      level VARCHAR(50), location VARCHAR(200), phone VARCHAR(30),
      principal VARCHAR(200), student_capacity INTEGER,
      image_url TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS education_registrations (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      institution_id INTEGER REFERENCES educational_institutions(id) ON DELETE SET NULL,
      student_name VARCHAR(200) NOT NULL, grade VARCHAR(50),
      parent_name VARCHAR(200), parent_phone VARCHAR(30),
      status VARCHAR(20) DEFAULT 'pending', notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS education_transfer_requests (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      from_school VARCHAR(200), to_school_id INTEGER REFERENCES educational_institutions(id),
      student_name VARCHAR(200) NOT NULL, grade VARCHAR(50),
      reason TEXT, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/educational-institutions", async (_req, res) => {
    try { await ensureEducationTables(); const r = await query(`SELECT * FROM educational_institutions WHERE is_active=TRUE ORDER BY type, name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/education/register-student", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureEducationTables();
      const { institution_id, student_name, grade, parent_name, parent_phone } = req.body;
      const r = await query(`INSERT INTO education_registrations (user_id,institution_id,student_name,grade,parent_name,parent_phone) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [me.id, institution_id||null, student_name, grade||null, parent_name||null, parent_phone||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/education/my-registrations", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try { await ensureEducationTables(); const r = await query(`SELECT er.*, ei.name as school_name FROM education_registrations er LEFT JOIN educational_institutions ei ON ei.id=er.institution_id WHERE er.user_id=$1 ORDER BY er.created_at DESC`, [me.id]); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/education/transfer-request", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureEducationTables();
      const { from_school, to_school_id, student_name, grade, reason } = req.body;
      const r = await query(`INSERT INTO education_transfer_requests (user_id,from_school,to_school_id,student_name,grade,reason) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [me.id, from_school||null, to_school_id||null, student_name, grade||null, reason||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/education/my-transfers", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try { await ensureEducationTables(); const r = await query(`SELECT * FROM education_transfer_requests WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/admin/educational-institutions", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureEducationTables(); const r = await query(`SELECT * FROM educational_institutions ORDER BY type, name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/admin/educational-institutions", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureEducationTables();
      const { name, type, level, location, phone, principal, student_capacity, image_url } = req.body;
      const r = await query(`INSERT INTO educational_institutions (name,type,level,location,phone,principal,student_capacity,image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [name, type||null, level||null, location||null, phone||null, principal||null, student_capacity||null, image_url||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.patch("/api/admin/educational-institutions/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { const { is_active } = req.body; await query(`UPDATE educational_institutions SET is_active=COALESCE($1,is_active) WHERE id=$2`, [is_active!=null?is_active:null, req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/educational-institutions/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM educational_institutions WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/education/registrations", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureEducationTables(); const r = await query(`SELECT er.*, ei.name as school_name, u.name as parent FROM education_registrations er LEFT JOIN educational_institutions ei ON ei.id=er.institution_id LEFT JOIN users u ON u.id=er.user_id ORDER BY er.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.patch("/api/admin/education/registrations/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { const { status } = req.body; await query(`UPDATE education_registrations SET status=$1 WHERE id=$2`, [status||'pending', req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/education/transfers", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureEducationTables(); const r = await query(`SELECT etr.*, u.name as requester_name FROM education_transfer_requests etr LEFT JOIN users u ON u.id=etr.user_id ORDER BY etr.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.patch("/api/admin/education/transfers/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { const { status } = req.body; await query(`UPDATE education_transfer_requests SET status=$1 WHERE id=$2`, [status||'pending', req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Moderator Service Requests ────────────────────────────────────────────────
  app.get("/api/moderator/service-requests", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      // Returns recent contact messages + feedback as service requests
      const r = await query(`SELECT id, message as content, 'contact' as type, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 50`).catch(() => ({ rows: [] }));
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/moderator/communities", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureCommunitiesTable(); const r = await query(`SELECT * FROM communities WHERE is_approved=FALSE ORDER BY created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });

  // ── Design Gallery ────────────────────────────────────────────────────────────
  async function ensureDesignGalleryTables() {
    await query(`CREATE TABLE IF NOT EXISTS design_gallery_members (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      shop_name VARCHAR(200) NOT NULL, specialty TEXT[], portfolio_url TEXT,
      instagram VARCHAR(100), phone VARCHAR(30), description TEXT,
      package_id INTEGER, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS design_gallery_packages (
      id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, description TEXT,
      price NUMERIC(10,2), duration_days INTEGER, features JSONB, is_active BOOLEAN DEFAULT TRUE
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS design_gallery_orders (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      member_id INTEGER REFERENCES design_gallery_members(id) ON DELETE SET NULL,
      description TEXT NOT NULL, budget NUMERIC(12,2), status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/design-gallery/members", async (_req, res) => {
    try { await ensureDesignGalleryTables(); const r = await query(`SELECT dgm.*, u.name as user_name, u.avatar_url FROM design_gallery_members dgm LEFT JOIN users u ON u.id=dgm.user_id WHERE dgm.status='active' ORDER BY dgm.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/design-gallery/packages", async (_req, res) => {
    try { await ensureDesignGalleryTables(); const r = await query(`SELECT * FROM design_gallery_packages WHERE is_active=TRUE ORDER BY price`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/design-gallery/products", async (_req, res) => {
    try { await ensureDesignGalleryTables(); const r = await query(`SELECT dgm.id, dgm.shop_name as name, dgm.specialty, dgm.description, u.avatar_url as image_url FROM design_gallery_members dgm LEFT JOIN users u ON u.id=dgm.user_id WHERE dgm.status='active' LIMIT 50`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/design-gallery/orders", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try { await ensureDesignGalleryTables(); const r = await query(`SELECT * FROM design_gallery_orders WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/design-gallery/subscribe", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureDesignGalleryTables();
      const { shop_name, specialty, portfolio_url, instagram, phone, description, package_id } = req.body;
      const r = await query(
        `INSERT INTO design_gallery_members (user_id,shop_name,specialty,portfolio_url,instagram,phone,description,package_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [me.id, shop_name, specialty||[], portfolio_url||null, instagram||null, phone||null, description||null, package_id||null]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/admin/design-gallery/members", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureDesignGalleryTables(); const r = await query(`SELECT dgm.*, u.name as user_name FROM design_gallery_members dgm LEFT JOIN users u ON u.id=dgm.user_id ORDER BY dgm.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/admin/design-gallery/orders", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureDesignGalleryTables(); const r = await query(`SELECT dgo.*, u.name as client_name FROM design_gallery_orders dgo LEFT JOIN users u ON u.id=dgo.user_id ORDER BY dgo.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.patch("/api/admin/design-gallery/members/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`UPDATE design_gallery_members SET status=$1 WHERE id=$2`, [req.body.status||'pending', req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/design-gallery/members/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM design_gallery_members WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Occasions Join & Shops ────────────────────────────────────────────────────
  async function ensureOccasionsTables() {
    await query(`CREATE TABLE IF NOT EXISTS occasion_join_requests (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      occasion_type VARCHAR(100) NOT NULL, message TEXT,
      contact_phone VARCHAR(30), status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS occasion_shops (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, category VARCHAR(100),
      phone VARCHAR(30), location VARCHAR(200), image_url TEXT,
      is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.post("/api/occasions/join-request", async (req, res) => {
    const me = await getSessionUser(req);
    try {
      await ensureOccasionsTables();
      const { occasion_type, message, contact_phone } = req.body;
      const r = await query(`INSERT INTO occasion_join_requests (user_id,occasion_type,message,contact_phone) VALUES ($1,$2,$3,$4) RETURNING *`,
        [me?.id||null, occasion_type, message||null, contact_phone||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/occasions/shops", async (_req, res) => {
    try { await ensureOccasionsTables(); const r = await query(`SELECT * FROM occasion_shops WHERE is_active=TRUE ORDER BY name`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/occasions/transport", async (_req, res) => {
    try { await ensureTransportTables(); const r = await query(`SELECT * FROM transport_trips WHERE status='active' ORDER BY created_at DESC LIMIT 20`); res.json(r.rows); }
    catch { res.json([]); }
  });

  // ── Lawyers ───────────────────────────────────────────────────────────────────
  async function ensureLawyersTables() {
    await query(`CREATE TABLE IF NOT EXISTS lawyers (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(200) NOT NULL, specialties TEXT[], license_number VARCHAR(100),
      phone VARCHAR(30), email VARCHAR(150), bio TEXT, image_url TEXT,
      years_experience INTEGER, is_verified BOOLEAN DEFAULT FALSE,
      status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS lawyer_ads (
      id SERIAL PRIMARY KEY, lawyer_id INTEGER REFERENCES lawyers(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL, description TEXT, image_url TEXT,
      is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS lawyer_contracts (
      id SERIAL PRIMARY KEY, lawyer_id INTEGER REFERENCES lawyers(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      case_title VARCHAR(200), case_type VARCHAR(100), contract_date DATE,
      fee NUMERIC(12,2), status VARCHAR(20) DEFAULT 'active',
      notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS legal_forms (
      id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, category VARCHAR(100),
      description TEXT, file_url TEXT, is_free BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS lawyer_applications (
      id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(200) NOT NULL, specialties TEXT[], license_number VARCHAR(100),
      phone VARCHAR(30), email VARCHAR(150), bio TEXT, image_url TEXT,
      years_experience INTEGER, status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  }
  app.get("/api/lawyers", async (req, res) => {
    try {
      await ensureLawyersTables();
      const spec = req.query.specialty as string | undefined;
      let sql = `SELECT l.*, u.name as user_name FROM lawyers l LEFT JOIN users u ON u.id=l.user_id WHERE l.status='approved'`;
      const params: any[] = [];
      if (spec) { params.push(`%${spec}%`); sql += ` AND l.specialties::text ILIKE $${params.length}`; }
      sql += ` ORDER BY l.is_verified DESC, l.created_at DESC`;
      const r = await query(sql, params);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/lawyer-ads", async (_req, res) => {
    try { await ensureLawyersTables(); const r = await query(`SELECT la.*, l.name as lawyer_name FROM lawyer_ads la LEFT JOIN lawyers l ON l.id=la.lawyer_id WHERE la.is_active=TRUE ORDER BY la.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/my-lawyer-contracts", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try { await ensureLawyersTables(); const r = await query(`SELECT lc.*, l.name as lawyer_name FROM lawyer_contracts lc LEFT JOIN lawyers l ON l.id=lc.lawyer_id WHERE lc.client_id=$1 ORDER BY lc.created_at DESC`, [me.id]); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/legal-forms", async (_req, res) => {
    try { await ensureLawyersTables(); const r = await query(`SELECT * FROM legal_forms WHERE is_free=TRUE ORDER BY category, title`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/lawyer-applications", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const { name, specialties, license_number, phone, email, bio, image_url, years_experience } = req.body;
      const existing = (await query(`SELECT id FROM lawyer_applications WHERE user_id=$1 AND status='pending'`, [me.id])).rows[0];
      if (existing) return res.status(400).json({ error: "لديك طلب قيد المراجعة بالفعل" });
      const r = await query(
        `INSERT INTO lawyer_applications (user_id,name,specialties,license_number,phone,email,bio,image_url,years_experience) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [me.id, name, specialties||[], license_number||null, phone||null, email||null, bio||null, image_url||null, years_experience||null]
      );
      void pushToAdmins("⚖️ طلب محامٍ جديد", `${name} — رقم الترخيص: ${license_number||"غير محدد"}`, { screen: "lawyers", applicationId: r.rows[0].id }, "URGENT");
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/lawyers/:id", async (req, res) => {
    try { await ensureLawyersTables(); const r = await query(`SELECT l.*, u.name as user_name FROM lawyers l LEFT JOIN users u ON u.id=l.user_id WHERE l.id=$1 LIMIT 1`, [req.params.id]); res.json(r.rows[0]||null); }
    catch { res.json(null); }
  });
  app.get("/api/lawyers/:id/contracts", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try { await ensureLawyersTables(); const r = await query(`SELECT * FROM lawyer_contracts WHERE lawyer_id=$1 AND client_id=$2 ORDER BY created_at DESC`, [req.params.id, me.id]); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.post("/api/lawyers/:id/contracts", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const { case_title, case_type, fee, notes } = req.body;
      const r = await query(`INSERT INTO lawyer_contracts (lawyer_id,client_id,case_title,case_type,fee,notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [parseInt(req.params.id), me.id, case_title||null, case_type||null, fee||null, notes||null]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/lawyers/:id/ratings", async (req, res) => {
    try {
      await ensureLawyersTables();
      await query(`CREATE TABLE IF NOT EXISTS lawyer_ratings (id SERIAL PRIMARY KEY, lawyer_id INTEGER REFERENCES lawyers(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, rating INTEGER CHECK(rating BETWEEN 1 AND 5), comment TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(()=>{});
      const r = await query(`SELECT lr.*, u.name as reviewer_name FROM lawyer_ratings lr LEFT JOIN users u ON u.id=lr.user_id WHERE lr.lawyer_id=$1 ORDER BY lr.created_at DESC`, [req.params.id]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/lawyers/:id/ratings", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS lawyer_ratings (id SERIAL PRIMARY KEY, lawyer_id INTEGER REFERENCES lawyers(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, rating INTEGER CHECK(rating BETWEEN 1 AND 5), comment TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(()=>{});
      const { rating, comment } = req.body;
      const r = await query(`INSERT INTO lawyer_ratings (lawyer_id,user_id,rating,comment) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`, [parseInt(req.params.id), me.id, rating, comment||null]);
      res.json(r.rows[0]||{ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/lawyer-applications/mine", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try { await ensureLawyersTables(); const r = await query(`SELECT * FROM lawyer_applications WHERE user_id=$1 ORDER BY created_at DESC`, [me.id]); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/lawyer-applications/verify", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureLawyersTables(); const r = await query(`SELECT la.*, u.name as user_name FROM lawyer_applications la LEFT JOIN users u ON u.id=la.user_id WHERE la.status='pending' ORDER BY la.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/admin/lawyer-applications", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureLawyersTables(); const r = await query(`SELECT la.*, u.name as user_name FROM lawyer_applications la LEFT JOIN users u ON u.id=la.user_id ORDER BY la.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.get("/api/admin/lawyers", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureLawyersTables(); const r = await query(`SELECT l.*, u.name as user_name FROM lawyers l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC`); res.json(r.rows); }
    catch { res.json([]); }
  });
  app.patch("/api/admin/lawyer-applications/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`UPDATE lawyer_applications SET status=$1 WHERE id=$2`, [req.body.status||'pending', req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Lawyer Portal ─────────────────────────────────────────────────────────────
  app.get("/api/my-lawyer-stats", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const lawyer = (await query(`SELECT id FROM lawyers WHERE user_id=$1 LIMIT 1`, [me.id])).rows[0];
      if (!lawyer) return res.json({ cases: 0, active: 0, revenue: 0 });
      const [cases, active] = await Promise.all([
        query(`SELECT COUNT(*) FROM lawyer_contracts WHERE lawyer_id=$1`, [lawyer.id]),
        query(`SELECT COUNT(*) FROM lawyer_contracts WHERE lawyer_id=$1 AND status='active'`, [lawyer.id]),
      ]);
      res.json({ cases: Number(cases.rows[0].count), active: Number(active.rows[0].count) });
    } catch { res.json({ cases: 0, active: 0 }); }
  });
  app.get("/api/my-lawyer-cases", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const lawyer = (await query(`SELECT id FROM lawyers WHERE user_id=$1 LIMIT 1`, [me.id])).rows[0];
      if (!lawyer) return res.json([]);
      const r = await query(`SELECT lc.*, u.name as client_name FROM lawyer_contracts lc LEFT JOIN users u ON u.id=lc.client_id WHERE lc.lawyer_id=$1 ORDER BY lc.created_at DESC`, [lawyer.id]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.get("/api/my-lawyer-profile", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const r = await query(`SELECT * FROM lawyers WHERE user_id=$1 LIMIT 1`, [me.id]);
      res.json(r.rows[0] || null);
    } catch { res.json(null); }
  });
  app.get("/api/my-lawyer-pdf-data", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const lawyer = (await query(`SELECT * FROM lawyers WHERE user_id=$1 LIMIT 1`, [me.id])).rows[0];
      const cases = lawyer ? (await query(`SELECT * FROM lawyer_contracts WHERE lawyer_id=$1 AND status='active'`, [lawyer.id])).rows : [];
      res.json({ lawyer, cases });
    } catch { res.json({ lawyer: null, cases: [] }); }
  });

  app.get("/api/my-lawyer-cases/:id", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const r = await query(`SELECT lc.*, u.name as client_name FROM lawyer_contracts lc LEFT JOIN users u ON u.id=lc.client_id WHERE lc.id=$1`, [parseInt(req.params.id)]);
      if (!r.rows[0]) return res.status(404).json({ error: "غير موجود" });
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/my-lawyer-cases/:id/messages", async (req, res) => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS case_messages (id SERIAL PRIMARY KEY, contract_id INTEGER REFERENCES lawyer_contracts(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const r = await query(`SELECT cm.*, u.name as sender_name FROM case_messages cm LEFT JOIN users u ON u.id=cm.user_id WHERE cm.contract_id=$1 ORDER BY cm.created_at ASC`, [parseInt(req.params.id)]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/my-lawyer-cases/:id/messages", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS case_messages (id SERIAL PRIMARY KEY, contract_id INTEGER REFERENCES lawyer_contracts(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const r = await query(`INSERT INTO case_messages (contract_id, user_id, content) VALUES ($1,$2,$3) RETURNING *`, [parseInt(req.params.id), me.id, req.body.content]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.patch("/api/my-lawyer-cases/:id/status", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      const { status } = req.body;
      await query(`UPDATE lawyer_contracts SET status=$1 WHERE id=$2`, [status, parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/my-lawyer-cases/:id/documents", async (req, res) => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS case_documents (id SERIAL PRIMARY KEY, contract_id INTEGER REFERENCES lawyer_contracts(id) ON DELETE CASCADE, user_id INTEGER, name VARCHAR(200), url TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const r = await query(`SELECT * FROM case_documents WHERE contract_id=$1 ORDER BY created_at DESC`, [parseInt(req.params.id)]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/my-lawyer-cases/:id/documents", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS case_documents (id SERIAL PRIMARY KEY, contract_id INTEGER REFERENCES lawyer_contracts(id) ON DELETE CASCADE, user_id INTEGER, name VARCHAR(200), url TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const { name, url } = req.body;
      const r = await query(`INSERT INTO case_documents (contract_id, user_id, name, url) VALUES ($1,$2,$3,$4) RETURNING *`, [parseInt(req.params.id), me.id, name, url]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/my-lawyer-cases/:id/documents/:docId", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM case_documents WHERE id=$1 AND contract_id=$2`, [parseInt(req.params.docId), parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.patch("/api/my-lawyer-profile", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const { name, specialty, bio, address, phone, experience_years, hourly_rate } = req.body;
      const r = await query(
        `UPDATE lawyers SET name=COALESCE($1,name), specialty=COALESCE($2,specialty), bio=COALESCE($3,bio), address=COALESCE($4,address), phone=COALESCE($5,phone), experience_years=COALESCE($6,experience_years), hourly_rate=COALESCE($7,hourly_rate) WHERE user_id=$8 RETURNING *`,
        [name||null, specialty||null, bio||null, address||null, phone||null, experience_years||null, hourly_rate||null, me.id]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Client Cases ──────────────────────────────────────────────────────────────
  app.get("/api/client/cases", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const r = await query(`SELECT lc.*, l.name as lawyer_name FROM lawyer_contracts lc LEFT JOIN lawyers l ON l.id=lc.lawyer_id WHERE lc.client_id=$1 ORDER BY lc.created_at DESC`, [me.id]);
      res.json(r.rows);
    } catch { res.json([]); }
  });

  // ── Client Case Chat ─────────────────────────────────────────────────────────
  app.get("/api/client/cases/:id/messages", async (req, res) => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS case_messages (id SERIAL PRIMARY KEY, contract_id INTEGER REFERENCES lawyer_contracts(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const page  = parseInt(String(req.query.page  || 1));
      const limit = parseInt(String(req.query.limit || 50));
      const offset = (page - 1) * limit;
      const r = await query(`SELECT cm.*, u.name as sender_name FROM case_messages cm LEFT JOIN users u ON u.id=cm.user_id WHERE cm.contract_id=$1 ORDER BY cm.created_at DESC LIMIT $2 OFFSET $3`, [parseInt(req.params.id), limit, offset]);
      res.json(r.rows);
    } catch { res.json([]); }
  });
  app.post("/api/client/cases/:id/messages", async (req, res) => {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS case_messages (id SERIAL PRIMARY KEY, contract_id INTEGER REFERENCES lawyer_contracts(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const r = await query(`INSERT INTO case_messages (contract_id, user_id, content) VALUES ($1,$2,$3) RETURNING *`, [parseInt(req.params.id), me.id, req.body.content]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/client/cases/:id/documents", async (req, res) => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS case_documents (id SERIAL PRIMARY KEY, contract_id INTEGER REFERENCES lawyer_contracts(id) ON DELETE CASCADE, user_id INTEGER, name VARCHAR(200), url TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
      const page  = parseInt(String(req.query.page  || 1));
      const limit = parseInt(String(req.query.limit || 50));
      const offset = (page - 1) * limit;
      const r = await query(`SELECT * FROM case_documents WHERE contract_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [parseInt(req.params.id), limit, offset]);
      res.json(r.rows);
    } catch { res.json([]); }
  });

  // ── Institution Applications (Org Join) ──────────────────────────────────────
  async function ensureInstitutionApplicationsTables() {
    await query(`CREATE TABLE IF NOT EXISTS institution_applications (
      id SERIAL PRIMARY KEY,
      applicant_name VARCHAR(200) NOT NULL,
      applicant_email VARCHAR(200),
      applicant_phone VARCHAR(50),
      institution_name VARCHAR(300),
      institution_type VARCHAR(100),
      application_data JSONB DEFAULT '{}',
      status VARCHAR(30) DEFAULT 'pending',
      signed_contract_url TEXT,
      pdf_url TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }

  app.get("/api/institution-applications/contract-settings", async (_req, res) => {
    // Returns contract template settings
    res.json({
      contract_version: "2.0",
      effective_date: "2026-01-01",
      terms: [
        "تلتزم المؤسسة بتوفير خدماتها بأعلى معايير الجودة",
        "يُعدّ هذا العقد ملزماً لكلا الطرفين وفق أحكام القانون السوداني",
        "تتولى حصاحيصاوي نشر خدمات المؤسسة على منصتها الرقمية",
        "يحق لكلا الطرفين إنهاء العقد بإشعار مسبق مدته 30 يوماً",
      ],
      platform_commission: "5%",
      support_email: "Hasahisawi@hotmail.com",
    });
  });

  app.get("/api/institution-applications/contract-pdf", async (_req, res) => {
    // Returns a placeholder PDF URL or redirect
    res.json({ pdf_url: null, message: "PDF generation not available on this plan" });
  });

  app.post("/api/institution-applications", async (req, res) => {
    try {
      await ensureInstitutionApplicationsTables();
      const { applicant_name, applicant_email, applicant_phone, institution_name, institution_type, ...rest } = req.body;
      if (!applicant_name || !institution_name) return res.status(400).json({ error: "الاسم ومعلومات المؤسسة مطلوبة" });
      const r = await query(
        `INSERT INTO institution_applications (applicant_name, applicant_email, applicant_phone, institution_name, institution_type, application_data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [applicant_name, applicant_email||null, applicant_phone||null, institution_name, institution_type||null, JSON.stringify(rest)]
      );
      sendAdminNotifEmail("🏢 طلب انضمام مؤسسة جديد", {
        "المؤسسة": institution_name, "نوع المؤسسة": institution_type||"",
        "المندوب": applicant_name, "الهاتف": applicant_phone||"",
        "البريد الإلكتروني": applicant_email||"",
      });
      void pushToAdmins("🏢 طلب انضمام مؤسسة", `${institution_name} — ${applicant_name}`, { screen: "admin", tab: "join_requests" });
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/institution-applications/:id", async (req, res) => {
    try {
      await ensureInstitutionApplicationsTables();
      const r = await query(`SELECT * FROM institution_applications WHERE id=$1`, [parseInt(req.params.id)]);
      if (!r.rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/institution-applications/:id/signed-contract", async (req, res) => {
    try {
      await ensureInstitutionApplicationsTables();
      const { signed_contract_url, pdf_url } = req.body;
      const r = await query(
        `UPDATE institution_applications SET signed_contract_url=$1, pdf_url=$2, status='signed', updated_at=NOW() WHERE id=$3 RETURNING *`,
        [signed_contract_url||null, pdf_url||null, parseInt(req.params.id)]
      );
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/admin/institution-applications", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureInstitutionApplicationsTables();
      const r = await query(`SELECT * FROM institution_applications ORDER BY created_at DESC`);
      res.json(r.rows);
    } catch { res.json([]); }
  });

  app.patch("/api/admin/institution-applications/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { status, notes } = req.body;
      const r = await query(`UPDATE institution_applications SET status=COALESCE($1,status), notes=COALESCE($2,notes), updated_at=NOW() WHERE id=$3 RETURNING *`, [status||null, notes||null, parseInt(req.params.id)]);
      res.json(r.rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: Users stats ────────────────────────────────────────────────────
  app.get("/api/admin/users/:id/stats", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const uid = parseInt(req.params.id);
      const [posts, reports, contacts] = await Promise.all([
        query(`SELECT COUNT(*) FROM posts WHERE user_id=$1`, [uid]).catch(() => ({ rows: [{ count: 0 }] })),
        query(`SELECT COUNT(*) FROM incident_reports WHERE user_id=$1`, [uid]).catch(() => ({ rows: [{ count: 0 }] })),
        query(`SELECT COUNT(*) FROM contact_messages WHERE email=(SELECT email FROM users WHERE id=$1)`, [uid]).catch(() => ({ rows: [{ count: 0 }] })),
      ]);
      res.json({ posts: Number(posts.rows[0].count), reports: Number(reports.rows[0].count), contacts: Number(contacts.rows[0].count) });
    } catch { res.json({ posts: 0, reports: 0, contacts: 0 }); }
  });

  // ── Admin: Honored Figures Visibility ──────────────────────────────────────
  app.patch("/api/admin/honored-figures/:id/visibility", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureHonoredFiguresTable();
      const cur = (await query(`SELECT is_featured FROM honored_figures WHERE id=$1`, [req.params.id])).rows[0];
      if (!cur) return res.status(404).json({ error: "غير موجود" });
      await query(`UPDATE honored_figures SET is_featured=$1 WHERE id=$2`, [!cur.is_featured, req.params.id]);
      res.json({ ok: true, is_featured: !cur.is_featured });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: Neighborhoods individual CRUD ──────────────────────────────────
  app.put("/api/admin/neighborhoods/:key", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { name_ar, name_en, district, lat, lng } = req.body;
      await query(`UPDATE neighborhoods SET name_ar=COALESCE($1,name_ar),name_en=COALESCE($2,name_en),district=COALESCE($3,district),lat=COALESCE($4,lat),lng=COALESCE($5,lng) WHERE key=$6`,
        [name_ar||null, name_en||null, district||null, lat||null, lng||null, req.params.key]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/neighborhoods/:key", async (req, res) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`DELETE FROM neighborhoods WHERE key=$1`, [req.params.key]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: Communities status & delete ────────────────────────────────────
  app.patch("/api/admin/communities/:id/status", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureCommunitiesTable();
      const { status } = req.body;
      await query(`UPDATE communities SET is_approved=$1 WHERE id=$2`, [status === 'approved', req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/communities/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureCommunitiesTable();
      await query(`DELETE FROM communities WHERE id=$1`, [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: Merchants CRUD ─────────────────────────────────────────────────
  app.put("/api/admin/merchants/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { is_verified, is_featured, name, category, phone, description } = req.body;
      await query(`UPDATE merchants SET is_verified=COALESCE($1,is_verified),is_featured=COALESCE($2,is_featured),name=COALESCE($3,name),category=COALESCE($4,category),phone=COALESCE($5,phone),description=COALESCE($6,description) WHERE id=$7`,
        [is_verified!=null?is_verified:null, is_featured!=null?is_featured:null, name||null, category||null, phone||null, description||null, req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/merchants/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await query(`DELETE FROM merchants WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: Student Libraries CRUD ─────────────────────────────────────────
  app.put("/api/admin/student-libraries/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureStudentLibrariesTable();
      const { is_active, is_verified, name, location, phone, open_hours, description } = req.body;
      const active = is_active != null ? is_active : (is_verified != null ? is_verified : null);
      await query(`UPDATE student_libraries SET is_active=COALESCE($1,is_active),name=COALESCE($2,name),location=COALESCE($3,location),phone=COALESCE($4,phone),open_hours=COALESCE($5,open_hours),description=COALESCE($6,description) WHERE id=$7`,
        [active, name||null, location||null, phone||null, open_hours||null, description||null, req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/student-libraries/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureStudentLibrariesTable(); await query(`DELETE FROM student_libraries WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: Lawyers CRUD ───────────────────────────────────────────────────
  app.patch("/api/admin/lawyers/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureLawyersTables();
      const allowed = ['is_verified', 'status', 'name', 'phone', 'bio'];
      const updates: string[] = [];
      const params: any[] = [];
      for (const [k, v] of Object.entries(req.body)) {
        if (allowed.includes(k)) { params.push(v); updates.push(`${k}=$${params.length}`); }
      }
      if (updates.length === 0) return res.status(400).json({ error: "لا يوجد حقول للتحديث" });
      params.push(req.params.id);
      await query(`UPDATE lawyers SET ${updates.join(',')} WHERE id=$${params.length}`, params);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.delete("/api/admin/lawyers/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try { await ensureLawyersTables(); await query(`DELETE FROM lawyers WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: Design Gallery Orders CRUD ────────────────────────────────────
  app.patch("/api/admin/design-gallery/orders/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await ensureDesignGalleryTables();
      const { status } = req.body;
      await query(`UPDATE design_gallery_orders SET status=$1 WHERE id=$2`, [status||'pending', req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Moderator: Service Requests update ────────────────────────────────────
  app.patch("/api/moderator/service-requests/:id", async (req, res) => {
    if (!await isAdminOrModRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      const { status } = req.body;
      await query(`UPDATE contact_messages SET status=COALESCE($1,status) WHERE id=$2`, [status||null, parseInt(req.params.id)]).catch(() => {});
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  const httpServer = createServer(app);
  return httpServer;
}
