// نظام ألوان قوالب السيرة الذاتية: أدوار قابلة للتخصيص + لوحات منسّقة + ضمان تباين النص تلقائياً.
// يُستخدم في توليد HTML (المعاينة و PDF) وفي لوحة الألوان داخل المنشئ.

/** أدوار الألوان القابلة للتعديل في كل قالب */
export type CVTheme = {
  /** اللون الأساسي: العناوين والأشرطة الرئيسية */
  primary: string;
  /** لون الإبراز: الخطوط والمؤشرات واللمسات */
  accent: string;
  /** لون العمود الجانبي / الكتل الداكنة */
  side: string;
  /** لون الورق (الخلفية) */
  paper: string;
  /** لون النص الأساسي */
  text: string;
};
export type CVThemeRole = keyof CVTheme;

export const ROLE_LABELS: Record<CVThemeRole, string> = {
  primary: "الأساسي", accent: "الإبراز", side: "الجانب", paper: "الورق", text: "النص",
};

export type CVPalette = { id: string; name: string; theme: CVTheme };

/** لوحات جاهزة تناسب مختلف الأذواق (بلا بنفسجي) */
export const CV_PALETTES: CVPalette[] = [
  { id: "navy-gold", name: "كحلي وذهبي", theme: { primary: "#1B2B48", accent: "#C9A227", side: "#16233D", paper: "#FFFFFF", text: "#1E2430" } },
  { id: "charcoal-mustard", name: "فحمي وخردلي", theme: { primary: "#2B2D33", accent: "#C9A12B", side: "#2B2D33", paper: "#FFFFFF", text: "#24262B" } },
  { id: "teal", name: "فيروزي", theme: { primary: "#2F6E7D", accent: "#5FA3B0", side: "#2C3A40", paper: "#FFFFFF", text: "#1F2A2E" } },
  { id: "burgundy", name: "عنّابي", theme: { primary: "#7A1F2B", accent: "#D4A373", side: "#3A1218", paper: "#FFFDF9", text: "#2A1A1C" } },
  { id: "forest", name: "أخضر الغابة", theme: { primary: "#1F5133", accent: "#C6A15B", side: "#163A26", paper: "#FFFFFF", text: "#1C2620" } },
  { id: "mono", name: "أبيض وأسود", theme: { primary: "#111111", accent: "#6B6B6B", side: "#1A1A1A", paper: "#FFFFFF", text: "#1A1A1A" } },
  { id: "royal", name: "أزرق ملكي", theme: { primary: "#1E4DB7", accent: "#F2B33D", side: "#102A66", paper: "#FFFFFF", text: "#172036" } },
  { id: "rose", name: "وردي هادئ", theme: { primary: "#A63D57", accent: "#E8B4B8", side: "#4A2430", paper: "#FFFBFB", text: "#2D1F24" } },
  { id: "earth", name: "ترابي", theme: { primary: "#8B5A2B", accent: "#D9A441", side: "#3E2C1E", paper: "#FBF7F0", text: "#2E241B" } },
  { id: "nile", name: "أخضر النيل", theme: { primary: "#00966A", accent: "#E8A900", side: "#0E3B2C", paper: "#FFFFFF", text: "#1A2C25" } },
  { id: "coral", name: "رمادي ومرجاني", theme: { primary: "#34495E", accent: "#E76F51", side: "#22313F", paper: "#FFFFFF", text: "#1F2933" } },
];

/** شبكة ألوان صغيرة للاختيار المخصص */
export const CV_COLOR_GRID = [
  "#111111", "#2B2D33", "#34495E", "#1B2B48", "#102A66", "#1E4DB7", "#0E5A80", "#2F6E7D",
  "#0F766E", "#00966A", "#1F5133", "#4D7C0F", "#C9A227", "#E8A900", "#D9A441", "#E76F51",
  "#C2410C", "#B91C1C", "#7A1F2B", "#A63D57", "#8B5A2B", "#6B6B6B", "#94A3B8", "#5FA3B0",
];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function normHex(v: string): string | null {
  const m = String(v || "").trim().match(HEX);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toUpperCase()}`;
}

function rgb(hex: string): [number, number, number] {
  const h = normHex(hex) || "#000000";
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

/** يمزج لونين: t=0 → a ، t=1 → b */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a); const [r2, g2, b2] = rgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function luminance(hex: string): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
  const l1 = luminance(a); const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const INK_DARK = "#14181F";
/** لون نص مقروء (أبيض أو داكن) فوق خلفية بأي لون */
export function onColor(bg: string): string {
  return contrast(bg, "#FFFFFF") >= contrast(bg, INK_DARK) ? "#FFFFFF" : INK_DARK;
}
/** يُعدّل لون النص تدريجياً حتى يبلغ التباين المطلوب فوق الخلفية */
export function ensure(fg: string, bg: string, min = 4.5): string {
  if (contrast(fg, bg) >= min) return fg;
  const target = luminance(bg) > 0.4 ? "#000000" : "#FFFFFF";
  for (let k = 0.1; k <= 1.001; k += 0.1) {
    const c = mix(fg, target, k);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

/** يُكمل السمة بقيم صالحة (لون ناقص أو غير صالح يأخذ القيمة الافتراضية) */
export function sanitizeTheme(t: Partial<CVTheme> | null | undefined, fallback: CVTheme): CVTheme {
  const pick = (k: CVThemeRole) => normHex(String(t?.[k] ?? "")) || fallback[k];
  const out: CVTheme = { primary: pick("primary"), accent: pick("accent"), side: pick("side"), paper: pick("paper"), text: pick("text") };
  // الورق يبقى فاتحاً والنص مقروءاً فوقه دائماً
  if (luminance(out.paper) < 0.6) out.paper = fallback.paper;
  out.text = ensure(out.text, out.paper, 7);
  return out;
}

export function sameTheme(a: CVTheme, b: CVTheme): boolean {
  return (Object.keys(a) as CVThemeRole[]).every((k) => a[k].toUpperCase() === b[k].toUpperCase());
}
