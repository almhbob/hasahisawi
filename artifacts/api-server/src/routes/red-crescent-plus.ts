// ════════════════════════════════════════════════════════════════
// 🚑 الهلال الأحمر — الدورات والورش، النتائج، الشهادات الإلكترونية المدفوعة،
//    سجل الدفعات، ملف مستندات العضو، الإعدادات، ومزامنة «مسعف».
// الصلاحيات ونطاق الوحدات من red-crescent.ts (scopeOf/requireScope). السعر والحظر لمدير حصاحيصاوي فقط.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";
import {
  ensureRedCrescentDb, isAppAdmin, membership, notifyUsers, linkDocToProfile,
  ROLE_LABEL, API_PUBLIC_BASE, scopeOf, access, requireScope, narrowUnits, unitCond, canTouch, loadScoped, pickWriteUnit, permsForUnit,
  unitManagerIds, type Access,
} from "./red-crescent";
import { acceptDocRef, exposeRow, exposeRows, audit } from "../lib/srcs-shared";

const router = Router();
router.use(["/srcs", "/public/srcs"], async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureRedCrescentDb(); return next(); }
  catch (err) { logger.error({ err }, "[srcs+] ensure"); return res.status(500).json({ error: "تعذّر التهيئة" }); }
});

const fail = (res: Response, err: unknown, where: string, msg = "خطأ في الخادم") => { logger.error({ err }, `[srcs+] ${where}`); return res.status(500).json({ error: msg }); };
const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
const https = (v: unknown, max = 600) => { const u = str(v, max); return /^https:\/\//.test(u) ? u : null; };
const date = (v: unknown) => (v && !isNaN(new Date(String(v)).getTime()) ? new Date(String(v)) : null);
const num = (v: unknown) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const KINDS = ["course", "workshop"] as const;
const certUrl = (token: string) => `${API_PUBLIC_BASE}/api/public/srcs/cert/${token}`;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// ═══ الإعدادات ══════════════════════════════════════════════════
const DEFAULTS: Record<string, string> = { cert_price: "0", cert_currency: "SDG", cert_payment_info: "" };
async function settings(): Promise<Record<string, string>> {
  const r = await query(`SELECT key, value FROM srcs_settings`);
  const o = { ...DEFAULTS };
  for (const row of r.rows) o[row.key] = row.value;
  return o;
}
router.get("/srcs/settings", async (_req, res) => {
  try { const s = await settings(); return res.json({ cert_price: Number(s.cert_price) || 0, cert_currency: s.cert_currency, cert_payment_info: s.cert_payment_info }); }
  catch (err) { return fail(res, err, "settings"); }
});
/** سعر الشهادة وبيانات الدفع: لمدير حصاحيصاوي فقط */
router.patch("/srcs/admin/settings", writeLimiter, async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!isAppAdmin(me)) return res.status(403).json({ error: "تعديل السعر لمدير حصاحيصاوي فقط" });
    const b = req.body || {};
    const updates: [string, string][] = [];
    if (b.cert_price !== undefined) {
      const p = Number(b.cert_price);
      if (!Number.isFinite(p) || p < 0 || p > 10_000_000) return res.status(400).json({ error: "سعر غير صالح" });
      updates.push(["cert_price", String(Math.round(p * 100) / 100)]);
    }
    if (b.cert_currency !== undefined) updates.push(["cert_currency", str(b.cert_currency, 10) || "SDG"]);
    if (b.cert_payment_info !== undefined) updates.push(["cert_payment_info", str(b.cert_payment_info, 1000)]);
    if (updates.length) await audit(Number(me!.id), "settings", "certificate", Object.fromEntries(updates));
    for (const [k, v] of updates)
      await query(`INSERT INTO srcs_settings (key, value, updated_by) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2, updated_by=$3, updated_at=NOW()`, [k, v, me!.id]);
    const s = await settings();
    return res.json({ cert_price: Number(s.cert_price) || 0, cert_currency: s.cert_currency, cert_payment_info: s.cert_payment_info });
  } catch (err) { return fail(res, err, "settings patch"); }
});

// ═══ الدورات والورش (للجميع/الأعضاء) ═════════════════════════════
const COURSE_COLS = `c.*, (SELECT COUNT(*)::int FROM srcs_enrollments e WHERE e.course_id=c.id) AS enrolled, co.name AS cohort_name, un.name AS unit_name`;

router.get("/srcs/courses", async (req, res) => {
  try {
    const me = await sessionUser(req);
    const sc = await scopeOf(me);
    const m = sc.member;
    const member = !!m && m.status === "active";
    const ca = access(sc, ["courses"]);
    const admin = !!ca?.all;
    const managed = ca && !ca.all ? ca.unitIds : [];
    // دورات الوحدة لأعضائها (ولمدرائها) فقط؛ والدورات العامة للفرع للجميع
    const vis: number[] | null = admin ? null : [...new Set([0, ...(member && m.unit_id ? [Number(m.unit_id)] : []), ...managed])];
    const r = await query(
      `SELECT ${COURSE_COLS}, e.id AS my_enrollment_id, e.status AS my_status, e.attended AS my_attended,
              CASE WHEN c.results_published THEN e.score END AS my_score, CASE WHEN c.results_published THEN e.passed END AS my_passed,
              e.cert_status AS my_cert_status, e.cert_token AS my_cert_token
         FROM srcs_courses c LEFT JOIN srcs_cohorts co ON co.id=c.cohort_id LEFT JOIN srcs_units un ON un.id=c.unit_id
         LEFT JOIN srcs_enrollments e ON e.course_id=c.id AND e.user_id=$1
        WHERE (c.published OR $2 OR c.unit_id = ANY($5::int[])) AND (c.audience='public' OR $3 OR $2) AND ${unitCond("c.unit_id", 4)}
        ORDER BY (c.ends_at IS NULL OR c.ends_at > NOW()) DESC, c.starts_at DESC NULLS LAST, c.id DESC LIMIT 100`,
      [me?.id ?? 0, admin, member, vis, managed]);
    return res.json({ courses: r.rows.map((c: any) => ({ ...c, files: c.my_enrollment_id || admin || managed.includes(Number(c.unit_id)) ? c.files : [], files_count: (c.files || []).length, my_cert_url: c.my_cert_token ? certUrl(c.my_cert_token) : null })) });
  } catch (err) { return fail(res, err, "courses"); }
});

router.post("/srcs/courses/:id/enroll", writeLimiter, async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول للتسجيل" });
    const m = await membership(me.id);
    if (m?.status === "banned") return res.status(403).json({ error: "عضويتك محظورة" });
    const c = (await query(`SELECT c.*, (SELECT COUNT(*)::int FROM srcs_enrollments e WHERE e.course_id=c.id) AS enrolled FROM srcs_courses c WHERE id=$1 AND published`, [Number(req.params.id)])).rows[0];
    if (!c) return res.status(404).json({ error: "الدورة غير موجودة" });
    if (c.audience !== "public" && m?.status !== "active") return res.status(403).json({ error: "هذه الدورة لأعضاء الجمعية فقط" });
    if (c.unit_id && !(m?.status === "active" && Number(m.unit_id) === Number(c.unit_id))) return res.status(403).json({ error: "هذه الدورة لأعضاء وحدتها فقط" });
    if (!c.registration_open) return res.status(400).json({ error: "التسجيل مغلق" });
    if (c.seats > 0 && c.enrolled >= c.seats) return res.status(400).json({ error: "اكتمل العدد" });
    const r = await query(`INSERT INTO srcs_enrollments (course_id, user_id) VALUES ($1,$2) ON CONFLICT (course_id, user_id) DO NOTHING RETURNING *`, [c.id, me.id]);
    return res.json({ ok: true, enrollment: r.rows[0] ?? null });
  } catch (err) { return fail(res, err, "enroll"); }
});
router.delete("/srcs/courses/:id/enroll", writeLimiter, async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    await query(`DELETE FROM srcs_enrollments WHERE course_id=$1 AND user_id=$2 AND score IS NULL AND cert_status='none'`, [Number(req.params.id), me.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "unenroll"); }
});

// ═══ الشهادة الإلكترونية المدفوعة ═════════════════════════════════
async function issueCertificate(enrollmentId: number, byUser: number | null) {
  const e = (await query(
    `SELECT e.*, c.title, c.kind, c.cert_hours, u.name FROM srcs_enrollments e JOIN srcs_courses c ON c.id=e.course_id JOIN users u ON u.id=e.user_id WHERE e.id=$1`,
    [enrollmentId])).rows[0];
  if (!e) return null;
  if (e.cert_status === "issued") return e;
  const no = `SRCS-HSH-C-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
  const token = randomBytes(12).toString("hex");
  const r = await query(
    `UPDATE srcs_enrollments SET cert_status='issued', cert_no=$2, cert_token=$3, cert_issued_at=NOW(), cert_note=NULL WHERE id=$1 RETURNING *`,
    [e.id, no, token]);
  const url = certUrl(token);
  const title = `شهادة ${e.kind === "workshop" ? "ورشة" : "دورة"}: ${e.title}`;
  // نسخة في ملف مستندات العضو + نسخة موثّقة منشورة في «الشهادات» بملفه الشخصي في حصاحيصاوي
  const d = await query(`INSERT INTO srcs_member_docs (user_id, kind, title, url, verified, source) VALUES ($1,'srcs_certificate',$2,$3,TRUE,'srcs')
                         ON CONFLICT (user_id, url) DO NOTHING RETURNING id`, [e.user_id, title.slice(0, 200), url]).catch(() => ({ rows: [] as any[] }));
  await linkDocToProfile(Number(e.user_id), d.rows[0] ? Number(d.rows[0].id) : null, title, null, no, url, true, true);
  notifyUsers([Number(e.user_id)], "🎓 شهادتك جاهزة", `صدرت شهادتك الإلكترونية في «${String(e.title).slice(0, 80)}» وأُضيفت إلى ملفك`, { kind: "srcs_cert", course_id: e.course_id });
  logger.info({ enrollment: e.id, by: byUser }, "[srcs+] certificate issued");
  return r.rows[0];
}

router.post("/srcs/courses/:id/certificate", writeLimiter, async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const e = (await query(
      `SELECT e.*, c.results_published, c.cert_enabled, c.unit_id FROM srcs_enrollments e JOIN srcs_courses c ON c.id=e.course_id WHERE e.course_id=$1 AND e.user_id=$2`,
      [Number(req.params.id), me.id])).rows[0];
    if (!e) return res.status(404).json({ error: "لست مسجلاً في هذه الدورة" });
    if (!e.cert_enabled) return res.status(400).json({ error: "لا تُصدر شهادة لهذه الدورة" });
    if (!e.results_published || !e.passed) return res.status(400).json({ error: "الشهادة متاحة للناجحين بعد إعلان النتيجة" });
    if (e.cert_status === "issued") return res.json({ enrollment: e, cert_url: certUrl(e.cert_token) });
    if (e.cert_status === "pending") return res.status(409).json({ error: "طلبك قيد مراجعة الدفع" });
    if (e.cert_status === "revoked") return res.status(403).json({ error: "أُلغيت شهادتك — راجع الإدارة" });
    const s = await settings();
    const price = Number(s.cert_price) || 0;
    if (price <= 0) { const r = await issueCertificate(e.id, null); return res.json({ enrollment: r, cert_url: r?.cert_token ? certUrl(r.cert_token) : null }); }
    const ref = str(req.body?.payment_ref, 120);
    const proof = req.body?.payment_proof_url ? await acceptDocRef(req.body.payment_proof_url, Number(me.id)) : null;
    if (!ref && !proof) return res.status(400).json({ error: "أدخل رقم إيصال التحويل أو أرفق صورة الإشعار" });
    const r = await query(`UPDATE srcs_enrollments SET cert_status='pending', cert_amount=$2, payment_ref=$3, payment_proof_url=$4, cert_note=NULL WHERE id=$1 RETURNING *`,
      [e.id, price, ref || null, proof]);
    // إشعار من يملك صلاحية الشهادات
    const admins = (await query(`SELECT user_id FROM srcs_members WHERE status='active' AND (role='admin' OR 'certificates' = ANY(perms))`)).rows.map((x: any) => Number(x.user_id));
    notifyUsers([...new Set([...admins, ...(await unitManagerIds(e.unit_id, "certificates"))])], "💳 طلب شهادة مدفوعة", `${me.name} أرسل إثبات دفع ${price} ${s.cert_currency}`, { kind: "srcs_cert_payment" });
    return res.json({ enrollment: r.rows[0] });
  } catch (err) { return fail(res, err, "cert request"); }
});

// صفحة الشهادة العامة (قابلة للطباعة والتحقق)
router.get("/public/srcs/cert/:token", async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const t = str(req.params.token, 40).toLowerCase();
    const e = /^[0-9a-f]{24}$/.test(t) ? (await query(
      `SELECT e.*, c.title, c.kind, c.trainer, c.starts_at, c.ends_at, c.cert_hours, c.max_score, u.name, m.status AS member_status, m.revoked_at
         FROM srcs_enrollments e JOIN srcs_courses c ON c.id=e.course_id JOIN users u ON u.id=e.user_id
         LEFT JOIN srcs_members m ON m.user_id=e.user_id WHERE e.cert_token=$1`, [t])).rows[0] : null;
    const ok = e && e.cert_status === "issued";
    const d = (x: any) => (x ? new Date(x).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) : "");
    if (!ok) {
      return res.status(e ? 200 : 404).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>التحقق من شهادة</title></head>
<body style="font-family:Tahoma,Arial;background:#F4F7F5;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="background:#fff;padding:28px;border-radius:20px;text-align:center;max-width:380px">
<div style="font-size:42px">⛔</div><h2 style="color:#B91C1C">${e ? "شهادة ملغاة أو غير مكتملة" : "شهادة غير موجودة"}</h2><p style="color:#555">${e ? "لا يُعتدّ بهذه الشهادة." : "لم نعثر على شهادة بهذا الرمز."}</p></div></body></html>`);
    }
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&color=7F1D1D&data=${encodeURIComponent(certUrl(t))}`;
    return res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>شهادة — ${esc(e.name)}</title>
<style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}
body{margin:0;background:#EEE9E0;font-family:"Cairo",Tahoma,Arial,sans-serif;color:#1F2937;display:flex;flex-direction:column;align-items:center;padding:18px}
.c{width:100%;max-width:1000px;aspect-ratio:1.414;background:#FFFDF7;position:relative;border-radius:6px;box-shadow:0 12px 40px #0002;padding:3.2% 4%;overflow:hidden}
.c:before{content:"";position:absolute;inset:1.4%;border:3px solid #7F1D1D;border-radius:4px}
.c:after{content:"";position:absolute;inset:2.2%;border:1px solid #C9A24A;border-radius:2px}
.wm{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);width:46%;opacity:.05}
.top{display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1}
.org{text-align:center;flex:1}.org b{display:block;font-size:clamp(14px,2.2vw,22px);color:#7F1D1D}.org span{font-size:clamp(10px,1.4vw,14px);color:#6B7280}
.t{position:relative;z-index:1;text-align:center;margin-top:3%}
.t h1{margin:0;font-size:clamp(26px,5vw,52px);color:#7F1D1D;letter-spacing:1px}
.t .sub{font-size:clamp(11px,1.6vw,16px);color:#6B7280;margin-top:.5%}
.n{font-size:clamp(22px,4.2vw,44px);color:#111827;margin:3% 0 1%;font-weight:bold;border-bottom:2px solid #C9A24A;display:inline-block;padding:0 4% 1%}
.b{font-size:clamp(12px,1.8vw,19px);line-height:1.9;color:#374151;max-width:80%;margin:0 auto}
.b strong{color:#7F1D1D}
.f{position:absolute;bottom:7%;left:6%;right:6%;display:flex;justify-content:space-between;align-items:flex-end;z-index:1}
.sig{text-align:center;font-size:clamp(10px,1.3vw,13px);color:#4B5563}.sig i{display:block;width:150px;max-width:22vw;border-top:1px solid #9CA3AF;margin:0 auto 4px}
.meta{font-size:clamp(9px,1.2vw,12px);color:#6B7280;text-align:center}.qr img{width:clamp(64px,11vw,120px);display:block;margin:0 auto 4px;border:3px solid #fff;outline:1px solid #C9A24A}
.badge{width:clamp(36px,6vw,64px);height:clamp(36px,6vw,64px)}
.bar{margin-top:14px;display:flex;gap:10px}.bar button{font-family:inherit;font-size:15px;padding:10px 22px;border-radius:12px;border:0;background:#7F1D1D;color:#fff;cursor:pointer}
.ok{margin-bottom:12px;background:#DCFCE7;color:#166534;padding:8px 16px;border-radius:12px;font-weight:bold}
@media print{body{background:#fff;padding:0}.bar,.ok{display:none}.c{box-shadow:none;border-radius:0;max-width:none;width:100vw;height:100vh;aspect-ratio:auto}}
</style><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet"></head><body>
<div class="ok">✔ شهادة صحيحة صادرة عن الهلال الأحمر السوداني — فرعية الحصاحيصا</div>
<div class="c">
<svg class="wm" viewBox="0 0 100 100"><defs><mask id="w"><rect width="100" height="100" fill="#000"/><circle cx="50" cy="50" r="40" fill="#fff"/><circle cx="64" cy="50" r="33" fill="#000"/></mask></defs><rect width="100" height="100" fill="#D7141A" mask="url(#w)"/></svg>
<div class="top">
<svg class="badge" viewBox="0 0 100 100"><defs><mask id="m"><rect width="100" height="100" fill="#000"/><circle cx="50" cy="50" r="34" fill="#fff"/><circle cx="63" cy="50" r="28" fill="#000"/></mask></defs><rect width="100" height="100" rx="24" fill="#fff" stroke="#E5E7EB"/><rect width="100" height="100" fill="#D7141A" mask="url(#m)"/></svg>
<div class="org"><b>جمعية الهلال الأحمر السوداني</b><span>فرعية الحصاحيصا · بالشراكة مع منصة حصاحيصاوي</span></div>
<div style="text-align:center;font-weight:bold;color:#0B6B49;font-size:clamp(10px,1.4vw,14px)"><div style="font-size:clamp(18px,3vw,30px)">ح</div>حصاحيصاوي</div>
</div>
<div class="t"><h1>شهادة ${e.kind === "workshop" ? "حضور ورشة" : "إتمام دورة"}</h1><div class="sub">تشهد إدارة الفرع بأن</div>
<div class="n">${esc(e.name)}</div>
<div class="b">قد ${e.kind === "workshop" ? "حضر/ت ورشة العمل" : "أتمّ/ت بنجاح الدورة التدريبية"} <strong>«${esc(e.title)}»</strong>${e.trainer ? ` بإشراف ${esc(e.trainer)}` : ""}${e.starts_at ? ` خلال الفترة ${d(e.starts_at)}${e.ends_at ? ` — ${d(e.ends_at)}` : ""}` : ""}${e.cert_hours ? ` بواقع ${e.cert_hours} ساعة تدريبية` : ""}${e.score !== null && e.score !== undefined ? `، بتقدير ${Number(e.score)} من ${Number(e.max_score)}` : ""}.</div></div>
<div class="f">
<div class="sig"><i></i>إدارة فرعية الحصاحيصا</div>
<div class="meta qr"><img src="${qr}" alt="رمز التحقق"><div dir="ltr">${esc(e.cert_no)}</div>صدرت في ${d(e.cert_issued_at)}</div>
<div class="sig"><i></i>منسّق التدريب</div>
</div></div>
<div class="bar"><button onclick="window.print()">🖨️ طباعة / حفظ PDF</button></div>
</body></html>`);
  } catch (err) { logger.error({ err }, "[srcs+] cert page"); return res.status(500).send("خطأ"); }
});

// ═══ ملفي: المستندات والدورات والشهادات ═════════════════════════════
async function dossier(userId: number, forAdmin: boolean) {
  const [m, docs, enr, acts, meets] = await Promise.all([
    query(`SELECT m.*, u.name, u.avatar_url, u.phone AS account_phone, u.email, co.name AS cohort_name FROM srcs_members m JOIN users u ON u.id=m.user_id
           LEFT JOIN srcs_cohorts co ON co.id=m.cohort_id WHERE m.user_id=$1`, [userId]),
    query(`SELECT * FROM srcs_member_docs WHERE user_id=$1 ORDER BY created_at DESC`, [userId]),
    query(`SELECT e.*, c.title, c.kind, c.starts_at, c.results_published, c.max_score, c.pass_mark FROM srcs_enrollments e JOIN srcs_courses c ON c.id=e.course_id
           WHERE e.user_id=$1 ORDER BY e.created_at DESC`, [userId]),
    query(`SELECT a.id, a.title, a.type, a.happened_at, p.points FROM srcs_activity_participants p JOIN srcs_activities a ON a.id=p.activity_id WHERE p.user_id=$1 ORDER BY a.happened_at DESC LIMIT 50`, [userId]),
    query(`SELECT COUNT(*) FILTER (WHERE attended)::int AS attended, COUNT(*)::int AS invited FROM srcs_meeting_rsvps WHERE user_id=$1`, [userId]),
  ]);
  const member = exposeRow(m.rows[0] ?? null);
  if (member && !forAdmin) delete member.admin_note;
  return {
    member: member ? { ...member, role_label: ROLE_LABEL[member.role as keyof typeof ROLE_LABEL] } : null,
    docs: exposeRows(docs.rows),
    enrollments: exposeRows(enr.rows).map((e: any) => ({ ...e, score: e.results_published || forAdmin ? e.score : null, passed: e.results_published || forAdmin ? e.passed : null, cert_url: e.cert_status === "issued" && e.cert_token ? certUrl(e.cert_token) : null })),
    activities: acts.rows, meetings: meets.rows[0],
    points: acts.rows.reduce((n: number, a: any) => n + (Number(a.points) || 0), 0),
  };
}
router.get("/srcs/me/dossier", async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    return res.json(await dossier(Number(me.id), false));
  } catch (err) { return fail(res, err, "my dossier"); }
});
const DOC_KINDS = ["national_id", "certificate", "license", "photo", "other"];
router.post("/srcs/me/docs", writeLimiter, async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const url = await acceptDocRef(req.body?.url, Number(me.id));
    const title = str(req.body?.title, 200);
    const kind = DOC_KINDS.includes(req.body?.kind) ? req.body.kind : "other";
    if (!url || title.length < 2) return res.status(400).json({ error: "اكتب اسم المستند وأرفق الملف" });
    const n = (await query(`SELECT COUNT(*)::int AS n FROM srcs_member_docs WHERE user_id=$1`, [me.id])).rows[0].n;
    if (n >= 60) return res.status(400).json({ error: "الحد الأقصى 60 مستنداً" });
    const r = await query(`INSERT INTO srcs_member_docs (user_id, kind, title, url) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, url) DO NOTHING RETURNING *`, [me.id, kind, title, url]);
    // الشهادات والرخص تُنسخ تلقائياً (خاصة) إلى «الشهادات» في الملف الشخصي بحصاحيصاوي
    if (r.rows[0] && (kind === "certificate" || kind === "license") && !url.startsWith("priv:")) await linkDocToProfile(Number(me.id), Number(r.rows[0].id), title, url, null, null, false);
    return res.json({ doc: exposeRow(r.rows[0] ?? null) });
  } catch (err) { return fail(res, err, "doc add"); }
});
router.delete("/srcs/me/docs/:id", writeLimiter, async (req, res) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.status(401).json({ error: "سجّل الدخول" });
    const r = await query(`DELETE FROM srcs_member_docs WHERE id=$1 AND user_id=$2 AND source='member' AND NOT verified RETURNING profile_cert_id`, [Number(req.params.id), me.id]);
    if (!r.rows[0]) return res.status(400).json({ error: "لا يمكن حذف مستند موثّق أو صادر من الجمعية" });
    if (r.rows[0].profile_cert_id) await query(`DELETE FROM user_certificates WHERE id=$1 AND user_id=$2`, [r.rows[0].profile_cert_id, me.id]).catch(() => {});
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "doc delete"); }
});

// ═══ إدارة: الدورات والنتائج والشهادات (ضمن نطاق الوحدة) ═════════════════
router.get("/srcs/admin/courses", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "courses", "results", "certificates"); if (!ctx) return;
    const U = narrowUnits(ctx.acc, req.query.unit_id);
    if (U === false) return res.status(403).json({ error: "هذه الوحدة خارج نطاق إدارتك" });
    const r = await query(`SELECT ${COURSE_COLS},
        (SELECT COUNT(*)::int FROM srcs_enrollments e WHERE e.course_id=c.id AND e.passed) AS passed_count,
        (SELECT COUNT(*)::int FROM srcs_enrollments e WHERE e.course_id=c.id AND e.cert_status='pending') AS cert_pending
      FROM srcs_courses c LEFT JOIN srcs_cohorts co ON co.id=c.cohort_id LEFT JOIN srcs_units un ON un.id=c.unit_id
      WHERE ${unitCond("c.unit_id", 1)} ORDER BY c.starts_at DESC NULLS FIRST, c.id DESC LIMIT 200`, [U]);
    return res.json({ courses: r.rows });
  } catch (err) { return fail(res, err, "admin courses"); }
});
function courseFields(b: any) {
  const files = Array.isArray(b.files) ? b.files.map((f: any) => ({ name: str(f?.name, 160) || "ملف", url: https(f?.url), size: Number(f?.size) || null, type: str(f?.type, 60) || null }))
    .filter((f: any) => f.url).slice(0, 30) : undefined;
  return {
    title: b.title === undefined ? undefined : str(b.title, 200), kind: KINDS.includes(b.kind) ? b.kind : undefined,
    description: b.description === undefined ? undefined : str(b.description, 8000) || null, trainer: b.trainer === undefined ? undefined : str(b.trainer, 160) || null,
    place: b.place === undefined ? undefined : str(b.place, 200) || null, starts_at: b.starts_at === undefined ? undefined : date(b.starts_at), ends_at: b.ends_at === undefined ? undefined : date(b.ends_at),
    seats: b.seats === undefined ? undefined : Math.max(0, Math.min(10000, Number(b.seats) || 0)), cohort_id: b.cohort_id === undefined ? undefined : Number(b.cohort_id) || null,
    cover_url: b.cover_url === undefined ? undefined : https(b.cover_url), files: files === undefined ? undefined : JSON.stringify(files),
    audience: b.audience === undefined ? undefined : b.audience === "members" ? "members" : "public",
    registration_open: typeof b.registration_open === "boolean" ? b.registration_open : undefined,
    pass_mark: b.pass_mark === undefined ? undefined : Math.max(0, Number(b.pass_mark) || 0), max_score: b.max_score === undefined ? undefined : Math.max(1, Number(b.max_score) || 100),
    cert_enabled: typeof b.cert_enabled === "boolean" ? b.cert_enabled : undefined, cert_hours: b.cert_hours === undefined ? undefined : Number(b.cert_hours) || null,
    published: typeof b.published === "boolean" ? b.published : undefined,
  };
}
/** الدفعة المرتبطة يجب أن تكون ضمن النطاق ومن نفس وحدة الدورة (أو عامة) */
async function cohortFits(cohortId: number | null | undefined, unitId: number | null, acc: Access): Promise<string | null> {
  if (!cohortId) return null;
  const co = (await query(`SELECT unit_id FROM srcs_cohorts WHERE id=$1`, [cohortId])).rows[0];
  if (!co || (co.unit_id !== null && !canTouch(acc, co.unit_id))) return "الدفعة غير موجودة أو خارج نطاقك";
  if (co.unit_id && Number(co.unit_id) !== Number(unitId)) return "هذه الدفعة تخص وحدة أخرى";
  return null;
}
router.post("/srcs/admin/courses", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "courses"); if (!ctx) return;
    const { me, acc } = ctx;
    const f = courseFields(req.body || {});
    if (!f.title) return res.status(400).json({ error: "عنوان الدورة مطلوب" });
    if (!f.starts_at) return res.status(400).json({ error: "حدّد تاريخ ووقت البدء" });
    if (f.ends_at && f.ends_at < f.starts_at) return res.status(400).json({ error: "تاريخ الانتهاء قبل البدء" });
    const unitId = await pickWriteUnit(acc, req.body?.unit_id, res); if (unitId === undefined) return;
    const coErr = await cohortFits(f.cohort_id, unitId, acc); if (coErr) return res.status(400).json({ error: coErr });
    const r = await query(
      `INSERT INTO srcs_courses (title, kind, description, trainer, place, starts_at, ends_at, seats, cohort_id, cover_url, files, audience, registration_open, pass_mark, max_score, cert_enabled, cert_hours, published, created_by, unit_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::jsonb,'[]'),$12,$13,COALESCE($14,50),COALESCE($15,100),$16,$17,$18,$19,$20) RETURNING *`,
      [f.title, f.kind ?? "course", f.description ?? null, f.trainer ?? null, f.place ?? null, f.starts_at, f.ends_at ?? null, f.seats ?? 0, f.cohort_id ?? null, f.cover_url ?? null,
       f.files ?? null, f.audience ?? "public", f.registration_open ?? true, f.pass_mark ?? null, f.max_score ?? null, f.cert_enabled ?? true, f.cert_hours ?? null, f.published ?? true, me.id, unitId]);
    if (r.rows[0].published) {
      const ids = (await query(`SELECT user_id FROM srcs_members WHERE status='active' AND ($1::int IS NULL OR unit_id=$1)`, [unitId])).rows.map((x: any) => Number(x.user_id));
      notifyUsers(ids, r.rows[0].kind === "workshop" ? "🛠️ ورشة تدريبية جديدة" : "🎓 دورة تدريبية جديدة", `${f.title} — سجّل الآن`, { kind: "srcs_course", id: r.rows[0].id });
    }
    return res.json({ course: r.rows[0] });
  } catch (err) { return fail(res, err, "course create"); }
});
router.patch("/srcs/admin/courses/:id", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "courses", "results"); if (!ctx) return;
    const { me, sc, acc } = ctx;
    const cur = await loadScoped("srcs_courses", req.params.id, acc, res); if (!cur) return;
    const mine = permsForUnit(sc, cur.unit_id);
    const b = req.body || {};
    const f = courseFields(b);
    if (f.cohort_id !== undefined && f.cohort_id !== cur.cohort_id) { const coErr = await cohortFits(f.cohort_id, cur.unit_id, acc); if (coErr) return res.status(400).json({ error: coErr }); }
    const sets: string[] = []; const vals: unknown[] = [cur.id];
    const editable = mine.includes("courses") ? Object.keys(f) : [];
    for (const k of editable) {
      const v = (f as any)[k];
      if (v === undefined) continue;
      vals.push(v); sets.push(k === "files" ? `files=$${vals.length}::jsonb` : `${k}=$${vals.length}`);
    }
    const publishResults = typeof b.results_published === "boolean" && (mine.includes("results") || mine.includes("courses"));
    if (publishResults) { vals.push(b.results_published); sets.push(`results_published=$${vals.length}`); }
    if (!sets.length) return res.json({ course: cur });
    const r = await query(`UPDATE srcs_courses SET ${sets.join(", ")} WHERE id=$1 RETURNING *`, vals);
    if (publishResults && b.results_published !== cur.results_published) await audit(Number(me.id), b.results_published ? "results_publish" : "results_hide", `course:${cur.id} ${cur.title}`, {}, cur.unit_id);
    if (publishResults && b.results_published && !cur.results_published) {
      const ids = (await query(`SELECT user_id FROM srcs_enrollments WHERE course_id=$1`, [cur.id])).rows.map((x: any) => Number(x.user_id));
      notifyUsers(ids, "📊 ظهرت النتيجة", `أُعلنت نتيجة «${String(cur.title).slice(0, 80)}» — اطّلع عليها الآن`, { kind: "srcs_results", id: cur.id });
    }
    return res.json({ course: r.rows[0] });
  } catch (err) { return fail(res, err, "course patch"); }
});
router.delete("/srcs/admin/courses/:id", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "courses"); if (!ctx) return;
    const c = await loadScoped("srcs_courses", req.params.id, ctx.acc, res); if (!c) return;
    const issued = (await query(`SELECT COUNT(*)::int AS n FROM srcs_enrollments WHERE course_id=$1 AND cert_status='issued'`, [c.id])).rows[0].n;
    if (issued) return res.status(400).json({ error: "لا يمكن حذف دورة صدرت لها شهادات — أخفِها بدلاً من ذلك" });
    await query(`DELETE FROM srcs_courses WHERE id=$1`, [c.id]);
    await audit(Number(ctx.me.id), "course_delete", `course:${c.id} ${c.title}`, {}, c.unit_id);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "course delete"); }
});
router.get("/srcs/admin/courses/:id/enrollments", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "courses", "results", "certificates"); if (!ctx) return;
    const c = await loadScoped("srcs_courses", req.params.id, ctx.acc, res); if (!c) return;
    const r = await query(
      `SELECT e.*, u.name, u.avatar_url, m.role, m.unit, m.card_no, co.name AS cohort_name FROM srcs_enrollments e JOIN users u ON u.id=e.user_id
         LEFT JOIN srcs_members m ON m.user_id=e.user_id LEFT JOIN srcs_cohorts co ON co.id=m.cohort_id
        WHERE e.course_id=$1 ORDER BY u.name`, [c.id]);
    return res.json({ enrollments: exposeRows(r.rows).map((e: any) => ({ ...e, cert_url: e.cert_token ? certUrl(e.cert_token) : null })) });
  } catch (err) { return fail(res, err, "enrollments"); }
});
/** تسجيل أعضاء في دورة يدوياً (مثلاً كل أفراد دفعة) — مدير الوحدة يسجّل أعضاء وحدته فقط */
router.post("/srcs/admin/courses/:id/enroll", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "courses"); if (!ctx) return;
    const c = await loadScoped("srcs_courses", req.params.id, ctx.acc, res); if (!c) return;
    let ids: number[] = (Array.isArray(req.body?.user_ids) ? req.body.user_ids : []).map(Number).filter(Number.isFinite).slice(0, 1000);
    if (req.body?.cohort_id) {
      const co = await loadScoped("srcs_cohorts", req.body.cohort_id, ctx.acc, res); if (!co) return;
      ids = ids.concat((await query(`SELECT user_id FROM srcs_members WHERE cohort_id=$1 AND status='active'`, [co.id])).rows.map((x: any) => Number(x.user_id)));
    }
    ids = [...new Set(ids)];
    if (!ctx.acc.all) ids = (await query(`SELECT user_id FROM srcs_members WHERE user_id = ANY($1::int[]) AND unit_id=$2`, [ids, c.unit_id])).rows.map((x: any) => Number(x.user_id));
    let added = 0;
    for (const uid of [...new Set(ids)]) {
      const r = await query(`INSERT INTO srcs_enrollments (course_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`, [c.id, uid]);
      if (r.rows[0]) added++;
    }
    return res.json({ ok: true, added });
  } catch (err) { return fail(res, err, "admin enroll"); }
});
/** رصد النتائج دفعة واحدة: [{id, score, attended, note}] */
router.post("/srcs/admin/courses/:id/results", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "results", "courses"); if (!ctx) return;
    const c = await loadScoped("srcs_courses", req.params.id, ctx.acc, res); if (!c) return;
    const rows = (Array.isArray(req.body?.rows) ? req.body.rows : []).slice(0, 1000);
    let saved = 0;
    for (const row of rows) {
      const score = num(row.score);
      if (score !== null && (score < 0 || score > Number(c.max_score))) continue;
      const passed = score === null ? null : score >= Number(c.pass_mark);
      const r = await query(`UPDATE srcs_enrollments SET score=$3, passed=$4, attended=COALESCE($5, attended), result_note=$6,
                               status=CASE WHEN $3::numeric IS NULL THEN status ELSE 'completed' END WHERE id=$1 AND course_id=$2 RETURNING id`,
        [Number(row.id), c.id, score, passed, typeof row.attended === "boolean" ? row.attended : null, str(row.note, 300) || null]);
      if (r.rows[0]) saved++;
    }
    return res.json({ ok: true, saved });
  } catch (err) { return fail(res, err, "results"); }
});
/** مراجعة دفع الشهادة: approve / reject / issue (مجاناً) / revoke (لمدير حصاحيصاوي فقط) */
router.patch("/srcs/admin/enrollments/:id/certificate", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "certificates"); if (!ctx) return;
    const { me } = ctx;
    const action = String(req.body?.action || "");
    const e = (await query(`SELECT e.*, c.title, c.unit_id FROM srcs_enrollments e JOIN srcs_courses c ON c.id=e.course_id WHERE e.id=$1`, [Number(req.params.id) || 0])).rows[0];
    if (!e || !canTouch(ctx.acc, e.unit_id)) return res.status(404).json({ error: "غير موجود أو خارج نطاق وحدتك" });
    await audit(Number(me.id), `cert_${action}`, `enrollment:${e.id} ${e.title}`, { user_id: e.user_id, amount: e.cert_amount, ref: e.payment_ref, note: req.body?.note }, e.unit_id);
    if (action === "approve" || action === "issue") {
      if (!e.passed) return res.status(400).json({ error: "لا تُصدر الشهادة إلا للناجحين" });
      return res.json({ enrollment: await issueCertificate(e.id, Number(me.id)) });
    }
    if (action === "reject") {
      const note = str(req.body?.note, 300) || "تعذّر التحقق من الدفع";
      const r = await query(`UPDATE srcs_enrollments SET cert_status='rejected', cert_note=$2 WHERE id=$1 RETURNING *`, [e.id, note]);
      notifyUsers([Number(e.user_id)], "طلب الشهادة", `لم يُعتمد إثبات الدفع لشهادة «${String(e.title).slice(0, 60)}»: ${note}`, {});
      return res.json({ enrollment: r.rows[0] });
    }
    if (action === "revoke" || action === "restore") {
      if (!isAppAdmin(me)) return res.status(403).json({ error: "إلغاء الشهادات لمدير حصاحيصاوي فقط" });
      const r = await query(`UPDATE srcs_enrollments SET cert_status=$2, cert_note=$3 WHERE id=$1 AND cert_no IS NOT NULL RETURNING *`,
        [e.id, action === "revoke" ? "revoked" : "issued", action === "revoke" ? str(req.body?.note, 300) || "مخالفة القوانين" : null]);
      return res.json({ enrollment: r.rows[0] });
    }
    return res.status(400).json({ error: "إجراء غير معروف" });
  } catch (err) { return fail(res, err, "cert review"); }
});
router.get("/srcs/admin/certificates/pending", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "certificates"); if (!ctx) return;
    const U = narrowUnits(ctx.acc, req.query.unit_id);
    if (U === false) return res.status(403).json({ error: "هذه الوحدة خارج نطاق إدارتك" });
    const r = await query(`SELECT e.*, u.name, c.title, c.unit_id FROM srcs_enrollments e JOIN users u ON u.id=e.user_id JOIN srcs_courses c ON c.id=e.course_id
                            WHERE e.cert_status='pending' AND ${unitCond("c.unit_id", 1)} ORDER BY e.created_at`, [U]);
    return res.json({ pending: exposeRows(r.rows) });
  } catch (err) { return fail(res, err, "cert pending"); }
});

// ═══ إدارة: الدفعات وسجل الأعضاء (ضمن نطاق الوحدة) ═════════════════════
router.get("/srcs/admin/cohorts", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "cohorts", "members", "courses"); if (!ctx) return;
    const U = narrowUnits(ctx.acc, req.query.unit_id);
    if (U === false) return res.status(403).json({ error: "هذه الوحدة خارج نطاق إدارتك" });
    const r = await query(`SELECT co.*, un.name AS unit_name, (SELECT COUNT(*)::int FROM srcs_members m WHERE m.cohort_id=co.id) AS members,
        (SELECT COUNT(*)::int FROM srcs_courses c WHERE c.cohort_id=co.id) AS courses FROM srcs_cohorts co LEFT JOIN srcs_units un ON un.id=co.unit_id
       WHERE ${unitCond("co.unit_id", 1)} ORDER BY co.year DESC NULLS LAST, co.id DESC`, [U]);
    return res.json({ cohorts: r.rows });
  } catch (err) { return fail(res, err, "cohorts"); }
});
router.post("/srcs/admin/cohorts", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "cohorts"); if (!ctx) return;
    const name = str(req.body?.name, 120);
    if (name.length < 2) return res.status(400).json({ error: "اسم الدفعة مطلوب" });
    const unitId = await pickWriteUnit(ctx.acc, req.body?.unit_id, res); if (unitId === undefined) return;
    const r = await query(`INSERT INTO srcs_cohorts (name, year, notes, created_by, unit_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, Number(req.body?.year) || new Date().getFullYear(), str(req.body?.notes, 2000) || null, ctx.me.id, unitId]);
    return res.json({ cohort: r.rows[0] });
  } catch (err) { return fail(res, err, "cohort create"); }
});
router.patch("/srcs/admin/cohorts/:id", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "cohorts"); if (!ctx) return;
    const co = await loadScoped("srcs_cohorts", req.params.id, ctx.acc, res); if (!co) return;
    const b = req.body || {};
    const r = await query(`UPDATE srcs_cohorts SET name=COALESCE($2,name), year=COALESCE($3,year), notes=COALESCE($4,notes) WHERE id=$1 RETURNING *`,
      [co.id, b.name ? str(b.name, 120) : null, b.year ? Number(b.year) : null, b.notes === undefined ? null : str(b.notes, 2000)]);
    if (Array.isArray(b.member_ids)) {
      const ids = b.member_ids.map(Number).filter(Number.isFinite).slice(0, 2000);
      // الأعضاء ضمن نطاق المدير، ودفعة الوحدة لا تضم إلا أعضاء وحدتها
      await query(`UPDATE srcs_members SET cohort_id=$1 WHERE id = ANY($2::int[]) AND ${unitCond("unit_id", 3)} AND ($4::int IS NULL OR unit_id=$4)`,
        [co.id, ids, ctx.acc.unitIds, co.unit_id]);
    }
    return res.json({ cohort: r.rows[0] });
  } catch (err) { return fail(res, err, "cohort patch"); }
});
router.delete("/srcs/admin/cohorts/:id", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "cohorts"); if (!ctx) return;
    const co = await loadScoped("srcs_cohorts", req.params.id, ctx.acc, res); if (!co) return;
    await query(`UPDATE srcs_members SET cohort_id=NULL WHERE cohort_id=$1`, [co.id]);
    await query(`UPDATE srcs_courses SET cohort_id=NULL WHERE cohort_id=$1`, [co.id]);
    await query(`DELETE FROM srcs_cohorts WHERE id=$1`, [co.id]);
    await audit(Number(ctx.me.id), "cohort_delete", `cohort:${co.id} ${co.name}`, {}, co.unit_id);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "cohort delete"); }
});
router.get("/srcs/admin/members/:id/dossier", async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "members", "cohorts", "requests"); if (!ctx) return;
    const m = await loadScoped("srcs_members", req.params.id, ctx.acc, res); if (!m) return;
    return res.json(await dossier(Number(m.user_id), true));
  } catch (err) { return fail(res, err, "dossier"); }
});
router.patch("/srcs/admin/docs/:id", writeLimiter, async (req, res) => {
  try {
    const ctx = await requireScope(req, res, "members", "requests", "cohorts"); if (!ctx) return;
    const d = (await query(`SELECT d.id, m.unit_id FROM srcs_member_docs d LEFT JOIN srcs_members m ON m.user_id=d.user_id WHERE d.id=$1`, [Number(req.params.id) || 0])).rows[0];
    if (!d || !canTouch(ctx.acc, d.unit_id)) return res.status(404).json({ error: "غير موجود أو خارج نطاق وحدتك" });
    const r = await query(`UPDATE srcs_member_docs SET verified=$2 WHERE id=$1 RETURNING *`, [d.id, !!req.body?.verified]);
    await audit(Number(ctx.me.id), req.body?.verified ? "doc_verify" : "doc_unverify", `doc:${d.id}`, { user_id: r.rows[0]?.user_id, title: r.rows[0]?.title }, d.unit_id);
    if (r.rows[0]?.profile_cert_id) await query(`UPDATE user_certificates SET reviewed=$2 WHERE id=$1`, [r.rows[0].profile_cert_id, !!req.body?.verified]).catch(() => {});
    return res.json({ doc: exposeRow(r.rows[0] ?? null) });
  } catch (err) { return fail(res, err, "doc verify"); }
});

// ═══ مزامنة تطبيق «مسعف» ═══════════════════════════════════════════
// يستدعيها خادم «مسعف» بمفتاح مشترك (MUSIF_SYNC_KEY) ليعرض للمستجيب نسخة من بطاقته ومستنداته وشهاداته.
router.get("/srcs/musif/profile", async (req, res) => {
  try {
    const key = String(process.env.MUSIF_SYNC_KEY || "");
    const got = String(req.headers["x-musif-key"] || "");
    if (!key || got.length !== key.length || !timingSafeEqual(Buffer.from(got), Buffer.from(key))) return res.status(401).json({ error: "unauthorized" });
    const code = str(req.query.code, 40);
    if (!code) return res.status(400).json({ error: "code required" });
    const m = (await query(`SELECT user_id FROM srcs_members WHERE musif_code=$1 LIMIT 1`, [code])).rows[0];
    if (!m) return res.status(404).json({ error: "not linked" });
    const d = await dossier(Number(m.user_id), false);
    const mem: any = d.member;
    return res.json({
      member: mem && { name: mem.name, role: mem.role, role_label: mem.role_label, status: mem.status, unit: mem.unit, affiliation: mem.affiliation, blood_type: mem.blood_type,
        card_no: mem.card_no, card_expires_at: mem.card_expires_at, revoked: !!mem.revoked_at || mem.status === "banned", cohort: mem.cohort_name,
        card_verify_url: mem.card_token ? `${API_PUBLIC_BASE}/api/public/srcs/verify/${mem.card_token}` : null },
      documents: d.docs.map((x: any) => ({ private: !!x.url_private, kind: x.kind, title: x.title, url: x.url, verified: x.verified, created_at: x.created_at })),
      certificates: d.enrollments.filter((e: any) => e.cert_url).map((e: any) => ({ title: e.title, cert_no: e.cert_no, issued_at: e.cert_issued_at, url: e.cert_url })),
    });
  } catch (err) { return fail(res, err, "musif"); }
});

export default router;
