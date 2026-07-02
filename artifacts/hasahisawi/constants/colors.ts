// ═══════════════════════════════════════════════════════════════
// Hasahisawi Design System — Eye-Comfortable Palette
// أخضر الشعار + ذهبي الشعار، خلفية محايدة، تباين مريح.
// ═══════════════════════════════════════════════════════════════

type SectionColor = {
  primary: string;
  deep: string;
  light: string;
  soft: string;
  grad: readonly [string, string];
};

// ── ألوان الشعار (مُخفَّفة قليلاً لتكون أقل إجهاداً) ──────────
const primary      = "#00966A"; // أخضر الشعار — أهدأ بدرجة بسيطة
const primaryDeep  = "#006B4A";
const primaryDim   = "#008259";
const primaryLight = "#4EC99D";
const primarySoft  = "#EAF9F3";
const primaryGlow  = "rgba(0,150,106,0.16)";

const accent       = "#E8A900"; // ذهبي — مُخفَّف للعين
const accentDeep   = "#AD7E00";
const accentDim    = "#CB9200";
const accentLight  = "#F7D76A";
const accentSoft   = "#FFF7E0";
const accentGlow   = "rgba(232,169,0,0.18)";

// ── ألوان دلالية صحيحة ────────────────────────────────────────
// الخطر يجب أن يكون أحمر لا ذهبياً
const dangerColor  = "#D93636";
const dangerSoftC  = "rgba(217,54,54,0.10)";

// ── الخلفيات — محايدة لتريح العين ────────────────────────────
const white        = "#FFFFFF";
const ink          = "#1A2C25"; // نص داكن دافئ
const bg           = "#F7F9F8"; // رمادي-أخضر محايد جداً — أقل إجهاداً من الأخضر
const bgDeep       = "#EEF3F0";
const bgAlt        = "#FFFFFF";

// بطاقات صلبة (solid) لوضوح أفضل — لا شفافية مُزعجة
const surface      = "rgba(255,255,255,0.90)";
const surface1     = "#F5F8F6";
const surface2     = "#FFFFFF";        // cardBg — أبيض صلب واضح
const surface3     = "#FFFFFF";
const surface4     = "#FFFFFF";
const cardBg       = "#FFFFFF";        // أبيض صلب لبطاقات واضحة
const cardBgElevated = "#FFFFFF";
const glassCard    = "rgba(255,255,255,0.80)";
const glassStrong  = "rgba(255,255,255,0.92)";
const glassMuted   = "rgba(255,255,255,0.50)";
const overlay      = "rgba(20,44,37,0.40)";

// ── النصوص — تدرج هادئ ────────────────────────────────────────
const textPrimary   = ink;
const textSecondary = "rgba(26,44,37,0.70)";
const textMuted     = "rgba(26,44,37,0.50)";
const textSubtle    = "rgba(26,44,37,0.35)";
const textDisabled  = "rgba(26,44,37,0.25)";
const textOnDark    = "#F4FBF8";

// ── الحدود — خفيفة لا مُزعجة ─────────────────────────────────
const divider        = "rgba(0,150,106,0.10)";
const dividerSoft    = "rgba(0,150,106,0.06)";
const border         = "rgba(0,150,106,0.13)";
const borderGlow     = "rgba(0,150,106,0.22)";
const borderGoldGlow = "rgba(232,169,0,0.25)";
const borderSubtle   = "rgba(0,150,106,0.08)";
const borderStrong   = "rgba(0,150,106,0.28)";

// ── الدلالات — ألوان صحيحة للمعنى ────────────────────────────
const success     = primary;
const successSoft = "rgba(0,150,106,0.12)";
const danger      = dangerColor;        // أحمر حقيقي للأخطاء
const dangerSoft  = dangerSoftC;
const warning     = accent;
const warningSoft = "rgba(232,169,0,0.14)";
const info        = primary;
const infoSoft    = "rgba(0,150,106,0.10)";

// ── aliases للتوافق مع الشاشات الموجودة ──────────────────────
const cyber  = primary;
const violet = accent;
const teal   = primary;
const indigo = primaryDeep;
const rose   = dangerColor;
const amber  = accent;
const neutral = "rgba(26,44,37,0.55)";
const neutralDeep = ink;
const neutralLight = "rgba(26,44,37,0.24)";
const neutralSoft = "rgba(255,255,255,0.75)";

// ── أقسام التطبيق ─────────────────────────────────────────────
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
  soft: "rgba(0,150,106,0.08)",
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
  brand:     [primary, primaryDeep]                                   as [string, string],
  brandSoft: ["rgba(0,150,106,0.14)", "rgba(255,255,255,0.30)"]      as [string, string],
  gold:      [accent, accentDeep]                                     as [string, string],
  goldSoft:  ["rgba(232,169,0,0.18)", "rgba(255,255,255,0.40)"]      as [string, string],
  hero:      ["#FFFFFF", primarySoft, accentSoft]                     as [string, string, string],
  appShell:  [bg, "#FFFFFF", primarySoft]                             as [string, string, string],
  surface:   ["rgba(255,255,255,0.95)", "rgba(255,255,255,0.70)"]    as [string, string],
  glass:     ["rgba(255,255,255,0.88)", "rgba(255,255,255,0.45)"]    as [string, string],
  logo:      [primary, accent]                                        as [string, string],
  calm:      ["rgba(0,150,106,0.08)", "rgba(232,169,0,0.08)"]        as [string, string],
} as const;

function section(key: string): typeof SECTIONS[SectionKey] {
  return (SECTIONS as Record<string, typeof SECTIONS[SectionKey]>)[key] || SECTIONS.settings;
}

const radius = {
  sm:   10,
  md:   14,
  lg:   18,
  xl:   24,
  pill: 999,
} as const;

const shadow = {
  card: {
    shadowColor: "#0A2218",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  raised: {
    shadowColor: "#0A2218",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 5,
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
