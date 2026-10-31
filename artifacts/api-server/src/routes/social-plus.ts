// ════════════════════════════════════════════════════════════════
// 💬 المجتمع+: التفاعلات (👍❤️😂😮😢😡)، عدّاد المشاهدات، والمتابعة.
// التطبيق كان يستدعي /posts/:id/react و/posts/:id/view منذ مدة لكنهما لم
// يكونا موجودين في هذا الخادم، فلم تكن التفاعلات ولا المشاهدات تُحفظ.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";

const router = Router();

export const REACTIONS = ["like", "love", "haha", "wow", "sad", "angry"] as const;

let ready: Promise<void> | null = null;
export function ensureSocialPlus(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      // نوع التفاعل يُخزَّن في جدول الإعجابات نفسه حتى يبقى likes_count صحيحاً كما هو
      await query(`ALTER TABLE social_likes ADD COLUMN IF NOT EXISTS reaction VARCHAR(10) NOT NULL DEFAULT 'like'`);
      await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0`);
      await query(`CREATE TABLE IF NOT EXISTS user_follows (
        follower_id INTEGER NOT NULL,
        followee_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (follower_id, followee_id)
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_user_follows_followee ON user_follows(followee_id)`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** من يتابعهم المستخدم — لخلاصة «أتابعهم». */
export async function followeeIds(viewerId: number): Promise<number[]> {
  await ensureSocialPlus();
  const r = await query(`SELECT followee_id FROM user_follows WHERE follower_id=$1`, [viewerId]);
  return r.rows.map((x: any) => Number(x.followee_id));
}

async function pushToUser(userId: number, title: string, body: string, data: Record<string, unknown>) {
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [userId]);
    if (!rows.length) return;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound: "hasahisawi_notif", channelId: "hasahisawi-default-s2", priority: "high", data }))),
    }).finally(() => clearTimeout(t));
  } catch (e: any) { logger.warn({ err: e?.message }, "[social+] push failed"); }
}

// ── التفاعلات ────────────────────────────────────────────────────
// نفس التفاعل مرة ثانية = إلغاء، وتفاعل مختلف = تبديل.
router.post("/posts/:id/react", async (req: Request, res: Response) => {
  try {
    const postId = Number(req.params.id);
    const deviceId = String(req.body?.device_id || "");
    if (!Number.isInteger(postId) || postId <= 0) return res.status(400).json({ error: "معرّف غير صالح" });
    if (!deviceId || deviceId.length > 200) return res.status(400).json({ error: "device_id غير صالح" });
    const reaction = (REACTIONS as readonly string[]).includes(req.body?.reaction) ? String(req.body.reaction) : "like";
    await ensureSocialPlus();

    const cur = await query(`SELECT reaction FROM social_likes WHERE post_id=$1 AND device_id=$2`, [postId, deviceId]);
    if (cur.rows[0]?.reaction === reaction) {
      await query(`DELETE FROM social_likes WHERE post_id=$1 AND device_id=$2`, [postId, deviceId]);
      return res.json({ reacted: false, reaction: null });
    }
    const ins = await query(
      `INSERT INTO social_likes (post_id, device_id, reaction)
       SELECT $1, $2, $3 WHERE EXISTS (SELECT 1 FROM social_posts WHERE id=$1)
       ON CONFLICT (post_id, device_id) DO UPDATE SET reaction=EXCLUDED.reaction
       RETURNING reaction`, [postId, deviceId, reaction]);
    if (!ins.rows[0]) return res.status(404).json({ error: "المنشور غير موجود" });
    return res.json({ reacted: true, reaction });
  } catch (err) {
    logger.error({ err }, "[social+] react");
    return res.status(500).json({ error: "تعذّر حفظ التفاعل" });
  }
});

router.post("/posts/:id/view", async (req: Request, res: Response) => {
  try {
    const postId = Number(req.params.id);
    if (Number.isInteger(postId) && postId > 0) {
      await ensureSocialPlus();
      await query(`UPDATE social_posts SET views_count = views_count + 1 WHERE id=$1`, [postId]);
    }
  } catch (err) {
    logger.warn({ err }, "[social+] view");
  }
  return res.json({ ok: true });
});

// ── المتابعة ─────────────────────────────────────────────────────
router.post("/users/:id/follow", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const target = Number(req.params.id);
    if (!Number.isInteger(target) || target <= 0) return res.status(400).json({ error: "معرّف غير صالح" });
    if (target === Number(me.id)) return res.status(400).json({ error: "لا يمكنك متابعة نفسك" });
    await ensureSocialPlus();
    const u = await query(`SELECT id FROM users WHERE id=$1 AND COALESCE(is_banned,false)=false`, [target]);
    if (!u.rows[0]) return res.status(404).json({ error: "المستخدم غير موجود" });
    // لا متابعة بين طرفين أحدهما حظر الآخر
    const blocked = await query(
      `SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1`,
      [me.id, target]).catch(() => ({ rows: [] as any[] }));
    if (blocked.rows[0]) return res.status(403).json({ error: "لا يمكن متابعة هذا المستخدم" });

    const ins = await query(
      `INSERT INTO user_follows (follower_id, followee_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING created_at`,
      [me.id, target]);
    if (ins.rows[0]) {
      // إشعار واحد يومياً على الأكثر لنفس المتابِع (يمنع الإزعاج بالمتابعة وإلغائها)
      const recent = await query(
        `SELECT 1 FROM notifications WHERE user_id=$1 AND type='follow' AND data LIKE $2
           AND created_at > NOW() - INTERVAL '1 day' LIMIT 1`,
        [target, `%"follower_id":"${Number(me.id)}"%`]).catch(() => ({ rows: [{}] as any[] }));
      if (!recent.rows[0]) {
        const title = "متابع جديد";
        const body = `${me.name} بدأ متابعتك`;
        const data = { type: "follow", follower_id: String(me.id), screen: "profile" };
        await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'follow',$2,$3,$4)`,
          [target, title, body, JSON.stringify(data)]).catch((e) => logger.warn({ err: e?.message }, "[social+] notif insert"));
        pushToUser(target, title, body, data);
      }
    }
    return res.json({ success: true, following: true });
  } catch (err) {
    logger.error({ err }, "[social+] follow");
    return res.status(500).json({ error: "تعذّرت المتابعة" });
  }
});

router.delete("/users/:id/follow", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    await ensureSocialPlus();
    await query(`DELETE FROM user_follows WHERE follower_id=$1 AND followee_id=$2`, [me.id, Number(req.params.id)]);
    return res.json({ success: true, following: false });
  } catch (err) {
    logger.error({ err }, "[social+] unfollow");
    return res.status(500).json({ error: "تعذّر إلغاء المتابعة" });
  }
});

router.get("/users/:id/follow-stats", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "معرّف غير صالح" });
    await ensureSocialPlus();
    const me = await sessionUser(req);
    const r = await query(
      `SELECT (SELECT COUNT(*)::int FROM user_follows WHERE followee_id=$1) AS followers,
              (SELECT COUNT(*)::int FROM user_follows WHERE follower_id=$1) AS following,
              EXISTS (SELECT 1 FROM user_follows WHERE follower_id=$2 AND followee_id=$1) AS i_follow,
              EXISTS (SELECT 1 FROM user_follows WHERE follower_id=$1 AND followee_id=$2) AS follows_me`,
      [id, me ? Number(me.id) : 0]);
    return res.json(r.rows[0]);
  } catch (err) {
    logger.error({ err }, "[social+] stats");
    return res.status(500).json({ error: "تعذّر التحميل" });
  }
});

/** قائمة المتابِعين أو المتابَعين. */
async function listFollows(req: Request, res: Response, followers: boolean) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "معرّف غير صالح" });
    await ensureSocialPlus();
    const me = await sessionUser(req);
    const r = await query(
      `SELECT u.id, u.name, u.avatar_url, u.headline, COALESCE(u.is_verified,false) AS is_verified,
              EXISTS (SELECT 1 FROM user_follows x WHERE x.follower_id=$2 AND x.followee_id=u.id) AS i_follow
         FROM user_follows f
         JOIN users u ON u.id = ${followers ? "f.follower_id" : "f.followee_id"}
        WHERE ${followers ? "f.followee_id" : "f.follower_id"} = $1 AND COALESCE(u.is_banned,false)=false
        ORDER BY f.created_at DESC LIMIT 200`,
      [id, me ? Number(me.id) : 0]);
    return res.json(r.rows);
  } catch (err) {
    logger.error({ err }, "[social+] list");
    return res.status(500).json({ error: "تعذّر التحميل" });
  }
}
router.get("/users/:id/followers", (req, res) => listFollows(req, res, true));
router.get("/users/:id/following", (req, res) => listFollows(req, res, false));

export default router;
