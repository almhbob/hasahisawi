// ════════════════════════════════════════════════════════════════
// 🏆 المسابقات: برعاية جهات، وموسمية (رمضان، الأعياد، المولد، الاستقلال…)
// ════════════════════════════════════════════════════════════════
// نوعان: quiz (أسئلة اختيار من متعدد تُصحَّح تلقائياً) و entry (مشاركة نص/صورة
// ويختار المشرف الفائزين). الإدارة للأدمن أو لمشرف لديه صلاحية قسم "contests".
// صفحة عامة لكل مسابقة بمعاينة مناسبة لمواقع التواصل ودعوة لتحميل التطبيق.
import { Router, type Request, type Response } from "express";
import { randomInt } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";
import { canManageSection } from "./volunteer";

const router = Router();
const APP_URL = "https://play.google.com/store/apps/details?id=com.almhbob.hasahisawi";

// ── المناسبات الموسمية ─────────────────────────────────────────
type Occasion = {
  key: string; name: string; calendar: "hijri" | "gregorian"; month: number; day: number;
  title: string; description: string;
};
export const OCCASIONS: Occasion[] = [
  { key: "ramadan", name: "شهر رمضان", calendar: "hijri", month: 9, day: 1, title: "مسابقة رمضان الكبرى", description: "أسئلة يومية في السيرة والقرآن والثقافة الإسلامية طوال الشهر الكريم." },
  { key: "eid_fitr", name: "عيد الفطر", calendar: "hijri", month: 10, day: 1, title: "مسابقة عيد الفطر", description: "شاركنا أجمل صور العيد في الحصاحيصا، أو أجب عن أسئلة العيد." },
  { key: "eid_adha", name: "عيد الأضحى", calendar: "hijri", month: 12, day: 10, title: "مسابقة عيد الأضحى", description: "أسئلة عن الحج ومناسك العيد، وجوائز للفائزين." },
  { key: "hijri_new_year", name: "رأس السنة الهجرية", calendar: "hijri", month: 1, day: 1, title: "مسابقة العام الهجري الجديد", description: "اختبر معلوماتك عن الهجرة النبوية." },
  { key: "mawlid", name: "المولد النبوي الشريف", calendar: "hijri", month: 3, day: 12, title: "مسابقة المولد النبوي", description: "أسئلة في السيرة النبوية العطرة." },
  { key: "isra_miraj", name: "الإسراء والمعراج", calendar: "hijri", month: 7, day: 27, title: "مسابقة الإسراء والمعراج", description: "أسئلة عن رحلة الإسراء والمعراج ودروسها." },
  { key: "independence", name: "عيد استقلال السودان", calendar: "gregorian", month: 1, day: 1, title: "مسابقة عيد الاستقلال", description: "كم تعرف عن تاريخ السودان واستقلاله في الأول من يناير 1956؟" },
];

/** هجري (تقويم حسابي) → ميلادي. قد يختلف يوماً عن رؤية الهلال، والإدارة تعدّل التاريخ. */
function hijriToGregorian(y: number, m: number, d: number): Date {
  const jd = Math.floor((11 * y + 3) / 30) + 354 * y + 30 * m - Math.floor((m - 1) / 2) + d + 1948440 - 385;
  let l = jd + 68569;
  const n = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n - 49) + i + l;
  return new Date(Date.UTC(year, month - 1, day));
}

function currentHijriYear(now = new Date()): number {
  // سنة هجرية تقريبية من التاريخ الميلادي، ثم نصحح بالمقارنة
  let y = Math.floor((now.getUTCFullYear() - 622) * (33 / 32));
  while (hijriToGregorian(y + 1, 1, 1) <= now) y++;
  while (hijriToGregorian(y, 1, 1) > now) y--;
  return y;
}

/** أقرب موعد قادم لكل مناسبة (خلال 13 شهراً). */
export function upcomingOccasions(now = new Date()) {
  const hy = currentHijriYear(now);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return OCCASIONS.map((o) => {
    let date: Date;
    if (o.calendar === "hijri") {
      date = hijriToGregorian(hy, o.month, o.day);
      if (date < today) date = hijriToGregorian(hy + 1, o.month, o.day);
    } else {
      date = new Date(Date.UTC(now.getUTCFullYear(), o.month - 1, o.day));
      if (date < today) date = new Date(Date.UTC(now.getUTCFullYear() + 1, o.month - 1, o.day));
    }
    const days = Math.round((date.getTime() - today.getTime()) / 86400_000);
    return { ...o, date: date.toISOString().slice(0, 10), daysAway: days };
  }).sort((a, b) => a.daysAway - b.daysAway);
}

let ready: Promise<void> | null = null;
export function ensureContestsDb(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS contests (
        id SERIAL PRIMARY KEY,
        title VARCHAR(160) NOT NULL,
        description TEXT,
        kind VARCHAR(10) NOT NULL DEFAULT 'sponsored',
        occasion VARCHAR(30),
        type VARCHAR(10) NOT NULL DEFAULT 'quiz',
        sponsor_name VARCHAR(160),
        sponsor_logo TEXT,
        prize VARCHAR(300),
        terms TEXT,
        entry_prompt VARCHAR(300),
        winners_count INTEGER NOT NULL DEFAULT 1 CHECK (winners_count BETWEEN 1 AND 50),
        starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ends_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'active',
        shares INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS contest_questions (
        id SERIAL PRIMARY KEY,
        contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        question VARCHAR(400) NOT NULL,
        options JSONB NOT NULL,
        correct_index INTEGER NOT NULL
      )`);
      await query(`CREATE TABLE IF NOT EXISTS contest_entries (
        id SERIAL PRIMARY KEY,
        contest_id INTEGER NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        answers JSONB,
        score INTEGER NOT NULL DEFAULT 0,
        content TEXT,
        image_url TEXT,
        is_winner BOOLEAN NOT NULL DEFAULT FALSE,
        rank INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (contest_id, user_id)
      )`);
      // واجهة المسابقات الجديدة: غلاف، تصنيف، جوائز بالمراكز، وتمييز مسابقة في الواجهة
      await query(`ALTER TABLE contests ADD COLUMN IF NOT EXISTS cover_image TEXT`);
      await query(`ALTER TABLE contests ADD COLUMN IF NOT EXISTS category VARCHAR(20)`);
      await query(`ALTER TABLE contests ADD COLUMN IF NOT EXISTS prizes JSONB`);
      await query(`ALTER TABLE contests ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE`);
      await query(`CREATE INDEX IF NOT EXISTS idx_contest_entries_user ON contest_entries(user_id)`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const fail = (res: Response, err: unknown, tag: string, msg = "تعذّر التنفيذ") => {
  logger.error({ err }, `[contests] ${tag}`);
  return res.status(500).json({ error: msg });
};

/** المسابقة التي انتهى وقتها تُعامل كمنتهية حتى لو لم يُعلن الفائزون بعد. */
function effectiveStatus(c: any): "upcoming" | "active" | "ended" {
  if (c.status === "ended") return "ended";
  const now = Date.now();
  if (new Date(c.starts_at).getTime() > now) return "upcoming";
  if (new Date(c.ends_at).getTime() <= now) return "ended";
  return "active";
}

type Q = { question: string; options: string[]; correct_index: number };
function cleanQuestions(raw: unknown): Q[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((q: any) => ({
    question: String(q?.question || "").trim().slice(0, 400),
    options: (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => String(o ?? "").trim().slice(0, 200)).filter(Boolean).slice(0, 6),
    correct_index: Number(q?.correct_index),
  })).filter((q) => q.question && q.options.length >= 2 && Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index < q.options.length);
}

export const CATEGORIES = ["culture", "religious", "sports", "literary", "photo", "kids", "science", "general"] as const;

/** جوائز المراكز: قائمة نصوص، الأول للمركز الأول وهكذا. */
function cleanPrizes(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.slice(0, 10).map((p) => String(p ?? "").trim().slice(0, 200));
  while (list.length && !list[list.length - 1]) list.pop();
  return list.length ? list : null;
}

function cleanContest(b: any) {
  const prizes = cleanPrizes(typeof b?.prizes === "string" ? (() => { try { return JSON.parse(b.prizes); } catch { return null; } })() : b?.prizes);
  return {
    cover_image: String(b?.cover_image || "").trim() || null,
    category: (CATEGORIES as readonly string[]).includes(b?.category) ? String(b.category) : null,
    prizes,
    featured: b?.featured === true || b?.featured === "true",
    title: String(b?.title || "").trim().slice(0, 160),
    description: String(b?.description || "").trim().slice(0, 4000) || null,
    kind: b?.kind === "seasonal" ? "seasonal" : "sponsored",
    occasion: OCCASIONS.some((o) => o.key === b?.occasion) ? b.occasion : null,
    type: b?.type === "entry" ? "entry" : "quiz",
    sponsor_name: String(b?.sponsor_name || "").trim().slice(0, 160) || null,
    sponsor_logo: String(b?.sponsor_logo || "").trim() || null,
    // الجائزة المختصرة: ما كتبه المشرف، وإلا جائزة المركز الأول
    prize: String(b?.prize || "").trim().slice(0, 300) || prizes?.[0] || null,
    terms: String(b?.terms || "").trim().slice(0, 4000) || null,
    entry_prompt: String(b?.entry_prompt || "").trim().slice(0, 300) || null,
    winners_count: Math.min(50, Math.max(1, Math.round(Number(b?.winners_count) || 1))),
    starts_at: b?.starts_at ? new Date(b.starts_at) : new Date(),
    ends_at: b?.ends_at ? new Date(b.ends_at) : null,
  };
}

/** القسم مخفي من لوحة الإدارة (أقسام التطبيق)؟ الطاقم يراه دائماً ليديره. */
async function sectionHiddenFor(me: Awaited<ReturnType<typeof sessionUser>>): Promise<boolean> {
  if (await canManageSection(me, "contests")) return false;
  try {
    const r = await query(`SELECT is_visible FROM section_configurations WHERE section_key='contests'`);
    return r.rows[0]?.is_visible === false;
  } catch { return false; }
}
const HIDDEN_MSG = "قسم المسابقات غير متاح حالياً";

// آخر 4 مشاركين (للصور المتراصة في البطاقة) وأول 3 فائزين (منصة التتويج)
const PARTICIPANTS_SQL = `COALESCE((SELECT json_agg(p) FROM (SELECT u.id AS user_id, u.name, u.avatar_url FROM contest_entries e JOIN users u ON u.id=e.user_id
    WHERE e.contest_id=c.id ORDER BY e.created_at DESC LIMIT 4) p), '[]'::json)`;
const WINNERS_SQL = `COALESCE((SELECT json_agg(w) FROM (SELECT e.rank, e.score, u.id AS user_id, u.name, u.avatar_url FROM contest_entries e JOIN users u ON u.id=e.user_id
    WHERE e.contest_id=c.id AND e.is_winner ORDER BY e.rank NULLS LAST, e.score DESC LIMIT 3) w), '[]'::json)`;

/** مسابقاتي: كل ما شارك فيه المستخدم، مع رقم مشاركته ونتيجته. */
router.get("/contests/mine", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لعرض مسابقاتك" });
    await ensureContestsDb();
    const r = await query(
      `SELECT c.*, (SELECT COUNT(*)::int FROM contest_entries x WHERE x.contest_id=c.id) AS entries_count, true AS entered,
              (SELECT COUNT(*)::int FROM contest_questions q WHERE q.contest_id=c.id) AS questions_count,
              ${PARTICIPANTS_SQL} AS participants, ${WINNERS_SQL} AS top_winners,
              json_build_object('score', e.score, 'is_winner', e.is_winner, 'rank', e.rank, 'created_at', e.created_at,
                'entry_number', (SELECT COUNT(*)::int FROM contest_entries x WHERE x.contest_id=c.id AND (x.created_at, x.id) <= (e.created_at, e.id))) AS my_entry
         FROM contest_entries e JOIN contests c ON c.id=e.contest_id
        WHERE e.user_id=$1 ORDER BY e.created_at DESC LIMIT 100`, [me.id]);
    return res.json(r.rows.map((c: any) => ({ ...c, state: effectiveStatus(c) })));
  } catch (err) { return fail(res, err, "mine", "تعذّر التحميل"); }
});

/** لوحة الشرف: الأكثر فوزاً، وآخر الفائزين مع جوائزهم. */
router.get("/contests/hall-of-fame", async (req: Request, res: Response) => {
  try {
    await ensureContestsDb();
    const me = await sessionUser(req);
    if (await sectionHiddenFor(me)) return res.json({ leaders: [], recent: [] });
    const leaders = (await query(
      `SELECT u.id AS user_id, u.name, u.avatar_url, COUNT(*) FILTER (WHERE e.is_winner)::int AS wins,
              COUNT(*) FILTER (WHERE e.is_winner AND e.rank=1)::int AS firsts, COUNT(*)::int AS entries
         FROM contest_entries e JOIN users u ON u.id=e.user_id
        GROUP BY u.id HAVING COUNT(*) FILTER (WHERE e.is_winner) > 0
        ORDER BY wins DESC, firsts DESC, entries DESC LIMIT 20`)).rows;
    const recent = (await query(
      `SELECT e.rank, u.id AS user_id, u.name, u.avatar_url, c.id AS contest_id, c.title AS contest_title, c.occasion, c.kind,
              CASE WHEN jsonb_typeof(c.prizes)='array' AND jsonb_array_length(c.prizes)>0 THEN c.prizes->>(COALESCE(e.rank,1)-1) ELSE c.prize END AS prize, c.ends_at
         FROM contest_entries e JOIN users u ON u.id=e.user_id JOIN contests c ON c.id=e.contest_id
        WHERE e.is_winner ORDER BY c.ends_at DESC, e.rank NULLS LAST LIMIT 30`)).rows;
    return res.json({ leaders, recent });
  } catch (err) { return fail(res, err, "hall", "تعذّر التحميل"); }
});

router.get("/contests/occasions", (_req: Request, res: Response) => res.json(upcomingOccasions()));

router.get("/contests", async (req: Request, res: Response) => {
  try {
    await ensureContestsDb();
    const me = await sessionUser(req);
    if (await sectionHiddenFor(me)) return res.json([]);
    const r = await query(
      `SELECT c.*, (SELECT COUNT(*)::int FROM contest_entries e WHERE e.contest_id=c.id) AS entries_count,
              EXISTS (SELECT 1 FROM contest_entries e WHERE e.contest_id=c.id AND e.user_id=$1) AS entered,
              (SELECT COUNT(*)::int FROM contest_questions q WHERE q.contest_id=c.id) AS questions_count,
              ${PARTICIPANTS_SQL} AS participants,
              ${WINNERS_SQL} AS top_winners
         FROM contests c ORDER BY c.ends_at DESC LIMIT 100`, [me ? me.id : 0]);
    return res.json(r.rows.map((c: any) => ({ ...c, state: effectiveStatus(c) })));
  } catch (err) { return fail(res, err, "list", "تعذّر التحميل"); }
});

router.get("/contests/:id", async (req: Request, res: Response) => {
  try {
    await ensureContestsDb();
    const me = await sessionUser(req);
    const id = Number(req.params.id);
    const c = (await query(`SELECT c.*, (SELECT COUNT(*)::int FROM contest_entries e WHERE e.contest_id=c.id) AS entries_count FROM contests c WHERE id=$1`, [id])).rows[0];
    if (!c) return res.status(404).json({ error: "المسابقة غير موجودة" });
    if (await sectionHiddenFor(me)) return res.status(404).json({ error: HIDDEN_MSG });
    const manage = await canManageSection(me, "contests");
    const state = effectiveStatus(c);
    // الإجابات الصحيحة لا تُرسل للمتسابقين قبل انتهاء المسابقة
    const qs = (await query(`SELECT id, question, options, correct_index FROM contest_questions WHERE contest_id=$1 ORDER BY position, id`, [id])).rows
      .map((q: any) => (manage || state === "ended" ? q : { id: q.id, question: q.question, options: q.options }));
    const mine = me ? (await query(
      `SELECT e.answers, e.score, e.content, e.image_url, e.is_winner, e.rank, e.created_at,
              (SELECT COUNT(*)::int FROM contest_entries x WHERE x.contest_id=e.contest_id AND (x.created_at, x.id) <= (e.created_at, e.id)) AS entry_number
         FROM contest_entries e WHERE e.contest_id=$1 AND e.user_id=$2`, [id, me.id])).rows[0] ?? null : null;
    const participants = (await query(
      `SELECT u.id AS user_id, u.name, u.avatar_url FROM contest_entries e JOIN users u ON u.id=e.user_id
        WHERE e.contest_id=$1 ORDER BY e.created_at DESC LIMIT 8`, [id])).rows;
    const winners = (await query(
      `SELECT e.rank, e.score, u.id AS user_id, u.name, u.avatar_url FROM contest_entries e JOIN users u ON u.id=e.user_id
        WHERE e.contest_id=$1 AND e.is_winner ORDER BY e.rank NULLS LAST, e.score DESC`, [id])).rows;
    return res.json({ ...c, state, questions: qs, mine, winners, participants, canManage: manage });
  } catch (err) { return fail(res, err, "get", "تعذّر التحميل"); }
});

router.post("/contests", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "contests"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureContestsDb();
    const c = cleanContest(req.body);
    if ([c.cover_image, c.sponsor_logo].some((u) => u && !/^https:\/\//i.test(u))) return res.status(400).json({ error: "روابط الصور يجب أن تبدأ بـ https://" });
    if (c.title.length < 3) return res.status(400).json({ error: "عنوان المسابقة مطلوب" });
    if (!c.ends_at || isNaN(c.ends_at.getTime()) || c.ends_at <= c.starts_at) return res.status(400).json({ error: "حدد تاريخ انتهاء بعد تاريخ البدء" });
    const qs = cleanQuestions(req.body?.questions);
    if (c.type === "quiz" && qs.length === 0) return res.status(400).json({ error: "أضف سؤالاً واحداً على الأقل بخيارين وإجابة صحيحة" });
    const r = await query(
      `INSERT INTO contests (title, description, kind, occasion, type, sponsor_name, sponsor_logo, prize, terms, entry_prompt, winners_count, starts_at, ends_at, created_by,
                             cover_image, category, prizes, featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [c.title, c.description, c.kind, c.occasion, c.type, c.sponsor_name, c.sponsor_logo, c.prize, c.terms, c.entry_prompt, c.winners_count, c.starts_at, c.ends_at, me!.id,
        c.cover_image, c.category, c.prizes ? JSON.stringify(c.prizes) : null, c.featured]);
    const contest = r.rows[0];
    for (let i = 0; i < qs.length; i++) {
      await query(`INSERT INTO contest_questions (contest_id, position, question, options, correct_index) VALUES ($1,$2,$3,$4,$5)`,
        [contest.id, i, qs[i].question, JSON.stringify(qs[i].options), qs[i].correct_index]);
    }
    return res.json(contest);
  } catch (err) { return fail(res, err, "create"); }
});

router.patch("/contests/:id", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "contests"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureContestsDb();
    const cur = (await query(`SELECT * FROM contests WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "المسابقة غير موجودة" });
    const c = cleanContest({ ...cur, ...req.body });
    if ([c.cover_image, c.sponsor_logo].some((u) => u && !/^https:\/\//i.test(u))) return res.status(400).json({ error: "روابط الصور يجب أن تبدأ بـ https://" });
    if (c.ends_at && c.ends_at <= c.starts_at) return res.status(400).json({ error: "حدد تاريخ انتهاء بعد تاريخ البدء" });
    const status = ["active", "ended"].includes(req.body?.status) ? req.body.status : cur.status;
    const r = await query(
      `UPDATE contests SET title=$1, description=$2, sponsor_name=$3, sponsor_logo=$4, prize=$5, terms=$6, entry_prompt=$7,
              winners_count=$8, starts_at=$9, ends_at=$10, status=$11, cover_image=$12, category=$13, prizes=$14, featured=$15
        WHERE id=$16 RETURNING *`,
      [c.title, c.description, c.sponsor_name, c.sponsor_logo, c.prize, c.terms, c.entry_prompt, c.winners_count, c.starts_at, c.ends_at ?? cur.ends_at, status,
        c.cover_image, c.category, c.prizes ? JSON.stringify(c.prizes) : null, c.featured, cur.id]);
    return res.json(r.rows[0]);
  } catch (err) { return fail(res, err, "update"); }
});

router.delete("/contests/:id", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "contests"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureContestsDb();
    await query(`DELETE FROM contests WHERE id=$1`, [Number(req.params.id)]);
    return res.json({ success: true });
  } catch (err) { return fail(res, err, "delete"); }
});

router.post("/contests/:id/enter", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول للمشاركة" });
    if (await sectionHiddenFor(me)) return res.status(404).json({ error: HIDDEN_MSG });
    await ensureContestsDb();
    const id = Number(req.params.id);
    const c = (await query(`SELECT * FROM contests WHERE id=$1`, [id])).rows[0];
    if (!c) return res.status(404).json({ error: "المسابقة غير موجودة" });
    const state = effectiveStatus(c);
    if (state === "upcoming") return res.status(400).json({ error: "لم تبدأ المسابقة بعد" });
    if (state === "ended") return res.status(400).json({ error: "انتهت المسابقة" });
    let answers: number[] | null = null;
    let score = 0;
    let content: string | null = null;
    let image: string | null = null;
    if (c.type === "quiz") {
      const qs = (await query(`SELECT id, correct_index FROM contest_questions WHERE contest_id=$1 ORDER BY position, id`, [id])).rows;
      const raw = Array.isArray(req.body?.answers) ? req.body.answers : [];
      answers = qs.map((_q: any, i: number) => (Number.isInteger(raw[i]) ? raw[i] : -1));
      if (answers.some((a) => a < 0)) return res.status(400).json({ error: "أجب عن جميع الأسئلة" });
      score = qs.reduce((n: number, q: any, i: number) => n + (answers![i] === q.correct_index ? 1 : 0), 0);
    } else {
      content = String(req.body?.content || "").trim().slice(0, 2000) || null;
      image = String(req.body?.image_url || "").trim() || null;
      if (image && !/^https:\/\//i.test(image)) return res.status(400).json({ error: "رابط الصورة غير صالح" });
      if (!content && !image) return res.status(400).json({ error: "اكتب مشاركتك أو أرفق صورة" });
    }
    const ins = await query(
      `INSERT INTO contest_entries (contest_id, user_id, answers, score, content, image_url) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (contest_id, user_id) DO NOTHING RETURNING id, score`,
      [id, me.id, answers ? JSON.stringify(answers) : null, score, content, image]);
    if (!ins.rows[0]) return res.status(400).json({ error: "شاركت في هذه المسابقة من قبل" });
    // النتيجة تظهر للمتسابق فوراً، والإجابات الصحيحة بعد الانتهاء
    // المقارنة داخل قاعدة البيانات: الطابع الزمني في JS يفقد أجزاء الميكروثانية
    const num = (await query(
      `SELECT COUNT(*)::int AS n FROM contest_entries x JOIN contest_entries me ON me.id=$1
        WHERE x.contest_id=me.contest_id AND (x.created_at, x.id) <= (me.created_at, me.id)`, [ins.rows[0].id])).rows[0]?.n ?? null;
    return res.json({ success: true, score, total: answers ? answers.length : null, entry_number: num });
  } catch (err) { return fail(res, err, "enter"); }
});

router.post("/contests/:id/share", async (req: Request, res: Response) => {
  try {
    await ensureContestsDb();
    await query(`UPDATE contests SET shares = shares + 1 WHERE id=$1`, [Number(req.params.id)]);
  } catch (err) { logger.warn({ err }, "[contests] share"); }
  return res.json({ ok: true });
});

router.get("/contests/:id/entries", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "contests"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureContestsDb();
    const r = await query(
      `SELECT e.id, e.user_id, e.score, e.content, e.image_url, e.is_winner, e.rank, e.created_at, u.name, u.phone
         FROM contest_entries e JOIN users u ON u.id=e.user_id
        WHERE e.contest_id=$1 ORDER BY e.is_winner DESC, e.score DESC, e.created_at ASC LIMIT 500`, [Number(req.params.id)]);
    return res.json(r.rows);
  } catch (err) { return fail(res, err, "entries", "تعذّر التحميل"); }
});

/**
 * إعلان الفائزين وإنهاء المسابقة.
 * - entry_ids: يختارهم المشرف (مسابقات المشاركة).
 * - auto: للاختبارات — أعلى الدرجات، ومن تساوت درجاتهم عند الحد يُسحب بينهم عشوائياً.
 */
router.post("/contests/:id/winners", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageSection(me, "contests"))) return res.status(403).json({ error: "غير مصرح" });
    await ensureContestsDb();
    const id = Number(req.params.id);
    const c = (await query(`SELECT * FROM contests WHERE id=$1`, [id])).rows[0];
    if (!c) return res.status(404).json({ error: "المسابقة غير موجودة" });
    let ids: number[] = [];
    if (req.body?.auto) {
      const rows = (await query(`SELECT id, score FROM contest_entries WHERE contest_id=$1 ORDER BY score DESC`, [id])).rows as { id: number; score: number }[];
      const byScore = new Map<number, number[]>();
      rows.forEach((r) => byScore.set(r.score, [...(byScore.get(r.score) ?? []), r.id]));
      for (const score of [...byScore.keys()].sort((a, b) => b - a)) {
        const group = byScore.get(score)!;
        // خلط عادل (Fisher–Yates) بمولد عشوائي آمن
        for (let i = group.length - 1; i > 0; i--) { const j = randomInt(i + 1); [group[i], group[j]] = [group[j], group[i]]; }
        ids.push(...group.slice(0, c.winners_count - ids.length));
        if (ids.length >= c.winners_count) break;
      }
    } else {
      ids = (Array.isArray(req.body?.entry_ids) ? req.body.entry_ids : []).map(Number).filter(Number.isInteger).slice(0, c.winners_count);
    }
    if (!ids.length) return res.status(400).json({ error: "لا توجد مشاركات لاختيار فائزين منها" });
    await query(`UPDATE contest_entries SET is_winner=false, rank=NULL WHERE contest_id=$1`, [id]);
    for (let i = 0; i < ids.length; i++) {
      await query(`UPDATE contest_entries SET is_winner=true, rank=$1 WHERE id=$2 AND contest_id=$3`, [i + 1, ids[i], id]);
    }
    await query(`UPDATE contests SET status='ended', ends_at=LEAST(ends_at, NOW()) WHERE id=$1`, [id]);
    const winners = (await query(`SELECT user_id, rank FROM contest_entries WHERE contest_id=$1 AND is_winner`, [id])).rows;
    const tiers: string[] = Array.isArray(c.prizes) ? c.prizes : [];
    for (const w of winners) {
      // بلا جوائز مراكز: الجائزة العامة لكل فائز كما كان
      const prize = tiers.length ? tiers[(w.rank ?? 1) - 1] || null : c.prize;
      await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'contest',$2,$3,$4)`,
        [w.user_id, "🏆 مبروك! فزت في المسابقة", `حللت في المركز ${w.rank} في «${c.title}»${prize ? ` — الجائزة: ${prize}` : ""}.`,
          JSON.stringify({ type: "contest", contest_id: String(id) })]).catch(() => {});
    }
    return res.json({ success: true, winners: winners.length });
  } catch (err) { return fail(res, err, "winners"); }
});

/** صفحة عامة للمشاركة على مواقع التواصل: معاينة (Open Graph) + دعوة لتحميل التطبيق. */
router.get("/public/contest/:id", async (req: Request, res: Response) => {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
  try {
    await ensureContestsDb();
    const c = (await query(`SELECT * FROM contests WHERE id=$1`, [Number(req.params.id)])).rows[0];
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    if (!c) return res.status(404).send(`<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:40px">المسابقة غير موجودة</body>`);
    const occ = OCCASIONS.find((o) => o.key === c.occasion);
    const desc = `${c.description || ""}${c.prize ? ` — الجائزة: ${c.prize}` : ""}`.slice(0, 200);
    const ends = new Date(c.ends_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
    return res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.title)} · حصاحيصاوي</title>
<meta property="og:type" content="website"><meta property="og:title" content="🏆 ${esc(c.title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:site_name" content="حصاحيصاوي">
${c.cover_image || c.sponsor_logo ? `<meta property="og:image" content="${esc(c.cover_image || c.sponsor_logo)}">` : ""}
<meta name="twitter:card" content="summary"></head>
<body style="margin:0;font-family:Cairo,Tahoma,sans-serif;background:#F4F7F5;color:#1A2C25">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<div style="background:linear-gradient(135deg,#00966A,#006B4A);color:#fff;border-radius:22px;padding:26px">
<div style="font-size:14px;opacity:.9">${occ ? esc(occ.name) : c.sponsor_name ? `برعاية ${esc(c.sponsor_name)}` : "مسابقات حصاحيصاوي"}</div>
<h1 style="margin:8px 0 6px;font-size:26px">🏆 ${esc(c.title)}</h1>
${c.prize ? `<div style="display:inline-block;margin-top:6px;padding:6px 12px;border-radius:999px;background:#E8A900;color:#2B1F00;font-weight:700">الجائزة: ${esc(c.prize)}</div>` : ""}
</div>
${c.description ? `<p style="font-size:16px;line-height:1.9;margin:18px 4px">${esc(c.description)}</p>` : ""}
<p style="color:#5E6F68;margin:4px">تنتهي في ${esc(ends)}</p>
<a href="${APP_URL}" style="display:block;margin-top:22px;text-align:center;padding:16px;border-radius:16px;background:#00966A;color:#fff;font-size:18px;font-weight:700;text-decoration:none">شارك من تطبيق «حصاحيصاوي»</a>
<p style="text-align:center;color:#5E6F68;margin-top:14px">حمّل التطبيق وانضم لمجتمع مدينتك — مسابقات وجوائز طوال العام 🌿</p>
</div></body></html>`);
  } catch (err) {
    logger.error({ err }, "[contests] public");
    return res.status(500).send("خطأ");
  }
});

export default router;
