// ════════════════════════════════════════════════════════════════
// ✉️ «دعوات الأقسام» — روابط دعوة رسمية لكل قسم، ينشئها مدير التطبيق وحده
//  • المدير يختار القسم ويكتب اسم المدعو (شخص/جهة) ورسالة شخصية ومدة الصلاحية وعدد الاستخدامات.
//  • لكل دعوة رمز عشوائي، وصفحة عامة أنيقة (Open Graph) تظهر معاينتها في واتساب وفيسبوك.
//  • المدعو يفتح الرابط ← يقبل الدعوة (بعد تسجيل الدخول) ← ينتقل مباشرةً لشاشة الانضمام للقسم.
//  • تُحتسب الفتحات (مرة لكل جهاز يومياً) والقبولات، ويمكن إلغاء الدعوة أو تمديدها.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomInt, createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();

const API_BASE = (process.env.PUBLIC_API_BASE || "https://api-server-gilt-ten.vercel.app").replace(/\/$/, "");
const WEB_APP = (process.env.APP_URL || "https://hasahisawi.pages.dev").replace(/\/$/, "");
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.almhbob.hasahisawi";
const INVITER = "إدارة حصاحيصاوي";
const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type SectionDef = {
  title: string; tagline: string; icon: string; emoji: string; color: string;
  route: string; params?: Record<string, string>;
  /** سطر الدعوة الافتراضي (يُبنى منه نص الرسالة المقترح) */
  pitch: string;
  /** نص دعوة مخصّص للجهة نفسها (حين يختلف عن دعوة الأفراد) */
  orgMessage?: string;
};

// مسارات الانضمام الفعلية داخل التطبيق (تم التحقق من وجود كل شاشة ونموذج التسجيل فيها)
export const SECTIONS: Record<string, SectionDef> = {
  app:           { title: "الانضمام إلى حصاحيصاوي", tagline: "خدمات مدينة الحصاحيصا في مكان واحد", icon: "sparkles", emoji: "💚", color: "#00966A", route: "/(tabs)", pitch: "ندعوكم للانضمام إلى تطبيق حصاحيصاوي، المنصة التي تجمع خدمات المدينة وأهلها في مكان واحد" },
  medical:       { title: "المنشآت الطبية", tagline: "مستشفيات، عيادات، صيدليات، مختبرات", icon: "medkit", emoji: "🏥", color: "#E05567", route: "/org-join", pitch: "يسعدنا دعوة منشأتكم الطبية للانضمام إلى قسم الطب والصحة وتقديم خدماتها لأهل المدينة بتوثيق رسمي" },
  institutions:  { title: "المؤسسات والجهات", tagline: "انضمام رسمي موثّق للمؤسسات", icon: "business", emoji: "🏛️", color: "#1F5C8A", route: "/org-join", pitch: "يسعدنا دعوة مؤسستكم للانضمام رسمياً إلى حصاحيصاوي والتواصل المباشر مع المجتمع" },
  orgs:          { title: "المنظمات والمبادرات", tagline: "منظمات المجتمع المدني والتطوع", icon: "people", emoji: "🤝", color: "#0F766E", route: "/(tabs)/orgs", pitch: "يسعدنا دعوة منظمتكم للانضمام إلى قسم المنظمات وعرض مبادراتها وأنشطتها" },
  lawyers:       { title: "المحامون والمستشارون", tagline: "استقبال القضايا والاستشارات القانونية", icon: "briefcase", emoji: "⚖️", color: "#1F3A5F", route: "/lawyer-portal", pitch: "يسعدنا دعوتكم للانضمام إلى قسم المحامين وتقديم خدماتكم القانونية لأهل المدينة" },
  stores:        { title: "متاجر المجتمع", tagline: "متجر إلكتروني وطلبات مباشرة", icon: "bag-handle", emoji: "🛍️", color: "#E8A900", route: "/store-portal", pitch: "يسعدنا دعوة متجركم للانضمام إلى متاجر حصاحيصاوي واستقبال الطلبات مباشرة" },
  restaurants:   { title: "المطاعم والكافيهات", tagline: "قائمة طعام وطلبات توصيل", icon: "restaurant", emoji: "🍽️", color: "#F97316", route: "/(tabs)/restaurants", pitch: "يسعدنا دعوة مطعمكم للانضمام إلى قسم المطاعم والكافيهات واستقبال الطلبات" },
  designers:     { title: "المصممون", tagline: "معرض أعمال وطلبات تصميم", icon: "color-palette", emoji: "🎨", color: "#3B78A6", route: "/designer-portal", pitch: "يسعدنا دعوتكم للانضمام إلى معرض التصاميم وعرض أعمالكم واستقبال طلبات العملاء" },
  drivers:       { title: "سائقو «مشوارك علينا»", tagline: "مشاوير وخدمات توصيل داخل المدينة", icon: "car", emoji: "🚗", color: "#F97316", route: "/(tabs)/transport", pitch: "يسعدنا دعوتكم للانضمام إلى فريق سائقي «مشوارك علينا» واستقبال طلبات المشاوير" },
  travel:        { title: "وكالات السفر", tagline: "تذاكر السفر بين المدن", icon: "airplane", emoji: "✈️", color: "#0EA5E9", route: "/travel-agencies", pitch: "يسعدنا دعوة وكالتكم للانضمام إلى قسم تذاكر السفر وبيع التذاكر عبر التطبيق" },
  women:         { title: "ركن المرأة", tagline: "خدمات ومشاريع نسائية", icon: "flower", emoji: "🌸", color: "#5B8DB8", route: "/(tabs)/women", pitch: "يسعدنا دعوتكِ للانضمام إلى ركن المرأة وعرض خدماتكِ ومشروعكِ" },
  men:           { title: "قسم الرجال", tagline: "خدمات الحلاقة والأزياء والحِرف", icon: "man", emoji: "🧔", color: "#38BDF8", route: "/(tabs)/men", pitch: "يسعدنا دعوتكم لتسجيل خدمتكم في قسم الرجال والوصول إلى عملاء جدد" },
  occasions:     { title: "المناسبات", tagline: "صالات، كوشات، تصوير، سيارات أفراح", icon: "gift", emoji: "🎉", color: "#D97706", route: "/(tabs)/occasions", pitch: "يسعدنا دعوتكم للانضمام إلى قسم المناسبات وعرض خدماتكم لأصحاب الأفراح" },
  contractors:   { title: "شركات المقاولات", tagline: "معرض مشاريع وطلبات عروض أسعار", icon: "construct", emoji: "🏗️", color: "#B45309", route: "/contractors", params: { tab: "register" }, pitch: "يسعدنا دعوة شركتكم للانضمام إلى دليل شركات المقاولات واستقبال طلبات عروض الأسعار" },
  universities:  { title: "الجامعات والكليات", tagline: "إدارة أكاديمية رقمية للطلاب والأساتذة", icon: "library", emoji: "🏛️", color: "#1E3A8A", route: "/edu-institution", params: { join: "1" },
    pitch: "يسعدنا دعوة جامعتكم للانضمام إلى بوابة المؤسسات التعليمية في حصاحيصاوي",
    orgMessage: "السادة إدارة الجامعة / الكلية المحترمون،\nتحية طيبة وبعد،\nيسعد إدارة منصة حصاحيصاوي دعوتكم لتفعيل بوابتكم الأكاديمية على المنصة: إدارة الأقسام والأساتذة والطلاب، جداول محاضرات ترفض التضارب تلقائياً، النتائج والحضور، الإعلانات وإشعار الطلاب، وطلبات الطلاب الإلكترونية، مع المكتبة المنهجية ومساحة اتحاد الطلاب.\nنتشرف بشراكتكم في خدمة طلاب الحصاحيصا ومجتمعها." },
  education:     { title: "المؤسسات التعليمية", tagline: "مدارس، معاهد، رياض أطفال", icon: "school", emoji: "🎓", color: "#0F766E", route: "/edu-institution", params: { join: "1" }, pitch: "يسعدنا دعوة مؤسستكم التعليمية للانضمام وإدارة الطلاب والجداول والتواصل مع أولياء الأمور" },
  writers:       { title: "ديوان الكُتّاب", tagline: "عضوية الكُتّاب والبطاقة الموثّقة", icon: "create", emoji: "✍️", color: "#7A2E3A", route: "/writers-apply", pitch: "يسعدنا دعوتكم للانضمام إلى ديوان الكُتّاب والحصول على العضوية والبطاقة الموثّقة" },
  press:         { title: "نافذة الصحافة", tagline: "دليل الصحفيين والمراسلين المعتمدين", icon: "newspaper", emoji: "📰", color: "#C8102E", route: "/press", params: { tab: "directory" }, pitch: "يسعدنا دعوتكم للانضمام إلى نافذة الصحافة والإدراج في دليل الصحفيين المعتمدين" },
  volunteer:     { title: "التطوع", tagline: "فرص تطوعية ونقاط إنجاز", icon: "heart-circle", emoji: "🙌", color: "#00966A", route: "/volunteer", pitch: "يسعدنا دعوتكم للانضمام إلى مجتمع المتطوعين والمشاركة في خدمة المدينة" },
  red_crescent:  { title: "الهلال الأحمر السوداني", tagline: "متطوعون ومسعفون", icon: "medkit", emoji: "⛑️", color: "#B91C1C", route: "/red-crescent", pitch: "يسعدنا دعوتكم للانضمام إلى فريق الهلال الأحمر السوداني متطوعاً أو مسعفاً",
    orgMessage: "السادة إدارة جمعية الهلال الأحمر السوداني — فرعية الحصاحيصا المحترمون،\nتحية طيبة وبعد،\nيسعد إدارة منصة حصاحيصاوي دعوتكم لتفعيل مساحتكم الرسمية على المنصة: إدارة وحداتكم وتعيين مدير لكل وحدة، استقبال طلبات المتطوعين والمسعفين واعتمادها، بطاقات المسعف الرقمية القابلة للتحقق، الدورات والشهادات، والاجتماعات والأنشطة وإشعار الأعضاء.\nنتشرف بشراكتكم في خدمة مجتمع الحصاحيصا." },
  unions:        { title: "النقابات المهنية", tagline: "عضوية النقابات والاتحادات", icon: "people-circle", emoji: "🪪", color: "#1F5C8A", route: "/(tabs)/unions", pitch: "يسعدنا دعوتكم للانضمام إلى قسم النقابات المهنية" },
  union_partner: { title: "شراكة الاتحاد", tagline: "شراكات الجهات مع الاتحاد", icon: "git-merge", emoji: "🤝", color: "#1F5C8A", route: "/union-partnership-apply", pitch: "يسعدنا دعوة جهتكم لتقديم طلب شراكة رسمية مع الاتحاد" },
  student_union: { title: "اتحاد الطلاب", tagline: "عضوية اتحاد الطلاب", icon: "school", emoji: "🎒", color: "#1F5C8A", route: "/student-union-join", pitch: "يسعدنا دعوتكم للانضمام إلى اتحاد الطلاب والاستفادة من خدماته" },
  partnership:   { title: "الشراكات الخارجية", tagline: "شراكات الشركات والجهات", icon: "globe", emoji: "🌍", color: "#E8A900", route: "/external-partnership", pitch: "يسعدنا دعوة جهتكم لبناء شراكة رسمية مع تطبيق حصاحيصاوي" },
  communities:   { title: "الجاليات", tagline: "تسجيل الجاليات ومؤسساتها", icon: "earth", emoji: "🌐", color: "#0EA5E9", route: "/(tabs)/communities", pitch: "يسعدنا دعوة جاليتكم للتسجيل في قسم الجاليات والتواصل مع أبنائها" },
  factories:     { title: "المصانع والإنتاج المحلي", tagline: "عرض المنتجات المحلية", icon: "hardware-chip", emoji: "🏭", color: "#F97316", route: "/(tabs)/factories", pitch: "يسعدنا دعوة مصنعكم للانضمام إلى قسم المصانع والإنتاج المحلي وعرض منتجاته" },
  ads:           { title: "الإعلانات", tagline: "إعلانات مميّزة للجهات والأنشطة", icon: "megaphone", emoji: "📣", color: "#F0A500", route: "/(tabs)/ads", pitch: "يسعدنا دعوتكم لنشر إعلانكم في قسم الإعلانات والوصول إلى آلاف المستخدمين" },
  jobs:          { title: "الوظائف", tagline: "نشر الوظائف واستقبال المتقدمين", icon: "briefcase", emoji: "💼", color: "#00966A", route: "/(tabs)/jobs", pitch: "يسعدنا دعوتكم لنشر وظائفكم في قسم الوظائف واستقبال طلبات المتقدمين" },
};

let ready: Promise<void> | null = null;
export function ensureSectionInvitesDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS section_invites (
      id SERIAL PRIMARY KEY,
      token VARCHAR(16) NOT NULL UNIQUE,
      section_key VARCHAR(40) NOT NULL,
      invitee_name VARCHAR(160) NOT NULL,
      invitee_kind VARCHAR(8) NOT NULL DEFAULT 'person',
      invitee_phone VARCHAR(40),
      message TEXT,
      max_uses INTEGER,
      uses INTEGER NOT NULL DEFAULT 0,
      opens INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_section_invites_section ON section_invites(section_key, created_at DESC)`);
    await query(`CREATE TABLE IF NOT EXISTS section_invite_events (
      id SERIAL PRIMARY KEY,
      invite_id INTEGER NOT NULL REFERENCES section_invites(id) ON DELETE CASCADE,
      kind VARCHAR(8) NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      fp VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_section_invite_events ON section_invite_events(invite_id, kind, created_at DESC)`);
  })().catch((e) => { ready = null; throw e; }));
}

router.use(["/admin/section-invites", "/public/section-invites", "/section-invites"], async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureSectionInvitesDb(); return next(); }
  catch (err) { logger.error({ err }, "[section-invites] ensure"); return res.status(500).json({ error: "تعذّر التهيئة" }); }
});
router.param("id", (_req, res, next, v) => (/^\d+$/.test(String(v)) ? next() : res.status(404).json({ error: "غير موجود" })));
router.param("token", (_req, res, next, v) => (/^[A-Za-z0-9]{6,16}$/.test(String(v)) ? next() : res.status(404).json({ error: "الدعوة غير موجودة" })));

const fail = (res: Response, err: unknown, where: string) => {
  logger.error({ err }, `[section-invites] ${where}`);
  return res.status(500).json({ error: "حدث خطأ، حاول لاحقاً" });
};

/** المدير وحده (لا المشرفون) — طلب صاحب التطبيق صراحةً */
async function adminOnly(req: Request, res: Response): Promise<SessionUser | null> {
  const me = await sessionUser(req);
  if (!me) { res.status(401).json({ error: "سجّل الدخول أولاً" }); return null; }
  if (me.role !== "admin") { res.status(403).json({ error: "هذه الميزة لمدير التطبيق فقط" }); return null; }
  return me;
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

function newToken(len = 10) {
  return Array.from({ length: len }, () => TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]).join("");
}

type InviteRow = {
  id: number; token: string; section_key: string; invitee_name: string; invitee_kind: string; invitee_phone: string | null;
  message: string | null; max_uses: number | null; uses: number; opens: number; expires_at: string | null;
  created_by: number | null; revoked_at: string | null; created_at: string;
};
type Status = "active" | "expired" | "used" | "revoked";

function statusOf(r: InviteRow): Status {
  if (r.revoked_at) return "revoked";
  if (r.expires_at && new Date(r.expires_at).getTime() <= Date.now()) return "expired";
  if (r.max_uses != null && r.uses >= r.max_uses) return "used";
  return "active";
}
const REASON: Record<Exclude<Status, "active">, string> = {
  revoked: "أُلغيت هذه الدعوة من قِبل الإدارة",
  expired: "انتهت صلاحية هذه الدعوة",
  used: "استُخدمت هذه الدعوة بالكامل",
};

const pageUrl = (t: string) => `${API_BASE}/api/public/section-invites/${t}/page`;
// ملاحظة: ‎/join محجوز لصفحة ثابتة قائمة (public/join.html) على Cloudflare Pages، لذا مسار التطبيق ‎/invitation
const appUrl = (t: string) => `${WEB_APP}/invitation?t=${t}`;

function sectionOut(key: string) {
  const s = SECTIONS[key];
  return s ? { key, title: s.title, tagline: s.tagline, icon: s.icon, emoji: s.emoji, color: s.color, route: s.route, params: s.params ?? {} } : null;
}

function defaultMessage(key: string, kind: string) {
  const s = SECTIONS[key];
  if (!s) return "";
  if (kind === "org" && s.orgMessage) return s.orgMessage;
  const greet = kind === "org" ? "السادة الكرام،" : "الأستاذ/ة الكريم/ة،";
  return `${greet}\n${s.pitch}.\nنتطلع إلى انضمامكم وإسهامكم في خدمة مجتمع الحصاحيصا.`;
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
}

function shareText(r: InviteRow) {
  const s = SECTIONS[r.section_key];
  const lines = [
    "✉️ دعوة رسمية للانضمام — حصاحيصاوي",
    `إلى: ${r.invitee_name}`,
    "",
    `يسعد ${INVITER} دعوتكم للانضمام إلى «${s?.title ?? "حصاحيصاوي"}» ${s?.emoji ?? ""}`.trim(),
  ];
  if (r.message) lines.push("", r.message.trim());
  lines.push("", r.expires_at ? `⏳ الدعوة صالحة حتى ${fmtDate(r.expires_at)}` : "⏳ الدعوة مفتوحة الصلاحية", "", `افتح الدعوة واقبلها من هنا:\n${pageUrl(r.token)}`);
  return lines.join("\n");
}

function invOut(r: InviteRow) {
  return {
    ...r,
    status: statusOf(r),
    section: sectionOut(r.section_key),
    share_url: pageUrl(r.token),
    app_url: appUrl(r.token),
    share_text: shareText(r),
  };
}

// ── الكتالوج مع الإحصاءات ──
router.get("/admin/section-invites/sections", async (req, res) => {
  try {
    if (!(await adminOnly(req, res))) return;
    const r = await query(`SELECT section_key, COUNT(*)::int AS sent, COALESCE(SUM(opens),0)::int AS opens, COALESCE(SUM(uses),0)::int AS accepts,
      COUNT(*) FILTER (WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW()) AND (max_uses IS NULL OR uses<max_uses))::int AS active
      FROM section_invites GROUP BY section_key`);
    const by = new Map(r.rows.map((x: any) => [x.section_key, x]));
    const sections = Object.keys(SECTIONS).map((k) => {
      const c: any = by.get(k) || {};
      return { ...sectionOut(k)!, template_person: defaultMessage(k, "person"), template_org: defaultMessage(k, "org"),
        counts: { sent: c.sent ?? 0, opens: c.opens ?? 0, accepts: c.accepts ?? 0, active: c.active ?? 0 } };
    });
    const totals = sections.reduce((a, s) => ({ sent: a.sent + s.counts.sent, opens: a.opens + s.counts.opens, accepts: a.accepts + s.counts.accepts, active: a.active + s.counts.active }), { sent: 0, opens: 0, accepts: 0, active: 0 });
    return res.json({ sections, totals, inviter: INVITER });
  } catch (err) { return fail(res, err, "sections"); }
});

// ── إنشاء دعوة ──
router.post("/admin/section-invites", writeLimiter, async (req, res) => {
  try {
    const me = await adminOnly(req, res);
    if (!me) return;
    const b = req.body ?? {};
    const key = clip(b.section_key, 40);
    if (!SECTIONS[key]) return res.status(400).json({ error: "القسم غير معروف" });
    const name = clip(b.invitee_name, 160);
    if (name.length < 2) return res.status(400).json({ error: "اكتب اسم المدعو أو الجهة" });
    const kind = b.invitee_kind === "org" ? "org" : "person";
    const phone = clip(b.invitee_phone, 40).replace(/[^\d+]/g, "") || null;
    const message = clip(b.message, 1200) || defaultMessage(key, kind);
    let days = b.expires_days == null || b.expires_days === "" ? 30 : Math.floor(Number(b.expires_days));
    if (!Number.isFinite(days) || days < 0) days = 30;
    days = Math.min(days, 365);
    let maxUses: number | null;
    if (b.max_uses === undefined) maxUses = kind === "person" ? 1 : null;
    else if (b.max_uses === null || b.max_uses === "" || Number(b.max_uses) === 0) maxUses = null;
    else maxUses = Math.max(1, Math.min(1000, Math.floor(Number(b.max_uses)) || 1));

    for (let i = 0; i < 6; i++) {
      try {
        const r = await query(`INSERT INTO section_invites (token, section_key, invitee_name, invitee_kind, invitee_phone, message, max_uses, expires_at, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $8::int=0 THEN NULL ELSE NOW() + make_interval(days => $8::int) END, $9) RETURNING *`,
          [newToken(), key, name, kind, phone, message, maxUses, days, me.id]);
        return res.status(201).json({ invite: invOut(r.rows[0]) });
      } catch (e: any) { if (e?.code !== "23505") throw e; }
    }
    return res.status(500).json({ error: "تعذّر توليد رمز فريد، حاول مجدداً" });
  } catch (err) { return fail(res, err, "create"); }
});

// ── قائمة الدعوات ──
router.get("/admin/section-invites", async (req, res) => {
  try {
    if (!(await adminOnly(req, res))) return;
    const sec = clip(req.query.section, 40);
    const r = await query(`SELECT * FROM section_invites ${sec ? "WHERE section_key=$1" : ""} ORDER BY created_at DESC LIMIT 300`, sec ? [sec] : []);
    return res.json({ invites: r.rows.map(invOut) });
  } catch (err) { return fail(res, err, "list"); }
});

// ── إلغاء / تمديد / إعادة تفعيل ──
router.patch("/admin/section-invites/:id", writeLimiter, async (req, res) => {
  try {
    if (!(await adminOnly(req, res))) return;
    const id = Number(req.params.id);
    const action = String(req.body?.action || "");
    let r;
    if (action === "revoke") {
      r = await query(`UPDATE section_invites SET revoked_at=COALESCE(revoked_at, NOW()) WHERE id=$1 RETURNING *`, [id]);
    } else if (action === "restore") {
      r = await query(`UPDATE section_invites SET revoked_at=NULL WHERE id=$1 RETURNING *`, [id]);
    } else if (action === "extend") {
      const days = Math.min(365, Math.max(0, Math.floor(Number(req.body?.days ?? 30)) || 0));
      const addUses = Math.max(0, Math.min(1000, Math.floor(Number(req.body?.add_uses ?? 0)) || 0));
      r = await query(`UPDATE section_invites SET
          expires_at = CASE WHEN $2::int=0 THEN NULL ELSE GREATEST(NOW(), COALESCE(expires_at, NOW())) + make_interval(days => $2::int) END,
          max_uses = CASE WHEN max_uses IS NULL THEN NULL WHEN $3::int>0 THEN GREATEST(max_uses, uses) + $3::int ELSE max_uses END
        WHERE id=$1 RETURNING *`, [id, days, addUses]);
    } else return res.status(400).json({ error: "إجراء غير معروف" });
    if (!r.rows[0]) return res.status(404).json({ error: "الدعوة غير موجودة" });
    return res.json({ invite: invOut(r.rows[0]) });
  } catch (err) { return fail(res, err, "patch"); }
});

async function loadInvite(token: string): Promise<InviteRow | null> {
  return (await query(`SELECT * FROM section_invites WHERE token=$1`, [token])).rows[0] ?? null;
}

/** فتحة واحدة لكل (IP + المتصفح) يومياً، ولا تُحتسب فتحات المدير نفسه */
async function recordOpen(req: Request, inv: InviteRow) {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    const ua = String(req.headers["user-agent"] || "").slice(0, 200);
    const day = new Date().toISOString().slice(0, 10);
    const fp = createHash("sha256").update(`${inv.id}|${ip}|${ua}|${day}`).digest("hex");
    const me = await sessionUser(req).catch(() => null);
    if (me?.role === "admin") return;
    const ins = await query(`INSERT INTO section_invite_events (invite_id, kind, user_id, fp)
      SELECT $1::int,'open',$2::int,$3::varchar WHERE NOT EXISTS (SELECT 1 FROM section_invite_events WHERE invite_id=$1::int AND kind='open' AND fp=$3::varchar) RETURNING id`,
      [inv.id, me?.id ?? null, fp]);
    if (ins.rows[0]) await query(`UPDATE section_invites SET opens=opens+1 WHERE id=$1`, [inv.id]);
  } catch (err) { logger.warn({ err }, "[section-invites] open"); }
}

function publicOut(inv: InviteRow | null) {
  if (!inv || !SECTIONS[inv.section_key]) return { valid: false, reason: "الدعوة غير موجودة أو الرابط غير صحيح", status: "missing" as const };
  const st = statusOf(inv);
  return {
    valid: st === "active",
    reason: st === "active" ? null : REASON[st],
    status: st,
    section: sectionOut(inv.section_key),
    invitee_name: inv.invitee_name,
    invitee_kind: inv.invitee_kind,
    message: inv.message,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
    inviter: INVITER,
    share_url: pageUrl(inv.token),
    app_url: appUrl(inv.token),
  };
}

// ── العرض العام (JSON) ──
router.get("/public/section-invites/:token", async (req, res) => {
  try {
    const inv = await loadInvite(String(req.params.token));
    if (inv) await recordOpen(req, inv);
    const out = publicOut(inv);
    return res.status(inv ? 200 : 404).json(out);
  } catch (err) { return fail(res, err, "public"); }
});

// ── قبول الدعوة ──
router.post("/section-invites/:token/accept", writeLimiter, async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لقبول الدعوة" });
    const inv = await loadInvite(String(req.params.token));
    if (!inv || !SECTIONS[inv.section_key]) return res.status(404).json({ error: "الدعوة غير موجودة" });
    const s = SECTIONS[inv.section_key];
    const nav = { route: s.route, params: s.params ?? {}, section: sectionOut(inv.section_key) };
    // نفس المستخدم يعيد فتح دعوة قبلها سابقاً: نوجّهه دون احتساب استخدام جديد
    const prev = await query(`SELECT 1 FROM section_invite_events WHERE invite_id=$1 AND kind='accept' AND user_id=$2 LIMIT 1`, [inv.id, me.id]);
    if (prev.rows[0]) return res.json({ ok: true, already: true, ...nav });
    const upd = await query(`UPDATE section_invites SET uses=uses+1
      WHERE id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW()) AND (max_uses IS NULL OR uses<max_uses) RETURNING *`, [inv.id]);
    if (!upd.rows[0]) {
      const st = statusOf(inv);
      return res.status(410).json({ error: st === "active" ? REASON.used : REASON[st], status: st === "active" ? "used" : st });
    }
    await query(`INSERT INTO section_invite_events (invite_id, kind, user_id) VALUES ($1,'accept',$2)`, [inv.id, me.id]);
    if (inv.created_by) {
      await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'general',$2,$3,$4)`,
        [inv.created_by, "✉️ قُبلت دعوة انضمام", `قبل ${me.name || "مستخدم"} دعوة «${inv.invitee_name}» للانضمام إلى ${s.title}.`,
          JSON.stringify({ type: "general", screen: "admin-invites" })]).catch(() => {});
    }
    return res.json({ ok: true, already: false, ...nav });
  } catch (err) { return fail(res, err, "accept"); }
});

// ── صفحة الدعوة العامة (HTML + Open Graph) ──
router.get("/public/section-invites/:token/page", async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  try {
    const inv = await loadInvite(String(req.params.token));
    if (inv) await recordOpen(req, inv);
    const p = publicOut(inv);
    return res.status(inv ? 200 : 404).send(renderPage(String(req.params.token), p));
  } catch (err) {
    logger.error({ err }, "[section-invites] page");
    return res.status(500).send(`<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:40px">حدث خطأ، حاول لاحقاً</body>`);
  }
});

function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function renderPage(token: string, p: ReturnType<typeof publicOut>) {
  const sec = "section" in p ? p.section : null;
  const color = sec?.color || "#00966A";
  const deep = shade(color, -0.22);
  const title = sec ? `دعوة رسمية للانضمام إلى ${sec.title}` : "دعوة حصاحيصاوي";
  const name = "invitee_name" in p ? p.invitee_name : "";
  const desc = sec
    ? `${name ? `إلى ${name} — ` : ""}يسعد ${INVITER} دعوتكم للانضمام إلى «${sec.title}» في تطبيق حصاحيصاوي. ${sec.tagline}.`
    : "الدعوة غير موجودة أو الرابط غير صحيح.";
  const msg = "message" in p && p.message ? p.message : "";
  const exp = "expires_at" in p ? p.expires_at : null;
  const validity = !p.valid ? "" : exp ? `صالحة حتى ${fmtDate(exp)}` : "مفتوحة الصلاحية";
  const joinUrl = appUrl(token);
  const self = pageUrl(token);
  const logo = `${WEB_APP}/icon.png`;
  const kindLbl = "invitee_kind" in p && p.invitee_kind === "org" ? "جهة مدعوّة" : "مدعوّ كريم";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} · حصاحيصاوي</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="${esc(color)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="حصاحيصاوي">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" content="✉️ ${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(self)}">
<meta property="og:image" content="${esc(logo)}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="✉️ ${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:Cairo,Tahoma,sans-serif;background:#F2F5F3;color:#1A2C25;-webkit-font-smoothing:antialiased}
.wrap{max-width:520px;margin:0 auto;padding:22px 16px 36px}
.card{position:relative;overflow:hidden;border-radius:28px;background:linear-gradient(150deg,${esc(color)} 0%,${esc(deep)} 100%);color:#fff;padding:26px 22px 24px;box-shadow:0 18px 40px -18px ${esc(deep)}}
.card:before{content:"";position:absolute;inset:-40% -30% auto auto;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.22),rgba(255,255,255,0) 70%)}
.card:after{content:"";position:absolute;inset:auto auto -90px -70px;width:240px;height:240px;border-radius:50%;border:34px solid rgba(255,255,255,.07)}
.top{display:flex;align-items:center;gap:10px;position:relative}
.logo{width:44px;height:44px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden}
.logo img{width:36px;height:36px;object-fit:contain}
.brand{font-weight:800;font-size:17px}.brand small{display:block;font-weight:600;font-size:12px;opacity:.85}
.seal{margin-inline-start:auto;font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35)}
.kicker{position:relative;margin-top:26px;font-size:13px;letter-spacing:.3px;opacity:.9;font-weight:700}
.icon{position:relative;width:74px;height:74px;border-radius:24px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;font-size:38px;margin-top:12px}
h1{position:relative;margin:14px 0 4px;font-size:27px;line-height:1.4;font-weight:800}
.tag{position:relative;opacity:.9;font-size:14.5px}
.to{position:relative;margin-top:20px;background:rgba(255,255,255,.95);color:#1A2C25;border-radius:18px;padding:14px 16px}
.to small{display:block;color:#6B7B74;font-size:12px;font-weight:700}.to b{font-size:19px}
.msg{background:#fff;border-radius:22px;padding:18px 18px;margin-top:14px;line-height:2;font-size:15.5px;white-space:pre-line;border:1px solid #E3EAE6}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.chip{background:#fff;border:1px solid #E3EAE6;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600;color:#40524A}
.btn{display:block;margin-top:14px;text-align:center;padding:16px;border-radius:18px;font-size:17.5px;font-weight:800;text-decoration:none}
.primary{background:${esc(color)};color:#fff;box-shadow:0 10px 24px -12px ${esc(deep)}}
.ghost{background:#fff;color:#1A2C25;border:1.5px solid #D6E0DB}
.bad{background:#FFF4F2;border:1px solid #F6C9C1;color:#9B2C1F;border-radius:18px;padding:14px 16px;margin-top:14px;font-weight:700;text-align:center}
.foot{text-align:center;color:#6B7B74;font-size:13px;margin-top:18px;line-height:1.9}
.sig{margin-top:14px;font-size:13.5px;text-align:left;opacity:.95;position:relative}
</style></head>
<body><div class="wrap">
<div class="card">
  <div class="top"><div class="logo"><img src="${esc(logo)}" alt="" onerror="this.parentNode.textContent='💚'"></div>
  <div class="brand">حصاحيصاوي<small>خدمات مدينة الحصاحيصا</small></div><div class="seal">دعوة رسمية</div></div>
  <div class="kicker">دعوة رسمية للانضمام</div>
  <div class="icon">${esc(sec?.emoji || "✉️")}</div>
  <h1>${esc(sec?.title || "دعوة غير متاحة")}</h1>
  <div class="tag">${esc(sec?.tagline || "")}</div>
  ${name ? `<div class="to"><small>${esc(kindLbl)} · إلى</small><b>${esc(name)}</b></div>` : ""}
  <div class="sig">— ${esc(INVITER)}</div>
</div>
${msg ? `<div class="msg">${esc(msg)}</div>` : ""}
${p.valid ? `<div class="meta"><span class="chip">⏳ ${esc(validity)}</span><span class="chip">🔒 دعوة خاصة</span></div>
<a class="btn primary" href="${esc(joinUrl)}">افتح الدعوة في التطبيق</a>
<a class="btn ghost" href="${esc(PLAY_URL)}">حمّل التطبيق من Google Play</a>`
  : `<div class="bad">${esc(p.reason || "الدعوة غير متاحة")}</div>
<a class="btn ghost" href="${esc(PLAY_URL)}">حمّل تطبيق حصاحيصاوي</a>`}
<div class="foot">افتح الدعوة ثم سجّل دخولك أو أنشئ حساباً — ستنتقل مباشرةً إلى نموذج الانضمام للقسم.<br>مستخدمو آيفون: يعمل التطبيق من المتصفح ويمكن إضافته للشاشة الرئيسية.</div>
</div></body></html>`;
}

export default router;
