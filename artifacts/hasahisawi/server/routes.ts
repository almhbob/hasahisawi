import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

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
  // Migration: add national_id if it doesn't exist yet
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(30) UNIQUE
  `);
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
    `SELECT u.id, u.role, u.name FROM users u
     JOIN user_sessions s ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  const user = result.rows[0];
  if (!user) return null;
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

  const httpServer = createServer(app);
  return httpServer;
}
