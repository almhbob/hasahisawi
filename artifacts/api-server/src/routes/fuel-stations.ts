// ════════════════════════════════════════════════════════════════
// ⛽ محطات الوقود: أي محطة يتوفر بها الوقود الآن، الأسعار، والخدمات للسائقين
//  • القوائم العامة تعرض المحطات المعتمدة فقط.
//  • تسجيل محطة من أي مستخدم ← تنتظر اعتماد الإدارة، ويصبح المسجِّل مديرها.
//  • مدير المحطة يحدّث حالة كل وقود (متوفر/نفد، السعر، الزحام) وبياناتها وشعارها وخدماتها.
//  • المواطن يستطيع الإبلاغ «متوفر/نفد» فيظهر كإشارة حديثة دون أن يغيّر بيانات المحطة.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();

export const FUELS: Record<string, { label: string; unit: string }> = {
  gasoline: { label: "بنزين", unit: "لتر" },
  diesel: { label: "جازولين", unit: "لتر" },
  gas: { label: "غاز الطبخ", unit: "أسطوانة" },
};
export const SERVICES: Record<string, string> = {
  car_wash: "غسيل سيارات", oil_change: "تغيير زيت", tires: "إطارات وهواء", mechanic: "ورشة صيانة",
  mini_market: "بقالة", cafe: "كافتيريا", restroom: "دورات مياه", mosque: "مصلى",
  e_payment: "دفع إلكتروني (بنكك)", atm: "صراف آلي", parking: "مواقف", towing: "سحب السيارات",
};
const QUEUES = ["none", "short", "long"];

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const httpsUrl = (v: unknown) => (/^https:\/\/\S+$/i.test(String(v ?? "")) ? String(v).slice(0, 500) : null);
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000_000) : null; };

let ready: Promise<void> | null = null;
export function ensureFuelDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS fuel_stations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      brand VARCHAR(100),
      logo_url TEXT, cover_url TEXT,
      phone VARCHAR(30), whatsapp VARCHAR(30),
      area VARCHAR(120), address VARCHAR(250),
      lat DOUBLE PRECISION, lng DOUBLE PRECISION,
      hours VARCHAR(120), is_24h BOOLEAN NOT NULL DEFAULT FALSE,
      services JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT,
      status VARCHAR(12) NOT NULL DEFAULT 'pending',
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS fuel_station_managers (
      station_id INTEGER NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (station_id, user_id)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS fuel_station_fuels (
      station_id INTEGER NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
      fuel VARCHAR(20) NOT NULL,
      available BOOLEAN NOT NULL DEFAULT FALSE,
      price NUMERIC(12,2),
      queue VARCHAR(8) NOT NULL DEFAULT 'none',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (station_id, fuel)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS fuel_station_reports (
      id SERIAL PRIMARY KEY,
      station_id INTEGER NOT NULL REFERENCES fuel_stations(id) ON DELETE CASCADE,
      fuel VARCHAR(20) NOT NULL,
      available BOOLEAN NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    // نوع النشاط: محطة وقود، أو محل غاز (أسطوانات الطبخ فقط) — محلات الغاز ليست بالضرورة محطات
    await query(`ALTER TABLE fuel_stations ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'station'`);
    await query(`CREATE INDEX IF NOT EXISTS fuel_reports_recent_idx ON fuel_station_reports(station_id, created_at DESC)`);
  })().catch((e) => { ready = null; throw e; }));
}

async function canManage(u: SessionUser | null, stationId: number): Promise<boolean> {
  if (!u) return false;
  if (u.role === "admin") return true;
  const r = await query(
    `SELECT 1 FROM fuel_stations s WHERE s.id=$1 AND (s.owner_user_id=$2
       OR EXISTS (SELECT 1 FROM fuel_station_managers m WHERE m.station_id=s.id AND m.user_id=$2))`,
    [stationId, u.id]);
  return r.rows.length > 0;
}

/** المحطات مع حالة الوقود وآخر بلاغات المواطنين خلال 3 ساعات */
async function loadStations(where: string, params: unknown[]) {
  const r = await query(
    `SELECT s.*,
       COALESCE((SELECT json_agg(json_build_object('fuel',f.fuel,'available',f.available,'price',f.price,'queue',f.queue,'updated_at',f.updated_at) ORDER BY f.fuel)
                 FROM fuel_station_fuels f WHERE f.station_id=s.id), '[]') AS fuels,
       COALESCE((SELECT json_agg(x) FROM (
          SELECT fuel, BOOL_OR(available) FILTER (WHERE rn=1) AS last_available,
                 COUNT(*) FILTER (WHERE available) AS yes, COUNT(*) FILTER (WHERE NOT available) AS no,
                 MAX(created_at) AS last_at
            FROM (SELECT fuel, available, created_at, ROW_NUMBER() OVER (PARTITION BY fuel ORDER BY created_at DESC) rn
                    FROM fuel_station_reports WHERE station_id=s.id AND created_at > NOW() - INTERVAL '3 hours') q
           GROUP BY fuel) x), '[]') AS reports
       FROM fuel_stations s ${where}
      ORDER BY s.updated_at DESC`, params);
  return r.rows;
}

// GET /api/fuel-stations — القائمة العامة (المعتمدة)
router.get("/fuel-stations", async (_req: Request, res: Response) => {
  try {
    await ensureFuelDb();
    return res.json({ stations: await loadStations(`WHERE s.status='approved'`, []), fuels: FUELS, services: SERVICES });
  } catch (e: any) { logger.error({ err: e?.message }, "fuel-stations list"); return res.status(500).json({ error: "تعذّر تحميل المحطات" }); }
});

// GET /api/fuel-stations/mine — المحطات التي يديرها المستخدم (والإدارة ترى الكل)
router.get("/fuel-stations/mine", async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
  try {
    await ensureFuelDb();
    const stations = u.role === "admin"
      ? await loadStations("", [])
      : await loadStations(`WHERE s.owner_user_id=$1 OR EXISTS (SELECT 1 FROM fuel_station_managers m WHERE m.station_id=s.id AND m.user_id=$1)`, [u.id]);
    return res.json({ stations, fuels: FUELS, services: SERVICES, is_admin: u.role === "admin" });
  } catch (e: any) { logger.error({ err: e?.message }, "fuel-stations mine"); return res.status(500).json({ error: "Server error" }); }
});

function profileFields(b: any) {
  const services = Array.isArray(b?.services) ? b.services.filter((k: string) => k in SERVICES).slice(0, 20) : undefined;
  return {
    kind: b?.kind !== undefined ? (b.kind === "gas_shop" ? "gas_shop" : "station") : undefined,
    name: b?.name !== undefined ? clip(b.name, 150) : undefined,
    brand: b?.brand !== undefined ? clip(b.brand, 100) || null : undefined,
    logo_url: b?.logo_url !== undefined ? httpsUrl(b.logo_url) : undefined,
    cover_url: b?.cover_url !== undefined ? httpsUrl(b.cover_url) : undefined,
    phone: b?.phone !== undefined ? clip(b.phone, 30) || null : undefined,
    whatsapp: b?.whatsapp !== undefined ? clip(b.whatsapp, 30) || null : undefined,
    area: b?.area !== undefined ? clip(b.area, 120) || null : undefined,
    address: b?.address !== undefined ? clip(b.address, 250) || null : undefined,
    hours: b?.hours !== undefined ? clip(b.hours, 120) || null : undefined,
    is_24h: b?.is_24h !== undefined ? !!b.is_24h : undefined,
    notes: b?.notes !== undefined ? clip(b.notes, 1000) || null : undefined,
    lat: b?.lat !== undefined ? (Number.isFinite(Number(b.lat)) ? Number(b.lat) : null) : undefined,
    lng: b?.lng !== undefined ? (Number.isFinite(Number(b.lng)) ? Number(b.lng) : null) : undefined,
    services: services !== undefined ? JSON.stringify(services) : undefined,
  } as Record<string, unknown>;
}

// POST /api/fuel-stations — تسجيل محطة (تنتظر الاعتماد؛ الإدارة تُعتمد فوراً)
router.post("/fuel-stations", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول لتسجيل محطتك" });
  try {
    await ensureFuelDb();
    const f = profileFields(req.body);
    if (!f.name || String(f.name).length < 3) return res.status(400).json({ error: "اسم المحطة مطلوب" });
    if (!f.phone) return res.status(400).json({ error: "رقم هاتف المحطة مطلوب للتواصل" });
    const status = u.role === "admin" ? "approved" : "pending";
    const r = await query(
      `INSERT INTO fuel_stations (name, brand, logo_url, cover_url, phone, whatsapp, area, address, hours, is_24h, notes, lat, lng, services, status, owner_user_id, kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,FALSE),$11,$12,$13,COALESCE($14::jsonb,'[]'::jsonb),$15,$16,$17) RETURNING id`,
      [f.name, f.brand ?? null, f.logo_url ?? null, f.cover_url ?? null, f.phone, f.whatsapp ?? null, f.area ?? null, f.address ?? null,
       f.hours ?? null, f.is_24h ?? null, f.notes ?? null, f.lat ?? null, f.lng ?? null, f.services ?? null, status, u.id, f.kind ?? "station"]);
    const id = r.rows[0].id;
    // محل الغاز يبيع أسطوانات الطبخ فقط
    const fuelKeys = f.kind === "gas_shop" ? ["gas"] : Object.keys(FUELS);
    for (const k of fuelKeys) await query(`INSERT INTO fuel_station_fuels (station_id, fuel) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, k]);
    logger.info({ id, user: u.id, status }, "[fuel] station registered");
    return res.status(201).json({ ok: true, id, status, message: status === "approved" ? "أُضيفت المحطة" : "وصل طلبك — ستظهر المحطة بعد اعتماد الإدارة، ويمكنك تجهيز بياناتها من لوحتها الآن." });
  } catch (e: any) { logger.error({ err: e?.message }, "fuel-stations create"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/fuel-stations/:id — بيانات المحطة (مديرها أو الإدارة)
router.patch("/fuel-stations/:id", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const id = Number(req.params.id);
  if (!(await canManage(u, id))) return res.status(403).json({ error: "لا تملك صلاحية إدارة هذه المحطة" });
  try {
    const f = profileFields(req.body);
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined) continue;
      if (k === "name" && !v) continue;
      vals.push(v); sets.push(`${k}=$${vals.length}${k === "services" ? "::jsonb" : ""}`);
    }
    if (!sets.length) return res.status(400).json({ error: "لا توجد تغييرات" });
    vals.push(id);
    await query(`UPDATE fuel_stations SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${vals.length}`, vals);
    return res.json({ ok: true, station: (await loadStations(`WHERE s.id=$1`, [id]))[0] });
  } catch (e: any) { logger.error({ err: e?.message }, "fuel-stations patch"); return res.status(500).json({ error: "Server error" }); }
});

// PUT /api/fuel-stations/:id/fuels — حالة الوقود والأسعار والزحام
router.put("/fuel-stations/:id/fuels", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const id = Number(req.params.id);
  if (!(await canManage(u, id))) return res.status(403).json({ error: "لا تملك صلاحية إدارة هذه المحطة" });
  try {
    const list = Array.isArray(req.body?.fuels) ? req.body.fuels : [];
    for (const x of list) {
      if (!(x?.fuel in FUELS)) continue;
      await query(
        `INSERT INTO fuel_station_fuels (station_id, fuel, available, price, queue, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (station_id, fuel) DO UPDATE SET available=EXCLUDED.available, price=EXCLUDED.price, queue=EXCLUDED.queue, updated_at=NOW()`,
        [id, x.fuel, !!x.available, num(x.price), QUEUES.includes(x.queue) ? x.queue : "none"]);
    }
    await query(`UPDATE fuel_stations SET updated_at=NOW() WHERE id=$1`, [id]);
    return res.json({ ok: true, station: (await loadStations(`WHERE s.id=$1`, [id]))[0] });
  } catch (e: any) { logger.error({ err: e?.message }, "fuel-stations fuels"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/fuel-stations/:id/report — بلاغ مواطن: متوفر / نفد
router.post("/fuel-stations/:id/report", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول للإبلاغ" });
  try {
    await ensureFuelDb();
    const id = Number(req.params.id);
    const fuel = String(req.body?.fuel || "");
    if (!(fuel in FUELS)) return res.status(400).json({ error: "نوع وقود غير معروف" });
    const recent = await query(`SELECT 1 FROM fuel_station_reports WHERE station_id=$1 AND fuel=$2 AND user_id=$3 AND created_at > NOW() - INTERVAL '30 minutes'`, [id, fuel, u.id]);
    if (recent.rows.length) return res.status(429).json({ error: "أبلغت عن هذه المحطة قبل قليل — شكراً لك" });
    await query(`INSERT INTO fuel_station_reports (station_id, fuel, available, user_id) VALUES ($1,$2,$3,$4)`, [id, fuel, !!req.body?.available, u.id]);
    return res.json({ ok: true, message: "شكراً — بلاغك يساعد السائقين الآخرين" });
  } catch (e: any) { logger.error({ err: e?.message }, "fuel-stations report"); return res.status(500).json({ error: "Server error" }); }
});

// ── الإدارة ──────────────────────────────────────────────
// PATCH /api/admin/fuel-stations/:id/status  { status: approved|suspended|pending }
router.patch("/admin/fuel-stations/:id/status", async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!isStaff(u)) return res.status(403).json({ error: "غير مصرح" });
  const status = String(req.body?.status || "");
  if (!["approved", "suspended", "pending"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
  try {
    await query(`UPDATE fuel_stations SET status=$1, updated_at=NOW() WHERE id=$2`, [status, Number(req.params.id)]);
    return res.json({ ok: true });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

// POST /api/admin/fuel-stations/:id/managers  { phone } — إضافة مدير للمحطة برقم حسابه في التطبيق
router.post("/admin/fuel-stations/:id/managers", async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const id = Number(req.params.id);
  if (!(await canManage(u, id))) return res.status(403).json({ error: "غير مصرح" });
  try {
    const digits = String(req.body?.phone || "").replace(/\D/g, "").slice(-9);
    if (digits.length < 9) return res.status(400).json({ error: "أدخل رقم هاتف صحيحاً" });
    const m = (await query(`SELECT id, name FROM users WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone,''),'[^0-9]','','g'),9)=$1 LIMIT 1`, [digits])).rows[0];
    if (!m) return res.status(404).json({ error: "لا يوجد حساب في التطبيق بهذا الرقم — اطلب منه التسجيل أولاً" });
    await query(`INSERT INTO fuel_station_managers (station_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, m.id]);
    return res.json({ ok: true, manager: m });
  } catch (e: any) { return res.status(500).json({ error: "Server error" }); }
});

export default router;
