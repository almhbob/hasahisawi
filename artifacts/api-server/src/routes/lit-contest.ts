// ════════════════════════════════════════════════════════════════
// 🏆 «مسابقة حصاحيصاوي الأدبية» — تُدار عبر مشرف تعيّنه إدارة التطبيق.
// الدورة: فئات (أنواع أدبية) + مواعيد (استقبال → تحكيم → إعلان) + جوائز + معايير.
// المشاركة: نص جديد يُكتب ويوثَّق برقم بعد تعهّد الأصالة ويمرّ بفحص الذكاء الاصطناعي.
// التحكيم: لجنة يختارها المشرف، تقيّم المشاركات «مجهولة الهوية» برمز فقط،
// على معايير موزونة (0–10 لكل معيار). الدرجة النهائية = متوسط المحكّمين (من 100).
// الإعلان: المشرف يعتمد النتائج → إشعار للمشاركين، رقم شهادة للفائزين،
// ونشر المشاركات المؤهلة في ديوان الكُتّاب بأسماء أصحابها.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { ensureWritersDb, createLitText, parsePledge, notifyLit, LIT_FORMS, litRow, validateBody } from "./ithraa-writers";
import { stripControl } from "../lib/lit-markup";

const router = Router();
const FORM = new Map(LIT_FORMS.map((f) => [f.key, f]));
export const DEFAULT_CRITERIA = [
  { key: "idea", label: "الفكرة والرؤية", weight: 25 },
  { key: "language", label: "اللغة والأسلوب", weight: 25 },
  { key: "structure", label: "البناء الفني", weight: 20 },
  { key: "creativity", label: "الإبداع والدهشة", weight: 20 },
  { key: "impact", label: "الصدق والأثر", weight: 10 },
];
const DEFAULT_PRIZES = [
  { rank: 1, label: "المركز الأول", reward: "" },
  { rank: 2, label: "المركز الثاني", reward: "" },
  { rank: 3, label: "المركز الثالث", reward: "" },
];
const DEFAULT_RULES = [
  "أن يكون النص من تأليف المشارك، غير منقول ولا مقتبس ولا مولَّد بأدوات الذكاء الاصطناعي.",
  "ألّا يكون النص قد نُشر أو فاز في مسابقة سابقة.",
  "يُكتب النص داخل التطبيق ويُوثَّق برقم خاص قبل اعتماد المشاركة.",
  "التحكيم سرّي: تُعرض المشاركات على اللجنة برموز دون أسماء أصحابها.",
  "قرار لجنة التحكيم نهائي، وللمشرف استبعاد أي مشاركة تخالف الشروط.",
  "يحق للمنصة نشر النصوص المؤهلة في ديوان الكُتّاب بأسماء أصحابها بعد إعلان النتائج.",
];

let ready: Promise<void> | null = null;
export function ensureLitContestDb(): Promise<void> {
  return (ready ??= (async () => {
    await ensureWritersDb();
    await query(`CREATE TABLE IF NOT EXISTS lit_contest_supervisors (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      assigned_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS lit_contests (
      id SERIAL PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      edition VARCHAR(80),
      slogan VARCHAR(200),
      description TEXT,
      theme VARCHAR(200),
      categories TEXT[] NOT NULL DEFAULT '{}',
      rules JSONB NOT NULL DEFAULT '[]',
      criteria JSONB NOT NULL DEFAULT '[]',
      prizes JSONB NOT NULL DEFAULT '[]',
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      results_at TIMESTAMPTZ,
      max_entries SMALLINT NOT NULL DEFAULT 1,
      show_judges BOOLEAN NOT NULL DEFAULT TRUE,
      published BOOLEAN NOT NULL DEFAULT FALSE,
      results_published BOOLEAN NOT NULL DEFAULT FALSE,
      results_note TEXT,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS lit_contest_judges (
      contest_id INTEGER NOT NULL REFERENCES lit_contests(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(120),
      PRIMARY KEY (contest_id, user_id)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS lit_contest_entries (
      id SERIAL PRIMARY KEY,
      contest_id INTEGER NOT NULL REFERENCES lit_contests(id) ON DELETE CASCADE,
      text_id INTEGER NOT NULL UNIQUE REFERENCES lit_texts(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL,
      category VARCHAR(20) NOT NULL,
      code VARCHAR(10) NOT NULL,
      status VARCHAR(14) NOT NULL DEFAULT 'qualified',
      status_note VARCHAR(300),
      final_score NUMERIC(5,2),
      judges_count SMALLINT NOT NULL DEFAULT 0,
      rank SMALLINT,
      award VARCHAR(80),
      certificate_no VARCHAR(40) UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (contest_id, code)
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lit_entries ON lit_contest_entries (contest_id, category)`);
    await query(`CREATE TABLE IF NOT EXISTS lit_contest_scores (
      entry_id INTEGER NOT NULL REFERENCES lit_contest_entries(id) ON DELETE CASCADE,
      judge_id INTEGER NOT NULL,
      scores JSONB NOT NULL,
      total NUMERIC(5,2) NOT NULL,
      comment VARCHAR(600),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (entry_id, judge_id)
    )`);
  })().catch((e) => { ready = null; throw e; }));
}

// ─── أدوات ───────────────────────────────────────────────────
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
type Phase = "draft" | "upcoming" | "open" | "judging" | "results";
function phaseOf(c: any): Phase {
  if (!c.published) return "draft";
  if (c.results_published) return "results";
  const now = Date.now();
  if (now < new Date(c.starts_at).getTime()) return "upcoming";
  if (now < new Date(c.ends_at).getTime()) return "open";
  return "judging";
}
async function isSupervisor(u: SessionUser | null): Promise<boolean> {
  if (!u) return false;
  if (isStaff(u)) return true;
  return (await query(`SELECT 1 FROM lit_contest_supervisors WHERE user_id=$1`, [u.id])).rows.length > 0;
}
async function isJudge(u: SessionUser | null, contestId: number): Promise<boolean> {
  if (!u) return false;
  return (await query(`SELECT 1 FROM lit_contest_judges WHERE contest_id=$1 AND user_id=$2`, [contestId, u.id])).rows.length > 0;
}
function contestRow(c: any, extra: Record<string, unknown> = {}) {
  return {
    id: c.id, title: c.title, edition: c.edition, slogan: c.slogan, description: c.description || "", theme: c.theme || null,
    categories: (c.categories || []).map((k: string) => ({ key: k, label: FORM.get(k)?.label ?? k, group: FORM.get(k)?.group ?? "prose" })),
    rules: c.rules || [], criteria: c.criteria || [], prizes: c.prizes || [],
    starts_at: c.starts_at, ends_at: c.ends_at, results_at: c.results_at, max_entries: c.max_entries, show_judges: c.show_judges,
    published: c.published, results_published: c.results_published, results_note: c.results_note || null,
    phase: phaseOf(c), entries: Number(c.entries_count ?? 0), participants: Number(c.participants ?? 0), ...extra,
  };
}
function fail(res: Response, err: unknown, tag: string) {
  logger.error({ err }, `lit-contest/${tag}`);
  return res.status(500).json({ error: "حدث خطأ في الخادم" });
}
function parseContest(b: Record<string, any>): { error: string } | { v: Record<string, any> } {
  const title = clean(b.title, 160);
  if (title.length < 4) return { error: "اكتب اسم المسابقة" };
  const categories = (Array.isArray(b.categories) ? b.categories : []).map(String).filter((k: string) => FORM.has(k));
  if (!categories.length) return { error: "اختر فئة أدبية واحدة على الأقل" };
  const starts = new Date(b.starts_at), ends = new Date(b.ends_at);
  if (isNaN(+starts) || isNaN(+ends) || ends <= starts) return { error: "حدّد موعدي بدء وانتهاء استقبال المشاركات بشكل صحيح" };
  const results = b.results_at ? new Date(b.results_at) : null;
  if (results && (isNaN(+results) || results < ends)) return { error: "موعد إعلان النتائج يجب أن يكون بعد إغلاق المشاركة" };
  const criteria = (Array.isArray(b.criteria) && b.criteria.length ? b.criteria : DEFAULT_CRITERIA)
    .map((c: any, i: number) => ({ key: clean(c.key, 20).replace(/[^a-z0-9_]/gi, "") || `c${i + 1}`, label: clean(c.label, 60), weight: Math.max(1, Math.min(100, Math.round(Number(c.weight) || 0))) }))
    .filter((c: any) => c.label).slice(0, 8);
  const sum = criteria.reduce((a: number, c: any) => a + c.weight, 0);
  if (!criteria.length || sum !== 100) return { error: `مجموع أوزان معايير التحكيم يجب أن يساوي 100 (الآن ${sum})` };
  const prizes = (Array.isArray(b.prizes) && b.prizes.length ? b.prizes : DEFAULT_PRIZES)
    .map((p: any, i: number) => ({ rank: i + 1, label: clean(p.label, 60) || `المركز ${i + 1}`, reward: clean(p.reward, 120) })).slice(0, 10);
  const rules = (Array.isArray(b.rules) && b.rules.length ? b.rules : DEFAULT_RULES).map((r: any) => clean(r, 300)).filter(Boolean).slice(0, 20);
  return { v: {
    title, edition: clean(b.edition, 80) || null, slogan: clean(b.slogan, 200) || null, description: clean(b.description, 4000) || null,
    theme: clean(b.theme, 200) || null, categories, rules, criteria, prizes, starts_at: starts, ends_at: ends, results_at: results,
    max_entries: Math.max(1, Math.min(5, Math.round(Number(b.max_entries) || 1))), show_judges: b.show_judges !== false,
  } };
}
async function loadContest(id: number) {
  const r = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM lit_contest_entries e WHERE e.contest_id=c.id AND e.status<>'withdrawn') AS entries_count,
            (SELECT COUNT(DISTINCT author_id) FROM lit_contest_entries e WHERE e.contest_id=c.id) AS participants
     FROM lit_contests c WHERE c.id=$1`, [id]);
  return r.rows[0] || null;
}

// ─── القراءة العامة ──────────────────────────────────────────
router.get("/lit/contests", async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    const sup = await isSupervisor(me);
    const { rows } = await query(
      `SELECT c.*, (SELECT COUNT(*) FROM lit_contest_entries e WHERE e.contest_id=c.id) AS entries_count,
              (SELECT COUNT(DISTINCT author_id) FROM lit_contest_entries e WHERE e.contest_id=c.id) AS participants
       FROM lit_contests c ${sup ? "" : "WHERE c.published=true"} ORDER BY c.starts_at DESC LIMIT 50`);
    let judging: number[] = [];
    if (me) judging = (await query(`SELECT contest_id FROM lit_contest_judges WHERE user_id=$1`, [me.id])).rows.map((r: any) => r.contest_id);
    return res.json({ contests: rows.map((c: any) => contestRow(c, { i_judge: judging.includes(c.id) })), me: { supervisor: sup, is_app_admin: isStaff(me) } });
  } catch (err) { return fail(res, err, "list"); }
});

router.get("/lit/contests/:id", async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجودة" });
    await ensureLitContestDb();
    const me = await sessionUser(req);
    const c = await loadContest(Number(req.params.id));
    const sup = await isSupervisor(me);
    if (!c || (!c.published && !sup)) return res.status(404).json({ error: "غير موجودة" });
    const judge = await isJudge(me, c.id);
    const judges = (c.show_judges || sup)
      ? (await query(`SELECT j.user_id, j.title, u.name, u.avatar_url FROM lit_contest_judges j JOIN users u ON u.id=j.user_id WHERE j.contest_id=$1 ORDER BY u.name`, [c.id])).rows
      : [];
    const mine = me ? (await query(
      `SELECT e.id, e.code, e.category, e.status, e.status_note, e.rank, e.award, e.final_score, e.certificate_no, t.id AS text_id, t.title, t.doc_no, t.created_at
       FROM lit_contest_entries e JOIN lit_texts t ON t.id=e.text_id WHERE e.contest_id=$1 AND e.author_id=$2 ORDER BY e.created_at`, [c.id, me.id])).rows : [];
    let results: any[] = [];
    if (c.results_published) {
      results = (await query(
        `SELECT e.id, e.category, e.rank, e.award, e.final_score, e.certificate_no, t.id AS text_id, t.title, t.doc_no,
                COALESCE(t.pen_name, u.name) AS author_name, u.avatar_url AS author_avatar, t.author_id
         FROM lit_contest_entries e JOIN lit_texts t ON t.id=e.text_id JOIN users u ON u.id=t.author_id
         WHERE e.contest_id=$1 AND e.rank IS NOT NULL ORDER BY e.category, e.rank`, [c.id])).rows
        .map((r: any) => ({ ...r, final_score: r.final_score != null ? Number(r.final_score) : null, category_label: FORM.get(r.category)?.label ?? r.category }));
    }
    const byCat = (await query(`SELECT category, COUNT(*)::int AS n FROM lit_contest_entries WHERE contest_id=$1 AND status='qualified' GROUP BY category`, [c.id])).rows;
    return res.json({
      contest: contestRow(c, { per_category: Object.fromEntries(byCat.map((r: any) => [r.category, r.n])) }),
      judges, mine, results, me: { supervisor: sup, judge, signed_in: !!me },
    });
  } catch (err) { return fail(res, err, "get"); }
});

// ─── المشاركة ────────────────────────────────────────────────
router.post("/lit/contests/:id/enter", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجودة" });
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول للمشاركة" });
    if (me.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    const c = await loadContest(Number(req.params.id));
    if (!c || !c.published) return res.status(404).json({ error: "غير موجودة" });
    if (phaseOf(c) !== "open") return res.status(409).json({ error: "باب المشاركة غير مفتوح الآن" });
    if (await isJudge(me, c.id)) return res.status(403).json({ error: "أعضاء لجنة التحكيم لا يشاركون في المسابقة" });
    if (!isStaff(me) && (await query(`SELECT 1 FROM lit_contest_supervisors WHERE user_id=$1`, [me.id])).rows.length) {
      return res.status(403).json({ error: "مشرف المسابقة لا يشارك فيها" });
    }
    const b = req.body || {};
    const category = String(b.form || b.category || "");
    if (!(c.categories || []).includes(category)) return res.status(400).json({ error: "اختر فئة من فئات المسابقة" });
    const form = FORM.get(category)!;
    const count = (await query(`SELECT COUNT(*)::int AS n FROM lit_contest_entries WHERE contest_id=$1 AND author_id=$2 AND status<>'withdrawn'`, [c.id, me.id])).rows[0].n;
    if (count >= c.max_entries) return res.status(409).json({ error: `الحد الأقصى ${c.max_entries} مشاركة لكل كاتب` });
    const title = clean(b.title, 160);
    if (title.length < 2) return res.status(400).json({ error: "اكتب عنواناً للنص" });
    // التنسيق مسموح (يُحكَم على النص الصافي)، والمرفقات غير مسموحة في التحكيم السري
    const body = stripControl(String(b.body ?? "")).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
    const bad = validateBody(form, body);
    if (bad) return res.status(400).json({ error: bad });
    const pledge = parsePledge(b, me);
    if ("error" in pledge) return res.status(400).json({ error: pledge.error });
    if (b.pledge?.unpublished !== true) return res.status(400).json({ error: "أقرّ بأن النص لم يُنشر ولم يشارك في مسابقة سابقة" });
    const out = await createLitText({
      user: me, req, form, title, body, pen_name: clean(b.pen_name, 80) || null, dedication: null,
      signature: pledge.signature, telemetry: b.telemetry || {}, contest_id: c.id,
    });
    if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code, ...(out.extra || {}) });
    let code = "";
    for (let i = 0; i < 6 && !code; i++) {
      const cand = randomBytes(3).toString("hex").toUpperCase();
      if (!(await query(`SELECT 1 FROM lit_contest_entries WHERE contest_id=$1 AND code=$2`, [c.id, cand])).rows.length) code = cand;
    }
    // نصوص «تحتاج تدقيقاً» تدخل بحالة مراجعة ليحسمها المشرف قبل التحكيم
    const status = out.row.ai_verdict === "review" ? "review" : "qualified";
    const e = (await query(
      `INSERT INTO lit_contest_entries (contest_id, text_id, author_id, category, code, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [c.id, out.row.id, me.id, category, code, status])).rows[0];
    void notifyLit([me.id], "استلمنا مشاركتك 🏆", `«${title}» في ${c.title} — رمز المشاركة ${code} · رقم التوثيق ${out.row.doc_no}`, { screen: "lit-contest", id: c.id });
    return res.status(201).json({
      entry: { id: e.id, code, status, category, text_id: out.row.id, doc_no: out.row.doc_no, title },
      message: status === "review" ? "وُثّقت مشاركتك، وستُراجع أصالتها قبل إحالتها للتحكيم" : "وُثّقت مشاركتك وأُحيلت للتحكيم السري",
    });
  } catch (err) { return fail(res, err, "enter"); }
});

router.post("/lit/contests/:id/entries/:eid/withdraw", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const c = await loadContest(Number(req.params.id));
    if (!c || phaseOf(c) !== "open") return res.status(409).json({ error: "لا يمكن السحب بعد إغلاق باب المشاركة" });
    const r = await query(`UPDATE lit_contest_entries SET status='withdrawn' WHERE id=$1 AND contest_id=$2 AND author_id=$3 RETURNING text_id`, [Number(req.params.eid), c.id, me.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجودة" });
    await query(`UPDATE lit_texts SET status='pending', contest_id=NULL WHERE id=$1`, [r.rows[0].text_id]);
    return res.json({ ok: true, message: "سُحبت المشاركة، وبقي نصك موثّقاً وأُرسل لمراجعة الديوان" });
  } catch (err) { return fail(res, err, "withdraw"); }
});

// ─── الإدارة (مشرف المسابقة) ──────────────────────────────────
router.post("/lit/contests", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!(await isSupervisor(me))) return res.status(403).json({ error: "لمشرف المسابقة فقط" });
    const p = parseContest(req.body || {});
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    const { rows } = await query(
      `INSERT INTO lit_contests (title, edition, slogan, description, theme, categories, rules, criteria, prizes, starts_at, ends_at, results_at, max_entries, show_judges, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [v.title, v.edition, v.slogan, v.description, v.theme, v.categories, JSON.stringify(v.rules), JSON.stringify(v.criteria), JSON.stringify(v.prizes),
       v.starts_at, v.ends_at, v.results_at, v.max_entries, v.show_judges, me!.id]);
    return res.status(201).json({ contest: contestRow(rows[0]) });
  } catch (err) { return fail(res, err, "create"); }
});

router.patch("/lit/contests/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجودة" });
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!(await isSupervisor(me))) return res.status(403).json({ error: "لمشرف المسابقة فقط" });
    const cur = await loadContest(Number(req.params.id));
    if (!cur) return res.status(404).json({ error: "غير موجودة" });
    if (cur.results_published) return res.status(409).json({ error: "أُعلنت النتائج — لا يمكن التعديل" });
    // نشر/إخفاء فقط
    if (typeof req.body?.published === "boolean" && Object.keys(req.body).length === 1) {
      if (!req.body.published && Number(cur.entries_count) > 0) return res.status(409).json({ error: "لا يمكن إخفاء مسابقة استقبلت مشاركات" });
      const r = await query(`UPDATE lit_contests SET published=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [req.body.published, cur.id]);
      if (req.body.published && !cur.published) {
        const all = await query(`SELECT DISTINCT author_id AS id FROM lit_texts WHERE status='approved'`);
        void notifyLit(all.rows.map((x: any) => x.id), `🏆 ${cur.title}`, cur.slogan || "انطلقت مسابقة حصاحيصاوي الأدبية — شارك بنصك", { screen: "lit-contest", id: cur.id });
      }
      return res.json({ contest: contestRow({ ...r.rows[0], entries_count: cur.entries_count, participants: cur.participants }) });
    }
    const p = parseContest({ ...cur, ...req.body });
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    if (Number(cur.entries_count) > 0) {
      const removed = (cur.categories || []).filter((k: string) => !v.categories.includes(k));
      if (removed.length) return res.status(409).json({ error: "لا يمكن حذف فئة استقبلت مشاركات" });
    }
    const r = await query(
      `UPDATE lit_contests SET title=$1, edition=$2, slogan=$3, description=$4, theme=$5, categories=$6, rules=$7, criteria=$8, prizes=$9,
         starts_at=$10, ends_at=$11, results_at=$12, max_entries=$13, show_judges=$14, updated_at=NOW() WHERE id=$15 RETURNING *`,
      [v.title, v.edition, v.slogan, v.description, v.theme, v.categories, JSON.stringify(v.rules), JSON.stringify(v.criteria), JSON.stringify(v.prizes),
       v.starts_at, v.ends_at, v.results_at, v.max_entries, v.show_judges, cur.id]);
    return res.json({ contest: contestRow({ ...r.rows[0], entries_count: cur.entries_count, participants: cur.participants }) });
  } catch (err) { return fail(res, err, "update"); }
});

router.delete("/lit/contests/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!(await isSupervisor(me))) return res.status(403).json({ error: "لمشرف المسابقة فقط" });
    const cur = await loadContest(Number(req.params.id));
    if (!cur) return res.status(404).json({ error: "غير موجودة" });
    if (Number(cur.entries_count) > 0) return res.status(409).json({ error: "لا تُحذف مسابقة فيها مشاركات" });
    await query(`DELETE FROM lit_contests WHERE id=$1`, [cur.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "delete"); }
});

// البحث عن الأعضاء (للمشرف لاختيار المحكّمين، وللإدارة لتعيين المشرفين)
router.get("/lit/users/lookup", async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!(await isSupervisor(me))) return res.status(403).json({ error: "غير مسموح" });
    const q = clean(req.query.q, 60);
    if (q.length < 2) return res.json({ users: [] });
    const digits = q.replace(/\D/g, "");
    const { rows } = await query(
      `SELECT id, name, avatar_url, headline FROM users
       WHERE (name ILIKE $1 OR ($2 <> '' AND regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%' || $2 || '%') OR id::text=$3) AND COALESCE(is_banned,false)=false
       ORDER BY name LIMIT 15`, [`%${q.replace(/[%_\\]/g, "\\$&")}%`, digits.length >= 4 ? digits : "", q]).catch(async () =>
      query(`SELECT id, name, avatar_url, NULL AS headline FROM users WHERE name ILIKE $1 AND COALESCE(is_banned,false)=false ORDER BY name LIMIT 15`, [`%${q}%`]));
    return res.json({ users: rows });
  } catch (err) { return fail(res, err, "lookup"); }
});

router.get("/lit/contest-supervisors", async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const { rows } = await query(`SELECT s.user_id, s.created_at, u.name, u.avatar_url FROM lit_contest_supervisors s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC`);
    return res.json({ supervisors: rows });
  } catch (err) { return fail(res, err, "sup-list"); }
});
router.put("/lit/contest-supervisors/:uid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const uid = Number(req.params.uid);
    if (!(await query(`SELECT 1 FROM users WHERE id=$1`, [uid])).rows.length) return res.status(404).json({ error: "المستخدم غير موجود" });
    const ins = await query(`INSERT INTO lit_contest_supervisors (user_id, assigned_by) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1`, [uid, me!.id]);
    if (ins.rows.length) void notifyLit([uid], "عُيّنت مشرفاً لمسابقة حصاحيصاوي الأدبية 🏆", "يمكنك الآن إنشاء الدورات وتشكيل لجان التحكيم وإعلان النتائج", { screen: "lit-contest-manage" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "sup-put"); }
});
router.delete("/lit/contest-supervisors/:uid", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    await query(`DELETE FROM lit_contest_supervisors WHERE user_id=$1`, [Number(req.params.uid)]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "sup-del"); }
});

router.put("/lit/contests/:id/judges", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!(await isSupervisor(me))) return res.status(403).json({ error: "لمشرف المسابقة فقط" });
    const c = await loadContest(Number(req.params.id));
    if (!c) return res.status(404).json({ error: "غير موجودة" });
    if (c.results_published) return res.status(409).json({ error: "أُعلنت النتائج" });
    const list = (Array.isArray(req.body?.judges) ? req.body.judges : []).slice(0, 15)
      .map((j: any) => ({ id: Number(j.user_id ?? j.id), title: clean(j.title, 120) || null })).filter((j: any) => j.id > 0);
    const entrants = (await query(`SELECT DISTINCT author_id FROM lit_contest_entries WHERE contest_id=$1`, [c.id])).rows.map((r: any) => r.author_id);
    const clash = list.find((j: any) => entrants.includes(j.id));
    if (clash) return res.status(409).json({ error: "لا يجوز اختيار مشارك في المسابقة عضواً في لجنة التحكيم" });
    const before = (await query(`SELECT user_id FROM lit_contest_judges WHERE contest_id=$1`, [c.id])).rows.map((r: any) => r.user_id);
    await query(`DELETE FROM lit_contest_judges WHERE contest_id=$1`, [c.id]);
    for (const j of list) await query(`INSERT INTO lit_contest_judges (contest_id, user_id, title) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [c.id, j.id, j.title]);
    const added = list.map((j: any) => j.id).filter((id: number) => !before.includes(id));
    if (added.length) void notifyLit(added, "دعوة لعضوية لجنة التحكيم ⚖️", `اختارك مشرف ${c.title} محكّماً — ستُعرض عليك المشاركات بلا أسماء`, { screen: "lit-contest-judge", id: c.id });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "judges"); }
});

// قائمة المشاركات: المشرف يرى كل شيء، المحكّم يرى نصوصاً مجهولة + تقييمه
router.get("/lit/contests/:id/entries", async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    const c = await loadContest(Number(req.params.id));
    if (!c) return res.status(404).json({ error: "غير موجودة" });
    const sup = await isSupervisor(me);
    const judge = await isJudge(me, c.id);
    if (!sup && !judge) return res.status(403).json({ error: "للمشرف ولجنة التحكيم فقط" });
    const judgesN = (await query(`SELECT COUNT(*)::int AS n FROM lit_contest_judges WHERE contest_id=$1`, [c.id])).rows[0].n;
    if (sup && req.query.as !== "judge") {
      const { rows } = await query(
        `SELECT e.*, t.title, t.body, t.doc_no, t.ai_score, t.ai_verdict, t.ai_signals, t.pasted_ratio, COALESCE(t.pen_name,u.name) AS author_name, u.avatar_url AS author_avatar,
                (SELECT COUNT(*) FROM lit_contest_scores s WHERE s.entry_id=e.id)::int AS scored,
                (SELECT ROUND(AVG(s.total),2) FROM lit_contest_scores s WHERE s.entry_id=e.id) AS avg_total
         FROM lit_contest_entries e JOIN lit_texts t ON t.id=e.text_id JOIN users u ON u.id=e.author_id
         WHERE e.contest_id=$1 ORDER BY e.category, e.final_score DESC NULLS LAST, e.created_at`, [c.id]);
      return res.json({ role: "supervisor", judges: judgesN, criteria: c.criteria, entries: rows.map((r: any) => ({
        id: r.id, code: r.code, category: r.category, category_label: FORM.get(r.category)?.label ?? r.category, status: r.status, status_note: r.status_note,
        title: r.title, body: r.body, doc_no: r.doc_no, author_id: r.author_id, author_name: r.author_name, author_avatar: r.author_avatar,
        ai_score: r.ai_score, ai_verdict: r.ai_verdict, ai_signals: r.ai_signals, pasted_ratio: r.pasted_ratio,
        scored: r.scored, avg_total: r.avg_total != null ? Number(r.avg_total) : null, final_score: r.final_score != null ? Number(r.final_score) : null,
        rank: r.rank, award: r.award, created_at: r.created_at,
      })) });
    }
    const { rows } = await query(
      `SELECT e.id, e.code, e.category, t.title, t.body, s.scores, s.total, s.comment
       FROM lit_contest_entries e JOIN lit_texts t ON t.id=e.text_id
       LEFT JOIN lit_contest_scores s ON s.entry_id=e.id AND s.judge_id=$2
       WHERE e.contest_id=$1 AND e.status='qualified' ORDER BY e.category, e.code`, [c.id, me!.id]);
    return res.json({ role: "judge", judges: judgesN, criteria: c.criteria, phase: phaseOf(c), entries: rows.map((r: any) => ({
      id: r.id, code: r.code, category: r.category, category_label: FORM.get(r.category)?.label ?? r.category, group: FORM.get(r.category)?.group ?? "prose", title: r.title, body: r.body,
      my_scores: r.scores || null, my_total: r.total != null ? Number(r.total) : null, my_comment: r.comment || "",
    })) });
  } catch (err) { return fail(res, err, "entries"); }
});

router.post("/lit/contests/:id/entries/:eid/status", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!(await isSupervisor(me))) return res.status(403).json({ error: "لمشرف المسابقة فقط" });
    const c = await loadContest(Number(req.params.id));
    if (!c || c.results_published) return res.status(409).json({ error: "غير متاح" });
    const status = String(req.body?.status);
    if (!["qualified", "disqualified"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const note = clean(req.body?.note, 300) || null;
    if (status === "disqualified" && !note) return res.status(400).json({ error: "اكتب سبب الاستبعاد" });
    const r = await query(`UPDATE lit_contest_entries SET status=$1, status_note=$2 WHERE id=$3 AND contest_id=$4 RETURNING author_id, code`, [status, note, Number(req.params.eid), c.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجودة" });
    if (status === "disqualified") void notifyLit([r.rows[0].author_id], "استُبعدت مشاركتك", `${c.title} — ${note}`, { screen: "lit-contest", id: c.id });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "entry-status"); }
});

router.put("/lit/contests/:id/entries/:eid/score", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    const c = await loadContest(Number(req.params.id));
    if (!c) return res.status(404).json({ error: "غير موجودة" });
    if (!(await isJudge(me, c.id))) return res.status(403).json({ error: "للجنة التحكيم فقط" });
    const ph = phaseOf(c);
    if (ph !== "judging" && ph !== "open") return res.status(409).json({ error: ph === "results" ? "أُعلنت النتائج وأُغلق التحكيم" : "لم يبدأ التحكيم" });
    const e = (await query(`SELECT id, author_id FROM lit_contest_entries WHERE id=$1 AND contest_id=$2 AND status='qualified'`, [Number(req.params.eid), c.id])).rows[0];
    if (!e) return res.status(404).json({ error: "المشاركة غير متاحة للتحكيم" });
    if (e.author_id === me!.id) return res.status(403).json({ error: "لا يجوز تقييم مشاركتك" });
    const crit: { key: string; weight: number }[] = c.criteria || [];
    const input = req.body?.scores || {};
    const scores: Record<string, number> = {};
    let total = 0;
    for (const k of crit) {
      const v = Number(input[k.key]);
      if (!Number.isFinite(v) || v < 0 || v > 10) return res.status(400).json({ error: "قيّم كل معيار من 0 إلى 10" });
      scores[k.key] = Math.round(v * 2) / 2;
      total += (scores[k.key] / 10) * k.weight;
    }
    await query(
      `INSERT INTO lit_contest_scores (entry_id, judge_id, scores, total, comment) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (entry_id, judge_id) DO UPDATE SET scores=EXCLUDED.scores, total=EXCLUDED.total, comment=EXCLUDED.comment, updated_at=NOW()`,
      [e.id, me!.id, JSON.stringify(scores), Math.round(total * 100) / 100, clean(req.body?.comment, 600) || null]);
    return res.json({ ok: true, total: Math.round(total * 100) / 100 });
  } catch (err) { return fail(res, err, "score"); }
});

// حساب الترتيب (معاينة قبل الإعلان)
async function computeRanking(c: any) {
  const { rows } = await query(
    `SELECT e.id, e.category, ROUND(AVG(s.total),2) AS avg, COUNT(s.*)::int AS n
     FROM lit_contest_entries e LEFT JOIN lit_contest_scores s ON s.entry_id=e.id
     WHERE e.contest_id=$1 AND e.status='qualified' GROUP BY e.id, e.category`, [c.id]);
  const prizes: { rank: number; label: string }[] = c.prizes || [];
  const byCat: Record<string, any[]> = {};
  for (const r of rows) (byCat[r.category] ??= []).push({ ...r, avg: r.avg != null ? Number(r.avg) : null });
  const out: { id: number; score: number | null; n: number; rank: number | null; award: string | null }[] = [];
  for (const list of Object.values(byCat)) {
    list.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
    let rank = 0, prev: number | null = null, shown = 0;
    for (const r of list) {
      shown++;
      if (r.avg == null || r.n === 0) { out.push({ id: r.id, score: null, n: 0, rank: null, award: null }); continue; }
      if (prev === null || r.avg < prev) rank = shown; // التعادل يتشارك المركز
      prev = r.avg;
      const p = prizes.find((x) => x.rank === rank);
      out.push({ id: r.id, score: r.avg, n: r.n, rank: p ? rank : null, award: p ? p.label : null });
    }
  }
  return out;
}

router.post("/lit/contests/:id/compute", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!(await isSupervisor(me))) return res.status(403).json({ error: "لمشرف المسابقة فقط" });
    const c = await loadContest(Number(req.params.id));
    if (!c) return res.status(404).json({ error: "غير موجودة" });
    if (c.results_published) return res.status(409).json({ error: "أُعلنت النتائج" });
    const ranking = await computeRanking(c);
    for (const r of ranking) {
      await query(`UPDATE lit_contest_entries SET final_score=$1, judges_count=$2, rank=$3, award=$4 WHERE id=$5`, [r.score, r.n, r.rank, r.award, r.id]);
    }
    const judges = (await query(`SELECT COUNT(*)::int AS n FROM lit_contest_judges WHERE contest_id=$1`, [c.id])).rows[0].n;
    const incomplete = ranking.filter((r) => r.n < judges).length;
    return res.json({ ok: true, ranked: ranking.filter((r) => r.rank).length, incomplete, judges });
  } catch (err) { return fail(res, err, "compute"); }
});

router.post("/lit/contests/:id/publish-results", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const me = await sessionUser(req);
    if (!(await isSupervisor(me))) return res.status(403).json({ error: "لمشرف المسابقة فقط" });
    const c = await loadContest(Number(req.params.id));
    if (!c) return res.status(404).json({ error: "غير موجودة" });
    if (c.results_published) return res.status(409).json({ error: "أُعلنت النتائج مسبقاً" });
    if (phaseOf(c) !== "judging") return res.status(409).json({ error: "تُعلن النتائج بعد إغلاق باب المشاركة" });
    const ranking = await computeRanking(c);
    if (!ranking.some((r) => r.rank)) return res.status(409).json({ error: "لا توجد مشاركات مقيّمة بعد — احسب النتائج أولاً" });
    const year = new Date().getFullYear();
    for (const r of ranking) {
      const cert = r.rank ? `HSW-LITAWD-${year}-${String(c.id).padStart(3, "0")}-${String(r.id).padStart(5, "0")}` : null;
      await query(`UPDATE lit_contest_entries SET final_score=$1, judges_count=$2, rank=$3, award=$4, certificate_no=$5 WHERE id=$6`, [r.score, r.n, r.rank, r.award, cert, r.id]);
    }
    await query(`UPDATE lit_contests SET results_published=true, results_note=$1, results_at=COALESCE(results_at, NOW()), updated_at=NOW() WHERE id=$2`, [clean(req.body?.note, 2000) || null, c.id]);
    // نشر المشاركات المؤهلة في الديوان بأسماء أصحابها
    await query(
      `UPDATE lit_texts t SET status='approved', published_at=NOW(), reviewed_by=$2, reviewed_at=NOW(), featured = (e.rank IS NOT NULL)
       FROM lit_contest_entries e WHERE e.text_id=t.id AND e.contest_id=$1 AND e.status='qualified'`, [c.id, me!.id]);
    const parts = (await query(`SELECT author_id, rank, award, code FROM lit_contest_entries WHERE contest_id=$1 AND status<>'withdrawn'`, [c.id])).rows;
    const winners = parts.filter((p: any) => p.rank);
    for (const w of winners) void notifyLit([w.author_id], `🏆 مبروك! ${w.award}`, `فزت في ${c.title} — شهادتك جاهزة في صفحة المسابقة`, { screen: "lit-contest", id: c.id });
    void notifyLit(parts.filter((p: any) => !p.rank).map((p: any) => p.author_id), `أُعلنت نتائج ${c.title}`, "شكراً لمشاركتك — نصك منشور الآن في ديوان الكُتّاب", { screen: "lit-contest", id: c.id });
    return res.json({ ok: true, winners: winners.length });
  } catch (err) { return fail(res, err, "publish"); }
});

// شهادة الفائز (عامة للتحقق)
router.get("/lit/contest-certificates/:no", async (req: Request, res: Response) => {
  try {
    await ensureLitContestDb();
    const r = await query(
      `SELECT e.certificate_no, e.award, e.rank, e.final_score, e.category, c.title AS contest, c.edition, c.results_at, t.title, t.doc_no, t.id AS text_id, COALESCE(t.pen_name,u.name) AS author
       FROM lit_contest_entries e JOIN lit_contests c ON c.id=e.contest_id JOIN lit_texts t ON t.id=e.text_id JOIN users u ON u.id=e.author_id
       WHERE e.certificate_no=$1 AND c.results_published=true`, [String(req.params.no)]);
    if (!r.rows[0]) return res.status(404).json({ valid: false });
    const x = r.rows[0];
    return res.json({ valid: true, ...x, final_score: x.final_score != null ? Number(x.final_score) : null, category_label: FORM.get(x.category)?.label ?? x.category });
  } catch (err) { return fail(res, err, "cert"); }
});

export { litRow };
export default router;
