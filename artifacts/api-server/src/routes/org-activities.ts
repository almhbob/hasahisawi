// ════════════════════════════════════════════════════════════════
// 🤝 نشاط المنظمات المجتمعية: الفعاليات، حملات التبرع، ومسؤولو المنظمة
//  • القوائم العامة تعرض نشاط المنظمات الموثقة والمفعّلة فقط.
//  • النشر والتعديل لمسؤولي المنظمة (org_managers) ولإدارة التطبيق.
//  • إدارة التطبيق تعيّن المسؤولين وتزيلهم.
//  • التطبيق لا يستلم التبرعات: payment_info تكتبه المنظمة ويظهر للمتبرع كما هو.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();

let ready: Promise<void> | null = null;
export function ensureOrgActivitiesDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS org_managers (
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL DEFAULT 'manager',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (org_id, user_id)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS org_managers_user_idx ON org_managers(user_id)`);
    await query(`CREATE TABLE IF NOT EXISTS org_events (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NULL,
      location VARCHAR(250) NOT NULL DEFAULT '',
      image_url TEXT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'published',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS org_events_org_idx ON org_events(org_id, starts_at)`);
    await query(`CREATE TABLE IF NOT EXISTS org_campaigns (
      id SERIAL PRIMARY KEY,
      org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      goal_amount NUMERIC(14,2) NULL,
      raised_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      currency VARCHAR(8) NOT NULL DEFAULT 'SDG',
      ends_at TIMESTAMPTZ NULL,
      image_url TEXT NULL,
      payment_info TEXT NOT NULL DEFAULT '',
      status VARCHAR(12) NOT NULL DEFAULT 'active',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS org_campaigns_org_idx ON org_campaigns(org_id, status)`);
  })().catch((e) => { ready = null; throw e; }));
}

// ── مساعدات ─────────────────────────────────────────────────────
const isAdmin = (u: SessionUser | null) => !!u && u.role === "admin";
const PUBLIC_ORG = `o.is_active=TRUE AND o.is_verified=TRUE`;
// الفعالية تبقى ظاهرة حتى نهاية يومها (أو حتى ends_at إن وُجد)
const UPCOMING = `COALESCE(e.ends_at, e.starts_at + INTERVAL '1 day') >= NOW()`;

async function canManage(u: SessionUser | null, orgId: number): Promise<boolean> {
  if (!u || u.is_banned) return false;
  if (isAdmin(u)) return true;
  const r = await query(`SELECT 1 FROM org_managers WHERE org_id=$1 AND user_id=$2`, [orgId, u.id]);
  return r.rows.length > 0;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function optUrl(v: unknown): string | null {
  const s = str(v, 1000);
  return /^https?:\/\//i.test(s) ? s : null;
}
function optDate(v: unknown): Date | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? "invalid" : d;
}
function optAmount(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[,\s٬]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? n : "invalid";
}
const idParam = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const fail = (res: Response, e: unknown) => { logger.error({ err: e }, "org-activities error"); return res.status(500).json({ error: "خطأ في الخادم" }); };

const EVENT_COLS = `e.id, e.org_id, e.title, e.description, e.starts_at, e.ends_at, e.location, e.image_url, e.status, e.created_at,
  o.name AS org_name, o.type AS org_type, o.contact_phone AS org_phone`;
const CAMP_COLS = `c.id, c.org_id, c.title, c.description, c.goal_amount, c.raised_amount, c.currency, c.ends_at, c.image_url,
  c.payment_info, c.status, c.created_at, o.name AS org_name, o.type AS org_type, o.contact_phone AS org_phone`;

// ════════════════ عام ════════════════

// أعداد حقيقية للرأس وبطاقة التسجيل
router.get("/organizations/stats", async (_req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const [orgs, ev, camp] = await Promise.all([
      query(`SELECT type, COUNT(*)::int AS n, COALESCE(SUM(members_count),0)::int AS members FROM organizations WHERE is_active=TRUE GROUP BY type`),
      query(`SELECT COUNT(*)::int AS n FROM org_events e JOIN organizations o ON o.id=e.org_id WHERE ${PUBLIC_ORG} AND e.status='published' AND ${UPCOMING}`),
      query(`SELECT COUNT(*)::int AS n FROM org_campaigns c JOIN organizations o ON o.id=c.org_id WHERE ${PUBLIC_ORG} AND c.status='active' AND (c.ends_at IS NULL OR c.ends_at >= NOW())`),
    ]);
    const by_type: Record<string, number> = {};
    let total = 0, members = 0;
    for (const r of orgs.rows) { by_type[r.type] = r.n; total += r.n; members += r.members; }
    return res.json({ total, by_type, members, events: ev.rows[0].n, campaigns: camp.rows[0].n });
  } catch (e) { return fail(res, e); }
});

// المنظمات التي يديرها المستخدم الحالي
router.get("/organizations/managed", async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const u = await sessionUser(req);
    if (!u) return res.json({ organizations: [] });
    const r = isAdmin(u)
      ? await query(`SELECT id, name, type, is_verified FROM organizations WHERE is_active=TRUE ORDER BY name`)
      : await query(`SELECT o.id, o.name, o.type, o.is_verified FROM org_managers m JOIN organizations o ON o.id=m.org_id
                     WHERE m.user_id=$1 AND o.is_active=TRUE ORDER BY o.name`, [u.id]);
    return res.json({ organizations: r.rows, is_admin: isAdmin(u) });
  } catch (e) { return fail(res, e); }
});

// تفاصيل منظمة مع فعالياتها وحملاتها
router.get("/organizations/:id", async (req: Request, res: Response, next) => {
  const id = idParam(req.params.id);
  if (!id) return next();
  try {
    await ensureOrgActivitiesDb();
    const u = await sessionUser(req);
    const manage = await canManage(u, id);
    const o = await query(`SELECT * FROM organizations WHERE id=$1`, [id]);
    const org = o.rows[0];
    if (!org || (!org.is_active && !manage)) return res.status(404).json({ error: "المنظمة غير موجودة" });
    // المنظمة غير الموثقة: نشاطها يظهر لمسؤوليها فقط إلى أن توثّقها الإدارة
    const showActivity = org.is_verified || manage;
    const [ev, camp] = showActivity ? await Promise.all([
      query(`SELECT ${EVENT_COLS} FROM org_events e JOIN organizations o ON o.id=e.org_id
             WHERE e.org_id=$1 ${manage ? "" : `AND e.status='published' AND ${UPCOMING}`} ORDER BY e.starts_at ASC LIMIT 100`, [id]),
      query(`SELECT ${CAMP_COLS} FROM org_campaigns c JOIN organizations o ON o.id=c.org_id
             WHERE c.org_id=$1 ${manage ? "" : `AND c.status='active'`} ORDER BY c.status ASC, c.created_at DESC LIMIT 100`, [id]),
    ]) : [{ rows: [] }, { rows: [] }];
    return res.json({ organization: org, events: ev.rows, campaigns: camp.rows, can_manage: manage, is_admin: isAdmin(u) });
  } catch (e) { return fail(res, e); }
});

router.get("/org-events", async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const params: unknown[] = [];
    let where = `${PUBLIC_ORG} AND e.status='published' AND ${UPCOMING}`;
    const orgId = idParam(req.query.org_id);
    if (orgId) { params.push(orgId); where += ` AND e.org_id=$${params.length}`; }
    const r = await query(`SELECT ${EVENT_COLS} FROM org_events e JOIN organizations o ON o.id=e.org_id WHERE ${where} ORDER BY e.starts_at ASC LIMIT 200`, params);
    return res.json({ events: r.rows });
  } catch (e) { return fail(res, e); }
});

router.get("/org-campaigns", async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const params: unknown[] = [];
    let where = `${PUBLIC_ORG} AND c.status='active' AND (c.ends_at IS NULL OR c.ends_at >= NOW())`;
    const orgId = idParam(req.query.org_id);
    if (orgId) { params.push(orgId); where += ` AND c.org_id=$${params.length}`; }
    const r = await query(`SELECT ${CAMP_COLS} FROM org_campaigns c JOIN organizations o ON o.id=c.org_id WHERE ${where} ORDER BY c.created_at DESC LIMIT 200`, params);
    return res.json({ campaigns: r.rows });
  } catch (e) { return fail(res, e); }
});

// ════════════════ إدارة: مسؤول المنظمة أو الإدارة ════════════════

function readEvent(b: any, partial: boolean) {
  const title = str(b?.title, 200);
  const starts = optDate(b?.starts_at);
  const ends = optDate(b?.ends_at);
  if (!partial && !title) return { error: "عنوان الفعالية مطلوب" };
  if (!partial && !starts) return { error: "تاريخ الفعالية مطلوب" };
  if (starts === "invalid" || ends === "invalid") return { error: "صيغة التاريخ غير صحيحة" };
  if (starts && ends && ends < starts) return { error: "وقت الانتهاء قبل وقت البدء" };
  const status = b?.status === undefined ? undefined : (b.status === "cancelled" ? "cancelled" : "published");
  return { title, starts, ends, status, description: str(b?.description, 4000), location: str(b?.location, 250), image_url: optUrl(b?.image_url) };
}

router.post("/organizations/:id/events", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const orgId = idParam(req.params.id);
    if (!orgId) return res.status(400).json({ error: "معرّف غير صالح" });
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    if (!(await canManage(u, orgId))) return res.status(403).json({ error: "هذه الخاصية لمسؤولي المنظمة فقط" });
    const v = readEvent(req.body, false);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const r = await query(
      `INSERT INTO org_events (org_id,title,description,starts_at,ends_at,location,image_url,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [orgId, v.title, v.description, v.starts, v.ends, v.location, v.image_url, u.id]);
    return res.status(201).json({ event: r.rows[0] });
  } catch (e) { return fail(res, e); }
});

router.patch("/org-events/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const id = idParam(req.params.id);
    const cur = id ? (await query(`SELECT org_id FROM org_events WHERE id=$1`, [id])).rows[0] : null;
    if (!cur) return res.status(404).json({ error: "الفعالية غير موجودة" });
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    if (!(await canManage(u, cur.org_id))) return res.status(403).json({ error: "هذه الخاصية لمسؤولي المنظمة فقط" });
    const v = readEvent(req.body, true);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const b = req.body || {};
    const r = await query(
      `UPDATE org_events SET
         title=COALESCE(NULLIF($1,''),title),
         description=CASE WHEN $2::boolean THEN $3 ELSE description END,
         starts_at=COALESCE($4,starts_at),
         ends_at=CASE WHEN $5::boolean THEN $6 ELSE ends_at END,
         location=CASE WHEN $7::boolean THEN $8 ELSE location END,
         status=COALESCE($9,status)
       WHERE id=$10 RETURNING *`,
      [v.title, "description" in b, v.description, v.starts, "ends_at" in b, v.ends, "location" in b, v.location, v.status ?? null, id]);
    return res.json({ event: r.rows[0] });
  } catch (e) { return fail(res, e); }
});

router.delete("/org-events/:id", async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const id = idParam(req.params.id);
    const cur = id ? (await query(`SELECT org_id FROM org_events WHERE id=$1`, [id])).rows[0] : null;
    if (!cur) return res.status(404).json({ error: "الفعالية غير موجودة" });
    const u = await sessionUser(req);
    if (!(await canManage(u, cur.org_id))) return res.status(u ? 403 : 401).json({ error: "هذه الخاصية لمسؤولي المنظمة فقط" });
    await query(`DELETE FROM org_events WHERE id=$1`, [id]);
    return res.json({ ok: true });
  } catch (e) { return fail(res, e); }
});

function readCampaign(b: any, partial: boolean) {
  const title = str(b?.title, 200);
  const payment = str(b?.payment_info, 1000);
  const goal = optAmount(b?.goal_amount);
  const raised = optAmount(b?.raised_amount);
  const ends = optDate(b?.ends_at);
  if (!partial && !title) return { error: "عنوان الحملة مطلوب" };
  if (!partial && !payment) return { error: "اكتب طريقة التبرع (حساب بنكي أو رقم محفظة)" };
  if (goal === "invalid" || raised === "invalid") return { error: "المبلغ غير صحيح" };
  if (ends === "invalid") return { error: "صيغة التاريخ غير صحيحة" };
  const status = b?.status === undefined ? undefined : (b.status === "closed" ? "closed" : "active");
  const currency = str(b?.currency, 8).toUpperCase() || "SDG";
  return { title, payment, goal, raised, ends, status, currency, description: str(b?.description, 4000), image_url: optUrl(b?.image_url) };
}

router.post("/organizations/:id/campaigns", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const orgId = idParam(req.params.id);
    if (!orgId) return res.status(400).json({ error: "معرّف غير صالح" });
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    if (!(await canManage(u, orgId))) return res.status(403).json({ error: "هذه الخاصية لمسؤولي المنظمة فقط" });
    const v = readCampaign(req.body, false);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const r = await query(
      `INSERT INTO org_campaigns (org_id,title,description,goal_amount,raised_amount,currency,ends_at,image_url,payment_info,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [orgId, v.title, v.description, v.goal, v.raised ?? 0, v.currency, v.ends, v.image_url, v.payment, u.id]);
    return res.status(201).json({ campaign: r.rows[0] });
  } catch (e) { return fail(res, e); }
});

router.patch("/org-campaigns/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const id = idParam(req.params.id);
    const cur = id ? (await query(`SELECT org_id FROM org_campaigns WHERE id=$1`, [id])).rows[0] : null;
    if (!cur) return res.status(404).json({ error: "الحملة غير موجودة" });
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    if (!(await canManage(u, cur.org_id))) return res.status(403).json({ error: "هذه الخاصية لمسؤولي المنظمة فقط" });
    const v = readCampaign(req.body, true);
    if ("error" in v) return res.status(400).json({ error: v.error });
    const b = req.body || {};
    const r = await query(
      `UPDATE org_campaigns SET
         title=COALESCE(NULLIF($1,''),title),
         description=CASE WHEN $2::boolean THEN $3 ELSE description END,
         goal_amount=CASE WHEN $4::boolean THEN $5 ELSE goal_amount END,
         raised_amount=COALESCE($6,raised_amount),
         ends_at=CASE WHEN $7::boolean THEN $8 ELSE ends_at END,
         payment_info=COALESCE(NULLIF($9,''),payment_info),
         status=COALESCE($10,status)
       WHERE id=$11 RETURNING *`,
      [v.title, "description" in b, v.description, "goal_amount" in b, v.goal, v.raised, "ends_at" in b, v.ends, v.payment, v.status ?? null, id]);
    return res.json({ campaign: r.rows[0] });
  } catch (e) { return fail(res, e); }
});

router.delete("/org-campaigns/:id", async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    const id = idParam(req.params.id);
    const cur = id ? (await query(`SELECT org_id FROM org_campaigns WHERE id=$1`, [id])).rows[0] : null;
    if (!cur) return res.status(404).json({ error: "الحملة غير موجودة" });
    const u = await sessionUser(req);
    if (!(await canManage(u, cur.org_id))) return res.status(u ? 403 : 401).json({ error: "هذه الخاصية لمسؤولي المنظمة فقط" });
    await query(`DELETE FROM org_campaigns WHERE id=$1`, [id]);
    return res.json({ ok: true });
  } catch (e) { return fail(res, e); }
});

// ════════════════ إدارة التطبيق: تعيين مسؤولي المنظمة ════════════════

router.get("/admin/organizations/:id/managers", async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    if (!isAdmin(await sessionUser(req))) return res.status(403).json({ error: "غير مصرح" });
    const r = await query(
      `SELECT m.user_id, m.role, m.created_at, u.name, u.phone FROM org_managers m JOIN users u ON u.id=m.user_id
       WHERE m.org_id=$1 ORDER BY m.created_at`, [idParam(req.params.id)]);
    return res.json({ managers: r.rows });
  } catch (e) { return fail(res, e); }
});

router.post("/admin/organizations/:id/managers", async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    if (!isAdmin(await sessionUser(req))) return res.status(403).json({ error: "غير مصرح" });
    const orgId = idParam(req.params.id);
    const org = orgId ? (await query(`SELECT id FROM organizations WHERE id=$1`, [orgId])).rows[0] : null;
    if (!org) return res.status(404).json({ error: "المنظمة غير موجودة" });
    // المستخدم بالمعرّف أو برقم الهاتف أو البريد
    const key = str(req.body?.user, 120) || String(req.body?.user_id ?? "");
    if (!key) return res.status(400).json({ error: "اكتب رقم الهاتف أو معرّف المستخدم" });
    const digits = key.replace(/\D/g, "");
    const r = await query(
      `SELECT id, name, phone FROM users
       WHERE id = CASE WHEN $1 ~ '^[0-9]{1,9}$' THEN $1::int END
          OR (length($2)>=7 AND regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%' || $2)
          OR lower(COALESCE(email,''))=lower($1)
       ORDER BY (id::text=$1) DESC LIMIT 2`, [key, digits]);
    if (!r.rows.length) return res.status(404).json({ error: "لا يوجد مستخدم بهذه البيانات" });
    if (r.rows.length > 1 && String(r.rows[0].id) !== key) return res.status(409).json({ error: "أكثر من مستخدم يطابق الرقم، استخدم معرّف المستخدم" });
    const target = r.rows[0];
    const role = req.body?.role === "owner" ? "owner" : "manager";
    await query(`INSERT INTO org_managers (org_id,user_id,role) VALUES ($1,$2,$3)
                 ON CONFLICT (org_id,user_id) DO UPDATE SET role=EXCLUDED.role`, [orgId, target.id, role]);
    return res.status(201).json({ manager: { user_id: target.id, name: target.name, phone: target.phone, role } });
  } catch (e) { return fail(res, e); }
});

router.delete("/admin/organizations/:id/managers/:userId", async (req: Request, res: Response) => {
  try {
    await ensureOrgActivitiesDb();
    if (!isAdmin(await sessionUser(req))) return res.status(403).json({ error: "غير مصرح" });
    await query(`DELETE FROM org_managers WHERE org_id=$1 AND user_id=$2`, [idParam(req.params.id), idParam(req.params.userId)]);
    return res.json({ ok: true });
  } catch (e) { return fail(res, e); }
});

export default router;
