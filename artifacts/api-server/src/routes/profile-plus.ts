// ════════════════════════════════════════════════════════════════
// 👤 الملف الشخصي الاحترافي — الشهادات، روابط التواصل، المهارات والتزكيات،
// شارة «موثوق»، زوّار الملف، الملف المهني العام لجهات العمل، و«النشطون الآن».
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, dbEnabled } from "../lib/shared-db";
import { recordAdminAlert } from "./admin-alerts";

const router = Router();
const ONLINE_SEC = 120;

export const SOCIAL_PLATFORMS = [
  "whatsapp", "facebook", "instagram", "x", "tiktok", "linkedin",
  "youtube", "telegram", "snapchat", "github", "website",
] as const;
const CERT_KINDS = ["degree", "course", "license", "award", "experience", "other"];

let ready: Promise<void> | null = null;
export function ensureProfilePlus(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      for (const col of [
        "headline VARCHAR(140)", "profession VARCHAR(100)",
        "skills JSONB NOT NULL DEFAULT '[]'::jsonb", "social_links JSONB NOT NULL DEFAULT '{}'::jsonb",
        "open_to_work BOOLEAN NOT NULL DEFAULT FALSE", "show_certs BOOLEAN NOT NULL DEFAULT TRUE",
        "is_verified BOOLEAN NOT NULL DEFAULT FALSE", "verified_at TIMESTAMPTZ", "verified_label VARCHAR(80)",
        "cover_theme VARCHAR(20)", "bio TEXT", "neighborhood VARCHAR(100)", "profile_locked BOOLEAN NOT NULL DEFAULT FALSE",
        "last_seen_at TIMESTAMPTZ", "show_presence BOOLEAN NOT NULL DEFAULT TRUE",
      ]) await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col}`);
      await query(`CREATE TABLE IF NOT EXISTS user_certificates (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'course',
        title VARCHAR(200) NOT NULL,
        issuer VARCHAR(200),
        issued_on VARCHAR(20),
        credential_id VARCHAR(120),
        credential_url TEXT,
        file_url TEXT,
        file_type VARCHAR(10),
        is_public BOOLEAN NOT NULL DEFAULT TRUE,
        reviewed BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_user_certs_user ON user_certificates(user_id)`);
      await query(`CREATE TABLE IF NOT EXISTS user_endorsements (
        user_id INTEGER NOT NULL,
        endorser_id INTEGER NOT NULL,
        skill VARCHAR(60) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, endorser_id, skill)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS profile_views (
        user_id INTEGER NOT NULL,
        viewer_id INTEGER NOT NULL,
        day DATE NOT NULL DEFAULT CURRENT_DATE,
        viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, viewer_id, day)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS verification_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        kind VARCHAR(30) NOT NULL DEFAULT 'identity',
        doc_url TEXT,
        note TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        admin_note TEXT,
        reviewed_by INTEGER,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_verif_status ON verification_requests(status, created_at DESC)`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

router.use(["/profile", "/social/active-now", "/admin/verification", "/admin/users/:id/verify", "/public/cv"], async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureProfilePlus(); return next(); }
  catch (err) { logger.error({ err }, "[profile+] ensure failed"); return res.status(500).json({ error: "تعذّر تهيئة الملف الشخصي" }); }
});

// ── أدوات ─────────────────────────────────────────────────────────
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function httpsUrl(v: unknown): string | null {
  const s = str(v, 600);
  if (!s) return null;
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null; } catch { return null; }
}

/** يحوّل اسم مستخدم أو رابط إلى رابط كامل للمنصّة */
export function normalizeSocial(platform: string, raw: unknown): string | null {
  let v = str(raw, 300);
  if (!v) return null;
  if (platform === "whatsapp") {
    const digits = v.replace(/[^\d]/g, "");
    if (digits.length < 8) return null;
    const intl = digits.startsWith("0") ? `249${digits.slice(1)}` : digits;
    return `https://wa.me/${intl}`;
  }
  if (/^https?:\/\//i.test(v)) return httpsUrl(v);
  v = v.replace(/^@/, "");
  if (!/^[\w.\-]{1,80}$/.test(v)) return platform === "website" ? httpsUrl(`https://${v}`) : null;
  const base: Record<string, string> = {
    facebook: "https://facebook.com/", instagram: "https://instagram.com/", x: "https://x.com/",
    tiktok: "https://tiktok.com/@", linkedin: "https://linkedin.com/in/", youtube: "https://youtube.com/@",
    telegram: "https://t.me/", snapchat: "https://snapchat.com/add/", github: "https://github.com/",
    website: "https://",
  };
  return base[platform] ? `${base[platform]}${v}` : null;
}

function cleanSkills(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const s of v) {
    const t = str(s, 40);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 15) break;
  }
  return out;
}

function certFields(b: any) {
  const file_url = httpsUrl(b?.file_url);
  const ft = str(b?.file_type, 10).toLowerCase();
  return {
    kind: CERT_KINDS.includes(b?.kind) ? b.kind : "course",
    title: str(b?.title, 200),
    issuer: str(b?.issuer, 200) || null,
    issued_on: str(b?.issued_on, 20) || null,
    credential_id: str(b?.credential_id, 120) || null,
    credential_url: httpsUrl(b?.credential_url),
    file_url,
    file_type: file_url ? (ft === "pdf" || /\.pdf(\?|$)/i.test(file_url) ? "pdf" : "image") : null,
    is_public: b?.is_public !== false,
  };
}

async function pushToUser(userId: number, title: string, body: string, data: Record<string, unknown>) {
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [userId]);
    if (!rows.length) return;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound: "hasahisawi_notif", channelId: "hasahisawi-default-s2", priority: "high", data }))),
    }).finally(() => clearTimeout(t));
  } catch (e: any) { logger.warn({ err: e?.message }, "[profile+] push failed"); }
}

/** نسبة اكتمال الملف + ما ينقصه */
function completeness(u: any, certs: number, avatar: boolean) {
  const items: [boolean, string][] = [
    [avatar, "صورة شخصية"],
    [!!u.headline, "عنوان مهني"],
    [!!(u.bio && u.bio.length >= 20), "نبذة (20 حرفاً على الأقل)"],
    [Array.isArray(u.skills) && u.skills.length >= 3, "3 مهارات على الأقل"],
    [certs > 0, "شهادة أو خبرة واحدة"],
    [Object.keys(u.social_links || {}).length > 0, "رابط تواصل واحد"],
    [!!u.neighborhood, "الحي"],
    [!!u.is_verified, "توثيق الحساب"],
  ];
  const done = items.filter(([ok]) => ok).length;
  return { percent: Math.round((done / items.length) * 100), missing: items.filter(([ok]) => !ok).map(([, l]) => l) };
}

async function loadFull(id: number, viewerId: number | null, viewerStaff = false) {
  const u = (await query(
    `SELECT id, name, role, avatar_url, created_at, bio, neighborhood, headline, profession, skills, social_links, profile_locked, phone, email,
            open_to_work, show_certs, is_verified, verified_at, verified_label, cover_theme, show_presence, last_seen_at,
            (show_presence AND last_seen_at > NOW() - make_interval(secs => ${ONLINE_SEC})) AS online
       FROM users WHERE id=$1 AND COALESCE(is_banned,false)=false`, [id])).rows[0];
  if (!u) return null;
  const own = viewerId === id;
  // 🔒 الملف المقفل: لا يرى غير صاحبه والإدارة إلا الاسم والصورة والتوثيق
  if (u.profile_locked && !own && !viewerStaff) {
    return {
      id: u.id, name: u.name, role: u.role, avatar_url: u.avatar_url, created_at: u.created_at,
      is_verified: u.is_verified, verified_label: u.verified_label, locked: true,
      online: false, last_seen_at: null, bio: null, neighborhood: null, headline: null, profession: null,
      skills: [], social_links: {}, open_to_work: false, show_certs: false, cover_theme: null, verified_at: null,
      certificates: [], posts_count: 0, reports_count: 0, endorsers_count: 0,
    };
  }
  const [certs, endorse, counts, views, verif] = await Promise.all([
    query(`SELECT id, kind, title, issuer, issued_on, credential_id, credential_url, file_url, file_type, is_public, reviewed, created_at
             FROM user_certificates WHERE user_id=$1 ${own ? "" : "AND is_public"} ORDER BY sort_order, issued_on DESC NULLS LAST, id DESC`, [id]),
    query(`SELECT skill, COUNT(*)::int AS n, BOOL_OR(endorser_id=$2) AS mine FROM user_endorsements WHERE user_id=$1 GROUP BY skill`, [id, viewerId || 0]),
    query(`SELECT (SELECT COUNT(*)::int FROM social_posts WHERE author_id=$1) AS posts,
                  (SELECT COUNT(*)::int FROM citizen_reports WHERE user_id=$1) AS reports,
                  (SELECT COUNT(DISTINCT endorser_id)::int FROM user_endorsements WHERE user_id=$1) AS endorsers`, [id]).catch(() => ({ rows: [{ posts: 0, reports: 0, endorsers: 0 }] })),
    own ? query(`SELECT COUNT(*)::int AS n FROM profile_views WHERE user_id=$1 AND day > CURRENT_DATE - 30`, [id]) : Promise.resolve({ rows: [{ n: 0 }] }),
    own ? query(`SELECT status, admin_note, created_at FROM verification_requests WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, [id]) : Promise.resolve({ rows: [] }),
  ]);
  const emap = new Map(endorse.rows.map((r: any) => [r.skill, r]));
  const skills: string[] = Array.isArray(u.skills) ? u.skills : [];
  const certRows = (own || u.show_certs) ? certs.rows : [];
  const out: any = {
    id: u.id, name: u.name, role: u.role, avatar_url: u.avatar_url, created_at: u.created_at,
    bio: u.bio, neighborhood: u.neighborhood, headline: u.headline, profession: u.profession,
    skills: skills.map((s) => ({ name: s, count: (emap.get(s) as any)?.n || 0, mine: !!(emap.get(s) as any)?.mine })),
    social_links: u.social_links || {}, open_to_work: u.open_to_work, show_certs: u.show_certs,
    profile_locked: !!u.profile_locked, locked: false,
    is_verified: u.is_verified, verified_label: u.verified_label, verified_at: u.verified_at, cover_theme: u.cover_theme,
    online: u.show_presence ? !!u.online : false, last_seen_at: u.show_presence ? u.last_seen_at : null,
    certificates: certRows,
    posts_count: counts.rows[0]?.posts ?? 0, reports_count: counts.rows[0]?.reports ?? 0,
    endorsers_count: counts.rows[0]?.endorsers ?? 0,
  };
  // عرض الإدارة: بيانات التواصل الخاصة
  if (viewerStaff && !own) out.admin_contact = { phone: u.phone || null, email: u.email || null, neighborhood: u.neighborhood || null };
  if (own) {
    out.views_30d = views.rows[0]?.n ?? 0;
    out.verification = verif.rows[0] || null;
    out.completeness = completeness(u, certs.rows.length, !!u.avatar_url);
  }
  return out;
}

// ── الملف الكامل ───────────────────────────────────────────────────
router.get("/profile/:id/full", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: "المستخدم غير موجود" });
    const me = await sessionUser(req);
    const p = await loadFull(id, me ? Number(me.id) : null, isStaff(me));
    if (!p) return res.status(404).json({ error: "المستخدم غير موجود" });
    if (me && Number(me.id) !== id) {
      query(`INSERT INTO profile_views (user_id, viewer_id) VALUES ($1,$2)
             ON CONFLICT (user_id, viewer_id, day) DO UPDATE SET viewed_at=NOW()`, [id, Number(me.id)]).catch(() => {});
    }
    return res.json(p);
  } catch (err) { logger.error({ err }, "[profile+] full"); return res.status(500).json({ error: "تعذّر تحميل الملف" }); }
});

// ── تحديث بياناتي المهنية ──────────────────────────────────────────
router.patch("/profile/me", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const b = req.body || {};
    const sets: string[] = []; const vals: unknown[] = [];
    const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if ("headline" in b) set("headline", str(b.headline, 140) || null);
    if ("profession" in b) set("profession", str(b.profession, 100) || null);
    if ("bio" in b) set("bio", str(b.bio, 600));
    if ("neighborhood" in b) set("neighborhood", str(b.neighborhood, 100) || null);
    if ("skills" in b) set("skills", JSON.stringify(cleanSkills(b.skills)));
    if ("open_to_work" in b) set("open_to_work", !!b.open_to_work);
    if ("show_certs" in b) set("show_certs", b.show_certs !== false);
    if ("profile_locked" in b) set("profile_locked", !!b.profile_locked);
    if ("cover_theme" in b) set("cover_theme", str(b.cover_theme, 20) || null);
    if ("social_links" in b) {
      const links: Record<string, string> = {};
      const bad: string[] = [];
      for (const p of SOCIAL_PLATFORMS) {
        const raw = b.social_links?.[p];
        if (raw === undefined || raw === null || raw === "") continue;
        const n = normalizeSocial(p, raw);
        if (n) links[p] = n; else bad.push(p);
      }
      if (bad.length) return res.status(400).json({ error: `رابط غير صالح: ${bad.join("، ")}` });
      set("social_links", JSON.stringify(links));
    }
    if (!sets.length) return res.status(400).json({ error: "لا توجد تغييرات" });
    vals.push(Number(me.id));
    await query(`UPDATE users SET ${sets.join(", ")} WHERE id=$${vals.length}`, vals);
    return res.json(await loadFull(Number(me.id), Number(me.id)));
  } catch (err) { logger.error({ err }, "[profile+] patch"); return res.status(500).json({ error: "تعذّر الحفظ" }); }
});

// ── الشهادات ───────────────────────────────────────────────────────
router.post("/profile/me/certificates", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const f = certFields(req.body);
    if (f.title.length < 2) return res.status(400).json({ error: "اكتب اسم الشهادة" });
    const n = (await query(`SELECT COUNT(*)::int AS n FROM user_certificates WHERE user_id=$1`, [Number(me.id)])).rows[0].n;
    if (n >= 30) return res.status(400).json({ error: "الحد الأقصى 30 شهادة" });
    const r = await query(
      `INSERT INTO user_certificates (user_id, kind, title, issuer, issued_on, credential_id, credential_url, file_url, file_type, is_public, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [Number(me.id), f.kind, f.title, f.issuer, f.issued_on, f.credential_id, f.credential_url, f.file_url, f.file_type, f.is_public, n]);
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "[profile+] cert add"); return res.status(500).json({ error: "تعذّر إضافة الشهادة" }); }
});

router.patch("/profile/me/certificates/:cid", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const f = certFields(req.body);
    if (f.title.length < 2) return res.status(400).json({ error: "اكتب اسم الشهادة" });
    const r = await query(
      `UPDATE user_certificates SET kind=$1, title=$2, issuer=$3, issued_on=$4, credential_id=$5, credential_url=$6,
              file_url=$7, file_type=$8, is_public=$9, reviewed=FALSE
        WHERE id=$10 AND user_id=$11 RETURNING *`,
      [f.kind, f.title, f.issuer, f.issued_on, f.credential_id, f.credential_url, f.file_url, f.file_type, f.is_public, Number(req.params.cid), Number(me.id)]);
    if (!r.rows[0]) return res.status(404).json({ error: "الشهادة غير موجودة" });
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "[profile+] cert edit"); return res.status(500).json({ error: "تعذّر التعديل" }); }
});

router.delete("/profile/me/certificates/:cid", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const r = await query(`DELETE FROM user_certificates WHERE id=$1 AND user_id=$2`, [Number(req.params.cid), Number(me.id)]);
    if (!r.rowCount) return res.status(404).json({ error: "الشهادة غير موجودة" });
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[profile+] cert del"); return res.status(500).json({ error: "تعذّر الحذف" }); }
});

// ── تزكية مهارة (مرة لكل شخص لكل مهارة) ───────────────────────────
router.post("/profile/:id/endorse", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لتزكية المهارات" });
    const id = Number(req.params.id);
    if (id === Number(me.id)) return res.status(400).json({ error: "لا يمكنك تزكية نفسك" });
    const skill = str(req.body?.skill, 40);
    const u = (await query(`SELECT skills, name FROM users WHERE id=$1`, [id])).rows[0];
    if (!u || !Array.isArray(u.skills) || !u.skills.includes(skill)) return res.status(404).json({ error: "المهارة غير موجودة" });
    const del = await query(`DELETE FROM user_endorsements WHERE user_id=$1 AND endorser_id=$2 AND skill=$3`, [id, Number(me.id), skill]);
    let endorsed = false;
    if (!del.rowCount) {
      await query(`INSERT INTO user_endorsements (user_id, endorser_id, skill) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [id, Number(me.id), skill]);
      endorsed = true;
      pushToUser(id, "👏 تزكية جديدة", `زكّاك ${me.name} في مهارة «${skill}»`, { type: "profile", userId: id });
    }
    const n = (await query(`SELECT COUNT(*)::int AS n FROM user_endorsements WHERE user_id=$1 AND skill=$2`, [id, skill])).rows[0].n;
    return res.json({ ok: true, endorsed, count: n });
  } catch (err) { logger.error({ err }, "[profile+] endorse"); return res.status(500).json({ error: "تعذّرت التزكية" }); }
});

// ── من زار ملفي ────────────────────────────────────────────────────
router.get("/profile/me/visitors", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const r = await query(
      `SELECT DISTINCT ON (v.viewer_id) v.viewer_id AS id, u.name, u.avatar_url, u.headline, u.is_verified, v.viewed_at
         FROM profile_views v JOIN users u ON u.id=v.viewer_id
        WHERE v.user_id=$1 AND v.day > CURRENT_DATE - 30 AND COALESCE(u.is_banned,false)=false
        ORDER BY v.viewer_id, v.viewed_at DESC`, [Number(me.id)]);
    const rows = r.rows.sort((a: any, b: any) => +new Date(b.viewed_at) - +new Date(a.viewed_at)).slice(0, 50);
    return res.json({ visitors: rows });
  } catch (err) { logger.error({ err }, "[profile+] visitors"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

// ── طلب التوثيق ───────────────────────────────────────────────────
router.post("/profile/me/verification", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const u = (await query(`SELECT is_verified FROM users WHERE id=$1`, [Number(me.id)])).rows[0];
    if (u?.is_verified) return res.status(400).json({ error: "حسابك موثّق بالفعل" });
    const pending = await query(`SELECT id FROM verification_requests WHERE user_id=$1 AND status='pending'`, [Number(me.id)]);
    if (pending.rows.length) return res.status(400).json({ error: "لديك طلب قيد المراجعة" });
    const doc_url = httpsUrl(req.body?.doc_url);
    if (!doc_url) return res.status(400).json({ error: "أرفق صورة إثبات الهوية" });
    const kind = ["identity", "professional", "business", "public_figure"].includes(req.body?.kind) ? req.body.kind : "identity";
    const r = await query(`INSERT INTO verification_requests (user_id, kind, doc_url, note) VALUES ($1,$2,$3,$4) RETURNING id, status, created_at`,
      [Number(me.id), kind, doc_url, str(req.body?.note, 500) || null]);
    recordAdminAlert({ kind: "verification", title: "طلب توثيق جديد", body: `${me.name} يطلب شارة «موثوق»`, screen: "requests", refId: String(r.rows[0].id), phone: me.phone || undefined }).catch(() => {});
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "[profile+] verif req"); return res.status(500).json({ error: "تعذّر إرسال الطلب" }); }
});

// ── الإدارة: طلبات التوثيق ────────────────────────────────────────
router.get("/admin/verification-requests", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const status = ["pending", "approved", "rejected"].includes(String(req.query.status)) ? String(req.query.status) : "pending";
    const r = await query(
      `SELECT v.*, u.name, u.avatar_url, u.phone, u.headline, u.created_at AS user_created_at
         FROM verification_requests v JOIN users u ON u.id=v.user_id
        WHERE v.status=$1 ORDER BY v.created_at DESC LIMIT 200`, [status]);
    return res.json({ requests: r.rows });
  } catch (err) { logger.error({ err }, "[profile+] admin list"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

async function setVerified(userId: number, verified: boolean, label: string | null) {
  await query(`UPDATE users SET is_verified=$1, verified_at=CASE WHEN $1 THEN NOW() ELSE NULL END, verified_label=$2 WHERE id=$3`,
    [verified, verified ? label : null, userId]);
}

router.patch("/admin/verification-requests/:rid", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const status = req.body?.status === "approved" ? "approved" : req.body?.status === "rejected" ? "rejected" : null;
    if (!status) return res.status(400).json({ error: "حالة غير صالحة" });
    const r = await query(
      `UPDATE verification_requests SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=NOW() WHERE id=$4 RETURNING user_id, kind`,
      [status, str(req.body?.admin_note, 500) || null, Number(me!.id), Number(req.params.rid)]);
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: "الطلب غير موجود" });
    const labels: Record<string, string> = { identity: "هوية موثّقة", professional: "مهني موثّق", business: "نشاط تجاري موثّق", public_figure: "شخصية عامة" };
    if (status === "approved") {
      await setVerified(row.user_id, true, labels[row.kind] || "موثوق");
      pushToUser(row.user_id, "✅ تم توثيق حسابك", "أصبح حسابك «موثوق» وتظهر الشارة بجانب اسمك", { type: "profile", userId: row.user_id });
    } else {
      pushToUser(row.user_id, "طلب التوثيق", str(req.body?.admin_note, 200) || "لم يُقبل طلب التوثيق، يمكنك إعادة المحاولة بصورة أوضح", { type: "profile", userId: row.user_id });
    }
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[profile+] admin review"); return res.status(500).json({ error: "تعذّرت المراجعة" }); }
});

router.post("/admin/users/:id/verify", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!isStaff(me)) return res.status(403).json({ error: "للإدارة فقط" });
    const verified = req.body?.verified !== false;
    await setVerified(Number(req.params.id), verified, str(req.body?.label, 80) || "موثوق");
    return res.json({ ok: true, verified });
  } catch (err) { logger.error({ err }, "[profile+] admin verify"); return res.status(500).json({ error: "تعذّر التحديث" }); }
});

// ── النشطون الآن ───────────────────────────────────────────────────
router.get("/social/active-now", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    const r = await query(
      `SELECT id, name, avatar_url, headline, profession, is_verified, last_seen_at
         FROM users
        WHERE show_presence AND last_seen_at > NOW() - make_interval(secs => ${ONLINE_SEC})
          AND COALESCE(is_banned,false)=false AND id <> $1
        ORDER BY is_verified DESC, last_seen_at DESC LIMIT 60`, [me ? Number(me.id) : 0]);
    const total = (await query(`SELECT COUNT(*)::int AS n FROM users WHERE show_presence AND last_seen_at > NOW() - make_interval(secs => ${ONLINE_SEC})`)).rows[0].n;
    return res.json({ users: r.rows, total });
  } catch (err) { logger.error({ err }, "[profile+] active"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

// ── الملف المهني العام (صفحة ويب لجهات العمل) ─────────────────────
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const KIND_AR: Record<string, string> = { degree: "مؤهل علمي", course: "دورة تدريبية", license: "رخصة مهنية", award: "جائزة / تكريم", experience: "خبرة عملية", other: "أخرى" };
const SOCIAL_AR: Record<string, string> = { whatsapp: "واتساب", facebook: "فيسبوك", instagram: "إنستغرام", x: "X", tiktok: "تيك توك", linkedin: "لينكدإن", youtube: "يوتيوب", telegram: "تيليجرام", snapchat: "سناب شات", github: "GitHub", website: "الموقع" };

router.get("/public/cv/:id", async (req: Request, res: Response) => {
  try {
    const p = await loadFull(Number(req.params.id), null);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=120");
    if (!p) return res.status(404).send(`<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:40px">الملف غير موجود</body>`);
    if ((p as any).locked) return res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body dir="rtl" style="font-family:Cairo,sans-serif;padding:40px;text-align:center;background:#F4F7F5"><div style="font-size:42px">🔒</div><h2>${esc(p.name)}</h2><p style="color:#6B7C74">قفل صاحب الملف ملفه الشخصي، لذلك لا تظهر تفاصيله للعامة.</p></body>`);
    const certs = (p.certificates as any[]).map((c) => `
      <div class="cert">
        <div class="k">${esc(KIND_AR[c.kind] || "")}</div>
        <div class="t">${esc(c.title)}</div>
        <div class="m">${esc([c.issuer, c.issued_on].filter(Boolean).join(" · "))}${c.credential_id ? ` · رقم: ${esc(c.credential_id)}` : ""}</div>
        <div class="links">${c.file_url ? `<a href="${esc(c.file_url)}" target="_blank" rel="noopener">عرض الشهادة</a>` : ""}${c.credential_url ? `<a href="${esc(c.credential_url)}" target="_blank" rel="noopener">التحقق</a>` : ""}</div>
      </div>`).join("");
    const skills = (p.skills as any[]).map((s) => `<span class="chip">${esc(s.name)}${s.count ? ` <b>+${s.count}</b>` : ""}</span>`).join("");
    const links = Object.entries(p.social_links || {}).map(([k, v]) => `<a class="soc" href="${esc(v)}" target="_blank" rel="noopener">${esc(SOCIAL_AR[k] || k)}</a>`).join("");
    const since = new Date(p.created_at).toLocaleDateString("ar", { year: "numeric", month: "long" });
    return res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} — الملف المهني | حصاحيصاوي</title>
<meta property="og:title" content="${esc(p.name)}${p.headline ? " — " + esc(p.headline) : ""}"><meta property="og:description" content="${esc((p.bio || "").slice(0, 160))}">
${p.avatar_url ? `<meta property="og:image" content="${esc(p.avatar_url)}">` : ""}
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--g:#00966A;--gd:#0B5C45;--bg:#F4F7F5;--tx:#13221C;--mu:#6B7C74;--bd:#E2EAE6}
*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Cairo,system-ui,sans-serif;color:var(--tx)}
.wrap{max-width:760px;margin:0 auto;padding:16px}
.hero{background:#fff;border:1px solid var(--bd);border-radius:22px;overflow:hidden}
.cover{height:92px;background:linear-gradient(135deg,var(--gd),var(--g))}
.head{padding:0 20px 20px;text-align:center;margin-top:-48px}
.av{width:96px;height:96px;border-radius:30px;border:4px solid #fff;object-fit:cover;background:#E8F3EE;display:inline-flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:var(--g)}
h1{margin:8px 0 0;font-size:22px;display:flex;gap:6px;align-items:center;justify-content:center}
.vb{display:inline-flex;align-items:center;gap:4px;background:#1D9BF0;color:#fff;font-size:11px;padding:2px 8px;border-radius:20px}
.hl{color:var(--gd);font-weight:600;margin-top:2px}.mu{color:var(--mu);font-size:13px}
.otw{display:inline-block;margin-top:8px;background:#E6F6EF;color:var(--g);border:1px solid #BFE6D5;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700}
.bio{margin-top:12px;line-height:1.9;color:#33463E}
.sec{background:#fff;border:1px solid var(--bd);border-radius:20px;padding:16px 18px;margin-top:12px}
.sec h2{font-size:16px;margin:0 0 10px}
.chip{display:inline-block;background:var(--bg);border:1px solid var(--bd);border-radius:20px;padding:4px 12px;margin:3px;font-size:13px}.chip b{color:var(--g)}
.cert{border-top:1px solid var(--bd);padding:10px 0}.cert:first-of-type{border-top:0}
.cert .k{font-size:11px;color:var(--g);font-weight:700}.cert .t{font-weight:700}.cert .m{font-size:12.5px;color:var(--mu)}
.links a,.soc{display:inline-block;margin:6px 0 0 8px;color:var(--g);font-weight:600;text-decoration:none;font-size:13px}
.soc{background:var(--bg);border:1px solid var(--bd);padding:5px 12px;border-radius:12px;color:var(--tx)}
.foot{text-align:center;color:var(--mu);font-size:12px;margin:18px 0}
@media print{.soc,.links{display:none}body{background:#fff}}
</style></head><body><div class="wrap">
<div class="hero"><div class="cover"></div><div class="head">
${p.avatar_url ? `<img class="av" src="${esc(p.avatar_url)}" alt="">` : `<div class="av">${esc(String(p.name || "?").trim().charAt(0))}</div>`}
<h1>${esc(p.name)}${p.is_verified ? `<span class="vb">✔ ${esc(p.verified_label || "موثوق")}</span>` : ""}</h1>
${p.headline ? `<div class="hl">${esc(p.headline)}</div>` : ""}
<div class="mu">${esc([p.profession, p.neighborhood ? p.neighborhood + " · الحصاحيصا" : "", "عضو منذ " + since].filter(Boolean).join(" · "))}</div>
${p.open_to_work ? `<div class="otw">متاح للعمل</div>` : ""}
${p.bio ? `<div class="bio">${esc(p.bio)}</div>` : ""}
</div></div>
${skills ? `<div class="sec"><h2>المهارات${p.endorsers_count ? ` <span class="mu">· زكّاه ${p.endorsers_count} شخص</span>` : ""}</h2>${skills}</div>` : ""}
${certs ? `<div class="sec"><h2>الشهادات والخبرات</h2>${certs}</div>` : ""}
${links ? `<div class="sec"><h2>للتواصل</h2>${links}</div>` : ""}
<div class="foot">الملف المهني على تطبيق حصاحيصاوي</div>
</div></body></html>`);
  } catch (err) { logger.error({ err }, "[profile+] public cv"); return res.status(500).send("error"); }
});

export default router;
