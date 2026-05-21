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
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const isVideo = mimeType.startsWith("video/");
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: isVideo ? "video" : "image", format: ext },
      (err, result) => {
        if (err || !result) return reject(err || new Error("Upload failed"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

function saveLocally(buffer: Buffer, originalName: string): string {
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const ext = path.extname(originalName) || ".jpg";
  const fname = `${Date.now()}_${randomBytes(4).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(uploadsDir, fname), buffer);
  return `/api/files/${fname}`;
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
  await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE`);
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
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const user = await getSessionUser(req);
  return user?.role === "admin" || false;
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
        "SELECT status, auth_token FROM qr_sessions WHERE token = $1",
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

  // ── POST /api/auth/qr/:token/confirm ─────────────────────────────────────
  app.post("/api/auth/qr/:token/confirm", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "غير مسجل الدخول" });

      const r = await query(
        "SELECT id FROM qr_sessions WHERE token = $1 AND status = 'pending' AND expires_at > NOW()",
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
      const result = await query(
        `SELECT
           p.*,
           COUNT(DISTINCT c.id)::int AS comments_count,
           COUNT(DISTINCT sl.id)::int AS likes_count,
           BOOL_OR(sl.device_id = $1) AS liked_by_me
         FROM social_posts p
         LEFT JOIN social_comments c ON c.post_id = p.id
         LEFT JOIN social_likes sl ON sl.post_id = p.id
         GROUP BY p.id
         ORDER BY p.created_at DESC
         LIMIT 100`,
        [deviceId]
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
      const { author_name, content, category } = req.body;
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "المحتوى مطلوب" });
      }
      if (content.trim().length > 1000) {
        return res.status(400).json({ error: "المحتوى طويل جداً (الحد الأقصى 1000 حرف)" });
      }
      const result = await query(
        `INSERT INTO social_posts (author_name, content, category)
         VALUES ($1, $2, $3) RETURNING *`,
        [
          (author_name || "مجهول").substring(0, 100),
          content.trim(),
          (category || "عام").substring(0, 50),
        ]
      );
      res.status(201).json(result.rows[0]);
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
        `SELECT * FROM social_comments WHERE post_id = $1 ORDER BY created_at ASC`,
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
      const { author_name, content } = req.body;
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "التعليق مطلوب" });
      }
      if (content.trim().length > 500) {
        return res.status(400).json({ error: "التعليق طويل جداً" });
      }
      const postCheck = await query("SELECT id FROM social_posts WHERE id = $1", [req.params.id]);
      if (postCheck.rows.length === 0) return res.status(404).json({ error: "المنشور غير موجود" });

      const result = await query(
        `INSERT INTO social_comments (post_id, author_name, content)
         VALUES ($1, $2, $3) RETURNING *`,
        [req.params.id, (author_name || "مجهول").substring(0, 100), content.trim()]
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

  // ── GET /api/notifications ────────────────────────────────────────────────────────────────────────────────────
  app.get("/api/notifications", async (_req: Request, res: Response) => {
    try {
      const result = await query(
        "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50"
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
      const { title, body, type } = req.body;
      if (!title || !body) return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });
      const result = await query(
        "INSERT INTO notifications (title, body, type) VALUES ($1, $2, $3) RETURNING *",
        [title.substring(0, 200), body.substring(0, 1000), (type || "general").substring(0, 50)]
      );
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
  app.put("/api/notifications/read-all", async (_req: Request, res: Response) => {
    try {
      await query("UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE");
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
      await query(
        `UPDATE users SET
          name = COALESCE($1, name),
          bio = COALESCE($2, bio),
          neighborhood = COALESCE($3, neighborhood),
          gender = COALESCE($4, gender),
          birth_date = COALESCE($5, birth_date),
          avatar_url = COALESCE($6, avatar_url)
         WHERE id = $7`,
        [name || null, bio || null, neighborhood || null, gender || null, birth_date || null, avatar_url || null, me.id]
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
      res.json({ user: safeUser(userRow), token });
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
           ${company_id ? `AND o.company_id=${parseInt(company_id)}` : ""}
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
  // إرسال رمز OTP للتسجيل — مع Twilio SMS ومع Fallback للبيئة التطويرية
  app.post("/api/auth/send-registration-otp", async (req: Request, res: Response) => {
    try {
      const { phone_or_email } = req.body;
      if (!phone_or_email) return res.status(400).json({ error: "رقم الهاتف أو البريد الإلكتروني مطلوب" });
      const identifier = phone_or_email.trim();

      // Rate limit: max 3 requests per identifier per 15 min
      const recentR = await query(
        "SELECT COUNT(*)::int AS cnt FROM otp_tokens WHERE phone=$1 AND created_at > NOW() - INTERVAL '15 minutes'",
        [identifier]
      );
      if ((recentR.rows[0]?.cnt ?? 0) >= 3) {
        return res.status(429).json({ error: "طلبات كثيرة، انتظر 15 دقيقة وحاول مجدداً" });
      }

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      const otpHash = await bcrypt.hash(otp, 6);

      await query("DELETE FROM otp_tokens WHERE phone=$1", [identifier]);
      await query(
        "INSERT INTO otp_tokens(phone, otp, expires_at, attempts) VALUES($1,$2,$3,0)",
        [identifier, otpHash, expires]
      );

      let smsSent = false;
      const isEmail = identifier.includes("@");

      // ── Twilio SMS ──
      if (!isEmail && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_FROM) {
        try {
          const rawPhone = identifier.replace(/^0/, "");
          const toPhone = identifier.startsWith("+") ? identifier : `+249${rawPhone}`;
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
          const authHeader = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
          const body = new URLSearchParams({
            To: toPhone,
            From: process.env.TWILIO_PHONE_FROM,
            Body: `رمز التحقق لـ حصاحيصاوي: ${otp}\nصالح 10 دقائق. لا تشاركه مع أحد.`,
          });
          const twilioRes = await fetch(twilioUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${authHeader}` },
            body,
          });
          smsSent = twilioRes.status < 300;
        } catch (smsErr) {
          console.error("[OTP] Twilio error:", smsErr);
        }
      }

      const isDev = process.env.NODE_ENV !== "production" || process.env.SHOW_DEV_OTP === "true";
      res.json({
        success: true,
        sent: smsSent,
        // في بيئة التطوير فقط: أعد الـ OTP للاختبار
        ...(isDev && !smsSent ? { dev_otp: otp } : {}),
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
        id SERIAL PRIMARY KEY, org_name VARCHAR(200) NOT NULL, org_type VARCHAR(50),
        contact_name VARCHAR(100) NOT NULL, phone VARCHAR(20) NOT NULL,
        email VARCHAR(100), description TEXT, website VARCHAR(200),
        requested_level VARCHAR(30), status VARCHAR(20) DEFAULT 'pending',
        admin_note TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      const { org_name, org_type, contact_name, phone, email, description, website, requested_level } = req.body;
      if (!org_name || !contact_name || !phone) return res.status(400).json({ error: "البيانات الأساسية مطلوبة" });
      const r = await query(
        `INSERT INTO external_partnership_applications(org_name,org_type,contact_name,phone,email,description,website,requested_level)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status`,
        [org_name,org_type||null,contact_name,phone,email||null,description||null,website||null,requested_level||'standard']
      );
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

  // ── ضبط الأقسام (admin) ──────────────────────────────────────────────────
  app.get("/api/admin/section-configs", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS section_configs (
        id SERIAL PRIMARY KEY, section_key VARCHAR(50) UNIQUE NOT NULL,
        section_name VARCHAR(100), is_enabled BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0, config JSONB DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      const r = await query("SELECT * FROM section_configs ORDER BY display_order, section_key");
      res.json(r.rows);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.post("/api/admin/section-configs", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS section_configs (
        id SERIAL PRIMARY KEY, section_key VARCHAR(50) UNIQUE NOT NULL,
        section_name VARCHAR(100), is_enabled BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0, config JSONB DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      const { section_key, section_name, is_enabled, display_order, config } = req.body;
      if (!section_key) return res.status(400).json({ error: "المفتاح مطلوب" });
      const r = await query(
        `INSERT INTO section_configs(section_key,section_name,is_enabled,display_order,config)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(section_key) DO UPDATE SET section_name=EXCLUDED.section_name,
           is_enabled=EXCLUDED.is_enabled, display_order=EXCLUDED.display_order,
           config=EXCLUDED.config, updated_at=NOW() RETURNING *`,
        [section_key, section_name||section_key, is_enabled!==false, display_order||0, JSON.stringify(config||{})]
      );
      res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
  });

  app.patch("/api/admin/section-configs/:key", async (req: Request, res: Response) => {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    try {
      await query(`CREATE TABLE IF NOT EXISTS section_configs (
        id SERIAL PRIMARY KEY, section_key VARCHAR(50) UNIQUE NOT NULL,
        is_enabled BOOLEAN DEFAULT TRUE, display_order INTEGER DEFAULT 0,
        config JSONB DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      const { is_enabled, display_order, config, section_name } = req.body;
      await query(
        `INSERT INTO section_configs(section_key,section_name,is_enabled,display_order,config)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(section_key) DO UPDATE SET
           section_name=COALESCE($2,section_configs.section_name),
           is_enabled=COALESCE($3,section_configs.is_enabled),
           display_order=COALESCE($4,section_configs.display_order),
           config=COALESCE($5,section_configs.config), updated_at=NOW()`,
        [req.params.key, section_name||null, is_enabled!=null?Boolean(is_enabled):null,
         display_order!=null?Number(display_order):null, config?JSON.stringify(config):null]
      );
      res.json({ success: true });
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

  const httpServer = createServer(app);
  return httpServer;
}
