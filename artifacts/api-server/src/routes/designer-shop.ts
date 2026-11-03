// بوابة المصمم — ما كان ينقص الخادم ليدير المصمم متجره من التطبيق:
// تعديل بيانات المتجر، الطلبات الواردة وتحديث حالتها، وإشعار المصمم بكل طلب جديد.
// (المنتجات: /design-gallery/my-products موجودة مسبقاً في hasahisawi.ts)
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();
const clean = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
async function myMember(req: Request) {
  const u = await sessionUser(req);
  if (!u) return { u: null, m: null };
  const r = await query(`SELECT * FROM design_gallery_members WHERE user_id=$1`, [u.id]).catch(() => ({ rows: [] as any[] }));
  return { u, m: r.rows[0] || null };
}

router.patch("/design-gallery/my-shop", writeLimiter, async (req: Request, res: Response) => {
  try {
    const { u, m } = await myMember(req);
    if (!u) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (!m) return res.status(404).json({ error: "لا يوجد متجر" });
    const b = req.body || {};
    const shop = clean(b.shop_name, 120) || m.shop_name;
    const cats = Array.isArray(b.categories) ? b.categories.map((c: unknown) => clean(c, 40)).filter(Boolean).slice(0, 12) : m.categories;
    const { rows } = await query(
      `UPDATE design_gallery_members SET shop_name=$1, bio=$2, whatsapp=$3, instagram=$4, facebook=$5, categories=$6, avatar_url=COALESCE($7, avatar_url) WHERE id=$8 RETURNING *`,
      [shop, b.bio !== undefined ? clean(b.bio, 1000) || null : m.bio, b.whatsapp !== undefined ? clean(b.whatsapp, 30) || null : m.whatsapp,
       b.instagram !== undefined ? clean(b.instagram, 80) || null : m.instagram, b.facebook !== undefined ? clean(b.facebook, 200) || null : m.facebook,
       cats, /^https:\/\//.test(String(b.avatar_url || "")) ? String(b.avatar_url).slice(0, 500) : null, m.id]);
    return res.json(rows[0]);
  } catch (err) { logger.error({ err }, "designer/my-shop"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/design-gallery/my-orders", async (req: Request, res: Response) => {
  try {
    const { u, m } = await myMember(req);
    if (!u) return res.status(401).json({ error: "يجب تسجيل الدخول" });
    if (!m) return res.json({ orders: [] });
    const { rows } = await query(
      `SELECT o.*, p.title AS product_title FROM design_gallery_orders o LEFT JOIN design_gallery_products p ON p.id=o.product_id
       WHERE o.member_id=$1 ORDER BY o.created_at DESC LIMIT 200`, [m.id]);
    return res.json({ orders: rows });
  } catch (err) { logger.error({ err }, "designer/my-orders"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/design-gallery/my-orders/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    const { u, m } = await myMember(req);
    if (!u || !m) return res.status(403).json({ error: "غير مصرح" });
    const status = String(req.body?.status);
    if (!["new", "processing", "done", "cancelled"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const { rows } = await query(`UPDATE design_gallery_orders SET status=$1 WHERE id=$2 AND member_id=$3 RETURNING *`, [status, Number(req.params.id), m.id]);
    if (!rows[0]) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (err) { logger.error({ err }, "designer/order-status"); return res.status(500).json({ error: "Server error" }); }
});

/** إشعار المصمم بالطلب الجديد — يُستدعى بعد إنشاء الطلب (وسيط على المسار القائم) */
export async function notifyDesignerOfOrder(memberId: number, customer: string) {
  try {
    const r = await query(`SELECT user_id, shop_name FROM design_gallery_members WHERE id=$1`, [memberId]);
    const uid = r.rows[0]?.user_id;
    if (!uid) return;
    await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'designer_order',$2,$3,$4)`,
      [uid, "🎨 طلب تصميم جديد", `${customer} طلب من متجرك «${r.rows[0].shop_name}»`, JSON.stringify({ screen: "designer-portal" })]).catch(() => {});
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [uid]);
    if (rows.length) await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
      body: JSON.stringify(rows.map((x: any) => ({ to: x.token, title: "🎨 طلب تصميم جديد", body: customer, sound: "default", data: { screen: "designer-portal" } }))),
    }).catch(() => {});
  } catch { /* لا نعطّل الطلب */ }
}
// وسيط: بعد نجاح POST /design-gallery/orders نُشعر المصمم
router.use("/design-gallery/orders", (req: Request, res: Response, next) => {
  if (req.method !== "POST") return next();
  res.on("finish", () => {
    if (res.statusCode === 201 && Number(req.body?.member_id) > 0) void notifyDesignerOfOrder(Number(req.body.member_id), String(req.body?.customer_name || "عميل"));
  });
  next();
});

export default router;
