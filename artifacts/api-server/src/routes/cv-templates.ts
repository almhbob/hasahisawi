// إعدادات قوالب السيرة الذاتية + إحصاءات الاستخدام.
// الإدارة تتحكم في ظهور كل قالب، ومستواه (مجاني/مميز)، وسعره، وترتيبه، وشارته.
// الإحصاءات: معاينة (مرة يومياً لكل جهاز) / اختيار / تصدير / طلب — مع طلبات وموافقات القوالب المميزة.
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();

/** القيم الافتراضية — مطابقة لسجلّ القوالب في التطبيق (lib/cv-templates.ts) */
export const CV_TEMPLATE_DEFAULTS: { id: string; tier: "free" | "premium"; badge: string | null }[] = [
  { id: "nile", tier: "free", badge: null }, { id: "band", tier: "free", badge: null },
  { id: "editorial", tier: "free", badge: null }, { id: "cards", tier: "free", badge: null },
  { id: "ats", tier: "free", badge: null }, { id: "hexa", tier: "premium", badge: "مطوّر" },
  { id: "diagonal", tier: "premium", badge: null }, { id: "accent", tier: "premium", badge: null },
  { id: "arch", tier: "premium", badge: null }, { id: "bold", tier: "free", badge: null },
  { id: "mustard", tier: "premium", badge: "جديد" }, { id: "wave", tier: "premium", badge: "جديد" },
  { id: "mono", tier: "free", badge: "جديد" }, { id: "calm", tier: "premium", badge: "جديد" },
  { id: "sadu", tier: "premium", badge: "جديد" }, { id: "swiss", tier: "free", badge: "جديد" },
  { id: "magazine", tier: "premium", badge: "جديد" }, { id: "rings", tier: "premium", badge: "جديد" },
];
const KNOWN = new Set(CV_TEMPLATE_DEFAULTS.map((x) => x.id));
const EVENTS = ["preview", "select", "export", "request"] as const;
type Ev = (typeof EVENTS)[number];
/** شارة تلقائية لأكثر قالب طلباً (حين لا توجد شارة يدوية) */
export const AUTO_BADGE = "الأكثر طلباً";
const AUTO_BADGE_MIN = 5;

let ready: Promise<void> | null = null;
export function ensureCvTemplatesDb(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS cv_template_settings (
      template_id VARCHAR(20) PRIMARY KEY,
      visible BOOLEAN NOT NULL DEFAULT TRUE,
      tier VARCHAR(10) NOT NULL DEFAULT 'free',
      price NUMERIC(12,2),
      sort_order INTEGER NOT NULL DEFAULT 0,
      badge VARCHAR(30),
      updated_by INTEGER,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS cv_template_events (
      id BIGSERIAL PRIMARY KEY,
      template_id VARCHAR(20) NOT NULL,
      event VARCHAR(10) NOT NULL,
      user_id INTEGER,
      device_id VARCHAR(80),
      dedupe_key VARCHAR(160),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cv_tpl_ev_dedupe ON cv_template_events (dedupe_key)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_cv_tpl_ev ON cv_template_events (template_id, event, created_at)`);
    // البذر من القيم الافتراضية — لا يكتب فوق ما عدّلته الإدارة
    for (let i = 0; i < CV_TEMPLATE_DEFAULTS.length; i++) {
      const d = CV_TEMPLATE_DEFAULTS[i];
      await query(`INSERT INTO cv_template_settings (template_id, tier, sort_order, badge) VALUES ($1,$2,$3,$4) ON CONFLICT (template_id) DO NOTHING`,
        [d.id, d.tier, (i + 1) * 10, d.badge]);
    }
  })().catch((e) => { ready = null; throw e; }));
}

const isAdmin = (u: { role?: string } | null) => !!u && u.role === "admin";

async function pricingVisible(): Promise<boolean> {
  try {
    const r = await query(`SELECT value FROM admin_settings WHERE key='pricing_visible'`);
    return r.rows[0]?.value === "true";
  } catch { return false; }
}

/** معرّفات القوالب المميزة حالياً (من إعدادات الإدارة) */
export async function premiumTemplateIds(): Promise<string[]> {
  if (!dbEnabled) return CV_TEMPLATE_DEFAULTS.filter((x) => x.tier === "premium").map((x) => x.id);
  await ensureCvTemplatesDb();
  const r = await query(`SELECT template_id FROM cv_template_settings WHERE tier='premium'`);
  return r.rows.map((x: any) => x.template_id);
}

/** أكثر قالب استخداماً (اختيار + تصدير + طلب) خلال 30 يوماً */
async function topTemplate(): Promise<string | null> {
  const r = await query(`SELECT template_id, COUNT(*)::int AS n FROM cv_template_events
    WHERE event IN ('select','export','request') AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY template_id ORDER BY n DESC LIMIT 1`);
  const row = r.rows[0];
  return row && row.n >= AUTO_BADGE_MIN ? row.template_id : null;
}

async function settingsRows(includeHidden: boolean) {
  await ensureCvTemplatesDb();
  const r = await query(`SELECT template_id, visible, tier, price, sort_order, badge, updated_at FROM cv_template_settings
    ${includeHidden ? "" : "WHERE visible"} ORDER BY sort_order, template_id`);
  return r.rows.filter((x: any) => KNOWN.has(x.template_id));
}

// GET /api/cv/templates → قائمة القوالب الظاهرة بمستواها وشارتها (والسعر إن كان إظهار الأسعار مفعّلاً)
router.get("/cv/templates", async (_req: Request, res: Response) => {
  try {
    if (!dbEnabled) return res.json({ templates: CV_TEMPLATE_DEFAULTS.map((d, i) => ({ id: d.id, tier: d.tier, badge: d.badge, sort_order: i })), pricing_visible: false });
    const [rows, pv, top] = await Promise.all([settingsRows(false), pricingVisible(), topTemplate().catch(() => null)]);
    res.set("Cache-Control", "public, max-age=60");
    return res.json({
      pricing_visible: pv,
      templates: rows.map((x: any) => ({
        id: x.template_id, tier: x.tier, sort_order: x.sort_order,
        badge: x.badge || (x.template_id === top ? AUTO_BADGE : null),
        ...(pv && x.tier === "premium" && x.price != null ? { price: Number(x.price) } : {}),
      })),
    });
  } catch (err) { logger.error({ err }, "cv/templates"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/cv/templates/:id/event { event, device_id? }
router.post("/cv/templates/:id/event", writeLimiter, async (req: Request, res: Response) => {
  try {
    const tid = String(req.params.id || "");
    const ev = String(req.body?.event || "") as Ev;
    if (!KNOWN.has(tid)) return res.status(400).json({ error: "قالب غير معروف" });
    if (!EVENTS.includes(ev)) return res.status(400).json({ error: "حدث غير معروف" });
    if (!dbEnabled) return res.json({ ok: true, recorded: false });
    await ensureCvTemplatesDb();
    const me = await sessionUser(req).catch(() => null);
    const dev = String(req.body?.device_id || req.headers["x-device-id"] || "").trim().slice(0, 80) || null;
    const who = me ? `u${me.id}` : dev ? `d${dev}` : null;
    // المعاينة تُحسب مرة يومياً لكل جهاز/مستخدم
    const dedupe = ev === "preview" && who ? `${tid}:${who}:${new Date().toISOString().slice(0, 10)}` : null;
    const r = await query(`INSERT INTO cv_template_events (template_id, event, user_id, device_id, dedupe_key) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`, [tid, ev, me?.id ?? null, dev, dedupe]);
    return res.json({ ok: true, recorded: !!r.rows[0] });
  } catch (err) { logger.error({ err }, "cv/templates/event"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/cv/templates → كل القوالب (مع المخفية) + الإحصاءات
router.get("/admin/cv/templates", async (req: Request, res: Response) => {
  try {
    if (!isAdmin(await sessionUser(req))) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const [rows, pv, stats, top] = await Promise.all([settingsRows(true), pricingVisible(), computeStats(), topTemplate().catch(() => null)]);
    return res.json({
      pricing_visible: pv, auto_badge: AUTO_BADGE, auto_badge_template: top,
      templates: rows.map((x: any) => ({ id: x.template_id, visible: x.visible, tier: x.tier, price: x.price == null ? null : Number(x.price), sort_order: x.sort_order, badge: x.badge, updated_at: x.updated_at })),
      stats,
    });
  } catch (err) { logger.error({ err }, "admin/cv/templates"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/cv/templates/stats
router.get("/admin/cv/templates/stats", async (req: Request, res: Response) => {
  try {
    if (!isAdmin(await sessionUser(req))) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    return res.json({ stats: await computeStats() });
  } catch (err) { logger.error({ err }, "admin/cv/templates/stats"); return res.status(500).json({ error: "Server error" }); }
});

type Win = { d7: number; d30: number; all: number };
type TplStats = { preview: Win; select: Win; export: Win; request: Win; approved: Win };
async function computeStats(): Promise<Record<string, TplStats>> {
  await ensureCvTemplatesDb();
  const zero = (): TplStats => ({ preview: { d7: 0, d30: 0, all: 0 }, select: { d7: 0, d30: 0, all: 0 }, export: { d7: 0, d30: 0, all: 0 }, request: { d7: 0, d30: 0, all: 0 }, approved: { d7: 0, d30: 0, all: 0 } });
  const out: Record<string, TplStats> = {};
  for (const d of CV_TEMPLATE_DEFAULTS) out[d.id] = zero();
  const put = (tid: string, k: keyof TplStats, row: any) => {
    if (!out[tid]) return;
    out[tid][k] = { d7: Number(row.d7) || 0, d30: Number(row.d30) || 0, all: Number(row.all_) || 0 };
  };
  const ev = await query(`SELECT template_id, event,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS d7,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS d30,
      COUNT(*) AS all_
    FROM cv_template_events WHERE event IN ('preview','select','export') GROUP BY template_id, event`);
  for (const r of ev.rows) put(r.template_id, r.event, r);
  // الطلبات والموافقات من جدول طلبات القوالب المميزة (مصدر الحقيقة)
  try {
    const rq = await query(`SELECT template_id,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS d7,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS d30,
        COUNT(*) AS all_ FROM cv_premium_requests GROUP BY template_id`);
    for (const r of rq.rows) put(r.template_id, "request", r);
    const ap = await query(`SELECT template_id,
        COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '7 days') AS d7,
        COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '30 days') AS d30,
        COUNT(*) AS all_ FROM cv_premium_requests WHERE status='approved' GROUP BY template_id`);
    for (const r of ap.rows) put(r.template_id, "approved", r);
  } catch { /* الجدول غير موجود بعد */ }
  return out;
}

// PATCH /api/admin/cv/templates/:id { visible?, tier?, price?, badge?, sort_order? }
router.patch("/admin/cv/templates/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isAdmin(me)) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const tid = String(req.params.id || "");
    if (!KNOWN.has(tid)) return res.status(404).json({ error: "قالب غير معروف" });
    await ensureCvTemplatesDb();
    const b = req.body || {};
    const sets: string[] = []; const vals: unknown[] = [];
    const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (b.visible !== undefined) add("visible", !!b.visible);
    if (b.tier !== undefined) {
      if (!["free", "premium"].includes(String(b.tier))) return res.status(400).json({ error: "المستوى يجب أن يكون free أو premium" });
      add("tier", String(b.tier));
    }
    if (b.price !== undefined) {
      if (b.price === null || b.price === "") add("price", null);
      else {
        const n = Number(b.price);
        if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return res.status(400).json({ error: "سعر غير صالح" });
        add("price", n);
      }
    }
    if (b.badge !== undefined) add("badge", b.badge == null ? null : String(b.badge).trim().slice(0, 30) || null);
    if (b.sort_order !== undefined) {
      const n = Math.round(Number(b.sort_order));
      if (!Number.isFinite(n)) return res.status(400).json({ error: "ترتيب غير صالح" });
      add("sort_order", n);
    }
    if (!sets.length) return res.status(400).json({ error: "لا توجد تغييرات" });
    add("updated_by", me!.id);
    vals.push(tid);
    const r = await query(`UPDATE cv_template_settings SET ${sets.join(", ")}, updated_at=NOW() WHERE template_id=$${vals.length}
      RETURNING template_id AS id, visible, tier, price, sort_order, badge`, vals);
    const row = r.rows[0];
    return res.json({ ok: true, template: { ...row, price: row.price == null ? null : Number(row.price) } });
  } catch (err) { logger.error({ err }, "admin/cv/templates patch"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/cv/templates/reorder { ids: string[] } — ترتيب جماعي
router.post("/admin/cv/templates/reorder", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isAdmin(me)) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter((x: string) => KNOWN.has(x)) : [];
    if (!ids.length) return res.status(400).json({ error: "قائمة الترتيب فارغة" });
    await ensureCvTemplatesDb();
    for (let i = 0; i < ids.length; i++) {
      await query(`UPDATE cv_template_settings SET sort_order=$1, updated_by=$2, updated_at=NOW() WHERE template_id=$3`, [(i + 1) * 10, me!.id, ids[i]]);
    }
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "admin/cv/templates reorder"); return res.status(500).json({ error: "Server error" }); }
});

export default router;
