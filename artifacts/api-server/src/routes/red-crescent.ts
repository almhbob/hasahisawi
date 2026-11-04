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

const UNIT_TABLES = ["srcs_members", "srcs_meetings", "srcs_announcements", "srcs_activities", "srcs_cohorts", "srcs_courses"] as const;

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
      // ═══ الوحدات: كيان مستقل لكل وحدة، ولكل وحدة مدراء بصلاحيات محصورة فيها ═══
      await query(`CREATE TABLE IF NOT EXISTS srcs_units (
        id SERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, code VARCHAR(30), description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE, created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_unit_managers (
        unit_id INTEGER NOT NULL REFERENCES srcs_units(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        perms TEXT[] NOT NULL DEFAULT '{}', created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (unit_id, user_id))`);
      await query(`CREATE INDEX IF NOT EXISTS idx_srcs_unit_managers_user ON srcs_unit_managers(user_id)`);
      // unit_id = NULL يعني محتوى عاماً على مستوى الفرع
      for (const t of UNIT_TABLES) {
        await query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES srcs_units(id) ON DELETE SET NULL`);
        await query(`CREATE INDEX IF NOT EXISTS idx_${t}_unit ON ${t}(unit_id)`);
      }
      await query(`ALTER TABLE srcs_audit ADD COLUMN IF NOT EXISTS unit_id INTEGER`);
      // ترحيل: كل نص وحدة موجود يصبح وحدة، ويُربط الأعضاء بها (النص يبقى متزامناً كاسم عرض)
      await query(`INSERT INTO srcs_units (name) SELECT DISTINCT btrim(unit) FROM srcs_members
                    WHERE unit IS NOT NULL AND btrim(unit) <> '' ON CONFLICT (name) DO NOTHING`);
      await query(`UPDATE srcs_members m SET unit_id=u.id, unit=u.name FROM srcs_units u
                    WHERE m.unit_id IS NULL AND m.unit IS NOT NULL AND btrim(m.unit)=u.name`);
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
const asPerms = (v: unknown): Perm[] => [...new Set((Array.isArray(v) ? v : []).map(String).filter((p): p is Perm => (PERMS as readonly string[]).includes(p)))];
/** الصلاحيات الافتراضية لمدير وحدة جديد (الشهادات المدفوعة تبقى للفرع ما لم تُمنح صراحة) */
export const DEFAULT_UNIT_PERMS: Perm[] = PERMS.filter((p) => p !== "certificates");

// ═══ نطاق الإدارة (الفرع ↔ الوحدة) ══════════════════════════════════
// مستوى الفرع: مدير حصاحيصاوي، أو عضو بدور admin، أو صلاحيات ممنوحة من مدير حصاحيصاوي ← كل الوحدات.
// مستوى الوحدة: مدير وحدة (srcs_unit_managers)، أو قائد فريق تابع لوحدة ← وحداته فقط.
// كل مسار إداري يحسب Access من النطاق ويُرشّح بـ unit_id على الخادم — لا يُوثق بأي unit_id يرسله العميل.
export type Scope = {
  userId: number | null; appAdmin: boolean; branchAdmin: boolean;
  branchPerms: Perm[]; units: Map<number, Perm[]>; member: any | null;
};
export type Access = { all: true; unitIds: null } | { all: false; unitIds: number[] };

export async function scopeOf(me: SessionUser | null): Promise<Scope> {
  const app = isAppAdmin(me);
  const sc: Scope = { userId: me ? Number(me.id) : null, appAdmin: app, branchAdmin: app, branchPerms: app ? [...PERMS] : [], units: new Map(), member: null };
  if (!me) return sc;
  const m = await membership(me.id);
  sc.member = m;
  const addUnit = (id: number, ps: Perm[]) => sc.units.set(id, [...new Set([...(sc.units.get(id) ?? []), ...ps])]);
  if (m && m.status === "active") {
    if (m.role === "admin") { sc.branchAdmin = true; sc.branchPerms = [...PERMS]; }
    const branch = [...sc.branchPerms, ...asPerms(m.perms)];
    if (m.role === "leader") {
      // قائد الفريق يدير وحدته فقط؛ ومن لا وحدة له يبقى على مستوى الفرع كما كان
      if (m.unit_id) {
        const u = (await query(`SELECT is_active FROM srcs_units WHERE id=$1`, [m.unit_id])).rows[0];
        if (u?.is_active) addUnit(Number(m.unit_id), ROLE_DEFAULT_PERMS.leader);
      } else branch.push(...ROLE_DEFAULT_PERMS.leader);
    }
    sc.branchPerms = [...new Set(branch)];
  }
  if (!m || (m.status !== "banned" && m.status !== "suspended")) {
    const rows = (await query(`SELECT um.unit_id, um.perms FROM srcs_unit_managers um JOIN srcs_units u ON u.id=um.unit_id AND u.is_active
                               WHERE um.user_id=$1`, [me.id])).rows;
    for (const r of rows) addUnit(Number(r.unit_id), asPerms(r.perms));
  }
  for (const [id, ps] of sc.units) if (!ps.length) sc.units.delete(id);
  return sc;
}
/** كل الصلاحيات الفعلية (فرع + وحدات) — لعرض التبويبات */
export const effectivePerms = (sc: Scope): Perm[] => [...new Set([...sc.branchPerms, ...[...sc.units.values()].flat()])];
/** صلاحيات المستخدم على عنصر في وحدة معيّنة */
export const permsForUnit = (sc: Scope, unitId: unknown): Perm[] =>
  [...new Set([...sc.branchPerms, ...(unitId ? sc.units.get(Number(unitId)) ?? [] : [])])];
/** يحسب نطاق الوصول لصلاحيات مطلوبة: كل الفرع، أو قائمة وحدات، أو لا شيء */
export function access(sc: Scope, need: Perm[]): Access | null {
  const hit = (ps: Perm[]) => (need.length ? need.some((p) => ps.includes(p)) : ps.length > 0);
  if (hit(sc.branchPerms)) return { all: true, unitIds: null };
  const ids = [...sc.units].filter(([, ps]) => hit(ps)).map(([id]) => id);
  return ids.length ? { all: false, unitIds: ids } : null;
}
export async function permsOf(me: SessionUser | null): Promise<Perm[]> { return (await scopeOf(me)).branchPerms; }

const DENY = "ليست لديك صلاحية لهذا القسم";
/** صلاحية على مستوى الفرع فقط (بلا نطاق وحدات) */
export async function requirePerm(req: Request, res: Response, ...need: Perm[]): Promise<SessionUser | null> {
  const me = await sessionUser(req);
  const mine = await permsOf(me);
  if (!me || !(need.length ? need.some((p) => mine.includes(p)) : mine.length)) { res.status(403).json({ error: DENY }); return null; }
  return me;
}
/** يتحقق من الصلاحية ويُرجع نطاق الوحدات المسموح بها */
export async function requireScope(req: Request, res: Response, ...need: Perm[]): Promise<{ me: SessionUser; sc: Scope; acc: Access } | null> {
  const me = await sessionUser(req);
  const sc = await scopeOf(me);
  const acc = access(sc, need);
  if (!me || !acc) { res.status(403).json({ error: DENY }); return null; }
  return { me, sc, acc };
}
/** شرط SQL: العمود ضمن الوحدات (0 = عام للفرع). المعامل NULL يعني بلا ترشيح */
export const unitCond = (col: string, n: number) => `($${n}::int[] IS NULL OR COALESCE(${col},0) = ANY($${n}::int[]))`;
/**
 * ترشيح اختياري بوحدة (?unit_id=… أو none للعام) ضمن النطاق.
 * يُرجع: null = الكل، مصفوفة وحدات، أو false إن طُلبت وحدة خارج النطاق.
 */
export function narrowUnits(acc: Access, raw: unknown): number[] | null | false {
  const s = raw === undefined || raw === null ? "" : String(raw).trim();
  const want = s === "" || s === "all" ? undefined : s === "none" ? 0 : Number(s);
  if (want === undefined || !Number.isInteger(want) || want < 0) return acc.all ? null : acc.unitIds;
  if (acc.all) return [want];
  return acc.unitIds.includes(want) ? [want] : false;
}
export const canTouch = (acc: Access, unitId: unknown) => acc.all || (unitId !== null && unitId !== undefined && acc.unitIds.includes(Number(unitId)));
const SCOPED_TABLES = ["srcs_meetings", "srcs_announcements", "srcs_activities", "srcs_cohorts", "srcs_courses", "srcs_members"] as const;
/** يجلب عنصراً ويتحقق أنه ضمن النطاق؛ وإلا يرد 404 دون كشف وجوده */
export async function loadScoped(table: (typeof SCOPED_TABLES)[number], id: unknown, acc: Access, res: Response): Promise<any | null> {
  const row = Number.isInteger(Number(id)) ? (await query(`SELECT * FROM ${table} WHERE id=$1`, [Number(id)])).rows[0] : null;
  if (!row || !canTouch(acc, row.unit_id)) { res.status(404).json({ error: "غير موجود أو خارج نطاق وحدتك" }); return null; }
  return row;
}
/**
 * الوحدة التي يُنشأ فيها محتوى جديد: مستوى الفرع يختار أي وحدة نشطة أو «عام للفرع» (null)؛
 * مدير الوحدة يُجبر على وحدته (ويختار إحدى وحداته إن كان يدير أكثر من واحدة).
 * يُرجع undefined بعد إرسال الخطأ.
 */
export async function pickWriteUnit(acc: Access, raw: unknown, res: Response): Promise<number | null | undefined> {
  const v = raw === undefined || raw === null || raw === "" || Number(raw) === 0 ? null : Number(raw);
  if (v !== null && !Number.isInteger(v)) { res.status(400).json({ error: "وحدة غير صالحة" }); return undefined; }
  if (acc.all) {
    if (v === null) return null;
    const u = (await query(`SELECT id FROM srcs_units WHERE id=$1 AND is_active`, [v])).rows[0];
    if (!u) { res.status(400).json({ error: "الوحدة غير موجودة أو موقوفة" }); return undefined; }
    return v;
  }
  if (v === null) {
    if (acc.unitIds.length === 1) return acc.unitIds[0];
    res.status(400).json({ error: "اختر الوحدة التي يتبع لها هذا المحتوى" }); return undefined;
  }
  if (!acc.unitIds.includes(v)) { res.status(403).json({ error: "لا يمكنك النشر لوحدة لا تديرها" }); return undefined; }
  return v;
}
export async function unitName(id: unknown): Promise<string | null> {
  if (!id) return null;
  return (await query(`SELECT name FROM srcs_units WHERE id=$1`, [Number(id)])).rows[0]?.name ?? null;
}
/** مدراء وحدة يملكون إحدى الصلاحيات (لإشعارهم) */
export async function unitManagerIds(unitId: unknown, ...need: Perm[]): Promise<number[]> {
  if (!unitId) return [];
  const r = await query(`SELECT user_id FROM srcs_unit_managers WHERE unit_id=$1 AND ($2::text[] = '{}' OR perms && $2::text[])`, [Number(unitId), need]);
  return r.rows.map((x: any) => Number(x.user_id));
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
/** مستهدفو الإشعار: محتوى الوحدة يصل لأعضاء الوحدة (ومدرائها) فقط؛ والمحتوى العام لكل الفرع */
export async function audienceUserIds(audience: string, unitId: number | null = null): Promise<number[]> {
  const roles = audience === "admins" ? ["admin"] : audience === "paramedics" ? ["paramedic", "leader", "admin"] : ROLES as unknown as string[];
  const r = unitId
    ? await query(`SELECT user_id FROM srcs_members WHERE status='active' AND unit_id=$2 AND role = ANY($1::text[])
                   UNION SELECT user_id FROM srcs_unit_managers WHERE unit_id=$2`, [audience === "admins" ? ["admin", "leader"] : roles, unitId])
    : await query(`SELECT user_id FROM srcs_members WHERE status='active' AND role = ANY($1::text[])`, [roles]);
  return [...new Set(r.rows.map((x: any) => Number(x.user_id)))];
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
    const sc = await scopeOf(me);
    const m = sc.member;
    const admin = sc.branchAdmin;
    const perms = effectivePerms(sc);
    const aud = audiencesFor(m, admin);
    // المحتوى العام للفرع (0) + وحدة العضو + الوحدات التي يديرها؛ وإدارة الفرع ترى الكل
    const vis: number[] | null = admin ? null : [...new Set([0, ...(m?.status === "active" && m.unit_id ? [Number(m.unit_id)] : []), ...sc.units.keys()])];
    const [stats, ann, acts] = await Promise.all([
      query(`SELECT
          (SELECT COUNT(*)::int FROM srcs_members WHERE status='active') AS members,
          (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND role IN ('paramedic','leader')) AS paramedics,
          (SELECT COUNT(*)::int FROM srcs_activities WHERE published) AS activities,
          (SELECT COALESCE(SUM(beneficiaries),0)::int FROM srcs_activities WHERE published) AS beneficiaries`),
      query(`SELECT a.id, a.title, a.body, a.audience, a.pinned, a.created_at, a.unit_id, un.name AS unit_name
               FROM srcs_announcements a LEFT JOIN srcs_units un ON un.id=a.unit_id
              WHERE a.audience = ANY($1::text[]) AND ${unitCond("a.unit_id", 2)}
             ORDER BY a.pinned DESC, a.created_at DESC LIMIT 15`, [aud, vis]),
      query(`SELECT a.*, un.name AS unit_name, (SELECT COUNT(*)::int FROM srcs_activity_participants p WHERE p.activity_id=a.id) AS volunteers
               FROM srcs_activities a LEFT JOIN srcs_units un ON un.id=a.unit_id
              WHERE (a.published OR $1) AND ${unitCond("a.unit_id", 2)} ORDER BY a.happened_at DESC LIMIT 30`, [admin, vis]),
    ]);
    const myMeetings = m && m.status === "active" ? (await query(
      `SELECT mt.id, mt.title, mt.place, mt.starts_at, mt.ends_at, mt.agenda, mt.audience, mt.unit_id, un.name AS unit_name, r.status AS my_rsvp
         FROM srcs_meetings mt LEFT JOIN srcs_meeting_rsvps r ON r.meeting_id=mt.id AND r.user_id=$1 LEFT JOIN srcs_units un ON un.id=mt.unit_id
        WHERE mt.audience = ANY($2::text[]) AND mt.starts_at > NOW() - INTERVAL '6 hours' AND ${unitCond("mt.unit_id", 3)}
        ORDER BY mt.starts_at LIMIT 10`, [me!.id, aud, vis])).rows : [];
    return res.json({
      stats: stats.rows[0], announcements: ann.rows, activities: acts.rows, meetings: myMeetings,
      membership: m ? { ...exposeRow(m), unit_name: m.unit_id ? await unitName(m.unit_id) : null, role_label: ROLE_LABEL[m.role as Role], card_url: m.card_token ? cardUrl(m.card_token) : null } : null,
      isAdmin: admin || perms.length > 0, perms, isAppAdmin: sc.appAdmin,
      managedUnits: sc.branchPerms.length ? [] : [...sc.units.keys()],
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
    // الوحدة: unit_id من قائمة الوحدات النشطة؛ والعملاء القدامى يرسلون نصاً فيُطابق بالاسم
    let unitId: number | null = null, unitText: string | null = str(b.unit, 120) || null;
    if (b.unit_id !== undefined && b.unit_id !== null && b.unit_id !== "" && Number(b.unit_id) !== 0) {
      const u = (await query(`SELECT id, name FROM srcs_units WHERE id=$1 AND is_active`, [Number(b.unit_id) || 0])).rows[0];
      if (!u) return res.status(400).json({ error: "الوحدة المختارة غير متاحة — اختر وحدة من القائمة" });
      unitId = Number(u.id); unitText = u.name;
    } else if (unitText) {
      const u = (await query(`SELECT id, name FROM srcs_units WHERE is_active AND lower(btrim(name))=lower(btrim($1)) LIMIT 1`, [unitText])).rows[0];
      if (u) { unitId = Number(u.id); unitText = u.name; }
    }
    const r = await query(
      `INSERT INTO srcs_members (user_id, desired_role, role, status, unit, phone, blood_type, experience, certifications, musif_code, national_id_no, id_doc_url, cert_doc_url, unit_id)
       VALUES ($1,$2,'volunteer','pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (user_id) DO UPDATE SET desired_role=$2, status='pending', unit=$3, phone=$4, blood_type=$5,
         experience=$6, certifications=$7, musif_code=$8, national_id_no=$9, id_doc_url=$10, cert_doc_url=$11, unit_id=$12, admin_note=NULL, created_at=NOW()
       RETURNING *`,
      [me.id, desired, unitText, str(b.phone, 30) || me.phone || null, blood, str(b.experience) || null, str(b.certifications) || null, str(b.musif_code, 40) || null,
       nationalId, idDoc, certDoc, unitId]);
    await syncJoinDocs(Number(me.id), idDoc, certDoc);
    // يصل الطلب لإدارة الفرع ولمدراء الوحدة المختارة فقط
    const admins = (await query(`SELECT user_id FROM srcs_members WHERE status='active' AND role='admin'`)).rows.map((x: any) => Number(x.user_id));
    const unitMgrs = await unitManagerIds(unitId, "requests", "members");
    notifyUsers([...new Set([...admins, ...unitMgrs])], "🚑 طلب انضمام جديد", `${me.name} يطلب الانضمام ${desired === "paramedic" ? "كمسعف — المستندات مرفقة للمراجعة" : "كمتطوع"}${unitText ? ` · ${unitText}` : ""}`, { kind: "srcs_request" });
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
    const mt = (await query(`SELECT unit_id FROM srcs_meetings WHERE id=$1`, [Number(req.params.id) || 0])).rows[0];
    if (!mt || (mt.unit_id && Number(mt.unit_id) !== Number(m.unit_id) && !(await scopeOf(me)).branchAdmin)) return res.status(404).json({ error: "الاجتماع غير موجود" });
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

// ═══ إدارة الفرع والوحدات ═════════════════════════════════════════
// كل مسار هنا يمر عبر requireScope: مستوى الفرع يرى الكل (ويرشّح اختيارياً بـ ?unit_id=)،
// ومدير الوحدة يرى ويعدّل ما يخص وحداته فقط؛ وأي معرّف خارج نطاقه يُرد بـ 404.
const UNIT_JOIN = (alias: string) => `LEFT JOIN srcs_units un ON un.id=${alias}.unit_id`;
const outOfScope = (res: Response) => res.status(403).json({ error: "هذه الوحدة خارج نطاق إدارتك" });

/** ما يستطيع المستخدم إدارته: الفرع كله أو قائمة وحدات بصلاحياتها */
router.get("/srcs/admin/my-scope", async (req, res) => {
  try {
    const me = await sessionUser(req);
    const sc = await scopeOf(me);
    const perms = effectivePerms(sc);
    if (!me || !perms.length) return res.status(403).json({ error: DENY });
    const branch = sc.branchPerms.length > 0;
    const units = branch
      ? (await query(`SELECT id, name, code, is_active FROM srcs_units ORDER BY is_active DESC, name`)).rows
          .map((u: any) => ({ ...u, perms: permsForUnit(sc, u.id) }))
      : (await query(`SELECT id, name, code, is_active FROM srcs_units WHERE id = ANY($1::int[]) ORDER BY name`, [[...sc.units.keys()]])).rows
          .map((u: any) => ({ ...u, perms: sc.units.get(Number(u.id)) ?? [] }));
    return res.json({
      level: branch ? "branch" : "unit", isAppAdmin: sc.appAdmin, isBranchAdmin: sc.branchAdmin,
      branchPerms: sc.branchPerms, perms, units,
    });
  } catch (err) { return fail(res, err, "my-scope"); }
});

router.get("/srcs/admin/dashboard", async (req, res) => {
  try {
    const ctx = await requireScope(req, res); if (!ctx) return;
    const U = narrowUnits(ctx.acc, req.query.unit_id);
    if (U === false) return outOfScope(res);
    const r = await query(`SELECT
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='pending' AND ${unitCond("unit_id", 1)}) AS pending,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND ${unitCond("unit_id", 1)}) AS active,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND role IN ('paramedic','leader') AND ${unitCond("unit_id", 1)}) AS paramedics,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND card_expires_at < NOW() + INTERVAL '30 days' AND ${unitCond("unit_id", 1)}) AS cards_expiring,
      (SELECT COUNT(*)::int FROM srcs_meetings WHERE starts_at > NOW() AND ${unitCond("unit_id", 1)}) AS upcoming_meetings,
      (SELECT COUNT(*)::int FROM srcs_activities WHERE ${unitCond("unit_id", 1)}) AS activities,
      (SELECT COALESCE(SUM(beneficiaries),0)::int FROM srcs_activities WHERE ${unitCond("unit_id", 1)}) AS beneficiaries,
      (SELECT COUNT(*)::int FROM srcs_courses WHERE (starts_at IS NULL OR ends_at IS NULL OR ends_at > NOW()) AND ${unitCond("unit_id", 1)}) AS open_courses,
      (SELECT COUNT(*)::int FROM srcs_enrollments e JOIN srcs_courses c ON c.id=e.course_id WHERE e.cert_status='pending' AND ${unitCond("c.unit_id", 1)}) AS cert_pending,
      (SELECT COUNT(*)::int FROM srcs_cohorts WHERE ${unitCond("unit_id", 1)}) AS cohorts,
      (SELECT COUNT(*)::int FROM srcs_members WHERE (status='banned' OR revoked_at IS NOT NULL) AND ${unitCond("unit_id", 1)}) AS revoked`, [U]);
    return res.json({ ...r.rows[0], perms: effectivePerms(ctx.sc), isAppAdmin: ctx.sc.appAdmin, level: ctx.acc.all ? "branch" : "unit" });
  } catch (err) { return fail(res, err, "dashboard"); }
});

router.get("/srcs/admin/members", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "requests", "members", "cohorts", "courses", "results", "activities", "meetings", "certificates"); if (!ctx) return;
    const U = narrowUnits(ctx.acc, req.query.unit_id);
    if (U === false) return outOfScope(res);
    const status = ["pending", "active", "suspended", "rejected", "banned"].includes(String(req.query.status)) ? String(req.query.status) : null;
    const r = await query(
      `SELECT m.*, u.name, u.avatar_url, u.phone AS account_phone, c.name AS cohort_name, un.name AS unit_name FROM srcs_members m JOIN users u ON u.id=m.user_id
         LEFT JOIN srcs_cohorts c ON c.id=m.cohort_id ${UNIT_JOIN("m")}
        WHERE ($1::text IS NULL OR m.status=$1) AND ${unitCond("m.unit_id", 2)}
        ORDER BY (m.status='pending') DESC, m.created_at DESC LIMIT 1000`, [status, U]);
    return res.json({ members: exposeRows(r.rows) });
  } catch (err) { return fail(res, err, "members"); }
});

/** يحوّل unit_id / نص الوحدة (للعملاء القدامى) إلى وحدة؛ مستوى الفرع ينشئ الوحدة إن لم توجد */
async function resolveUnitInput(b: any, createIfMissing: boolean): Promise<{ id: number | null; name: string | null } | "unknown" | "invalid"> {
  if (b.unit_id !== undefined) {
    const v = b.unit_id === null || b.unit_id === "" ? 0 : Number(b.unit_id);
    if (!Number.isInteger(v) || v < 0) return "invalid";
    if (!v) return { id: null, name: null };
    const u = (await query(`SELECT id, name FROM srcs_units WHERE id=$1`, [v])).rows[0];
    return u ? { id: Number(u.id), name: u.name } : "invalid";
  }
  const name = str(b.unit, 120);
  if (!name) return { id: null, name: null };
  const u = (await query(`SELECT id, name FROM srcs_units WHERE lower(btrim(name))=lower(btrim($1)) LIMIT 1`, [name])).rows[0];
  if (u) return { id: Number(u.id), name: u.name };
  if (!createIfMissing) return "unknown";
  const c = await query(`INSERT INTO srcs_units (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id, name`, [name]);
  return { id: Number(c.rows[0].id), name: c.rows[0].name };
}

router.patch("/srcs/admin/members/:id", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "requests", "members", "cohorts"); if (!ctx) return;
    const { me, sc, acc } = ctx;
    const appAdmin = sc.appAdmin;
    const b = req.body || {};
    const cur = (await query(`SELECT m.*, u.name FROM srcs_members m JOIN users u ON u.id=m.user_id WHERE m.id=$1`, [Number(req.params.id) || 0])).rows[0];
    if (!cur || !canTouch(acc, cur.unit_id)) return res.status(404).json({ error: "العضو غير موجود أو خارج نطاق وحدتك" });
    const mine = permsForUnit(sc, cur.unit_id);
    if (!mine.some((p) => p === "requests" || p === "members" || p === "cohorts")) return res.status(403).json({ error: DENY });
    // الحظر وإلغاء البطاقة ورفعهما ومنح الصلاحيات: لمدير حصاحيصاوي فقط
    if ((b.status === "banned" || cur.status === "banned" && b.status && b.status !== "banned" || b.revoke_card !== undefined || b.perms !== undefined) && !appAdmin)
      return res.status(403).json({ error: "الحظر وإلغاء البطاقات ومنح الصلاحيات لمدير حصاحيصاوي فقط" });
    // أعضاء «إدارة الفرع» لا يعدّلهم إلا مستوى إدارة الفرع
    if (cur.role === "admin" && !sc.branchAdmin) return res.status(403).json({ error: "لا يمكنك تعديل عضو في إدارة الفرع" });
    const statusChange = b.status && b.status !== cur.status;
    if (statusChange && !mine.includes("requests") && !mine.includes("members") && !appAdmin) return res.status(403).json({ error: "ليست لديك صلاحية تغيير حالة العضوية" });
    const status = ["pending", "active", "suspended", "rejected", "banned"].includes(b.status) ? b.status : cur.status;
    let role: Role = ROLES.includes(b.role) && (mine.includes("members") || mine.includes("requests")) ? b.role : cur.role;
    // تعيين «إدارة الفرع»: لمدير حصاحيصاوي أو لمدير فرع فقط — ومدير الوحدة لا يمنحها
    if (role === "admin" && cur.role !== "admin" && !sc.branchAdmin) return res.status(403).json({ error: "صفة «إدارة الفرع» يمنحها مستوى إدارة الفرع فقط" });
    if (Number(cur.user_id) === Number(me.id) && role !== "admin" && !appAdmin) role = cur.role;
    // الوحدة: مدير الوحدة لا ينقل عضواً إلى وحدة لا يديرها (ولا يخرجه إلى «بلا وحدة»)
    let unitId: number | null = cur.unit_id ?? null, unitText: string | null = cur.unit ?? null;
    if (b.unit_id !== undefined || b.unit !== undefined) {
      const sameText = b.unit_id === undefined && str(b.unit, 120) === String(cur.unit ?? "");
      if (!sameText) {
        const u = await resolveUnitInput(b, acc.all);
        if (u === "invalid") return res.status(400).json({ error: "الوحدة غير موجودة" });
        if (u === "unknown") return res.status(403).json({ error: "لا يمكنك نقل العضو إلى وحدة لا تديرها" });
        if ((u.id ?? null) !== (cur.unit_id ?? null)) {
          if (!acc.all && (u.id === null || !acc.unitIds.includes(u.id))) return res.status(403).json({ error: "لا يمكنك نقل العضو إلى وحدة لا تديرها" });
          unitId = u.id; unitText = u.name;
        }
      }
    }
    const cohort = b.cohort_id === undefined ? cur.cohort_id : (Number(b.cohort_id) || null);
    if (cohort && cohort !== cur.cohort_id) {
      const co = (await query(`SELECT unit_id FROM srcs_cohorts WHERE id=$1`, [cohort])).rows[0];
      if (!co || !canTouch(acc, co.unit_id)) return res.status(404).json({ error: "الدفعة غير موجودة أو خارج نطاقك" });
      if (co.unit_id && Number(co.unit_id) !== Number(unitId)) return res.status(400).json({ error: "هذه الدفعة تخص وحدة أخرى" });
    }
    let cardNo = cur.card_no, cardToken = cur.card_token, issued = cur.card_issued_at, expires = cur.card_expires_at;
    let revokedAt = cur.revoked_at, revokeReason = cur.revoke_reason;
    if (b.revoke_card === true || status === "banned") { revokedAt = revokedAt || new Date(); revokeReason = str(b.revoke_reason, 500) || revokeReason || "مخالفة القوانين"; }
    if (b.revoke_card === false) { revokedAt = null; revokeReason = null; }
    const becameActive = status === "active" && cur.status !== "active";
    if (status === "active" && (!cardNo || b.renew_card)) {
      if (!cardNo) { const c = newCard(); cardNo = c.no; cardToken = c.token; }
      issued = new Date(); expires = new Date(Date.now() + 365 * 86400_000);
    }
    const perms = b.perms === undefined ? cur.perms : asPerms(b.perms);
    const r = await query(
      `UPDATE srcs_members SET status=$2, role=$3, unit=$4, admin_note=$5, card_no=$6, card_token=$7,
         card_issued_at=$8, card_expires_at=$9, reviewed_by=$10, reviewed_at=NOW(), affiliation=$11, cohort_id=$12, perms=$13,
         revoked_at=$14, revoke_reason=$15, unit_id=$16 WHERE id=$1 RETURNING *`,
      [cur.id, status, role, unitText, b.admin_note === undefined ? cur.admin_note : str(b.admin_note) || null,
       cardNo, cardToken, issued, expires, me.id, b.affiliation === undefined ? cur.affiliation : str(b.affiliation, 160) || null, cohort, perms,
       revokedAt, revokeReason, unitId]);
    const uid = [Number(cur.user_id)];
    const changed: Record<string, unknown> = {};
    for (const [k, before, after] of [["status", cur.status, status], ["role", cur.role, role], ["unit", cur.unit, r.rows[0].unit], ["affiliation", cur.affiliation, r.rows[0].affiliation],
      ["cohort_id", cur.cohort_id, cohort], ["perms", JSON.stringify(cur.perms), JSON.stringify(perms)], ["revoked", !!cur.revoked_at, !!revokedAt]] as const)
      if (String(before ?? "") !== String(after ?? "")) changed[k] = { from: before, to: after };
    if (b.renew_card) changed.renew_card = true;
    if (Object.keys(changed).length) await audit(Number(me.id), status === "banned" && cur.status !== "banned" ? "ban" : b.perms !== undefined && changed.perms ? "perms" : changed.revoked ? "card_revoke" : "member_update", `member:${cur.id} ${cur.name}`, { ...changed, reason: revokeReason && changed.revoked ? revokeReason : undefined }, unitId ?? cur.unit_id);
    if (becameActive) await query(`UPDATE srcs_member_docs SET verified=TRUE WHERE user_id=$1 AND source='join'`, [cur.user_id]).catch(() => {});
    if (becameActive) notifyUsers(uid, "🚑 مرحباً بك في الهلال الأحمر", `قُبل طلبك بصفة ${ROLE_LABEL[role]}${unitText ? ` في ${unitText}` : ""} — بطاقتك جاهزة في التطبيق`, { kind: "srcs_accepted" });
    else if (status === "rejected" && cur.status !== "rejected") notifyUsers(uid, "طلب الانضمام للهلال الأحمر", "لم يُقبل طلبك حالياً" + (b.admin_note ? `: ${str(b.admin_note, 200)}` : ""), {});
    else if (status === "banned" && cur.status !== "banned") notifyUsers(uid, "⛔ حظر العضوية", `أُلغيت بطاقتك وحُظرت عضويتك: ${revokeReason}`, {});
    else if (b.revoke_card === true && !cur.revoked_at) notifyUsers(uid, "⛔ إلغاء بطاقة", `أُلغيت بطاقتك: ${revokeReason}`, {});
    else if (b.renew_card) notifyUsers(uid, "🪪 تجديد بطاقة المسعف", "جُدّدت بطاقتك لعام", {});
    if (b.perms !== undefined && JSON.stringify(perms) !== JSON.stringify(cur.perms)) notifyUsers(uid, "🔑 صلاحيات جديدة", "حُدّثت صلاحياتك في لوحة الهلال الأحمر", {});
    return res.json({ member: exposeRow(r.rows[0]) });
  } catch (err) { return fail(res, err, "member patch"); }
});

// ═══ الوحدات (مستوى الفرع فقط) ═══════════════════════════════════
/** قائمة عامة بالوحدات النشطة (لنموذج الانضمام) */
router.get("/srcs/units", async (_req, res) => {
  try {
    const r = await query(`SELECT un.id, un.name, un.code, un.description,
        (SELECT COUNT(*)::int FROM srcs_members m WHERE m.unit_id=un.id AND m.status='active') AS members
      FROM srcs_units un WHERE un.is_active ORDER BY un.name`);
    return res.json({ units: r.rows });
  } catch (err) { return fail(res, err, "units"); }
});
async function requireBranch(req: Request, res: Response): Promise<SessionUser | null> {
  const me = await sessionUser(req);
  if (!me || !(await scopeOf(me)).branchAdmin) { res.status(403).json({ error: "إدارة الوحدات لمستوى إدارة الفرع فقط" }); return null; }
  return me;
}
router.get("/srcs/admin/units", async (req, res) => {
  try {
    if (!(await requireBranch(req, res))) return;
    const r = await query(`SELECT un.*,
        (SELECT COUNT(*)::int FROM srcs_members m WHERE m.unit_id=un.id AND m.status='active') AS members,
        (SELECT COUNT(*)::int FROM srcs_members m WHERE m.unit_id=un.id AND m.status='pending') AS pending,
        COALESCE((SELECT json_agg(json_build_object('user_id', um.user_id, 'name', u.name, 'avatar_url', u.avatar_url, 'perms', um.perms) ORDER BY u.name)
           FROM srcs_unit_managers um JOIN users u ON u.id=um.user_id WHERE um.unit_id=un.id), '[]') AS managers
      FROM srcs_units un ORDER BY un.is_active DESC, un.name`);
    return res.json({ units: r.rows, perms: PERMS, defaultPerms: DEFAULT_UNIT_PERMS });
  } catch (err) { return fail(res, err, "admin units"); }
});
router.post("/srcs/admin/units", writeLimiter, async (req, res) => {
  try {
    const me = await requireBranch(req, res); if (!me) return;
    const name = str(req.body?.name, 120);
    if (name.length < 2) return res.status(400).json({ error: "اسم الوحدة مطلوب" });
    const r = await query(`INSERT INTO srcs_units (name, code, description, created_by) VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO NOTHING RETURNING *`,
      [name, str(req.body?.code, 30) || null, str(req.body?.description, 2000) || null, me.id]);
    if (!r.rows[0]) return res.status(409).json({ error: "توجد وحدة بهذا الاسم" });
    await audit(Number(me.id), "unit_create", `unit:${r.rows[0].id} ${name}`, {}, Number(r.rows[0].id));
    return res.json({ unit: r.rows[0] });
  } catch (err) { return fail(res, err, "unit create"); }
});
router.patch("/srcs/admin/units/:id", writeLimiter, async (req, res) => {
  try {
    const me = await requireBranch(req, res); if (!me) return;
    const b = req.body || {};
    const cur = (await query(`SELECT * FROM srcs_units WHERE id=$1`, [Number(req.params.id) || 0])).rows[0];
    if (!cur) return res.status(404).json({ error: "الوحدة غير موجودة" });
    const name = b.name === undefined ? cur.name : str(b.name, 120);
    if (name.length < 2) return res.status(400).json({ error: "اسم الوحدة مطلوب" });
    if (name !== cur.name && (await query(`SELECT 1 FROM srcs_units WHERE name=$1 AND id<>$2`, [name, cur.id])).rows[0]) return res.status(409).json({ error: "توجد وحدة بهذا الاسم" });
    const r = await query(`UPDATE srcs_units SET name=$2, code=$3, description=$4, is_active=$5 WHERE id=$1 RETURNING *`,
      [cur.id, name, b.code === undefined ? cur.code : str(b.code, 30) || null, b.description === undefined ? cur.description : str(b.description, 2000) || null,
       typeof b.is_active === "boolean" ? b.is_active : cur.is_active]);
    // اسم العرض على البطاقة وصفحة التحقق والتصدير يبقى متزامناً
    if (name !== cur.name) await query(`UPDATE srcs_members SET unit=$2 WHERE unit_id=$1`, [cur.id, name]);
    const changed: Record<string, unknown> = {};
    for (const k of ["name", "code", "description", "is_active"]) if (String(cur[k] ?? "") !== String(r.rows[0][k] ?? "")) changed[k] = { from: cur[k], to: r.rows[0][k] };
    if (Object.keys(changed).length) await audit(Number(me.id), "unit_update", `unit:${cur.id} ${name}`, changed, Number(cur.id));
    return res.json({ unit: r.rows[0] });
  } catch (err) { return fail(res, err, "unit patch"); }
});
router.put("/srcs/admin/units/:id/managers/:userId", writeLimiter, async (req, res) => {
  try {
    const me = await requireBranch(req, res); if (!me) return;
    const unit = (await query(`SELECT * FROM srcs_units WHERE id=$1`, [Number(req.params.id) || 0])).rows[0];
    if (!unit) return res.status(404).json({ error: "الوحدة غير موجودة" });
    const user = (await query(`SELECT id, name FROM users WHERE id=$1`, [Number(req.params.userId) || 0])).rows[0];
    if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
    const m = await membership(user.id);
    if (m && (m.status === "banned" || m.status === "suspended")) return res.status(400).json({ error: "لا يمكن تعيين عضو محظور أو موقوف مديراً لوحدة" });
    const perms = req.body?.perms === undefined ? DEFAULT_UNIT_PERMS : asPerms(req.body.perms);
    if (!perms.length) return res.status(400).json({ error: "اختر صلاحية واحدة على الأقل" });
    const prev = (await query(`SELECT perms FROM srcs_unit_managers WHERE unit_id=$1 AND user_id=$2`, [unit.id, user.id])).rows[0];
    await query(`INSERT INTO srcs_unit_managers (unit_id, user_id, perms, created_by) VALUES ($1,$2,$3,$4)
                 ON CONFLICT (unit_id, user_id) DO UPDATE SET perms=$3`, [unit.id, user.id, perms, me.id]);
    await audit(Number(me.id), prev ? "unit_manager_perms" : "unit_manager_add", `unit:${unit.id} ${unit.name}`, { user_id: user.id, name: user.name, perms: JSON.stringify(perms) }, Number(unit.id));
    notifyUsers([Number(user.id)], prev ? "🔑 تحديث صلاحيات الوحدة" : "🚑 أصبحت مديراً لوحدة", prev
      ? `حُدّثت صلاحياتك في إدارة «${unit.name}»`
      : `عُيّنت مديراً لـ«${unit.name}» في الهلال الأحمر — افتح لوحة الإدارة لإدارة وحدتك`, { kind: "srcs_unit_manager", unit_id: unit.id });
    return res.json({ ok: true, unit_id: unit.id, user_id: user.id, perms });
  } catch (err) { return fail(res, err, "unit manager put"); }
});
router.delete("/srcs/admin/units/:id/managers/:userId", writeLimiter, async (req, res) => {
  try {
    const me = await requireBranch(req, res); if (!me) return;
    const r = await query(`DELETE FROM srcs_unit_managers um USING srcs_units un WHERE un.id=um.unit_id AND um.unit_id=$1 AND um.user_id=$2 RETURNING un.name`,
      [Number(req.params.id) || 0, Number(req.params.userId) || 0]);
    if (!r.rows[0]) return res.status(404).json({ error: "ليس مديراً لهذه الوحدة" });
    await audit(Number(me.id), "unit_manager_remove", `unit:${req.params.id} ${r.rows[0].name}`, { user_id: Number(req.params.userId) }, Number(req.params.id));
    notifyUsers([Number(req.params.userId)], "إدارة الوحدة", `انتهى تكليفك بإدارة «${r.rows[0].name}»`, { kind: "srcs_unit_manager" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "unit manager delete"); }
});
/** بحث عن مستخدمين لتعيينهم مدراء وحدات (مستوى الفرع) */
router.get("/srcs/admin/users", async (req, res) => {
  try {
    if (!(await requireBranch(req, res))) return;
    const q = str(req.query.q, 60);
    if (q.length < 2) return res.json({ users: [] });
    const r = await query(`SELECT u.id, u.name, u.avatar_url, u.phone, m.status AS member_status, m.unit_id, un.name AS unit_name
        FROM users u LEFT JOIN srcs_members m ON m.user_id=u.id ${UNIT_JOIN("m")}
       WHERE u.name ILIKE $1 OR u.phone ILIKE $1 OR u.id::text = $2 ORDER BY (m.status='active') DESC NULLS LAST, u.name LIMIT 20`, [`%${q.replace(/[%_]/g, "")}%`, q]);
    return res.json({ users: r.rows });
  } catch (err) { return fail(res, err, "user search"); }
});

// الاجتماعات
router.get("/srcs/admin/meetings", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "meetings"); if (!ctx) return;
    const U = narrowUnits(ctx.acc, req.query.unit_id);
    if (U === false) return outOfScope(res);
    const r = await query(`SELECT mt.*, un.name AS unit_name,
        (SELECT COUNT(*)::int FROM srcs_meeting_rsvps r WHERE r.meeting_id=mt.id AND r.status='going') AS going,
        (SELECT COUNT(*)::int FROM srcs_meeting_rsvps r WHERE r.meeting_id=mt.id AND r.attended) AS attended
      FROM srcs_meetings mt ${UNIT_JOIN("mt")} WHERE ${unitCond("mt.unit_id", 1)} ORDER BY mt.starts_at DESC LIMIT 100`, [U]);
    return res.json({ meetings: r.rows });
  } catch (err) { return fail(res, err, "meetings"); }
});
router.post("/srcs/admin/meetings", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "meetings"); if (!ctx) return;
    const { me, acc } = ctx;
    const b = req.body || {};
    const starts = new Date(b.starts_at);
    if (!str(b.title) || isNaN(starts.getTime())) return res.status(400).json({ error: "العنوان والموعد مطلوبان" });
    if (!str(b.place)) return res.status(400).json({ error: "حدّد مكان الاجتماع" });
    const unitId = await pickWriteUnit(acc, b.unit_id, res); if (unitId === undefined) return;
    const audience = AUDIENCES.includes(b.audience) && b.audience !== "public" ? b.audience : "members";
    const ends = b.ends_at && !isNaN(new Date(b.ends_at).getTime()) ? new Date(b.ends_at) : null;
    const r = await query(`INSERT INTO srcs_meetings (title, agenda, place, starts_at, ends_at, audience, created_by, unit_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [str(b.title, 200), str(b.agenda) || null, str(b.place, 200) || null, starts, ends && ends > starts ? ends : null, audience, me.id, unitId]);
    notifyUsers(await audienceUserIds(audience, unitId), "📅 اجتماع جديد", `${str(b.title, 120)} — ${starts.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Khartoum" })} · ${str(b.place, 80)}`, { kind: "srcs_meeting", id: r.rows[0].id });
    return res.json({ meeting: r.rows[0] });
  } catch (err) { return fail(res, err, "meeting create"); }
});
router.patch("/srcs/admin/meetings/:id", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "meetings"); if (!ctx) return;
    const mt = await loadScoped("srcs_meetings", req.params.id, ctx.acc, res); if (!mt) return;
    const b = req.body || {};
    const r = await query(`UPDATE srcs_meetings SET title=COALESCE($2,title), agenda=COALESCE($3,agenda), place=COALESCE($4,place),
        starts_at=COALESCE($5,starts_at), minutes=COALESCE($6,minutes), ends_at=COALESCE($7,ends_at) WHERE id=$1 RETURNING *`,
      [mt.id, b.title ? str(b.title, 200) : null, b.agenda === undefined ? null : str(b.agenda), b.place === undefined ? null : str(b.place, 200),
       b.starts_at && !isNaN(new Date(b.starts_at).getTime()) ? new Date(b.starts_at) : null, b.minutes === undefined ? null : str(b.minutes, 8000),
       b.ends_at && !isNaN(new Date(b.ends_at).getTime()) ? new Date(b.ends_at) : null]);
    if (Array.isArray(b.attended_user_ids)) {
      const raw = b.attended_user_ids.map(Number).filter(Number.isFinite).slice(0, 500);
      // اجتماع الوحدة: الحضور من أعضاء الوحدة فقط
      const ids = (await query(`SELECT user_id FROM srcs_members WHERE status='active' AND user_id = ANY($1::int[]) AND ($2::int IS NULL OR unit_id=$2)`, [raw, mt.unit_id])).rows.map((x: any) => Number(x.user_id));
      await query(`UPDATE srcs_meeting_rsvps SET attended = (user_id = ANY($2::int[])) WHERE meeting_id=$1`, [mt.id, ids]);
      await query(`INSERT INTO srcs_meeting_rsvps (meeting_id, user_id, status, attended) SELECT $1, u, 'going', TRUE FROM UNNEST($2::int[]) u
                   ON CONFLICT (meeting_id, user_id) DO UPDATE SET attended=TRUE`, [mt.id, ids]);
    }
    return res.json({ meeting: r.rows[0] });
  } catch (err) { return fail(res, err, "meeting patch"); }
});
router.get("/srcs/admin/meetings/:id/rsvps", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "meetings"); if (!ctx) return;
    const mt = await loadScoped("srcs_meetings", req.params.id, ctx.acc, res); if (!mt) return;
    const r = await query(`SELECT m.user_id, u.name, m.role, r.status, COALESCE(r.attended,FALSE) AS attended
        FROM srcs_members m JOIN users u ON u.id=m.user_id
        LEFT JOIN srcs_meeting_rsvps r ON r.user_id=m.user_id AND r.meeting_id=$1
       WHERE m.status='active' AND ($2::int IS NULL OR m.unit_id=$2) ORDER BY r.status NULLS LAST, u.name`, [mt.id, mt.unit_id]);
    return res.json({ rsvps: r.rows });
  } catch (err) { return fail(res, err, "rsvps"); }
});
router.delete("/srcs/admin/meetings/:id", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "meetings"); if (!ctx) return;
    const mt = await loadScoped("srcs_meetings", req.params.id, ctx.acc, res); if (!mt) return;
    await query(`DELETE FROM srcs_meetings WHERE id=$1`, [mt.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "meeting delete"); }
});

// الإعلانات
router.get("/srcs/admin/announcements", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "announcements"); if (!ctx) return;
    const U = narrowUnits(ctx.acc, req.query.unit_id);
    if (U === false) return outOfScope(res);
    const r = await query(`SELECT a.*, un.name AS unit_name FROM srcs_announcements a ${UNIT_JOIN("a")}
       WHERE ${unitCond("a.unit_id", 1)} ORDER BY a.pinned DESC, a.created_at DESC LIMIT 200`, [U]);
    return res.json({ announcements: r.rows });
  } catch (err) { return fail(res, err, "announcements"); }
});
router.post("/srcs/admin/announcements", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "announcements"); if (!ctx) return;
    const { me, acc } = ctx;
    const b = req.body || {};
    if (!str(b.title) || !str(b.body)) return res.status(400).json({ error: "العنوان والنص مطلوبان" });
    const unitId = await pickWriteUnit(acc, b.unit_id, res); if (unitId === undefined) return;
    // إعلان الوحدة لا يكون «للجميع» خارج الوحدة
    const audience = AUDIENCES.includes(b.audience) && !(unitId && b.audience === "public") ? b.audience : "members";
    const r = await query(`INSERT INTO srcs_announcements (title, body, audience, pinned, created_by, unit_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [str(b.title, 200), str(b.body, 6000), audience, !!b.pinned, me.id, unitId]);
    if (b.notify !== false && audience !== "public") notifyUsers(await audienceUserIds(audience, unitId), `📢 ${str(b.title, 100)}`, str(b.body, 140), { kind: "srcs_announcement" });
    return res.json({ announcement: r.rows[0] });
  } catch (err) { return fail(res, err, "announcement"); }
});
router.patch("/srcs/admin/announcements/:id", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "announcements"); if (!ctx) return;
    const a = await loadScoped("srcs_announcements", req.params.id, ctx.acc, res); if (!a) return;
    const b = req.body || {};
    const r = await query(`UPDATE srcs_announcements SET title=COALESCE($2,title), body=COALESCE($3,body), pinned=COALESCE($4,pinned) WHERE id=$1 RETURNING *`,
      [a.id, b.title ? str(b.title, 200) : null, b.body ? str(b.body, 6000) : null, typeof b.pinned === "boolean" ? b.pinned : null]);
    return res.json({ announcement: r.rows[0] });
  } catch (err) { return fail(res, err, "announcement patch"); }
});
router.delete("/srcs/admin/announcements/:id", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "announcements"); if (!ctx) return;
    const a = await loadScoped("srcs_announcements", req.params.id, ctx.acc, res); if (!a) return;
    await query(`DELETE FROM srcs_announcements WHERE id=$1`, [a.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "announcement delete"); }
});

// الأنشطة والفعاليات (توثيق + نقاط تطوع للمشاركين)
router.get("/srcs/admin/activities", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "activities"); if (!ctx) return;
    const U = narrowUnits(ctx.acc, req.query.unit_id);
    if (U === false) return outOfScope(res);
    const r = await query(`SELECT a.*, un.name AS unit_name, (SELECT COUNT(*)::int FROM srcs_activity_participants p WHERE p.activity_id=a.id) AS volunteers
        FROM srcs_activities a ${UNIT_JOIN("a")} WHERE ${unitCond("a.unit_id", 1)} ORDER BY a.happened_at DESC LIMIT 200`, [U]);
    return res.json({ activities: r.rows });
  } catch (err) { return fail(res, err, "activities"); }
});
router.post("/srcs/admin/activities", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "activities"); if (!ctx) return;
    const { me, acc } = ctx;
    const b = req.body || {};
    if (!str(b.title)) return res.status(400).json({ error: "العنوان مطلوب" });
    const unitId = await pickWriteUnit(acc, b.unit_id, res); if (unitId === undefined) return;
    const images = (Array.isArray(b.images) ? b.images : []).map((x: unknown) => str(x, 500)).filter((x: string) => /^https:\/\//.test(x)).slice(0, 12);
    const when = b.happened_at && !isNaN(new Date(b.happened_at).getTime()) ? new Date(b.happened_at) : new Date();
    const r = await query(
      `INSERT INTO srcs_activities (title, type, description, place, happened_at, images, beneficiaries, published, points, created_by, unit_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [str(b.title, 200), ACTIVITY_TYPES.includes(b.type) ? b.type : "other", str(b.description, 8000) || null, str(b.place, 200) || null, when,
       JSON.stringify(images), Math.max(0, Math.min(1_000_000, Number(b.beneficiaries) || 0)), b.published !== false,
       Math.max(0, Math.min(200, Number(b.points) || 0)), me.id, unitId]);
    return res.json({ activity: r.rows[0] });
  } catch (err) { return fail(res, err, "activity"); }
});
router.patch("/srcs/admin/activities/:id", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "activities"); if (!ctx) return;
    const a = await loadScoped("srcs_activities", req.params.id, ctx.acc, res); if (!a) return;
    const b = req.body || {};
    const images = Array.isArray(b.images) ? JSON.stringify(b.images.map((x: unknown) => str(x, 500)).filter((x: string) => /^https:\/\//.test(x)).slice(0, 12)) : null;
    const r = await query(`UPDATE srcs_activities SET title=COALESCE($2,title), description=COALESCE($3,description), place=COALESCE($4,place),
        images=COALESCE($5::jsonb,images), beneficiaries=COALESCE($6,beneficiaries), published=COALESCE($7,published) WHERE id=$1 RETURNING *`,
      [a.id, b.title ? str(b.title, 200) : null, b.description === undefined ? null : str(b.description, 8000),
       b.place === undefined ? null : str(b.place, 200), images, b.beneficiaries === undefined ? null : Math.max(0, Number(b.beneficiaries) || 0),
       typeof b.published === "boolean" ? b.published : null]);
    return res.json({ activity: r.rows[0] });
  } catch (err) { return fail(res, err, "activity patch"); }
});
router.delete("/srcs/admin/activities/:id", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "activities"); if (!ctx) return;
    const a = await loadScoped("srcs_activities", req.params.id, ctx.acc, res); if (!a) return;
    await query(`DELETE FROM srcs_activities WHERE id=$1`, [a.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "activity delete"); }
});
/** تسجيل المشاركين: تُضاف نقاط النشاط إلى رصيد التطوع في حصاحيصاوي (مرة واحدة لكل مشارك) */
router.post("/srcs/admin/activities/:id/participants", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "activities"); if (!ctx) return;
    const { me } = ctx;
    const act = await loadScoped("srcs_activities", req.params.id, ctx.acc, res); if (!act) return;
    const ids: number[] = (Array.isArray(req.body?.user_ids) ? req.body.user_ids : []).map(Number).filter(Number.isFinite).slice(0, 500);
    // نشاط الوحدة: المشاركون من أعضاء الوحدة فقط
    const valid = (await query(`SELECT user_id FROM srcs_members WHERE status='active' AND user_id = ANY($1::int[]) AND ($2::int IS NULL OR unit_id=$2)`, [ids, act.unit_id])).rows.map((x: any) => Number(x.user_id));
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
