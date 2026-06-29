// ═══════════════════════════════════════════════════════════════
// Hasahisawi Logo-Only Glass Design System
// القاعدة: أخضر الشعار + ذهبي الشعار فقط، مع الأبيض/الشفافية للزجاج.
// أي alias قديم أو لون قطاع يرجع لنفس لونَي الشعار حتى لا تظهر ألوان خارجية.
// ═══════════════════════════════════════════════════════════════

type SectionColor = {
  primary: string;
  deep: string;
  light: string;
  soft: string;
  grad: readonly [string, string];
};

// Logo colors
const primary      = "#009B67"; // Hasahisawi logo green
const primaryDeep  = "#006B48";
const primaryDim   = "#00865B";
const primaryLight = "#5FD6AA";
const primarySoft  = "#E7FFF5";
const primaryGlow  = "rgba(0,155,103,0.18)";

const accent       = "#FFC20A"; // Hasahisawi logo gold
const accentDeep   = "#B78200";
const accentDim    = "#D99C00";
const accentLight  = "#FFE38A";
const accentSoft   = "#FFF8DA";
const accentGlow   = "rgba(255,194,10,0.20)";

// Neutral glass surfaces; not brand colors, only light/dark opacity support.
const white        = "#FFFFFF";
const ink          = "#14231D";
const bg           = "#F7FFF9";
const bgDeep       = "#EAF8F0";
const bgAlt        = "#FFFFFF";
const surface      = "rgba(255,255,255,0.86)";
const surface1     = "rgba(255,255,255,0.72)";
const surface2     = "rgba(255,255,255,0.84)";
const surface3     = "rgba(255,255,255,0.94)";
const surface4     = "#FFFFFF";
const cardBg       = surface2;
const cardBgElevated = surface3;
const glassCard    = "rgba(255,255,255,0.68)";
const glassStrong  = "rgba(255,255,255,0.86)";
const glassMuted   = "rgba(255,255,255,0.42)";
const overlay      = "rgba(20,35,29,0.42)";

const textPrimary   = ink;
const textSecondary = "rgba(20,35,29,0.72)";
const textMuted     = "rgba(20,35,29,0.52)";
const textSubtle    = "rgba(20,35,29,0.38)";
const textDisabled  = "rgba(20,35,29,0.26)";
const textOnDark    = "#F7FFF9";

const divider        = "rgba(0,155,103,0.12)";
const dividerSoft    = "rgba(0,155,103,0.07)";
const border         = "rgba(0,155,103,0.14)";
const borderGlow     = "rgba(0,155,103,0.24)";
const borderGoldGlow = "rgba(255,194,10,0.28)";
const borderSubtle   = "rgba(0,155,103,0.10)";
const borderStrong   = "rgba(0,155,103,0.34)";

// Semantic names are preserved for compatibility, but still use logo colors only.
const success     = primary;
const successSoft = "rgba(0,155,103,0.14)";
const danger      = accentDeep;
const dangerSoft  = "rgba(255,194,10,0.18)";
const warning     = accent;
const warningSoft = "rgba(255,194,10,0.18)";
const info        = primary;
const infoSoft    = "rgba(0,155,103,0.12)";

// Legacy aliases kept for existing screens; no external hues.
const cyber  = primary;
const violet = accent;
const teal   = primary;
const indigo = primaryDeep;
const rose   = accentDeep;
const amber  = accent;
const neutral = "rgba(20,35,29,0.60)";
const neutralDeep = ink;
const neutralLight = "rgba(20,35,29,0.26)";
const neutralSoft = "rgba(255,255,255,0.72)";

const greenSection: SectionColor = {
  primary,
  deep: primaryDeep,
  light: primaryLight,
  soft: primarySoft,
  grad: [primary, primaryDeep],
};

const goldSection: SectionColor = {
  primary: accent,
  deep: accentDeep,
  light: accentLight,
  soft: accentSoft,
  grad: [accent, accentDeep],
};

const quietGreenSection: SectionColor = {
  primary: primaryDim,
  deep: primaryDeep,
  light: primaryLight,
  soft: "rgba(0,155,103,0.08)",
  grad: [primaryDim, primaryDeep],
};

const SECTIONS = {
  medical: greenSection,
  emergency: goldSection,
  missing: goldSection,
  reports: goldSection,
  women: greenSection,
  student: quietGreenSection,
  culture: quietGreenSection,
  ai: greenSection,
  prayer: greenSection,
  occasions: goldSection,
  greetings: goldSection,
  honored: goldSection,
  chat: greenSection,
  social: greenSection,
  communities: quietGreenSection,
  numbers: quietGreenSection,
  market: goldSection,
  jobs: greenSection,
  ads: goldSection,
  orgs: greenSection,
  sports: greenSection,
  events: goldSection,
  transport: goldSection,
  map: greenSection,
  appointments: greenSection,
  calendar: goldSection,
  ratings: goldSection,
  settings: quietGreenSection,
  partnership: goldSection,
  telecom: greenSection,
  restaurants: goldSection,
  travel: goldSection,
  marketplace: greenSection,
} as const;

export type SectionKey = keyof typeof SECTIONS;

const gradients = {
  brand: [primary, primaryDeep] as [string, string],
  brandSoft: ["rgba(0,155,103,0.16)", "rgba(255,255,255,0.34)"] as [string, string],
  gold: [accent, accentDeep] as [string, string],
  goldSoft: ["rgba(255,194,10,0.22)", "rgba(255,255,255,0.46)"] as [string, string],
  hero: ["#FFFFFF", primarySoft, accentSoft] as [string, string, string],
  appShell: [bg, "#FFFFFF", primarySoft] as [string, string, string],
  surface: ["rgba(255,255,255,0.92)", "rgba(255,255,255,0.58)"] as [string, string],
  glass: ["rgba(255,255,255,0.84)", "rgba(255,255,255,0.38)"] as [string, string],
  logo: [primary, accent] as [string, string],
  calm: ["rgba(0,155,103,0.10)", "rgba(255,194,10,0.10)"] as [string, string],
} as const;

function section(key: string): typeof SECTIONS[SectionKey] {
  return (SECTIONS as Record<string, typeof SECTIONS[SectionKey]>)[key] || SECTIONS.settings;
}

// ── Modern flat design tokens (radius + soft shadow) ───────────
const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

const shadow = {
  card: {
    shadowColor: "#0F3D27",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  raised: {
    shadowColor: "#0F3D27",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  },
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
} as const;

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
  accentSoft,
  accentGlow,
  white,
  ink,
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
  bgAlt,
  surface,
  surface1,
  surface2,
  surface3,
  surface4,
  cardBg,
  cardBgElevated,
  glassCard,
  glassStrong,
  glassMuted,
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
  border,
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
  radius,
  shadow,
  light: {
    text: textPrimary,
    background: bg,
    tint: primary,
    tabIconDefault: textMuted,
    tabIconSelected: primary,
  },
};
