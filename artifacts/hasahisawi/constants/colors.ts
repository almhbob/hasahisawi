// ═══════════════════════════════════════════════════════════════
// نظام ألوان حصاحيصاوي — Design System v4 (Green + Gold Edition)
// ───────────────────────────────────────────────────────────────
// مستوحى من: شعار حصاحيصاوي (أخضر زمردي + ذهبي)
// ───────────────────────────────────────────────────────────────
// • Palette أساسي: أخضر زمردي #22C55E + ذهبي #EAB308 (هوية الشعار)
// • Section palette: لون مميز لكل قسم وخدمة (semantic)
// • Surface tokens: 4 مستويات عمق — أخضر غابي ليلي عميق
// • Gradients: تدرجات طبيعية مُعدّة مسبقاً
// ═══════════════════════════════════════════════════════════════

// ╔═══════════ 1. الألوان الجوهرية (Brand) ═══════════╗
const primary      = "#22C55E";   // أخضر زمردي — يسار الشعار
const primaryDeep  = "#16A34A";   // أعمق للحدود والظلال
const primaryDim   = "#15803D";   // متوسط للحالات النشطة
const primaryLight = "#86EFAC";   // فاتح للتلميحات
const primarySoft  = "#DCFCE7";   // ناعم للخلفيات
const primaryGlow  = "rgba(34,197,94,0.18)"; // توهج أخضر

const accent       = "#EAB308";   // ذهبي — يمين الشعار
const accentDeep   = "#A16207";   // أعمق للظلال
const accentDim    = "#CA8A04";   // متوسط
const accentLight  = "#FDE047";   // فاتح
const accentGlow   = "rgba(234,179,8,0.18)";

// ╔═══════════ 2. ألوان القطاعات (Section Palette) ═══════════╗
const SECTIONS = {
  medical:      { primary: "#EF4444", deep: "#B91C1C", light: "#FCA5A5", soft: "#FEE2E2", grad: ["#EF4444", "#DC2626"] },
  emergency:    { primary: "#DC2626", deep: "#991B1B", light: "#FCA5A5", soft: "#FEE2E2", grad: ["#DC2626", "#7F1D1D"] },
  missing:      { primary: "#F97316", deep: "#C2410C", light: "#FDBA74", soft: "#FFEDD5", grad: ["#F97316", "#EA580C"] },
  reports:      { primary: "#F43F5E", deep: "#BE123C", light: "#FDA4AF", soft: "#FFE4E6", grad: ["#F43F5E", "#E11D48"] },
  women:        { primary: "#EC4899", deep: "#BE185D", light: "#F9A8D4", soft: "#FCE7F3", grad: ["#EC4899", "#DB2777"] },
  student:      { primary: "#3B82F6", deep: "#1D4ED8", light: "#93C5FD", soft: "#DBEAFE", grad: ["#3B82F6", "#2563EB"] },
  culture:      { primary: "#A855F7", deep: "#6B21A8", light: "#D8B4FE", soft: "#F3E8FF", grad: ["#A855F7", "#9333EA"] },
  ai:           { primary: "#06B6D4", deep: "#0E7490", light: "#67E8F9", soft: "#CFFAFE", grad: ["#06B6D4", "#0891B2"] },
  prayer:       { primary: "#6366F1", deep: "#4338CA", light: "#A5B4FC", soft: "#E0E7FF", grad: ["#6366F1", "#4F46E5"] },
  occasions:    { primary: "#D946EF", deep: "#A21CAF", light: "#F0ABFC", soft: "#FAE8FF", grad: ["#D946EF", "#C026D3"] },
  greetings:    { primary: "#FB7185", deep: "#BE123C", light: "#FDA4AF", soft: "#FFE4E6", grad: ["#FB7185", "#F43F5E"] },
  honored:      { primary: "#EAB308", deep: "#A16207", light: "#FDE047", soft: "#FEF9C3", grad: ["#FBBF24", "#F59E0B"] },
  chat:         { primary: "#0EA5E9", deep: "#0369A1", light: "#7DD3FC", soft: "#E0F2FE", grad: ["#0EA5E9", "#0284C7"] },
  social:       { primary: "#8B5CF6", deep: "#6D28D9", light: "#C4B5FD", soft: "#EDE9FE", grad: ["#8B5CF6", "#7C3AED"] },
  communities:  { primary: "#6366F1", deep: "#4338CA", light: "#A5B4FC", soft: "#E0E7FF", grad: ["#818CF8", "#6366F1"] },
  numbers:      { primary: "#64748B", deep: "#334155", light: "#CBD5E1", soft: "#F1F5F9", grad: ["#64748B", "#475569"] },
  market:       { primary: "#FB923C", deep: "#C2410C", light: "#FDBA74", soft: "#FFEDD5", grad: ["#FB923C", "#F97316"] },
  jobs:         { primary: "#14B8A6", deep: "#0F766E", light: "#5EEAD4", soft: "#CCFBF1", grad: ["#14B8A6", "#0D9488"] },
  ads:          { primary: "#F472B6", deep: "#BE185D", light: "#F9A8D4", soft: "#FCE7F3", grad: ["#F472B6", "#EC4899"] },
  orgs:         { primary: "#10B981", deep: "#047857", light: "#6EE7B7", soft: "#D1FAE5", grad: ["#10B981", "#059669"] },
  sports:       { primary: "#84CC16", deep: "#4D7C0F", light: "#BEF264", soft: "#ECFCCB", grad: ["#84CC16", "#65A30D"] },
  events:       { primary: "#F59E0B", deep: "#B45309", light: "#FCD34D", soft: "#FEF3C7", grad: ["#F59E0B", "#D97706"] },
  transport:    { primary: "#FACC15", deep: "#A16207", light: "#FDE047", soft: "#FEF9C3", grad: ["#FACC15", "#EAB308"] },
  map:          { primary: "#0D9488", deep: "#115E59", light: "#5EEAD4", soft: "#CCFBF1", grad: ["#0D9488", "#0F766E"] },
  appointments: { primary: "#06B6D4", deep: "#0E7490", light: "#67E8F9", soft: "#CFFAFE", grad: ["#22D3EE", "#06B6D4"] },
  calendar:     { primary: "#7C3AED", deep: "#5B21B6", light: "#C4B5FD", soft: "#EDE9FE", grad: ["#8B5CF6", "#7C3AED"] },
  ratings:      { primary: "#F59E0B", deep: "#B45309", light: "#FCD34D", soft: "#FEF3C7", grad: ["#FBBF24", "#F59E0B"] },
  settings:     { primary: "#94A3B8", deep: "#475569", light: "#CBD5E1", soft: "#F1F5F9", grad: ["#94A3B8", "#64748B"] },
  partnership:  { primary: "#FFD700", deep: "#B45309", light: "#FDE047", soft: "#FEF9C3", grad: ["#FFD700", "#F0C040"] },
  telecom:      { primary: "#0EA5E9", deep: "#0369A1", light: "#7DD3FC", soft: "#E0F2FE", grad: ["#0EA5E9", "#2563EB"] },
} as const;

export type SectionKey = keyof typeof SECTIONS;

const cyber       = "#06B6D4";
const violet      = "#8B5CF6";
const teal        = "#14B8A6";
const indigo      = "#6366F1";
const rose        = "#F43F5E";
const amber       = "#F59E0B";

const bg              = "#07110A";
const bgDeep          = "#040C07";
const bgAlt           = "#0A160F";
const surface1        = "#0A1A0D";
const surface2        = "#0D2211";
const surface3        = "#112B15";
const surface4        = "#163519";
const surface         = surface2;
const cardBg          = surface2;
const cardBgElevated  = surface3;
const glassCard       = "rgba(34,197,94,0.07)";
const glassStrong     = "rgba(255,255,255,0.12)";
const glassMuted      = "rgba(255,255,255,0.05)";
const overlay         = "rgba(0,0,0,0.70)";

const textPrimary    = "#F0FFF4";
const textSecondary  = "#BBF7D0";
const textMuted      = "#A3C5AC";
const textSubtle     = "#7A9E84";
const textDisabled   = "#14532D";
const textOnDark     = "#E2F0E6";

const divider        = "#0F2A15";
const dividerSoft    = "#081A0C";
const border         = "rgba(255,255,255,0.12)";
const borderGlow     = "rgba(34,197,94,0.20)";
const borderGoldGlow = "rgba(234,179,8,0.22)";
const borderSubtle   = "rgba(255,255,255,0.08)";
const borderStrong   = "rgba(34,197,94,0.38)";

const success     = "#22C55E";
const successSoft = "rgba(34,197,94,0.15)";
const danger      = "#EF4444";
const dangerSoft  = "rgba(239,68,68,0.15)";
const warning     = "#EAB308";
const warningSoft = "rgba(234,179,8,0.15)";
const info        = "#06B6D4";
const infoSoft    = "rgba(6,182,212,0.15)";

const gradients = {
  brand:      ["#22C55E", "#16A34A"] as [string, string],
  brandSoft:  ["rgba(34,197,94,0.15)", "rgba(34,197,94,0.02)"] as [string, string],
  gold:       ["#EAB308", "#A16207"] as [string, string],
  goldShine:  ["#FDE047", "#EAB308", "#A16207"] as [string, string, string],
  hero:       ["#22C55E", "#16A34A", "#040C07"] as [string, string, string],
  dark:       ["#0D2211", "#07110A", "#040C07"] as [string, string, string],
  surface:    [surface3, surface1] as [string, string],
  glass:      ["rgba(255,255,255,0.05)", "rgba(255,255,255,0.01)"] as [string, string],
  sunset:     ["#F97316", "#EAB308", "#040C07"] as [string, string, string],
  ocean:      ["#06B6D4", "#0D9488", "#040C07"] as [string, string, string],
} as const;

function section(key: string): typeof SECTIONS[SectionKey] {
  return (SECTIONS as Record<string, typeof SECTIONS[SectionKey]>)[key] || SECTIONS.settings;
}

export default {
  primary, primaryDeep, primaryDim, primaryLight, primarySoft, primaryGlow,
  accent, accentDeep, accentDim, accentLight, accentGlow,
  cyber, violet, teal, indigo, rose, amber,
  bg, bgDeep, bgAlt,
  surface, surface1, surface2, surface3, surface4,
  cardBg, cardBgElevated,
  glassCard, glassStrong, glassMuted,
  overlay,
  textPrimary, textSecondary, textMuted, textSubtle, textDisabled, textOnDark, text: textPrimary,
  divider, dividerSoft, border, borderGlow, borderGoldGlow, borderSubtle, borderStrong,
  success, successSoft, danger, dangerSoft, warning, warningSoft, info, infoSoft,
  sections: SECTIONS, section, gradients,
  light: { text: textPrimary, background: bg, tint: "#22C55E", tabIconDefault: textMuted, tabIconSelected: "#22C55E" },
};
