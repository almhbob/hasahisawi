// ════════════════════════════════════════════════════════════════
// 🤝 مهام التطوع للمنظمات واتحاد الطلاب — بصلاحيات محدودة ومنسّقة مع نظام التطوع العام
//  • الجهة تختار «حجم المهمة» فتُحصر نقاطها في نطاق ثابت (لا تحدد نقاطاً حرة كإدارة التطبيق).
//  • المهام الكبرى (١٠٠+ نقطة) لا تُنشر إلا بعد اعتماد إدارة التطبيق.
//  • لكل جهة سقف شهري للنقاط الممنوحة (تحدده الإدارة)، ولا تمنح الجهة نقاطاً يدوية ولا تخصم.
//  • النقاط تُسجَّل في سجل التطوع العام نفسه فتظهر في مستوى المتطوع وبطاقته.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { ensureVolunteerDb, canManageSection } from "./volunteer";
import { umAuth } from "./hasahisawi";

const router = Router();

export const VOL_SIZES = {
  small: { label: "صغيرة", hint: "ساعة إلى ساعتين — مشاركة بسيطة", min: 5, max: 20, def: 10 },
  medium: { label: "متوسطة", hint: "نصف يوم — جهد منظم", min: 20, max: 50, def: 30 },
  large: { label: "كبيرة", hint: "يوم كامل أو أكثر — مسؤولية واضحة", min: 50, max: 100, def: 75 },
  major: { label: "كبرى", hint: "مشروع ممتد أو قيادة فريق — تعتمدها إدارة التطبيق", min: 100, max: 200, def: 150, approval: true },
} as const;
export type VolSize = keyof typeof VOL_SIZES;
const CATEGORIES = ["environment", "health", "education", "social", "events", "relief", "other"];
const DEFAULT_MONTHLY_CAP = 1500;

type Owner = { kind: "org" | "union"; id: number; name: string };
type Actor = { userId: number | null; name: string };

let ready: Promise<void> | null = null;
export function ensureEntityVolunteerDb(): Promise<void> {
  return (ready ??= (async () => {
    await ensureVolunteerDb();
    await query(`ALTER TABLE volunteer_tasks ADD COLUMN IF NOT EXISTS owner_kind VARCHAR(10) NOT NULL DEFAULT 'platform'`);
    await query(`ALTER TABLE volunteer_tasks ADD COLUMN IF NOT EXISTS owner_id INTEGER`);
    await query(`ALTER TABLE volunteer_tasks ADD COLUMN IF NOT EXISTS size VARCHAR(10)`);
    await query(`ALTER TABLE volunteer_tasks ADD COLUMN IF NOT EXISTS approval VARCHAR(10) NOT NULL DEFAULT 'approved'`);
    await query(`ALTER TABLE volunteer_tasks ADD COLUMN IF NOT EXISTS review_note VARCHAR(300)`);
    await query(`ALTER TABLE volunteer_tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
    await query(`ALTER TABLE volunteer_tasks ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(200)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_owner ON volunteer_tasks(owner_kind, owner_id, status)`);
    await query(`INSERT INTO admin_settings (key, value) VALUES ('volunteer_entity_monthly_points', $1) ON CONFLICT (key) DO NOTHING`, [String(DEFAULT_MONTHLY_CAP)]).catch(() => {});
  })().catch((e) => { ready = null; throw e; }));
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const fail = (res: Response, err: unknown, tag: string) => { logger.error({ err }, `[entity-volunteer] ${tag}`); return res.status(500).json({ error: "تعذّر التنفيذ" }); };
const intId = (v: unknown) => (/^\d+$/.test(String(v)) ? Number(v) : null);

async function monthlyCap(): Promise<number> {
  const r = await query(`SELECT value FROM admin_settings WHERE key='volunteer_entity_monthly_points'`).catch(() => ({ rows: [] as any[] }));
  const n = Number(r.rows[0]?.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_CAP;
}
async function awardedThisMonth(o: Owner): Promise<number> {
  const r = await query(`SELECT COALESCE(SUM(s.points_awarded),0)::int AS n FROM volunteer_signups s JOIN volunteer_tasks t ON t.id=s.task_id
    WHERE t.owner_kind=$1 AND t.owner_id=$2 AND s.status='completed' AND s.verified_at >= date_trunc('month', NOW())`, [o.kind, o.id]);
  return r.rows[0].n;
}
export async function budgetOf(o: Owner) {
  const [cap, used] = await Promise.all([monthlyCap(), awardedThisMonth(o)]);
  return { cap, used, left: Math.max(0, cap - used) };
}

/** إنشاء/تعديل مهمة جهة: النقاط محصورة في نطاق الحجم */
function cleanEntityTask(b: any) {
  const size: VolSize = (Object.keys(VOL_SIZES) as VolSize[]).includes(b?.size) ? b.size : "small";
  const S = VOL_SIZES[size];
  const p = Math.round(Number(b?.points));
  const points = Number.isFinite(p) ? Math.min(S.max, Math.max(S.min, p)) : S.def;
  const slots = b?.slots == null || b?.slots === "" ? null : Math.round(Number(b.slots));
  const d = (v: unknown) => { if (!v) return null; const x = new Date(String(v)); return isNaN(x.getTime()) ? null : x; };
  return {
    title: clip(b?.title, 160), description: clip(b?.description, 4000) || null,
    category: CATEGORIES.includes(b?.category) ? b.category : "social", location: clip(b?.location, 200) || null,
    starts_at: d(b?.starts_at), ends_at: d(b?.ends_at), points, size, slots: slots && slots > 0 && slots <= 500 ? slots : null,
    image_url: /^https:\/\//.test(String(b?.image_url || "")) ? String(b.image_url).slice(0, 600) : null,
  };
}

const TASK_SELECT = `SELECT t.*,
  (SELECT COUNT(*)::int FROM volunteer_signups s WHERE s.task_id=t.id AND s.status IN ('joined','completed')) AS joined_count,
  (SELECT COUNT(*)::int FROM volunteer_signups s WHERE s.task_id=t.id AND s.status='completed') AS completed_count,
  (SELECT COALESCE(SUM(points_awarded),0)::int FROM volunteer_signups s WHERE s.task_id=t.id AND s.status='completed') AS awarded
  FROM volunteer_tasks t`;
const taskOut = (t: any) => ({ ...t, size_label: t.size ? VOL_SIZES[t.size as VolSize]?.label : null });

async function listFor(o: Owner, scope: string) {
  const where = scope === "archive" ? `AND (t.archived_at IS NOT NULL OR t.status='done')` : `AND t.archived_at IS NULL AND t.status<>'done'`;
  const r = await query(`${TASK_SELECT} WHERE t.owner_kind=$1 AND t.owner_id=$2 ${where} ORDER BY COALESCE(t.starts_at, t.created_at) DESC LIMIT 300`, [o.kind, o.id]);
  return r.rows.map(taskOut);
}
async function createFor(o: Owner, a: Actor, body: any) {
  const t = cleanEntityTask(body);
  if (t.title.length < 3) throw Object.assign(new Error("اكتب عنوان المهمة"), { status: 400 });
  const needs = !!(VOL_SIZES[t.size] as any).approval;
  const r = await query(`INSERT INTO volunteer_tasks (title, description, category, location, starts_at, ends_at, points, slots, image_url, organizer, created_by, created_by_name, owner_kind, owner_id, size, approval, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [t.title, t.description, t.category, t.location, t.starts_at, t.ends_at, t.points, t.slots, t.image_url, o.name, a.userId, a.name, o.kind, o.id, t.size, needs ? "pending" : "approved", needs ? "closed" : "open"]);
  if (needs) {
    const admins = (await query(`SELECT id FROM users WHERE role='admin'`)).rows;
    for (const ad of admins) await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'volunteer',$2,$3,$4)`,
      [ad.id, "🤝 مهمة تطوعية كبرى بانتظار اعتمادك", `${o.name}: ${t.title} (${t.points} نقطة)`, JSON.stringify({ screen: "volunteer-admin" })]).catch(() => {});
  }
  return taskOut(r.rows[0]);
}
async function ownTask(o: Owner, tid: number) {
  return (await query(`${TASK_SELECT} WHERE t.id=$1 AND t.owner_kind=$2 AND t.owner_id=$3`, [tid, o.kind, o.id])).rows[0] ?? null;
}
async function patchFor(o: Owner, tid: number, body: any) {
  const cur = await ownTask(o, tid);
  if (!cur) throw Object.assign(new Error("المهمة غير موجودة"), { status: 404 });
  if (body?.action === "archive") { await query(`UPDATE volunteer_tasks SET archived_at=NOW(), status=CASE WHEN status='open' THEN 'closed' ELSE status END WHERE id=$1`, [tid]); return taskOut(await ownTask(o, tid)); }
  if (body?.action === "restore") { await query(`UPDATE volunteer_tasks SET archived_at=NULL WHERE id=$1`, [tid]); return taskOut(await ownTask(o, tid)); }
  const t = cleanEntityTask({ ...cur, ...body, size: body?.size ?? cur.size });
  // تغيير الحجم إلى «كبرى» يعيد المهمة لاعتماد الإدارة
  const needs = !!(VOL_SIZES[t.size] as any).approval && (cur.size !== t.size || cur.approval !== "approved");
  let status = ["open", "closed", "done"].includes(body?.status) ? body.status : cur.status;
  if (status === "open" && (needs || cur.approval !== "approved")) status = "closed";
  await query(`UPDATE volunteer_tasks SET title=$1, description=$2, category=$3, location=$4, starts_at=$5, ends_at=$6, points=$7, slots=$8, image_url=$9, size=$10, status=$11,
      approval=CASE WHEN $12 THEN 'pending' ELSE approval END WHERE id=$13`,
    [t.title || cur.title, t.description, t.category, t.location, t.starts_at, t.ends_at, t.points, t.slots, t.image_url, t.size, status, needs, tid]);
  return taskOut(await ownTask(o, tid));
}
async function signupsFor(o: Owner, tid: number) {
  if (!(await ownTask(o, tid))) throw Object.assign(new Error("المهمة غير موجودة"), { status: 404 });
  return (await query(`SELECT s.*, u.name, u.phone, u.avatar_url FROM volunteer_signups s JOIN users u ON u.id=s.user_id
    WHERE s.task_id=$1 AND s.status<>'cancelled' ORDER BY s.created_at`, [tid])).rows;
}
/** اعتماد إنجاز متطوع: النقاط ≤ نقاط المهمة، وفي حدود السقف الشهري للجهة */
async function reviewFor(o: Owner, a: Actor, sid: number, body: any) {
  const s = (await query(`SELECT s.*, t.points AS task_points, t.title, t.owner_kind, t.owner_id FROM volunteer_signups s JOIN volunteer_tasks t ON t.id=s.task_id WHERE s.id=$1`, [sid])).rows[0];
  if (!s || s.owner_kind !== o.kind || s.owner_id !== o.id) throw Object.assign(new Error("التسجيل غير موجود"), { status: 404 });
  const action = String(body?.action);
  if (action === "reject") {
    if (s.status === "completed") throw Object.assign(new Error("لا يمكن سحب نقاط معتمدة — تواصل مع إدارة التطبيق"), { status: 409 });
    await query(`UPDATE volunteer_signups SET status='rejected', points_awarded=0, verified_at=NOW(), note=$1 WHERE id=$2`, [clip(body?.note, 300) || null, s.id]);
    return { ok: true };
  }
  if (action !== "complete") throw Object.assign(new Error("إجراء غير صالح"), { status: 400 });
  if (s.status === "completed") return { ok: true, already: true };
  const want = Number.isFinite(Number(body?.points)) ? Math.round(Number(body.points)) : s.task_points;
  const pts = Math.max(0, Math.min(s.task_points, want));
  const b = await budgetOf(o);
  if (pts > b.left) throw Object.assign(new Error(`تجاوز السقف الشهري للنقاط (${b.cap}) — المتبقي ${b.left} نقطة`), { status: 409 });
  const hours = Number.isFinite(Number(body?.hours)) ? Math.min(999, Math.max(0, Number(body.hours))) : null;
  await query(`UPDATE volunteer_signups SET status='completed', points_awarded=$1, hours=$2, verified_by=$3, verified_at=NOW() WHERE id=$4`, [pts, hours, a.userId, s.id]);
  if (pts > 0) await query(`INSERT INTO volunteer_points (user_id, points, reason, task_id, created_by) VALUES ($1,$2,$3,$4,$5)`,
    [s.user_id, pts, `إنجاز مهمة: ${s.title} — ${o.name}`.slice(0, 200), s.task_id, a.userId]);
  await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'volunteer',$2,$3,$4)`,
    [s.user_id, "🤝 نقاط تطوع جديدة", `اعتمدت ${o.name} إنجازك «${s.title}» — ${pts} نقطة. شكراً لعطائك!`, JSON.stringify({ screen: "volunteer" })]).catch(() => {});
  return { ok: true, points: pts };
}

const sendErr = (res: Response, e: any, tag: string) => (e?.status ? res.status(e.status).json({ error: e.message }) : fail(res, e, tag));

// ── السياقات: منظمة (مستخدم بدور owner/manager) واتحاد (رئاسة البوابة) ──
async function orgCtx(req: Request, res: Response, lead = true): Promise<{ o: Owner; a: Actor } | null> {
  await ensureEntityVolunteerDb();
  const u: SessionUser | null = await sessionUser(req);
  if (!u) { res.status(401).json({ error: "سجّل الدخول" }); return null; }
  const id = intId(req.params.id);
  const org = id ? (await query(`SELECT id, name, is_active FROM organizations WHERE id=$1`, [id])).rows[0] : null;
  if (!org) { res.status(404).json({ error: "المنظمة غير موجودة" }); return null; }
  let ok = u.role === "admin";
  if (!ok) {
    const m = (await query(`SELECT role FROM org_managers WHERE org_id=$1 AND user_id=$2`, [id, u.id]).catch(() => ({ rows: [] as any[] }))).rows[0];
    ok = !!m && (!lead || m.role === "owner" || m.role === "manager");
  }
  if (!ok) { res.status(403).json({ error: lead ? "لإدارة المنظمة فقط" : "لفريق المنظمة فقط" }); return null; }
  return { o: { kind: "org", id: org.id, name: org.name }, a: { userId: u.id, name: u.name } };
}
async function unionCtx(req: Request, res: Response): Promise<{ o: Owner; a: Actor } | null> {
  await ensureEntityVolunteerDb();
  const m: any = await umAuth(req, res); if (!m) return null;
  if (m.staff_id && m.permissions?.can_manage_staff !== true) { res.status(403).json({ error: "مهام التطوع لرئاسة الاتحاد أو من يملك صلاحية إدارة الموظفين" }); return null; }
  return { o: { kind: "union", id: 1, name: "اتحاد الطلاب" }, a: { userId: null, name: m.full_name } };
}

// ── مسارات موحّدة للجهتين ──
for (const [base, ctx] of [["/org-workspace/:id/volunteer", orgCtx], ["/union-manager/volunteer", unionCtx]] as const) {
  router.get(`${base}/tasks`, async (req, res) => {
    const c = await ctx(req, res); if (!c) return;
    try { return res.json({ tasks: await listFor(c.o, String(req.query.scope || "")), budget: await budgetOf(c.o), sizes: VOL_SIZES, owner: c.o }); }
    catch (e) { return sendErr(res, e, "list"); }
  });
  router.post(`${base}/tasks`, writeLimiter, async (req, res) => {
    const c = await ctx(req, res); if (!c) return;
    try { const t = await createFor(c.o, c.a, req.body); return res.status(201).json({ task: t, message: t.approval === "pending" ? "أُرسلت المهمة الكبرى لاعتماد إدارة التطبيق" : "نُشرت المهمة للمتطوعين" }); }
    catch (e) { return sendErr(res, e, "create"); }
  });
  router.patch(`${base}/tasks/:tid`, writeLimiter, async (req, res) => {
    const c = await ctx(req, res); if (!c) return;
    const tid = intId(req.params.tid); if (!tid) return res.status(404).json({ error: "غير موجود" });
    try { return res.json({ task: await patchFor(c.o, tid, req.body) }); } catch (e) { return sendErr(res, e, "patch"); }
  });
  router.get(`${base}/tasks/:tid/signups`, async (req, res) => {
    const c = await ctx(req, res); if (!c) return;
    const tid = intId(req.params.tid); if (!tid) return res.status(404).json({ error: "غير موجود" });
    try { return res.json({ signups: await signupsFor(c.o, tid) }); } catch (e) { return sendErr(res, e, "signups"); }
  });
  router.post(`${base}/signups/:sid/review`, writeLimiter, async (req, res) => {
    const c = await ctx(req, res); if (!c) return;
    const sid = intId(req.params.sid); if (!sid) return res.status(404).json({ error: "غير موجود" });
    try { return res.json(await reviewFor(c.o, c.a, sid, req.body)); } catch (e) { return sendErr(res, e, "review"); }
  });
}

// ── إدارة التطبيق: اعتماد المهام الكبرى وسقف الجهات ──
router.get("/admin/volunteer/entity-tasks", async (req, res) => {
  try {
    await ensureEntityVolunteerDb();
    if (!(await canManageSection(await sessionUser(req), "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    const st = ["pending", "approved", "rejected"].includes(String(req.query.approval)) ? String(req.query.approval) : "pending";
    const r = await query(`${TASK_SELECT} WHERE t.owner_kind<>'platform' AND t.approval=$1 ORDER BY t.created_at DESC LIMIT 200`, [st]);
    return res.json({ tasks: r.rows.map(taskOut), cap: await monthlyCap() });
  } catch (e) { return fail(res, e, "admin-list"); }
});
router.post("/admin/volunteer/entity-tasks/:tid/review", writeLimiter, async (req, res) => {
  try {
    await ensureEntityVolunteerDb();
    if (!(await canManageSection(await sessionUser(req), "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    const tid = intId(req.params.tid); if (!tid) return res.status(404).json({ error: "غير موجود" });
    const approve = req.body?.approve !== false;
    const note = clip(req.body?.note, 300) || null;
    if (!approve && !note) return res.status(400).json({ error: "اكتب سبب الرفض" });
    const r = await query(`UPDATE volunteer_tasks SET approval=$1::text, review_note=$2, status=CASE WHEN $1::text='approved' THEN 'open' ELSE 'closed' END
      WHERE id=$3 AND owner_kind<>'platform' RETURNING *`, [approve ? "approved" : "rejected", note, tid]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجود" });
    const t = r.rows[0];
    if (t.created_by) await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'volunteer',$2,$3,$4)`,
      [t.created_by, approve ? "✅ اعتُمدت مهمتك التطوعية" : "بخصوص مهمتك التطوعية", approve ? `«${t.title}» منشورة الآن للمتطوعين` : `«${t.title}»: ${note}`, JSON.stringify({ screen: "volunteer" })]).catch(() => {});
    return res.json({ task: taskOut(t) });
  } catch (e) { return fail(res, e, "admin-review"); }
});
router.put("/admin/volunteer/entity-cap", writeLimiter, async (req, res) => {
  try {
    const u = await sessionUser(req);
    if (u?.role !== "admin") return res.status(403).json({ error: "لمدير التطبيق فقط" });
    const n = Math.max(0, Math.min(100000, Math.round(Number(req.body?.cap))));
    if (!Number.isFinite(n)) return res.status(400).json({ error: "قيمة غير صالحة" });
    await query(`INSERT INTO admin_settings (key, value) VALUES ('volunteer_entity_monthly_points',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [String(n)]);
    return res.json({ cap: n });
  } catch (e) { return fail(res, e, "cap"); }
});

export default router;
