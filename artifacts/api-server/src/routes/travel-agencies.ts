import { Router, type Request } from "express";
import { Pool } from "pg";
import { timingSafeEqual } from "node:crypto";
import { heavyWriteLimiter } from "../lib/rate-limiters";
import { logger } from "../lib/logger";

const router = Router();
const DEFAULT_ADMIN_PIN = process.env.DEFAULT_ADMIN_PIN ?? "4444";
const dbUrl = process.env.DATABASE_URL ?? "";
const pool = dbUrl && !dbUrl.includes("placeholder") && !dbUrl.includes(".invalid") && !dbUrl.includes("nodb")
  ? new Pool({
      connectionString: dbUrl,
      max: 10,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000,
      ssl: dbUrl.includes("sslmode=require") || dbUrl.includes("ssl=true") || dbUrl.includes("neon.tech") ? { rejectUnauthorized: false } : false,
    })
  : null;

if (pool) pool.on("error", err => logger.error({ err }, "travel agencies pg pool error"));

const AGENCY_TYPES = new Set(["local", "international", "hajj_umrah", "tourism", "corporate"]);
const STATUSES = new Set(["pending", "approved", "rejected", "needs_info"]);

function safeCompare(a: string, b: string) {
  try {
    const ba = Buffer.from(a.padEnd(64, "\0"));
    const bb = Buffer.from(b.padEnd(64, "\0"));
    return timingSafeEqual(ba, bb) && a.length === b.length;
  } catch { return false; }
}

async function q(sql: string, params: unknown[] = []) {
  if (!pool) throw new Error("DATABASE_URL is not configured");
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

async function getSessionAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  const { rows } = await q(`SELECT u.role FROM users u JOIN user_sessions s ON s.user_id=u.id WHERE s.token=$1 AND (s.expires_at IS NULL OR s.expires_at > NOW()) LIMIT 1`, [token]);
  return rows[0]?.role === "admin";
}

async function isAdmin(req: Request) {
  if (await getSessionAdmin(req).catch(() => false)) return true;
  const pin = req.headers["x-admin-pin"];
  return typeof pin === "string" && pin.length >= 4 && pin.length <= 20 && safeCompare(pin, DEFAULT_ADMIN_PIN);
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean).slice(0, 30);
  if (typeof v === "string") return v.split(/[,،\n]/).map(s => s.trim()).filter(Boolean).slice(0, 30);
  return [];
}
function str(v: unknown, max = 500) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function normalized(v: string) { return v.trim().toLowerCase(); }
function emailOk(v: string) { return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function phoneOk(v: string) { return !v || /^[+\d][\d\s()+-]{6,24}$/.test(v); }
function websiteOk(v: string) { return !v || /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(v); }
function yearOk(v: unknown) { const n = Number(v); return !v || (Number.isInteger(n) && n >= 1900 && n <= new Date().getFullYear() + 1); }

export async function initTravelAgenciesDb() {
  await q(`CREATE TABLE IF NOT EXISTS travel_agencies (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT,
    agency_type TEXT NOT NULL DEFAULT 'local',
    specialties TEXT[] DEFAULT '{}',
    destinations TEXT[] DEFAULT '{}',
    services_offered TEXT[] DEFAULT '{}',
    booking_products TEXT[] DEFAULT '{}',
    description TEXT,
    logo_url TEXT,
    website TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    city TEXT,
    country TEXT DEFAULT 'السودان',
    license_number TEXT,
    founded_year INT,
    is_featured BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS travel_agency_applications (
    id SERIAL PRIMARY KEY,
    agency_name TEXT NOT NULL,
    agency_name_en TEXT,
    agency_type TEXT NOT NULL DEFAULT 'local',
    contact_name TEXT NOT NULL,
    contact_role TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    city TEXT,
    country TEXT DEFAULT 'السودان',
    license_number TEXT,
    founded_year INT,
    website TEXT,
    specialties TEXT[] DEFAULT '{}',
    destinations TEXT[] DEFAULT '{}',
    services_offered TEXT[] DEFAULT '{}',
    booking_products TEXT[] DEFAULT '{}',
    target_routes TEXT,
    description TEXT,
    workspace_settings JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending',
    review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_agency_id INT REFERENCES travel_agencies(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE INDEX IF NOT EXISTS idx_travel_agencies_active_type ON travel_agencies(active, agency_type)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_travel_agency_applications_status ON travel_agency_applications(status, created_at DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_travel_agency_applications_email_pending ON travel_agency_applications(LOWER(email), status) WHERE email IS NOT NULL`);
  await q(`CREATE INDEX IF NOT EXISTS idx_travel_agency_applications_phone_pending ON travel_agency_applications(phone, status) WHERE phone IS NOT NULL`);
}

router.get("/travel-agencies", async (_req, res) => {
  try {
    await initTravelAgenciesDb();
    const { rows } = await q(`SELECT id, name, name_en, agency_type, specialties, destinations,
      services_offered, booking_products, description, logo_url, website, phone, whatsapp, email,
      city, country, license_number, founded_year, is_featured, settings
      FROM travel_agencies WHERE active = TRUE ORDER BY is_featured DESC, created_at DESC`);
    res.json({ agencies: rows });
  } catch (err) {
    logger.error({ err }, "list travel agencies failed");
    res.status(500).json({ error: "تعذّر تحميل وكالات السفر" });
  }
});

router.post("/travel-agencies/apply", heavyWriteLimiter, async (req, res) => {
  try {
    await initTravelAgenciesDb();
    const b = req.body ?? {};
    const agencyName = str(b.agency_name, 160);
    const contactName = str(b.contact_name, 120);
    const email = str(b.email, 160);
    const phone = str(b.phone, 40);
    const whatsapp = str(b.whatsapp, 40);
    const website = str(b.website, 220);
    const agencyType = AGENCY_TYPES.has(str(b.agency_type, 40)) ? str(b.agency_type, 40) : "local";
    if (!agencyName) return res.status(400).json({ error: "اسم الوكالة مطلوب" });
    if (!contactName) return res.status(400).json({ error: "اسم مسؤول التواصل مطلوب" });
    if (!phone && !whatsapp && !email) return res.status(400).json({ error: "أدخل وسيلة تواصل واحدة على الأقل" });
    if (!emailOk(email)) return res.status(400).json({ error: "البريد الإلكتروني غير صحيح" });
    if (!phoneOk(phone) || !phoneOk(whatsapp)) return res.status(400).json({ error: "رقم الهاتف أو الواتساب غير صحيح" });
    if (!websiteOk(website)) return res.status(400).json({ error: "رابط الموقع الإلكتروني غير صحيح" });
    if (!yearOk(b.founded_year)) return res.status(400).json({ error: "سنة التأسيس غير صحيحة" });

    const duplicate = await q(`SELECT id FROM travel_agency_applications
      WHERE status IN ('pending','needs_info') AND (
        ($1::text <> '' AND LOWER(email)=LOWER($1::text)) OR
        ($2::text <> '' AND phone=$2::text) OR
        ($3::text <> '' AND whatsapp=$3::text) OR
        ($4::text <> '' AND license_number=$4::text)
      ) LIMIT 1`, [email, phone, whatsapp, str(b.license_number, 100)]);
    if (duplicate.rows[0]) return res.status(409).json({ error: "يوجد طلب انضمام قيد المراجعة بنفس بيانات التواصل أو الترخيص" });

    const bookingProducts = arr(b.booking_products).length ? arr(b.booking_products) : ["تذاكر طيران", "فنادق", "تأشيرات", "باقات سياحية"];
    const workspaceSettings = {
      allow_air_ticket_requests: true,
      allow_domestic_bus_tickets: true,
      allow_hotel_bookings: true,
      allow_visa_services: true,
      allow_umrah_packages: true,
      dashboard_status: "prepared",
      requested_at: new Date().toISOString(),
    };

    const { rows } = await q(`INSERT INTO travel_agency_applications
      (agency_name, agency_name_en, agency_type, contact_name, contact_role, phone, whatsapp, email,
       city, country, license_number, founded_year, website, specialties, destinations, services_offered,
       booking_products, target_routes, description, workspace_settings)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING id, status, created_at`, [
        agencyName, str(b.agency_name_en, 160), agencyType, contactName,
        str(b.contact_role, 100), phone, whatsapp, normalized(email), str(b.city, 100), str(b.country, 100) || "السودان",
        str(b.license_number, 100), b.founded_year ? Number(b.founded_year) : null, website,
        arr(b.specialties), arr(b.destinations), arr(b.services_offered), bookingProducts, str(b.target_routes, 800),
        str(b.description, 1600), workspaceSettings,
      ]);
    return res.status(201).json({ ok: true, application: rows[0], message: "تم استلام طلب انضمام الوكالة. سنراجع البيانات ونجهّز مساحة الوكالة ولوحة إدارتها خلال 48 ساعة." });
  } catch (err) {
    logger.error({ err }, "travel agency application failed");
    return res.status(500).json({ error: "تعذّر إرسال طلب الانضمام" });
  }
});

router.get("/admin/travel-agencies/applications", async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ error: "غير مصرح" });
  await initTravelAgenciesDb();
  const { rows } = await q(`SELECT * FROM travel_agency_applications ORDER BY created_at DESC LIMIT 200`);
  return res.json({ applications: rows });
});

router.patch("/admin/travel-agencies/applications/:id/status", async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ error: "غير مصرح" });
  await initTravelAgenciesDb();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "معرّف الطلب غير صحيح" });
  const status = STATUSES.has(req.body?.status) ? req.body.status : "pending";
  const notes = str(req.body?.review_notes, 800);
  const { rows } = await q(`UPDATE travel_agency_applications SET status=$1, review_notes=$2, reviewed_at=NOW() WHERE id=$3 RETURNING *`, [status, notes, id]);
  if (!rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
  return res.json({ application: rows[0] });
});

router.post("/admin/travel-agencies/applications/:id/approve", async (req, res) => {
  if (!await isAdmin(req)) return res.status(403).json({ error: "غير مصرح" });
  await initTravelAgenciesDb();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "معرّف الطلب غير صحيح" });
  const app = (await q(`SELECT * FROM travel_agency_applications WHERE id=$1`, [id])).rows[0];
  if (!app) return res.status(404).json({ error: "الطلب غير موجود" });
  if (app.status === "approved" && app.created_agency_id) return res.status(409).json({ error: "تم اعتماد هذا الطلب مسبقًا" });
  const inserted = await q(`INSERT INTO travel_agencies
    (name, name_en, agency_type, specialties, destinations, services_offered, booking_products,
     description, website, phone, whatsapp, email, city, country, license_number, founded_year, settings)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    RETURNING *`, [app.agency_name, app.agency_name_en, app.agency_type, app.specialties, app.destinations,
      app.services_offered, app.booking_products, app.description, app.website, app.phone, app.whatsapp,
      app.email, app.city, app.country, app.license_number, app.founded_year, app.workspace_settings]);
  await q(`UPDATE travel_agency_applications SET status='approved', reviewed_at=NOW(), created_agency_id=$1 WHERE id=$2`, [inserted.rows[0].id, id]);
  return res.json({ agency: inserted.rows[0], message: "تم اعتماد الوكالة وإنشاء مساحتها" });
});

export default router;