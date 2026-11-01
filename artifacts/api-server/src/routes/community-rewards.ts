// ════════════════════════════════════════════════════════════════
// 🤝 نقاط التطوع + 🏆 المسابقات
// — فرص تطوع ينشرها المشرفون، تسجيل الأعضاء، تأكيد الحضور يمنح النقاط
// — سجل نقاط موحّد (community_points) ومستويات ولوحة شرف
// — مسابقات أسئلة (تصحيح تلقائي) ومسابقات مشاركة (صورة/نص) مع إعلان الفائزين
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, dbEnabled } from "../lib/shared-db";

const router = Router();

export const LEVELS = [
  { key: "bronze", name: "برونزي", min: 0 },
  { key: "silver", name: "فضي", min: 100 },
  { key: "gold", name: "ذهبي", min: 300 },
  { key: "platinum", name: "بلاتيني", min: 700 },
];
export function levelFor(points: number) {
  let cur = LEVELS[0], next: typeof LEVELS[number] | null = null;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].min) { cur = LEVELS[i]; next = LEVELS[i + 1] || null; }
  return { ...cur, next: next ? { name: next.name, min: next.min, remaining: next.min - points } : null };
}

let ready: Promise<void> | null = null;
export function ensureRewards(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS community_points (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        points INTEGER NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'volunteer',
        reason VARCHAR(200) NOT NULL,
        ref_type VARCHAR(30), ref_id INTEGER,
        granted_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_cpoints_user ON community_points(user_id, created_at DESC)`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_cpoints_ref ON community_points(user_id, ref_type, ref_id) WHERE ref_type IS NOT NULL`);
      await query(`CREATE TABLE IF NOT EXISTS volunteer_opportunities (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        org_name VARCHAR(150),
        location VARCHAR(200),
        starts_at TIMESTAMPTZ,
        duration_hours NUMERIC(5,1),
        points INTEGER NOT NULL DEFAULT 10,
        slots INTEGER,
        cover_url TEXT,
        contact_phone VARCHAR(30),
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS volunteer_signups (
        opportunity_id INTEGER NOT NULL REFERENCES volunteer_opportunities(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'registered',
        note VARCHAR(300),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (opportunity_id, user_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS competitions (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        kind VARCHAR(20) NOT NULL DEFAULT 'quiz',
        prize VARCHAR(200),
        points_first INTEGER NOT NULL DEFAULT 50,
        points_participation INTEGER NOT NULL DEFAULT 5,
        cover_url TEXT,
        starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ends_at TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        questions JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS competition_entries (
        id SERIAL PRIMARY KEY,
        competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        answers JSONB,
        content TEXT,
        image_url TEXT,
        score INTEGER NOT NULL DEFAULT 0,
        duration_sec INTEGER,
        rank INTEGER,
        is_winner BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (competition_id, user_id)
      )`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

router.use(["/volunteer", "/competitions", "/points"], async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureRewards(); return next(); }
  catch (err) { logger.error({ err }, "[rewards] ensure"); return res.status(500).json({ error: "تعذّر التهيئة" }); }
});

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, def: number, min = 0, max = 100000) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def; };
const httpsUrl = (v: unknown) => { const s = str(v, 600); return /^https:\/\//i.test(s) ? s : null; };
const isoOrNull = (v: unknown) => { const s = str(v, 40); const d = s ? new Date(s) : null; return d && !isNaN(+d) ? d.toISOString() : null; };

async function pushTo(userIds: number[], title: string, body: string, data: Record<string, unknown>) {
  if (!userIds.length) return;
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [userIds]);
    if (!rows.length) return;
    for (let i = 0; i < rows.length; i += 90) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(3000),
        body: JSON.stringify(rows.slice(i, i + 90).map((r: any) => ({ to: r.token, title, body, sound: "hasahisawi_notif", channelId: "hasahisawi-default-s2", priority: "high", data }))),
      }).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[rewards] push"); }
}

export async function grantPoints(userId: number, points: number, kind: string, reason: string, ref?: { type: string; id: number }, by?: number | null) {
  const r = await query(
    `INSERT INTO community_points (user_id, points, kind, reason, ref_type, ref_id, granted_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id, ref_type, ref_id) WHERE ref_type IS NOT NULL DO NOTHING RETURNING id`,
    [userId, points, kind, reason.slice(0, 200), ref?.type ?? null, ref?.id ?? null, by ?? null]);
  return !!r.rows[0];
}

async function totalFor(userId: number) {
  const r = await query(`SELECT COALESCE(SUM(points),0)::int AS total,
      COALESCE(SUM(points) FILTER (WHERE kind='volunteer'),0)::int AS volunteer,
      COALESCE(SUM(points) FILTER (WHERE kind='competition'),0)::int AS competition,
      COALESCE(SUM(points) FILTER (WHERE created_at >= date_trunc('month', NOW())),0)::int AS this_month
    FROM community_points WHERE user_id=$1`, [userId]);
  return r.rows[0];
}

// ══ النقاط ═══════════════════════════════════════════════════════
router.get("/points/me", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const t = await totalFor(Number(me.id));
    const hist = await query(`SELECT points, kind, reason, created_at FROM community_points WHERE user_id=$1 ORDER BY id DESC LIMIT 50`, [Number(me.id)]);
    const hours = await query(`SELECT COALESCE(SUM(o.duration_hours),0)::float AS h, COUNT(*)::int AS n FROM volunteer_signups s JOIN volunteer_opportunities o ON o.id=s.opportunity_id WHERE s.user_id=$1 AND s.status='attended'`, [Number(me.id)]);
    const rank = await query(`SELECT COUNT(*)::int + 1 AS r FROM (SELECT user_id, SUM(points) s FROM community_points GROUP BY user_id) x WHERE x.s > $1`, [t.total]);
    return res.json({ ...t, level: levelFor(t.total), levels: LEVELS, rank: rank.rows[0].r, volunteer_hours: hours.rows[0].h, volunteer_count: hours.rows[0].n, history: hist.rows });
  } catch (err) { logger.error({ err }, "[rewards] me"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

router.get("/points/user/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: "غير موجود" });
    const t = await totalFor(id);
    return res.json({ total: t.total, level: levelFor(t.total) });
  } catch (err) { logger.error({ err }, "[rewards] user"); return res.status(500).json({ error: "خطأ" }); }
});

router.get("/points/leaderboard", async (req: Request, res: Response) => {
  try {
    const period = req.query.period === "all" ? "all" : "month";
    const r = await query(`SELECT p.user_id AS id, u.name, u.avatar_url, COALESCE(u.is_verified,false) AS is_verified, SUM(p.points)::int AS points
      FROM community_points p JOIN users u ON u.id=p.user_id
      WHERE COALESCE(u.is_banned,false)=false ${period === "month" ? "AND p.created_at >= date_trunc('month', NOW())" : ""}
      GROUP BY p.user_id, u.name, u.avatar_url, u.is_verified HAVING SUM(p.points) > 0
      ORDER BY points DESC, MIN(p.created_at) ASC LIMIT 50`).catch(async () =>
      query(`SELECT p.user_id AS id, u.name, u.avatar_url, false AS is_verified, SUM(p.points)::int AS points FROM community_points p JOIN users u ON u.id=p.user_id
             ${period === "month" ? "WHERE p.created_at >= date_trunc('month', NOW())" : ""} GROUP BY p.user_id, u.name, u.avatar_url ORDER BY points DESC LIMIT 50`));
    return res.json({ period, users: r.rows.map((u: any) => ({ ...u, level: levelFor(u.points).name })) });
  } catch (err) { logger.error({ err }, "[rewards] board"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

// منح/خصم يدوي من الإدارة (مكافأة مبادرة، تصحيح خطأ)
router.post("/points/grant", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const userId = int(req.body?.user_id, 0, 1, 2 ** 31 - 1);
    const pts = int(req.body?.points, 0, -1000, 1000);
    const reason = str(req.body?.reason, 200);
    if (!userId || !pts || reason.length < 3) return res.status(400).json({ error: "حدّد العضو والنقاط والسبب" });
    await grantPoints(userId, pts, "manual", reason, undefined, Number(me!.id));
    if (pts > 0) pushTo([userId], "⭐ نقاط جديدة", `حصلت على ${pts} نقطة: ${reason}`, { screen: "volunteer" });
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[rewards] grant"); return res.status(500).json({ error: "خطأ" }); }
});

// ══ فرص التطوع ═══════════════════════════════════════════════════
router.get("/volunteer/opportunities", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    const scope = String(req.query.scope || "open");
    const where = scope === "past" ? `o.status IN ('closed','done') OR (o.starts_at IS NOT NULL AND o.starts_at < NOW() - INTERVAL '1 day')`
      : scope === "mine" ? `EXISTS (SELECT 1 FROM volunteer_signups s2 WHERE s2.opportunity_id=o.id AND s2.user_id=$1)`
      : `o.status='open' AND (o.starts_at IS NULL OR o.starts_at >= NOW() - INTERVAL '1 day')`;
    const r = await query(`SELECT o.*,
        (SELECT COUNT(*)::int FROM volunteer_signups s WHERE s.opportunity_id=o.id AND s.status<>'cancelled') AS registered,
        (SELECT s.status FROM volunteer_signups s WHERE s.opportunity_id=o.id AND s.user_id=$1) AS my_status
      FROM volunteer_opportunities o WHERE ${where}
      ORDER BY ${scope === "open" ? "o.starts_at ASC NULLS LAST, o.id DESC" : "o.starts_at DESC NULLS LAST, o.id DESC"} LIMIT 100`, [me ? Number(me.id) : 0]);
    return res.json({ opportunities: r.rows, can_manage: isStaff(me) });
  } catch (err) { logger.error({ err }, "[volunteer] list"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

function oppFields(b: any) {
  return {
    title: str(b?.title, 200), description: str(b?.description, 3000) || null, org_name: str(b?.org_name, 150) || null,
    location: str(b?.location, 200) || null, starts_at: isoOrNull(b?.starts_at), duration_hours: b?.duration_hours ? Math.min(Math.max(Number(b.duration_hours) || 0, 0), 240) : null,
    points: int(b?.points, 10, 1, 500), slots: b?.slots ? int(b.slots, 0, 1, 10000) : null, cover_url: httpsUrl(b?.cover_url), contact_phone: str(b?.contact_phone, 30) || null,
  };
}

router.post("/volunteer/opportunities", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "نشر الفرص للإدارة والمشرفين" });
    const f = oppFields(req.body);
    if (f.title.length < 4) return res.status(400).json({ error: "اكتب عنواناً واضحاً للفرصة" });
    const r = await query(`INSERT INTO volunteer_opportunities (title, description, org_name, location, starts_at, duration_hours, points, slots, cover_url, contact_phone, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [f.title, f.description, f.org_name, f.location, f.starts_at, f.duration_hours, f.points, f.slots, f.cover_url, f.contact_phone, Number(me!.id)]);
    if (req.body?.notify_all) {
      const ids = (await query(`SELECT DISTINCT user_id FROM push_tokens`)).rows.map((x: any) => Number(x.user_id));
      pushTo(ids, "🤝 فرصة تطوع جديدة", `${f.title} — ${f.points} نقطة`, { screen: "volunteer", id: r.rows[0].id });
    }
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "[volunteer] create"); return res.status(500).json({ error: "تعذّر النشر" }); }
});

router.patch("/volunteer/opportunities/:id", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const id = Number(req.params.id);
    if (req.body?.status && Object.keys(req.body).length === 1) {
      const st = ["open", "closed", "done", "cancelled"].includes(req.body.status) ? req.body.status : null;
      if (!st) return res.status(400).json({ error: "حالة غير صالحة" });
      const r = await query(`UPDATE volunteer_opportunities SET status=$1 WHERE id=$2 RETURNING *`, [st, id]);
      return r.rows[0] ? res.json(r.rows[0]) : res.status(404).json({ error: "غير موجودة" });
    }
    const f = oppFields(req.body);
    if (f.title.length < 4) return res.status(400).json({ error: "اكتب عنواناً واضحاً للفرصة" });
    const r = await query(`UPDATE volunteer_opportunities SET title=$1, description=$2, org_name=$3, location=$4, starts_at=$5, duration_hours=$6, points=$7, slots=$8, cover_url=$9, contact_phone=$10 WHERE id=$11 RETURNING *`,
      [f.title, f.description, f.org_name, f.location, f.starts_at, f.duration_hours, f.points, f.slots, f.cover_url, f.contact_phone, id]);
    return r.rows[0] ? res.json(r.rows[0]) : res.status(404).json({ error: "غير موجودة" });
  } catch (err) { logger.error({ err }, "[volunteer] edit"); return res.status(500).json({ error: "تعذّر الحفظ" }); }
});

router.post("/volunteer/opportunities/:id/signup", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول للتطوع" });
    const id = Number(req.params.id);
    const o = (await query(`SELECT o.*, (SELECT COUNT(*)::int FROM volunteer_signups s WHERE s.opportunity_id=o.id AND s.status<>'cancelled') AS registered FROM volunteer_opportunities o WHERE id=$1`, [id])).rows[0];
    if (!o) return res.status(404).json({ error: "الفرصة غير موجودة" });
    if (o.status !== "open") return res.status(400).json({ error: "التسجيل مغلق لهذه الفرصة" });
    const existing = (await query(`SELECT status FROM volunteer_signups WHERE opportunity_id=$1 AND user_id=$2`, [id, Number(me.id)])).rows[0];
    if (existing && existing.status !== "cancelled") return res.status(400).json({ error: "أنت مسجّل بالفعل" });
    if (o.slots && o.registered >= o.slots) return res.status(400).json({ error: "اكتمل العدد المطلوب" });
    await query(`INSERT INTO volunteer_signups (opportunity_id, user_id, note) VALUES ($1,$2,$3)
      ON CONFLICT (opportunity_id, user_id) DO UPDATE SET status='registered', note=EXCLUDED.note, created_at=NOW()`, [id, Number(me.id), str(req.body?.note, 300) || null]);
    return res.json({ ok: true, status: "registered" });
  } catch (err) { logger.error({ err }, "[volunteer] signup"); return res.status(500).json({ error: "تعذّر التسجيل" }); }
});

router.delete("/volunteer/opportunities/:id/signup", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const r = await query(`UPDATE volunteer_signups SET status='cancelled' WHERE opportunity_id=$1 AND user_id=$2 AND status='registered' RETURNING 1`, [Number(req.params.id), Number(me.id)]);
    return r.rows.length ? res.json({ ok: true }) : res.status(400).json({ error: "لا يمكن إلغاء هذا التسجيل" });
  } catch (err) { logger.error({ err }, "[volunteer] cancel"); return res.status(500).json({ error: "خطأ" }); }
});

router.get("/volunteer/opportunities/:id/signups", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const r = await query(`SELECT s.user_id AS id, u.name, u.phone, u.avatar_url, s.status, s.note, s.created_at
      FROM volunteer_signups s JOIN users u ON u.id=s.user_id WHERE s.opportunity_id=$1 AND s.status<>'cancelled' ORDER BY s.created_at`, [Number(req.params.id)]);
    return res.json({ signups: r.rows });
  } catch (err) { logger.error({ err }, "[volunteer] signups"); return res.status(500).json({ error: "خطأ" }); }
});

// تأكيد الحضور (يمنح النقاط مرة واحدة) أو تسجيل غياب
router.post("/volunteer/opportunities/:id/attendance", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const id = Number(req.params.id);
    const o = (await query(`SELECT * FROM volunteer_opportunities WHERE id=$1`, [id])).rows[0];
    if (!o) return res.status(404).json({ error: "الفرصة غير موجودة" });
    const attended: number[] = (Array.isArray(req.body?.attended) ? req.body.attended : []).map(Number).filter(Number.isInteger);
    const absent: number[] = (Array.isArray(req.body?.absent) ? req.body.absent : []).map(Number).filter(Number.isInteger);
    const granted: number[] = [];
    for (const uid of attended) {
      const r = await query(`UPDATE volunteer_signups SET status='attended' WHERE opportunity_id=$1 AND user_id=$2 AND status<>'cancelled' RETURNING 1`, [id, uid]);
      if (!r.rows.length) continue;
      if (await grantPoints(uid, o.points, "volunteer", `تطوع: ${o.title}`, { type: "volunteer", id }, Number(me!.id))) granted.push(uid);
    }
    for (const uid of absent) await query(`UPDATE volunteer_signups SET status='no_show' WHERE opportunity_id=$1 AND user_id=$2 AND status='registered'`, [id, uid]);
    pushTo(granted, "🤝 شكراً لتطوعك!", `أُضيفت ${o.points} نقطة لرصيدك عن «${o.title}»`, { screen: "volunteer" });
    return res.json({ ok: true, granted: granted.length });
  } catch (err) { logger.error({ err }, "[volunteer] attendance"); return res.status(500).json({ error: "تعذّر الحفظ" }); }
});

// ══ المسابقات ════════════════════════════════════════════════════
type Q = { q: string; options: string[]; answer: number };
function cleanQuestions(v: unknown): Q[] {
  if (!Array.isArray(v)) return [];
  const out: Q[] = [];
  for (const x of v.slice(0, 50)) {
    const q = str((x as any)?.q, 400);
    const options = Array.isArray((x as any)?.options) ? (x as any).options.map((o: unknown) => str(o, 200)).filter(Boolean).slice(0, 6) : [];
    const answer = Number((x as any)?.answer);
    if (q && options.length >= 2 && Number.isInteger(answer) && answer >= 0 && answer < options.length) out.push({ q, options, answer });
  }
  return out;
}

function liveStatus(c: any) {
  if (c.status === "finished" || c.status === "cancelled") return c.status;
  const now = Date.now();
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return "upcoming";
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return "ended";
  return "active";
}

router.get("/competitions", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    const r = await query(`SELECT c.id, c.title, c.description, c.kind, c.prize, c.points_first, c.points_participation, c.cover_url, c.starts_at, c.ends_at, c.status,
        jsonb_array_length(c.questions) AS questions_count,
        (SELECT COUNT(*)::int FROM competition_entries e WHERE e.competition_id=c.id) AS entries,
        EXISTS (SELECT 1 FROM competition_entries e WHERE e.competition_id=c.id AND e.user_id=$1) AS participated
      FROM competitions c WHERE c.status<>'cancelled' ORDER BY (c.status='active') DESC, c.starts_at DESC LIMIT 60`, [me ? Number(me.id) : 0]);
    return res.json({ competitions: r.rows.map((c: any) => ({ ...c, live_status: liveStatus(c) })), can_manage: isStaff(me) });
  } catch (err) { logger.error({ err }, "[comp] list"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

router.get("/competitions/:id", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    const c = (await query(`SELECT * FROM competitions WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!c) return res.status(404).json({ error: "المسابقة غير موجودة" });
    const staff = isStaff(me);
    const mine = me ? (await query(`SELECT score, rank, is_winner, content, image_url, created_at FROM competition_entries WHERE competition_id=$1 AND user_id=$2`, [c.id, Number(me.id)])).rows[0] || null : null;
    const ls = liveStatus(c);
    const showAnswers = staff || ls === "ended" || ls === "finished";
    const questions = (c.questions as Q[]).map((q) => ({ q: q.q, options: q.options, ...(showAnswers ? { answer: q.answer } : {}) }));
    const board = await query(`SELECT e.user_id AS id, u.name, u.avatar_url, e.score, e.duration_sec, e.is_winner, e.rank ${c.kind !== "quiz" ? ", e.content, e.image_url" : ""}
      FROM competition_entries e JOIN users u ON u.id=e.user_id WHERE e.competition_id=$1
      ORDER BY ${c.kind === "quiz" ? "e.score DESC, e.duration_sec ASC NULLS LAST, e.created_at ASC" : "e.is_winner DESC, e.rank ASC NULLS LAST, e.created_at DESC"} LIMIT 100`, [c.id]);
    const { questions: _q, ...rest } = c;
    return res.json({ ...rest, live_status: ls, questions, my_entry: mine, entries: board.rows, can_manage: staff });
  } catch (err) { logger.error({ err }, "[comp] get"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

function compFields(b: any) {
  return {
    title: str(b?.title, 200), description: str(b?.description, 3000) || null,
    kind: ["quiz", "photo", "text"].includes(b?.kind) ? b.kind : "quiz",
    prize: str(b?.prize, 200) || null, points_first: int(b?.points_first, 50, 0, 1000), points_participation: int(b?.points_participation, 5, 0, 100),
    cover_url: httpsUrl(b?.cover_url), starts_at: isoOrNull(b?.starts_at) || new Date().toISOString(), ends_at: isoOrNull(b?.ends_at),
    questions: cleanQuestions(b?.questions),
  };
}

router.post("/competitions", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "إنشاء المسابقات للإدارة" });
    const f = compFields(req.body);
    if (f.title.length < 4) return res.status(400).json({ error: "اكتب عنواناً للمسابقة" });
    if (f.kind === "quiz" && f.questions.length < 1) return res.status(400).json({ error: "أضف سؤالاً واحداً على الأقل بإجابته الصحيحة" });
    const r = await query(`INSERT INTO competitions (title, description, kind, prize, points_first, points_participation, cover_url, starts_at, ends_at, questions, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [f.title, f.description, f.kind, f.prize, f.points_first, f.points_participation, f.cover_url, f.starts_at, f.ends_at, JSON.stringify(f.questions), Number(me!.id)]);
    if (req.body?.notify_all) {
      const ids = (await query(`SELECT DISTINCT user_id FROM push_tokens`)).rows.map((x: any) => Number(x.user_id));
      pushTo(ids, "🏆 مسابقة جديدة", `${f.title}${f.prize ? ` — الجائزة: ${f.prize}` : ""}`, { screen: "competitions", id: r.rows[0].id });
    }
    return res.status(201).json({ id: r.rows[0].id });
  } catch (err) { logger.error({ err }, "[comp] create"); return res.status(500).json({ error: "تعذّر الإنشاء" }); }
});

router.patch("/competitions/:id", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const id = Number(req.params.id);
    if (req.body?.status && Object.keys(req.body).length === 1) {
      const st = ["active", "cancelled"].includes(req.body.status) ? req.body.status : null;
      if (!st) return res.status(400).json({ error: "حالة غير صالحة" });
      await query(`UPDATE competitions SET status=$1 WHERE id=$2`, [st, id]);
      return res.json({ ok: true });
    }
    const f = compFields(req.body);
    if (f.title.length < 4) return res.status(400).json({ error: "اكتب عنواناً للمسابقة" });
    const n = (await query(`SELECT COUNT(*)::int AS n FROM competition_entries WHERE competition_id=$1`, [id])).rows[0].n;
    const r = await query(`UPDATE competitions SET title=$1, description=$2, prize=$3, points_first=$4, points_participation=$5, cover_url=$6, starts_at=$7, ends_at=$8
        ${n === 0 ? ", kind=$10, questions=$11" : ""} WHERE id=$9 RETURNING id`,
      n === 0 ? [f.title, f.description, f.prize, f.points_first, f.points_participation, f.cover_url, f.starts_at, f.ends_at, id, f.kind, JSON.stringify(f.questions)]
        : [f.title, f.description, f.prize, f.points_first, f.points_participation, f.cover_url, f.starts_at, f.ends_at, id]);
    return r.rows[0] ? res.json({ ok: true, questions_locked: n > 0 }) : res.status(404).json({ error: "غير موجودة" });
  } catch (err) { logger.error({ err }, "[comp] edit"); return res.status(500).json({ error: "تعذّر الحفظ" }); }
});

router.post("/competitions/:id/enter", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول للمشاركة" });
    const c = (await query(`SELECT * FROM competitions WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!c) return res.status(404).json({ error: "المسابقة غير موجودة" });
    const ls = liveStatus(c);
    if (ls === "upcoming") return res.status(400).json({ error: "لم تبدأ المسابقة بعد" });
    if (ls !== "active") return res.status(400).json({ error: "انتهت المسابقة" });
    const exists = await query(`SELECT 1 FROM competition_entries WHERE competition_id=$1 AND user_id=$2`, [c.id, Number(me.id)]);
    if (exists.rows.length) return res.status(400).json({ error: "شاركت في هذه المسابقة من قبل" });
    let score = 0, answers: number[] | null = null, content: string | null = null, image: string | null = null;
    const qs = c.questions as Q[];
    if (c.kind === "quiz") {
      const given: number[] = Array.isArray(req.body?.answers) ? req.body.answers.slice(0, qs.length).map((a: unknown) => (Number.isInteger(Number(a)) ? Number(a) : -1)) : [];
      if (given.length !== qs.length) return res.status(400).json({ error: "أجب عن كل الأسئلة" });
      answers = given;
      score = qs.reduce((s, q, i) => s + (given[i] === q.answer ? 1 : 0), 0);
    } else {
      content = str(req.body?.content, 2000) || null;
      image = httpsUrl(req.body?.image_url);
      if (c.kind === "photo" && !image) return res.status(400).json({ error: "أرفق صورة المشاركة" });
      if (c.kind === "text" && (!content || content.length < 5)) return res.status(400).json({ error: "اكتب مشاركتك" });
    }
    const dur = req.body?.duration_sec ? int(req.body.duration_sec, 0, 0, 86400) : null;
    await query(`INSERT INTO competition_entries (competition_id, user_id, answers, content, image_url, score, duration_sec) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [c.id, Number(me.id), answers ? JSON.stringify(answers) : null, content, image, score, dur]);
    if (c.points_participation > 0) await grantPoints(Number(me.id), c.points_participation, "competition", `مشاركة: ${c.title}`, { type: "comp_part", id: c.id });
    return res.json({ ok: true, score, total: qs.length, correct: c.kind === "quiz" && (liveStatus(c) !== "active") ? qs.map((q) => q.answer) : undefined, points: c.points_participation });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(400).json({ error: "شاركت في هذه المسابقة من قبل" });
    logger.error({ err }, "[comp] enter"); return res.status(500).json({ error: "تعذّر حفظ المشاركة" });
  }
});

// إعلان الفائزين: تلقائي للأسئلة (أعلى الدرجات) أو باختيار المشرف
router.post("/competitions/:id/finish", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const c = (await query(`SELECT * FROM competitions WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!c) return res.status(404).json({ error: "غير موجودة" });
    let winners: number[] = (Array.isArray(req.body?.winners) ? req.body.winners : []).map(Number).filter(Number.isInteger).slice(0, 10);
    if (!winners.length && c.kind === "quiz") {
      const n = int(req.body?.count, 3, 1, 10);
      winners = (await query(`SELECT user_id FROM competition_entries WHERE competition_id=$1 AND score>0 ORDER BY score DESC, duration_sec ASC NULLS LAST, created_at ASC LIMIT $2`, [c.id, n])).rows.map((x: any) => Number(x.user_id));
    }
    if (!winners.length) return res.status(400).json({ error: "اختر الفائزين" });
    await query(`UPDATE competition_entries SET is_winner=FALSE, rank=NULL WHERE competition_id=$1`, [c.id]);
    const shares = [1, 0.6, 0.4, 0.3, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1];
    for (let i = 0; i < winners.length; i++) {
      await query(`UPDATE competition_entries SET is_winner=TRUE, rank=$1 WHERE competition_id=$2 AND user_id=$3`, [i + 1, c.id, winners[i]]);
      const pts = Math.round(c.points_first * shares[i]);
      if (pts > 0) await grantPoints(winners[i], pts, "competition", `المركز ${i + 1}: ${c.title}`, { type: "comp_win", id: c.id }, Number(me!.id));
    }
    await query(`UPDATE competitions SET status='finished', ends_at=COALESCE(ends_at, NOW()) WHERE id=$1`, [c.id]);
    pushTo(winners, "🏆 مبروك! فزت في المسابقة", `${c.title}${c.prize ? ` — الجائزة: ${c.prize}` : ""}`, { screen: "competitions", id: c.id });
    const others = (await query(`SELECT user_id FROM competition_entries WHERE competition_id=$1 AND NOT is_winner`, [c.id])).rows.map((x: any) => Number(x.user_id));
    pushTo(others, "🏆 أُعلنت نتائج المسابقة", c.title, { screen: "competitions", id: c.id });
    return res.json({ ok: true, winners });
  } catch (err) { logger.error({ err }, "[comp] finish"); return res.status(500).json({ error: "تعذّر إعلان النتائج" }); }
});

export default router;
