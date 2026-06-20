import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import { logger } from "../lib/logger";

const router = Router();
const dbUrl = process.env.DATABASE_URL ?? "";
const pool = dbUrl && !dbUrl.includes(".invalid") && !dbUrl.includes("placeholder") && !dbUrl.includes("nodb")
  ? new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, max: 10, allowExitOnIdle: false, ssl: dbUrl.includes("sslmode=require") || dbUrl.includes("ssl=true") ? { rejectUnauthorized: false } : false })
  : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const c = await pool.connect();
  try { return await c.query(sql, params); } finally { c.release(); }
}
async function me(req: Request) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : String(req.headers["x-user-token"] || "");
  if (!token) return null;
  const r = await query(`SELECT u.* FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>NOW() LIMIT 1`, [token]);
  return r.rows[0] ?? null;
}
function no(n: string) { return `${n}-${Date.now()}-${Math.floor(Math.random()*900+100)}`; }
function totals(items: any[], discount = 0, tax = 0) {
  const subtotal = items.reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 1), 0);
  const total = Math.max(0, subtotal - Number(discount || 0) + Number(tax || 0));
  return { subtotal, discount: Number(discount || 0), tax: Number(tax || 0), total };
}

export async function initFoodPosDb() {
  if (!pool) { logger.warn("initFoodPosDb skipped — no DATABASE_URL"); return; }
  await query(`CREATE TABLE IF NOT EXISTS food_businesses(id BIGSERIAL PRIMARY KEY, owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, name VARCHAR(220) NOT NULL, business_type VARCHAR(40) NOT NULL DEFAULT 'restaurant', phone VARCHAR(40), address TEXT, description TEXT, logo_url TEXT, cover_url TEXT, delivery_enabled BOOLEAN DEFAULT TRUE, takeaway_enabled BOOLEAN DEFAULT TRUE, dine_in_enabled BOOLEAN DEFAULT TRUE, status VARCHAR(40) DEFAULT 'approved', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await query(`CREATE INDEX IF NOT EXISTS idx_food_businesses_status ON food_businesses(status,business_type,created_at DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS food_products(id BIGSERIAL PRIMARY KEY, business_id BIGINT REFERENCES food_businesses(id) ON DELETE CASCADE, name VARCHAR(220) NOT NULL, category VARCHAR(80) DEFAULT 'meals', description TEXT, price NUMERIC(12,2) DEFAULT 0, cost NUMERIC(12,2) DEFAULT 0, stock INTEGER, prep_minutes INTEGER DEFAULT 10, is_available BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await query(`CREATE INDEX IF NOT EXISTS idx_food_products_business ON food_products(business_id,is_available,category,created_at DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS food_product_images(id BIGSERIAL PRIMARY KEY, product_id BIGINT REFERENCES food_products(id) ON DELETE CASCADE, image_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await query(`CREATE INDEX IF NOT EXISTS idx_food_product_images_product ON food_product_images(product_id,sort_order,id)`);
  await query(`CREATE TABLE IF NOT EXISTS food_orders(id BIGSERIAL PRIMARY KEY, order_number VARCHAR(60) UNIQUE NOT NULL, business_id BIGINT REFERENCES food_businesses(id) ON DELETE SET NULL, customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL, customer_name VARCHAR(180), customer_phone VARCHAR(60), order_type VARCHAR(40) DEFAULT 'takeaway', status VARCHAR(40) DEFAULT 'new', payment_method VARCHAR(40) DEFAULT 'cash', subtotal NUMERIC(12,2) DEFAULT 0, discount NUMERIC(12,2) DEFAULT 0, tax NUMERIC(12,2) DEFAULT 0, total NUMERIC(12,2) DEFAULT 0, notes TEXT, items JSONB DEFAULT '[]'::jsonb, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await query(`CREATE INDEX IF NOT EXISTS idx_food_orders_business ON food_orders(business_id,status,created_at DESC)`);
  await query(`CREATE TABLE IF NOT EXISTS food_invoices(id BIGSERIAL PRIMARY KEY, invoice_number VARCHAR(60) UNIQUE NOT NULL, order_id BIGINT REFERENCES food_orders(id) ON DELETE SET NULL, business_id BIGINT REFERENCES food_businesses(id) ON DELETE SET NULL, subtotal NUMERIC(12,2) DEFAULT 0, discount NUMERIC(12,2) DEFAULT 0, tax NUMERIC(12,2) DEFAULT 0, total NUMERIC(12,2) DEFAULT 0, payment_method VARCHAR(40) DEFAULT 'cash', paid_amount NUMERIC(12,2) DEFAULT 0, change_amount NUMERIC(12,2) DEFAULT 0, items JSONB DEFAULT '[]'::jsonb, issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL, issued_at TIMESTAMPTZ DEFAULT NOW())`);
  await query(`CREATE INDEX IF NOT EXISTS idx_food_invoices_business ON food_invoices(business_id,issued_at DESC)`);
}

router.get("/food/businesses", async (req, res) => {
  try { await initFoodPosDb(); const type = req.query.type ? String(req.query.type) : null; const r = await query(`SELECT * FROM food_businesses WHERE status='approved' AND ($1::text IS NULL OR business_type=$1) ORDER BY created_at DESC LIMIT 100`, [type]); res.json({ businesses: r.rows }); }
  catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});
router.post("/food/businesses", async (req, res) => {
  try { await initFoodPosDb(); const u = await me(req).catch(() => null); const b = req.body; if (!b.name) return res.status(400).json({ error: "اسم المؤسسة مطلوب" }); const r = await query(`INSERT INTO food_businesses(owner_user_id,name,business_type,phone,address,description,logo_url,cover_url,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [u?.id ?? null,b.name,b.business_type||"restaurant",b.phone||null,b.address||null,b.description||null,b.logo_url||null,b.cover_url||null,b.status||"pending"]); res.status(201).json(r.rows[0]); }
  catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});
router.get("/food/products", async (req, res) => {
  try { await initFoodPosDb(); const bid = req.query.business_id ? Number(req.query.business_id) : null; const cat = req.query.category ? String(req.query.category) : null; const r = await query(`SELECT p.*,COALESCE(json_agg(i ORDER BY i.sort_order,i.id) FILTER(WHERE i.id IS NOT NULL),'[]') AS images FROM food_products p LEFT JOIN food_product_images i ON i.product_id=p.id WHERE p.is_available=TRUE AND ($1::bigint IS NULL OR p.business_id=$1) AND ($2::text IS NULL OR p.category=$2) GROUP BY p.id ORDER BY p.created_at DESC LIMIT 200`, [bid, cat]); res.json({ products: r.rows }); }
  catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});
router.post("/food/products", async (req, res) => {
  try { await initFoodPosDb(); const b = req.body; if (!b.business_id || !b.name) return res.status(400).json({ error: "بيانات المنتج ناقصة" }); const r = await query(`INSERT INTO food_products(business_id,name,category,description,price,cost,stock,prep_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [b.business_id,b.name,b.category||"meals",b.description||"",Number(b.price||0),Number(b.cost||0),b.stock??null,Number(b.prep_minutes||10)]); const product = r.rows[0]; for (const [i,img] of (Array.isArray(b.images)?b.images.slice(0,5):[]).entries()) { const url = typeof img === "string" ? img : img?.url; if (url) await query(`INSERT INTO food_product_images(product_id,image_url,sort_order) VALUES($1,$2,$3)`, [product.id,url,i]); } res.status(201).json(product); }
  catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});
router.patch("/food/products/:id", async (req, res) => {
  try { await initFoodPosDb(); const b = req.body; const r = await query(`UPDATE food_products SET name=COALESCE($1,name),category=COALESCE($2,category),description=COALESCE($3,description),price=COALESCE($4,price),cost=COALESCE($5,cost),stock=COALESCE($6,stock),prep_minutes=COALESCE($7,prep_minutes),is_available=COALESCE($8,is_available),updated_at=NOW() WHERE id=$9 RETURNING *`, [b.name??null,b.category??null,b.description??null,b.price??null,b.cost??null,b.stock??null,b.prep_minutes??null,typeof b.is_available==="boolean"?b.is_available:null,req.params.id]); if (!r.rows[0]) return res.status(404).json({ error: "المنتج غير موجود" }); res.json(r.rows[0]); }
  catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});
router.post("/food/orders", async (req, res) => {
  try { await initFoodPosDb(); const u = await me(req).catch(() => null); const items = Array.isArray(req.body.items)?req.body.items:[]; if (!items.length) return res.status(400).json({ error: "السلة فارغة" }); const t = totals(items, req.body.discount, req.body.tax); const r = await query(`INSERT INTO food_orders(order_number,business_id,customer_id,customer_name,customer_phone,order_type,status,payment_method,subtotal,discount,tax,total,notes,items,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`, [no("ORD"),req.body.business_id??null,u?.id??null,req.body.customer_name??u?.name??null,req.body.customer_phone??u?.phone??null,req.body.order_type||"takeaway",req.body.status||"new",req.body.payment_method||"cash",t.subtotal,t.discount,t.tax,t.total,req.body.notes??null,JSON.stringify(items),u?.id??null]); res.status(201).json(r.rows[0]); }
  catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});
router.post("/food/invoices", async (req, res) => {
  try { await initFoodPosDb(); const u = await me(req).catch(() => null); const items = Array.isArray(req.body.items)?req.body.items:[]; const t = totals(items, req.body.discount, req.body.tax); const paid = Number(req.body.paid_amount ?? t.total); const r = await query(`INSERT INTO food_invoices(invoice_number,order_id,business_id,subtotal,discount,tax,total,payment_method,paid_amount,change_amount,items,issued_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [no("INV"),req.body.order_id??null,req.body.business_id??null,t.subtotal,t.discount,t.tax,t.total,req.body.payment_method||"cash",paid,Math.max(0,paid-t.total),JSON.stringify(items),u?.id??null]); res.status(201).json(r.rows[0]); }
  catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});
router.get("/food/reports", async (req, res) => {
  try { await initFoodPosDb(); const bid = req.query.business_id ? Number(req.query.business_id) : null; const period = String(req.query.period||"day"); const interval = period === "year" ? "1 year" : period === "month" ? "1 month" : "1 day"; const s = await query(`SELECT COUNT(*)::int AS invoice_count,COALESCE(SUM(total),0)::numeric AS sales_total,COALESCE(SUM(paid_amount),0)::numeric AS paid_total FROM food_invoices WHERE issued_at >= NOW()-($1::text)::interval AND ($2::bigint IS NULL OR business_id=$2)`, [interval,bid]); const top = await query(`SELECT item->>'name' AS name,SUM((item->>'qty')::numeric)::numeric AS qty,SUM((item->>'price')::numeric*(item->>'qty')::numeric)::numeric AS total FROM food_invoices,jsonb_array_elements(items) AS item WHERE issued_at >= NOW()-($1::text)::interval AND ($2::bigint IS NULL OR business_id=$2) GROUP BY item->>'name' ORDER BY total DESC LIMIT 10`, [interval,bid]); res.json({ period, summary: s.rows[0], top_products: top.rows }); }
  catch (e:any) { res.status(500).json({ error: e?.message || "Server error" }); }
});

export default router;
