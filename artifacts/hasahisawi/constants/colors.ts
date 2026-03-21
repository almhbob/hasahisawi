// ═══════════════════════════════════════════════════
// نظام ألوان حصاحيصاوي — مستوحى من الشعار بشكل إحترافي
// أخضر زمردي طبيعي دافئ + ذهبي عنبري — داكن مريح للعين
// ═══════════════════════════════════════════════════

// ── الألوان الجوهرية من الشعار ──
const primary     = "#27AE68";  // أخضر زمردي طبيعي — اللون الرئيسي من الشعار
const primaryDim  = "#1D8851";  // أخضر داكن أعمق
const primaryLight = "#D6F0E5"; // أخضر فاتح جداً للتلميحات الخافتة

const accent      = "#F0A500";  // ذهبي عنبري دافئ — من الشخصية الصفراء
const accentDim   = "#C07E00";  // عنبري داكن للتفاصيل

// ── ألوان ثانوية متناسقة ──
const cyber       = "#3E9CBF";  // أزرق سماوي هادئ (تكميلي)
const violet      = "#8B72BE";  // بنفسجي خافت (تكميلي)

// ── خلفيات داكنة دافئة — لا برودة فضائية ──
const bg             = "#0D1A12";  // داكن جداً مع دفء أخضر — أساس الشاشات
const bgDeep         = "#090F0C";  // الأعمق — للزوايا وتأثيرات الظل
const cardBg         = "#142119";  // بطاقة داكنة دافئة
const cardBgElevated = "#1B2F22";  // بطاقة مرتفعة أفتح قليلاً
const glassCard      = "rgba(39,174,104,0.07)"; // زجاج أخضر شفاف خافت

// ── النصوص — قابلة للقراءة ومريحة ──
const textPrimary   = "#E4F2EB";  // أبيض دافئ مائل للأخضر
const textSecondary = "#79B597";  // ثانوي أخضر معتدل — مقروء
const textMuted     = "#4E7A62";  // باهت — للتفاصيل الثانوية

// ── الحدود والفواصل ──
const divider        = "#1D3326";  // حد داكن مرئي دون إزعاج
const borderGlow     = "#27AE6822"; // توهج أخضر خافت جداً
const borderGoldGlow = "#F0A50022"; // توهج عنبري خافت جداً

export default {
  // الأساسية
  primary,
  primaryDim,
  primaryLight,
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
  danger:  "#E05567",  // أحمر دافئ — ليس صارخاً
  warning: accent,
  info:    cyber,

  // للتوافق مع Expo theme
  light: {
    text:            textPrimary,
    background:      bg,
    tint:            primary,
    tabIconDefault:  textMuted,
    tabIconSelected: primary,
  },
};
