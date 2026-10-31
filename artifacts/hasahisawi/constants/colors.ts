import { isDarkTheme, activeScheme } from "./theme-mode";

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
const primaryDeep  = isDarkTheme ? "#3DD39F" : "#006B4A";
const primaryDim   = "#008259";
const primaryLight = "#4EC99D";
const primarySoft  = isDarkTheme ? "#173A2E" : "#EAF9F3";
const primaryGlow  = isDarkTheme ? "rgba(61,211,159,0.18)" : "rgba(0,150,106,0.16)";

const accent       = "#E8A900"; // ذهبي — مُخفَّف للعين
const accentDeep   = isDarkTheme ? "#F2C94C" : "#946B00"; // was #AD7E00 (3.65:1) — now 4.8:1 on white, readable as text
const accentDim    = "#CB9200";
const accentLight  = "#F7D76A";
const accentSoft   = isDarkTheme ? "#3A3016" : "#FFF7E0";
const accentGlow   = isDarkTheme ? "rgba(242,201,76,0.18)" : "rgba(232,169,0,0.18)";

// ── ألوان دلالية صحيحة ────────────────────────────────────────
// الخطر يجب أن يكون أحمر لا ذهبياً
const dangerColor  = "#D93636";
const dangerSoftC  = isDarkTheme ? "rgba(239,83,80,0.16)" : "rgba(217,54,54,0.10)";

// ── الخلفيات — محايدة لتريح العين ────────────────────────────
const white        = "#FFFFFF";
const ink          = isDarkTheme ? "#E9F2EE" : "#1A2C25"; // نص داكن دافئ
const bg           = isDarkTheme ? "#0D1613" : "#F7F9F8"; // رمادي-أخضر محايد جداً — أقل إجهاداً من الأخضر
const bgDeep       = isDarkTheme ? "#0A110E" : "#EEF3F0";
const bgAlt        = isDarkTheme ? "#15211C" : "#FFFFFF";

// بطاقات صلبة (solid) لوضوح أفضل — لا شفافية مُزعجة
const surface      = isDarkTheme ? "rgba(21,33,28,0.92)" : "rgba(255,255,255,0.90)";
const surface1     = isDarkTheme ? "#121D19" : "#F5F8F6";
const surface2     = isDarkTheme ? "#15211C" : "#FFFFFF";        // cardBg — أبيض صلب واضح
const surface3     = isDarkTheme ? "#1A2822" : "#FFFFFF";
const surface4     = isDarkTheme ? "#1E2E27" : "#FFFFFF";
const cardBg       = isDarkTheme ? "#15211C" : "#FFFFFF";        // أبيض صلب لبطاقات واضحة
const cardBgElevated = isDarkTheme ? "#1A2822" : "#FFFFFF";
const glassCard    = isDarkTheme ? "rgba(21,33,28,0.85)" : "rgba(255,255,255,0.80)";
const glassStrong  = isDarkTheme ? "rgba(21,33,28,0.94)" : "rgba(255,255,255,0.92)";
const glassMuted   = isDarkTheme ? "rgba(21,33,28,0.55)" : "rgba(255,255,255,0.50)";
const overlay      = isDarkTheme ? "rgba(0,0,0,0.55)" : "rgba(20,44,37,0.40)";

// ── النصوص — تدرج هادئ ────────────────────────────────────────
const textPrimary   = ink;
const textSecondary = isDarkTheme ? "rgba(233,242,238,0.78)" : "rgba(26,44,37,0.70)";
const textMuted     = isDarkTheme ? "rgba(233,242,238,0.64)" : "rgba(26,44,37,0.65)"; // was 0.50 (3.0:1) — now 4.6:1 (WCAG AA)
const textSubtle    = isDarkTheme ? "rgba(233,242,238,0.38)" : "rgba(26,44,37,0.35)";
const textDisabled  = isDarkTheme ? "rgba(233,242,238,0.28)" : "rgba(26,44,37,0.25)";
const textOnDark    = "#F4FBF8";

// ── الحدود — خفيفة لا مُزعجة ─────────────────────────────────
const divider        = isDarkTheme ? "rgba(255,255,255,0.08)" : "rgba(0,150,106,0.10)";
const dividerSoft    = isDarkTheme ? "rgba(255,255,255,0.05)" : "rgba(0,150,106,0.06)";
const border         = isDarkTheme ? "rgba(255,255,255,0.10)" : "rgba(0,150,106,0.13)";
const borderGlow     = isDarkTheme ? "rgba(61,211,159,0.28)" : "rgba(0,150,106,0.22)";
const borderGoldGlow = "rgba(232,169,0,0.25)";
const borderSubtle   = isDarkTheme ? "rgba(255,255,255,0.06)" : "rgba(0,150,106,0.08)";
const borderStrong   = isDarkTheme ? "rgba(255,255,255,0.18)" : "rgba(0,150,106,0.28)";

// ── الدلالات — ألوان صحيحة للمعنى ────────────────────────────
const success     = primary;
const successSoft = isDarkTheme ? "rgba(61,211,159,0.14)" : "rgba(0,150,106,0.12)";
const danger      = dangerColor;        // أحمر حقيقي للأخطاء
const dangerSoft  = dangerSoftC;
const warning     = accent;
const warningSoft = isDarkTheme ? "rgba(242,201,76,0.14)" : "rgba(232,169,0,0.14)";
const info        = primary;
const infoSoft    = isDarkTheme ? "rgba(61,211,159,0.12)" : "rgba(0,150,106,0.10)";

// ── aliases للتوافق مع الشاشات الموجودة ──────────────────────
const cyber  = primary;
const violet = accent;
const teal   = primary;
const indigo = primaryDeep;
const rose   = dangerColor;
const amber  = accent;
const neutral = isDarkTheme ? "rgba(233,242,238,0.55)" : "rgba(26,44,37,0.55)";
const neutralDeep = ink;
const neutralLight = isDarkTheme ? "rgba(233,242,238,0.24)" : "rgba(26,44,37,0.24)";
const neutralSoft = isDarkTheme ? "rgba(21,33,28,0.75)" : "rgba(255,255,255,0.75)";

// ── أقسام التطبيق ─────────────────────────────────────────────
const greenSection: SectionColor = {
  primary,
  deep: primaryDeep,
  light: primaryLight,
  soft: primarySoft,
  grad: [primary, "#006B4A"],
};

const goldSection: SectionColor = {
  primary: accent,
  deep: accentDeep,
  light: accentLight,
  soft: accentSoft,
  grad: [accent, "#946B00"],
};

const quietGreenSection: SectionColor = {
  primary: primaryDim,
  deep: primaryDeep,
  light: primaryLight,
  soft: "rgba(0,150,106,0.08)",
  grad: [primaryDim, "#006B4A"],
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
  brand:     [primary, "#006B4A"]                                   as [string, string],
  brandSoft: ["rgba(0,150,106,0.14)", "rgba(255,255,255,0.30)"]      as [string, string],
  gold:      [accent, "#946B00"]                                   as [string, string],
  goldSoft:  ["rgba(232,169,0,0.18)", "rgba(255,255,255,0.40)"]      as [string, string],
  hero:      [isDarkTheme ? "#15211C" : "#FFFFFF", primarySoft, accentSoft]                     as [string, string, string],
  appShell:  [bg, isDarkTheme ? "#15211C" : "#FFFFFF", primarySoft]                             as [string, string, string],
  surface:   isDarkTheme ? ["rgba(21,33,28,0.95)", "rgba(21,33,28,0.70)"] : ["rgba(255,255,255,0.95)", "rgba(255,255,255,0.70)"]    as [string, string],
  glass:     isDarkTheme ? ["rgba(21,33,28,0.88)", "rgba(21,33,28,0.45)"] : ["rgba(255,255,255,0.88)", "rgba(255,255,255,0.45)"]    as [string, string],
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
  isDark: isDarkTheme,
  scheme: activeScheme,
  /** نص أبيض ثابت فوق الأزرار والخلفيات الملوّنة — لا يتغير مع الوضع الداكن. */
  onColor: "#FFFFFF",
  light: {
    text: textPrimary,
    background: bg,
    tint: primary,
    tabIconDefault: textMuted,
    tabIconSelected: primary,
  },
};

/**
 * يضيف شفافية للون بأمان. `لون + "80"` يعمل مع ألوان hex فقط؛ مع rgba يُنتج
 * قيمة غير صالحة (مثل "rgba(0,150,106,0.10)80") فيتجاهلها التطبيق ولا يظهر الإطار.
 */
export function withAlpha(color: string, hexAlpha: string): string {
  const a = parseInt(hexAlpha, 16) / 255;
  const m = /^rgba?\(([^)]+)\)$/.exec(color.trim());
  if (m) {
    const [r, g, b, base = "1"] = m[1].split(",").map((x) => x.trim());
    return `rgba(${r},${g},${b},${+(Number(base) * a).toFixed(3)})`;
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return color + hexAlpha;
  if (/^#[0-9a-f]{3}$/i.test(color)) return "#" + color.slice(1).split("").map((c) => c + c).join("") + hexAlpha;
  return color;
}
