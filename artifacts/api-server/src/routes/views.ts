// ════════════════════════════════════════════════════════════════
// 👁️ عدّاد المشاهدات الموحّد لكل الأقسام
// مشاهدة واحدة لكل زائر لكل عنصر في اليوم (الحساب، أو بصمة الجهاز/العنوان مُجزّأة)
// حتى لا يُضخَّم العدد بالتحديث المتكرر. العدد التراكمي في content_view_counts.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";

const router = Router();

/** الأقسام المسموح بعدّ مشاهداتها (مفتاح نصي ثابت لكل قسم) */
export const VIEW_KINDS = new Set([
  "social_post", "city_news", "job", "ad", "market", "rental", "missing", "event", "greeting", "honored", "report",
  "contest", "store", "restaurant", "lawyer", "specialist", "organization", "community", "women_service", "men_service",
  "union", "farmer", "factory", "sports_club", "culture", "occasion", "travel", "zawajil", "srcs_announcement",
  "srcs_activity", "volunteer_task", "landmark", "telecom", "merchant", "product", "ithraa", "lit_text", "press_post",
]);

let ready: Promise<void> | null = null;
export function ensureViewsDb(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS content_views (
      kind VARCHAR(24) NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      viewer_key CHAR(24) NOT NULL,
      day DATE NOT NULL DEFAULT CURRENT_DATE,
      PRIMARY KEY (kind, item_id, viewer_key, day)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS content_view_counts (
      kind VARCHAR(24) NOT NULL,
      item_id VARCHAR(64) NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (kind, item_id)
    )`);
  })().catch((e) => { ready = null; throw e; }));
}

const validId = (v: unknown) => /^[A-Za-z0-9_-]{1,64}$/.test(String(v ?? ""));

async function viewerKey(req: Request): Promise<string> {
  const u = await sessionUser(req).catch(() => null);
  const device = String(req.headers["x-device-id"] || req.body?.device_id || "").slice(0, 120);
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const raw = u ? `u:${u.id}` : device ? `d:${device}` : `ip:${ip}|${String(req.headers["user-agent"] || "").slice(0, 80)}`;
  return createHash("sha256").update(`views:${raw}`).digest("hex").slice(0, 24);
}

// POST /api/views/:kind/:id — تسجيل مشاهدة (مرة يومياً لكل زائر) وإرجاع العدد
router.post("/views/:kind/:id", async (req: Request, res: Response) => {
  try {
    const kind = String(req.params.kind); const id = String(req.params.id);
    if (!VIEW_KINDS.has(kind) || !validId(id)) return res.status(400).json({ error: "قسم غير صالح" });
    await ensureViewsDb();
    const key = await viewerKey(req);
    const ins = await query(`INSERT INTO content_views (kind, item_id, viewer_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`, [kind, id, key]);
    let count: number;
    if (ins.rowCount) {
      const r = await query(
        `INSERT INTO content_view_counts (kind, item_id, count) VALUES ($1,$2,1)
         ON CONFLICT (kind, item_id) DO UPDATE SET count = content_view_counts.count + 1, updated_at = NOW() RETURNING count`, [kind, id]);
      count = r.rows[0].count;
    } else {
      count = (await query(`SELECT count FROM content_view_counts WHERE kind=$1 AND item_id=$2`, [kind, id])).rows[0]?.count ?? 0;
    }
    return res.json({ count, counted: !!ins.rowCount });
  } catch (err) { logger.warn({ err }, "views/record"); return res.json({ count: 0 }); }
});

// POST /api/views/batch { kind, ids } — تسجيل ظهور عدة منشورات معروضة كاملة في القائمة دفعة واحدة
router.post("/views/batch", async (req: Request, res: Response) => {
  try {
    const kind = String(req.body?.kind || "");
    if (!VIEW_KINDS.has(kind)) return res.status(400).json({ error: "قسم غير صالح" });
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).filter(validId).slice(0, 100);
    if (!ids.length) return res.json({ counts: {} });
    await ensureViewsDb();
    const key = await viewerKey(req);
    const ins = await query(
      `INSERT INTO content_views (kind, item_id, viewer_key) SELECT $1, x, $3 FROM UNNEST($2::text[]) AS x ON CONFLICT DO NOTHING RETURNING item_id`, [kind, ids, key]);
    const fresh = ins.rows.map((r: any) => r.item_id);
    if (fresh.length) {
      await query(
        `INSERT INTO content_view_counts (kind, item_id, count) SELECT $1, x, 1 FROM UNNEST($2::text[]) AS x
         ON CONFLICT (kind, item_id) DO UPDATE SET count = content_view_counts.count + 1, updated_at = NOW()`, [kind, fresh]);
    }
    const { rows } = await query(`SELECT item_id, count FROM content_view_counts WHERE kind=$1 AND item_id = ANY($2::text[])`, [kind, ids]);
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.item_id] = r.count;
    return res.json({ counts });
  } catch (err) { logger.warn({ err }, "views/batch"); return res.json({ counts: {} }); }
});

// GET /api/views/counts?kind=x&ids=1,2,3 — أعداد مجمّعة للقوائم
router.get("/views/counts", async (req: Request, res: Response) => {
  try {
    const kind = String(req.query.kind || "");
    if (!VIEW_KINDS.has(kind)) return res.status(400).json({ error: "قسم غير صالح" });
    const ids = String(req.query.ids || "").split(",").map((s) => s.trim()).filter(validId).slice(0, 200);
    if (!ids.length) return res.json({ counts: {} });
    await ensureViewsDb();
    const { rows } = await query(`SELECT item_id, count FROM content_view_counts WHERE kind=$1 AND item_id = ANY($2::text[])`, [kind, ids]);
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.item_id] = r.count;
    return res.json({ counts });
  } catch (err) { logger.warn({ err }, "views/counts"); return res.json({ counts: {} }); }
});

export default router;
