// تنسيق نصوص «ديوان الكُتّاب» في التطبيق — نسخة مطابقة لـ api-server/src/lib/lit-markup.ts (عدّلهما معاً).
//   **غامق**   _مائل_   ==تظليل==   ~~مشطوب~~   وسطر مستقل فيه *** = فاصل مزخرف.
// *** داخل سطر الشعر العمودي يبقى فاصلاً بين الصدر والعجز.

export const SEPARATOR_RE = /^\s*\*\s*\*\s*\*\s*$/;
export const isSeparator = (line: string) => SEPARATOR_RE.test(line);

const BOLD = /\*\*(?=[^\s*])([^\n]*?[^\s*])\*\*/g;
const HIGHLIGHT = /==(?=[^\s=])([^\n]*?[^\s=])==/g;
const STRIKE = /~~(?=[^\s~])([^\n]*?[^\s~])~~/g;
const ITALIC = /(^|[\s(«"'،؛:.!؟\-])_(?=[^\s_])([^\n_]*?[^\s_])_(?=$|[\s)»"'،؛:.!؟,\-])/gm;

/** النص الصافي بلا علامات ولا أسطر فواصل — للمقتطفات والمشاركة والعدّادات */
export function stripMarkup(body: string): string {
  let s = String(body ?? "");
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(BOLD, "$1").replace(HIGHLIGHT, "$1").replace(STRIKE, "$1").replace(ITALIC, "$1$2");
    if (s === before) break;
  }
  return s.split("\n").filter((l) => !SEPARATOR_RE.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type Seg = { t: string; b?: boolean; i?: boolean; h?: boolean; s?: boolean };
type Style = Omit<Seg, "t">;
const TOKENS: { re: RegExp; k: keyof Style; italic?: boolean }[] = [
  { re: /\*\*(?=[^\s*])([^\n]*?[^\s*])\*\*/, k: "b" },
  { re: /==(?=[^\s=])([^\n]*?[^\s=])==/, k: "h" },
  { re: /~~(?=[^\s~])([^\n]*?[^\s~])~~/, k: "s" },
  { re: /(^|[\s(«"'،؛:.!؟\-])_(?=[^\s_])([^\n_]*?[^\s_])_(?=$|[\s)»"'،؛:.!؟,\-])/, k: "i", italic: true },
];

/** يحلّل سطراً إلى مقاطع منسّقة (يدعم التداخل) */
export function parseInline(line: string, base: Style = {}, depth = 0): Seg[] {
  if (!line) return [];
  if (depth > 4) return [{ t: line, ...base }];
  let best: { idx: number; len: number; inner: string; pre: string; k: keyof Style } | null = null;
  for (const tk of TOKENS) {
    const m = tk.re.exec(line);
    if (!m) continue;
    const pre = tk.italic ? m[1] : "";
    const idx = m.index + pre.length;
    if (!best || idx < best.idx) best = { idx, len: m[0].length - pre.length, inner: tk.italic ? m[2] : m[1], pre, k: tk.k };
  }
  if (!best) return [{ t: line, ...base }];
  const out: Seg[] = [];
  if (best.idx > 0) out.push({ t: line.slice(0, best.idx), ...base });
  out.push(...parseInline(best.inner, { ...base, [best.k]: true }, depth + 1));
  out.push(...parseInline(line.slice(best.idx + best.len), base, depth));
  return out;
}

/** يقسم بيت الشعر العمودي إلى صدر وعجز، مع حماية علامات الغامق من أن تُعدّ فاصلاً */
export function splitVerseMarked(line: string): [string, string] | null {
  const keep: string[] = [];
  const masked = line.replace(/\*\*(?=[^\s*])([^\n]*?[^\s*])\*\*/g, (m) => { keep.push(m); return `\u0001${keep.length - 1}\u0002`; });
  const parts = masked.split(/\s*(?:\*{2,3}|…|\.{3}|\t| {3,}|\s\|\s)\s*/);
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;
  const un = (s: string) => s.replace(/\u0001(\d+)\u0002/g, (_, n) => keep[Number(n)]).trim();
  return [un(parts[0]), un(parts[1])];
}

// ─── تفضيلات العرض ───────────────────────────────────────────
export type LitAlign = "right" | "center" | "justify";
export type LitSize = "s" | "m" | "l" | "xl";
export type LitSpacing = "normal" | "relaxed" | "airy";
export type LitLayout = { align?: LitAlign; size?: LitSize; spacing?: LitSpacing; font?: "cairo" };
export const SIZE_DELTA: Record<LitSize, number> = { s: -2, m: 0, l: 2, xl: 4 };
export const SPACING_MUL: Record<LitSpacing, number> = { normal: 1.75, relaxed: 1.95, airy: 2.25 };
export const SIZE_LABEL: Record<LitSize, string> = { s: "صغير", m: "متوسط", l: "كبير", xl: "كبير جداً" };
export const SPACING_LABEL: Record<LitSpacing, string> = { normal: "عادي", relaxed: "مريح", airy: "واسع" };
export const ALIGN_LABEL: Record<LitAlign, string> = { right: "يمين", center: "وسط", justify: "ضبط" };

// ─── لغات الترجمة ────────────────────────────────────────────
export const TRANSLATION_LANGS: { key: string; label: string; ltr: boolean }[] = [
  { key: "en", label: "الإنجليزية", ltr: true },
  { key: "fr", label: "الفرنسية", ltr: true },
  { key: "de", label: "الألمانية", ltr: true },
  { key: "es", label: "الإسبانية", ltr: true },
  { key: "tr", label: "التركية", ltr: true },
  { key: "fa", label: "الفارسية", ltr: false },
  { key: "sw", label: "السواحلية", ltr: true },
  { key: "other", label: "أخرى", ltr: false },
];
export const langMeta = (k?: string | null) => TRANSLATION_LANGS.find((l) => l.key === k);
/** اتجاه نص الترجمة: اللاتينية يساراً، وإن كانت «أخرى» نستدل من أول حرف */
export function isLtrText(lang: string | null | undefined, text: string): boolean {
  const m = langMeta(lang);
  if (m && lang !== "other") return m.ltr;
  const ch = (text || "").match(/[A-Za-zÀ-ɏ؀-ۿ֐-׿]/)?.[0];
  return !!ch && !/[؀-ۿ֐-׿]/.test(ch);
}

/** ينزع علامات التنسيق داخل الأسطر فقط (يُبقي أسطر الفواصل) — لزر «مسح التنسيق» */
export function stripInline(s: string): string {
  let out = String(s ?? "");
  for (let i = 0; i < 3; i++) {
    const before = out;
    out = out.replace(BOLD, "$1").replace(HIGHLIGHT, "$1").replace(STRIKE, "$1").replace(ITALIC, "$1$2");
    if (out === before) break;
  }
  return out;
}
