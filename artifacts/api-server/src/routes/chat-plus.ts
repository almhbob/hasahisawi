// ════════════════════════════════════════════════════════════════
// 💬 الدردشة المتقدمة — تعديل/حذف الرسائل، الرد، التفاعلات، الحالة (نشط/آخر ظهور)،
// يكتب الآن، الإخفاء والتثبيت والكتم، مسح المحادثة، والحظر.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled, type SessionUser } from "../lib/shared-db";
import { checkContent } from "../lib/content-moderator";

const router = Router();

export const EDIT_WINDOW_MIN = 60;          // تعديل الرسالة خلال ساعة
export const DELETE_ALL_WINDOW_H = 24;      // حذف للجميع خلال 24 ساعة
const ONLINE_SEC = 120;                     // «نشط الآن» إن ظهر خلال دقيقتين
const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

let ready: Promise<void> | null = null;
export function ensureChatPlus(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      for (const col of [
        "edited_at TIMESTAMPTZ", "deleted_at TIMESTAMPTZ", "reply_to_id INTEGER",
        "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()", "reactions JSONB NOT NULL DEFAULT '{}'::jsonb", "read_at TIMESTAMPTZ",
      ]) await query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS ${col}`);
      await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_updated ON chat_messages(chat_id, updated_at)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id, id)`);
      await query(`CREATE TABLE IF NOT EXISTS chat_user_state (
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        hidden BOOLEAN NOT NULL DEFAULT FALSE,
        pinned BOOLEAN NOT NULL DEFAULT FALSE,
        muted BOOLEAN NOT NULL DEFAULT FALSE,
        cleared_at TIMESTAMPTZ,
        typing_until TIMESTAMPTZ,
        PRIMARY KEY (chat_id, user_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS chat_message_hidden (
        message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        PRIMARY KEY (message_id, user_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS chat_blocks (
        blocker_id INTEGER NOT NULL, blocked_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (blocker_id, blocked_id)
      )`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS show_presence BOOLEAN NOT NULL DEFAULT TRUE`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** يسجّل ظهور المستخدم (يُستدعى مع كل طلب دردشة ومن نبض التطبيق) */
export async function touchPresence(userId: number) {
  await query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1 AND (last_seen_at IS NULL OR last_seen_at < NOW() - interval '20 seconds')`, [userId]).catch(() => {});
}

export async function isBlockedBetween(a: number, b: number) {
  const r = await query(`SELECT blocker_id FROM chat_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)`, [a, b]);
  return r.rows.map((x: any) => Number(x.blocker_id));
}

export async function isMuted(chatId: number, userId: number) {
  const r = await query(`SELECT muted FROM chat_user_state WHERE chat_id=$1 AND user_id=$2`, [chatId, userId]).catch(() => ({ rows: [] as any[] }));
  return !!r.rows[0]?.muted;
}

function presenceOf(u: { last_seen_at?: string | null; show_presence?: boolean }) {
  if (u.show_presence === false || !u.last_seen_at) return { online: false, last_seen_at: null as string | null };
  const ago = (Date.now() - new Date(u.last_seen_at).getTime()) / 1000;
  return { online: ago < ONLINE_SEC, last_seen_at: u.last_seen_at };
}

async function myChat(req: Request, res: Response): Promise<{ me: SessionUser; chat: any; otherId: number } | null> {
  const me = await sessionUser(req);
  if (!me) { res.status(401).json({ error: "غير مصرح" }); return null; }
  await ensureChatPlus();
  const id = Number(req.params.chatId);
  if (!Number.isInteger(id)) { res.status(404).json({ error: "المحادثة غير موجودة" }); return null; }
  const r = await query(`SELECT * FROM chats WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)`, [id, me.id]);
  if (!r.rows[0]) { res.status(403).json({ error: "غير مصرح" }); return null; }
  touchPresence(me.id);
  const c = r.rows[0];
  return { me, chat: c, otherId: c.user1_id === me.id ? c.user2_id : c.user1_id };
}

async function setState(chatId: number, userId: number, patch: Record<string, unknown>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const cols = ["chat_id", "user_id", ...keys];
  const vals = [chatId, userId, ...keys.map((k) => patch[k])];
  await query(
    `INSERT INTO chat_user_state (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})
     ON CONFLICT (chat_id, user_id) DO UPDATE SET ${keys.map((k) => `${k}=EXCLUDED.${k}`).join(",")}`, vals);
}

/** يعيد حساب «آخر رسالة» للمحادثة بعد تعديل/حذف */
async function refreshLastMessage(chatId: number) {
  const r = await query(`SELECT content, image_url, deleted_at, sender_id, created_at FROM chat_messages WHERE chat_id=$1 ORDER BY id DESC LIMIT 1`, [chatId]);
  const m = r.rows[0];
  const txt = !m ? "" : m.deleted_at ? "🚫 رسالة محذوفة" : m.image_url && !m.content ? "📷 صورة" : m.content;
  await query(`UPDATE chats SET last_message=$1 WHERE id=$2`, [txt, chatId]);
}

const MSG_COLS = `m.id, m.chat_id, m.sender_id, u.name AS sender_name,
  CASE WHEN m.deleted_at IS NOT NULL THEN '' ELSE m.content END AS content,
  CASE WHEN m.deleted_at IS NOT NULL THEN NULL ELSE m.image_url END AS image_url,
  m.type, m.created_at, m.is_read, m.read_at, m.edited_at, m.deleted_at, m.updated_at, m.reactions, m.reply_to_id,
  CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id', r.id, 'sender_id', r.sender_id, 'sender_name', ru.name,
    'content', CASE WHEN r.deleted_at IS NOT NULL THEN '' ELSE LEFT(r.content, 140) END, 'image', r.image_url IS NOT NULL AND r.deleted_at IS NULL, 'deleted', r.deleted_at IS NOT NULL) END AS reply_to`;
const MSG_FROM = `FROM chat_messages m JOIN users u ON u.id=m.sender_id
  LEFT JOIN chat_messages r ON r.id=m.reply_to_id LEFT JOIN users ru ON ru.id=r.sender_id`;

// ── قائمة المحادثات مع الحالة ────────────────────────────────────
router.get("/chats/list", async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    await ensureChatPlus();
    touchPresence(me.id);
    const r = await query(`
      SELECT c.*, u1.name AS user1_name, u1.avatar_url AS user1_avatar, u2.name AS user2_name, u2.avatar_url AS user2_avatar,
        COALESCE(s.hidden,FALSE) AS hidden, COALESCE(s.pinned,FALSE) AS pinned, COALESCE(s.muted,FALSE) AS muted, s.cleared_at,
        o.last_seen_at AS other_last_seen, o.show_presence AS other_show_presence,
        (os.typing_until IS NOT NULL AND os.typing_until > NOW()) AS other_typing,
        EXISTS(SELECT 1 FROM chat_blocks b WHERE b.blocker_id=$1 AND b.blocked_id=o.id) AS blocked_by_me
      FROM chats c
      JOIN users u1 ON u1.id=c.user1_id JOIN users u2 ON u2.id=c.user2_id
      JOIN users o ON o.id = CASE WHEN c.user1_id=$1 THEN c.user2_id ELSE c.user1_id END
      LEFT JOIN chat_user_state s ON s.chat_id=c.id AND s.user_id=$1
      LEFT JOIN chat_user_state os ON os.chat_id=c.id AND os.user_id=o.id
      WHERE (c.user1_id=$1 OR c.user2_id=$1)
        AND (s.cleared_at IS NULL OR c.last_message_at > s.cleared_at OR COALESCE(s.pinned,FALSE))
      ORDER BY COALESCE(s.pinned,FALSE) DESC, c.last_message_at DESC LIMIT 300`, [me.id]);
    const chats = r.rows.map((c: any) => {
      const p = presenceOf({ last_seen_at: c.other_last_seen, show_presence: c.other_show_presence });
      const { other_last_seen, other_show_presence, ...rest } = c;
      return { ...rest, other_online: p.online, other_last_seen_at: p.last_seen_at, unread: c.user1_id === me.id ? c.unread_user1 : c.unread_user2 };
    });
    return res.json({ chats, server_time: new Date().toISOString() });
  } catch (e) { logger.error({ err: e }, "chats/list"); return res.status(500).json({ error: "Server error" }); }
});

// ── مزامنة محادثة: رسائل جديدة + ما تغيّر + حالة الطرف الآخر ─────
router.get("/chats/:chatId/sync", async (req, res) => {
  try {
    const m = await myChat(req, res); if (!m) return;
    const afterId = Number(req.query.after_id) || 0;
    const since = typeof req.query.since === "string" && !isNaN(Date.parse(req.query.since)) ? req.query.since : null;
    const st = await query(`SELECT * FROM chat_user_state WHERE chat_id=$1 AND user_id=$2`, [m.chat.id, m.me.id]);
    const cleared = st.rows[0]?.cleared_at || null;
    const params: unknown[] = [m.chat.id, m.me.id, cleared];
    let cond: string;
    if (!afterId) cond = "TRUE";
    else { params.push(afterId); cond = `(m.id > $4`; if (since) { params.push(since); cond += ` OR m.updated_at > $5`; } cond += ")"; }
    const rows = await query(`SELECT ${MSG_COLS} ${MSG_FROM}
      WHERE m.chat_id=$1 AND ($3::timestamptz IS NULL OR m.created_at > $3)
        AND NOT EXISTS (SELECT 1 FROM chat_message_hidden h WHERE h.message_id=m.id AND h.user_id=$2)
        AND ${cond}
      ORDER BY m.id ${afterId ? "ASC" : "DESC"} LIMIT ${afterId ? 300 : 150}`, params);
    const messages = afterId ? rows.rows : rows.rows.reverse();
    // الرسائل المحذوفة «لي» بعد آخر مزامنة — ليزيلها التطبيق
    let removed: number[] = [];
    if (afterId) {
      const h = await query(`SELECT h.message_id FROM chat_message_hidden h JOIN chat_messages x ON x.id=h.message_id WHERE x.chat_id=$1 AND h.user_id=$2 AND x.id <= $3`, [m.chat.id, m.me.id, afterId]);
      removed = h.rows.map((x: any) => Number(x.message_id));
    }
    const o = await query(`SELECT name, avatar_url, last_seen_at, show_presence FROM users WHERE id=$1`, [m.otherId]);
    const os = await query(`SELECT typing_until FROM chat_user_state WHERE chat_id=$1 AND user_id=$2`, [m.chat.id, m.otherId]);
    const blocks = await isBlockedBetween(m.me.id, m.otherId);
    const p = presenceOf(o.rows[0] || {});
    return res.json({
      messages, removed, server_time: new Date().toISOString(),
      other: { id: m.otherId, name: o.rows[0]?.name, avatar_url: o.rows[0]?.avatar_url, online: p.online, last_seen_at: p.last_seen_at,
        typing: !!(os.rows[0]?.typing_until && new Date(os.rows[0].typing_until).getTime() > Date.now()) },
      state: { hidden: !!st.rows[0]?.hidden, pinned: !!st.rows[0]?.pinned, muted: !!st.rows[0]?.muted },
      blocked_by_me: blocks.includes(m.me.id), blocked_me: blocks.includes(m.otherId),
      limits: { edit_minutes: EDIT_WINDOW_MIN, delete_all_hours: DELETE_ALL_WINDOW_H },
    });
  } catch (e) { logger.error({ err: e }, "chats/sync"); return res.status(500).json({ error: "Server error" }); }
});

// ── تعديل رسالة ──────────────────────────────────────────────────
router.patch("/chats/:chatId/messages/:mid", async (req, res) => {
  try {
    const m = await myChat(req, res); if (!m) return;
    const content = String(req.body?.content ?? "").trim();
    if (!content) return res.status(400).json({ error: "الرسالة فارغة" });
    if (content.length > 2000) return res.status(400).json({ error: "الرسالة طويلة جداً" });
    const cur = await query(`SELECT * FROM chat_messages WHERE id=$1 AND chat_id=$2`, [Number(req.params.mid), m.chat.id]);
    const msg = cur.rows[0];
    if (!msg) return res.status(404).json({ error: "الرسالة غير موجودة" });
    if (msg.sender_id !== m.me.id) return res.status(403).json({ error: "يمكنك تعديل رسائلك فقط" });
    if (msg.deleted_at) return res.status(400).json({ error: "الرسالة محذوفة" });
    if (msg.type === "image" && !msg.content) return res.status(400).json({ error: "لا يمكن تعديل الصور" });
    if (Date.now() - new Date(msg.created_at).getTime() > EDIT_WINDOW_MIN * 60000) return res.status(400).json({ error: `يمكن التعديل خلال ${EDIT_WINDOW_MIN} دقيقة من الإرسال فقط` });
    if (content === msg.content) return res.json({ ok: true });
    const mod = await checkContent(content).catch(() => ({ allowed: true } as any));
    if (!mod.allowed) return res.status(422).json({ error: "تم رفض الرسالة", reason: mod.reason ?? "محتوى مخالف لسياسة المنصة", blocked: true });
    await query(`UPDATE chat_messages SET content=$1, edited_at=NOW(), updated_at=NOW() WHERE id=$2`, [content, msg.id]);
    await refreshLastMessage(m.chat.id);
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "chat edit"); return res.status(500).json({ error: "Server error" }); }
});

// ── حذف رسالة: ?for=me | all ─────────────────────────────────────
router.delete("/chats/:chatId/messages/:mid", async (req, res) => {
  try {
    const m = await myChat(req, res); if (!m) return;
    const cur = await query(`SELECT * FROM chat_messages WHERE id=$1 AND chat_id=$2`, [Number(req.params.mid), m.chat.id]);
    const msg = cur.rows[0];
    if (!msg) return res.status(404).json({ error: "الرسالة غير موجودة" });
    if (req.query.for === "all") {
      if (msg.sender_id !== m.me.id) return res.status(403).json({ error: "يمكنك حذف رسائلك للجميع فقط" });
      if (Date.now() - new Date(msg.created_at).getTime() > DELETE_ALL_WINDOW_H * 3600000) return res.status(400).json({ error: `الحذف للجميع متاح خلال ${DELETE_ALL_WINDOW_H} ساعة — يمكنك حذفها لديك فقط` });
      await query(`UPDATE chat_messages SET deleted_at=NOW(), content='', image_url=NULL, reactions='{}'::jsonb, updated_at=NOW() WHERE id=$1`, [msg.id]);
      await refreshLastMessage(m.chat.id);
    } else {
      await query(`INSERT INTO chat_message_hidden (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [msg.id, m.me.id]);
    }
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "chat delete"); return res.status(500).json({ error: "Server error" }); }
});

// ── تفاعل على رسالة ─────────────────────────────────────────────
router.post("/chats/:chatId/messages/:mid/react", async (req, res) => {
  try {
    const m = await myChat(req, res); if (!m) return;
    const emoji = req.body?.emoji ? String(req.body.emoji) : null;
    if (emoji && !REACTIONS.includes(emoji)) return res.status(400).json({ error: "تفاعل غير مدعوم" });
    const key = String(m.me.id);
    const r = emoji
      ? await query(`UPDATE chat_messages SET reactions = jsonb_set(COALESCE(reactions,'{}'::jsonb), ARRAY[$1::text], to_jsonb($2::text)), updated_at=NOW() WHERE id=$3 AND chat_id=$4 AND deleted_at IS NULL RETURNING reactions`, [key, emoji, Number(req.params.mid), m.chat.id])
      : await query(`UPDATE chat_messages SET reactions = COALESCE(reactions,'{}'::jsonb) - $1::text, updated_at=NOW() WHERE id=$2 AND chat_id=$3 AND deleted_at IS NULL RETURNING reactions`, [key, Number(req.params.mid), m.chat.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "الرسالة غير موجودة" });
    return res.json({ reactions: r.rows[0].reactions });
  } catch (e) { logger.error({ err: e }, "chat react"); return res.status(500).json({ error: "Server error" }); }
});

// ── يكتب الآن ─────────────────────────────────────────────────────
router.post("/chats/:chatId/typing", async (req, res) => {
  try {
    const m = await myChat(req, res); if (!m) return;
    await setState(m.chat.id, m.me.id, { typing_until: req.body?.stop ? null : new Date(Date.now() + 6000).toISOString() });
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "chat typing"); return res.status(500).json({ error: "Server error" }); }
});

// ── إخفاء / تثبيت / كتم ──────────────────────────────────────────
router.patch("/chats/:chatId/state", async (req, res) => {
  try {
    const m = await myChat(req, res); if (!m) return;
    const patch: Record<string, unknown> = {};
    for (const k of ["hidden", "pinned", "muted"]) if (typeof req.body?.[k] === "boolean") patch[k] = req.body[k];
    if (!Object.keys(patch).length) return res.status(400).json({ error: "لا توجد تغييرات" });
    await setState(m.chat.id, m.me.id, patch);
    return res.json({ ok: true, ...patch });
  } catch (e) { logger.error({ err: e }, "chat state"); return res.status(500).json({ error: "Server error" }); }
});

// ── مسح المحادثة لديّ ─────────────────────────────────────────────
router.post("/chats/:chatId/clear", async (req, res) => {
  try {
    const m = await myChat(req, res); if (!m) return;
    await setState(m.chat.id, m.me.id, { cleared_at: new Date().toISOString() });
    await query(`UPDATE chats SET ${m.chat.user1_id === m.me.id ? "unread_user1" : "unread_user2"}=0 WHERE id=$1`, [m.chat.id]);
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "chat clear"); return res.status(500).json({ error: "Server error" }); }
});

// ── الحظر ─────────────────────────────────────────────────────────
router.post("/chats/:chatId/block", async (req, res) => {
  try {
    const m = await myChat(req, res); if (!m) return;
    if (req.body?.unblock) await query(`DELETE FROM chat_blocks WHERE blocker_id=$1 AND blocked_id=$2`, [m.me.id, m.otherId]);
    else await query(`INSERT INTO chat_blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [m.me.id, m.otherId]);
    return res.json({ ok: true, blocked: !req.body?.unblock });
  } catch (e) { logger.error({ err: e }, "chat block"); return res.status(500).json({ error: "Server error" }); }
});

// ── الحضور ───────────────────────────────────────────────────────
router.post("/presence/ping", async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    await ensureChatPlus();
    await query(`UPDATE users SET last_seen_at=NOW() WHERE id=$1`, [me.id]);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.patch("/presence/settings", async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    await ensureChatPlus();
    if (typeof req.body?.show_presence !== "boolean") return res.status(400).json({ error: "قيمة غير صالحة" });
    await query(`UPDATE users SET show_presence=$1 WHERE id=$2`, [req.body.show_presence, me.id]);
    return res.json({ ok: true, show_presence: req.body.show_presence });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

router.get("/presence/settings", async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    await ensureChatPlus();
    const r = await query(`SELECT show_presence FROM users WHERE id=$1`, [me.id]);
    return res.json({ show_presence: r.rows[0]?.show_presence !== false });
  } catch (e) { return res.status(500).json({ error: "Server error" }); }
});

export default router;
