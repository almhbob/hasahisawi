// متاجر المجتمع وبوابة التاجر: تسجيل متجر ← مراجعة الإدارة ← تفعيل،
// ثم إدارة الأصناف والمنتجات والطلبات، وواجهة عامة للتسوّق.
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { randomBytes } from "node:crypto";
import { logger } from "../lib/logger";
import { query, dbEnabled, sessionUser, isStaff, normalizeGender, type SessionUser } from "../lib/shared-db";

const router = Router();

export const STORE_TYPES = ["restaurant", "cafe", "boutique", "grocery", "pharmacy", "sweets", "electronics", "general"] as const;
const ORDER_STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"] as const;

let ready: Promise<void> | null = null;
export function ensureStoresDb(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS stores(
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL,
        name VARCHAR(120) NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT 'general',
        description TEXT NOT NULL DEFAULT '',
        logo_url TEXT, cover_url TEXT,
        phone VARCHAR(40) NOT NULL DEFAULT '',
        address VARCHAR(200) NOT NULL DEFAULT '',
        working_hours VARCHAR(80) NOT NULL DEFAULT '',
        delivery_available BOOLEAN NOT NULL DEFAULT FALSE,
        min_order NUMERIC(12,2) NOT NULL DEFAULT 0,
        delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
        women_only BOOLEAN NOT NULL DEFAULT FALSE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        admin_note TEXT,
        reviewed_by INTEGER, reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_stores_owner ON stores(owner_id)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status,type)`);
      await query(`CREATE TABLE IF NOT EXISTS store_categories(
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name VARCHAR(80) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`);
      await query(`CREATE TABLE IF NOT EXISTS store_products(
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES store_categories(id) ON DELETE SET NULL,
        name VARCHAR(120) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        image_url TEXT,
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_store_products_store ON store_products(store_id)`);
      await query(`CREATE TABLE IF NOT EXISTS store_orders(
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        user_id INTEGER,
        customer_name VARCHAR(120) NOT NULL,
        customer_phone VARCHAR(40) NOT NULL,
        customer_address VARCHAR(240) NOT NULL DEFAULT '',
        customer_notes TEXT NOT NULL DEFAULT '',
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
        delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_store_orders_store ON store_orders(store_id,created_at DESC)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_store_orders_user ON store_orders(user_id,created_at DESC)`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//i.test(file.mimetype || "")),
});
const storeFiles = upload.fields([{ name: "logo", maxCount: 1 }, { name: "cover", maxCount: 1 }, { name: "image", maxCount: 1 }]);

function cloudinaryReady() {
  const c = cloudinary.config();
  return !!(c.cloud_name && c.api_key && c.api_secret);
}

async function uploadImage(req: Request, field: string, folder: string): Promise<string | null> {
  const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
  const f = files?.[field]?.[0];
  if (!f || !cloudinaryReady()) return null;
  return new Promise((resolve) => {
    const s = cloudinary.uploader.upload_stream(
      { folder, public_id: `${Date.now()}_${randomBytes(4).toString("hex")}`, resource_type: "image",
        transformation: [{ width: 1200, height: 1200, crop: "limit", quality: "auto", fetch_format: "auto" }] },
      (err, result) => { if (err || !result) { logger.warn({ err }, "[stores] upload failed"); resolve(null); } else resolve(result.secure_url); },
    );
    s.end(f.buffer);
  });
}

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
const bool = (v: unknown) => v === true || v === "true" || v === "1" || v === 1;

function storeRow(r: any) {
  if (!r) return r;
  return { ...r, min_order: Number(r.min_order), delivery_fee: Number(r.delivery_fee), product_count: r.product_count != null ? Number(r.product_count) : undefined };
}
const productRow = (r: any) => ({ ...r, price: Number(r.price) });
const orderRow = (r: any) => ({ ...r, subtotal: Number(r.subtotal), delivery_fee: Number(r.delivery_fee), total: Number(r.total) });

async function pushToUser(userId: number, title: string, body: string, data: Record<string, unknown>) {
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [userId]);
    if (!rows.length) return;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound: "hasahisawi_notif", channelId: "hasahisawi-default", data }))),
    }).finally(() => clearTimeout(t));
  } catch (e: any) { logger.warn({ err: e?.message }, "[stores] push failed"); }
}

async function requireUser(req: Request, res: Response): Promise<SessionUser | null> {
  const u = await sessionUser(req);
  if (!u) { res.status(401).json({ error: "سجّل الدخول أولاً" }); return null; }
  if (u.is_banned) { res.status(403).json({ error: "الحساب موقوف" }); return null; }
  return u;
}

async function myStore(userId: number) {
  const r = await query(`SELECT * FROM stores WHERE owner_id=$1 LIMIT 1`, [userId]);
  return r.rows[0] ?? null;
}

/** Women-only stores are visible only to women and admins. */
function canSeeWomenStore(u: SessionUser | null) {
  return !!u && (u.role === "admin" || normalizeGender(u.gender) === "female");
}

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await ensureStoresDb(); await fn(req, res); }
  catch (e: any) {
    if (e?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "حجم الصورة كبير (الحد 6 ميجا)" });
    logger.error({ err: e?.message }, "[stores]");
    if (!res.headersSent) res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
};

const withFiles = (req: Request, res: Response) => new Promise<void>((resolve, reject) => {
  const ct = String(req.headers["content-type"] || "");
  if (!ct.includes("multipart/form-data")) return resolve();
  storeFiles(req, res, (err: any) => (err ? reject(err) : resolve()));
});

// ── merchant: register / my store ─────────────────────────────────────────────
router.post("/store/register", wrap(async (req, res) => {
  await withFiles(req, res);
  const u = await requireUser(req, res); if (!u) return;
  const b = req.body || {};
  const name = str(b.name, 120);
  if (name.length < 2) return res.status(400).json({ error: "اسم المتجر مطلوب" });
  const type = (STORE_TYPES as readonly string[]).includes(b.type) ? b.type : "general";
  const phone = str(b.phone, 40) || str(u.phone, 40);
  if (!phone) return res.status(400).json({ error: "رقم هاتف المتجر مطلوب" });
  const womenOnly = bool(b.women_only);
  if (womenOnly && u.role !== "admin" && normalizeGender(u.gender) !== "female")
    return res.status(403).json({ error: "المتاجر النسائية تُسجَّل بحسابات النساء فقط" });
  const existing = await myStore(u.id);
  if (existing) return res.status(409).json({ error: existing.status === "rejected" ? "رُفض طلبك السابق — عدّل بيانات متجرك من الإعدادات وسنعيد مراجعته" : "لديك متجر مسجّل بالفعل", store: storeRow(existing) });
  const logo = await uploadImage(req, "logo", `hasahisawi/stores/${u.id}`);
  const r = await query(
    `INSERT INTO stores(owner_id,name,type,description,logo_url,phone,address,working_hours,delivery_available,min_order,delivery_fee,women_only,status)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending') RETURNING *`,
    [u.id, name, type, str(b.description, 1000), logo, phone, str(b.address, 200), str(b.working_hours, 80),
     bool(b.delivery_available), num(b.min_order), num(b.delivery_fee), womenOnly]);
  return res.status(201).json({ ...storeRow(r.rows[0]), owner_name: u.name, store_name: name });
}));

router.get("/store/my", wrap(async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id);
  if (!s) return res.status(404).json({ error: "لا يوجد متجر" });
  return res.json(storeRow(s));
}));

router.put("/store/my", wrap(async (req, res) => {
  await withFiles(req, res);
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id);
  if (!s) return res.status(404).json({ error: "لا يوجد متجر" });
  const b = req.body || {};
  const logo = await uploadImage(req, "logo", `hasahisawi/stores/${u.id}`);
  const cover = await uploadImage(req, "cover", `hasahisawi/stores/${u.id}`);
  const type = (STORE_TYPES as readonly string[]).includes(b.type) ? b.type : s.type;
  const name = str(b.name, 120) || s.name;
  // A rejected store goes back to review after the owner edits it.
  const status = s.status === "rejected" ? "pending" : s.status;
  const r = await query(
    `UPDATE stores SET name=$1,type=$2,description=$3,phone=$4,address=$5,working_hours=$6,delivery_available=$7,
       min_order=$8,delivery_fee=$9,logo_url=COALESCE($10,logo_url),cover_url=COALESCE($11,cover_url),status=$12,updated_at=NOW()
     WHERE id=$13 RETURNING *`,
    [name, type, b.description !== undefined ? str(b.description, 1000) : s.description, str(b.phone, 40) || s.phone,
     b.address !== undefined ? str(b.address, 200) : s.address, b.working_hours !== undefined ? str(b.working_hours, 80) : s.working_hours,
     b.delivery_available !== undefined ? bool(b.delivery_available) : s.delivery_available,
     b.min_order !== undefined ? num(b.min_order) : s.min_order, b.delivery_fee !== undefined ? num(b.delivery_fee) : s.delivery_fee,
     logo, cover, status, s.id]);
  return res.json(storeRow(r.rows[0]));
}));

// ── categories ────────────────────────────────────────────────────────────────
router.get("/store/my/categories", wrap(async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id); if (!s) return res.json([]);
  const r = await query(`SELECT * FROM store_categories WHERE store_id=$1 ORDER BY sort_order, id`, [s.id]);
  return res.json(r.rows);
}));

router.post("/store/my/categories", wrap(async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id); if (!s) return res.status(404).json({ error: "لا يوجد متجر" });
  const name = str(req.body?.name, 80);
  if (!name) return res.status(400).json({ error: "اسم الصنف مطلوب" });
  const c = await query(`SELECT COUNT(*)::int AS n FROM store_categories WHERE store_id=$1`, [s.id]);
  if (c.rows[0].n >= 40) return res.status(400).json({ error: "الحد الأقصى 40 صنفاً" });
  const r = await query(`INSERT INTO store_categories(store_id,name,sort_order) VALUES($1,$2,$3) RETURNING *`, [s.id, name, c.rows[0].n]);
  return res.status(201).json(r.rows[0]);
}));

router.delete("/store/my/categories/:id", wrap(async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id); if (!s) return res.status(404).json({ error: "لا يوجد متجر" });
  const r = await query(`DELETE FROM store_categories WHERE id=$1 AND store_id=$2 RETURNING id`, [Number(req.params.id), s.id]);
  if (!r.rows[0]) return res.status(404).json({ error: "الصنف غير موجود" });
  return res.json({ ok: true });
}));

// ── products ──────────────────────────────────────────────────────────────────
router.get("/store/my/products", wrap(async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id); if (!s) return res.json([]);
  const r = await query(
    `SELECT p.*, c.name AS category_name FROM store_products p LEFT JOIN store_categories c ON c.id=p.category_id
     WHERE p.store_id=$1 ORDER BY p.sort_order, p.id DESC`, [s.id]);
  return res.json(r.rows.map(productRow));
}));

async function validCategory(storeId: number, raw: unknown): Promise<number | null> {
  const id = Number(raw);
  if (!raw || !Number.isInteger(id)) return null;
  const r = await query(`SELECT id FROM store_categories WHERE id=$1 AND store_id=$2`, [id, storeId]);
  return r.rows[0]?.id ?? null;
}

router.post("/store/my/products", wrap(async (req, res) => {
  await withFiles(req, res);
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id); if (!s) return res.status(404).json({ error: "لا يوجد متجر" });
  const b = req.body || {};
  const name = str(b.name, 120);
  if (!name) return res.status(400).json({ error: "اسم المنتج مطلوب" });
  const price = num(b.price);
  if (price <= 0) return res.status(400).json({ error: "السعر غير صالح" });
  const count = await query(`SELECT COUNT(*)::int AS n FROM store_products WHERE store_id=$1`, [s.id]);
  if (count.rows[0].n >= 500) return res.status(400).json({ error: "الحد الأقصى 500 منتج" });
  const image = await uploadImage(req, "image", `hasahisawi/stores/${u.id}/products`);
  const r = await query(
    `INSERT INTO store_products(store_id,category_id,name,description,price,image_url,is_available)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [s.id, await validCategory(s.id, b.category_id), name, str(b.description, 600), price, image, b.is_available === undefined ? true : bool(b.is_available)]);
  return res.status(201).json(productRow(r.rows[0]));
}));

router.put("/store/my/products/:id", wrap(async (req, res) => {
  await withFiles(req, res);
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id); if (!s) return res.status(404).json({ error: "لا يوجد متجر" });
  const cur = await query(`SELECT * FROM store_products WHERE id=$1 AND store_id=$2`, [Number(req.params.id), s.id]);
  const p = cur.rows[0]; if (!p) return res.status(404).json({ error: "المنتج غير موجود" });
  const b = req.body || {};
  const image = await uploadImage(req, "image", `hasahisawi/stores/${u.id}/products`);
  const price = b.price !== undefined ? num(b.price) : Number(p.price);
  if (price <= 0) return res.status(400).json({ error: "السعر غير صالح" });
  const r = await query(
    `UPDATE store_products SET name=$1,description=$2,price=$3,category_id=$4,is_available=$5,image_url=COALESCE($6,image_url)
     WHERE id=$7 RETURNING *`,
    [str(b.name, 120) || p.name, b.description !== undefined ? str(b.description, 600) : p.description, price,
     b.category_id !== undefined ? await validCategory(s.id, b.category_id) : p.category_id,
     b.is_available !== undefined ? bool(b.is_available) : p.is_available, image, p.id]);
  return res.json(productRow(r.rows[0]));
}));

router.delete("/store/my/products/:id", wrap(async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id); if (!s) return res.status(404).json({ error: "لا يوجد متجر" });
  const r = await query(`DELETE FROM store_products WHERE id=$1 AND store_id=$2 RETURNING id`, [Number(req.params.id), s.id]);
  if (!r.rows[0]) return res.status(404).json({ error: "المنتج غير موجود" });
  return res.json({ ok: true });
}));

// ── merchant orders ───────────────────────────────────────────────────────────
router.get("/store/my/orders", wrap(async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id); if (!s) return res.json([]);
  const r = await query(`SELECT * FROM store_orders WHERE store_id=$1 ORDER BY id DESC LIMIT 200`, [s.id]);
  return res.json(r.rows.map(orderRow));
}));

const ORDER_STATUS_AR: Record<string, string> = {
  confirmed: "تم تأكيد طلبك", preparing: "جارٍ تجهيز طلبك", out_for_delivery: "طلبك في الطريق إليك",
  delivered: "تم توصيل طلبك", cancelled: "تم إلغاء طلبك",
};

router.patch("/store/my/orders/:id", wrap(async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const s = await myStore(u.id); if (!s) return res.status(404).json({ error: "لا يوجد متجر" });
  const status = String(req.body?.status || "");
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
  const r = await query(`UPDATE store_orders SET status=$1,updated_at=NOW() WHERE id=$2 AND store_id=$3 RETURNING *`, [status, Number(req.params.id), s.id]);
  const o = r.rows[0]; if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
  if (o.user_id && ORDER_STATUS_AR[status]) await pushToUser(o.user_id, `🛍️ ${s.name}`, `${ORDER_STATUS_AR[status]} #${o.id}`, { type: "store_order_update", order_id: o.id });
  return res.json(orderRow(o));
}));

// ── customer ──────────────────────────────────────────────────────────────────
router.get("/store/my-orders", wrap(async (req, res) => {
  const u = await requireUser(req, res); if (!u) return;
  const r = await query(
    `SELECT o.*, s.name AS store_name, s.logo_url AS store_logo, s.type AS store_type
     FROM store_orders o JOIN stores s ON s.id=o.store_id WHERE o.user_id=$1 ORDER BY o.id DESC LIMIT 100`, [u.id]);
  return res.json(r.rows.map(orderRow));
}));

router.get("/stores", wrap(async (req, res) => {
  const type = String(req.query.type || "");
  const womenOnly = String(req.query.women_only || "") === "true";
  // women_only=true is already gated by the women-corner guard.
  const params: unknown[] = [womenOnly];
  let where = `s.status='active' AND s.women_only=$1`;
  if ((STORE_TYPES as readonly string[]).includes(type)) { params.push(type); where += ` AND s.type=$${params.length}`; }
  const q = String(req.query.q || "").trim();
  if (q) { params.push(`%${q.slice(0, 60)}%`); where += ` AND (s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`; }
  const r = await query(
    `SELECT s.id,s.name,s.type,s.description,s.logo_url,s.cover_url,s.phone,s.address,s.working_hours,s.delivery_available,
            s.min_order,s.delivery_fee,s.status,s.women_only,s.created_at,u.name AS owner_name,
            (SELECT COUNT(*) FROM store_products p WHERE p.store_id=s.id AND p.is_available) AS product_count
     FROM stores s LEFT JOIN users u ON u.id=s.owner_id WHERE ${where} ORDER BY s.id DESC LIMIT 200`, params);
  return res.json(r.rows.map(storeRow));
}));

router.get("/stores/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "المتجر غير موجود" });
  const r = await query(`SELECT s.*, u.name AS owner_name FROM stores s LEFT JOIN users u ON u.id=s.owner_id WHERE s.id=$1 AND s.status='active'`, [id]);
  const s = r.rows[0]; if (!s) return res.status(404).json({ error: "المتجر غير موجود" });
  if (s.women_only && !canSeeWomenStore(await sessionUser(req))) return res.status(403).json({ error: "هذا المتجر خاص بالنساء" });
  const [cats, prods] = await Promise.all([
    query(`SELECT * FROM store_categories WHERE store_id=$1 ORDER BY sort_order,id`, [id]),
    query(`SELECT * FROM store_products WHERE store_id=$1 AND is_available ORDER BY sort_order,id DESC`, [id]),
  ]);
  delete s.owner_id; delete s.admin_note; delete s.reviewed_by;
  return res.json({ store: storeRow(s), categories: cats.rows, products: prods.rows.map(productRow) });
}));

router.post("/stores/:id/orders", wrap(async (req, res) => {
  const id = Number(req.params.id);
  const sr = await query(`SELECT * FROM stores WHERE id=$1 AND status='active'`, [id]);
  const s = sr.rows[0]; if (!s) return res.status(404).json({ error: "المتجر غير متاح" });
  const u = await sessionUser(req);
  if (s.women_only && !canSeeWomenStore(u)) return res.status(403).json({ error: "هذا المتجر خاص بالنساء" });
  const b = req.body || {};
  const name = str(b.customer_name, 120), phone = str(b.customer_phone, 40).replace(/[^\d+]/g, "");
  if (!name || phone.length < 8) return res.status(400).json({ error: "الاسم ورقم الهاتف مطلوبان" });
  const wanted: { id: number; qty: number }[] = (Array.isArray(b.items) ? b.items : [])
    .map((i: any) => ({ id: Number(i?.id), qty: Math.min(99, Math.max(0, Math.floor(Number(i?.qty) || 0))) }))
    .filter((i: any) => Number.isInteger(i.id) && i.qty > 0).slice(0, 60);
  if (!wanted.length) return res.status(400).json({ error: "السلة فارغة" });
  // Prices always come from the database, never from the client.
  const pr = await query(`SELECT id,name,price FROM store_products WHERE store_id=$1 AND is_available AND id = ANY($2::int[])`, [id, wanted.map((w) => w.id)]);
  const byId = new Map(pr.rows.map((p: any) => [p.id, p]));
  const items = wanted.filter((w) => byId.has(w.id)).map((w) => { const p: any = byId.get(w.id); return { id: p.id, name: p.name, price: Number(p.price), qty: w.qty }; });
  if (!items.length) return res.status(400).json({ error: "المنتجات المطلوبة غير متاحة" });
  const subtotal = Math.round(items.reduce((t, i) => t + i.price * i.qty, 0) * 100) / 100;
  if (subtotal < Number(s.min_order)) return res.status(400).json({ error: `الحد الأدنى للطلب ${Number(s.min_order)} ج.س` });
  const address = str(b.customer_address, 240);
  const fee = s.delivery_available && address ? Number(s.delivery_fee) : 0;
  const r = await query(
    `INSERT INTO store_orders(store_id,user_id,customer_name,customer_phone,customer_address,customer_notes,items,subtotal,delivery_fee,total)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, u?.id ?? null, name, phone, address, str(b.customer_notes, 500), JSON.stringify(items), subtotal, fee, subtotal + fee]);
  const o = orderRow(r.rows[0]);
  await pushToUser(s.owner_id, "🛒 طلب جديد في متجرك", `${name} — ${o.total} ج.س`, { type: "store_order", order_id: o.id });
  return res.status(201).json({ ok: true, order: o, id: o.id });
}));

// ── admin review ──────────────────────────────────────────────────────────────
router.get("/admin/stores", wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!isStaff(u)) return res.status(403).json({ error: "غير مصرح" });
  const status = String(req.query.status || "");
  const r = await query(
    `SELECT s.*, u.name AS owner_name, u.phone AS owner_phone,
            (SELECT COUNT(*) FROM store_products p WHERE p.store_id=s.id) AS product_count
     FROM stores s LEFT JOIN users u ON u.id=s.owner_id
     WHERE ($1='' OR s.status=$1) ORDER BY (s.status='pending') DESC, s.id DESC LIMIT 300`, [status]);
  return res.json(r.rows.map(storeRow));
}));

router.patch("/admin/stores/:id", wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!isStaff(u)) return res.status(403).json({ error: "غير مصرح" });
  const status = String(req.body?.status || "");
  if (!["pending", "active", "suspended", "rejected"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
  const r = await query(
    `UPDATE stores SET status=$1, admin_note=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW() WHERE id=$4 RETURNING *`,
    [status, str(req.body?.admin_note ?? req.body?.note, 500) || null, u!.id, Number(req.params.id)]);
  const s = r.rows[0]; if (!s) return res.status(404).json({ error: "المتجر غير موجود" });
  const msg = status === "active" ? "تم اعتماد متجرك 🎉 يمكنك الآن إضافة المنتجات واستقبال الطلبات"
    : status === "rejected" ? "لم يُعتمد طلب متجرك — راجع ملاحظة الإدارة في بوابة التاجر"
    : status === "suspended" ? "تم إيقاف متجرك مؤقتاً — تواصل مع الإدارة" : "";
  if (msg) await pushToUser(s.owner_id, `🏪 ${s.name}`, msg, { type: "store_review", store_id: s.id });
  return res.json(storeRow(s));
}));

export default router;
