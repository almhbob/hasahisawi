// ════════════════════════════════════════════════════════════════
// 🏫 بيئة المؤسسات التعليمية (مدارس، جامعات، معاهد)
//  • مساحة لكل مؤسسة: طلب انضمام تعتمده إدارة التطبيق، ومدراء بأدوار وصلاحيات.
//  • المعلمون والموظفون، الطلاب (إضافة جماعية بلصق الأسطر)، الفصول، المواد، الإعلانات، الإعدادات.
//  • جدول حصص احترافي يرفض التضارب على الخادم: المعلم، الفصل، القاعة، والحد الأسبوعي.
//  • بوابة الطالب/ولي الأمر: الجدول، الإعلانات، الدرجات، الحضور، طلب الشهادات، النقل.
//  • نقل الطالب بين المؤسسات المنضمة: طلب → إخلاء طرف المدرسة الحالية → قبول المدرسة الجديدة.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();

export const ROLES = ["owner", "principal", "vice", "registrar"] as const;
type Role = (typeof ROLES)[number];
export const PERMS = ["staff", "students", "timetable", "announcements", "grades", "requests", "transfers", "settings", "admins"] as const;
type Perm = (typeof PERMS)[number];
const ROLE_PERMS: Record<Role, Perm[]> = {
  owner: [...PERMS],
  principal: [...PERMS],
  vice: ["staff", "students", "timetable", "announcements", "grades", "requests"],
  registrar: ["students", "requests", "transfers", "grades"],
};
const DEFAULT_SETTINGS = {
  days: [0, 1, 2, 3, 4], // 0=السبت … 6=الجمعة
  periods: 7,
  period_minutes: 45,
  start_time: "08:00",
  breaks: [{ after: 3, minutes: 30, label: "الفسحة" }],
  academic_year: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
  terms: ["الفصل الأول", "الفصل الثاني"],
  current_term: "الفصل الأول",
  max_score: 100,
};
const DAY_AR = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

let ready: Promise<void> | null = null;
export function ensureEduInstDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS edu_ws (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      kind VARCHAR(16) NOT NULL DEFAULT 'school',
      stage VARCHAR(60),
      city VARCHAR(80),
      address VARCHAR(220),
      phone VARCHAR(40),
      email VARCHAR(120),
      logo_url TEXT,
      description TEXT,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      legacy_inst_id INTEGER,
      status VARCHAR(12) NOT NULL DEFAULT 'pending',
      admin_note VARCHAR(300),
      settings JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS edu_admins (
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(12) NOT NULL DEFAULT 'vice',
      perms TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (ws_id, user_id)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS edu_staff (
      id SERIAL PRIMARY KEY,
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      user_id INTEGER,
      name VARCHAR(120) NOT NULL,
      kind VARCHAR(10) NOT NULL DEFAULT 'teacher',
      title VARCHAR(80),
      subjects TEXT[] NOT NULL DEFAULT '{}',
      phone VARCHAR(40),
      max_weekly SMALLINT NOT NULL DEFAULT 24,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS edu_classes (
      id SERIAL PRIMARY KEY,
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL,
      level VARCHAR(60),
      section VARCHAR(20),
      room VARCHAR(40),
      homeroom_teacher_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`);
    await query(`CREATE TABLE IF NOT EXISTS edu_subjects (
      id SERIAL PRIMARY KEY,
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL,
      color VARCHAR(9) NOT NULL DEFAULT '#2E7D9A'
    )`);
    await query(`CREATE TABLE IF NOT EXISTS edu_class_plan (
      class_id INTEGER NOT NULL REFERENCES edu_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES edu_subjects(id) ON DELETE CASCADE,
      teacher_id INTEGER REFERENCES edu_staff(id) ON DELETE SET NULL,
      weekly SMALLINT NOT NULL DEFAULT 0,
      PRIMARY KEY (class_id, subject_id)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS edu_slots (
      id SERIAL PRIMARY KEY,
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES edu_classes(id) ON DELETE CASCADE,
      day SMALLINT NOT NULL,
      period SMALLINT NOT NULL,
      subject_id INTEGER NOT NULL REFERENCES edu_subjects(id) ON DELETE CASCADE,
      teacher_id INTEGER REFERENCES edu_staff(id) ON DELETE SET NULL,
      room VARCHAR(40),
      UNIQUE (class_id, day, period)
    )`);
    // ضمانات قاعدة البيانات نفسها ضد التضارب (حتى لو تسابق طلبان)
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_slot_teacher ON edu_slots (ws_id, teacher_id, day, period) WHERE teacher_id IS NOT NULL`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_edu_slot_room ON edu_slots (ws_id, room, day, period) WHERE room IS NOT NULL AND room <> ''`);
    await query(`CREATE TABLE IF NOT EXISTS edu_students (
      id SERIAL PRIMARY KEY,
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      user_id INTEGER,
      name VARCHAR(140) NOT NULL,
      student_no VARCHAR(40),
      class_id INTEGER REFERENCES edu_classes(id) ON DELETE SET NULL,
      program VARCHAR(120),
      guardian_name VARCHAR(120),
      guardian_phone VARCHAR(40),
      status VARCHAR(12) NOT NULL DEFAULT 'active',
      transferred_from INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_edu_students_ws ON edu_students (ws_id, class_id, status)`);
    await query(`CREATE TABLE IF NOT EXISTS edu_announcements (
      id SERIAL PRIMARY KEY,
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      audience VARCHAR(10) NOT NULL DEFAULT 'all',
      class_id INTEGER,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS edu_grades (
      id SERIAL PRIMARY KEY,
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES edu_students(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES edu_subjects(id) ON DELETE CASCADE,
      term VARCHAR(40) NOT NULL,
      score NUMERIC(6,2),
      max_score NUMERIC(6,2) NOT NULL DEFAULT 100,
      note VARCHAR(200),
      entered_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (student_id, subject_id, term)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS edu_attendance (
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES edu_students(id) ON DELETE CASCADE,
      day DATE NOT NULL,
      status VARCHAR(8) NOT NULL DEFAULT 'present',
      PRIMARY KEY (student_id, day)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS edu_requests (
      id SERIAL PRIMARY KEY,
      ws_id INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES edu_students(id) ON DELETE CASCADE,
      user_id INTEGER,
      kind VARCHAR(20) NOT NULL DEFAULT 'enrollment_cert',
      note VARCHAR(400),
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      response VARCHAR(400),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE SEQUENCE IF NOT EXISTS edu_transfer_seq START 1`);
    await query(`CREATE TABLE IF NOT EXISTS edu_transfers (
      id SERIAL PRIMARY KEY,
      transfer_no VARCHAR(24) UNIQUE NOT NULL,
      student_id INTEGER NOT NULL REFERENCES edu_students(id) ON DELETE CASCADE,
      new_student_id INTEGER,
      from_ws INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      to_ws INTEGER NOT NULL REFERENCES edu_ws(id) ON DELETE CASCADE,
      requested_by INTEGER,
      reason VARCHAR(400),
      status VARCHAR(12) NOT NULL DEFAULT 'requested',
      from_note VARCHAR(300),
      to_note VARCHAR(300),
      to_class_id INTEGER,
      history JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  })().catch((e) => { ready = null; throw e; }));
}

// ─── أدوات عامة ──────────────────────────────────────────────
const clean = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const intOr = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : d; };
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const last9 = (v: unknown) => { const d = digits(v); return d.length >= 9 ? d.slice(-9) : null; };
function fail(res: Response, err: unknown, tag: string) {
  logger.error({ err }, `edu/${tag}`);
  return res.status(500).json({ error: "حدث خطأ في الخادم" });
}
async function notify(ids: (number | null | undefined)[], title: string, body: string, data: Record<string, unknown>) {
  const uids = [...new Set(ids.filter((x): x is number => !!x && x > 0))];
  if (!uids.length) return;
  const payload = { screen: "edu-institution", ...data };
  await query(`INSERT INTO notifications (user_id, type, title, body, data) SELECT u, 'edu', $2, $3, $4 FROM UNNEST($1::int[]) AS u`,
    [uids, title, body, JSON.stringify(payload)]).catch(() => {});
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [uids]);
    for (let i = 0; i < rows.length; i += 100) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(5000),
        body: JSON.stringify(rows.slice(i, i + 100).map((r: any) => ({ to: r.token, title, body, sound: "default", data: payload }))),
      }).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[edu] push"); }
}
async function wsAdminIds(wsId: number, perm?: Perm): Promise<number[]> {
  const { rows } = await query(`SELECT user_id, role, perms FROM edu_admins WHERE ws_id=$1`, [wsId]);
  return rows.filter((r: any) => !perm || (r.perms?.length ? r.perms : ROLE_PERMS[r.role as Role] ?? []).includes(perm)).map((r: any) => r.user_id);
}
function settingsOf(ws: any) { return { ...DEFAULT_SETTINGS, ...(ws?.settings || {}) }; }

type Access = { ws: any; role: Role | "app" | null; perms: Perm[]; staff: any | null; isAdmin: boolean };

/** مدير قسم المدارس: إدارة التطبيق، أو مشرف مُنح صلاحية «التعليم والمدارس» تحديداً */
export async function isEduManager(u: SessionUser | null): Promise<boolean> {
  if (!u) return false;
  if (u.role === "admin") return true;
  if (u.role !== "moderator") return false;
  const r = await query(`SELECT 1 FROM moderator_permissions WHERE user_id=$1 AND section='education' LIMIT 1`, [u.id]).catch(() => ({ rows: [] as any[] }));
  return r.rows.length > 0;
}
/** هل كل المعرّفات تتبع المؤسسة نفسها؟ (يمنع ربط بيانات مؤسسة بأخرى) */
async function ownedIds(table: "edu_classes" | "edu_subjects" | "edu_staff" | "edu_students", ids: (number | null | undefined)[], wsId: number): Promise<boolean> {
  const list = [...new Set(ids.filter((x): x is number => Number.isInteger(x) && (x as number) > 0))];
  if (!list.length) return true;
  const r = await query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ws_id=$1 AND id = ANY($2::int[])`, [wsId, list]);
  return r.rows[0].n === list.length;
}
async function access(u: SessionUser | null, wsId: number): Promise<Access | null> {
  const ws = (await query(`SELECT * FROM edu_ws WHERE id=$1`, [wsId])).rows[0];
  if (!ws) return null;
  if (!u) return { ws, role: null, perms: [], staff: null, isAdmin: false };
  if (await isEduManager(u)) return { ws, role: "app", perms: [...PERMS], staff: null, isAdmin: true };
  const a = (await query(`SELECT role, perms FROM edu_admins WHERE ws_id=$1 AND user_id=$2`, [wsId, u.id])).rows[0];
  const staff = (await query(`SELECT * FROM edu_staff WHERE ws_id=$1 AND user_id=$2 AND active`, [wsId, u.id])).rows[0] || null;
  const perms: Perm[] = a ? (a.perms?.length ? a.perms : ROLE_PERMS[a.role as Role] ?? []) : [];
  return { ws, role: a?.role ?? null, perms, staff, isAdmin: !!a };
}
async function need(req: Request, res: Response, perm: Perm | null, opts: { activeOnly?: boolean } = { activeOnly: true }): Promise<{ u: SessionUser; a: Access } | null> {
  const u = await sessionUser(req);
  if (!u) { res.status(401).json({ error: "سجّل الدخول" }); return null; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: "غير موجود" }); return null; }
  await ensureEduInstDb();
  const a = await access(u, id);
  if (!a) { res.status(404).json({ error: "المؤسسة غير موجودة" }); return null; }
  if (perm && !a.perms.includes(perm)) { res.status(403).json({ error: "ليست لديك صلاحية لهذا الإجراء" }); return null; }
  if (!perm && !a.isAdmin && !a.staff) { res.status(403).json({ error: "لإدارة المؤسسة وطاقمها فقط" }); return null; }
  if (opts.activeOnly && a.ws.status !== "active" && a.role !== "app") { res.status(409).json({ error: "المؤسسة بانتظار اعتماد إدارة التطبيق" }); return null; }
  return { u, a };
}
function wsRow(w: any) {
  return { id: w.id, name: w.name, kind: w.kind, stage: w.stage, city: w.city, address: w.address, phone: w.phone, email: w.email, logo_url: w.logo_url,
    description: w.description, status: w.status, admin_note: w.admin_note, settings: settingsOf(w), created_at: w.created_at };
}

// ─── المؤسسات ────────────────────────────────────────────────
router.get("/edu/institutions", async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const q = clean(req.query.q, 60);
    const params: unknown[] = [];
    let where = `w.status='active'`;
    if (q) { params.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`); where += ` AND (w.name ILIKE $1 OR w.city ILIKE $1 OR w.stage ILIKE $1)`; }
    if (req.query.kind && ["school", "university", "institute"].includes(String(req.query.kind))) { params.push(String(req.query.kind)); where += ` AND w.kind=$${params.length}`; }
    const { rows } = await query(`SELECT w.*, (SELECT COUNT(*) FROM edu_students s WHERE s.ws_id=w.id AND s.status='active')::int AS students,
        (SELECT COUNT(*) FROM edu_staff t WHERE t.ws_id=w.id AND t.active AND t.kind='teacher')::int AS teachers
      FROM edu_ws w WHERE ${where} ORDER BY w.name LIMIT 200`, params);
    return res.json({ institutions: rows.map((r: any) => ({ ...wsRow(r), students: r.students, teachers: r.teachers })) });
  } catch (err) { return fail(res, err, "list"); }
});

router.get("/edu/institutions/:id", async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    const a = await access(u, Number(req.params.id));
    if (!a || (a.ws.status !== "active" && !a.isAdmin)) return res.status(404).json({ error: "غير موجودة" });
    const stats = (await query(`SELECT (SELECT COUNT(*) FROM edu_students WHERE ws_id=$1 AND status='active')::int AS students,
      (SELECT COUNT(*) FROM edu_staff WHERE ws_id=$1 AND active AND kind='teacher')::int AS teachers,
      (SELECT COUNT(*) FROM edu_classes WHERE ws_id=$1)::int AS classes`, [a.ws.id])).rows[0];
    const ann = (await query(`SELECT id, title, body, pinned, created_at FROM edu_announcements WHERE ws_id=$1 AND audience='all' ORDER BY pinned DESC, created_at DESC LIMIT 10`, [a.ws.id])).rows;
    return res.json({ institution: wsRow(a.ws), stats, announcements: ann, me: { role: a.role, perms: a.perms, is_admin: a.isAdmin, is_teacher: !!a.staff } });
  } catch (err) { return fail(res, err, "get"); }
});

// طلب انضمام مؤسسة (تعتمده إدارة التطبيق)
router.post("/edu/institutions", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول" });
    const b = req.body || {};
    const name = clean(b.name, 200);
    if (name.length < 4) return res.status(400).json({ error: "اكتب اسم المؤسسة" });
    const kind = ["school", "university", "institute"].includes(b.kind) ? b.kind : "school";
    const phone = clean(b.phone, 40);
    if (digits(phone).length < 9) return res.status(400).json({ error: "رقم هاتف المؤسسة مطلوب" });
    const pend = (await query(`SELECT COUNT(*)::int AS n FROM edu_ws WHERE owner_id=$1 AND status='pending'`, [u.id])).rows[0].n;
    if (pend >= 2) return res.status(429).json({ error: "لديك طلبات قيد المراجعة" });
    const role: Role = ROLES.includes(b.role) && b.role !== "registrar" ? b.role : "owner";
    const { rows } = await query(
      `INSERT INTO edu_ws (name, kind, stage, city, address, phone, email, description, owner_id, legacy_inst_id, settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name, kind, clean(b.stage, 60) || null, clean(b.city, 80) || "الحصاحيصا", clean(b.address, 220) || null, phone, clean(b.email, 120) || null,
       clean(b.description, 1500) || null, u.id, Number(b.legacy_inst_id) || null, JSON.stringify(DEFAULT_SETTINGS)]);
    await query(`INSERT INTO edu_admins (ws_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [rows[0].id, u.id, role === "principal" ? "principal" : "owner"]);
    const admins = (await query(`SELECT id FROM users WHERE role='admin'`)).rows.map((r: any) => r.id);
    void notify(admins, "🏫 طلب انضمام مؤسسة تعليمية", `${name} — ${u.name}`, { screen: "admin-requests" });
    return res.status(201).json({ institution: wsRow(rows[0]), message: "استلمنا طلبك — ستُفعَّل مساحة مؤسستك بعد مراجعة الإدارة" });
  } catch (err) { return fail(res, err, "create"); }
});

router.get("/admin/edu/institutions", async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    if (!(await isEduManager(u))) return res.status(403).json({ error: "لإدارة التطبيق ومدير قسم المدارس فقط" });
    const st = ["pending", "active", "rejected", "suspended"].includes(String(req.query.status)) ? String(req.query.status) : "pending";
    const { rows } = await query(`SELECT w.*, u.name AS owner_name, u.phone AS owner_phone FROM edu_ws w LEFT JOIN users u ON u.id=w.owner_id WHERE w.status=$1 ORDER BY w.created_at DESC LIMIT 200`, [st]);
    return res.json({ institutions: rows.map((r: any) => ({ ...wsRow(r), owner_name: r.owner_name, owner_phone: r.owner_phone })) });
  } catch (err) { return fail(res, err, "admin-list"); }
});
router.patch("/admin/edu/institutions/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    if (!(await isEduManager(u))) return res.status(403).json({ error: "لإدارة التطبيق ومدير قسم المدارس فقط" });
    const st = String(req.body?.status);
    if (!["active", "rejected", "suspended", "pending"].includes(st)) return res.status(400).json({ error: "حالة غير صالحة" });
    const note = clean(req.body?.note, 300) || null;
    const { rows } = await query(`UPDATE edu_ws SET status=$1, admin_note=$2, updated_at=NOW() WHERE id=$3 RETURNING *`, [st, note, Number(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: "غير موجودة" });
    const admins = await wsAdminIds(rows[0].id);
    void notify(admins, st === "active" ? "✅ فُعّلت مساحة مؤسستك" : "بخصوص طلب مؤسستك", st === "active" ? `${rows[0].name} — ابدأ بإضافة الطاقم والطلاب` : note || st, { screen: "edu-admin", id: rows[0].id });
    return res.json({ institution: wsRow(rows[0]) });
  } catch (err) { return fail(res, err, "admin-patch"); }
});

// كل ما يخص المستخدم: مؤسسات يديرها، يدرّس فيها، أو هو/ابنه طالب فيها
router.get("/edu/me", async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول" });
    const admin = (await query(`SELECT w.*, a.role FROM edu_admins a JOIN edu_ws w ON w.id=a.ws_id WHERE a.user_id=$1 ORDER BY w.name`, [u.id])).rows;
    const teach = (await query(`SELECT w.*, t.id AS staff_id, t.kind AS staff_kind FROM edu_staff t JOIN edu_ws w ON w.id=t.ws_id WHERE t.user_id=$1 AND t.active AND w.status='active'`, [u.id])).rows;
    const key = last9(u.phone);
    const studs = (await query(
      `SELECT s.*, w.name AS ws_name, c.name AS class_name FROM edu_students s JOIN edu_ws w ON w.id=s.ws_id LEFT JOIN edu_classes c ON c.id=s.class_id
       WHERE s.status='active' AND w.status='active' AND (s.user_id=$1 OR ($2::text IS NOT NULL AND RIGHT(regexp_replace(COALESCE(s.guardian_phone,''),'\\D','','g'),9)=$2))`, [u.id, key])).rows;
    return res.json({
      admin: admin.map((r: any) => ({ ...wsRow(r), role: r.role })),
      teaching: teach.map((r: any) => ({ ...wsRow(r), staff_id: r.staff_id, staff_kind: r.staff_kind })),
      students: studs.map((s: any) => ({ id: s.id, ws_id: s.ws_id, ws_name: s.ws_name, name: s.name, student_no: s.student_no, class_id: s.class_id, class_name: s.class_name,
        program: s.program, relation: s.user_id === u.id ? "self" : "guardian" })),
    });
  } catch (err) { return fail(res, err, "me"); }
});

// ─── لوحة المؤسسة ────────────────────────────────────────────
router.get("/edu/ws/:id/overview", async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, null, { activeOnly: false }); if (!g) return;
    const id = g.a.ws.id;
    const [staff, classes, subjects, admins, counts] = await Promise.all([
      query(`SELECT * FROM edu_staff WHERE ws_id=$1 ORDER BY kind, name`, [id]),
      query(`SELECT c.*, (SELECT COUNT(*) FROM edu_students s WHERE s.class_id=c.id AND s.status='active')::int AS students,
               (SELECT COUNT(*) FROM edu_slots x WHERE x.class_id=c.id)::int AS slots FROM edu_classes c WHERE c.ws_id=$1 ORDER BY c.sort_order, c.name`, [id]),
      query(`SELECT * FROM edu_subjects WHERE ws_id=$1 ORDER BY name`, [id]),
      query(`SELECT a.user_id, a.role, a.perms, u.name, u.phone, u.avatar_url FROM edu_admins a JOIN users u ON u.id=a.user_id WHERE a.ws_id=$1 ORDER BY a.created_at`, [id]),
      query(`SELECT (SELECT COUNT(*) FROM edu_students WHERE ws_id=$1 AND status='active')::int AS students,
               (SELECT COUNT(*) FROM edu_requests WHERE ws_id=$1 AND status='pending')::int AS pending_requests,
               (SELECT COUNT(*) FROM edu_transfers WHERE (from_ws=$1 AND status='requested') OR (to_ws=$1 AND status='released'))::int AS pending_transfers`, [id]),
    ]);
    const load = (await query(`SELECT teacher_id, COUNT(*)::int AS n FROM edu_slots WHERE ws_id=$1 AND teacher_id IS NOT NULL GROUP BY teacher_id`, [id])).rows;
    const loadMap = Object.fromEntries(load.map((r: any) => [r.teacher_id, r.n]));
    return res.json({
      institution: wsRow(g.a.ws), me: { role: g.a.role, perms: g.a.perms, staff_id: g.a.staff?.id ?? null },
      staff: staff.rows.map((s: any) => ({ ...s, weekly_load: loadMap[s.id] || 0 })), classes: classes.rows, subjects: subjects.rows,
      admins: admins.rows.map((r: any) => ({ ...r, perms: r.perms?.length ? r.perms : ROLE_PERMS[r.role as Role] ?? [] })), counts: counts.rows[0],
      roles: ROLES, all_perms: PERMS,
    });
  } catch (err) { return fail(res, err, "overview"); }
});

router.put("/edu/ws/:id/settings", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "settings", { activeOnly: false }); if (!g) return;
    const b = req.body || {};
    const cur = settingsOf(g.a.ws);
    const days = Array.isArray(b.days) ? [...new Set(b.days.map(Number).filter((d: number) => d >= 0 && d <= 6))].sort() : cur.days;
    if (!days.length) return res.status(400).json({ error: "اختر يوم دراسة واحداً على الأقل" });
    const periods = Math.max(1, Math.min(12, intOr(b.periods, cur.periods)));
    const breaks = Array.isArray(b.breaks) ? b.breaks.slice(0, 4).map((x: any) => ({ after: Math.max(1, Math.min(periods - 1, intOr(x.after, 3))), minutes: Math.max(5, Math.min(90, intOr(x.minutes, 30))), label: clean(x.label, 30) || "استراحة" })) : cur.breaks;
    const terms = Array.isArray(b.terms) ? b.terms.map((t: unknown) => clean(t, 40)).filter(Boolean).slice(0, 6) : cur.terms;
    const settings = {
      ...cur, days, periods, breaks, terms: terms.length ? terms : cur.terms,
      period_minutes: Math.max(20, Math.min(120, intOr(b.period_minutes, cur.period_minutes))),
      start_time: /^\d{1,2}:\d{2}$/.test(String(b.start_time)) ? String(b.start_time) : cur.start_time,
      academic_year: clean(b.academic_year, 20) || cur.academic_year,
      current_term: clean(b.current_term, 40) || cur.current_term,
      max_score: Math.max(10, Math.min(1000, intOr(b.max_score, cur.max_score))),
    };
    // حذف الحصص الخارجة عن الإعدادات الجديدة
    await query(`DELETE FROM edu_slots WHERE ws_id=$1 AND (period > $2 OR NOT (day = ANY($3::smallint[])))`, [g.a.ws.id, periods, days]);
    const info: Record<string, unknown> = {};
    for (const k of ["name", "stage", "city", "address", "phone", "email", "description", "logo_url"]) if (b[k] !== undefined) info[k] = clean(b[k], k === "description" ? 1500 : 300) || null;
    const sets = Object.keys(info).map((k, i) => `${k}=$${i + 3}`);
    const { rows } = await query(`UPDATE edu_ws SET settings=$1${sets.length ? "," + sets.join(",") : ""}, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [JSON.stringify(settings), g.a.ws.id, ...Object.values(info)]);
    return res.json({ institution: wsRow(rows[0]) });
  } catch (err) { return fail(res, err, "settings"); }
});

// المدراء والصلاحيات
router.put("/edu/ws/:id/admins/:userId", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "admins", { activeOnly: false }); if (!g) return;
    const uid = Number(req.params.userId);
    const role: Role = ROLES.includes(req.body?.role) ? req.body.role : "vice";
    if (role === "owner" && g.a.role !== "owner" && g.a.role !== "app") return res.status(403).json({ error: "تعيين مالك جديد للمالك فقط" });
    const perms = Array.isArray(req.body?.perms) ? req.body.perms.filter((p: string) => (PERMS as readonly string[]).includes(p)) : null;
    if (!(await query(`SELECT 1 FROM users WHERE id=$1`, [uid])).rows.length) return res.status(404).json({ error: "المستخدم غير موجود" });
    await query(`INSERT INTO edu_admins (ws_id, user_id, role, perms) VALUES ($1,$2,$3,$4) ON CONFLICT (ws_id, user_id) DO UPDATE SET role=$3, perms=$4`,
      [g.a.ws.id, uid, role, perms && perms.length ? perms : null]);
    void notify([uid], "🏫 صلاحيات إدارية", `أُضفت إلى إدارة ${g.a.ws.name}`, { screen: "edu-admin", id: g.a.ws.id });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "admin-put"); }
});
router.delete("/edu/ws/:id/admins/:userId", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "admins", { activeOnly: false }); if (!g) return;
    const t = (await query(`SELECT role FROM edu_admins WHERE ws_id=$1 AND user_id=$2`, [g.a.ws.id, Number(req.params.userId)])).rows[0];
    if (t?.role === "owner") return res.status(409).json({ error: "لا يمكن إزالة مالك المساحة" });
    await query(`DELETE FROM edu_admins WHERE ws_id=$1 AND user_id=$2`, [g.a.ws.id, Number(req.params.userId)]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "admin-del"); }
});
router.get("/edu/users/lookup", async (req: Request, res: Response) => {
  try {
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول" });
    const q = clean(req.query.q, 60);
    if (q.length < 3) return res.json({ users: [] });
    const d = digits(q);
    const { rows } = await query(`SELECT id, name, avatar_url FROM users WHERE (name ILIKE $1 OR ($2 <> '' AND RIGHT(regexp_replace(COALESCE(phone,''),'\\D','','g'),9) = RIGHT($2,9))) AND COALESCE(is_banned,false)=false LIMIT 10`,
      [`%${q.replace(/[%_\\]/g, "\\$&")}%`, d.length >= 9 ? d : ""]);
    return res.json({ users: rows });
  } catch (err) { return fail(res, err, "lookup"); }
});

// المعلمون والموظفون (فردي أو جماعي: «الاسم، المادة، الهاتف» في كل سطر)
async function linkUserByPhone(phone: string | null): Promise<number | null> {
  const k = last9(phone); if (!k) return null;
  const r = await query(`SELECT id FROM users WHERE RIGHT(regexp_replace(COALESCE(phone,''),'\\D','','g'),9)=$1 LIMIT 1`, [k]);
  return r.rows[0]?.id ?? null;
}
router.get("/edu/ws/:id/staff", async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, null, { activeOnly: false }); if (!g) return;
    const { rows } = await query(`SELECT * FROM edu_staff WHERE ws_id=$1 ORDER BY kind, name`, [g.a.ws.id]);
    return res.json({ staff: rows });
  } catch (err) { return fail(res, err, "staff"); }
});
router.post("/edu/ws/:id/staff", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "staff"); if (!g) return;
    const b = req.body || {};
    const items: any[] = Array.isArray(b.items) ? b.items : typeof b.lines === "string"
      ? b.lines.split("\n").map((l: string) => l.split(/[,،\t|]/).map((x) => x.trim())).filter((p: string[]) => p[0]).map((p: string[]) => ({ name: p[0], subjects: p[1] ? p[1].split(/[\/+]/) : [], phone: p[2] || null }))
      : [b];
    let added = 0;
    for (const it of items.slice(0, 200)) {
      const name = clean(it.name, 120);
      if (name.length < 3) continue;
      const phone = clean(it.phone, 40) || null;
      const subjects = (Array.isArray(it.subjects) ? it.subjects : String(it.subjects || "").split(/[,،\/]/)).map((x: unknown) => clean(x, 60)).filter(Boolean).slice(0, 8);
      const uid = await linkUserByPhone(phone);
      await query(`INSERT INTO edu_staff (ws_id, user_id, name, kind, title, subjects, phone, max_weekly) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [g.a.ws.id, uid, name, it.kind === "employee" ? "employee" : "teacher", clean(it.title, 80) || null, subjects, phone, Math.max(1, Math.min(48, intOr(it.max_weekly, 24)))]);
      if (uid) void notify([uid], "🏫 انضممت لطاقم مؤسسة", `${g.a.ws.name} — يمكنك الآن رؤية جدولك`, { screen: "edu-timetable", id: g.a.ws.id });
      added++;
    }
    return res.status(201).json({ ok: true, added });
  } catch (err) { return fail(res, err, "staff-add"); }
});
router.patch("/edu/ws/:id/staff/:sid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "staff"); if (!g) return;
    const cur = (await query(`SELECT * FROM edu_staff WHERE id=$1 AND ws_id=$2`, [Number(req.params.sid), g.a.ws.id])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    const b = req.body || {};
    const phone = b.phone !== undefined ? clean(b.phone, 40) || null : cur.phone;
    const uid = b.phone !== undefined ? await linkUserByPhone(phone) : cur.user_id;
    const subjects = b.subjects !== undefined ? (Array.isArray(b.subjects) ? b.subjects : String(b.subjects).split(/[,،\/]/)).map((x: unknown) => clean(x, 60)).filter(Boolean).slice(0, 8) : cur.subjects;
    const { rows } = await query(`UPDATE edu_staff SET name=$1, kind=$2, title=$3, subjects=$4, phone=$5, user_id=$6, max_weekly=$7, active=$8 WHERE id=$9 RETURNING *`,
      [clean(b.name, 120) || cur.name, b.kind === "employee" || b.kind === "teacher" ? b.kind : cur.kind, b.title !== undefined ? clean(b.title, 80) || null : cur.title,
       subjects, phone, uid, b.max_weekly !== undefined ? Math.max(1, Math.min(48, intOr(b.max_weekly, 24))) : cur.max_weekly, b.active !== undefined ? !!b.active : cur.active, cur.id]);
    return res.json({ staff: rows[0] });
  } catch (err) { return fail(res, err, "staff-patch"); }
});
router.delete("/edu/ws/:id/staff/:sid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "staff"); if (!g) return;
    await query(`DELETE FROM edu_staff WHERE id=$1 AND ws_id=$2`, [Number(req.params.sid), g.a.ws.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "staff-del"); }
});

// الفصول والمواد وخطة الحصص الأسبوعية
router.post("/edu/ws/:id/classes", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    const b = req.body || {};
    const names: string[] = Array.isArray(b.names) ? b.names : [b.name];
    let added = 0;
    for (const n of names.map((x) => clean(x, 80)).filter((x) => x.length >= 1).slice(0, 60)) {
      await query(`INSERT INTO edu_classes (ws_id, name, level, section, room) VALUES ($1,$2,$3,$4,$5)`, [g.a.ws.id, n, clean(b.level, 60) || null, clean(b.section, 20) || null, clean(b.room, 40) || null]);
      added++;
    }
    return res.status(201).json({ ok: true, added });
  } catch (err) { return fail(res, err, "class-add"); }
});
router.patch("/edu/ws/:id/classes/:cid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    const b = req.body || {};
    if (!(await ownedIds("edu_staff", [Number(b.homeroom_teacher_id) || null], g.a.ws.id))) return res.status(400).json({ error: "المعلم ليس من طاقم هذه المؤسسة" });
    const { rows } = await query(`UPDATE edu_classes SET name=COALESCE($1,name), level=$2, section=$3, room=$4, homeroom_teacher_id=$5 WHERE id=$6 AND ws_id=$7 RETURNING *`,
      [clean(b.name, 80) || null, clean(b.level, 60) || null, clean(b.section, 20) || null, clean(b.room, 40) || null, Number(b.homeroom_teacher_id) || null, Number(req.params.cid), g.a.ws.id]);
    return rows[0] ? res.json({ class: rows[0] }) : res.status(404).json({ error: "غير موجود" });
  } catch (err) { return fail(res, err, "class-patch"); }
});
router.delete("/edu/ws/:id/classes/:cid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    await query(`DELETE FROM edu_classes WHERE id=$1 AND ws_id=$2`, [Number(req.params.cid), g.a.ws.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "class-del"); }
});
const SUBJECT_COLORS = ["#2E7D9A", "#7A2E3A", "#1F5F4A", "#B7791F", "#2B6CB0", "#0F766E", "#9B2C2C", "#5A6B7B", "#C2580A", "#1B4D6B", "#3B6E2A", "#8E3B46"];
router.post("/edu/ws/:id/subjects", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    const names: string[] = Array.isArray(req.body?.names) ? req.body.names : [req.body?.name];
    const n0 = (await query(`SELECT COUNT(*)::int AS n FROM edu_subjects WHERE ws_id=$1`, [g.a.ws.id])).rows[0].n;
    let i = 0;
    for (const n of names.map((x) => clean(x, 80)).filter(Boolean).slice(0, 40)) {
      const dup = (await query(`SELECT 1 FROM edu_subjects WHERE ws_id=$1 AND name=$2`, [g.a.ws.id, n])).rows.length;
      if (dup) continue;
      await query(`INSERT INTO edu_subjects (ws_id, name, color) VALUES ($1,$2,$3)`, [g.a.ws.id, n, SUBJECT_COLORS[(n0 + i++) % SUBJECT_COLORS.length]]);
    }
    return res.status(201).json({ ok: true, added: i });
  } catch (err) { return fail(res, err, "subject-add"); }
});
router.delete("/edu/ws/:id/subjects/:sid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    await query(`DELETE FROM edu_subjects WHERE id=$1 AND ws_id=$2`, [Number(req.params.sid), g.a.ws.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "subject-del"); }
});
router.get("/edu/ws/:id/classes/:cid/plan", async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, null); if (!g) return;
    const { rows } = await query(`SELECT p.*, (SELECT COUNT(*) FROM edu_slots s WHERE s.class_id=p.class_id AND s.subject_id=p.subject_id)::int AS placed
      FROM edu_class_plan p JOIN edu_classes c ON c.id=p.class_id WHERE p.class_id=$1 AND c.ws_id=$2`, [Number(req.params.cid), g.a.ws.id]);
    return res.json({ plan: rows });
  } catch (err) { return fail(res, err, "plan"); }
});
router.put("/edu/ws/:id/classes/:cid/plan", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    const cid = Number(req.params.cid);
    if (!(await query(`SELECT 1 FROM edu_classes WHERE id=$1 AND ws_id=$2`, [cid, g.a.ws.id])).rows.length) return res.status(404).json({ error: "الفصل غير موجود" });
    const st = settingsOf(g.a.ws);
    const items = (Array.isArray(req.body?.plan) ? req.body.plan : []).map((p: any) => ({ subject_id: Number(p.subject_id), teacher_id: Number(p.teacher_id) || null, weekly: Math.max(0, Math.min(20, intOr(p.weekly, 0))) }))
      .filter((p: any) => p.subject_id > 0);
    if (!(await ownedIds("edu_subjects", items.map((p: any) => p.subject_id), g.a.ws.id))) return res.status(400).json({ error: "مادة لا تتبع هذه المؤسسة" });
    if (!(await ownedIds("edu_staff", items.map((p: any) => p.teacher_id), g.a.ws.id))) return res.status(400).json({ error: "معلم ليس من طاقم هذه المؤسسة" });
    const total = items.reduce((a: number, p: any) => a + p.weekly, 0);
    const capacity = st.days.length * st.periods;
    if (total > capacity) return res.status(400).json({ error: `مجموع الحصص الأسبوعية (${total}) أكبر من سعة الأسبوع (${capacity} حصة)` });
    await query(`DELETE FROM edu_class_plan WHERE class_id=$1`, [cid]);
    for (const p of items) await query(`INSERT INTO edu_class_plan (class_id, subject_id, teacher_id, weekly) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [cid, p.subject_id, p.teacher_id, p.weekly]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "plan-put"); }
});

// ─── جدول الحصص (يرفض التضارب) ────────────────────────────────
const SLOT_SELECT = `SELECT s.*, c.name AS class_name, sb.name AS subject_name, sb.color AS subject_color, t.name AS teacher_name
  FROM edu_slots s JOIN edu_classes c ON c.id=s.class_id JOIN edu_subjects sb ON sb.id=s.subject_id LEFT JOIN edu_staff t ON t.id=s.teacher_id`;

/** يفحص تضارب حصة: يرجع رسالة عربية واضحة أو null */
async function conflictOf(wsId: number, slot: { class_id: number; day: number; period: number; teacher_id: number | null; room: string | null }, ignoreClassCell = true): Promise<string | null> {
  const dayAr = DAY_AR[slot.day] ?? `اليوم ${slot.day}`;
  if (slot.teacher_id) {
    const t = (await query(`${SLOT_SELECT} WHERE s.ws_id=$1 AND s.teacher_id=$2 AND s.day=$3 AND s.period=$4 AND s.class_id<>$5`,
      [wsId, slot.teacher_id, slot.day, slot.period, slot.class_id])).rows[0];
    if (t) return `تضارب: المعلم ${t.teacher_name} لديه حصة ${t.subject_name} مع فصل «${t.class_name}» يوم ${dayAr} في الحصة ${slot.period}`;
    const st = (await query(`SELECT name, max_weekly, active FROM edu_staff WHERE id=$1 AND ws_id=$2`, [slot.teacher_id, wsId])).rows[0];
    if (!st) return "المعلم غير موجود في هذه المؤسسة";
    if (!st.active) return `المعلم ${st.name} غير نشط حالياً`;
    const load = (await query(`SELECT COUNT(*)::int AS n FROM edu_slots WHERE ws_id=$1 AND teacher_id=$2 AND NOT (class_id=$3 AND day=$4 AND period=$5)`,
      [wsId, slot.teacher_id, slot.class_id, slot.day, slot.period])).rows[0].n;
    if (load + 1 > st.max_weekly) return `تجاوز النصاب: للمعلم ${st.name} ${load} حصة، والحد الأسبوعي ${st.max_weekly}`;
  }
  if (slot.room) {
    const r = (await query(`${SLOT_SELECT} WHERE s.ws_id=$1 AND s.room=$2 AND s.day=$3 AND s.period=$4 AND s.class_id<>$5`, [wsId, slot.room, slot.day, slot.period, slot.class_id])).rows[0];
    if (r) return `تضارب: القاعة «${slot.room}» محجوزة لفصل «${r.class_name}» (${r.subject_name}) يوم ${dayAr} الحصة ${slot.period}`;
  }
  void ignoreClassCell;
  return null;
}

router.get("/edu/ws/:id/timetable", async (req: Request, res: Response) => {
  try {
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول" });
    await ensureEduInstDb();
    const a = await access(u, Number(req.params.id));
    if (!a) return res.status(404).json({ error: "غير موجودة" });
    const classId = Number(req.query.class_id) || null;
    const teacherId = Number(req.query.teacher_id) || null;
    // الطالب/ولي الأمر يرى جدول فصله فقط
    if (!a.isAdmin && !a.staff) {
      const key = last9(u.phone);
      const ok = classId && (await query(`SELECT 1 FROM edu_students WHERE ws_id=$1 AND class_id=$2 AND status='active' AND (user_id=$3 OR ($4::text IS NOT NULL AND RIGHT(regexp_replace(COALESCE(guardian_phone,''),'\\D','','g'),9)=$4))`,
        [a.ws.id, classId, u.id, key])).rows.length;
      if (!ok) return res.status(403).json({ error: "غير مسموح" });
    }
    const params: unknown[] = [a.ws.id]; let where = "s.ws_id=$1";
    if (classId) { params.push(classId); where += ` AND s.class_id=$${params.length}`; }
    else if (teacherId) { params.push(teacherId); where += ` AND s.teacher_id=$${params.length}`; }
    else if (a.staff && !a.isAdmin) { params.push(a.staff.id); where += ` AND s.teacher_id=$${params.length}`; }
    const { rows } = await query(`${SLOT_SELECT} WHERE ${where} ORDER BY s.day, s.period`, params);
    return res.json({ settings: settingsOf(a.ws), slots: rows, my_staff_id: a.staff?.id ?? null });
  } catch (err) { return fail(res, err, "timetable"); }
});

// المعلمون المشغولون في يوم/حصة (لتعطيلهم في واجهة الاختيار مع السبب)
router.get("/edu/ws/:id/availability", async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    const day = intOr(req.query.day, -1), period = intOr(req.query.period, -1), cid = Number(req.query.class_id) || 0;
    const busy = (await query(`${SLOT_SELECT} WHERE s.ws_id=$1 AND s.day=$2 AND s.period=$3 AND s.class_id<>$4 AND s.teacher_id IS NOT NULL`, [g.a.ws.id, day, period, cid])).rows;
    const load = (await query(`SELECT t.id, t.max_weekly, COUNT(s.id)::int AS n FROM edu_staff t LEFT JOIN edu_slots s ON s.teacher_id=t.id WHERE t.ws_id=$1 GROUP BY t.id`, [g.a.ws.id])).rows;
    const rooms = (await query(`SELECT room, class_id FROM edu_slots WHERE ws_id=$1 AND day=$2 AND period=$3 AND class_id<>$4 AND room IS NOT NULL`, [g.a.ws.id, day, period, cid])).rows;
    return res.json({
      busy: Object.fromEntries(busy.map((b: any) => [b.teacher_id, `مع «${b.class_name}» (${b.subject_name})`])),
      full: Object.fromEntries(load.filter((l: any) => l.n >= l.max_weekly).map((l: any) => [l.id, `اكتمل النصاب (${l.n}/${l.max_weekly})`])),
      rooms: rooms.map((r: any) => r.room),
    });
  } catch (err) { return fail(res, err, "availability"); }
});

router.put("/edu/ws/:id/slots", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    const st = settingsOf(g.a.ws);
    const b = req.body || {};
    const slot = { class_id: Number(b.class_id), day: intOr(b.day, -1), period: intOr(b.period, -1), subject_id: Number(b.subject_id), teacher_id: Number(b.teacher_id) || null, room: clean(b.room, 40) || null };
    if (!st.days.includes(slot.day) || slot.period < 1 || slot.period > st.periods) return res.status(400).json({ error: "اليوم أو الحصة خارج إعدادات الجدول" });
    const cls = (await query(`SELECT * FROM edu_classes WHERE id=$1 AND ws_id=$2`, [slot.class_id, g.a.ws.id])).rows[0];
    if (!cls) return res.status(404).json({ error: "الفصل غير موجود" });
    if (!(await query(`SELECT 1 FROM edu_subjects WHERE id=$1 AND ws_id=$2`, [slot.subject_id, g.a.ws.id])).rows.length) return res.status(400).json({ error: "اختر المادة" });
    if (!slot.room && cls.room) slot.room = cls.room;
    const c = await conflictOf(g.a.ws.id, slot);
    if (c) return res.status(409).json({ error: c, code: "conflict" });
    try {
      const { rows } = await query(
        `INSERT INTO edu_slots (ws_id, class_id, day, period, subject_id, teacher_id, room) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (class_id, day, period) DO UPDATE SET subject_id=EXCLUDED.subject_id, teacher_id=EXCLUDED.teacher_id, room=EXCLUDED.room RETURNING id`,
        [g.a.ws.id, slot.class_id, slot.day, slot.period, slot.subject_id, slot.teacher_id, slot.room]);
      const full = (await query(`${SLOT_SELECT} WHERE s.id=$1`, [rows[0].id])).rows[0];
      return res.json({ slot: full });
    } catch (e: any) {
      if (e?.code === "23505") return res.status(409).json({ error: "تضارب: المعلم أو القاعة محجوزة في هذا الوقت", code: "conflict" });
      throw e;
    }
  } catch (err) { return fail(res, err, "slot-put"); }
});
router.delete("/edu/ws/:id/slots", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    await query(`DELETE FROM edu_slots WHERE ws_id=$1 AND class_id=$2 AND day=$3 AND period=$4`, [g.a.ws.id, Number(req.query.class_id), intOr(req.query.day, -1), intOr(req.query.period, -1)]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "slot-del"); }
});
router.post("/edu/ws/:id/timetable/clear", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    const cid = Number(req.body?.class_id);
    const day = req.body?.day !== undefined ? intOr(req.body.day, -1) : null;
    const r = await query(`DELETE FROM edu_slots WHERE ws_id=$1 AND class_id=$2 AND ($3::smallint IS NULL OR day=$3)`, [g.a.ws.id, cid, day]);
    return res.json({ ok: true, removed: r.rowCount });
  } catch (err) { return fail(res, err, "clear"); }
});
// نسخ يوم إلى يوم آخر — كل حصة تمر بفحص التضارب، والمتضارب يُتخطّى ويُبلَّغ عنه
router.post("/edu/ws/:id/timetable/copy-day", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    const cid = Number(req.body?.class_id), from = intOr(req.body?.from, -1), to = intOr(req.body?.to, -1);
    const st = settingsOf(g.a.ws);
    if (!st.days.includes(from) || !st.days.includes(to) || from === to) return res.status(400).json({ error: "اختر يومين مختلفين من أيام الدراسة" });
    const src = (await query(`SELECT * FROM edu_slots WHERE ws_id=$1 AND class_id=$2 AND day=$3`, [g.a.ws.id, cid, from])).rows;
    await query(`DELETE FROM edu_slots WHERE ws_id=$1 AND class_id=$2 AND day=$3`, [g.a.ws.id, cid, to]);
    const skipped: string[] = []; let copied = 0;
    for (const s of src) {
      const slot = { class_id: cid, day: to, period: s.period, teacher_id: s.teacher_id, room: s.room };
      const c = await conflictOf(g.a.ws.id, slot);
      if (c) { skipped.push(`الحصة ${s.period}: ${c}`); continue; }
      await query(`INSERT INTO edu_slots (ws_id, class_id, day, period, subject_id, teacher_id, room) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [g.a.ws.id, cid, to, s.period, s.subject_id, s.teacher_id, s.room]).then(() => copied++).catch(() => skipped.push(`الحصة ${s.period}: تضارب`));
    }
    return res.json({ ok: true, copied, skipped });
  } catch (err) { return fail(res, err, "copy-day"); }
});
// التعبئة التلقائية: توزيع الحصص المطلوبة أسبوعياً لكل مادة دون تضارب (خوارزمية جشعة متوازنة)
router.post("/edu/ws/:id/timetable/autofill", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "timetable"); if (!g) return;
    const cid = Number(req.body?.class_id);
    const st = settingsOf(g.a.ws);
    const cls = (await query(`SELECT * FROM edu_classes WHERE id=$1 AND ws_id=$2`, [cid, g.a.ws.id])).rows[0];
    if (!cls) return res.status(404).json({ error: "الفصل غير موجود" });
    const plan = (await query(`SELECT p.*, sb.name FROM edu_class_plan p JOIN edu_subjects sb ON sb.id=p.subject_id WHERE p.class_id=$1 AND p.weekly>0 ORDER BY p.weekly DESC`, [cid])).rows;
    if (!plan.length) return res.status(400).json({ error: "حدّد خطة الحصص الأسبوعية للفصل أولاً (المادة، المعلم، عدد الحصص)" });
    const existing = (await query(`SELECT * FROM edu_slots WHERE class_id=$1`, [cid])).rows;
    const taken = new Set(existing.map((s: any) => `${s.day}:${s.period}`));
    const placedBy: Record<number, number> = {};
    const perDay: Record<string, number> = {};
    for (const s of existing) { placedBy[s.subject_id] = (placedBy[s.subject_id] || 0) + 1; perDay[`${s.subject_id}:${s.day}`] = (perDay[`${s.subject_id}:${s.day}`] || 0) + 1; }
    const busyT = new Set((await query(`SELECT teacher_id, day, period FROM edu_slots WHERE ws_id=$1 AND class_id<>$2 AND teacher_id IS NOT NULL`, [g.a.ws.id, cid])).rows.map((r: any) => `${r.teacher_id}:${r.day}:${r.period}`));
    const loads: Record<number, { n: number; max: number }> = {};
    for (const r of (await query(`SELECT t.id, t.max_weekly, COUNT(s.id)::int AS n FROM edu_staff t LEFT JOIN edu_slots s ON s.teacher_id=t.id WHERE t.ws_id=$1 GROUP BY t.id`, [g.a.ws.id])).rows) loads[r.id] = { n: r.n, max: r.max_weekly };
    let placed = 0; const missing: string[] = [];
    for (const p of plan) {
      let need = p.weekly - (placedBy[p.subject_id] || 0);
      // تُوزَّع على الأيام بالتناوب (لا تتكرر المادة في اليوم ما أمكن) وتبدأ بالحصص الأولى للمواد الأثقل
      for (let pass = 0; pass < 3 && need > 0; pass++) {
        for (const day of st.days) {
          if (need <= 0) break;
          if ((perDay[`${p.subject_id}:${day}`] || 0) > pass) continue;
          for (let period = 1; period <= st.periods && need > 0; period++) {
            if (taken.has(`${day}:${period}`)) continue;
            if (p.teacher_id) {
              if (busyT.has(`${p.teacher_id}:${day}:${period}`)) continue;
              const l = loads[p.teacher_id]; if (l && l.n >= l.max) break;
            }
            if (cls.room && (await query(`SELECT 1 FROM edu_slots WHERE ws_id=$1 AND room=$2 AND day=$3 AND period=$4`, [g.a.ws.id, cls.room, day, period])).rows.length) continue;
            const ok = await query(`INSERT INTO edu_slots (ws_id, class_id, day, period, subject_id, teacher_id, room) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
              [g.a.ws.id, cid, day, period, p.subject_id, p.teacher_id, cls.room]).then((r) => r.rows.length > 0).catch(() => false);
            if (!ok) continue;
            taken.add(`${day}:${period}`); if (p.teacher_id) { busyT.add(`${p.teacher_id}:${day}:${period}`); if (loads[p.teacher_id]) loads[p.teacher_id].n++; }
            perDay[`${p.subject_id}:${day}`] = (perDay[`${p.subject_id}:${day}`] || 0) + 1;
            need--; placed++;
            break; // حصة واحدة لهذه المادة في هذا اليوم في هذه الجولة
          }
        }
      }
      if (need > 0) missing.push(`${p.name}: تبقّت ${need} حصة (المعلم مشغول أو اكتمل نصابه)`);
    }
    return res.json({ ok: true, placed, missing });
  } catch (err) { return fail(res, err, "autofill"); }
});

// ─── الطلاب ──────────────────────────────────────────────────
router.get("/edu/ws/:id/students", async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, null, { activeOnly: false }); if (!g) return;
    const params: unknown[] = [g.a.ws.id]; let where = "s.ws_id=$1 AND s.status='active'";
    if (Number(req.query.class_id)) { params.push(Number(req.query.class_id)); where += ` AND s.class_id=$${params.length}`; }
    const q = clean(req.query.q, 60);
    if (q) { params.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`); where += ` AND (s.name ILIKE $${params.length} OR s.student_no ILIKE $${params.length} OR s.guardian_phone ILIKE $${params.length})`; }
    const { rows } = await query(`SELECT s.*, c.name AS class_name FROM edu_students s LEFT JOIN edu_classes c ON c.id=s.class_id WHERE ${where} ORDER BY c.name NULLS LAST, s.name LIMIT 1000`, params);
    return res.json({ students: rows });
  } catch (err) { return fail(res, err, "students"); }
});
// إضافة فردية أو جماعية: «الاسم، هاتف ولي الأمر، رقم الطالب» في كل سطر
router.post("/edu/ws/:id/students", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "students"); if (!g) return;
    const b = req.body || {};
    const classId = Number(b.class_id) || null;
    if (classId && !(await query(`SELECT 1 FROM edu_classes WHERE id=$1 AND ws_id=$2`, [classId, g.a.ws.id])).rows.length) return res.status(400).json({ error: "الفصل غير موجود" });
    const items: any[] = typeof b.lines === "string"
      ? b.lines.split("\n").map((l: string) => l.split(/[,،\t|]/).map((x) => x.trim())).filter((p: string[]) => p[0]).map((p: string[]) => ({ name: p[0], guardian_phone: p[1], student_no: p[2] }))
      : Array.isArray(b.items) ? b.items : [b];
    if (!(await ownedIds("edu_classes", items.map((it: any) => Number(it?.class_id) || null), g.a.ws.id))) return res.status(400).json({ error: "فصل لا يتبع هذه المؤسسة" });
    const year = new Date().getFullYear();
    let added = 0; const skipped: string[] = [];
    for (const it of items.slice(0, 500)) {
      const name = clean(it.name, 140);
      if (name.split(/\s+/).length < 2) { if (name) skipped.push(`${name}: اكتب الاسم ثنائياً على الأقل`); continue; }
      let sno = clean(it.student_no, 40);
      if (!sno) sno = `${g.a.ws.id}-${year}-${String((await query(`SELECT COUNT(*)::int + 1 AS n FROM edu_students WHERE ws_id=$1`, [g.a.ws.id])).rows[0].n).padStart(4, "0")}`;
      else if ((await query(`SELECT 1 FROM edu_students WHERE ws_id=$1 AND student_no=$2 AND status='active'`, [g.a.ws.id, sno])).rows.length) { skipped.push(`${name}: رقم الطالب ${sno} مستخدم`); continue; }
      const gp = clean(it.guardian_phone, 40) || null;
      const uid = it.phone ? await linkUserByPhone(clean(it.phone, 40)) : null;
      await query(`INSERT INTO edu_students (ws_id, user_id, name, student_no, class_id, program, guardian_name, guardian_phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [g.a.ws.id, uid, name, sno, Number(it.class_id) || classId, clean(it.program, 120) || null, clean(it.guardian_name, 120) || null, gp]);
      added++;
    }
    return res.status(201).json({ ok: true, added, skipped });
  } catch (err) { return fail(res, err, "students-add"); }
});
router.patch("/edu/ws/:id/students/:sid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "students"); if (!g) return;
    const cur = (await query(`SELECT * FROM edu_students WHERE id=$1 AND ws_id=$2`, [Number(req.params.sid), g.a.ws.id])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    const b = req.body || {};
    if (b.class_id !== undefined && !(await ownedIds("edu_classes", [Number(b.class_id) || null], g.a.ws.id))) return res.status(400).json({ error: "الفصل لا يتبع هذه المؤسسة" });
    const { rows } = await query(`UPDATE edu_students SET name=$1, class_id=$2, program=$3, guardian_name=$4, guardian_phone=$5, student_no=$6, user_id=$7, status=$8 WHERE id=$9 RETURNING *`,
      [clean(b.name, 140) || cur.name, b.class_id !== undefined ? Number(b.class_id) || null : cur.class_id, b.program !== undefined ? clean(b.program, 120) || null : cur.program,
       b.guardian_name !== undefined ? clean(b.guardian_name, 120) || null : cur.guardian_name, b.guardian_phone !== undefined ? clean(b.guardian_phone, 40) || null : cur.guardian_phone,
       b.student_no !== undefined ? clean(b.student_no, 40) || cur.student_no : cur.student_no, b.phone !== undefined ? await linkUserByPhone(clean(b.phone, 40)) : cur.user_id,
       ["active", "graduated", "withdrawn"].includes(b.status) ? b.status : cur.status, cur.id]);
    return res.json({ student: rows[0] });
  } catch (err) { return fail(res, err, "student-patch"); }
});

// ─── الإعلانات ───────────────────────────────────────────────
router.get("/edu/ws/:id/announcements", async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const wsId = Number(req.params.id);
    if (!Number.isInteger(wsId)) return res.status(404).json({ error: "غير موجود" });
    const { rows } = await query(`SELECT * FROM edu_announcements WHERE ws_id=$1 ORDER BY pinned DESC, created_at DESC LIMIT 100`, [wsId]);
    const u = await sessionUser(req);
    const a = u ? await access(u, wsId) : null;
    if (a?.isAdmin) return res.json({ announcements: rows });
    if (a?.staff) return res.json({ announcements: rows.filter((r: any) => r.audience !== "parents") });
    // الطالب/ولي الأمر: فصوله في هذه المؤسسة تحديداً
    let mine: { classes: Set<number>; self: boolean; guardian: boolean } = { classes: new Set(), self: false, guardian: false };
    if (u) {
      const key = last9(u.phone);
      const st = (await query(`SELECT class_id, user_id FROM edu_students WHERE ws_id=$1 AND status='active' AND (user_id=$2 OR ($3::text IS NOT NULL AND RIGHT(regexp_replace(COALESCE(guardian_phone,''),'\\D','','g'),9)=$3))`,
        [wsId, u.id, key])).rows;
      mine = { classes: new Set(st.map((x: any) => x.class_id).filter(Boolean)), self: st.some((x: any) => x.user_id === u.id), guardian: st.some((x: any) => x.user_id !== u.id) };
    }
    const visible = rows.filter((r: any) => {
      if (r.class_id && !mine.classes.has(r.class_id)) return false;
      if (r.audience === "all") return true;
      if (r.audience === "students") return mine.self || mine.guardian;
      if (r.audience === "parents") return mine.guardian;
      return false;
    });
    return res.json({ announcements: visible });
  } catch (err) { return fail(res, err, "ann"); }
});
router.post("/edu/ws/:id/announcements", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "announcements"); if (!g) return;
    const b = req.body || {};
    const title = clean(b.title, 200), body = clean(b.body, 5000);
    if (title.length < 3 || body.length < 5) return res.status(400).json({ error: "اكتب العنوان والنص" });
    const audience = ["all", "students", "parents", "teachers"].includes(b.audience) ? b.audience : "all";
    const classId = Number(b.class_id) || null;
    if (!(await ownedIds("edu_classes", [classId], g.a.ws.id))) return res.status(400).json({ error: "الفصل لا يتبع هذه المؤسسة" });
    const { rows } = await query(`INSERT INTO edu_announcements (ws_id, audience, class_id, title, body, pinned, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [g.a.ws.id, audience, classId, title, body, !!b.pinned, g.u.id]);
    // إشعار المعنيين المرتبطين بحسابات
    const ids: number[] = [];
    if (audience === "teachers" || audience === "all") ids.push(...(await query(`SELECT user_id FROM edu_staff WHERE ws_id=$1 AND active AND user_id IS NOT NULL`, [g.a.ws.id])).rows.map((r: any) => r.user_id));
    if (audience !== "teachers") {
      const st = (await query(`SELECT s.user_id, s.guardian_phone FROM edu_students s WHERE s.ws_id=$1 AND s.status='active' AND ($2::int IS NULL OR s.class_id=$2)`, [g.a.ws.id, classId])).rows;
      if (audience !== "parents") ids.push(...st.map((r: any) => r.user_id).filter(Boolean));
      if (audience !== "students") {
        const keys = st.map((r: any) => last9(r.guardian_phone)).filter(Boolean);
        if (keys.length) ids.push(...(await query(`SELECT id FROM users WHERE RIGHT(regexp_replace(COALESCE(phone,''),'\\D','','g'),9) = ANY($1::text[])`, [keys])).rows.map((r: any) => r.id));
      }
    }
    void notify(ids, `📢 ${g.a.ws.name}`, title, { screen: "edu-institution", id: g.a.ws.id });
    return res.status(201).json({ announcement: rows[0], notified: new Set(ids).size });
  } catch (err) { return fail(res, err, "ann-add"); }
});
router.delete("/edu/ws/:id/announcements/:aid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "announcements"); if (!g) return;
    await query(`DELETE FROM edu_announcements WHERE id=$1 AND ws_id=$2`, [Number(req.params.aid), g.a.ws.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "ann-del"); }
});

// ─── الدرجات والحضور (المعلم لفصوله، أو من لديه صلاحية grades) ─────
async function canTeachClass(a: Access, classId: number, subjectId?: number): Promise<boolean> {
  if (!Number.isInteger(classId) || !(await ownedIds("edu_classes", [classId], a.ws.id))) return false;
  if (subjectId !== undefined && (!Number.isInteger(subjectId) || !(await ownedIds("edu_subjects", [subjectId], a.ws.id)))) return false;
  if (a.perms.includes("grades")) return true;
  if (!a.staff) return false;
  const r = await query(`SELECT 1 FROM edu_slots WHERE class_id=$1 AND teacher_id=$2 ${subjectId ? "AND subject_id=$3" : ""} LIMIT 1`, subjectId ? [classId, a.staff.id, subjectId] : [classId, a.staff.id]);
  const p = await query(`SELECT 1 FROM edu_class_plan WHERE class_id=$1 AND teacher_id=$2 ${subjectId ? "AND subject_id=$3" : ""} LIMIT 1`, subjectId ? [classId, a.staff.id, subjectId] : [classId, a.staff.id]);
  return r.rows.length > 0 || p.rows.length > 0;
}
router.get("/edu/ws/:id/grades", async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, null); if (!g) return;
    const cid = Number(req.query.class_id), sid = Number(req.query.subject_id);
    const term = clean(req.query.term, 40) || settingsOf(g.a.ws).current_term;
    if (!(await canTeachClass(g.a, cid, sid))) return res.status(403).json({ error: "لست معلّم هذه المادة لهذا الفصل" });
    const { rows } = await query(`SELECT s.id AS student_id, s.name, s.student_no, gr.score, gr.max_score, gr.note FROM edu_students s
      LEFT JOIN edu_grades gr ON gr.student_id=s.id AND gr.subject_id=$2 AND gr.term=$3 WHERE s.class_id=$1 AND s.ws_id=$4 AND s.status='active' ORDER BY s.name`, [cid, sid, term, g.a.ws.id]);
    return res.json({ term, rows });
  } catch (err) { return fail(res, err, "grades"); }
});
router.put("/edu/ws/:id/grades", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, null); if (!g) return;
    const b = req.body || {};
    const cid = Number(b.class_id), sid = Number(b.subject_id);
    const st = settingsOf(g.a.ws);
    const term = clean(b.term, 40) || st.current_term;
    if (!(await canTeachClass(g.a, cid, sid))) return res.status(403).json({ error: "لست معلّم هذه المادة لهذا الفصل" });
    const max = Math.max(1, Number(b.max_score) || st.max_score);
    let saved = 0;
    for (const r of (Array.isArray(b.rows) ? b.rows : []).slice(0, 300)) {
      const score = r.score === null || r.score === "" ? null : Number(r.score);
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > max)) return res.status(400).json({ error: `الدرجة يجب أن تكون بين 0 و${max}` });
      const ok = (await query(`SELECT 1 FROM edu_students WHERE id=$1 AND class_id=$2 AND ws_id=$3`, [Number(r.student_id), cid, g.a.ws.id])).rows.length;
      if (!ok) continue;
      await query(`INSERT INTO edu_grades (ws_id, student_id, subject_id, term, score, max_score, note, entered_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (student_id, subject_id, term) DO UPDATE SET score=$5, max_score=$6, note=$7, entered_by=$8, updated_at=NOW()`,
        [g.a.ws.id, Number(r.student_id), sid, term, score, max, clean(r.note, 200) || null, g.u.id]);
      saved++;
    }
    return res.json({ ok: true, saved });
  } catch (err) { return fail(res, err, "grades-put"); }
});
router.put("/edu/ws/:id/attendance", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, null); if (!g) return;
    const b = req.body || {};
    const cid = Number(b.class_id);
    if (!(await canTeachClass(g.a, cid))) return res.status(403).json({ error: "غير مسموح" });
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? String(b.date) : new Date().toISOString().slice(0, 10);
    let n = 0;
    for (const r of (Array.isArray(b.records) ? b.records : []).slice(0, 300)) {
      const status = ["present", "absent", "late", "excused"].includes(r.status) ? r.status : "present";
      const ok = (await query(`SELECT 1 FROM edu_students WHERE id=$1 AND class_id=$2 AND ws_id=$3`, [Number(r.student_id), cid, g.a.ws.id])).rows.length;
      if (!ok) continue;
      await query(`INSERT INTO edu_attendance (ws_id, student_id, day, status) VALUES ($1,$2,$3,$4) ON CONFLICT (student_id, day) DO UPDATE SET status=$4`, [g.a.ws.id, Number(r.student_id), day, status]);
      n++;
    }
    return res.json({ ok: true, saved: n });
  } catch (err) { return fail(res, err, "attendance"); }
});

// ─── بوابة الطالب/ولي الأمر ──────────────────────────────────
async function myStudent(u: SessionUser, sid: number) {
  const key = last9(u.phone);
  return (await query(`SELECT s.*, w.name AS ws_name, w.settings, c.name AS class_name FROM edu_students s JOIN edu_ws w ON w.id=s.ws_id LEFT JOIN edu_classes c ON c.id=s.class_id
    WHERE s.id=$1 AND (s.user_id=$2 OR ($3::text IS NOT NULL AND RIGHT(regexp_replace(COALESCE(s.guardian_phone,''),'\\D','','g'),9)=$3))`, [sid, u.id, key])).rows[0] || null;
}
router.get("/edu/portal/:sid", async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول" });
    const s = await myStudent(u, Number(req.params.sid));
    if (!s) return res.status(404).json({ error: "غير موجود" });
    const [slots, ann, grades, att, reqs, trs] = await Promise.all([
      s.class_id ? query(`${SLOT_SELECT} WHERE s.class_id=$1 ORDER BY s.day, s.period`, [s.class_id]) : Promise.resolve({ rows: [] as any[] }),
      query(`SELECT * FROM edu_announcements WHERE ws_id=$1 AND audience IN ('all','students','parents') AND (class_id IS NULL OR class_id=$2) ORDER BY pinned DESC, created_at DESC LIMIT 30`, [s.ws_id, s.class_id]),
      query(`SELECT g.term, g.score, g.max_score, g.note, sb.name AS subject FROM edu_grades g JOIN edu_subjects sb ON sb.id=g.subject_id WHERE g.student_id=$1 ORDER BY g.term, sb.name`, [s.id]),
      query(`SELECT status, COUNT(*)::int AS n FROM edu_attendance WHERE student_id=$1 GROUP BY status`, [s.id]),
      query(`SELECT * FROM edu_requests WHERE student_id=$1 ORDER BY created_at DESC LIMIT 30`, [s.id]),
      query(`SELECT t.*, fw.name AS from_name, tw.name AS to_name FROM edu_transfers t JOIN edu_ws fw ON fw.id=t.from_ws JOIN edu_ws tw ON tw.id=t.to_ws WHERE t.student_id=$1 ORDER BY t.created_at DESC`, [s.id]),
    ]);
    return res.json({
      student: { id: s.id, name: s.name, student_no: s.student_no, ws_id: s.ws_id, ws_name: s.ws_name, class_id: s.class_id, class_name: s.class_name, program: s.program, status: s.status },
      settings: settingsOf({ settings: s.settings }), slots: slots.rows, announcements: ann.rows, grades: grades.rows,
      attendance: Object.fromEntries(att.rows.map((r: any) => [r.status, r.n])), requests: reqs.rows.map((r: any) => ({ ...r, kind_label: REQ_KINDS[r.kind] || r.kind })),
      transfers: trs.rows.map((r: any) => ({ ...r, status_label: TR_STATUS[r.status] || r.status })),
    });
  } catch (err) { return fail(res, err, "portal"); }
});
const REQ_KINDS: Record<string, string> = { enrollment_cert: "شهادة قيد", transcript: "كشف درجات", good_conduct: "شهادة حسن سير وسلوك", leave: "إذن غياب", other: "طلب آخر" };
router.post("/edu/portal/:sid/requests", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول" });
    const s = await myStudent(u, Number(req.params.sid));
    if (!s) return res.status(404).json({ error: "غير موجود" });
    const kind = REQ_KINDS[req.body?.kind] ? req.body.kind : "other";
    const open = (await query(`SELECT COUNT(*)::int AS n FROM edu_requests WHERE student_id=$1 AND status='pending'`, [s.id])).rows[0].n;
    if (open >= 5) return res.status(429).json({ error: "لديك طلبات مفتوحة كثيرة" });
    const { rows } = await query(`INSERT INTO edu_requests (ws_id, student_id, user_id, kind, note) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [s.ws_id, s.id, u.id, kind, clean(req.body?.note, 400) || null]);
    void notify(await wsAdminIds(s.ws_id, "requests"), `📄 طلب ${REQ_KINDS[kind]}`, `${s.name} — ${s.class_name || ""}`, { screen: "edu-admin", id: s.ws_id, tab: "requests" });
    return res.status(201).json({ request: rows[0], message: "أُرسل طلبك للمؤسسة" });
  } catch (err) { return fail(res, err, "portal-req"); }
});
router.get("/edu/ws/:id/requests", async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "requests"); if (!g) return;
    const { rows } = await query(`SELECT r.*, s.name AS student_name, s.student_no, c.name AS class_name FROM edu_requests r LEFT JOIN edu_students s ON s.id=r.student_id LEFT JOIN edu_classes c ON c.id=s.class_id
      WHERE r.ws_id=$1 ORDER BY (r.status='pending') DESC, r.created_at DESC LIMIT 200`, [g.a.ws.id]);
    return res.json({ requests: rows.map((r: any) => ({ ...r, kind_label: REQ_KINDS[r.kind] || r.kind })) });
  } catch (err) { return fail(res, err, "requests"); }
});
router.patch("/edu/ws/:id/requests/:rid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await need(req, res, "requests"); if (!g) return;
    const st = ["approved", "rejected", "ready"].includes(req.body?.status) ? req.body.status : null;
    if (!st) return res.status(400).json({ error: "حالة غير صالحة" });
    const { rows } = await query(`UPDATE edu_requests SET status=$1, response=$2, updated_at=NOW() WHERE id=$3 AND ws_id=$4 RETURNING *`,
      [st, clean(req.body?.response, 400) || null, Number(req.params.rid), g.a.ws.id]);
    if (!rows[0]) return res.status(404).json({ error: "غير موجود" });
    void notify([rows[0].user_id], st === "rejected" ? "بخصوص طلبك" : st === "ready" ? "✅ طلبك جاهز للاستلام" : "✅ قُبل طلبك", `${REQ_KINDS[rows[0].kind] || ""} — ${rows[0].response || g.a.ws.name}`, { screen: "edu-institution" });
    return res.json({ request: rows[0] });
  } catch (err) { return fail(res, err, "req-patch"); }
});

// ─── نقل الطالب بين المؤسسات المنضمة ──────────────────────────
const TR_STATUS: Record<string, string> = { requested: "بانتظار إخلاء طرف المدرسة الحالية", released: "بانتظار قبول المدرسة الجديدة", completed: "اكتمل النقل", rejected: "مرفوض", cancelled: "ملغى" };
function hist(t: any, step: string, by: number | null, note?: string | null) {
  return JSON.stringify([...(t?.history || []), { step, at: new Date().toISOString(), by, note: note || null }]);
}
async function trRow(id: number) {
  const r = (await query(`SELECT t.*, s.name AS student_name, s.student_no, fw.name AS from_name, tw.name AS to_name FROM edu_transfers t JOIN edu_students s ON s.id=t.student_id
    JOIN edu_ws fw ON fw.id=t.from_ws JOIN edu_ws tw ON tw.id=t.to_ws WHERE t.id=$1`, [id])).rows[0];
  return r ? { ...r, status_label: TR_STATUS[r.status] || r.status } : null;
}
router.post("/edu/transfers", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول" });
    const sid = Number(req.body?.student_id), toWs = Number(req.body?.to_ws);
    let s = await myStudent(u, sid);
    if (!s) { // أو إدارة المدرسة الحالية تبدأ النقل
      const raw = (await query(`SELECT * FROM edu_students WHERE id=$1`, [sid])).rows[0];
      const a = raw ? await access(u, raw.ws_id) : null;
      if (raw && a?.perms.includes("transfers")) s = raw;
    }
    if (!s || s.status !== "active") return res.status(404).json({ error: "الطالب غير موجود" });
    if (toWs === s.ws_id) return res.status(400).json({ error: "اختر مدرسة مختلفة" });
    const to = (await query(`SELECT * FROM edu_ws WHERE id=$1 AND status='active'`, [toWs])).rows[0];
    if (!to) return res.status(404).json({ error: "المدرسة الجديدة غير منضمة للتطبيق" });
    if ((await query(`SELECT 1 FROM edu_transfers WHERE student_id=$1 AND status IN ('requested','released')`, [s.id])).rows.length) return res.status(409).json({ error: "يوجد طلب نقل قائم لهذا الطالب" });
    const n = (await query(`SELECT nextval('edu_transfer_seq') AS n`)).rows[0].n;
    const no = `HSW-TRF-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
    const { rows } = await query(`INSERT INTO edu_transfers (transfer_no, student_id, from_ws, to_ws, requested_by, reason, history) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [no, s.id, s.ws_id, toWs, u.id, clean(req.body?.reason, 400) || null, hist(null, "requested", u.id, clean(req.body?.reason, 400))]);
    void notify(await wsAdminIds(s.ws_id, "transfers"), "🔁 طلب نقل طالب", `${s.name} إلى ${to.name} — ${no}`, { screen: "edu-transfer", ws: s.ws_id });
    return res.status(201).json({ transfer: await trRow(rows[0].id), message: `أُرسل طلب النقل برقم ${no}` });
  } catch (err) { return fail(res, err, "tr-create"); }
});
router.get("/edu/transfers", async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول" });
    const ws = Number(req.query.ws) || null;
    if (ws) {
      const a = await access(u, ws);
      if (!a?.perms.includes("transfers")) return res.status(403).json({ error: "غير مسموح" });
      const { rows } = await query(`SELECT id FROM edu_transfers WHERE from_ws=$1 OR to_ws=$1 ORDER BY (status IN ('requested','released')) DESC, updated_at DESC LIMIT 200`, [ws]);
      const list = await Promise.all(rows.map((r: any) => trRow(r.id)));
      return res.json({ transfers: list.map((t: any) => ({ ...t, direction: t.from_ws === ws ? "outgoing" : "incoming" })) });
    }
    const { rows } = await query(`SELECT id FROM edu_transfers WHERE requested_by=$1 ORDER BY created_at DESC LIMIT 50`, [u.id]);
    return res.json({ transfers: await Promise.all(rows.map((r: any) => trRow(r.id))) });
  } catch (err) { return fail(res, err, "tr-list"); }
});
// إخلاء طرف المدرسة الحالية
router.post("/edu/transfers/:tid/release", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    const t = (await query(`SELECT * FROM edu_transfers WHERE id=$1`, [Number(req.params.tid)])).rows[0];
    if (!u || !t) return res.status(404).json({ error: "غير موجود" });
    const a = await access(u, t.from_ws);
    if (!a?.perms.includes("transfers")) return res.status(403).json({ error: "لإدارة المدرسة الحالية فقط" });
    if (t.status !== "requested") return res.status(409).json({ error: "الطلب ليس بانتظار إخلاء الطرف" });
    const approve = req.body?.approve !== false;
    const note = clean(req.body?.note, 300) || null;
    if (!approve && !note) return res.status(400).json({ error: "اكتب سبب الرفض" });
    await query(`UPDATE edu_transfers SET status=$1, from_note=$2, history=$3, updated_at=NOW() WHERE id=$4`, [approve ? "released" : "rejected", note, hist(t, approve ? "released" : "rejected_by_source", u.id, note), t.id]);
    const tr = await trRow(t.id);
    void notify([t.requested_by], approve ? "✅ أُخلي طرف الطالب" : "بخصوص طلب النقل", approve ? `${tr.student_name}: بانتظار قبول ${tr.to_name}` : `${tr.transfer_no}: ${note}`, { screen: "edu-transfer" });
    if (approve) void notify(await wsAdminIds(t.to_ws, "transfers"), "🔁 طالب منقول إليكم", `${tr.student_name} من ${tr.from_name} — ${tr.transfer_no}`, { screen: "edu-transfer", ws: t.to_ws });
    return res.json({ transfer: tr });
  } catch (err) { return fail(res, err, "tr-release"); }
});
// قبول المدرسة الجديدة وإسناد الفصل — ينتقل سجل الطالب ويبقى تاريخه
router.post("/edu/transfers/:tid/accept", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    const t = (await query(`SELECT * FROM edu_transfers WHERE id=$1`, [Number(req.params.tid)])).rows[0];
    if (!u || !t) return res.status(404).json({ error: "غير موجود" });
    const a = await access(u, t.to_ws);
    if (!a?.perms.includes("transfers")) return res.status(403).json({ error: "لإدارة المدرسة الجديدة فقط" });
    if (t.status !== "released") return res.status(409).json({ error: "الطلب لم يُخلَ طرفه بعد" });
    const approve = req.body?.approve !== false;
    const note = clean(req.body?.note, 300) || null;
    if (!approve) {
      if (!note) return res.status(400).json({ error: "اكتب سبب الرفض" });
      await query(`UPDATE edu_transfers SET status='rejected', to_note=$1, history=$2, updated_at=NOW() WHERE id=$3`, [note, hist(t, "rejected_by_destination", u.id, note), t.id]);
      void notify([t.requested_by], "بخصوص طلب النقل", `${t.transfer_no}: ${note}`, { screen: "edu-transfer" });
      return res.json({ transfer: await trRow(t.id) });
    }
    const classId = Number(req.body?.class_id) || null;
    if (classId && !(await query(`SELECT 1 FROM edu_classes WHERE id=$1 AND ws_id=$2`, [classId, t.to_ws])).rows.length) return res.status(400).json({ error: "الفصل غير موجود" });
    const s = (await query(`SELECT * FROM edu_students WHERE id=$1`, [t.student_id])).rows[0];
    const ns = await query(`INSERT INTO edu_students (ws_id, user_id, name, student_no, class_id, program, guardian_name, guardian_phone, transferred_from)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [t.to_ws, s.user_id, s.name, `${t.to_ws}-${new Date().getFullYear()}-T${t.id}`, classId, s.program, s.guardian_name, s.guardian_phone, s.ws_id]);
    await query(`UPDATE edu_students SET status='transferred' WHERE id=$1`, [s.id]);
    await query(`UPDATE edu_transfers SET status='completed', to_note=$1, to_class_id=$2, new_student_id=$3, history=$4, updated_at=NOW() WHERE id=$5`,
      [note, classId, ns.rows[0].id, hist(t, "completed", u.id, note), t.id]);
    const tr = await trRow(t.id);
    void notify([t.requested_by, s.user_id], "🎉 اكتمل نقل الطالب", `${s.name} أصبح في ${tr.to_name}`, { screen: "edu-institution", id: t.to_ws });
    void notify(await wsAdminIds(t.from_ws, "transfers"), "اكتمل النقل", `${s.name} — ${tr.transfer_no}`, { screen: "edu-transfer", ws: t.from_ws });
    return res.json({ transfer: tr });
  } catch (err) { return fail(res, err, "tr-accept"); }
});
router.post("/edu/transfers/:tid/cancel", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureEduInstDb();
    const u = await sessionUser(req);
    const t = (await query(`SELECT * FROM edu_transfers WHERE id=$1`, [Number(req.params.tid)])).rows[0];
    if (!u || !t || t.requested_by !== u.id) return res.status(404).json({ error: "غير موجود" });
    if (!["requested", "released"].includes(t.status)) return res.status(409).json({ error: "لا يمكن الإلغاء الآن" });
    await query(`UPDATE edu_transfers SET status='cancelled', history=$1, updated_at=NOW() WHERE id=$2`, [hist(t, "cancelled", u.id), t.id]);
    return res.json({ transfer: await trRow(t.id) });
  } catch (err) { return fail(res, err, "tr-cancel"); }
});

export default router;
