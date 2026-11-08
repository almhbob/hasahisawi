// ════════════════════════════════════════════════════════════════
// منشورات السوق: الأسر المنتجة · المزاد · النجارة
// كانت تُحفظ على جهاز الناشر فقط (فلا يراها غيره ولا تستطيع الإدارة حذفها)؛
// صارت مشتركة في قاعدة البيانات: الناشر يعدّل/يحذف منشوره، والإدارة ومشرف السوق يحذفان أي منشور.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { query, sessionUser, type SessionUser } from "../lib/shared-db";
import { logger } from "../lib/logger";

const router = Router();

type Kind = "family" | "auction" | "carpentry";
const KINDS: Kind[] = ["family", "auction", "carpentry"];

/** الحقول المسموحة لكل نوع (كل ما عداها يُهمل) */
const FIELDS: Record<Kind, string[]> = {
  family: ["sellerName", "category", "itemName", "description", "price", "contactPhone", "imageUrl", "images"],
  auction: ["sellerName", "itemName", "condition", "category", "description", "price", "contactPhone", "imageUrl", "images"],
  carpentry: ["shopName", "ownerName", "specialty", "productName", "description", "priceFrom", "priceTo", "contactPhone", "location", "imageUrl", "images"],
};
const REQUIRED: Record<Kind, string[]> = {
  family: ["itemName", "contactPhone"],
  auction: ["itemName", "contactPhone"],
  carpentry: ["shopName", "contactPhone"],
};
const STATUSES: Record<Kind, string[]> = {
  family: ["available", "sold"],
  auction: ["available", "sold"],
  carpentry: ["available", "unavailable"],
};

let ready: Promise<void> | null = null;
export function ensureMarketPostsDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS market_posts (
        id               SERIAL PRIMARY KEY,
        kind             VARCHAR(12) NOT NULL,
        user_id          INTEGER,
        data             JSONB NOT NULL DEFAULT '{}'::jsonb,
        status           VARCHAR(12) NOT NULL DEFAULT 'available',
        interested_count INTEGER NOT NULL DEFAULT 0,
        legacy_id        VARCHAR(60),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await query(`CREATE INDEX IF NOT EXISTS market_posts_kind_idx ON market_posts(kind, created_at DESC)`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS market_posts_legacy_uq ON market_posts(user_id, legacy_id) WHERE legacy_id IS NOT NULL`);
    await query(`
      CREATE TABLE IF NOT EXISTS market_post_interest (
        post_id INTEGER NOT NULL REFERENCES market_posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, user_id)
      )`);
  })().catch((e) => { ready = null; throw e; }));
}

/** إدارة التطبيق، أو مشرف لديه صلاحية «السوق والتجار والمتاجر» */
export async function canModerateMarket(u: SessionUser | null): Promise<boolean> {
  if (!u) return false;
  if (u.role === "admin") return true;
  if (u.role !== "moderator") return false;
  const r = await query(`SELECT 1 FROM moderator_permissions WHERE user_id=$1 AND section='merchants_admin' LIMIT 1`, [u.id])
    .catch(() => ({ rows: [] as any[] }));
  return r.rows.length > 0;
}

function clean(kind: Kind, body: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS[kind]) {
    const v = body?.[f];
    if (v == null) continue;
    if (f === "images") { if (Array.isArray(v)) out[f] = v.filter((x) => typeof x === "string" && /^https?:\/\//.test(x)).slice(0, 6); continue; }
    if (f === "imageUrl") { if (typeof v === "string" && /^https?:\/\//.test(v)) out[f] = v.slice(0, 600); continue; }
    out[f] = String(v).trim().slice(0, f === "description" ? 2000 : 200);
  }
  return out;
}

function toClient(row: any, me: SessionUser | null, mod: boolean) {
  const own = !!me && row.user_id === me.id;
  return {
    ...(row.data || {}),
    id: String(row.id),
    kind: row.kind,
    status: row.status,
    interestedCount: row.interested_count,
    createdAt: row.created_at,
    canEdit: own,
    canDelete: own || mod,
  };
}

// GET /api/market/posts?kind=family|auction|carpentry
router.get("/market/posts", async (req: Request, res: Response) => {
  try {
    await ensureMarketPostsDb();
    const me = await sessionUser(req);
    const mod = await canModerateMarket(me);
    const kind = String(req.query.kind || "");
    const params: unknown[] = [];
    let where = "TRUE";
    if (KINDS.includes(kind as Kind)) { params.push(kind); where = `kind=$1`; }
    const r = await query(`SELECT * FROM market_posts WHERE ${where} ORDER BY created_at DESC LIMIT 300`, params);
    return res.json({ posts: r.rows.map((x: any) => toClient(x, me, mod)), can_moderate: mod });
  } catch (err) {
    logger.error({ err }, "market/posts list");
    return res.status(500).json({ error: "تعذّر تحميل المنشورات" });
  }
});

// POST /api/market/posts  { kind, ...fields, legacy_id? }
router.post("/market/posts", async (req: Request, res: Response) => {
  try {
    await ensureMarketPostsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "يجب تسجيل الدخول للنشر في السوق" });
    if (me.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    const kind = String(req.body?.kind || "") as Kind;
    if (!KINDS.includes(kind)) return res.status(400).json({ error: "نوع المنشور غير معروف" });
    const data = clean(kind, req.body);
    const missing = REQUIRED[kind].filter((f) => !data[f]);
    if (missing.length) return res.status(400).json({ error: "أكمل البيانات المطلوبة" });
    const legacy = req.body?.legacy_id ? String(req.body.legacy_id).slice(0, 60) : null;
    const status = STATUSES[kind].includes(String(req.body?.status)) ? String(req.body.status) : "available";
    // نقل منشورات قديمة محفوظة على الجهاز: لا تُكرَّر إن أُرسلت مرتين
    const r = await query(
      `INSERT INTO market_posts (kind, user_id, data, status, legacy_id) VALUES ($1,$2,$3::jsonb,$4,$5)
       ON CONFLICT (user_id, legacy_id) WHERE legacy_id IS NOT NULL DO NOTHING RETURNING *`,
      [kind, me.id, JSON.stringify(data), status, legacy]);
    if (!r.rows[0]) return res.json({ ok: true, duplicate: true });
    return res.json({ post: toClient(r.rows[0], me, await canModerateMarket(me)) });
  } catch (err) {
    logger.error({ err }, "market/posts create");
    return res.status(500).json({ error: "تعذّر النشر" });
  }
});

// PATCH /api/market/posts/:id  { status } — الناشر أو الإدارة
router.patch("/market/posts/:id", async (req: Request, res: Response) => {
  try {
    await ensureMarketPostsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    const row = (await query(`SELECT * FROM market_posts WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!row) return res.status(404).json({ error: "غير موجود" });
    const mod = await canModerateMarket(me);
    if (row.user_id !== me.id && !mod) return res.status(403).json({ error: "غير مصرح" });
    const status = String(req.body?.status || "");
    if (!STATUSES[row.kind as Kind]?.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const r = await query(`UPDATE market_posts SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [status, row.id]);
    return res.json({ post: toClient(r.rows[0], me, mod) });
  } catch { return res.status(500).json({ error: "تعذّر التحديث" }); }
});

// POST /api/market/posts/:id/interest — «مهتم» مرة واحدة لكل مستخدم
router.post("/market/posts/:id/interest", async (req: Request, res: Response) => {
  try {
    await ensureMarketPostsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    const ins = await query(`INSERT INTO market_post_interest (post_id, user_id) SELECT id, $2 FROM market_posts WHERE id=$1 ON CONFLICT DO NOTHING`,
      [Number(req.params.id), me.id]);
    if (ins.rowCount) await query(`UPDATE market_posts SET interested_count=interested_count+1 WHERE id=$1`, [Number(req.params.id)]);
    const r = await query(`SELECT interested_count FROM market_posts WHERE id=$1`, [Number(req.params.id)]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجود" });
    return res.json({ interestedCount: r.rows[0].interested_count, already: !ins.rowCount });
  } catch { return res.status(500).json({ error: "تعذّر التسجيل" }); }
});

// DELETE /api/market/posts/:id — الناشر، أو الإدارة/مشرف السوق لأي منشور
router.delete("/market/posts/:id", async (req: Request, res: Response) => {
  try {
    await ensureMarketPostsDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    const row = (await query(`SELECT id, user_id, kind FROM market_posts WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!row) return res.status(404).json({ error: "غير موجود" });
    const mod = await canModerateMarket(me);
    if (row.user_id !== me.id && !mod) return res.status(403).json({ error: "لا تملك صلاحية حذف هذا المنشور" });
    await query(`DELETE FROM market_posts WHERE id=$1`, [row.id]);
    if (row.user_id !== me.id) logger.info({ by: me.id, post: row.id, kind: row.kind }, "[market] post removed by moderator");
    return res.json({ ok: true });
  } catch { return res.status(500).json({ error: "تعذّر الحذف" }); }
});

export default router;
