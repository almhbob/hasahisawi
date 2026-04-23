// ═══════════════════════════════════════════════════════════════
// نظام ألوان حصاحيصاوي — Design System v2 (World-class)
// ───────────────────────────────────────────────────────────────
// مستوحى من أفضل أنظمة التصميم العالمية:
// Material 3 · Apple HIG · Linear · Vercel · Notion
// ───────────────────────────────────────────────────────────────
// • Palette أساسي: أخضر زمردي + ذهبي عنبري (هوية الشعار)
// • Section palette: لون مميز لكل قسم وخدمة (semantic)
// • Surface tokens: 4 مستويات عمق للبطاقات
// • Gradients: تدرجات مُعدّة مسبقاً لكل قسم
// ═══════════════════════════════════════════════════════════════

// ╔═══════════ 1. الألوان الجوهرية (Brand) ═══════════╗
const primary      = "#22C55E";   // أخضر زمردي حيوي — أنقى وأكثر إشراقاً
const primaryDeep  = "#15803D";   // أعمق للحدود والظلال
const primaryDim   = "#16A34A";   // متوسط للحالات النشطة
const primaryLight = "#86EFAC";   // فاتح للتلميحات
const primarySoft  = "#DCFCE7";   // ناعم للخلفيات
const primaryGlow  = "rgba(34,197,94,0.18)"; // توهج

const accent       = "#F59E0B";   // ذهبي عنبري دافئ
const accentDeep   = "#B45309";   // أعمق للظلال
const accentDim    = "#D97706";   // متوسط
const accentLight  = "#FCD34D";   // فاتح
const accentGlow   = "rgba(245,158,11,0.18)";

// ╔═══════════ 2. ألوان القطاعات (Section Palette) ═══════════╗
// كل قسم له لونه الدلالي العالمي
const SECTIONS = {
  // ── الصحة والطوارئ ──
  medical:      { primary: "#EF4444", deep: "#B91C1C", light: "#FCA5A5", soft: "#FEE2E2", grad: ["#EF4444", "#DC2626"] }, // أحمر طبي
  emergency:    { primary: "#DC2626", deep: "#991B1B", light: "#FCA5A5", soft: "#FEE2E2", grad: ["#DC2626", "#7F1D1D"] }, // أحمر طوارئ داكن
  missing:      { primary: "#F97316", deep: "#C2410C", light: "#FDBA74", soft: "#FFEDD5", grad: ["#F97316", "#EA580C"] }, // برتقالي تنبيهي
  reports:      { primary: "#F43F5E", deep: "#BE123C", light: "#FDA4AF", soft: "#FFE4E6", grad: ["#F43F5E", "#E11D48"] }, // وردي تحذيري
  women:        { primary: "#EC4899", deep: "#BE185D", light: "#F9A8D4", soft: "#FCE7F3", grad: ["#EC4899", "#DB2777"] }, // وردي راقٍ

  // ── التعليم والمعرفة ──
  student:      { primary: "#3B82F6", deep: "#1D4ED8", light: "#93C5FD", soft: "#DBEAFE", grad: ["#3B82F6", "#2563EB"] }, // أزرق ملكي
  culture:      { primary: "#A855F7", deep: "#6B21A8", light: "#D8B4FE", soft: "#F3E8FF", grad: ["#A855F7", "#9333EA"] }, // بنفسجي ثقافي
  ai:           { primary: "#06B6D4", deep: "#0E7490", light: "#67E8F9", soft: "#CFFAFE", grad: ["#06B6D4", "#0891B2"] }, // سماوي تقني

  // ── الروحانية ──
  prayer:       { primary: "#6366F1", deep: "#4338CA", light: "#A5B4FC", soft: "#E0E7FF", grad: ["#6366F1", "#4F46E5"] }, // نيلي روحاني
  occasions:    { primary: "#D946EF", deep: "#A21CAF", light: "#F0ABFC", soft: "#FAE8FF", grad: ["#D946EF", "#C026D3"] }, // ماجنتا احتفالي
  greetings:    { primary: "#FB7185", deep: "#BE123C", light: "#FDA4AF", soft: "#FFE4E6", grad: ["#FB7185", "#F43F5E"] }, // وردي دافئ
  honored:      { primary: "#EAB308", deep: "#A16207", light: "#FDE047", soft: "#FEF9C3", grad: ["#FBBF24", "#F59E0B"] }, // ذهبي تكريم

  // ── الاجتماعية والاتصال ──
  chat:         { primary: "#0EA5E9", deep: "#0369A1", light: "#7DD3FC", soft: "#E0F2FE", grad: ["#0EA5E9", "#0284C7"] }, // أزرق سماوي
  social:       { primary: "#8B5CF6", deep: "#6D28D9", light: "#C4B5FD", soft: "#EDE9FE", grad: ["#8B5CF6", "#7C3AED"] }, // بنفسجي اجتماعي
  communities:  { primary: "#6366F1", deep: "#4338CA", light: "#A5B4FC", soft: "#E0E7FF", grad: ["#818CF8", "#6366F1"] }, // إنديغو
  numbers:      { primary: "#64748B", deep: "#334155", light: "#CBD5E1", soft: "#F1F5F9", grad: ["#64748B", "#475569"] }, // رمادي معلوماتي

  // ── الاقتصاد والعمل ──
  market:       { primary: "#FB923C", deep: "#C2410C", light: "#FDBA74", soft: "#FFEDD5", grad: ["#FB923C", "#F97316"] }, // برتقالي تجاري
  jobs:         { primary: "#14B8A6", deep: "#0F766E", light: "#5EEAD4", soft: "#CCFBF1", grad: ["#14B8A6", "#0D9488"] }, // تيل وظيفي
  ads:          { primary: "#F472B6", deep: "#BE185D", light: "#F9A8D4", soft: "#FCE7F3", grad: ["#F472B6", "#EC4899"] }, // وردي تسويقي
  orgs:         { primary: "#10B981", deep: "#047857", light: "#6EE7B7", soft: "#D1FAE5", grad: ["#10B981", "#059669"] }, // زمردي مؤسسي

  // ── الرياضة والترفيه ──
  sports:       { primary: "#84CC16", deep: "#4D7C0F", light: "#BEF264", soft: "#ECFCCB", grad: ["#84CC16", "#65A30D"] }, // أخضر طاقة
  events:       { primary: "#F59E0B", deep: "#B45309", light: "#FCD34D", soft: "#FEF3C7", grad: ["#F59E0B", "#D97706"] }, // عنبري احتفالي

  // ── الخدمات والبنية ──
  transport:    { primary: "#FACC15", deep: "#A16207", light: "#FDE047", soft: "#FEF9C3", grad: ["#FACC15", "#EAB308"] }, // أصفر طريق
  map:          { primary: "#0D9488", deep: "#115E59", light: "#5EEAD4", soft: "#CCFBF1", grad: ["#0D9488", "#0F766E"] }, // تيل ملاحي
  appointments: { primary: "#06B6D4", deep: "#0E7490", light: "#67E8F9", soft: "#CFFAFE", grad: ["#22D3EE", "#06B6D4"] }, // تركواز مواعيد
  calendar:     { primary: "#7C3AED", deep: "#5B21B6", light: "#C4B5FD", soft: "#EDE9FE", grad: ["#8B5CF6", "#7C3AED"] }, // نيلي تنظيمي
  ratings:      { primary: "#F59E0B", deep: "#B45309", light: "#FCD34D", soft: "#FEF3C7", grad: ["#FBBF24", "#F59E0B"] }, // ذهبي تقييم
  settings:     { primary: "#94A3B8", deep: "#475569", light: "#CBD5E1", soft: "#F1F5F9", grad: ["#94A3B8", "#64748B"] }, // رمادي محايد

  // ── شراكات ──
  partnership:  { primary: "#FFD700", deep: "#B45309", light: "#FDE047", soft: "#FEF9C3", grad: ["#FFD700", "#F0C040"] }, // ذهبي شراكة
} as const;

export type SectionKey = keyof typeof SECTIONS;

// ╔═══════════ 3. ألوان ثانوية متناسقة ═══════════╗
const cyber       = "#06B6D4";   // أزرق سماوي
const violet      = "#8B5CF6";   // بنفسجي
const teal        = "#14B8A6";   // تيل
const indigo      = "#6366F1";   // إنديغو
const rose        = "#F43F5E";   // وردي
const amber       = "#F59E0B";   // عنبري

// ╔═══════════ 4. الخلفيات (Surface tokens) ═══════════╗
// 4 مستويات عمق للبطاقات — Material 3 inspired
const bg              = "#0A0F0C";   // الأعمق — خلفية الشاشة
const bgDeep          = "#06090A";   // أعمق للزوايا والـ overlays
const surface1        = "#0F1814";   // surface مرتفع +1
const surface2        = "#15211B";   // surface مرتفع +2 (بطاقة عادية)
const surface3        = "#1B2A23";   // surface مرتفع +3 (بطاقة بارزة)
const surface4        = "#22332B";   // surface مرتفع +4 (modal/dialog)
const cardBg          = surface2;
const cardBgElevated  = surface3;
const glassCard       = "rgba(34,197,94,0.06)";
const overlay         = "rgba(0,0,0,0.65)";

// ╔═══════════ 5. النصوص ═══════════╗
const textPrimary    = "#F0FDF4";   // أبيض دافئ — للعناوين الرئيسية
const textSecondary  = "#A7F3D0";   // ثانوي مقروء
const textMuted      = "#6EE7B7";   // باهت — للتفاصيل
const textSubtle     = "#4ADE80";   // أكثر بهتاناً
const textDisabled   = "#3F6B54";   // غير فعّال

// ╔═══════════ 6. الحدود والفواصل ═══════════╗
const divider        = "#1F3329";
const dividerSoft    = "#14211A";
const borderGlow     = "rgba(34,197,94,0.18)";
const borderGoldGlow = "rgba(245,158,11,0.22)";
const borderSubtle   = "rgba(255,255,255,0.06)";
const borderStrong   = "rgba(34,197,94,0.35)";

// ╔═══════════ 7. حالات النظام (Semantic) ═══════════╗
const success     = "#22C55E";
const successSoft = "rgba(34,197,94,0.15)";
const danger      = "#EF4444";
const dangerSoft  = "rgba(239,68,68,0.15)";
const warning     = "#F59E0B";
const warningSoft = "rgba(245,158,11,0.15)";
const info        = "#0EA5E9";
const infoSoft    = "rgba(14,165,233,0.15)";

// ╔═══════════ 8. التدرجات الجاهزة ═══════════╗
const gradients = {
  brand:      [primary, primaryDeep] as [string, string],
  brandSoft:  [primary + "20", primaryDeep + "10"] as [string, string],
  gold:       [accent, accentDeep] as [string, string],
  goldShine:  ["#FFD700", "#F0C040", accentDim] as [string, string, string],
  hero:       ["#22C55E", "#15803D", "#0A5C44"] as [string, string, string],
  dark:       ["#1E293B", "#0F172A", "#020617"] as [string, string, string],
  surface:    [surface3, surface2] as [string, string],
  glass:      ["rgba(255,255,255,0.05)", "rgba(255,255,255,0.01)"] as [string, string],
  sunset:     ["#F59E0B", "#EF4444", "#EC4899"] as [string, string, string],
  ocean:      ["#06B6D4", "#0EA5E9", "#3B82F6"] as [string, string, string],
} as const;

// ╔═══════════ 9. Helper: lookup section colors ═══════════╗
function section(key: string): typeof SECTIONS[SectionKey] {
  return (SECTIONS as Record<string, typeof SECTIONS[SectionKey]>)[key] || SECTIONS.settings;
}

// ╔═══════════ 10. Export ═══════════╗
export default {
  // Brand
  primary,
  primaryDeep,
  primaryDim,
  primaryLight,
  primarySoft,
  primaryGlow,
  accent,
  accentDeep,
  accentDim,
  accentLight,
  accentGlow,

  // Secondary
  cyber,
  violet,
  teal,
  indigo,
  rose,
  amber,

  // Surfaces
  bg,
  bgDeep,
  surface1,
  surface2,
  surface3,
  surface4,
  cardBg,
  cardBgElevated,
  glassCard,
  overlay,

  // Text
  textPrimary,
  textSecondary,
  textMuted,
  textSubtle,
  textDisabled,
  text: textPrimary,

  // Borders
  divider,
  dividerSoft,
  borderGlow,
  borderGoldGlow,
  borderSubtle,
  borderStrong,

  // Semantic
  success,
  successSoft,
  danger,
  dangerSoft,
  warning,
  warningSoft,
  info,
  infoSoft,

  // Sections
  sections: SECTIONS,
  section,

  // Gradients
  gradients,

  // Expo theme compat
  light: {
    text:            textPrimary,
    background:      bg,
    tint:            primary,
    tabIconDefault:  textMuted,
    tabIconSelected: primary,
  },
};
