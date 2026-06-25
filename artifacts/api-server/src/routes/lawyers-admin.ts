import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import { logger } from "../lib/logger";

const router = Router();
const DEFAULT_ADMIN_PIN = process.env.DEFAULT_ADMIN_PIN ?? "4444";
const _dbUrl = process.env.DATABASE_URL ?? "";
const _dbEnabled = _dbUrl.length > 0 && !_dbUrl.includes(".invalid") && !_dbUrl.includes("placeholder") && !_dbUrl.includes("nodb");

const pool: Pool | null = _dbEnabled
  ? new Pool({
      connectionString: _dbUrl,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      max: 10,
      allowExitOnIdle: false,
      ssl: _dbUrl.includes("sslmode=require") || _dbUrl.includes("ssl=true") ? { rejectUnauthorized: false } : false,
    })
  : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const pin = req.headers["x-admin-pin"];
  if (typeof pin === "string" && pin === DEFAULT_ADMIN_PIN) return true;
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  try {
    const { rows } = await query(
      `SELECT u.role FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at > NOW() LIMIT 1`,
      [token],
    );
    return ["admin", "moderator"].includes(String(rows[0]?.role || ""));
  } catch { return false; }
}

let ensured: Promise<void> | null = null;
async function ensureLawyersDb(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS rated_entities (
        id SERIAL PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        name VARCHAR(200) NOT NULL,
        subtitle VARCHAR(300),
        category VARCHAR(100),
        phone VARCHAR(50),
        district VARCHAR(100),
        notes TEXT,
        is_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS lawyers (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        title VARCHAR(120) NOT NULL DEFAULT 'محامي',
        specialties TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        phone VARCHAR(30) NOT NULL DEFAULT '',
        whatsapp VARCHAR(30) NOT NULL DEFAULT '',
        email VARCHAR(150) NOT NULL DEFAULT '',
        office_addr VARCHAR(250) NOT NULL DEFAULT '',
        district VARCHAR(100) NOT NULL DEFAULT '',
        bar_number VARCHAR(50) NOT NULL DEFAULT '',
        experience_y INTEGER NOT NULL DEFAULT 0,
        languages VARCHAR(150) NOT NULL DEFAULT 'العربية',
        consult_fee VARCHAR(80) NOT NULL DEFAULT '',
        photo_url TEXT NOT NULL DEFAULT '',
        is_featured BOOLEAN NOT NULL DEFAULT FALSE,
        is_verified BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        entity_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30) NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS email VARCHAR(150) NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS office_addr VARCHAR(250) NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS consult_fee VARCHAR(80) NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT ''`);
    await query(`ALTER TABLE lawyers ADD COLUMN IF NOT EXISTS entity_id INTEGER`);

    await query(`
      CREATE TABLE IF NOT EXISTS lawyer_subscription_plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(40) NOT NULL UNIQUE,
        name_ar VARCHAR(100) NOT NULL,
        price_sdg INTEGER NOT NULL DEFAULT 0,
        price_label VARCHAR(100) NOT NULL DEFAULT 'مجاني',
        monthly_contacts INTEGER NOT NULL DEFAULT 5,
        has_unlimited_contacts BOOLEAN NOT NULL DEFAULT FALSE,
        has_ads BOOLEAN NOT NULL DEFAULT FALSE,
        has_featured BOOLEAN NOT NULL DEFAULT FALSE,
        has_verified_badge BOOLEAN NOT NULL DEFAULT TRUE,
        has_priority BOOLEAN NOT NULL DEFAULT FALSE,
        commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        color VARCHAR(30) NOT NULL DEFAULT '#8B5CF6',
        icon VARCHAR(10) NOT NULL DEFAULT '⚖️',
        sort_order INTEGER NOT NULL DEFAULT 99,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS lawyer_subscriptions (
        id SERIAL PRIMARY KEY,
        lawyer_id INTEGER NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
        plan_id INTEGER NOT NULL REFERENCES lawyer_subscription_plans(id),
        commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        payment_ref VARCHAR(120) NOT NULL DEFAULT '',
        admin_note TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_lawyer_subscriptions_active ON lawyer_subscriptions(lawyer_id, is_active)`);

    await query(`
      CREATE TABLE IF NOT EXISTS lawyer_applications (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        title VARCHAR(120) NOT NULL DEFAULT 'محامي',
        phone VARCHAR(30) NOT NULL,
        whatsapp VARCHAR(30) NOT NULL DEFAULT '',
        email VARCHAR(150) NOT NULL DEFAULT '',
        bar_number VARCHAR(50) NOT NULL,
        experience_y INTEGER NOT NULL DEFAULT 0,
        specialties TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        office_addr VARCHAR(250) NOT NULL DEFAULT '',
        district VARCHAR(100) NOT NULL DEFAULT '',
        languages VARCHAR(150) NOT NULL DEFAULT 'العربية',
        consult_fee VARCHAR(80) NOT NULL DEFAULT '',
        bar_card_url TEXT NOT NULL DEFAULT '',
        photo_url TEXT NOT NULL DEFAULT '',
        bar_card_upload_status VARCHAR(40) NOT NULL DEFAULT 'pending_manual_review',
        bar_card_upload_note TEXT NOT NULL DEFAULT '',
        agree_terms BOOLEAN NOT NULL DEFAULT TRUE,
        device_id VARCHAR(160),
        user_id INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        admin_note TEXT NOT NULL DEFAULT '',
        reviewed_at TIMESTAMPTZ,
        lawyer_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE lawyer_applications ADD COLUMN IF NOT EXISTS bar_card_upload_status VARCHAR(40) NOT NULL DEFAULT 'pending_manual_review'`);
    await query(`ALTER TABLE lawyer_applications ADD COLUMN IF NOT EXISTS bar_card_upload_note TEXT NOT NULL DEFAULT ''`);

    await query(`
      CREATE TABLE IF NOT EXISTS lawyer_contracts (
        id SERIAL PRIMARY KEY,
        lawyer_id INTEGER REFERENCES lawyers(id) ON DELETE SET NULL,
        service_id INTEGER,
        user_id INTEGER,
        device_id VARCHAR(160),
        client_name VARCHAR(150) NOT NULL DEFAULT '',
        client_phone VARCHAR(30) NOT NULL DEFAULT '',
        service_title VARCHAR(200) NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        preferred_date DATE,
        contract_no VARCHAR(80) NOT NULL DEFAULT '',
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS lawyer_subscription_history (
        id SERIAL PRIMARY KEY,
        lawyer_id INTEGER NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
        plan_name VARCHAR(40) NOT NULL DEFAULT 'free',
        plan_name_ar VARCHAR(100) NOT NULL DEFAULT 'مجاني',
        commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        payment_ref VARCHAR(120) NOT NULL DEFAULT '',
        admin_note TEXT NOT NULL DEFAULT '',
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const plans = [
      ['free','مجاني',0,'مجاني',5,false,false,false,true,false,0,'#64748B','⚖️',1],
      ['basic','أساسي',15000,'15,000 ج.س / شهر',999,true,false,false,true,true,0,'#0EA5E9','✓',2],
      ['professional','محترف',30000,'30,000 ج.س / شهر',999,true,true,true,true,true,5,'#8B5CF6','⭐',3],
      ['premium','بريميوم',50000,'50,000 ج.س / شهر',999,true,true,true,true,true,8,'#F59E0B','👑',4],
    ];
    for (const p of plans) {
      await query(
        `INSERT INTO lawyer_subscription_plans
         (name,name_ar,price_sdg,price_label,monthly_contacts,has_unlimited_contacts,has_ads,has_featured,has_verified_badge,has_priority,commission_pct,color,icon,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (name) DO UPDATE SET
           name_ar=EXCLUDED.name_ar, price_sdg=EXCLUDED.price_sdg, price_label=EXCLUDED.price_label,
           monthly_contacts=EXCLUDED.monthly_contacts, has_unlimited_contacts=EXCLUDED.has_unlimited_contacts,
           has_ads=EXCLUDED.has_ads, has_featured=EXCLUDED.has_featured, has_verified_badge=EXCLUDED.has_verified_badge,
           has_priority=EXCLUDED.has_priority, commission_pct=EXCLUDED.commission_pct, color=EXCLUDED.color,
           icon=EXCLUDED.icon, sort_order=EXCLUDED.sort_order, is_active=TRUE`, p);
    }

    const { rows: countRows } = await query(`SELECT COUNT(*)::int AS cnt FROM lawyers`);
    if (Number(countRows[0]?.cnt || 0) < 3) {
      const seed = [
        ['أ. محمد الطيب أحمد','محامٍ ومستشار قانوني','عقارات، عقود، شركات','خبرة في صياغة العقود وتسوية النزاعات التجارية والعقارية داخل الحصاحيصا.','+249912345701','+249912345701','lawyer1@hasahisawi.app','السوق الكبير — قرب المحكمة','وسط المدينة','LAW-001',12,'العربية','استشارة أولى مجانية','',true,true],
        ['أ. سلمى عبد الله عثمان','محامية أحوال شخصية','أحوال شخصية، ميراث، نفقة، حضانة','متخصصة في قضايا الأسرة والمواريث ومتابعة الإجراءات بصورة مهنية وسرية.','+249912345702','+249912345702','lawyer2@hasahisawi.app','حي المزاد — شارع النيابة','حي المزاد','LAW-002',9,'العربية','حسب نوع القضية','',true,true],
        ['أ. خالد الأمين يوسف','محامٍ جنائي','جنائية، عمل، تحكيم','دعم قانوني في القضايا الجنائية وقضايا العمل والتحكيم والتمثيل أمام الجهات المختصة.','+249912345703','+249912345703','lawyer3@hasahisawi.app','غرب السوق — مكتب الخدمات القانونية','غرب الحصاحيصا','LAW-003',15,'العربية','تحدد بعد المعاينة','',false,true],
      ];
      for (const s of seed) {
        const ent = await query(
          `INSERT INTO rated_entities (type,name,subtitle,category,phone,district,notes,is_verified)
           VALUES ('lawyer',$1,$2,'قانون',$3,$4,$5,TRUE) RETURNING id`,
          [s[0], s[1], s[4], s[8], s[3]],
        );
        const lw = await query(
          `INSERT INTO lawyers
           (full_name,title,specialties,bio,phone,whatsapp,email,office_addr,district,bar_number,experience_y,languages,consult_fee,photo_url,is_featured,is_verified,is_active,entity_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE,$17) RETURNING id`,
          [...s, ent.rows[0].id],
        );
        const free = await query(`SELECT id, commission_pct FROM lawyer_subscription_plans WHERE name='free' LIMIT 1`);
        await query(
          `INSERT INTO lawyer_subscriptions (lawyer_id, plan_id, commission_pct, admin_note)
           VALUES ($1,$2,$3,'اشتراك افتراضي للمحامين الثلاثة الأساسيين')`,
          [lw.rows[0].id, free.rows[0].id, free.rows[0].commission_pct],
        );
      }
    }
  })();
  return ensured;
}

function dbError(res: Response, err: unknown) {
  logger.error({ err }, "lawyers-admin route error");
  return res.status(500).json({ error: "Server error" });
}

router.use(async (_req, _res, next) => { try { await ensureLawyersDb(); } catch (e) { logger.error({ err: e }, "ensure lawyers db failed"); } next(); });

router.get("/lawyers/:id/subscription", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.*, p.name, p.name_ar, p.color, p.icon, p.price_label,
              p.has_unlimited_contacts, p.has_ads, p.has_featured, p.has_verified_badge,
              p.has_priority, p.monthly_contacts
       FROM lawyer_subscriptions s JOIN lawyer_subscription_plans p ON p.id=s.plan_id
       WHERE s.lawyer_id=$1 AND s.is_active=TRUE ORDER BY s.started_at DESC LIMIT 1`,
      [Number(req.params.id)],
    );
    return res.json(rows[0] || null);
  } catch (e) { return dbError(res, e); }
});

router.get("/lawyers", async (req, res) => {
  try {
    const specialty = String(req.query.specialty || "").trim();
    const search = String(req.query.search || "").trim();
    const params: unknown[] = [];
    let where = "l.is_active=TRUE";
    if (specialty && specialty !== "الكل") { params.push(`%${specialty}%`); where += ` AND l.specialties ILIKE $${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (l.full_name ILIKE $${params.length} OR l.specialties ILIKE $${params.length} OR l.district ILIKE $${params.length})`; }
    const { rows } = await query(
      `SELECT l.*, 0::float AS avg_rating, 0::int AS review_count,
              p.name AS plan_name, p.name_ar AS plan_name_ar, p.color AS plan_color, p.icon AS plan_icon,
              p.has_priority, p.has_unlimited_contacts, p.monthly_contacts AS plan_monthly_contacts
       FROM lawyers l
       LEFT JOIN lawyer_subscriptions s ON s.lawyer_id=l.id AND s.is_active=TRUE
       LEFT JOIN lawyer_subscription_plans p ON p.id=s.plan_id
       WHERE ${where}
       ORDER BY COALESCE(p.sort_order,99), l.is_featured DESC, l.experience_y DESC, l.id DESC`,
      params,
    );
    return res.json(rows);
  } catch (e) { return dbError(res, e); }
});

router.get("/lawyers/:id", async (req, res) => {
  try {
    const { rows } = await query(`SELECT l.*, 0::float AS avg_rating, 0::int AS review_count FROM lawyers l WHERE l.id=$1`, [Number(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    return res.json({ ...rows[0], services: [], reviews: [] });
  } catch (e) { return dbError(res, e); }
});

router.get("/subscription-plans", async (_req, res) => {
  try { const { rows } = await query(`SELECT * FROM lawyer_subscription_plans WHERE is_active=TRUE ORDER BY sort_order`); return res.json(rows); }
  catch (e) { return dbError(res, e); }
});

router.post("/lawyer-applications", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.full_name || !b.phone || !b.bar_number || !b.specialties) return res.status(400).json({ error: "الاسم والهاتف ورقم النقابة والتخصصات مطلوبة" });
    if (!b.agree_terms) return res.status(400).json({ error: "يجب الموافقة على شروط التعاقد" });
    const barUrl = String(b.bar_card_url || "").trim();
    const uploadStatus = barUrl ? "uploaded" : "pending_manual_review";
    const { rows } = await query(
      `INSERT INTO lawyer_applications
       (full_name,title,phone,whatsapp,email,bar_number,experience_y,specialties,bio,office_addr,district,languages,consult_fee,bar_card_url,photo_url,bar_card_upload_status,bar_card_upload_note,agree_terms,device_id,user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,TRUE,$18,$19) RETURNING id, created_at`,
      [
        String(b.full_name).slice(0,150), String(b.title || "محامي").slice(0,120), String(b.phone).slice(0,25), String(b.whatsapp || "").slice(0,25),
        String(b.email || "").slice(0,150), String(b.bar_number).slice(0,50), Number(b.experience_y) || 0, String(b.specialties).slice(0,500),
        String(b.bio || "").slice(0,2000), String(b.office_addr || "").slice(0,250), String(b.district || "").slice(0,100), String(b.languages || "العربية").slice(0,150),
        String(b.consult_fee || "").slice(0,80), barUrl.slice(0,1000), String(b.photo_url || "").slice(0,1000), uploadStatus,
        uploadStatus === "pending_manual_review" ? "لم يتم رفع صورة الهوية/كارنيه النقابة؛ الطلب مكتمل ويراجَع يدوياً من الإدارة." : "",
        b.device_id || null, null,
      ],
    );
    return res.json({ ok: true, application_id: rows[0].id, created_at: rows[0].created_at, identity_upload_status: uploadStatus });
  } catch (e) { return dbError(res, e); }
});

router.get("/lawyer-applications/mine", async (req, res) => {
  try {
    const deviceId = String(req.query.device_id || "").trim();
    if (!deviceId) return res.json([]);
    const { rows } = await query(`SELECT id, full_name, status, admin_note, lawyer_id, created_at, reviewed_at FROM lawyer_applications WHERE device_id=$1 ORDER BY created_at DESC LIMIT 10`, [deviceId]);
    return res.json(rows);
  } catch (e) { return dbError(res, e); }
});

router.get("/admin/lawyers", async (req, res) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT l.*, COALESCE((SELECT COUNT(*) FROM lawyer_contracts c WHERE c.lawyer_id=l.id),0)::int AS contracts_count,
              p.name AS plan_name, p.name_ar AS plan_name_ar, p.color AS plan_color, p.icon AS plan_icon,
              s.commission_pct AS sub_commission, s.expires_at AS sub_expires, s.started_at AS sub_started
       FROM lawyers l
       LEFT JOIN lawyer_subscriptions s ON s.lawyer_id=l.id AND s.is_active=TRUE
       LEFT JOIN lawyer_subscription_plans p ON p.id=s.plan_id
       ORDER BY l.created_at DESC`,
    );
    return res.json(rows);
  } catch (e) { return dbError(res, e); }
});

router.patch("/admin/lawyers/:id", async (req, res) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE lawyers SET
       full_name=COALESCE($1,full_name), title=COALESCE($2,title), specialties=COALESCE($3,specialties), phone=COALESCE($4,phone),
       whatsapp=COALESCE($5,whatsapp), email=COALESCE($6,email), office_addr=COALESCE($7,office_addr), district=COALESCE($8,district),
       consult_fee=COALESCE($9,consult_fee), experience_y=COALESCE($10,experience_y), is_featured=COALESCE($11,is_featured),
       is_verified=COALESCE($12,is_verified), is_active=COALESCE($13,is_active)
       WHERE id=$14 RETURNING *`,
      [b.full_name,b.title,b.specialties,b.phone,b.whatsapp,b.email,b.office_addr,b.district,b.consult_fee,b.experience_y,b.is_featured,b.is_verified,b.is_active,Number(req.params.id)],
    );
    if (!rows[0]) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (e) { return dbError(res, e); }
});

router.delete("/admin/lawyers/:id", async (req, res) => {
  try { if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" }); await query(`UPDATE lawyers SET is_active=FALSE WHERE id=$1`, [Number(req.params.id)]); return res.json({ ok: true }); }
  catch (e) { return dbError(res, e); }
});

router.get("/admin/lawyer-applications", async (req, res) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const status = String(req.query.status || "").trim();
    const params: unknown[] = [];
    let where = "1=1";
    if (status) { params.push(status); where += ` AND status=$${params.length}`; }
    const { rows } = await query(`SELECT * FROM lawyer_applications WHERE ${where} ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC`, params);
    return res.json(rows);
  } catch (e) { return dbError(res, e); }
});

router.post("/admin/lawyer-applications/:id/approve", async (req, res) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const id = Number(req.params.id);
    const { rows } = await query(`SELECT * FROM lawyer_applications WHERE id=$1`, [id]);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: "Not found" });
    const ent = await query(`INSERT INTO rated_entities (type,name,subtitle,category,phone,district,notes,is_verified) VALUES ('lawyer',$1,$2,'قانون',$3,$4,$5,TRUE) RETURNING id`, [a.full_name,a.title,a.phone,a.district,a.bio]);
    const lw = await query(
      `INSERT INTO lawyers (full_name,title,specialties,bio,phone,whatsapp,email,office_addr,district,bar_number,experience_y,languages,consult_fee,photo_url,is_featured,is_verified,is_active,entity_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE,TRUE,$16) RETURNING id`,
      [a.full_name,a.title,a.specialties,a.bio,a.phone,a.whatsapp,a.email,a.office_addr,a.district,a.bar_number,a.experience_y,a.languages,a.consult_fee,a.photo_url,!!req.body?.is_featured,ent.rows[0].id],
    );
    const plan = await query(`SELECT id, commission_pct FROM lawyer_subscription_plans WHERE name='free' LIMIT 1`);
    await query(`INSERT INTO lawyer_subscriptions (lawyer_id, plan_id, commission_pct, admin_note) VALUES ($1,$2,$3,'اشتراك مجاني تلقائي عند الاعتماد')`, [lw.rows[0].id, plan.rows[0].id, plan.rows[0].commission_pct]);
    await query(`UPDATE lawyer_applications SET status='approved', admin_note=$2, reviewed_at=NOW(), lawyer_id=$3 WHERE id=$1`, [id, String(req.body?.admin_note || "").slice(0,500), lw.rows[0].id]);
    return res.json({ ok: true, lawyer_id: lw.rows[0].id });
  } catch (e) { return dbError(res, e); }
});

router.post("/admin/lawyer-applications/:id/reject", async (req, res) => {
  try { if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" }); await query(`UPDATE lawyer_applications SET status='rejected', admin_note=$2, reviewed_at=NOW() WHERE id=$1`, [Number(req.params.id), String(req.body?.admin_note || "").slice(0,500)]); return res.json({ ok: true }); }
  catch (e) { return dbError(res, e); }
});

router.get("/admin/subscriptions", async (req, res) => {
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
       ORDER BY COALESCE(p.sort_order,99), l.id DESC`,
    );
    return res.json(rows);
  } catch (e) { return dbError(res, e); }
});

router.get("/admin/subscription-stats", async (req, res) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(
      `SELECT p.name, p.name_ar, p.icon, p.price_sdg, p.color,
              COUNT(s.id)::int AS subscribers,
              COALESCE(SUM(p.price_sdg),0)::int AS monthly_revenue,
              COALESCE(AVG(s.commission_pct),0)::float AS avg_commission
       FROM lawyer_subscription_plans p LEFT JOIN lawyer_subscriptions s ON s.plan_id=p.id AND s.is_active=TRUE
       GROUP BY p.id ORDER BY p.sort_order`,
    );
    const totalPaid = rows.reduce((n: number, r: any) => n + (r.name === 'free' ? 0 : Number(r.subscribers || 0)), 0);
    const free = rows.find((r: any) => r.name === 'free')?.subscribers || 0;
    return res.json({ plans: rows, total_paid: totalPaid, free_lawyers: Number(free) });
  } catch (e) { return dbError(res, e); }
});

router.get("/admin/subscriptions/expiring", async (req, res) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const days = Math.max(1, Number(req.query.days || 30));
    const { rows } = await query(
      `SELECT l.id AS lawyer_id, l.full_name, l.phone, l.district, p.name AS plan_name, p.name_ar, p.color, p.icon, s.expires_at, s.commission_pct,
              CEIL(EXTRACT(EPOCH FROM (s.expires_at - NOW()))/86400)::int AS days_left
       FROM lawyer_subscriptions s JOIN lawyers l ON l.id=s.lawyer_id JOIN lawyer_subscription_plans p ON p.id=s.plan_id
       WHERE s.is_active=TRUE AND s.expires_at IS NOT NULL AND s.expires_at <= NOW() + ($1 || ' days')::interval
       ORDER BY s.expires_at ASC`, [days]);
    return res.json(rows);
  } catch (e) { return dbError(res, e); }
});

router.get("/admin/subscription-history/:lawyerId", async (req, res) => {
  try { if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" }); const { rows } = await query(`SELECT h.*, l.full_name FROM lawyer_subscription_history h LEFT JOIN lawyers l ON l.id=h.lawyer_id WHERE h.lawyer_id=$1 ORDER BY h.changed_at DESC`, [Number(req.params.lawyerId)]); return res.json(rows); }
  catch (e) { return dbError(res, e); }
});

router.get("/admin/subscription-plans", async (req, res) => {
  try { if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" }); const { rows } = await query(`SELECT * FROM lawyer_subscription_plans ORDER BY sort_order`); return res.json(rows); }
  catch (e) { return dbError(res, e); }
});

router.put("/admin/subscription-plans/:id", async (req, res) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE lawyer_subscription_plans SET
       name_ar=COALESCE($1,name_ar), price_sdg=COALESCE($2,price_sdg), price_label=COALESCE($3,price_label), monthly_contacts=COALESCE($4,monthly_contacts),
       has_unlimited_contacts=COALESCE($5,has_unlimited_contacts), has_ads=COALESCE($6,has_ads), has_featured=COALESCE($7,has_featured),
       has_verified_badge=COALESCE($8,has_verified_badge), has_priority=COALESCE($9,has_priority), commission_pct=COALESCE($10,commission_pct),
       color=COALESCE($11,color), icon=COALESCE($12,icon), is_active=COALESCE($13,is_active)
       WHERE id=$14 RETURNING *`,
      [b.name_ar,b.price_sdg,b.price_label,b.monthly_contacts,b.has_unlimited_contacts,b.has_ads,b.has_featured,b.has_verified_badge,b.has_priority,b.commission_pct,b.color,b.icon,b.is_active,Number(req.params.id)],
    );
    return res.json(rows[0]);
  } catch (e) { return dbError(res, e); }
});

router.put("/admin/lawyers/:id/subscription", async (req, res) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const lawyerId = Number(req.params.id);
    const { plan_name, commission_pct, expires_at, payment_ref, admin_note } = req.body || {};
    const plan = await query(`SELECT * FROM lawyer_subscription_plans WHERE name=$1 LIMIT 1`, [plan_name || 'free']);
    if (!plan.rows[0]) return res.status(404).json({ error: "الخطة غير موجودة" });
    await query(`UPDATE lawyer_subscriptions SET is_active=FALSE WHERE lawyer_id=$1 AND is_active=TRUE`, [lawyerId]);
    const { rows } = await query(
      `INSERT INTO lawyer_subscriptions (lawyer_id, plan_id, commission_pct, expires_at, payment_ref, admin_note)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [lawyerId, plan.rows[0].id, Number(commission_pct ?? plan.rows[0].commission_pct ?? 0), expires_at || null, payment_ref || '', admin_note || ''],
    );
    await query(
      `INSERT INTO lawyer_subscription_history (lawyer_id, plan_name, plan_name_ar, commission_pct, expires_at, payment_ref, admin_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [lawyerId, plan.rows[0].name, plan.rows[0].name_ar, Number(commission_pct ?? plan.rows[0].commission_pct ?? 0), expires_at || null, payment_ref || '', admin_note || ''],
    );
    return res.json(rows[0]);
  } catch (e) { return dbError(res, e); }
});

export { ensureLawyersDb };
export default router;
