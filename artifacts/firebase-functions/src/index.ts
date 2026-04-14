import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import cookieParser from "cookie-parser";

admin.initializeApp();

// ══════════════════════════════════════════
// قاعدة البيانات — Neon PostgreSQL
// ══════════════════════════════════════════
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
});

async function query(text: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params as never[]);
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════
// تهيئة قاعدة البيانات
// ══════════════════════════════════════════
let dbInitialized = false;
async function ensureDbInitialized() {
  if (dbInitialized) return;
  try {
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
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE`);

    await query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(128) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS ads (
        id SERIAL PRIMARY KEY,
        institution_name VARCHAR(200) NOT NULL,
        title VARCHAR(300) NOT NULL,
        description TEXT,
        type VARCHAR(50) NOT NULL DEFAULT 'banner',
        image_url TEXT,
        contact_phone VARCHAR(30),
        contact_email VARCHAR(200),
        website_url TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id SERIAL PRIMARY KEY,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
        content TEXT NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'عام',
        image_url TEXT,
        likes INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT FALSE`);
    await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE`);
    await query(`
      CREATE TABLE IF NOT EXISTS social_comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS social_likes (
        post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (post_id, user_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(300) NOT NULL,
        body TEXT NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'general',
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS city_news (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        category VARCHAR(50) NOT NULL DEFAULT 'عام',
        is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        platform VARCHAR(20) DEFAULT 'expo',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        company VARCHAR(200),
        type VARCHAR(50) NOT NULL DEFAULT 'fulltime',
        location VARCHAR(200),
        description TEXT NOT NULL,
        contact_phone VARCHAR(30),
        salary VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS merchant_spaces (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        image_url TEXT,
        phone VARCHAR(30),
        address VARCHAR(300),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE merchant_spaces ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`);
    await query(`ALTER TABLE merchant_spaces ADD COLUMN IF NOT EXISTS delivery_available BOOLEAN DEFAULT FALSE`);
    await query(`ALTER TABLE merchant_spaces ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30)`);
    await query(`
      CREATE TABLE IF NOT EXISTS lost_items (
        id SERIAL PRIMARY KEY,
        type VARCHAR(20) NOT NULL DEFAULT 'lost',
        title VARCHAR(300) NOT NULL,
        description TEXT,
        location VARCHAR(300),
        contact_phone VARCHAR(30),
        image_url TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS emergency_numbers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        number VARCHAR(30) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'عام',
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS city_landmarks (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        sub VARCHAR(300),
        image_url TEXT,
        description TEXT,
        category VARCHAR(50),
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS honored_figures (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        title VARCHAR(300),
        bio TEXT,
        image_url TEXT,
        category VARCHAR(50),
        birth_year INTEGER,
        death_year INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_featured BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS moderator_permissions (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        section VARCHAR(100) NOT NULL,
        PRIMARY KEY (user_id, section)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS specialists (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        specialty VARCHAR(200) NOT NULL,
        clinic_name VARCHAR(200),
        phone VARCHAR(30),
        address VARCHAR(300),
        schedule TEXT,
        image_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE specialists ADD COLUMN IF NOT EXISTS clinic_enabled BOOLEAN DEFAULT TRUE`);
    await query(`
      CREATE TABLE IF NOT EXISTS map_places (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'عام',
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        description TEXT,
        phone VARCHAR(30),
        image_url TEXT,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user1_id, user2_id)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS communities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        image_url TEXT,
        category VARCHAR(100) NOT NULL DEFAULT 'حي',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        phone VARCHAR(30),
        address VARCHAR(300),
        image_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS sports_posts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'كرة القدم',
        image_url TEXT,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS citizen_reports (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        location VARCHAR(300),
        image_url TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS women_services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        phone VARCHAR(30),
        address VARCHAR(300),
        image_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        description TEXT,
        category VARCHAR(100) NOT NULL DEFAULT 'عام',
        start_date TIMESTAMPTZ,
        end_date TIMESTAMPTZ,
        location VARCHAR(300),
        image_url TEXT,
        price DECIMAL(10,2),
        is_free BOOLEAN NOT NULL DEFAULT TRUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        rating INTEGER,
        category VARCHAR(50) DEFAULT 'general',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    dbInitialized = true;
    console.log("✅ Neon DB initialized");
  } catch (err) {
    console.error("❌ DB init error:", err);
    throw err;
  }
}

// ══════════════════════════════════════════
// Helper — المستخدم الحالي من الجلسة
// ══════════════════════════════════════════
async function getSessionUser(req: Request) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const result = await query(
    `SELECT u.* FROM users u
     JOIN user_sessions s ON s.user_id = u.id
     WHERE s.token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

function safeUserPayload(u: Record<string, unknown>) {
  return {
    id: u.id, name: u.name, phone: u.phone, email: u.email,
    role: u.role, neighborhood: u.neighborhood,
    national_id_masked: u.national_id ? `***${String(u.national_id).slice(-4)}` : null,
    avatar_url: u.avatar_url, gender: u.gender,
  };
}

// ══════════════════════════════════════════
// Express App
// ══════════════════════════════════════════
const app = express();
app.use(cors({ origin: true, credentials: true, methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Middleware: initialize DB on first request
app.use(async (_req, _res, next) => {
  await ensureDbInitialized();
  next();
});

// ══ صحة السيرفر ══
app.get("/api/health", (_req, res) => res.json({ status: "ok", server: "firebase-functions", timestamp: new Date().toISOString() }));

// ══ إصدار التطبيق ══
app.get("/api/app/version", async (_req, res) => {
  const r = await query(`SELECT value FROM admin_settings WHERE key='app_version'`);
  res.json({ version: r.rows[0]?.value || "2.5.5", force_update: false });
});

// ══ Feature Flags ══
app.get("/api/app/feature-flags", async (_req, res) => {
  const rows = await query(`SELECT key, value FROM admin_settings WHERE key IN ('gov_services_enabled','gov_appointments_enabled','gov_reports_enabled','ride_status')`);
  const map: Record<string, string> = {};
  for (const r of rows.rows) map[r.key] = r.value;
  res.json({
    gov_services_enabled: map.gov_services_enabled !== "false",
    gov_appointments_enabled: map.gov_appointments_enabled !== "false",
    gov_reports_enabled: map.gov_reports_enabled !== "false",
    ride_status: (map.ride_status as "soon" | "maintenance" | "available") || "soon",
  });
});

app.patch("/api/admin/feature-flags", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
  const { gov_services_enabled, gov_appointments_enabled, gov_reports_enabled, ride_status } = req.body as Record<string, unknown>;
  if (gov_services_enabled !== undefined)
    await query(`INSERT INTO admin_settings(key,value) VALUES('gov_services_enabled',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [gov_services_enabled ? "true" : "false"]);
  if (gov_appointments_enabled !== undefined)
    await query(`INSERT INTO admin_settings(key,value) VALUES('gov_appointments_enabled',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [gov_appointments_enabled ? "true" : "false"]);
  if (gov_reports_enabled !== undefined)
    await query(`INSERT INTO admin_settings(key,value) VALUES('gov_reports_enabled',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [gov_reports_enabled ? "true" : "false"]);
  if (ride_status !== undefined && ["soon","maintenance","available"].includes(ride_status as string))
    await query(`INSERT INTO admin_settings(key,value) VALUES('ride_status',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, [ride_status]);
  return res.json({ ok: true });
});

// ══ تسجيل الدخول / التسجيل ══
app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone_or_email, password } = req.body as { phone_or_email: string; password: string };
    if (!phone_or_email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const result = await query(`SELECT * FROM users WHERE phone=$1 OR LOWER(email)=LOWER($1)`, [phone_or_email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "بيانات غير صحيحة" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "بيانات غير صحيحة" });
    if (user.is_banned) return res.status(403).json({ error: "تم حظر هذا الحساب" });
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err) { console.error(err); return res.status(500).json({ error: "Server error" }); }
});

app.post("/api/auth/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await query(`SELECT * FROM users WHERE LOWER(email)=LOWER($1) AND role='admin'`, [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "بيانات غير صحيحة" });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "بيانات غير صحيحة" });
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err) { console.error(err); return res.status(500).json({ error: "Server error" }); }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, phone, email, password, national_id, birth_date, neighborhood, gender } = req.body as Record<string, string>;
    if (!name || !password || (!phone && !email)) return res.status(400).json({ error: "البيانات ناقصة" });
    if (password.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, phone, email, password_hash, national_id, birth_date, neighborhood, gender)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, phone||null, email||null, hash, national_id||null, birth_date||null, neighborhood||null, gender||null]
    );
    const user = result.rows[0];
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err: unknown) {
    const msg = (err as { code?: string })?.code === "23505" ? "رقم الهاتف أو البريد مسجل مسبقاً" : "فشل إنشاء الحساب";
    return res.status(400).json({ error: msg });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    await query(`DELETE FROM user_sessions WHERE token=$1`, [auth.slice(7)]).catch(() => {});
  }
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  return res.json(safeUserPayload(user));
});

// ══ كلمة مرور المستخدم ══
app.patch("/api/admin/users/:id/password", async (req, res) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const { new_password } = req.body as { new_password: string };
    if (!new_password || new_password.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    const hash = await bcrypt.hash(new_password, 10);
    const { rowCount } = await query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "المستخدم غير موجود" });
    return res.json({ ok: true, message: "تم تحديث كلمة المرور بنجاح" });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// ══ الإعلانات ══
app.get("/api/ads", async (_req, res) => {
  const result = await query(`SELECT * FROM ads WHERE status='approved' AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY priority DESC, created_at DESC`);
  res.json(result.rows);
});

app.post("/api/ads", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const { institution_name, title, description, type, contact_phone, contact_email, website_url } = req.body as Record<string, string>;
    if (!institution_name || !title) return res.status(400).json({ error: "البيانات ناقصة" });
    const result = await query(
      `INSERT INTO ads (institution_name, title, description, type, contact_phone, contact_email, website_url, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [institution_name, title, description||null, type||"banner", contact_phone||null, contact_email||null, website_url||null, user?.id||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

app.get("/api/admin/ads", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || !["admin","moderator"].includes(me.role)) return res.status(403).json({ error: "غير مصرح" });
  const result = await query(`SELECT a.*, u.name as user_name FROM ads a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC`);
  res.json(result.rows);
});

app.patch("/api/admin/ads/:id/status", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || !["admin","moderator"].includes(me.role)) return res.status(403).json({ error: "غير مصرح" });
  const { status, priority, expires_days } = req.body as Record<string, string | number>;
  let expires_at = null;
  if (expires_days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(expires_days));
    expires_at = d.toISOString();
  }
  await query(`UPDATE ads SET status=$1, priority=COALESCE($2, priority), expires_at=COALESCE($3::timestamptz, expires_at) WHERE id=$4`, [status, priority||null, expires_at, req.params.id]);
  res.json({ ok: true });
});

// ══ المنشورات الاجتماعية ══
app.get("/api/social/posts", async (req, res) => {
  const { category, limit = "20", offset = "0" } = req.query as Record<string, string>;
  const user = await getSessionUser(req).catch(() => null);
  let q = `SELECT p.*, CASE WHEN p.is_anonymous THEN 'مجهول' ELSE COALESCE(u.name, p.author_name) END as display_name,
            u.avatar_url,
            (SELECT COUNT(*) FROM social_comments c WHERE c.post_id = p.id) as comments_count
            ${user ? `, EXISTS(SELECT 1 FROM social_likes WHERE post_id=p.id AND user_id=${user.id}) as liked_by_me` : ", false as liked_by_me"}
            FROM social_posts p LEFT JOIN users u ON u.id = p.author_id WHERE 1=1`;
  const params: unknown[] = [];
  if (category && category !== "all") { params.push(category); q += ` AND p.category=$${params.length}`; }
  q += ` ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
  params.push(parseInt(limit), parseInt(offset));
  const result = await query(q, params);
  res.json(result.rows);
});

app.post("/api/social/posts", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { content, category = "عام", is_anonymous = false, image_url } = req.body as Record<string, unknown>;
    if (!content) return res.status(400).json({ error: "المحتوى مطلوب" });
    const result = await query(
      `INSERT INTO social_posts (author_id, author_name, content, category, is_anonymous, image_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [user.id, user.name, content, category, is_anonymous, image_url||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

app.post("/api/social/posts/:id/like", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const postId = parseInt(req.params.id);
    const existing = await query(`SELECT 1 FROM social_likes WHERE post_id=$1 AND user_id=$2`, [postId, user.id]);
    if (existing.rows.length > 0) {
      await query(`DELETE FROM social_likes WHERE post_id=$1 AND user_id=$2`, [postId, user.id]);
      await query(`UPDATE social_posts SET likes = likes - 1 WHERE id=$1`, [postId]);
      return res.json({ liked: false });
    }
    await query(`INSERT INTO social_likes (post_id, user_id) VALUES ($1,$2)`, [postId, user.id]);
    await query(`UPDATE social_posts SET likes = likes + 1 WHERE id=$1`, [postId]);
    return res.json({ liked: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

app.get("/api/social/posts/:id/comments", async (req, res) => {
  const result = await query(`SELECT c.*, u.avatar_url FROM social_comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 ORDER BY c.created_at ASC`, [req.params.id]);
  res.json(result.rows);
});

app.post("/api/social/posts/:id/comments", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    const { content } = req.body as { content: string };
    if (!content) return res.status(400).json({ error: "المحتوى مطلوب" });
    const result = await query(
      `INSERT INTO social_comments (post_id, author_id, author_name, content) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, user.id, user.name, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// ══ الوظائف ══
app.get("/api/jobs", async (req, res) => {
  const { type, limit = "20", offset = "0" } = req.query as Record<string, string>;
  let q = `SELECT j.*, u.name as poster_name FROM jobs j LEFT JOIN users u ON u.id=j.user_id WHERE j.status='approved'`;
  const params: unknown[] = [];
  if (type) { params.push(type); q += ` AND j.type=$${params.length}`; }
  q += ` ORDER BY j.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
  params.push(parseInt(limit), parseInt(offset));
  res.json((await query(q, params)).rows);
});

app.post("/api/jobs", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const { title, company, type, location, description, contact_phone, salary } = req.body as Record<string, string>;
    if (!title || !description) return res.status(400).json({ error: "البيانات ناقصة" });
    const result = await query(
      `INSERT INTO jobs (title, company, type, location, description, contact_phone, salary, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, company||null, type||"fulltime", location||null, description, contact_phone||null, salary||null, user?.id||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

app.get("/api/admin/jobs", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || !["admin","moderator"].includes(me.role)) return res.status(403).json({ error: "غير مصرح" });
  res.json((await query(`SELECT j.*, u.name as poster_name FROM jobs j LEFT JOIN users u ON u.id=j.user_id ORDER BY j.created_at DESC`)).rows);
});

app.patch("/api/admin/jobs/:id/status", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || !["admin","moderator"].includes(me.role)) return res.status(403).json({ error: "غير مصرح" });
  await query(`UPDATE jobs SET status=$1 WHERE id=$2`, [req.body.status, req.params.id]);
  res.json({ ok: true });
});

// ══ السوق (merchant_spaces) ══
app.get("/api/market", async (req, res) => {
  const { category, limit = "20", offset = "0" } = req.query as Record<string, string>;
  let q = `SELECT * FROM merchant_spaces WHERE status='approved'`;
  const params: unknown[] = [];
  if (category) { params.push(category); q += ` AND category=$${params.length}`; }
  q += ` ORDER BY is_featured DESC, created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
  params.push(parseInt(limit), parseInt(offset));
  res.json((await query(q, params)).rows);
});

app.post("/api/market", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const { name, description, category, phone, address } = req.body as Record<string, string>;
    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
    const result = await query(
      `INSERT INTO merchant_spaces (name, description, category, phone, address, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, description||null, category||null, phone||null, address||null, user?.id||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// ══ الإعلانات الضائعة / المفقودات ══
app.get("/api/lost", async (req, res) => {
  const { type, status = "open" } = req.query as Record<string, string>;
  let q = `SELECT l.*, u.name as poster_name FROM lost_items l LEFT JOIN users u ON u.id=l.user_id WHERE l.status=$1`;
  const params: unknown[] = [status];
  if (type) { params.push(type); q += ` AND l.type=$${params.length}`; }
  q += ` ORDER BY l.created_at DESC`;
  res.json((await query(q, params)).rows);
});

app.post("/api/lost", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const { type, title, description, location, contact_phone } = req.body as Record<string, string>;
    if (!title || !type) return res.status(400).json({ error: "البيانات ناقصة" });
    const result = await query(
      `INSERT INTO lost_items (type, title, description, location, contact_phone, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [type, title, description||null, location||null, contact_phone||null, user?.id||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// ══ أرقام الطوارئ ══
app.get("/api/emergency-numbers", async (_req, res) => {
  res.json((await query(`SELECT * FROM emergency_numbers WHERE is_active=TRUE ORDER BY category, name`)).rows);
});

// ══ المعالم ══
app.get("/api/landmarks", async (_req, res) => {
  res.json((await query(`SELECT * FROM city_landmarks WHERE is_active=TRUE ORDER BY name`)).rows);
});

// ══ الشخصية المكرمة ══
app.get("/api/honored-figure", async (_req, res) => {
  const r = await query(`SELECT * FROM honored_figures WHERE is_active=TRUE AND is_featured=TRUE LIMIT 1`);
  res.json(r.rows[0] || null);
});

// ══ الأخبار ══
app.get("/api/news", async (req, res) => {
  const { limit = "20", offset = "0" } = req.query as Record<string, string>;
  const r = await query(`SELECT * FROM city_news ORDER BY is_pinned DESC, created_at DESC LIMIT $1 OFFSET $2`, [parseInt(limit), parseInt(offset)]);
  res.json(r.rows);
});

// ══ المتخصصون (الدليل الطبي) ══
app.get("/api/specialists", async (_req, res) => {
  res.json((await query(`SELECT * FROM specialists ORDER BY order_index ASC, name ASC`)).rows);
});

app.get("/api/admin/specialists", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || !["admin","moderator"].includes(me.role)) return res.status(403).json({ error: "غير مصرح" });
  res.json((await query(`SELECT * FROM specialists ORDER BY order_index ASC, name ASC`)).rows);
});

app.post("/api/admin/specialists", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || !["admin","moderator"].includes(me.role)) return res.status(403).json({ error: "غير مصرح" });
  const { name, specialty, clinic_name, phone, address, schedule, image_url, is_active, order_index } = req.body as Record<string, unknown>;
  const r = await query(
    `INSERT INTO specialists (name, specialty, clinic_name, phone, address, schedule, image_url, is_active, order_index) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [name, specialty, clinic_name||null, phone||null, address||null, schedule||null, image_url||null, is_active ?? true, order_index ?? 0]
  );
  res.status(201).json(r.rows[0]);
});

app.patch("/api/admin/specialists/:id", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || !["admin","moderator"].includes(me.role)) return res.status(403).json({ error: "غير مصرح" });
  const { name, specialty, clinic_name, phone, address, schedule, image_url, is_active, order_index } = req.body as Record<string, unknown>;
  await query(
    `UPDATE specialists SET name=COALESCE($1,name), specialty=COALESCE($2,specialty), clinic_name=COALESCE($3,clinic_name), phone=COALESCE($4,phone), address=COALESCE($5,address), schedule=COALESCE($6,schedule), image_url=COALESCE($7,image_url), is_active=COALESCE($8,is_active), order_index=COALESCE($9,order_index) WHERE id=$10`,
    [name||null, specialty||null, clinic_name||null, phone||null, address||null, schedule||null, image_url||null, is_active??null, order_index??null, req.params.id]
  );
  res.json({ ok: true });
});

app.delete("/api/admin/specialists/:id", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
  await query(`DELETE FROM specialists WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ══ الإشعارات ══
app.get("/api/notifications", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  const r = await query(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [user.id]);
  res.json(r.rows);
});

app.patch("/api/notifications/:id/read", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "غير مصرح" });
  await query(`UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`, [req.params.id, user.id]);
  res.json({ ok: true });
});

// ══ Push Tokens ══
app.post("/api/push-token", async (req, res) => {
  try {
    const user = await getSessionUser(req);
    const { token, platform = "expo" } = req.body as { token: string; platform?: string };
    if (!token) return res.status(400).json({ error: "Token مطلوب" });
    await query(`INSERT INTO push_tokens (user_id, token, platform) VALUES ($1,$2,$3) ON CONFLICT (token) DO UPDATE SET user_id=$1, platform=$3`, [user?.id||null, token, platform]);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
});

// ══ إدارة المستخدمين ══
app.get("/api/admin/users", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
  const { search, role, limit = "50", offset = "0" } = req.query as Record<string, string>;
  let q = `SELECT id, name, phone, email, role, neighborhood, is_banned, created_at FROM users WHERE 1=1`;
  const params: unknown[] = [];
  if (search) { params.push(`%${search}%`); q += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`; }
  if (role) { params.push(role); q += ` AND role=$${params.length}`; }
  q += ` ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
  params.push(parseInt(limit), parseInt(offset));
  res.json((await query(q, params)).rows);
});

app.patch("/api/admin/users/:id/ban", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
  const { is_banned } = req.body as { is_banned: boolean };
  await query(`UPDATE users SET is_banned=$1 WHERE id=$2`, [is_banned, req.params.id]);
  res.json({ ok: true });
});

app.patch("/api/admin/users/:id/role", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
  await query(`UPDATE users SET role=$1 WHERE id=$2`, [req.body.role, req.params.id]);
  res.json({ ok: true });
});

// ══ إحصائيات المدير ══
app.get("/api/admin/stats", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || !["admin","moderator"].includes(me.role)) return res.status(403).json({ error: "غير مصرح" });
  const [users, posts, jobs, ads, market] = await Promise.all([
    query(`SELECT COUNT(*) FROM users`),
    query(`SELECT COUNT(*) FROM social_posts`),
    query(`SELECT COUNT(*) FROM jobs WHERE status='approved'`),
    query(`SELECT COUNT(*) FROM ads WHERE status='approved'`),
    query(`SELECT COUNT(*) FROM merchant_spaces WHERE status='approved'`),
  ]);
  res.json({
    total_users: parseInt(users.rows[0].count),
    total_posts: parseInt(posts.rows[0].count),
    total_jobs: parseInt(jobs.rows[0].count),
    total_ads: parseInt(ads.rows[0].count),
    total_merchants: parseInt(market.rows[0].count),
  });
});

// ══ إعدادات المدير ══
app.get("/api/admin/settings", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
  const r = await query(`SELECT * FROM admin_settings`);
  const map: Record<string, string> = {};
  for (const row of r.rows) map[row.key] = row.value;
  res.json(map);
});

app.patch("/api/admin/settings", async (req, res) => {
  const me = await getSessionUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
  const settings = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(settings)) {
    await query(`INSERT INTO admin_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2`, [key, value]);
  }
  res.json({ ok: true });
});

// ══ تسجيل المدير ══
app.post("/api/auth/register-admin", async (req, res) => {
  try {
    const { name, email, password, admin_code } = req.body as Record<string, string>;
    if (!name || !email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const settingResult = await query(`SELECT value FROM admin_settings WHERE key='admin_pin'`);
    const pin = settingResult.rows[0]?.value || "4444";
    if (admin_code !== pin) return res.status(403).json({ error: "رمز المشرف غير صحيح" });
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'admin') RETURNING id, name, role`,
      [name, email, hash]
    );
    res.json({ user: result.rows[0] });
  } catch { res.status(400).json({ error: "البريد مسجل مسبقاً" }); }
});

// ══ fallback 404 ══
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// ══════════════════════════════════════════
// Firebase Cloud Function (v2)
// ══════════════════════════════════════════
export const api = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60,
    minInstances: 0,
    concurrency: 80,
    cors: true,
  },
  app
);
