// ════════════════════════════════════════════════════════════════
// 🏗️ «شركات المقاولات» — مساحة احترافية للشركات والعملاء
//  • دليل الشركات بالتخصص والبحث، ملف الشركة: معرض مشاريع منجزة (قبل/بعد)، خدمات، تقييمات، وظائف.
//  • العميل: طلب عرض سعر (مع صور) ومتابعته، استلام العقد وقبوله، تقييم بعد الإنجاز.
//  • الشركة وطاقمها (مالك/مدير/مهندس/مبيعات بصلاحيات): الإعدادات، المشاريع، صندوق طلبات الأسعار
//    بمراحل، مولّد العقود برقم HSW-CON-السنة-الرقم، إعلانات التوظيف وطلب العمال وطلبات التقديم.
//  • التسجيل يمرّ بموافقة الإدارة (pending → active / suspended / rejected).
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { checkContent } from "../lib/content-moderator";

const router = Router();
// المعرّفات أرقام فقط (Express 5 لا يدعم القيود داخل المسار)
for (const p of ["id", "qid", "kid", "jid", "pid", "aid", "uid"]) {
  router.param(p, (_req, res, next, v) => (/^\d+$/.test(String(v)) ? next() : res.status(404).json({ error: "غير موجود" })));
}

export const SPECIALTIES = [
  { key: "building", label: "بناء وتشييد", icon: "office-building" },
  { key: "finishing", label: "تشطيبات", icon: "format-paint" },
  { key: "electric", label: "كهرباء", icon: "flash" },
  { key: "plumbing", label: "سباكة", icon: "pipe-wrench" },
  { key: "roads", label: "طرق وأسفلت", icon: "road-variant" },
  { key: "decor", label: "ديكور", icon: "sofa-outline" },
  { key: "aluminum", label: "ألمنيوم وزجاج", icon: "window-closed-variant" },
  { key: "paint", label: "دهانات", icon: "brush" },
  { key: "steel", label: "حدادة وهياكل", icon: "anvil" },
  { key: "carpentry", label: "نجارة", icon: "hand-saw" },
  { key: "tiles", label: "بلاط وسيراميك", icon: "view-grid-outline" },
  { key: "ac", label: "تكييف وتبريد", icon: "air-conditioner" },
  { key: "solar", label: "طاقة شمسية", icon: "solar-panel" },
  { key: "wells", label: "آبار ومياه", icon: "water-pump" },
  { key: "design", label: "تصميم هندسي", icon: "pencil-ruler" },
  { key: "maintenance", label: "صيانة عامة", icon: "tools" },
] as const;
const SPEC = new Set(SPECIALTIES.map((s) => s.key));

export const ROLES = ["owner", "manager", "engineer", "sales"] as const;
type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { owner: "المالك", manager: "مدير", engineer: "مهندس", sales: "مبيعات وخدمة عملاء" };
export const PERMS = ["settings", "staff", "projects", "quotes", "contracts", "jobs"] as const;
type Perm = (typeof PERMS)[number];
const ROLE_PERMS: Record<Role, Perm[]> = {
  owner: [...PERMS],
  manager: ["settings", "projects", "quotes", "contracts", "jobs"],
  engineer: ["projects", "quotes", "jobs"],
  sales: ["quotes", "contracts"],
};
const QUOTE_STATUSES = ["new", "reviewing", "quoted", "accepted", "rejected", "in_progress", "completed", "cancelled"] as const;
export const QUOTE_LABEL: Record<string, string> = {
  new: "جديد", reviewing: "قيد الدراسة", quoted: "أُرسل العرض", accepted: "قبِل العميل", rejected: "مرفوض",
  in_progress: "قيد التنفيذ", completed: "مكتمل", cancelled: "ملغي",
};
const JOB_KINDS: Record<string, string> = { daily: "عمال يومية", skilled: "حرفيون مهرة", engineer: "مهندسون وفنيون", office: "إداري ومكتبي", other: "أخرى" };
const WAGE_UNITS: Record<string, string> = { day: "يومياً", week: "أسبوعياً", month: "شهرياً", project: "للمشروع", meter: "للمتر" };

let ready: Promise<void> | null = null;
export function ensureContractorsDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS contractors (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      tagline VARCHAR(200),
      description TEXT,
      specialties TEXT[] NOT NULL DEFAULT '{}',
      service_areas TEXT[] NOT NULL DEFAULT '{}',
      logo_url TEXT, cover_url TEXT,
      phone VARCHAR(40), whatsapp VARCHAR(40), email VARCHAR(120),
      address VARCHAR(200), city VARCHAR(80) DEFAULT 'الحصاحيصا',
      license_no VARCHAR(80), founded_year SMALLINT, team_size INTEGER,
      working_hours VARCHAR(80),
      accepts_quotes BOOLEAN NOT NULL DEFAULT TRUE,
      status VARCHAR(12) NOT NULL DEFAULT 'pending',
      admin_note TEXT, reviewed_by INTEGER, reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_contractors_status ON contractors (status)`);
    await query(`CREATE TABLE IF NOT EXISTS contractor_staff (
      contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(10) NOT NULL DEFAULT 'engineer',
      title VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (contractor_id, user_id)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS contractor_projects (
      id SERIAL PRIMARY KEY,
      contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      specialty VARCHAR(20),
      location VARCHAR(160),
      description TEXT,
      before_images TEXT[] NOT NULL DEFAULT '{}',
      after_images TEXT[] NOT NULL DEFAULT '{}',
      gallery TEXT[] NOT NULL DEFAULT '{}',
      completed_on DATE,
      duration_days INTEGER,
      client_label VARCHAR(120),
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS contractor_quotes (
      id SERIAL PRIMARY KEY,
      contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      client_name VARCHAR(120) NOT NULL,
      client_phone VARCHAR(40) NOT NULL,
      specialty VARCHAR(20),
      title VARCHAR(200) NOT NULL,
      details TEXT,
      location VARCHAR(200),
      budget VARCHAR(80),
      preferred_start DATE,
      images TEXT[] NOT NULL DEFAULT '{}',
      status VARCHAR(12) NOT NULL DEFAULT 'new',
      quote_amount NUMERIC(14,2),
      quote_note TEXT,
      quote_valid_until DATE,
      internal_note TEXT,
      assigned_to INTEGER,
      responded_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_cq_company ON contractor_quotes (contractor_id, status)`);
    await query(`CREATE SEQUENCE IF NOT EXISTS contractor_contract_seq START 1`);
    await query(`CREATE TABLE IF NOT EXISTS contractor_contracts (
      id SERIAL PRIMARY KEY,
      contract_no VARCHAR(30) UNIQUE NOT NULL,
      contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      quote_id INTEGER REFERENCES contractor_quotes(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      client_name VARCHAR(120) NOT NULL,
      client_phone VARCHAR(40),
      client_id_no VARCHAR(60),
      title VARCHAR(200) NOT NULL,
      scope TEXT NOT NULL,
      location VARCHAR(200),
      price NUMERIC(14,2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'ج.س',
      payment_schedule JSONB NOT NULL DEFAULT '[]',
      start_date DATE,
      duration_days INTEGER,
      warranty_months INTEGER,
      terms TEXT[] NOT NULL DEFAULT '{}',
      status VARCHAR(10) NOT NULL DEFAULT 'draft',
      client_response_note VARCHAR(300),
      accepted_at TIMESTAMPTZ,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS contractor_jobs (
      id SERIAL PRIMARY KEY,
      contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      kind VARCHAR(12) NOT NULL DEFAULT 'daily',
      title VARCHAR(160) NOT NULL,
      trade VARCHAR(80),
      workers_needed INTEGER NOT NULL DEFAULT 1,
      wage NUMERIC(12,2),
      wage_unit VARCHAR(10) NOT NULL DEFAULT 'day',
      duration VARCHAR(80),
      location VARCHAR(160),
      start_date DATE,
      description TEXT,
      requirements TEXT,
      status VARCHAR(8) NOT NULL DEFAULT 'open',
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS contractor_job_applications (
      id SERIAL PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES contractor_jobs(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      experience VARCHAR(200),
      note VARCHAR(400),
      status VARCHAR(10) NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (job_id, user_id)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS contractor_reviews (
      id SERIAL PRIMARY KEY,
      contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quote_id INTEGER REFERENCES contractor_quotes(id) ON DELETE SET NULL,
      rating SMALLINT NOT NULL,
      quality SMALLINT, punctuality SMALLINT, price_value SMALLINT,
      comment VARCHAR(600),
      reply VARCHAR(400),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (contractor_id, user_id, quote_id)
    )`);
  })().catch((e) => { ready = null; throw e; }));
}

// ─── أدوات ───────────────────────────────────────────────────
const clean = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
const int = (v: unknown) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x > 0 ? x : null; };
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
function httpsUrl(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s.length > 1000) return null;
  try { const u = new URL(s); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}
const urls = (v: unknown, max = 12) => (Array.isArray(v) ? v : []).map(httpsUrl).filter((x): x is string => !!x).slice(0, max);
const list = (v: unknown, max = 12, len = 60) => (Array.isArray(v) ? v : String(v ?? "").split(/[,،\n]/)).map((x) => clean(x, len)).filter(Boolean).slice(0, max);
const specs = (v: unknown) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map(String).filter((k) => SPEC.has(k as any)).slice(0, 8);
function fail(res: Response, err: unknown, tag: string) {
  logger.error({ err }, `contractors/${tag}`);
  return res.status(500).json({ error: "حدث خطأ في الخادم" });
}
async function moderate(...texts: (string | null | undefined)[]): Promise<string | null> {
  for (const t of texts) {
    if (!t) continue;
    const m = await checkContent(t.slice(0, 1500));
    if (!m.allowed) return m.reason || "المحتوى غير مسموح";
  }
  return null;
}

async function notifyUsers(ids: number[], title: string, body: string, data: Record<string, unknown>) {
  const uniq = [...new Set(ids.filter((x) => Number.isFinite(x) && x > 0))];
  if (!uniq.length) return;
  await query(`INSERT INTO notifications (user_id, type, title, body, data) SELECT u, 'contractors', $2, $3, $4 FROM UNNEST($1::int[]) AS u`,
    [uniq, title, body, JSON.stringify(data)]).catch(() => {});
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [uniq]);
    for (let i = 0; i < rows.length; i += 90) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
        body: JSON.stringify(rows.slice(i, i + 90).map((r: any) => ({ to: r.token, title, body, sound: "default", data }))),
      }).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[contractors] push"); }
}
async function staffIds(cid: number, perm?: Perm): Promise<number[]> {
  const { rows } = await query(`SELECT user_id, role FROM contractor_staff WHERE contractor_id=$1`, [cid]);
  return rows.filter((r: any) => !perm || ROLE_PERMS[r.role as Role]?.includes(perm)).map((r: any) => Number(r.user_id));
}
async function adminIds(): Promise<number[]> {
  return (await query(`SELECT id FROM users WHERE role='admin' AND COALESCE(is_banned,false)=false`)).rows.map((r: any) => r.id);
}

type Membership = { company: any; role: Role; perms: Perm[] };
async function membership(u: SessionUser | null): Promise<Membership | null> {
  if (!u) return null;
  const r = await query(
    `SELECT c.*, s.role FROM contractor_staff s JOIN contractors c ON c.id=s.contractor_id WHERE s.user_id=$1
     ORDER BY (s.role='owner') DESC, c.id LIMIT 1`, [u.id]);
  const row = r.rows[0];
  if (!row) return null;
  const role = (ROLES as readonly string[]).includes(row.role) ? (row.role as Role) : "engineer";
  return { company: row, role, perms: ROLE_PERMS[role] };
}
async function requirePerm(req: Request, res: Response, perm: Perm): Promise<(Membership & { user: SessionUser }) | null> {
  const u = await sessionUser(req);
  if (!u) { res.status(401).json({ error: "سجّل الدخول" }); return null; }
  const m = await membership(u);
  if (!m) { res.status(403).json({ error: "لست ضمن طاقم شركة مقاولات" }); return null; }
  if (!m.perms.includes(perm)) { res.status(403).json({ error: "صلاحيتك لا تشمل هذا القسم" }); return null; }
  if (m.company.status === "suspended" && perm !== "settings") { res.status(403).json({ error: "حساب الشركة موقوف — تواصل مع الإدارة" }); return null; }
  return { ...m, user: u };
}

const SPEC_LABEL: Record<string, string> = Object.fromEntries(SPECIALTIES.map((s) => [s.key, s.label]));
function companyRow(c: any) {
  return {
    id: c.id, name: c.name, tagline: c.tagline, description: c.description || "",
    specialties: c.specialties || [], specialty_labels: (c.specialties || []).map((k: string) => SPEC_LABEL[k] || k),
    service_areas: c.service_areas || [], logo_url: c.logo_url, cover_url: c.cover_url,
    phone: c.phone, whatsapp: c.whatsapp, email: c.email, address: c.address, city: c.city,
    license_no: c.license_no, founded_year: c.founded_year, team_size: c.team_size, working_hours: c.working_hours,
    accepts_quotes: c.accepts_quotes !== false, status: c.status, admin_note: c.admin_note ?? null, created_at: c.created_at,
    rating: c.rating != null ? Number(c.rating) : null, reviews_count: Number(c.reviews_count ?? 0),
    projects_count: Number(c.projects_count ?? 0), completed_count: Number(c.completed_count ?? 0),
  };
}
const COMPANY_STATS = `
  (SELECT ROUND(AVG(rating)::numeric,1) FROM contractor_reviews r WHERE r.contractor_id=c.id) AS rating,
  (SELECT COUNT(*) FROM contractor_reviews r WHERE r.contractor_id=c.id) AS reviews_count,
  (SELECT COUNT(*) FROM contractor_projects p WHERE p.contractor_id=c.id) AS projects_count,
  (SELECT COUNT(*) FROM contractor_quotes q WHERE q.contractor_id=c.id AND q.status='completed') AS completed_count`;
function contractNo(n: number) { return `HSW-CON-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`; }

/** نص العقد الجاهز للطباعة والمشاركة */
export function contractText(k: any, company: any): string {
  const money = (x: unknown) => `${Number(x).toLocaleString("en-US")} ${k.currency || "ج.س"}`;
  const sched = (k.payment_schedule || []) as { label: string; percent?: number; amount?: number }[];
  const lines = [
    `عقد مقاولة رقم: ${k.contract_no}`,
    `التاريخ: ${new Date(k.created_at || Date.now()).toLocaleDateString("ar-EG", { dateStyle: "long" })}`,
    "",
    "الطرف الأول (المقاول):",
    `  ${company.name}${company.license_no ? ` — ترخيص رقم ${company.license_no}` : ""}`,
    `  ${[company.address, company.city].filter(Boolean).join("، ")}${company.phone ? ` — هاتف ${company.phone}` : ""}`,
    "الطرف الثاني (العميل):",
    `  ${k.client_name}${k.client_id_no ? ` — إثبات هوية ${k.client_id_no}` : ""}${k.client_phone ? ` — هاتف ${k.client_phone}` : ""}`,
    "",
    `البند الأول — موضوع العقد: ${k.title}`,
    `البند الثاني — نطاق الأعمال:\n${k.scope}`,
    k.location ? `البند الثالث — موقع التنفيذ: ${k.location}` : "",
    `البند الرابع — قيمة العقد: ${money(k.price)} (شاملة المواد والمصنعية ما لم يُذكر خلاف ذلك).`,
    sched.length ? `البند الخامس — جدول الدفعات:\n${sched.map((s, i) => `  ${i + 1}. ${s.label}: ${s.amount != null ? money(s.amount) : ""}${s.percent != null ? ` (${s.percent}%)` : ""}`).join("\n")}` : "",
    `البند السادس — المدة: ${k.start_date ? `تبدأ الأعمال في ${k.start_date}` : "تبدأ الأعمال عند توقيع العقد"}${k.duration_days ? ` وتُنجز خلال ${k.duration_days} يوماً` : ""}.`,
    k.warranty_months ? `البند السابع — الضمان: يضمن الطرف الأول الأعمال المنفذة لمدة ${k.warranty_months} شهراً من تاريخ التسليم ضد عيوب التنفيذ.` : "",
    ...(k.terms?.length ? ["شروط إضافية:", ...k.terms.map((t: string, i: number) => `  ${i + 1}. ${t}`)] : []),
    "",
    "يقرّ الطرفان بأهليتهما للتعاقد، وأي نزاع يُحل ودياً وإلا فبالطرق القانونية المختصة.",
    "",
    `توقيع الطرف الأول: ______________        توقيع الطرف الثاني: ______________`,
    k.accepted_at ? `\nقبِل العميل العقد إلكترونياً عبر تطبيق حصاحيصاوي في ${new Date(k.accepted_at).toLocaleString("ar-EG")}.` : "",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

// ═══ العامة ═════════════════════════════════════════════════
router.get("/contractors/meta", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    const m = await membership(me);
    const counts = await query(`SELECT s AS key, COUNT(*)::int AS n FROM contractors, UNNEST(specialties) s WHERE status='active' GROUP BY s`);
    const cnt: Record<string, number> = Object.fromEntries(counts.rows.map((r: any) => [r.key, r.n]));
    const totals = (await query(`SELECT (SELECT COUNT(*) FROM contractors WHERE status='active')::int AS companies,
      (SELECT COUNT(*) FROM contractor_projects p JOIN contractors c ON c.id=p.contractor_id WHERE c.status='active')::int AS projects,
      (SELECT COUNT(*) FROM contractor_jobs j JOIN contractors c ON c.id=j.contractor_id WHERE c.status='active' AND j.status='open')::int AS jobs`)).rows[0];
    return res.json({
      specialties: SPECIALTIES.map((s) => ({ ...s, count: cnt[s.key] || 0 })),
      roles: ROLE_LABEL, role_perms: ROLE_PERMS, quote_labels: QUOTE_LABEL, job_kinds: JOB_KINDS, wage_units: WAGE_UNITS, totals,
      me: me ? { signed_in: true, is_admin: isStaff(me), company: m ? { id: m.company.id, name: m.company.name, status: m.company.status, role: m.role, perms: m.perms } : null } : { signed_in: false },
    });
  } catch (err) { return fail(res, err, "meta"); }
});

router.get("/contractors", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const q = req.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    let where = `c.status='active'`;
    if (q.specialty && SPEC.has(q.specialty as any)) { params.push(q.specialty); where += ` AND $${params.length} = ANY(c.specialties)`; }
    if (q.q && q.q.trim()) {
      params.push(`%${q.q.trim().slice(0, 60).replace(/[%_\\]/g, "\\$&")}%`);
      where += ` AND (c.name ILIKE $${params.length} OR c.description ILIKE $${params.length} OR c.tagline ILIKE $${params.length} OR array_to_string(c.service_areas,' ') ILIKE $${params.length})`;
    }
    const order = q.sort === "projects" ? "projects_count DESC" : q.sort === "new" ? "c.created_at DESC" : "rating DESC NULLS LAST, completed_count DESC";
    const { rows } = await query(`SELECT * FROM (SELECT c.*, ${COMPANY_STATS} FROM contractors c WHERE ${where}) c ORDER BY ${order} LIMIT 100`, params);
    return res.json({ companies: rows.map(companyRow) });
  } catch (err) { return fail(res, err, "list"); }
});

router.get("/contractors/jobs", async (_req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const { rows } = await query(
      `SELECT j.*, c.name AS company_name, c.logo_url FROM contractor_jobs j JOIN contractors c ON c.id=j.contractor_id
       WHERE j.status='open' AND c.status='active' ORDER BY j.created_at DESC LIMIT 100`);
    return res.json({ jobs: rows.map((j: any) => ({ ...j, wage: j.wage != null ? Number(j.wage) : null, kind_label: JOB_KINDS[j.kind], wage_unit_label: WAGE_UNITS[j.wage_unit] })) });
  } catch (err) { return fail(res, err, "jobs"); }
});

router.get("/contractors/:id", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const id = Number(req.params.id);
    const me = await sessionUser(req);
    const c = (await query(`SELECT c.*, ${COMPANY_STATS} FROM contractors c WHERE c.id=$1`, [id])).rows[0];
    const mine = me ? (await query(`SELECT 1 FROM contractor_staff WHERE contractor_id=$1 AND user_id=$2`, [id, me.id])).rows.length > 0 : false;
    if (!c || (c.status !== "active" && !mine && !isStaff(me))) return res.status(404).json({ error: "غير موجودة" });
    const projects = (await query(`SELECT * FROM contractor_projects WHERE contractor_id=$1 ORDER BY featured DESC, completed_on DESC NULLS LAST, id DESC LIMIT 60`, [id])).rows;
    const reviews = (await query(`SELECT r.*, u.name AS user_name, u.avatar_url FROM contractor_reviews r JOIN users u ON u.id=r.user_id WHERE r.contractor_id=$1 ORDER BY r.created_at DESC LIMIT 50`, [id])).rows;
    const jobs = (await query(`SELECT * FROM contractor_jobs WHERE contractor_id=$1 AND status='open' ORDER BY created_at DESC`, [id])).rows;
    const team = (await query(`SELECT s.role, s.title, u.name, u.avatar_url FROM contractor_staff s JOIN users u ON u.id=s.user_id WHERE s.contractor_id=$1 ORDER BY (s.role='owner') DESC, u.name`, [id])).rows;
    return res.json({
      company: companyRow(c), projects, team: team.map((t: any) => ({ ...t, role_label: ROLE_LABEL[t.role as Role] })),
      reviews, jobs: jobs.map((j: any) => ({ ...j, wage: j.wage != null ? Number(j.wage) : null, kind_label: JOB_KINDS[j.kind], wage_unit_label: WAGE_UNITS[j.wage_unit] })),
      is_staff: mine,
    });
  } catch (err) { return fail(res, err, "get"); }
});

// تسجيل شركة → بانتظار موافقة الإدارة
router.post("/contractors/register", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    if (me.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    if (await membership(me)) return res.status(409).json({ error: "أنت ضمن طاقم شركة بالفعل — افتح لوحة الشركة" });
    const b = req.body || {};
    const name = clean(b.name, 160);
    if (name.length < 3) return res.status(400).json({ error: "اكتب اسم الشركة" });
    const sp = specs(b.specialties);
    if (!sp.length) return res.status(400).json({ error: "اختر تخصصاً واحداً على الأقل" });
    const phone = clean(b.phone, 40);
    if (phone.replace(/\D/g, "").length < 9) return res.status(400).json({ error: "رقم هاتف الشركة مطلوب" });
    const bad = await moderate(name, clean(b.description, 3000), clean(b.tagline, 200));
    if (bad) return res.status(400).json({ error: bad });
    const { rows } = await query(
      `INSERT INTO contractors (owner_id, name, tagline, description, specialties, service_areas, phone, whatsapp, email, address, city, license_no, founded_year, team_size, logo_url, cover_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [me.id, name, clean(b.tagline, 200) || null, clean(b.description, 3000) || null, sp, list(b.service_areas), phone, clean(b.whatsapp, 40) || null,
       clean(b.email, 120) || null, clean(b.address, 200) || null, clean(b.city, 80) || "الحصاحيصا", clean(b.license_no, 80) || null,
       int(b.founded_year), int(b.team_size), httpsUrl(b.logo_url), httpsUrl(b.cover_url)]);
    await query(`INSERT INTO contractor_staff (contractor_id, user_id, role, title) VALUES ($1,$2,'owner',$3)`, [rows[0].id, me.id, clean(b.owner_title, 120) || "المالك"]);
    void notifyUsers(await adminIds(), "🏗️ طلب تسجيل شركة مقاولات", name, { screen: "admin-contractors" });
    return res.status(201).json({ company: companyRow(rows[0]), message: "استلمنا طلب تسجيل الشركة — ستراجعه الإدارة ويصلك إشعار" });
  } catch (err) { return fail(res, err, "register"); }
});

// ═══ العميل ═════════════════════════════════════════════════
router.post("/contractors/:id/quotes", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لطلب عرض سعر" });
    const c = (await query(`SELECT id, name, status, accepts_quotes FROM contractors WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!c || c.status !== "active") return res.status(404).json({ error: "الشركة غير متاحة" });
    if (c.accepts_quotes === false) return res.status(409).json({ error: "الشركة لا تستقبل طلبات أسعار حالياً" });
    const b = req.body || {};
    const title = clean(b.title, 200);
    if (title.length < 4) return res.status(400).json({ error: "اكتب عنواناً لطلبك (مثال: تشطيب شقة 3 غرف)" });
    const phone = clean(b.client_phone || me.phone, 40);
    if (phone.replace(/\D/g, "").length < 9) return res.status(400).json({ error: "رقم هاتفك مطلوب لتتواصل معك الشركة" });
    const today = (await query(`SELECT COUNT(*)::int AS n FROM contractor_quotes WHERE client_id=$1 AND created_at > NOW() - INTERVAL '1 day'`, [me.id])).rows[0].n;
    if (today >= 10) return res.status(429).json({ error: "وصلت لحد الطلبات اليومي" });
    const { rows } = await query(
      `INSERT INTO contractor_quotes (contractor_id, client_id, client_name, client_phone, specialty, title, details, location, budget, preferred_start, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [c.id, me.id, clean(b.client_name, 120) || me.name, phone, SPEC.has(b.specialty) ? b.specialty : null, title, clean(b.details, 3000) || null,
       clean(b.location, 200) || null, clean(b.budget, 80) || null, date(b.preferred_start), urls(b.images, 8)]);
    void notifyUsers(await staffIds(c.id, "quotes"), "📩 طلب عرض سعر جديد", `${title} — ${clean(b.client_name, 120) || me.name}`, { screen: "contractor-portal", tab: "quotes", id: rows[0].id });
    return res.status(201).json({ quote: rows[0], message: "أُرسل طلبك للشركة — ستصلك الردود هنا وبالإشعارات" });
  } catch (err) { return fail(res, err, "quote-create"); }
});

router.get("/contractors/my/quotes", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const { rows } = await query(
      `SELECT q.*, c.name AS company_name, c.logo_url, c.phone AS company_phone, c.whatsapp AS company_whatsapp,
         EXISTS(SELECT 1 FROM contractor_reviews r WHERE r.quote_id=q.id AND r.user_id=$1) AS reviewed,
         (SELECT row_to_json(k) FROM (SELECT id, contract_no, status, price FROM contractor_contracts WHERE quote_id=q.id ORDER BY id DESC LIMIT 1) k) AS contract
       FROM contractor_quotes q JOIN contractors c ON c.id=q.contractor_id WHERE q.client_id=$1 ORDER BY q.updated_at DESC LIMIT 100`, [me.id]);
    return res.json({ quotes: rows.map((q: any) => ({ ...q, quote_amount: q.quote_amount != null ? Number(q.quote_amount) : null, status_label: QUOTE_LABEL[q.status] })) });
  } catch (err) { return fail(res, err, "my-quotes"); }
});

router.post("/contractors/quotes/:qid/client", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const action = String(req.body?.action || "");
    const q = (await query(`SELECT * FROM contractor_quotes WHERE id=$1 AND client_id=$2`, [Number(req.params.qid), me.id])).rows[0];
    if (!q) return res.status(404).json({ error: "غير موجود" });
    let status: string | null = null;
    if (action === "accept" && q.status === "quoted") status = "accepted";
    else if (action === "decline" && q.status === "quoted") status = "rejected";
    else if (action === "cancel" && ["new", "reviewing", "quoted"].includes(q.status)) status = "cancelled";
    if (!status) return res.status(409).json({ error: "لا يمكن تنفيذ هذا الإجراء الآن" });
    await query(`UPDATE contractor_quotes SET status=$1, updated_at=NOW() WHERE id=$2`, [status, q.id]);
    const msg = status === "accepted" ? "✅ قبِل العميل عرض السعر" : status === "rejected" ? "اعتذر العميل عن عرض السعر" : "ألغى العميل الطلب";
    void notifyUsers(await staffIds(q.contractor_id, "quotes"), msg, q.title, { screen: "contractor-portal", tab: "quotes", id: q.id });
    return res.json({ ok: true, status });
  } catch (err) { return fail(res, err, "quote-client"); }
});

router.post("/contractors/quotes/:qid/review", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const q = (await query(`SELECT * FROM contractor_quotes WHERE id=$1 AND client_id=$2`, [Number(req.params.qid), me.id])).rows[0];
    if (!q) return res.status(404).json({ error: "غير موجود" });
    if (q.status !== "completed") return res.status(409).json({ error: "التقييم متاح بعد إكمال العمل" });
    const r5 = (v: unknown) => { const x = Math.round(Number(v)); return x >= 1 && x <= 5 ? x : null; };
    const rating = r5(req.body?.rating);
    if (!rating) return res.status(400).json({ error: "اختر تقييماً من 1 إلى 5" });
    const comment = clean(req.body?.comment, 600) || null;
    const bad = await moderate(comment);
    if (bad) return res.status(400).json({ error: bad });
    await query(`INSERT INTO contractor_reviews (contractor_id, user_id, quote_id, rating, quality, punctuality, price_value, comment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (contractor_id, user_id, quote_id) DO UPDATE SET rating=EXCLUDED.rating, quality=EXCLUDED.quality, punctuality=EXCLUDED.punctuality, price_value=EXCLUDED.price_value, comment=EXCLUDED.comment`,
      [q.contractor_id, me.id, q.id, rating, r5(req.body?.quality), r5(req.body?.punctuality), r5(req.body?.price_value), comment]);
    void notifyUsers(await staffIds(q.contractor_id, "settings"), `⭐ تقييم جديد ${rating}/5`, comment || q.title, { screen: "contractor" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "review"); }
});

router.get("/contractors/my/contracts", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const { rows } = await query(`SELECT k.*, c.name AS company_name FROM contractor_contracts k JOIN contractors c ON c.id=k.contractor_id
      WHERE k.client_id=$1 AND k.status <> 'draft' ORDER BY k.updated_at DESC LIMIT 100`, [me.id]);
    return res.json({ contracts: rows.map((k: any) => ({ ...k, price: Number(k.price) })) });
  } catch (err) { return fail(res, err, "my-contracts"); }
});

router.get("/contractors/contracts/:kid", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const k = (await query(`SELECT * FROM contractor_contracts WHERE id=$1`, [Number(req.params.kid)])).rows[0];
    if (!k) return res.status(404).json({ error: "غير موجود" });
    const isClient = k.client_id === me.id && k.status !== "draft";
    const staff = (await query(`SELECT role FROM contractor_staff WHERE contractor_id=$1 AND user_id=$2`, [k.contractor_id, me.id])).rows[0];
    if (!isClient && !staff && !isStaff(me)) return res.status(403).json({ error: "غير مسموح" });
    const company = (await query(`SELECT * FROM contractors WHERE id=$1`, [k.contractor_id])).rows[0];
    return res.json({ contract: { ...k, price: Number(k.price) }, text: contractText(k, company), company: companyRow(company), is_client: isClient });
  } catch (err) { return fail(res, err, "contract"); }
});

router.post("/contractors/contracts/:kid/respond", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const accept = req.body?.action === "accept";
    const r = await query(`UPDATE contractor_contracts SET status=$1::varchar, accepted_at=CASE WHEN $1::varchar='accepted' THEN NOW() ELSE NULL END,
        client_response_note=$2, updated_at=NOW() WHERE id=$3 AND client_id=$4 AND status='sent' RETURNING *`,
      [accept ? "accepted" : "declined", clean(req.body?.note, 300) || null, Number(req.params.kid), me.id]);
    const k = r.rows[0];
    if (!k) return res.status(409).json({ error: "لا يمكن الرد على هذا العقد" });
    if (accept && k.quote_id) await query(`UPDATE contractor_quotes SET status='in_progress', updated_at=NOW() WHERE id=$1 AND status IN ('quoted','accepted')`, [k.quote_id]);
    void notifyUsers(await staffIds(k.contractor_id, "contracts"), accept ? "🤝 وقّع العميل العقد إلكترونياً" : "اعتذر العميل عن العقد", `${k.contract_no} — ${k.title}`, { screen: "contractor-portal", tab: "contracts", id: k.id });
    return res.json({ ok: true, status: k.status });
  } catch (err) { return fail(res, err, "contract-respond"); }
});

router.post("/contractors/jobs/:jid/apply", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول للتقديم" });
    const j = (await query(`SELECT j.*, c.status AS cstatus FROM contractor_jobs j JOIN contractors c ON c.id=j.contractor_id WHERE j.id=$1`, [Number(req.params.jid)])).rows[0];
    if (!j || j.status !== "open" || j.cstatus !== "active") return res.status(404).json({ error: "الإعلان غير متاح" });
    const phone = clean(req.body?.phone || me.phone, 40);
    if (phone.replace(/\D/g, "").length < 9) return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    const r = await query(`INSERT INTO contractor_job_applications (job_id, user_id, name, phone, experience, note) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (job_id, user_id) DO NOTHING RETURNING id`,
      [j.id, me.id, clean(req.body?.name, 120) || me.name, phone, clean(req.body?.experience, 200) || null, clean(req.body?.note, 400) || null]);
    if (!r.rows[0]) return res.status(409).json({ error: "سبق أن قدّمت على هذا الإعلان" });
    void notifyUsers(await staffIds(j.contractor_id, "jobs"), "👷 متقدّم جديد", `${me.name} — ${j.title}`, { screen: "contractor-portal", tab: "jobs", id: j.id });
    return res.status(201).json({ ok: true, message: "وصل طلبك للشركة — ستتواصل معك إن ناسبها" });
  } catch (err) { return fail(res, err, "apply"); }
});

// ═══ لوحة الشركة وطاقمها ═════════════════════════════════════
router.get("/contractor-portal/me", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const m = await membership(me);
    if (!m) return res.json({ company: null });
    const c = (await query(`SELECT c.*, ${COMPANY_STATS} FROM contractors c WHERE c.id=$1`, [m.company.id])).rows[0];
    const counts = (await query(`SELECT
      (SELECT COUNT(*) FROM contractor_quotes WHERE contractor_id=$1 AND status='new')::int AS new_quotes,
      (SELECT COUNT(*) FROM contractor_quotes WHERE contractor_id=$1 AND status IN ('accepted','in_progress'))::int AS active_jobs,
      (SELECT COUNT(*) FROM contractor_contracts WHERE contractor_id=$1 AND status='sent')::int AS pending_contracts,
      (SELECT COUNT(*) FROM contractor_job_applications a JOIN contractor_jobs j ON j.id=a.job_id WHERE j.contractor_id=$1 AND a.status='new')::int AS new_applicants`, [m.company.id])).rows[0];
    return res.json({ company: companyRow(c), role: m.role, role_label: ROLE_LABEL[m.role], perms: m.perms, counts });
  } catch (err) { return fail(res, err, "portal-me"); }
});

router.put("/contractor-portal/company", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "settings"); if (!g) return;
    const b = req.body || {}; const c = g.company;
    const name = clean(b.name, 160) || c.name;
    const sp = b.specialties !== undefined ? specs(b.specialties) : c.specialties;
    if (!sp.length) return res.status(400).json({ error: "اختر تخصصاً واحداً على الأقل" });
    const bad = await moderate(name, clean(b.description, 3000), clean(b.tagline, 200));
    if (bad) return res.status(400).json({ error: bad });
    const pick = (k: string, n: number) => (b[k] !== undefined ? clean(b[k], n) || null : c[k]);
    const { rows } = await query(
      `UPDATE contractors SET name=$1, tagline=$2, description=$3, specialties=$4, service_areas=$5, phone=$6, whatsapp=$7, email=$8, address=$9, city=$10,
         license_no=$11, founded_year=$12, team_size=$13, working_hours=$14, accepts_quotes=$15, logo_url=$16, cover_url=$17,
         status=CASE WHEN status='rejected' THEN 'pending' ELSE status END, updated_at=NOW() WHERE id=$18 RETURNING *`,
      [name, pick("tagline", 200), pick("description", 3000), sp, b.service_areas !== undefined ? list(b.service_areas) : c.service_areas,
       pick("phone", 40), pick("whatsapp", 40), pick("email", 120), pick("address", 200), pick("city", 80), pick("license_no", 80),
       b.founded_year !== undefined ? int(b.founded_year) : c.founded_year, b.team_size !== undefined ? int(b.team_size) : c.team_size,
       pick("working_hours", 80), b.accepts_quotes !== undefined ? !!b.accepts_quotes : c.accepts_quotes,
       b.logo_url !== undefined ? httpsUrl(b.logo_url) : c.logo_url, b.cover_url !== undefined ? httpsUrl(b.cover_url) : c.cover_url, c.id]);
    return res.json({ company: companyRow(rows[0]) });
  } catch (err) { return fail(res, err, "company-update"); }
});

// المشاريع
router.get("/contractor-portal/projects", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "projects"); if (!g) return;
    const { rows } = await query(`SELECT * FROM contractor_projects WHERE contractor_id=$1 ORDER BY id DESC`, [g.company.id]);
    return res.json({ projects: rows });
  } catch (err) { return fail(res, err, "projects"); }
});
function parseProject(b: any): { error: string } | { v: any } {
  const title = clean(b.title, 200);
  if (title.length < 3) return { error: "اكتب عنوان المشروع" };
  const before = urls(b.before_images), after = urls(b.after_images), gallery = urls(b.gallery, 20);
  if (!before.length && !after.length && !gallery.length) return { error: "أضف صوراً للمشروع (قبل/بعد أو معرض)" };
  return { v: { title, specialty: SPEC.has(b.specialty) ? b.specialty : null, location: clean(b.location, 160) || null, description: clean(b.description, 3000) || null,
    before, after, gallery, completed_on: date(b.completed_on), duration_days: int(b.duration_days), client_label: clean(b.client_label, 120) || null, featured: !!b.featured } };
}
router.post("/contractor-portal/projects", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "projects"); if (!g) return;
    const p = parseProject(req.body || {});
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    const bad = await moderate(v.title, v.description);
    if (bad) return res.status(400).json({ error: bad });
    const { rows } = await query(`INSERT INTO contractor_projects (contractor_id, title, specialty, location, description, before_images, after_images, gallery, completed_on, duration_days, client_label, featured, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [g.company.id, v.title, v.specialty, v.location, v.description, v.before, v.after, v.gallery, v.completed_on, v.duration_days, v.client_label, v.featured, g.user.id]);
    return res.status(201).json({ project: rows[0] });
  } catch (err) { return fail(res, err, "project-create"); }
});
router.put("/contractor-portal/projects/:pid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "projects"); if (!g) return;
    const p = parseProject(req.body || {});
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    const bad = await moderate(v.title, v.description);
    if (bad) return res.status(400).json({ error: bad });
    const { rows } = await query(`UPDATE contractor_projects SET title=$1, specialty=$2, location=$3, description=$4, before_images=$5, after_images=$6, gallery=$7,
      completed_on=$8, duration_days=$9, client_label=$10, featured=$11 WHERE id=$12 AND contractor_id=$13 RETURNING *`,
      [v.title, v.specialty, v.location, v.description, v.before, v.after, v.gallery, v.completed_on, v.duration_days, v.client_label, v.featured, Number(req.params.pid), g.company.id]);
    if (!rows[0]) return res.status(404).json({ error: "غير موجود" });
    return res.json({ project: rows[0] });
  } catch (err) { return fail(res, err, "project-update"); }
});
router.delete("/contractor-portal/projects/:pid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "projects"); if (!g) return;
    await query(`DELETE FROM contractor_projects WHERE id=$1 AND contractor_id=$2`, [Number(req.params.pid), g.company.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "project-delete"); }
});

// طلبات الأسعار
router.get("/contractor-portal/quotes", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "quotes"); if (!g) return;
    const st = String(req.query.status || "");
    const params: unknown[] = [g.company.id];
    let where = "q.contractor_id=$1";
    if ((QUOTE_STATUSES as readonly string[]).includes(st)) { params.push(st); where += ` AND q.status=$2`; }
    else if (st === "open") where += ` AND q.status IN ('new','reviewing','quoted','accepted','in_progress')`;
    const { rows } = await query(`SELECT q.*, a.name AS assigned_name, u.avatar_url AS client_avatar FROM contractor_quotes q
      LEFT JOIN users a ON a.id=q.assigned_to LEFT JOIN users u ON u.id=q.client_id WHERE ${where} ORDER BY (q.status='new') DESC, q.updated_at DESC LIMIT 200`, params);
    const counts = (await query(`SELECT status, COUNT(*)::int AS n FROM contractor_quotes WHERE contractor_id=$1 GROUP BY status`, [g.company.id])).rows;
    return res.json({ quotes: rows.map((q: any) => ({ ...q, quote_amount: q.quote_amount != null ? Number(q.quote_amount) : null, status_label: QUOTE_LABEL[q.status] })),
      counts: Object.fromEntries(counts.map((c: any) => [c.status, c.n])) });
  } catch (err) { return fail(res, err, "portal-quotes"); }
});
router.patch("/contractor-portal/quotes/:qid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "quotes"); if (!g) return;
    const q = (await query(`SELECT * FROM contractor_quotes WHERE id=$1 AND contractor_id=$2`, [Number(req.params.qid), g.company.id])).rows[0];
    if (!q) return res.status(404).json({ error: "غير موجود" });
    const b = req.body || {};
    const status = (QUOTE_STATUSES as readonly string[]).includes(b.status) ? b.status : q.status;
    const amount = b.quote_amount !== undefined ? num(b.quote_amount) : (q.quote_amount != null ? Number(q.quote_amount) : null);
    if (status === "quoted" && (!amount || amount <= 0)) return res.status(400).json({ error: "أدخل قيمة العرض قبل إرساله" });
    const { rows } = await query(`UPDATE contractor_quotes SET status=$1, quote_amount=$2, quote_note=$3, quote_valid_until=$4, internal_note=$5,
      assigned_to=$6, responded_by=$7, updated_at=NOW() WHERE id=$8 RETURNING *`,
      [status, amount, b.quote_note !== undefined ? clean(b.quote_note, 2000) || null : q.quote_note,
       b.quote_valid_until !== undefined ? date(b.quote_valid_until) : q.quote_valid_until,
       b.internal_note !== undefined ? clean(b.internal_note, 1000) || null : q.internal_note,
       b.assigned_to !== undefined ? int(b.assigned_to) : q.assigned_to, g.user.id, q.id]);
    if (status !== q.status && q.client_id) {
      const msgs: Record<string, string> = {
        reviewing: "الشركة تدرس طلبك", quoted: `وصلك عرض سعر: ${Number(amount).toLocaleString("en-US")} ج.س`, rejected: "اعتذرت الشركة عن الطلب",
        in_progress: "بدأ تنفيذ الأعمال", completed: "اكتمل العمل 🎉 — قيّم تجربتك",
      };
      if (msgs[status]) void notifyUsers([q.client_id], `${g.company.name}`, `${msgs[status]} — ${q.title}`, { screen: "contractors", tab: "requests", id: q.id });
    }
    return res.json({ quote: { ...rows[0], quote_amount: rows[0].quote_amount != null ? Number(rows[0].quote_amount) : null, status_label: QUOTE_LABEL[rows[0].status] } });
  } catch (err) { return fail(res, err, "portal-quote-update"); }
});

// العقود
router.get("/contractor-portal/contracts", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "contracts"); if (!g) return;
    const { rows } = await query(`SELECT * FROM contractor_contracts WHERE contractor_id=$1 ORDER BY id DESC LIMIT 200`, [g.company.id]);
    return res.json({ contracts: rows.map((k: any) => ({ ...k, price: Number(k.price) })) });
  } catch (err) { return fail(res, err, "portal-contracts"); }
});
router.post("/contractor-portal/contracts", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "contracts"); if (!g) return;
    const b = req.body || {};
    let quote: any = null;
    if (b.quote_id) {
      quote = (await query(`SELECT * FROM contractor_quotes WHERE id=$1 AND contractor_id=$2`, [Number(b.quote_id), g.company.id])).rows[0];
      if (!quote) return res.status(404).json({ error: "طلب السعر غير موجود" });
    }
    const title = clean(b.title || quote?.title, 200);
    const scope = clean(b.scope, 6000);
    const price = num(b.price ?? quote?.quote_amount);
    const clientName = clean(b.client_name || quote?.client_name, 120);
    if (title.length < 3 || scope.length < 20) return res.status(400).json({ error: "اكتب عنوان العقد ونطاق الأعمال بوضوح (20 حرفاً على الأقل)" });
    if (!price || price <= 0) return res.status(400).json({ error: "أدخل قيمة العقد" });
    if (clientName.length < 3) return res.status(400).json({ error: "اسم العميل مطلوب" });
    const sched = (Array.isArray(b.payment_schedule) ? b.payment_schedule : []).slice(0, 10).map((s: any) => ({
      label: clean(s?.label, 80) || "دفعة", percent: num(s?.percent), amount: s?.amount != null ? num(s.amount) : (num(s?.percent) != null ? Math.round(price * Number(s.percent)) / 100 : null),
    })).filter((s: any) => s.label);
    const pct = sched.reduce((a: number, s: any) => a + (s.percent || 0), 0);
    if (sched.length && sched.every((s: any) => s.percent != null) && Math.round(pct) !== 100) return res.status(400).json({ error: `مجموع نسب الدفعات يجب أن يساوي 100% (الآن ${pct}%)` });
    const n = (await query(`SELECT nextval('contractor_contract_seq') AS n`)).rows[0].n;
    const status = b.send ? "sent" : "draft";
    const clientId = quote?.client_id ?? int(b.client_user_id);
    if (status === "sent" && !clientId) return res.status(400).json({ error: "لإرسال العقد للعميل داخل التطبيق اربطه بطلب سعر — أو احفظه مسودة وشارك نصه" });
    const { rows } = await query(
      `INSERT INTO contractor_contracts (contract_no, contractor_id, quote_id, client_id, client_name, client_phone, client_id_no, title, scope, location, price, payment_schedule,
         start_date, duration_days, warranty_months, terms, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [contractNo(Number(n)), g.company.id, quote?.id ?? null, clientId, clientName, clean(b.client_phone || quote?.client_phone, 40) || null,
       clean(b.client_id_no, 60) || null, title, scope, clean(b.location || quote?.location, 200) || null, price, JSON.stringify(sched),
       date(b.start_date), int(b.duration_days), int(b.warranty_months), list(b.terms, 15, 300), status, g.user.id]);
    const k = rows[0];
    if (status === "sent" && clientId) void notifyUsers([clientId], `📄 عقد جديد من ${g.company.name}`, `${k.contract_no} — راجعه ووافق عليه من التطبيق`, { screen: "contractors", tab: "contracts", id: k.id });
    return res.status(201).json({ contract: { ...k, price: Number(k.price) }, text: contractText(k, g.company) });
  } catch (err) { return fail(res, err, "contract-create"); }
});
router.patch("/contractor-portal/contracts/:kid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "contracts"); if (!g) return;
    const k = (await query(`SELECT * FROM contractor_contracts WHERE id=$1 AND contractor_id=$2`, [Number(req.params.kid), g.company.id])).rows[0];
    if (!k) return res.status(404).json({ error: "غير موجود" });
    const action = String(req.body?.action || "");
    const next = action === "send" && k.status === "draft" ? "sent" : action === "complete" && k.status === "accepted" ? "completed" : action === "cancel" && ["draft", "sent"].includes(k.status) ? "cancelled" : null;
    if (!next) return res.status(409).json({ error: "إجراء غير متاح لحالة العقد" });
    if (next === "sent" && !k.client_id) return res.status(400).json({ error: "العقد غير مرتبط بحساب عميل في التطبيق — شارك نصه مباشرة" });
    await query(`UPDATE contractor_contracts SET status=$1, updated_at=NOW() WHERE id=$2`, [next, k.id]);
    if (next === "completed" && k.quote_id) await query(`UPDATE contractor_quotes SET status='completed', updated_at=NOW() WHERE id=$1`, [k.quote_id]);
    if (k.client_id && next !== "cancelled") {
      void notifyUsers([k.client_id], g.company.name, next === "sent" ? `📄 عقد ${k.contract_no} بانتظار موافقتك` : `🎉 اكتملت الأعمال وفق العقد ${k.contract_no} — قيّم تجربتك`,
        { screen: "contractors", tab: next === "sent" ? "contracts" : "requests", id: k.id });
    }
    return res.json({ ok: true, status: next });
  } catch (err) { return fail(res, err, "contract-update"); }
});

// التوظيف وطلب العمال
router.get("/contractor-portal/jobs", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "jobs"); if (!g) return;
    const { rows } = await query(`SELECT j.*, (SELECT COUNT(*) FROM contractor_job_applications a WHERE a.job_id=j.id)::int AS applicants,
      (SELECT COUNT(*) FROM contractor_job_applications a WHERE a.job_id=j.id AND a.status='new')::int AS new_applicants
      FROM contractor_jobs j WHERE j.contractor_id=$1 ORDER BY j.id DESC`, [g.company.id]);
    return res.json({ jobs: rows.map((j: any) => ({ ...j, wage: j.wage != null ? Number(j.wage) : null, kind_label: JOB_KINDS[j.kind], wage_unit_label: WAGE_UNITS[j.wage_unit] })) });
  } catch (err) { return fail(res, err, "portal-jobs"); }
});
router.post("/contractor-portal/jobs", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "jobs"); if (!g) return;
    const b = req.body || {};
    const title = clean(b.title, 160);
    if (title.length < 3) return res.status(400).json({ error: "اكتب عنوان الإعلان (مثال: مطلوب 5 عمال بناء)" });
    const bad = await moderate(title, clean(b.description, 2000));
    if (bad) return res.status(400).json({ error: bad });
    const { rows } = await query(`INSERT INTO contractor_jobs (contractor_id, kind, title, trade, workers_needed, wage, wage_unit, duration, location, start_date, description, requirements, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [g.company.id, JOB_KINDS[b.kind] ? b.kind : "daily", title, clean(b.trade, 80) || null, int(b.workers_needed) || 1, num(b.wage),
       WAGE_UNITS[b.wage_unit] ? b.wage_unit : "day", clean(b.duration, 80) || null, clean(b.location, 160) || null, date(b.start_date),
       clean(b.description, 2000) || null, clean(b.requirements, 1000) || null, g.user.id]);
    return res.status(201).json({ job: rows[0] });
  } catch (err) { return fail(res, err, "job-create"); }
});
router.patch("/contractor-portal/jobs/:jid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "jobs"); if (!g) return;
    const st = req.body?.status === "closed" ? "closed" : "open";
    const r = await query(`UPDATE contractor_jobs SET status=$1 WHERE id=$2 AND contractor_id=$3 RETURNING id`, [st, Number(req.params.jid), g.company.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجود" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "job-update"); }
});
router.get("/contractor-portal/jobs/:jid/applications", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "jobs"); if (!g) return;
    const { rows } = await query(`SELECT a.*, u.avatar_url FROM contractor_job_applications a JOIN contractor_jobs j ON j.id=a.job_id
      LEFT JOIN users u ON u.id=a.user_id WHERE a.job_id=$1 AND j.contractor_id=$2 ORDER BY a.created_at DESC`, [Number(req.params.jid), g.company.id]);
    return res.json({ applications: rows });
  } catch (err) { return fail(res, err, "applications"); }
});
router.patch("/contractor-portal/applications/:aid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "jobs"); if (!g) return;
    const st = ["accepted", "rejected", "contacted"].includes(req.body?.status) ? req.body.status : null;
    if (!st) return res.status(400).json({ error: "حالة غير صالحة" });
    const r = await query(`UPDATE contractor_job_applications a SET status=$1 FROM contractor_jobs j WHERE a.id=$2 AND j.id=a.job_id AND j.contractor_id=$3 RETURNING a.user_id, j.title`,
      [st, Number(req.params.aid), g.company.id]);
    const a = r.rows[0];
    if (!a) return res.status(404).json({ error: "غير موجود" });
    if (a.user_id && st !== "contacted") void notifyUsers([a.user_id], g.company.name, st === "accepted" ? `✅ قُبلت في: ${a.title} — ستتواصل معك الشركة` : `بخصوص تقديمك على: ${a.title} — نعتذر هذه المرة`, { screen: "contractors", tab: "jobs" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "application-update"); }
});

// الطاقم والصلاحيات
router.get("/contractor-portal/staff", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "staff"); if (!g) return;
    const { rows } = await query(`SELECT s.*, u.name, u.avatar_url, u.phone FROM contractor_staff s JOIN users u ON u.id=s.user_id WHERE s.contractor_id=$1 ORDER BY (s.role='owner') DESC, s.created_at`, [g.company.id]);
    return res.json({ staff: rows.map((r: any) => ({ ...r, role_label: ROLE_LABEL[r.role as Role], perms: ROLE_PERMS[r.role as Role] })), roles: ROLE_LABEL, role_perms: ROLE_PERMS });
  } catch (err) { return fail(res, err, "staff"); }
});
router.get("/contractor-portal/users/lookup", async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "staff"); if (!g) return;
    const q = clean(req.query.q, 60);
    if (q.length < 2) return res.json({ users: [] });
    const digits = q.replace(/\D/g, "");
    const { rows } = await query(`SELECT id, name, avatar_url FROM users WHERE (name ILIKE $1 OR ($2 <> '' AND regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%' || $2 || '%') OR id::text=$3)
      AND COALESCE(is_banned,false)=false ORDER BY name LIMIT 15`, [`%${q.replace(/[%_\\]/g, "\\$&")}%`, digits.length >= 4 ? digits : "", q]);
    return res.json({ users: rows });
  } catch (err) { return fail(res, err, "lookup"); }
});
router.put("/contractor-portal/staff/:uid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "staff"); if (!g) return;
    const uid = Number(req.params.uid);
    const role = (["manager", "engineer", "sales"] as string[]).includes(req.body?.role) ? req.body.role : null;
    if (!role) return res.status(400).json({ error: "اختر دوراً (مدير/مهندس/مبيعات)" });
    if (uid === g.user.id) return res.status(400).json({ error: "لا يمكنك تغيير دورك" });
    const other = (await query(`SELECT contractor_id FROM contractor_staff WHERE user_id=$1 AND contractor_id<>$2`, [uid, g.company.id])).rows[0];
    if (other) return res.status(409).json({ error: "هذا العضو ضمن طاقم شركة أخرى" });
    const cur = (await query(`SELECT role FROM contractor_staff WHERE contractor_id=$1 AND user_id=$2`, [g.company.id, uid])).rows[0];
    if (cur?.role === "owner") return res.status(403).json({ error: "لا يمكن تعديل المالك" });
    await query(`INSERT INTO contractor_staff (contractor_id, user_id, role, title) VALUES ($1,$2,$3,$4)
      ON CONFLICT (contractor_id, user_id) DO UPDATE SET role=EXCLUDED.role, title=EXCLUDED.title`, [g.company.id, uid, role, clean(req.body?.title, 120) || null]);
    if (!cur) void notifyUsers([uid], `🏗️ انضممت لطاقم ${g.company.name}`, `دورك: ${ROLE_LABEL[role as Role]} — افتح لوحة الشركة`, { screen: "contractor-portal" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "staff-put"); }
});
router.delete("/contractor-portal/staff/:uid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const g = await requirePerm(req, res, "staff"); if (!g) return;
    const r = await query(`DELETE FROM contractor_staff WHERE contractor_id=$1 AND user_id=$2 AND role<>'owner' RETURNING user_id`, [g.company.id, Number(req.params.uid)]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجود أو هو المالك" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "staff-del"); }
});

// ═══ الإدارة ═══════════════════════════════════════════════
router.get("/admin/contractors", async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const st = ["pending", "active", "suspended", "rejected"].includes(String(req.query.status)) ? String(req.query.status) : null;
    const { rows } = await query(`SELECT c.*, u.name AS owner_name, u.phone AS owner_phone, ${COMPANY_STATS} FROM contractors c JOIN users u ON u.id=c.owner_id
      WHERE ($1::text IS NULL OR c.status=$1) ORDER BY (c.status='pending') DESC, c.created_at DESC LIMIT 300`, [st]);
    const counts = (await query(`SELECT status, COUNT(*)::int AS n FROM contractors GROUP BY status`)).rows;
    return res.json({ companies: rows.map((c: any) => ({ ...companyRow(c), owner_name: c.owner_name, owner_phone: c.owner_phone, owner_id: c.owner_id })),
      counts: Object.fromEntries(counts.map((c: any) => [c.status, c.n])) });
  } catch (err) { return fail(res, err, "admin-list"); }
});
router.patch("/admin/contractors/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureContractorsDb();
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const status = ["active", "rejected", "suspended", "pending"].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: "حالة غير صالحة" });
    const note = clean(req.body?.note, 400) || null;
    if ((status === "rejected" || status === "suspended") && !note) return res.status(400).json({ error: "اكتب السبب" });
    const r = await query(`UPDATE contractors SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW() WHERE id=$4 RETURNING *`,
      [status, note, me!.id, Number(req.params.id)]);
    const c = r.rows[0];
    if (!c) return res.status(404).json({ error: "غير موجودة" });
    const msg: Record<string, string> = { active: "🎉 اعتُمدت شركتك — أصبحت ظاهرة للعملاء", rejected: `لم يُعتمد طلب الشركة: ${note}`, suspended: `أُوقفت الشركة مؤقتاً: ${note}`, pending: "أُعيدت الشركة للمراجعة" };
    void notifyUsers(await staffIds(c.id), c.name, msg[status], { screen: "contractor-portal" });
    return res.json({ company: companyRow(c) });
  } catch (err) { return fail(res, err, "admin-update"); }
});

export default router;
