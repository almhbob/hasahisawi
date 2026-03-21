// ═══════════════════════════════════════════════════
// نظام ألوان حصاحيصاوي — مستوحى من الشعار + مستقبلي
// الأخضر الزمردي النيوني + الذهبي الإلكتروني
// ═══════════════════════════════════════════════════

// ── الألوان الجوهرية من الشعار ──
const primary   = "#00D68F";   // أخضر نيون زمردي — من الشخصية الخضراء
const primaryDim = "#00A86B";  // أخضر داكن للتفاصيل
const accent    = "#FFD000";   // ذهبي إلكتروني لامع — من الشخصية الذهبية
const accentDim = "#C8A200";   // ذهبي داكن
const cyber     = "#00CFFF";   // أزرق سيبراني تكميلي
const violet    = "#A855F7";   // بنفسجي مستقبلي

// ── خلفيات الفضاء العميق ──
const bg            = "#040D18"; // خلفية فضائية
const bgDeep        = "#020810"; // أعمق نقطة
const cardBg        = "#0A1628"; // كرت زجاجي غامق
const cardBgElevated = "#0F2040"; // كرت مرتفع مع وهج خفيف
const glassCard     = "rgba(0,214,143,0.06)"; // زجاج أخضر

// ── النصوص ──
const textPrimary   = "#E8F8F2"; // أبيض مائل للأخضر (مستقبلي)
const textSecondary = "#7EC9A8"; // ثانوي أخضر خافت — مرئي على الداكن
const textMuted     = "#3D6654"; // باهت — يُرى بوضوح كافٍ

// ── الحدود والفواصل ──
const divider       = "#132030"; // حد داكن مرئي
const borderGlow    = "#00D68F30"; // حد متوهج أخضر
const borderGoldGlow = "#FFD00030"; // حد متوهج ذهبي

export default {
  // الأساسية
  primary,
  primaryDim,
  accent,
  accentDim,
  cyber,
  violet,

  // الخلفيات
  bg,
  bgDeep,
  cardBg,
  cardBgElevated,
  glassCard,

  // النصوص
  textPrimary,
  textSecondary,
  textMuted,
  text: textPrimary,

  // الحدود
  divider,
  borderGlow,
  borderGoldGlow,

  // حالات
  success: primary,
  danger:  "#FF4D6A",
  warning: accent,
  info:    cyber,

  // للتوافق
  light: {
    text:           textPrimary,
    background:     bg,
    tint:           primary,
    tabIconDefault: textMuted,
    tabIconSelected: primary,
  },
};
