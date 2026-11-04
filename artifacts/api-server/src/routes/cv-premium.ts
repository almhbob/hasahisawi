// قوالب السيرة الذاتية المميزة — طلب فتح القالب يراجعه المسؤول.
// المستخدم يطلب القالب (مع ملاحظة/مرجع دفع اختياري) → يظهر للإدارة → عند الموافقة يُفتح له
// القالب (أو كل القوالب المميزة) للتحميل بلا علامة «معاينة». الإدارة لها كل القوالب مفتوحة.
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import cvTemplatesRouter, { ensureCvTemplatesDb, premiumTemplateIds } from "./cv-templates";

const router = Router();
// إعدادات القوالب وإحصاءاتها (المستوى المجاني/المميز تحدده الإدارة من هناك)
router.use(cvTemplatesRouter);
const ALL = "all";

let ready: Promise<void> | null = null;
export function ensureCvPremiumDb(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS cv_premium_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_id VARCHAR(20) NOT NULL,
      note VARCHAR(300),
      payment_ref VARCHAR(80),
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      admin_note VARCHAR(300),
      reviewed_by INTEGER,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_cv_premium_user ON cv_premium_requests (user_id, status)`);
    await ensureCvTemplatesDb();
  })().catch((e) => { ready = null; throw e; }));
}

const clean = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const isAdmin = (u: { role?: string } | null) => !!u && u.role === "admin";

async function unlockedFor(userId: number): Promise<string[]> {
  const r = await query(`SELECT DISTINCT template_id FROM cv_premium_requests WHERE user_id=$1 AND status='approved'`, [userId]);
  const ids = r.rows.map((x: any) => x.template_id);
  const prem = await premiumTemplateIds();
  return ids.includes(ALL) ? prem : ids.filter((x: string) => prem.includes(x));
}

// GET /api/cv/premium/me → { unlocked, requests, all_unlocked }
router.get("/cv/premium/me", async (req: Request, res: Response) => {
  try {
    await ensureCvPremiumDb();
    const me = await sessionUser(req);
    if (!me) return res.json({ unlocked: [], requests: [], all_unlocked: false });
    if (isAdmin(me)) return res.json({ unlocked: await premiumTemplateIds(), requests: [], all_unlocked: true, is_admin: true });
    const reqs = await query(`SELECT id, template_id, status, admin_note, created_at FROM cv_premium_requests WHERE user_id=$1 ORDER BY id DESC LIMIT 30`, [me.id]);
    const unlocked = await unlockedFor(me.id);
    const prem = await premiumTemplateIds();
    // «all_unlocked» تعني موافقة شاملة تشمل أي قالب يصبح مميزاً لاحقاً
    const allApproved = reqs.rows.some((x: any) => x.template_id === ALL && x.status === "approved");
    return res.json({ unlocked, requests: reqs.rows, all_unlocked: allApproved || (prem.length > 0 && unlocked.length === prem.length) });
  } catch (err) { logger.error({ err }, "cv/premium/me"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/cv/premium/request { template_id, note?, payment_ref? }
router.post("/cv/premium/request", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureCvPremiumDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لطلب القالب" });
    const tid = String(req.body?.template_id || "");
    if (tid !== ALL && !(await premiumTemplateIds()).includes(tid)) return res.status(400).json({ error: "قالب غير معروف أو أصبح مجانياً" });
    if ((await unlockedFor(me.id)).includes(tid)) return res.json({ ok: true, status: "approved", message: "القالب مفتوح لك بالفعل" });
    const dup = await query(`SELECT id FROM cv_premium_requests WHERE user_id=$1 AND template_id=$2 AND status='pending'`, [me.id, tid]);
    if (dup.rows[0]) return res.json({ ok: true, status: "pending", message: "طلبك قيد المراجعة لدى الإدارة" });
    const r = await query(`INSERT INTO cv_premium_requests (user_id, template_id, note, payment_ref) VALUES ($1,$2,$3,$4) RETURNING id`,
      [me.id, tid, clean(req.body?.note, 300) || null, clean(req.body?.payment_ref, 80) || null]);
    return res.status(201).json({ ok: true, id: r.rows[0].id, status: "pending", message: "أُرسل طلبك — ستُفتح لك السيرة فور موافقة الإدارة" });
  } catch (err) { logger.error({ err }, "cv/premium/request"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/cv/premium/requests?status=pending|approved|rejected|all
router.get("/admin/cv/premium/requests", async (req: Request, res: Response) => {
  try {
    await ensureCvPremiumDb();
    if (!isAdmin(await sessionUser(req))) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const st = String(req.query.status || "pending");
    const r = await query(
      `SELECT c.*, u.name AS user_name, u.phone AS user_phone FROM cv_premium_requests c JOIN users u ON u.id=c.user_id
       WHERE ($1='all' OR c.status=$1) ORDER BY c.id DESC LIMIT 200`, [st]);
    return res.json({ requests: r.rows });
  } catch (err) { logger.error({ err }, "admin/cv/premium"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/cv/premium/requests/:id { action: approve|reject, note?, all? }
router.post("/admin/cv/premium/requests/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureCvPremiumDb();
    const me = await sessionUser(req);
    if (!isAdmin(me)) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const action = String(req.body?.action || "");
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "إجراء غير صالح" });
    const note = clean(req.body?.note, 300) || null;
    // all=true: الموافقة تفتح كل القوالب المميزة لهذا المستخدم
    const r = await query(
      `UPDATE cv_premium_requests SET status=$1::varchar, admin_note=$2, reviewed_by=$3, reviewed_at=NOW(),
         template_id=CASE WHEN $5::boolean AND $1::varchar='approved' THEN 'all' ELSE template_id END
       WHERE id=$4 RETURNING user_id, template_id`, [action === "approve" ? "approved" : "rejected", note, me!.id, Number(req.params.id), !!req.body?.all]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: "غير موجود" });
    await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'cv_premium',$2,$3,$4)`,
      [row.user_id, action === "approve" ? "فُتح لك قالب السيرة المميز ✨" : "بخصوص طلب قالب السيرة",
       action === "approve" ? "يمكنك الآن تحميل سيرتك بالقالب المميز بلا علامة معاينة" : (note || "لم تتم الموافقة على الطلب"),
       JSON.stringify({ screen: "cv-builder" })]).catch(() => {});
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "admin/cv/premium act"); return res.status(500).json({ error: "Server error" }); }
});

export default router;
