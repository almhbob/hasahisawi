// ════════════════════════════════════════════════════════════════
// فحص أصالة النصوص الأدبية — ثلاث طبقات تُجمع في درجة واحدة (0–100):
//  1) مؤشرات أسلوبية لنصوص النماذج اللغوية بالعربية (عبارات قالبية،
//     تنسيق Markdown، مخاطبة القارئ كمساعد، تجانس أطوال الجمل…).
//  2) قياس الكتابة من التطبيق: نسبة النص الملصوق وسرعة الكتابة.
//  3) حَكَم لغوي (نموذج) إن كانت خدمة الذكاء الاصطناعي مهيأة في الخادم.
// + كشف النسخ: بصمة MinHash تُقارن بالنصوص الموثّقة سابقاً.
// النتيجة احتمالية: «ai» يُرفض آلياً مع حق طلب مراجعة بشرية،
// «review» يُحال للمشرف مع الأسباب، «human» يمرّ للمراجعة العادية.
// ════════════════════════════════════════════════════════════════
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { logger } from "./logger";

export type OriginalitySignal = { key: string; label: string; weight: number };
export type OriginalityResult = { score: number; verdict: "human" | "review" | "ai"; signals: OriginalitySignal[]; llm: number | null };
export type Telemetry = { pasted_chars?: number; typed_chars?: number; compose_seconds?: number };

/** يحوّل النص لصيغة موحّدة: يحذف التشكيل والتطويل ويوحّد الألف والياء والتاء المربوطة */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

export function textHash(body: string): string {
  return createHash("sha256").update(normalizeArabic(body)).digest("hex");
}

// ─── بصمة MinHash لكشف النصوص المنقولة أو المكرّرة ────────────
const MH_N = 48;
const SEEDS = Array.from({ length: MH_N }, (_, i) => (Math.imul(i + 1, 0x9e3779b1) >>> 0) ^ 0x85ebca6b);
function fnv(str: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function minhash(body: string): number[] {
  const words = normalizeArabic(body).split(" ").filter(Boolean);
  const k = words.length >= 30 ? 4 : 2;
  const sh = new Set<string>();
  for (let i = 0; i + k <= words.length; i++) sh.add(words.slice(i, i + k).join(" "));
  if (!sh.size && words.length) sh.add(words.join(" "));
  const out: number[] = [];
  for (const seed of SEEDS) {
    let min = 0xffffffff;
    for (const s of sh) { const h = fnv(s, seed); if (h < min) min = h; }
    out.push(min | 0); // int4 موقّع للتخزين في Postgres
  }
  return out;
}
export function similarity(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  let eq = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) eq++;
  return eq / a.length;
}

// ─── المؤشرات الأسلوبية ───────────────────────────────────────
// عبارات تكاد لا تظهر إلا في ردود المساعدات الآلية
const ASSISTANT = [
  "بصفتي نموذج", "كنموذج لغوي", "نموذج ذكاء اصطناعي", "بصفتي ذكاء", "لا يمكنني", "لا أستطيع كتابة",
  "إليك قصيدة", "إليك قصة", "إليك نص", "إليك خاطرة", "إليك القصيدة", "إليك القصة", "اليك قصيدة", "اليك قصة",
  "هذه قصيدة عن", "هذه قصة عن", "آمل أن تنال", "آمل أن يعجبك", "اتمنى ان تنال", "أتمنى أن تعجبك", "يسعدني أن",
  "بالتأكيد!", "بكل سرور", "هل تريد أن", "هل ترغب في", "يمكنني أيضاً", "يمكنني ايضا", "إذا أردت", "اذا اردت تعديل",
  "as an ai", "here is a poem", "here's a", "chatgpt", "openai",
];
// عبارات قالبية شائعة في العربية المولّدة آلياً (وزن منخفض — قد يستعملها الكتّاب أيضاً)
const CLICHES = [
  "في عالم يتسم", "في عالم مليء", "في عالمٍ", "نسيج", "سيمفونية", "رقصة الحياة", "بوصلة", "منارة", "ملحمة",
  "رحلة اكتشاف", "رحلة الحياة", "يتجلى", "تتجلى", "تجدر الإشارة", "من الجدير بالذكر", "في هذا السياق", "علاوة على ذلك",
  "بالإضافة إلى ذلك", "في الختام", "ختاماً", "خلاصة القول", "لا شك أن", "مما لا شك فيه", "يُعد", "تُعد", "بمثابة",
  "أعماق الروح", "همسات", "تنسج", "ينسج", "شغف لا ينطفئ", "إرث خالد", "شاهداً على", "شاهدة على", "تحفة",
];

function sentences(body: string): string[] {
  return body.split(/[.!؟?\n]+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);
}

export function styleSignals(body: string, form: string, t: Telemetry): OriginalitySignal[] {
  const sig: OriginalitySignal[] = [];
  const low = body.toLowerCase();
  const ass = ASSISTANT.filter((p) => low.includes(p.toLowerCase()));
  if (ass.length) sig.push({ key: "assistant", label: `عبارات ردود المساعد الآلي: «${ass.slice(0, 2).join("»، «")}»`, weight: 70 });

  const md = (body.match(/\*\*[^*]+\*\*|^#{1,4}\s|^\s*[-•]\s|^\s*\d+[.)]\s/gm) || []).length;
  if (md >= 2) sig.push({ key: "markdown", label: "تنسيق عناوين/قوائم آلي (Markdown)", weight: Math.min(30, md * 6) });

  const titled = /^(العنوان|عنوان القصيدة|عنوان القصة|القصيدة|title)\s*[:：]/m.test(body);
  if (titled) sig.push({ key: "title_line", label: "سطر «العنوان:» داخل النص", weight: 18 });

  const cl = CLICHES.filter((p) => body.includes(p));
  const words = Math.max(1, body.split(/\s+/).length);
  const clDensity = (cl.length / words) * 100;
  if (cl.length >= 3 && clDensity > 0.8) sig.push({ key: "cliches", label: `كثافة عبارات قالبية (${cl.slice(0, 3).join("، ")})`, weight: Math.min(28, cl.length * 5) });

  const dashes = (body.match(/—/g) || []).length;
  if (dashes >= 3 && dashes / words > 0.015) sig.push({ key: "dashes", label: "إفراط في الشرطة الطويلة (—)", weight: 10 });

  // تجانس أطوال الجمل في النثر (النصوص البشرية أكثر تفاوتاً)
  if (["short_story", "flash", "folk_tale", "novel_chapter", "children_story", "khatira", "short_text", "letter"].includes(form)) {
    const lens = sentences(body).map((s) => s.split(/\s+/).length);
    if (lens.length >= 8) {
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
      const cv = sd / mean;
      if (cv < 0.28) sig.push({ key: "uniform", label: "تجانس غير طبيعي في أطوال الجمل", weight: 16 });
    }
  }

  // القياس أثناء الكتابة في التطبيق
  const pasted = Math.max(0, Number(t.pasted_chars) || 0);
  const len = body.length;
  if (len >= 120 && pasted / len >= 0.85) sig.push({ key: "pasted", label: "النص لُصق كاملاً تقريباً ولم يُكتب في المحرر", weight: 22 });
  const secs = Math.max(0, Number(t.compose_seconds) || 0);
  const typed = Math.max(0, Number(t.typed_chars) || 0);
  if (secs > 0 && typed > 400 && typed / secs > 18) sig.push({ key: "speed", label: "سرعة كتابة تفوق الكتابة اليدوية", weight: 12 });
  return sig;
}

// ─── الحَكَم اللغوي (اختياري) ──────────────────────────────────
let _ai: OpenAI | null | undefined;
function client(): OpenAI | null {
  if (_ai !== undefined) return _ai;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  _ai = apiKey && baseURL ? new OpenAI({ apiKey, baseURL }) : null;
  return _ai;
}
const JUDGE_PROMPT = `أنت خبير في تمييز النصوص الأدبية العربية المكتوبة بشرياً من تلك المولّدة بنماذج الذكاء الاصطناعي.
ستصلك قصة أو قصيدة أو خاطرة. قدّر احتمال أن تكون مولّدة آلياً (0 بشري تماماً، 100 آلي تماماً).
علامات الآلية: قوالب جاهزة، استعارات مستهلكة متتابعة، سلاسة باردة بلا تجربة شخصية، توازن مصطنع، خاتمة وعظية، غياب الخصوصية المحلية واللهجة.
علامات البشرية: تفاصيل حسية خاصة، أخطاء أو انكسارات طبيعية، لهجة محلية، تجربة شخصية، مفاجأة لغوية.
لا تحكم على الجودة. ردّ بـ JSON فقط: {"p": رقم, "why": "سبب قصير بالعربية"}`;

async function llmJudge(body: string, form: string): Promise<{ p: number; why: string } | null> {
  const ai = client();
  if (!ai) return null;
  try {
    const r = await ai.chat.completions.create({
      model: process.env.LIT_JUDGE_MODEL || "gpt-5-nano",
      max_completion_tokens: 120,
      messages: [{ role: "system", content: JUDGE_PROMPT }, { role: "user", content: `النوع: ${form}\n\n${body.slice(0, 3500)}` }],
    });
    const raw = r.choices[0]?.message?.content ?? "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    const p = Math.max(0, Math.min(100, Number(j.p)));
    return Number.isFinite(p) ? { p, why: String(j.why || "").slice(0, 160) } : null;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[lit] llm judge");
    return null;
  }
}

export async function assessOriginality(body: string, form: string, t: Telemetry): Promise<OriginalityResult> {
  const signals = styleSignals(body, form, t);
  let score = Math.min(100, signals.reduce((a, s) => a + s.weight, 0));
  const judge = await llmJudge(body, form);
  if (judge) {
    // الحَكَم يرجّح ولا يقرّر وحده: نأخذ متوسطاً مرجّحاً مع المؤشرات
    score = Math.round(Math.max(score, score * 0.45 + judge.p * 0.55));
    if (judge.p >= 70) signals.push({ key: "llm", label: `الفحص اللغوي: ${judge.why || "أسلوب آلي مرجّح"}`, weight: Math.round(judge.p / 4) });
  }
  const strong = signals.some((s) => s.key === "assistant");
  const verdict: OriginalityResult["verdict"] = strong || score >= 80 ? "ai" : score >= 45 ? "review" : "human";
  return { score: strong ? Math.max(score, 90) : score, verdict, signals, llm: judge?.p ?? null };
}
