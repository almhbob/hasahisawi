// ════════════════════════════════════════════════════════════════
// 🏛️ مساحة المنظمة: تفاصيل وهوية، لوحة إدارة، فريق وموظفون، مهام داخلية، وأرشيف
//  الأدوار: owner (المالك) · manager (مدير) · staff (موظف/عضو فريق).
//  • المالك والمدير: يعدّلان بيانات المنظمة، يديران الفريق والمهام والتطوع والفعاليات.
//  • الموظف: يرى مهامه فقط ويحدّث حالتها ويعلّق — بلا صلاحيات نشر أو إدارة.
//  • إدارة التطبيق تبقى فوق الجميع، والمنظمة لا تملك صلاحيات خارج مساحتها.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { ensureOrgActivitiesDb } from "./org-activities";
import { ensureEntityVolunteerDb, budgetOf } from "./entity-volunteer";

const router = Router();
type Role = "owner" | "manager" | "staff";
const ROLE_AR: Record<Role, string> = { owner: "مالك المنظمة", manager: "مدير", staff: "عضو فريق" };
const TASK_STATUS = ["todo", "in_progress", "review", "done", "blocked"] as const;
const TASK_STATUS_LABEL: Record<string, string> = { todo: "جديدة", in_progress: "قيد التنفيذ", review: "بانتظار المراجعة", done: "مكتملة", blocked: "متعثرة" };
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

let ready: Promise<void> | null = null;
export function ensureOrgWorkspaceDb(): Promise<void> {
  return (ready ??= (async () => {
    await ensureOrgActivitiesDb();
    await ensureEntityVolunteerDb().catch(() => {});
    for (const sql of [
      `ALTER TABLE org_managers ADD COLUMN IF NOT EXISTS title VARCHAR(120)`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cover_url TEXT`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address VARCHAR(250)`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website VARCHAR(250)`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vision TEXT`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS socials JSONB NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS working_hours VARCHAR(160)`,
    ]) await query(sql).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS org_tasks (
      id SERIAL PRIMARY KEY, org_id INTEGER NOT NULL, title VARCHAR(200) NOT NULL, description TEXT,
      assignee_user_id INTEGER NOT NULL, created_by INTEGER, created_by_name VARCHAR(200),
      priority VARCHAR(8) NOT NULL DEFAULT 'normal', status VARCHAR(12) NOT NULL DEFAULT 'todo',
      progress INTEGER NOT NULL DEFAULT 0, due_date DATE, completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS idx_org_tasks ON org_tasks(org_id, assignee_user_id, status)`);
    await query(`CREATE TABLE IF NOT EXISTS org_task_comments (
      id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES org_tasks(id) ON DELETE CASCADE,
      author_id INTEGER, author_name VARCHAR(200), body TEXT NOT NULL, kind VARCHAR(10) NOT NULL DEFAULT 'comment',
      created_at TIMESTAMPTZ DEFAULT NOW())`);
  })().catch((e) => { ready = null; throw e; }));
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const intId = (v: unknown) => (/^\d+$/.test(String(v)) ? Number(v) : null);
const fail = (res: Response, e: unknown, tag: string) => { logger.error({ err: e }, `[org-ws] ${tag}`); return res.status(500).json({ error: "خطأ في الخادم" }); };
const url = (v: unknown) => { const s = clip(v, 600); return /^https?:\/\//i.test(s) ? s : null; };

async function push(userIds: (number | null | undefined)[], title: string, body: string, data: Record<string, unknown>) {
  const ids = [...new Set(userIds.filter((x): x is number => typeof x === "number"))];
  if (!ids.length) return;
  try {
    await query(`INSERT INTO notifications (user_id, type, title, body, data) SELECT u, 'organization', $2, $3, $4 FROM UNNEST($1::int[]) AS u`, [ids, title, body, JSON.stringify(data)]).catch(() => {});
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [ids]);
    if (rows.length) await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound: "default", data }))),
    }).catch(() => {});
  } catch (e: any) { logger.warn({ err: e?.message }, "[org-ws] push"); }
}

type Ctx = { u: SessionUser; org: any; role: Role | "app"; lead: boolean };
async function ctx(req: Request, res: Response, needLead = false): Promise<Ctx | null> {
  await ensureOrgWorkspaceDb();
  const u = await sessionUser(req);
  if (!u) { res.status(401).json({ error: "سجّل الدخول" }); return null; }
  const id = intId(req.params.id);
  const org = id ? (await query(`SELECT * FROM organizations WHERE id=$1`, [id])).rows[0] : null;
  if (!org) { res.status(404).json({ error: "المنظمة غير موجودة" }); return null; }
  let role: Role | "app" | null = u.role === "admin" ? "app" : null;
  if (!role) role = ((await query(`SELECT role FROM org_managers WHERE org_id=$1 AND user_id=$2`, [org.id, u.id])).rows[0]?.role as Role) ?? null;
  if (!role) { res.status(403).json({ error: "لفريق المنظمة فقط" }); return null; }
  const lead = role === "app" || role === "owner" || role === "manager";
  if (needLead && !lead) { res.status(403).json({ error: "هذا الإجراء لإدارة المنظمة" }); return null; }
  return { u, org, role, lead };
}

// ── مساحاتي: المنظمات التي أنتمي لفريقها ──
router.get("/org-workspace/mine", async (req, res) => {
  try {
    await ensureOrgWorkspaceDb();
    const u = await sessionUser(req);
    if (!u) return res.json({ organizations: [] });
    const r = await query(`SELECT o.id, o.name, o.type, o.logo_url, o.is_verified, m.role FROM org_managers m JOIN organizations o ON o.id=m.org_id
      WHERE m.user_id=$1 AND o.is_active=TRUE ORDER BY (m.role='owner') DESC, o.name`, [u.id]);
    return res.json({ organizations: r.rows.map((o: any) => ({ ...o, role_label: ROLE_AR[o.role as Role] || o.role })) });
  } catch (e) { return fail(res, e, "mine"); }
});

// ── لوحة المساحة ──
router.get("/org-workspace/:id", async (req, res) => {
  const c = await ctx(req, res); if (!c) return;
  try {
    const id = c.org.id;
    const [team, stats] = await Promise.all([
      query(`SELECT m.user_id, m.role, m.title, m.created_at, u.name, u.phone, u.avatar_url,
          (SELECT COUNT(*)::int FROM org_tasks t WHERE t.org_id=$1 AND t.assignee_user_id=m.user_id AND t.status<>'done') AS open_tasks
        FROM org_managers m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name`, [id]),
      query(`SELECT
          (SELECT COUNT(*)::int FROM org_events WHERE org_id=$1 AND COALESCE(ends_at, starts_at + INTERVAL '1 day') >= NOW()) AS upcoming_events,
          (SELECT COUNT(*)::int FROM org_events WHERE org_id=$1 AND COALESCE(ends_at, starts_at + INTERVAL '1 day') < NOW()) AS past_events,
          (SELECT COUNT(*)::int FROM org_campaigns WHERE org_id=$1 AND status='active') AS active_campaigns,
          (SELECT COALESCE(SUM(raised_amount),0)::float FROM org_campaigns WHERE org_id=$1) AS raised_total,
          (SELECT COUNT(*)::int FROM org_tasks WHERE org_id=$1 AND status<>'done') AS open_tasks,
          (SELECT COUNT(*)::int FROM org_tasks WHERE org_id=$1 AND status<>'done' AND due_date < CURRENT_DATE) AS overdue_tasks,
          (SELECT COUNT(*)::int FROM volunteer_tasks WHERE owner_kind='org' AND owner_id=$1 AND status='open' AND archived_at IS NULL) AS open_volunteer,
          (SELECT COUNT(DISTINCT s.user_id)::int FROM volunteer_signups s JOIN volunteer_tasks t ON t.id=s.task_id WHERE t.owner_kind='org' AND t.owner_id=$1 AND s.status='completed') AS volunteers`, [id]).catch(() => ({ rows: [{}] as any[] })),
    ]);
    const my = c.role === "app" ? null : await query(`SELECT COUNT(*) FILTER (WHERE status<>'done')::int AS open, COUNT(*) FILTER (WHERE status='done')::int AS done,
        COUNT(*) FILTER (WHERE status<>'done' AND due_date < CURRENT_DATE)::int AS overdue FROM org_tasks WHERE org_id=$1 AND assignee_user_id=$2`, [id, c.u.id]);
    return res.json({
      organization: c.org, me: { role: c.role, role_label: c.role === "app" ? "إدارة التطبيق" : ROLE_AR[c.role], lead: c.lead, user_id: c.u.id },
      team: team.rows.map((t: any) => ({ ...t, role_label: ROLE_AR[t.role as Role] || t.role })),
      stats: stats.rows[0] ?? {}, my_tasks: my?.rows[0] ?? null,
      budget: c.lead ? await budgetOf({ kind: "org", id, name: c.org.name }).catch(() => null) : null,
    });
  } catch (e) { return fail(res, e, "overview"); }
});

// ── بيانات المنظمة وهويتها ──
router.patch("/org-workspace/:id/profile", writeLimiter, async (req, res) => {
  const c = await ctx(req, res, true); if (!c) return;
  try {
    const b = req.body ?? {};
    const sets: string[] = []; const vals: unknown[] = [];
    const put = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (b.description !== undefined) put("description", clip(b.description, 400));
    if (b.full_description !== undefined) put("full_description", clip(b.full_description, 5000));
    if (b.vision !== undefined) put("vision", clip(b.vision, 1500) || null);
    if (b.contact_phone !== undefined) put("contact_phone", clip(b.contact_phone, 50));
    if (b.email !== undefined) put("email", clip(b.email, 200) || null);
    if (b.address !== undefined) put("address", clip(b.address, 250) || null);
    if (b.working_hours !== undefined) put("working_hours", clip(b.working_hours, 160) || null);
    if (b.founded_year !== undefined) put("founded_year", clip(b.founded_year, 20));
    if (b.members_count !== undefined) { const n = Math.max(0, Math.min(1e6, Math.round(Number(b.members_count)) || 0)); put("members_count", n); }
    if (b.website !== undefined) put("website", url(b.website));
    if (b.logo_url !== undefined) put("logo_url", url(b.logo_url));
    if (b.cover_url !== undefined) put("cover_url", url(b.cover_url));
    if (Array.isArray(b.goals)) put("goals", b.goals.map((x: unknown) => clip(x, 160)).filter(Boolean).slice(0, 12));
    if (Array.isArray(b.needs)) put("needs", b.needs.map((x: unknown) => clip(x, 160)).filter(Boolean).slice(0, 12));
    if (b.socials && typeof b.socials === "object") {
      const so: Record<string, string> = {};
      for (const k of ["facebook", "whatsapp", "instagram", "x", "tiktok", "youtube", "telegram"]) { const v = clip((b.socials as any)[k], 300); if (v) so[k] = v; }
      put("socials", JSON.stringify(so));
    }
    // الاسم والنوع والتوثيق تبقى لإدارة التطبيق
    if (!sets.length) return res.json({ organization: c.org });
    vals.push(c.org.id);
    const r = await query(`UPDATE organizations SET ${sets.join(", ")} WHERE id=$${vals.length} RETURNING *`, vals);
    return res.json({ organization: r.rows[0] });
  } catch (e) { return fail(res, e, "profile"); }
});

// ── الفريق ──
router.post("/org-workspace/:id/team", writeLimiter, async (req, res) => {
  const c = await ctx(req, res, true); if (!c) return;
  try {
    const role: Role = req.body?.role === "manager" ? "manager" : "staff";
    if (role === "manager" && c.role === "manager") return res.status(403).json({ error: "تعيين المديرين لمالك المنظمة أو إدارة التطبيق" });
    const key = clip(req.body?.user, 120);
    if (!key) return res.status(400).json({ error: "اكتب رقم الهاتف أو البريد أو معرّف المستخدم" });
    const digits = key.replace(/\D/g, "");
    const r = await query(`SELECT id, name, phone FROM users
       WHERE id = CASE WHEN $1 ~ '^[0-9]{1,9}$' THEN $1::int END
          OR (length($2)>=9 AND RIGHT(regexp_replace(COALESCE(phone,''),'\\D','','g'),9) = RIGHT($2,9))
          OR lower(COALESCE(email,''))=lower($1)
       ORDER BY (id::text=$1) DESC LIMIT 2`, [key, digits]);
    if (!r.rows.length) return res.status(404).json({ error: "لا يوجد مستخدم بهذه البيانات — يجب أن يكون مسجّلاً في التطبيق" });
    if (r.rows.length > 1 && String(r.rows[0].id) !== key) return res.status(409).json({ error: "أكثر من مستخدم يطابق الرقم، استخدم معرّف المستخدم" });
    const t = r.rows[0];
    const cur = (await query(`SELECT role FROM org_managers WHERE org_id=$1 AND user_id=$2`, [c.org.id, t.id])).rows[0];
    if (cur?.role === "owner") return res.status(409).json({ error: "هذا المستخدم مالك المنظمة" });
    await query(`INSERT INTO org_managers (org_id, user_id, role, title) VALUES ($1,$2,$3,$4)
      ON CONFLICT (org_id, user_id) DO UPDATE SET role=EXCLUDED.role, title=EXCLUDED.title`, [c.org.id, t.id, role, clip(req.body?.title, 120) || null]);
    void push([t.id], `🏛️ انضممت لفريق ${c.org.name}`, `بصفتك ${ROLE_AR[role]} — افتح «مساحة المنظمة» لمتابعة مهامك.`, { screen: "org-workspace", id: c.org.id });
    return res.status(201).json({ member: { user_id: t.id, name: t.name, phone: t.phone, role, role_label: ROLE_AR[role] } });
  } catch (e) { return fail(res, e, "team-add"); }
});
router.patch("/org-workspace/:id/team/:uid", writeLimiter, async (req, res) => {
  const c = await ctx(req, res, true); if (!c) return;
  try {
    const uid = intId(req.params.uid);
    const cur = uid ? (await query(`SELECT role FROM org_managers WHERE org_id=$1 AND user_id=$2`, [c.org.id, uid])).rows[0] : null;
    if (!cur) return res.status(404).json({ error: "العضو غير موجود" });
    if (cur.role === "owner" && c.role !== "app") return res.status(403).json({ error: "لا يمكن تعديل المالك" });
    const role: Role | undefined = ["manager", "staff"].includes(req.body?.role) ? req.body.role : undefined;
    if (role === "manager" && c.role === "manager") return res.status(403).json({ error: "تعيين المديرين لمالك المنظمة" });
    await query(`UPDATE org_managers SET role=COALESCE($1, role), title=COALESCE($2, title) WHERE org_id=$3 AND user_id=$4`, [role ?? null, req.body?.title !== undefined ? clip(req.body.title, 120) : null, c.org.id, uid]);
    return res.json({ ok: true });
  } catch (e) { return fail(res, e, "team-patch"); }
});
router.delete("/org-workspace/:id/team/:uid", writeLimiter, async (req, res) => {
  const c = await ctx(req, res, true); if (!c) return;
  try {
    const uid = intId(req.params.uid);
    const cur = uid ? (await query(`SELECT role FROM org_managers WHERE org_id=$1 AND user_id=$2`, [c.org.id, uid])).rows[0] : null;
    if (!cur) return res.status(404).json({ error: "العضو غير موجود" });
    if (cur.role === "owner" && c.role !== "app") return res.status(403).json({ error: "لا يمكن إزالة مالك المنظمة" });
    if (cur.role === "manager" && c.role === "manager") return res.status(403).json({ error: "إزالة المديرين لمالك المنظمة" });
    await query(`DELETE FROM org_managers WHERE org_id=$1 AND user_id=$2`, [c.org.id, uid]);
    return res.json({ ok: true });
  } catch (e) { return fail(res, e, "team-del"); }
});

// ── مهام الفريق (بنفس واجهة مهام الاتحاد) ──
const TASK_SELECT = `SELECT t.*, t.assignee_user_id AS assignee_staff_id, u.name AS assignee_name, m.role AS assignee_role_key, m.title AS assignee_committee,
  (SELECT COUNT(*)::int FROM org_task_comments c WHERE c.task_id=t.id AND c.kind='comment') AS comments,
  (t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE AND t.status <> 'done') AS overdue
  FROM org_tasks t LEFT JOIN users u ON u.id=t.assignee_user_id LEFT JOIN org_managers m ON m.org_id=t.org_id AND m.user_id=t.assignee_user_id`;
const taskOut = (t: any) => ({ ...t, assignee_role: ROLE_AR[t.assignee_role_key as Role] ?? null, status_label: TASK_STATUS_LABEL[t.status] ?? t.status });
async function loadTask(c: Ctx, tid: number) {
  const t = (await query(`${TASK_SELECT} WHERE t.id=$1 AND t.org_id=$2`, [tid, c.org.id])).rows[0];
  if (!t) return null;
  if (!c.lead && t.assignee_user_id !== c.u.id) return "forbidden" as const;
  return t;
}
const leads = async (orgId: number) => (await query(`SELECT user_id FROM org_managers WHERE org_id=$1 AND role IN ('owner','manager')`, [orgId])).rows.map((r: any) => r.user_id);

router.get("/org-workspace/:id/tasks", async (req, res) => {
  const c = await ctx(req, res); if (!c) return;
  try {
    const args: unknown[] = [c.org.id]; const w = ["t.org_id=$1"];
    if (!c.lead) { args.push(c.u.id); w.push(`t.assignee_user_id=$${args.length}`); }
    else if (intId(req.query.staff)) { args.push(intId(req.query.staff)); w.push(`t.assignee_user_id=$${args.length}`); }
    const st = String(req.query.status ?? "");
    if (st === "open") w.push(`t.status <> 'done'`);
    else if ((TASK_STATUS as readonly string[]).includes(st)) { args.push(st); w.push(`t.status=$${args.length}`); }
    const r = await query(`${TASK_SELECT} WHERE ${w.join(" AND ")} ORDER BY (t.status='done'), CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.due_date NULLS LAST, t.id DESC LIMIT 400`, args);
    const scope = c.lead ? "" : `AND assignee_user_id=${Number(c.u.id)}`;
    const sum = (await query(`SELECT COUNT(*) FILTER (WHERE status<>'done')::int AS open, COUNT(*) FILTER (WHERE status='done')::int AS done,
        COUNT(*) FILTER (WHERE status<>'done' AND due_date < CURRENT_DATE)::int AS overdue, COUNT(*) FILTER (WHERE status='review')::int AS review,
        COUNT(*) FILTER (WHERE status<>'done' AND due_date = CURRENT_DATE)::int AS due_today FROM org_tasks WHERE org_id=$1 ${scope}`, [c.org.id])).rows[0];
    const staff = c.lead ? (await query(`SELECT m.user_id AS id, u.name AS full_name, m.role, m.title AS committee,
        COUNT(t.id) FILTER (WHERE t.status<>'done')::int AS open, COUNT(t.id) FILTER (WHERE t.status='done')::int AS done,
        COUNT(t.id) FILTER (WHERE t.status<>'done' AND t.due_date < CURRENT_DATE)::int AS overdue
      FROM org_managers m JOIN users u ON u.id=m.user_id LEFT JOIN org_tasks t ON t.org_id=m.org_id AND t.assignee_user_id=m.user_id
      WHERE m.org_id=$1 GROUP BY m.user_id, u.name, m.role, m.title ORDER BY u.name`, [c.org.id])).rows.map((s: any) => ({ ...s, role: ROLE_AR[s.role as Role] || s.role })) : [];
    return res.json({ tasks: r.rows.map(taskOut), summary: sum, staff, lead: c.lead, statuses: TASK_STATUS_LABEL });
  } catch (e) { return fail(res, e, "tasks"); }
});
router.get("/org-workspace/:id/tasks/:tid", async (req, res) => {
  const c = await ctx(req, res); if (!c) return;
  try {
    const t = await loadTask(c, intId(req.params.tid) ?? 0);
    if (!t) return res.status(404).json({ error: "المهمة غير موجودة" });
    if (t === "forbidden") return res.status(403).json({ error: "هذه المهمة ليست مسندة إليك" });
    const cm = await query(`SELECT id, author_name, body, kind, created_at FROM org_task_comments WHERE task_id=$1 ORDER BY id`, [t.id]);
    return res.json({ task: taskOut(t), comments: cm.rows, lead: c.lead });
  } catch (e) { return fail(res, e, "task"); }
});
router.post("/org-workspace/:id/tasks", writeLimiter, async (req, res) => {
  const c = await ctx(req, res, true); if (!c) return;
  try {
    const b = req.body ?? {};
    const title = clip(b.title, 200);
    if (title.length < 3) return res.status(400).json({ error: "اكتب عنوان المهمة" });
    const aid = intId(b.assignee_staff_id) ?? 0;
    const member = (await query(`SELECT m.user_id, u.name FROM org_managers m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.user_id=$2`, [c.org.id, aid])).rows[0];
    if (!member) return res.status(400).json({ error: "اختر عضواً من فريق المنظمة" });
    const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.due_date ?? "")) ? String(b.due_date) : null;
    const pr = (PRIORITIES as readonly string[]).includes(b.priority) ? b.priority : "normal";
    const t = (await query(`INSERT INTO org_tasks (org_id, title, description, assignee_user_id, created_by, created_by_name, priority, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [c.org.id, title, clip(b.description, 4000) || null, aid, c.u.id, c.u.name, pr, due])).rows[0];
    await query(`INSERT INTO org_task_comments (task_id, author_id, author_name, body, kind) VALUES ($1,$2,$3,$4,'event')`, [t.id, c.u.id, c.u.name, `أسند المهمة إلى ${member.name}`]);
    void push([aid !== c.u.id ? aid : null], pr === "urgent" ? `🔴 مهمة عاجلة — ${c.org.name}` : `مهمة جديدة — ${c.org.name}`, `${title}${due ? ` · التسليم ${due}` : ""}`, { screen: "org-workspace", id: c.org.id, tab: "tasks" });
    return res.status(201).json({ task: taskOut((await query(`${TASK_SELECT} WHERE t.id=$1`, [t.id])).rows[0]) });
  } catch (e) { return fail(res, e, "task-create"); }
});
router.patch("/org-workspace/:id/tasks/:tid", writeLimiter, async (req, res) => {
  const c = await ctx(req, res); if (!c) return;
  try {
    const t = await loadTask(c, intId(req.params.tid) ?? 0);
    if (!t) return res.status(404).json({ error: "المهمة غير موجودة" });
    if (t === "forbidden") return res.status(403).json({ error: "هذه المهمة ليست مسندة إليك" });
    const b = req.body ?? {}; const sets: string[] = []; const vals: unknown[] = []; const events: string[] = [];
    const put = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    let status = t.status as string;
    if (b.status !== undefined) {
      if (!(TASK_STATUS as readonly string[]).includes(b.status)) return res.status(400).json({ error: "حالة غير صالحة" });
      status = b.status === "done" && !c.lead ? "review" : b.status;
      if (status !== t.status) { put("status", status); events.push(`غيّر الحالة إلى «${TASK_STATUS_LABEL[status]}»`); }
      put("completed_at", status === "done" ? new Date() : null);
    }
    if (b.progress !== undefined) { const pg = Math.max(0, Math.min(100, Math.round(Number(b.progress)) || 0)); if (pg !== t.progress) { put("progress", pg); events.push(`حدّث الإنجاز إلى ${pg}%`); } }
    else if (status === "done") put("progress", 100);
    if (c.lead) {
      if (b.title !== undefined) { const v = clip(b.title, 200); if (v.length < 3) return res.status(400).json({ error: "اكتب عنوان المهمة" }); put("title", v); }
      if (b.description !== undefined) put("description", clip(b.description, 4000) || null);
      if (b.priority !== undefined && (PRIORITIES as readonly string[]).includes(b.priority)) put("priority", b.priority);
      if (b.due_date !== undefined) put("due_date", /^\d{4}-\d{2}-\d{2}$/.test(String(b.due_date)) ? b.due_date : null);
      if (b.assignee_staff_id !== undefined) {
        const aid = intId(b.assignee_staff_id) ?? 0;
        const m2 = (await query(`SELECT u.name FROM org_managers m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.user_id=$2`, [c.org.id, aid])).rows[0];
        if (!m2) return res.status(400).json({ error: "اختر عضواً من الفريق" });
        if (aid !== t.assignee_user_id) { put("assignee_user_id", aid); events.push(`أعاد إسناد المهمة إلى ${m2.name}`); }
      }
    }
    if (!sets.length) return res.json({ task: taskOut(t) });
    vals.push(t.id);
    await query(`UPDATE org_tasks SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${vals.length}`, vals);
    for (const ev of events) await query(`INSERT INTO org_task_comments (task_id, author_id, author_name, body, kind) VALUES ($1,$2,$3,$4,'event')`, [t.id, c.u.id, c.u.name, ev]);
    const full = (await query(`${TASK_SELECT} WHERE t.id=$1`, [t.id])).rows[0];
    if (events.length) {
      const to = c.lead ? [full.assignee_user_id] : await leads(c.org.id);
      void push(to.filter((x: number) => x !== c.u.id), status === "review" && !c.lead ? `✅ ${c.u.name} أنجز مهمة — بانتظار مراجعتك` : `تحديث على «${t.title}»`, events.join("، "), { screen: "org-workspace", id: c.org.id, tab: "tasks" });
    }
    return res.json({ task: taskOut(full) });
  } catch (e) { return fail(res, e, "task-update"); }
});
router.post("/org-workspace/:id/tasks/:tid/comments", writeLimiter, async (req, res) => {
  const c = await ctx(req, res); if (!c) return;
  try {
    const t = await loadTask(c, intId(req.params.tid) ?? 0);
    if (!t) return res.status(404).json({ error: "المهمة غير موجودة" });
    if (t === "forbidden") return res.status(403).json({ error: "هذه المهمة ليست مسندة إليك" });
    const body = clip(req.body?.body, 2000);
    if (!body) return res.status(400).json({ error: "اكتب التعليق" });
    const cm = (await query(`INSERT INTO org_task_comments (task_id, author_id, author_name, body) VALUES ($1,$2,$3,$4) RETURNING id, author_name, body, kind, created_at`, [t.id, c.u.id, c.u.name, body])).rows[0];
    const to = c.lead ? [t.assignee_user_id] : await leads(c.org.id);
    void push(to.filter((x: number) => x !== c.u.id), `تعليق على «${t.title}»`, `${c.u.name}: ${body.slice(0, 120)}`, { screen: "org-workspace", id: c.org.id, tab: "tasks" });
    return res.status(201).json({ comment: cm });
  } catch (e) { return fail(res, e, "task-comment"); }
});
router.delete("/org-workspace/:id/tasks/:tid", writeLimiter, async (req, res) => {
  const c = await ctx(req, res, true); if (!c) return;
  try { await query(`DELETE FROM org_tasks WHERE id=$1 AND org_id=$2`, [intId(req.params.tid) ?? 0, c.org.id]); return res.json({ ok: true }); }
  catch (e) { return fail(res, e, "task-delete"); }
});

// ── الأرشيف ──
router.get("/org-workspace/:id/archive", async (req, res) => {
  const c = await ctx(req, res); if (!c) return;
  try {
    const id = c.org.id;
    const safe = (p: Promise<any>) => p.catch(() => ({ rows: [] as any[] }));
    const [events, campaigns, vol, tasks] = await Promise.all([
      safe(query(`SELECT id, title, description, starts_at, ends_at, location, image_url FROM org_events WHERE org_id=$1 AND COALESCE(ends_at, starts_at + INTERVAL '1 day') < NOW() ORDER BY starts_at DESC LIMIT 200`, [id])),
      safe(query(`SELECT id, title, goal_amount, raised_amount, currency, ends_at, status, image_url FROM org_campaigns WHERE org_id=$1 AND (status<>'active' OR (ends_at IS NOT NULL AND ends_at < NOW())) ORDER BY created_at DESC LIMIT 200`, [id])),
      safe(query(`SELECT t.id, t.title, t.size, t.points, t.status, t.starts_at, t.archived_at,
          (SELECT COUNT(*)::int FROM volunteer_signups s WHERE s.task_id=t.id AND s.status='completed') AS completed_count,
          (SELECT COALESCE(SUM(points_awarded),0)::int FROM volunteer_signups s WHERE s.task_id=t.id AND s.status='completed') AS awarded
        FROM volunteer_tasks t WHERE t.owner_kind='org' AND t.owner_id=$1 AND (t.archived_at IS NOT NULL OR t.status='done') ORDER BY COALESCE(t.archived_at, t.created_at) DESC LIMIT 200`, [id])),
      safe(query(`${TASK_SELECT} WHERE t.org_id=$1 AND t.status='done' ${c.lead ? "" : "AND t.assignee_user_id=$2"} ORDER BY t.completed_at DESC NULLS LAST LIMIT 200`, c.lead ? [id] : [id, c.u.id])),
    ]);
    return res.json({ events: events.rows, campaigns: campaigns.rows, volunteer: vol.rows, tasks: tasks.rows.map(taskOut) });
  } catch (e) { return fail(res, e, "archive"); }
});

export default router;
