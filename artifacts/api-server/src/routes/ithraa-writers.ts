// ════════════════════════════════════════════════════════════════
// ✒️ «ديوان الكُتّاب» داخل «إثراء» — نصوص أدبية أصيلة يكتبها الأعضاء:
//   قصة (قصيرة، ق.ق.ج، حكاية شعبية، أدب طفل، فصل رواية)
//   شعر (عمودي، تفعيلة، قصيدة نثر، عامي سوداني، هايكو)
//   نثر (خاطرة، نص قصير/ومضة، رسالة أدبية)
// كل نص يُكتب بعد «تعهّد الأصالة» ويُمنح «رقم توثيق» فريداً + بصمة SHA-256
// قابلة للتحقق علناً. فحص آلي للنسخ ولنصوص الذكاء الاصطناعي قبل المراجعة البشرية.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { moderateContent } from "../lib/content-moderator";
import { assessOriginality, minhash, similarity, textHash } from "../lib/lit-originality";
import { stripMarkup, stripControl, sanitizeLayout, validImageUrl, TRANSLATION_LANGS, type LitLayout } from "../lib/lit-markup";

const router = Router();
const API_BASE = (process.env.PUBLIC_API_BASE || "https://api-server-gilt-ten.vercel.app").replace(/\/$/, "");
export const LIT_VERIFY_URL = (no: string) => `${API_BASE}/api/public/lit/verify/${encodeURIComponent(no)}`;

export type LitForm = { key: string; label: string; group: "story" | "poetry" | "prose"; min: number; max: number; lines?: [number, number]; hint: string; about?: string; example?: { title: string; body: string }; innovative?: boolean };
export const LIT_GROUPS = [
  { key: "story", label: "القصة", icon: "book", color: "#7A2E3A" },
  { key: "poetry", label: "الشعر", icon: "musical-notes", color: "#1B4D6B" },
  { key: "prose", label: "الخواطر والنصوص", icon: "leaf", color: "#2D6A4F" },
] as const;
export const LIT_FORMS: LitForm[] = [
  { key: "short_story", label: "قصة قصيرة", group: "story", min: 400, max: 20000, hint: "حدث واحد وشخصيات قليلة وذروة ونهاية" },
  { key: "flash", label: "قصة قصيرة جداً (ق.ق.ج)", group: "story", min: 40, max: 700, hint: "تكثيف ومفارقة وقفلة مدهشة" },
  { key: "folk_tale", label: "حكاية شعبية", group: "story", min: 300, max: 15000, hint: "من التراث المحكي في الجزيرة والسودان بصياغتك" },
  { key: "children_story", label: "قصة للأطفال", group: "story", min: 200, max: 8000, hint: "لغة بسيطة وقيمة جميلة" },
  { key: "novel_chapter", label: "فصل من رواية", group: "story", min: 1000, max: 40000, hint: "فصل من عمل روائي تكتبه" },
  { key: "classical", label: "شعر عمودي", group: "poetry", min: 40, max: 12000, lines: [2, 400], hint: "بيتان على الأقل — افصل الصدر عن العجز بـ *** أو مسافات" },
  { key: "tafila", label: "شعر التفعيلة", group: "poetry", min: 60, max: 12000, lines: [4, 600], hint: "قصيدة حرة الأسطر على تفعيلة واحدة" },
  { key: "prose_poem", label: "قصيدة نثر", group: "poetry", min: 80, max: 10000, hint: "شعرية بلا وزن ولا قافية" },
  { key: "colloquial", label: "شعر عامي (دوبيت، مسدار، رباعيات…)", group: "poetry", min: 30, max: 12000, lines: [2, 600], hint: "بالعامية السودانية" },
  { key: "haiku", label: "هايكو", group: "poetry", min: 10, max: 220, lines: [3, 4], hint: "ثلاثة أسطر: مشهد من الطبيعة ولحظة دهشة" },
  { key: "khatira", label: "خاطرة", group: "prose", min: 80, max: 5000, hint: "بوح وجداني حر" },
  { key: "short_text", label: "نص قصير / ومضة", group: "prose", min: 20, max: 700, hint: "فكرة مكثّفة في سطور" },
  {
    key: "iltifata", label: "التفاتة", group: "prose", min: 20, max: 320, lines: [2, 5], innovative: true,
    hint: "فنّ مبتكر: عنوان مفتاحي وسطور قليلة (2–5) تنتهي بالتفاتة تقلب المعنى",
    about: "التفاتة فنّ نثري مكثّف: عنوانٌ يحمل المفتاح، ثم سطور قليلة تبني توقّعاً، وفي السطر الأخير التفاتةٌ مفاجئة تقلب المعنى وتعيد القارئ إلى العنوان.",
    example: { title: "خذلان", body: "عندما أخبرتك أني بخير..\nظننتك ستعيد السؤال؛\nلكنك صدقتني!" },
  },
  { key: "letter", label: "رسالة أدبية", group: "prose", min: 200, max: 8000, hint: "رسالة إلى شخص أو مكان أو زمن" },
];
const FORM = new Map(LIT_FORMS.map((f) => [f.key, f]));
const GROUP_LABEL: Record<string, string> = Object.fromEntries(LIT_GROUPS.map((g) => [g.key, g.label]));
const DUP_THRESHOLD = 0.6;
const REVIEW_SCOPE = "writers";

let ready: Promise<void> | null = null;
export function ensureWritersDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE SEQUENCE IF NOT EXISTS lit_doc_seq START 1`);
    await query(`CREATE TABLE IF NOT EXISTS lit_texts (
      id SERIAL PRIMARY KEY,
      doc_no VARCHAR(32) UNIQUE,
      doc_hash CHAR(64) NOT NULL,
      fingerprint INTEGER[] NOT NULL DEFAULT '{}',
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pen_name VARCHAR(80),
      form VARCHAR(20) NOT NULL,
      grp VARCHAR(10) NOT NULL,
      title VARCHAR(160) NOT NULL,
      body TEXT NOT NULL,
      dedication VARCHAR(200),
      pledge_signature VARCHAR(120) NOT NULL,
      pledge_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pledge_ip CHAR(16),
      ai_score SMALLINT NOT NULL DEFAULT 0,
      ai_verdict VARCHAR(8) NOT NULL DEFAULT 'human',
      ai_signals JSONB NOT NULL DEFAULT '[]',
      ai_llm SMALLINT,
      pasted_ratio REAL,
      compose_seconds INTEGER,
      appeal BOOLEAN NOT NULL DEFAULT FALSE,
      appeal_note VARCHAR(400),
      status VARCHAR(12) NOT NULL DEFAULT 'pending',
      review_note TEXT,
      reviewed_by INTEGER,
      reviewed_at TIMESTAMPTZ,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      contest_id INTEGER,
      views INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at TIMESTAMPTZ
    )`);
    // مرفقات النص: ترجمة وصورة وتفضيلات العرض (التنسيق داخل body بعلامات lit-markup)
    await query(`ALTER TABLE lit_texts
      ADD COLUMN IF NOT EXISTS translation TEXT,
      ADD COLUMN IF NOT EXISTS translation_lang VARCHAR(8),
      ADD COLUMN IF NOT EXISTS translation_by VARCHAR(120),
      ADD COLUMN IF NOT EXISTS image_url TEXT,
      ADD COLUMN IF NOT EXISTS image_caption VARCHAR(200),
      ADD COLUMN IF NOT EXISTS layout JSONB`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lit_browse ON lit_texts (status, grp, form, published_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lit_author ON lit_texts (author_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_lit_hash ON lit_texts (doc_hash)`);
    await query(`CREATE TABLE IF NOT EXISTS lit_likes (
      text_id INTEGER NOT NULL REFERENCES lit_texts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (text_id, user_id)
    )`);
  })().catch((e) => { ready = null; throw e; }));
}

// ─── الصلاحيات ───────────────────────────────────────────────
/** مراجع الديوان: مسؤولو التطبيق، أو مشرف «إثراء» على كل الرفوف أو على نطاق «writers» */
export async function isWritersReviewer(u: SessionUser | null): Promise<boolean> {
  if (!u) return false;
  if (isStaff(u)) return true;
  try {
    const r = await query(`SELECT categories FROM ithraa_moderators WHERE user_id=$1`, [u.id]);
    if (!r.rows[0]) return false;
    const c: string[] | null = r.rows[0].categories;
    return !c || !c.length || c.includes(REVIEW_SCOPE);
  } catch { return false; }
}

// ─── أدوات ───────────────────────────────────────────────────
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
async function nextDocNo(): Promise<string> {
  const r = await query(`SELECT nextval('lit_doc_seq') AS n`);
  return `HSW-LIT-${new Date().getFullYear()}-${String(r.rows[0].n).padStart(6, "0")}`;
}
function ipTag(req: Request): string {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  return createHash("sha256").update(`lit:${ip}`).digest("hex").slice(0, 16);
}
function lines(body: string) { return body.split("\n").map((l) => l.trim()).filter(Boolean); }
/** يتحقق من الطول والأسطر على النص الصافي (بعد نزع علامات التنسيق) */
export function validateBody(form: LitForm, raw: string): string | null {
  const body = stripMarkup(raw);
  const len = body.length;
  if (len < form.min) return `النص قصير على «${form.label}» — ${form.min} حرفاً على الأقل`;
  if (len > form.max) return `النص أطول من المسموح لـ«${form.label}» (${form.max} حرف)`;
  if (form.lines) {
    const n = lines(body).length;
    if (n < form.lines[0] || n > form.lines[1]) {
      if (form.key === "iltifata") return "التفاتة من سطرين إلى خمسة أسطر، آخرها يحمل الالتفاتة";
      return form.key === "haiku" ? "الهايكو ثلاثة أسطر (أو أربعة على الأكثر)" : `«${form.label}» يحتاج ${form.lines[0]} أسطر على الأقل`;
    }
  }
  return null;
}
const STRICT_BAD = ["شرموطة", "منيوك", "متناك", "ابن الشرموطة", "نيك", "عرص"];

// ─── المرفقات (ترجمة/صورة/تنسيق العرض) ─────────────────────────
export type LitAttachments = {
  translation: string | null; translation_lang: string | null; translation_by: string | null;
  image_url: string | null; image_caption: string | null; layout: LitLayout | null;
};
/** يقرأ المرفقات من الطلب ويتحقق منها. partial=true: الحقول الغائبة لا تُعدَّل (للتحديث) */
export function parseAttachments(b: Record<string, any>, form: LitForm, partial = false): { error: string } | { value: Partial<LitAttachments> } {
  const out: Partial<LitAttachments> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  if (!partial || has("translation") || has("translation_lang") || has("translation_by")) {
    const tr = stripControl(String(b.translation ?? "")).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
    if (tr) {
      if (tr.length > form.max * 2) return { error: `الترجمة أطول من المسموح (${form.max * 2} حرف)` };
      if (tr.length < 2) return { error: "الترجمة قصيرة جداً" };
      const lang = String(b.translation_lang ?? "");
      if (!(TRANSLATION_LANGS as readonly string[]).includes(lang)) return { error: "اختر لغة الترجمة" };
      out.translation = tr; out.translation_lang = lang;
      out.translation_by = clean(stripControl(b.translation_by), 120) || null;
    } else { out.translation = null; out.translation_lang = null; out.translation_by = null; }
  }
  if (!partial || has("image_url")) {
    const raw = String(b.image_url ?? "").trim();
    if (raw) {
      const url = validImageUrl(raw);
      if (!url) return { error: "رابط الصورة غير صالح — يُقبل https فقط" };
      out.image_url = url;
    } else out.image_url = null;
  }
  if (!partial || has("image_caption")) out.image_caption = clean(stripControl(b.image_caption), 200) || null;
  if (out.image_url === null) out.image_caption = null;
  if (!partial || has("layout")) out.layout = sanitizeLayout(b.layout);
  return { value: out };
}
/** فحص الإشراف على نصوص المرفقات (الترجمة والتعليق) */
async function moderateAttachments(a: Partial<LitAttachments>): Promise<string | null> {
  const txt = [a.translation, a.image_caption, a.translation_by].filter(Boolean).join("\n");
  if (!txt) return null;
  if (STRICT_BAD.some((w) => txt.includes(w))) return "تحتوي المرفقات على ألفاظ غير لائقة";
  const mod = await moderateContent(txt.slice(0, 1800));
  return mod.allowed ? null : (mod.reason || "محتوى المرفقات غير مسموح");
}

export function litRow(r: Record<string, any>, opts: { full?: boolean; reveal?: boolean; liked?: boolean } = {}) {
  const f = FORM.get(r.form);
  const plain = stripMarkup(String(r.body || ""));
  return {
    id: r.id, doc_no: r.doc_no || null, doc_hash: r.doc_hash, form: r.form, form_label: f?.label ?? r.form, group: r.grp, group_label: GROUP_LABEL[r.grp] ?? r.grp,
    title: r.title, excerpt: plain.slice(0, 260), ...(opts.full ? { body: r.body, dedication: r.dedication || null } : {}),
    image_url: r.image_url || null, image_caption: r.image_caption || null, layout: r.layout || null,
    has_translation: !!r.translation, translation_lang: r.translation_lang || null,
    ...(opts.full ? { translation: r.translation || null, translation_by: r.translation_by || null } : {}),
    author_id: r.author_id, author_name: r.pen_name || r.author_name || "كاتب", author_avatar: r.author_avatar ?? null,
    status: r.status, featured: !!r.featured, views: r.views, likes: r.likes, liked: !!opts.liked,
    created_at: r.created_at, published_at: r.published_at, pledge_at: r.pledge_at, contest_id: r.contest_id,
    lines: r.grp === "poetry" ? lines(plain).length : null,
    words: plain.split(/\s+/).filter(Boolean).length,
    verify_url: r.doc_no ? LIT_VERIFY_URL(r.doc_no) : null,
    ...(opts.reveal ? {
      review_note: r.review_note || null, ai_score: r.ai_score, ai_verdict: r.ai_verdict, ai_signals: r.ai_signals || [],
      appeal: !!r.appeal, appeal_note: r.appeal_note || null, pasted_ratio: r.pasted_ratio, reviewer_name: r.reviewer_name ?? null,
    } : {}),
  };
}
const SELECT = `SELECT t.*, u.name AS author_name, u.avatar_url AS author_avatar, rv.name AS reviewer_name
  FROM lit_texts t JOIN users u ON u.id=t.author_id LEFT JOIN users rv ON rv.id=t.reviewed_by`;

export async function notifyLit(userIds: number[], title: string, body: string, data: Record<string, unknown>) {
  const ids = [...new Set(userIds.filter((x) => Number.isFinite(x) && x > 0))];
  if (!ids.length) return;
  const payload = { screen: "writers", ...data };
  try {
    await query(`INSERT INTO notifications (user_id, type, title, body, data) SELECT u, 'lit', $2, $3, $4 FROM UNNEST($1::int[]) AS u`, [ids, title, body, JSON.stringify(payload)]);
  } catch { /* */ }
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [ids]);
    for (let i = 0; i < rows.length; i += 90) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
        body: JSON.stringify(rows.slice(i, i + 90).map((r: any) => ({ to: r.token, title, body, sound: "default", data: payload }))),
      }).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[lit] push"); }
}
async function reviewerIds(): Promise<number[]> {
  const r = await query(
    `SELECT user_id AS id FROM ithraa_moderators WHERE categories IS NULL OR cardinality(categories)=0 OR $1 = ANY(categories)
     UNION SELECT id FROM users WHERE role='admin' AND COALESCE(is_banned,false)=false`, [REVIEW_SCOPE]).catch(() => ({ rows: [] as any[] }));
  return r.rows.map((x: any) => Number(x.id));
}
function fail(res: Response, err: unknown, tag: string) {
  logger.error({ err }, `lit/${tag}`);
  return res.status(500).json({ error: "حدث خطأ في الخادم" });
}

// ─── الإنشاء (يُستخدم أيضاً لمشاركات المسابقة) ───────────────────
export type CreateTextInput = {
  user: SessionUser; req: Request; form: LitForm; title: string; body: string; pen_name: string | null; dedication: string | null;
  signature: string; telemetry: Record<string, unknown>; contest_id?: number | null; direct?: boolean;
  attachments?: Partial<LitAttachments>;
};
export type CreateTextOutcome =
  | { ok: true; row: Record<string, any> }
  | { ok: false; status: number; error: string; code?: string; extra?: Record<string, unknown> };

export async function createLitText(i: CreateTextInput): Promise<CreateTextOutcome> {
  // البصمة والتشابه والإشراف والأصالة على النص الصافي — التنسيق لا يغيّر النتيجة
  const plain = stripMarkup(i.body);
  const hash = textHash(plain);
  // 1) تطابق حرفي مع نص موثّق
  const same = (await query(`SELECT id, doc_no, author_id FROM lit_texts WHERE doc_hash=$1 AND status <> 'ai_flagged' LIMIT 1`, [hash])).rows[0];
  if (same) {
    return same.author_id === i.user.id
      ? { ok: false, status: 409, code: "duplicate_own", error: `سبق أن وثّقت هذا النص برقم ${same.doc_no ?? "—"}`, extra: { doc_no: same.doc_no } }
      : { ok: false, status: 409, code: "copied", error: "هذا النص موثّق مسبقاً باسم كاتب آخر — لا يُقبل النص المنقول" };
  }
  // 2) تشابه عالٍ (اقتباس/نقل مع تعديل بسيط)
  const fp = minhash(plain);
  const cand = await query(`SELECT id, doc_no, author_id, fingerprint FROM lit_texts WHERE form=$1 AND status <> 'ai_flagged' ORDER BY id DESC LIMIT 4000`, [i.form.key]);
  for (const c of cand.rows) {
    const sim = similarity(fp, c.fingerprint || []);
    if (sim >= DUP_THRESHOLD) {
      return c.author_id === i.user.id
        ? { ok: false, status: 409, code: "duplicate_own", error: `النص مطابق تقريباً لنصك الموثّق ${c.doc_no ?? ""} — عدّل عليه بوضوح أو اكتب نصاً جديداً`, extra: { doc_no: c.doc_no } }
        : { ok: false, status: 409, code: "copied", error: `النص يتطابق بنسبة ${Math.round(sim * 100)}% مع نص موثّق لكاتب آخر` };
    }
  }
  // 3) المحتوى المسيء (قائمة مخففة للأدب + الفحص العام)
  if (STRICT_BAD.some((w) => plain.includes(w) || i.title.includes(w))) return { ok: false, status: 400, error: "يحتوي النص على ألفاظ غير لائقة" };
  const mod = await moderateContent(`${i.title}\n${plain.slice(0, 1800)}`);
  if (!mod.allowed) return { ok: false, status: 400, error: mod.reason || "المحتوى غير مسموح" };
  const att = i.attachments || {};
  const attBad = await moderateAttachments(att);
  if (attBad) return { ok: false, status: 400, error: attBad };
  // 4) الأصالة (الذكاء الاصطناعي)
  const t = i.telemetry || {};
  const orig = await assessOriginality(plain, i.form.key, { pasted_chars: Number(t.pasted_chars), typed_chars: Number(t.typed_chars), compose_seconds: Number(t.compose_seconds) });
  const pasted = plain.length ? Math.min(1, Math.max(0, Number(t.pasted_chars) || 0) / plain.length) : 0;
  const flagged = orig.verdict === "ai";
  const status = flagged ? "ai_flagged" : i.contest_id ? "contest" : (i.direct && orig.verdict === "human") ? "approved" : "pending";
  const docNo = flagged ? null : await nextDocNo();
  const { rows } = await query(
    `INSERT INTO lit_texts (doc_no, doc_hash, fingerprint, author_id, pen_name, form, grp, title, body, dedication, pledge_signature, pledge_ip,
       ai_score, ai_verdict, ai_signals, ai_llm, pasted_ratio, compose_seconds, status, contest_id, reviewed_by, reviewed_at, published_at,
       translation, translation_lang, translation_by, image_url, image_caption, layout)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) RETURNING *`,
    [docNo, hash, fp, i.user.id, i.pen_name, i.form.key, i.form.group, i.title, i.body, i.dedication, i.signature, ipTag(i.req),
     orig.score, orig.verdict, JSON.stringify(orig.signals), orig.llm, pasted, Math.round(Number(t.compose_seconds) || 0) || null,
     status, i.contest_id ?? null, status === "approved" ? i.user.id : null, status === "approved" ? new Date() : null, status === "approved" ? new Date() : null,
     att.translation ?? null, att.translation_lang ?? null, att.translation ? (att.translation_by || i.pen_name || i.user.name || null) : null,
     att.image_url ?? null, att.image_url ? (att.image_caption ?? null) : null, att.layout ? JSON.stringify(att.layout) : null],
  );
  if (flagged) {
    return { ok: false, status: 422, code: "ai_flagged", error: "رجّح الفحص الآلي أن النص مولَّد بالذكاء الاصطناعي، فلم يُوثَّق.",
      extra: { id: rows[0].id, score: orig.score, signals: orig.signals.map((s) => s.label) } };
  }
  return { ok: true, row: rows[0] };
}

export function parsePledge(b: Record<string, any>, user: SessionUser): { error: string } | { signature: string } {
  const p = b.pledge || {};
  if (p.original !== true || p.not_copied !== true || p.no_ai !== true) return { error: "يجب الإقرار بالتعهدات الثلاث قبل التوثيق" };
  const signature = clean(p.signature, 120);
  if (signature.length < 3) return { error: "اكتب اسمك الكامل توقيعاً على التعهّد" };
  void user;
  return { signature };
}

// ─── الواجهات ────────────────────────────────────────────────
router.get("/lit/meta", async (req: Request, res: Response) => {
  try {
    await ensureWritersDb();
    const me = await sessionUser(req);
    const reviewer = await isWritersReviewer(me);
    const counts = await query(`SELECT form, COUNT(*)::int AS n FROM lit_texts WHERE status='approved' GROUP BY form`);
    const byForm: Record<string, number> = {};
    for (const r of counts.rows) byForm[r.form] = r.n;
    const writers = await query(`SELECT COUNT(DISTINCT author_id)::int AS n FROM lit_texts WHERE status='approved'`);
    let pending = 0;
    if (reviewer) pending = (await query(`SELECT COUNT(*)::int AS n FROM lit_texts WHERE status='pending'`)).rows[0].n;
    let supervisor = false;
    if (me) supervisor = isStaff(me) || !!(await query(`SELECT 1 FROM lit_contest_supervisors WHERE user_id=$1`, [me.id]).catch(() => ({ rows: [] }))).rows.length;
    return res.json({
      groups: LIT_GROUPS.map((g) => ({ ...g, count: LIT_FORMS.filter((f) => f.group === g.key).reduce((a, f) => a + (byForm[f.key] || 0), 0) })),
      forms: LIT_FORMS.map((f) => ({ ...f, count: byForm[f.key] || 0 })),
      totals: { texts: Object.values(byForm).reduce((a, b) => a + b, 0), writers: writers.rows[0].n },
      me: me ? { signed_in: true, can_review: reviewer, pending, is_app_admin: isStaff(me), contest_supervisor: supervisor, name: me.name } : { signed_in: false, can_review: false },
    });
  } catch (err) { return fail(res, err, "meta"); }
});

router.get("/lit/texts", async (req: Request, res: Response) => {
  try {
    await ensureWritersDb();
    const me = await sessionUser(req);
    const q = req.query as Record<string, string | undefined>;
    const where = ["t.status='approved'"]; const params: unknown[] = [];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
    if (q.group && LIT_GROUPS.some((g) => g.key === q.group)) add("t.grp=?", q.group);
    if (q.form && FORM.has(q.form)) add("t.form=?", q.form);
    if (q.author && /^\d+$/.test(q.author)) add("t.author_id=?", Number(q.author));
    if (q.featured === "1") where.push("t.featured=true");
    if (q.q && q.q.trim()) {
      params.push(`%${q.q.trim().slice(0, 60).replace(/[%_\\]/g, "\\$&")}%`);
      const p = `$${params.length}`;
      where.push(`(t.title ILIKE ${p} OR t.pen_name ILIKE ${p} OR u.name ILIKE ${p} OR t.body ILIKE ${p} OR t.doc_no ILIKE ${p})`);
    }
    const order = q.sort === "popular" ? "(t.likes*3 + t.views) DESC, t.published_at DESC" : "t.published_at DESC NULLS LAST";
    const limit = Math.min(Math.max(parseInt(q.limit || "30", 10) || 30, 1), 100);
    const offset = Math.max(parseInt(q.offset || "0", 10) || 0, 0);
    params.push(me?.id ?? 0);
    const { rows } = await query(
      `SELECT x.*, EXISTS(SELECT 1 FROM lit_likes l WHERE l.text_id=x.id AND l.user_id=$${params.length}) AS liked FROM (${SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}) x`, params);
    return res.json({ texts: rows.map((r: any) => litRow(r, { liked: r.liked })), has_more: rows.length === limit });
  } catch (err) { return fail(res, err, "texts"); }
});

router.get("/lit/writers/top", async (_req: Request, res: Response) => {
  try {
    await ensureWritersDb();
    const { rows } = await query(
      `SELECT t.author_id AS id, COALESCE(MAX(t.pen_name), MAX(u.name)) AS name, MAX(u.avatar_url) AS avatar_url, COUNT(*)::int AS texts, COALESCE(SUM(t.likes),0)::int AS likes
       FROM lit_texts t JOIN users u ON u.id=t.author_id WHERE t.status='approved' GROUP BY t.author_id ORDER BY likes DESC, texts DESC LIMIT 12`);
    return res.json({ writers: rows });
  } catch (err) { return fail(res, err, "top"); }
});

router.get("/lit/mine", async (req: Request, res: Response) => {
  try {
    await ensureWritersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const { rows } = await query(`${SELECT} WHERE t.author_id=$1 ORDER BY t.created_at DESC LIMIT 300`, [me.id]);
    return res.json({ texts: rows.map((r: any) => litRow(r, { reveal: true })) });
  } catch (err) { return fail(res, err, "mine"); }
});

router.get("/lit/texts/:id", async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureWritersDb();
    const me = await sessionUser(req);
    const r = (await query(`${SELECT} WHERE t.id=$1`, [Number(req.params.id)])).rows[0];
    if (!r) return res.status(404).json({ error: "غير موجود" });
    const owner = !!me && me.id === r.author_id;
    const reviewer = await isWritersReviewer(me);
    // مشاركات المسابقة مجهولة حتى إعلان النتائج — لا تُعرض لغير صاحبها
    if (r.status !== "approved" && !owner && !(reviewer && r.status !== "contest")) return res.status(404).json({ error: "غير موجود" });
    if (r.status === "approved" && !owner) await query(`UPDATE lit_texts SET views=views+1 WHERE id=$1`, [r.id]).catch(() => {});
    const liked = me ? (await query(`SELECT 1 FROM lit_likes WHERE text_id=$1 AND user_id=$2`, [r.id, me.id])).rows.length > 0 : false;
    const more = r.status === "approved"
      ? (await query(`${SELECT} WHERE t.status='approved' AND t.author_id=$1 AND t.id<>$2 ORDER BY t.published_at DESC LIMIT 6`, [r.author_id, r.id])).rows.map((x: any) => litRow(x))
      : [];
    return res.json({ text: litRow(r, { full: true, reveal: owner || reviewer, liked }), is_owner: owner, can_review: reviewer, more });
  } catch (err) { return fail(res, err, "text"); }
});

router.post("/lit/texts", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureWritersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لتكتب في الديوان" });
    if (me.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    const b = req.body || {};
    const form = FORM.get(String(b.form));
    if (!form) return res.status(400).json({ error: "اختر نوع النص" });
    const title = clean(b.title, 160);
    if (title.length < 2) return res.status(400).json({ error: "اكتب عنواناً للنص" });
    const body = stripControl(String(b.body ?? "")).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
    const bad = validateBody(form, body);
    if (bad) return res.status(400).json({ error: bad });
    const att = parseAttachments(b, form);
    if ("error" in att) return res.status(400).json({ error: att.error });
    const pledge = parsePledge(b, me);
    if ("error" in pledge) return res.status(400).json({ error: pledge.error });
    const today = await query(`SELECT COUNT(*)::int AS n FROM lit_texts WHERE author_id=$1 AND created_at > NOW() - INTERVAL '1 day'`, [me.id]);
    if (today.rows[0].n >= 10) return res.status(429).json({ error: "وصلت لحد النصوص اليومي (10) — عُد غداً" });
    const out = await createLitText({
      user: me, req, form, title, body, pen_name: clean(b.pen_name, 80) || null, dedication: clean(b.dedication, 200) || null,
      signature: pledge.signature, telemetry: b.telemetry || {}, direct: await isWritersReviewer(me), attachments: att.value,
    });
    if (!out.ok) return res.status(out.status).json({ error: out.error, code: out.code, ...(out.extra || {}) });
    const row = out.row;
    if (row.status === "pending") {
      void notifyLit((await reviewerIds()).filter((x) => x !== me.id), "نص جديد في ديوان الكُتّاب", `${form.label}: ${title}${row.ai_verdict === "review" ? " — يحتاج تدقيق أصالة" : ""}`, { id: row.id, tab: "review" });
    }
    return res.status(201).json({
      text: litRow({ ...row, author_name: me.name }, { full: true, reveal: true }),
      message: row.status === "approved" ? "وُثّق النص ونُشر" : "وُثّق النص برقمه الخاص وأُرسل لمراجعة المشرف",
    });
  } catch (err) { return fail(res, err, "create"); }
});

// تحديث مرفقات النص وتنسيق عرضه (الترجمة، الصورة، المحاذاة/الحجم/التباعد).
// متن النص نفسه لا يُعدَّل هنا: بصمته موثّقة برقم التوثيق.
router.patch("/lit/texts/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureWritersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const cur = (await query(`SELECT * FROM lit_texts WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    if (cur.author_id !== me.id) return res.status(403).json({ error: "للكاتب فقط" });
    if (["contest", "withdrawn"].includes(cur.status)) return res.status(409).json({ error: "لا يمكن تعديل مرفقات هذا النص" });
    const b = req.body || {};
    if ("body" in b || "title" in b) return res.status(400).json({ error: "متن النص وعنوانه موثّقان ولا يُعدَّلان — يمكن تعديل المرفقات والتنسيق فقط" });
    const form = FORM.get(cur.form)!;
    const att = parseAttachments(b, form, true);
    if ("error" in att) return res.status(400).json({ error: att.error });
    const v = att.value;
    if (!Object.keys(v).length) return res.status(400).json({ error: "لا توجد تغييرات" });
    const bad = await moderateAttachments(v);
    if (bad) return res.status(400).json({ error: bad });
    if (v.translation && !v.translation_by) v.translation_by = cur.pen_name || me.name || null;
    const cols = Object.keys(v) as (keyof LitAttachments)[];
    const vals = cols.map((k) => (k === "layout" ? (v.layout ? JSON.stringify(v.layout) : null) : v[k] ?? null));
    const row = (await query(`UPDATE lit_texts SET ${cols.map((k, n) => `${k}=$${n + 2}`).join(", ")} WHERE id=$1 RETURNING *`, [cur.id, ...vals])).rows[0];
    // صورة أو ترجمة جديدة على نص منشور: يُبلَّغ المشرفون للاطلاع
    if (cur.status === "approved" && ((v.image_url && v.image_url !== cur.image_url) || (v.translation && v.translation !== cur.translation))) {
      void notifyLit((await reviewerIds()).filter((x) => x !== me.id), "مرفقات جديدة على نص منشور", `«${cur.title}» — ${v.image_url && v.image_url !== cur.image_url ? "صورة" : "ترجمة"} أضافها الكاتب`, { id: cur.id });
    }
    return res.json({ text: litRow({ ...row, author_name: me.name }, { full: true, reveal: true }), message: "حُفظت المرفقات" });
  } catch (err) { return fail(res, err, "update"); }
});

// طلب مراجعة بشرية لنص رفضه الفحص الآلي
router.post("/lit/texts/:id/appeal", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureWritersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const note = clean(req.body?.note, 400);
    if (note.length < 10) return res.status(400).json({ error: "اشرح باختصار كيف كتبت النص (10 أحرف على الأقل)" });
    const { rows } = await query(
      `UPDATE lit_texts SET status='pending', appeal=true, appeal_note=$1 WHERE id=$2 AND author_id=$3 AND status='ai_flagged' AND appeal=false RETURNING *`,
      [note, Number(req.params.id), me.id]);
    if (!rows[0]) return res.status(409).json({ error: "لا يمكن طلب المراجعة لهذا النص" });
    void notifyLit(await reviewerIds(), "طلب مراجعة أصالة", `«${rows[0].title}» — الكاتب يعترض على نتيجة الفحص الآلي`, { id: rows[0].id, tab: "review" });
    return res.json({ ok: true, message: "أُرسل طلبك للمشرف — سيُراجع النص بشرياً" });
  } catch (err) { return fail(res, err, "appeal"); }
});

router.post("/lit/texts/:id/like", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureWritersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const id = Number(req.params.id);
    const ins = await query(`INSERT INTO lit_likes (text_id, user_id) SELECT $1,$2 WHERE EXISTS (SELECT 1 FROM lit_texts WHERE id=$1 AND status='approved') ON CONFLICT DO NOTHING RETURNING 1`, [id, me.id]);
    if (!ins.rows.length) await query(`DELETE FROM lit_likes WHERE text_id=$1 AND user_id=$2`, [id, me.id]);
    const c = await query(`UPDATE lit_texts SET likes=(SELECT COUNT(*) FROM lit_likes WHERE text_id=$1) WHERE id=$1 RETURNING likes`, [id]);
    return res.json({ liked: ins.rows.length > 0, likes: c.rows[0]?.likes ?? 0 });
  } catch (err) { return fail(res, err, "like"); }
});

router.delete("/lit/texts/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureWritersDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const cur = (await query(`SELECT id, author_id, status FROM lit_texts WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    const reviewer = await isWritersReviewer(me);
    if (cur.status === "contest") return res.status(409).json({ error: "النص مشارك في مسابقة — اطلب سحبه من مشرف المسابقة" });
    if (!reviewer && cur.author_id !== me.id) return res.status(403).json({ error: "غير مسموح" });
    // نحتفظ بسجل التوثيق: النص المحذوف يُخفى ولا يُمسح، ليبقى رقم التوثيق قابلاً للتحقق
    await query(`UPDATE lit_texts SET status='withdrawn', featured=false WHERE id=$1`, [cur.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "delete"); }
});

// ─── المراجعة ────────────────────────────────────────────────
router.get("/lit/review", async (req: Request, res: Response) => {
  try {
    await ensureWritersDb();
    const me = await sessionUser(req);
    if (!(await isWritersReviewer(me))) return res.status(403).json({ error: "للمشرفين فقط" });
    const map: Record<string, string> = { pending: "t.status='pending'", approved: "t.status='approved'", rejected: "t.status='rejected'", flagged: "t.status='ai_flagged'" };
    const s = map[String(req.query.status)] ? String(req.query.status) : "pending";
    const { rows } = await query(`${SELECT} WHERE ${map[s]} ORDER BY ${s === "pending" ? "t.appeal DESC, t.ai_score DESC, t.created_at ASC" : "t.created_at DESC"} LIMIT 100`);
    const c = await query(`SELECT status, COUNT(*)::int AS n FROM lit_texts GROUP BY status`);
    const counts: Record<string, number> = {};
    for (const r of c.rows) counts[r.status === "ai_flagged" ? "flagged" : r.status] = r.n;
    return res.json({ texts: rows.map((r: any) => litRow(r, { full: true, reveal: true })), counts });
  } catch (err) { return fail(res, err, "review"); }
});

router.post("/lit/texts/:id/review", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureWritersDb();
    const me = await sessionUser(req);
    if (!(await isWritersReviewer(me))) return res.status(403).json({ error: "للمشرفين فقط" });
    const cur = (await query(`SELECT * FROM lit_texts WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    if (cur.status === "contest") return res.status(409).json({ error: "مشاركة مسابقة — تُدار من لوحة المسابقة" });
    const action = String(req.body?.action || "");
    const note = clean(req.body?.note, 400) || null;
    let row: any;
    if (action === "approve") {
      const docNo = cur.doc_no || await nextDocNo();
      row = (await query(`UPDATE lit_texts SET status='approved', doc_no=$1, review_note=$2, reviewed_by=$3, reviewed_at=NOW(), published_at=COALESCE(published_at, NOW()) WHERE id=$4 RETURNING *`,
        [docNo, note, me!.id, cur.id])).rows[0];
      void notifyLit([cur.author_id], "نُشر نصك في ديوان الكُتّاب ✒️", `«${cur.title}» منشور الآن — رقم التوثيق ${docNo}`, { id: cur.id });
    } else if (action === "reject") {
      if (!note) return res.status(400).json({ error: "اكتب سبب الرفض" });
      row = (await query(`UPDATE lit_texts SET status='rejected', featured=false, review_note=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3 RETURNING *`, [note, me!.id, cur.id])).rows[0];
      void notifyLit([cur.author_id], "ملاحظة على نصك", `«${cur.title}»: ${note}`, { id: cur.id, tab: "mine" });
    } else if (action === "feature" || action === "unfeature") {
      if (cur.status !== "approved") return res.status(409).json({ error: "للمنشور فقط" });
      row = (await query(`UPDATE lit_texts SET featured=$1 WHERE id=$2 RETURNING *`, [action === "feature", cur.id])).rows[0];
      if (action === "feature") void notifyLit([cur.author_id], "نصك ضمن مختارات الديوان ⭐", `«${cur.title}»`, { id: cur.id });
    } else if (action === "unpublish") {
      row = (await query(`UPDATE lit_texts SET status='pending', featured=false, review_note=$1 WHERE id=$2 RETURNING *`, [note, cur.id])).rows[0];
    } else return res.status(400).json({ error: "إجراء غير معروف" });
    return res.json({ text: litRow(row, { reveal: true }) });
  } catch (err) { return fail(res, err, "review-act"); }
});

// ─── التحقق العلني من رقم التوثيق ─────────────────────────────
async function lookupDoc(no: string) {
  if (!/^HSW-LIT-\d{4}-\d{6}$/i.test(no)) return null;
  const r = await query(
    `SELECT t.id, t.doc_no, t.doc_hash, t.title, t.form, t.grp, t.status, t.pledge_at, t.published_at, t.pen_name, t.pledge_signature, t.contest_id, u.name AS author_name
     FROM lit_texts t JOIN users u ON u.id=t.author_id WHERE t.doc_no=$1`, [no.toUpperCase()]);
  return r.rows[0] || null;
}
router.get("/lit/verify/:no", async (req: Request, res: Response) => {
  try {
    await ensureWritersDb();
    const d = await lookupDoc(String(req.params.no));
    if (!d) return res.status(404).json({ valid: false });
    const visible = d.status === "approved";
    return res.json({
      valid: true, doc_no: d.doc_no, hash: d.doc_hash, documented_at: d.pledge_at, author: d.pen_name || d.author_name,
      form_label: FORM.get(d.form)?.label ?? d.form, status: d.status, title: visible ? d.title : null, text_id: visible ? d.id : null,
    });
  } catch (err) { return fail(res, err, "verify"); }
});

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
router.get("/public/lit/verify/:no", async (req: Request, res: Response) => {
  try {
    await ensureWritersDb();
    const d = await lookupDoc(String(req.params.no));
    const ok = !!d && d.status !== "ai_flagged";
    const statusLabel: Record<string, string> = { approved: "منشور في ديوان الكُتّاب", pending: "قيد المراجعة", contest: "مشاركة في مسابقة (مجهولة الهوية حتى إعلان النتائج)", rejected: "غير منشور", withdrawn: "سحبه الكاتب" };
    const date = d ? new Date(d.pledge_at).toLocaleString("ar-EG", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Khartoum" }) : "";
    const hidden = d && d.status === "contest";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(ok ? 200 : 404).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>التحقق من توثيق نص — حصاحيصاوي</title>
<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:#F4F1EA;color:#1A2C25;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{max-width:460px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.08);border:1px solid #E6DFCF}
.h{background:linear-gradient(135deg,#0F2E44,#1B4D6B);color:#fff;padding:22px;text-align:center}.h b{display:block;font-size:20px}.h span{opacity:.8;font-size:13px}
.s{display:inline-block;margin-top:12px;padding:6px 14px;border-radius:20px;font-weight:700;font-size:14px;background:${ok ? "#E7F6EE;color:#0E7C4A" : "#FDECEC;color:#B42318"}}
.b{padding:18px 22px}.r{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px dashed #E6DFCF;font-size:14px}.r:last-child{border:0}.k{color:#6B7B73}.v{font-weight:700;text-align:left;word-break:break-all}
.no{font-family:ui-monospace,Menlo,monospace;letter-spacing:.5px;color:#1B4D6B}.f{font-size:12px;color:#6B7B73;padding:0 22px 18px;line-height:1.7}</style></head><body><div class="c">
<div class="h"><b>ديوان الكُتّاب — إثراء</b><span>منصة حصاحيصاوي · سجل توثيق النصوص الأدبية</span><br><div class="s">${ok ? "✓ رقم توثيق صحيح" : "✗ رقم غير موجود"}</div></div>
${ok ? `<div class="b">
<div class="r"><span class="k">رقم التوثيق</span><span class="v no">${esc(d.doc_no)}</span></div>
${hidden ? "" : `<div class="r"><span class="k">الكاتب</span><span class="v">${esc(d.pen_name || d.author_name)}</span></div>`}
${d.status === "approved" ? `<div class="r"><span class="k">العنوان</span><span class="v">${esc(d.title)}</span></div>` : ""}
<div class="r"><span class="k">النوع</span><span class="v">${esc(FORM.get(d.form)?.label ?? d.form)}</span></div>
<div class="r"><span class="k">تاريخ التوثيق</span><span class="v">${esc(date)}</span></div>
<div class="r"><span class="k">الحالة</span><span class="v">${esc(statusLabel[d.status] || d.status)}</span></div>
<div class="r"><span class="k">بصمة النص SHA-256</span><span class="v no" style="font-size:11px">${esc(d.doc_hash)}</span></div>
</div><div class="f">وثّق الكاتب هذا النص بعد تعهّد بأنه من تأليفه وليس منقولاً ولا مولَّداً بالذكاء الاصطناعي. البصمة تُحسب من النص نفسه، فأي تعديل عليه يغيّرها — ما يثبت أسبقية النص بتاريخ توثيقه.</div>` : `<div class="f" style="padding-top:18px">تأكد من كتابة الرقم بالصيغة HSW-LIT-السنة-الرقم.</div>`}
</div></body></html>`);
  } catch (err) { return fail(res, err, "verify-html"); }
});

export default router;
