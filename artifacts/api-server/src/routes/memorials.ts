// ════════════════════════════════════════════════════════════════
// 🕊️ صدقة جارية — حساب المتوفى
//  • يبلّغ أحد ذوي المتوفى (بشهادة الوفاة وصلة القرابة) ← تراجع الإدارة الطلب.
//  • حماية من البلاغ الكاذب: يُبلَّغ صاحب الحساب فور تقديم البلاغ ويستطيع الاعتراض بنفسه،
//    وبعد تأكيد الإدارة مهلة 72 ساعة قبل أي حذف (يمكن خلالها للإدارة التراجع ولصاحب الحساب الاعتراض).
//  • بانتهاء المهلة (معاملة واحدة): تُحذف منشورات المتوفى وتعليقاته وإعجاباته ومحادثاته ورسائله،
//    وتُنهى جلساته ويُغلق الدخول إلى حسابه، ويتحول ملفه إلى صفحة تذكارية.
//  • المهام الدورية تُستدعى من GitHub كل ساعة (/memorials/cron/run) لأن الخادم Serverless.
//  • ينشر التطبيق نيابةً عنه منشوراً نافعاً يومياً (آية، ذكر، حديث، دعاء) صدقةً جارية عن روحه،
//    ويستطيع الزوار الدعاء له من صفحته.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, dbClient, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { timingSafeEqual } from "node:crypto";
import { verifyGithubOidc } from "./ci-play-token";

export const GRACE_HOURS = 72;

const router = Router();
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const httpsUrl = (v: unknown) => (/^https:\/\/\S+$/i.test(String(v ?? "")) ? String(v).slice(0, 500) : null);

/** محتوى نافع يُنشر بالتناوب — {name} اسم المتوفى، {h} ضمير الغائب (ـه/ـها)، {r} رحمه/رحمها */
export const SADAQA_LIBRARY: string[] = [
  "﴿وَبَشِّرِ الصَّابِرِينَ ۝ الَّذِينَ إِذَا أَصَابَتْهُم مُّصِيبَةٌ قَالُوا إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ﴾",
  "سبحان الله وبحمده، سبحان الله العظيم — كلمتان خفيفتان على اللسان، ثقيلتان في الميزان، حبيبتان إلى الرحمن.",
  "قال ﷺ: «إذا مات الإنسان انقطع عنه عمله إلا من ثلاثة: صدقة جارية، أو علم يُنتفع به، أو ولد صالح يدعو له».",
  "اللهم اغفر لـ{name} وارحم{h}، وعافِ{h} واعفُ عن{h}، وأكرم نُزُل{h}، ووسّع مُدخل{h}.",
  "﴿كُلُّ نَفْسٍ ذَائِقَةُ الْمَوْتِ ۗ وَإِنَّمَا تُوَفَّوْنَ أُجُورَكُمْ يَوْمَ الْقِيَامَةِ﴾",
  "لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، وهو على كل شيء قدير.",
  "اللهم صلِّ وسلّم وبارك على نبينا محمد ﷺ — من صلّى عليه صلاة صلّى الله عليه بها عشراً.",
  "﴿يَا أَيَّتُهَا النَّفْسُ الْمُطْمَئِنَّةُ ۝ ارْجِعِي إِلَىٰ رَبِّكِ رَاضِيَةً مَّرْضِيَّةً ۝ فَادْخُلِي فِي عِبَادِي ۝ وَادْخُلِي جَنَّتِي﴾",
  "أستغفر الله العظيم الذي لا إله إلا هو الحي القيوم وأتوب إليه.",
  "قال ﷺ: «الكلمة الطيبة صدقة»، و«تبسّمك في وجه أخيك صدقة».",
  "اللهم اجعل قبر {name} روضةً من رياض الجنة، ولا تجعله حفرةً من حفر النار.",
  "﴿وَقُل رَّبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا﴾ — اذكر والديك بدعوة اليوم.",
  "لا حول ولا قوة إلا بالله — كنزٌ من كنوز الجنة.",
  "قال ﷺ: «من دلّ على خيرٍ فله مثل أجر فاعله».",
  "اللهم أبدل {name} داراً خيراً من داره، وأهلاً خيراً من أهله، وأدخل{h} الجنة وأعذ{h} من عذاب القبر.",
  "﴿إِنَّ مَعَ الْعُسْرِ يُسْرًا﴾ — لا تيأس من رحمة الله.",
  "سبحان الله، والحمد لله، ولا إله إلا الله، والله أكبر — أحب الكلام إلى الله.",
  "قال ﷺ: «أحب الأعمال إلى الله أدومها وإن قلّ».",
  "اللهم آنس وحشة {name} في قبر{h}، وارحم غربت{h}، واجعل ما قدّم{h} من خير شفيعاً ل{h}.",
  "﴿وَمَا تُقَدِّمُوا لِأَنفُسِكُم مِّنْ خَيْرٍ تَجِدُوهُ عِندَ اللَّهِ هُوَ خَيْرًا وَأَعْظَمَ أَجْرًا﴾",
  "رضيت بالله رباً، وبالإسلام ديناً، وبمحمد ﷺ نبياً.",
  "قال ﷺ: «الدال على الخير كفاعله» — شارك هذا المنشور فلك أجره.",
  "اللهم اجعل {name} في عليين، واخلف{h} في عقب{h} في الغابرين، واغفر لنا ول{h} يا رب العالمين.",
  "﴿رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ﴾",
  "قال ﷺ: «ما نقصت صدقة من مال».",
  "حسبي الله لا إله إلا هو، عليه توكلت وهو رب العرش العظيم.",
  "اللهم ارحم {name} رحمةً تسع السماوات والأرض، واجعل{h} من أهل الفردوس الأعلى.",
  "﴿فَاذْكُرُونِي أَذْكُرْكُمْ وَاشْكُرُوا لِي وَلَا تَكْفُرُونِ﴾",
  "قال ﷺ: «سقي الماء من أفضل الصدقات» — أسقِ عطشاناً اليوم بنية الصدقة عن موتاك.",
  "اللهم اغفر لحيّنا وميّتنا، وشاهدنا وغائبنا، وصغيرنا وكبيرنا، وذكرنا وأنثانا.",
];

function render(tpl: string, name: string, female: boolean) {
  return tpl.replace(/\{name\}/g, name).replace(/\{h\}/g, female ? "ها" : "ه").replace(/\{r\}/g, female ? "رحمها" : "رحمه");
}

let ready: Promise<void> | null = null;
export function ensureMemorialsDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_memorial BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`CREATE TABLE IF NOT EXISTS memorials (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, reporter_id INTEGER, reporter_name VARCHAR(120), reporter_phone VARCHAR(30),
      relation VARCHAR(60), death_date DATE, certificate_url TEXT, notes TEXT,
      status VARCHAR(12) NOT NULL DEFAULT 'pending', reject_reason TEXT, reviewed_by INTEGER, reviewed_at TIMESTAMPTZ,
      auto_post BOOLEAN NOT NULL DEFAULT TRUE, posts_count INTEGER NOT NULL DEFAULT 0, last_post_at TIMESTAMPTZ,
      duas_count INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`ALTER TABLE memorials ADD COLUMN IF NOT EXISTS purge_at TIMESTAMPTZ`);
    await query(`ALTER TABLE memorials ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ`);
    await query(`ALTER TABLE memorials ADD COLUMN IF NOT EXISTS objected_at TIMESTAMPTZ`);
    // الحسابات المؤكدة قبل إضافة المهلة حُذف محتواها فوراً
    await query(`UPDATE memorials SET purged_at=COALESCE(reviewed_at, NOW()) WHERE status='confirmed' AND purge_at IS NULL AND purged_at IS NULL`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS memorials_confirmed_uq ON memorials(user_id) WHERE status='confirmed'`);
    await query(`CREATE TABLE IF NOT EXISTS memorial_duas (memorial_id INTEGER NOT NULL, user_id INTEGER NOT NULL, day DATE NOT NULL DEFAULT CURRENT_DATE, PRIMARY KEY (memorial_id, user_id, day))`);
  })().catch((e) => { ready = null; throw e; }));
}

async function notifyUser(userId: number | null | undefined, title: string, body: string, data: Record<string, unknown> = {}) {
  if (!userId) return;
  const payload = { ...data, screen: "memorial" };
  try { await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'memorial',$2,$3,$4)`, [userId, title, body, JSON.stringify(payload)]); } catch { /* */ }
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [userId]);
    if (rows.length) await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound: "default", priority: "high", channelId: "hasahisawi-default", data: payload }))),
    }).catch(() => {});
  } catch (e: any) { logger.warn({ err: e?.message }, "[memorial] push"); }
}

async function cronAuth(req: Request): Promise<boolean> {
  const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const key = String(process.env.CAMPAIGN_PUSH_KEY || "");
  if (key && tok.length === key.length && timingSafeEqual(Buffer.from(tok), Buffer.from(key))) return true;
  if (tok.split(".").length === 3) { try { await verifyGithubOidc(tok, "hasahisawi-srcs"); return true; } catch { /* */ } }
  return false;
}

async function canReview(u: SessionUser | null) {
  if (!u) return false;
  if (u.role === "admin") return true;
  if (u.role !== "moderator") return false;
  return (await query(`SELECT 1 FROM moderator_permissions WHERE user_id=$1 AND section='memorial'`, [u.id]).catch(() => ({ rows: [] as any[] }))).rows.length > 0;
}

// POST /api/memorials — بلاغ وفاة من أحد ذوي المتوفى
router.post("/memorials", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول لتقديم البلاغ" });
  try {
    await ensureMemorialsDb();
    const digits = String(req.body?.phone || "").replace(/\D/g, "").slice(-9);
    const target = req.body?.user_id
      ? (await query(`SELECT id, name FROM users WHERE id=$1`, [Number(req.body.user_id)])).rows[0]
      : digits.length >= 9 ? (await query(`SELECT id, name FROM users WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone,''),'[^0-9]','','g'),9)=$1 LIMIT 1`, [digits])).rows[0] : null;
    if (!target) return res.status(404).json({ error: "لم نجد حساباً بهذا الرقم" });
    if (target.id === u.id) return res.status(400).json({ error: "لا يمكن الإبلاغ عن حسابك" });
    const cert = httpsUrl(req.body?.certificate_url);
    if (!cert) return res.status(400).json({ error: "أرفق صورة شهادة الوفاة أو ما يثبتها" });
    const relation = clip(req.body?.relation, 60);
    if (!relation) return res.status(400).json({ error: "حدد صلة القرابة" });
    const dup = await query(`SELECT 1 FROM memorials WHERE user_id=$1 AND status IN ('pending','confirmed')`, [target.id]);
    if (dup.rows.length) return res.status(409).json({ error: "يوجد بلاغ قائم أو مؤكد لهذا الحساب" });
    const r = await query(
      `INSERT INTO memorials (user_id, reporter_id, reporter_name, reporter_phone, relation, death_date, certificate_url, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [target.id, u.id, u.name, u.phone, relation, /^\d{4}-\d{2}-\d{2}$/.test(req.body?.death_date) ? req.body.death_date : null, cert, clip(req.body?.notes, 1000) || null]);
    notifyUser(target.id, "بلاغ وفاة عن حسابك", "وصلنا بلاغ بوفاة صاحب هذا الحساب. إن كنت صاحبه وأنت بخير فاضغط هنا للاعتراض وسيُلغى البلاغ فوراً.", { memorial_id: r.rows[0].id, action: "object" }).catch(() => {});
    return res.status(201).json({ ok: true, id: r.rows[0].id, name: target.name, message: "أحسن الله عزاءكم. وصل البلاغ وستراجعه الإدارة بعناية قبل أي إجراء." });
  } catch (e: any) { logger.error({ err: e?.message }, "memorial report"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/memorials/mine", async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول" });
  await ensureMemorialsDb();
  const r = await query(`SELECT m.id, m.status, m.reject_reason, m.created_at, m.purge_at, m.purged_at, u.name FROM memorials m JOIN users u ON u.id=m.user_id WHERE m.reporter_id=$1 ORDER BY m.id DESC`, [u.id]);
  return res.json({ requests: r.rows });
});

// GET /api/memorials/user/:uid — الصفحة التذكارية العامة
router.get("/memorials/user/:uid", async (req: Request, res: Response) => {
  try {
    await ensureMemorialsDb();
    const m = (await query(
      `SELECT m.id, m.user_id, m.death_date, m.posts_count, m.duas_count, m.created_at, u.name, u.avatar_url, u.gender
         FROM memorials m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.status='confirmed' AND m.purged_at IS NOT NULL`, [Number(req.params.uid)])).rows[0];
    if (!m) return res.status(404).json({ error: "لا توجد صفحة تذكارية" });
    const u = await sessionUser(req);
    const prayed = u ? (await query(`SELECT 1 FROM memorial_duas WHERE memorial_id=$1 AND user_id=$2 AND day=CURRENT_DATE`, [m.id, u.id])).rows.length > 0 : false;
    const posts = (await query(`SELECT id, content, created_at FROM social_posts WHERE author_id=$1 ORDER BY id DESC LIMIT 5`, [m.user_id]).catch(() => ({ rows: [] }))).rows;
    return res.json({ memorial: { ...m, prayed_today: prayed }, posts });
  } catch (e: any) { logger.error({ err: e?.message }, "memorial page"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/memorials/:id/dua", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول" });
  const ins = await query(`INSERT INTO memorial_duas (memorial_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1`, [Number(req.params.id), u.id]).catch(() => ({ rows: [] as any[] }));
  if (ins.rows.length) await query(`UPDATE memorials SET duas_count=duas_count+1 WHERE id=$1`, [Number(req.params.id)]);
  const r = await query(`SELECT duas_count FROM memorials WHERE id=$1`, [Number(req.params.id)]);
  return res.json({ ok: true, duas_count: r.rows[0]?.duas_count ?? 0 });
});

// GET /api/memorials/about-me — بلاغ قائم عن حسابي (ليعترض صاحبه إن كان بخير)
router.get("/memorials/about-me", async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول" });
  await ensureMemorialsDb();
  const r = await query(`SELECT id, status, relation, reporter_name, created_at, purge_at FROM memorials
    WHERE user_id=$1 AND (status='pending' OR (status='confirmed' AND purged_at IS NULL)) ORDER BY id DESC LIMIT 1`, [u.id]);
  return res.json({ report: r.rows[0] ?? null });
});

// POST /api/memorials/:id/object — صاحب الحساب يعترض: البلاغ يُلغى فوراً ولا يُحذف شيء
router.post("/memorials/:id/object", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول" });
  try {
    await ensureMemorialsDb();
    const r = await query(`UPDATE memorials SET status='rejected', objected_at=NOW(), purge_at=NULL,
        reject_reason='اعترض صاحب الحساب وأكد أنه بخير' WHERE id=$1 AND user_id=$2
        AND (status='pending' OR (status='confirmed' AND purged_at IS NULL)) RETURNING id, reporter_id`, [Number(req.params.id), u.id]);
    if (!r.rows.length) return res.status(404).json({ error: "لا يوجد بلاغ قائم عن حسابك" });
    logger.warn({ memorial: r.rows[0].id, user: u.id, reporter: r.rows[0].reporter_id }, "[memorial] objected by account owner");
    notifyUser(r.rows[0].reporter_id, "أُلغي بلاغ الوفاة", "اعترض صاحب الحساب وأكد أنه بخير، فأُلغي البلاغ.").catch(() => {});
    return res.json({ ok: true, message: "الحمد لله على سلامتك. أُلغي البلاغ ولن يتغير شيء في حسابك." });
  } catch (e: any) { logger.error({ err: e?.message }, "memorial object"); return res.status(500).json({ error: "Server error" }); }
});

// ── الإدارة ──────────────────────────────────────────────
router.get("/admin/memorials", async (req: Request, res: Response) => {
  if (!(await canReview(await sessionUser(req)))) return res.status(403).json({ error: "غير مصرح" });
  await ensureMemorialsDb();
  const r = await query(
    `SELECT m.*, u.name, u.phone, u.avatar_url,
            (SELECT COUNT(*)::int FROM social_posts p WHERE p.author_id=m.user_id) AS user_posts
       FROM memorials m JOIN users u ON u.id=m.user_id ORDER BY (m.status='pending') DESC, m.id DESC LIMIT 200`).catch(() => ({ rows: [] as any[] }));
  return res.json({ memorials: r.rows });
});

router.patch("/admin/memorials/:id", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!(await canReview(u))) return res.status(403).json({ error: "غير مصرح" });
  const id = Number(req.params.id);
  const status = String(req.body?.status || "");
  try {
    await ensureMemorialsDb();
    const m = (await query(`SELECT * FROM memorials WHERE id=$1`, [id])).rows[0];
    if (!m) return res.status(404).json({ error: "غير موجود" });
    if (status === "rejected") {
      // رفض بلاغ معلّق، أو تراجع عن تأكيد ما زال في المهلة
      if (!(m.status === "pending" || (m.status === "confirmed" && !m.purged_at))) return res.status(400).json({ error: "لا يمكن التراجع بعد تحويل الحساب" });
      await query(`UPDATE memorials SET status='rejected', purge_at=NULL, reject_reason=$2, reviewed_by=$3, reviewed_at=NOW() WHERE id=$1`, [id, clip(req.body?.reason, 300) || null, u!.id]);
      if (m.status === "confirmed") notifyUser(m.user_id, "أُلغي بلاغ الوفاة", "تراجعت الإدارة عن البلاغ، ولن يتغير شيء في حسابك.").catch(() => {});
      return res.json({ ok: true });
    }
    if (typeof req.body?.auto_post === "boolean" && m.status === "confirmed") {
      await query(`UPDATE memorials SET auto_post=$2 WHERE id=$1`, [id, req.body.auto_post]);
      return res.json({ ok: true });
    }
    if (status !== "confirmed" || m.status !== "pending") return res.status(400).json({ error: "طلب غير صالح" });
    const upd = await query(`UPDATE memorials SET status='confirmed', reviewed_by=$2, reviewed_at=NOW(), purge_at=NOW() + ($3 || ' hours')::interval
      WHERE id=$1 AND status='pending' RETURNING purge_at`, [id, u!.id, String(GRACE_HOURS)]);
    if (!upd.rows.length) return res.status(409).json({ error: "رُوجع هذا البلاغ مسبقاً" });
    logger.info({ memorial: id, user: m.user_id, by: u!.id }, "[memorial] confirmed — grace period started");
    notifyUser(m.user_id, "تأكيد بلاغ الوفاة", `سيُحوَّل هذا الحساب إلى صفحة تذكارية بعد ${GRACE_HOURS} ساعة. إن كنت صاحبه وأنت بخير فاضغط هنا للاعتراض.`, { memorial_id: id, action: "object" }).catch(() => {});
    notifyUser(m.reporter_id, "تأكد البلاغ", `أحسن الله عزاءكم. يكتمل تحويل الحساب إلى صفحة تذكارية خلال ${GRACE_HOURS} ساعة.`).catch(() => {});
    return res.json({ ok: true, purge_at: upd.rows[0].purge_at });
  } catch (e: any) { logger.error({ err: e?.message }, "memorial review"); return res.status(500).json({ error: "Server error" }); }
});

/** بانتهاء المهلة: حذف آثار الحساب في معاملة واحدة ثم تحويله إلى حساب تذكاري */
export async function purgeMemorial(id: number): Promise<Record<string, number> | null> {
  const c = await dbClient();
  const removed: Record<string, number> = {};
  try {
    await c.query("BEGIN");
    const m = (await c.query(`SELECT * FROM memorials WHERE id=$1 AND status='confirmed' AND purged_at IS NULL AND purge_at <= NOW() FOR UPDATE`, [id])).rows[0];
    if (!m) { await c.query("ROLLBACK"); return null; }
    // كل حذف داخل نقطة حفظ: إن لم يوجد جدول (نسخة قديمة) لا تفشل المعاملة كلها
    const del = async (label: string, sql: string) => {
      await c.query("SAVEPOINT sp");
      try { const r = await c.query(sql, [m.user_id]); removed[label] = r.rowCount ?? 0; await c.query("RELEASE SAVEPOINT sp"); }
      catch { await c.query("ROLLBACK TO SAVEPOINT sp"); removed[label] = 0; }
    };
    await del("comments", `DELETE FROM social_comments WHERE author_id=$1`);
    await del("likes", `DELETE FROM social_likes WHERE user_id=$1`);
    await del("posts", `DELETE FROM social_posts WHERE author_id=$1`);
    await del("messages", `DELETE FROM chat_messages WHERE sender_id=$1`);
    await del("chats", `DELETE FROM chats WHERE user1_id=$1 OR user2_id=$1`);
    await del("sessions", `DELETE FROM user_sessions WHERE user_id=$1`);
    await c.query(`UPDATE users SET is_memorial=TRUE, is_banned=TRUE WHERE id=$1`, [m.user_id]);
    await c.query(`UPDATE memorials SET purged_at=NOW() WHERE id=$1`, [id]);
    await c.query("COMMIT");
    logger.info({ memorial: id, user: m.user_id, removed }, "[memorial] purged after grace period");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
  finally { c.release(); }
  await postSadaqa(id).catch(() => {});
  return removed;
}

/** مهمة دورية: تحويل الحسابات المنتهية مهلتها + منشور يومي لكل حساب تذكاري */
export async function runMemorialJobs(): Promise<{ purged: number; posted: number }> {
  await ensureMemorialsDb();
  let purged = 0, posted = 0;
  const due = await query(`SELECT id FROM memorials WHERE status='confirmed' AND purged_at IS NULL AND purge_at <= NOW() LIMIT 20`);
  for (const r of due.rows) if (await purgeMemorial(r.id).catch((e) => { logger.warn({ err: e?.message }, "[memorial] purge failed"); return null; })) purged++;
  const hour = (new Date().getUTCHours() + 2) % 24;
  if (hour >= 7 && hour <= 21) {
    const daily = await query(`SELECT id FROM memorials WHERE status='confirmed' AND purged_at IS NOT NULL AND auto_post AND (last_post_at IS NULL OR last_post_at < NOW() - INTERVAL '23 hours') LIMIT 50`);
    for (const r of daily.rows) if (await postSadaqa(r.id).catch((e) => { logger.warn({ err: e?.message }, "[memorial] post failed"); return false; })) posted++;
  }
  return { purged, posted };
}

// POST /api/memorials/cron/run — من GitHub Actions كل ساعة (OIDC)
router.post("/memorials/cron/run", async (req: Request, res: Response) => {
  if (!(await cronAuth(req))) return res.status(401).json({ error: "unauthorized" });
  try { return res.json({ ok: true, ...(await runMemorialJobs()) }); }
  catch (e: any) { logger.error({ err: e?.message }, "[memorial] cron"); return res.status(500).json({ ok: false }); }
});

/** ينشر المنشور التالي من مكتبة الصدقة الجارية نيابةً عن المتوفى */
export async function postSadaqa(memorialId: number): Promise<boolean> {
  const m = (await query(
    `SELECT m.id, m.user_id, m.posts_count, u.name, u.gender FROM memorials m JOIN users u ON u.id=m.user_id WHERE m.id=$1 AND m.status='confirmed' AND m.purged_at IS NOT NULL AND m.auto_post`, [memorialId])).rows[0];
  if (!m) return false;
  const female = m.gender === "female";
  const body = render(SADAQA_LIBRARY[m.posts_count % SADAQA_LIBRARY.length], m.name, female);
  const content = `${body}\n\n🕊️ صدقة جارية عن روح ${m.name}، ${female ? "رحمها" : "رحمه"} الله — ادعُ ${female ? "لها" : "له"} بالرحمة والمغفرة.`;
  await query(`INSERT INTO social_posts (author_id, author_name, content, category) VALUES ($1,$2,$3,'صدقة جارية')`, [m.user_id, m.name, content]);
  await query(`UPDATE memorials SET posts_count=posts_count+1, last_post_at=NOW() WHERE id=$1`, [m.id]);
  return true;
}

/** جدولة: منشور واحد يومياً لكل حساب تذكاري (بعد السابعة صباحاً بتوقيت السودان) */
export function startMemorialScheduler() {
  const tick = () => runMemorialJobs().catch((e) => logger.warn({ err: e?.message }, "[memorial] scheduler"));
  setTimeout(tick, 120_000);
  setInterval(tick, 30 * 60_000);
}

export default router;
