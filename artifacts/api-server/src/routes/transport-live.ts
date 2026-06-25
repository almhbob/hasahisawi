import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import { logger } from "../lib/logger";

const router = Router();

const _dbUrl = process.env.DATABASE_URL ?? "";
const _dbEnabled =
  _dbUrl.length > 0 &&
  !_dbUrl.includes(".invalid") &&
  !_dbUrl.includes("placeholder") &&
  !_dbUrl.includes("nodb");

const pool: Pool | null = _dbEnabled
  ? new Pool({
      connectionString: _dbUrl,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      max: 10,
      allowExitOnIdle: false,
      ssl: _dbUrl.includes("sslmode=require") || _dbUrl.includes("ssl=true")
        ? { rejectUnauthorized: false }
        : false,
    })
  : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

async function getSessionUser(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return null;
    const tok = auth.slice(7);
    const r = await query(`
      SELECT u.* FROM users u
      JOIN user_sessions s ON s.user_id = u.id
      WHERE s.token = $1 AND s.expires_at > NOW()
      LIMIT 1
    `, [tok]);
    return r.rows[0] ?? null;
  } catch { return null; }
}

function canManageTransport(user: Record<string, unknown> | null) {
  const role = String(user?.role || "");
  return ["admin", "moderator", "transport_supervisor"].includes(role);
}

const CHANNEL_SOUND_MAP: Record<string, string> = {
  "hasahisawi-transport": "hasahisawi_urgent",
  "hasahisawi-urgent": "hasahisawi_urgent",
  "hasahisawi-default": "hasahisawi_notif",
};

function pushSound(channelId: string) {
  return CHANNEL_SOUND_MAP[channelId] ?? "hasahisawi_notif";
}

async function sendExpoPush(tokens: string[], title: string, body: string, data: Record<string, unknown>, channelId = "hasahisawi-transport") {
  const clean = [...new Set(tokens)].filter(t => t?.startsWith("ExponentPushToken["));
  if (!clean.length) return;
  const messages = clean.flatMap(to => [
    {
      to,
      title,
      body,
      data: { ...data, channelId, ring: true, transport_request: true },
      sound: pushSound(channelId),
      channelId,
      priority: "high",
      badge: 1,
    },
    {
      to,
      title: "🔔 طلب مشوار ينتظر القبول",
      body,
      data: { ...data, channelId, ring: true, transport_request: true, reminder: true },
      sound: pushSound(channelId),
      channelId,
      priority: "high",
      badge: 1,
    },
  ]);

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  }).catch((e) => logger.warn({ err: e }, "[transport] expo push failed"));
}

function normalizeVehicle(v?: string) {
  const s = String(v || "").trim();
  if (["car", "سيارة"].includes(s)) return "car";
  if (["rickshaw", "ركشة"].includes(s)) return "rickshaw";
  if (["motorcycle", "دراجة نارية"].includes(s)) return "motorcycle";
  if (["delivery", "توصيل", "توصيل طلب"].includes(s)) return "delivery";
  return s || "car";
}

function vehicleArabic(v?: string) {
  const n = normalizeVehicle(v);
  if (n === "car") return "سيارة";
  if (n === "rickshaw") return "ركشة";
  if (n === "motorcycle") return "دراجة نارية";
  if (n === "delivery") return "توصيل طلب";
  return v || "سيارة";
}

export async function initTransportLiveDb() {
  if (!pool) {
    logger.warn("initTransportLiveDb skipped: DATABASE_URL missing");
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS transport_drivers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      vehicle_type VARCHAR(40) NOT NULL DEFAULT 'car',
      vehicle_desc TEXT NOT NULL DEFAULT '',
      plate VARCHAR(60) NOT NULL DEFAULT '',
      area VARCHAR(120) NOT NULL DEFAULT 'الحصاحيصا',
      zone_id INTEGER,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
      is_online BOOLEAN NOT NULL DEFAULT FALSE,
      total_trips INTEGER NOT NULL DEFAULT 0,
      rating NUMERIC(3,2) NOT NULL DEFAULT 5.0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ
    )
  `);
  await query(`ALTER TABLE transport_drivers ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await query(`ALTER TABLE transport_drivers ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'`);
  await query(`ALTER TABLE transport_drivers ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE transport_drivers ADD COLUMN IF NOT EXISTS zone_id INTEGER`);
  await query(`CREATE INDEX IF NOT EXISTS idx_transport_drivers_online ON transport_drivers(is_online, status, vehicle_type)`);

  await query(`
    CREATE TABLE IF NOT EXISTS transport_trips (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name VARCHAR(120) NOT NULL,
      user_phone VARCHAR(40) NOT NULL,
      trip_type VARCHAR(30) NOT NULL DEFAULT 'ride',
      vehicle_preference VARCHAR(40) NOT NULL DEFAULT 'car',
      from_location TEXT NOT NULL,
      to_location TEXT NOT NULL,
      from_zone INTEGER,
      to_zone INTEGER,
      fare_estimate NUMERIC(12,2),
      notes TEXT NOT NULL DEFAULT '',
      delivery_desc TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
      driver_id INTEGER REFERENCES transport_drivers(id) ON DELETE SET NULL,
      driver_name VARCHAR(120),
      driver_phone VARCHAR(40),
      accepted_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      rating INTEGER,
      rating_note TEXT,
      client_request_id VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS client_request_id VARCHAR(100)`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS driver_phone VARCHAR(40)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_transport_trips_client_req ON transport_trips(client_request_id) WHERE client_request_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_transport_trips_pending ON transport_trips(status, vehicle_preference, created_at)`);

  await query(`INSERT INTO admin_settings(key,value) VALUES('transport_status','available') ON CONFLICT(key) DO NOTHING`);
  await query(`INSERT INTO admin_settings(key,value) VALUES('transport_note','مشوارك علينا متاح الآن') ON CONFLICT(key) DO NOTHING`);
}

async function notifyOnlineDriversOfTrip(trip: Record<string, unknown>) {
  const vehicle = normalizeVehicle(trip.vehicle_preference as string);
  const q = vehicle !== "delivery"
    ? await query(`
        SELECT DISTINCT pt.token
        FROM transport_drivers d
        JOIN push_tokens pt ON pt.user_id = d.user_id
        WHERE d.status='approved'
          AND d.is_online=TRUE
          AND (d.vehicle_type=$1 OR d.vehicle_type=$2)
          AND pt.token LIKE 'ExponentPushToken[%'
      `, [vehicle, vehicleArabic(vehicle)])
    : await query(`
        SELECT DISTINCT pt.token
        FROM transport_drivers d
        JOIN push_tokens pt ON pt.user_id = d.user_id
        WHERE d.status='approved' AND d.is_online=TRUE AND pt.token LIKE 'ExponentPushToken[%'
      `);

  const title = trip.trip_type === "delivery" ? "📦 طلب توصيل جديد" : "🚕 طلب مشوار جديد";
  const body = `${trip.user_name || "عميل"}: ${trip.from_location} ← ${trip.to_location}`;
  await sendExpoPush(q.rows.map(r => r.token), title, body, {
    type: "transport_request",
    screen: "transport",
    tripId: trip.id,
    trip_id: trip.id,
    vehicle,
  }, "hasahisawi-transport");
}

async function notifyTransportAdminsOfTrip(trip: Record<string, unknown>) {
  const q = await query(`
    SELECT DISTINCT pt.token
    FROM push_tokens pt
    JOIN users u ON u.id = pt.user_id
    WHERE u.role IN ('admin','moderator','transport_supervisor')
      AND pt.token LIKE 'ExponentPushToken[%'
  `);
  const title = "🛎️ طلب جديد في مشوارك علينا";
  const body = `${trip.user_name || "عميل"}: ${trip.from_location} ← ${trip.to_location}`;
  await sendExpoPush(q.rows.map(r => r.token), title, body, {
    type: "transport_admin_request",
    screen: "admin-transport",
    tripId: trip.id,
    trip_id: trip.id,
    action: "open_transport_supervisor",
  }, "hasahisawi-transport");
}

router.get("/transport/status", async (_req: Request, res: Response) => {
  try {
    const r = await query(`SELECT key,value FROM admin_settings WHERE key IN ('transport_status','transport_note','transport_enabled')`);
    const map = Object.fromEntries(r.rows.map(row => [row.key, row.value]));
    const status = map.transport_status || (map.transport_enabled === "false" ? "coming_soon" : "available");
    return res.json({ enabled: status === "available", status, note: map.transport_note || "" });
  } catch { return res.json({ enabled: true, status: "available", note: "" }); }
});

router.get("/transport/drivers", async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT id,name,vehicle_type,vehicle_desc,area,zone_id,is_online,total_trips,rating,phone
      FROM transport_drivers
      WHERE status='approved'
      ORDER BY is_online DESC, rating DESC, total_trips DESC, id DESC
    `);
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "transport drivers list error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/transport/drivers/register", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const { name, phone, vehicle_type, vehicle_desc, plate, area } = req.body as Record<string, string>;
    if (!name?.trim() || !phone?.trim() || !vehicle_type?.trim()) return res.status(400).json({ error: "بيانات السائق ناقصة" });
    const { rows } = await query(`
      INSERT INTO transport_drivers (user_id,name,phone,vehicle_type,vehicle_desc,plate,area,status,is_online)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',FALSE)
      RETURNING *
    `, [me?.id || null, name.trim(), phone.trim(), normalizeVehicle(vehicle_type), vehicle_desc || "", plate || "", area || "الحصاحيصا"]);
    return res.status(201).json({ ok: true, application: rows[0], message: "تم إرسال طلب الانضمام كسائق بدون اختبار، وسيتم إشعارك بعد المراجعة." });
  } catch (err) {
    logger.error({ err }, "transport driver register error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/transport/drivers/:id/online", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const online = !!req.body?.is_online;
    const { rows } = await query(`
      UPDATE transport_drivers
      SET is_online=$1
      WHERE id=$2 AND status='approved'
      RETURNING id,name,vehicle_type,vehicle_desc,area,zone_id,is_online,total_trips,rating,phone
    `, [online, id]);
    if (!rows.length) return res.status(404).json({ error: "السائق غير معتمد أو غير موجود" });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "transport driver online error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/transport/trips", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    const b = req.body as Record<string, unknown>;
    const clientId = typeof b.client_request_id === "string" ? b.client_request_id : null;
    if (clientId) {
      const exists = await query(`SELECT * FROM transport_trips WHERE client_request_id=$1 LIMIT 1`, [clientId]);
      if (exists.rows.length) return res.status(200).json(exists.rows[0]);
    }
    if (!b.user_name || !b.user_phone || !b.from_location || !b.to_location) return res.status(400).json({ error: "بيانات الطلب ناقصة" });
    const { rows } = await query(`
      INSERT INTO transport_trips (user_id,user_name,user_phone,trip_type,vehicle_preference,from_location,to_location,from_zone,to_zone,fare_estimate,notes,delivery_desc,client_request_id,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
      RETURNING *
    `, [
      me?.id || null,
      String(b.user_name), String(b.user_phone), String(b.trip_type || "ride"), normalizeVehicle(String(b.vehicle_preference || "car")),
      String(b.from_location), String(b.to_location), b.from_zone || null, b.to_zone || null, b.fare_estimate || null,
      String(b.notes || ""), b.delivery_desc || null, clientId,
    ]);
    notifyOnlineDriversOfTrip(rows[0]).catch((err) => logger.warn({ err }, "transport notify drivers failed"));
    notifyTransportAdminsOfTrip(rows[0]).catch((err) => logger.warn({ err }, "transport notify admins failed"));
    return res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err }, "transport trip create error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/transport/trips", async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || "pending");
    const { rows } = await query(`
      SELECT * FROM transport_trips
      WHERE status=$1
      ORDER BY created_at ASC
      LIMIT 80
    `, [status]);
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "transport trips list error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/transport/driver/:driverId/incoming-trips", async (req: Request, res: Response) => {
  try {
    const driverId = Number(req.params.driverId);
    const d = await query(`SELECT * FROM transport_drivers WHERE id=$1 AND status='approved'`, [driverId]);
    if (!d.rows.length) return res.status(404).json({ error: "السائق غير موجود" });
    const driver = d.rows[0];
    const v = normalizeVehicle(driver.vehicle_type);
    const { rows } = await query(`
      SELECT * FROM transport_trips
      WHERE status='pending'
        AND (vehicle_preference=$1 OR $1='delivery' OR vehicle_preference='delivery')
      ORDER BY created_at ASC
      LIMIT 50
    `, [v]);
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "transport incoming trips error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/transport/trips/:id/accept", async (req: Request, res: Response) => {
  try {
    const tripId = Number(req.params.id);
    const driverId = Number(req.body?.driver_id);
    if (!tripId || !driverId) return res.status(400).json({ error: "بيانات القبول ناقصة" });
    const driverR = await query(`SELECT * FROM transport_drivers WHERE id=$1 AND status='approved'`, [driverId]);
    if (!driverR.rows.length) return res.status(404).json({ error: "السائق غير معتمد" });
    const d = driverR.rows[0];
    const accepted = await query(`
      UPDATE transport_trips
      SET status='in_progress', driver_id=$1, driver_name=$2, driver_phone=$3, accepted_at=NOW()
      WHERE id=$4 AND status='pending' AND driver_id IS NULL
      RETURNING *
    `, [driverId, d.name, d.phone, tripId]);
    if (!accepted.rows.length) return res.status(409).json({ error: "تم قبول الطلب بواسطة سائق آخر" });
    await query(`UPDATE transport_drivers SET is_online=FALSE, total_trips=total_trips+1 WHERE id=$1`, [driverId]);
    return res.json(accepted.rows[0]);
  } catch (err) {
    logger.error({ err }, "transport trip accept error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/transport/trips/:id/assign", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!canManageTransport(me)) return res.status(403).json({ error: "غير مصرح" });
    const tripId = Number(req.params.id);
    const driverId = Number(req.body?.driver_id);
    if (!tripId || !driverId) return res.status(400).json({ error: "اختر السائق أولاً" });
    const driverR = await query(`SELECT * FROM transport_drivers WHERE id=$1 AND status='approved'`, [driverId]);
    if (!driverR.rows.length) return res.status(404).json({ error: "السائق غير معتمد" });
    const d = driverR.rows[0];
    const accepted = await query(`
      UPDATE transport_trips
      SET status='in_progress', driver_id=$1, driver_name=$2, driver_phone=$3, accepted_at=NOW()
      WHERE id=$4 AND status='pending' AND driver_id IS NULL
      RETURNING *
    `, [driverId, d.name, d.phone, tripId]);
    if (!accepted.rows.length) return res.status(409).json({ error: "تم قبول الطلب مسبقاً" });
    await query(`UPDATE transport_drivers SET is_online=FALSE, total_trips=total_trips+1 WHERE id=$1`, [driverId]);
    return res.json(accepted.rows[0]);
  } catch (err) {
    logger.error({ err }, "admin transport assign error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/transport/my-trips", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT * FROM transport_trips WHERE user_id=$1 ORDER BY created_at DESC LIMIT 80`, [me.id]);
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "transport my trips error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/transport/trips/:id/cancel", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(`UPDATE transport_trips SET status='cancelled', cancelled_at=NOW() WHERE id=$1 AND status='pending' RETURNING *`, [id]);
    if (!rows.length) return res.status(409).json({ error: "لا يمكن إلغاء طلب بدأ أو انتهى" });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "transport trip cancel error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/transport/trips/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { rating, rating_note, status } = req.body as Record<string, unknown>;
    const { rows } = await query(`
      UPDATE transport_trips
      SET rating=COALESCE($1,rating), rating_note=COALESCE($2,rating_note), status=COALESCE($3,status), completed_at=CASE WHEN $3='completed' THEN NOW() ELSE completed_at END
      WHERE id=$4
      RETURNING *
    `, [rating || null, rating_note || null, status || null, id]);
    if (!rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "transport trip patch error");
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
