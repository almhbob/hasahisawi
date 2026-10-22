// قالب "الورق الرسمي الفاخر" لكل المستندات المطبوعة في التطبيق
// (الاستمارات القانونية، كشوف الدرجات، تحضير الدروس، أوراق الاختبارات…)
// ثم طباعتها أو حفظها PDF أو مشاركتها على كل المنصات.
import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export type PaperTheme = "legal" | "academic" | "green";

const THEMES: Record<PaperTheme, { ink: string; accent: string; soft: string; seal: string; org: string; dept: string }> = {
  legal:    { ink: "#14213D", accent: "#B08D3C", soft: "#F7F1E3", seal: "⚖", org: "حصاحيصاوي", dept: "الخدمات القانونية" },
  academic: { ink: "#12355B", accent: "#2F7D6D", soft: "#EEF5F3", seal: "✎", org: "حصاحيصاوي", dept: "مساحة التعليم" },
  green:    { ink: "#16352C", accent: "#00966A", soft: "#EEF7F2", seal: "✦", org: "حصاحيصاوي", dept: "" },
};

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function arDate(d = new Date()) {
  return d.toLocaleDateString("ar-SD", { year: "numeric", month: "long", day: "numeric" });
}

/** Fill-in line for handwritten fields. */
export const blank = (label: string, wide = false) =>
  `<div class="field ${wide ? "wide" : ""}"><span class="flabel">${esc(label)}</span><span class="fline"></span></div>`;

export function paperDocument(opts: {
  title: string;
  subtitle?: string;
  ref?: string;
  dept?: string;
  theme?: PaperTheme;
  bodyHtml: string;
  signatures?: string[];
  note?: string;
  landscape?: boolean;
}): string {
  const t = THEMES[opts.theme ?? "green"];
  const dept = opts.dept ?? t.dept;
  const sigs = (opts.signatures ?? []).map((s) => `<div class="sig"><div class="sigline"></div><div class="siglabel">${esc(s)}</div></div>`).join("");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(opts.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4 ${opts.landscape ? "landscape" : "portrait"}; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Cairo", "Segoe UI", Tahoma, Arial, sans-serif; color: #1d1d1b; font-size: 12.5px; line-height: 1.9; }
  .sheet { position: relative; min-height: 100%; padding: 16mm 14mm 14mm; background: #FFFDF8;
    border: 1.6px solid ${t.ink}; outline: 5px double ${t.accent}; outline-offset: -11px; }
  .corner { position: absolute; width: 34px; height: 34px; border: 2px solid ${t.accent}; }
  .c1 { top: 14px; right: 14px; border-left: 0; border-bottom: 0; } .c2 { top: 14px; left: 14px; border-right: 0; border-bottom: 0; }
  .c3 { bottom: 14px; right: 14px; border-left: 0; border-top: 0; } .c4 { bottom: 14px; left: 14px; border-right: 0; border-top: 0; }
  .wm { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;
    font-family: "Amiri", serif; font-size: 150px; color: ${t.accent}; opacity: .05; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 10px;
    border-bottom: 2px solid ${t.ink}; position: relative; }
  header:after { content: ""; position: absolute; right: 0; left: 0; bottom: -6px; border-bottom: 1px solid ${t.accent}; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .emblem { width: 50px; height: 50px; border-radius: 50%; border: 2px solid ${t.accent}; display: flex; align-items: center; justify-content: center;
    font-size: 24px; color: ${t.ink}; background: ${t.soft}; }
  .org { font-family: "Amiri", serif; font-weight: 700; font-size: 21px; color: ${t.ink}; line-height: 1.3; }
  .dept { font-size: 11px; color: ${t.accent}; font-weight: 700; letter-spacing: .3px; }
  .meta { text-align: left; font-size: 10.5px; color: #555; line-height: 1.7; }
  .meta b { color: ${t.ink}; }
  h1 { font-family: "Amiri", serif; text-align: center; color: ${t.ink}; font-size: 25px; margin: 18px 0 2px; }
  .sub { text-align: center; color: ${t.accent}; font-weight: 700; font-size: 12px; margin-bottom: 14px; }
  .ornament { text-align: center; color: ${t.accent}; letter-spacing: 6px; font-size: 12px; margin: -6px 0 12px; }
  h2 { font-size: 14px; color: ${t.ink}; margin: 16px 0 8px; padding: 4px 10px; background: ${t.soft}; border-right: 4px solid ${t.accent}; border-radius: 3px; }
  p { margin: 6px 0; text-align: justify; }
  ol, ul { margin: 6px 0; padding-right: 22px; } li { margin-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11.5px; }
  th { background: ${t.ink}; color: #fff; font-weight: 700; padding: 6px; border: 1px solid ${t.ink}; }
  td { padding: 5px 6px; border: 1px solid #CFC7B4; text-align: center; }
  tr:nth-child(even) td { background: #FBF7EE; }
  td.r, th.r { text-align: right; }
  .grid { display: flex; flex-wrap: wrap; gap: 6px 18px; }
  .field { flex: 1 1 45%; display: flex; align-items: flex-end; gap: 8px; min-height: 30px; }
  .field.wide { flex-basis: 100%; }
  .flabel { white-space: nowrap; font-weight: 700; color: ${t.ink}; }
  .fline { flex: 1; border-bottom: 1px dotted #8A8270; height: 18px; }
  .box { border: 1px solid #CFC7B4; border-radius: 6px; padding: 10px 12px; background: #FFFEFB; }
  .kv { display: flex; flex-wrap: wrap; gap: 4px 20px; } .kv div { flex: 1 1 45%; } .kv b { color: ${t.ink}; }
  .note { margin-top: 14px; font-size: 10.5px; color: #6b6253; border-top: 1px dashed #CFC7B4; padding-top: 8px; }
  .sigs { display: flex; gap: 24px; margin-top: 34px; }
  .sig { flex: 1; text-align: center; } .sigline { border-bottom: 1px solid ${t.ink}; height: 40px; } .siglabel { margin-top: 4px; font-weight: 700; color: ${t.ink}; font-size: 11.5px; }
  .stamp { width: 96px; height: 96px; border: 2px dashed ${t.accent}; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: ${t.accent}; font-size: 10px; }
  footer { margin-top: 18px; display: flex; justify-content: space-between; font-size: 9.5px; color: #8a8270; border-top: 1px solid ${t.accent}; padding-top: 6px; }
  .pill { display: inline-block; padding: 1px 10px; border-radius: 12px; background: ${t.soft}; color: ${t.ink}; font-weight: 700; font-size: 11px; }
  @media screen { body { background: #ECE7DB; padding: 18px; } .sheet { max-width: 210mm; margin: 0 auto; box-shadow: 0 10px 40px rgba(0,0,0,.18); } }
</style></head><body>
<div class="sheet">
  <div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>
  <div class="wm">${t.seal}</div>
  <header>
    <div class="brand"><div class="emblem">${t.seal}</div>
      <div><div class="org">${esc(t.org)}</div>${dept ? `<div class="dept">${esc(dept)}</div>` : ""}</div></div>
    <div class="meta">${opts.ref ? `الرقم المرجعي: <b>${esc(opts.ref)}</b><br/>` : ""}التاريخ: <b>${arDate()}</b></div>
  </header>
  <h1>${esc(opts.title)}</h1>
  ${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ""}
  <div class="ornament">◆ ◆ ◆</div>
  ${opts.bodyHtml}
  ${sigs ? `<div class="sigs">${sigs}</div>` : ""}
  ${opts.note ? `<div class="note">${opts.note}</div>` : ""}
  <footer><span>صادر عبر تطبيق حصاحيصاوي</span><span>${esc(opts.ref ?? "")}</span></footer>
</div></body></html>`;
}

/** Print / save as PDF / share — works on web, Android and iOS. */
export async function printPaper(html: string, title = "مستند"): Promise<void> {
  if (Platform.OS === "web") {
    const w = window.open("", "_blank");
    if (!w) { await Print.printAsync({ html }); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.document.title = title;
    const go = () => { try { w.focus(); w.print(); } catch {} };
    if (w.document.fonts?.ready) w.document.fonts.ready.then(() => setTimeout(go, 250)); else setTimeout(go, 900);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: title, UTI: "com.adobe.pdf" });
  else await Print.printAsync({ uri });
}
