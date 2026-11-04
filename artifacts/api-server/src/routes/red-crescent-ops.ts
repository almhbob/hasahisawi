// ════════════════════════════════════════════════════════════════
// 🚑 الهلال الأحمر — العمليات: ملفات خاصة، تذكيرات تلقائية، تصدير وطباعة،
//    سجل التدقيق، وتسجيل الحضور بمسح بطاقة المسعف.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import { verifyGithubOidc } from "./ci-play-token";
import { ensureRedCrescentDb, requireScope, narrowUnits, unitCond, loadScoped, notifyUsers, audienceUserIds, ROLE_LABEL, type Perm } from "./red-crescent";
import { PRIV_PREFIX, exposeUrl, verifySig, audit, exportUrl } from "../lib/srcs-shared";

const router = Router();
router.use(["/srcs", "/public/srcs"], async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureRedCrescentDb(); return next(); }
  catch (err) { logger.error({ err }, "[srcs-ops] ensure"); return res.status(500).json({ error: "تعذّر التهيئة" }); }
});
const fail = (res: Response, err: unknown, where: string) => { logger.error({ err }, `[srcs-ops] ${where}`); return res.status(500).json({ error: "خطأ في الخادم" }); };

// ═══ ملفات خاصة (صورة الهوية، إشعار الدفع) ═══════════════════════
// تُحفظ داخل قاعدة البيانات لا في التخزين العام، ولا تُفتح إلا برابط موقّع قصير العمر
// يُولَّد فقط لصاحب الملف أو لمن يملك صلاحية المراجعة.
const MAX_PRIVATE = 4 * 1024 * 1024;
const privUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PRIVATE, files: 1 } });
const PRIV_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

router.post("/srcs/private-upload", writeLimiter, async (req: Request, res: Response) => {
  const me = await sessionUser(req).catch(() => null);
  if (!me) return res.status(401).json({ error: "سجّل الدخول لرفع المستند" });
  privUpload.single("file")(req as any, res as any, async (err: unknown) => {
    if (err) {
      const code = (err as any)?.code;
      return res.status(code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: code === "LIMIT_FILE_SIZE" ? "حجم المستند يتجاوز 4 ميجابايت — صوّره بدقة أقل" : "تعذّر استلام الملف" });
    }
    try {
      const f = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined;
      if (!f?.buffer?.length) return res.status(400).json({ error: "لم يُرسل ملف" });
      const mime = (f.mimetype || "").toLowerCase();
      if (!PRIV_TYPES.test(mime)) return res.status(400).json({ error: "الملف يجب أن يكون صورة أو PDF" });
      const n = (await query(`SELECT COUNT(*)::int AS n FROM srcs_private_files WHERE owner_id=$1`, [me.id])).rows[0].n;
      if (n >= 40) return res.status(400).json({ error: "تجاوزت الحد الأقصى للمستندات الخاصة" });
      const id = randomUUID();
      const kind = ["national_id", "payment_proof", "other"].includes(String(req.body?.kind)) ? String(req.body.kind) : "other";
      await query(`INSERT INTO srcs_private_files (id, owner_id, kind, mime, name, size, data) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, me.id, kind, mime, String(f.originalname || "file").slice(0, 160), f.size, f.buffer]);
      return res.json({ ref: `${PRIV_PREFIX}${id}`, url: exposeUrl(`${PRIV_PREFIX}${id}`), size: f.size });
    } catch (e) { return fail(res, e, "private upload"); }
  });
  return undefined;
});

router.get("/public/srcs/pfile/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id).toLowerCase();
    if (!verifySig(`file:${id}`, req.query.exp, req.query.sig)) return res.status(403).send("انتهت صلاحية الرابط");
    const r = await query(`SELECT mime, name, data FROM srcs_private_files WHERE id=$1`, [id]);
    if (!r.rows[0]) return res.status(404).send("غير موجود");
    res.setHeader("Content-Type", r.rows[0].mime);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Robots-Tag", "noindex");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(r.rows[0].name)}`);
    return res.send(r.rows[0].data);
  } catch (err) { logger.error({ err }, "[srcs-ops] pfile"); return res.status(500).send("خطأ"); }
});

// ═══ التذكيرات التلقائية ═══════════════════════════════════════════
// يستدعيها GitHub Actions كل ساعة (OIDC audience hasahisawi-srcs) أو مفتاح CAMPAIGN_PUSH_KEY.
async function cronAuth(req: Request): Promise<boolean> {
  const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const key = String(process.env.CAMPAIGN_PUSH_KEY || "");
  if (key && tok.length === key.length && timingSafeEqual(Buffer.from(tok), Buffer.from(key))) return true;
  if (tok.split(".").length === 3) { try { await verifyGithubOidc(tok, "hasahisawi-srcs"); return true; } catch { /* */ } }
  return false;
}
async function once(kind: string, refId: number, stage: string): Promise<boolean> {
  const r = await query(`INSERT INTO srcs_reminders_sent (kind, ref_id, stage) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`, [kind, refId, stage]);
  return !!r.rows[0];
}
const at = (d: Date) => d.toLocaleString("ar-EG", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "Africa/Khartoum" });

router.post("/srcs/cron/reminders", async (req: Request, res: Response) => {
  try {
    if (!(await cronAuth(req))) return res.status(401).json({ error: "unauthorized" });
    const out = { meetings: 0, courses: 0, cards: 0 };
    // الاجتماعات: قبل يوم، وقبل ساعة
    const mts = (await query(`SELECT * FROM srcs_meetings WHERE starts_at > NOW() AND starts_at <= NOW() + INTERVAL '24 hours'`)).rows;
    for (const m of mts) {
      const mins = (new Date(m.starts_at).getTime() - Date.now()) / 60000;
      const stage = mins <= 75 ? "1h" : "24h";
      if (stage === "24h" && mins < 120) continue;
      if (!(await once("meeting", m.id, stage))) continue;
      notifyUsers(await audienceUserIds(m.audience, m.unit_id ?? null), stage === "1h" ? "⏰ الاجتماع بعد قليل" : "📅 تذكير باجتماع الغد",
        `${m.title} — ${at(new Date(m.starts_at))}${m.place ? ` · ${m.place}` : ""}`, { kind: "srcs_meeting", id: m.id });
      out.meetings++;
    }
    // الدورات: للمسجلين فقط
    const cs = (await query(`SELECT * FROM srcs_courses WHERE published AND starts_at > NOW() AND starts_at <= NOW() + INTERVAL '24 hours'`)).rows;
    for (const c of cs) {
      const mins = (new Date(c.starts_at).getTime() - Date.now()) / 60000;
      const stage = mins <= 75 ? "1h" : "24h";
      if (stage === "24h" && mins < 120) continue;
      if (!(await once("course", c.id, stage))) continue;
      const ids = (await query(`SELECT user_id FROM srcs_enrollments WHERE course_id=$1`, [c.id])).rows.map((x: any) => Number(x.user_id));
      notifyUsers(ids, stage === "1h" ? "⏰ تبدأ دورتك بعد قليل" : "🎓 تذكير: دورتك غداً", `${c.title} — ${at(new Date(c.starts_at))}${c.place ? ` · ${c.place}` : ""}`, { kind: "srcs_course", id: c.id });
      out.courses++;
    }
    // البطاقات: قبل الانتهاء بـ 30 و 7 أيام
    const cards = (await query(`SELECT id, user_id, card_expires_at FROM srcs_members WHERE status='active' AND revoked_at IS NULL
                                AND card_expires_at > NOW() AND card_expires_at <= NOW() + INTERVAL '30 days'`)).rows;
    for (const m of cards) {
      const days = Math.ceil((new Date(m.card_expires_at).getTime() - Date.now()) / 86400000);
      const stage = `${days <= 7 ? "7d" : "30d"}:${new Date(m.card_expires_at).toISOString().slice(0, 10)}`;
      if (!(await once("card", m.id, stage))) continue;
      notifyUsers([Number(m.user_id)], "🪪 بطاقتك تقترب من الانتهاء", `تنتهي بطاقة الهلال الأحمر خلال ${days} يوماً — راجع إدارة الفرع للتجديد`, { kind: "srcs_card" });
      out.cards++;
    }
    return res.json({ ok: true, sent: out });
  } catch (err) { return fail(res, err, "reminders"); }
});

// ═══ التصدير والطباعة ═════════════════════════════════════════════
const EXPORT_PERMS: Record<string, Perm[]> = { members: ["members", "cohorts"], cohort: ["cohorts", "members"], course: ["courses", "results"], meeting: ["meetings"] };
const EXPORT_TABLE = { cohort: "srcs_cohorts", course: "srcs_courses", meeting: "srcs_meetings" } as const;
/** "all" أو "3.7" ⇄ مصفوفة وحدات */
const scopeKey = (ids: number[] | null) => (ids === null ? "all" : ids.join("."));
const parseScope = (s: string): number[] | null => (s === "all" ? null : s.split(".").map(Number).filter((n) => Number.isInteger(n) && n >= 0));
router.post("/srcs/admin/export-link", writeLimiter, async (req: Request, res: Response) => {
  try {
    const kind = String(req.body?.kind || "");
    if (!EXPORT_PERMS[kind]) return res.status(400).json({ error: "نوع غير معروف" });
    const ctx = await requireScope(req, res, ...EXPORT_PERMS[kind]); if (!ctx) return;
    const id = Number(req.body?.id) || null;
    const format = req.body?.format === "html" ? "html" : "csv";
    // سجل الأعضاء: نطاق المدير (مع ترشيح اختياري بوحدة)؛ والعناصر المفردة يجب أن تكون ضمن نطاقه
    let U: number[] | null = ctx.acc.unitIds;
    let unitId: number | null = null;
    if (kind === "members") {
      const n = narrowUnits(ctx.acc, req.body?.unit_id);
      if (n === false) return res.status(403).json({ error: "هذه الوحدة خارج نطاق إدارتك" });
      U = n;
      if (U && U.length === 1) unitId = U[0] || null;
    } else {
      if (!id) return res.status(400).json({ error: "حدّد العنصر المطلوب تصديره" });
      const row = await loadScoped(EXPORT_TABLE[kind as keyof typeof EXPORT_TABLE], id, ctx.acc, res); if (!row) return;
      unitId = row.unit_id ?? null;
    }
    await audit(Number(ctx.me.id), "export", `${kind}:${id ?? "all"}`, { format }, unitId);
    return res.json({ url: exportUrl(kind, id, format, scopeKey(U)) });
  } catch (err) { return fail(res, err, "export link"); }
});

const STATUS_AR: Record<string, string> = { active: "نشط", pending: "معلّق", suspended: "موقوف", rejected: "مرفوض", banned: "محظور" };
const d = (x: any, time = false) => (x ? new Date(x).toLocaleString("ar-EG", time ? { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Khartoum" } : { dateStyle: "medium", timeZone: "Africa/Khartoum" }) : "");
async function exportData(kind: string, id: number, units: number[] | null): Promise<{ title: string; sub: string; head: string[]; rows: (string | number)[][] }> {
  if (kind === "members" || kind === "cohort") {
    const co = kind === "cohort" ? (await query(`SELECT * FROM srcs_cohorts WHERE id=$1`, [id])).rows[0] : null;
    const r = await query(`SELECT m.*, u.name, u.phone AS account_phone, c.name AS cohort_name FROM srcs_members m JOIN users u ON u.id=m.user_id
                           LEFT JOIN srcs_cohorts c ON c.id=m.cohort_id WHERE ($1::int IS NULL OR m.cohort_id=$1) AND m.status <> 'pending'
                             AND ${unitCond("m.unit_id", 2)} ORDER BY u.name`, [co ? co.id : null, units]);
    const one = units && units.length === 1 && units[0] ? (await query(`SELECT name FROM srcs_units WHERE id=$1`, [units[0]])).rows[0]?.name : null;
    return {
      title: co ? `سجل ${co.name}` : one ? `سجل أعضاء ${one}` : "سجل أعضاء الفرعية", sub: `${r.rows.length} عضو`,
      head: ["#", "الاسم", "الصفة", "الحالة", "رقم البطاقة", "صالحة حتى", "الوحدة", "الجهة", "الدفعة", "الهاتف", "فصيلة الدم"],
      rows: r.rows.map((m: any, i: number) => [i + 1, m.name, ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] || m.role, (m.revoked_at ? "بطاقة ملغاة" : STATUS_AR[m.status]) || m.status,
        m.card_no || "", d(m.card_expires_at), m.unit || "", m.affiliation || "", m.cohort_name || "", m.phone || m.account_phone || "", m.blood_type || ""]),
    };
  }
  if (kind === "course") {
    const c = (await query(`SELECT * FROM srcs_courses WHERE id=$1`, [id])).rows[0];
    const r = await query(`SELECT e.*, u.name, m.card_no, co.name AS cohort_name FROM srcs_enrollments e JOIN users u ON u.id=e.user_id
                           LEFT JOIN srcs_members m ON m.user_id=e.user_id LEFT JOIN srcs_cohorts co ON co.id=m.cohort_id WHERE e.course_id=$1 ORDER BY u.name`, [id]);
    const certAr: Record<string, string> = { none: "", pending: "دفع قيد المراجعة", issued: "صادرة", rejected: "مرفوض", revoked: "ملغاة" };
    return {
      title: `نتائج: ${c?.title ?? ""}`, sub: `${d(c?.starts_at, true)} · ${c?.place ?? ""} · النجاح من ${Number(c?.pass_mark ?? 0)} / ${Number(c?.max_score ?? 100)}`,
      head: ["#", "الاسم", "رقم البطاقة", "الدفعة", "الحضور", "الدرجة", "النتيجة", "الشهادة", "رقم الشهادة"],
      rows: r.rows.map((e: any, i: number) => [i + 1, e.name, e.card_no || "", e.cohort_name || "", e.attended ? "حضر" : "غائب",
        e.score === null ? "" : Number(e.score), e.passed === null ? "" : e.passed ? "ناجح" : "لم يجتز", certAr[e.cert_status] ?? "", e.cert_no || ""]),
    };
  }
  const mt = (await query(`SELECT * FROM srcs_meetings WHERE id=$1`, [id])).rows[0];
  const r = await query(`SELECT u.name, m.role, m.card_no, r.status, COALESCE(r.attended,FALSE) AS attended FROM srcs_members m JOIN users u ON u.id=m.user_id
                         LEFT JOIN srcs_meeting_rsvps r ON r.user_id=m.user_id AND r.meeting_id=$1 WHERE m.status='active' AND ($2::int IS NULL OR m.unit_id=$2)
                         ORDER BY r.attended DESC NULLS LAST, u.name`, [id, mt?.unit_id ?? null]);
  return {
    title: `كشف حضور: ${mt?.title ?? ""}`, sub: `${d(mt?.starts_at, true)} · ${mt?.place ?? ""}`,
    head: ["#", "الاسم", "الصفة", "رقم البطاقة", "الرد", "الحضور", "التوقيع"],
    rows: r.rows.map((x: any, i: number) => [i + 1, x.name, ROLE_LABEL[x.role as keyof typeof ROLE_LABEL] || x.role, x.card_no || "",
      x.status === "going" ? "سيحضر" : x.status === "not_going" ? "معتذر" : x.status === "maybe" ? "ربما" : "", x.attended ? "✔ حضر" : "", ""]),
  };
}
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const csvCell = (s: unknown) => { const v = String(s ?? ""); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };

router.get("/public/srcs/export", async (req: Request, res: Response) => {
  try {
    const kind = String(req.query.kind || ""), id = Number(req.query.id) || 0;
    const scope = String(req.query.scope || "all");
    if (!EXPORT_PERMS[kind] || !/^(all|\d+(\.\d+)*)$/.test(scope) || !verifySig(`export:${kind}:${id}:${scope}`, req.query.exp, req.query.sig)) return res.status(403).send("انتهت صلاحية الرابط — أنشئه من جديد من التطبيق");
    const x = await exportData(kind, id || (null as any), parseScope(scope));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    if (req.query.format === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(x.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet">
<style>body{font-family:Cairo,Tahoma,Arial;margin:0;padding:24px;color:#111827;background:#fff}.h{display:flex;align-items:center;gap:14px;border-bottom:3px solid #7F1D1D;padding-bottom:10px;margin-bottom:14px}
.h b{font-size:20px;color:#7F1D1D;display:block}.h span{color:#6B7280;font-size:13px}table{width:100%;border-collapse:collapse;font-size:13px}th{background:#7F1D1D;color:#fff;padding:8px;text-align:right}
td{border-bottom:1px solid #E5E7EB;padding:7px 8px}tr:nth-child(even) td{background:#FAFAF9}.f{margin-top:18px;color:#6B7280;font-size:12px;display:flex;justify-content:space-between}
button{font-family:inherit;background:#7F1D1D;color:#fff;border:0;border-radius:10px;padding:10px 20px;font-size:15px;cursor:pointer;margin-bottom:14px}@media print{button{display:none}body{padding:0}}</style></head><body>
<button onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
<div class="h"><svg width="48" height="48" viewBox="0 0 100 100"><defs><mask id="m"><rect width="100" height="100" fill="#000"/><circle cx="50" cy="50" r="34" fill="#fff"/><circle cx="63" cy="50" r="28" fill="#000"/></mask></defs><rect width="100" height="100" fill="#D7141A" mask="url(#m)"/></svg>
<div><b>${esc(x.title)}</b><span>جمعية الهلال الأحمر السوداني — فرعية الحصاحيصا · ${esc(x.sub)}</span></div></div>
<table><thead><tr>${x.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${x.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>
<div class="f"><span>صادر عبر تطبيق حصاحيصاوي</span><span>${d(new Date(), true)}</span></div></body></html>`);
    }
    const csv = "﻿" + [x.head, ...x.rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(x.title)}.csv`);
    return res.send(csv);
  } catch (err) { logger.error({ err }, "[srcs-ops] export"); return res.status(500).send("خطأ"); }
});

// ═══ سجل التدقيق ═══════════════════════════════════════════════════
router.get("/srcs/admin/audit", async (req: Request, res: Response) => {
  try {
    // مدير الوحدة يرى سجل وحداته فقط (unit_id ضمن نطاقه)
    const ctx = await requireScope(req, res, "members"); if (!ctx) return;
    const U = narrowUnits(ctx.acc, req.query.unit_id);
    if (U === false) return res.status(403).json({ error: "هذه الوحدة خارج نطاق إدارتك" });
    const r = await query(`SELECT a.*, u.name AS actor_name, un.name AS unit_name FROM srcs_audit a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN srcs_units un ON un.id=a.unit_id
                            WHERE ${unitCond("a.unit_id", 2)} ORDER BY a.id DESC LIMIT $1`, [Math.min(500, Number(req.query.limit) || 200), U]);
    return res.json({ entries: r.rows });
  } catch (err) { return fail(res, err, "audit"); }
});

// ═══ تسجيل الحضور بمسح بطاقة المسعف ═══════════════════════════════
router.post("/srcs/admin/checkin", writeLimiter, async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const meetingId = Number(b.meeting_id) || null, courseId = Number(b.course_id) || null;
    if (!meetingId && !courseId) return res.status(400).json({ error: "حدّد الاجتماع أو الدورة" });
    const ctx = await requireScope(req, res, ...((meetingId ? ["meetings"] : ["courses", "results"]) as Perm[])); if (!ctx) return;
    const me = ctx.me;
    const item = await loadScoped(meetingId ? "srcs_meetings" : "srcs_courses", meetingId || courseId, ctx.acc, res); if (!item) return;
    const raw = String(b.code || "").trim();
    const tokenMatch = /\/verify\/([0-9a-f]{24})/i.exec(raw) || /^([0-9a-f]{24})$/i.exec(raw);
    const m = (await query(
      `SELECT m.*, u.name FROM srcs_members m JOIN users u ON u.id=m.user_id WHERE ${tokenMatch ? "m.card_token=$1" : "UPPER(m.card_no)=UPPER($1)"} LIMIT 1`,
      [tokenMatch ? tokenMatch[1].toLowerCase() : raw])).rows[0];
    if (!m) return res.status(404).json({ error: "لم يُعثر على بطاقة بهذا الرمز" });
    const valid = m.status === "active" && !m.revoked_at && m.card_expires_at && new Date(m.card_expires_at) > new Date();
    if (!valid) return res.status(409).json({ error: m.revoked_at || m.status === "banned" ? "البطاقة ملغاة" : "البطاقة غير سارية", member: { name: m.name } });
    // اجتماع/دورة الوحدة: الحضور لأعضاء الوحدة فقط
    if (item.unit_id && Number(m.unit_id) !== Number(item.unit_id)) return res.status(403).json({ error: "صاحب البطاقة ليس من أعضاء هذه الوحدة" });
    if (meetingId) {
      await query(`INSERT INTO srcs_meeting_rsvps (meeting_id, user_id, status, attended) VALUES ($1,$2,'going',TRUE)
                   ON CONFLICT (meeting_id, user_id) DO UPDATE SET attended=TRUE`, [meetingId, m.user_id]);
    } else {
      await query(`INSERT INTO srcs_enrollments (course_id, user_id, attended) VALUES ($1,$2,TRUE)
                   ON CONFLICT (course_id, user_id) DO UPDATE SET attended=TRUE`, [courseId, m.user_id]);
    }
    await audit(Number(me.id), "checkin", meetingId ? `meeting:${meetingId}` : `course:${courseId}`, { member: m.id, name: m.name }, item.unit_id ?? null);
    return res.json({ ok: true, member: { name: m.name, role: m.role, role_label: ROLE_LABEL[m.role as keyof typeof ROLE_LABEL], unit: m.unit, card_no: m.card_no } });
  } catch (err) { return fail(res, err, "checkin"); }
});

export default router;
