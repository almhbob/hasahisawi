import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import { logger } from "../lib/logger";

const router = Router();

const dbUrl = process.env.DATABASE_URL ?? "";
const dbEnabled = dbUrl.length > 0 && !dbUrl.includes(".invalid") && !dbUrl.includes("placeholder") && !dbUrl.includes("nodb");
const pool: Pool | null = dbEnabled ? new Pool({
  connectionString: dbUrl,
  connectionTimeoutMillis: 8_000,
  idleTimeoutMillis: 30_000,
  max: 10,
  allowExitOnIdle: false,
  ssl: dbUrl.includes("sslmode=require") || dbUrl.includes("ssl=true") ? { rejectUnauthorized: false } : false,
}) : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

async function getSessionUser(req: Request): Promise<any | null> {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : String(req.headers["x-user-token"] || "");
  if (!token) return null;
  const { rows } = await query(
    `SELECT u.id,u.name,u.phone,u.email,u.role,u.operator_id
       FROM user_sessions s
       JOIN users u ON u.id=s.user_id
      WHERE s.token=$1 AND s.expires_at>NOW() AND COALESCE(u.is_banned,FALSE)=FALSE
      LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
}

async function requireAdmin(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user || !["admin", "moderator", "transport_supervisor"].includes(user.role)) {
    res.status(403).json({ error: "غير مصرح" });
    return null;
  }
  return user;
}

export async function initStabilizationDb(): Promise<void> {
  if (!pool) {
    logger.warn("initStabilizationDb skipped — DATABASE_URL is not configured");
    return;
  }

  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ`);
  await query(`ALTER TABLE transport_trips ADD COLUMN IF NOT EXISTS assigned_by INTEGER`);
  await query(`CREATE INDEX IF NOT EXISTS idx_transport_trips_pending_fast ON transport_trips(status, vehicle_preference, from_zone, created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS join_application_archives (
      id BIGSERIAL PRIMARY KEY,
      snapshot_id VARCHAR(80) UNIQUE NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_name VARCHAR(160),
      total_count INTEGER NOT NULL DEFAULT 0,
      pending_count INTEGER NOT NULL DEFAULT 0,
      source_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
      payload JSONB NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_join_archive_created ON join_application_archives(created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS post_media (
      id BIGSERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES social_posts(id) ON DELETE CASCADE,
      media_url TEXT NOT NULL,
      media_type VARCHAR(20) NOT NULL DEFAULT 'image',
      sort_order INTEGER NOT NULL DEFAULT 0,
      width INTEGER,
      height INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id, sort_order, id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS merchant_products (
      id BIGSERIAL PRIMARY KEY,
      merchant_id INTEGER REFERENCES merchant_spaces(id) ON DELETE CASCADE,
      name VARCHAR(220) NOT NULL,
      category VARCHAR(80) NOT NULL DEFAULT 'general',
      description TEXT,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      old_price NUMERIC(12,2),
      stock INTEGER NOT NULL DEFAULT 0,
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_merchant_products_active ON merchant_products(merchant_id, is_available, created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS merchant_product_images (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT REFERENCES merchant_products(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_product_images_product ON merchant_product_images(product_id, sort_order, id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS marketplace_orders (
      id BIGSERIAL PRIMARY KEY,
      order_number VARCHAR(40) UNIQUE NOT NULL,
      merchant_id INTEGER REFERENCES merchant_spaces(id) ON DELETE SET NULL,
      customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_name VARCHAR(160),
      customer_phone VARCHAR(40),
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_marketplace_orders_merchant ON marketplace_orders(merchant_id, status, created_at DESC)`);
}

router.post("/transport/trips/:id/accept", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const me = await getSessionUser(req).catch(() => null);
    const driverId = Number(req.body?.driver_id ?? req.body?.driverId);
    if (!driverId) return res.status(400).json({ error: "driver_id مطلوب" });

    const driverR = await query(
      `SELECT * FROM transport_drivers WHERE id=$1 AND status='approved' LIMIT 1`,
      [driverId],
    );
    const driver = driverR.rows[0];
    if (!driver) return res.status(404).json({ error: "السائق غير معتمد أو غير موجود" });
    if (driver.user_id && me?.id && Number(driver.user_id) !== Number(me.id) && !["admin", "moderator", "transport_supervisor"].includes(me.role)) {
      return res.status(403).json({ error: "هذا السائق لا يتبع حسابك" });
    }

    const { rows } = await query(
      `UPDATE transport_trips
          SET status='in_progress',
              driver_id=$2,
              driver_name=$3,
              accepted_at=NOW(),
              assigned_by=$4,
              operator_id=COALESCE(operator_id,$5)
        WHERE id=$1 AND status='pending'
        RETURNING *`,
      [req.params.id, driver.id, driver.name, me?.id ?? null, driver.operator_id ?? null],
    );
    if (!rows[0]) return res.status(409).json({ error: "تم قبول الطلب بواسطة سائق آخر أو لم يعد متاحاً" });
    return res.json({ success: true, trip: rows[0] });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

router.get("/transport/driver/:driverId/incoming-trips", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const driverId = Number(req.params.driverId);
    const d = await query(`SELECT * FROM transport_drivers WHERE id=$1 AND status='approved' LIMIT 1`, [driverId]);
    const driver = d.rows[0];
    if (!driver) return res.status(404).json({ error: "السائق غير معتمد" });
    const vehicle = String(driver.vehicle_type || "").toLowerCase();
    const { rows } = await query(
      `SELECT * FROM transport_trips
        WHERE status='pending'
          AND (
            vehicle_preference IS NULL OR vehicle_preference='delivery' OR LOWER(vehicle_preference)=$1
            OR ($1 IN ('سيارة','car') AND vehicle_preference='car')
            OR ($1 IN ('ركشة','rickshaw','tuk_tuk','tuktuk') AND vehicle_preference='rickshaw')
            OR ($1 IN ('دراجة','دراجة نارية','motorcycle') AND vehicle_preference='motorcycle')
          )
          AND ($2::int IS NULL OR from_zone IS NULL OR from_zone=$2)
          AND ($3::int IS NULL OR operator_id IS NULL OR operator_id=$3)
        ORDER BY created_at ASC LIMIT 50`,
      [vehicle, driver.zone_id ?? null, driver.operator_id ?? null],
    );
    return res.json(rows);
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.get("/admin/join-application-archives", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { rows } = await query(
      `SELECT id,snapshot_id,created_by,created_by_name,total_count,pending_count,source_counts,note,created_at
         FROM join_application_archives
        ORDER BY created_at DESC LIMIT 50`,
    );
    return res.json({ archives: rows });
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.get("/admin/join-application-archives/:id", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { rows } = await query(`SELECT * FROM join_application_archives WHERE id=$1 OR snapshot_id=$2 LIMIT 1`, [Number(req.params.id) || 0, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "الأرشيف غير موجود" });
    return res.json(rows[0]);
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.post("/admin/join-application-archives", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const records = Array.isArray(req.body?.records) ? req.body.records : [];
    const sourceCounts = records.reduce((acc: Record<string, number>, r: any) => {
      const key = String(r.source || "unknown");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const pending = records.filter((r: any) => String(r.status_label || r.status || "").includes("انتظار") || String(r.status_label || "").includes("مراجعة")).length;
    const snapshotId = req.body?.snapshot_id || `archive-${Date.now()}`;
    const { rows } = await query(
      `INSERT INTO join_application_archives
        (snapshot_id,created_by,created_by_name,total_count,pending_count,source_counts,payload,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (snapshot_id) DO UPDATE SET
        total_count=EXCLUDED.total_count,
        pending_count=EXCLUDED.pending_count,
        source_counts=EXCLUDED.source_counts,
        payload=EXCLUDED.payload,
        note=EXCLUDED.note
       RETURNING id,snapshot_id,created_at,total_count,pending_count,source_counts`,
      [snapshotId, admin.id, admin.name, records.length, pending, JSON.stringify(sourceCounts), JSON.stringify({ records }), req.body?.note ?? null],
    );
    return res.status(201).json(rows[0]);
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.get("/social/posts/:postId/media", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const { rows } = await query(`SELECT * FROM post_media WHERE post_id=$1 ORDER BY sort_order,id`, [req.params.postId]);
    return res.json({ media: rows });
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.post("/social/posts/:postId/media", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const media = Array.isArray(req.body?.media) ? req.body.media : [];
    const postId = Number(req.params.postId);
    if (!postId || media.length === 0) return res.status(400).json({ error: "media مطلوب" });
    await query(`DELETE FROM post_media WHERE post_id=$1`, [postId]);
    const inserted = [];
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      if (!item?.url && !item?.media_url) continue;
      const r = await query(
        `INSERT INTO post_media (post_id,media_url,media_type,sort_order,width,height)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [postId, item.url || item.media_url, item.type || item.media_type || "image", Number(item.sort_order ?? i), item.width ?? null, item.height ?? null],
      );
      inserted.push(r.rows[0]);
    }
    return res.status(201).json({ media: inserted });
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.get("/merchant-products", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const merchantId = req.query.merchant_id ? Number(req.query.merchant_id) : null;
    const { rows } = await query(
      `SELECT p.*, COALESCE(json_agg(i ORDER BY i.sort_order,i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS images
         FROM merchant_products p
         LEFT JOIN merchant_product_images i ON i.product_id=p.id
        WHERE p.is_available=TRUE AND ($1::int IS NULL OR p.merchant_id=$1)
        GROUP BY p.id
        ORDER BY p.created_at DESC LIMIT 100`,
      [merchantId],
    );
    return res.json({ products: rows });
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.post("/merchant-products", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const me = await getSessionUser(req).catch(() => null);
    const { merchant_id, name, category, description, price, old_price, stock, images } = req.body;
    if (!merchant_id || !name || Number(price) < 0) return res.status(400).json({ error: "بيانات المنتج ناقصة" });
    const r = await query(
      `INSERT INTO merchant_products (merchant_id,name,category,description,price,old_price,stock,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [merchant_id, name, category || "general", description || "", Number(price || 0), old_price ?? null, Number(stock || 0), me?.id ?? null],
    );
    const product = r.rows[0];
    const imgs = Array.isArray(images) ? images.slice(0, 3) : [];
    for (let i = 0; i < imgs.length; i++) {
      const url = typeof imgs[i] === "string" ? imgs[i] : imgs[i]?.url;
      if (url) await query(`INSERT INTO merchant_product_images (product_id,image_url,sort_order) VALUES ($1,$2,$3)`, [product.id, url, i]);
    }
    return res.status(201).json(product);
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.patch("/merchant-products/:id", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const { name, category, description, price, old_price, stock, is_available } = req.body;
    const { rows } = await query(
      `UPDATE merchant_products SET
        name=COALESCE($1,name), category=COALESCE($2,category), description=COALESCE($3,description),
        price=COALESCE($4,price), old_price=COALESCE($5,old_price), stock=COALESCE($6,stock),
        is_available=COALESCE($7,is_available), updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name ?? null, category ?? null, description ?? null, price ?? null, old_price ?? null, stock ?? null, typeof is_available === "boolean" ? is_available : null, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "المنتج غير موجود" });
    return res.json(rows[0]);
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.post("/marketplace-orders", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const me = await getSessionUser(req).catch(() => null);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "السلة فارغة" });
    const total = Number(req.body?.total || items.reduce((s: number, i: any) => s + Number(i.price || 0) * Number(i.qty || 1), 0));
    const orderNumber = `HSW-${Date.now()}`;
    const { rows } = await query(
      `INSERT INTO marketplace_orders (order_number,merchant_id,customer_id,customer_name,customer_phone,total,items,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [orderNumber, req.body?.merchant_id ?? null, me?.id ?? null, req.body?.customer_name ?? me?.name ?? null, req.body?.customer_phone ?? me?.phone ?? null, total, JSON.stringify(items), req.body?.notes ?? null],
    );
    return res.status(201).json(rows[0]);
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.get("/admin/marketplace-orders", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const { rows } = await query(
      `SELECT o.*, m.shop_name
         FROM marketplace_orders o
         LEFT JOIN merchant_spaces m ON m.id = o.merchant_id
        WHERE ($1::text IS NULL OR o.status = $1)
        ORDER BY o.created_at DESC LIMIT 200`,
      [status],
    );
    return res.json({ orders: rows });
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

router.patch("/admin/marketplace-orders/:id", async (req: Request, res: Response) => {
  try {
    await initStabilizationDb();
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { rows } = await query(
      `UPDATE marketplace_orders SET status=COALESCE($1,status), updated_at=NOW() WHERE id=$2 RETURNING *`,
      [req.body?.status ?? null, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json(rows[0]);
  } catch (e: any) { return res.status(500).json({ error: e?.message || "Server error" }); }
});

export default router;
