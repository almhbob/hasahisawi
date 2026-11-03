// ════════════════════════════════════════════════════════════════
// 📰 «نافذة الصحافة» — توأمة حصاحيصاوي مع نقابة الصحفيين السودانيين (وثيقة HAS-JUR-2026)
//  1) النافذة الإخبارية الرسمية: بيانات وتصريحات وأخبار وأعداد صحف وتعاميم، بأرقام مرجعية.
//  2) دليل الصحفيين المعتمد: من العضويات الصحفية في ديوان الكُتّاب + اعتماد الأمانة الإعلامية.
//  3) التنبيهات الفورية: إشعارات عاجلة لكل الهواتف للبيانات الهامة (بحد يومي).
//  4) الأرشيف الرقمي: تغطيات وتقارير وصور ووثائق تاريخية للمنطقة.
// الصلاحيات: إدارة التطبيق تمنح «الأمانة الإعلامية» صلاحيات النشر والتحكم (مدير/ناشر/محرر).
// حالة الشراكة تُعرض بأمانة: «مقترحة» حتى تعتمدها الإدارة بعد توقيع الاتفاق، ثم «معتمدة».
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { checkContent } from "../lib/content-moderator";

const router = Router();
const API_BASE = (process.env.PUBLIC_API_BASE || "https://api-server-gilt-ten.vercel.app").replace(/\/$/, "");
export const POST_KINDS: Record<string, { label: string; prefix: string }> = {
  statement: { label: "بيان", prefix: "B" },
  press_release: { label: "تصريح صحفي", prefix: "T" },
  news: { label: "خبر", prefix: "N" },
  circular: { label: "تعميم", prefix: "C" },
  newspaper: { label: "عدد صحيفة / نشرة", prefix: "P" },
  event: { label: "فعالية ونشاط", prefix: "E" },
};
const ARCHIVE_KINDS: Record<string, string> = { coverage: "تغطية", report: "تقرير", photos: "صور", video: "فيديو", document: "وثيقة", interview: "حوار" };
const ROLES: Record<string, string> = { admin: "مدير النافذة", publisher: "ناشر (الأمانة الإعلامية)", editor: "محرر" };
const URGENT_DAILY_CAP = Math.max(1, Number(process.env.PRESS_URGENT_DAILY_CAP ?? 3) || 3);

let ready: Promise<void> | null = null;
export function ensurePressDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS press_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      partner_name VARCHAR(160) NOT NULL DEFAULT 'نقابة الصحفيين السودانيين',
      window_title VARCHAR(120) NOT NULL DEFAULT 'نافذة الصحافة',
      status VARCHAR(10) NOT NULL DEFAULT 'proposed',
      phase SMALLINT NOT NULL DEFAULT 1,
      agreement_no VARCHAR(40) NOT NULL DEFAULT 'HAS-JUR-2026',
      about TEXT,
      contact_email VARCHAR(120),
      contact_phone VARCHAR(40),
      logo_url TEXT,
      launched_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (id = 1)
    )`);
    await query(`INSERT INTO press_settings (id) VALUES (1) ON CONFLICT DO NOTHING`);
    await query(`CREATE TABLE IF NOT EXISTS press_staff (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(10) NOT NULL DEFAULT 'editor',
      title VARCHAR(120),
      can_push BOOLEAN NOT NULL DEFAULT FALSE,
      assigned_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE SEQUENCE IF NOT EXISTS press_ref_seq START 1`);
    await query(`CREATE TABLE IF NOT EXISTS press_posts (
      id SERIAL PRIMARY KEY,
      ref_no VARCHAR(30) UNIQUE,
      kind VARCHAR(16) NOT NULL DEFAULT 'news',
      title VARCHAR(220) NOT NULL,
      summary VARCHAR(400),
      body TEXT NOT NULL,
      cover_url TEXT,
      attachments JSONB NOT NULL DEFAULT '[]',
      signed_by VARCHAR(160),
      urgent BOOLEAN NOT NULL DEFAULT FALSE,
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(10) NOT NULL DEFAULT 'published',
      push_sent_at TIMESTAMPTZ,
      push_count INTEGER,
      author_id INTEGER,
      views INTEGER NOT NULL DEFAULT 0,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_press_posts ON press_posts (status, pinned DESC, published_at DESC)`);
    await query(`CREATE TABLE IF NOT EXISTS press_archive (
      id SERIAL PRIMARY KEY,
      kind VARCHAR(12) NOT NULL DEFAULT 'coverage',
      title VARCHAR(220) NOT NULL,
      description TEXT,
      event_date DATE,
      place VARCHAR(120),
      files JSONB NOT NULL DEFAULT '[]',
      tags TEXT[] NOT NULL DEFAULT '{}',
      source VARCHAR(160),
      added_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_press_archive ON press_archive (event_date DESC NULLS LAST)`);
    await query(`CREATE TABLE IF NOT EXISTS press_accreditations (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(10) NOT NULL DEFAULT 'active',
      union_card_no VARCHAR(60),
      specialty VARCHAR(80),
      beat VARCHAR(120),
      contact_public BOOLEAN NOT NULL DEFAULT FALSE,
      whatsapp VARCHAR(30),
      public_email VARCHAR(120),
      note VARCHAR(300),
      verified_by INTEGER,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  })().catch((e) => { ready = null; throw e; }));
}

// ─── الصلاحيات ───────────────────────────────────────────────
type Perm = { role: "app" | "admin" | "publisher" | "editor"; can_push: boolean; title: string | null } | null;
async function permOf(u: SessionUser | null): Promise<Perm> {
  if (!u) return null;
  if (isStaff(u)) return { role: "app", can_push: true, title: "إدارة التطبيق" };
  const r = (await query(`SELECT role, can_push, title FROM press_staff WHERE user_id=$1`, [u.id])).rows[0];
  return r ? { role: r.role, can_push: !!r.can_push, title: r.title } : null;
}
const canPublish = (p: Perm) => !!p && p.role !== "editor";
const canManage = (p: Perm) => !!p && (p.role === "app" || p.role === "admin");

// ─── أدوات ───────────────────────────────────────────────────
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
function fail(res: Response, err: unknown, tag: string) {
  logger.error({ err }, `press/${tag}`);
  return res.status(500).json({ error: "حدث خطأ في الخادم" });
}
function httpsUrl(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || s.length > 1000) return null;
  try { const u = new URL(s); return u.protocol === "https:" ? u.toString() : null; } catch { return null; }
}
function files(v: unknown) {
  return (Array.isArray(v) ? v : []).slice(0, 12).map((f: any) => ({ name: clean(f?.name, 120) || "مرفق", url: httpsUrl(f?.url), type: clean(f?.type, 40) || null, size: Number(f?.size) || null }))
    .filter((f) => f.url);
}
function postRow(r: any, full = false) {
  return {
    id: r.id, ref_no: r.ref_no, kind: r.kind, kind_label: POST_KINDS[r.kind]?.label ?? r.kind, title: r.title,
    summary: r.summary || String(r.body || "").replace(/\s+/g, " ").slice(0, 200), ...(full ? { body: r.body } : {}),
    cover_url: r.cover_url, attachments: r.attachments || [], signed_by: r.signed_by, urgent: r.urgent, pinned: r.pinned,
    status: r.status, push_sent_at: r.push_sent_at, push_count: r.push_count, views: r.views, published_at: r.published_at, created_at: r.created_at,
    author_name: r.author_name ?? null,
  };
}

async function pushAll(title: string, body: string, data: Record<string, unknown>): Promise<number> {
  const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE token LIKE 'ExponentPushToken[%' LIMIT 50000`).catch(() => ({ rows: [] as any[] }));
  let sent = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const ok = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(6000),
      body: JSON.stringify(batch.map((r: any) => ({ to: r.token, title, body, sound: "default", priority: "high", channelId: "default", data }))),
    }).then((x) => x.ok).catch(() => false);
    if (ok) sent += batch.length;
  }
  return sent;
}
async function notifyUsers(ids: number[], title: string, body: string, data: Record<string, unknown>) {
  if (!ids.length) return;
  await query(`INSERT INTO notifications (user_id, type, title, body, data) SELECT u, 'press', $2, $3, $4 FROM UNNEST($1::int[]) AS u`, [ids, title, body, JSON.stringify(data)]).catch(() => {});
}

// ─── العامة ──────────────────────────────────────────────────
router.get("/press/overview", async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const me = await sessionUser(req);
    const perm = await permOf(me);
    const s = (await query(`SELECT * FROM press_settings WHERE id=1`)).rows[0];
    const urgent = (await query(`SELECT * FROM press_posts WHERE status='published' AND urgent=true AND published_at > NOW() - INTERVAL '48 hours' ORDER BY published_at DESC LIMIT 1`)).rows[0];
    const stats = (await query(`SELECT (SELECT COUNT(*) FROM press_posts WHERE status='published')::int AS posts,
      (SELECT COUNT(*) FROM press_archive)::int AS archive,
      (SELECT COUNT(*) FROM lit_members WHERE category='journalist' AND status='active')::int AS journalists,
      (SELECT COUNT(*) FROM press_accreditations WHERE status='active')::int AS accredited`).catch(() => ({ rows: [{ posts: 0, archive: 0, journalists: 0, accredited: 0 }] }))).rows[0];
    return res.json({
      settings: { partner_name: s.partner_name, window_title: s.window_title, status: s.status, phase: s.phase, agreement_no: s.agreement_no, about: s.about,
        contact_email: s.contact_email, contact_phone: s.contact_phone, logo_url: s.logo_url, launched_at: s.launched_at },
      urgent: urgent ? postRow(urgent) : null, stats, kinds: POST_KINDS, archive_kinds: ARCHIVE_KINDS,
      me: perm ? { role: perm.role, role_label: perm.role === "app" ? "إدارة التطبيق" : ROLES[perm.role], can_publish: canPublish(perm), can_push: perm.can_push, can_manage: canManage(perm) } : null,
    });
  } catch (err) { return fail(res, err, "overview"); }
});

router.get("/press/posts", async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const q = req.query as Record<string, string | undefined>;
    const me = await sessionUser(req);
    const perm = await permOf(me);
    const where: string[] = [perm && q.all === "1" ? "TRUE" : "p.status='published'"]; const params: unknown[] = [];
    if (q.kind && POST_KINDS[q.kind]) { params.push(q.kind); where.push(`p.kind=$${params.length}`); }
    if (q.q && q.q.trim()) { params.push(`%${q.q.trim().slice(0, 60).replace(/[%_\\]/g, "\\$&")}%`); where.push(`(p.title ILIKE $${params.length} OR p.body ILIKE $${params.length} OR p.ref_no ILIKE $${params.length})`); }
    const limit = Math.min(Math.max(parseInt(q.limit || "20", 10) || 20, 1), 60);
    const offset = Math.max(parseInt(q.offset || "0", 10) || 0, 0);
    const { rows } = await query(`SELECT p.*, u.name AS author_name FROM press_posts p LEFT JOIN users u ON u.id=p.author_id WHERE ${where.join(" AND ")}
      ORDER BY p.pinned DESC, COALESCE(p.published_at, p.created_at) DESC LIMIT ${limit} OFFSET ${offset}`, params);
    return res.json({ posts: rows.map((r: any) => postRow(r)), has_more: rows.length === limit });
  } catch (err) { return fail(res, err, "posts"); }
});

router.get("/press/posts/:id", async (req: Request, res: Response) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensurePressDb();
    const perm = await permOf(await sessionUser(req));
    const r = (await query(`SELECT p.*, u.name AS author_name FROM press_posts p LEFT JOIN users u ON u.id=p.author_id WHERE p.id=$1`, [Number(req.params.id)])).rows[0];
    if (!r || (r.status !== "published" && !perm)) return res.status(404).json({ error: "غير موجود" });
    if (r.status === "published") await query(`UPDATE press_posts SET views=views+1 WHERE id=$1`, [r.id]).catch(() => {});
    const s = (await query(`SELECT partner_name, window_title, status, logo_url FROM press_settings WHERE id=1`)).rows[0];
    return res.json({ post: postRow(r, true), settings: s, can_edit: !!perm });
  } catch (err) { return fail(res, err, "post"); }
});

router.get("/press/archive", async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const q = req.query as Record<string, string | undefined>;
    const where = ["TRUE"]; const params: unknown[] = [];
    if (q.kind && ARCHIVE_KINDS[q.kind]) { params.push(q.kind); where.push(`a.kind=$${params.length}`); }
    if (q.year && /^\d{4}$/.test(q.year)) { params.push(Number(q.year)); where.push(`EXTRACT(YEAR FROM a.event_date)=$${params.length}`); }
    if (q.q && q.q.trim()) { params.push(`%${q.q.trim().slice(0, 60).replace(/[%_\\]/g, "\\$&")}%`); where.push(`(a.title ILIKE $${params.length} OR a.description ILIKE $${params.length} OR a.place ILIKE $${params.length} OR array_to_string(a.tags,' ') ILIKE $${params.length})`); }
    const { rows } = await query(`SELECT a.* FROM press_archive a WHERE ${where.join(" AND ")} ORDER BY a.event_date DESC NULLS LAST, a.id DESC LIMIT 100`, params);
    const years = (await query(`SELECT DISTINCT EXTRACT(YEAR FROM event_date)::int AS y FROM press_archive WHERE event_date IS NOT NULL ORDER BY y DESC`)).rows.map((r: any) => r.y);
    return res.json({ items: rows.map((r: any) => ({ ...r, kind_label: ARCHIVE_KINDS[r.kind] ?? r.kind })), years });
  } catch (err) { return fail(res, err, "archive"); }
});

// دليل الصحفيين: العضويات الصحفية السارية في ديوان الكُتّاب + اعتماد الأمانة الإعلامية
router.get("/press/directory", async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const q = req.query as Record<string, string | undefined>;
    const params: unknown[] = [];
    let where = `m.category='journalist' AND m.status='active'`;
    if (q.accredited === "1") where += ` AND a.status='active'`;
    if (q.q && q.q.trim()) { params.push(`%${q.q.trim().slice(0, 60).replace(/[%_\\]/g, "\\$&")}%`); where += ` AND (m.full_name ILIKE $${params.length} OR m.pen_name ILIKE $${params.length} OR m.press_org ILIKE $${params.length} OR a.beat ILIKE $${params.length} OR a.specialty ILIKE $${params.length})`; }
    const { rows } = await query(
      `SELECT m.user_id, m.full_name, m.pen_name, m.press_org, m.press_role, m.press_years, m.member_no, m.city, u.avatar_url,
              a.status AS acc_status, a.union_card_no, a.specialty, a.beat, a.contact_public, a.whatsapp, a.public_email, a.verified_at
       FROM lit_members m JOIN users u ON u.id=m.user_id LEFT JOIN press_accreditations a ON a.user_id=m.user_id
       WHERE ${where} ORDER BY (a.status='active') DESC NULLS LAST, m.full_name LIMIT 300`, params).catch(() => ({ rows: [] as any[] }));
    return res.json({ journalists: rows.map((r: any) => ({
      user_id: r.user_id, name: r.full_name, pen_name: r.pen_name, press_org: r.press_org, press_role: r.press_role, press_years: r.press_years, city: r.city,
      member_no: r.member_no, avatar_url: r.avatar_url, accredited: r.acc_status === "active", union_card_no: r.acc_status === "active" ? r.union_card_no : null,
      specialty: r.specialty, beat: r.beat, verified_at: r.acc_status === "active" ? r.verified_at : null,
      whatsapp: r.contact_public ? r.whatsapp : null, email: r.contact_public ? r.public_email : null,
    })) });
  } catch (err) { return fail(res, err, "directory"); }
});

// ─── النشر (الأمانة الإعلامية) ───────────────────────────────
function parsePost(b: any): { error: string } | { v: Record<string, any> } {
  const kind = POST_KINDS[b.kind] ? b.kind : null;
  if (!kind) return { error: "اختر نوع المنشور" };
  const title = clean(b.title, 220);
  if (title.length < 5) return { error: "اكتب عنواناً واضحاً" };
  const body = String(b.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, 30000);
  if (body.length < 20) return { error: "اكتب نص المنشور" };
  return { v: { kind, title, body, summary: clean(b.summary, 400) || null, cover_url: httpsUrl(b.cover_url), attachments: files(b.attachments),
    signed_by: clean(b.signed_by, 160) || null, pinned: !!b.pinned, urgent: !!b.urgent, status: b.status === "draft" ? "draft" : "published" } };
}
async function nextRef(kind: string) {
  const n = (await query(`SELECT nextval('press_ref_seq') AS n`)).rows[0].n;
  return `HSJ-${POST_KINDS[kind].prefix}-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
}
async function maybePush(row: any, perm: Perm): Promise<{ sent: number; skipped?: string }> {
  if (!row.urgent || row.status !== "published" || row.push_sent_at) return { sent: 0 };
  if (!perm?.can_push) return { sent: 0, skipped: "لا تملك صلاحية التنبيهات العاجلة — نُشر دون إشعار" };
  const today = (await query(`SELECT COUNT(*)::int AS n FROM press_posts WHERE push_sent_at > NOW() - INTERVAL '1 day'`)).rows[0].n;
  if (today >= URGENT_DAILY_CAP) return { sent: 0, skipped: `بلغ حد التنبيهات العاجلة اليومي (${URGENT_DAILY_CAP})` };
  const s = (await query(`SELECT window_title FROM press_settings WHERE id=1`)).rows[0];
  const sent = await pushAll(`🔴 عاجل · ${POST_KINDS[row.kind].label}`, row.title, { screen: "press-post", id: row.id, url: `/press-post?id=${row.id}` });
  await query(`UPDATE press_posts SET push_sent_at=NOW(), push_count=$1 WHERE id=$2`, [sent, row.id]);
  void s;
  return { sent };
}

router.post("/press/posts", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const me = await sessionUser(req);
    const perm = await permOf(me);
    if (!perm) return res.status(403).json({ error: "للأمانة الإعلامية فقط" });
    const p = parsePost(req.body || {});
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    if (!canPublish(perm)) v.status = "draft"; // المحرر يكتب مسودات ينشرها الناشر
    const mod = await checkContent(`${v.title}\n${v.body.slice(0, 1500)}`);
    if (!mod.allowed) return res.status(400).json({ error: mod.reason || "المحتوى غير مسموح" });
    const ref = await nextRef(v.kind);
    const { rows } = await query(
      `INSERT INTO press_posts (ref_no, kind, title, summary, body, cover_url, attachments, signed_by, urgent, pinned, status, author_id, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [ref, v.kind, v.title, v.summary, v.body, v.cover_url, JSON.stringify(v.attachments), v.signed_by, v.urgent, v.pinned, v.status, me!.id, v.status === "published" ? new Date() : null]);
    const push = await maybePush(rows[0], perm);
    return res.status(201).json({ post: postRow(rows[0], true), push, message: v.status === "draft" ? "حُفظت كمسودة — ينشرها الناشر" : push.sent ? `نُشر وأُرسل تنبيه عاجل إلى ${push.sent} جهاز` : push.skipped || "نُشر" });
  } catch (err) { return fail(res, err, "create"); }
});

router.patch("/press/posts/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const me = await sessionUser(req);
    const perm = await permOf(me);
    if (!perm) return res.status(403).json({ error: "للأمانة الإعلامية فقط" });
    const cur = (await query(`SELECT * FROM press_posts WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    if (perm.role === "editor" && (cur.status !== "draft" || cur.author_id !== me!.id)) return res.status(403).json({ error: "المحرر يعدّل مسوداته فقط" });
    const p = parsePost({ ...cur, ...req.body });
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    if (!canPublish(perm)) v.status = "draft";
    const publishing = cur.status !== "published" && v.status === "published";
    const { rows } = await query(
      `UPDATE press_posts SET kind=$1, title=$2, summary=$3, body=$4, cover_url=$5, attachments=$6, signed_by=$7, urgent=$8, pinned=$9, status=$10,
         published_at=CASE WHEN $11 THEN NOW() ELSE published_at END, updated_at=NOW() WHERE id=$12 RETURNING *`,
      [v.kind, v.title, v.summary, v.body, v.cover_url, JSON.stringify(v.attachments), v.signed_by, v.urgent, v.pinned, v.status, publishing, cur.id]);
    const push = await maybePush(rows[0], perm);
    return res.json({ post: postRow(rows[0], true), push });
  } catch (err) { return fail(res, err, "update"); }
});

router.delete("/press/posts/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const perm = await permOf(await sessionUser(req));
    if (!canPublish(perm)) return res.status(403).json({ error: "غير مسموح" });
    // لا حذف نهائي للبيانات الرسمية: تُسحب وتبقى بأرقامها المرجعية
    await query(`UPDATE press_posts SET status='withdrawn', pinned=false, updated_at=NOW() WHERE id=$1`, [Number(req.params.id)]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "delete"); }
});

router.post("/press/archive", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const me = await sessionUser(req);
    if (!(await permOf(me))) return res.status(403).json({ error: "للأمانة الإعلامية فقط" });
    const b = req.body || {};
    const title = clean(b.title, 220);
    if (title.length < 4) return res.status(400).json({ error: "اكتب عنوان المادة" });
    const kind = ARCHIVE_KINDS[b.kind] ? b.kind : "coverage";
    const f = files(b.files);
    if (!f.length && clean(b.description, 20000).length < 40) return res.status(400).json({ error: "أرفق ملفاً أو اكتب وصفاً وافياً (40 حرفاً)" });
    const d = b.event_date && /^\d{4}-\d{2}-\d{2}$/.test(String(b.event_date)) ? String(b.event_date) : null;
    const { rows } = await query(
      `INSERT INTO press_archive (kind, title, description, event_date, place, files, tags, source, added_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [kind, title, clean(b.description, 20000) || null, d, clean(b.place, 120) || null, JSON.stringify(f),
       (Array.isArray(b.tags) ? b.tags : String(b.tags || "").split(/[,،]/)).map((t: unknown) => clean(t, 30)).filter(Boolean).slice(0, 10), clean(b.source, 160) || null, me!.id]);
    return res.status(201).json({ item: { ...rows[0], kind_label: ARCHIVE_KINDS[kind] } });
  } catch (err) { return fail(res, err, "archive-add"); }
});
router.delete("/press/archive/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const perm = await permOf(await sessionUser(req));
    if (!canPublish(perm)) return res.status(403).json({ error: "غير مسموح" });
    await query(`DELETE FROM press_archive WHERE id=$1`, [Number(req.params.id)]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "archive-del"); }
});

// اعتماد الصحفيين في الدليل
router.put("/press/accreditations/:userId", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const me = await sessionUser(req);
    const perm = await permOf(me);
    if (!canPublish(perm)) return res.status(403).json({ error: "للأمانة الإعلامية فقط" });
    const uid = Number(req.params.userId);
    const isJ = (await query(`SELECT 1 FROM lit_members WHERE user_id=$1 AND category='journalist'`, [uid]).catch(() => ({ rows: [] }))).rows.length;
    if (!isJ) return res.status(400).json({ error: "يجب أن يكون للصحفي عضوية صحفية في ديوان الكُتّاب أولاً" });
    const b = req.body || {};
    const status = b.status === "revoked" ? "revoked" : "active";
    const prev = (await query(`SELECT status FROM press_accreditations WHERE user_id=$1`, [uid])).rows[0];
    await query(
      `INSERT INTO press_accreditations (user_id, status, union_card_no, specialty, beat, contact_public, whatsapp, public_email, note, verified_by, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (user_id) DO UPDATE SET status=EXCLUDED.status, union_card_no=EXCLUDED.union_card_no, specialty=EXCLUDED.specialty, beat=EXCLUDED.beat,
         contact_public=EXCLUDED.contact_public, whatsapp=EXCLUDED.whatsapp, public_email=EXCLUDED.public_email, note=EXCLUDED.note, verified_by=EXCLUDED.verified_by, verified_at=NOW()`,
      [uid, status, clean(b.union_card_no, 60) || null, clean(b.specialty, 80) || null, clean(b.beat, 120) || null, !!b.contact_public,
       clean(b.whatsapp, 30) || null, clean(b.public_email, 120) || null, clean(b.note, 300) || null, me!.id]);
    if (status === "active" && prev?.status !== "active") await notifyUsers([uid], "اعتُمدت في دليل الصحفيين ✅", "أصبحت ضمن دليل الصحفيين المعتمد في نافذة الصحافة", { screen: "press", tab: "directory" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "accredit"); }
});

// ─── الإدارة: الطاقم والإعدادات ───────────────────────────────
router.get("/press/staff", async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    if (!canManage(await permOf(await sessionUser(req)))) return res.status(403).json({ error: "غير مسموح" });
    const { rows } = await query(`SELECT s.*, u.name, u.avatar_url FROM press_staff s JOIN users u ON u.id=s.user_id ORDER BY s.created_at`);
    return res.json({ staff: rows.map((r: any) => ({ ...r, role_label: ROLES[r.role] })), roles: ROLES });
  } catch (err) { return fail(res, err, "staff"); }
});
router.put("/press/staff/:userId", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const me = await sessionUser(req);
    const perm = await permOf(me);
    if (!canManage(perm)) return res.status(403).json({ error: "غير مسموح" });
    const role = ROLES[req.body?.role] ? req.body.role : "editor";
    if (role === "admin" && perm!.role !== "app") return res.status(403).json({ error: "تعيين مدير النافذة لإدارة التطبيق فقط" });
    const uid = Number(req.params.userId);
    if (!(await query(`SELECT 1 FROM users WHERE id=$1`, [uid])).rows.length) return res.status(404).json({ error: "المستخدم غير موجود" });
    const prev = (await query(`SELECT 1 FROM press_staff WHERE user_id=$1`, [uid])).rows.length;
    await query(`INSERT INTO press_staff (user_id, role, title, can_push, assigned_by) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role, title=EXCLUDED.title, can_push=EXCLUDED.can_push, assigned_by=EXCLUDED.assigned_by`,
      [uid, role, clean(req.body?.title, 120) || null, !!req.body?.can_push && role !== "editor", me!.id]);
    if (!prev) await notifyUsers([uid], "صلاحيات نافذة الصحافة", `مُنحت صلاحية «${ROLES[role]}» في نافذة الصحافة`, { screen: "press-admin" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "staff-put"); }
});
router.delete("/press/staff/:userId", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const perm = await permOf(await sessionUser(req));
    if (!canManage(perm)) return res.status(403).json({ error: "غير مسموح" });
    const target = (await query(`SELECT role FROM press_staff WHERE user_id=$1`, [Number(req.params.userId)])).rows[0];
    if (target?.role === "admin" && perm!.role !== "app") return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    await query(`DELETE FROM press_staff WHERE user_id=$1`, [Number(req.params.userId)]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "staff-del"); }
});
router.get("/press/users/lookup", async (req: Request, res: Response) => {
  try {
    if (!canManage(await permOf(await sessionUser(req)))) return res.status(403).json({ error: "غير مسموح" });
    const q = clean(req.query.q, 60);
    if (q.length < 2) return res.json({ users: [] });
    const { rows } = await query(`SELECT id, name, avatar_url FROM users WHERE (name ILIKE $1 OR id::text=$2) AND COALESCE(is_banned,false)=false ORDER BY name LIMIT 15`, [`%${q.replace(/[%_\\]/g, "\\$&")}%`, q]);
    return res.json({ users: rows });
  } catch (err) { return fail(res, err, "lookup"); }
});
router.put("/press/settings", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensurePressDb();
    const me = await sessionUser(req);
    const perm = await permOf(me);
    if (!canManage(perm)) return res.status(403).json({ error: "غير مسموح" });
    const b = req.body || {};
    const cur = (await query(`SELECT * FROM press_settings WHERE id=1`)).rows[0];
    // حالة الشراكة والمرحلة تعتمدها إدارة التطبيق وحدها (بعد توقيع الاتفاق)
    const status = perm!.role === "app" && ["proposed", "active", "paused"].includes(b.status) ? b.status : cur.status;
    const phase = perm!.role === "app" && [1, 2, 3].includes(Number(b.phase)) ? Number(b.phase) : cur.phase;
    await query(`UPDATE press_settings SET partner_name=$1, window_title=$2, status=$3, phase=$4, about=$5, contact_email=$6, contact_phone=$7, logo_url=$8,
      launched_at=CASE WHEN $3='active' AND launched_at IS NULL THEN NOW() ELSE launched_at END, updated_at=NOW() WHERE id=1`,
      [perm!.role === "app" ? clean(b.partner_name, 160) || cur.partner_name : cur.partner_name, clean(b.window_title, 120) || cur.window_title, status, phase,
       clean(b.about, 4000) || null, clean(b.contact_email, 120) || null, clean(b.contact_phone, 40) || null, httpsUrl(b.logo_url)]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "settings"); }
});

export const PRESS_API_BASE = API_BASE;
export default router;
