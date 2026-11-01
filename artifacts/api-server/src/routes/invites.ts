// ════════════════════════════════════════════════════════════════
// 🎁 الدعوات ونقاطها: لكل عضو رمز دعوة؛ حين ينضم شخص جديد برمزه تُمنح
// نقاط للداعي تلقائياً. الحماية من التلاعب:
//  - المدعو حساب جديد (أقل من 7 أيام) ولم يُحتسب له داعٍ من قبل
//  - لا يدعو المرء نفسه، ولا حسابين بنفس رقم الهاتف
//  - سقف يومي لكل داعٍ
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomInt } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";
import { limiter } from "../lib/rate-limiters";

const router = Router();

export const INVITE_POINTS = Math.max(1, Number(process.env.INVITE_POINTS ?? 10));
const DAILY_CAP = Math.max(1, Number(process.env.INVITE_DAILY_CAP ?? 20));
const NEW_ACCOUNT_DAYS = 7;
// رابط التثبيت الذكي (أندرويد → Google Play، آيفون → تثبيت تطبيق الويب)
const INSTALL_BASE = (process.env.INSTALL_LINK_BASE || "https://hasahisawi.pages.dev/get").replace(/\/$/, "");
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // بلا 0/O و1/I لتجنب الالتباس

const claimLimiter = limiter({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "محاولات كثيرة، انتظر قليلاً" } });

let ready: Promise<void> | null = null;
export function ensureInvitesDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code VARCHAR(12)`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code) WHERE invite_code IS NOT NULL`);
      await query(`CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invitee_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(12) NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_id, created_at DESC)`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

router.use(["/invites", "/admin/invites"], async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureInvitesDb(); return next(); }
  catch (err) { logger.error({ err }, "[invites] ensure"); return res.status(500).json({ error: "تعذّر التهيئة" }); }
});

async function codeFor(userId: number): Promise<string> {
  const cur = (await query(`SELECT invite_code FROM users WHERE id=$1`, [userId])).rows[0]?.invite_code;
  if (cur) return cur;
  for (let i = 0; i < 8; i++) {
    const code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    try {
      const r = await query(`UPDATE users SET invite_code=$1 WHERE id=$2 AND invite_code IS NULL RETURNING invite_code`, [code, userId]);
      if (r.rows[0]) return code;
      return (await query(`SELECT invite_code FROM users WHERE id=$1`, [userId])).rows[0].invite_code;
    } catch { /* تصادم نادر في الرمز — نحاول غيره */ }
  }
  throw new Error("invite code generation failed");
}

const phoneKey = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-9);

// ── رمزي ونقاطي ─────────────────────────────────────────────────
router.get("/invites/me", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const code = await codeFor(Number(me.id));
    const stats = (await query(`SELECT COUNT(*)::int AS count, COALESCE(SUM(points),0)::int AS points FROM referrals WHERE inviter_id=$1`, [me.id])).rows[0];
    const rank = stats.points > 0 ? (await query(
      `SELECT COUNT(*)::int + 1 AS rank FROM (SELECT inviter_id, SUM(points) p FROM referrals GROUP BY inviter_id) t WHERE t.p > $1`, [stats.points])).rows[0].rank : null;
    const recent = (await query(
      `SELECT u.id, u.name, u.avatar_url, r.points, r.created_at FROM referrals r JOIN users u ON u.id=r.invitee_id
        WHERE r.inviter_id=$1 ORDER BY r.created_at DESC LIMIT 20`, [me.id])).rows;
    const mine = (await query(`SELECT r.created_at, u.name AS inviter_name FROM referrals r JOIN users u ON u.id=r.inviter_id WHERE r.invitee_id=$1`, [me.id])).rows[0] ?? null;
    const created = (await query(`SELECT created_at FROM users WHERE id=$1`, [me.id])).rows[0]?.created_at;
    const canClaim = !mine && created && Date.now() - new Date(created).getTime() < NEW_ACCOUNT_DAYS * 86400_000;
    return res.json({
      code, link: `${INSTALL_BASE}?ref=${code}`, pointsPerInvite: INVITE_POINTS,
      count: stats.count, points: stats.points, rank, recent, invitedBy: mine, canClaim: !!canClaim,
    });
  } catch (err) { logger.error({ err }, "[invites] me"); return res.status(500).json({ error: "خطأ" }); }
});

// ── احتساب الدعوة للعضو الجديد ───────────────────────────────────
router.post("/invites/claim", claimLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const code = String(req.body?.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 4) return res.status(400).json({ error: "رمز الدعوة غير صحيح" });

    const meRow = (await query(`SELECT id, phone, created_at FROM users WHERE id=$1`, [me.id])).rows[0];
    if (!meRow) return res.status(404).json({ error: "الحساب غير موجود" });
    if (Date.now() - new Date(meRow.created_at).getTime() > NEW_ACCOUNT_DAYS * 86400_000)
      return res.status(400).json({ error: "رموز الدعوة للحسابات الجديدة فقط (خلال أسبوع من التسجيل)" });

    const inviter = (await query(`SELECT id, name, phone FROM users WHERE invite_code=$1`, [code])).rows[0];
    if (!inviter) return res.status(404).json({ error: "رمز الدعوة غير موجود" });
    if (Number(inviter.id) === Number(me.id)) return res.status(400).json({ error: "لا يمكنك استخدام رمزك" });
    if (phoneKey(inviter.phone) && phoneKey(inviter.phone) === phoneKey(meRow.phone))
      return res.status(400).json({ error: "لا يمكن احتساب دعوة لنفس رقم الهاتف" });

    const today = (await query(`SELECT COUNT(*)::int n FROM referrals WHERE inviter_id=$1 AND created_at > NOW() - INTERVAL '1 day'`, [inviter.id])).rows[0].n;
    const points = today >= DAILY_CAP ? 0 : INVITE_POINTS; // فوق السقف: تُسجّل الدعوة بلا نقاط

    const r = await query(
      `INSERT INTO referrals (inviter_id, invitee_id, code, points) VALUES ($1,$2,$3,$4)
       ON CONFLICT (invitee_id) DO NOTHING RETURNING id`, [inviter.id, me.id, code, points]);
    if (!r.rows[0]) return res.status(409).json({ error: "سبق احتساب دعوة لحسابك" });

    // إشعار الداعي (إن وُجد جدول الإشعارات)
    query(`INSERT INTO notifications (user_id, title, body, type) VALUES ($1,$2,$3,'invite')`,
      [inviter.id, "🎁 نقاط دعوة جديدة", `انضم ${me.name} بدعوتك — +${points} نقطة`]).catch(() => {});
    return res.json({ ok: true, inviter: inviter.name, points });
  } catch (err) { logger.error({ err }, "[invites] claim"); return res.status(500).json({ error: "خطأ" }); }
});

// ── أكثر الداعين ─────────────────────────────────────────────────
router.get("/invites/leaderboard", async (_req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT u.id, u.name, u.avatar_url, COUNT(*)::int AS count, SUM(r.points)::int AS points
         FROM referrals r JOIN users u ON u.id=r.inviter_id
        GROUP BY u.id ORDER BY points DESC, count DESC LIMIT 10`);
    return res.json({ leaders: r.rows, pointsPerInvite: INVITE_POINTS });
  } catch (err) { logger.error({ err }, "[invites] leaderboard"); return res.status(500).json({ error: "خطأ" }); }
});

export default router;
