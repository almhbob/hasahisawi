// ════════════════════════════════════════════════════════════════
// 🤝 التطوع: مهام تطوعية، نقاط ومستويات، وبطاقة المتطوع (مدفوعة أو مجانية)
// ════════════════════════════════════════════════════════════════
// - المهام يضيفها الأدمن أو مشرف لديه صلاحية قسم "volunteer".
// - المتطوع ينضم، والمشرف يعتمد الإنجاز فتُضاف النقاط في سجل نقاط (ledger).
// - البطاقة: الإدارة تحدد السعر وتختار إظهاره أو إخفاءه. السعر مخفي = البطاقة
//   مجانية وتُصدر فوراً. السعر ظاهر = طلب ← دفع ← اعتماد الإدارة ← تفعيل.
//   صالحة لمدة تحددها الإدارة (12 شهراً افتراضياً) وتُجدَّد بنفس الطريقة.
import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, dbEnabled, type SessionUser } from "../lib/shared-db";
import { recordAdminAlert } from "./admin-alerts";

const router = Router();

export const VOLUNTEER_LEVELS = [
  { key: "starter", name: "متطوع ناشئ", min: 0, tier: "bronze" },
  { key: "active", name: "متطوع فعّال", min: 100, tier: "silver" },
  { key: "distinguished", name: "متطوع متميز", min: 300, tier: "gold" },
  { key: "leader", name: "قائد تطوعي", min: 700, tier: "platinum" },
  { key: "ambassador", name: "سفير التطوع", min: 1500, tier: "diamond" },
] as const;

export function levelFor(points: number) {
  let idx = 0;
  VOLUNTEER_LEVELS.forEach((l, i) => { if (points >= l.min) idx = i; });
  const level = VOLUNTEER_LEVELS[idx];
  const next = VOLUNTEER_LEVELS[idx + 1] ?? null;
  const progress = next ? Math.min(1, (points - level.min) / (next.min - level.min)) : 1;
  return { ...level, index: idx, next: next ? { name: next.name, min: next.min, remaining: next.min - points } : null, progress };
}

const CATEGORIES = ["environment", "health", "education", "social", "events", "relief", "other"];

let ready: Promise<void> | null = null;
export function ensureVolunteerDb(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS volunteer_tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(160) NOT NULL,
        description TEXT,
        category VARCHAR(20) NOT NULL DEFAULT 'social',
        location VARCHAR(200),
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        points INTEGER NOT NULL DEFAULT 10 CHECK (points >= 0 AND points <= 1000),
        slots INTEGER CHECK (slots IS NULL OR slots > 0),
        status VARCHAR(10) NOT NULL DEFAULT 'open',
        image_url TEXT,
        organizer VARCHAR(160),
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS volunteer_signups (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES volunteer_tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'joined',
        hours NUMERIC(5,1),
        points_awarded INTEGER NOT NULL DEFAULT 0,
        note VARCHAR(300),
        verified_by INTEGER,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (task_id, user_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS volunteer_points (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        points INTEGER NOT NULL,
        reason VARCHAR(200) NOT NULL,
        task_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_volunteer_points_user ON volunteer_points(user_id)`);
      await query(`CREATE TABLE IF NOT EXISTS volunteer_cards (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        card_no VARCHAR(20) NOT NULL UNIQUE,
        kind VARCHAR(8) NOT NULL DEFAULT 'new',
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        level_key VARCHAR(20),
        amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        payment_ref VARCHAR(120),
        issued_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        reviewed_by INTEGER,
        review_note VARCHAR(300),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_volunteer_cards_user ON volunteer_cards(user_id, created_at DESC)`);
      for (const [k, v] of [
        ["volunteer_card_price", "0"],
        ["volunteer_card_price_visible", "false"],
        ["volunteer_card_months", "12"],
        ["volunteer_card_payment_info", ""],
        ["volunteer_card_currency", "جنيه"],
      ]) {
        await query(`INSERT INTO admin_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [k, v]);
      }
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** الأدمن والمشرف العام، أو مشرف مُنح صلاحية قسم معيّن (volunteer / contests). */
export async function canManageSection(u: SessionUser | null, section: string): Promise<boolean> {
  if (!u) return false;
  if (u.role === "admin") return true;
  try {
    const r = await query(`SELECT 1 FROM moderator_permissions WHERE user_id=$1 AND section=$2 LIMIT 1`, [u.id, section]);
    if (r.rows[0]) return true;
  } catch {}
  return false;
}

async function settings() {
  await ensureVolunteerDb();
  const r = await query(`SELECT key, value FROM admin_settings WHERE key LIKE 'volunteer_card_%'`);
  const m: Record<string, string> = Object.fromEntries(r.rows.map((x: any) => [x.key, x.value]));
  const price = Math.max(0, Number(m.volunteer_card_price) || 0);
  const visible = m.volunteer_card_price_visible === "true";
  return {
    price,
    priceVisible: visible,
    /** الرسوم مطلوبة فقط إذا أظهرتها الإدارة وكانت أكبر من صفر */
    feeRequired: visible && price > 0,
    months: Math.min(60, Math.max(1, Number(m.volunteer_card_months) || 12)),
    paymentInfo: m.volunteer_card_payment_info || "",
    currency: m.volunteer_card_currency || "جنيه",
  };
}

async function pointsOf(userId: number) {
  const r = await query(
    `SELECT COALESCE(SUM(points),0)::int AS points,
            (SELECT COUNT(*)::int FROM volunteer_signups WHERE user_id=$1 AND status='completed') AS tasks,
            (SELECT COALESCE(SUM(hours),0)::float FROM volunteer_signups WHERE user_id=$1 AND status='completed') AS hours
       FROM volunteer_points WHERE user_id=$1`, [userId]);
  return r.rows[0] as { points: number; tasks: number; hours: number };
}

function newCardNo() {
  // HSV-26-XXXXXX : سنة الإصدار + 6 خانات عشوائية سهلة القراءة (بدون O/0/I/1)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return `HSV-${String(new Date().getFullYear()).slice(2)}-${code}`;
}

function cleanTask(b: any) {
  const title = String(b?.title || "").trim().slice(0, 160);
  const points = Math.round(Number(b?.points));
  const slots = b?.slots === null || b?.slots === "" || b?.slots === undefined ? null : Math.round(Number(b.slots));
  return {
    title,
    description: String(b?.description || "").trim().slice(0, 4000) || null,
    category: CATEGORIES.includes(b?.category) ? b.category : "social",
    location: String(b?.location || "").trim().slice(0, 200) || null,
    starts_at: b?.starts_at ? new Date(b.starts_at) : null,
    ends_at: b?.ends_at ? new Date(b.ends_at) : null,
    points: Number.isFinite(points) ? Math.min(1000, Math.max(0, points)) : 10,
    slots: slots && slots > 0 ? slots : null,
    image_url: String(b?.image_url || "").trim() || null,
    organizer: String(b?.organizer || "").trim().slice(0, 160) || null,
  };
}

const fail = (res: Response, err: unknown, tag: string, msg = "تعذّر التنفيذ") => {
  logger.error({ err }, `[volunteer] ${tag}`);
  return res.status(500).json({ error: msg });
};

// ── المهام ──────────────────────────────────────────────────────
router.get("/volunteer/tasks", async (req: Request, res: Response) => {
  try {
    await ensureVolunteerDb();
    const me = await sessionUser(req);
    const status = String(req.query.status || "open");
    const r = await query(
      `SELECT t.*,
              (SELECT COUNT(*)::int FROM volunteer_signups s WHERE s.task_id=t.id AND s.status IN ('joined','completed')) AS joined_count,
              (SELECT s.status FROM volunteer_signups s WHERE s.task_id=t.id AND s.user_id=$2) AS my_status
         FROM volunteer_tasks t
        WHERE ($1='all' OR t.status=$1)
        ORDER BY (t.status='open') DESC, COALESCE(t.starts_at, t.created_at) DESC
        LIMIT 200`, [status, me ? me.id : 0]);
    return res.json(r.rows);
  } catch (err) { return fail(res, err, "list", "تعذّر التحميل"); }
});

router.post("/volunteer/tasks", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureVolunteerDb();
    const t = cleanTask(req.body);
    if (t.title.length < 3) return res.status(400).json({ error: "عنوان المهمة مطلوب" });
    const r = await query(
      `INSERT INTO volunteer_tasks (title, description, category, location, starts_at, ends_at, points, slots, image_url, organizer, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [t.title, t.description, t.category, t.location, t.starts_at, t.ends_at, t.points, t.slots, t.image_url, t.organizer, me!.id]);
    return res.json(r.rows[0]);
  } catch (err) { return fail(res, err, "create"); }
});

router.patch("/volunteer/tasks/:id", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureVolunteerDb();
    const cur = (await query(`SELECT * FROM volunteer_tasks WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "المهمة غير موجودة" });
    const t = cleanTask({ ...cur, ...req.body });
    const status = ["open", "closed", "done"].includes(req.body?.status) ? req.body.status : cur.status;
    const r = await query(
      `UPDATE volunteer_tasks SET title=$1, description=$2, category=$3, location=$4, starts_at=$5, ends_at=$6,
              points=$7, slots=$8, image_url=$9, organizer=$10, status=$11 WHERE id=$12 RETURNING *`,
      [t.title, t.description, t.category, t.location, t.starts_at, t.ends_at, t.points, t.slots, t.image_url, t.organizer, status, cur.id]);
    return res.json(r.rows[0]);
  } catch (err) { return fail(res, err, "update"); }
});

router.delete("/volunteer/tasks/:id", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureVolunteerDb();
    // النقاط الممنوحة تبقى في سجل النقاط حتى لو حُذفت المهمة
    await query(`DELETE FROM volunteer_tasks WHERE id=$1`, [Number(req.params.id)]);
    return res.json({ success: true });
  } catch (err) { return fail(res, err, "delete"); }
});

router.post("/volunteer/tasks/:id/join", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول للتطوع" });
    await ensureVolunteerDb();
    const t = (await query(`SELECT * FROM volunteer_tasks WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!t) return res.status(404).json({ error: "المهمة غير موجودة" });
    if (t.status !== "open") return res.status(400).json({ error: "التسجيل في هذه المهمة مغلق" });
    if (t.slots) {
      const c = (await query(`SELECT COUNT(*)::int AS n FROM volunteer_signups WHERE task_id=$1 AND status IN ('joined','completed') AND user_id<>$2`, [t.id, me.id])).rows[0].n;
      if (c >= t.slots) return res.status(400).json({ error: "اكتمل عدد المتطوعين لهذه المهمة" });
    }
    const r = await query(
      `INSERT INTO volunteer_signups (task_id, user_id) VALUES ($1,$2)
       ON CONFLICT (task_id, user_id) DO UPDATE SET status = CASE WHEN volunteer_signups.status IN ('cancelled') THEN 'joined' ELSE volunteer_signups.status END
       RETURNING status`, [t.id, me.id]);
    return res.json({ success: true, status: r.rows[0].status });
  } catch (err) { return fail(res, err, "join"); }
});

router.delete("/volunteer/tasks/:id/join", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    await ensureVolunteerDb();
    await query(`UPDATE volunteer_signups SET status='cancelled' WHERE task_id=$1 AND user_id=$2 AND status='joined'`, [Number(req.params.id), me.id]);
    return res.json({ success: true });
  } catch (err) { return fail(res, err, "leave"); }
});

router.get("/volunteer/tasks/:id/signups", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureVolunteerDb();
    const r = await query(
      `SELECT s.*, u.name, u.phone, u.avatar_url
         FROM volunteer_signups s JOIN users u ON u.id=s.user_id
        WHERE s.task_id=$1 AND s.status<>'cancelled'
        ORDER BY s.created_at`, [Number(req.params.id)]);
    return res.json(r.rows);
  } catch (err) { return fail(res, err, "signups", "تعذّر التحميل"); }
});

/** اعتماد إنجاز المتطوع أو رفضه. action: complete | reject */
router.post("/volunteer/signups/:id/review", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureVolunteerDb();
    const s = (await query(
      `SELECT s.*, t.points AS task_points, t.title FROM volunteer_signups s JOIN volunteer_tasks t ON t.id=s.task_id WHERE s.id=$1`,
      [Number(req.params.id)])).rows[0];
    if (!s) return res.status(404).json({ error: "التسجيل غير موجود" });
    const action = String(req.body?.action);
    if (action === "reject") {
      if (s.status === "completed") await query(`DELETE FROM volunteer_points WHERE user_id=$1 AND task_id=$2`, [s.user_id, s.task_id]);
      await query(`UPDATE volunteer_signups SET status='rejected', points_awarded=0, verified_by=$1, verified_at=NOW(), note=$2 WHERE id=$3`,
        [me!.id, String(req.body?.note || "").slice(0, 300) || null, s.id]);
      return res.json({ success: true });
    }
    if (action !== "complete") return res.status(400).json({ error: "إجراء غير صالح" });
    if (s.status === "completed") return res.json({ success: true, already: true });
    const pts = Number.isFinite(Number(req.body?.points)) ? Math.min(1000, Math.max(0, Math.round(Number(req.body.points)))) : s.task_points;
    const hours = Number.isFinite(Number(req.body?.hours)) ? Math.min(999, Math.max(0, Number(req.body.hours))) : null;
    await query(`UPDATE volunteer_signups SET status='completed', points_awarded=$1, hours=$2, verified_by=$3, verified_at=NOW() WHERE id=$4`,
      [pts, hours, me!.id, s.id]);
    if (pts > 0) {
      await query(`INSERT INTO volunteer_points (user_id, points, reason, task_id, created_by) VALUES ($1,$2,$3,$4,$5)`,
        [s.user_id, pts, `إنجاز مهمة: ${s.title}`.slice(0, 200), s.task_id, me!.id]);
    }
    const body = `أُضيفت ${pts} نقطة تطوعية لإنجازك «${s.title}». شكراً لعطائك!`;
    await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'volunteer',$2,$3,$4)`,
      [s.user_id, "🤝 نقاط تطوع جديدة", body, JSON.stringify({ type: "volunteer", screen: "volunteer" })]).catch(() => {});
    return res.json({ success: true, points: pts });
  } catch (err) { return fail(res, err, "review"); }
});

/** نقاط إضافية يمنحها المشرف يدوياً (مبادرة، تميّز…) أو يخصمها. */
router.post("/volunteer/users/:id/points", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureVolunteerDb();
    const pts = Math.round(Number(req.body?.points));
    const reason = String(req.body?.reason || "").trim().slice(0, 200);
    if (!Number.isFinite(pts) || pts === 0 || Math.abs(pts) > 1000) return res.status(400).json({ error: "عدد نقاط غير صالح" });
    if (reason.length < 3) return res.status(400).json({ error: "اكتب سبب النقاط" });
    await query(`INSERT INTO volunteer_points (user_id, points, reason, created_by) VALUES ($1,$2,$3,$4)`, [Number(req.params.id), pts, reason, me!.id]);
    return res.json({ success: true });
  } catch (err) { return fail(res, err, "points"); }
});

// ── ملخص المتطوع ────────────────────────────────────────────────
async function cardFor(userId: number) {
  const r = await query(`SELECT * FROM volunteer_cards WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId]);
  const c = r.rows[0];
  if (!c) return null;
  if (c.status === "active" && c.expires_at && new Date(c.expires_at) < new Date()) {
    await query(`UPDATE volunteer_cards SET status='expired' WHERE id=$1`, [c.id]);
    c.status = "expired";
  }
  return c;
}

router.get("/volunteer/me", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    await ensureVolunteerDb();
    const sum = await pointsOf(me.id);
    const history = (await query(
      `SELECT p.points, p.reason, p.created_at FROM volunteer_points p WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 50`, [me.id])).rows;
    const myTasks = (await query(
      `SELECT s.status, s.points_awarded, s.hours::float AS hours, t.id AS task_id, t.title, t.starts_at
         FROM volunteer_signups s JOIN volunteer_tasks t ON t.id=s.task_id
        WHERE s.user_id=$1 AND s.status<>'cancelled' ORDER BY s.created_at DESC LIMIT 50`, [me.id])).rows;
    const card = await cardFor(me.id);
    const cfg = await settings();
    return res.json({
      ...sum, level: levelFor(sum.points), history, myTasks, card,
      cardConfig: { feeRequired: cfg.feeRequired, price: cfg.priceVisible ? cfg.price : null, currency: cfg.currency, months: cfg.months, paymentInfo: cfg.feeRequired ? cfg.paymentInfo : "" },
      canManage: await canManageSection(me, "volunteer"),
    });
  } catch (err) { return fail(res, err, "me", "تعذّر التحميل"); }
});

/** ملخص عام لملف المستخدم المهني. */
router.get("/volunteer/users/:id/summary", async (req: Request, res: Response) => {
  try {
    await ensureVolunteerDb();
    const id = Number(req.params.id);
    const sum = await pointsOf(id);
    const c = await cardFor(id);
    return res.json({
      ...sum, level: levelFor(sum.points),
      card: c && c.status === "active" ? { card_no: c.card_no, expires_at: c.expires_at } : null,
    });
  } catch (err) { return fail(res, err, "summary", "تعذّر التحميل"); }
});

router.get("/volunteer/leaderboard", async (_req: Request, res: Response) => {
  try {
    await ensureVolunteerDb();
    const r = await query(
      `SELECT u.id, u.name, u.avatar_url, COALESCE(u.is_verified,false) AS is_verified, SUM(p.points)::int AS points
         FROM volunteer_points p JOIN users u ON u.id=p.user_id
        WHERE COALESCE(u.is_banned,false)=false
        GROUP BY u.id HAVING SUM(p.points) > 0
        ORDER BY points DESC LIMIT 50`);
    return res.json(r.rows.map((x: any) => ({ ...x, level: levelFor(x.points) })));
  } catch (err) { return fail(res, err, "leaderboard", "تعذّر التحميل"); }
});

// ── البطاقة ─────────────────────────────────────────────────────
/** طلب بطاقة جديدة أو تجديدها. */
router.post("/volunteer/card/request", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    await ensureVolunteerDb();
    const sum = await pointsOf(me.id);
    if (sum.tasks < 1) return res.status(400).json({ error: "أكمل مهمة تطوعية واحدة على الأقل لتحصل على البطاقة" });
    const cfg = await settings();
    const cur = await cardFor(me.id);
    if (cur?.status === "pending") return res.status(400).json({ error: "لديك طلب قيد المراجعة" });
    const renewing = !!cur && (cur.status === "active" || cur.status === "expired");
    if (cur?.status === "active" && cur.expires_at && new Date(cur.expires_at).getTime() - Date.now() > 30 * 86400_000) {
      return res.status(400).json({ error: "يمكنك التجديد خلال آخر 30 يوماً من صلاحية البطاقة" });
    }
    const level = levelFor(sum.points).key;
    const cardNo = renewing ? cur!.card_no : newCardNo();
    const paymentRef = String(req.body?.payment_ref || "").trim().slice(0, 120) || null;

    if (!cfg.feeRequired) {
      // مجانية: تُصدر فوراً. التجديد يمدد من تاريخ الانتهاء إن لم تنتهِ بعد
      const base = cur?.status === "active" && cur.expires_at && new Date(cur.expires_at) > new Date() ? new Date(cur.expires_at) : new Date();
      const expires = new Date(base); expires.setMonth(expires.getMonth() + cfg.months);
      const r = renewing
        // التجديد يحتفظ برقم البطاقة نفسه ويمدّد صلاحيتها
        ? await query(`UPDATE volunteer_cards SET status='active', kind='renew', level_key=$1, issued_at=NOW(), expires_at=$2 WHERE id=$3 RETURNING *`,
            [level, expires, cur!.id])
        : await query(
            `INSERT INTO volunteer_cards (user_id, card_no, kind, status, level_key, amount, issued_at, expires_at)
             VALUES ($1,$2,'new','active',$3,0,NOW(),$4) RETURNING *`,
            [me.id, cardNo, level, expires]);
      return res.json({ success: true, card: r.rows[0] });
    }

    if (!paymentRef) return res.status(400).json({ error: "أدخل رقم إيصال الدفع أو مرجع التحويل" });
    let card;
    if (renewing) {
      card = (await query(
        `UPDATE volunteer_cards SET status='pending', kind='renew', level_key=$1, amount=$2, payment_ref=$3, review_note=NULL WHERE id=$4 RETURNING *`,
        [level, cfg.price, paymentRef, cur!.id])).rows[0];
      // نحفظ الصلاحية الحالية لتمديدها عند الاعتماد
    } else {
      card = (await query(
        `INSERT INTO volunteer_cards (user_id, card_no, kind, status, level_key, amount, payment_ref) VALUES ($1,$2,'new','pending',$3,$4,$5) RETURNING *`,
        [me.id, cardNo, level, cfg.price, paymentRef])).rows[0];
    }
    recordAdminAlert({
      kind: "volunteer_card", title: renewing ? "🎖️ طلب تجديد بطاقة متطوع" : "🎖️ طلب بطاقة متطوع جديدة",
      body: `${me.name} · ${cfg.price} ${cfg.currency} · مرجع الدفع: ${paymentRef}`, screen: "volunteer-admin", refId: String(card.id),
    }).catch(() => {});
    return res.json({ success: true, card });
  } catch (err) { return fail(res, err, "card-request"); }
});

/** صفحة تحقق عامة من البطاقة (يفتحها رمز QR المطبوع عليها). */
router.get("/public/volunteer-card/:no", async (req: Request, res: Response) => {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  try {
    await ensureVolunteerDb();
    const r = await query(
      `SELECT c.*, u.name FROM volunteer_cards c JOIN users u ON u.id=c.user_id WHERE c.card_no=$1 ORDER BY c.created_at DESC LIMIT 1`,
      [String(req.params.no).slice(0, 20)]);
    const c = r.rows[0];
    const valid = c && c.status === "active" && c.expires_at && new Date(c.expires_at) > new Date();
    const lv = c ? VOLUNTEER_LEVELS.find((l) => l.key === c.level_key)?.name : "";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>التحقق من بطاقة متطوع</title>
<body style="margin:0;font-family:Cairo,Tahoma,sans-serif;background:#0B1F3A;color:#F4E9C8;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="max-width:420px;margin:24px;padding:28px;border-radius:20px;background:#102A4C;border:1px solid #C9A227;text-align:center">
<div style="font-size:14px;color:#C9A227;letter-spacing:1px">حصاحيصاوي · بطاقة متطوع</div>
${c ? `<h2 style="margin:14px 0 4px">${esc(c.name)}</h2><div>${esc(lv)}</div><div style="margin-top:8px;font-family:monospace;color:#C9A227">${esc(c.card_no)}</div>
<div style="margin-top:18px;padding:10px;border-radius:10px;background:${valid ? "#0E5A3A" : "#5A1E1E"}">${valid ? "✔ بطاقة سارية حتى " + new Date(c.expires_at).toLocaleDateString("ar-EG") : "✖ البطاقة غير سارية"}</div>`
  : `<h2>البطاقة غير موجودة</h2>`}
</div></body></html>`);
  } catch (err) {
    logger.error({ err }, "[volunteer] verify");
    return res.status(500).send("خطأ");
  }
});

// ── إدارة البطاقات والإعدادات ──────────────────────────────────
router.get("/admin/volunteer/cards", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureVolunteerDb();
    const r = await query(
      `SELECT c.*, u.name, u.phone FROM volunteer_cards c JOIN users u ON u.id=c.user_id
        WHERE ($1='all' OR c.status=$1) ORDER BY c.created_at DESC LIMIT 200`, [String(req.query.status || "pending")]);
    return res.json(r.rows);
  } catch (err) { return fail(res, err, "cards", "تعذّر التحميل"); }
});

router.post("/admin/volunteer/cards/:id/review", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureVolunteerDb();
    const c = (await query(`SELECT * FROM volunteer_cards WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!c || c.status !== "pending") return res.status(400).json({ error: "لا يوجد طلب معلّق" });
    const note = String(req.body?.note || "").slice(0, 300) || null;
    if (req.body?.action === "reject") {
      // التجديد المرفوض يعيد البطاقة لحالتها السابقة حسب تاريخها
      const back = c.kind === "renew" && c.expires_at ? (new Date(c.expires_at) > new Date() ? "active" : "expired") : "rejected";
      await query(`UPDATE volunteer_cards SET status=$1, reviewed_by=$2, review_note=$3 WHERE id=$4`, [back, me!.id, note, c.id]);
      await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'volunteer',$2,$3,$4)`,
        [c.user_id, "بطاقة المتطوع", `لم يُعتمد طلبك${note ? `: ${note}` : ""}`, JSON.stringify({ type: "volunteer", screen: "volunteer" })]).catch(() => {});
      return res.json({ success: true });
    }
    const cfg = await settings();
    const base = c.kind === "renew" && c.expires_at && new Date(c.expires_at) > new Date() ? new Date(c.expires_at) : new Date();
    const expires = new Date(base); expires.setMonth(expires.getMonth() + cfg.months);
    await query(`UPDATE volunteer_cards SET status='active', issued_at=NOW(), expires_at=$1, reviewed_by=$2, review_note=$3 WHERE id=$4`,
      [expires, me!.id, note, c.id]);
    await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'volunteer',$2,$3,$4)`,
      [c.user_id, "🎖️ بطاقة المتطوع جاهزة", "اعتُمدت بطاقتك. يمكنك تحميلها الآن من قسم التطوع.", JSON.stringify({ type: "volunteer", screen: "volunteer" })]).catch(() => {});
    return res.json({ success: true });
  } catch (err) { return fail(res, err, "card-review"); }
});

router.get("/admin/volunteer/settings", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "volunteer"))) return res.status(403).json({ error: "غير مصرح" });
    return res.json(await settings());
  } catch (err) { return fail(res, err, "settings", "تعذّر التحميل"); }
});

router.put("/admin/volunteer/settings", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    // السعر قرار مالي: للأدمن فقط
    if (!me || me.role !== "admin") return res.status(403).json({ error: "للأدمن فقط" });
    await ensureVolunteerDb();
    const b = req.body || {};
    const set = (k: string, v: string) => query(`INSERT INTO admin_settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`, [k, v]);
    if (b.price !== undefined) await set("volunteer_card_price", String(Math.max(0, Number(b.price) || 0)));
    if (b.priceVisible !== undefined) await set("volunteer_card_price_visible", b.priceVisible ? "true" : "false");
    if (b.months !== undefined) await set("volunteer_card_months", String(Math.min(60, Math.max(1, Number(b.months) || 12))));
    if (b.paymentInfo !== undefined) await set("volunteer_card_payment_info", String(b.paymentInfo).slice(0, 600));
    if (b.currency !== undefined) await set("volunteer_card_currency", String(b.currency).slice(0, 20) || "جنيه");
    return res.json(await settings());
  } catch (err) { return fail(res, err, "settings-save"); }
});

export default router;
