// ════════════════════════════════════════════════════════════════
// 📚 «إثراء» — المكتبة الثقافية العامة في حصاحيصاوي
// كتب (ملف PDF/EPUB… أو رابط) ومقالات تُكتب داخل التطبيق، مصنّفة في رفوف.
// كل ما يرفعه الأعضاء يدخل «قائمة المراجعة» ولا يظهر للعامة إلا بعد موافقة:
//   • مسؤولو التطبيق (admin / moderator) — على كل الرفوف.
//   • «مشرفو إثراء» يعيّنهم مسؤول التطبيق — على كل الرفوف أو رفوف محددة.
// المشرف ينشر مباشرةً في الرفوف التي يشرف عليها. يُكافأ صاحب المساهمة المقبولة
// بنقاط في رصيد التطوع، ويصله إشعار بالقبول أو بسبب الرفض.
// الملفات تُرفع عبر نفس مسار المكتبة المنهجية (/curriculum/upload-target).
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { checkContent } from "../lib/content-moderator";
import { curriculumMaxFileMb, deleteBookBlob } from "./curriculum-upload";

const router = Router();

export const ITHRAA_SHELVES: { key: string; label: string; icon: string; color: string }[] = [
  { key: "quran",      label: "القرآن وعلومه",            icon: "book",              color: "#0E7C5A" },
  { key: "islamic",    label: "الفكر والثقافة الإسلامية",  icon: "moon",              color: "#1F6F5C" },
  { key: "literature", label: "الأدب والشعر",              icon: "create",            color: "#8E3B46" },
  { key: "novels",     label: "الروايات والقصص",           icon: "library",           color: "#6D4C8D" },
  { key: "sudan",      label: "تراث وتاريخ السودان",       icon: "flag",              color: "#B7791F" },
  { key: "history",    label: "التاريخ والحضارة",          icon: "hourglass",         color: "#7C5A2E" },
  { key: "science",    label: "العلوم والمعرفة",           icon: "flask",             color: "#1F5C8A" },
  { key: "tech",       label: "التقنية والحاسوب",          icon: "hardware-chip",     color: "#2F6FB0" },
  { key: "self",       label: "تطوير الذات",               icon: "trending-up",       color: "#C2580A" },
  { key: "health",     label: "الصحة والأسرة",             icon: "heart",             color: "#B4384B" },
  { key: "economy",    label: "الاقتصاد وريادة الأعمال",   icon: "briefcase",         color: "#2D6A4F" },
  { key: "law",        label: "القانون والمجتمع",          icon: "scale",             color: "#4A5568" },
  { key: "children",   label: "كتب الأطفال",               icon: "happy",             color: "#D69E2E" },
  { key: "languages",  label: "اللغات والترجمة",           icon: "language",          color: "#2B6CB0" },
  { key: "research",   label: "بحوث ورسائل جامعية",        icon: "school",            color: "#285E61" },
  { key: "general",    label: "متنوعات",                   icon: "albums",            color: "#5A6B7B" },
];
const SHELF_KEYS = new Set(ITHRAA_SHELVES.map((s) => s.key));
const KINDS = ["book", "article"] as const;
const LANGS = ["ar", "en", "other"] as const;
const RIGHTS = ["own", "public_domain", "permission"] as const;
const STATUSES = ["pending", "approved", "rejected"] as const;
const APPROVE_POINTS = Math.max(0, Number(process.env.ITHRAA_POINTS ?? 5) || 0);
const ARTICLE_MIN = 300;
const ARTICLE_MAX = 40000;

let ready: Promise<void> | null = null;
export function ensureIthraaDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS ithraa_items (
      id SERIAL PRIMARY KEY,
      kind VARCHAR(10) NOT NULL DEFAULT 'book',
      category VARCHAR(20) NOT NULL DEFAULT 'general',
      title VARCHAR(200) NOT NULL,
      author_name VARCHAR(160),
      description TEXT,
      body TEXT,
      cover_url TEXT,
      file_url TEXT,
      source VARCHAR(10),
      file_size BIGINT,
      file_format VARCHAR(10),
      language VARCHAR(6) NOT NULL DEFAULT 'ar',
      pages INTEGER,
      publish_year SMALLINT,
      rights VARCHAR(16) NOT NULL DEFAULT 'own',
      tags TEXT[] NOT NULL DEFAULT '{}',
      uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      uploader_name VARCHAR(120),
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      review_note TEXT,
      reviewed_by INTEGER,
      reviewed_at TIMESTAMPTZ,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      views INTEGER NOT NULL DEFAULT 0,
      downloads INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ithraa_browse ON ithraa_items (status, kind, category, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_ithraa_uploader ON ithraa_items (uploader_id)`);
    await query(`CREATE TABLE IF NOT EXISTS ithraa_moderators (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      categories TEXT[],
      note VARCHAR(200),
      assigned_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  })().catch((e) => { ready = null; throw e; }));
}

// ─── الصلاحيات ───────────────────────────────────────────────
type Scope = { all: boolean; shelves: string[]; isAppAdmin: boolean };
async function reviewScope(u: SessionUser | null): Promise<Scope | null> {
  if (!u) return null;
  if (isStaff(u)) return { all: true, shelves: [...SHELF_KEYS], isAppAdmin: true };
  const r = await query(`SELECT categories FROM ithraa_moderators WHERE user_id=$1`, [u.id]);
  if (!r.rows[0]) return null;
  const cats: string[] | null = r.rows[0].categories;
  if (!cats || !cats.length) return { all: true, shelves: [...SHELF_KEYS], isAppAdmin: false };
  return { all: false, shelves: cats.filter((c) => SHELF_KEYS.has(c)), isAppAdmin: false };
}
const canReview = (s: Scope | null, category: string) => !!s && (s.all || s.shelves.includes(category));

// ─── أدوات ───────────────────────────────────────────────────
function clean(v: unknown, max: number): string { return String(v ?? "").trim().slice(0, max); }
function cloudName(): string {
  return (process.env.CLOUDINARY_CLOUD_NAME ?? "").replace(/^CLOUDINARY_URL\s*=\s*/i, "").replace(/cloudinary:\/\/[^@]*@/i, "").trim();
}
/** نقبل ملفاتنا المرفوعة (Blob/Cloudinary في مجلد المكتبة) أو رابطاً خارجياً https. */
function classifyUrl(raw: unknown): { url: string; source: "upload" | "link" } | null {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 1000) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:") return null;
  if (u.hostname === "res.cloudinary.com") {
    const c = cloudName();
    return c && u.pathname.startsWith(`/${c}/`) && u.pathname.includes("/hasahisawi/curriculum/") ? { url: u.toString(), source: "upload" } : null;
  }
  if (/\.public\.blob\.vercel-storage\.com$/.test(u.hostname)) {
    return u.pathname.startsWith("/curriculum/") ? { url: u.toString(), source: "upload" } : null;
  }
  return { url: u.toString(), source: "link" };
}
function readMinutes(body: string | null): number {
  if (!body) return 0;
  return Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200));
}
function row(r: Record<string, any>, opts: { full?: boolean; reveal?: boolean } = {}) {
  const shelf = ITHRAA_SHELVES.find((s) => s.key === r.category);
  return {
    id: r.id, kind: r.kind, category: r.category, category_label: shelf?.label ?? r.category,
    title: r.title, author_name: r.author_name || null, description: r.description || "",
    excerpt: r.kind === "article" && r.body ? String(r.body).replace(/\s+/g, " ").slice(0, 220) : null,
    read_minutes: r.kind === "article" ? readMinutes(r.body) : null,
    ...(opts.full ? { body: r.body || null } : {}),
    cover_url: r.cover_url || null, has_file: !!r.file_url, source: r.source || null,
    file_size: r.file_size ? Number(r.file_size) : null, file_format: r.file_format || null,
    language: r.language, pages: r.pages, publish_year: r.publish_year, rights: r.rights, tags: r.tags || [],
    uploader_id: r.uploader_id, uploader_name: r.uploader_name || "عضو", uploader_avatar: r.uploader_avatar ?? null,
    status: r.status, featured: !!r.featured, views: r.views, downloads: r.downloads,
    created_at: r.created_at, reviewed_at: r.reviewed_at,
    ...(opts.reveal ? { review_note: r.review_note || null, reviewer_name: r.reviewer_name ?? null } : {}),
  };
}

async function notify(userIds: number[], title: string, body: string, data: Record<string, unknown>) {
  const ids = [...new Set(userIds.filter((x) => Number.isFinite(x) && x > 0))];
  if (!ids.length) return;
  const payload = { ...data, screen: "ithraa" };
  try {
    await query(`INSERT INTO notifications (user_id, type, title, body, data)
                 SELECT u, 'ithraa', $2, $3, $4 FROM UNNEST($1::int[]) AS u`, [ids, title, body, JSON.stringify(payload)]);
  } catch { /* لا نعطّل العملية */ }
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [ids]);
    for (let i = 0; i < rows.length; i += 90) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
        body: JSON.stringify(rows.slice(i, i + 90).map((r: any) => ({ to: r.token, title, body, sound: "default", data: payload }))),
      }).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[ithraa] push"); }
}
/** المراجعون المعنيون برفّ معيّن: مشرفو الرف + مشرفو كل الرفوف + مسؤولو التطبيق */
async function reviewersFor(category: string): Promise<number[]> {
  const r = await query(
    `SELECT user_id AS id FROM ithraa_moderators WHERE categories IS NULL OR cardinality(categories)=0 OR $1 = ANY(categories)
     UNION SELECT id FROM users WHERE role='admin' AND COALESCE(is_banned,false)=false`, [category]);
  return r.rows.map((x: any) => Number(x.id));
}

const SELECT_ITEM = `SELECT i.*, u.avatar_url AS uploader_avatar, rv.name AS reviewer_name
  FROM ithraa_items i LEFT JOIN users u ON u.id=i.uploader_id LEFT JOIN users rv ON rv.id=i.reviewed_by`;

function fail(res: Response, err: unknown, tag: string) {
  logger.error({ err }, `ithraa/${tag}`);
  return res.status(500).json({ error: "حدث خطأ في الخادم" });
}

// ─── القراءة ─────────────────────────────────────────────────
// GET /api/ithraa/meta — الرفوف بعدد المنشور + صلاحياتي + الإحصاء
router.get("/ithraa/meta", async (req: Request, res: Response) => {
  try {
    await ensureIthraaDb();
    const me = await sessionUser(req);
    const scope = await reviewScope(me);
    const { rows } = await query(`SELECT category, kind, COUNT(*)::int AS n FROM ithraa_items WHERE status='approved' GROUP BY category, kind`);
    const count: Record<string, { book: number; article: number }> = {};
    for (const r of rows) { (count[r.category] ??= { book: 0, article: 0 })[r.kind as "book" | "article"] = r.n; }
    let pending = 0;
    if (scope) {
      const p = await query(`SELECT COUNT(*)::int AS n FROM ithraa_items WHERE status='pending' AND ($1::boolean OR category = ANY($2::text[]))`, [scope.all, scope.shelves]);
      pending = p.rows[0].n;
    }
    const totals = { books: 0, articles: 0 };
    for (const c of Object.values(count)) { totals.books += c.book; totals.articles += c.article; }
    return res.json({
      shelves: ITHRAA_SHELVES.map((s) => ({ ...s, books: count[s.key]?.book || 0, articles: count[s.key]?.article || 0 })),
      totals, max_file_mb: curriculumMaxFileMb(), points: APPROVE_POINTS, article_min: ARTICLE_MIN,
      me: me ? { signed_in: true, can_review: !!scope, review_all: !!scope?.all, review_shelves: scope?.shelves ?? [], is_app_admin: !!scope?.isAppAdmin, pending } : { signed_in: false, can_review: false },
    });
  } catch (err) { return fail(res, err, "meta"); }
});

// GET /api/ithraa/items?kind=&category=&q=&sort=new|popular|featured&limit=&offset=
router.get("/ithraa/items", async (req: Request, res: Response) => {
  try {
    await ensureIthraaDb();
    const q = req.query as Record<string, string | undefined>;
    const where: string[] = ["i.status='approved'"]; const params: unknown[] = [];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
    if (q.kind && (KINDS as readonly string[]).includes(q.kind)) add("i.kind=?", q.kind);
    if (q.category && SHELF_KEYS.has(q.category)) add("i.category=?", q.category);
    if (q.featured === "1") where.push("i.featured=true");
    if (q.uploader && /^\d+$/.test(q.uploader)) add("i.uploader_id=?", Number(q.uploader));
    if (q.q && q.q.trim()) {
      params.push(`%${q.q.trim().slice(0, 60).replace(/[%_\\]/g, "\\$&")}%`);
      const p = `$${params.length}`;
      where.push(`(i.title ILIKE ${p} OR i.author_name ILIKE ${p} OR i.description ILIKE ${p} OR array_to_string(i.tags,' ') ILIKE ${p})`);
    }
    const order = q.sort === "popular" ? "(i.downloads + i.views) DESC, i.created_at DESC"
      : q.sort === "featured" ? "i.featured DESC, i.reviewed_at DESC NULLS LAST" : "COALESCE(i.reviewed_at, i.created_at) DESC";
    const limit = Math.min(Math.max(parseInt(q.limit || "30", 10) || 30, 1), 100);
    const offset = Math.max(parseInt(q.offset || "0", 10) || 0, 0);
    const { rows } = await query(`${SELECT_ITEM} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
    return res.json({ items: rows.map((r: any) => row(r)), has_more: rows.length === limit });
  } catch (err) { return fail(res, err, "items"); }
});

// GET /api/ithraa/mine — مساهماتي بكل حالاتها
router.get("/ithraa/mine", async (req: Request, res: Response) => {
  try {
    await ensureIthraaDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const { rows } = await query(`${SELECT_ITEM} WHERE i.uploader_id=$1 ORDER BY i.created_at DESC LIMIT 200`, [me.id]);
    const stats = await query(`SELECT COALESCE(SUM(points),0)::int AS p FROM volunteer_points WHERE user_id=$1 AND reason LIKE 'ithraa:%'`, [me.id]).catch(() => ({ rows: [{ p: 0 }] }));
    return res.json({ items: rows.map((r: any) => row(r, { reveal: true })), points: stats.rows[0]?.p ?? 0 });
  } catch (err) { return fail(res, err, "mine"); }
});

// GET /api/ithraa/items/:id — التفاصيل (المقال كاملاً). غير المنشور لصاحبه وللمراجعين فقط.
router.get("/ithraa/items/:id", async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureIthraaDb();
    const me = await sessionUser(req);
    const { rows } = await query(`${SELECT_ITEM} WHERE i.id=$1`, [Number(req.params.id)]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: "غير موجود" });
    const scope = await reviewScope(me);
    const owner = !!me && me.id === r.uploader_id;
    const reviewer = canReview(scope, r.category);
    if (r.status !== "approved" && !owner && !reviewer) return res.status(404).json({ error: "غير موجود" });
    if (r.status === "approved" && !owner) await query(`UPDATE ithraa_items SET views=views+1 WHERE id=$1`, [r.id]).catch(() => {});
    const related = r.status === "approved"
      ? (await query(`${SELECT_ITEM} WHERE i.status='approved' AND i.category=$1 AND i.id<>$2 ORDER BY i.downloads+i.views DESC LIMIT 6`, [r.category, r.id])).rows.map((x: any) => row(x))
      : [];
    return res.json({
      item: { ...row(r, { full: true, reveal: owner || reviewer }), ...(reviewer || owner ? { file_url: r.file_url } : {}) },
      can_review: reviewer, is_owner: owner, related,
    });
  } catch (err) { return fail(res, err, "item"); }
});

// GET /api/ithraa/items/:id/open — يحسب التنزيل ويحوّل إلى الملف
router.get("/ithraa/items/:id/open", async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureIthraaDb();
    const { rows } = await query(`UPDATE ithraa_items SET downloads=downloads+1 WHERE id=$1 AND status='approved' AND file_url IS NOT NULL RETURNING file_url`, [Number(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: "غير متاح" });
    if (req.query.json === "1") return res.json({ url: rows[0].file_url });
    return res.redirect(302, rows[0].file_url);
  } catch (err) { return fail(res, err, "open"); }
});

// ─── الرفع ───────────────────────────────────────────────────
function parseSubmission(b: Record<string, any>): { error: string } | { v: Record<string, any> } {
  const kind = (KINDS as readonly string[]).includes(b.kind) ? b.kind : null;
  if (!kind) return { error: "اختر النوع: كتاب أو مقال" };
  const category = SHELF_KEYS.has(b.category) ? b.category : null;
  if (!category) return { error: "اختر الرف (التصنيف)" };
  const title = clean(b.title, 200);
  if (title.length < 3) return { error: "اكتب عنواناً واضحاً" };
  const author_name = clean(b.author_name, 160) || null;
  const description = clean(b.description, 1500) || null;
  const language = (LANGS as readonly string[]).includes(b.language) ? b.language : "ar";
  const rights = (RIGHTS as readonly string[]).includes(b.rights) ? b.rights : null;
  if (!rights) return { error: "أكّد حقّك في نشر هذا المحتوى" };
  const tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || "").split(/[,،]/))
    .map((t: unknown) => clean(t, 30).replace(/^#/, "")).filter(Boolean).slice(0, 8);
  let cover_url: string | null = null;
  if (b.cover_url) {
    const c = classifyUrl(b.cover_url);
    if (!c) return { error: "رابط صورة الغلاف غير صالح" };
    cover_url = c.url;
  }
  const v: Record<string, any> = { kind, category, title, author_name, description, language, rights, tags, cover_url,
    body: null, file_url: null, source: null, file_size: null, file_format: null, pages: null, publish_year: null };
  if (kind === "book") {
    const f = classifyUrl(b.file_url);
    if (!f) return { error: "ارفع ملف الكتاب أو ضع رابطاً يبدأ بـ https" };
    v.file_url = f.url; v.source = f.source;
    const size = Number(b.file_size); v.file_size = Number.isFinite(size) && size > 0 ? Math.round(size) : null;
    v.file_format = clean(b.file_format, 10).toLowerCase().replace(/[^a-z0-9]/g, "") || null;
    const pages = Number(b.pages); v.pages = Number.isInteger(pages) && pages > 0 && pages < 20000 ? pages : null;
    const year = Number(b.publish_year); v.publish_year = Number.isInteger(year) && year > 500 && year <= new Date().getFullYear() + 1 ? year : null;
  } else {
    const body = String(b.body ?? "").replace(/\r\n/g, "\n").trim();
    if (body.length < ARTICLE_MIN) return { error: `المقال قصير — ${ARTICLE_MIN} حرف على الأقل` };
    if (body.length > ARTICLE_MAX) return { error: "المقال أطول من المسموح" };
    v.body = body;
  }
  return { v };
}

// POST /api/ithraa/items — مساهمة جديدة (تُراجع؛ المشرف ينشر مباشرة في رفوفه)
router.post("/ithraa/items", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureIthraaDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول للمساهمة" });
    if (me.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    const p = parseSubmission(req.body || {});
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    const today = await query(`SELECT COUNT(*)::int AS n FROM ithraa_items WHERE uploader_id=$1 AND created_at > NOW() - INTERVAL '1 day'`, [me.id]);
    if (today.rows[0].n >= 15) return res.status(429).json({ error: "وصلت لحد المساهمات اليومي — عُد غداً" });
    for (const text of [v.title, v.description || "", (v.body || "").slice(0, 6000)]) {
      if (!text) continue;
      const mod = await checkContent(text);
      if (!mod.allowed) return res.status(400).json({ error: mod.reason || "المحتوى غير مسموح" });
    }
    const scope = await reviewScope(me);
    const direct = canReview(scope, v.category);
    const { rows } = await query(
      `INSERT INTO ithraa_items (kind, category, title, author_name, description, body, cover_url, file_url, source, file_size, file_format,
         language, pages, publish_year, rights, tags, uploader_id, uploader_name, status, reviewed_by, reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [v.kind, v.category, v.title, v.author_name, v.description, v.body, v.cover_url, v.file_url, v.source, v.file_size, v.file_format,
       v.language, v.pages, v.publish_year, v.rights, v.tags, me.id, me.name || null,
       direct ? "approved" : "pending", direct ? me.id : null, direct ? new Date() : null],
    );
    const item = rows[0];
    if (!direct) {
      const reviewers = (await reviewersFor(v.category)).filter((id) => id !== me.id);
      void notify(reviewers, "مساهمة جديدة في «إثراء»", `${v.kind === "book" ? "كتاب" : "مقال"}: ${v.title} — بانتظار مراجعتك`, { id: item.id, tab: "review" });
    }
    return res.status(201).json({
      item: row(item, { reveal: true }),
      message: direct ? "تم النشر مباشرة لأنك مشرف على هذا الرف" : "شكراً لمساهمتك — ستُنشر بعد مراجعة المشرف وسيصلك إشعار",
    });
  } catch (err) { return fail(res, err, "submit"); }
});

// PATCH /api/ithraa/items/:id — تعديل صاحب المساهمة (قبل النشر أو بعد الرفض) — تعود للمراجعة
router.patch("/ithraa/items/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureIthraaDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const cur = (await query(`SELECT * FROM ithraa_items WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    const scope = await reviewScope(me);
    const reviewer = canReview(scope, cur.category);
    if (cur.uploader_id !== me.id && !reviewer) return res.status(403).json({ error: "غير مسموح" });
    if (cur.status === "approved" && !reviewer) return res.status(409).json({ error: "المساهمة منشورة — تواصل مع المشرف لتعديلها" });
    const p = parseSubmission({ ...cur, ...req.body, kind: cur.kind });
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    for (const text of [v.title, v.description || "", (v.body || "").slice(0, 6000)]) {
      if (!text) continue;
      const mod = await checkContent(text);
      if (!mod.allowed) return res.status(400).json({ error: mod.reason || "المحتوى غير مسموح" });
    }
    const status = reviewer ? cur.status : "pending";
    const { rows } = await query(
      `UPDATE ithraa_items SET category=$1, title=$2, author_name=$3, description=$4, body=$5, cover_url=$6, file_url=$7, source=$8,
         file_size=$9, file_format=$10, language=$11, pages=$12, publish_year=$13, rights=$14, tags=$15, status=$16, updated_at=NOW()
       WHERE id=$17 RETURNING *`,
      [v.category, v.title, v.author_name, v.description, v.body, v.cover_url, v.file_url, v.source, v.file_size, v.file_format,
       v.language, v.pages, v.publish_year, v.rights, v.tags, status, cur.id],
    );
    if (cur.file_url && cur.file_url !== v.file_url) await deleteBookBlob(cur.file_url);
    if (!reviewer && cur.status === "rejected") {
      void notify((await reviewersFor(v.category)).filter((id) => id !== me.id), "مساهمة مُعدّلة في «إثراء»", `${v.title} — أُعيد إرسالها للمراجعة`, { id: cur.id, tab: "review" });
    }
    return res.json({ item: row(rows[0], { reveal: true }), message: reviewer ? "تم الحفظ" : "تم الحفظ وأُعيدت للمراجعة" });
  } catch (err) { return fail(res, err, "edit"); }
});

// DELETE /api/ithraa/items/:id — صاحبها (ما لم تُنشر) أو المراجع
router.delete("/ithraa/items/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureIthraaDb();
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const cur = (await query(`SELECT id, uploader_id, category, status, file_url, cover_url FROM ithraa_items WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    const reviewer = canReview(await reviewScope(me), cur.category);
    const owner = cur.uploader_id === me.id;
    if (!reviewer && !(owner && cur.status !== "approved")) return res.status(403).json({ error: owner ? "المساهمة منشورة — اطلب من المشرف حذفها" : "غير مسموح" });
    await query(`DELETE FROM ithraa_items WHERE id=$1`, [cur.id]);
    await deleteBookBlob(cur.file_url);
    await deleteBookBlob(cur.cover_url);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "delete"); }
});

// ─── المراجعة ────────────────────────────────────────────────
// GET /api/ithraa/review?status=pending|approved|rejected&category=
router.get("/ithraa/review", async (req: Request, res: Response) => {
  try {
    await ensureIthraaDb();
    const me = await sessionUser(req);
    const scope = await reviewScope(me);
    if (!scope) return res.status(403).json({ error: "للمشرفين فقط" });
    const status = (STATUSES as readonly string[]).includes(String(req.query.status)) ? String(req.query.status) : "pending";
    const params: unknown[] = [status, scope.all, scope.shelves];
    let extra = "";
    if (req.query.category && SHELF_KEYS.has(String(req.query.category))) { params.push(String(req.query.category)); extra = ` AND i.category=$${params.length}`; }
    const { rows } = await query(
      `${SELECT_ITEM} WHERE i.status=$1 AND ($2::boolean OR i.category = ANY($3::text[]))${extra}
       ORDER BY ${status === "pending" ? "i.created_at ASC" : "i.reviewed_at DESC NULLS LAST"} LIMIT 100`, params);
    const counts = await query(
      `SELECT status, COUNT(*)::int AS n FROM ithraa_items WHERE ($1::boolean OR category = ANY($2::text[])) GROUP BY status`, [scope.all, scope.shelves]);
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const r of counts.rows) c[r.status] = r.n;
    return res.json({ items: rows.map((r: any) => ({ ...row(r, { full: true, reveal: true }), file_url: r.file_url })), counts: c, scope });
  } catch (err) { return fail(res, err, "review"); }
});

// POST /api/ithraa/items/:id/review { action: approve|reject|feature|unfeature|unpublish, note?, category? }
router.post("/ithraa/items/:id/review", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureIthraaDb();
    const me = await sessionUser(req);
    const scope = await reviewScope(me);
    const cur = (await query(`SELECT * FROM ithraa_items WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    if (!canReview(scope, cur.category)) return res.status(403).json({ error: "ليس لك صلاحية على هذا الرف" });
    const action = String(req.body?.action || "");
    const note = clean(req.body?.note, 400) || null;
    // نقل إلى رف آخر أثناء المراجعة (ضمن صلاحيات المراجع)
    let category = cur.category;
    if (req.body?.category && SHELF_KEYS.has(req.body.category) && req.body.category !== cur.category) {
      if (!canReview(scope, req.body.category)) return res.status(403).json({ error: "ليس لك صلاحية على الرف الجديد" });
      category = req.body.category;
    }
    let sql = ""; let params: unknown[] = [];
    switch (action) {
      case "approve":
        sql = `UPDATE ithraa_items SET status='approved', review_note=$1, reviewed_by=$2, reviewed_at=NOW(), category=$3, updated_at=NOW() WHERE id=$4 RETURNING *`;
        params = [note, me!.id, category, cur.id]; break;
      case "reject":
        if (!note) return res.status(400).json({ error: "اكتب سبب الرفض ليعرف صاحب المساهمة ما يجب تعديله" });
        sql = `UPDATE ithraa_items SET status='rejected', featured=false, review_note=$1, reviewed_by=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3 RETURNING *`;
        params = [note, me!.id, cur.id]; break;
      case "unpublish":
        sql = `UPDATE ithraa_items SET status='pending', featured=false, review_note=$1, updated_at=NOW() WHERE id=$2 RETURNING *`;
        params = [note, cur.id]; break;
      case "feature": case "unfeature":
        if (cur.status !== "approved") return res.status(409).json({ error: "التمييز للمنشور فقط" });
        sql = `UPDATE ithraa_items SET featured=$1 WHERE id=$2 RETURNING *`;
        params = [action === "feature", cur.id]; break;
      default: return res.status(400).json({ error: "إجراء غير معروف" });
    }
    const { rows } = await query(sql, params);
    const it = rows[0];
    const label = it.kind === "book" ? "كتابك" : "مقالك";
    if (action === "approve" && cur.status !== "approved" && it.uploader_id && it.uploader_id !== me!.id) {
      let pts = 0;
      if (APPROVE_POINTS > 0) {
        const dup = await query(`SELECT 1 FROM volunteer_points WHERE user_id=$1 AND reason=$2 LIMIT 1`, [it.uploader_id, `ithraa:${it.id}`]).catch(() => ({ rows: [1] }));
        if (!dup.rows.length) {
          await query(`INSERT INTO volunteer_points (user_id, points, reason, created_by) VALUES ($1,$2,$3,$4)`, [it.uploader_id, APPROVE_POINTS, `ithraa:${it.id}`, me!.id]).catch(() => {});
          pts = APPROVE_POINTS;
        }
      }
      void notify([it.uploader_id], "نُشرت مساهمتك في «إثراء» 🎉", `${label} «${it.title}» متاح الآن للقراء${pts ? ` · +${pts} نقاط` : ""}`, { id: it.id });
    } else if (action === "reject" && it.uploader_id) {
      void notify([it.uploader_id], "مساهمتك تحتاج تعديلاً", `${label} «${it.title}»: ${note}`, { id: it.id, tab: "mine" });
    } else if (action === "feature" && it.uploader_id) {
      void notify([it.uploader_id], "مساهمتك ضمن المختارات ⭐", `اختار المشرف ${label} «${it.title}» ضمن مختارات «إثراء»`, { id: it.id });
    }
    return res.json({ item: row(it, { reveal: true }) });
  } catch (err) { return fail(res, err, "review-action"); }
});

// ─── المشرفون (يعيّنهم مسؤول التطبيق) ─────────────────────────
router.get("/ithraa/moderators", async (req: Request, res: Response) => {
  try {
    await ensureIthraaDb();
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "لمسؤول التطبيق فقط" });
    const { rows } = await query(
      `SELECT m.user_id, m.categories, m.note, m.created_at, u.name, u.phone, u.avatar_url,
         (SELECT COUNT(*)::int FROM ithraa_items i WHERE i.reviewed_by=m.user_id) AS reviewed
       FROM ithraa_moderators m JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC`);
    return res.json({ moderators: rows.map((r: any) => ({ ...r, categories: r.categories && r.categories.length ? r.categories : null })) });
  } catch (err) { return fail(res, err, "moderators"); }
});

// GET /api/ithraa/moderators/lookup?q= — البحث عن عضو بالاسم أو الهاتف أو الرقم
router.get("/ithraa/moderators/lookup", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "لمسؤول التطبيق فقط" });
    const q = clean(req.query.q, 60);
    if (q.length < 2) return res.json({ users: [] });
    const digits = q.replace(/\D/g, "");
    const { rows } = await query(
      `SELECT id, name, phone, avatar_url, role FROM users
       WHERE (name ILIKE $1 OR ($2 <> '' AND regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%' || $2 || '%') OR id::text = $3)
         AND COALESCE(is_banned,false)=false ORDER BY name LIMIT 15`,
      [`%${q.replace(/[%_\\]/g, "\\$&")}%`, digits.length >= 4 ? digits : "", q]);
    return res.json({ users: rows.map((r: any) => ({ ...r, phone: r.phone ? String(r.phone).replace(/^(.{3}).*(.{3})$/, "$1•••$2") : null })) });
  } catch (err) { return fail(res, err, "lookup"); }
});

// PUT /api/ithraa/moderators/:userId { categories: string[] | null, note? }
router.put("/ithraa/moderators/:userId", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.userId))) return res.status(404).json({ error: "غير موجود" });
    await ensureIthraaDb();
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "لمسؤول التطبيق فقط" });
    const uid = Number(req.params.userId);
    const u = (await query(`SELECT id, name FROM users WHERE id=$1`, [uid])).rows[0];
    if (!u) return res.status(404).json({ error: "المستخدم غير موجود" });
    const raw = req.body?.categories;
    const cats = Array.isArray(raw) ? [...new Set(raw.map(String).filter((c) => SHELF_KEYS.has(c) || c === "writers"))] : null;
    if (Array.isArray(raw) && !cats!.length) return res.status(400).json({ error: "اختر رفاً واحداً على الأقل أو «كل الرفوف»" });
    const note = clean(req.body?.note, 200) || null;
    const existed = (await query(`SELECT 1 FROM ithraa_moderators WHERE user_id=$1`, [uid])).rows.length > 0;
    await query(
      `INSERT INTO ithraa_moderators (user_id, categories, note, assigned_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE SET categories=EXCLUDED.categories, note=EXCLUDED.note, assigned_by=EXCLUDED.assigned_by`,
      [uid, cats, note, me!.id]);
    if (!existed) {
      const where = cats ? cats.map((c) => (c === "writers" ? "ديوان الكُتّاب" : ITHRAA_SHELVES.find((s) => s.key === c)!.label)).join("، ") : "كل الرفوف وديوان الكُتّاب";
      void notify([uid], "عُيّنت مشرفاً في «إثراء» 📚", `يمكنك الآن مراجعة الكتب والمقالات ونشرها في: ${where}`, { tab: "review" });
    }
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "moderator-put"); }
});

router.delete("/ithraa/moderators/:userId", writeLimiter, async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.userId))) return res.status(404).json({ error: "غير موجود" });
    await ensureIthraaDb();
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "لمسؤول التطبيق فقط" });
    await query(`DELETE FROM ithraa_moderators WHERE user_id=$1`, [Number(req.params.userId)]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "moderator-delete"); }
});

export default router;
