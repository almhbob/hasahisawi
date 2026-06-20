import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import { logger } from "../lib/logger";

const router = Router();
const dbUrl = process.env.DATABASE_URL ?? "";
const pool = dbUrl && !dbUrl.includes(".invalid") && !dbUrl.includes("placeholder") && !dbUrl.includes("nodb")
  ? new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, max: 10, allowExitOnIdle: false, ssl: dbUrl.includes("sslmode=require") || dbUrl.includes("ssl=true") ? { rejectUnauthorized: false } : false })
  : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const c = await pool.connect();
  try { return await c.query(sql, params); } finally { c.release(); }
}

async function userFromReq(req: Request) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : String(req.headers["x-user-token"] || "");
  if (!token) return null;
  const r = await query(`SELECT u.id,u.name,u.role,u.phone,u.email FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>NOW() LIMIT 1`, [token]);
  return r.rows[0] ?? null;
}

async function requireAdmin(req: Request, res: Response) {
  const u = await userFromReq(req).catch(() => null);
  if (!u || !["admin", "moderator", "transport_supervisor"].includes(u.role)) {
    res.status(403).json({ error: "غير مصرح" });
    return null;
  }
  return u;
}

export async function initJoinRequestsDb() {
  if (!pool) { logger.warn("initJoinRequestsDb skipped — no DATABASE_URL"); return; }
  await query(`CREATE TABLE IF NOT EXISTS join_requests(
    id BIGSERIAL PRIMARY KEY,
    request_type VARCHAR(60) NOT NULL,
    source_endpoint VARCHAR(140),
    applicant_name VARCHAR(180) NOT NULL,
    entity_name VARCHAR(220),
    phone VARCHAR(60) NOT NULL,
    email VARCHAR(220),
    status VARCHAR(40) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    duplicate_of BIGINT REFERENCES join_requests(id) ON DELETE SET NULL,
    review_note TEXT,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_join_requests_status ON join_requests(status,request_type,created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_join_requests_phone_type ON join_requests(phone,request_type,created_at DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS admin_attention_events(
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    title VARCHAR(220) NOT NULL,
    body TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_admin_attention_unread ON admin_attention_events(is_read,created_at DESC)`);
}

function normalizePhone(phone: unknown) {
  return String(phone || "").replace(/[^0-9+]/g, "").trim();
}
function pickBody(req: Request, typeFallback: string) {
  const b = req.body || {};
  const request_type = String(b.request_type || b.type || b.service_type || typeFallback || "general").slice(0, 60);
  const applicant_name = String(b.applicant_name || b.owner_name || b.contact_name || b.name || b.driver_name || "").trim();
  const entity_name = String(b.entity_name || b.shop_name || b.agency_name || b.business_name || b.service_name || b.name || "").trim();
  const phone = normalizePhone(b.phone || b.whatsapp || b.mobile || b.contact_phone);
  const email = b.email ? String(b.email).trim() : null;
  return { request_type, applicant_name, entity_name, phone, email, payload: b };
}
async function createJoin(req: Request, res: Response, typeFallback: string) {
  try {
    await initJoinRequestsDb();
    const data = pickBody(req, typeFallback);
    if (!data.applicant_name || !data.phone) return res.status(400).json({ error: "الاسم ورقم الهاتف مطلوبان" });
    const existing = await query(
      `SELECT id FROM join_requests WHERE request_type=$1 AND phone=$2 AND status='pending' ORDER BY created_at DESC LIMIT 1`,
      [data.request_type, data.phone]
    );
    const duplicateOf = existing.rows[0]?.id ?? null;
    const r = await query(
      `INSERT INTO join_requests(request_type,source_endpoint,applicant_name,entity_name,phone,email,status,payload,duplicate_of)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [data.request_type, req.path, data.applicant_name, data.entity_name || null, data.phone, data.email, duplicateOf ? "duplicate" : "pending", JSON.stringify(data.payload), duplicateOf]
    );
    const row = r.rows[0];
    await query(
      `INSERT INTO admin_attention_events(event_type,title,body,payload) VALUES($1,$2,$3,$4)`,
      ["join_request", "طلب انضمام جديد", `${row.applicant_name} — ${row.entity_name || row.request_type}`, JSON.stringify({ join_request_id: row.id, request_type: row.request_type })]
    ).catch(() => undefined);
    return res.status(201).json({ success: true, request: row, duplicate: !!duplicateOf });
  } catch (e:any) { return res.status(500).json({ error: e?.message || "Server error" }); }
}

router.post("/join-requests", (req, res) => createJoin(req, res, "general"));
router.post("/women/join-request", (req, res) => createJoin(req, res, "women_service"));
router.post("/merchants/join-request", (req, res) => createJoin(req, res, "merchant"));
router.post("/merchant/join-request", (req, res) => createJoin(req, res, "merchant"));
router.post("/transport/driver/join-request", (req, res) => createJoin(req, res, "driver"));
router.post("/food/join-request", (req, res) => createJoin(req, res, "food_business"));

router.get("/admin/join-requests", async (req, res) => {
  try {
    await initJoinRequestsDb();
    const admin = await requireAdmin(req, res); if (!admin) return;
    const status = req.query.status ? String(req.query.status) : null;
    const type = req.query.type ? String(req.query.type) : null;
    const r = await query(`SELECT * FROM join_requests WHERE ($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR request_type=$2) ORDER BY created_at DESC LIMIT 300`, [status, type]);
    res.json({ requests: r.rows });
  } catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});

router.patch("/admin/join-requests/:id", async (req, res) => {
  try {
    await initJoinRequestsDb();
    const admin = await requireAdmin(req, res); if (!admin) return;
    const status = String(req.body?.status || "pending");
    const note = req.body?.review_note ? String(req.body.review_note) : null;
    const r = await query(`UPDATE join_requests SET status=$1,review_note=$2,reviewed_by=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$4 RETURNING *`, [status, note, admin.id, req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
    res.json(r.rows[0]);
  } catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});

router.get("/admin/attention-events", async (req, res) => {
  try {
    await initJoinRequestsDb();
    const admin = await requireAdmin(req, res); if (!admin) return;
    const r = await query(`SELECT * FROM admin_attention_events WHERE is_read=FALSE ORDER BY created_at DESC LIMIT 100`);
    res.json({ events: r.rows });
  } catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});

export default router;
