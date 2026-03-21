import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const router = Router();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

const DEFAULT_ADMIN_PIN = "4444";

function maskNationalId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 4) return "****";
  return "*".repeat(id.length - 4) + id.slice(-4);
}

function safeUserPayload(user: Record<string, unknown>) {
  const { password_hash, national_id, ...rest } = user;
  return { ...rest, national_id_masked: maskNationalId(national_id as string) };
}

export async function initHasahisawiDb() {
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
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(30) UNIQUE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100)`);
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

  console.log("Hasahisawi DB initialized");
}

async function getSessionUser(req: Request): Promise<{ id: number; name: string; role: string } | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const result = await query(`
    SELECT u.id, u.name, u.role FROM users u
    JOIN user_sessions s ON s.user_id = u.id
    WHERE s.token = $1 AND s.expires_at > NOW()
  `, [token]);
  return result.rows[0] || null;
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const user = await getSessionUser(req);
  return user?.role === "admin";
}

router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const { name, national_id, phone, email, password, birth_date, neighborhood } = req.body;
    if (!name || !password) return res.status(400).json({ error: "الاسم وكلمة المرور مطلوبان" });
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, national_id, phone, email, password_hash, birth_date, neighborhood)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, national_id || null, phone || null, email || null, hash,
       birth_date || null, neighborhood || null]
    );
    const user = result.rows[0];
    const token = randomBytes(32).toString("hex");
    await query(`INSERT INTO user_sessions (user_id, token) VALUES ($1,$2)`, [user.id, token]);
    return res.json({ user: safeUserPayload(user), token });
  } catch (err: any) {
    if (err.code === "23505") return res.status(400).json({ error: "المستخدم موجود بالفعل" });
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

router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { phone_or_email, password } = req.body;
    if (!phone_or_email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const result = await query(
      `SELECT * FROM users WHERE phone=$1 OR email=$1`,
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
    const result = await query(`SELECT * FROM users WHERE email=$1 AND role='admin'`, [email]);
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
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "غير مصرح" });
    const permsResult = await query(`SELECT section FROM moderator_permissions WHERE user_id=$1`, [user.id]);
    return res.json({ ...user, permissions: permsResult.rows.map((r: any) => r.section) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/validate-pin", async (req: Request, res: Response) => {
  try {
    const { pin } = req.body;
    const result = await query(`SELECT value FROM admin_settings WHERE key='admin_pin'`);
    const storedPin = result.rows[0]?.value || DEFAULT_ADMIN_PIN;
    return res.json({ valid: pin === storedPin });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/change-pin", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { new_pin } = req.body;
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

router.get("/admin/users", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const result = await query(`SELECT id, name, national_id, phone, email, role, created_at FROM users ORDER BY created_at DESC`);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/admin/users/:id", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/users/:id/role", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { role } = req.body;
    const result = await query(`UPDATE users SET role=$1 WHERE id=$2 RETURNING id, name, role`, [role, req.params.id]);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin/users/:id/permissions", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const result = await query(`SELECT section FROM moderator_permissions WHERE user_id=$1`, [req.params.id]);
    return res.json(result.rows.map((r: any) => r.section));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/admin/users/:id/permissions", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
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

router.get("/posts", async (req: Request, res: Response) => {
  try {
    const { category, device_id } = req.query as { category?: string; device_id?: string };
    const params: unknown[] = [];
    let paramIndex = 1;

    let whereClause = "";
    if (category) {
      whereClause = ` WHERE p.category=$${paramIndex++}`;
      params.push(category);
    }

    const deviceParam = `$${paramIndex++}`;
    params.push(device_id || "");

    const sql = `
      SELECT
        p.*,
        COUNT(DISTINCT l.id)::int AS likes_count,
        COUNT(DISTINCT c.id)::int AS comments_count,
        CASE WHEN EXISTS(
          SELECT 1 FROM social_likes dl WHERE dl.post_id=p.id AND dl.device_id=${deviceParam}
        ) THEN true ELSE false END AS liked_by_me
      FROM social_posts p
      LEFT JOIN social_likes l ON l.post_id=p.id
      LEFT JOIN social_comments c ON c.post_id=p.id
      ${whereClause}
      GROUP BY p.id
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
    const { content, category, author_name } = req.body;
    if (!content) return res.status(400).json({ error: "المحتوى مطلوب" });
    const result = await query(
      `INSERT INTO social_posts (author_name, content, category) VALUES ($1,$2,$3) RETURNING *`,
      [author_name || user?.name || "مجهول", content, category || "عام"]
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
             national_id, created_at
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
    const targetId = parseInt(req.params.id);
    if (targetId === currentUser.id) return res.status(400).json({ error: "لا يمكنك تغيير دورك بنفسك" });
    await query(`UPDATE users SET role=$1 WHERE id=$2`, [role, targetId]);
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
