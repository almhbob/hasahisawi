// ════════════════════════════════════════════════════════════════
// 🍽️ المطاعم والكافتريات — صفحة مطعم، منيو، طلبات العملاء، كاشير، فواتير، تقارير
// ════════════════════════════════════════════════════════════════
// قواعد الأمان: كل تعديل على مطعم أو منتجاته أو فواتيره يتطلب أن يكون الطالب مالكه أو من الإدارة،
// والأسعار تُحسب دائماً من قاعدة البيانات (لا يُوثق بسعر يرسله الجهاز).
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, dbEnabled, type SessionUser } from "../lib/shared-db";

const router = Router();

const TYPES = ["restaurant", "cafe", "bakery", "juice"] as const;
const CATS = ["meals", "drinks", "dessert", "bakery", "offers"] as const;
const ORDER_TYPES = ["delivery", "takeaway", "dine_in"] as const;
const ORDER_FLOW: Record<string, string[]> = {
  new: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered"],
  delivered: [],
  cancelled: [],
};
const STATUS_AR: Record<string, string> = {
  accepted: "تم قبول طلبك", preparing: "طلبك قيد التحضير", ready: "طلبك جاهز", delivered: "تم تسليم طلبك", cancelled: "أُلغي طلبك",
};

let ready: Promise<void> | null = null;
export function initFoodPosDb(): Promise<void> {
  if (!dbEnabled) { logger.warn("initFoodPosDb skipped — no DATABASE_URL"); return Promise.resolve(); }
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS food_businesses(id BIGSERIAL PRIMARY KEY, owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, name VARCHAR(220) NOT NULL, business_type VARCHAR(40) NOT NULL DEFAULT 'restaurant', phone VARCHAR(40), address TEXT, description TEXT, logo_url TEXT, cover_url TEXT, delivery_enabled BOOLEAN DEFAULT TRUE, takeaway_enabled BOOLEAN DEFAULT TRUE, dine_in_enabled BOOLEAN DEFAULT TRUE, status VARCHAR(40) DEFAULT 'approved', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
      for (const col of [
        "whatsapp VARCHAR(40)", "district VARCHAR(120)", "opening_hours VARCHAR(160)",
        "delivery_fee NUMERIC(12,2) DEFAULT 0", "min_order NUMERIC(12,2) DEFAULT 0",
        "accepting_orders BOOLEAN DEFAULT TRUE", "prep_note VARCHAR(160)",
      ]) await query(`ALTER TABLE food_businesses ADD COLUMN IF NOT EXISTS ${col}`);
      await query(`CREATE INDEX IF NOT EXISTS idx_food_businesses_status ON food_businesses(status,business_type,created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_food_businesses_owner ON food_businesses(owner_user_id)`);
      await query(`CREATE TABLE IF NOT EXISTS food_products(id BIGSERIAL PRIMARY KEY, business_id BIGINT REFERENCES food_businesses(id) ON DELETE CASCADE, name VARCHAR(220) NOT NULL, category VARCHAR(80) DEFAULT 'meals', description TEXT, price NUMERIC(12,2) DEFAULT 0, cost NUMERIC(12,2) DEFAULT 0, stock INTEGER, prep_minutes INTEGER DEFAULT 10, is_available BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
      await query(`CREATE INDEX IF NOT EXISTS idx_food_products_business ON food_products(business_id,is_available,category,created_at DESC)`);
      await query(`CREATE TABLE IF NOT EXISTS food_product_images(id BIGSERIAL PRIMARY KEY, product_id BIGINT REFERENCES food_products(id) ON DELETE CASCADE, image_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`);
      await query(`CREATE INDEX IF NOT EXISTS idx_food_product_images_product ON food_product_images(product_id,sort_order,id)`);
      await query(`CREATE TABLE IF NOT EXISTS food_orders(id BIGSERIAL PRIMARY KEY, order_number VARCHAR(60) UNIQUE NOT NULL, business_id BIGINT REFERENCES food_businesses(id) ON DELETE SET NULL, customer_id INTEGER REFERENCES users(id) ON DELETE SET NULL, customer_name VARCHAR(180), customer_phone VARCHAR(60), order_type VARCHAR(40) DEFAULT 'takeaway', status VARCHAR(40) DEFAULT 'new', payment_method VARCHAR(40) DEFAULT 'cash', subtotal NUMERIC(12,2) DEFAULT 0, discount NUMERIC(12,2) DEFAULT 0, tax NUMERIC(12,2) DEFAULT 0, total NUMERIC(12,2) DEFAULT 0, notes TEXT, items JSONB DEFAULT '[]'::jsonb, created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
      for (const col of ["delivery_address TEXT", "delivery_fee NUMERIC(12,2) DEFAULT 0", "source VARCHAR(20) DEFAULT 'app'", "cancel_reason TEXT"])
        await query(`ALTER TABLE food_orders ADD COLUMN IF NOT EXISTS ${col}`);
      await query(`CREATE INDEX IF NOT EXISTS idx_food_orders_business ON food_orders(business_id,status,created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_food_orders_customer ON food_orders(customer_id,created_at DESC)`);
      await query(`CREATE TABLE IF NOT EXISTS food_invoices(id BIGSERIAL PRIMARY KEY, invoice_number VARCHAR(60) UNIQUE NOT NULL, order_id BIGINT REFERENCES food_orders(id) ON DELETE SET NULL, business_id BIGINT REFERENCES food_businesses(id) ON DELETE SET NULL, subtotal NUMERIC(12,2) DEFAULT 0, discount NUMERIC(12,2) DEFAULT 0, tax NUMERIC(12,2) DEFAULT 0, total NUMERIC(12,2) DEFAULT 0, payment_method VARCHAR(40) DEFAULT 'cash', paid_amount NUMERIC(12,2) DEFAULT 0, change_amount NUMERIC(12,2) DEFAULT 0, items JSONB DEFAULT '[]'::jsonb, issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL, issued_at TIMESTAMPTZ DEFAULT NOW())`);
      await query(`CREATE INDEX IF NOT EXISTS idx_food_invoices_business ON food_invoices(business_id,issued_at DESC)`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

// ── helpers ───────────────────────────────────────────────────────
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const money = (v: unknown) => Math.max(0, Math.round(num(v) * 100) / 100);
const str = (v: unknown, max: number) => { const s = v == null ? "" : String(v).trim(); return s ? s.slice(0, max) : null; };
const httpsUrl = (v: unknown) => { const s = str(v, 600); return s && /^https:\/\/\S+$/i.test(s) ? s : null; };
const phone = (v: unknown) => { const s = str(v, 40); return s ? (s.replace(/[^\d+]/g, "").slice(0, 20) || null) : null; };
const no = (p: string) => `${p}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
const idOk = (v: unknown) => /^\d+$/.test(String(v));

const bizRow = (r: any) => r && ({ ...r, delivery_fee: num(r.delivery_fee), min_order: num(r.min_order) });
const productRow = (r: any) => r && ({ ...r, price: num(r.price), cost: num(r.cost), images: Array.isArray(r.images) ? r.images : [] });
const orderRow = (r: any) => r && ({ ...r, subtotal: num(r.subtotal), discount: num(r.discount), tax: num(r.tax), total: num(r.total), delivery_fee: num(r.delivery_fee) });
const invRow = (r: any) => r && ({ ...r, subtotal: num(r.subtotal), discount: num(r.discount), tax: num(r.tax), total: num(r.total), paid_amount: num(r.paid_amount), change_amount: num(r.change_amount) });

async function requireUser(req: Request, res: Response): Promise<SessionUser | null> {
  const u = await sessionUser(req);
  if (!u) { res.status(401).json({ error: "سجّل الدخول أولاً" }); return null; }
  if (u.is_banned) { res.status(403).json({ error: "الحساب موقوف" }); return null; }
  return u;
}

async function loadBiz(id: unknown) {
  if (!idOk(id)) return null;
  const r = await query(`SELECT * FROM food_businesses WHERE id=$1`, [Number(id)]);
  return r.rows[0] ?? null;
}
const canManage = (u: SessionUser | null, b: any) => !!u && !!b && (isStaff(u) || (b.owner_user_id != null && Number(b.owner_user_id) === u.id));

/** يتحقق أن الطالب يدير المطعم، ويُرجع المطعم أو يرسل الخطأ */
async function managedBiz(req: Request, res: Response, id: unknown) {
  const u = await requireUser(req, res); if (!u) return null;
  const b = await loadBiz(id);
  if (!b) { res.status(404).json({ error: "المطعم غير موجود" }); return null; }
  if (!canManage(u, b)) { res.status(403).json({ error: "هذه العملية لصاحب المطعم فقط" }); return null; }
  return { u, b };
}

/** يحسب البنود والأسعار من قاعدة البيانات */
async function priceItems(businessId: number, raw: unknown) {
  const list = (Array.isArray(raw) ? raw : []).slice(0, 60)
    .map((i: any) => ({ id: Number(i?.id ?? i?.product_id), qty: Math.min(99, Math.max(1, Math.round(num(i?.qty, 1)))), note: str(i?.note, 120) }))
    .filter((i) => Number.isInteger(i.id) && i.id > 0);
  if (!list.length) return { items: [], subtotal: 0, missing: [] as number[] };
  const ids = [...new Set(list.map((i) => i.id))];
  const r = await query(`SELECT id, name, price, is_available, stock FROM food_products WHERE business_id=$1 AND id = ANY($2::bigint[])`, [businessId, ids]);
  const byId = new Map(r.rows.map((p: any) => [Number(p.id), p]));
  const missing: number[] = []; const items: any[] = [];
  for (const i of list) {
    const p: any = byId.get(i.id);
    if (!p || !p.is_available) { missing.push(i.id); continue; }
    items.push({ id: i.id, name: p.name, price: num(p.price), qty: i.qty, ...(i.note ? { note: i.note } : {}) });
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  return { items, subtotal, missing };
}

async function pushToUser(userId: number | null | undefined, title: string, body: string, data: Record<string, unknown>) {
  if (!userId) return;
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [userId]);
    if (!rows.length) return;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound: "hasahisawi_notif", channelId: "hasahisawi-default-s2", priority: "high", data }))),
    }).finally(() => clearTimeout(t));
  } catch (e: any) { logger.warn({ err: e?.message }, "[food] push failed"); }
}

function bizFields(b: any) {
  return {
    name: str(b?.name, 220),
    business_type: TYPES.includes(b?.business_type) ? b.business_type : "restaurant",
    phone: phone(b?.phone), whatsapp: phone(b?.whatsapp),
    address: str(b?.address, 300), district: str(b?.district, 120),
    description: str(b?.description, 1500),
    logo_url: httpsUrl(b?.logo_url), cover_url: httpsUrl(b?.cover_url),
    opening_hours: str(b?.opening_hours, 160), prep_note: str(b?.prep_note, 160),
    delivery_enabled: b?.delivery_enabled !== false, takeaway_enabled: b?.takeaway_enabled !== false, dine_in_enabled: b?.dine_in_enabled !== false,
    delivery_fee: money(b?.delivery_fee), min_order: money(b?.min_order),
    accepting_orders: b?.accepting_orders !== false,
  };
}
const BIZ_KEYS = Object.keys(bizFields({})) as (keyof ReturnType<typeof bizFields>)[];

function guard(res: Response) { if (!dbEnabled) { res.status(503).json({ error: "الخدمة غير متاحة حالياً" }); return false; } return true; }

// ── المطاعم ───────────────────────────────────────────────────────
router.get("/food/businesses", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const u = await sessionUser(req);
    const params: unknown[] = []; const where: string[] = [];
    const type = String(req.query.type || "");
    if (TYPES.includes(type as any)) { params.push(type); where.push(`b.business_type=$${params.length}`); }
    const q = str(req.query.q, 60);
    if (q) { params.push(`%${q}%`); where.push(`(b.name ILIKE $${params.length} OR b.description ILIKE $${params.length} OR b.district ILIKE $${params.length})`); }
    if (req.query.mine === "1") {
      if (!u) return res.json({ businesses: [] });
      params.push(u.id); where.push(`b.owner_user_id=$${params.length}`);
    } else if (isStaff(u) && req.query.all === "1") {
      // الإدارة ترى المعلّق كذلك
    } else {
      where.push(`b.status='approved'`);
    }
    const { rows } = await query(
      `SELECT b.*, (SELECT COUNT(*)::int FROM food_products p WHERE p.business_id=b.id AND p.is_available) AS product_count
       FROM food_businesses b ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY (b.status='pending') DESC, b.accepting_orders DESC, b.created_at DESC LIMIT 200`, params);
    return res.json({ businesses: rows.map(bizRow), can_moderate: isStaff(u) });
  } catch (e) { logger.error({ err: e }, "food/businesses GET"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/food/businesses/:id", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const u = await sessionUser(req);
    const b = await loadBiz(req.params.id);
    if (!b) return res.status(404).json({ error: "المطعم غير موجود" });
    const manage = canManage(u, b);
    if (b.status !== "approved" && !manage) return res.status(404).json({ error: "المطعم غير موجود" });
    const p = await query(
      `SELECT p.*, COALESCE(json_agg(i ORDER BY i.sort_order, i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS images
       FROM food_products p LEFT JOIN food_product_images i ON i.product_id=p.id
       WHERE p.business_id=$1 ${manage ? "" : "AND p.is_available"} GROUP BY p.id ORDER BY p.category, p.name LIMIT 400`, [b.id]);
    let pending = 0;
    if (manage) {
      const c = await query(`SELECT COUNT(*)::int AS n FROM food_orders WHERE business_id=$1 AND status IN ('new','accepted','preparing','ready')`, [b.id]);
      pending = c.rows[0]?.n ?? 0;
    }
    return res.json({ business: { ...bizRow(b), is_owner: !!u && Number(b.owner_user_id) === u.id }, products: p.rows.map(productRow), can_manage: manage, can_moderate: isStaff(u), active_orders: pending });
  } catch (e) { logger.error({ err: e }, "food/businesses/:id GET"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/food/businesses", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const u = await requireUser(req, res); if (!u) return;
    const f = bizFields(req.body);
    if (!f.name || f.name.length < 2) return res.status(400).json({ error: "اسم المطعم مطلوب" });
    if (!f.phone && !f.whatsapp) return res.status(400).json({ error: "أضف رقم هاتف أو واتساب للتواصل" });
    if (!isStaff(u)) {
      const c = await query(`SELECT COUNT(*)::int AS n FROM food_businesses WHERE owner_user_id=$1`, [u.id]);
      if ((c.rows[0]?.n ?? 0) >= 3) return res.status(429).json({ error: "وصلت للحد الأقصى من المطاعم المسجّلة باسمك" });
    }
    const status = isStaff(u) ? "approved" : "pending";
    const cols = [...BIZ_KEYS, "owner_user_id", "status"];
    const vals = [...BIZ_KEYS.map((k) => (f as any)[k]), u.id, status];
    const { rows } = await query(`INSERT INTO food_businesses(${cols.join(",")}) VALUES(${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`, vals);
    return res.status(201).json({ business: bizRow(rows[0]), message: status === "approved" ? "تم نشر المطعم" : "تم إرسال المطعم للمراجعة — يظهر للجميع بعد موافقة الإدارة، ويمكنك تجهيز المنيو الآن" });
  } catch (e) { logger.error({ err: e }, "food/businesses POST"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/food/businesses/:id", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const m = await managedBiz(req, res, req.params.id); if (!m) return;
    const merged = bizFields({ ...m.b, ...req.body });
    const sets: string[] = []; const params: unknown[] = [];
    for (const k of BIZ_KEYS) { if (!(k in (req.body || {}))) continue; params.push((merged as any)[k]); sets.push(`${k}=$${params.length}`); }
    if (isStaff(m.u) && ["approved", "pending", "rejected"].includes(req.body?.status)) { params.push(req.body.status); sets.push(`status=$${params.length}`); }
    if (!sets.length) return res.json({ business: bizRow(m.b) });
    if (sets.some((s) => s.startsWith("name=")) && (!merged.name || merged.name.length < 2)) return res.status(400).json({ error: "اسم المطعم مطلوب" });
    params.push(m.b.id);
    const { rows } = await query(`UPDATE food_businesses SET ${sets.join(",")}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`, params);
    if (req.body?.status === "approved" && m.b.status !== "approved")
      pushToUser(m.b.owner_user_id, "تم اعتماد مطعمك 🎉", `${m.b.name} ظاهر الآن لكل مستخدمي حصاحيصاوي`, { type: "food_business", business_id: m.b.id });
    return res.json({ business: bizRow(rows[0]) });
  } catch (e) { logger.error({ err: e }, "food/businesses PATCH"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/food/businesses/:id", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const m = await managedBiz(req, res, req.params.id); if (!m) return;
    await query(`DELETE FROM food_businesses WHERE id=$1`, [m.b.id]);
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "food/businesses DELETE"); return res.status(500).json({ error: "Server error" }); }
});

// ── المنتجات ──────────────────────────────────────────────────────
router.get("/food/products", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const bid = idOk(req.query.business_id) ? Number(req.query.business_id) : null;
    const cat = CATS.includes(String(req.query.category) as any) ? String(req.query.category) : null;
    const q = str(req.query.q, 60);
    const r = await query(
      `SELECT p.*, b.name AS business_name, b.business_type, COALESCE(json_agg(i ORDER BY i.sort_order,i.id) FILTER(WHERE i.id IS NOT NULL),'[]') AS images
       FROM food_products p JOIN food_businesses b ON b.id=p.business_id AND b.status='approved'
       LEFT JOIN food_product_images i ON i.product_id=p.id
       WHERE p.is_available=TRUE AND ($1::bigint IS NULL OR p.business_id=$1) AND ($2::text IS NULL OR p.category=$2) AND ($3::text IS NULL OR p.name ILIKE '%'||$3||'%')
       GROUP BY p.id, b.name, b.business_type ORDER BY p.created_at DESC LIMIT 200`, [bid, cat, q]);
    return res.json({ products: r.rows.map(productRow) });
  } catch (e) { logger.error({ err: e }, "food/products GET"); return res.status(500).json({ error: "Server error" }); }
});

async function saveImages(productId: number, images: unknown) {
  if (!Array.isArray(images)) return;
  await query(`DELETE FROM food_product_images WHERE product_id=$1`, [productId]);
  let i = 0;
  for (const img of images.slice(0, 5)) {
    const url = httpsUrl(typeof img === "string" ? img : (img as any)?.image_url || (img as any)?.url);
    if (url) await query(`INSERT INTO food_product_images(product_id,image_url,sort_order) VALUES($1,$2,$3)`, [productId, url, i++]);
  }
}
async function productWithImages(id: number) {
  const r = await query(`SELECT p.*, COALESCE(json_agg(i ORDER BY i.sort_order,i.id) FILTER(WHERE i.id IS NOT NULL),'[]') AS images FROM food_products p LEFT JOIN food_product_images i ON i.product_id=p.id WHERE p.id=$1 GROUP BY p.id`, [id]);
  return productRow(r.rows[0]);
}

router.post("/food/products", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const m = await managedBiz(req, res, req.body?.business_id); if (!m) return;
    const b = req.body || {};
    const name = str(b.name, 220);
    if (!name || name.length < 2) return res.status(400).json({ error: "اسم المنتج مطلوب" });
    const price = money(b.price);
    if (price <= 0) return res.status(400).json({ error: "أدخل سعراً صحيحاً" });
    const stock = b.stock === null || b.stock === "" || b.stock === undefined ? null : Math.max(0, Math.round(num(b.stock)));
    const r = await query(
      `INSERT INTO food_products(business_id,name,category,description,price,cost,stock,prep_minutes,is_available) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [m.b.id, name, CATS.includes(b.category) ? b.category : "meals", str(b.description, 600) || "", price, money(b.cost), stock,
        Math.min(240, Math.max(1, Math.round(num(b.prep_minutes, 10)))), b.is_available !== false]);
    await saveImages(r.rows[0].id, b.images);
    return res.status(201).json({ product: await productWithImages(r.rows[0].id) });
  } catch (e) { logger.error({ err: e }, "food/products POST"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/food/products/:id", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    if (!idOk(req.params.id)) return res.status(404).json({ error: "المنتج غير موجود" });
    const cur = await query(`SELECT * FROM food_products WHERE id=$1`, [Number(req.params.id)]);
    if (!cur.rows[0]) return res.status(404).json({ error: "المنتج غير موجود" });
    const m = await managedBiz(req, res, cur.rows[0].business_id); if (!m) return;
    const b = req.body || {}; const p = cur.rows[0];
    const name = "name" in b ? str(b.name, 220) : p.name;
    if (!name || name.length < 2) return res.status(400).json({ error: "اسم المنتج مطلوب" });
    const price = "price" in b ? money(b.price) : num(p.price);
    if (price <= 0) return res.status(400).json({ error: "أدخل سعراً صحيحاً" });
    const stock = "stock" in b ? (b.stock === null || b.stock === "" ? null : Math.max(0, Math.round(num(b.stock)))) : p.stock;
    await query(
      `UPDATE food_products SET name=$1, category=$2, description=$3, price=$4, cost=$5, stock=$6, prep_minutes=$7, is_available=$8, updated_at=NOW() WHERE id=$9`,
      [name, "category" in b && CATS.includes(b.category) ? b.category : p.category, "description" in b ? (str(b.description, 600) || "") : p.description,
        price, "cost" in b ? money(b.cost) : p.cost, stock,
        "prep_minutes" in b ? Math.min(240, Math.max(1, Math.round(num(b.prep_minutes, 10)))) : p.prep_minutes,
        typeof b.is_available === "boolean" ? b.is_available : p.is_available, p.id]);
    if ("images" in b) await saveImages(p.id, b.images);
    return res.json({ product: await productWithImages(p.id) });
  } catch (e) { logger.error({ err: e }, "food/products PATCH"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/food/products/:id", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    if (!idOk(req.params.id)) return res.status(404).json({ error: "المنتج غير موجود" });
    const cur = await query(`SELECT business_id FROM food_products WHERE id=$1`, [Number(req.params.id)]);
    if (!cur.rows[0]) return res.status(404).json({ error: "المنتج غير موجود" });
    const m = await managedBiz(req, res, cur.rows[0].business_id); if (!m) return;
    await query(`DELETE FROM food_products WHERE id=$1`, [Number(req.params.id)]);
    return res.json({ ok: true });
  } catch (e) { logger.error({ err: e }, "food/products DELETE"); return res.status(500).json({ error: "Server error" }); }
});

// ── الطلبات ───────────────────────────────────────────────────────
// POST /food/orders — طلب من العميل عبر التطبيق
router.post("/food/orders", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const u = await requireUser(req, res); if (!u) return;
    const b = await loadBiz(req.body?.business_id);
    if (!b || b.status !== "approved") return res.status(404).json({ error: "المطعم غير متاح" });
    if (!b.accepting_orders) return res.status(400).json({ error: "المطعم لا يستقبل طلبات الآن" });
    const type = ORDER_TYPES.includes(req.body?.order_type) ? req.body.order_type : "takeaway";
    if (type === "delivery" && !b.delivery_enabled) return res.status(400).json({ error: "المطعم لا يوفّر التوصيل" });
    if (type === "takeaway" && !b.takeaway_enabled) return res.status(400).json({ error: "المطعم لا يوفّر الاستلام" });
    if (type === "dine_in" && !b.dine_in_enabled) return res.status(400).json({ error: "المطعم لا يوفّر الطلب داخل المحل" });
    const { items, subtotal, missing } = await priceItems(b.id, req.body?.items);
    if (!items.length) return res.status(400).json({ error: "السلة فارغة أو المنتجات لم تعد متاحة" });
    if (missing.length) return res.status(409).json({ error: "بعض المنتجات لم تعد متاحة — حدّث السلة", missing });
    if (subtotal < num(b.min_order)) return res.status(400).json({ error: `الحد الأدنى للطلب ${num(b.min_order).toLocaleString("en-US")} ج.س` });
    const customerPhone = phone(req.body?.customer_phone) || u.phone;
    if (!customerPhone) return res.status(400).json({ error: "أدخل رقم هاتف ليتواصل معك المطعم" });
    const address = str(req.body?.delivery_address, 300);
    if (type === "delivery" && !address) return res.status(400).json({ error: "أدخل عنوان التوصيل" });
    const fee = type === "delivery" ? num(b.delivery_fee) : 0;
    const total = subtotal + fee;
    const { rows } = await query(
      `INSERT INTO food_orders(order_number,business_id,customer_id,customer_name,customer_phone,order_type,status,payment_method,subtotal,discount,tax,total,notes,items,created_by,delivery_address,delivery_fee,source)
       VALUES($1,$2,$3,$4,$5,$6,'new','cash',$7,0,0,$8,$9,$10,$3,$11,$12,'app') RETURNING *`,
      [no("ORD"), b.id, u.id, str(req.body?.customer_name, 180) || u.name, customerPhone, type, subtotal, total,
        str(req.body?.notes, 500), JSON.stringify(items), address, fee]);
    const typeAr = type === "delivery" ? "توصيل" : type === "dine_in" ? "داخل المحل" : "استلام";
    pushToUser(b.owner_user_id, "طلب جديد 🔔", `${items.length} صنف · ${total.toLocaleString("en-US")} ج.س · ${typeAr}`, { type: "food_order", business_id: b.id, order_id: rows[0].id });
    return res.status(201).json({ order: orderRow(rows[0]), message: "تم إرسال طلبك للمطعم" });
  } catch (e) { logger.error({ err: e }, "food/orders POST"); return res.status(500).json({ error: "Server error" }); }
});

// GET /food/orders?business_id= — طلبات المطعم (للمالك)
router.get("/food/orders", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const m = await managedBiz(req, res, req.query.business_id); if (!m) return;
    const scope = String(req.query.scope || "active");
    const cond = scope === "all" ? "" : scope === "done" ? "AND status IN ('delivered','cancelled')" : "AND status IN ('new','accepted','preparing','ready')";
    const { rows } = await query(`SELECT * FROM food_orders WHERE business_id=$1 AND COALESCE(source,'app')='app' ${cond} ORDER BY (status='new') DESC, created_at DESC LIMIT 150`, [m.b.id]);
    return res.json({ orders: rows.map(orderRow) });
  } catch (e) { logger.error({ err: e }, "food/orders GET"); return res.status(500).json({ error: "Server error" }); }
});

// GET /food/my-orders — طلباتي كعميل
router.get("/food/my-orders", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const u = await requireUser(req, res); if (!u) return;
    const { rows } = await query(
      `SELECT o.*, b.name AS business_name, b.phone AS business_phone, b.whatsapp AS business_whatsapp, b.logo_url AS business_logo
       FROM food_orders o LEFT JOIN food_businesses b ON b.id=o.business_id
       WHERE o.customer_id=$1 AND COALESCE(o.source,'app')='app' ORDER BY o.created_at DESC LIMIT 60`, [u.id]);
    return res.json({ orders: rows.map(orderRow) });
  } catch (e) { logger.error({ err: e }, "food/my-orders"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /food/orders/:id { status } — المالك يحرّك الطلب، والعميل يلغيه ما دام جديداً
router.patch("/food/orders/:id", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const u = await requireUser(req, res); if (!u) return;
    if (!idOk(req.params.id)) return res.status(404).json({ error: "الطلب غير موجود" });
    const cur = await query(`SELECT * FROM food_orders WHERE id=$1`, [Number(req.params.id)]);
    const o = cur.rows[0]; if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
    const b = await loadBiz(o.business_id);
    const next = String(req.body?.status || "");
    const isOwner = canManage(u, b);
    const isCustomer = o.customer_id === u.id;
    if (!isOwner && !(isCustomer && next === "cancelled" && o.status === "new")) return res.status(403).json({ error: "غير مسموح" });
    if (!(ORDER_FLOW[o.status] || []).includes(next)) return res.status(400).json({ error: "لا يمكن نقل الطلب لهذه الحالة" });
    const { rows } = await query(`UPDATE food_orders SET status=$1, cancel_reason=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [next, next === "cancelled" ? (str(req.body?.reason, 200) || (isCustomer && !isOwner ? "ألغاه العميل" : null)) : o.cancel_reason, o.id]);
    if (isOwner && o.customer_id) pushToUser(o.customer_id, STATUS_AR[next] || "تحديث طلبك", `${b?.name || "المطعم"} · طلب ${o.order_number}`, { type: "food_order_status", order_id: o.id });
    if (!isOwner && b) pushToUser(b.owner_user_id, "أُلغي طلب", `ألغى العميل الطلب ${o.order_number}`, { type: "food_order", business_id: b.id, order_id: o.id });
    return res.json({ order: orderRow(rows[0]) });
  } catch (e) { logger.error({ err: e }, "food/orders PATCH"); return res.status(500).json({ error: "Server error" }); }
});

// ── الكاشير والفواتير (المالك فقط) ───────────────────────────────
router.post("/food/invoices", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const m = await managedBiz(req, res, req.body?.business_id); if (!m) return;
    let items: any[]; let subtotal: number; let orderId: number | null = null;
    if (idOk(req.body?.order_id)) {
      const o = await query(`SELECT * FROM food_orders WHERE id=$1 AND business_id=$2`, [Number(req.body.order_id), m.b.id]);
      if (!o.rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
      items = o.rows[0].items; subtotal = num(o.rows[0].subtotal) + num(o.rows[0].delivery_fee); orderId = o.rows[0].id;
    } else {
      const p = await priceItems(m.b.id, req.body?.items);
      if (!p.items.length) return res.status(400).json({ error: "السلة فارغة" });
      if (p.missing.length) return res.status(409).json({ error: "بعض المنتجات غير متاحة", missing: p.missing });
      items = p.items; subtotal = p.subtotal;
    }
    const discount = Math.min(subtotal, money(req.body?.discount));
    const total = subtotal - discount;
    const paid = req.body?.paid_amount == null || req.body?.paid_amount === "" ? total : money(req.body.paid_amount);
    if (paid < total) return res.status(400).json({ error: "المبلغ المدفوع أقل من الإجمالي" });
    const method = ["cash", "bankak", "transfer", "card"].includes(req.body?.payment_method) ? req.body.payment_method : "cash";
    if (!orderId) {
      const type = ORDER_TYPES.includes(req.body?.order_type) ? req.body.order_type : "dine_in";
      const o = await query(
        `INSERT INTO food_orders(order_number,business_id,order_type,status,payment_method,subtotal,discount,tax,total,items,created_by,source) VALUES($1,$2,$3,'delivered',$4,$5,$6,0,$7,$8,$9,'pos') RETURNING id`,
        [no("ORD"), m.b.id, type, method, subtotal, discount, total, JSON.stringify(items), m.u.id]);
      orderId = o.rows[0].id;
    }
    const { rows } = await query(
      `INSERT INTO food_invoices(invoice_number,order_id,business_id,subtotal,discount,tax,total,payment_method,paid_amount,change_amount,items,issued_by) VALUES($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [no("INV"), orderId, m.b.id, subtotal, discount, total, method, paid, paid - total, JSON.stringify(items), m.u.id]);
    // خصم المخزون للمنتجات التي تتابع مخزونها
    for (const it of items) await query(`UPDATE food_products SET stock=GREATEST(0, stock-$1) WHERE id=$2 AND stock IS NOT NULL`, [Number(it.qty) || 1, Number(it.id)]).catch(() => {});
    return res.status(201).json({ invoice: invRow(rows[0]) });
  } catch (e) { logger.error({ err: e }, "food/invoices POST"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/food/invoices", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const m = await managedBiz(req, res, req.query.business_id); if (!m) return;
    const { rows } = await query(`SELECT * FROM food_invoices WHERE business_id=$1 ORDER BY issued_at DESC LIMIT 200`, [m.b.id]);
    return res.json({ invoices: rows.map(invRow) });
  } catch (e) { logger.error({ err: e }, "food/invoices GET"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/food/reports", async (req, res) => {
  if (!guard(res)) return;
  try {
    await initFoodPosDb();
    const m = await managedBiz(req, res, req.query.business_id); if (!m) return;
    const period = ["day", "week", "month", "year"].includes(String(req.query.period)) ? String(req.query.period) : "day";
    const since = period === "year" ? "date_trunc('year', NOW())" : period === "month" ? "date_trunc('month', NOW())" : period === "week" ? "NOW() - interval '7 days'" : "date_trunc('day', NOW())";
    const s = await query(
      `SELECT COUNT(*)::int AS invoice_count, COALESCE(SUM(total),0)::numeric AS sales_total, COALESCE(SUM(discount),0)::numeric AS discount_total, COALESCE(AVG(total),0)::numeric AS avg_ticket
       FROM food_invoices WHERE business_id=$1 AND issued_at >= ${since}`, [m.b.id]);
    const cost = await query(
      `SELECT COALESCE(SUM(p.cost * (item->>'qty')::numeric),0)::numeric AS cost_total
       FROM food_invoices inv, jsonb_array_elements(inv.items) AS item LEFT JOIN food_products p ON p.id=(item->>'id')::bigint
       WHERE inv.business_id=$1 AND inv.issued_at >= ${since}`, [m.b.id]).catch(() => ({ rows: [{ cost_total: 0 }] }));
    const top = await query(
      `SELECT item->>'name' AS name, SUM((item->>'qty')::numeric)::numeric AS qty, SUM((item->>'price')::numeric*(item->>'qty')::numeric)::numeric AS total
       FROM food_invoices, jsonb_array_elements(items) AS item WHERE business_id=$1 AND issued_at >= ${since}
       GROUP BY item->>'name' ORDER BY total DESC LIMIT 10`, [m.b.id]);
    const orders = await query(
      `SELECT status, COUNT(*)::int AS n FROM food_orders WHERE business_id=$1 AND COALESCE(source,'app')='app' AND created_at >= ${since} GROUP BY status`, [m.b.id]);
    const sum = s.rows[0];
    const sales = num(sum.sales_total);
    return res.json({
      period,
      summary: { invoice_count: sum.invoice_count, sales_total: sales, discount_total: num(sum.discount_total), avg_ticket: num(sum.avg_ticket), cost_total: num(cost.rows[0]?.cost_total), profit: sales - num(cost.rows[0]?.cost_total) },
      top_products: top.rows.map((r: any) => ({ name: r.name, qty: num(r.qty), total: num(r.total) })),
      orders_by_status: Object.fromEntries(orders.rows.map((r: any) => [r.status, r.n])),
    });
  } catch (e) { logger.error({ err: e }, "food/reports"); return res.status(500).json({ error: "Server error" }); }
});

export default router;
