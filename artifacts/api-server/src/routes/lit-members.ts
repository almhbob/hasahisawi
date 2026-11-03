// ════════════════════════════════════════════════════════════════
// 🪪 عضوية «ديوان الكُتّاب» — استمارة احترافية + بطاقة عصرية بحسب الفئة.
//  • الفئات: شاعر، قاص/روائي، كاتب ومقالي، ناقد، كاتب ناشئ، صحفي (عضوية خاصة).
//  • الاستمارة تتطلب ثلاثة أعمال يتعهد الكاتب بأنها له (من نصوصه الموثّقة أو أعمال منشورة).
//  • الإدارة تعتمد العضوية لسنة؛ وتُجدَّد سنوياً بطلب من العضو وموافقة الإدارة.
//  • تعليق تلقائي: إن توقف العضو عن النشر 30 يوماً متصلة تُعلَّق عضويته (تنبيه قبلها بأسبوع)،
//    وتعود تلقائياً بنشر نص جديد معتمد — حتى يبقى العمل دائماً.
//  • أوسمة تلقائية بحسب العطاء + جوائز وأوسمة تمنحها الإدارة.
//  • دعوات انضمام للأفراد والمؤسسات الأدبية والنقابات واتحادات الإعلام والصحافة.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { verifyGithubOidc } from "./ci-play-token";
import { ensureWritersDb, isWritersReviewer, notifyLit } from "./ithraa-writers";

const router = Router();
const API_BASE = (process.env.PUBLIC_API_BASE || "https://api-server-gilt-ten.vercel.app").replace(/\/$/, "");
const WEB = "https://hasahisawi.pages.dev";
const INACTIVE_DAYS = 30;
const WARN_DAYS = 23;

export const MEMBER_CATEGORIES = [
  { key: "poet", label: "شاعر", title: "عضو شاعر", color: "#1B4D6B", accent: "#C99A2E", icon: "musical-notes" },
  { key: "storyteller", label: "قاص وروائي", title: "عضو قاص", color: "#7A2E3A", accent: "#E9C46A", icon: "book" },
  { key: "writer", label: "كاتب ومقالي", title: "عضو كاتب", color: "#1F5F4A", accent: "#D4B26A", icon: "create" },
  { key: "critic", label: "ناقد ودارس", title: "عضو ناقد", color: "#334155", accent: "#CBD5E1", icon: "glasses" },
  { key: "emerging", label: "كاتب ناشئ", title: "عضو ناشئ", color: "#0F766E", accent: "#99F6E4", icon: "leaf" },
  { key: "journalist", label: "صحفي وإعلامي", title: "عضوية صحفية", color: "#111827", accent: "#E11D48", icon: "newspaper" },
] as const;
const CAT = new Map<string, (typeof MEMBER_CATEGORIES)[number]>(MEMBER_CATEGORIES.map((c) => [c.key, c]));
const TIER_LABEL: Record<string, string> = { professional: "عضوية احترافية", affiliate: "عضوية منتسب", journalist: "عضوية صحفية" };

// الأوسمة التلقائية
export const BADGES: Record<string, { label: string; desc: string; icon: string; color: string }> = {
  founding: { label: "عضو مؤسس", desc: "من أول خمسين عضواً في الديوان", icon: "flag", color: "#C99A2E" },
  first_text: { label: "القلم الأول", desc: "نشر أول نص في الديوان", icon: "create", color: "#2D6A4F" },
  prolific10: { label: "غزير العطاء", desc: "10 نصوص منشورة", icon: "layers", color: "#1B4D6B" },
  prolific50: { label: "سيّد الكلمة", desc: "50 نصاً منشوراً", icon: "diamond", color: "#7A2E3A" },
  loved: { label: "محبوب القرّاء", desc: "100 إعجاب على نصوصه", icon: "heart", color: "#C0392B" },
  featured: { label: "من المختارات", desc: "اختار المشرفون أحد نصوصه", icon: "star", color: "#C99A2E" },
  poet5: { label: "فارس القصيد", desc: "5 قصائد منشورة", icon: "musical-notes", color: "#1B4D6B" },
  story5: { label: "الحكّاء", desc: "5 قصص منشورة", icon: "book", color: "#7A2E3A" },
  prose5: { label: "صاحب الخاطر", desc: "5 خواطر ونصوص منشورة", icon: "leaf", color: "#2D6A4F" },
  consistent: { label: "المثابر", desc: "نشر في كل شهر من الأشهر الثلاثة الأخيرة", icon: "flame", color: "#C2580A" },
  winner: { label: "فائز بالمسابقة", desc: "حصد مركزاً في مسابقة حصاحيصاوي الأدبية", icon: "trophy", color: "#C99A2E" },
  gold: { label: "الوسام الذهبي", desc: "المركز الأول في المسابقة الأدبية", icon: "medal", color: "#D4A017" },
  renewed: { label: "عام من العطاء", desc: "جدّد عضويته عاماً جديداً", icon: "refresh-circle", color: "#0F766E" },
  press: { label: "صحفي معتمد", desc: "عضوية صحفية معتمدة", icon: "newspaper", color: "#E11D48" },
};

let ready: Promise<void> | null = null;
export function ensureMembersDb(): Promise<void> {
  return (ready ??= (async () => {
    await ensureWritersDb();
    await query(`CREATE SEQUENCE IF NOT EXISTS lit_member_seq START 1`);
    await query(`CREATE TABLE IF NOT EXISTS lit_members (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      category VARCHAR(16) NOT NULL,
      tier VARCHAR(14) NOT NULL DEFAULT 'professional',
      full_name VARCHAR(120) NOT NULL,
      pen_name VARCHAR(80),
      phone VARCHAR(30),
      email VARCHAR(120),
      city VARCHAR(80),
      birth_year SMALLINT,
      bio TEXT,
      genres TEXT[] NOT NULL DEFAULT '{}',
      publications TEXT,
      press_org VARCHAR(160),
      press_role VARCHAR(80),
      press_card_no VARCHAR(60),
      press_years SMALLINT,
      works JSONB NOT NULL DEFAULT '[]',
      pledge_signature VARCHAR(120) NOT NULL,
      pledge_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      referred_by INTEGER,
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      member_no VARCHAR(30) UNIQUE,
      card_token VARCHAR(40) UNIQUE,
      issued_at TIMESTAMPTZ,
      valid_until TIMESTAMPTZ,
      renewals SMALLINT NOT NULL DEFAULT 0,
      renewal_requested_at TIMESTAMPTZ,
      suspended_reason VARCHAR(12),
      suspended_at TIMESTAMPTZ,
      warned_at TIMESTAMPTZ,
      admin_note TEXT,
      reviewed_by INTEGER,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lit_members_status ON lit_members (status)`);
    await query(`CREATE TABLE IF NOT EXISTS lit_member_awards (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(120) NOT NULL,
      description VARCHAR(300),
      icon VARCHAR(30) NOT NULL DEFAULT 'ribbon',
      color VARCHAR(9) NOT NULL DEFAULT '#C99A2E',
      awarded_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS lit_invites (
      id SERIAL PRIMARY KEY,
      inviter_id INTEGER NOT NULL,
      audience VARCHAR(16) NOT NULL,
      channel VARCHAR(16),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  })().catch((e) => { ready = null; throw e; }));
}

// ─── أدوات ───────────────────────────────────────────────────
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const canAdmin = async (u: SessionUser | null) => isStaff(u) || (await isWritersReviewer(u));
const cardUrl = (token: string) => `${API_BASE}/api/public/lit/member/${token}`;
function fail(res: Response, err: unknown, tag: string) {
  logger.error({ err }, `lit-members/${tag}`);
  return res.status(500).json({ error: "حدث خطأ في الخادم" });
}

/** آخر نشاط للكاتب = آخر نص معتمد له في الديوان أو آخر مساهمة منشورة في «إثراء» */
const LAST_ACTIVITY = `GREATEST(
  COALESCE((SELECT MAX(t.published_at) FROM lit_texts t WHERE t.author_id=m.user_id AND t.status='approved'), 'epoch'),
  COALESCE((SELECT MAX(COALESCE(i.reviewed_at, i.created_at)) FROM ithraa_items i WHERE i.uploader_id=m.user_id AND i.status='approved'), 'epoch'),
  COALESCE(m.issued_at, 'epoch'))`;

/** فحص دوري: انتهاء الصلاحية، التنبيه قبل التعليق، التعليق بعد 30 يوماً بلا نشر، وإعادة التفعيل عند النشر */
export async function memberSweep(): Promise<{ expired: number; warned: number; suspended: number; reactivated: number }> {
  await ensureMembersDb();
  const out = { expired: 0, warned: 0, suspended: 0, reactivated: 0 };
  const exp = await query(`UPDATE lit_members SET status='expired', updated_at=NOW() WHERE status IN ('active','suspended') AND valid_until < NOW() RETURNING user_id`);
  for (const r of exp.rows) void notifyLit([r.user_id], "انتهت صلاحية عضويتك", "اطلب تجديد العضوية لعام جديد من صفحة العضوية", { screen: "writers-membership" });
  out.expired = exp.rowCount ?? 0;
  const rows = (await query(
    `SELECT m.id, m.user_id, m.status, m.suspended_reason, m.warned_at, ${LAST_ACTIVITY} AS last_at FROM lit_members m
     WHERE m.status IN ('active','suspended')`).catch(() => ({ rows: [] as any[] }))).rows;
  // ithraa_items قد لا يكون موجوداً في بيئة جديدة — نعيد المحاولة بدونه
  const list = rows.length ? rows : (await query(
    `SELECT m.id, m.user_id, m.status, m.suspended_reason, m.warned_at,
       GREATEST(COALESCE((SELECT MAX(t.published_at) FROM lit_texts t WHERE t.author_id=m.user_id AND t.status='approved'),'epoch'), COALESCE(m.issued_at,'epoch')) AS last_at
     FROM lit_members m WHERE m.status IN ('active','suspended')`)).rows;
  const now = Date.now();
  for (const r of list) {
    const days = (now - new Date(r.last_at).getTime()) / 86400000;
    if (r.status === "active" && days >= INACTIVE_DAYS) {
      await query(`UPDATE lit_members SET status='suspended', suspended_reason='inactive', suspended_at=NOW(), updated_at=NOW() WHERE id=$1`, [r.id]);
      void notifyLit([r.user_id], "عُلّقت عضويتك مؤقتاً ⏸️", `لم تنشر منذ ${INACTIVE_DAYS} يوماً. انشر نصاً جديداً يُعتمد لتعود عضويتك فوراً`, { screen: "writers-membership" });
      out.suspended++;
    } else if (r.status === "active" && days >= WARN_DAYS && (!r.warned_at || now - new Date(r.warned_at).getTime() > 20 * 86400000)) {
      await query(`UPDATE lit_members SET warned_at=NOW() WHERE id=$1`, [r.id]);
      void notifyLit([r.user_id], "قلمك وحشنا ✍️", `مرّ ${Math.floor(days)} يوماً على آخر نص لك — انشر خلال ${Math.ceil(INACTIVE_DAYS - days)} أيام لتبقى عضويتك فعّالة`, { screen: "writers" });
      out.warned++;
    } else if (r.status === "suspended" && r.suspended_reason === "inactive" && days < INACTIVE_DAYS) {
      await query(`UPDATE lit_members SET status='active', suspended_reason=NULL, suspended_at=NULL, warned_at=NULL, updated_at=NOW() WHERE id=$1`, [r.id]);
      void notifyLit([r.user_id], "عادت عضويتك فعّالة ✅", "شكراً لعودتك للنشر — بطاقتك سارية من جديد", { screen: "writers-membership" });
      out.reactivated++;
    }
  }
  return out;
}
let lastSweep = 0;
function lazySweep() {
  if (Date.now() - lastSweep < 10 * 60_000) return;
  lastSweep = Date.now();
  memberSweep().catch((e) => logger.warn({ err: e?.message }, "[lit-members] sweep"));
}

/** يحسب الأوسمة التلقائية + الجوائز الممنوحة */
export async function badgesFor(userId: number, member?: any) {
  const st = (await query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(likes),0)::int AS likes, BOOL_OR(featured) AS featured,
       COUNT(*) FILTER (WHERE grp='poetry')::int AS poetry, COUNT(*) FILTER (WHERE grp='story')::int AS story, COUNT(*) FILTER (WHERE grp='prose')::int AS prose,
       COUNT(DISTINCT date_trunc('month', published_at)) FILTER (WHERE published_at > date_trunc('month', NOW()) - INTERVAL '2 months')::int AS months
     FROM lit_texts WHERE author_id=$1 AND status='approved'`, [userId])).rows[0];
  const wins = (await query(`SELECT MIN(rank)::int AS best, COUNT(*)::int AS n FROM lit_contest_entries WHERE author_id=$1 AND rank IS NOT NULL`, [userId]).catch(() => ({ rows: [{ best: null, n: 0 }] }))).rows[0];
  const keys: string[] = [];
  const seq = member?.member_no ? Number(String(member.member_no).split("-").pop()) : 0;
  if (seq && seq <= 50) keys.push("founding");
  if (member?.category === "journalist" && member?.status === "active") keys.push("press");
  if (st.n >= 1) keys.push("first_text");
  if (st.n >= 10) keys.push("prolific10");
  if (st.n >= 50) keys.push("prolific50");
  if (st.likes >= 100) keys.push("loved");
  if (st.featured) keys.push("featured");
  if (st.poetry >= 5) keys.push("poet5");
  if (st.story >= 5) keys.push("story5");
  if (st.prose >= 5) keys.push("prose5");
  if (st.months >= 3) keys.push("consistent");
  if (wins.n > 0) keys.push("winner");
  if (wins.best === 1) keys.push("gold");
  if ((member?.renewals ?? 0) > 0) keys.push("renewed");
  const awards = (await query(`SELECT id, title, description, icon, color, created_at FROM lit_member_awards WHERE user_id=$1 ORDER BY created_at DESC`, [userId])).rows;
  return {
    badges: keys.map((k) => ({ key: k, ...BADGES[k] })),
    awards,
    stats: { texts: st.n, likes: st.likes, poetry: st.poetry, story: st.story, prose: st.prose },
  };
}

function memberRow(m: any, opts: { full?: boolean } = {}) {
  const c = CAT.get(m.category);
  return {
    id: m.id, user_id: m.user_id, category: m.category, category_label: c?.label ?? m.category, category_title: c?.title ?? "",
    color: c?.color, accent: c?.accent, icon: c?.icon, tier: m.tier, tier_label: TIER_LABEL[m.tier] ?? m.tier,
    full_name: m.full_name, pen_name: m.pen_name, city: m.city, bio: m.bio, genres: m.genres || [], avatar_url: m.avatar_url ?? null,
    status: m.status, member_no: m.member_no, issued_at: m.issued_at, valid_until: m.valid_until, renewals: m.renewals,
    renewal_requested_at: m.renewal_requested_at, suspended_reason: m.suspended_reason, suspended_at: m.suspended_at,
    press_org: m.press_org, press_role: m.press_role, created_at: m.created_at,
    card_url: m.card_token && m.status !== "pending" && m.status !== "rejected" ? cardUrl(m.card_token) : null,
    last_activity_at: m.last_at ?? null,
    ...(opts.full ? {
      phone: m.phone, email: m.email, birth_year: m.birth_year, publications: m.publications, press_card_no: m.press_card_no, press_years: m.press_years,
      works: m.works || [], pledge_signature: m.pledge_signature, pledge_at: m.pledge_at, admin_note: m.admin_note, referred_by: m.referred_by,
    } : {}),
  };
}

// ─── واجهات العضو ─────────────────────────────────────────────
router.get("/lit/membership/meta", async (_req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    lazySweep();
    const c = await query(`SELECT category, COUNT(*)::int AS n FROM lit_members WHERE status='active' GROUP BY category`);
    return res.json({
      categories: MEMBER_CATEGORIES.map((x) => ({ ...x, members: c.rows.find((r: any) => r.category === x.key)?.n ?? 0 })),
      badges: Object.entries(BADGES).map(([key, b]) => ({ key, ...b })),
      rules: { inactive_days: INACTIVE_DAYS, works_required: 3, validity_months: 12 },
    });
  } catch (err) { return fail(res, err, "meta"); }
});

router.get("/lit/membership/me", async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    lazySweep();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const m = (await query(`SELECT m.*, u.avatar_url, ${LAST_ACTIVITY} AS last_at FROM lit_members m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1`, [me.id])
      .catch(() => query(`SELECT m.*, u.avatar_url, m.issued_at AS last_at FROM lit_members m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1`, [me.id]))).rows[0];
    const b = await badgesFor(me.id, m);
    const myTexts = (await query(`SELECT id, title, form, doc_no, status FROM lit_texts WHERE author_id=$1 AND doc_no IS NOT NULL AND status IN ('approved','pending','contest') ORDER BY created_at DESC LIMIT 50`, [me.id])).rows;
    const invites = (await query(`SELECT COUNT(*)::int AS sent, (SELECT COUNT(*)::int FROM lit_members WHERE referred_by=$1) AS joined FROM lit_invites WHERE inviter_id=$1`, [me.id])).rows[0];
    let days_left: number | null = null;
    if (m?.status === "active" && m.last_at) days_left = Math.max(0, Math.ceil(INACTIVE_DAYS - (Date.now() - new Date(m.last_at).getTime()) / 86400000));
    return res.json({ member: m ? memberRow(m, { full: true }) : null, ...b, my_texts: myTexts, invites, days_left, can_admin: await canAdmin(me) });
  } catch (err) { return fail(res, err, "me"); }
});

router.post("/lit/membership/apply", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    if (me.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    const cur = (await query(`SELECT status FROM lit_members WHERE user_id=$1`, [me.id])).rows[0];
    if (cur && !["rejected"].includes(cur.status)) return res.status(409).json({ error: cur.status === "pending" ? "طلبك قيد المراجعة" : "لديك عضوية بالفعل" });
    const b = req.body || {};
    const cat = CAT.get(String(b.category));
    if (!cat) return res.status(400).json({ error: "اختر فئة العضوية" });
    const tier = cat.key === "journalist" ? "journalist" : b.tier === "affiliate" ? "affiliate" : "professional";
    const full_name = clean(b.full_name, 120);
    if (full_name.split(/\s+/).length < 2) return res.status(400).json({ error: "اكتب اسمك الكامل (ثنائي على الأقل)" });
    const bio = clean(b.bio, 1500);
    if (bio.length < 40) return res.status(400).json({ error: "اكتب نبذة تعريفية لا تقل عن 40 حرفاً" });
    const phone = clean(b.phone, 30);
    if (phone.replace(/\D/g, "").length < 9) return res.status(400).json({ error: "رقم الهاتف مطلوب" });
    if (cat.key === "journalist") {
      if (clean(b.press_org, 160).length < 2) return res.status(400).json({ error: "اذكر المؤسسة الإعلامية أو الصحيفة" });
      if (clean(b.press_role, 80).length < 2) return res.status(400).json({ error: "اذكر صفتك المهنية (محرر، مراسل، مصور…)" });
    }
    // الأعمال الثلاثة
    const raw = Array.isArray(b.works) ? b.works.slice(0, 5) : [];
    if (raw.length < 3) return res.status(400).json({ error: "أرفق ثلاثة أعمال من تأليفك" });
    const works: any[] = [];
    for (const w of raw) {
      if (w?.pledged !== true) return res.status(400).json({ error: "تعهّد بملكية كل عمل من الأعمال الثلاثة" });
      if (w.type === "diwan") {
        const t = (await query(`SELECT id, title, form, doc_no FROM lit_texts WHERE id=$1 AND author_id=$2 AND doc_no IS NOT NULL AND status IN ('approved','pending','contest')`, [Number(w.text_id), me.id])).rows[0];
        if (!t) return res.status(400).json({ error: "أحد النصوص المختارة غير موثّق باسمك" });
        if (works.some((x) => x.text_id === t.id)) return res.status(400).json({ error: "لا تكرر العمل نفسه" });
        works.push({ type: "diwan", text_id: t.id, title: t.title, form: t.form, doc_no: t.doc_no, pledged_at: new Date().toISOString() });
      } else {
        const title = clean(w.title, 160);
        const link = clean(w.link, 500);
        const excerpt = clean(w.excerpt, 3000);
        if (title.length < 2) return res.status(400).json({ error: "اكتب عنوان كل عمل" });
        if (link && !/^https:\/\/\S+$/i.test(link)) return res.status(400).json({ error: "رابط العمل يجب أن يبدأ بـ https://" });
        if (!link && excerpt.length < 80) return res.status(400).json({ error: `أضف رابطاً أو مقتطفاً (80 حرفاً على الأقل) للعمل «${title}»` });
        works.push({ type: "external", title, kind: clean(w.kind, 40) || "عمل منشور", where: clean(w.where, 120) || null, year: Number(w.year) || null, link: link || null, excerpt: excerpt || null, pledged_at: new Date().toISOString() });
      }
    }
    if (works.length < 3) return res.status(400).json({ error: "أرفق ثلاثة أعمال من تأليفك" });
    const p = b.pledge || {};
    if (p.own_works !== true || p.accurate !== true || p.charter !== true) return res.status(400).json({ error: "أقرّ بجميع بنود التعهّد" });
    const sig = clean(p.signature, 120);
    if (sig.length < 3) return res.status(400).json({ error: "وقّع باسمك الكامل" });
    const ref = Number(b.ref) > 0 && Number(b.ref) !== me.id ? Number(b.ref) : null;
    const vals = [me.id, cat.key, tier, full_name, clean(b.pen_name, 80) || null, phone, clean(b.email, 120) || me.email || null, clean(b.city, 80) || null,
      Number(b.birth_year) > 1900 && Number(b.birth_year) < new Date().getFullYear() - 8 ? Number(b.birth_year) : null, bio,
      (Array.isArray(b.genres) ? b.genres : []).map((g: unknown) => clean(g, 40)).filter(Boolean).slice(0, 10), clean(b.publications, 2000) || null,
      clean(b.press_org, 160) || null, clean(b.press_role, 80) || null, clean(b.press_card_no, 60) || null, Math.min(80, Math.max(0, Number(b.press_years) || 0)) || null,
      JSON.stringify(works), sig, ref];
    const sql = cur
      ? `UPDATE lit_members SET category=$2, tier=$3, full_name=$4, pen_name=$5, phone=$6, email=$7, city=$8, birth_year=$9, bio=$10, genres=$11, publications=$12,
           press_org=$13, press_role=$14, press_card_no=$15, press_years=$16, works=$17, pledge_signature=$18, referred_by=COALESCE(referred_by,$19),
           status='pending', pledge_at=NOW(), admin_note=NULL, updated_at=NOW() WHERE user_id=$1 RETURNING *`
      : `INSERT INTO lit_members (user_id, category, tier, full_name, pen_name, phone, email, city, birth_year, bio, genres, publications,
           press_org, press_role, press_card_no, press_years, works, pledge_signature, referred_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`;
    const { rows } = await query(sql, vals);
    const admins = (await query(`SELECT user_id AS id FROM ithraa_moderators WHERE categories IS NULL OR cardinality(categories)=0 OR 'writers' = ANY(categories)
      UNION SELECT id FROM users WHERE role='admin'`).catch(() => ({ rows: [] as any[] }))).rows.map((r: any) => r.id);
    void notifyLit(admins, "طلب عضوية جديد 🪪", `${full_name} — ${cat.label}`, { screen: "writers-members-admin" });
    return res.status(201).json({ member: memberRow(rows[0], { full: true }), message: "استلمنا استمارتك — ستراجعها الإدارة ويصلك إشعار بالقرار" });
  } catch (err) { return fail(res, err, "apply"); }
});

router.post("/lit/membership/renew", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const m = (await query(`SELECT * FROM lit_members WHERE user_id=$1`, [me.id])).rows[0];
    if (!m || !["active", "expired", "suspended"].includes(m.status)) return res.status(409).json({ error: "لا توجد عضوية قابلة للتجديد" });
    const soon = m.valid_until && new Date(m.valid_until).getTime() - Date.now() < 45 * 86400000;
    if (m.status === "active" && !soon) return res.status(409).json({ error: "يُتاح طلب التجديد خلال 45 يوماً قبل انتهاء العضوية" });
    await query(`UPDATE lit_members SET renewal_requested_at=NOW(), updated_at=NOW() WHERE id=$1`, [m.id]);
    return res.json({ ok: true, message: "أُرسل طلب التجديد للإدارة" });
  } catch (err) { return fail(res, err, "renew"); }
});

router.post("/lit/membership/invite-log", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const aud = ["individual", "institution", "union", "media"].includes(req.body?.audience) ? req.body.audience : "individual";
    await query(`INSERT INTO lit_invites (inviter_id, audience, channel) VALUES ($1,$2,$3)`, [me.id, aud, clean(req.body?.channel, 16) || null]);
    return res.json({ ok: true, link: `${WEB}/writers-membership?ref=${me.id}&aud=${aud}` });
  } catch (err) { return fail(res, err, "invite"); }
});

// ملف عضو عام (للبطاقة داخل التطبيق والأوسمة)
router.get("/lit/members/:userId/public", async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const uid = Number(req.params.userId);
    const m = (await query(`SELECT m.*, u.avatar_url FROM lit_members m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.status IN ('active','suspended','expired')`, [uid])).rows[0];
    if (!m) return res.status(404).json({ error: "ليس عضواً" });
    const b = await badgesFor(uid, m);
    const x = memberRow(m);
    return res.json({ member: { ...x, card_url: null }, ...b });
  } catch (err) { return fail(res, err, "public"); }
});

// ─── الإدارة ─────────────────────────────────────────────────
router.get("/lit/members", async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    await memberSweep().catch(() => null);
    const s = String(req.query.status || "pending");
    const where = s === "renewals" ? "m.renewal_requested_at IS NOT NULL" : ["pending", "active", "suspended", "expired", "rejected"].includes(s) ? `m.status='${s}'` : "TRUE";
    const params: unknown[] = [];
    let extra = "";
    if (req.query.category && CAT.has(String(req.query.category))) { params.push(String(req.query.category)); extra = ` AND m.category=$${params.length}`; }
    const { rows } = await query(
      `SELECT m.*, u.avatar_url, u.name AS account_name,
         GREATEST(COALESCE((SELECT MAX(t.published_at) FROM lit_texts t WHERE t.author_id=m.user_id AND t.status='approved'),'epoch'), COALESCE(m.issued_at,'epoch')) AS last_at
       FROM lit_members m JOIN users u ON u.id=m.user_id WHERE ${where}${extra} ORDER BY m.updated_at DESC LIMIT 200`, params);
    const counts = (await query(`SELECT status, COUNT(*)::int AS n FROM lit_members GROUP BY status`)).rows;
    const renewals = (await query(`SELECT COUNT(*)::int AS n FROM lit_members WHERE renewal_requested_at IS NOT NULL`)).rows[0].n;
    return res.json({
      members: rows.map((r: any) => ({ ...memberRow(r, { full: true }), account_name: r.account_name })),
      counts: { ...Object.fromEntries(counts.map((c: any) => [c.status, c.n])), renewals },
    });
  } catch (err) { return fail(res, err, "list"); }
});

router.post("/lit/members/:id/action", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    const m = (await query(`SELECT * FROM lit_members WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!m) return res.status(404).json({ error: "غير موجود" });
    const action = String(req.body?.action || "");
    const note = clean(req.body?.note, 400) || null;
    const cat = CAT.get(m.category);
    let msg: [string, string] | null = null;
    switch (action) {
      case "approve": {
        if (m.status !== "pending") return res.status(409).json({ error: "الطلب ليس قيد المراجعة" });
        const seq = (await query(`SELECT nextval('lit_member_seq') AS n`)).rows[0].n;
        const no = `HSW-${m.category === "journalist" ? "PRS" : "WRT"}-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;
        await query(`UPDATE lit_members SET status='active', member_no=COALESCE(member_no,$1), card_token=COALESCE(card_token,$2), issued_at=NOW(),
          valid_until=NOW() + INTERVAL '1 year', admin_note=$3, reviewed_by=$4, reviewed_at=NOW(), suspended_reason=NULL, updated_at=NOW() WHERE id=$5`,
          [no, randomBytes(12).toString("hex"), note, me!.id, m.id]);
        msg = ["مبروك! اعتُمدت عضويتك 🎉", `أنت الآن ${cat?.title ?? "عضو"} في ديوان الكُتّاب — بطاقتك جاهزة`];
        break;
      }
      case "reject":
        if (!note) return res.status(400).json({ error: "اكتب سبب الرفض" });
        await query(`UPDATE lit_members SET status='rejected', admin_note=$1, reviewed_by=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3`, [note, me!.id, m.id]);
        msg = ["بخصوص طلب عضويتك", note];
        break;
      case "renew":
        if (!["active", "expired", "suspended"].includes(m.status)) return res.status(409).json({ error: "لا يمكن تجديد هذه العضوية" });
        await query(`UPDATE lit_members SET status=CASE WHEN status='suspended' AND suspended_reason='admin' THEN 'suspended' ELSE 'active' END,
          valid_until=GREATEST(COALESCE(valid_until, NOW()), NOW()) + INTERVAL '1 year', renewals=renewals+1, renewal_requested_at=NULL,
          suspended_reason=CASE WHEN suspended_reason='admin' THEN 'admin' ELSE NULL END, issued_at=COALESCE(issued_at,NOW()), warned_at=NULL, updated_at=NOW() WHERE id=$1`, [m.id]);
        msg = ["جُدّدت عضويتك لعام جديد ✨", "بطاقتك سارية لعام آخر — نتطلع لنصوصك القادمة"];
        break;
      case "suspend":
        if (!note) return res.status(400).json({ error: "اكتب سبب التعليق" });
        await query(`UPDATE lit_members SET status='suspended', suspended_reason='admin', suspended_at=NOW(), admin_note=$1, updated_at=NOW() WHERE id=$2`, [note, m.id]);
        msg = ["عُلّقت عضويتك", note];
        break;
      case "reactivate":
        await query(`UPDATE lit_members SET status=CASE WHEN valid_until < NOW() THEN 'expired' ELSE 'active' END, suspended_reason=NULL, suspended_at=NULL, warned_at=NULL, updated_at=NOW() WHERE id=$1`, [m.id]);
        msg = ["أُعيد تفعيل عضويتك", "بطاقتك سارية من جديد"];
        break;
      case "category": {
        const c = CAT.get(String(req.body?.category));
        if (!c) return res.status(400).json({ error: "فئة غير صالحة" });
        await query(`UPDATE lit_members SET category=$1, tier=CASE WHEN $1='journalist' THEN 'journalist' WHEN tier='journalist' THEN 'professional' ELSE tier END, updated_at=NOW() WHERE id=$2`, [c.key, m.id]);
        break;
      }
      default: return res.status(400).json({ error: "إجراء غير معروف" });
    }
    if (msg) void notifyLit([m.user_id], msg[0], msg[1], { screen: "writers-membership" });
    const r = (await query(`SELECT m.*, u.avatar_url FROM lit_members m JOIN users u ON u.id=m.user_id WHERE m.id=$1`, [m.id])).rows[0];
    return res.json({ member: memberRow(r, { full: true }) });
  } catch (err) { return fail(res, err, "action"); }
});

router.post("/lit/members/:userId/award", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    const uid = Number(req.params.userId);
    const title = clean(req.body?.title, 120);
    if (title.length < 3) return res.status(400).json({ error: "اكتب اسم الجائزة أو الوسام" });
    const icon = /^[a-z-]{2,30}$/.test(String(req.body?.icon)) ? String(req.body.icon) : "ribbon";
    const color = /^#[0-9a-f]{6}$/i.test(String(req.body?.color)) ? String(req.body.color) : "#C99A2E";
    await query(`INSERT INTO lit_member_awards (user_id, title, description, icon, color, awarded_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uid, title, clean(req.body?.description, 300) || null, icon, color, me!.id]);
    void notifyLit([uid], `🏅 نلت ${title}`, clean(req.body?.description, 200) || "تقديراً لعطائك في ديوان الكُتّاب", { screen: "writers-membership" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "award"); }
});
router.delete("/lit/member-awards/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    await query(`DELETE FROM lit_member_awards WHERE id=$1`, [Number(req.params.id)]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "award-del"); }
});

// الفحص الدوري — يستدعيه GitHub Actions كل ساعة (OIDC) أو مفتاح CAMPAIGN_PUSH_KEY
router.post("/lit/cron/members", async (req: Request, res: Response) => {
  try {
    const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const key = String(process.env.CAMPAIGN_PUSH_KEY || "");
    let ok = !!key && tok.length === key.length && timingSafeEqual(Buffer.from(tok), Buffer.from(key));
    if (!ok && tok.split(".").length === 3) { try { await verifyGithubOidc(tok, "hasahisawi-srcs"); ok = true; } catch { /* */ } }
    if (!ok) return res.status(401).json({ error: "unauthorized" });
    return res.json({ ok: true, ...(await memberSweep()) });
  } catch (err) { return fail(res, err, "cron"); }
});

// ─── التحقق العلني من البطاقة ─────────────────────────────────
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
router.get("/public/lit/member/:token", async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const m = /^[a-f0-9]{24}$/.test(String(req.params.token))
      ? (await query(`SELECT m.*, u.avatar_url FROM lit_members m JOIN users u ON u.id=m.user_id WHERE m.card_token=$1`, [req.params.token])).rows[0] : null;
    const c = m ? CAT.get(m.category) : null;
    const valid = !!m && m.status === "active" && new Date(m.valid_until) > new Date();
    const stLabel: Record<string, string> = { active: "عضوية سارية", suspended: m?.suspended_reason === "inactive" ? "معلّقة لتوقف النشر" : "معلّقة", expired: "منتهية — بانتظار التجديد", rejected: "غير معتمدة", pending: "قيد المراجعة" };
    const d = (x: any) => x ? new Date(x).toLocaleDateString("ar-EG", { dateStyle: "long" }) : "—";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(m ? 200 : 404).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>التحقق من عضوية — ديوان الكُتّاب</title><style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#F4F1EA;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{max-width:420px;width:100%;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 12px 32px rgba(0,0,0,.12)}
.h{background:${c?.color ?? "#3A1E1A"};color:#fff;padding:22px;text-align:center}.h small{opacity:.8}.h b{display:block;font-size:22px;margin-top:6px}
.s{display:inline-block;margin-top:10px;padding:6px 14px;border-radius:20px;font-weight:700;background:${valid ? "#E7F6EE;color:#0E7C4A" : "#FDECEC;color:#B42318"}}
.r{display:flex;justify-content:space-between;padding:11px 22px;border-bottom:1px dashed #eee;font-size:14px}.k{color:#6B7B73}.v{font-weight:700}</style></head><body><div class="c">
<div class="h"><small>ديوان الكُتّاب · منصة حصاحيصاوي</small><b>${m ? esc(m.pen_name || m.full_name) : "بطاقة غير موجودة"}</b>${m ? `<span>${esc(c?.title)}</span><br><div class="s">${valid ? "✓ " : ""}${esc(stLabel[m.status] || m.status)}</div>` : ""}</div>
${m ? `<div class="r"><span class="k">رقم العضوية</span><span class="v">${esc(m.member_no)}</span></div>
<div class="r"><span class="k">الاسم</span><span class="v">${esc(m.full_name)}</span></div>
<div class="r"><span class="k">الفئة</span><span class="v">${esc(c?.label)} · ${esc(TIER_LABEL[m.tier])}</span></div>
${m.category === "journalist" && m.press_org ? `<div class="r"><span class="k">المؤسسة</span><span class="v">${esc(m.press_org)}</span></div>` : ""}
<div class="r"><span class="k">تاريخ الإصدار</span><span class="v">${d(m.issued_at)}</span></div>
<div class="r" style="border:0"><span class="k">صالحة حتى</span><span class="v">${d(m.valid_until)}</span></div>` : ""}
</div></body></html>`);
  } catch (err) { return fail(res, err, "verify"); }
});

export default router;
