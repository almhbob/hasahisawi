// ════════════════════════════════════════════════════════════════
// ⏸️ حالة المنشآت: إيقاف إداري للمخالفة + «غير متاح مؤقتاً» يفعّله صاحب المنشأة
//  • الإيقاف الإداري (المدير أو المشرف المخوّل): يُخفي المنشأة من القوائم العامة ويُظهر لصاحبها السبب.
//  • الإيقاف المؤقت (صاحب المنشأة): تبقى ظاهرة مع شاشة تنبيه برسالته وموعد الاستئناف،
//    ويُرفع تلقائياً عند حلول الموعد.
//  • الحذف النهائي لمدير التطبيق فقط.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();

type EntityCfg = { table: string; label: string; perm: string; nameCol: string; owner: (id: number, uid: number) => Promise<boolean>; activeWhere: string };
const own = (sql: string) => async (id: number, uid: number) => (await query(sql, [id, uid]).catch(() => ({ rows: [] as any[] }))).rows.length > 0;

export const ENTITIES: Record<string, EntityCfg> = {
  food: { table: "food_businesses", label: "مطعم / كافتيريا", perm: "merchants_admin", nameCol: "name", activeWhere: "status='approved'",
    owner: own(`SELECT 1 FROM food_businesses WHERE id=$1 AND owner_user_id=$2`) },
  store: { table: "stores", label: "متجر", perm: "merchants_admin", nameCol: "name", activeWhere: "status='active'",
    owner: own(`SELECT 1 FROM stores WHERE id=$1 AND owner_id=$2`) },
  fuel: { table: "fuel_stations", label: "محطة وقود / محل غاز", perm: "fuel_stations", nameCol: "name", activeWhere: "status='approved'",
    owner: own(`SELECT 1 FROM fuel_stations s WHERE s.id=$1 AND (s.owner_user_id=$2 OR EXISTS (SELECT 1 FROM fuel_station_managers m WHERE m.station_id=s.id AND m.user_id=$2))`) },
  club: { table: "sport_clubs", label: "نادٍ رياضي", perm: "leagues", nameCol: "name", activeWhere: "status='approved'",
    owner: own(`SELECT 1 FROM sport_clubs WHERE id=$1 AND owner_id=$2`) },
  org: { table: "organizations", label: "منظمة / مؤسسة", perm: "communities", nameCol: "name", activeWhere: "TRUE",
    owner: own(`SELECT 1 FROM org_managers WHERE org_id=$1 AND user_id=$2`) },
  community: { table: "communities", label: "جالية / مجتمع", perm: "communities", nameCol: "name", activeWhere: "status='approved'",
    owner: own(`SELECT 1 FROM communities WHERE id=$1 AND submitted_by=$2`) },
};

let ready: Promise<void> | null = null;
export function ensureEntityStatusDb(): Promise<void> {
  return (ready ??= query(`CREATE TABLE IF NOT EXISTS entity_status (
      entity_type VARCHAR(16) NOT NULL, entity_id INTEGER NOT NULL,
      suspended BOOLEAN NOT NULL DEFAULT FALSE, suspend_reason TEXT, suspended_by INTEGER, suspended_at TIMESTAMPTZ,
      paused BOOLEAN NOT NULL DEFAULT FALSE, pause_message TEXT, resume_at TIMESTAMPTZ, paused_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (entity_type, entity_id))`)
    .then(() => undefined).catch((e) => { ready = null; throw e; }));
}

/** شرط SQL لإخفاء الموقوف إدارياً من القوائم العامة: `AND ${notSuspended("food","b.id")}` */
export function notSuspended(type: string, idExpr: string): string {
  return `NOT EXISTS (SELECT 1 FROM entity_status es WHERE es.entity_type='${type}' AND es.entity_id=${idExpr} AND es.suspended)`;
}

/** الحالة الفعلية: الإيقاف المؤقت ينتهي تلقائياً بحلول موعد الاستئناف */
function view(r: any) {
  if (!r) return { suspended: false, paused: false };
  const pausedNow = r.paused && (!r.resume_at || new Date(r.resume_at).getTime() > Date.now());
  return {
    suspended: !!r.suspended, suspend_reason: r.suspended ? r.suspend_reason : null, suspended_at: r.suspended_at,
    paused: pausedNow, pause_message: pausedNow ? r.pause_message : null, resume_at: pausedNow ? r.resume_at : null,
  };
}

async function canModerate(u: SessionUser | null, type: string): Promise<boolean> {
  if (!u) return false;
  if (u.role === "admin") return true;
  if (u.role !== "moderator") return false;
  const r = await query(`SELECT 1 FROM moderator_permissions WHERE user_id=$1 AND section=$2`, [u.id, ENTITIES[type].perm]).catch(() => ({ rows: [] as any[] }));
  return r.rows.length > 0;
}

// GET /api/entity-status?type=food&ids=1,2,3
router.get("/entity-status", async (req: Request, res: Response) => {
  const type = String(req.query.type || "");
  if (!ENTITIES[type]) return res.status(400).json({ error: "نوع غير معروف" });
  try {
    await ensureEntityStatusDb();
    const ids = String(req.query.ids || "").split(",").map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 300);
    if (!ids.length) return res.json({ statuses: {} });
    const r = await query(`SELECT * FROM entity_status WHERE entity_type=$1 AND entity_id = ANY($2::int[])`, [type, ids]);
    const out: Record<number, any> = {};
    for (const x of r.rows) out[x.entity_id] = view(x);
    return res.json({ statuses: out });
  } catch (e: any) { logger.error({ err: e?.message }, "entity-status list"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/entity-status/:type/:id — للصفحة نفسها (يعرف إن كان المستخدم صاحبها)
router.get("/entity-status/:type/:id", async (req: Request, res: Response) => {
  const type = String(req.params.type), id = Number(req.params.id);
  if (!ENTITIES[type]) return res.status(400).json({ error: "نوع غير معروف" });
  try {
    await ensureEntityStatusDb();
    const u = await sessionUser(req);
    const r = (await query(`SELECT * FROM entity_status WHERE entity_type=$1 AND entity_id=$2`, [type, id])).rows[0];
    const isOwner = u ? await ENTITIES[type].owner(id, u.id) : false;
    const v = view(r);
    // سبب الإيقاف الإداري لا يُعرض إلا لصاحب المنشأة والإدارة
    if (!isOwner && !(await canModerate(u, type))) v.suspend_reason = null;
    return res.json({ status: v, is_owner: isOwner });
  } catch (e: any) { logger.error({ err: e?.message }, "entity-status get"); return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/entity-status/:type/:id/pause  { paused, message, resume_at }
router.put("/entity-status/:type/:id/pause", writeLimiter, async (req: Request, res: Response) => {
  const type = String(req.params.type), id = Number(req.params.id);
  if (!ENTITIES[type]) return res.status(400).json({ error: "نوع غير معروف" });
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول" });
  if (!(await ENTITIES[type].owner(id, u.id)) && !(await canModerate(u, type))) return res.status(403).json({ error: "هذا الإجراء لصاحب المنشأة" });
  try {
    await ensureEntityStatusDb();
    const paused = !!req.body?.paused;
    const resume = req.body?.resume_at ? new Date(req.body.resume_at) : null;
    if (resume && (isNaN(resume.getTime()) || resume.getTime() < Date.now() - 60000)) return res.status(400).json({ error: "موعد الاستئناف يجب أن يكون في المستقبل" });
    const msg = String(req.body?.message || "").trim().slice(0, 300) || null;
    const r = await query(
      `INSERT INTO entity_status (entity_type, entity_id, paused, pause_message, resume_at, paused_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,CASE WHEN $3 THEN NOW() END,NOW())
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET paused=$3, pause_message=$4, resume_at=$5,
         paused_at=CASE WHEN $3 THEN NOW() ELSE entity_status.paused_at END, updated_at=NOW() RETURNING *`,
      [type, id, paused, paused ? msg : null, paused ? resume : null]);
    return res.json({ status: view(r.rows[0]) });
  } catch (e: any) { logger.error({ err: e?.message }, "entity pause"); return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/admin/entity-status/:type/:id  { suspended, reason }
router.put("/admin/entity-status/:type/:id", writeLimiter, async (req: Request, res: Response) => {
  const type = String(req.params.type), id = Number(req.params.id);
  if (!ENTITIES[type]) return res.status(400).json({ error: "نوع غير معروف" });
  const u = await sessionUser(req);
  if (!(await canModerate(u, type))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureEntityStatusDb();
    const suspended = !!req.body?.suspended;
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if (suspended && reason.length < 5) return res.status(400).json({ error: "اكتب سبب الإيقاف (المخالفة) ليظهر لصاحب المنشأة" });
    const r = await query(
      `INSERT INTO entity_status (entity_type, entity_id, suspended, suspend_reason, suspended_by, suspended_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,CASE WHEN $3 THEN NOW() END,NOW())
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET suspended=$3, suspend_reason=$4, suspended_by=$5,
         suspended_at=CASE WHEN $3 THEN NOW() ELSE NULL END, updated_at=NOW() RETURNING *`,
      [type, id, suspended, suspended ? reason : null, u!.id]);
    logger.info({ type, id, suspended, by: u!.id }, "[entity] moderation");
    return res.json({ status: view(r.rows[0]) });
  } catch (e: any) { logger.error({ err: e?.message }, "entity suspend"); return res.status(500).json({ error: "Server error" }); }
});

// DELETE /api/admin/entity/:type/:id — حذف نهائي (مدير التطبيق فقط)
router.delete("/admin/entity/:type/:id", async (req: Request, res: Response) => {
  const type = String(req.params.type), id = Number(req.params.id);
  const cfg = ENTITIES[type];
  if (!cfg) return res.status(400).json({ error: "نوع غير معروف" });
  const u = await sessionUser(req);
  if (u?.role !== "admin") return res.status(403).json({ error: "الحذف النهائي لمدير التطبيق فقط" });
  try {
    const r = await query(`DELETE FROM ${cfg.table} WHERE id=$1 RETURNING ${cfg.nameCol} AS name`, [id]);
    await query(`DELETE FROM entity_status WHERE entity_type=$1 AND entity_id=$2`, [type, id]).catch(() => {});
    if (!r.rows.length) return res.status(404).json({ error: "غير موجود" });
    logger.info({ type, id, by: u.id }, "[entity] deleted");
    return res.json({ ok: true, deleted: r.rows[0].name });
  } catch (e: any) { logger.error({ err: e?.message }, "entity delete"); return res.status(500).json({ error: "تعذّر الحذف — قد تكون مرتبطة ببيانات أخرى" }); }
});

// GET /api/admin/entities?type=food&q= — قائمة الإشراف مع الحالة
router.get("/admin/entities", async (req: Request, res: Response) => {
  const type = String(req.query.type || "");
  const cfg = ENTITIES[type];
  if (!cfg) return res.status(400).json({ error: "نوع غير معروف" });
  const u = await sessionUser(req);
  if (!(await canModerate(u, type))) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureEntityStatusDb();
    const q = String(req.query.q || "").trim().slice(0, 60);
    const r = await query(
      `SELECT t.id, t.${cfg.nameCol} AS name, es.suspended, es.suspend_reason, es.paused, es.pause_message, es.resume_at
         FROM ${cfg.table} t LEFT JOIN entity_status es ON es.entity_type=$1 AND es.entity_id=t.id
        WHERE ($2='' OR t.${cfg.nameCol} ILIKE '%' || $2 || '%')
        ORDER BY es.suspended DESC NULLS LAST, t.id DESC LIMIT 200`, [type, q]).catch(() => ({ rows: [] as any[] }));
    return res.json({ items: r.rows.map((x: any) => ({ id: x.id, name: x.name, ...view(x), suspend_reason: x.suspend_reason })), types: Object.fromEntries(Object.entries(ENTITIES).map(([k, v]) => [k, v.label])) });
  } catch (e: any) { logger.error({ err: e?.message }, "admin entities"); return res.status(500).json({ error: "Server error" }); }
});

export default router;
