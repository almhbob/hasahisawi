// ═══════════════════════════════════════════════════════════════
// نظام ألوان حصاحيصاوي — Green + Gold Edition
// لا يستخدم البنفسجي أو درجاته في الهوية أو القطاعات.
// ═══════════════════════════════════════════════════════════════

// ╔═══════════ 1. الألوان الجوهرية (Brand) ═══════════╗
const primary      = "#22C55E";
const primaryDeep  = "#16A34A";
const primaryDim   = "#15803D";
const primaryLight = "#86EFAC";
const primarySoft  = "#DCFCE7";
const primaryGlow  = "rgba(34,197,94,0.18)";

const accent       = "#EAB308";
const accentDeep   = "#A16207";
const accentDim    = "#CA8A04";
const accentLight  = "#FDE047";
const accentGlow   = "rgba(234,179,8,0.18)";

// ╔═══════════ 2. ألوان القطاعات (بدون بنفسجي) ═══════════╗
const SECTIONS = {
  medical:      { primary: "#EF4444", deep: "#B91C1C", light: "#FCA5A5", soft: "#FEE2E2", grad: ["#EF4444", "#DC2626"] },
  emergency:    { primary: "#DC2626", deep: "#991B1B", light: "#FCA5A5", soft: "#FEE2E2", grad: ["#DC2626", "#7F1D1D"] },
  missing:      { primary: "#F97316", deep: "#C2410C", light: "#FDBA74", soft: "#FFEDD5", grad: ["#F97316", "#EA580C"] },
  reports:      { primary: "#EF4444", deep: "#B91C1C", light: "#FCA5A5", soft: "#FEE2E2", grad: ["#EF4444", "#DC2626"] },
  women:        { primary: "#F97316", deep: "#C2410C", light: "#FDBA74", soft: "#FFEDD5", grad: ["#F97316", "#EA580C"] },

  student:      { primary: "#3B82F6", deep: "#1D4ED8", light: "#93C5FD", soft: "#DBEAFE", grad: ["#3B82F6", "#2563EB"] },
  culture:      { primary: "#0EA5E9", deep: "#0369A1", light: "#7DD3FC", soft: "#E0F2FE", grad: ["#0EA5E9", "#0284C7"] },
  ai:           { primary: "#06B6D4", deep: "#0E7490", light: "#67E8F9", soft: "#CFFAFE", grad: ["#06B6D4", "#0891B2"] },

  prayer:       { primary: "#10B981", deep: "#047857", light: "#6EE7B7", soft: "#D1FAE5", grad: ["#10B981", "#059669"] },
  occasions:    { primary: "#F59E0B", deep: "#B45309", light: "#FCD34D", soft: "#FEF3C7", grad: ["#F59E0B", "#D97706"] },
  greetings:    { primary: "#F97316", deep: "#C2410C", light: "#FDBA74", soft: "#FFEDD5", grad: ["#F97316", "#EA580C"] },
  honored:      { primary: "#EAB308", deep: "#A16207", light: "#FDE047", soft: "#FEF9C3", grad: ["#FBBF24", "#F59E0B"] },

  chat:         { primary: "#0EA5E9", deep: "#0369A1", light: "#7DD3FC", soft: "#E0F2FE", grad: ["#0EA5E9", "#0284C7"] },
  social:       { primary: "#14B8A6", deep: "#0F766E", light: "#5EEAD4", soft: "#CCFBF1", grad: ["#14B8A6", "#0D9488"] },
  communities:  { primary: "#10B981", deep: "#047857", light: "#6EE7B7", soft: "#D1FAE5", grad: ["#10B981", "#059669"] },
  numbers:      { primary: "#64748B", deep: "#334155", light: "#CBD5E1", soft: "#F1F5F9", grad: ["#64748B", "#475569"] },

  market:       { primary: "#FB923C", deep: "#C2410C", light: "#FDBA74", soft: "#FFEDD5", grad: ["#FB923C", "#F97316"] },
  jobs:         { primary: "#14B8A6", deep: "#0F766E", light: "#5EEAD4", soft: "#CCFBF1", grad: ["#14B8A6", "#0D9488"] },
  ads:          { primary: "#F59E0B", deep: "#B45309", light: "#FCD34D", soft: "#FEF3C7", grad: ["#F59E0B", "#D97706"] },
  orgs:         { primary: "#10B981", deep: "#047857", light: "#6EE7B7", soft: "#D1FAE5", grad: ["#10B981", "#059669"] },

  sports:       { primary: "#84CC16", deep: "#4D7C0F", light: "#BEF264", soft: "#ECFCCB", grad: ["#84CC16", "#65A30D"] },
  events:       { primary: "#F59E0B", deep: "#B45309", light: "#FCD34D", soft: "#FEF3C7", grad: ["#F59E0B", "#D97706"] },

  transport:    { primary: "#FACC15", deep: "#A16207", light: "#FDE047", soft: "#FEF9C3", grad: ["#FACC15", "#EAB308"] },
  map:          { primary: "#0D9488", deep: "#115E59", light: "#5EEAD4", soft: "#CCFBF1", grad: ["#0D9488", "#0F766E"] },
  appointments: { primary: "#06B6D4", deep: "#0E7490", light: "#67E8F9", soft: "#CFFAFE", grad: ["#22D3EE", "#06B6D4"] },
  calendar:     { primary: "#14B8A6", deep: "#0F766E", light: "#5EEAD4", soft: "#CCFBF1", grad: ["#14B8A6", "#0D9488"] },
  ratings:      { primary: "#F59E0B", deep: "#B45309", light: "#FCD34D", soft: "#FEF3C7", grad: ["#FBBF24", "#F59E0B"] },
  settings:     { primary: "#94A3B8", deep: "#475569", light: "#CBD5E1", soft: "#F1F5F9", grad: ["#94A3B8", "#64748B"] },

  partnership:  { primary: "#FFD700", deep: "#B45309", light: "#FDE047", soft: "#FEF9C3", grad: ["#FFD700", "#F0C040"] },
  telecom:      { primary: "#0EA5E9", deep: "#0369A1", light: "#7DD3FC", soft: "#E0F2FE", grad: ["#0EA5E9", "#2563EB"] },
} as const;

export type SectionKey = keyof typeof SECTIONS;

// ╔═══════════ 3. ألوان ثانوية متناسقة ═══════════╗
const cyber       = "#06B6D4";
const violet      = "#14B8A6"; // kept for compatibility, mapped to teal not purple
const teal        = "#14B8A6";
const indigo      = "#0EA5E9"; // kept for compatibility, mapped to blue not purple
const rose        = "#EF4444";
const amber       = "#F59E0B";

// ╔═══════════ 4. الخلفيات ═══════════╗
const bg              = "#07110A";
const bgDeep          = "#040C07";
const surface1        = "#0A1A0D";
const surface2        = "#0D2211";
const surface3        = "#112B15";
const surface4        = "#163519";
const cardBg          = surface2;
const cardBgElevated  = surface3;
const glassCard       = "rgba(34,197,94,0.07)";
const overlay         = "rgba(0,0,0,0.70)";

// ╔═══════════ 5. النصوص ═══════════╗
const textPrimary    = "#F0FFF4";
const textSecondary  = "#BBF7D0";
const textMuted      = "#A3C5AC";
const textSubtle     = "#7A9E84";
const textDisabled   = "#14532D";
const textOnDark     = "#E2F0E6";

// ╔═══════════ 6. الحدود والفواصل ═══════════╗
const divider        = "#0F2A15";
const dividerSoft    = "#081A0C";
const borderGlow     = "rgba(34,197,94,0.20)";
const borderGoldGlow = "rgba(234,179,8,0.22)";
const borderSubtle   = "rgba(255,255,255,0.08)";
const borderStrong   = "rgba(34,197,94,0.38)";

// ╔═══════════ 7. حالات النظام ═══════════╗
const success     = "#22C55E";
const successSoft = "rgba(34,197,94,0.15)";
const danger      = "#EF4444";
const dangerSoft  = "rgba(239,68,68,0.15)";
const warning     = "#EAB308";
const warningSoft = "rgba(234,179,8,0.15)";
const info        = "#34D399";
const infoSoft    = "rgba(52,211,153,0.15)";

// ╔═══════════ 8. التدرجات الجاهزة ═══════════╗
const gradients = {
  brand:      ["#22C55E", "#16A34A"] as [string, string],
  brandSoft:  [primary + "22", primaryDeep + "10"] as [string, string],
  gold:       [accent, accentDeep] as [string, string],
  goldShine:  ["#FFD700", "#F0C040", accentDim] as [string, string, string],
  hero:       ["#22C55E", "#16A34A", "#040C07"] as [string, string, string],
  dark:       ["#0D2211", "#07110A", "#040C07"] as [string, string, string],
  surface:    [surface3, surface2] as [string, string],
  glass:      ["rgba(255,255,255,0.05)", "rgba(255,255,255,0.01)"] as [string, string],
  sunset:     ["#F59E0B", "#F97316", "#EF4444"] as [string, string, string],
  ocean:      ["#22C55E", "#16A34A", "#14532D"] as [string, string, string],
} as const;

function section(key: string): typeof SECTIONS[SectionKey] {
  return (SECTIONS as Record<string, typeof SECTIONS[SectionKey]>)[key] || SECTIONS.settings;
}

export default {
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
  cyber,
  violet,
  teal,
  indigo,
  rose,
  amber,
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
  textPrimary,
  textSecondary,
  textMuted,
  textSubtle,
  textDisabled,
  textOnDark,
  text: textPrimary,
  divider,
  dividerSoft,
  borderGlow,
  borderGoldGlow,
  borderSubtle,
  borderStrong,
  success,
  successSoft,
  danger,
  dangerSoft,
  warning,
  warningSoft,
  info,
  infoSoft,
  sections: SECTIONS,
  section,
  gradients,
  light: {
    text:            textPrimary,
    background:      bg,
    tint:            "#22C55E",
    tabIconDefault:  textMuted,
    tabIconSelected: "#22C55E",
  },
};
