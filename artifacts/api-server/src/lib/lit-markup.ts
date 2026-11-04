// ════════════════════════════════════════════════════════════════
// تنسيق نصوص «ديوان الكُتّاب» — علامات بسيطة وآمنة تُخزَّن داخل النص:
//   **غامق**   _مائل_   ==تظليل==   ~~مشطوب~~
//   وسطر مستقل فيه *** فقط = فاصل مزخرف بين المقاطع.
// (*** داخل سطر الشعر العمودي يبقى فاصلاً بين الصدر والعجز كما كان.)
// كل الفحوص (الطول، الأسطر، البصمة، التشابه، الأصالة، الإشراف) تجري على
// «النص الصافي» بعد نزع العلامات، فلا يغيّر التنسيق نتيجة أي فحص.
// نسخة مطابقة في التطبيق: artifacts/hasahisawi/lib/lit-markup.ts — عدّلهما معاً.
// ════════════════════════════════════════════════════════════════

/** سطر فاصل مستقل */
export const SEPARATOR_RE = /^\s*\*\s*\*\s*\*\s*$/;

const BOLD = /\*\*(?=[^\s*])([^\n]*?[^\s*])\*\*/g;
const HIGHLIGHT = /==(?=[^\s=])([^\n]*?[^\s=])==/g;
const STRIKE = /~~(?=[^\s~])([^\n]*?[^\s~])~~/g;
// المائل: الشرطة السفلية في بداية كلمة ونهايتها فقط (لا يلتقط snake_case)
const ITALIC = /(^|[\s(«"'،؛:.!؟\-])_(?=[^\s_])([^\n_]*?[^\s_])_(?=$|[\s)»"'،؛:.!؟,\-])/gm;

/** ينزع محارف التحكم (عدا السطر الجديد والجدولة) ومحارف تجاوز الاتجاه */
export function stripControl(s: string): string {
  return String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "");
}

/** النص الصافي: بلا علامات تنسيق وبلا أسطر الفواصل */
export function stripMarkup(body: string): string {
  let s = String(body ?? "");
  for (let i = 0; i < 3; i++) { // التداخل (غامق داخل تظليل…)
    const before = s;
    s = s.replace(BOLD, "$1").replace(HIGHLIGHT, "$1").replace(STRIKE, "$1").replace(ITALIC, "$1$2");
    if (s === before) break;
  }
  return s.split("\n").filter((l) => !SEPARATOR_RE.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── المرفقات والتنسيق العام ────────────────────────────────────
export const TRANSLATION_LANGS = ["en", "fr", "de", "es", "tr", "fa", "sw", "other"] as const;
export type LitLayout = { align?: "right" | "center" | "justify"; size?: "s" | "m" | "l" | "xl"; spacing?: "normal" | "relaxed" | "airy"; font?: "cairo" };
const LAYOUT_ENUM = {
  align: ["right", "center", "justify"],
  size: ["s", "m", "l", "xl"],
  spacing: ["normal", "relaxed", "airy"],
  font: ["cairo"], // لا يوجد خط نسخ محمّل في التطبيق حالياً
} as const;

/** يقبل فقط القيم المعروفة؛ يعيد null إن لم يبقَ شيء */
export function sanitizeLayout(v: unknown): LitLayout | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, allowed] of Object.entries(LAYOUT_ENUM)) {
    const x = (v as Record<string, unknown>)[k];
    if (typeof x === "string" && (allowed as readonly string[]).includes(x)) out[k] = x;
  }
  return Object.keys(out).length ? (out as LitLayout) : null;
}

/** رابط صورة صالح: https فقط، بلا مسافات أو بيانات اعتماد */
export function validImageUrl(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s.length > 1000) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch { return null; }
}
