// ════════════════════════════════════════════════════════════════
// 🛡️ أمان المجتمع — الإبلاغ عن المنشورات والتعليقات، وحظر المستخدمين.
// مطلوب في متجري Google Play وApp Store لأي تطبيق فيه محتوى من المستخدمين.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, dbEnabled } from "../lib/shared-db";
import { recordAdminAlert } from "./admin-alerts";

const router = Router();

export const REPORT_REASONS = ["spam", "abuse", "hate", "sexual", "violence", "false_info", "privacy", "other"] as const;
const REASON_AR: Record<string, string> = {
  spam: "إزعاج أو ترويج", abuse: "إساءة أو تنمّر", hate: "خطاب كراهية", sexual: "محتوى غير لائق",
  violence: "عنف أو تهديد", false_info: "معلومات كاذبة", privacy: "انتهاك خصوصية", other: "سبب آخر",
};

let ready: Promise<void> | null = null;
export function ensureSocialSafety(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      await query(`ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS author_id INTEGER`);
      // الردود: التطبيق يرسل parent_id منذ مدة، لكن العمود لم يكن موجوداً
      await query(`ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES social_comments(id) ON DELETE CASCADE`);
      await query(`CREATE TABLE IF NOT EXISTS social_reports (
        id SERIAL PRIMARY KEY,
        target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('post','comment')),
        target_id INTEGER NOT NULL,
        reporter_id INTEGER NOT NULL,
        reason VARCHAR(20) NOT NULL,
        details VARCHAR(500),
        status VARCHAR(12) NOT NULL DEFAULT 'pending',
        reviewed_by INTEGER,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (target_type, target_id, reporter_id)
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_social_reports_status ON social_reports(status, created_at DESC)`);
      await query(`CREATE TABLE IF NOT EXISTS user_blocks (
        blocker_id INTEGER NOT NULL,
        blocked_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (blocker_id, blocked_id)
      )`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** معرّفات من حظرهم المستخدم أو حظروه — لإخفاء محتواهم من الطرفين. */
export async function hiddenAuthorIds(viewerId: number | null | undefined): Promise<number[]> {
  if (!viewerId || !dbEnabled) return [];
  try {
    await ensureSocialSafety();
    const r = await query(
      `SELECT blocked_id AS id FROM user_blocks WHERE blocker_id=$1
       UNION SELECT blocker_id AS id FROM user_blocks WHERE blocked_id=$1`, [viewerId]);
    return r.rows.map((x: any) => Number(x.id));
  } catch (err) {
    logger.warn({ err }, "[social-safety] hiddenAuthorIds failed");
    return [];
  }
}

async function report(req: Request, res: Response, type: "post" | "comment") {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول للإبلاغ" });
    await ensureSocialSafety();
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: "معرّف غير صالح" });
    const reason = String(req.body?.reason || "");
    if (!(REPORT_REASONS as readonly string[]).includes(reason)) return res.status(400).json({ error: "اختر سبب البلاغ" });
    const details = String(req.body?.details || "").trim().slice(0, 500) || null;

    const table = type === "post" ? "social_posts" : "social_comments";
    const t = await query(`SELECT id, content, author_id FROM ${table} WHERE id=$1`, [targetId]);
    if (!t.rows[0]) return res.status(404).json({ error: "المحتوى غير موجود" });
    if (t.rows[0].author_id && Number(t.rows[0].author_id) === Number(me.id)) {
      return res.status(400).json({ error: "لا يمكنك الإبلاغ عن محتواك" });
    }

    const ins = await query(
      `INSERT INTO social_reports (target_type, target_id, reporter_id, reason, details)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (target_type, target_id, reporter_id) DO NOTHING RETURNING id`,
      [type, targetId, me.id, reason, details]);
    if (ins.rows[0]) {
      const snippet = String(t.rows[0].content || "").slice(0, 120);
      recordAdminAlert({
        kind: "social_report",
        title: `🚩 بلاغ عن ${type === "post" ? "منشور" : "تعليق"}: ${REASON_AR[reason]}`,
        body: snippet || "(بدون نص)",
        screen: "admin",
        path: req.originalUrl,
        refId: String(ins.rows[0].id),
      }).catch((e) => logger.warn({ err: e?.message }, "[social-safety] alert failed"));
    }
    return res.json({ success: true, already: !ins.rows[0] });
  } catch (err) {
    logger.error({ err }, "[social-safety] report");
    return res.status(500).json({ error: "تعذّر إرسال البلاغ" });
  }
}

router.post("/posts/:id/report", (req, res) => report(req, res, "post"));
router.post("/comments/:id/report", (req, res) => report(req, res, "comment"));

// ── الحظر ────────────────────────────────────────────────────────
router.post("/users/:id/block", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const target = Number(req.params.id);
    if (!Number.isInteger(target) || target <= 0) return res.status(400).json({ error: "معرّف غير صالح" });
    if (target === Number(me.id)) return res.status(400).json({ error: "لا يمكنك حظر نفسك" });
    await ensureSocialSafety();
    const u = await query(`SELECT id FROM users WHERE id=$1`, [target]);
    if (!u.rows[0]) return res.status(404).json({ error: "المستخدم غير موجود" });
    await query(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [me.id, target]);
    // الحظر يلغي المتابعة في الاتجاهين (الجدول قد لا يكون أُنشئ بعد)
    await query(`DELETE FROM user_follows WHERE (follower_id=$1 AND followee_id=$2) OR (follower_id=$2 AND followee_id=$1)`, [me.id, target])
      .catch(() => {});
    return res.json({ success: true, blocked: true });
  } catch (err) {
    logger.error({ err }, "[social-safety] block");
    return res.status(500).json({ error: "تعذّر الحظر" });
  }
});

router.delete("/users/:id/block", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    await ensureSocialSafety();
    await query(`DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2`, [me.id, Number(req.params.id)]);
    return res.json({ success: true, blocked: false });
  } catch (err) {
    logger.error({ err }, "[social-safety] unblock");
    return res.status(500).json({ error: "تعذّر إلغاء الحظر" });
  }
});

router.get("/me/blocks", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    await ensureSocialSafety();
    const r = await query(
      `SELECT u.id, u.name, u.avatar_url, b.created_at
         FROM user_blocks b JOIN users u ON u.id=b.blocked_id
        WHERE b.blocker_id=$1 ORDER BY b.created_at DESC`, [me.id]);
    return res.json(r.rows);
  } catch (err) {
    logger.error({ err }, "[social-safety] list blocks");
    return res.status(500).json({ error: "تعذّر التحميل" });
  }
});

// ── مراجعة البلاغات (الإدارة) ───────────────────────────────────
router.get("/admin/social-reports", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "غير مصرح" });
    await ensureSocialSafety();
    const status = String(req.query.status || "pending");
    const r = await query(
      `SELECT r.target_type, r.target_id,
              COUNT(*)::int AS reports_count,
              MIN(r.id) AS first_report_id,
              MAX(r.created_at) AS last_reported_at,
              ARRAY_AGG(DISTINCT r.reason) AS reasons,
              ARRAY_REMOVE(ARRAY_AGG(r.details), NULL) AS details,
              COALESCE(p.content, c.content) AS content,
              COALESCE(p.author_name, c.author_name) AS author_name,
              COALESCE(p.author_id, c.author_id) AS author_id,
              p.image_url
         FROM social_reports r
         LEFT JOIN social_posts p ON r.target_type='post' AND p.id=r.target_id
         LEFT JOIN social_comments c ON r.target_type='comment' AND c.id=r.target_id
        WHERE r.status=$1
        GROUP BY r.target_type, r.target_id, p.content, c.content, p.author_name, c.author_name, p.author_id, c.author_id, p.image_url
        ORDER BY reports_count DESC, last_reported_at DESC
        LIMIT 100`, [status]);
    return res.json(r.rows);
  } catch (err) {
    logger.error({ err }, "[social-safety] admin list");
    return res.status(500).json({ error: "تعذّر التحميل" });
  }
});

/** action: "remove" يحذف المحتوى، "dismiss" يرفض البلاغات ويُبقيه. */
router.post("/admin/social-reports/resolve", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "غير مصرح" });
    await ensureSocialSafety();
    const type = String(req.body?.target_type);
    const id = Number(req.body?.target_id);
    const action = String(req.body?.action);
    if (!["post", "comment"].includes(type) || !Number.isInteger(id) || !["remove", "dismiss"].includes(action)) {
      return res.status(400).json({ error: "طلب غير صالح" });
    }
    if (action === "remove") {
      await query(`DELETE FROM ${type === "post" ? "social_posts" : "social_comments"} WHERE id=$1`, [id]);
    }
    await query(
      `UPDATE social_reports SET status=$1, reviewed_by=$2, reviewed_at=NOW()
        WHERE target_type=$3 AND target_id=$4 AND status='pending'`,
      [action === "remove" ? "removed" : "dismissed", me!.id, type, id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "[social-safety] resolve");
    return res.status(500).json({ error: "تعذّر التنفيذ" });
  }
});

export default router;
