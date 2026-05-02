import { Router, type Request, type Response } from "express";
import { Pool } from "pg";

const router = Router();
const dbUrl = process.env.DATABASE_URL ?? "";
const enabled = !!dbUrl && !dbUrl.includes("placeholder") && !dbUrl.includes(".invalid") && !dbUrl.includes("nodb");
const pool = enabled ? new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, max: 10 }) : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try { return await client.query(sql, params); } finally { client.release(); }
}

function fail(res: Response, status: number, error: string) {
  return res.status(status).json({ ok: false, error });
}

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS institution_applications (
    id SERIAL PRIMARY KEY,
    institution_name TEXT NOT NULL,
    institution_type TEXT NOT NULL,
    category TEXT,
    description TEXT,
    address TEXT,
    neighborhood TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    registration_no TEXT,
    founded_year TEXT,
    services JSONB NOT NULL DEFAULT '[]'::jsonb,
    custom_services TEXT,
    representative_name TEXT NOT NULL,
    representative_title TEXT,
    representative_national_id TEXT,
    representative_phone TEXT,
    representative_email TEXT,
    representative_photo_url TEXT,
    commitment_version TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT,
    signed_contract_url TEXT,
    submitted_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_institution_applications_status ON institution_applications(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_institution_applications_created ON institution_applications(created_at DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS admin_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL)`);
  await query(`INSERT INTO admin_settings (key, value) VALUES ('institution_contract_whatsapp', '+966597083352') ON CONFLICT (key) DO NOTHING`);
}

function normalizeBody(body: any) {
  return {
    institution_name: String(body.institution_name ?? body.instName ?? body.name ?? "").trim(),
    institution_type: String(body.institution_type ?? body.instType ?? body.type ?? "").trim(),
    category: String(body.category ?? body.instCategory ?? "").trim(),
    description: String(body.description ?? body.instDesc ?? "").trim(),
    address: String(body.address ?? body.instAddress ?? "").trim(),
    neighborhood: String(body.neighborhood ?? body.instNeighborhood ?? "").trim(),
    phone: String(body.phone ?? body.instPhone ?? "").trim(),
    email: String(body.email ?? body.instEmail ?? "").trim(),
    website: String(body.website ?? body.instWebsite ?? "").trim(),
    registration_no: String(body.registration_no ?? body.instRegNo ?? "").trim(),
    founded_year: String(body.founded_year ?? body.instFounded ?? "").trim(),
    services: Array.isArray(body.services) ? body.services : (Array.isArray(body.selectedServices) ? body.selectedServices : []),
    custom_services: String(body.custom_services ?? body.customServices ?? "").trim(),
    representative_name: String(body.representative_name ?? body.repName ?? "").trim(),
    representative_title: String(body.representative_title ?? body.repTitle ?? "").trim(),
    representative_national_id: String(body.representative_national_id ?? body.repNationalId ?? "").trim(),
    representative_phone: String(body.representative_phone ?? body.repPhone ?? "").trim(),
    representative_email: String(body.representative_email ?? body.repEmail ?? "").trim(),
    representative_photo_url: String(body.representative_photo_url ?? body.repPhotoUrl ?? "").trim(),
    commitment_version: String(body.commitment_version ?? "v1.0").trim(),
    submitted_by: Number(body.submitted_by ?? body.user_id ?? 0) || null,
  };
}

router.get("/institution-applications/contract-settings", async (_req, res) => {
  try {
    await ensureTables();
    const r = await query(`SELECT value FROM admin_settings WHERE key='institution_contract_whatsapp' LIMIT 1`);
    return res.json({ ok: true, contract_whatsapp: r.rows[0]?.value ?? '+966597083352' });
  } catch (err: any) {
    if (err?.code === "DB_NOT_CONFIGURED") return res.json({ ok: true, contract_whatsapp: '+966597083352' });
    return fail(res, 500, "تعذر جلب إعدادات العقد");
  }
});

router.get("/institution-applications/contract-pdf", (_req, res) => {
  return res.json({ ok: true, title: "عقد انضمام المؤسسات", message: "سيتم اعتماد نسخة PDF الرسمية من الإدارة." });
});

router.post("/institution-applications", async (req: Request, res: Response) => {
  try {
    await ensureTables();
    const b = normalizeBody(req.body ?? {});
    if (!b.institution_name) return fail(res, 400, "اسم المؤسسة مطلوب");
    if (!b.institution_type) return fail(res, 400, "نوع المؤسسة مطلوب");
    if (!b.representative_name) return fail(res, 400, "اسم الممثل مطلوب");
    if (!b.phone && !b.representative_phone) return fail(res, 400, "رقم التواصل مطلوب");

    const r = await query(
      `INSERT INTO institution_applications (
        institution_name, institution_type, category, description, address, neighborhood, phone, email, website,
        registration_no, founded_year, services, custom_services, representative_name, representative_title,
        representative_national_id, representative_phone, representative_email, representative_photo_url,
        commitment_version, submitted_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21)
      RETURNING *`,
      [b.institution_name,b.institution_type,b.category,b.description,b.address,b.neighborhood,b.phone,b.email,b.website,
       b.registration_no,b.founded_year,JSON.stringify(b.services),b.custom_services,b.representative_name,b.representative_title,
       b.representative_national_id,b.representative_phone,b.representative_email,b.representative_photo_url,b.commitment_version,b.submitted_by]
    );
    return res.status(201).json({ ok: true, application: r.rows[0], id: r.rows[0].id, status: r.rows[0].status });
  } catch (err: any) {
    console.error("institution application create error:", err);
    if (err?.code === "DB_NOT_CONFIGURED") return fail(res, 503, "قاعدة البيانات غير مهيأة");
    return fail(res, 500, "تعذر إرسال الطلب للإدارة");
  }
});

router.get("/institution-applications/:id", async (req, res) => {
  try {
    await ensureTables();
    const r = await query(`SELECT * FROM institution_applications WHERE id=$1`, [Number(req.params.id)]);
    if (!r.rows.length) return fail(res, 404, "الطلب غير موجود");
    return res.json(r.rows[0]);
  } catch { return fail(res, 500, "تعذر جلب الطلب"); }
});

router.patch("/institution-applications/:id/signed-contract", async (req, res) => {
  try {
    await ensureTables();
    const url = String(req.body?.signed_contract_url ?? "").trim();
    if (!url) return fail(res, 400, "رابط العقد الموقع مطلوب");
    const r = await query(`UPDATE institution_applications SET signed_contract_url=$2 WHERE id=$1 RETURNING *`, [Number(req.params.id), url]);
    if (!r.rows.length) return fail(res, 404, "الطلب غير موجود");
    return res.json({ ok: true, application: r.rows[0] });
  } catch { return fail(res, 500, "تعذر رفع العقد"); }
});

router.get("/admin/institution-applications", async (req, res) => {
  try {
    await ensureTables();
    const status = String(req.query.status ?? "");
    const r = status && status !== "all"
      ? await query(`SELECT * FROM institution_applications WHERE status=$1 ORDER BY created_at DESC`, [status])
      : await query(`SELECT * FROM institution_applications ORDER BY created_at DESC`);
    return res.json(r.rows);
  } catch { return fail(res, 500, "تعذر جلب طلبات المؤسسات"); }
});

router.patch("/admin/institution-applications/:id", async (req, res) => {
  try {
    await ensureTables();
    const status = String(req.body?.status ?? "pending");
    const note = String(req.body?.admin_note ?? "");
    if (!["pending","approved","rejected","suspended"].includes(status)) return fail(res, 400, "حالة غير صحيحة");
    const r = await query(`UPDATE institution_applications SET status=$2, admin_note=$3, reviewed_at=NOW() WHERE id=$1 RETURNING *`, [Number(req.params.id), status, note]);
    if (!r.rows.length) return fail(res, 404, "الطلب غير موجود");
    return res.json({ ok: true, application: r.rows[0] });
  } catch { return fail(res, 500, "تعذر تحديث الطلب"); }
});

export default router;
