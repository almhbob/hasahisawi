// ═══════════════════════════════════════════════════════════════
// نظام ألوان حصاحيصاوي — Minimal Green + Gold
// قاعدة التصميم: أخضر أساسي، ذهبي مساعد، رمادي محايد، أحمر للتنبيه فقط.
// لا يوجد بنفسجي ولا تعدد ألوان مزعج.
// APK retry marker: UI palette is ready for rebuild.
// ═══════════════════════════════════════════════════════════════

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

const neutral      = "#64748B";
const neutralDeep  = "#334155";
const neutralLight = "#CBD5E1";
const neutralSoft  = "#F1F5F9";

const danger       = "#EF4444";
const dangerDeep   = "#B91C1C";
const dangerLight  = "#FCA5A5";
const dangerSoft   = "rgba(239,68,68,0.15)";

const greenSection = { primary, deep: primaryDeep, light: primaryLight, soft: primarySoft, grad: [primary, primaryDeep] } as const;
const goldSection = { primary: accent, deep: accentDeep, light: accentLight, soft: "#FEF9C3", grad: [accent, accentDim] } as const;
const neutralSection = { primary: neutral, deep: neutralDeep, light: neutralLight, soft: neutralSoft, grad: [neutral, "#475569"] } as const;
const dangerSection = { primary: danger, deep: dangerDeep, light: dangerLight, soft: "#FEE2E2", grad: [danger, "#DC2626"] } as const;

const SECTIONS = {
  medical: dangerSection,
  emergency: dangerSection,
  missing: goldSection,
  reports: dangerSection,
  women: greenSection,

  student: greenSection,
  culture: greenSection,
  ai: greenSection,

  prayer: greenSection,
  occasions: goldSection,
  greetings: goldSection,
  honored: goldSection,

  chat: greenSection,
  social: greenSection,
  communities: greenSection,
  numbers: neutralSection,

  market: goldSection,
  jobs: greenSection,
  ads: goldSection,
  orgs: greenSection,

  sports: greenSection,
  events: goldSection,

  transport: goldSection,
  map: greenSection,
  appointments: greenSection,
  calendar: greenSection,
  ratings: goldSection,
  settings: neutralSection,

  partnership: goldSection,
  telecom: greenSection,
} as const;

export type SectionKey = keyof typeof SECTIONS;

// أسماء قديمة محفوظة للتوافق، لكنها لا تحمل ألوانًا إضافية.
const cyber       = primary;
const violet      = primary;
const teal        = primary;
const indigo      = primary;
const rose        = danger;
const amber       = accent;

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

const textPrimary    = "#F0FFF4";
const textSecondary  = "#BBF7D0";
const textMuted      = "#A3C5AC";
const textSubtle     = "#7A9E84";
const textDisabled   = "#14532D";
const textOnDark     = "#E2F0E6";

const divider        = "#0F2A15";
const dividerSoft    = "#081A0C";
const borderGlow     = "rgba(34,197,94,0.20)";
const borderGoldGlow = "rgba(234,179,8,0.22)";
const borderSubtle   = "rgba(255,255,255,0.08)";
const borderStrong   = "rgba(34,197,94,0.38)";

const success     = primary;
const successSoft = "rgba(34,197,94,0.15)";
const warning     = accent;
const warningSoft = "rgba(234,179,8,0.15)";
const info        = primary;
const infoSoft    = "rgba(34,197,94,0.15)";

const gradients = {
  brand:      [primary, primaryDeep] as [string, string],
  brandSoft:  [primary + "22", primaryDeep + "10"] as [string, string],
  gold:       [accent, accentDeep] as [string, string],
  goldShine:  [accentLight, accent, accentDim] as [string, string, string],
  hero:       [primary, primaryDeep, bgDeep] as [string, string, string],
  dark:       [surface3, bg, bgDeep] as [string, string, string],
  surface:    [surface3, surface2] as [string, string],
  glass:      ["rgba(255,255,255,0.05)", "rgba(255,255,255,0.01)"] as [string, string],
  sunset:     [accent, accentDim, danger] as [string, string, string],
  ocean:      [primary, primaryDeep, "#14532D"] as [string, string, string],
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
  neutral,
  neutralDeep,
  neutralLight,
  neutralSoft,
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
  dangerDeep,
  dangerLight,
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
    tint:            primary,
    tabIconDefault:  textMuted,
    tabIconSelected: primary,
  },
};
