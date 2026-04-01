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
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(30)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128)`);
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

  // ── تحديث جدول الإعلانات — إضافة image_url إن لم تكن موجودة ──
  await query(`ALTER TABLE ads ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await query(`ALTER TABLE ads ADD COLUMN IF NOT EXISTS website_url TEXT`);

  // ── إعدادات الإعلانات الافتراضية ──
  const adsDefaults: [string, string][] = [
    ["ad_price_per_day",    "500"],
    ["ad_contact_phone",    "+249000000000"],
    ["ad_contact_whatsapp", "+249000000000"],
    ["ad_promo_text",       "انضم إلى منصة حصاحيصاوي وأوصل إعلانك لآلاف أبناء المدينة مباشرةً"],
    ["ad_partner_email",    ""],
    ["ad_bank_info",        ""],
  ];
  for (const [k, v] of adsDefaults) {
    await query(
      `INSERT INTO admin_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`,
      [k, v],
    );
  }

  console.log("Hasahisawi DB initialized");
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

router.post("/auth/moderator-login", async (req: Request, res: Response) => {
  try {
    const { phone_or_email, password } = req.body;
    if (!phone_or_email || !password) return res.status(400).json({ error: "البيانات ناقصة" });
    const result = await query(
      `SELECT * FROM users WHERE (phone=$1 OR email=$1) AND role='moderator'`,
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
    const targetId = parseInt(req.params.id as string);
    if (targetId === currentUser.id) return res.status(400).json({ error: "لا يمكنك تغيير دورك بنفسك" });
    await query(`UPDATE users SET role=$1 WHERE id=$2`, [role, targetId]);
    return res.json({ success: true });
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
      `SELECT id, name, role FROM users WHERE id != $1 AND role != 'guest' ORDER BY name LIMIT 100`,
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
      SELECT c.*, u1.name AS user1_name, u2.name AS user2_name
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
    const { firebase_uid, name, email, role } = req.body as {
      firebase_uid: string;
      name?: string;
      email?: string;
      role?: string;
    };
    if (!firebase_uid) return res.status(400).json({ error: "firebase_uid مطلوب" });

    const safeRole = ["user", "admin", "moderator"].includes(role ?? "") ? role : "user";

    // محاولة البحث عن المستخدم بـ firebase_uid أولاً
    let userRow = (await query(
      `SELECT * FROM users WHERE firebase_uid = $1`,
      [firebase_uid]
    )).rows[0];

    if (!userRow) {
      // البحث بالبريد الإلكتروني لتجنب التكرار
      if (email) {
        userRow = (await query(
          `SELECT * FROM users WHERE email = $1`,
          [email]
        )).rows[0];
        if (userRow) {
          await query(
            `UPDATE users SET firebase_uid=$1, role=$2 WHERE id=$3`,
            [firebase_uid, safeRole, userRow.id]
          );
          userRow = { ...userRow, firebase_uid, role: safeRole };
        }
      }

      if (!userRow) {
        // إنشاء مستخدم جديد بدون كلمة مرور (Firebase يتولى المصادقة)
        const hash = await bcrypt.hash(randomBytes(16).toString("hex"), 6);
        userRow = (await query(
          `INSERT INTO users (firebase_uid, name, email, password_hash, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [firebase_uid, name || "مستخدم", email || null, hash, safeRole]
        )).rows[0];
      }
    } else {
      // تحديث الدور إن تغيّر
      if (safeRole && userRow.role !== safeRole) {
        await query(`UPDATE users SET role=$1 WHERE id=$2`, [safeRole, userRow.id]);
        userRow = { ...userRow, role: safeRole };
      }
    }

    // إصدار session token جديد
    const sessionToken = randomBytes(32).toString("hex");
    await query(
      `INSERT INTO user_sessions (user_id, token) VALUES ($1, $2)`,
      [userRow.id, sessionToken]
    );

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

router.put("/admin/neighborhoods/:key", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "مديرون فقط" });
    const { key } = req.params;
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
    const { key } = req.params;
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
    const enabled = rows[0]?.value === "true";
    return res.json({ enabled });
  } catch {
    return res.json({ enabled: false });
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

    if (settings["ai_enabled"] !== "true") {
      return res.status(503).json({ error: "خدمة الذكاء الاصطناعي غير مفعّلة حالياً" });
    }

    const apiKey = settings["ai_api_key"];
    if (!apiKey) return res.status(503).json({ error: "لم يتم تكوين مفتاح API" });

    const systemPrompt = settings["ai_system_prompt"] ||
      "أنت مساعد ذكي لتطبيق حصاحيصاوي، مخصص لخدمة أهالي مدينة الحصاحيصا في السودان. أجب باللغة العربية بأسلوب ودود ومفيد. تخصصك في: المعلومات المحلية، الخدمات المتاحة في التطبيق، والإرشاد العام.";

    const contents = [
      ...(history || []),
      { role: "user", parts: [{ text: message }] },
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error("Gemini error:", err);
      return res.status(502).json({ error: "خطأ في الاتصال بخدمة الذكاء الاصطناعي" });
    }

    const data = await geminiRes.json() as any;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "لم أتمكن من الإجابة، يرجى المحاولة مجدداً.";
    return res.json({ reply });
  } catch (err) {
    console.error("AI chat error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
