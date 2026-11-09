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
    // الانتساب الدولي: دولة الإقامة + الاسم بالحروف اللاتينية للبطاقة ثنائية اللغة
    await query(`ALTER TABLE lit_members ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'SD'`);
    await query(`ALTER TABLE lit_members ADD COLUMN IF NOT EXISTS name_en VARCHAR(120)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lit_members_status ON lit_members (status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lit_members_country ON lit_members (country)`);
    // طلبات تعديل بيانات العضو (يراجعها المشرف ويعتمدها أو يرفضها)
    await query(`CREATE TABLE IF NOT EXISTS lit_member_edits (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES lit_members(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      changes JSONB NOT NULL,
      note VARCHAR(400),
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      admin_note VARCHAR(400),
      reviewed_by INTEGER,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lit_member_edits_status ON lit_member_edits (status)`);
    // طباعة البطاقة الورقية — خدمة مادية تُسلَّم باليد أو بالتوصيل، والسعر تحدده الإدارة
    await query(`CREATE TABLE IF NOT EXISTS lit_settings (key VARCHAR(40) PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS lit_print_orders (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL REFERENCES lit_members(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      face VARCHAR(6) NOT NULL DEFAULT 'local',
      size VARCHAR(10) NOT NULL DEFAULT 'standard',
      qty SMALLINT NOT NULL DEFAULT 1,
      delivery VARCHAR(10) NOT NULL DEFAULT 'pickup',
      address VARCHAR(300),
      phone VARCHAR(30) NOT NULL,
      note VARCHAR(300),
      unit_price NUMERIC(12,2) NOT NULL,
      delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL,
      currency VARCHAR(12) NOT NULL DEFAULT 'جنيه',
      status VARCHAR(12) NOT NULL DEFAULT 'pending',
      payment_ref VARCHAR(80),
      admin_note VARCHAR(300),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lit_print_status ON lit_print_orders (status)`);
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

// الدول المعتمدة للانتساب (ISO-3166 ثنائي) — تطابق lib/countries.ts في التطبيق
const COUNTRY: Record<string, [string, string]> = {
  SD: ["السودان", "Sudan"], EG: ["مصر", "Egypt"], SA: ["السعودية", "Saudi Arabia"], AE: ["الإمارات", "United Arab Emirates"], QA: ["قطر", "Qatar"],
  KW: ["الكويت", "Kuwait"], BH: ["البحرين", "Bahrain"], OM: ["عُمان", "Oman"], YE: ["اليمن", "Yemen"], JO: ["الأردن", "Jordan"], PS: ["فلسطين", "Palestine"],
  LB: ["لبنان", "Lebanon"], SY: ["سوريا", "Syria"], IQ: ["العراق", "Iraq"], LY: ["ليبيا", "Libya"], TN: ["تونس", "Tunisia"], DZ: ["الجزائر", "Algeria"],
  MA: ["المغرب", "Morocco"], MR: ["موريتانيا", "Mauritania"], SO: ["الصومال", "Somalia"], DJ: ["جيبوتي", "Djibouti"], KM: ["جزر القمر", "Comoros"],
  SS: ["جنوب السودان", "South Sudan"], TD: ["تشاد", "Chad"], ER: ["إريتريا", "Eritrea"], ET: ["إثيوبيا", "Ethiopia"], KE: ["كينيا", "Kenya"],
  UG: ["أوغندا", "Uganda"], NG: ["نيجيريا", "Nigeria"], TR: ["تركيا", "Türkiye"], MY: ["ماليزيا", "Malaysia"], GB: ["المملكة المتحدة", "United Kingdom"],
  IE: ["أيرلندا", "Ireland"], DE: ["ألمانيا", "Germany"], FR: ["فرنسا", "France"], NL: ["هولندا", "Netherlands"], BE: ["بلجيكا", "Belgium"],
  SE: ["السويد", "Sweden"], NO: ["النرويج", "Norway"], DK: ["الدنمارك", "Denmark"], IT: ["إيطاليا", "Italy"], ES: ["إسبانيا", "Spain"],
  CH: ["سويسرا", "Switzerland"], AT: ["النمسا", "Austria"], US: ["الولايات المتحدة", "United States"], CA: ["كندا", "Canada"], AU: ["أستراليا", "Australia"],
  NZ: ["نيوزيلندا", "New Zealand"], CN: ["الصين", "China"], IN: ["الهند", "India"], PK: ["باكستان", "Pakistan"], ID: ["إندونيسيا", "Indonesia"],
  ZA: ["جنوب أفريقيا", "South Africa"], OT: ["دولة أخرى", "Other"],
};
const countryCode = (v: unknown) => { const c = String(v || "").toUpperCase(); return COUNTRY[c] ? c : "SD"; };
const latinName = (v: unknown) => clean(v, 120).replace(/[^A-Za-z .'\-]/g, "").replace(/\s+/g, " ").trim();

function memberRow(m: any, opts: { full?: boolean } = {}) {
  const c = CAT.get(m.category);
  return {
    id: m.id, user_id: m.user_id, category: m.category, category_label: c?.label ?? m.category, category_title: c?.title ?? "",
    color: c?.color, accent: c?.accent, icon: c?.icon, tier: m.tier, tier_label: TIER_LABEL[m.tier] ?? m.tier,
    full_name: m.full_name, pen_name: m.pen_name, city: m.city, country: m.country || "SD", country_ar: COUNTRY[m.country || "SD"]?.[0], country_en: COUNTRY[m.country || "SD"]?.[1],
    name_en: m.name_en ?? null, international: (m.country || "SD") !== "SD", bio: m.bio, genres: m.genres || [], avatar_url: m.avatar_url ?? null,
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
    const { rows: saved } = await query(sql, vals);
    const country = countryCode(b.country), nameEn = latinName(b.name_en);
    const { rows } = await query(`UPDATE lit_members SET country=$2, name_en=$3 WHERE id=$1 RETURNING *`, [saved[0].id, country, nameEn || null]);
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
    if (req.query.country === "intl") extra += ` AND m.country <> 'SD'`;
    else if (req.query.country && COUNTRY[String(req.query.country).toUpperCase()]) { params.push(String(req.query.country).toUpperCase()); extra += ` AND m.country=$${params.length}`; }
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
// ═══ تعديل بيانات العضو ═════════════════════════════════════════
// الحقول القابلة للتعديل: يطلبها العضو، أو يعدّلها المشرف مباشرة
const EDITABLE: Record<string, (v: unknown) => string | number | string[] | null | { error: string }> = {
  full_name: (v) => { const x = clean(v, 120); return x.split(/\s+/).length >= 2 ? x : { error: "الاسم الكامل ثنائي على الأقل" }; },
  pen_name: (v) => clean(v, 80) || null,
  name_en: (v) => latinName(v) || null,
  city: (v) => clean(v, 80) || null,
  country: (v) => countryCode(v),
  phone: (v) => { const x = clean(v, 30); return x.replace(/\D/g, "").length >= 9 ? x : { error: "رقم الهاتف غير مكتمل" }; },
  email: (v) => { const x = clean(v, 120); return !x || /^\S+@\S+\.\S+$/.test(x) ? x || null : { error: "البريد الإلكتروني غير صالح" }; },
  bio: (v) => { const x = clean(v, 1500); return x.length >= 40 ? x : { error: "النبذة لا تقل عن 40 حرفاً" }; },
  genres: (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[،,]/)).map((g) => clean(g, 40)).filter(Boolean).slice(0, 10),
  publications: (v) => clean(v, 2000) || null,
  press_org: (v) => clean(v, 160) || null,
  press_role: (v) => clean(v, 80) || null,
  press_card_no: (v) => clean(v, 60) || null,
  birth_year: (v) => { const n = Number(v); return !v ? null : n > 1900 && n < new Date().getFullYear() - 8 ? n : { error: "سنة الميلاد غير صالحة" }; },
};
export const EDIT_LABELS: Record<string, string> = {
  full_name: "الاسم الكامل", pen_name: "الاسم الأدبي", name_en: "الاسم بالإنجليزية", city: "المدينة", country: "الدولة", phone: "الهاتف", email: "البريد",
  bio: "النبذة", genres: "الأجناس الأدبية", publications: "المؤلفات", press_org: "المؤسسة الإعلامية", press_role: "الصفة المهنية", press_card_no: "رقم البطاقة الصحفية", birth_year: "سنة الميلاد",
};
function validateChanges(raw: unknown, cur: any): { changes?: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object") return { error: "لا توجد تعديلات" };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const fn = EDITABLE[k]; if (!fn) continue;
    const val = fn(v);
    if (val && typeof val === "object" && !Array.isArray(val) && "error" in val) return { error: `${EDIT_LABELS[k]}: ${val.error}` };
    const before = cur?.[k] ?? null;
    if (JSON.stringify(before ?? null) !== JSON.stringify(val ?? null)) out[k] = val;
  }
  return Object.keys(out).length ? { changes: out } : { error: "لم يتغيّر شيء عن البيانات الحالية" };
}
async function applyChanges(memberId: number, changes: Record<string, unknown>) {
  const keys = Object.keys(changes).filter((k) => EDITABLE[k]);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  await query(`UPDATE lit_members SET ${sets}, updated_at=NOW() WHERE id=$1`, [memberId, ...keys.map((k) => changes[k])]);
}

router.get("/lit/membership/edit-request", async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const r = (await query(`SELECT e.* FROM lit_member_edits e WHERE e.user_id=$1 ORDER BY e.created_at DESC LIMIT 1`, [me.id])).rows[0] || null;
    return res.json({ request: r, labels: EDIT_LABELS });
  } catch (err) { return fail(res, err, "edit-get"); }
});

router.post("/lit/membership/edit-request", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const m = (await query(`SELECT * FROM lit_members WHERE user_id=$1`, [me.id])).rows[0];
    if (!m || !["active", "suspended", "expired"].includes(m.status)) return res.status(409).json({ error: m?.status === "pending" || m?.status === "rejected" ? "عدّل الاستمارة نفسها قبل اعتمادها" : "لا توجد عضوية" });
    const open = (await query(`SELECT id FROM lit_member_edits WHERE member_id=$1 AND status='pending'`, [m.id])).rows[0];
    if (open) return res.status(409).json({ error: "لديك طلب تعديل قيد المراجعة" });
    const v = validateChanges(req.body?.changes, m);
    if (v.error) return res.status(400).json({ error: v.error });
    const { rows } = await query(`INSERT INTO lit_member_edits (member_id, user_id, changes, note) VALUES ($1,$2,$3,$4) RETURNING *`,
      [m.id, me.id, JSON.stringify(v.changes), clean(req.body?.note, 400) || null]);
    const admins = (await query(`SELECT user_id AS id FROM ithraa_moderators WHERE categories IS NULL OR cardinality(categories)=0 OR 'writers' = ANY(categories)
      UNION SELECT id FROM users WHERE role='admin'`).catch(() => ({ rows: [] as any[] }))).rows.map((r: any) => r.id);
    void notifyLit(admins, "طلب تعديل بيانات عضو ✏️", `${m.pen_name || m.full_name} — ${Object.keys(v.changes!).map((k) => EDIT_LABELS[k]).join("، ")}`, { screen: "writers-members-admin" });
    return res.status(201).json({ request: rows[0], message: "أُرسل طلب التعديل — تراجعه الإدارة ويصلك إشعار" });
  } catch (err) { return fail(res, err, "edit-post"); }
});

router.get("/lit/member-edits", async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    const st = ["pending", "applied", "rejected"].includes(String(req.query.status)) ? String(req.query.status) : "pending";
    const { rows } = await query(
      `SELECT e.*, m.full_name, m.pen_name, m.member_no, m.category, ${Object.keys(EDITABLE).map((k) => `m.${k} AS cur_${k}`).join(", ")}
         FROM lit_member_edits e JOIN lit_members m ON m.id=e.member_id WHERE e.status=$1 ORDER BY e.created_at DESC LIMIT 100`, [st]);
    const pending = (await query(`SELECT COUNT(*)::int AS n FROM lit_member_edits WHERE status='pending'`)).rows[0].n;
    return res.json({
      labels: EDIT_LABELS, pending,
      edits: rows.map((r: any) => ({
        id: r.id, member_id: r.member_id, user_id: r.user_id, status: r.status, note: r.note, admin_note: r.admin_note, created_at: r.created_at,
        name: r.pen_name || r.full_name, member_no: r.member_no, category: CAT.get(r.category)?.label ?? r.category,
        changes: Object.entries(r.changes || {}).map(([k, v]) => ({ key: k, label: EDIT_LABELS[k] ?? k, before: r[`cur_${k}`] ?? null, after: v })),
      })),
    });
  } catch (err) { return fail(res, err, "edits-list"); }
});

router.post("/lit/member-edits/:id/action", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    const e = (await query(`SELECT * FROM lit_member_edits WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!e) return res.status(404).json({ error: "غير موجود" });
    if (e.status !== "pending") return res.status(409).json({ error: "عولج الطلب مسبقاً" });
    const action = String(req.body?.action || "");
    const note = clean(req.body?.note, 400) || null;
    if (action === "apply") {
      // للمشرف أن يصحح قيمة قبل الاعتماد
      let changes = e.changes as Record<string, unknown>;
      if (req.body?.changes && typeof req.body.changes === "object") {
        const m = (await query(`SELECT * FROM lit_members WHERE id=$1`, [e.member_id])).rows[0];
        const v = validateChanges({ ...changes, ...req.body.changes }, m);
        if (v.error && v.error !== "لم يتغيّر شيء عن البيانات الحالية") return res.status(400).json({ error: v.error });
        changes = v.changes || {};
      } else {
        for (const [k, v] of Object.entries(changes)) {
          const val = EDITABLE[k]?.(v);
          if (val && typeof val === "object" && !Array.isArray(val) && "error" in val) return res.status(400).json({ error: `${EDIT_LABELS[k]}: ${val.error}` });
        }
      }
      await applyChanges(e.member_id, changes);
      await query(`UPDATE lit_member_edits SET status='applied', changes=$2, admin_note=$3, reviewed_by=$4, reviewed_at=NOW() WHERE id=$1`, [e.id, JSON.stringify(changes), note, me!.id]);
      void notifyLit([e.user_id], "اعتُمد تعديل بياناتك ✓", "بطاقتك وملفك محدّثان بالبيانات الجديدة", { screen: "writers-membership" });
    } else if (action === "reject") {
      if (!note) return res.status(400).json({ error: "اكتب سبب الرفض" });
      await query(`UPDATE lit_member_edits SET status='rejected', admin_note=$2, reviewed_by=$3, reviewed_at=NOW() WHERE id=$1`, [e.id, note, me!.id]);
      void notifyLit([e.user_id], "بخصوص طلب تعديل بياناتك", note, { screen: "writers-membership" });
    } else return res.status(400).json({ error: "إجراء غير معروف" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "edits-action"); }
});

// تعديل مباشر من المشرف (تصحيح بيانات عضو دون طلب)
router.post("/lit/members/:id/edit", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    const m = (await query(`SELECT * FROM lit_members WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!m) return res.status(404).json({ error: "غير موجود" });
    const v = validateChanges(req.body?.changes, m);
    if (v.error) return res.status(400).json({ error: v.error });
    await applyChanges(m.id, v.changes!);
    await query(`INSERT INTO lit_member_edits (member_id, user_id, changes, note, status, reviewed_by, reviewed_at) VALUES ($1,$2,$3,'تعديل مباشر من الإدارة','applied',$4,NOW())`,
      [m.id, m.user_id, JSON.stringify(v.changes), me!.id]);
    if (req.body?.notify !== false) void notifyLit([m.user_id], "حُدّثت بيانات عضويتك", `عدّلت الإدارة: ${Object.keys(v.changes!).map((k) => EDIT_LABELS[k]).join("، ")}`, { screen: "writers-membership" });
    const r = (await query(`SELECT m.*, u.avatar_url FROM lit_members m JOIN users u ON u.id=m.user_id WHERE m.id=$1`, [m.id])).rows[0];
    return res.json({ member: memberRow(r, { full: true }) });
  } catch (err) { return fail(res, err, "edit-direct"); }
});

// ═══ طباعة البطاقة الورقية ═════════════════════════════════════
// خدمة مادية (بطاقة مطبوعة تُسلَّم باليد أو بالتوصيل) — تُدفع نقداً أو بتحويل، خارج متاجر التطبيقات.
const PRINT_DEFAULTS = { enabled: false, price_standard: 0, price_large: 0, delivery_fee: 0, currency: "جنيه", payment_note: "الدفع عند الاستلام", pickup_note: "", max_qty: 10 };
async function printSettings() {
  const r = (await query(`SELECT value FROM lit_settings WHERE key='print'`)).rows[0];
  return { ...PRINT_DEFAULTS, ...(r?.value || {}) } as typeof PRINT_DEFAULTS;
}
const PRINT_SIZES: Record<string, string> = { standard: "مقاس البطاقة (8.5×5.4 سم)", large: "مقاس كبير للعرض (A6)" };
const PRINT_STATUS = ["pending", "confirmed", "printing", "ready", "delivered", "cancelled"];
const PRINT_STATUS_AR: Record<string, string> = { pending: "بانتظار التأكيد", confirmed: "مؤكد", printing: "قيد الطباعة", ready: "جاهزة للاستلام", delivered: "سُلّمت", cancelled: "ملغاة" };

router.get("/lit/print/meta", async (_req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const s = await printSettings();
    return res.json({ ...s, sizes: PRINT_SIZES, statuses: PRINT_STATUS_AR });
  } catch (err) { return fail(res, err, "print-meta"); }
});

router.put("/lit/print/settings", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    const b = req.body || {}, cur = await printSettings();
    const money = (v: unknown, d: number) => (v === undefined ? d : Math.max(0, Math.min(10_000_000, Math.round(Number(v) || 0))));
    const next = {
      enabled: b.enabled === undefined ? cur.enabled : !!b.enabled,
      price_standard: money(b.price_standard, cur.price_standard), price_large: money(b.price_large, cur.price_large),
      delivery_fee: money(b.delivery_fee, cur.delivery_fee), currency: clean(b.currency, 12) || cur.currency,
      payment_note: b.payment_note === undefined ? cur.payment_note : clean(b.payment_note, 300),
      pickup_note: b.pickup_note === undefined ? cur.pickup_note : clean(b.pickup_note, 300),
      max_qty: b.max_qty === undefined ? cur.max_qty : Math.max(1, Math.min(50, Number(b.max_qty) || 10)),
    };
    if (next.enabled && next.price_standard <= 0) return res.status(400).json({ error: "حدّد سعر الطباعة قبل تفعيل الخدمة" });
    await query(`INSERT INTO lit_settings (key, value) VALUES ('print',$1) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`, [JSON.stringify(next)]);
    return res.json(next);
  } catch (err) { return fail(res, err, "print-settings"); }
});

router.post("/lit/print/orders", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const s = await printSettings();
    if (!s.enabled) return res.status(409).json({ error: "خدمة الطباعة غير متاحة حالياً" });
    const m = (await query(`SELECT * FROM lit_members WHERE user_id=$1`, [me.id])).rows[0];
    if (!m || m.status !== "active") return res.status(409).json({ error: "تُطبع البطاقة للعضويات السارية فقط" });
    const open = (await query(`SELECT COUNT(*)::int AS n FROM lit_print_orders WHERE user_id=$1 AND status IN ('pending','confirmed','printing')`, [me.id])).rows[0].n;
    if (open >= 2) return res.status(409).json({ error: "لديك طلبات طباعة قيد التنفيذ" });
    const b = req.body || {};
    const size = b.size === "large" && s.price_large > 0 ? "large" : "standard";
    const qty = Math.max(1, Math.min(s.max_qty, Math.floor(Number(b.qty) || 1)));
    const delivery = b.delivery === "delivery" ? "delivery" : "pickup";
    const phone = clean(b.phone, 30) || m.phone;
    if (String(phone || "").replace(/\D/g, "").length < 9) return res.status(400).json({ error: "رقم هاتف للتواصل مطلوب" });
    const address = clean(b.address, 300);
    if (delivery === "delivery" && address.length < 6) return res.status(400).json({ error: "اكتب عنوان التوصيل" });
    const unit = size === "large" ? s.price_large : s.price_standard;
    const fee = delivery === "delivery" ? s.delivery_fee : 0;
    const face = b.face === "intl" && (m.name_en || (m.country || "SD") !== "SD") ? "intl" : "local";
    const { rows } = await query(
      `INSERT INTO lit_print_orders (member_id, user_id, face, size, qty, delivery, address, phone, note, unit_price, delivery_fee, total, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [m.id, me.id, face, size, qty, delivery, delivery === "delivery" ? address : null, phone, clean(b.note, 300) || null, unit, fee, unit * qty + fee, s.currency]);
    const admins = (await query(`SELECT user_id AS id FROM ithraa_moderators WHERE categories IS NULL OR cardinality(categories)=0 OR 'writers' = ANY(categories)
      UNION SELECT id FROM users WHERE role='admin'`).catch(() => ({ rows: [] as any[] }))).rows.map((r: any) => r.id);
    void notifyLit(admins, "طلب طباعة بطاقة 🖨️", `${m.pen_name || m.full_name} — ${qty} × ${PRINT_SIZES[size]}`, { screen: "writers-members-admin" });
    return res.status(201).json({ order: printRow(rows[0]), message: "استلمنا طلب الطباعة — ستتواصل معك الإدارة لتأكيده" });
  } catch (err) { return fail(res, err, "print-order"); }
});

function printRow(o: any) {
  return { ...o, unit_price: Number(o.unit_price), delivery_fee: Number(o.delivery_fee), total: Number(o.total), size_label: PRINT_SIZES[o.size] ?? o.size, status_label: PRINT_STATUS_AR[o.status] ?? o.status };
}

router.get("/lit/print/mine", async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const { rows } = await query(`SELECT * FROM lit_print_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [me.id]);
    return res.json({ orders: rows.map(printRow) });
  } catch (err) { return fail(res, err, "print-mine"); }
});

router.post("/lit/print/orders/:id/cancel", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const r = await query(`UPDATE lit_print_orders SET status='cancelled', updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING *`, [Number(req.params.id), me.id]);
    if (!r.rows[0]) return res.status(409).json({ error: "لا يمكن إلغاء الطلب بعد تأكيده" });
    return res.json({ order: printRow(r.rows[0]) });
  } catch (err) { return fail(res, err, "print-cancel"); }
});

router.get("/lit/print/orders", async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    const st = String(req.query.status || "open");
    const where = st === "open" ? `o.status IN ('pending','confirmed','printing','ready')` : PRINT_STATUS.includes(st) ? `o.status='${st}'` : "TRUE";
    const { rows } = await query(
      `SELECT o.*, m.full_name, m.pen_name, m.member_no, m.category FROM lit_print_orders o JOIN lit_members m ON m.id=o.member_id WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`);
    const counts = (await query(`SELECT status, COUNT(*)::int AS n FROM lit_print_orders GROUP BY status`)).rows;
    return res.json({ orders: rows.map((r: any) => ({ ...printRow(r), name: r.pen_name || r.full_name, category: CAT.get(r.category)?.label ?? r.category })), counts: Object.fromEntries(counts.map((c: any) => [c.status, c.n])) });
  } catch (err) { return fail(res, err, "print-list"); }
});

router.post("/lit/print/orders/:id/status", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureMembersDb();
    const me = await sessionUser(req);
    if (!(await canAdmin(me))) return res.status(403).json({ error: "للإدارة فقط" });
    const status = String(req.body?.status || "");
    if (!PRINT_STATUS.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const r = await query(`UPDATE lit_print_orders SET status=$2, payment_ref=COALESCE($3, payment_ref), admin_note=COALESCE($4, admin_note), updated_at=NOW() WHERE id=$1 RETURNING *`,
      [Number(req.params.id), status, clean(req.body?.payment_ref, 80) || null, clean(req.body?.note, 300) || null]);
    const o = r.rows[0];
    if (!o) return res.status(404).json({ error: "غير موجود" });
    const msg: Record<string, string> = { confirmed: "أُكّد طلب طباعة بطاقتك", printing: "بطاقتك قيد الطباعة الآن 🖨️", ready: "بطاقتك المطبوعة جاهزة للاستلام 🎉", delivered: "سُلّمت بطاقتك المطبوعة — مبروك!", cancelled: "أُلغي طلب طباعة البطاقة" };
    if (msg[status]) void notifyLit([o.user_id], msg[status], clean(req.body?.note, 300) || PRINT_STATUS_AR[status], { screen: "writers-membership" });
    return res.json({ order: printRow(o) });
  } catch (err) { return fail(res, err, "print-status"); }
});

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
<title>${m ? `${esc(m.pen_name || m.full_name)} — ${esc(c?.title)} · ديوان الكُتّاب` : "التحقق من عضوية — ديوان الكُتّاب"}</title>
<meta property="og:type" content="profile"><meta property="og:site_name" content="حصاحيصاوي">
<meta property="og:title" content="${m ? `${esc(m.pen_name || m.full_name)} — ${esc(c?.title)}` : "التحقق من عضوية — ديوان الكُتّاب"}">
<meta property="og:description" content="${m ? `بطاقة عضوية موثّقة في ديوان الكُتّاب · ${esc(m.member_no)}` : "تحقق من بطاقات عضوية ديوان الكُتّاب على منصة حصاحيصاوي"}">
<meta property="og:image" content="${WEB}/og/hasahisawi.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${WEB}/og/hasahisawi.png"><style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#F4F1EA;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{max-width:420px;width:100%;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 12px 32px rgba(0,0,0,.12)}
.h{background:${c?.color ?? "#3A1E1A"};color:#fff;padding:22px;text-align:center}.h small{opacity:.8}.h b{display:block;font-size:22px;margin-top:6px}
.s{display:inline-block;margin-top:10px;padding:6px 14px;border-radius:20px;font-weight:700;background:${valid ? "#E7F6EE;color:#0E7C4A" : "#FDECEC;color:#B42318"}}
.r{display:flex;justify-content:space-between;padding:11px 22px;border-bottom:1px dashed #eee;font-size:14px}.k{color:#6B7B73}.v{font-weight:700}</style></head><body><div class="c">
<div class="h"><small>ديوان الكُتّاب · منصة حصاحيصاوي${m && (m.country || "SD") !== "SD" ? " · انتساب دولي — International Membership" : ""}</small><b>${m ? esc(m.pen_name || m.full_name) : "بطاقة غير موجودة"}</b>${m ? `<span>${esc(c?.title)}</span><br><div class="s">${valid ? "✓ " : ""}${esc(stLabel[m.status] || m.status)}</div>` : ""}</div>
${m ? `<div class="r"><span class="k">رقم العضوية</span><span class="v">${esc(m.member_no)}</span></div>
<div class="r"><span class="k">الاسم</span><span class="v">${esc(m.full_name)}</span></div>
<div class="r"><span class="k">الفئة</span><span class="v">${esc(c?.label)} · ${esc(TIER_LABEL[m.tier])}</span></div>
${m.name_en ? `<div class="r"><span class="k">Name</span><span class="v" dir="ltr">${esc(m.name_en)}</span></div>` : ""}
<div class="r"><span class="k">الدولة · Country</span><span class="v">${esc(COUNTRY[m.country || "SD"]?.[0])} · <span dir="ltr">${esc(COUNTRY[m.country || "SD"]?.[1])}</span></span></div>
${m.category === "journalist" && m.press_org ? `<div class="r"><span class="k">المؤسسة</span><span class="v">${esc(m.press_org)}</span></div>` : ""}
<div class="r"><span class="k">تاريخ الإصدار</span><span class="v">${d(m.issued_at)}</span></div>
<div class="r" style="border:0"><span class="k">صالحة حتى</span><span class="v">${d(m.valid_until)}</span></div>` : ""}
</div></body></html>`);
  } catch (err) { return fail(res, err, "verify"); }
});

export default router;
