// ════════════════════════════════════════════════════════════════
// اتحاد الطلاب — أرشيف الأنشطة + الانتخابات
//
// ضمانات نزاهة الانتخابات:
//  • سرية الاقتراع: الأصوات تُخزَّن في جدول لا يحمل هوية الناخب ولا وقت التصويت ومعرّفها عشوائي،
//    وسجل المقترعين يثبت «صوّت» فقط دون اختياره.
//  • صوت واحد لكل عضو: مفتاح أساسي (الانتخاب، العضو) في سجل المقترعين، داخل معاملة واحدة مع الأصوات.
//  • سجل ناخبين ثابت: يحق التصويت لمن قُبلت عضويته قبل بدء التصويت وبطاقته سارية — لا إضافات في اللحظة الأخيرة.
//  • لا نتائج قبل الإغلاق: لا أحد (حتى الإدارة) يرى أي عدّ أثناء التصويت؛ الفرز آلي من الأصوات المخزّنة.
//  • تجميد بعد البدء: لا تعديل للمواعيد أو المرشحين أو المناصب بعد بدء التصويت.
//  • قابلية التحقق: كل مقترع يأخذ إيصالاً سرياً، وتُنشر بصمات (SHA-256) الإيصالات ليتأكد أن صوته محتسب
//    دون أن يكشف الإيصال اختياره (حماية من شراء الأصوات).
//  • سجل علني: كل إجراء إداري على الانتخاب يُسجَّل ويظهر للجميع.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbClient } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { umAuth, notifyUnionUser } from "./hasahisawi";

const router = Router();

const ACTIVITY_CATS: Record<string, string> = {
  seminar: "ندوة ومحاضرة", course: "دورة وورشة", trip: "رحلة", sports: "نشاط رياضي", culture: "نشاط ثقافي وفني",
  volunteer: "عمل طوعي", meeting: "جمعية عمومية", celebration: "احتفال وتكريم", other: "أخرى",
};
const https = (v: unknown) => /^https:\/\/\S+$/i.test(String(v ?? ""));
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

let ready: Promise<void> | null = null;
function ensureDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS union_activities (
      id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, body TEXT, category VARCHAR(20) NOT NULL DEFAULT 'other',
      activity_date DATE NOT NULL, location VARCHAR(200), cover_url TEXT, images JSONB NOT NULL DEFAULT '[]'::jsonb,
      attendees INTEGER, created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS idx_union_activities_date ON union_activities(activity_date DESC)`);
    await query(`CREATE TABLE IF NOT EXISTS union_elections (
      id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, description TEXT,
      nominations_start TIMESTAMPTZ NOT NULL, nominations_end TIMESTAMPTZ NOT NULL,
      voting_start TIMESTAMPTZ NOT NULL, voting_end TIMESTAMPTZ NOT NULL,
      published_at TIMESTAMPTZ, results_published_at TIMESTAMPTZ, results JSONB,
      created_by INTEGER, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS union_election_positions (
      id SERIAL PRIMARY KEY, election_id INTEGER NOT NULL REFERENCES union_elections(id) ON DELETE CASCADE,
      title VARCHAR(150) NOT NULL, seats INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0)`);
    await query(`CREATE TABLE IF NOT EXISTS union_election_candidates (
      id SERIAL PRIMARY KEY, election_id INTEGER NOT NULL REFERENCES union_elections(id) ON DELETE CASCADE,
      position_id INTEGER NOT NULL REFERENCES union_election_positions(id) ON DELETE CASCADE,
      member_app_id INTEGER NOT NULL, full_name VARCHAR(200) NOT NULL, institution VARCHAR(200), major VARCHAR(200),
      photo_url TEXT, program TEXT, status VARCHAR(12) NOT NULL DEFAULT 'pending', reject_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE (election_id, member_app_id))`);
    await query(`CREATE TABLE IF NOT EXISTS union_election_voters (
      election_id INTEGER NOT NULL REFERENCES union_elections(id) ON DELETE CASCADE,
      member_app_id INTEGER NOT NULL, voted_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (election_id, member_app_id))`);
    // لا هوية ولا وقت ولا تسلسل — معرّف عشوائي فقط
    await query(`CREATE TABLE IF NOT EXISTS union_election_ballots (
      bid VARCHAR(32) PRIMARY KEY, election_id INTEGER NOT NULL REFERENCES union_elections(id) ON DELETE CASCADE,
      position_id INTEGER NOT NULL, candidate_id INTEGER)`);
    await query(`CREATE TABLE IF NOT EXISTS union_election_receipts (
      election_id INTEGER NOT NULL REFERENCES union_elections(id) ON DELETE CASCADE,
      receipt_hash VARCHAR(64) NOT NULL, PRIMARY KEY (election_id, receipt_hash))`);
    await query(`CREATE TABLE IF NOT EXISTS union_election_log (
      id SERIAL PRIMARY KEY, election_id INTEGER NOT NULL REFERENCES union_elections(id) ON DELETE CASCADE,
      actor VARCHAR(200), action VARCHAR(60) NOT NULL, details TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
  })().catch((e) => { ready = null; throw e; }));
}
router.use(["/union/activities", "/union/elections", "/union-manager/activities", "/union-manager/elections"], async (_req, res, next) => {
  try { await ensureDb(); next(); } catch (err) { logger.error({ err }, "[union-plus] ensure"); res.status(500).json({ error: "تعذّر التهيئة" }); }
});

const fail = (res: Response, err: unknown, where: string) => {
  logger.error({ err: (err as any)?.message ?? err }, `[union-plus] ${where}`);
  return res.status(500).json({ error: "حدث خطأ، حاول لاحقاً" });
};
const presidencyOnly = async (req: Request, res: Response) => {
  const m = await umAuth(req, res);
  if (!m) return null;
  if (m.staff_id) { res.status(403).json({ error: "إدارة الانتخابات لرئاسة الاتحاد فقط" }); return null; }
  return m;
};

// ═══════════════════════ أرشيف الأنشطة ═══════════════════════
const actOut = (a: any) => ({ ...a, category_label: ACTIVITY_CATS[a.category] ?? "أخرى" });

router.get("/union/activities", async (req: Request, res: Response) => {
  try {
    const args: unknown[] = []; const w: string[] = [];
    const year = parseInt(String(req.query.year ?? ""), 10);
    if (year > 2000) { args.push(year); w.push(`EXTRACT(YEAR FROM activity_date)=$${args.length}`); }
    if (ACTIVITY_CATS[String(req.query.category ?? "")]) { args.push(String(req.query.category)); w.push(`category=$${args.length}`); }
    const r = await query(`SELECT * FROM union_activities ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY activity_date DESC, id DESC LIMIT 300`, args);
    const stats = (await query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(attendees),0)::int AS attendees,
        COALESCE(SUM(jsonb_array_length(images)),0)::int AS photos,
        ARRAY(SELECT DISTINCT EXTRACT(YEAR FROM activity_date)::int FROM union_activities ORDER BY 1 DESC) AS years
      FROM union_activities`)).rows[0];
    return res.json({ activities: r.rows.map(actOut), stats, categories: ACTIVITY_CATS });
  } catch (e) { return fail(res, e, "activities"); }
});

router.get("/union/activities/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const r = await query(`SELECT * FROM union_activities WHERE id=$1`, [parseInt(String(req.params.id), 10) || 0]);
    if (!r.rows[0]) return res.status(404).json({ error: "النشاط غير موجود" });
    return res.json({ activity: actOut(r.rows[0]) });
  } catch (e) { return fail(res, e, "activity"); }
});

function readActivity(b: any): { ok: false; error: string } | { ok: true; v: any[] } {
  const title = clip(b.title, 200);
  const date = String(b.activity_date ?? "").slice(0, 10);
  if (title.length < 3) return { ok: false, error: "اكتب عنوان النشاط" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "اختر تاريخ النشاط" };
  const images = (Array.isArray(b.images) ? b.images : []).filter(https).slice(0, 30);
  const cover = https(b.cover_url) ? String(b.cover_url) : images[0] ?? null;
  const att = b.attendees == null || b.attendees === "" ? null : Math.max(0, Math.min(1_000_000, parseInt(String(b.attendees), 10) || 0));
  return { ok: true, v: [title, clip(b.body, 6000) || null, ACTIVITY_CATS[b.category] ? b.category : "other", date, clip(b.location, 200) || null, cover, JSON.stringify(images), att] };
}

router.post("/union-manager/activities", writeLimiter, async (req: Request, res: Response): Promise<any> => {
  const m = await umAuth(req, res, "can_post_announcements"); if (!m) return;
  try {
    const p = readActivity(req.body || {}); if (!p.ok) return res.status(400).json({ error: p.error });
    const r = await query(`INSERT INTO union_activities (title, body, category, activity_date, location, cover_url, images, attendees, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`, [...p.v, m.id]);
    return res.status(201).json({ activity: actOut(r.rows[0]) });
  } catch (e) { return fail(res, e, "activity-create"); }
});

router.patch("/union-manager/activities/:id", writeLimiter, async (req: Request, res: Response): Promise<any> => {
  const m = await umAuth(req, res, "can_post_announcements"); if (!m) return;
  try {
    const p = readActivity(req.body || {}); if (!p.ok) return res.status(400).json({ error: p.error });
    const r = await query(`UPDATE union_activities SET title=$1, body=$2, category=$3, activity_date=$4, location=$5, cover_url=$6,
      images=$7::jsonb, attendees=$8, updated_at=NOW() WHERE id=$9 RETURNING *`, [...p.v, parseInt(String(req.params.id), 10) || 0]);
    if (!r.rows[0]) return res.status(404).json({ error: "النشاط غير موجود" });
    return res.json({ activity: actOut(r.rows[0]) });
  } catch (e) { return fail(res, e, "activity-update"); }
});

router.delete("/union-manager/activities/:id", async (req: Request, res: Response): Promise<any> => {
  const m = await umAuth(req, res, "can_post_announcements"); if (!m) return;
  try {
    await query(`DELETE FROM union_activities WHERE id=$1`, [parseInt(String(req.params.id), 10) || 0]);
    return res.json({ ok: true });
  } catch (e) { return fail(res, e, "activity-delete"); }
});

// ═══════════════════════ الانتخابات ═══════════════════════
type Phase = "draft" | "upcoming" | "nominations" | "campaign" | "voting" | "counting" | "results";
const PHASE_LABEL: Record<Phase, string> = {
  draft: "مسودة", upcoming: "قريباً", nominations: "باب الترشح مفتوح", campaign: "الحملات الانتخابية",
  voting: "التصويت جارٍ", counting: "انتهى التصويت — بانتظار إعلان النتائج", results: "أُعلنت النتائج",
};
function phaseOf(e: any, now = Date.now()): Phase {
  if (!e.published_at) return "draft";
  if (e.results_published_at) return "results";
  const t = (x: any) => new Date(x).getTime();
  if (now < t(e.nominations_start)) return "upcoming";
  if (now < t(e.nominations_end)) return "nominations";
  if (now < t(e.voting_start)) return "campaign";
  if (now < t(e.voting_end)) return "voting";
  return "counting";
}
const votingStarted = (e: any) => !!e.published_at && Date.now() >= new Date(e.voting_start).getTime();

async function logE(electionId: number, actor: string, action: string, details?: string) {
  await query(`INSERT INTO union_election_log (election_id, actor, action, details) VALUES ($1,$2,$3,$4)`, [electionId, actor, action, details ?? null]).catch(() => {});
}

/** عضوية الطالب الحالية (مع ربط الحساب بالهاتف كما في صفحة «عضويتي») */
async function memberOf(userId: number, phone: string | null): Promise<any | null> {
  let r = await query(`SELECT * FROM student_union_applications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId]);
  const d = String(phone ?? "").replace(/\D/g, "").slice(-9);
  if (!r.rows[0] && d.length === 9) {
    r = await query(`SELECT * FROM student_union_applications WHERE user_id IS NULL AND RIGHT(REGEXP_REPLACE(phone,'[^0-9]','','g'),9)=$1 ORDER BY created_at DESC LIMIT 1`, [d]);
    if (r.rows[0]) await query(`UPDATE student_union_applications SET user_id=$1 WHERE id=$2 AND user_id IS NULL`, [userId, r.rows[0].id]).catch(() => {});
  }
  return r.rows[0] ?? null;
}
/** أهلية الاقتراع: عضو مقبول قبل بدء التصويت وبطاقته سارية */
function eligibility(app: any, e: any): { ok: boolean; reason?: string } {
  if (!app) return { ok: false, reason: "التصويت لأعضاء الاتحاد. قدّم طلب عضوية أولاً." };
  if (app.status !== "approved") return { ok: false, reason: app.status === "suspended" ? "عضويتك موقوفة." : "عضويتك لم تُقبل بعد." };
  if (!app.reviewed_at || new Date(app.reviewed_at).getTime() > new Date(e.voting_start).getTime())
    return { ok: false, reason: "سجل الناخبين يضم من قُبلت عضويتهم قبل بدء التصويت." };
  if (!app.card_expires_at || new Date(app.card_expires_at).getTime() <= Date.now()) return { ok: false, reason: "بطاقة عضويتك منتهية. جدّدها لدى الاتحاد." };
  return { ok: true };
}

async function electionFull(id: number, opts: { manager?: boolean } = {}) {
  const e = (await query(`SELECT * FROM union_elections WHERE id=$1`, [id])).rows[0];
  if (!e) return null;
  const positions = (await query(`SELECT * FROM union_election_positions WHERE election_id=$1 ORDER BY sort, id`, [id])).rows;
  const cands = (await query(`SELECT id, position_id, full_name, institution, major, photo_url, program, status, reject_reason, member_app_id
      FROM union_election_candidates WHERE election_id=$1 ${opts.manager ? "" : "AND status='approved'"} ORDER BY full_name`, [id])).rows;
  const phase = phaseOf(e);
  const voters = parseInt((await query(`SELECT COUNT(*) FROM union_election_voters WHERE election_id=$1`, [id])).rows[0].count, 10);
  const eligible = parseInt((await query(`SELECT COUNT(*) FROM student_union_applications WHERE status='approved'
      AND reviewed_at <= $1 AND card_expires_at > NOW()`, [e.voting_start])).rows[0].count, 10);
  const log = (await query(`SELECT action, details, actor, created_at FROM union_election_log WHERE election_id=$1 ORDER BY id DESC LIMIT 100`, [id])).rows;
  return {
    id: e.id, title: e.title, description: e.description,
    nominations_start: e.nominations_start, nominations_end: e.nominations_end, voting_start: e.voting_start, voting_end: e.voting_end,
    published_at: e.published_at, results_published_at: e.results_published_at,
    phase, phase_label: PHASE_LABEL[phase], locked: votingStarted(e),
    turnout: { voters, eligible, percent: eligible ? Math.round((voters / eligible) * 1000) / 10 : 0 },
    positions: positions.map((p: any) => ({ id: p.id, title: p.title, seats: p.seats,
      candidates: cands.filter((c: any) => c.position_id === p.id).map((c: any) => opts.manager ? c : { ...c, member_app_id: undefined, reject_reason: undefined }) })),
    results: e.results_published_at ? e.results : null,
    log,
  };
}

/** الفرز: يُحتسب من جدول الأصوات المجهولة فقط */
async function tally(id: number) {
  const positions = (await query(`SELECT * FROM union_election_positions WHERE election_id=$1 ORDER BY sort, id`, [id])).rows;
  const counts = (await query(`SELECT position_id, candidate_id, COUNT(*)::int AS n FROM union_election_ballots WHERE election_id=$1 GROUP BY 1,2`, [id])).rows;
  const cands = (await query(`SELECT id, position_id, full_name, institution, photo_url FROM union_election_candidates WHERE election_id=$1 AND status='approved'`, [id])).rows;
  const voters = parseInt((await query(`SELECT COUNT(*) FROM union_election_voters WHERE election_id=$1`, [id])).rows[0].count, 10);
  const receipts = parseInt((await query(`SELECT COUNT(*) FROM union_election_receipts WHERE election_id=$1`, [id])).rows[0].count, 10);
  return {
    voters, receipts, consistent: voters === receipts,
    positions: positions.map((p: any) => {
      const rows = cands.filter((c: any) => c.position_id === p.id).map((c: any) => ({
        candidate_id: c.id, full_name: c.full_name, institution: c.institution, photo_url: c.photo_url,
        votes: counts.find((x: any) => x.position_id === p.id && x.candidate_id === c.id)?.n ?? 0,
      })).sort((a: any, b: any) => b.votes - a.votes || a.full_name.localeCompare(b.full_name, "ar"));
      const blank = counts.find((x: any) => x.position_id === p.id && x.candidate_id == null)?.n ?? 0;
      const valid = rows.reduce((s: number, r: any) => s + r.votes, 0);
      const cut = rows[p.seats - 1]?.votes;
      // تعادل على آخر مقعد: لا يُعلن فائز بالقرعة تلقائياً
      const tieAtCut = cut != null && cut > 0 && rows.filter((r: any) => r.votes === cut).length > rows.slice(0, p.seats).filter((r: any) => r.votes === cut).length;
      return {
        position_id: p.id, title: p.title, seats: p.seats, valid_votes: valid, blank_votes: blank, tie: tieAtCut,
        candidates: rows.map((r: any, i: number) => ({ ...r, percent: valid ? Math.round((r.votes / valid) * 1000) / 10 : 0,
          winner: !tieAtCut ? i < p.seats && r.votes > 0 : r.votes > (cut ?? 0) })),
      };
    }),
  };
}

const membersUserIds = async () =>
  (await query(`SELECT DISTINCT user_id FROM student_union_applications WHERE status='approved' AND user_id IS NOT NULL`)).rows.map((x: any) => Number(x.user_id));
const notifyMembers = async (title: string, body: string, data: Record<string, unknown>) => {
  const ids = await membersUserIds().catch(() => [] as number[]);
  for (const id of ids) void notifyUnionUser(id, "union_election", title, body, data);
};

// ── عام: قائمة الانتخابات وتفاصيلها
router.get("/union/elections", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req).catch(() => null);
    const app = me ? await memberOf(me.id, me.phone) : null;
    const rows = (await query(`SELECT id FROM union_elections WHERE published_at IS NOT NULL ORDER BY voting_start DESC LIMIT 30`)).rows;
    const out = [];
    for (const r of rows) {
      const e = await electionFull(r.id);
      if (!e) continue;
      const voted = app ? !!(await query(`SELECT 1 FROM union_election_voters WHERE election_id=$1 AND member_app_id=$2`, [r.id, app.id])).rows[0] : false;
      const raw = (await query(`SELECT * FROM union_elections WHERE id=$1`, [r.id])).rows[0];
      const elig = eligibility(app, raw);
      const myCand = app ? (await query(`SELECT id, position_id, status, reject_reason FROM union_election_candidates WHERE election_id=$1 AND member_app_id=$2`, [r.id, app.id])).rows[0] ?? null : null;
      out.push({ ...e, me: { member: !!app && app.status === "approved", eligible: elig.ok, reason: elig.reason ?? null, voted, candidacy: myCand } });
    }
    return res.json({ elections: out });
  } catch (e) { return fail(res, e, "elections"); }
});

// ── ترشّح العضو نفسه
router.post("/union/elections/:id/nominate", writeLimiter, async (req: Request, res: Response): Promise<any> => {
  const me = await sessionUser(req);
  if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
  try {
    const id = parseInt(String(req.params.id), 10) || 0;
    const e = (await query(`SELECT * FROM union_elections WHERE id=$1`, [id])).rows[0];
    if (!e || phaseOf(e) !== "nominations") return res.status(400).json({ error: "باب الترشح غير مفتوح الآن" });
    const app = await memberOf(me.id, me.phone);
    if (!app || app.status !== "approved") return res.status(403).json({ error: "الترشح لأعضاء الاتحاد المقبولين فقط" });
    if (!app.card_expires_at || new Date(app.card_expires_at) <= new Date()) return res.status(403).json({ error: "بطاقة عضويتك منتهية. جدّدها أولاً." });
    const pos = (await query(`SELECT id FROM union_election_positions WHERE id=$1 AND election_id=$2`, [parseInt(String(req.body?.position_id), 10) || 0, id])).rows[0];
    if (!pos) return res.status(400).json({ error: "اختر المنصب" });
    const program = clip(req.body?.program, 3000);
    if (program.length < 30) return res.status(400).json({ error: "اكتب برنامجك الانتخابي (30 حرفاً على الأقل)" });
    const photo = https(req.body?.photo_url) ? String(req.body.photo_url) : null;
    const r = await query(`INSERT INTO union_election_candidates (election_id, position_id, member_app_id, full_name, institution, major, photo_url, program)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (election_id, member_app_id) DO NOTHING RETURNING id`,
      [id, pos.id, app.id, app.full_name, app.institution, app.major, photo, program]);
    if (!r.rows[0]) return res.status(409).json({ error: "سبق أن ترشحت في هذا الانتخاب" });
    await logE(id, "مرشح", "nomination", `ترشّح ${app.full_name}`);
    return res.status(201).json({ ok: true, message: "وصل ترشحك إلى رئاسة الاتحاد للمراجعة" });
  } catch (e) { return fail(res, e, "nominate"); }
});

// ── الاقتراع
router.post("/union/elections/:id/vote", writeLimiter, async (req: Request, res: Response): Promise<any> => {
  const me = await sessionUser(req);
  if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
  const id = parseInt(String(req.params.id), 10) || 0;
  const client = await dbClient();
  try {
    const e = (await query(`SELECT * FROM union_elections WHERE id=$1`, [id])).rows[0];
    if (!e || phaseOf(e) !== "voting") return res.status(400).json({ error: "التصويت غير مفتوح الآن" });
    const app = await memberOf(me.id, me.phone);
    const el = eligibility(app, e);
    if (!el.ok) return res.status(403).json({ error: el.reason });
    const positions = (await query(`SELECT * FROM union_election_positions WHERE election_id=$1`, [id])).rows;
    const approved = (await query(`SELECT id, position_id FROM union_election_candidates WHERE election_id=$1 AND status='approved'`, [id])).rows;
    const choices = (req.body?.choices && typeof req.body.choices === "object") ? req.body.choices : {};
    const ballots: { position_id: number; candidate_id: number | null }[] = [];
    for (const p of positions) {
      const raw = choices[String(p.id)];
      const ids = [...new Set((Array.isArray(raw) ? raw : []).map((x: any) => parseInt(String(x), 10)).filter(Boolean))] as number[];
      if (ids.length > p.seats) return res.status(400).json({ error: `«${p.title}»: يمكنك اختيار ${p.seats} على الأكثر` });
      for (const cid of ids) {
        if (!approved.some((c: any) => c.id === cid && c.position_id === p.id)) return res.status(400).json({ error: "اختيار غير صالح" });
        ballots.push({ position_id: p.id, candidate_id: cid });
      }
      if (!ids.length) ballots.push({ position_id: p.id, candidate_id: null }); // ورقة بيضاء لهذا المنصب
    }
    const receipt = randomBytes(6).toString("hex").toUpperCase().replace(/(.{4})(?=.)/g, "$1-");
    await client.query("BEGIN");
    const ins = await client.query(`INSERT INTO union_election_voters (election_id, member_app_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1`, [id, app.id]);
    if (!ins.rows[0]) { await client.query("ROLLBACK"); return res.status(409).json({ error: "سبق أن صوّتّ في هذا الانتخاب. لكل عضو صوت واحد." }); }
    // ترتيب عشوائي للإدراج حتى لا يربط أحد الأصوات بالمقترع من ترتيبها
    for (const b of ballots.sort(() => Math.random() - 0.5)) {
      await client.query(`INSERT INTO union_election_ballots (bid, election_id, position_id, candidate_id) VALUES ($1,$2,$3,$4)`,
        [randomBytes(16).toString("hex"), id, b.position_id, b.candidate_id]);
    }
    await client.query(`INSERT INTO union_election_receipts (election_id, receipt_hash) VALUES ($1,$2)`, [id, sha(`${id}:${receipt}`)]);
    await client.query("COMMIT");
    return res.status(201).json({ ok: true, receipt, message: "سُجّل صوتك. احتفظ بالإيصال لتتحقق أنه محتسب." });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    return fail(res, e, "vote");
  } finally { client.release(); }
});

// ── التحقق من الإيصال (علني، لا يكشف الاختيار)
router.post("/union/elections/:id/verify", writeLimiter, async (req: Request, res: Response): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10) || 0;
    const receipt = String(req.body?.receipt ?? "").toUpperCase().replace(/[^0-9A-F]/g, "").replace(/(.{4})(?=.)/g, "$1-");
    if (receipt.length !== 14) return res.status(400).json({ error: "الإيصال 12 رمزاً، مثل A1B2-C3D4-E5F6" });
    const h = sha(`${id}:${receipt}`);
    const r = await query(`SELECT 1 FROM union_election_receipts WHERE election_id=$1 AND receipt_hash=$2`, [id, h]);
    return res.json({ counted: !!r.rows[0], fingerprint: h.slice(0, 16) });
  } catch (e) { return fail(res, e, "verify"); }
});

// ── بصمات الإيصالات (للتدقيق العلني بعد انتهاء التصويت)
router.get("/union/elections/:id/receipts", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = parseInt(String(req.params.id), 10) || 0;
    const e = (await query(`SELECT * FROM union_elections WHERE id=$1`, [id])).rows[0];
    if (!e || !["counting", "results"].includes(phaseOf(e))) return res.status(400).json({ error: "تُنشر البصمات بعد انتهاء التصويت" });
    const r = await query(`SELECT receipt_hash FROM union_election_receipts WHERE election_id=$1 ORDER BY receipt_hash`, [id]);
    return res.json({ count: r.rows.length, fingerprints: r.rows.map((x: any) => x.receipt_hash.slice(0, 16)) });
  } catch (e) { return fail(res, e, "receipts"); }
});

// ═══ إدارة الانتخابات (رئاسة الاتحاد) ═══
router.get("/union-manager/elections", async (req: Request, res: Response): Promise<any> => {
  const m = await umAuth(req, res); if (!m) return;
  try {
    const rows = (await query(`SELECT id FROM union_elections ORDER BY created_at DESC LIMIT 30`)).rows;
    const out = [];
    for (const r of rows) out.push(await electionFull(r.id, { manager: true }));
    return res.json({ elections: out, can_manage: !m.staff_id });
  } catch (e) { return fail(res, e, "m-elections"); }
});

function readSchedule(b: any) {
  const d = (k: string) => { const t = new Date(String(b[k] ?? "")); return isNaN(t.getTime()) ? null : t; };
  const ns = d("nominations_start"), ne = d("nominations_end"), vs = d("voting_start"), ve = d("voting_end");
  if (!ns || !ne || !vs || !ve) return { error: "حدّد مواعيد الترشح والتصويت كاملة" };
  if (!(ns < ne && ne <= vs && vs < ve)) return { error: "الترتيب: بداية الترشح ← نهايته ← بداية التصويت ← نهايته" };
  if (ve.getTime() - vs.getTime() < 2 * 3600_000) return { error: "مدة التصويت ساعتان على الأقل" };
  return { ns, ne, vs, ve };
}

router.post("/union-manager/elections", writeLimiter, async (req: Request, res: Response): Promise<any> => {
  const m = await presidencyOnly(req, res); if (!m) return;
  try {
    const b = req.body || {};
    const title = clip(b.title, 200);
    if (title.length < 5) return res.status(400).json({ error: "اكتب عنوان الانتخاب" });
    const sc = readSchedule(b); if ("error" in sc) return res.status(400).json({ error: sc.error });
    const positions = (Array.isArray(b.positions) ? b.positions : [])
      .map((p: any) => ({ title: clip(p?.title, 150), seats: Math.max(1, Math.min(30, parseInt(String(p?.seats), 10) || 1)) }))
      .filter((p: any) => p.title.length >= 2).slice(0, 30);
    if (!positions.length) return res.status(400).json({ error: "أضف منصباً واحداً على الأقل" });
    const e = (await query(`INSERT INTO union_elections (title, description, nominations_start, nominations_end, voting_start, voting_end, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [title, clip(b.description, 4000) || null, sc.ns, sc.ne, sc.vs, sc.ve, m.id])).rows[0];
    for (const [i, p] of positions.entries()) await query(`INSERT INTO union_election_positions (election_id, title, seats, sort) VALUES ($1,$2,$3,$4)`, [e.id, p.title, p.seats, i]);
    await logE(e.id, m.full_name, "created", `أُنشئ الانتخاب بـ${positions.length} منصب`);
    return res.status(201).json({ election: await electionFull(e.id, { manager: true }) });
  } catch (e) { return fail(res, e, "m-create"); }
});

router.patch("/union-manager/elections/:id", writeLimiter, async (req: Request, res: Response): Promise<any> => {
  const m = await presidencyOnly(req, res); if (!m) return;
  try {
    const id = parseInt(String(req.params.id), 10) || 0;
    const e = (await query(`SELECT * FROM union_elections WHERE id=$1`, [id])).rows[0];
    if (!e) return res.status(404).json({ error: "غير موجود" });
    const action = String(req.body?.action ?? "");
    if (action === "publish") {
      if (e.published_at) return res.status(400).json({ error: "منشور مسبقاً" });
      const n = (await query(`SELECT COUNT(*) FROM union_election_positions WHERE election_id=$1`, [id])).rows[0].count;
      if (!+n) return res.status(400).json({ error: "أضف المناصب أولاً" });
      await query(`UPDATE union_elections SET published_at=NOW() WHERE id=$1`, [id]);
      await logE(id, m.full_name, "published", "نُشر الانتخاب للأعضاء");
      void notifyMembers(`🗳️ ${e.title}`, `باب الترشح يفتح ${new Date(e.nominations_start).toLocaleDateString("ar-EG", { day: "numeric", month: "long" })}، والتصويت ${new Date(e.voting_start).toLocaleDateString("ar-EG", { day: "numeric", month: "long" })}.`, { screen: "student-union-elections", id });
    } else if (action === "schedule") {
      if (votingStarted(e)) return res.status(409).json({ error: "بدأ التصويت: المواعيد مجمّدة لضمان النزاهة" });
      const sc = readSchedule(req.body || {}); if ("error" in sc) return res.status(400).json({ error: sc.error });
      // بعد فتح باب الترشح لا يُقدَّم موعد بدايته
      if (e.published_at && Date.now() >= new Date(e.nominations_start).getTime() && sc.ns.getTime() !== new Date(e.nominations_start).getTime())
        return res.status(409).json({ error: "فُتح باب الترشح: لا يُعدَّل موعد بدايته" });
      await query(`UPDATE union_elections SET nominations_start=$2, nominations_end=$3, voting_start=$4, voting_end=$5 WHERE id=$1`, [id, sc.ns, sc.ne, sc.vs, sc.ve]);
      const f = (x: Date) => x.toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
      await logE(id, m.full_name, "schedule", `الترشح ${f(sc.ns)} – ${f(sc.ne)} · التصويت ${f(sc.vs)} – ${f(sc.ve)}`);
    } else if (action === "details") {
      if (votingStarted(e)) return res.status(409).json({ error: "بدأ التصويت: لا تعديل" });
      await query(`UPDATE union_elections SET title=COALESCE(NULLIF($2,''), title), description=$3 WHERE id=$1`, [id, clip(req.body?.title, 200), clip(req.body?.description, 4000) || null]);
      await logE(id, m.full_name, "details", "عُدّل العنوان أو الوصف");
    } else if (action === "publish_results") {
      if (phaseOf(e) !== "counting") return res.status(400).json({ error: "تُعلن النتائج بعد انتهاء التصويت" });
      const t = await tally(id);
      await query(`UPDATE union_elections SET results=$2::jsonb, results_published_at=NOW() WHERE id=$1`, [id, JSON.stringify({ ...t, published_at: new Date().toISOString() })]);
      await logE(id, m.full_name, "results", `أُعلنت النتائج — ${t.voters} مقترع`);
      void notifyMembers(`📊 نتائج ${e.title}`, "أُعلنت النتائج الرسمية. اطّلع عليها في التطبيق.", { screen: "student-union-elections", id });
    } else return res.status(400).json({ error: "إجراء غير معروف" });
    return res.json({ election: await electionFull(id, { manager: true }) });
  } catch (e) { return fail(res, e, "m-update"); }
});

router.delete("/union-manager/elections/:id", async (req: Request, res: Response): Promise<any> => {
  const m = await presidencyOnly(req, res); if (!m) return;
  try {
    const id = parseInt(String(req.params.id), 10) || 0;
    const r = await query(`DELETE FROM union_elections WHERE id=$1 AND published_at IS NULL RETURNING id`, [id]);
    if (!r.rows[0]) return res.status(409).json({ error: "لا يُحذف انتخاب منشور — يبقى سجله للشفافية" });
    return res.json({ ok: true });
  } catch (e) { return fail(res, e, "m-delete"); }
});

// اعتماد/رفض مرشح أو إضافته برقم العضوية
router.patch("/union-manager/elections/:id/candidates/:cid", writeLimiter, async (req: Request, res: Response): Promise<any> => {
  const m = await presidencyOnly(req, res); if (!m) return;
  try {
    const id = parseInt(String(req.params.id), 10) || 0;
    const e = (await query(`SELECT * FROM union_elections WHERE id=$1`, [id])).rows[0];
    if (!e) return res.status(404).json({ error: "غير موجود" });
    if (votingStarted(e)) return res.status(409).json({ error: "بدأ التصويت: قائمة المرشحين مجمّدة" });
    const status = String(req.body?.status ?? "");
    if (!["approved", "rejected", "pending"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const reason = clip(req.body?.reason, 300) || null;
    if (status === "rejected" && !reason) return res.status(400).json({ error: "اكتب سبب الرفض — يظهر في السجل العلني" });
    const c = (await query(`UPDATE union_election_candidates SET status=$3, reject_reason=$4 WHERE id=$1 AND election_id=$2 RETURNING *`,
      [parseInt(String(req.params.cid), 10) || 0, id, status, status === "rejected" ? reason : null])).rows[0];
    if (!c) return res.status(404).json({ error: "المرشح غير موجود" });
    await logE(id, m.full_name, status === "approved" ? "candidate_approved" : status === "rejected" ? "candidate_rejected" : "candidate_pending",
      `${c.full_name}${status === "rejected" ? ` — السبب: ${reason}` : ""}`);
    const app = (await query(`SELECT user_id FROM student_union_applications WHERE id=$1`, [c.member_app_id])).rows[0];
    if (app?.user_id && status !== "pending") void notifyUnionUser(Number(app.user_id), "union_election",
      status === "approved" ? "✅ اعتُمد ترشحك" : "لم يُعتمد ترشحك", status === "approved" ? `أنت الآن مرشح رسمي في «${e.title}».` : `السبب: ${reason}`, { screen: "student-union-elections", id });
    return res.json({ candidate: c });
  } catch (e) { return fail(res, e, "m-candidate"); }
});

router.post("/union-manager/elections/:id/candidates", writeLimiter, async (req: Request, res: Response): Promise<any> => {
  const m = await presidencyOnly(req, res); if (!m) return;
  try {
    const id = parseInt(String(req.params.id), 10) || 0;
    const e = (await query(`SELECT * FROM union_elections WHERE id=$1`, [id])).rows[0];
    if (!e) return res.status(404).json({ error: "غير موجود" });
    if (votingStarted(e)) return res.status(409).json({ error: "بدأ التصويت: قائمة المرشحين مجمّدة" });
    const app = (await query(`SELECT * FROM student_union_applications WHERE UPPER(member_no)=UPPER($1) AND status='approved'`, [clip(req.body?.member_no, 40)])).rows[0];
    if (!app) return res.status(404).json({ error: "لا يوجد عضو فعّال بهذا الرقم" });
    const pos = (await query(`SELECT id FROM union_election_positions WHERE id=$1 AND election_id=$2`, [parseInt(String(req.body?.position_id), 10) || 0, id])).rows[0];
    if (!pos) return res.status(400).json({ error: "اختر المنصب" });
    const r = await query(`INSERT INTO union_election_candidates (election_id, position_id, member_app_id, full_name, institution, major, program, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'approved') ON CONFLICT (election_id, member_app_id) DO NOTHING RETURNING *`,
      [id, pos.id, app.id, app.full_name, app.institution, app.major, clip(req.body?.program, 3000) || null]);
    if (!r.rows[0]) return res.status(409).json({ error: "هذا العضو مرشح مسبقاً" });
    await logE(id, m.full_name, "candidate_added", `أضافت الرئاسة ${app.full_name} (${app.member_no})`);
    return res.status(201).json({ candidate: r.rows[0] });
  } catch (e) { return fail(res, e, "m-add-candidate"); }
});

// الفرز المبدئي للرئاسة بعد انتهاء التصويت فقط
router.get("/union-manager/elections/:id/tally", async (req: Request, res: Response): Promise<any> => {
  const m = await presidencyOnly(req, res); if (!m) return;
  try {
    const id = parseInt(String(req.params.id), 10) || 0;
    const e = (await query(`SELECT * FROM union_elections WHERE id=$1`, [id])).rows[0];
    if (!e || !["counting", "results"].includes(phaseOf(e))) return res.status(403).json({ error: "لا يظهر أي عدّ قبل انتهاء التصويت" });
    return res.json({ tally: await tally(id) });
  } catch (e) { return fail(res, e, "m-tally"); }
});

export default router;
