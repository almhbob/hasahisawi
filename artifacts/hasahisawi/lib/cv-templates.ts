// قوالب السيرة الذاتية — كل قالب يُنتج HTML بمقاس A4 (794×1123) يُطبع PDF ويُعرض في المعاينة الحيّة.
// كل قالب يعلن أدوار الألوان القابلة للتعديل (CVTheme) ويضمن تباين النص تلقائياً فوق أي لون يختاره المستخدم.
import { type CVTheme, type CVThemeRole, mix, alpha, onColor, ensure, contrast, sanitizeTheme } from "./cv-theme";

export type CVTemplateId =
  | "nile" | "band" | "editorial" | "cards" | "ats" | "bold" | "hexa" | "diagonal" | "accent" | "arch"
  | "mustard" | "wave" | "mono" | "calm"
  | "sadu" | "swiss" | "magazine" | "rings";

export type CVData = {
  name: string; title: string; phone: string; email: string; address: string; website: string; summary: string;
  education: { degree: string; institution: string; year: string }[];
  experience: { position: string; company: string; period: string; desc: string }[];
  skills: string[]; languages: string[]; courses: string[];
  /** مستوى كل مهارة/لغة من 1 إلى 5 (المفتاح: نص المهارة) — يحدده المستخدم */
  skillLevels?: Record<string, number>; langLevels?: Record<string, number>;
  photoUri?: string; showPhoto: boolean;
};

export type CVTier = "free" | "premium";

export type CVTemplateMeta = {
  id: CVTemplateId; name: string; desc: string; bestFor: string;
  photo: boolean; font: string;
  /** الألوان الافتراضية للقالب */
  theme: CVTheme;
  /** الأدوار التي يستخدمها القالب (تظهر في التخصيص) */
  roles: CVThemeRole[];
  /** المستوى الافتراضي قبل أن تحدده الإدارة من الخادم */
  tier: CVTier;
  /** صديق لأنظمة الفرز الآلي (ATS) */
  ats?: boolean;
  /** شارة افتراضية قبل إعدادات الإدارة */
  badge?: string | null;
  /** مصدر الإلهام (للتوثيق) */
  inspiration?: string;
};

const T = (primary: string, accent: string, side: string, paper = "#FFFFFF", text = "#1E2430"): CVTheme => ({ primary, accent, side, paper, text });
const ALL_ROLES: CVThemeRole[] = ["primary", "accent", "side", "paper", "text"];

export const CV_TEMPLATES: CVTemplateMeta[] = [
  { id: "nile", name: "النيل", desc: "خط زمني للخبرات ونقاط واضحة", bestFor: "المحاسبة · الإدارة · الوظائف الحكومية", photo: false, font: "IBM Plex Sans Arabic", theme: T("#0E5A80", "#0E5A80", "#14212B", "#FFFFFF", "#14212B"), roles: ["primary", "paper", "text"], tier: "free", ats: true },
  { id: "band", name: "الشريط", desc: "شريط علوي بالصورة وعمودان مرتّبان", bestFor: "التقنية · الهندسة · الصحة", photo: true, font: "Cairo", theme: T("#0B7A4E", "#0B7A4E", "#0B7A4E", "#FFFFFF", "#17251E"), roles: ["primary", "paper", "text"], tier: "free" },
  { id: "editorial", name: "المحرّر", desc: "خط عربي فاخر على ورق عاجي", bestFor: "التعليم · الكتابة · الأكاديميا", photo: false, font: "Amiri", theme: T("#9A4F26", "#9A4F26", "#1E1B16", "#FAF8F2", "#1E1B16"), roles: ["primary", "paper", "text"], tier: "free" },
  { id: "cards", name: "البطاقات", desc: "أقسام في بطاقات ووسوم للمهارات", bestFor: "الحِرف · الفنيون · الخدمات", photo: true, font: "Cairo", theme: T("#0B7A4E", "#E8C766", "#0B7A4E", "#FFFFFF", "#1B2620"), roles: ["primary", "accent", "text"], tier: "free" },
  { id: "ats", name: "ATS", desc: "نص فقط بلا أعمدة — تقرؤه أنظمة الفرز", bestFor: "التقديم الإلكتروني · الشركات الكبيرة", photo: false, font: "IBM Plex Sans Arabic", theme: T("#111827", "#111827", "#111827", "#FFFFFF", "#111827"), roles: ["primary"], tier: "free", ats: true },
  { id: "hexa", name: "السداسي", desc: "إطار سداسي للصورة ولوحة اسم بيضاء ووسوم سهمية وحلقات للغات", bestFor: "التصميم · الهندسة · ريادة الأعمال", photo: true, font: "Cairo", theme: T("#1B2B48", "#1B2B48", "#1B2B48", "#FFFFFF", "#1E2430"), roles: ["primary", "side", "text"], tier: "premium", badge: "مطوّر", inspiration: "مرجع 16 — كحلي بإطار سداسي" },
  { id: "diagonal", name: "القطري", desc: "تقسيم قطري أنيق بصورة دائرية وتقييم بالنجوم", bestFor: "الإعلام · التسويق · الإدارة", photo: true, font: "Cairo", theme: T("#2B2B2D", "#5F5B56", "#2B2B2D", "#FFFFFF", "#2B2B2B"), roles: ["side", "accent", "text"], tier: "premium" },
  { id: "accent", name: "اللمسة الذهبية", desc: "عمود داكن بصورة مقوّسة ولمسات صفراء جريئة", bestFor: "الإبداع · التقنية · المبيعات", photo: true, font: "Cairo", theme: T("#1F2024", "#F2C230", "#1F2024", "#FFFFFF", "#1F2024"), roles: ["accent", "side", "text"], tier: "premium" },
  { id: "arch", name: "القوس", desc: "عمود مقوّس بأشرطة عناوين وخط زمني منقّط", bestFor: "المحاسبة · التعليم · الخدمات", photo: true, font: "Cairo", theme: T("#6E6E6E", "#6E6E6E", "#4A4A4A", "#FFFFFF", "#1E1E1E"), roles: ["primary", "text"], tier: "premium" },
  { id: "bold", name: "الجريء", desc: "شريط جانبي داكن بالصورة ولمسة ذهبية", bestFor: "التسويق · التصميم · المبيعات", photo: true, font: "Cairo", theme: T("#06325A", "#F0B400", "#06325A", "#FFFFFF", "#0F1C2B"), roles: ["primary", "accent", "side", "text"], tier: "free" },
  // ── مستوحاة من المراجع ──
  { id: "mustard", name: "الخردلي", desc: "عمود فحمي وأشرطة خردلية واسم بخط نسخ كبير وخبرات بعمودين", bestFor: "الكتابة · الإدارة · الاستشارات", photo: true, font: "Cairo", theme: T("#2B2D33", "#C9A12B", "#2B2D33", "#FFFFFF", "#24262B"), roles: ["accent", "side", "paper", "text"], tier: "premium", badge: "جديد", inspiration: "مرجع 13 — فحمي وخردلي" },
  { id: "wave", name: "الموجة", desc: "عمود أردوازي بصورة دائرية وأشرطة متدرّجة ورأس منحنٍ", bestFor: "التصميم · التسويق · التقنية", photo: true, font: "Cairo", theme: T("#2F6E7D", "#7FB6C1", "#2C3A40", "#FFFFFF", "#1F2A2E"), roles: ["primary", "accent", "side", "text"], tier: "premium", badge: "جديد", inspiration: "مرجع 14 — أردوازي وفيروزي" },
  { id: "mono", name: "أحادي اللون", desc: "كتلة اسم سوداء وعمود رمادي وخط زمني بالتواريخ", bestFor: "البحث · التحليل · الإدارة", photo: false, font: "Cairo", theme: T("#111111", "#6B6B6B", "#1A1A1A", "#FFFFFF", "#1A1A1A"), roles: ["primary", "side", "text"], tier: "free", badge: "جديد", inspiration: "مرجع 15 — أبيض وأسود" },
  { id: "calm", name: "الموجات الهادئة", desc: "خلفية خطوط موجية وصورة دائرية بحلقة كحلية وعمودان", bestFor: "التصميم · الإدارة · العلاقات العامة", photo: true, font: "Cairo", theme: T("#1B2B4B", "#9AA1AB", "#1B2B4B", "#F3F4F6", "#1B2B4B"), roles: ["primary", "accent", "paper"], tier: "premium", badge: "جديد", inspiration: "مرجع 17 — رمادي وكحلي بموجات" },
  // ── ابتكارات حصاحيصاوي ──
  { id: "sadu", name: "السدو السوداني", desc: "إطار هندسي من مثلثات ومعيّنات مستوحى من الزخرفة السودانية", bestFor: "التعليم · الثقافة · العمل المجتمعي", photo: true, font: "Cairo", theme: T("#7A1F2B", "#C9A227", "#3A1218", "#FFFCF5", "#2A1A1C"), roles: ["primary", "accent", "paper", "text"], tier: "premium", badge: "جديد", inspiration: "ابتكار — زخرفة السدو والمثلثات" },
  { id: "swiss", name: "السويسري", desc: "شبكة صارمة وأرقام أقسام كبيرة وفراغ أبيض — تقرؤه أنظمة الفرز", bestFor: "الهندسة · المالية · التقديم الإلكتروني", photo: false, font: "IBM Plex Sans Arabic", theme: T("#111111", "#D7263D", "#111111", "#FFFFFF", "#111111"), roles: ["primary", "accent", "text"], tier: "free", ats: true, badge: "جديد", inspiration: "ابتكار — التصميم السويسري" },
  { id: "magazine", name: "المجلّة", desc: "غلاف مجلّة بالاسم كعنوان واقتباس بارز وأعمدة صحفية", bestFor: "الإعلام · الصحافة · الفنون", photo: true, font: "Amiri", theme: T("#0F2A3D", "#E07A3F", "#0F2A3D", "#FFFFFF", "#1C2329"), roles: ["primary", "accent", "side", "text"], tier: "premium", badge: "جديد", inspiration: "ابتكار — غلاف مجلّة" },
  { id: "rings", name: "الإنفوجرافيك", desc: "حلقات للمهارات وأرقام حقيقية من سيرتك وخط زمني متدرّج", bestFor: "التقنية · المبيعات · المشاريع", photo: true, font: "Cairo", theme: T("#0F766E", "#F59E0B", "#0B3B37", "#FFFFFF", "#1A2B29"), roles: ["primary", "accent", "side", "text"], tier: "premium", badge: "جديد", inspiration: "ابتكار — إنفوجرافيك" },
];

export const templateById = (id: string) => CV_TEMPLATES.find((t) => t.id === id);

// ───────────────────────── أدوات مشتركة ─────────────────────────
const e = (v?: string) => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl = (v?: string) => e(v).replace(/\n/g, "<br>");

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Cairo:wght@400;600;700;800;900&family=Amiri:wght@400;700&family=Reem+Kufi:wght@500;600;700&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">`;
const BASE = `*{box-sizing:border-box}html,body{margin:0;padding:0}@page{size:A4;margin:0}body{width:794px;min-height:1123px;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1,h2,h3,p{margin:0}ul{margin:0}.ltr{direction:ltr;unicode-bidi:embed}.foot{font-size:10px;color:#9AA4AC}`;

function doc(body: string, css: string, font: string, bg = "#fff") {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=794">${FONTS}<style>${BASE}body{font-family:'${font}',Tahoma,Arial,sans-serif;background:${bg}}${css}</style></head><body>${body}</body></html>`;
}

type ContactKind = "phone" | "email" | "web" | "address";
type Contact = { v: string; ltr: boolean; k: ContactKind; label: string };
const normKey = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function clean(cv: CVData) {
  const contact: Contact[] = [];
  if (cv.phone?.trim()) contact.push({ v: cv.phone.trim(), ltr: true, k: "phone", label: "الهاتف" });
  if (cv.email?.trim()) contact.push({ v: cv.email.trim(), ltr: true, k: "email", label: "البريد" });
  if (cv.website?.trim()) contact.push({ v: cv.website.trim(), ltr: true, k: "web", label: "الموقع" });
  if (cv.address?.trim()) contact.push({ v: cv.address.trim(), ltr: false, k: "address", label: "العنوان" });
  const skills = cv.skills.map((s) => s.trim()).filter(Boolean);
  const langs = cv.languages.map((s) => s.trim()).filter(Boolean);
  const lvOf = (m: Record<string, number> | undefined, s: string) => {
    const v = Number(m?.[normKey(s)]);
    return v >= 1 && v <= 5 ? Math.round(v) : 4;
  };
  return {
    exp: cv.experience.filter((x) => x.position || x.company),
    edu: cv.education.filter((x) => x.degree || x.institution),
    skills, langs,
    skillLv: skills.map((s) => lvOf(cv.skillLevels, s)),
    langLv: langs.map((s) => lvOf(cv.langLevels, s)),
    courses: cv.courses.map((s) => s.trim()).filter(Boolean),
    contact,
    name: cv.name.trim() || "الاسم الكامل",
    title: cv.title.trim(),
    summary: (cv.summary || "").trim(),
  };
}
type D = ReturnType<typeof clean>;

/** يكسر الوصف إلى فقرة أولى ونقاط */
function descParts(desc?: string) {
  const ls = String(desc || "").split(/\n+/).map((l) => l.replace(/^[-•·*]\s*/, "").trim()).filter(Boolean);
  return { lead: ls[0] || "", rest: ls.slice(1) };
}

/** يقسم الاسم إلى سطرين متوازنين */
function twoLines(name: string) {
  // «عبد الله» و«أبو بكر» تبقى كلمة واحدة عند التقسيم
  const raw = name.split(/\s+/).filter(Boolean); const w: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (/^(عبد|عبدال|أبو|ابو|بن|بنت|ابن|ود)$/.test(raw[i]) && raw[i + 1]) { w.push(`${raw[i]} ${raw[i + 1]}`); i++; } else w.push(raw[i]);
  }
  if (w.length < 2) return [name, ""];
  const cut = Math.ceil(w.length / 2);
  return [w.slice(0, cut).join(" "), w.slice(cut).join(" ")];
}

const initials = (n: string, sep = ".") => n.replace(/^(د\.|أ\.|م\.)\s*/, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join(sep);
const PERSON = (fill: string, op = 0.9) => `<svg viewBox="0 0 24 24" width="56%" height="56%" fill="none" stroke="${fill}" stroke-width="1.6" stroke-linecap="round" opacity="${op}"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

const ICONS: Record<string, string> = {
  phone: `<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>`,
  email: `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>`,
  web: `<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>`,
  address: `<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>`,
  user: `<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>`,
  cap: `<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>`,
  brief: `<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>`,
  star: `<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
  lang: `<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>`,
  award: `<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>`,
  quote: `<path d="M3 21c3 0 7-1 7-8V5H3v7h4c0 4-1 6-4 6zM14 21c3 0 7-1 7-8V5h-7v7h4c0 4-1 6-4 6z"/>`,
};
function ic(name: string, color: string, size = 14, sw = 2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
}
const cic = (c: Contact, color: string, size = 14) => ic(c.k, color, size);
const ctxt = (c: Contact) => `<span class="${c.ltr ? "ltr" : ""}">${e(c.v)}</span>`;

/** سمة محلولة بألوان نص مضمونة التباين */
type RT = {
  p: string; a: string; s: string; bg: string; ink: string;
  onP: string; onA: string; onS: string;
  pT: string; aT: string; muted: string; line: string;
};
function resolve(th: CVTheme): RT {
  const bg = th.paper; const ink = th.text;
  return {
    p: th.primary, a: th.accent, s: th.side, bg, ink,
    onP: onColor(th.primary), onA: onColor(th.accent), onS: onColor(th.side),
    pT: ensure(th.primary, bg, 4.5), aT: ensure(th.accent, bg, 3.2),
    muted: ensure(mix(ink, bg, 0.3), bg, 4.6), line: mix(ink, bg, 0.85),
  };
}
/** مستوى 1..5 إلى نسبة مئوية */
const pct = (lv: number) => lv * 20;

// ══════════════════════ القوالب الأصلية ══════════════════════

// ── 1. النيل ───────────────────────────────────────────────
function nile(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const c = t.pT;
  const exp = d.exp.map((x, i) => `<div class="tl"><span class="dot ${i ? "o" : ""}"></span>${x.period ? `<span class="per">${e(x.period)}</span>` : ""}<h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("");
  const edu = d.edu.map((x) => `<div class="ed"><h3>${e(x.degree)}</h3><span>${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div>`).join("");
  const css = `.pg{padding:64px 68px;display:flex;flex-direction:column;gap:30px;color:${t.ink};min-height:1123px;background:${t.bg}}
  .hd{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding-bottom:24px;border-bottom:2px solid ${t.ink}}
  .hd h1{font-size:42px;font-weight:700;line-height:1.15}.hd .role{font-size:18px;font-weight:500;color:${c};margin-top:6px}
  .ct{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:${t.muted};text-align:left}
  .ph{width:96px;height:96px;border-radius:48px;object-fit:cover;border:3px solid ${t.p}}
  .sum{font-size:14.5px;line-height:1.9;color:${t.ink}}
  .grid{display:grid;grid-template-columns:2fr 1fr;gap:40px;flex:1}
  h2{font-size:13px;font-weight:700;color:${c};margin-bottom:14px}
  .tls{border-right:2px solid ${t.line};padding-right:22px;display:flex;flex-direction:column;gap:20px;margin-bottom:26px}
  .tl{position:relative}.dot{position:absolute;right:-29px;top:6px;width:12px;height:12px;border-radius:6px;background:${t.p}}.dot.o{background:${t.bg};border:2px solid ${t.p}}
  .per{font-size:12px;color:${t.muted};display:block;margin-bottom:2px}.tl h3,.ed h3{font-size:16px;font-weight:700}.tl p{font-size:13.5px;line-height:1.85;color:${t.ink};opacity:.88;margin-top:4px}
  .ed{margin-bottom:10px}.ed span{font-size:13px;color:${t.muted}}
  .side{display:flex;flex-direction:column;gap:26px}.li{font-size:13.5px;line-height:1.7;display:flex;gap:8px;align-items:baseline}.li:before{content:"";width:6px;height:6px;border-radius:3px;background:${t.p};flex-shrink:0;transform:translateY(-2px)}
  .ft{display:flex;justify-content:space-between;border-top:1px solid ${t.line};padding-top:12px}`;
  return doc(`<div class="pg">
    <div class="hd"><div style="display:flex;gap:18px;align-items:center">${photo ? `<img class="ph" src="${photo}">` : ""}<div><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}</div></div>
    <div class="ct">${d.contact.map(ctxt).join("")}</div></div>
    ${d.summary ? `<p class="sum">${nl(d.summary)}</p>` : ""}
    <div class="grid"><div>${d.exp.length ? `<h2>الخبرات العملية</h2><div class="tls">${exp}</div>` : ""}${d.edu.length ? `<h2>التعليم</h2>${edu}` : ""}</div>
    <div class="side">${d.skills.length ? `<div><h2>المهارات</h2>${d.skills.map((s) => `<div class="li">${e(s)}</div>`).join("")}</div>` : ""}
    ${d.langs.length ? `<div><h2>اللغات</h2>${d.langs.map((s) => `<div class="li">${e(s)}</div>`).join("")}</div>` : ""}
    ${d.courses.length ? `<div><h2>الدورات</h2>${d.courses.map((s) => `<div class="li">${e(s)}</div>`).join("")}</div>` : ""}</div></div>
    <div class="ft foot"><span>المراجع تُقدَّم عند الطلب</span><span>أُنشئت عبر حصاحيصاوي</span></div></div>`, css, "IBM Plex Sans Arabic", t.bg);
}

// ── 2. الشريط ──────────────────────────────────────────────
function band(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const c = t.pT; const sideBg = mix(t.bg, t.p, 0.07);
  const sec = (x: string) => `<h2 class="mh"><span></span>${x}</h2>`;
  const css = `.pg{display:flex;flex-direction:column;min-height:1123px;color:${t.ink};background:${t.bg}}
  .top{background:${t.p};color:${t.onP};padding:46px 56px 40px;display:flex;align-items:center;gap:28px}
  .av{width:124px;height:124px;border-radius:62px;background:${alpha(t.onP, 0.18)};border:4px solid ${alpha(t.onP, 0.85)};display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}.av img{width:100%;height:100%;object-fit:cover}
  .top h1{font-size:40px;font-weight:800;line-height:1.2}.top .role{font-size:18px;font-weight:600;opacity:.92}.top .ct{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;opacity:.92}
  .cols{display:flex;flex:1}.sd{width:250px;background:${sideBg};padding:34px 28px;display:flex;flex-direction:column;gap:26px}
  .sd h2{font-size:15px;font-weight:800;color:${ensure(t.p, sideBg, 4.5)};margin-bottom:10px}.sd p{font-size:13px;line-height:1.9}
  .chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:12px;background:${t.bg};border:1px solid ${t.line};border-radius:8px;padding:3px 9px}
  .mn{flex:1;padding:34px 44px;display:flex;flex-direction:column;gap:20px}
  .mh{font-size:19px;font-weight:800;display:flex;align-items:center;gap:10px}.mh span{width:26px;height:4px;border-radius:2px;background:${t.p}}
  .it .r{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.it h3{font-size:16px;font-weight:700}.it .d{font-size:12px;color:${t.muted};white-space:nowrap}.it .co{font-size:13.5px;font-weight:600;color:${c}}.it p{font-size:13.5px;line-height:1.85;margin-top:4px;opacity:.88}
  .sm{font-size:13px;line-height:1.8}`;
  const avatar = cv.showPhoto ? `<div class="av">${photo ? `<img src="${photo}">` : PERSON(t.onP)}</div>` : "";
  return doc(`<div class="pg"><div class="top">${avatar}<div><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}<div class="ct">${d.contact.map(ctxt).join("")}</div></div></div>
  <div class="cols"><div class="sd">${d.summary ? `<div><h2>نبذة</h2><p>${nl(d.summary)}</p></div>` : ""}
  ${d.skills.length ? `<div><h2>المهارات</h2><div class="chips">${d.skills.map((s) => `<span class="chip">${e(s)}</span>`).join("")}</div></div>` : ""}
  ${d.langs.length ? `<div><h2>اللغات</h2><div class="sm">${d.langs.map(e).join(" · ")}</div></div>` : ""}
  ${d.courses.length ? `<div><h2>الدورات</h2>${d.courses.map((s) => `<div class="sm">${e(s)}</div>`).join("")}</div>` : ""}</div>
  <div class="mn">${d.exp.length ? sec("الخبرات") + d.exp.map((x) => `<div class="it"><div class="r"><h3>${e(x.position)}</h3>${x.period ? `<span class="d">${e(x.period)}</span>` : ""}</div>${x.company ? `<div class="co">${e(x.company)}</div>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("") : ""}
  ${d.edu.length ? sec("التعليم") + d.edu.map((x) => `<div class="it"><div class="r"><h3>${e(x.degree)}</h3>${x.year ? `<span class="d">${e(x.year)}</span>` : ""}</div><div class="sm">${e(x.institution)}</div></div>`).join("") : ""}</div></div></div>`, css, "Cairo", t.bg);
}

// ── 3. المحرّر ─────────────────────────────────────────────
function editorial(cv: CVData, t: RT) {
  const d = clean(cv); const c = t.pT;
  const row = (label: string, content: string) => `<h2>${label}</h2><div class="cell">${content}</div><div class="hr"></div>`;
  const css = `.pg{background:${t.bg};padding:58px 76px;min-height:1123px;display:flex;flex-direction:column;gap:22px;color:${t.ink};font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif}
  .kick{font-size:12px;color:${c};font-weight:600}
  h1{font-family:'Amiri',serif;font-size:62px;font-weight:700;line-height:1.1}.role{font-family:'Amiri',serif;font-size:22px;color:${t.muted}}
  .ct{display:flex;gap:26px;flex-wrap:wrap;font-size:12.5px;color:${t.muted};border-top:1px solid ${t.ink};border-bottom:1px solid ${t.ink};padding:12px 0}
  .q{font-family:'Amiri',serif;font-size:21px;line-height:1.75}
  .g{display:grid;grid-template-columns:1fr 3fr;gap:18px 30px}.g h2{font-size:12px;color:${c};font-weight:600;padding-top:6px}
  .hr{grid-column:1/-1;height:1px;background:${t.line}}.cell{display:flex;flex-direction:column;gap:16px}
  .cell h3{font-family:'Amiri',serif;font-size:22px;font-weight:700}.cell .m{font-size:12.5px;color:${t.muted}}.cell p{font-size:13.5px;line-height:1.85;margin-top:4px;opacity:.9}
  .flow{font-size:14px;line-height:2}.mono{font-family:'Amiri',serif;font-size:26px;color:${c}}`;
  const body = [
    d.exp.length && row("الخبرة", d.exp.map((x) => `<div><h3>${e(x.position)}</h3><span class="m">${e(x.company)}${x.period ? ` · ${e(x.period)}` : ""}</span>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")),
    d.edu.length && row("التعليم", d.edu.map((x) => `<div><h3>${e(x.degree)}</h3><span class="m">${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div>`).join("")),
    d.skills.length && row("المهارات", `<p class="flow">${d.skills.map(e).join(" · ")}</p>`),
    d.langs.length && row("اللغات", `<p class="flow">${d.langs.map(e).join(" · ")}</p>`),
    d.courses.length && row("الدورات", `<p class="flow">${d.courses.map(e).join("<br>")}</p>`),
  ].filter(Boolean).join("");
  return doc(`<div class="pg"><div style="display:flex;flex-direction:column;gap:8px"><span class="kick">السيرة الذاتية</span><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}</div>
  <div class="ct">${d.contact.map(ctxt).join("")}</div>
  ${d.summary ? `<p class="q">«${nl(d.summary)}»</p>` : ""}<div class="g">${body}</div><div style="flex:1"></div>
  <div style="display:flex;justify-content:space-between;align-items:center"><span class="mono">${e(initials(d.name))}</span><span class="foot">المراجع تُقدَّم عند الطلب · حصاحيصاوي</span></div></div>`, css, "IBM Plex Sans Arabic", t.bg);
}

// ── 4. البطاقات ────────────────────────────────────────────
function cards(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const c = t.pT; const pg = mix(t.bg, t.a, 0.16); const soft = mix(t.bg, t.p, 0.1);
  const box = (n: string) => `<div class="ic">${ic(n, ensure(t.p, soft, 3), 20)}</div>`;
  const statBg = mix(t.bg, t.a, 0.35);
  const css = `.pg{background:${pg};padding:48px 50px;min-height:1123px;display:flex;flex-direction:column;gap:18px;color:${t.ink}}
  .card{background:${t.bg};border-radius:22px;padding:24px 28px}.card h2{font-size:15px;font-weight:800;margin-bottom:10px}
  .hd{display:flex;align-items:center;gap:22px}.av{width:96px;height:96px;border-radius:26px;background:${t.p};color:${t.onP};display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;flex-shrink:0;overflow:hidden}.av img{width:100%;height:100%;object-fit:cover}
  .hd h1{font-size:32px;font-weight:800;line-height:1.25}.hd .role{font-size:16px;font-weight:600;color:${c}}
  .pills{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.pill{font-size:12px;background:${pg};border-radius:20px;padding:4px 12px}
  .stat{display:flex;flex-direction:column;align-items:center;background:${statBg};border-radius:16px;padding:12px 16px;color:${onColor(statBg)}}.stat b{font-size:30px;line-height:1.1}.stat span{font-size:11.5px;font-weight:600}
  .about{font-size:13.5px;line-height:1.9}
  .grid{display:grid;grid-template-columns:3fr 2fr;gap:18px;flex:1}.col{display:flex;flex-direction:column;gap:18px}
  .row{display:flex;gap:14px;margin-bottom:16px}.ic{width:40px;height:40px;border-radius:12px;background:${soft};display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .row h3{font-size:15px;font-weight:700}.row .m{font-size:12px;color:${t.muted}}.row p{font-size:13px;line-height:1.8;margin-top:4px;opacity:.88}
  .tags{display:flex;flex-wrap:wrap;gap:7px}.tag{font-size:12.5px;font-weight:600;border-radius:10px;padding:5px 11px;background:${soft};color:${ensure(t.p, soft, 4.5)}}.tag.on{background:${t.p};color:${t.onP}}
  .ln{font-size:13px;line-height:1.8}`;
  const avatar = cv.showPhoto && photo ? `<img src="${photo}">` : e(initials(d.name));
  return doc(`<div class="pg"><div class="card hd"><div class="av">${avatar}</div><div style="flex:1"><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}
  <div class="pills">${d.contact.map((x) => `<span class="pill ${x.ltr ? "ltr" : ""}">${e(x.v)}</span>`).join("")}</div></div>
  ${d.exp.length ? `<div class="stat"><b>${d.exp.length}</b><span>${d.exp.length > 2 ? "خبرات" : d.exp.length === 2 ? "خبرتان" : "خبرة"}</span></div>` : ""}</div>
  ${d.summary ? `<div class="card"><h2>عنّي</h2><p class="about">${nl(d.summary)}</p></div>` : ""}
  <div class="grid"><div class="card">${d.exp.length || d.edu.length ? `<h2>الخبرات والتعليم</h2>` : ""}
  ${d.exp.map((x) => `<div class="row">${box("brief")}<div><h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.period ? `<span class="m">${e(x.period)}</span>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div></div>`).join("")}
  ${d.edu.map((x) => `<div class="row">${box("cap")}<div><h3>${e(x.degree)}</h3><span class="m">${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div></div>`).join("")}</div>
  <div class="col">${d.skills.length ? `<div class="card"><h2>المهارات</h2><div class="tags">${d.skills.map((s, i) => `<span class="tag ${d.skillLv[i] >= 5 ? "on" : ""}">${e(s)}</span>`).join("")}</div></div>` : ""}
  ${d.courses.length ? `<div class="card"><h2>الشهادات والدورات</h2>${d.courses.map((s) => `<div class="ln">${e(s)}</div>`).join("")}</div>` : ""}
  ${d.langs.length ? `<div class="card" style="background:${t.p};color:${t.onP}"><h2>اللغات</h2><div class="ln">${d.langs.map(e).join(" · ")}</div></div>` : ""}</div></div></div>`, css, "Cairo", pg);
}

// ── 5. ATS ─────────────────────────────────────────────────
function ats(cv: CVData, t: RT) {
  const d = clean(cv); const c = t.pT;
  const css = `.pg{padding:60px 70px;color:${t.ink};display:flex;flex-direction:column;gap:18px;background:${t.bg};min-height:1123px}
  .hd{text-align:center}.hd h1{font-size:32px;font-weight:700}.hd .role{font-size:15px;font-weight:500}.hd .ct{font-size:12.5px;color:${t.muted};margin-top:6px}
  h2{font-size:14px;font-weight:700;border-bottom:1.5px solid ${c};color:${c};padding-bottom:4px;margin-bottom:8px}
  .r{display:flex;justify-content:space-between;gap:12px}.r h3{font-size:14.5px;font-weight:700}.r span{font-size:12.5px;color:${t.muted};white-space:nowrap}
  p,li{font-size:13.5px;line-height:1.85}ul{margin:2px 0 10px;padding-right:18px}.blk{margin-bottom:10px}`;
  return doc(`<div class="pg"><div class="hd"><h1>${e(d.name)}</h1>${d.title ? `<p class="role">${e(d.title)}</p>` : ""}<p class="ct">${d.contact.map(ctxt).join(" · ")}</p></div>
  ${d.summary ? `<div><h2>الملخص المهني</h2><p>${nl(d.summary)}</p></div>` : ""}
  ${d.exp.length ? `<div><h2>الخبرة العملية</h2>${d.exp.map((x) => `<div class="blk"><div class="r"><h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.period ? `<span>${e(x.period)}</span>` : ""}</div>${x.desc ? `<ul>${x.desc.split(/\n+/).filter(Boolean).map((l) => `<li>${e(l.replace(/^[-•·]\s*/, ""))}</li>`).join("")}</ul>` : ""}</div>`).join("")}</div>` : ""}
  ${d.edu.length ? `<div><h2>التعليم</h2>${d.edu.map((x) => `<div class="blk r"><h3>${e(x.degree)}${x.institution ? ` — ${e(x.institution)}` : ""}</h3>${x.year ? `<span>${e(x.year)}</span>` : ""}</div>`).join("")}</div>` : ""}
  ${d.skills.length ? `<div><h2>المهارات</h2><p>${d.skills.map(e).join("، ")}</p></div>` : ""}
  ${d.langs.length ? `<div><h2>اللغات</h2><p>${d.langs.map(e).join("، ")}</p></div>` : ""}
  ${d.courses.length ? `<div><h2>الشهادات والدورات</h2><p>${d.courses.map(e).join("<br>")}</p></div>` : ""}</div>`, css, "IBM Plex Sans Arabic", t.bg);
}

// ── 6. الجريء ──────────────────────────────────────────────
function bold(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const gold = t.a; const goldOnS = ensure(t.a, t.s, 4.5);
  const css = `.pg{display:flex;min-height:1123px;color:${t.ink};background:${t.bg}}
  .sd{width:280px;background:${t.s};color:${t.onS};padding:48px 30px;display:flex;flex-direction:column;gap:28px}
  .av{width:150px;height:150px;border-radius:75px;background:${alpha(t.onS, 0.08)};border:5px solid ${gold};display:flex;align-items:center;justify-content:center;align-self:center;overflow:hidden}.av img{width:100%;height:100%;object-fit:cover}
  .sd h2{font-size:14px;font-weight:800;color:${goldOnS};margin-bottom:10px}.sd .l{font-size:13px;line-height:1.9}
  .tg{display:flex;flex-wrap:wrap;gap:6px}.tg span{font-size:12px;border:1px solid ${alpha(t.onS, 0.35)};border-radius:8px;padding:3px 9px}
  .mn{flex:1;padding:56px 46px;display:flex;flex-direction:column;gap:24px}
  .mn h1{font-size:48px;font-weight:900;line-height:1.1;color:${t.pT}}.role{display:inline-block;background:${gold};color:${t.onA};font-size:15px;font-weight:800;padding:4px 14px;border-radius:8px;margin-top:10px}
  .sum{font-size:14px;line-height:1.9}.mn h2{font-size:20px;font-weight:900;color:${t.pT};margin-bottom:12px}
  .it{border-right:4px solid ${t.line};padding-right:14px;margin-bottom:14px}.it.f{border-color:${gold}}.it h3{font-size:16px;font-weight:800}.it .m{font-size:12.5px;color:${t.muted}}.it p{font-size:13.5px;line-height:1.85;margin-top:4px;opacity:.88}`;
  return doc(`<div class="pg"><div class="sd">${cv.showPhoto ? `<div class="av">${photo ? `<img src="${photo}">` : PERSON(t.onS)}</div>` : ""}
  ${d.contact.length ? `<div><h2>التواصل</h2>${d.contact.map((x) => `<div class="l ${x.ltr ? "ltr" : ""}" style="text-align:right">${e(x.v)}</div>`).join("")}</div>` : ""}
  ${d.skills.length ? `<div><h2>المهارات</h2><div class="tg">${d.skills.map((s) => `<span>${e(s)}</span>`).join("")}</div></div>` : ""}
  ${d.langs.length ? `<div><h2>اللغات</h2><div class="l">${d.langs.map(e).join(" · ")}</div></div>` : ""}
  ${d.courses.length ? `<div><h2>الدورات</h2>${d.courses.map((s) => `<div class="l">${e(s)}</div>`).join("")}</div>` : ""}</div>
  <div class="mn"><div><h1>${e(d.name)}</h1>${d.title ? `<span class="role">${e(d.title)}</span>` : ""}</div>${d.summary ? `<p class="sum">${nl(d.summary)}</p>` : ""}
  ${d.exp.length ? `<div><h2>الخبرات</h2>${d.exp.map((x, i) => `<div class="it ${i ? "" : "f"}"><h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.period ? `<span class="m">${e(x.period)}</span>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div>` : ""}
  ${d.edu.length ? `<div><h2>التعليم</h2>${d.edu.map((x) => `<div class="it"><h3>${e(x.degree)}</h3><span class="m">${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div>`).join("")}</div>` : ""}</div></div>`, css, "Cairo", t.bg);
}

// ── 7. السداسي (مطوّر وفق المرجع: إطار سداسي + لوحة اسم + وسوم سهمية + حلقات لغات) ──
function hexa(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const S = t.s; const on = t.onS; const navyT = ensure(S, t.bg, 4.5);
  const HEX = "polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%)";
  const css = `.pg{position:relative;min-height:1123px;background:${t.bg};color:${t.ink};display:flex}
  .sd{width:268px;flex-shrink:0;background:${S};color:${on};padding:262px 30px 40px;display:flex;flex-direction:column;gap:26px;position:relative}
  .topband{position:absolute;top:0;left:0;right:0;height:64px;background:${S}}
  .plate{position:absolute;top:64px;left:0;right:268px;height:150px;background:${t.bg};border-top-right-radius:46px}
  .hx{position:absolute;top:44px;right:30px;width:236px;height:206px;z-index:3}
  .hx .o{position:absolute;inset:0;clip-path:${HEX};background:${t.bg}}
  .hx .m{position:absolute;inset:9px;clip-path:${HEX};background:${S}}
  .hx .i{position:absolute;inset:17px;clip-path:${HEX};background:${mix(S, on, 0.15)};overflow:hidden;display:flex;align-items:center;justify-content:center}.hx .i img{width:100%;height:100%;object-fit:cover}
  .conn{position:absolute;top:139px;right:250px;width:46px;height:14px;background:${t.bg};z-index:2}
  .np{position:absolute;top:118px;right:288px;left:0;z-index:2}
  .np .nm{background:${S};color:${on};padding:8px 26px 10px 30px;font-size:30px;font-weight:800;line-height:1.25}
  .np .rl{display:flex;align-items:center;gap:14px;padding:8px 26px 0 30px;font-size:16px;font-weight:600;color:${t.ink}}.np .rl i{flex:1;height:2px;background:${S}}
  .sd h2{font-size:22px;font-weight:700;padding-bottom:6px;border-bottom:2px solid ${alpha(on, 0.8)};display:inline-block;margin-bottom:12px}
  .ci{display:flex;align-items:center;gap:12px;margin:10px 0;font-size:13px;font-weight:600}.ci b{width:30px;height:30px;border-radius:15px;background:${on};display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .sk{margin:10px 0}.sk span{display:block;text-align:center;font-size:12px;font-weight:600;margin-bottom:4px}.bar{height:9px;border:1.5px solid ${on};border-radius:5px;padding:1.5px}.bar b{display:block;height:100%;border-radius:3px;background:${on}}
  .rings{display:flex;gap:14px;flex-wrap:wrap}.rg{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;font-weight:600}
  .ring{width:58px;height:58px;border-radius:29px;background:conic-gradient(${on} var(--p),${alpha(on, 0.22)} 0);display:flex;align-items:center;justify-content:center}.ring span{width:46px;height:46px;border-radius:23px;background:${S};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
  .mn{flex:1;min-width:0;padding:236px 40px 40px 44px;display:flex;flex-direction:column;gap:20px}
  .tg{display:flex;align-items:center;margin-bottom:12px}.tg b{background:${S};color:${on};font-size:15px;font-weight:700;padding:5px 22px 5px 30px;clip-path:polygon(100% 0,14px 0,0 50%,14px 100%,100% 100%);margin-right:-44px;padding-right:44px}
  .tg i{flex:1;height:2px;background:${S};position:relative}.tg i:after{content:"";position:absolute;left:-4px;top:-4px;width:10px;height:10px;border-radius:5px;background:${S}}
  .sum{font-size:13px;line-height:1.85;padding:0 6px}
  .tl{position:relative;display:grid;grid-template-columns:62px 1fr;gap:0 22px;padding-bottom:14px}
  .tl:before{content:"";position:absolute;right:73px;top:4px;bottom:-4px;width:1.5px;background:${t.line}}
  .tl .y{font-size:11.5px;color:${t.muted};text-align:center;line-height:1.5;padding-top:2px}
  .tl .c{position:relative}.tl .c:before{content:"";position:absolute;right:-15px;top:7px;width:10px;height:10px;border-radius:5px;background:${S}}
  .tl h3{font-size:14px;font-weight:800;color:${navyT}}.tl .co{font-size:12px;font-weight:600;color:${t.muted}}.tl p{font-size:12px;line-height:1.75;margin-top:3px;opacity:.85}`;
  const per = (s: string) => e(s).replace(/\s*[—–-]\s*/, "<br>");
  return doc(`<div class="pg"><div class="topband"></div><div class="plate"></div>
  ${cv.showPhoto ? `<div class="hx"><div class="o"></div><div class="m"></div><div class="i">${photo ? `<img src="${photo}">` : PERSON(on)}</div></div><div class="conn"></div>` : ""}
  <div class="np" style="${cv.showPhoto ? "" : "right:30px"}"><div class="nm">${e(d.name)}</div>${d.title ? `<div class="rl"><span>${e(d.title)}</span><i></i></div>` : ""}</div>
  <div class="sd" style="${cv.showPhoto ? "" : "padding-top:240px"}">
    ${d.contact.length ? `<div><h2>التواصل</h2>${d.contact.map((x) => `<div class="ci"><b>${cic(x, S, 15)}</b>${ctxt(x)}</div>`).join("")}</div>` : ""}
    ${d.skills.length ? `<div><h2>المهارات</h2>${d.skills.map((s, i) => `<div class="sk"><span>${e(s)}</span><div class="bar"><b style="width:${pct(d.skillLv[i])}%"></b></div></div>`).join("")}</div>` : ""}
    ${d.langs.length ? `<div><h2>اللغات</h2><div class="rings">${d.langs.map((l, i) => `<div class="rg"><div class="ring" style="--p:${pct(d.langLv[i])}%"><span class="ltr">${pct(d.langLv[i])}%</span></div>${e(l)}</div>`).join("")}</div></div>` : ""}
  </div>
  <div class="mn">
    ${d.summary ? `<div><div class="tg"><b>نبذة</b><i></i></div><p class="sum">${nl(d.summary)}</p></div>` : ""}
    ${d.exp.length ? `<div><div class="tg"><b>الخبرات</b><i></i></div>${d.exp.map((x) => `<div class="tl"><div class="y">${per(x.period)}</div><div class="c"><h3>${e(x.position)}</h3>${x.company ? `<div class="co">${e(x.company)}</div>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div></div>`).join("")}</div>` : ""}
    ${d.edu.length ? `<div><div class="tg"><b>التعليم</b><i></i></div>${d.edu.map((x) => `<div class="tl"><div class="y">${e(x.year)}</div><div class="c"><h3>${e(x.degree)}</h3><div class="co">${e(x.institution)}</div></div></div>`).join("")}</div>` : ""}
    ${d.courses.length ? `<div><div class="tg"><b>الدورات</b><i></i></div>${d.courses.map((s) => `<div class="tl"><div class="y"></div><div class="c"><h3 style="font-weight:600">${e(s)}</h3></div></div>`).join("")}</div>` : ""}
  </div></div>`, css, "Cairo", t.bg);
}

// ── 8. القطري ─────────────────────────────────────────────
function diagonal(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const grey = t.a; const onG = onColor(grey);
  const star = (n: number) => Array.from({ length: 5 }, (_, i) => `<span style="color:${i < n ? onG : alpha(onG, 0.28)}">★</span>`).join("");
  const css = `.pg{position:relative;min-height:1123px;background:${t.bg};color:${t.ink};overflow:hidden}
  .dk{position:absolute;top:0;right:0;left:0;height:420px;background:${t.s};clip-path:polygon(0 0,100% 0,100% 100%,0 26%)}
  .gr{position:absolute;top:300px;right:0;width:340px;bottom:0;background:${grey};clip-path:polygon(0 18%,100% 0,100% 100%,0 100%)}
  .ph{position:absolute;top:44px;right:52px;width:230px;height:230px;border-radius:50%;border:7px solid ${t.bg};overflow:hidden;background:${alpha(t.onS, 0.12)};display:flex;align-items:center;justify-content:center;z-index:3}.ph img{width:100%;height:100%;object-fit:cover}
  .hd{position:absolute;top:56px;left:56px;right:330px;color:${t.onS};z-index:3}.hd h1{font-size:46px;font-weight:800;line-height:1.12}.hd p{font-size:17px;margin-top:8px;opacity:.9;font-weight:600}
  .sd{position:absolute;top:400px;right:0;width:340px;padding:0 44px 40px 34px;color:${onG};display:flex;flex-direction:column;gap:24px;z-index:3}
  .sd h2{font-size:15px;font-weight:800;padding-bottom:6px;border-bottom:1.5px solid ${alpha(onG, 0.75)};margin-bottom:10px}.sd p,.sd li{font-size:12.5px;line-height:1.85}.sd ul{margin:0;padding-right:16px}
  .st{display:flex;justify-content:space-between;font-size:12.5px;margin:5px 0}.st b{font-weight:400;letter-spacing:1px}
  .mn{position:absolute;top:300px;right:380px;left:52px;display:flex;flex-direction:column;gap:22px;z-index:3}
  .mn h2{font-size:16px;font-weight:800;padding-bottom:6px;border-bottom:1.5px solid ${t.ink};margin-bottom:10px;width:80%}
  .it{margin-bottom:12px}.it h3{font-size:14px;font-weight:800}.it .y{font-size:13px;font-weight:800;color:${t.muted}}.it p{font-size:12.5px;line-height:1.8;opacity:.85;text-align:justify}
  .sk{margin:6px 0}.sk span{font-size:12.5px}.bar{height:9px;background:${mix(grey, t.bg, 0.55)};width:85%;margin-top:4px}.bar b{display:block;height:100%;background:${t.s}}
  .ci{display:flex;gap:10px;align-items:center;font-size:12.5px;margin:6px 0}.ci i{width:22px;height:22px;border-radius:11px;background:${t.s};flex-shrink:0;display:flex;align-items:center;justify-content:center}`;
  return doc(`<div class="pg"><div class="dk"></div><div class="gr"></div>
  ${cv.showPhoto ? `<div class="ph">${photo ? `<img src="${photo}">` : PERSON(t.onS)}</div>` : ""}
  <div class="hd" style="${cv.showPhoto ? "" : "right:56px"}"><h1>${e(d.name)}</h1>${d.title ? `<p>${e(d.title)}</p>` : ""}</div>
  <div class="sd">
    ${d.summary ? `<div><h2>نبذة عني</h2><p>${nl(d.summary)}</p></div>` : ""}
    ${d.edu.length ? `<div><h2>التعليم</h2><ul>${d.edu.map((x) => `<li>${e(x.institution || x.degree)}<br>${e(x.degree)}${x.year ? ` (${e(x.year)})` : ""}</li>`).join("")}</ul></div>` : ""}
    ${d.langs.length ? `<div><h2>اللغات</h2>${d.langs.map((l, i) => `<div class="st"><span>${e(l)}</span><b>${star(d.langLv[i])}</b></div>`).join("")}</div>` : ""}
    ${d.courses.length ? `<div><h2>الدورات</h2><ul>${d.courses.map((s) => `<li>${e(s)}</li>`).join("")}</ul></div>` : ""}
  </div>
  <div class="mn">
    ${d.exp.length ? `<div><h2>الخبرات العملية</h2>${d.exp.map((x) => `<div class="it"><h3>${e(x.position)}</h3><div class="y">${[x.period, x.company].filter(Boolean).map(e).join(" — ")}</div>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div>` : ""}
    ${d.skills.length ? `<div><h2>المهارات</h2>${d.skills.map((s, i) => `<div class="sk"><span>${e(s)}</span><div class="bar"><b style="width:${pct(d.skillLv[i])}%"></b></div></div>`).join("")}</div>` : ""}
    ${d.contact.length ? `<div><h2>التواصل</h2>${d.contact.map((x) => `<div class="ci"><i>${cic(x, t.onS, 12)}</i>${ctxt(x)}</div>`).join("")}</div>` : ""}
  </div></div>`, css, "Cairo", t.bg);
}

// ── 9. اللمسة الذهبية ─────────────────────────────────────
function accent(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const ink = t.s; const c = t.a; const onI = t.onS; const cOnI = ensure(c, ink, 4.5);
  const css = `.pg{display:flex;min-height:1123px;background:${t.bg};color:${t.ink}}
  .sd{width:290px;background:${ink};color:${onI};margin:40px 40px 40px 0;display:flex;flex-direction:column}
  .ph{height:300px;background:${mix(ink, onI, 0.08)};border-radius:0 0 90px 0;overflow:hidden;display:flex;align-items:center;justify-content:center}.ph img{width:100%;height:100%;object-fit:cover}
  .sb{padding:26px 26px 30px;display:flex;flex-direction:column;gap:22px;flex:1;border-radius:0 70px 0 0;background:${ink};margin-top:-30px;position:relative}
  .yt{display:inline-block;background:${c};color:${t.onA};font-size:12.5px;font-weight:900;padding:3px 14px;border-radius:0 10px 10px 0}
  .sb h3{font-size:13.5px;font-weight:800;margin-top:10px}.sb p{font-size:11.5px;line-height:1.7;opacity:.82}
  .cr{border-right:5px solid ${c};padding:4px 10px;margin:6px 0;background:linear-gradient(90deg,transparent,${alpha(onI, 0.06)})}.cr b{display:block;font-size:12px;color:${cOnI}}.cr span{font-size:11.5px}
  .mn{flex:1;padding:70px 44px 40px 30px;display:flex;flex-direction:column;gap:22px}
  .acc{width:40px;height:110px;background:${c};border-radius:0 0 20px 20px;position:absolute;top:0;left:30px}
  .mn h1{font-size:44px;font-weight:900;line-height:1.05}.mn .rl{font-size:16px;color:${t.muted};margin-top:6px;font-weight:600}
  .mn .yt{border-radius:10px}.sum{font-size:13px;line-height:1.85;color:${t.muted};margin-top:8px}
  .ex{display:grid;grid-template-columns:96px 1fr;gap:6px 16px;margin-top:10px}.ex .y{font-size:12px;font-weight:700;color:${t.muted}}.ex h3{font-size:13.5px;font-weight:800}.ex .co{font-size:12px;font-weight:600;color:${t.muted}}.ex p{font-size:12px;line-height:1.75;color:${t.muted}}
  .sg{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px;margin-top:10px}.sg span{font-size:12px}.ln{height:3px;background:${t.line};margin-top:4px}.ln b{display:block;height:100%;background:${c}}`;
  return doc(`<div class="pg"><div class="sd">
    ${cv.showPhoto ? `<div class="ph">${photo ? `<img src="${photo}">` : PERSON(alpha(onI, 0.6))}</div>` : `<div style="height:40px"></div>`}
    <div class="sb">
      ${d.edu.length ? `<div><span class="yt">التعليم</span>${d.edu.map((x) => `<h3>${e(x.degree)}</h3><p>${e(x.institution)}${x.year ? `<br>${e(x.year)}` : ""}</p>`).join("")}</div>` : ""}
      ${d.langs.length ? `<div><span class="yt">اللغات</span><p style="margin-top:8px">${d.langs.map(e).join(" · ")}</p></div>` : ""}
      ${d.courses.length ? `<div><span class="yt">الدورات</span>${d.courses.map((s) => `<p style="margin-top:6px">${e(s)}</p>`).join("")}</div>` : ""}
      <div style="margin-top:auto">${d.contact.map((x) => `<div class="cr"><b>${x.label}</b>${ctxt(x)}</div>`).join("")}</div>
    </div></div>
  <div class="mn" style="position:relative"><div class="acc"></div>
    <div style="padding-top:20px"><h1>${e(d.name)}</h1>${d.title ? `<div class="rl">${e(d.title)}</div>` : ""}</div>
    ${d.summary ? `<div><span class="yt">نبذة عني</span><p class="sum">${nl(d.summary)}</p></div>` : ""}
    ${d.exp.length ? `<div><span class="yt">الخبرات العملية</span><div class="ex">${d.exp.map((x) => `<div class="y">${e(x.period)}</div><div><h3>${e(x.position)}</h3>${x.company ? `<div class="co">${e(x.company)}</div>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div></div>` : ""}
    ${d.skills.length ? `<div><span class="yt">المهارات</span><div class="sg">${d.skills.map((s, i) => `<div><span>${e(s)}</span><div class="ln"><b style="width:${pct(d.skillLv[i])}%"></b></div></div>`).join("")}</div></div>` : ""}
  </div></div>`, css, "Cairo", t.bg);
}

// ── 10. القوس ─────────────────────────────────────────────
function arch(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const c = t.p; const dk = mix(c, "#000000", 0.25); const onC = onColor(c); const onDk = onColor(dk);
  const css = `.pg{position:relative;min-height:1123px;background:${t.bg};color:${t.ink};display:flex;padding:54px 46px 40px 40px;gap:0}
  .col{width:280px;background:${c};border-radius:140px 140px 0 0;padding:28px 0 30px;display:flex;flex-direction:column;gap:22px;flex-shrink:0;position:relative}
  .av{width:170px;height:170px;border-radius:85px;background:${t.bg};align-self:center;overflow:hidden;display:flex;align-items:center;justify-content:center;border:6px solid ${t.bg}}.av img{width:100%;height:100%;object-fit:cover}
  .rb{position:relative;background:${dk};color:${onDk};font-size:16px;font-weight:800;text-align:center;padding:9px 0;margin:0 -18px 0 -18px}
  .rbw{position:relative}.rbw:after{content:"";position:absolute;left:-18px;bottom:-14px;border-top:14px solid ${mix(dk, "#000000", 0.4)};border-left:18px solid transparent}
  .cb{padding:0 26px;color:${onC};font-size:12px;line-height:1.85}.cb ul{margin:0;padding-right:16px}
  .mn{flex:1;padding-right:0;display:flex;flex-direction:column;gap:20px}
  .hd{padding:30px 34px 10px}.hd h1{font-size:40px;font-weight:900;line-height:1.15}.hd p{font-size:18px;margin-top:4px}
  .mr{background:${dk};color:${onDk};font-size:18px;font-weight:800;padding:10px 30px;margin-right:-18px;text-align:center}
  .tl{position:relative;padding:4px 34px 4px 30px;border-right:2px solid ${t.ink};margin:10px 46px 6px 30px}.tl:before{content:"";position:absolute;right:-7px;top:6px;width:12px;height:12px;border-radius:6px;background:${t.ink}}
  .tl h3{font-size:14px;font-weight:800}.tl .m{font-size:12.5px;color:${t.muted};margin:2px 0}.tl p{font-size:12px;line-height:1.75;opacity:.85}`;
  return doc(`<div class="pg"><div class="col">
    ${cv.showPhoto ? `<div class="av">${photo ? `<img src="${photo}">` : PERSON(c)}</div>` : `<div style="height:60px"></div>`}
    ${d.summary ? `<div class="rbw"><div class="rb">نبذة عني</div></div><div class="cb">${nl(d.summary)}</div>` : ""}
    ${d.skills.length ? `<div class="rbw"><div class="rb">المهارات</div></div><div class="cb"><ul>${d.skills.map((s) => `<li>${e(s)}</li>`).join("")}</ul></div>` : ""}
    ${d.langs.length ? `<div class="rbw"><div class="rb">اللغات</div></div><div class="cb">${d.langs.map(e).join(" · ")}</div>` : ""}
    ${d.contact.length ? `<div class="rbw"><div class="rb">التواصل</div></div><div class="cb">${d.contact.map((x) => `<div class="${x.ltr ? "ltr" : ""}" style="text-align:right">${e(x.v)}</div>`).join("")}</div>` : ""}
  </div>
  <div class="mn"><div class="hd"><h1>${e(d.name)}</h1>${d.title ? `<p>${e(d.title)}</p>` : ""}</div>
    ${d.edu.length ? `<div><div class="mr">التعليم</div>${d.edu.map((x) => `<div class="tl"><h3>${e(x.degree)}</h3><div class="m">${e(x.institution)}${x.year ? ` | ${e(x.year)}` : ""}</div></div>`).join("")}</div>` : ""}
    ${d.exp.length ? `<div><div class="mr">الخبرات العملية</div>${d.exp.map((x) => `<div class="tl"><h3>${e(x.position)}</h3><div class="m">${[x.company, x.period].filter(Boolean).map(e).join(" | ")}</div>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div>` : ""}
    ${d.courses.length ? `<div><div class="mr">الدورات والشهادات</div>${d.courses.map((s) => `<div class="tl"><h3>${e(s)}</h3></div>`).join("")}</div>` : ""}
  </div></div>`, css, "Cairo", t.bg);
}

// ══════════════════════ القوالب الجديدة ══════════════════════

// ── 11. الخردلي (مرجع 13): عمود فحمي + أشرطة خردلية + اسم نسخ كبير + خبرات بعمودين ──
function mustard(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const S = t.s; const A = t.a; const onS = t.onS; const onA = t.onA;
  const bandSide = mix(A, S, 0.3); const onBS = onColor(bandSide);
  const aOnS = ensure(A, S, 4.5); const eduBg = mix(S, onS, 0.06);
  const [n1, n2] = twoLines(d.name);
  const css = `.pg{min-height:1123px;display:flex;flex-direction:column;background:${t.bg};color:${t.ink}}
  .row{display:flex}.sd{width:262px;flex-shrink:0}.mn{flex:1;min-width:0}
  .ph{height:232px;background:${mix(S, onS, 0.1)};overflow:hidden;display:flex;align-items:center;justify-content:center}.ph img{width:100%;height:100%;object-fit:cover}
  .ini{font-family:Amiri,serif;font-size:88px;font-weight:700;color:${aOnS};line-height:1}
  .hd{padding:44px 0 20px 0;display:flex;flex-direction:column;justify-content:flex-end}
  .hd h1{font-family:Amiri,serif;font-size:50px;font-weight:700;line-height:1.12;padding:0 40px 0 30px}
  .strip{margin-top:12px;background:${S};color:${aOnS};font-size:16px;font-weight:700;padding:5px 40px 7px}
  .adr{font-size:12px;color:${t.muted};margin-top:10px;padding:0 40px}
  .band .sd{background:${bandSide};color:${onBS};padding:18px 26px;display:flex;flex-direction:column;align-items:flex-end;justify-content:center;text-align:left}
  .band .sd b{font-size:19px;font-weight:800;line-height:1.3}.band .sd i{width:60px;height:6px;background:${onBS};display:block;margin-top:8px}
  .band .mn{background:${A};color:${onA};padding:18px 40px;font-size:13.5px;line-height:1.95;display:flex;align-items:center}
  .body{flex:1}.body .sd{background:${S};color:${onS};padding:0 0 26px;display:flex;flex-direction:column}
  .sh{padding:22px 26px 0}.sh h2{font-size:17px;font-weight:800;color:${aOnS};text-align:left}.sh .ul{height:2px;background:${A};margin:7px 0 12px}
  .bh{background:${A};color:${onA};font-size:17px;font-weight:800;padding:9px 26px;text-align:left;margin-top:22px}
  .edu{background:${eduBg};padding:16px 26px 4px}
  .ed{text-align:left;margin-bottom:14px}.ed h3{font-size:13px;font-weight:800}.ed span{font-size:11.5px;opacity:.8}
  .ci{display:flex;align-items:center;gap:12px;margin-bottom:10px}.ci .tx{flex:1;text-align:left;font-size:12px;line-height:1.45}.ci .tx b{display:block;font-size:11.5px;font-weight:800}
  .ci .ic{width:28px;height:28px;border-radius:14px;border:1.5px solid ${alpha(onS, 0.9)};display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .sk{display:flex;align-items:center;gap:14px;margin-bottom:8px}.sk .tx{flex:1;text-align:left;font-size:12px}
  .mt{width:54px;height:9px;border:1.5px solid ${A};padding:1px;flex-shrink:0}.mt b{display:block;height:100%;background:${A}}
  .body .mn{padding:28px 40px 34px 30px}
  .mh{font-size:17px;font-weight:800;padding-bottom:8px;border-bottom:2px solid ${t.ink}}
  .xp{display:grid;grid-template-columns:150px 1.5px 1fr;gap:0 18px}
  .xp .m{padding:20px 0}.xp .m h3{font-size:13px;font-weight:800}.xp .m .p{font-size:12px;color:${t.muted}}.xp .m .co{font-size:12.5px;font-weight:800;margin-top:14px;padding-top:12px;border-top:1px solid ${t.line}}
  .xp .v{background:${t.line};margin:20px 0}
  .xp .c{padding:20px 0;border-bottom:1px solid ${t.line};font-size:12.5px;line-height:1.85}
  .xp .c ul{padding:4px 18px 0 0;color:${t.muted};font-style:italic}.xp .c li{font-size:11.5px;line-height:1.8}.xp .c li::marker{color:${A}}
  .cs{margin-top:22px}.cs li{font-size:12.5px;line-height:1.9;margin-right:18px}.cs li::marker{color:${A}}`;
  const exp = d.exp.map((x) => { const p = descParts(x.desc); return `<div class="m"><h3>${e(x.position)}</h3>${x.period ? `<div class="p">${e(x.period)}</div>` : ""}${x.company ? `<div class="co">${e(x.company)}</div>` : ""}</div><div class="v"></div><div class="c">${p.lead ? e(p.lead) : ""}${p.rest.length ? `<ul>${p.rest.map((l) => `<li>${e(l)}</li>`).join("")}</ul>` : ""}</div>`; }).join("");
  return doc(`<div class="pg">
  <div class="row"><div class="sd ph">${cv.showPhoto && photo ? `<img src="${photo}">` : `<span class="ini">${e(initials(d.name, " "))}</span>`}</div>
    <div class="mn hd"><h1>${e(n1)}${n2 ? `<br>${e(n2)}` : ""}</h1>${d.title ? `<div class="strip">${e(d.title)}</div>` : ""}${cv.address ? `<div class="adr">العنوان: ${e(cv.address)}</div>` : ""}</div></div>
  ${d.summary ? `<div class="row band"><div class="sd"><b>النبذة<br>المهنية</b><i></i></div><div class="mn">${nl(d.summary)}</div></div>` : ""}
  <div class="row body"><div class="sd">
    ${d.contact.length ? `<div class="sh"><h2>التواصل</h2><div class="ul"></div>${d.contact.map((x) => `<div class="ci"><div class="tx"><b>${x.label}</b>${ctxt(x)}</div><div class="ic">${cic(x, onS, 13)}</div></div>`).join("")}</div>` : ""}
    ${d.edu.length ? `<div class="bh">التعليم</div><div class="edu">${d.edu.map((x) => `<div class="ed"><h3>${e(x.degree)}</h3><span>${e(x.institution)}${x.year ? ` | ${e(x.year)}` : ""}</span></div>`).join("")}</div>` : ""}
    ${d.skills.length ? `<div class="sh"><h2>المهارات</h2><div class="ul"></div>${d.skills.map((s, i) => `<div class="sk"><div class="mt"><b style="width:${pct(d.skillLv[i])}%"></b></div><div class="tx">${e(s)}</div></div>`).join("")}</div>` : ""}
    ${d.langs.length ? `<div class="sh"><h2>اللغات</h2><div class="ul"></div>${d.langs.map((s, i) => `<div class="sk"><div class="mt"><b style="width:${pct(d.langLv[i])}%"></b></div><div class="tx">${e(s)}</div></div>`).join("")}</div>` : ""}
  </div><div class="mn">
    ${d.exp.length ? `<div class="mh">الخبرات العملية</div><div class="xp">${exp}</div>` : ""}
    ${d.courses.length ? `<div class="cs"><div class="mh">الدورات والشهادات</div><ul style="padding:10px 0 0">${d.courses.map((s) => `<li>${e(s)}</li>`).join("")}</ul></div>` : ""}
  </div></div></div>`, css, "Cairo", t.bg);
}

// ── 12. الموجة (مرجع 14): عمود أردوازي + أشرطة متدرّجة + رأس منحنٍ + عناوين كبسولية ──
function wave(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const S = t.s; const P = t.p; const L = mix(P, "#FFFFFF", 0.22);
  const onS = t.onS; const onGrad = contrast(L, "#FFFFFF") >= 3 ? "#FFFFFF" : onColor(L); const deco = mix(P, t.bg, 0.72);
  const grad = `linear-gradient(270deg,${L},${P})`;
  const seg = (lv: number) => `<span class="sg">${Array.from({ length: 5 }, (_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</span>`;
  const css = `.pg{position:relative;min-height:1123px;background:${t.bg};color:${t.ink};display:flex;padding-right:24px;overflow:hidden}
  .sd{width:262px;flex-shrink:0;background:${S};color:${onS};padding:26px 0 40px;display:flex;flex-direction:column;gap:22px;position:relative;z-index:2}
  .av{width:200px;height:200px;border-radius:100px;background:${mix(S, onS, 0.85)};align-self:center;overflow:hidden;display:flex;align-items:center;justify-content:center;position:relative;z-index:2}.av img{width:100%;height:100%;object-fit:cover}
  .c1{position:absolute;width:34px;height:34px;border-radius:17px;background:${alpha(onS, 0.18)};top:18px;left:18px}
  .c2{position:absolute;width:56px;height:56px;border-radius:28px;background:${alpha(onS, 0.14)};top:170px;left:34px;z-index:3}
  .rb{position:relative;background:${grad};color:${onGrad};font-size:19px;font-weight:700;text-align:center;padding:7px 0;margin:0 -24px 0 16px;border-radius:2px 0 6px 2px}
  .rb:after{content:"";position:absolute;right:0;bottom:-10px;border-top:10px solid ${mix(P, "#000000", 0.4)};border-left:24px solid transparent}
  .pd{padding:2px 26px 0}
  .ci{display:flex;align-items:center;gap:12px;font-size:12.5px;margin:9px 0}.ci b{width:28px;height:28px;border-radius:14px;background:${onS};display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .lv{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;margin:9px 0}
  .sg{display:flex;gap:3px;direction:ltr}.sg i{width:15px;height:7px;background:${alpha(onS, 0.22)}}.sg i.on{background:${alpha(onS, 0.88)}}
  .cs{display:flex;align-items:flex-start;gap:10px;font-size:12px;line-height:1.6;margin:8px 0}.cs b{width:24px;height:24px;border-radius:12px;background:${onS};display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .mn{flex:1;min-width:0;position:relative;padding:0 36px 70px 40px}
  .hdw{position:absolute;top:0;left:-1px;right:0;height:300px;z-index:0}
  .hd{position:relative;z-index:1;padding:44px 0 0;height:236px;color:${onGrad}}
  .hd h1{font-size:42px;font-weight:900;line-height:1.15;max-width:420px}.hd p{font-size:21px;font-weight:500;margin-top:6px;opacity:.95}
  .sec{position:relative;z-index:1;margin-top:30px}
  .pill{position:relative;z-index:1;display:flex;align-items:center;gap:10px;background:${grad};color:${onGrad};border-radius:24px;padding:5px 8px 5px 22px;width:62%;font-size:19px;font-weight:700}
  .pill b{width:30px;height:30px;border-radius:15px;background:${alpha(onGrad === "#FFFFFF" ? "#FFFFFF" : "#000000", 0.18)};display:flex;align-items:center;justify-content:center}
  .sw{position:absolute;right:calc(100% - 26px);bottom:0;width:260px;height:96px;z-index:-1}
  .bd{padding:12px 14px 0 0;font-size:13px;line-height:1.85;text-align:justify}
  .it{margin:10px 0 0}.it .y{font-size:13px;font-weight:800}.it h3{font-size:13.5px;font-weight:800}.it .co{font-size:12.5px;font-weight:600;color:${t.muted}}.it p{font-size:12.5px;line-height:1.8;opacity:.88}
  .dc1{position:absolute;width:120px;height:120px;border-radius:60px;background:${deco};left:44px;bottom:30px;opacity:.6;z-index:0}
  .dc2{position:absolute;width:40px;height:40px;border-radius:20px;background:${deco};left:150px;bottom:130px;opacity:.6;z-index:0}
  .ft{position:absolute;bottom:0;left:0;right:0;height:30px;background:linear-gradient(90deg,${P},${L});z-index:1;display:flex;align-items:center;justify-content:center;color:${onGrad};font-size:12px;font-weight:600}`;
  const sw = `<svg class="sw" viewBox="0 0 260 96" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${L}"/><stop offset="1" stop-color="${P}"/></linearGradient></defs><path d="M260 56 C 170 56, 70 52, 0 0 L0 22 C 64 74, 170 96, 260 96 Z" fill="url(#g)"/></svg>`;
  const pill = (icon: string, label: string) => `<div class="pill"><b>${ic(icon, onGrad, 16)}</b>${label}${sw}</div>`;
  const wv = `<svg class="hdw" viewBox="0 0 470 300" preserveAspectRatio="none"><defs><linearGradient id="hg" x1="1" x2="0" y1="0" y2="0"><stop offset="0" stop-color="${L}"/><stop offset="1" stop-color="${P}"/></linearGradient></defs><path d="M0 0 H470 V196 C 300 200, 150 196, 80 236 C 40 258, 14 280, 0 300 Z" fill="url(#hg)"/></svg>`;
  const footTxt = d.contact.find((x) => x.k === "web") || d.contact.find((x) => x.k === "email");
  return doc(`<div class="pg"><div class="sd"><div class="c1"></div>
    ${cv.showPhoto ? `<div class="av">${photo ? `<img src="${photo}">` : PERSON(S, 0.7)}</div><div class="c2"></div>` : ""}
    ${d.contact.length ? `<div><div class="rb">التواصل</div><div class="pd">${d.contact.map((x) => `<div class="ci"><b>${cic(x, S, 14)}</b>${ctxt(x)}</div>`).join("")}</div></div>` : ""}
    ${d.langs.length ? `<div><div class="rb">اللغات</div><div class="pd">${d.langs.map((l, i) => `<div class="lv"><span>${e(l)}</span>${seg(d.langLv[i])}</div>`).join("")}</div></div>` : ""}
    ${d.skills.length ? `<div><div class="rb">المهارات</div><div class="pd">${d.skills.map((s, i) => `<div class="lv"><span>${e(s)}</span>${seg(d.skillLv[i])}</div>`).join("")}</div></div>` : ""}
    ${d.courses.length ? `<div><div class="rb">الدورات</div><div class="pd">${d.courses.map((s) => `<div class="cs"><b>${ic("award", S, 13)}</b><span>${e(s)}</span></div>`).join("")}</div></div>` : ""}
  </div>
  <div class="mn">${wv}
    <div class="hd"><h1>${e(d.name)}</h1>${d.title ? `<p>${e(d.title)}</p>` : ""}</div>
    ${d.summary ? `<div class="sec">${pill("user", "نبذة")}<p class="bd">${nl(d.summary)}</p></div>` : ""}
    ${d.edu.length ? `<div class="sec">${pill("cap", "التعليم")}<div class="bd">${d.edu.map((x) => `<div class="it">${x.year ? `<div class="y">${e(x.year)}</div>` : ""}<h3>${e(x.degree)}</h3><div class="co">${e(x.institution)}</div></div>`).join("")}</div></div>` : ""}
    ${d.exp.length ? `<div class="sec">${pill("brief", "الخبرات")}<div class="bd">${d.exp.map((x) => `<div class="it">${x.period ? `<div class="y">${e(x.period)}</div>` : ""}<h3>${e(x.position)}${x.company ? ` — ${e(x.company)}` : ""}</h3>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div></div>` : ""}
    <div class="dc1"></div><div class="dc2"></div>
  </div>
  <div class="ft">${footTxt ? ctxt(footTxt) : ""}</div></div>`, css, "Cairo", t.bg);
}

// ── 13. أحادي اللون (مرجع 15): كتلة اسم سوداء + صندوق تواصل + عمود رمادي + خط زمني بالتواريخ ──
function mono(cv: CVData, t: RT) {
  const d = clean(cv); const K = t.s; const onK = t.onS; const grey = mix(t.bg, K, 0.15); const onG = ensure(t.ink, grey, 7);
  const [n1, n2] = twoLines(d.name);
  const dots = (lv: number) => `<span class="dt">${Array.from({ length: 5 }, (_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</span>`;
  const hd = (label: string, icon: string, col: string) => `<div class="sh"><span>${label}</span>${ic(icon, col, 15)}</div>`;
  const per = (s: string) => e(s).replace(/\s*[—–-]\s*/, "<br>");
  const css = `.pg{min-height:1123px;background:${t.bg};color:${t.ink};display:flex;flex-direction:column;padding:46px 0 0}
  .top{display:flex;align-items:stretch;gap:30px;padding:0 0 0 46px;height:150px}
  .nb{display:flex;align-items:stretch;gap:22px;flex:1}.nb .blk{width:46px;background:${K};flex-shrink:0}
  .nb h1{font-size:44px;font-weight:900;line-height:1.08;color:${t.ink}}.nb .rl{font-size:13.5px;font-weight:700;margin-top:8px;color:${t.muted}}
  .cb{width:300px;background:${K};color:${onK};padding:14px 20px;display:flex;flex-direction:column;justify-content:center;gap:7px;font-size:11.5px}
  .cb div{display:flex;align-items:center;gap:12px}
  .cols{display:flex;flex:1;margin-top:22px}
  .gc{width:278px;background:${grey};color:${onG};padding:22px 26px 40px 24px;margin-right:46px;display:flex;flex-direction:column;gap:22px}
  .sh{display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:800;padding-bottom:6px;border-bottom:1.5px solid ${alpha(onG, 0.55)};margin-bottom:10px}
  .gc p{font-size:12px;line-height:1.85}
  .ed{margin-bottom:12px}.ed .y{font-size:11px;opacity:.8}.ed h3{font-size:12.5px;font-weight:800}.ed i{font-size:11.5px;opacity:.85}
  .sk{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin:7px 0}.sk span:first-child:before{content:"•";margin-left:6px}
  .dt{display:flex;gap:3px;direction:ltr}.dt i{width:8px;height:8px;border:1px solid ${onG}}.dt i.on{background:${onG}}
  .mn{flex:1;min-width:0;padding:22px 40px 40px 46px}
  .tl{display:grid;grid-template-columns:52px 14px 1fr;gap:0 12px;margin-top:6px}
  .tl .y{font-size:11.5px;color:${t.muted};text-align:center;padding-top:16px;line-height:1.6}
  .tl .ln{position:relative}.tl .ln:before{content:"";position:absolute;right:6px;top:0;bottom:0;width:1.5px;background:${t.ink}}.tl .ln:after{content:"";position:absolute;right:2px;top:20px;width:10px;height:10px;border-radius:5px;background:${t.ink}}
  .tl .c{padding:14px 0 18px;border-bottom:1px solid ${t.line}}
  .tl h3{font-size:13.5px;font-weight:800}.tl .co{font-size:12px;color:${t.muted};margin-bottom:6px}.tl p{font-size:12px;line-height:1.85}.tl ul{padding:6px 16px 0 0}.tl li{font-size:11.5px;line-height:1.75}`;
  const exp = d.exp.map((x) => { const p = descParts(x.desc); return `<div class="y">${per(x.period)}</div><div class="ln"></div><div class="c"><h3>${e(x.position)}</h3>${x.company ? `<div class="co">${e(x.company)}</div>` : ""}${p.lead ? `<p>${e(p.lead)}</p>` : ""}${p.rest.length ? `<ul>${p.rest.map((l) => `<li>${e(l)}</li>`).join("")}</ul>` : ""}</div>`; }).join("");
  return doc(`<div class="pg">
  <div class="top"><div class="nb"><div class="blk"></div><div style="display:flex;flex-direction:column;justify-content:center"><h1>${e(n1)}${n2 ? `<br>${e(n2)}` : ""}</h1>${d.title ? `<div class="rl">${e(d.title)}</div>` : ""}</div></div>
    ${d.contact.length ? `<div class="cb">${d.contact.map((x) => `<div>${cic(x, onK, 13)}${ctxt(x)}</div>`).join("")}</div>` : ""}</div>
  <div class="cols"><div class="gc">
    ${d.summary ? `<div>${hd("نبذة", "user", onG)}<p>${nl(d.summary)}</p></div>` : ""}
    ${d.edu.length ? `<div>${hd("التعليم", "cap", onG)}${d.edu.map((x) => `<div class="ed">${x.year ? `<div class="y">${e(x.year)}</div>` : ""}<h3>${e(x.degree)}</h3><i>${e(x.institution)}</i></div>`).join("")}</div>` : ""}
    ${d.skills.length ? `<div>${hd("المهارات", "gear", onG)}${d.skills.map((s, i) => `<div class="sk"><span>${e(s)}</span>${dots(d.skillLv[i])}</div>`).join("")}</div>` : ""}
    ${d.langs.length ? `<div>${hd("اللغات", "lang", onG)}${d.langs.map((s, i) => `<div class="sk"><span>${e(s)}</span>${dots(d.langLv[i])}</div>`).join("")}</div>` : ""}
  </div><div class="mn">
    ${d.exp.length ? `${hd("الخبرات العملية", "brief", t.ink)}<div class="tl">${exp}</div>` : ""}
    ${d.courses.length ? `<div style="margin-top:22px">${hd("الدورات والشهادات", "award", t.ink)}${d.courses.map((s) => `<div style="font-size:12.5px;line-height:1.9">• ${e(s)}</div>`).join("")}</div>` : ""}
  </div></div></div>`, css, "Cairo", t.bg);
}

// ── 14. الموجات الهادئة (مرجع 17): خطوط موجية + صورة دائرية بحلقة + عمودان بفاصل رفيع ──
function calm(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const N = t.p; const onN = t.onP; const G = t.a; const NT = ensure(N, t.bg, 4.5);
  const lineC = mix(t.bg, t.ink, 0.13);
  const waves = (y0: number, flip: boolean) => Array.from({ length: 26 }, (_, i) => {
    const y = y0 + i * 7; const k = flip ? -1 : 1;
    return `<path d="M-40 ${y} C 220 ${y - 220 * k + i * 4}, 520 ${y + 260 * k - i * 3}, 840 ${y - 40 * k + i * 6}" />`;
  }).join("");
  const bgSvg = `<svg class="bgw" viewBox="0 0 794 1123" preserveAspectRatio="none"><g fill="none" stroke="${lineC}" stroke-width="1">${waves(160, false)}${waves(820, true)}</g>
    <g fill="none" stroke="${mix(t.bg, t.ink, 0.35)}" stroke-width="1.2"><path d="M300 0 L390 80 L460 0"/><path d="M80 120 L160 40 L80 -40"/></g>
    <polygon points="0,0 360,0 330,44 0,44" fill="${N}"/><polygon points="360,0 540,0 510,22 330,22" fill="${G}"/>
    <path d="M0 1123 L0 1040 C 160 990, 330 1110, 520 1070 C 640 1045, 720 1060, 794 1090 L794 1123 Z" fill="${G}" opacity=".55"/>
    <path d="M0 1123 L0 1075 C 180 1040, 330 1123, 560 1100 C 660 1090, 740 1110, 794 1123 Z" fill="${N}"/></svg>`;
  const css = `.pg{position:relative;min-height:1123px;background:${t.bg};color:${t.ink};overflow:hidden}
  .bgw{position:absolute;inset:0;width:794px;height:1123px;z-index:0}
  .wrap{position:relative;z-index:1;display:flex;padding:66px 46px 110px 44px;gap:0}
  .rc{width:300px;flex-shrink:0;padding-left:28px}
  .av{width:252px;height:252px;border-radius:126px;border:13px solid ${N};overflow:hidden;background:${mix(t.bg, N, 0.15)};display:flex;align-items:center;justify-content:center;margin:0 6px 30px 0}.av img{width:100%;height:100%;object-fit:cover}
  .vr{width:3px;background:${mix(t.bg, t.ink, 0.35)};margin-top:120px;flex-shrink:0}
  .lc{flex:1;min-width:0;padding-right:30px;padding-top:56px}
  h2{font-size:25px;font-weight:900;color:${NT};margin-bottom:12px;line-height:1.2}
  .hr{height:2.5px;background:${mix(t.bg, t.ink, 0.35)};margin:22px 0}
  .ci{display:flex;align-items:center;gap:12px;font-size:13px;margin:10px 0}.ci b{width:28px;height:28px;border-radius:14px;background:${N};display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ed{margin-bottom:14px}.ed h3{font-size:15px;font-weight:800;color:${NT}}.ed .i{font-size:12.5px;font-weight:700}.ed .y{font-size:12.5px;color:${t.muted}}
  .tx{font-size:13px;line-height:1.85}
  .nm h1{font-size:44px;font-weight:900;color:${NT};line-height:1.12}.nm p{font-size:21px;font-weight:500;margin-top:4px}
  .xp{margin-bottom:16px}.xp h3{font-size:15px;font-weight:800;color:${NT}}.xp .ps{font-size:13.5px}.xp .y{font-size:13px;color:${t.muted}}.xp ul{padding:6px 20px 0 0}.xp li{font-size:12.5px;line-height:1.75}
  .sec{margin-top:26px}`;
  const exp = d.exp.map((x) => { const p = descParts(x.desc); const items = [p.lead, ...p.rest].filter(Boolean); return `<div class="xp"><h3>${e(x.company || x.position)}</h3>${x.company ? `<div class="ps">${e(x.position)}</div>` : ""}${x.period ? `<div class="y">${e(x.period)}</div>` : ""}${items.length ? `<ul>${items.map((l) => `<li>${e(l)}</li>`).join("")}</ul>` : ""}</div>`; }).join("");
  return doc(`<div class="pg">${bgSvg}<div class="wrap">
  <div class="rc">
    ${cv.showPhoto ? `<div class="av">${photo ? `<img src="${photo}">` : PERSON(N, 0.6)}</div>` : `<div style="height:40px"></div>`}
    ${d.contact.length ? `<h2>التواصل</h2>${d.contact.map((x) => `<div class="ci"><b>${cic(x, onN, 14)}</b>${ctxt(x)}</div>`).join("")}<div class="hr"></div>` : ""}
    ${d.edu.length ? `<h2>التعليم</h2>${d.edu.map((x) => `<div class="ed"><h3>${e(x.degree)}</h3><div class="i">${e(x.institution)}</div>${x.year ? `<div class="y">${e(x.year)}</div>` : ""}</div>`).join("")}<div class="hr"></div>` : ""}
    ${d.skills.length ? `<h2>الخبرات التخصصية</h2>${d.skills.map((s) => `<div class="tx">${e(s)}</div>`).join("")}` : ""}
    ${d.langs.length ? `<h2 style="margin-top:22px">اللغات</h2>${d.langs.map((s) => `<div class="tx">${e(s)}</div>`).join("")}` : ""}
  </div>
  <div class="vr"></div>
  <div class="lc">
    <div class="nm"><h1>${e(d.name)}</h1>${d.title ? `<p>${e(d.title)}</p>` : ""}</div><div class="hr" style="width:82%"></div>
    ${d.summary ? `<div><h2>نبذة</h2><p class="tx">${nl(d.summary)}</p></div>` : ""}
    ${d.exp.length ? `<div class="sec"><h2>الخبرات العملية</h2>${exp}</div>` : ""}
    ${d.courses.length ? `<div class="sec"><h2>الدورات والشهادات</h2>${d.courses.map((s) => `<div class="tx">• ${e(s)}</div>`).join("")}</div>` : ""}
    <div class="sec"><h2>المراجع</h2><div class="tx">تُقدَّم عند الطلب</div></div>
  </div></div></div>`, css, "Cairo", t.bg);
}

// ── 15. السدو السوداني (ابتكار): إطار هندسي من مثلثات ومعيّنات ──
function sadu(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const P = t.p; const A = t.a; const PT = t.pT; const onP = t.onP;
  // شريط زخرفي متكرر: مثلثات متقابلة بالأساسي ومعيّنات بالإبراز
  const tile = `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='24' viewBox='0 0 36 24'><path d='M0 0 L18 12 L0 24 Z M36 0 L18 12 L36 24 Z' fill='${P}'/><path d='M18 4 L24 12 L18 20 L12 12 Z' fill='${A}'/></svg>`;
  const tileV = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='36' viewBox='0 0 24 36'><path d='M0 0 L12 18 L24 0 Z M0 36 L12 18 L24 36 Z' fill='${P}'/><path d='M4 18 L12 12 L20 18 L12 24 Z' fill='${A}'/></svg>`;
  const url = (s: string) => `url("data:image/svg+xml;utf8,${encodeURIComponent(s)}")`;
  const dia = (c: string, sz = 8) => `<i style="display:inline-block;width:${sz}px;height:${sz}px;background:${c};transform:rotate(45deg);flex-shrink:0"></i>`;
  const sh = (label: string) => `<div class="sh">${dia(A)}<span>${label}</span><b></b>${dia(P, 6)}</div>`;
  const meter = (lv: number) => `<span class="mt">${Array.from({ length: 5 }, (_, i) => dia(i < lv ? P : mix(t.bg, P, 0.2), 9)).join("")}</span>`;
  const css = `.pg{position:relative;min-height:1123px;background:${t.bg};color:${t.ink};padding:58px 58px 64px}
  .bt,.bb{position:absolute;left:0;right:0;height:24px;background:${url(tile)} repeat-x center}.bt{top:0}.bb{bottom:0}
  .bl,.br{position:absolute;top:24px;bottom:24px;width:24px;background:${url(tileV)} repeat-y center}.bl{left:0}.br{right:0}
  .in{position:absolute;inset:32px;border:1.5px solid ${P};pointer-events:none}.in2{position:absolute;inset:37px;border:.8px solid ${A};pointer-events:none}
  .hd{text-align:center;padding:18px 20px 22px;display:flex;flex-direction:column;align-items:center;gap:8px}
  .ph{width:132px;height:132px;transform:rotate(45deg);border:3px solid ${A};padding:6px;margin:18px 0 26px}.ph div{width:100%;height:100%;overflow:hidden;background:${mix(t.bg, P, 0.12)};display:flex;align-items:center;justify-content:center}.ph img,.ph svg{transform:rotate(-45deg) scale(1.42);width:100%;height:100%;object-fit:cover}
  .hd h1{font-family:'Reem Kufi','Cairo',sans-serif;font-size:46px;font-weight:700;color:${PT};line-height:1.2}
  .hd .rl{display:flex;align-items:center;gap:12px;font-size:17px;font-weight:700}
  .ct{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 18px;font-size:12.5px;color:${t.muted};padding-top:6px}.ct span.x{display:flex;align-items:center;gap:6px}
  .sum{text-align:center;font-size:13.5px;line-height:1.95;margin:4px 40px 20px;padding:14px 22px;background:${mix(t.bg, A, 0.12)};border-radius:2px}
  .sh{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:800;color:${PT};margin:18px 0 12px}.sh b{flex:1;height:1.5px;background:${mix(t.bg, P, 0.4)}}
  .cols{display:grid;grid-template-columns:1.55fr 1fr;gap:34px}
  .it{position:relative;padding-right:22px;margin-bottom:14px}.it:before{content:"";position:absolute;right:2px;top:8px;width:9px;height:9px;background:${A};transform:rotate(45deg)}
  .it h3{font-size:14.5px;font-weight:800}.it .m{font-size:12px;color:${t.muted}}.it p{font-size:12.5px;line-height:1.8;margin-top:3px}
  .sk{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12.5px;margin:9px 0}.mt{display:flex;gap:5px;direction:ltr}
  .ed{margin-bottom:10px}.ed h3{font-size:13.5px;font-weight:800}.ed span{font-size:12px;color:${t.muted}}
  .tg{display:inline-block;font-size:12px;background:${P};color:${onP};padding:3px 10px;margin:0 0 6px 6px}`;
  return doc(`<div class="pg"><div class="bt"></div><div class="bb"></div><div class="bl"></div><div class="br"></div><div class="in"></div><div class="in2"></div>
  <div class="hd">${cv.showPhoto ? `<div class="ph"><div>${photo ? `<img src="${photo}">` : PERSON(P, 0.7)}</div></div>` : `<div style="display:flex;gap:8px">${dia(A, 10)}${dia(P, 10)}${dia(A, 10)}</div>`}
    <h1>${e(d.name)}</h1>${d.title ? `<div class="rl">${dia(A)}<span>${e(d.title)}</span>${dia(A)}</div>` : ""}
    <div class="ct">${d.contact.map((x) => `<span class="x">${cic(x, PT, 13)}${ctxt(x)}</span>`).join("")}</div></div>
  ${d.summary ? `<p class="sum">${nl(d.summary)}</p>` : ""}
  <div class="cols"><div>
    ${d.exp.length ? `${sh("الخبرات العملية")}${d.exp.map((x) => `<div class="it"><h3>${e(x.position)}</h3><div class="m">${[x.company, x.period].filter(Boolean).map(e).join(" · ")}</div>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}` : ""}
    ${d.courses.length ? `${sh("الدورات والشهادات")}${d.courses.map((s) => `<div class="it"><h3 style="font-weight:600;font-size:13px">${e(s)}</h3></div>`).join("")}` : ""}
  </div><div>
    ${d.edu.length ? `${sh("التعليم")}${d.edu.map((x) => `<div class="ed"><h3>${e(x.degree)}</h3><span>${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div>`).join("")}` : ""}
    ${d.skills.length ? `${sh("المهارات")}${d.skills.map((s, i) => `<div class="sk"><span>${e(s)}</span>${meter(d.skillLv[i])}</div>`).join("")}` : ""}
    ${d.langs.length ? `${sh("اللغات")}<div>${d.langs.map((s) => `<span class="tg">${e(s)}</span>`).join("")}</div>` : ""}
  </div></div></div>`, css, "Cairo", t.bg);
}

// ── 16. السويسري (ابتكار): شبكة صارمة وأرقام أقسام ──
function swiss(cv: CVData, t: RT) {
  const d = clean(cv); const R = t.a; const RT_ = ensure(R, t.bg, 3.2);
  const num = ["01", "02", "03", "04", "05", "06", "07"]; let k = 0;
  const sec = (label: string, body: string) => `<div class="sec"><div class="lb"><b>${num[k++]}</b><span>${label}</span></div><div class="bd">${body}</div></div>`;
  const ticks = (lv: number) => `<span class="tk">${Array.from({ length: 5 }, (_, i) => `<i class="${i < lv ? "on" : ""}"></i>`).join("")}</span>`;
  const css = `.pg{min-height:1123px;background:${t.bg};color:${t.ink};padding:0 64px 50px;display:flex;flex-direction:column}
  .bar{height:10px;background:${t.p};margin:0 -64px}.sq{width:46px;height:46px;background:${R};margin-top:44px}
  .hd{display:grid;grid-template-columns:1fr 230px;gap:30px;margin-top:22px;padding-bottom:26px;border-bottom:3px solid ${t.ink}}
  .hd h1{font-size:54px;font-weight:700;line-height:1.05;letter-spacing:-.5px}.hd .rl{font-size:18px;font-weight:600;margin-top:10px;color:${RT_}}
  .ct{display:flex;flex-direction:column;gap:8px;justify-content:flex-end;font-size:12px}.ct div{display:grid;grid-template-columns:60px 1fr;gap:8px}.ct small{color:${t.muted};font-size:11px}
  .sec{display:grid;grid-template-columns:150px 1fr;gap:30px;padding:22px 0;border-bottom:1px solid ${t.line}}
  .lb{display:flex;flex-direction:column;gap:2px}.lb b{font-size:32px;font-weight:700;color:${RT_};line-height:1;font-family:'IBM Plex Sans Arabic',sans-serif}.lb span{font-size:13px;font-weight:700}
  .bd p{font-size:13.5px;line-height:1.9}
  .xp{display:grid;grid-template-columns:1fr 110px;gap:4px 16px;margin-bottom:14px}.xp h3{font-size:14.5px;font-weight:700}.xp .y{font-size:12px;color:${t.muted};text-align:left}.xp .co{font-size:12.5px;color:${t.muted};grid-column:1/-1}.xp p{grid-column:1/-1;font-size:12.5px;line-height:1.8}
  .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 18px}.g3 div{font-size:12.5px;display:flex;flex-direction:column;gap:5px;border-top:2px solid ${t.ink};padding-top:6px}
  .tk{display:flex;gap:3px;direction:ltr}.tk i{flex:1;height:4px;background:${t.line}}.tk i.on{background:${t.ink}}
  .ft{margin-top:auto;padding-top:20px;display:flex;justify-content:space-between;font-size:10.5px;color:${t.muted}}`;
  const body = [
    d.summary && sec("الملف", `<p>${nl(d.summary)}</p>`),
    d.exp.length && sec("الخبرة", d.exp.map((x) => `<div class="xp"><h3>${e(x.position)}</h3><div class="y">${e(x.period)}</div>${x.company ? `<div class="co">${e(x.company)}</div>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")),
    d.edu.length && sec("التعليم", d.edu.map((x) => `<div class="xp"><h3>${e(x.degree)}</h3><div class="y">${e(x.year)}</div><div class="co">${e(x.institution)}</div></div>`).join("")),
    d.skills.length && sec("المهارات", `<div class="g3">${d.skills.map((s, i) => `<div>${e(s)}${ticks(d.skillLv[i])}</div>`).join("")}</div>`),
    d.langs.length && sec("اللغات", `<div class="g3">${d.langs.map((s, i) => `<div>${e(s)}${ticks(d.langLv[i])}</div>`).join("")}</div>`),
    d.courses.length && sec("الدورات", `<p>${d.courses.map(e).join("<br>")}</p>`),
  ].filter(Boolean).join("");
  return doc(`<div class="pg"><div class="bar"></div><div class="sq"></div>
  <div class="hd"><div><h1>${e(d.name)}</h1>${d.title ? `<div class="rl">${e(d.title)}</div>` : ""}</div>
  <div class="ct">${d.contact.map((x) => `<div><small>${x.label}</small>${ctxt(x)}</div>`).join("")}</div></div>
  ${body}<div class="ft"><span>المراجع تُقدَّم عند الطلب</span><span>حصاحيصاوي</span></div></div>`, css, "IBM Plex Sans Arabic", t.bg);
}

// ── 17. المجلّة (ابتكار): غلاف بالاسم كعنوان + اقتباس + أعمدة صحفية ──
function magazine(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const S = t.s; const onS = t.onS; const A = t.a; const aOnS = ensure(A, S, 4.5); const AT = t.aT;
  const year = new Date().getFullYear();
  const css = `.pg{min-height:1123px;background:${t.bg};color:${t.ink};display:flex;flex-direction:column}
  .cv{position:relative;background:${S};color:${onS};height:430px;display:flex;overflow:hidden}
  .cv .tx{flex:1;padding:40px 48px 34px;display:flex;flex-direction:column;position:relative;z-index:2}
  .kick{display:flex;justify-content:space-between;font-size:12px;font-weight:600;border-bottom:1px solid ${alpha(onS, 0.4)};padding-bottom:10px;opacity:.9}
  .mast{font-family:Amiri,serif;font-size:22px;color:${aOnS};margin-top:18px}
  .cv h1{font-family:Amiri,serif;font-size:66px;font-weight:700;line-height:1.05;margin-top:auto}
  .cv .rl{display:inline-block;align-self:flex-start;background:${A};color:${t.onA};font-size:16px;font-weight:700;padding:4px 14px;margin-top:14px}
  .cv .im{width:300px;flex-shrink:0;position:relative;background:${mix(S, onS, 0.1)};display:flex;align-items:center;justify-content:center}.cv .im img{width:100%;height:100%;object-fit:cover;filter:grayscale(.2) contrast(1.05)}
  .cv .im:after{content:"";position:absolute;inset:0;background:linear-gradient(270deg,transparent 60%,${alpha(S, 0.9)})}
  .ct{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:12px;padding:12px 48px;border-bottom:3px double ${t.ink}}
  .ct span.x{display:flex;align-items:center;gap:6px}
  .q{position:relative;font-family:Amiri,serif;font-size:22px;line-height:1.7;text-align:center;padding:26px 90px 22px}
  .q .qm{position:absolute;top:14px;right:44px;opacity:.9}
  .body{display:grid;grid-template-columns:1fr 1fr 220px;gap:0;padding:0 48px 40px;flex:1}
  .body>div{padding:0 0 0 22px;margin-left:22px;border-left:1px solid ${t.line}}.body>div:last-child{border:0;margin:0;padding:0}
  h2{font-family:Amiri,serif;font-size:21px;font-weight:700;border-top:3px solid ${t.ink};padding-top:6px;margin:14px 0 10px}
  .ar{margin-bottom:16px}.ar .n{font-family:Amiri,serif;font-size:30px;color:${AT};line-height:1;float:right;margin-left:8px}
  .ar h3{font-size:14px;font-weight:800}.ar .m{font-size:11.5px;color:${t.muted}}.ar p{font-size:12px;line-height:1.85;clear:both;padding-top:4px;text-align:justify}
  .box{background:${mix(t.bg, A, 0.14)};padding:14px 16px;margin-top:14px}.box h2{border:0;margin:0 0 8px;padding:0;font-size:18px}
  .box li{font-size:12.5px;line-height:1.85;list-style:none}.box li:before{content:"■";color:${AT};font-size:8px;margin-left:8px;vertical-align:middle}
  .ed{margin-bottom:10px}.ed h3{font-size:13px;font-weight:800}.ed span{font-size:11.5px;color:${t.muted}}`;
  const half = Math.ceil(d.exp.length / 2);
  const art = (x: CVData["experience"][number], i: number) => `<div class="ar"><span class="n">${String(i + 1).replace(/\d/g, (c) => "٠١٢٣٤٥٦٧٨٩"[+c])}</span><h3>${e(x.position)}</h3><div class="m">${[x.company, x.period].filter(Boolean).map(e).join(" · ")}</div>${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`;
  return doc(`<div class="pg"><div class="cv"><div class="tx">
    <div class="kick"><span>ملف مهني</span><span>الإصدار ${year}</span></div><div class="mast">السيرة الذاتية</div>
    <h1>${e(d.name)}</h1>${d.title ? `<span class="rl">${e(d.title)}</span>` : ""}</div>
    ${cv.showPhoto ? `<div class="im">${photo ? `<img src="${photo}">` : PERSON(onS, 0.5)}</div>` : ""}</div>
  ${d.contact.length ? `<div class="ct">${d.contact.map((x) => `<span class="x">${cic(x, t.ink, 13)}${ctxt(x)}</span>`).join("")}</div>` : ""}
  ${d.summary ? `<div class="q"><span class="qm">${ic("quote", AT, 30, 1.6)}</span>${nl(d.summary)}</div>` : ""}
  <div class="body">
    <div>${d.exp.length ? `<h2>الخبرات</h2>${d.exp.slice(0, half).map(art).join("")}` : ""}</div>
    <div>${d.exp.length > half ? `<h2>&nbsp;</h2>${d.exp.slice(half).map((x, i) => art(x, i + half)).join("")}` : ""}${d.edu.length ? `<h2>التعليم</h2>${d.edu.map((x) => `<div class="ed"><h3>${e(x.degree)}</h3><span>${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div>`).join("")}` : ""}</div>
    <div>${d.skills.length ? `<div class="box"><h2>أبرز المهارات</h2><ul style="padding:0">${d.skills.map((s) => `<li>${e(s)}</li>`).join("")}</ul></div>` : ""}
      ${d.langs.length ? `<div class="box"><h2>اللغات</h2><ul style="padding:0">${d.langs.map((s) => `<li>${e(s)}</li>`).join("")}</ul></div>` : ""}
      ${d.courses.length ? `<div class="box"><h2>الدورات</h2><ul style="padding:0">${d.courses.map((s) => `<li>${e(s)}</li>`).join("")}</ul></div>` : ""}</div>
  </div></div>`, css, "Cairo", t.bg);
}

// ── 18. الإنفوجرافيك (ابتكار): حلقات مهارات + أرقام حقيقية + خط زمني متدرّج ──
function rings(cv: CVData, t: RT, photo?: string) {
  const d = clean(cv); const P = t.p; const A = t.a; const S = t.s; const onS = t.onS; const PT = t.pT;
  const ar = (n: number) => String(n).replace(/\d/g, (c) => "٠١٢٣٤٥٦٧٨٩"[+c]);
  const stats = [
    { n: d.exp.length, l: "خبرات عملية", i: "brief" }, { n: d.edu.length, l: "مؤهلات", i: "cap" },
    { n: d.skills.length, l: "مهارات", i: "star" }, { n: d.langs.length, l: "لغات", i: "lang" }, { n: d.courses.length, l: "دورات", i: "award" },
  ].filter((x) => x.n > 0).slice(0, 4);
  const css = `.pg{min-height:1123px;background:${t.bg};color:${t.ink};display:flex;flex-direction:column}
  .hd{position:relative;background:linear-gradient(120deg,${S} 0%,${S} 55%,${P} 100%);color:${onS};padding:44px 52px 70px;display:flex;align-items:center;gap:30px;clip-path:polygon(0 0,100% 0,100% 82%,0 100%)}
  .av{width:150px;height:150px;border-radius:75px;padding:6px;background:conic-gradient(${A},${P},${A});flex-shrink:0}.av div{width:100%;height:100%;border-radius:69px;overflow:hidden;background:${mix(S, onS, 0.12)};display:flex;align-items:center;justify-content:center;border:4px solid ${S}}.av img{width:100%;height:100%;object-fit:cover}
  .hd h1{font-size:42px;font-weight:900;line-height:1.15}.hd .rl{font-size:18px;font-weight:600;color:${ensure(A, S, 4.5)};margin-top:4px}
  .hd .ct{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:12px;font-size:12px}.hd .ct span.x{display:flex;align-items:center;gap:6px}
  .st{display:grid;grid-template-columns:repeat(${Math.max(stats.length, 1)},1fr);gap:14px;padding:0 52px;margin-top:-34px;position:relative;z-index:2}
  .st div{background:${t.bg};border-radius:16px;padding:14px 10px;text-align:center;box-shadow:0 6px 18px ${alpha(S, 0.14)};border-top:4px solid ${A}}.st b{display:block;font-size:30px;font-weight:900;color:${PT};line-height:1.1}.st span{font-size:12px;font-weight:700;color:${t.muted};display:flex;gap:5px;justify-content:center;align-items:center}
  .cols{display:grid;grid-template-columns:1.35fr 1fr;gap:34px;padding:26px 52px 44px;flex:1}
  h2{font-size:18px;font-weight:900;color:${PT};display:flex;align-items:center;gap:8px;margin:14px 0 12px}h2 i{width:26px;height:4px;border-radius:2px;background:linear-gradient(90deg,${A},${P})}
  .sum{font-size:13px;line-height:1.9}
  .tl{position:relative;padding-right:30px}.tl:before{content:"";position:absolute;right:9px;top:6px;bottom:6px;width:4px;border-radius:2px;background:linear-gradient(${P},${A})}
  .ti{position:relative;margin-bottom:16px}.ti .nd{position:absolute;right:-30px;top:2px;width:22px;height:22px;border-radius:11px;background:${t.bg};border:4px solid ${P};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:${PT}}
  .ti .y{display:inline-block;font-size:11px;font-weight:700;background:${mix(t.bg, A, 0.2)};color:${ensure(t.ink, mix(t.bg, A, 0.2), 7)};border-radius:10px;padding:1px 10px}.ti h3{font-size:14.5px;font-weight:800;margin-top:3px}.ti .co{font-size:12px;color:${t.muted}}.ti p{font-size:12.5px;line-height:1.8;opacity:.9}
  .rg{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 8px}.rg div{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;font-size:11.5px;font-weight:700;line-height:1.3}
  .ring{width:70px;height:70px;border-radius:35px;background:conic-gradient(${P} 0,${A} var(--p),${t.line} var(--p));display:flex;align-items:center;justify-content:center}.ring span{width:54px;height:54px;border-radius:27px;background:${t.bg};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:${PT}}
  .lg{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:600;margin:8px 0}.dots{display:flex;gap:4px;direction:ltr}.dots i{width:11px;height:11px;border-radius:6px;background:${t.line}}.dots i.on{background:${P}}
  .ed{background:${mix(t.bg, P, 0.06)};border-radius:12px;padding:10px 12px;margin-bottom:8px}.ed h3{font-size:13px;font-weight:800}.ed span{font-size:11.5px;color:${t.muted}}`;
  return doc(`<div class="pg"><div class="hd">
    ${cv.showPhoto ? `<div class="av"><div>${photo ? `<img src="${photo}">` : PERSON(onS, 0.7)}</div></div>` : ""}
    <div><h1>${e(d.name)}</h1>${d.title ? `<div class="rl">${e(d.title)}</div>` : ""}<div class="ct">${d.contact.map((x) => `<span class="x">${cic(x, onS, 13)}${ctxt(x)}</span>`).join("")}</div></div></div>
  ${stats.length ? `<div class="st">${stats.map((x) => `<div><b>${ar(x.n)}</b><span>${ic(x.i, t.muted, 12)}${x.l}</span></div>`).join("")}</div>` : `<div style="height:20px"></div>`}
  <div class="cols"><div>
    ${d.summary ? `<h2><i></i>نبذة</h2><p class="sum">${nl(d.summary)}</p>` : ""}
    ${d.exp.length ? `<h2><i></i>المسار المهني</h2><div class="tl">${d.exp.map((x, i) => `<div class="ti"><span class="nd">${ar(i + 1)}</span>${x.period ? `<span class="y">${e(x.period)}</span>` : ""}<h3>${e(x.position)}</h3>${x.company ? `<div class="co">${e(x.company)}</div>` : ""}${x.desc ? `<p>${nl(x.desc)}</p>` : ""}</div>`).join("")}</div>` : ""}
    ${d.courses.length ? `<h2><i></i>الدورات</h2>${d.courses.map((s) => `<div class="sum">• ${e(s)}</div>`).join("")}` : ""}
  </div><div>
    ${d.skills.length ? `<h2><i></i>المهارات</h2><div class="rg">${d.skills.map((s, i) => `<div><span class="ring" style="--p:${pct(d.skillLv[i])}%"><span>${ar(pct(d.skillLv[i]))}٪</span></span>${e(s)}</div>`).join("")}</div>` : ""}
    ${d.langs.length ? `<h2><i></i>اللغات</h2>${d.langs.map((s, i) => `<div class="lg"><span>${e(s)}</span><span class="dots">${Array.from({ length: 5 }, (_, k) => `<i class="${k < d.langLv[i] ? "on" : ""}"></i>`).join("")}</span></div>`).join("")}` : ""}
    ${d.edu.length ? `<h2><i></i>التعليم</h2>${d.edu.map((x) => `<div class="ed"><h3>${e(x.degree)}</h3><span>${e(x.institution)}${x.year ? ` · ${e(x.year)}` : ""}</span></div>`).join("")}` : ""}
  </div></div></div>`, css, "Cairo", t.bg);
}

// ───────────────────────── واجهة التوليد ─────────────────────────
/** علامة «معاينة» فوق القوالب المميزة غير المفتوحة */
const WATERMARK = `<div style="position:fixed;inset:0;pointer-events:none;z-index:99;display:flex;flex-wrap:wrap;align-content:space-around;justify-content:space-around;transform:rotate(-24deg) scale(1.4);opacity:.13">${Array.from({ length: 24 }, () => `<span style="font:900 34px Cairo,Tahoma;color:#000;padding:30px">معاينة · حصاحيصاوي</span>`).join("")}</div>`;

/** السمة الافتراضية للقالب */
export function defaultTheme(id: CVTemplateId | string): CVTheme {
  return { ...(templateById(id)?.theme || CV_TEMPLATES[0].theme) };
}

/**
 * يولّد HTML السيرة.
 * @param theme سمة كاملة أو جزئية (أو لون أساسي واحد للتوافق مع المسودات القديمة)
 */
export function buildCVHtml(cv: CVData, id: CVTemplateId, theme?: Partial<CVTheme> | string | null, photoDataUri?: string, opts: { watermark?: boolean } = {}): string {
  const base = defaultTheme(id);
  const partial: Partial<CVTheme> = typeof theme === "string" ? { primary: theme, side: theme } : (theme || {});
  const th = sanitizeTheme({ ...base, ...partial }, base);
  const html = buildCVHtmlRaw(cv, id, resolve(th), photoDataUri);
  return opts.watermark ? html.replace("</body>", `${WATERMARK}</body>`) : html;
}

function buildCVHtmlRaw(cv: CVData, id: CVTemplateId, t: RT, photoDataUri?: string): string {
  const photo = cv.showPhoto ? (photoDataUri || cv.photoUri || undefined) : undefined;
  switch (id) {
    case "band": return band(cv, t, photo);
    case "editorial": return editorial(cv, t);
    case "cards": return cards(cv, t, photo);
    case "ats": return ats(cv, t);
    case "bold": return bold(cv, t, photo);
    case "hexa": return hexa(cv, t, photo);
    case "diagonal": return diagonal(cv, t, photo);
    case "accent": return accent(cv, t, photo);
    case "arch": return arch(cv, t, photo);
    case "mustard": return mustard(cv, t, photo);
    case "wave": return wave(cv, t, photo);
    case "mono": return mono(cv, t);
    case "calm": return calm(cv, t, photo);
    case "sadu": return sadu(cv, t, photo);
    case "swiss": return swiss(cv, t);
    case "magazine": return magazine(cv, t, photo);
    case "rings": return rings(cv, t, photo);
    default: return nile(cv, t, photo);
  }
}

export { normKey as cvLevelKey };
export { ALL_ROLES as CV_ALL_ROLES };

/** بيانات مثال لمعاينة القوالب قبل تعبئة البيانات — تظهر فقط داخل المعاينة كمثال */
export const SAMPLE_CV: CVData = {
  name: "سارة عبد الله", title: "محاسبة قانونية", phone: "+249 9X XXX XXXX", email: "name@email.com", address: "الحصاحيصا", website: "",
  summary: "أركّز على دقة التقارير المالية وضبط التكاليف، وأعددت ميزانيات لمؤسسات تجارية متوسطة الحجم.",
  experience: [
    { position: "محاسبة أولى", company: "[اسم الشركة]", period: "2022 — الآن", desc: "إعداد القوائم المالية الشهرية وتسوية الحسابات البنكية.\nخفض زمن الإقفال الشهري.\nمتابعة التدقيق الداخلي." },
    { position: "محاسبة", company: "[اسم المؤسسة]", period: "2019 — 2022", desc: "متابعة المدفوعات وإدارة المخزون وتقارير الضرائب." },
  ],
  education: [{ degree: "بكالوريوس المحاسبة", institution: "[اسم الجامعة]", year: "2018" }],
  skills: ["القوائم المالية", "Excel المتقدّم", "الضرائب", "أنظمة ERP"], languages: ["العربية", "الإنجليزية"], courses: ["[شهادة مهنية]"],
  skillLevels: { "القوائم المالية": 5, "excel المتقدّم": 4, "الضرائب": 4, "أنظمة erp": 3 }, langLevels: { "العربية": 5, "الإنجليزية": 4 },
  photoUri: "", showPhoto: true,
};
