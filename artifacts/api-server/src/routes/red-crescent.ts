// ════════════════════════════════════════════════════════════════
// 🚑 مساحة جمعية الهلال الأحمر السوداني (فرعية الحصاحيصا)
// الأعضاء حسابات حصاحيصاوي عادية بدور داخل الجمعية:
//   volunteer متطوع · paramedic مسعف · leader قائد فريق · admin إدارة الفرع
// الإدارة: مدراء الفرع + مدراء حصاحيصاوي. بطاقة مسعف برمز تحقق عام.
// التكامل: نقاط حضور الأنشطة تُضاف لرصيد التطوع في حصاحيصاوي،
// وربط اختياري برمز بطاقة المستجيب في تطبيق «مسعف».
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomBytes, randomInt } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();
const ROLES = ["volunteer", "paramedic", "leader", "admin"] as const;
type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { volunteer: "متطوع", paramedic: "مسعف", leader: "قائد فريق", admin: "إدارة الفرع" };
const AUDIENCES = ["public", "members", "paramedics", "admins"] as const;
const ACTIVITY_TYPES = ["training", "campaign", "response", "awareness", "blood", "relief", "other"] as const;
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const API_BASE = (process.env.PUBLIC_API_BASE || "https://api-server-gilt-ten.vercel.app").replace(/\/$/, "");

let ready: Promise<void> | null = null;
export function ensureRedCrescentDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS srcs_members (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(16) NOT NULL DEFAULT 'volunteer',
        desired_role VARCHAR(16),
        status VARCHAR(12) NOT NULL DEFAULT 'pending',
        unit VARCHAR(120),
        phone VARCHAR(30),
        blood_type VARCHAR(4),
        experience TEXT,
        certifications TEXT,
        musif_code VARCHAR(40),
        card_no VARCHAR(30) UNIQUE,
        card_token VARCHAR(40) UNIQUE,
        card_issued_at TIMESTAMPTZ,
        card_expires_at TIMESTAMPTZ,
        admin_note TEXT,
        reviewed_by INTEGER,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_meetings (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        agenda TEXT,
        place VARCHAR(200),
        starts_at TIMESTAMPTZ NOT NULL,
        audience VARCHAR(12) NOT NULL DEFAULT 'members',
        minutes TEXT,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_meeting_rsvps (
        meeting_id INTEGER NOT NULL REFERENCES srcs_meetings(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'going',
        attended BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (meeting_id, user_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_announcements (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        audience VARCHAR(12) NOT NULL DEFAULT 'members',
        pinned BOOLEAN NOT NULL DEFAULT FALSE,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_activities (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        type VARCHAR(16) NOT NULL DEFAULT 'other',
        description TEXT,
        place VARCHAR(200),
        happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        images JSONB NOT NULL DEFAULT '[]',
        beneficiaries INTEGER NOT NULL DEFAULT 0,
        published BOOLEAN NOT NULL DEFAULT TRUE,
        points INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE TABLE IF NOT EXISTS srcs_activity_participants (
        activity_id INTEGER NOT NULL REFERENCES srcs_activities(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (activity_id, user_id)
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_srcs_members_status ON srcs_members(status, role)`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

router.use(["/srcs", "/public/srcs"], async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureRedCrescentDb(); return next(); }
  catch (err) { logger.error({ err }, "[srcs] ensure"); return res.status(500).json({ error: "تعذّر التهيئة" }); }
});

const fail = (res: Response, err: unknown, where: string, msg = "خطأ في الخادم") => {
  logger.error({ err }, `[srcs] ${where}`); return res.status(500).json({ error: msg });
};
const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);

async function membership(userId: number | string | undefined) {
  if (!userId) return null;
  return (await query(`SELECT * FROM srcs_members WHERE user_id=$1`, [userId])).rows[0] ?? null;
}
/** إدارة الفرع: مدير حصاحيصاوي، أو عضو نشط بدور admin في الجمعية */
async function isBranchAdmin(me: SessionUser | null): Promise<boolean> {
  if (!me) return false;
  if (me.role === "admin") return true;
  const m = await membership(me.id);
  return !!m && m.status === "active" && m.role === "admin";
}
/** الجماهير التي يحق للمستخدم رؤيتها */
function audiencesFor(m: any, admin: boolean): string[] {
  if (admin) return [...AUDIENCES];
  if (!m || m.status !== "active") return ["public"];
  const a = ["public", "members"];
  if (m.role === "paramedic" || m.role === "leader") a.push("paramedics");
  return a;
}

async function notifyUsers(userIds: number[], title: string, body: string, data: Record<string, unknown> = {}) {
  if (!userIds.length) return;
  try {
    await query(`INSERT INTO notifications (user_id, type, title, body, data)
                 SELECT u, 'srcs', $2, $3, $4 FROM UNNEST($1::int[]) AS u`, [userIds, title, body, JSON.stringify({ ...data, screen: "red-crescent" })]);
  } catch { /* جدول الإشعارات قد يختلف — لا نعطّل العملية */ }
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [userIds]);
    for (let i = 0; i < rows.length; i += 90) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
        body: JSON.stringify(rows.slice(i, i + 90).map((r: any) => ({ to: r.token, title, body, sound: "default", priority: "high", data: { ...data, screen: "red-crescent" } }))),
      }).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[srcs] push"); }
}
async function audienceUserIds(audience: string): Promise<number[]> {
  const roles = audience === "admins" ? ["admin"] : audience === "paramedics" ? ["paramedic", "leader", "admin"] : ROLES as unknown as string[];
  const r = await query(`SELECT user_id FROM srcs_members WHERE status='active' AND role = ANY($1::text[])`, [roles]);
  return r.rows.map((x: any) => Number(x.user_id));
}

function newCard() {
  const y = new Date().getFullYear();
  return { no: `SRCS-HSH-${y}-${randomInt(10000, 100000)}`, token: randomBytes(12).toString("hex") };
}
const cardUrl = (token: string) => `${API_BASE}/api/public/srcs/verify/${token}`;

// ═══ عام ═══════════════════════════════════════════════════════
router.get("/srcs/overview", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    const m = me ? await membership(me.id) : null;
    const admin = await isBranchAdmin(me);
    const aud = audiencesFor(m, admin);
    const [stats, ann, acts] = await Promise.all([
      query(`SELECT
          (SELECT COUNT(*)::int FROM srcs_members WHERE status='active') AS members,
          (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND role IN ('paramedic','leader')) AS paramedics,
          (SELECT COUNT(*)::int FROM srcs_activities WHERE published) AS activities,
          (SELECT COALESCE(SUM(beneficiaries),0)::int FROM srcs_activities WHERE published) AS beneficiaries`),
      query(`SELECT id, title, body, audience, pinned, created_at FROM srcs_announcements WHERE audience = ANY($1::text[])
             ORDER BY pinned DESC, created_at DESC LIMIT 15`, [aud]),
      query(`SELECT a.*, (SELECT COUNT(*)::int FROM srcs_activity_participants p WHERE p.activity_id=a.id) AS volunteers
               FROM srcs_activities a WHERE published OR $1 ORDER BY happened_at DESC LIMIT 30`, [admin]),
    ]);
    const myMeetings = m && m.status === "active" ? (await query(
      `SELECT mt.id, mt.title, mt.place, mt.starts_at, mt.agenda, mt.audience, r.status AS my_rsvp
         FROM srcs_meetings mt LEFT JOIN srcs_meeting_rsvps r ON r.meeting_id=mt.id AND r.user_id=$1
        WHERE mt.audience = ANY($2::text[]) AND mt.starts_at > NOW() - INTERVAL '6 hours'
        ORDER BY mt.starts_at LIMIT 10`, [me!.id, aud])).rows : [];
    return res.json({
      stats: stats.rows[0], announcements: ann.rows, activities: acts.rows, meetings: myMeetings,
      membership: m ? { ...m, role_label: ROLE_LABEL[m.role as Role], card_url: m.card_token ? cardUrl(m.card_token) : null } : null,
      isAdmin: admin,
    });
  } catch (err) { return fail(res, err, "overview"); }
});

// ═══ العضوية ═══════════════════════════════════════════════════
router.post("/srcs/join", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول لتقديم طلب الانضمام" });
    const b = req.body || {};
    const desired = ROLES.includes(b.desired_role) && b.desired_role !== "admin" ? b.desired_role : "volunteer";
    const blood = BLOOD.includes(String(b.blood_type)) ? String(b.blood_type) : null;
    const cur = await membership(me.id);
    if (cur && (cur.status === "active" || cur.status === "pending"))
      return res.status(409).json({ error: cur.status === "active" ? "أنت عضو بالفعل" : "طلبك قيد المراجعة" });
    const r = await query(
      `INSERT INTO srcs_members (user_id, desired_role, role, status, unit, phone, blood_type, experience, certifications, musif_code)
       VALUES ($1,$2,'volunteer','pending',$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id) DO UPDATE SET desired_role=$2, status='pending', unit=$3, phone=$4, blood_type=$5,
         experience=$6, certifications=$7, musif_code=$8, admin_note=NULL, created_at=NOW()
       RETURNING *`,
      [me.id, desired, str(b.unit, 120) || null, str(b.phone, 30) || me.phone || null, blood, str(b.experience) || null, str(b.certifications) || null, str(b.musif_code, 40) || null]);
    const admins = (await query(`SELECT user_id FROM srcs_members WHERE status='active' AND role='admin'`)).rows.map((x: any) => Number(x.user_id));
    notifyUsers(admins, "🚑 طلب انضمام جديد", `${me.name} يطلب الانضمام ${desired === "paramedic" ? "كمسعف" : "كمتطوع"}`, { kind: "srcs_request" });
    return res.json({ membership: r.rows[0] });
  } catch (err) { return fail(res, err, "join"); }
});

router.patch("/srcs/me", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const b = req.body || {};
    const blood = b.blood_type === undefined ? undefined : BLOOD.includes(String(b.blood_type)) ? String(b.blood_type) : null;
    const r = await query(
      `UPDATE srcs_members SET musif_code=COALESCE($2, musif_code), blood_type=COALESCE($3, blood_type), phone=COALESCE($4, phone)
        WHERE user_id=$1 RETURNING *`,
      [me.id, b.musif_code === undefined ? null : str(b.musif_code, 40), blood ?? null, b.phone === undefined ? null : str(b.phone, 30)]);
    if (!r.rows[0]) return res.status(404).json({ error: "لست عضواً بعد" });
    return res.json({ membership: r.rows[0] });
  } catch (err) { return fail(res, err, "me"); }
});

router.post("/srcs/meetings/:id/rsvp", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    const m = me ? await membership(me.id) : null;
    if (!m || m.status !== "active") return res.status(403).json({ error: "للأعضاء فقط" });
    const status = ["going", "not_going", "maybe"].includes(req.body?.status) ? req.body.status : "going";
    await query(`INSERT INTO srcs_meeting_rsvps (meeting_id, user_id, status) VALUES ($1,$2,$3)
                 ON CONFLICT (meeting_id, user_id) DO UPDATE SET status=$3`, [Number(req.params.id), me!.id, status]);
    return res.json({ ok: true, status });
  } catch (err) { return fail(res, err, "rsvp"); }
});

// ═══ تحقق عام من بطاقة المسعف (هدف رمز QR) ═══════════════════════
router.get("/public/srcs/verify/:token", async (req: Request, res: Response) => {
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const t = str(req.params.token, 40).toLowerCase();
    const r = /^[0-9a-f]{24}$/.test(t) ? await query(
      `SELECT m.role, m.status, m.card_no, m.card_expires_at, m.blood_type, m.musif_code, u.name, u.avatar_url
         FROM srcs_members m JOIN users u ON u.id=m.user_id WHERE m.card_token=$1`, [t]) : { rows: [] as any[] };
    const c = r.rows[0];
    const valid = c && c.status === "active" && c.card_expires_at && new Date(c.card_expires_at) > new Date();
    const state = !c ? ["غير موجودة", "#B91C1C", "لم نعثر على بطاقة بهذا الرمز."]
      : valid ? ["بطاقة سارية", "#15803D", `تنتهي في ${new Date(c.card_expires_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}`]
      : ["بطاقة غير سارية", "#B45309", c.status !== "active" ? "العضوية موقوفة أو قيد المراجعة." : "انتهت صلاحية البطاقة."];
    return res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>التحقق من بطاقة مسعف — حصاحيصاوي</title>
<style>body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#F4F7F5;color:#14261F;display:flex;min-height:100vh;align-items:center;justify-content:center}
.c{background:#fff;max-width:420px;width:92%;border-radius:22px;box-shadow:0 10px 30px #0001;overflow:hidden}
.h{background:linear-gradient(135deg,#7F1D1D,#B91C1C);color:#fff;padding:18px;text-align:center}
.s{margin:16px;padding:12px;border-radius:14px;text-align:center;font-weight:bold;color:#fff;background:${state[1]}}
.r{display:flex;justify-content:space-between;padding:10px 18px;border-top:1px solid #EEF2F0}.r b{color:#0B6B49}
.f{font-size:12px;color:#6B7C74;text-align:center;padding:14px}</style></head><body><div class="c">
<div class="h"><svg width="56" height="56" viewBox="0 0 100 100" aria-label="شارة الهلال الأحمر" style="display:block;margin:0 auto 6px"><defs><mask id="m"><rect width="100" height="100" fill="#000"/><circle cx="50" cy="50" r="34" fill="#fff"/><circle cx="63" cy="50" r="28" fill="#000"/></mask></defs><rect width="100" height="100" rx="24" fill="#fff"/><rect width="100" height="100" fill="#D7141A" mask="url(#m)"/></svg><div style="font-size:13px;opacity:.9">جمعية الهلال الأحمر السوداني — فرعية الحصاحيصا</div><div style="font-size:20px;font-weight:bold;margin-top:4px">التحقق من بطاقة العضوية</div></div>
<div class="s">${esc(state[0])}<div style="font-weight:normal;font-size:13px;margin-top:4px">${esc(state[2])}</div></div>
${c ? `<div class="r"><span>الاسم</span><b>${esc(c.name)}</b></div><div class="r"><span>الصفة</span><b>${esc(ROLE_LABEL[c.role as Role] || c.role)}</b></div>
<div class="r"><span>رقم البطاقة</span><b dir="ltr">${esc(c.card_no)}</b></div>${c.blood_type ? `<div class="r"><span>فصيلة الدم</span><b dir="ltr">${esc(c.blood_type)}</b></div>` : ""}
${c.musif_code ? `<div class="r"><span>مستجيب في «مسعف»</span><b><a href="https://musif.app/v/${encodeURIComponent(c.musif_code)}">تحقق</a></b></div>` : ""}` : ""}
<div class="f">صادرة عبر تطبيق حصاحيصاوي · ${new Date().toLocaleString("ar-EG")}</div></div></body></html>`);
  } catch (err) { logger.error({ err }, "[srcs] verify"); return res.status(500).send("خطأ"); }
});

// ═══ إدارة الفرع ═══════════════════════════════════════════════
async function requireAdmin(req: Request, res: Response): Promise<SessionUser | null> {
  const me = await sessionUser(req);
  if (!(await isBranchAdmin(me))) { res.status(403).json({ error: "لإدارة الفرع فقط" }); return null; }
  return me;
}

router.get("/srcs/admin/dashboard", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const r = await query(`SELECT
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='pending') AS pending,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='active') AS active,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND role IN ('paramedic','leader')) AS paramedics,
      (SELECT COUNT(*)::int FROM srcs_members WHERE status='active' AND card_expires_at < NOW() + INTERVAL '30 days') AS cards_expiring,
      (SELECT COUNT(*)::int FROM srcs_meetings WHERE starts_at > NOW()) AS upcoming_meetings,
      (SELECT COUNT(*)::int FROM srcs_activities) AS activities,
      (SELECT COALESCE(SUM(beneficiaries),0)::int FROM srcs_activities) AS beneficiaries`);
    return res.json(r.rows[0]);
  } catch (err) { return fail(res, err, "dashboard"); }
});

router.get("/srcs/admin/members", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const status = ["pending", "active", "suspended", "rejected"].includes(String(req.query.status)) ? String(req.query.status) : null;
    const r = await query(
      `SELECT m.*, u.name, u.avatar_url, u.phone AS account_phone FROM srcs_members m JOIN users u ON u.id=m.user_id
        WHERE ($1::text IS NULL OR m.status=$1) ORDER BY (m.status='pending') DESC, m.created_at DESC LIMIT 300`, [status]);
    return res.json({ members: r.rows });
  } catch (err) { return fail(res, err, "members"); }
});

router.patch("/srcs/admin/members/:id", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res); if (!me) return;
    const b = req.body || {};
    const cur = (await query(`SELECT m.*, u.name FROM srcs_members m JOIN users u ON u.id=m.user_id WHERE m.id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "العضو غير موجود" });
    const status = ["pending", "active", "suspended", "rejected"].includes(b.status) ? b.status : cur.status;
    let role: Role = ROLES.includes(b.role) ? b.role : cur.role;
    // تعيين مدير فرع: لمدراء حصاحيصاوي ولمدراء الفرع فقط (requireAdmin)، ولا يُنزل المرء نفسه
    if (Number(cur.user_id) === Number(me.id) && role !== "admin" && me.role !== "admin") role = cur.role;
    let cardNo = cur.card_no, cardToken = cur.card_token, issued = cur.card_issued_at, expires = cur.card_expires_at;
    const becameActive = status === "active" && cur.status !== "active";
    if (status === "active" && (!cardNo || b.renew_card)) {
      if (!cardNo) { const c = newCard(); cardNo = c.no; cardToken = c.token; }
      issued = new Date(); expires = new Date(Date.now() + 365 * 86400_000);
    }
    const r = await query(
      `UPDATE srcs_members SET status=$2, role=$3, unit=COALESCE($4, unit), admin_note=$5, card_no=$6, card_token=$7,
         card_issued_at=$8, card_expires_at=$9, reviewed_by=$10, reviewed_at=NOW() WHERE id=$1 RETURNING *`,
      [cur.id, status, role, b.unit === undefined ? null : str(b.unit, 120), b.admin_note === undefined ? cur.admin_note : str(b.admin_note) || null,
       cardNo, cardToken, issued, expires, me.id]);
    if (becameActive) notifyUsers([Number(cur.user_id)], "🚑 مرحباً بك في الهلال الأحمر", `قُبل طلبك بصفة ${ROLE_LABEL[role]} — بطاقتك جاهزة في التطبيق`, { kind: "srcs_accepted" });
    else if (status === "rejected" && cur.status !== "rejected") notifyUsers([Number(cur.user_id)], "طلب الانضمام للهلال الأحمر", "لم يُقبل طلبك حالياً" + (b.admin_note ? `: ${str(b.admin_note, 200)}` : ""), {});
    else if (b.renew_card) notifyUsers([Number(cur.user_id)], "🪪 تجديد بطاقة المسعف", "جُدّدت بطاقتك لعام", {});
    return res.json({ member: r.rows[0] });
  } catch (err) { return fail(res, err, "member patch"); }
});

// الاجتماعات
router.get("/srcs/admin/meetings", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const r = await query(`SELECT mt.*,
        (SELECT COUNT(*)::int FROM srcs_meeting_rsvps r WHERE r.meeting_id=mt.id AND r.status='going') AS going,
        (SELECT COUNT(*)::int FROM srcs_meeting_rsvps r WHERE r.meeting_id=mt.id AND r.attended) AS attended
      FROM srcs_meetings mt ORDER BY mt.starts_at DESC LIMIT 100`);
    return res.json({ meetings: r.rows });
  } catch (err) { return fail(res, err, "meetings"); }
});
router.post("/srcs/admin/meetings", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res); if (!me) return;
    const b = req.body || {};
    const starts = new Date(b.starts_at);
    if (!str(b.title) || isNaN(starts.getTime())) return res.status(400).json({ error: "العنوان والموعد مطلوبان" });
    const audience = AUDIENCES.includes(b.audience) && b.audience !== "public" ? b.audience : "members";
    const r = await query(`INSERT INTO srcs_meetings (title, agenda, place, starts_at, audience, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [str(b.title, 200), str(b.agenda) || null, str(b.place, 200) || null, starts, audience, me.id]);
    notifyUsers(await audienceUserIds(audience), "📅 اجتماع جديد", `${str(b.title, 120)} — ${starts.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}`, { kind: "srcs_meeting", id: r.rows[0].id });
    return res.json({ meeting: r.rows[0] });
  } catch (err) { return fail(res, err, "meeting create"); }
});
router.patch("/srcs/admin/meetings/:id", writeLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const b = req.body || {};
    const r = await query(`UPDATE srcs_meetings SET title=COALESCE($2,title), agenda=COALESCE($3,agenda), place=COALESCE($4,place),
        starts_at=COALESCE($5,starts_at), minutes=COALESCE($6,minutes) WHERE id=$1 RETURNING *`,
      [Number(req.params.id), b.title ? str(b.title, 200) : null, b.agenda === undefined ? null : str(b.agenda), b.place === undefined ? null : str(b.place, 200),
       b.starts_at && !isNaN(new Date(b.starts_at).getTime()) ? new Date(b.starts_at) : null, b.minutes === undefined ? null : str(b.minutes, 8000)]);
    if (Array.isArray(b.attended_user_ids)) {
      const ids = b.attended_user_ids.map(Number).filter(Number.isFinite).slice(0, 500);
      await query(`UPDATE srcs_meeting_rsvps SET attended = (user_id = ANY($2::int[])) WHERE meeting_id=$1`, [Number(req.params.id), ids]);
      await query(`INSERT INTO srcs_meeting_rsvps (meeting_id, user_id, status, attended) SELECT $1, u, 'going', TRUE FROM UNNEST($2::int[]) u
                   ON CONFLICT (meeting_id, user_id) DO UPDATE SET attended=TRUE`, [Number(req.params.id), ids]);
    }
    return res.json({ meeting: r.rows[0] });
  } catch (err) { return fail(res, err, "meeting patch"); }
});
router.get("/srcs/admin/meetings/:id/rsvps", async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const r = await query(`SELECT m.user_id, u.name, m.role, r.status, COALESCE(r.attended,FALSE) AS attended
        FROM srcs_members m JOIN users u ON u.id=m.user_id
        LEFT JOIN srcs_meeting_rsvps r ON r.user_id=m.user_id AND r.meeting_id=$1
       WHERE m.status='active' ORDER BY r.status NULLS LAST, u.name`, [Number(req.params.id)]);
    return res.json({ rsvps: r.rows });
  } catch (err) { return fail(res, err, "rsvps"); }
});
router.delete("/srcs/admin/meetings/:id", async (req, res) => {
  try { if (!(await requireAdmin(req, res))) return; await query(`DELETE FROM srcs_meetings WHERE id=$1`, [Number(req.params.id)]); return res.json({ ok: true }); }
  catch (err) { return fail(res, err, "meeting delete"); }
});

// الإعلانات
router.post("/srcs/admin/announcements", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res); if (!me) return;
    const b = req.body || {};
    if (!str(b.title) || !str(b.body)) return res.status(400).json({ error: "العنوان والنص مطلوبان" });
    const audience = AUDIENCES.includes(b.audience) ? b.audience : "members";
    const r = await query(`INSERT INTO srcs_announcements (title, body, audience, pinned, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [str(b.title, 200), str(b.body, 6000), audience, !!b.pinned, me.id]);
    if (b.notify !== false && audience !== "public") notifyUsers(await audienceUserIds(audience), `📢 ${str(b.title, 100)}`, str(b.body, 140), { kind: "srcs_announcement" });
    return res.json({ announcement: r.rows[0] });
  } catch (err) { return fail(res, err, "announcement"); }
});
router.patch("/srcs/admin/announcements/:id", writeLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const b = req.body || {};
    const r = await query(`UPDATE srcs_announcements SET title=COALESCE($2,title), body=COALESCE($3,body), pinned=COALESCE($4,pinned) WHERE id=$1 RETURNING *`,
      [Number(req.params.id), b.title ? str(b.title, 200) : null, b.body ? str(b.body, 6000) : null, typeof b.pinned === "boolean" ? b.pinned : null]);
    return res.json({ announcement: r.rows[0] });
  } catch (err) { return fail(res, err, "announcement patch"); }
});
router.delete("/srcs/admin/announcements/:id", async (req, res) => {
  try { if (!(await requireAdmin(req, res))) return; await query(`DELETE FROM srcs_announcements WHERE id=$1`, [Number(req.params.id)]); return res.json({ ok: true }); }
  catch (err) { return fail(res, err, "announcement delete"); }
});

// الأنشطة والفعاليات (توثيق + نقاط تطوع للمشاركين)
router.post("/srcs/admin/activities", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res); if (!me) return;
    const b = req.body || {};
    if (!str(b.title)) return res.status(400).json({ error: "العنوان مطلوب" });
    const images = (Array.isArray(b.images) ? b.images : []).map((x: unknown) => str(x, 500)).filter((x: string) => /^https:\/\//.test(x)).slice(0, 12);
    const when = b.happened_at && !isNaN(new Date(b.happened_at).getTime()) ? new Date(b.happened_at) : new Date();
    const r = await query(
      `INSERT INTO srcs_activities (title, type, description, place, happened_at, images, beneficiaries, published, points, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [str(b.title, 200), ACTIVITY_TYPES.includes(b.type) ? b.type : "other", str(b.description, 8000) || null, str(b.place, 200) || null, when,
       JSON.stringify(images), Math.max(0, Math.min(1_000_000, Number(b.beneficiaries) || 0)), b.published !== false,
       Math.max(0, Math.min(200, Number(b.points) || 0)), me.id]);
    return res.json({ activity: r.rows[0] });
  } catch (err) { return fail(res, err, "activity"); }
});
router.patch("/srcs/admin/activities/:id", writeLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const b = req.body || {};
    const images = Array.isArray(b.images) ? JSON.stringify(b.images.map((x: unknown) => str(x, 500)).filter((x: string) => /^https:\/\//.test(x)).slice(0, 12)) : null;
    const r = await query(`UPDATE srcs_activities SET title=COALESCE($2,title), description=COALESCE($3,description), place=COALESCE($4,place),
        images=COALESCE($5::jsonb,images), beneficiaries=COALESCE($6,beneficiaries), published=COALESCE($7,published) WHERE id=$1 RETURNING *`,
      [Number(req.params.id), b.title ? str(b.title, 200) : null, b.description === undefined ? null : str(b.description, 8000),
       b.place === undefined ? null : str(b.place, 200), images, b.beneficiaries === undefined ? null : Math.max(0, Number(b.beneficiaries) || 0),
       typeof b.published === "boolean" ? b.published : null]);
    return res.json({ activity: r.rows[0] });
  } catch (err) { return fail(res, err, "activity patch"); }
});
router.delete("/srcs/admin/activities/:id", async (req, res) => {
  try { if (!(await requireAdmin(req, res))) return; await query(`DELETE FROM srcs_activities WHERE id=$1`, [Number(req.params.id)]); return res.json({ ok: true }); }
  catch (err) { return fail(res, err, "activity delete"); }
});
/** تسجيل المشاركين: تُضاف نقاط النشاط إلى رصيد التطوع في حصاحيصاوي (مرة واحدة لكل مشارك) */
router.post("/srcs/admin/activities/:id/participants", writeLimiter, async (req, res) => {
  try {
    const me = await requireAdmin(req, res); if (!me) return;
    const act = (await query(`SELECT * FROM srcs_activities WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!act) return res.status(404).json({ error: "النشاط غير موجود" });
    const ids: number[] = (Array.isArray(req.body?.user_ids) ? req.body.user_ids : []).map(Number).filter(Number.isFinite).slice(0, 500);
    const valid = (await query(`SELECT user_id FROM srcs_members WHERE status='active' AND user_id = ANY($1::int[])`, [ids])).rows.map((x: any) => Number(x.user_id));
    let awarded = 0;
    for (const uid of valid) {
      const ins = await query(`INSERT INTO srcs_activity_participants (activity_id, user_id, points) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id`,
        [act.id, uid, act.points]);
      if (ins.rows[0] && act.points > 0) {
        await query(`INSERT INTO volunteer_points (user_id, points, reason, created_by) VALUES ($1,$2,$3,$4)`,
          [uid, act.points, `الهلال الأحمر: ${String(act.title).slice(0, 150)}`, me.id]).catch(() => {});
        awarded++;
      }
    }
    if (awarded) notifyUsers(valid, "🎖️ نقاط تطوع جديدة", `+${act.points} نقطة لمشاركتك في «${String(act.title).slice(0, 80)}»`, { kind: "srcs_points" });
    return res.json({ ok: true, participants: valid.length, awarded });
  } catch (err) { return fail(res, err, "participants"); }
});

export default router;
