// ════════════════════════════════════════════════════════════════
// عروض وكالات السفر: نشر العروض (عمرة، حج، طيران، رحلات، فنادق، تأشيرات)،
// طلبات الحجز من المستخدمين، ولوحة الوكالة (العروض، الطلبات، الملف، الفريق).
// الجداول تُنشأ في initTravelAgenciesDb (travel-agencies.ts).
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { writeLimiter } from "../lib/rate-limiters";
import { query, sessionUser, isStaff, type SessionUser } from "../lib/shared-db";
import { initTravelAgenciesDb } from "./travel-agencies";
import { ensureViewsDb } from "./views";

const router = Router();

export const OFFER_KINDS = {
  umrah: "عمرة", hajj: "حج", flight: "طيران", bus: "سفر بري", tour: "رحلة سياحية",
  hotel: "فنادق وإقامة", visa: "تأشيرات", package: "باقة شاملة",
} as const;
type Kind = keyof typeof OFFER_KINDS;
const KIND_KEYS = Object.keys(OFFER_KINDS) as Kind[];
const CURRENCIES = ["SDG", "USD", "SAR", "EGP", "AED"];
const REQUEST_STATUS = { new: "جديد", contacted: "تم التواصل", confirmed: "مؤكد", cancelled: "ملغي" } as const;
type ReqStatus = keyof typeof REQUEST_STATUS;
type Role = "owner" | "manager" | "agent";
const ROLE_LABEL: Record<Role, string> = { owner: "المالك", manager: "مدير", agent: "موظف حجوزات" };
type Perm = "profile" | "offers" | "requests" | "staff";
const ROLE_PERMS: Record<Role, Perm[]> = {
  owner: ["profile", "offers", "requests", "staff"],
  manager: ["profile", "offers", "requests"],
  agent: ["requests"],
};

// ─── أدوات ──────────────────────────────────────────────────────
const clean = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const intOrNull = (v: unknown, min = 0, max = 100000): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
};
const dateOrNull = (v: unknown): string | null => {
  const s = clean(v, 10);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : "invalid";
};
const strList = (v: unknown, maxItems: number, maxLen: number) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,،\n]/) : [])
    .map((x) => clean(String(x ?? ""), maxLen)).filter(Boolean).slice(0, maxItems);
const urlList = (v: unknown, maxItems = 8) => strList(v, maxItems, 600).filter((u) => /^https?:\/\/\S+$/i.test(u));
const urlOrNull = (v: unknown) => { const u = clean(v, 600); return u && /^https?:\/\/\S+$/i.test(u) ? u : null; };
const phoneOk = (v: string) => /^[+\d][\d\s()+-]{6,24}$/.test(v);
const idParam = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

function fail(res: Response, err: unknown, tag: string) {
  logger.error({ err }, `[travel-offers] ${tag}`);
  return res.status(500).json({ error: "حدث خطأ في الخادم، حاول لاحقاً" });
}

async function notifyUsers(ids: number[], type: string, title: string, body: string, data: Record<string, unknown>) {
  const uniq = [...new Set(ids.filter((x) => Number.isFinite(x) && x > 0))];
  if (!uniq.length) return;
  await query(`INSERT INTO notifications (user_id, type, title, body, data) SELECT u, $2, $3, $4, $5 FROM UNNEST($1::int[]) AS u`,
    [uniq, type, title, body, JSON.stringify(data)]).catch((e) => logger.warn({ err: e?.message }, "[travel-offers] notify insert"));
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [uniq]);
    for (let i = 0; i < rows.length; i += 90) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
        body: JSON.stringify(rows.slice(i, i + 90).map((r: any) => ({ to: r.token, title, body, sound: "default", priority: "high", data: { ...data, type } }))),
      }).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[travel-offers] push"); }
}

const OFFER_COLS = `o.id, o.agency_id, o.kind, o.title, o.from_city, o.destination, o.country,
  to_char(o.depart_date,'YYYY-MM-DD') AS depart_date, to_char(o.return_date,'YYYY-MM-DD') AS return_date,
  o.duration_days, o.price::float AS price, o.currency, o.price_note, o.seats, o.seats_left, o.includes, o.images,
  o.description, o.status, o.is_featured, o.created_at, o.updated_at,
  (o.depart_date IS NOT NULL AND o.depart_date < CURRENT_DATE) AS is_past,
  a.name AS agency_name, a.logo_url AS agency_logo, a.agency_type, a.city AS agency_city, a.is_featured AS agency_featured`;

function offerOut(r: any) {
  return { ...r, kind_label: OFFER_KINDS[r.kind as Kind] ?? r.kind };
}
function requestOut(r: any) {
  return { ...r, status_label: REQUEST_STATUS[r.status as ReqStatus] ?? r.status };
}

// ─── عضوية الفريق ───────────────────────────────────────────────
type Membership = { user: SessionUser; agency: any; role: Role; perms: Perm[] };
async function membership(u: SessionUser | null, agencyId?: number | null): Promise<Membership | null> {
  if (!u) return null;
  const r = await query(
    `SELECT a.*, s.role FROM travel_agency_staff s JOIN travel_agencies a ON a.id=s.agency_id
     WHERE s.user_id=$1 AND a.active=TRUE ${agencyId ? "AND a.id=$2" : ""}
     ORDER BY (s.role='owner') DESC, a.id LIMIT 1`, agencyId ? [u.id, agencyId] : [u.id]);
  const row = r.rows[0];
  if (!row) return null;
  const role = row.role as Role;
  return { user: u, agency: row, role, perms: ROLE_PERMS[role] ?? [] };
}
async function requirePerm(req: Request, res: Response, perm: Perm): Promise<Membership | null> {
  await initTravelAgenciesDb();
  const u = await sessionUser(req);
  if (!u) { res.status(401).json({ error: "سجّل الدخول أولاً" }); return null; }
  const m = await membership(u, idParam(req.query.agency_id ?? req.headers["x-agency-id"]));
  if (!m) { res.status(403).json({ error: "هذه اللوحة لفريق وكالة سفر معتمدة فقط" }); return null; }
  if (!m.perms.includes(perm)) { res.status(403).json({ error: "صلاحيتك في الوكالة لا تسمح بذلك" }); return null; }
  return m;
}
async function staffIds(agencyId: number, perm?: Perm): Promise<number[]> {
  const { rows } = await query(`SELECT user_id, role FROM travel_agency_staff WHERE agency_id=$1`, [agencyId]);
  return rows.filter((r: any) => !perm || ROLE_PERMS[r.role as Role]?.includes(perm)).map((r: any) => Number(r.user_id));
}

// ═══ العامة ═════════════════════════════════════════════════════
// GET /api/travel/offers?kind=&q=&to=&agency_id=&featured=1
router.get("/travel/offers", async (req: Request, res: Response) => {
  try {
    await initTravelAgenciesDb();
    const where = [`o.status='active'`, `a.active=TRUE`, `(o.depart_date IS NULL OR o.depart_date >= CURRENT_DATE)`];
    const params: unknown[] = [];
    const kind = clean(req.query.kind, 20);
    if (KIND_KEYS.includes(kind as Kind)) { params.push(kind); where.push(`o.kind=$${params.length}`); }
    const q = clean(req.query.q, 80);
    if (q) {
      params.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`);
      const p = `$${params.length}`;
      where.push(`(o.title ILIKE ${p} OR o.destination ILIKE ${p} OR o.country ILIKE ${p} OR o.from_city ILIKE ${p} OR a.name ILIKE ${p} OR o.description ILIKE ${p})`);
    }
    const to = clean(req.query.to, 80);
    if (to) { params.push(`%${to.replace(/[%_\\]/g, "\\$&")}%`); where.push(`(o.destination ILIKE $${params.length} OR o.country ILIKE $${params.length})`); }
    const agencyId = idParam(req.query.agency_id);
    if (agencyId) { params.push(agencyId); where.push(`o.agency_id=$${params.length}`); }
    if (req.query.featured === "1") where.push(`o.is_featured=TRUE`);
    const limit = Math.min(Number(req.query.limit) || 60, 100);
    const { rows } = await query(
      `SELECT ${OFFER_COLS} FROM travel_agency_offers o JOIN travel_agencies a ON a.id=o.agency_id
       WHERE ${where.join(" AND ")}
       ORDER BY o.is_featured DESC, o.depart_date ASC NULLS LAST, o.created_at DESC LIMIT ${limit}`, params);
    const counts = await query(
      `SELECT o.kind, COUNT(*)::int AS n FROM travel_agency_offers o JOIN travel_agencies a ON a.id=o.agency_id
       WHERE o.status='active' AND a.active=TRUE AND (o.depart_date IS NULL OR o.depart_date >= CURRENT_DATE) GROUP BY o.kind`);
    const byKind: Record<string, number> = {};
    for (const r of counts.rows) byKind[r.kind] = r.n;
    return res.json({ offers: rows.map(offerOut), counts: byKind, kinds: OFFER_KINDS });
  } catch (err) { return fail(res, err, "feed"); }
});

// GET /api/travel/offers/:id
router.get("/travel/offers/:id", async (req: Request, res: Response) => {
  try {
    await initTravelAgenciesDb();
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ error: "معرّف العرض غير صحيح" });
    const { rows } = await query(
      `SELECT ${OFFER_COLS}, a.phone AS agency_phone, a.whatsapp AS agency_whatsapp, a.description AS agency_description,
         a.license_number AS agency_license, a.cover_url AS agency_cover
       FROM travel_agency_offers o JOIN travel_agencies a ON a.id=o.agency_id WHERE o.id=$1 AND a.active=TRUE`, [id]);
    const offer = rows[0];
    if (!offer) return res.status(404).json({ error: "العرض غير موجود" });
    const u = await sessionUser(req).catch(() => null);
    const m = u ? await membership(u, offer.agency_id) : null;
    // العروض الموقوفة/المنتهية تظهر لفريق الوكالة فقط
    if (offer.status !== "active" && !m && !isStaff(u)) return res.status(404).json({ error: "العرض غير متاح حالياً" });
    let myRequest = null;
    if (u) {
      const r = await query(`SELECT id, status, travellers, created_at FROM travel_offer_requests WHERE offer_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 1`, [id, u.id]);
      myRequest = r.rows[0] ? requestOut(r.rows[0]) : null;
    }
    const more = await query(
      `SELECT ${OFFER_COLS} FROM travel_agency_offers o JOIN travel_agencies a ON a.id=o.agency_id
       WHERE o.agency_id=$1 AND o.id<>$2 AND o.status='active' AND (o.depart_date IS NULL OR o.depart_date >= CURRENT_DATE)
       ORDER BY o.is_featured DESC, o.created_at DESC LIMIT 6`, [offer.agency_id, id]);
    return res.json({
      offer: offerOut(offer), is_staff: !!m, my_request: myRequest, more: more.rows.map(offerOut),
      me: u ? { name: u.name, phone: u.phone } : null,
    });
  } catch (err) { return fail(res, err, "offer"); }
});

// GET /api/travel-agencies/:id — ملف الوكالة وعروضها
router.get("/travel-agencies/:id", async (req: Request, res: Response, next) => {
  const id = idParam(req.params.id);
  if (!id) return next();
  try {
    await initTravelAgenciesDb();
    const { rows } = await query(
      `SELECT id, name, name_en, agency_type, specialties, destinations, services_offered, booking_products, description,
         logo_url, cover_url, website, phone, whatsapp, email, city, country, address, license_number, founded_year, is_featured, created_at
       FROM travel_agencies WHERE id=$1 AND active=TRUE`, [id]);
    const agency = rows[0];
    if (!agency) return res.status(404).json({ error: "الوكالة غير موجودة" });
    const offers = await query(
      `SELECT ${OFFER_COLS} FROM travel_agency_offers o JOIN travel_agencies a ON a.id=o.agency_id
       WHERE o.agency_id=$1 AND o.status='active' AND (o.depart_date IS NULL OR o.depart_date >= CURRENT_DATE)
       ORDER BY o.is_featured DESC, o.depart_date ASC NULLS LAST, o.created_at DESC`, [id]);
    const stats = await query(
      `SELECT COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed FROM travel_offer_requests WHERE agency_id=$1`, [id]);
    const u = await sessionUser(req).catch(() => null);
    const m = u ? await membership(u, id) : null;
    return res.json({ agency, offers: offers.rows.map(offerOut), stats: { offers: offers.rows.length, confirmed: stats.rows[0]?.confirmed ?? 0 }, is_staff: !!m });
  } catch (err) { return fail(res, err, "agency"); }
});

// ═══ المستخدم ═══════════════════════════════════════════════════
// POST /api/travel/offers/:id/request
router.post("/travel/offers/:id/request", writeLimiter, async (req: Request, res: Response) => {
  try {
    await initTravelAgenciesDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول لطلب الحجز" });
    if (u.is_banned) return res.status(403).json({ error: "حسابك موقوف" });
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ error: "معرّف العرض غير صحيح" });
    const { rows } = await query(
      `SELECT o.*, a.name AS agency_name FROM travel_agency_offers o JOIN travel_agencies a ON a.id=o.agency_id
       WHERE o.id=$1 AND a.active=TRUE`, [id]);
    const offer = rows[0];
    if (!offer || offer.status !== "active") return res.status(404).json({ error: "العرض غير متاح للحجز حالياً" });
    if (offer.depart_date && new Date(offer.depart_date).getTime() < new Date(new Date().toDateString()).getTime())
      return res.status(400).json({ error: "انتهى موعد هذا العرض" });
    const name = clean(req.body?.name, 120) || u.name || "";
    const phone = clean(req.body?.phone, 40) || u.phone || "";
    const travellers = intOrNull(req.body?.travellers ?? 1, 1, 50);
    const notes = clean(req.body?.notes, 800);
    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
    if (!phone || !phoneOk(phone)) return res.status(400).json({ error: "أدخل رقم هاتف صحيحاً لتتواصل معك الوكالة" });
    if (travellers === null || Number.isNaN(travellers)) return res.status(400).json({ error: "عدد المسافرين بين 1 و50" });
    if (offer.seats_left !== null && offer.seats_left !== undefined && travellers > Number(offer.seats_left))
      return res.status(400).json({ error: offer.seats_left > 0 ? `المقاعد المتبقية ${offer.seats_left} فقط` : "اكتملت المقاعد في هذا العرض" });
    const dup = await query(`SELECT id FROM travel_offer_requests WHERE offer_id=$1 AND user_id=$2 AND status IN ('new','contacted') LIMIT 1`, [id, u.id]);
    if (dup.rows[0]) return res.status(409).json({ error: "لديك طلب قائم لهذا العرض — تابعه من «حجوزاتي»" });
    const ins = await query(
      `INSERT INTO travel_offer_requests (offer_id, agency_id, user_id, name, phone, travellers, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, offer.agency_id, u.id, name, phone, travellers, notes || null]);
    const reqRow = ins.rows[0];
    void notifyUsers(await staffIds(offer.agency_id, "requests"), "travel_offer_request",
      "طلب حجز جديد", `${name} يطلب «${offer.title}» — ${travellers} مسافر`,
      { screen: "travel-agency-portal", tab: "requests", request_id: reqRow.id, agency_id: offer.agency_id });
    return res.status(201).json({ request: requestOut(reqRow), message: `أُرسل طلبك إلى ${offer.agency_name}، وستتواصل معك الوكالة قريباً.` });
  } catch (err) { return fail(res, err, "request"); }
});

// GET /api/travel/my-requests
router.get("/travel/my-requests", async (req: Request, res: Response) => {
  try {
    await initTravelAgenciesDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const { rows } = await query(
      `SELECT r.id, r.offer_id, r.agency_id, r.name, r.phone, r.travellers, r.notes, r.status, r.agency_note, r.created_at, r.updated_at,
         o.title AS offer_title, o.kind, o.destination, o.from_city, to_char(o.depart_date,'YYYY-MM-DD') AS depart_date,
         o.price::float AS price, o.currency, o.images[1] AS image,
         a.name AS agency_name, a.logo_url AS agency_logo, a.phone AS agency_phone, a.whatsapp AS agency_whatsapp
       FROM travel_offer_requests r JOIN travel_agency_offers o ON o.id=r.offer_id JOIN travel_agencies a ON a.id=r.agency_id
       WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 100`, [u.id]);
    return res.json({ requests: rows.map((r: any) => ({ ...requestOut(r), kind_label: OFFER_KINDS[r.kind as Kind] ?? r.kind })) });
  } catch (err) { return fail(res, err, "my-requests"); }
});

// POST /api/travel/my-requests/:id/cancel
router.post("/travel/my-requests/:id/cancel", writeLimiter, async (req: Request, res: Response) => {
  try {
    await initTravelAgenciesDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const r = await query(
      `UPDATE travel_offer_requests SET status='cancelled', updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status IN ('new','contacted')
       RETURNING id, agency_id, name, offer_id`, [idParam(req.params.id), u.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "لا يمكن إلغاء هذا الطلب" });
    void notifyUsers(await staffIds(r.rows[0].agency_id, "requests"), "travel_offer_request", "أُلغي طلب حجز",
      `ألغى ${r.rows[0].name} طلبه`, { screen: "travel-agency-portal", tab: "requests", request_id: r.rows[0].id });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "cancel"); }
});

// ═══ لوحة الوكالة ═══════════════════════════════════════════════
router.get("/travel-agency-portal/me", async (req: Request, res: Response) => {
  try {
    await initTravelAgenciesDb();
    const u = await sessionUser(req);
    if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
    const m = await membership(u, idParam(req.query.agency_id));
    if (!m) {
      // هل لدى المستخدم طلب انضمام قيد المراجعة؟
      const p = await query(`SELECT id, agency_name, status, created_at FROM travel_agency_applications WHERE applicant_user_id=$1 ORDER BY created_at DESC LIMIT 1`, [u.id]).catch(() => ({ rows: [] as any[] }));
      return res.json({ agency: null, application: p.rows[0] ?? null });
    }
    const c = await query(
      `SELECT (SELECT COUNT(*)::int FROM travel_agency_offers WHERE agency_id=$1 AND status='active') AS active_offers,
              (SELECT COUNT(*)::int FROM travel_agency_offers WHERE agency_id=$1) AS total_offers,
              (SELECT COUNT(*)::int FROM travel_offer_requests WHERE agency_id=$1 AND status='new') AS new_requests,
              (SELECT COUNT(*)::int FROM travel_offer_requests WHERE agency_id=$1 AND status='confirmed') AS confirmed_requests,
              (SELECT COUNT(*)::int FROM travel_offer_requests WHERE agency_id=$1) AS total_requests`, [m.agency.id]);
    const { role, ...agency } = m.agency;
    return res.json({ agency, role: m.role, role_label: ROLE_LABEL[m.role], perms: m.perms, counts: c.rows[0], kinds: OFFER_KINDS, statuses: REQUEST_STATUS, roles: ROLE_LABEL });
  } catch (err) { return fail(res, err, "portal-me"); }
});

router.put("/travel-agency-portal/agency", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "profile"); if (!g) return;
    const b = req.body ?? {};
    const name = clean(b.name, 160);
    if (!name) return res.status(400).json({ error: "اسم الوكالة مطلوب" });
    for (const k of ["phone", "whatsapp"]) {
      const v = clean(b[k], 40);
      if (v && !phoneOk(v)) return res.status(400).json({ error: "رقم الهاتف أو الواتساب غير صحيح" });
    }
    const { rows } = await query(
      `UPDATE travel_agencies SET name=$1, description=$2, logo_url=$3, cover_url=$4, phone=$5, whatsapp=$6, email=$7,
         address=$8, city=$9, license_number=$10, services_offered=$11, destinations=$12, website=$13, updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [name, clean(b.description, 2000) || null, urlOrNull(b.logo_url), urlOrNull(b.cover_url), clean(b.phone, 40) || null,
        clean(b.whatsapp, 40) || null, clean(b.email, 160) || null, clean(b.address, 240) || null, clean(b.city, 100) || null,
        clean(b.license_number, 100) || null, strList(b.services_offered, 20, 60), strList(b.destinations, 30, 60), clean(b.website, 220) || null, g.agency.id]);
    return res.json({ agency: rows[0] });
  } catch (err) { return fail(res, err, "agency-put"); }
});

router.get("/travel-agency-portal/offers", async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "offers"); if (!g) return;
    await ensureViewsDb().catch(() => {});
    const { rows } = await query(
      `SELECT ${OFFER_COLS},
         (SELECT COUNT(*)::int FROM travel_offer_requests r WHERE r.offer_id=o.id) AS requests_count,
         (SELECT COUNT(*)::int FROM travel_offer_requests r WHERE r.offer_id=o.id AND r.status='new') AS new_requests,
         COALESCE((SELECT count FROM content_view_counts v WHERE v.kind='travel_offer' AND v.item_id=o.id::text),0) AS views
       FROM travel_agency_offers o JOIN travel_agencies a ON a.id=o.agency_id WHERE o.agency_id=$1
       ORDER BY (o.status='active') DESC, o.created_at DESC`, [g.agency.id]);
    return res.json({ offers: rows.map(offerOut) });
  } catch (err) { return fail(res, err, "portal-offers"); }
});

function parseOffer(b: any): { error?: string; v?: Record<string, unknown> } {
  const kind = clean(b?.kind, 20) as Kind;
  if (!KIND_KEYS.includes(kind)) return { error: "اختر نوع العرض" };
  const title = clean(b?.title, 140);
  if (title.length < 3) return { error: "عنوان العرض مطلوب (3 أحرف على الأقل)" };
  const depart = dateOrNull(b?.depart_date); const ret = dateOrNull(b?.return_date);
  if (depart === "invalid" || ret === "invalid") return { error: "صيغة التاريخ غير صحيحة" };
  if (depart && ret && ret < depart) return { error: "تاريخ العودة يجب أن يكون بعد تاريخ السفر" };
  const duration = intOrNull(b?.duration_days, 1, 365);
  const seats = intOrNull(b?.seats, 1, 10000);
  if (Number.isNaN(duration) || Number.isNaN(seats)) return { error: "المدة أو عدد المقاعد غير صحيح" };
  let price: number | null = null;
  if (b?.price !== undefined && b?.price !== null && b?.price !== "") {
    price = Number(String(b.price).replace(/[,،\s]/g, ""));
    if (!Number.isFinite(price) || price < 0 || price > 1e12) return { error: "السعر غير صحيح" };
  }
  const currency = CURRENCIES.includes(clean(b?.currency, 5)) ? clean(b?.currency, 5) : "SDG";
  return {
    v: {
      kind, title, from_city: clean(b?.from_city, 80) || null, destination: clean(b?.destination, 120) || null, country: clean(b?.country, 80) || null,
      depart_date: depart, return_date: ret, duration_days: duration, price, currency, price_note: clean(b?.price_note, 160) || null,
      seats, includes: strList(b?.includes, 20, 80), images: urlList(b?.images, 8), description: clean(b?.description, 3000) || null,
      is_featured: !!b?.is_featured,
    },
  };
}

router.post("/travel-agency-portal/offers", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "offers"); if (!g) return;
    const p = parseOffer(req.body); if (p.error) return res.status(400).json({ error: p.error });
    const v = p.v!;
    const { rows } = await query(
      `INSERT INTO travel_agency_offers (agency_id, kind, title, from_city, destination, country, depart_date, return_date, duration_days,
         price, currency, price_note, seats, seats_left, includes, images, description, is_featured, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [g.agency.id, v.kind, v.title, v.from_city, v.destination, v.country, v.depart_date, v.return_date, v.duration_days,
        v.price, v.currency, v.price_note, v.seats, v.includes, v.images, v.description, v.is_featured, g.user.id]);
    return res.status(201).json({ offer: { id: rows[0].id }, message: "نُشر العرض وأصبح ظاهراً للمستخدمين" });
  } catch (err) { return fail(res, err, "offer-post"); }
});

router.put("/travel-agency-portal/offers/:oid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "offers"); if (!g) return;
    const p = parseOffer(req.body); if (p.error) return res.status(400).json({ error: p.error });
    const v = p.v!;
    const oid = idParam(req.params.oid);
    const cur = (await query(`SELECT seats, seats_left FROM travel_agency_offers WHERE id=$1 AND agency_id=$2`, [oid, g.agency.id])).rows[0];
    if (!cur) return res.status(404).json({ error: "العرض غير موجود" });
    // عند تعديل عدد المقاعد تبقى المقاعد المحجوزة محسوبة
    const held = cur.seats != null && cur.seats_left != null ? Number(cur.seats) - Number(cur.seats_left) : 0;
    const seatsLeft = v.seats == null ? null : Math.max(0, Number(v.seats) - held);
    await query(
      `UPDATE travel_agency_offers SET kind=$1, title=$2, from_city=$3, destination=$4, country=$5, depart_date=$6, return_date=$7,
         duration_days=$8, price=$9, currency=$10, price_note=$11, seats=$12, seats_left=$13, includes=$14, images=$15, description=$16,
         is_featured=$17, updated_at=NOW() WHERE id=$18 AND agency_id=$19`,
      [v.kind, v.title, v.from_city, v.destination, v.country, v.depart_date, v.return_date, v.duration_days, v.price, v.currency,
        v.price_note, v.seats, seatsLeft, v.includes, v.images, v.description, v.is_featured, oid, g.agency.id]);
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "offer-put"); }
});

router.patch("/travel-agency-portal/offers/:oid/status", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "offers"); if (!g) return;
    const status = clean(req.body?.status, 10);
    if (!["active", "paused", "expired"].includes(status)) return res.status(400).json({ error: "حالة غير صحيحة" });
    const r = await query(`UPDATE travel_agency_offers SET status=$1, updated_at=NOW() WHERE id=$2 AND agency_id=$3 RETURNING id, status`,
      [status, idParam(req.params.oid), g.agency.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "العرض غير موجود" });
    return res.json({ offer: r.rows[0] });
  } catch (err) { return fail(res, err, "offer-status"); }
});

router.delete("/travel-agency-portal/offers/:oid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "offers"); if (!g) return;
    const oid = idParam(req.params.oid);
    const open = await query(`SELECT COUNT(*)::int AS n FROM travel_offer_requests WHERE offer_id=$1 AND status IN ('new','contacted','confirmed')`, [oid]);
    if (open.rows[0]?.n > 0) return res.status(409).json({ error: "على هذا العرض طلبات قائمة — أوقفه بدلاً من حذفه" });
    const r = await query(`DELETE FROM travel_agency_offers WHERE id=$1 AND agency_id=$2 RETURNING id`, [oid, g.agency.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "العرض غير موجود" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "offer-del"); }
});

router.get("/travel-agency-portal/requests", async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "requests"); if (!g) return;
    const params: unknown[] = [g.agency.id];
    let where = `r.agency_id=$1`;
    const st = clean(req.query.status, 12);
    if (st in REQUEST_STATUS) { params.push(st); where += ` AND r.status=$2`; }
    const { rows } = await query(
      `SELECT r.*, o.title AS offer_title, o.kind, to_char(o.depart_date,'YYYY-MM-DD') AS depart_date, o.seats_left, u.avatar_url
       FROM travel_offer_requests r JOIN travel_agency_offers o ON o.id=r.offer_id LEFT JOIN users u ON u.id=r.user_id
       WHERE ${where} ORDER BY (r.status='new') DESC, r.created_at DESC LIMIT 200`, params);
    const c = await query(`SELECT status, COUNT(*)::int AS n FROM travel_offer_requests WHERE agency_id=$1 GROUP BY status`, [g.agency.id]);
    const counts: Record<string, number> = {};
    for (const r of c.rows) counts[r.status] = r.n;
    return res.json({ requests: rows.map((r: any) => ({ ...requestOut(r), kind_label: OFFER_KINDS[r.kind as Kind] ?? r.kind })), counts });
  } catch (err) { return fail(res, err, "portal-requests"); }
});

router.patch("/travel-agency-portal/requests/:rid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "requests"); if (!g) return;
    const rid = idParam(req.params.rid);
    const cur = (await query(
      `SELECT r.*, o.title AS offer_title, o.seats_left FROM travel_offer_requests r JOIN travel_agency_offers o ON o.id=r.offer_id
       WHERE r.id=$1 AND r.agency_id=$2`, [rid, g.agency.id])).rows[0];
    if (!cur) return res.status(404).json({ error: "الطلب غير موجود" });
    const status = clean(req.body?.status, 12) as ReqStatus | "";
    if (status && !(status in REQUEST_STATUS)) return res.status(400).json({ error: "حالة غير صحيحة" });
    const note = req.body?.agency_note === undefined ? cur.agency_note : clean(req.body.agency_note, 800) || null;
    const next = (status || cur.status) as ReqStatus;
    // حجز المقاعد عند التأكيد وتحريرها عند الإلغاء
    let held = Number(cur.seats_held) || 0;
    if (next === "confirmed" && held === 0 && cur.seats_left !== null) {
      if (Number(cur.seats_left) < Number(cur.travellers)) return res.status(409).json({ error: `المقاعد المتبقية ${cur.seats_left} لا تكفي لهذا الطلب` });
      await query(`UPDATE travel_agency_offers SET seats_left=seats_left-$1 WHERE id=$2`, [cur.travellers, cur.offer_id]);
      held = Number(cur.travellers);
    } else if (next !== "confirmed" && held > 0) {
      await query(`UPDATE travel_agency_offers SET seats_left=LEAST(COALESCE(seats,seats_left+$1), seats_left+$1) WHERE id=$2 AND seats_left IS NOT NULL`, [held, cur.offer_id]);
      held = 0;
    }
    const { rows } = await query(
      `UPDATE travel_offer_requests SET status=$1, agency_note=$2, seats_held=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
      [next, note, held, rid]);
    if (status && status !== cur.status && cur.user_id) {
      const msg: Record<ReqStatus, string> = {
        new: "طلبك قيد المراجعة",
        contacted: `تواصلت معك ${g.agency.name} بخصوص طلبك`,
        confirmed: `أكّدت ${g.agency.name} حجزك في «${cur.offer_title}»`,
        cancelled: `اعتذرت ${g.agency.name} عن طلبك في «${cur.offer_title}»`,
      };
      void notifyUsers([Number(cur.user_id)], "travel_offer_status", `حالة طلبك: ${REQUEST_STATUS[status]}`,
        `${msg[status]}${note ? ` — ${note}` : ""}`, { screen: "travel", tab: "mine", request_id: rid, offer_id: cur.offer_id });
    }
    return res.json({ request: requestOut(rows[0]) });
  } catch (err) { return fail(res, err, "request-patch"); }
});

router.get("/travel-agency-portal/staff", async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "staff"); if (!g) return;
    const { rows } = await query(
      `SELECT s.agency_id, s.user_id, s.role, s.created_at, u.name, u.avatar_url, u.phone FROM travel_agency_staff s JOIN users u ON u.id=s.user_id
       WHERE s.agency_id=$1 ORDER BY (s.role='owner') DESC, s.created_at`, [g.agency.id]);
    return res.json({ staff: rows.map((r: any) => ({ ...r, role_label: ROLE_LABEL[r.role as Role] })), roles: ROLE_LABEL });
  } catch (err) { return fail(res, err, "staff"); }
});

router.get("/travel-agency-portal/users/lookup", async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "staff"); if (!g) return;
    const q = clean(req.query.q, 60);
    if (q.length < 2) return res.json({ users: [] });
    const digits = q.replace(/\D/g, "");
    const { rows } = await query(
      `SELECT id, name, avatar_url FROM users WHERE (name ILIKE $1 OR ($2 <> '' AND regexp_replace(COALESCE(phone,''),'\\D','','g') LIKE '%' || $2 || '%') OR id::text=$3)
       AND COALESCE(is_banned,false)=false ORDER BY name LIMIT 15`, [`%${q.replace(/[%_\\]/g, "\\$&")}%`, digits.length >= 4 ? digits : "", q]);
    return res.json({ users: rows });
  } catch (err) { return fail(res, err, "lookup"); }
});

router.put("/travel-agency-portal/staff/:uid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "staff"); if (!g) return;
    const uid = idParam(req.params.uid);
    const role = (["manager", "agent"] as string[]).includes(req.body?.role) ? (req.body.role as Role) : null;
    if (!uid || !role) return res.status(400).json({ error: "اختر دوراً (مدير أو موظف حجوزات)" });
    if (uid === g.user.id) return res.status(400).json({ error: "لا يمكنك تغيير دورك" });
    const exists = await query(`SELECT id FROM users WHERE id=$1 AND COALESCE(is_banned,false)=false`, [uid]);
    if (!exists.rows[0]) return res.status(404).json({ error: "المستخدم غير موجود" });
    const cur = (await query(`SELECT role FROM travel_agency_staff WHERE agency_id=$1 AND user_id=$2`, [g.agency.id, uid])).rows[0];
    if (cur?.role === "owner") return res.status(403).json({ error: "لا يمكن تعديل المالك" });
    await query(`INSERT INTO travel_agency_staff (agency_id, user_id, role) VALUES ($1,$2,$3)
      ON CONFLICT (agency_id, user_id) DO UPDATE SET role=EXCLUDED.role`, [g.agency.id, uid, role]);
    if (!cur) void notifyUsers([uid], "travel_agency_staff", `انضممت لفريق ${g.agency.name}`, `دورك: ${ROLE_LABEL[role]} — افتح لوحة الوكالة`, { screen: "travel-agency-portal" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "staff-put"); }
});

router.delete("/travel-agency-portal/staff/:uid", writeLimiter, async (req: Request, res: Response) => {
  try {
    const g = await requirePerm(req, res, "staff"); if (!g) return;
    const r = await query(`DELETE FROM travel_agency_staff WHERE agency_id=$1 AND user_id=$2 AND role<>'owner' RETURNING user_id`, [g.agency.id, idParam(req.params.uid)]);
    if (!r.rows[0]) return res.status(404).json({ error: "غير موجود أو هو المالك" });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "staff-del"); }
});

// ═══ الإدارة: ربط مالك بوكالة معتمدة سابقاً (قبل وجود الفريق) ═══
router.post("/admin/travel-agencies/:id/owner", writeLimiter, async (req: Request, res: Response) => {
  try {
    await initTravelAgenciesDb();
    const u = await sessionUser(req);
    if (!u || u.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const id = idParam(req.params.id); const uid = idParam(req.body?.user_id);
    if (!id || !uid) return res.status(400).json({ error: "حدّد الوكالة والمستخدم" });
    const a = await query(`SELECT name FROM travel_agencies WHERE id=$1`, [id]);
    if (!a.rows[0]) return res.status(404).json({ error: "الوكالة غير موجودة" });
    const target = await query(`SELECT id, name FROM users WHERE id=$1 AND COALESCE(is_banned,false)=false`, [uid]);
    if (!target.rows[0]) return res.status(404).json({ error: "المستخدم غير موجود أو محظور" });
    const cur = (await query(`SELECT role FROM travel_agency_staff WHERE agency_id=$1 AND user_id=$2`, [id, uid])).rows[0];
    if (cur?.role === "owner") return res.json({ ok: true, already: true });
    // مالك واحد للوكالة: المالك السابق (إن وُجد) يصبح مديراً ولا يفقد وصوله
    await query(`UPDATE travel_agency_staff SET role='manager' WHERE agency_id=$1 AND role='owner' AND user_id<>$2`, [id, uid]);
    await query(`INSERT INTO travel_agency_staff (agency_id, user_id, role) VALUES ($1,$2,'owner') ON CONFLICT (agency_id, user_id) DO UPDATE SET role='owner'`, [id, uid]);
    void notifyUsers([uid], "travel_agency_approved", `أصبحت مالك ${a.rows[0].name}`, "افتح لوحة الوكالة لنشر العروض", { screen: "travel-agency-portal", agency_id: id });
    return res.json({ ok: true });
  } catch (err) { return fail(res, err, "admin-owner"); }
});

// ═══ الإدارة: الوكالات المعتمدة مع فريق كل وكالة (لربط المالك) ═══
router.get("/admin/travel-agencies/approved", async (req: Request, res: Response) => {
  try {
    await initTravelAgenciesDb();
    const u = await sessionUser(req);
    if (!u || u.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const q = clean(req.query.q, 60);
    const { rows } = await query(
      `SELECT a.id, a.name, a.city, a.phone, a.whatsapp, a.logo_url, a.active, a.created_at,
              COALESCE((SELECT json_agg(json_build_object('user_id', s.user_id, 'role', s.role, 'name', su.name, 'phone', su.phone, 'avatar_url', su.avatar_url)
                                 ORDER BY (s.role='owner') DESC, s.created_at)
                          FROM travel_agency_staff s JOIN users su ON su.id=s.user_id WHERE s.agency_id=a.id), '[]'::json) AS staff
         FROM travel_agencies a
        WHERE ($1 = '' OR a.name ILIKE '%' || $1 || '%' OR COALESCE(a.phone,'') ILIKE '%' || $1 || '%')
        ORDER BY NOT EXISTS (SELECT 1 FROM travel_agency_staff s WHERE s.agency_id=a.id AND s.role='owner') DESC, a.created_at DESC
        LIMIT 200`, [q.replace(/[%_\\]/g, "")]);
    return res.json({ agencies: rows.map((r: any) => ({ ...r, has_owner: (r.staff as any[]).some((s) => s.role === "owner") })), roles: ROLE_LABEL });
  } catch (err) { return fail(res, err, "admin-approved"); }
});

export default router;
