// ════════════════════════════════════════════════════════════════
// 🚑 مساحة جمعية الهلال الأحمر السوداني (فرعية الحصاحيصا)
// الأعضاء حسابات حصاحيصاوي عادية بدور داخل الجمعية:
//   volunteer متطوع · paramedic مسعف · leader قائد فريق · admin إدارة الفرع
// الإدارة: مدراء الفرع + مدراء حصاحيصاوي. بطاقة مسعف برمز تحقق عام.
// التكامل: نقاط حضور الأنشطة تُضاف لرصيد التطوع في حصاحيصاوي،
// وربط اختياري برمز بطاقة المستجيب في تطبيق «مسعف».
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomBytes, randomInt } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { acceptDocRef, exposeRow, exposeRows, audit } from "../lib/srcs-shared";

const router = Router();
const ROLES = ["volunteer", "paramedic", "leader", "admin"] as const;
type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { volunteer: "متطوع", paramedic: "مسعف", leader: "قائد فريق", admin: "إدارة الفرع" };
const AUDIENCES = ["public", "members", "paramedics", "admins"] as const;
const ACTIVITY_TYPES = ["training", "campaign", "response", "awareness", "blood", "relief", "other"] as const;
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const API_BASE = (process.env.PUBLIC_API_BASE || "https://api-server-gilt-ten.vercel.app").replace(/\/$/, "");

let ready: Promise<void> | null = null;
export function ensureRedCrescentDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS srcs_members (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(16) NOT NULL DEFAULT 'volunteer',
        desired_role VARCHAR(16),
        status VARCHAR(12) NOT NULL DEFAULT 'pending',
        unit VARCHAR(120),
        phone VARCHAR(30),
        blood_type VARCHAR(4),
        experience TEXT,
        certifications TEXT,
        musif_code VARCHAR(40),
        card_no VARCHAR(30) UNIQUE,
        card_token VARCHAR(40) UNIQUE,
        card_issued_at TIMESTAMPTZ,
        card_expires_at TIMESTAMPTZ,
        admin_note TEXT,
        reviewed_by INTEGER,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_meetings (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        agenda TEXT,
        place VARCHAR(200),
        starts_at TIMESTAMPTZ NOT NULL,
        audience VARCHAR(12) NOT NULL DEFAULT 'members',
        minutes TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_meeting_rsvps (
        meeting_id INTEGER NOT NULL REFERENCES srcs_meetings(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'going',
        attended BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (meeting_id, user_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        audience VARCHAR(12) NOT NULL DEFAULT 'members',
        pinned BOOLEAN NOT NULL DEFAULT FALSE,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_activities (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        type VARCHAR(16) NOT NULL DEFAULT 'other',
        description TEXT,
        place VARCHAR(200),
        happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        images JSONB NOT NULL DEFAULT '[]',
        beneficiaries INTEGER NOT NULL DEFAULT 0,
        published BOOLEAN NOT NULL DEFAULT TRUE,
        points INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_activity_participants (
        activity_id INTEGER NOT NULL REFERENCES srcs_activities(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (activity_id, user_id)
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_srcs_members_status ON srcs_members(status, role)`);
      // مستندات طلب الانضمام (تُراجعها إدارة الفرع): الرقم الوطني + صورة الهوية + صورة الشهادة
      await query(`ALTER TABLE srcs_members ADD COLUMN IF NOT EXISTS national_id_no VARCHAR(24)`);
      await query(`ALTER TABLE srcs_members ADD COLUMN IF NOT EXISTS id_doc_url TEXT`);
      await query(`ALTER TABLE srcs_members ADD COLUMN IF NOT EXISTS cert_doc_url TEXT`);
      // الوحدة/الجهة، الدفعة، الصلاحيات الممنوحة، وإلغاء البطاقة
      for (const col of ["affiliation VARCHAR(160)", "cohort_id INTEGER", "perms TEXT[] NOT NULL DEFAULT '{}'", "revoked_at TIMESTAMPTZ", "revoke_reason TEXT"])
        await query(`ALTER TABLE srcs_members ADD COLUMN IF NOT EXISTS ${col}`);
      await query(`ALTER TABLE srcs_meetings ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`);
      // الدفعات (سجل لكل دفعة)
      await query(`CREATE TABLE IF NOT EXISTS srcs_cohorts (
        id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, year INTEGER, notes TEXT,
        created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      // الدورات والورش التدريبية
      await query(`CREATE TABLE IF NOT EXISTS srcs_courses (
        id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, kind VARCHAR(12) NOT NULL DEFAULT 'course',
        description TEXT, trainer VARCHAR(160), place VARCHAR(200), starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
        seats INTEGER NOT NULL DEFAULT 0, cohort_id INTEGER, cover_url TEXT, files JSONB NOT NULL DEFAULT '[]',
        audience VARCHAR(12) NOT NULL DEFAULT 'public', registration_open BOOLEAN NOT NULL DEFAULT TRUE,
        pass_mark NUMERIC(5,2) NOT NULL DEFAULT 50, max_score NUMERIC(6,2) NOT NULL DEFAULT 100,
        results_published BOOLEAN NOT NULL DEFAULT FALSE, cert_enabled BOOLEAN NOT NULL DEFAULT TRUE, cert_hours INTEGER,
        published BOOLEAN NOT NULL DEFAULT TRUE, created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_enrollments (
        id SERIAL PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES srcs_courses(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'registered', attended BOOLEAN NOT NULL DEFAULT FALSE,
        score NUMERIC(6,2), passed BOOLEAN, result_note TEXT,
        cert_status VARCHAR(12) NOT NULL DEFAULT 'none', cert_amount NUMERIC(12,2), payment_ref VARCHAR(120), payment_proof_url TEXT,
        cert_no VARCHAR(40) UNIQUE, cert_token VARCHAR(40) UNIQUE, cert_issued_at TIMESTAMPTZ, cert_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (course_id, user_id))`);
      // ملف مستندات الفرد
      await query(`CREATE TABLE IF NOT EXISTS srcs_member_docs (
        id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, kind VARCHAR(20) NOT NULL DEFAULT 'other', title VARCHAR(200) NOT NULL,
        url TEXT NOT NULL, verified BOOLEAN NOT NULL DEFAULT FALSE, source VARCHAR(20) NOT NULL DEFAULT 'member',
        profile_cert_id INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (user_id, url))`);
      await query(`CREATE INDEX IF NOT EXISTS idx_srcs_docs_user ON srcs_member_docs(user_id)`);
      // إعدادات (سعر الشهادة الإلكترونية …) — يعدّلها مدير حصاحيصاوي فقط
      await query(`CREATE TABLE IF NOT EXISTS srcs_private_files (
        id UUID PRIMARY KEY, owner_id INTEGER NOT NULL, kind VARCHAR(20) NOT NULL DEFAULT 'other', mime VARCHAR(60) NOT NULL,
        name VARCHAR(160), size INTEGER, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await query(`CREATE INDEX IF NOT EXISTS idx_srcs_pfiles_owner ON srcs_private_files(owner_id)`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_audit (
        id SERIAL PRIMARY KEY, actor_id INTEGER, action VARCHAR(60) NOT NULL, target VARCHAR(200) NOT NULL,
        detail JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_reminders_sent (
        kind VARCHAR(20) NOT NULL, ref_id INTEGER NOT NULL, stage VARCHAR(40) NOT NULL, sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (kind, ref_id, stage))`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_settings (key VARCHAR(60) PRIMARY KEY, value TEXT NOT NULL, updated_by INTEGER, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

router.use(["/srcs", "/public/srcs"], async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureRedCrescentDb(); return next(); }
  catch (err) { logger.error({ err }, "[srcs] ensure"); return res.status(500).json({ error: "تعذّر التهيئة" }); }
});

const fail = (res: Response, err: unknown, where: string, msg = "خطأ في الخادم") => {
  logger.error({ err }, `[srcs] ${where}`); return res.status(500).json({ error: msg });
};
const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);

export async function membership(userId: number | string | undefined) {
  if (!userId) return null;
  return (await query(`SELECT * FROM srcs_members WHERE user_id=$1`, [userId])).rows[0] ?? null;
}
// ═══ الصلاحيات ═══════════════════════════════════════════════════
// مدير حصاحيصاوي يملك كل شيء ويمنح الصلاحيات لكل فرد؛ ولكل دور صلاحيات افتراضية.
export const PERMS = ["requests", "members", "meetings", "announcements", "activities", "courses", "results", "cohorts", "certificates"] as const;
export type Perm = (typeof PERMS)[number];
const ROLE_DEFAULT_PERMS: Record<Role, Perm[]> = {
  volunteer: [], paramedic: [],
  leader: ["meetings", "announcements", "activities"],
  admin: [...PERMS],
};
export const isAppAdmin = (me: SessionUser | null) => !!me && me.role === "admin";
export async function permsOf(me: SessionUser | null): Promise<Perm[]> {
  if (!me) return [];
  if (isAppAdmin(me)) return [...PERMS];
  const m = await membership(me.id);
  if (!m || m.status !== "active") return [];
  const extra = (Array.isArray(m.perms) ? m.perms : []).filter((p: string) => (PERMS as readonly string[]).includes(p));
  return [...new Set([...ROLE_DEFAULT_PERMS[m.role as Role] ?? [], ...extra])] as Perm[];
}
/** يتحقق أن المستخدم يملك إحدى الصلاحيات المطلوبة؛ وإلا يرد 403 */
export async function requirePerm(req: Request, res: Response, ...need: Perm[]): Promise<SessionUser | null> {
  const me = await sessionUser(req);
  const mine = await permsOf(me);
  if (!me || !(need.length ? need.some((p) => mine.includes(p)) : mine.length)) { res.status(403).json({ error: "ليست لديك صلاحية لهذا القسم" }); return null; }
  return me;
}

/** إدارة الفرع: مدير حصاحيصاوي، أو عضو نشط بدور admin في الجمعية */
async function isBranchAdmin(me: SessionUser | null): Promise<boolean> {
  if (!me) return false;
  if (me.role === "admin") return true;
  const m = await membership(me.id);
  return !!m && m.status === "active" && m.role === "admin";
}
/** الجماهير التي يحق للمستخدم رؤيتها */
function audiencesFor(m: any, admin: boolean): string[] {
  if (admin) return [...AUDIENCES];
  if (!m || m.status !== "active") return ["public"];
  const a = ["public", "members"];
  if (m.role === "paramedic" || m.role === "leader") a.push("paramedics");
  return a;
}

export async function notifyUsers(userIds: number[], title: string, body: string, data: Record<string, unknown> = {}) {
  if (!userIds.length) return;
  try {
    await query(`INSERT INTO notifications (user_id, type, title, body, data)
                 SELECT u, 'srcs', $2, $3, $4 FROM UNNEST($1::int[]) AS u`, [userIds, title, body, JSON.stringify({ ...data, screen: "red-crescent" })]);
  } catch { /* جدول الإشعارات قد يختلف — لا نعطّل العملية */ }
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [userIds]);
    for (let i = 0; i < rows.length; i += 90) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
        body: JSON.stringify(rows.slice(i, i + 90).map((r: any) => ({ to: r.token, title, body, sound: "default", priority: "high", data: { ...data, screen: "red-crescent" } }))),
      }).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[srcs] push"); }
}
export async function audienceUserIds(audience: string): Promise<number[]> {
  const roles = audience === "admins" ? ["admin"] : audience === "paramedics" ? ["paramedic", "leader", "admin"] : ROLES as unknown as string[];
  const r = await query(`SELECT user_id FROM srcs_members WHERE status='active' AND role = ANY($1::text[])`, [roles]);
  return r.rows.map((x: any) => Number(x.user_id));
}

function newCard() {
  const y = new Date().getFullYear();
  return { no: `SRCS-HSH-${y}-${randomInt(10000, 100000)}`, token: randomBytes(12).toString("hex") };
}
export const API_PUBLIC_BASE = API_BASE;
const cardUrl = (token: string) => `${API_BASE}/api/public/srcs/verify/${token}`;

/**
 * ملف مستندات الفرد: تُحفظ مستندات طلب الانضمام في ملفه داخل الجمعية،
 * وتُضاف الشهادة تلقائياً (نسخة خاصة غير منشورة) إلى «الشهادات» في ملفه الشخصي بحصاحيصاوي.
 * صورة الهوية لا تُنسخ إلى الملف الشخصي حفاظاً على الخصوصية.
 */
export async function syncJoinDocs(userId: number, idDoc: string | null, certDoc: string | null) {
  try {
    if (idDoc) await query(`INSERT INTO srcs_member_docs (user_id, kind, title, url, source) VALUES ($1,'national_id','صورة البطاقة القومية / الرقم الوطني',$2,'join') ON CONFLICT (user_id, url) DO NOTHING`, [userId, idDoc]);
    if (certDoc) {
      const d = await query(`INSERT INTO srcs_member_docs (user_id, kind, title, url, source) VALUES ($1,'certificate','شهادة الإسعافات الأولية / الدورة',$2,'join')
                             ON CONFLICT (user_id, url) DO NOTHING RETURNING id`, [userId, certDoc]);
      if (d.rows[0] && !certDoc.startsWith("priv:")) await linkDocToProfile(userId, Number(d.rows[0].id), "شهادة إسعافات أولية (مرفقة بطلب الهلال الأحمر)", certDoc, null, null, false);
    }
  } catch (err) { logger.warn({ err }, "[srcs] sync docs"); }
}
/** يضيف نسخة إلى user_certificates في الملف الشخصي (إن وُجد الجدول) ويربطها بمستند الجمعية */
export async function linkDocToProfile(userId: number, docId: number | null, title: string, fileUrl: string | null, credentialId: string | null, credentialUrl: string | null, isPublic: boolean, reviewed = false) {
  try {
    const n = (await query(`SELECT COUNT(*)::int AS n FROM user_certificates WHERE user_id=$1`, [userId])).rows[0].n;
    const ext = (fileUrl || "").split("?")[0].split(".").pop()?.toLowerCase();
    const r = await query(
      `INSERT INTO user_certificates (user_id, kind, title, issuer, issued_on, credential_id, credential_url, file_url, file_type, is_public, reviewed, sort_order)
       VALUES ($1,'course',$2,'جمعية الهلال الأحمر السوداني — فرعية الحصاحيصا',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [userId, title.slice(0, 200), new Date().toISOString().slice(0, 10), credentialId, credentialUrl, fileUrl, ext === "pdf" ? "pdf" : fileUrl ? "image" : null, isPublic, reviewed, n]);
    if (docId && r.rows[0]) await query(`UPDATE srcs_member_docs SET profile_cert_id=$2 WHERE id=$1`, [docId, r.rows[0].id]);
    return Number(r.rows[0]?.id) || null;
  } catch (err) { logger.warn({ err }, "[srcs] link profile cert"); return null; }
}

// ═══ عام ═══════════════════════════════════════════════════════
router.get("/srcs/overview", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    const m = me ? await membership(me.id) : null;
    const admin = await isBranchAdmin(me);
    const perms = await permsOf(me);
    const aud = audiencesFor(m, admin);
    const [stats, ann, acts] = await Promise.all([
      query(`SELECT
          (SELECT COUNT(*)::int FROM srcs_members WHERE status='active') AS members,
          (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND role IN ('paramedic','leader')) AS paramedics,
          (SELECT COUNT(*)::int FROM srcs_activities WHERE published) AS activities,
          (SELECT COALESCE(SUM(beneficiaries),0)::int FROM srcs_activities WHERE published) AS beneficiaries`),
      query(`SELECT id, title, body, audience, pinned, created_at FROM srcs_announcements WHERE audience = ANY($1::text[])
             ORDER BY pinned DESC, created_at DESC LIMIT 15`, [aud]),
      query(`SELECT a.*, (SELECT COUNT(*)::int FROM srcs_activity_participants p WHERE p.activity_id=a.id) AS volunteers
               FROM srcs_activities a WHERE published OR $1 ORDER BY happened_at DESC LIMIT 30`, [admin]),
    ]);
    const myMeetings = m && m.status === "active" ? (await query(
      `SELECT mt.id, mt.title, mt.place, mt.starts_at, mt.ends_at, mt.agenda, mt.audience, r.status AS my_rsvp
         FROM srcs_meetings mt LEFT JOIN srcs_meeting_rsvps r ON r.meeting_id=mt.id AND r.user_id=$1
        WHERE mt.audience = ANY($2::text[]) AND mt.starts_at > NOW() - INTERVAL '6 hours'
        ORDER BY mt.starts_at LIMIT 10`, [me!.id, aud])).rows : [];
    return res.json({
      stats: stats.rows[0], announcements: ann.rows, activities: acts.rows, meetings: myMeetings,
      membership: m ? { ...exposeRow(m), role_label: ROLE_LABEL[m.role as Role], card_url: m.card_token ? cardUrl(m.card_token) : null } : null,
      isAdmin: admin || perms.length > 0, perms, isAppAdmin: isAppAdmin(me),
    });
  } catch (err) { return fail(res, err, "overview"); }
});

// ═══ العضوية ═══════════════════════════════════════════════════
router.post("/srcs/join", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لتقديم طلب الانضمام" });
    const b = req.body || {};
    const desired = ROLES.includes(b.desired_role) && b.desired_role !== "admin" ? b.desired_role : "volunteer";
    const blood = BLOOD.includes(String(b.blood_type)) ? String(b.blood_type) : null;
    const nid = str(b.national_id_no, 30).replace(/\s/g, "");
    const nationalId = /^\d{6,20}$/.test(nid) ? nid : null;
    const idDoc = await acceptDocRef(b.id_doc_url, Number(me.id)), certDoc = await acceptDocRef(b.cert_doc_url, Number(me.id));
    if (desired === "paramedic" && (!nationalId || !idDoc || !certDoc))
      return res.status(400).json({ error: "طلب المسعف يتطلب الرقم الوطني وصورة الهوية وصورة الشهادة لمراجعتها" });
    const cur = await membership(me.id);
    if (cur && cur.status === "banned") return res.status(403).json({ error: "عضويتك محظورة — راجع إدارة حصاحيصاوي" });
    if (cur && (cur.status === "active" || cur.status === "pending"))
      return res.status(409).json({ error: cur.status === "active" ? "أنت عضو بالفعل" : "طلبك قيد المراجعة" });
    const r = await query(
      `INSERT INTO srcs_members (user_id, desired_role, role, status, unit, phone, blood_type, experience, certifications, musif_code, national_id_no, id_doc_url, cert_doc_url)
       VALUES ($1,$2,'volunteer','pending',$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (user_id) DO UPDATE SET desired_role=$2, status='pending', unit=$3, phone=$4, blood_type=$5,
         experience=$6, certifications=$7, musif_code=$8, national_id_no=$9, id_doc_url=$10, cert_doc_url=$11, admin_note=NULL, created_at=NOW()
       RETURNING *`,
      [me.id, desired, str(b.unit, 120) || null, str(b.phone, 30) || me.phone || null, blood, str(b.experience) || null, str(b.certifications) || null, str(b.musif_code, 40) || null,
       nationalId, idDoc, certDoc]);
    await syncJoinDocs(Number(me.id), idDoc, certDoc);
    const admins = (await query(`SELECT user_id FROM srcs_members WHERE status='active' AND role='admin'`)).rows.map((x: any) => Number(x.user_id));
    notifyUsers(admins, "🚑 طلب انضمام جديد", `${me.name} يطلب الانضمام ${desired === "paramedic" ? "كمسعف — المستندات مرفقة للمراجعة" : "كمتطوع"}`, { kind: "srcs_request" });
    return res.json({ membership: exposeRow(r.rows[0]) });
  } catch (err) { return fail(res, err, "join"); }
});

router.patch("/srcs/me", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const b = req.body || {};
    const blood = b.blood_type === undefined ? undefined : BLOOD.includes(String(b.blood_type)) ? String(b.blood_type) : null;
    const r = await query(
      `UPDATE srcs_members SET musif_code=COALESCE($2, musif_code), blood_type=COALESCE($3, blood_type), phone=COALESCE($4, phone)
        WHERE user_id=$1 RETURNING *`,
      [me.id, b.musif_code === undefined ? null : str(b.musif_code, 40), blood ?? null, b.phone === undefined ? null : str(b.phone, 30)]);
    if (!r.rows[0]) return res.status(404).json({ error: "لست عضواً بعد" });
    return res.json({ membership: r.rows[0] });
  } catch (err) { return fail(res, err, "me"); }
});

router.post("/srcs/meetings/:id/rsvp", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    const m = me ? await membership(me.id) : null;
    if (!m || m.status !== "active") return res.status(403).json({ error: "للأعضاء فقط" });
    const status = ["going", "not_going", "maybe"].includes(req.body?.status) ? req.body.status : "going";
    await query(`INSERT INTO srcs_meeting_rsvps (meeting_id, user_id, status) VALUES ($1,$2,$3)
                 ON CONFLICT (meeting_id, user_id) DO UPDATE SET status=$3`, [Number(req.params.id), me!.id, status]);
    return res.json({ ok: true, status });
  } catch (err) { return fail(res, err, "rsvp"); }
});

// ═══ تحقق عام من بطاقة المسعف (هدف رمز QR) ═══════════════════════
router.get("/public/srcs/verify/:token", async (req: Request, res: Response) => {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const t = str(req.params.token, 40).toLowerCase();
    const r = /^[0-9a-f]{24}$/.test(t) ? await query(
      `SELECT m.role, m.status, m.card_no, m.card_expires_at, m.blood_type, m.musif_code, m.unit, m.affiliation, m.revoked_at, m.revoke_reason, u.name, u.avatar_url
         FROM srcs_members m JOIN users u ON u.id=m.user_id WHERE m.card_token=$1`, [t]) : { rows: [] as any[] };
    const c = r.rows[0];
    const valid = c && c.status === "active" && !c.revoked_at && c.card_expires_at && new Date(c.card_expires_at) > new Date();
    const state = !c ? ["غير موجودة", "#B91C1C", "لم نعثر على بطاقة بهذا الرمز."]
      : c.revoked_at || c.status === "banned" ? ["بطاقة ملغاة", "#B91C1C", "أُلغيت هذه البطاقة من إدارة حصاحيصاوي ولا يُعتدّ بها."]
      : valid ? ["بطاقة سارية", "#15803D", `تنتهي في ${new Date(c.card_expires_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}`]
      : ["بطاقة غير سارية", "#B45309", c.status !== "active" ? "العضوية موقوفة أو قيد المراجعة." : "انتهت صلاحية البطاقة."];
    return res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>التحقق من بطاقة مسعف — حصاحيصاوي</title>
<style>body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#F4F7F5;color:#14261F;display:flex;min-height:100vh;align-items:center;justify-content:center}
.c{background:#fff;max-width:420px;width:92%;border-radius:22px;box-shadow:0 10px 30px #0001;overflow:hidden}
.h{background:linear-gradient(135deg,#7F1D1D,#B91C1C);color:#fff;padding:18px;text-align:center}
.s{margin:16px;padding:12px;border-radius:14px;text-align:center;font-weight:bold;color:#fff;background:${state[1]}}
.r{display:flex;justify-content:space-between;padding:10px 18px;border-top:1px solid #EEF2F0}.r b{color:#0B6B49}
.f{font-size:12px;color:#6B7C74;text-align:center;padding:14px}</style></head><body><div class="c">
<div class="h"><svg width="56" height="56" viewBox="0 0 100 100" aria-label="شارة الهلال الأحمر" style="display:block;margin:0 auto 6px"><defs><mask id="m"><rect width="100" height="100" fill="#000"/><circle cx="50" cy="50" r="34" fill="#fff"/><circle cx="63" cy="50" r="28" fill="#000"/></mask></defs><rect width="100" height="100" rx="24" fill="#fff"/><rect width="100" height="100" fill="#D7141A" mask="url(#m)"/></svg><div style="font-size:13px;opacity:.9">جمعية الهلال الأحمر السوداني — فرعية الحصاحيصا</div><div style="font-size:20px;font-weight:bold;margin-top:4px">التحقق من بطاقة العضوية</div></div>
<div class="s">${esc(state[0])}<div style="font-weight:normal;font-size:13px;margin-top:4px">${esc(state[2])}</div></div>
${c ? `<div class="r"><span>الاسم</span><b>${esc(c.name)}</b></div><div class="r"><span>الصفة</span><b>${esc(ROLE_LABEL[c.role as Role] || c.role)}</b></div>
${c.unit ? `<div class="r"><span>الوحدة</span><b>${esc(c.unit)}</b></div>` : ""}${c.affiliation ? `<div class="r"><span>الجهة</span><b>${esc(c.affiliation)}</b></div>` : ""}
<div class="r"><span>رقم البطاقة</span><b dir="ltr">${esc(c.card_no)}</b></div>${c.blood_type ? `<div class="r"><span>فصيلة الدم</span><b dir="ltr">${esc(c.blood_type)}</b></div>` : ""}
${c.musif_code ? `<div class="r"><span>مستجيب في «مسعف»</span><b><a href="https://musif.app/v/${encodeURIComponent(c.musif_code)}">تحقق</a></b></div>` : ""}` : ""}
${valid ? `<div style="margin:6px 16px 0;padding:12px;border-radius:14px;background:#FFF7D6;border:1px solid #FACC15;color:#3F1D0B;font-size:13.5px;line-height:1.9;font-weight:bold">⚠️ يُرجى تسهيل مهمة حامل هذه البطاقة والسماح له بدخول المرافق الصحية وجميع الأماكن عند الضرورة لتقديم العون والمساندة.</div>` : ""}
<div class="f">صادرة عبر تطبيق حصاحيصاوي · ${new Date().toLocaleString("ar-EG")}</div></div></body></html>`);
  } catch (err) { logger.error({ err }, "[srcs] verify"); return res.status(500).send("خطأ"); }
});

// ═══ إدارة الفرع ═══════════════════════════════════════════════
const requireAdmin = (req: Request, res: Response, ...need: Perm[]) => requirePerm(req, res, ...need);

router.get("/srcs/admin/dashboard", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const r = await query(`SELECT
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='pending') AS pending,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='active') AS active,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND role IN ('paramedic','leader')) AS paramedics,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND card_expires_at < NOW() + INTERVAL '30 days') AS cards_expiring,
      (SELECT COUNT(*)::int FROM srcs_meetings WHERE starts_at > NOW()) AS upcoming_meetings,
      (SELECT COUNT(*)::int FROM srcs_activities) AS activities,
      (SELECT COALESCE(SUM(beneficiaries),0)::int FROM srcs_activities) AS beneficiaries,
      (SELECT COUNT(*)::int FROM srcs_courses WHERE starts_at IS NULL OR ends_at IS NULL OR ends_at > NOW()) AS open_courses,
      (SELECT COUNT(*)::int FROM srcs_enrollments WHERE cert_status='pending') AS cert_pending,
      (SELECT COUNT(*)::int FROM srcs_cohorts) AS cohorts,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='banned' OR revoked_at IS NOT NULL) AS revoked`);
    return res.json({ ...r.rows[0], perms: await permsOf(await sessionUser(req)), isAppAdmin: isAppAdmin(await sessionUser(req)) });
  } catch (err) { return fail(res, err, "dashboard"); }
});

router.get("/srcs/admin/members", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res, "requests", "members", "cohorts", "courses", "results", "activities", "meetings", "certificates"))) return;
    const status = ["pending", "active", "suspended", "rejected", "banned"].includes(String(req.query.status)) ? String(req.query.status) : null;
    const r = await query(
      `SELECT m.*, u.name, u.avatar_url, u.phone AS account_phone, c.name AS cohort_name FROM srcs_members m JOIN users u ON u.id=m.user_id
         LEFT JOIN srcs_cohorts c ON c.id=m.cohort_id
        WHERE ($1::text IS NULL OR m.status=$1) ORDER BY (m.status='pending') DESC, m.created_at DESC LIMIT 1000`, [status]);
    return res.json({ members: exposeRows(r.rows) });
  } catch (err) { return fail(res, err, "members"); }
});

router.patch("/srcs/admin/members/:id", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res, "requests", "members", "cohorts"); if (!me) return;
    const appAdmin = isAppAdmin(me);
    const mine = await permsOf(me);
    const b = req.body || {};
    const cur = (await query(`SELECT m.*, u.name FROM srcs_members m JOIN users u ON u.id=m.user_id WHERE m.id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "العضو غير موجود" });
    // الحظر وإلغاء البطاقة ورفعهما ومنح الصلاحيات: لمدير حصاحيصاوي فقط
    if ((b.status === "banned" || cur.status === "banned" && b.status && b.status !== "banned" || b.revoke_card !== undefined || b.perms !== undefined) && !appAdmin)
      return res.status(403).json({ error: "الحظر وإلغاء البطاقات ومنح الصلاحيات لمدير حصاحيصاوي فقط" });
    const statusChange = b.status && b.status !== cur.status;
    if (statusChange && !mine.includes("requests") && !mine.includes("members") && !appAdmin) return res.status(403).json({ error: "ليست لديك صلاحية تغيير حالة العضوية" });
    const status = ["pending", "active", "suspended", "rejected", "banned"].includes(b.status) ? b.status : cur.status;
    let role: Role = ROLES.includes(b.role) && (mine.includes("members") || mine.includes("requests")) ? b.role : cur.role;
    // تعيين «إدارة الفرع»: لمدير حصاحيصاوي أو لمدير فرع، ولا يُنزل المرء نفسه
    if (role === "admin" && cur.role !== "admin" && !appAdmin && !(await isBranchAdmin(me))) role = cur.role;
    if (Number(cur.user_id) === Number(me.id) && role !== "admin" && !appAdmin) role = cur.role;
    let cardNo = cur.card_no, cardToken = cur.card_token, issued = cur.card_issued_at, expires = cur.card_expires_at;
    let revokedAt = cur.revoked_at, revokeReason = cur.revoke_reason;
    if (b.revoke_card === true || status === "banned") { revokedAt = revokedAt || new Date(); revokeReason = str(b.revoke_reason, 500) || revokeReason || "مخالفة القوانين"; }
    if (b.revoke_card === false) { revokedAt = null; revokeReason = null; }
    const becameActive = status === "active" && cur.status !== "active";
    if (status === "active" && (!cardNo || b.renew_card)) {
      if (!cardNo) { const c = newCard(); cardNo = c.no; cardToken = c.token; }
      issued = new Date(); expires = new Date(Date.now() + 365 * 86400_000);
    }
    const perms = b.perms === undefined ? cur.perms : (Array.isArray(b.perms) ? b.perms : []).filter((p: string) => (PERMS as readonly string[]).includes(p));
    const cohort = b.cohort_id === undefined ? cur.cohort_id : (Number(b.cohort_id) || null);
    const r = await query(
      `UPDATE srcs_members SET status=$2, role=$3, unit=$4, admin_note=$5, card_no=$6, card_token=$7,
         card_issued_at=$8, card_expires_at=$9, reviewed_by=$10, reviewed_at=NOW(), affiliation=$11, cohort_id=$12, perms=$13,
         revoked_at=$14, revoke_reason=$15 WHERE id=$1 RETURNING *`,
      [cur.id, status, role, b.unit === undefined ? cur.unit : str(b.unit, 120) || null, b.admin_note === undefined ? cur.admin_note : str(b.admin_note) || null,
       cardNo, cardToken, issued, expires, me.id, b.affiliation === undefined ? cur.affiliation : str(b.affiliation, 160) || null, cohort, perms,
       revokedAt, revokeReason]);
    const uid = [Number(cur.user_id)];
    const changed: Record<string, unknown> = {};
    for (const [k, before, after] of [["status", cur.status, status], ["role", cur.role, role], ["unit", cur.unit, r.rows[0].unit], ["affiliation", cur.affiliation, r.rows[0].affiliation],
      ["cohort_id", cur.cohort_id, cohort], ["perms", JSON.stringify(cur.perms), JSON.stringify(perms)], ["revoked", !!cur.revoked_at, !!revokedAt]] as const)
      if (String(before ?? "") !== String(after ?? "")) changed[k] = { from: before, to: after };
    if (b.renew_card) changed.renew_card = true;
    if (Object.keys(changed).length) audit(Number(me.id), status === "banned" && cur.status !== "banned" ? "ban" : b.perms !== undefined && changed.perms ? "perms" : changed.revoked ? "card_revoke" : "member_update", `member:${cur.id} ${cur.name}`, { ...changed, reason: revokeReason && changed.revoked ? revokeReason : undefined });
    if (becameActive) await query(`UPDATE srcs_member_docs SET verified=TRUE WHERE user_id=$1 AND source='join'`, [cur.user_id]).catch(() => {});
    if (becameActive) notifyUsers(uid, "🚑 مرحباً بك في الهلال الأحمر", `قُبل طلبك بصفة ${ROLE_LABEL[role]} — بطاقتك جاهزة في التطبيق`, { kind: "srcs_accepted" });
    else if (status === "rejected" && cur.status !== "rejected") notifyUsers(uid, "طلب الانضمام للهلال الأحمر", "لم يُقبل طلبك حالياً" + (b.admin_note ? `: ${str(b.admin_note, 200)}` : ""), {});
    else if (status === "banned" && cur.status !== "banned") notifyUsers(uid, "⛔ حظر العضوية", `أُلغيت بطاقتك وحُظرت عضويتك: ${revokeReason}`, {});
    else if (b.revoke_card === true && !cur.revoked_at) notifyUsers(uid, "⛔ إلغاء بطاقة", `أُلغيت بطاقتك: ${revokeReason}`, {});
    else if (b.renew_card) notifyUsers(uid, "🪪 تجديد بطاقة المسعف", "جُدّدت بطاقتك لعام", {});
    if (b.perms !== undefined && JSON.stringify(perms) !== JSON.stringify(cur.perms)) notifyUsers(uid, "🔑 صلاحيات جديدة", "حُدّثت صلاحياتك في لوحة الهلال الأحمر", {});
    return res.json({ member: exposeRow(r.rows[0]) });
  } catch (err) { return fail(res, err, "member patch"); }
});

// الاجتماعات
router.get("/srcs/admin/meetings", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res, "meetings"))) return;
    const r = await query(`SELECT mt.*,
        (SELECT COUNT(*)::int FROM srcs_meeting_rsvps r WHERE r.meeting_id=mt.id AND r.status='going') AS going,
        (SELECT COUNT(*)::int FROM srcs_meeting_rsvps r WHERE r.meeting_id=mt.id AND r.attended) AS attended
      FROM srcs_meetings mt ORDER BY mt.starts_at DESC LIMIT 100`);
    return res.json({ meetings: r.rows });
  } catch (err) { return fail(res, err, "meetings"); }
});
router.post("/srcs/admin/meetings", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res, "meetings"); if (!me) return;
    const b = req.body || {};
    const starts = new Date(b.starts_at);
    if (!str(b.title) || isNaN(starts.getTime())) return res.status(400).json({ error: "العنوان والموعد مطلوبان" });
    if (!str(b.place)) return res.status(400).json({ error: "حدّد مكان الاجتماع" });
    const audience = AUDIENCES.includes(b.audience) && b.audience !== "public" ? b.audience : "members";
    const ends = b.ends_at && !isNaN(new Date(b.ends_at).getTime()) ? new Date(b.ends_at) : null;
    const r = await query(`INSERT INTO srcs_meetings (title, agenda, place, starts_at, ends_at, audience, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [str(b.title, 200), str(b.agenda) || null, str(b.place, 200) || null, starts, ends && ends > starts ? ends : null, audience, me.id]);
    notifyUsers(await audienceUserIds(audience), "📅 اجتماع جديد", `${str(b.title, 120)} — ${starts.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Khartoum" })} · ${str(b.place, 80)}`, { kind: "srcs_meeting", id: r.rows[0].id });
    return res.json({ meeting: r.rows[0] });
  } catch (err) { return fail(res, err, "meeting create"); }
});
router.patch("/srcs/admin/meetings/:id", writeLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res, "meetings"))) return;
    const b = req.body || {};
    const r = await query(`UPDATE srcs_meetings SET title=COALESCE($2,title), agenda=COALESCE($3,agenda), place=COALESCE($4,place),
        starts_at=COALESCE($5,starts_at), minutes=COALESCE($6,minutes), ends_at=COALESCE($7,ends_at) WHERE id=$1 RETURNING *`,
      [Number(req.params.id), b.title ? str(b.title, 200) : null, b.agenda === undefined ? null : str(b.agenda), b.place === undefined ? null : str(b.place, 200),
       b.starts_at && !isNaN(new Date(b.starts_at).getTime()) ? new Date(b.starts_at) : null, b.minutes === undefined ? null : str(b.minutes, 8000),
       b.ends_at && !isNaN(new Date(b.ends_at).getTime()) ? new Date(b.ends_at) : null]);
    if (Array.isArray(b.attended_user_ids)) {
      const ids = b.attended_user_ids.map(Number).filter(Number.isFinite).slice(0, 500);
      await query(`UPDATE srcs_meeting_rsvps SET attended = (user_id = ANY($2::int[])) WHERE meeting_id=$1`, [Number(req.params.id), ids]);
      await query(`INSERT INTO srcs_meeting_rsvps (meeting_id, user_id, status, attended) SELECT $1, u, 'going', TRUE FROM UNNEST($2::int[]) u
                   ON CONFLICT (meeting_id, user_id) DO UPDATE SET attended=TRUE`, [Number(req.params.id), ids]);
    }
    return res.json({ meeting: r.rows[0] });
  } catch (err) { return fail(res, err, "meeting patch"); }
});
router.get("/srcs/admin/meetings/:id/rsvps", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res, "meetings"))) return;
    const r = await query(`SELECT m.user_id, u.name, m.role, r.status, COALESCE(r.attended,FALSE) AS attended
        FROM srcs_members m JOIN users u ON u.id=m.user_id
        LEFT JOIN srcs_meeting_rsvps r ON r.user_id=m.user_id AND r.meeting_id=$1
       WHERE m.status='active' ORDER BY r.status NULLS LAST, u.name`, [Number(req.params.id)]);
    return res.json({ rsvps: r.rows });
  } catch (err) { return fail(res, err, "rsvps"); }
});
router.delete("/srcs/admin/meetings/:id", async (req, res) => {
  try { if (!(await requireAdmin(req, res, "meetings"))) return; await query(`DELETE FROM srcs_meetings WHERE id=$1`, [Number(req.params.id)]); return res.json({ ok: true }); }
  catch (err) { return fail(res, err, "meeting delete"); }
});

// الإعلانات
router.post("/srcs/admin/announcements", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res, "announcements"); if (!me) return;
    const b = req.body || {};
    if (!str(b.title) || !str(b.body)) return res.status(400).json({ error: "العنوان والنص مطلوبان" });
    const audience = AUDIENCES.includes(b.audience) ? b.audience : "members";
    const r = await query(`INSERT INTO srcs_announcements (title, body, audience, pinned, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [str(b.title, 200), str(b.body, 6000), audience, !!b.pinned, me.id]);
    if (b.notify !== false && audience !== "public") notifyUsers(await audienceUserIds(audience), `📢 ${str(b.title, 100)}`, str(b.body, 140), { kind: "srcs_announcement" });
    return res.json({ announcement: r.rows[0] });
  } catch (err) { return fail(res, err, "announcement"); }
});
router.patch("/srcs/admin/announcements/:id", writeLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res, "announcements"))) return;
    const b = req.body || {};
    const r = await query(`UPDATE srcs_announcements SET title=COALESCE($2,title), body=COALESCE($3,body), pinned=COALESCE($4,pinned) WHERE id=$1 RETURNING *`,
      [Number(req.params.id), b.title ? str(b.title, 200) : null, b.body ? str(b.body, 6000) : null, typeof b.pinned === "boolean" ? b.pinned : null]);
    return res.json({ announcement: r.rows[0] });
  } catch (err) { return fail(res, err, "announcement patch"); }
});
router.delete("/srcs/admin/announcements/:id", async (req, res) => {
  try { if (!(await requireAdmin(req, res, "announcements"))) return; await query(`DELETE FROM srcs_announcements WHERE id=$1`, [Number(req.params.id)]); return res.json({ ok: true }); }
  catch (err) { return fail(res, err, "announcement delete"); }
});

// الأنشطة والفعاليات (توثيق + نقاط تطوع للمشاركين)
router.post("/srcs/admin/activities", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res, "activities"); if (!me) return;
    const b = req.body || {};
    if (!str(b.title)) return res.status(400).json({ error: "العنوان مطلوب" });
    const images = (Array.isArray(b.images) ? b.images : []).map((x: unknown) => str(x, 500)).filter((x: string) => /^https:\/\//.test(x)).slice(0, 12);
    const when = b.happened_at && !isNaN(new Date(b.happened_at).getTime()) ? new Date(b.happened_at) : new Date();
    const r = await query(
      `INSERT INTO srcs_activities (title, type, description, place, happened_at, images, beneficiaries, published, points, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [str(b.title, 200), ACTIVITY_TYPES.includes(b.type) ? b.type : "other", str(b.description, 8000) || null, str(b.place, 200) || null, when,
       JSON.stringify(images), Math.max(0, Math.min(1_000_000, Number(b.beneficiaries) || 0)), b.published !== false,
       Math.max(0, Math.min(200, Number(b.points) || 0)), me.id]);
    return res.json({ activity: r.rows[0] });
  } catch (err) { return fail(res, err, "activity"); }
});
router.patch("/srcs/admin/activities/:id", writeLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res, "activities"))) return;
    const b = req.body || {};
    const images = Array.isArray(b.images) ? JSON.stringify(b.images.map((x: unknown) => str(x, 500)).filter((x: string) => /^https:\/\//.test(x)).slice(0, 12)) : null;
    const r = await query(`UPDATE srcs_activities SET title=COALESCE($2,title), description=COALESCE($3,description), place=COALESCE($4,place),
        images=COALESCE($5::jsonb,images), beneficiaries=COALESCE($6,beneficiaries), published=COALESCE($7,published) WHERE id=$1 RETURNING *`,
      [Number(req.params.id), b.title ? str(b.title, 200) : null, b.description === undefined ? null : str(b.description, 8000),
       b.place === undefined ? null : str(b.place, 200), images, b.beneficiaries === undefined ? null : Math.max(0, Number(b.beneficiaries) || 0),
       typeof b.published === "boolean" ? b.published : null]);
    return res.json({ activity: r.rows[0] });
  } catch (err) { return fail(res, err, "activity patch"); }
});
router.delete("/srcs/admin/activities/:id", async (req, res) => {
  try { if (!(await requireAdmin(req, res, "activities"))) return; await query(`DELETE FROM srcs_activities WHERE id=$1`, [Number(req.params.id)]); return res.json({ ok: true }); }
  catch (err) { return fail(res, err, "activity delete"); }
});
/** تسجيل المشاركين: تُضاف نقاط النشاط إلى رصيد التطوع في حصاحيصاوي (مرة واحدة لكل مشارك) */
router.post("/srcs/admin/activities/:id/participants", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res, "activities"); if (!me) return;
    const act = (await query(`SELECT * FROM srcs_activities WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!act) return res.status(404).json({ error: "النشاط غير موجود" });
    const ids: number[] = (Array.isArray(req.body?.user_ids) ? req.body.user_ids : []).map(Number).filter(Number.isFinite).slice(0, 500);
    const valid = (await query(`SELECT user_id FROM srcs_members WHERE status='active' AND user_id = ANY($1::int[])`, [ids])).rows.map((x: any) => Number(x.user_id));
    let awarded = 0;
    for (const uid of valid) {
      const ins = await query(`INSERT INTO srcs_activity_participants (activity_id, user_id, points) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id`,
        [act.id, uid, act.points]);
      if (ins.rows[0] && act.points > 0) {
        await query(`INSERT INTO volunteer_points (user_id, points, reason, created_by) VALUES ($1,$2,$3,$4)`,
          [uid, act.points, `الهلال الأحمر: ${String(act.title).slice(0, 150)}`, me.id]).catch(() => {});
        awarded++;
      }
    }
    if (awarded) notifyUsers(valid, "🎖️ نقاط تطوع جديدة", `+${act.points} نقطة لمشاركتك في «${String(act.title).slice(0, 80)}»`, { kind: "srcs_points" });
    return res.json({ ok: true, participants: valid.length, awarded });
  } catch (err) { return fail(res, err, "participants"); }
});

export default router;
