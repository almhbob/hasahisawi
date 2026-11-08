// ════════════════════════════════════════════════════════════════
// 🩺 رحلة المريض: فريق الرعاية + الملف الطبي المشترك
//  • فريق الرعاية: المريض يضيف طبيباً/كادراً معتمداً، أو يطلب الكادر الربط برقم السجل ويوافق المريض.
//    كما يُعدّ الكادر الذي كتب وصفة أو طلب تحليل للمريض خلال ١٨٠ يوماً مرتبطاً به تلقائياً.
//  • الملف الطبي: صور الفحوصات القديمة والروشتات والتقارير والأشعة، يرفعها المريض أو الكادر المرتبط.
//    المريض يتحكم في مشاركة كل مستند، ويستطيع إلغاء ربط أي كادر في أي وقت.
//  • خط زمني واحد يجمع المواعيد والوصفات والتحاليل والصيدلية والمستندات.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { query, sessionUser, type SessionUser } from "../lib/shared-db";
import { logger } from "../lib/logger";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();

export const DOC_KINDS: Record<string, string> = {
  lab: "تحليل / فحص مخبري", xray: "أشعة وتصوير", prescription: "روشتة / وصفة", report: "تقرير طبي",
  discharge: "ملخص خروج", vaccine: "تطعيمات", other: "مستند آخر",
};
const STAFF_TYPE_AR: Record<string, string> = {
  doctor: "طبيب", lab_technician: "فني مختبر", pharmacist: "صيدلي", nurse: "ممرض/ة", receptionist: "استقبال", admin: "إدارة منشأة",
};

let ready: Promise<void> | null = null;
export function ensurePatientJourneyDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`ALTER TABLE medical_staff_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(12) NOT NULL DEFAULT 'pending'`).catch(() => {});
    await query(`ALTER TABLE medical_staff_profiles ADD COLUMN IF NOT EXISTS display_name VARCHAR(200)`).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS medical_care_links (
      id SERIAL PRIMARY KEY,
      patient_user_id INTEGER NOT NULL,
      staff_user_id INTEGER NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      requested_by VARCHAR(8) NOT NULL DEFAULT 'patient',
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (patient_user_id, staff_user_id)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_care_links_staff ON medical_care_links(staff_user_id, status)`);
    await query(`CREATE TABLE IF NOT EXISTS medical_documents (
      id SERIAL PRIMARY KEY,
      patient_user_id INTEGER NOT NULL,
      uploaded_by INTEGER,
      uploader_role VARCHAR(8) NOT NULL DEFAULT 'patient',
      uploader_name VARCHAR(200),
      kind VARCHAR(16) NOT NULL DEFAULT 'other',
      title VARCHAR(200) NOT NULL,
      note TEXT,
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      doc_date DATE,
      shared BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_med_docs_patient ON medical_documents(patient_user_id, created_at DESC)`);
  })().catch((e) => { ready = null; throw e; }));
}

router.use(["/medical/journey", "/medical/care-team", "/medical/documents", "/medical/staff/patients", "/medical/staff/link"], async (_req, res, next) => {
  try { await ensurePatientJourneyDb(); return next(); }
  catch (err) { logger.error({ err }, "[journey] ensure"); return res.status(500).json({ error: "تعذّر تهيئة الملف الطبي" }); }
});

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const fail = (res: Response, err: unknown, where: string) => { logger.error({ err }, `[journey] ${where}`); return res.status(500).json({ error: "حدث خطأ، حاول لاحقاً" }); };
const intId = (v: unknown) => (/^\d+$/.test(String(v)) ? Number(v) : null);

async function requireUser(req: Request, res: Response): Promise<SessionUser | null> {
  const u = await sessionUser(req);
  if (!u) { res.status(401).json({ error: "سجّل الدخول أولاً" }); return null; }
  if (u.is_banned) { res.status(403).json({ error: "الحساب موقوف" }); return null; }
  return u;
}
/** ملف الكادر المعتمد النشط */
async function approvedStaff(userId: number): Promise<any | null> {
  const r = await query(`SELECT * FROM medical_staff_profiles WHERE user_id=$1 AND is_active=TRUE AND status='approved'`, [userId]).catch(() => ({ rows: [] as any[] }));
  return r.rows[0] ?? null;
}
function staffName(p: any, userName?: string | null) {
  const base = String(p?.display_name || userName || "كادر طبي").replace(/^د\.?\s*/, "");
  return `${p?.staff_type === "doctor" ? "د. " : ""}${base}`;
}
async function push(userId: number, title: string, body: string, data: Record<string, unknown>) {
  try {
    await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'medical',$2,$3,$4)`, [userId, title, body, JSON.stringify(data)]).catch(() => {});
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [userId]);
    if (!rows.length) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound: "default", data }))),
    }).catch(() => {});
  } catch (e: any) { logger.warn({ err: e?.message }, "[journey] push"); }
}

/** هل يحق لهذا الكادر رؤية ملف المريض؟ ربط نشط، أو وصفة/طلب تحليل منه خلال ١٨٠ يوماً */
async function staffCanSee(staffId: number, patientId: number): Promise<"link" | "care" | null> {
  const l = await query(`SELECT 1 FROM medical_care_links WHERE staff_user_id=$1 AND patient_user_id=$2 AND status='active'`, [staffId, patientId]);
  if (l.rows[0]) return "link";
  const c = await query(`SELECT 1 FROM prescriptions WHERE doctor_user_id=$1 AND patient_user_id=$2 AND created_at > NOW() - INTERVAL '180 days'
    UNION ALL SELECT 1 FROM lab_orders WHERE (doctor_user_id=$1 OR lab_user_id=$1) AND patient_user_id=$2 AND created_at > NOW() - INTERVAL '180 days' LIMIT 1`, [staffId, patientId]).catch(() => ({ rows: [] as any[] }));
  if (c.rows[0]) return "care";
  // المريض ألغى الربط صراحةً → لا وصول حتى لو وُجدت وصفة قديمة
  return null;
}
async function explicitlyRevoked(staffId: number, patientId: number) {
  const r = await query(`SELECT 1 FROM medical_care_links WHERE staff_user_id=$1 AND patient_user_id=$2 AND status='revoked'`, [staffId, patientId]);
  return !!r.rows[0];
}

function cleanImages(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).filter((x) => typeof x === "string" && /^https:\/\/[^\s]{8,600}$/.test(x)).slice(0, 10) as string[];
}
const docOut = (d: any) => ({ ...d, kind_label: DOC_KINDS[d.kind] || DOC_KINDS.other });

// ═════════════ المريض ═════════════

// GET /api/medical/journey — كل رحلة المريض في طلب واحد
router.get("/medical/journey", async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    const safe = (p: Promise<any>) => p.catch(() => ({ rows: [] as any[] }));
    const [rec, team, docs, appts, rxs, labs, ph] = await Promise.all([
      safe(query(`SELECT * FROM patient_medical_records WHERE user_id=$1`, [u.id])),
      safe(query(`SELECT l.*, p.staff_type, p.specialty, p.facility_name, p.display_name, us.name AS user_name, us.avatar_url, us.phone AS staff_phone
        FROM medical_care_links l JOIN medical_staff_profiles p ON p.user_id=l.staff_user_id JOIN users us ON us.id=l.staff_user_id
        WHERE l.patient_user_id=$1 AND l.status<>'revoked' ORDER BY (l.status='pending') DESC, l.updated_at DESC`, [u.id])),
      safe(query(`SELECT * FROM medical_documents WHERE patient_user_id=$1 ORDER BY COALESCE(doc_date, created_at::date) DESC, id DESC LIMIT 200`, [u.id])),
      safe(query(`SELECT id, facility_name, appointment_date, appointment_time, status, notes, created_at FROM appointments WHERE user_id=$1 ORDER BY appointment_date DESC LIMIT 50`, [u.id])),
      safe(query(`SELECT id, doctor_name, doctor_user_id, facility_name, diagnosis, medications, follow_up_date, status, created_at FROM prescriptions WHERE patient_user_id=$1 ORDER BY created_at DESC LIMIT 50`, [u.id])),
      safe(query(`SELECT lr.id, lr.summary_notes, lr.results_data, lr.ready_at, lr.created_at, lo.tests, lo.doctor_name FROM lab_results lr LEFT JOIN lab_orders lo ON lo.id=lr.order_id WHERE lr.patient_user_id=$1 ORDER BY lr.created_at DESC LIMIT 50`, [u.id])),
      safe(query(`SELECT id, status, delivery_type, created_at, prescription_id FROM pharmacy_orders WHERE patient_user_id=$1 ORDER BY created_at DESC LIMIT 50`, [u.id])),
    ]);
    // أطباء عالجوه مؤخراً ولم يُضافوا لفريقه بعد (اقتراح ربط بنقرة)
    const linked = new Set(team.rows.map((t: any) => t.staff_user_id));
    const suggested = [...new Map(rxs.rows.filter((r: any) => r.doctor_user_id && !linked.has(r.doctor_user_id))
      .map((r: any) => [r.doctor_user_id, { staff_user_id: r.doctor_user_id, name: r.doctor_name, facility_name: r.facility_name }])).values()].slice(0, 5);

    const timeline = [
      ...appts.rows.map((a: any) => ({ type: "appointment", id: a.id, at: a.appointment_date, title: `موعد في ${a.facility_name || "منشأة صحية"}`, sub: `${a.appointment_time || ""} · ${a.status}` })),
      ...rxs.rows.map((r: any) => ({ type: "prescription", id: r.id, at: r.created_at, title: `وصفة من ${r.doctor_name || "الطبيب"}`, sub: r.diagnosis || `${(r.medications || []).length} دواء` })),
      ...labs.rows.map((l: any) => ({ type: "lab", id: l.id, at: l.ready_at || l.created_at, title: "نتيجة تحليل جاهزة", sub: l.summary_notes || l.doctor_name || "" })),
      ...ph.rows.map((p: any) => ({ type: "pharmacy", id: p.id, at: p.created_at, title: "طلب صيدلية", sub: p.status })),
      ...docs.rows.map((d: any) => ({ type: "document", id: d.id, at: d.doc_date || d.created_at, title: d.title, sub: `${DOC_KINDS[d.kind] || "مستند"} · ${d.uploader_role === "staff" ? `رفعه ${d.uploader_name || "الكادر"}` : "رفعته أنت"}` })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 80);

    const record = rec.rows[0] ?? null;
    const upcoming = appts.rows.find((a: any) => ["pending", "confirmed"].includes(a.status) && new Date(a.appointment_date).getTime() >= Date.now() - 864e5) ?? null;
    return res.json({
      record,
      care_team: team.rows.map((t: any) => ({
        id: t.id, staff_user_id: t.staff_user_id, status: t.status, requested_by: t.requested_by, name: staffName(t, t.user_name),
        type_label: STAFF_TYPE_AR[t.staff_type] || "كادر طبي", specialty: t.specialty, facility_name: t.facility_name, avatar_url: t.avatar_url, created_at: t.created_at,
      })),
      suggested,
      documents: docs.rows.map(docOut),
      timeline,
      upcoming,
      counts: { appointments: appts.rows.length, prescriptions: rxs.rows.length, labs: labs.rows.length, pharmacy: ph.rows.length, documents: docs.rows.length },
      steps: [
        { key: "record", label: "السجل الطبي", done: !!record },
        { key: "team", label: "فريق الرعاية", done: team.rows.some((t: any) => t.status === "active") },
        { key: "appointment", label: "الموعد", done: appts.rows.length > 0 },
        { key: "treatment", label: "الوصفة والتحاليل", done: rxs.rows.length + labs.rows.length > 0 },
        { key: "pharmacy", label: "الصيدلية", done: ph.rows.length > 0 },
      ],
      doc_kinds: DOC_KINDS,
    });
  } catch (err) { return fail(res, err, "journey"); }
});

// POST /api/medical/care-team { staff_user_id } — المريض يضيف طبيباً معتمداً لفريقه
router.post("/medical/care-team", writeLimiter, async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    const sid = intId(req.body?.staff_user_id);
    if (!sid || sid === u.id) return res.status(400).json({ error: "اختر طبيباً" });
    const st = await approvedStaff(sid);
    if (!st) return res.status(404).json({ error: "هذا الكادر غير معتمد في التطبيق" });
    const r = await query(`INSERT INTO medical_care_links (patient_user_id, staff_user_id, status, requested_by) VALUES ($1,$2,'active','patient')
      ON CONFLICT (patient_user_id, staff_user_id) DO UPDATE SET status='active', requested_by='patient', updated_at=NOW() RETURNING *`, [u.id, sid]);
    void push(sid, "🩺 مريض أضافك لفريق رعايته", `${u.name || "مريض"} منحك الوصول لملفه الطبي ومستنداته.`, { screen: "staff-portal", tab: "patients" });
    return res.status(201).json({ link: r.rows[0] });
  } catch (err) { return fail(res, err, "team-add"); }
});

// PATCH /api/medical/care-team/:id { action: approve | revoke }
router.patch("/medical/care-team/:id", writeLimiter, async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    const id = intId(req.params.id); if (!id) return res.status(404).json({ error: "غير موجود" });
    const action = String(req.body?.action || "");
    if (!["approve", "revoke"].includes(action)) return res.status(400).json({ error: "إجراء غير معروف" });
    const r = await query(`UPDATE medical_care_links SET status=$1, updated_at=NOW() WHERE id=$2 AND patient_user_id=$3 RETURNING *`,
      [action === "approve" ? "active" : "revoked", id, u.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجود" });
    if (action === "approve") void push(r.rows[0].staff_user_id, "✅ وافق المريض على الربط", `يمكنك الآن الاطلاع على ملف ${u.name || "المريض"} الطبي.`, { screen: "staff-portal", tab: "patients" });
    return res.json({ link: r.rows[0] });
  } catch (err) { return fail(res, err, "team-patch"); }
});

// POST /api/medical/documents — المريض يرفع مستنداً لملفه
router.post("/medical/documents", writeLimiter, async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    const b = req.body ?? {};
    const images = cleanImages(b.images);
    if (!images.length) return res.status(400).json({ error: "أضف صورة واحدة على الأقل" });
    const kind = DOC_KINDS[b.kind] ? b.kind : "other";
    const title = clip(b.title, 200) || DOC_KINDS[kind];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.doc_date)) ? String(b.doc_date) : null;
    const count = (await query(`SELECT COUNT(*)::int AS n FROM medical_documents WHERE patient_user_id=$1 AND created_at > NOW() - INTERVAL '1 day'`, [u.id])).rows[0].n;
    if (count >= 40) return res.status(429).json({ error: "تجاوزت حد الرفع اليومي" });
    const r = await query(`INSERT INTO medical_documents (patient_user_id, uploaded_by, uploader_role, uploader_name, kind, title, note, images, doc_date, shared)
      VALUES ($1,$1,'patient',$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
      [u.id, u.name, kind, title, clip(b.note, 1000) || null, JSON.stringify(images), date, b.shared !== false]);
    // إشعار فريق الرعاية النشط بمستند جديد مشترك
    if (b.shared !== false) {
      const team = (await query(`SELECT staff_user_id FROM medical_care_links WHERE patient_user_id=$1 AND status='active'`, [u.id])).rows;
      for (const t of team) void push(t.staff_user_id, "📎 مستند جديد من مريضك", `${u.name || "المريض"}: ${title}`, { screen: "staff-portal", tab: "patients", patient_id: u.id });
    }
    return res.status(201).json({ document: docOut(r.rows[0]) });
  } catch (err) { return fail(res, err, "doc-add"); }
});

// PATCH /api/medical/documents/:id { shared?, title?, note? } — المريض فقط
router.patch("/medical/documents/:id", writeLimiter, async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    const id = intId(req.params.id); if (!id) return res.status(404).json({ error: "غير موجود" });
    const b = req.body ?? {};
    const r = await query(`UPDATE medical_documents SET shared=COALESCE($1, shared), title=COALESCE($2, title), note=COALESCE($3, note)
      WHERE id=$4 AND patient_user_id=$5 RETURNING *`,
      [typeof b.shared === "boolean" ? b.shared : null, clip(b.title, 200) || null, b.note !== undefined ? clip(b.note, 1000) : null, id, u.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجود" });
    return res.json({ document: docOut(r.rows[0]) });
  } catch (err) { return fail(res, err, "doc-patch"); }
});

// DELETE /api/medical/documents/:id — صاحب الملف، أو الكادر الذي رفعه
router.delete("/medical/documents/:id", writeLimiter, async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    const id = intId(req.params.id); if (!id) return res.status(404).json({ error: "غير موجود" });
    const r = await query(`DELETE FROM medical_documents WHERE id=$1 AND (patient_user_id=$2 OR (uploaded_by=$2 AND uploader_role='staff')) RETURNING id`, [id, u.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجود أو لا تملك حذفه" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "doc-del"); }
});

// ═════════════ الكادر الطبي ═════════════

// POST /api/medical/staff/link { record_number } — طلب ربط بمريض (يوافق عليه المريض)
router.post("/medical/staff/link", writeLimiter, async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    const st = await approvedStaff(u.id);
    if (!st) return res.status(403).json({ error: "هذه الخدمة للكادر الطبي المعتمد" });
    const rn = clip(req.body?.record_number, 80).toUpperCase();
    if (rn.length < 4) return res.status(400).json({ error: "اكتب رقم السجل الطبي للمريض" });
    const rec = (await query(`SELECT user_id, full_name FROM patient_medical_records WHERE UPPER(record_number)=$1`, [rn])).rows[0];
    if (!rec?.user_id) return res.status(404).json({ error: "رقم السجل غير موجود" });
    if (rec.user_id === u.id) return res.status(400).json({ error: "هذا سجلك أنت" });
    const cur = (await query(`SELECT * FROM medical_care_links WHERE patient_user_id=$1 AND staff_user_id=$2`, [rec.user_id, u.id])).rows[0];
    if (cur?.status === "active") return res.json({ link: cur, already: true });
    const r = await query(`INSERT INTO medical_care_links (patient_user_id, staff_user_id, status, requested_by, note) VALUES ($1,$2,'pending','staff',$3)
      ON CONFLICT (patient_user_id, staff_user_id) DO UPDATE SET status='pending', requested_by='staff', note=$3, updated_at=NOW() RETURNING *`,
      [rec.user_id, u.id, clip(req.body?.note, 300) || null]);
    void push(rec.user_id, "🩺 طلب ربط بملفك الطبي", `${staffName(st, u.name)} (${STAFF_TYPE_AR[st.staff_type] || "كادر طبي"}${st.facility_name ? ` — ${st.facility_name}` : ""}) يطلب الاطلاع على ملفك. وافق أو ارفض من «رحلة المريض».`,
      { screen: "medical-patient-hub" });
    return res.status(201).json({ link: r.rows[0], patient_name: rec.full_name });
  } catch (err) { return fail(res, err, "staff-link"); }
});

// GET /api/medical/staff/patients — مرضى الكادر
router.get("/medical/staff/patients", async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    if (!(await approvedStaff(u.id))) return res.status(403).json({ error: "هذه الخدمة للكادر الطبي المعتمد" });
    const r = await query(`SELECT l.id AS link_id, l.status, l.requested_by, l.updated_at, us.id AS user_id, us.name, us.avatar_url,
        rec.record_number, rec.full_name, rec.blood_type, rec.birth_date, rec.gender, rec.allergies, rec.chronic_diseases,
        (SELECT COUNT(*)::int FROM medical_documents d WHERE d.patient_user_id=l.patient_user_id AND d.shared) AS docs,
        (SELECT MAX(created_at) FROM medical_documents d WHERE d.patient_user_id=l.patient_user_id AND d.shared) AS last_doc_at
      FROM medical_care_links l JOIN users us ON us.id=l.patient_user_id LEFT JOIN patient_medical_records rec ON rec.user_id=l.patient_user_id
      WHERE l.staff_user_id=$1 AND l.status IN ('active','pending') ORDER BY (l.status='active') DESC, COALESCE((SELECT MAX(created_at) FROM medical_documents d WHERE d.patient_user_id=l.patient_user_id), l.updated_at) DESC LIMIT 300`, [u.id]);
    return res.json({ patients: r.rows.map((p: any) => ({ ...p, name: p.full_name || p.name })) });
  } catch (err) { return fail(res, err, "staff-patients"); }
});

// GET /api/medical/staff/patients/:uid/file — الملف الكامل (عند وجود ربط نشط أو علاقة علاج حديثة)
router.get("/medical/staff/patients/:uid/file", async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    const st = await approvedStaff(u.id);
    if (!st) return res.status(403).json({ error: "هذه الخدمة للكادر الطبي المعتمد" });
    const pid = intId(req.params.uid); if (!pid) return res.status(404).json({ error: "غير موجود" });
    const via = await staffCanSee(u.id, pid);
    if (!via || (via === "care" && await explicitlyRevoked(u.id, pid))) return res.status(403).json({ error: "لا يوجد ربط نشط مع هذا المريض — اطلب الربط برقم سجله" });
    const safe = (p: Promise<any>) => p.catch(() => ({ rows: [] as any[] }));
    const [rec, docs, rxs, labs, usr] = await Promise.all([
      safe(query(`SELECT * FROM patient_medical_records WHERE user_id=$1`, [pid])),
      safe(query(`SELECT * FROM medical_documents WHERE patient_user_id=$1 AND (shared OR uploaded_by=$2) ORDER BY COALESCE(doc_date, created_at::date) DESC, id DESC LIMIT 200`, [pid, u.id])),
      safe(query(`SELECT id, doctor_name, facility_name, diagnosis, medications, follow_up_date, created_at FROM prescriptions WHERE patient_user_id=$1 ORDER BY created_at DESC LIMIT 20`, [pid])),
      safe(query(`SELECT lr.id, lr.summary_notes, lr.results_data, lr.ready_at, lo.tests, lo.doctor_name FROM lab_results lr LEFT JOIN lab_orders lo ON lo.id=lr.order_id WHERE lr.patient_user_id=$1 ORDER BY lr.created_at DESC LIMIT 20`, [pid])),
      safe(query(`SELECT id, name, avatar_url FROM users WHERE id=$1`, [pid])),
    ]);
    return res.json({ patient: usr.rows[0] ?? { id: pid }, record: rec.rows[0] ?? null, documents: docs.rows.map(docOut), prescriptions: rxs.rows, lab_results: labs.rows, access: via, doc_kinds: DOC_KINDS });
  } catch (err) { return fail(res, err, "staff-file"); }
});

// POST /api/medical/staff/patients/:uid/documents — الكادر يرفع صوراً لملف المريض
router.post("/medical/staff/patients/:uid/documents", writeLimiter, async (req, res) => {
  try {
    const u = await requireUser(req, res); if (!u) return;
    const st = await approvedStaff(u.id);
    if (!st) return res.status(403).json({ error: "هذه الخدمة للكادر الطبي المعتمد" });
    const pid = intId(req.params.uid); if (!pid) return res.status(404).json({ error: "غير موجود" });
    const via = await staffCanSee(u.id, pid);
    if (!via || (via === "care" && await explicitlyRevoked(u.id, pid))) return res.status(403).json({ error: "لا يوجد ربط نشط مع هذا المريض" });
    const b = req.body ?? {};
    const images = cleanImages(b.images);
    if (!images.length) return res.status(400).json({ error: "أضف صورة واحدة على الأقل" });
    const kind = DOC_KINDS[b.kind] ? b.kind : "report";
    const title = clip(b.title, 200) || DOC_KINDS[kind];
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.doc_date)) ? String(b.doc_date) : null;
    const name = `${staffName(st, u.name)}${st.facility_name ? ` — ${st.facility_name}` : ""}`.slice(0, 200);
    const r = await query(`INSERT INTO medical_documents (patient_user_id, uploaded_by, uploader_role, uploader_name, kind, title, note, images, doc_date, shared)
      VALUES ($1,$2,'staff',$3,$4,$5,$6,$7::jsonb,$8,TRUE) RETURNING *`, [pid, u.id, name, kind, title, clip(b.note, 1000) || null, JSON.stringify(images), date]);
    void push(pid, "📎 أُضيف مستند لملفك الطبي", `${name}: ${title}`, { screen: "medical-patient-hub" });
    return res.status(201).json({ document: docOut(r.rows[0]) });
  } catch (err) { return fail(res, err, "staff-doc"); }
});

export default router;
