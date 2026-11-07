// ════════════════════════════════════════════════════════════════
// 🛍️ طلبات شي إن (Shein) — الشراء من السعودية والتوصيل للحصاحيصا
//  المراحل: بانتظار التحقق من الدفع ← مدفوع وقيد التنفيذ ← تم الشراء بالسعودية
//          ← شُحن إلى السودان ← وصل الحصاحيصا ← تم التسليم   (أو: ملغي)
//  الأدوار: العميل (طلباته فقط) · مدقق الدفع · وكيل السعودية · وكيل الحصاحيصا
//          · الإدارة (والمشرف الممنوح صلاحية «shein»).
//  كل وكيل لا يعدّل إلا الطلبات المسندة إليه، وكل انتقال يرسل إشعاراً للعميل.
//  التكلفة تُحسب في الخادم دائماً (لا يُوثق بأرقام العميل).
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, dbClient, sessionUser, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();

export const SHEIN_STATUSES = [
  "pending_payment_verification", "paid_and_processing", "purchased_saudi",
  "shipped_to_sudan", "received_hasahisa", "delivered", "cancelled",
] as const;
export type SheinStatus = (typeof SHEIN_STATUSES)[number];
export const STATUS_LABEL: Record<SheinStatus, string> = {
  pending_payment_verification: "بانتظار التحقق من الدفع",
  paid_and_processing: "تم تأكيد الدفع — قيد التنفيذ",
  purchased_saudi: "تم الشراء من شي إن بالسعودية",
  shipped_to_sudan: "شُحن إلى السودان",
  received_hasahisa: "وصل إلى الحصاحيصا — جاهز للتسليم",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};
const ROLES = ["verifier", "saudi", "hasahisa"] as const;
type Role = (typeof ROLES)[number];

export type SheinSettings = {
  status: "active" | "coming_soon" | "maintenance";
  note: string;
  sar_to_sdg: number;          // سعر صرف الريال بالجنيه
  proxy_fee_pct: number;       // عمولة الشراء بالنيابة %
  proxy_fee_fixed_sar: number; // رسوم ثابتة لكل طلب
  local_shipping_sar: number;  // الشحن داخل السعودية لكل طلب
  intl_shipping_sar_per_item: number; // الشحن الدولي لكل قطعة
  local_delivery_sdg: number;  // التوصيل داخل الحصاحيصا
  bank_info: string;           // بيانات التحويل (بنكك…)
};
const DEFAULTS: SheinSettings = {
  status: "coming_soon", note: "", sar_to_sdg: 650, proxy_fee_pct: 10, proxy_fee_fixed_sar: 10,
  local_shipping_sar: 15, intl_shipping_sar_per_item: 25, local_delivery_sdg: 3000,
  bank_info: "",
};
const NUM_KEYS = ["sar_to_sdg", "proxy_fee_pct", "proxy_fee_fixed_sar", "local_shipping_sar", "intl_shipping_sar_per_item", "local_delivery_sdg"] as const;

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const httpsUrl = (v: unknown) => (/^https:\/\/\S+$/i.test(String(v ?? "")) ? String(v).slice(0, 800) : null);
const money = (n: number) => Math.round(n * 100) / 100;
const pos = (v: unknown, max = 1_000_000) => {
  const n = Number(String(v ?? "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : NaN;
};

/** رابط منتج من شي إن فقط (بما في ذلك روابط المشاركة المختصرة) */
export function isSheinUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return /(^|\.)shein\.(com|top|co|com\.[a-z]{2}|[a-z]{2})$/.test(h) || /(^|\.)sheinlink\.com$/.test(h) || h === "onelink.shein.com" || /(^|\.)shein\.[a-z.]+$/.test(h);
  } catch { return false; }
}

/** حساب التكلفة — الدالة نفسها يعرضها التطبيق للمعاينة */
export function computeFinancials(basePriceSar: number, qty: number, s: SheinSettings) {
  const base = money(basePriceSar * qty);
  const proxyFee = money(base * (s.proxy_fee_pct / 100) + s.proxy_fee_fixed_sar);
  const localShip = money(s.local_shipping_sar);
  const intlShip = money(s.intl_shipping_sar_per_item * qty);
  const totalSar = money(base + proxyFee + localShip + intlShip);
  const deliverySdg = Math.round(s.local_delivery_sdg);
  const totalSdg = Math.round(totalSar * s.sar_to_sdg + deliverySdg);
  return {
    unit_price_sar: money(basePriceSar), qty, base_price_sar: base,
    proxy_fee_sar: proxyFee, proxy_fee_pct: s.proxy_fee_pct, proxy_fee_fixed_sar: s.proxy_fee_fixed_sar,
    local_shipping_sar: localShip, international_shipping_sar: intlShip,
    local_delivery_sdg: deliverySdg, total_sar: totalSar, sar_to_sdg: s.sar_to_sdg, total_sdg: totalSdg,
  };
}

let ready: Promise<void> | null = null;
export function ensureSheinDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS shein_packages (
      id SERIAL PRIMARY KEY,
      waybill VARCHAR(80), tracking_number VARCHAR(80), carrier VARCHAR(80), note TEXT,
      saudi_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      hasahisa_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'shipped',
      shipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), received_at TIMESTAMPTZ
    )`);
    await query(`CREATE TABLE IF NOT EXISTS shein_orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_url TEXT NOT NULL,
      item_details JSONB NOT NULL DEFAULT '{}'::jsonb,
      financials JSONB NOT NULL DEFAULT '{}'::jsonb,
      delivery JSONB NOT NULL DEFAULT '{}'::jsonb,
      payment_receipt_url TEXT,
      status VARCHAR(40) NOT NULL DEFAULT 'pending_payment_verification'
        CHECK (status IN ('pending_payment_verification','paid_and_processing','purchased_saudi','shipped_to_sudan','received_hasahisa','delivered','cancelled')),
      saudi_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      hasahisa_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      package_id INTEGER REFERENCES shein_packages(id) ON DELETE SET NULL,
      tracking_number VARCHAR(80),
      shein_order_no VARCHAR(80),
      cancel_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS shein_orders_user_idx ON shein_orders(user_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS shein_orders_status_idx ON shein_orders(status)`);
    await query(`CREATE TABLE IF NOT EXISTS shein_order_events (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES shein_orders(id) ON DELETE CASCADE,
      status VARCHAR(40) NOT NULL, note TEXT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS shein_agents (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(12) NOT NULL CHECK (role IN ('verifier','saudi','hasahisa')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, role)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS admin_settings (key VARCHAR(100) PRIMARY KEY, value TEXT)`).catch(() => {});
  })().catch(e => { ready = null; throw e; }));
}

export async function getSettings(): Promise<SheinSettings> {
  const s: SheinSettings = { ...DEFAULTS };
  try {
    const { rows } = await query(`SELECT key, value FROM admin_settings WHERE key LIKE 'shein\\_%'`);
    for (const r of rows as any[]) {
      const k = String(r.key).slice(6) as keyof SheinSettings;
      if (k === "status" && ["active", "coming_soon", "maintenance"].includes(r.value)) s.status = r.value;
      else if (k === "note" || k === "bank_info") s[k] = String(r.value ?? "");
      else if ((NUM_KEYS as readonly string[]).includes(k)) { const n = Number(r.value); if (Number.isFinite(n) && n >= 0) (s as any)[k] = n; }
    }
  } catch { /* defaults */ }
  return s;
}

// ── الصلاحيات ─────────────────────────────────────────────
async function rolesOf(u: SessionUser | null): Promise<Role[]> {
  if (!u) return [];
  const { rows } = await query(`SELECT role FROM shein_agents WHERE user_id=$1 AND active`, [u.id]);
  return rows.map((r: any) => r.role);
}
/** المدير، أو المشرف الممنوح قسم «shein» */
async function isSheinAdmin(u: SessionUser | null): Promise<boolean> {
  if (!u) return false;
  if (u.role === "admin") return true;
  if (u.role !== "moderator") return false;
  const r = await query(`SELECT 1 FROM moderator_permissions WHERE user_id=$1 AND section='shein' LIMIT 1`, [u.id]).catch(() => ({ rows: [] as any[] }));
  return r.rows.length > 0;
}
async function access(req: Request) {
  const u = await sessionUser(req);
  const [roles, admin] = await Promise.all([rolesOf(u), isSheinAdmin(u)]);
  return { u, roles, admin, has: (r: Role) => admin || roles.includes(r) };
}

// ── الإشعارات ─────────────────────────────────────────────
async function notify(userIds: (number | null | undefined)[], title: string, body: string, data: Record<string, unknown>) {
  const ids = [...new Set(userIds.filter((x): x is number => typeof x === "number"))];
  if (!ids.length) return;
  const payload = { ...data, screen: "shein-order" };
  try {
    await query(`INSERT INTO notifications (user_id, type, title, body, data)
                 SELECT u, 'shein', $2, $3, $4 FROM UNNEST($1::int[]) AS u`, [ids, title, body, JSON.stringify(payload)]);
  } catch { /* مخطط الإشعارات قد يختلف — لا نعطّل العملية */ }
  try {
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [ids]);
    for (let i = 0; i < rows.length; i += 90) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(4000),
        body: JSON.stringify(rows.slice(i, i + 90).map((r: any) => ({ to: r.token, title, body, sound: "default", priority: "high", channelId: "hasahisawi-default", data: payload }))),
      }).catch(() => {});
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[shein] push"); }
}
async function agentIds(role: Role): Promise<number[]> {
  const { rows } = await query(`SELECT user_id FROM shein_agents WHERE role=$1 AND active`, [role]);
  return rows.map((r: any) => r.user_id);
}
const notifyOwner = (o: any, extra = "") =>
  notify([o.user_id], `طلب شي إن #${o.id}`, `${STATUS_LABEL[o.status as SheinStatus]}${extra ? ` — ${extra}` : ""}`, { order_id: o.id, status: o.status });

/** نقل الحالة مع التحقق من المرحلة السابقة + سجل + إشعار */
async function transition(orderId: number, from: SheinStatus[], to: SheinStatus, actorId: number, set: Record<string, unknown> = {}, note?: string, guard?: string, guardVal?: unknown) {
  const cols = Object.keys(set);
  const vals: unknown[] = [to, orderId, from, ...cols.map(c => set[c])];
  const sets = cols.map((c, i) => `${c}=$${i + 4}`).join(", ");
  let where = `id=$2 AND status = ANY($3::text[])`;
  if (guard) { vals.push(guardVal); where += ` AND ${guard}=$${vals.length}`; }
  const r = await query(`UPDATE shein_orders SET status=$1, updated_at=NOW()${sets ? ", " + sets : ""} WHERE ${where} RETURNING *`, vals);
  const o = r.rows[0];
  if (!o) return null;
  await query(`INSERT INTO shein_order_events (order_id, status, note, actor_id) VALUES ($1,$2,$3,$4)`, [o.id, to, note ?? null, actorId]);
  notifyOwner(o, note).catch(() => {});
  return o;
}

const ORDER_SELECT = `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone,
  sa.name AS saudi_agent_name, ha.name AS hasahisa_agent_name, p.waybill, p.carrier
  FROM shein_orders o JOIN users u ON u.id=o.user_id
  LEFT JOIN users sa ON sa.id=o.saudi_agent_id LEFT JOIN users ha ON ha.id=o.hasahisa_agent_id
  LEFT JOIN shein_packages p ON p.id=o.package_id`;
/** العميل لا يرى أرقام الوكلاء؛ والوكلاء يرون بيانات التواصل للتسليم */
const forCustomer = (o: any) => { const { customer_phone: _p, verified_by: _v, ...rest } = o; return rest; };

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try { await ensureSheinDb(); await fn(req, res); }
  catch (e: any) { logger.error({ err: e?.message, path: req.path }, "[shein]"); if (!res.headersSent) res.status(500).json({ error: "خطأ في الخادم" }); }
};

// ── عام ───────────────────────────────────────────────────
// GET /api/shein/config — حالة الخدمة وأسعار الحساب (للمعاينة في التطبيق)
router.get("/shein/config", wrap(async (req, res) => {
  const s = await getSettings();
  const a = await access(req).catch(() => ({ roles: [] as Role[], admin: false }));
  return res.json({ settings: s, statuses: STATUS_LABEL, roles: a.roles, is_admin: a.admin });
}));

// ── العميل ────────────────────────────────────────────────
// POST /api/shein/orders
router.post("/shein/orders", writeLimiter, wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
  const s = await getSettings();
  if (s.status !== "active" && !(await isSheinAdmin(u))) {
    return res.status(403).json({ error: s.status === "maintenance" ? "الخدمة قيد الصيانة مؤقتاً" : "الخدمة ستتوفر قريباً" });
  }
  const b = req.body ?? {};
  const url = httpsUrl(b.product_url);
  if (!url || !isSheinUrl(url)) return res.status(400).json({ error: "أدخل رابط منتج صحيحاً من موقع أو تطبيق شي إن" });
  const d = b.item_details ?? {};
  const qty = Math.floor(pos(d.qty, 50));
  if (!qty || qty < 1) return res.status(400).json({ error: "الكمية غير صحيحة (1 إلى 50)" });
  const unit = pos(d.unit_price_sar ?? d.base_price_sar, 100_000);
  if (!unit || unit <= 0) return res.status(400).json({ error: "أدخل سعر القطعة بالريال كما يظهر في شي إن" });
  const receipt = httpsUrl(b.payment_receipt_url);
  if (!receipt) return res.status(400).json({ error: "ارفع صورة إيصال التحويل (مثل لقطة شاشة بنكك)" });
  const dl = b.delivery ?? {};
  const phone = clip(dl.phone || u.phone, 30);
  if (phone.replace(/\D/g, "").length < 9) return res.status(400).json({ error: "أدخل رقم هاتف للتواصل عند التسليم" });
  const item = { title: clip(d.title, 200), size: clip(d.size, 40), color: clip(d.color, 60), qty, notes: clip(d.notes, 600), unit_price_sar: unit, image_url: httpsUrl(d.image_url) };
  const delivery = { name: clip(dl.name || u.name, 120), phone, address: clip(dl.address, 300), lat: Number.isFinite(Number(dl.lat)) ? Number(dl.lat) : null, lng: Number.isFinite(Number(dl.lng)) ? Number(dl.lng) : null };
  const fin = computeFinancials(unit, qty, s);
  const open = await query(`SELECT COUNT(*)::int AS n FROM shein_orders WHERE user_id=$1 AND status='pending_payment_verification'`, [u.id]);
  if (open.rows[0].n >= 10) return res.status(429).json({ error: "لديك طلبات كثيرة بانتظار التحقق — انتظر مراجعتها" });
  const o = (await query(`INSERT INTO shein_orders (user_id, product_url, item_details, financials, delivery, payment_receipt_url)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [u.id, url, JSON.stringify(item), JSON.stringify(fin), JSON.stringify(delivery), receipt])).rows[0];
  await query(`INSERT INTO shein_order_events (order_id, status, actor_id) VALUES ($1,'pending_payment_verification',$2)`, [o.id, u.id]);
  notify(await agentIds("verifier"), "طلب شي إن جديد", `#${o.id} — ${fin.total_sdg.toLocaleString("en")} ج.س بانتظار التحقق من الإيصال`, { order_id: o.id, role: "verifier" }).catch(() => {});
  return res.status(201).json({ order: o, message: "استلمنا طلبك — سيُراجع الإيصال ونبلغك فور التأكيد" });
}));

// GET /api/shein/orders/mine
router.get("/shein/orders/mine", wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
  const { rows } = await query(`${ORDER_SELECT} WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 100`, [u.id]);
  return res.json({ orders: rows.map(forCustomer) });
}));

// GET /api/shein/orders/:id — صاحب الطلب، أو الوكيل المسند، أو المدقق، أو الإدارة
router.get("/shein/orders/:id", wrap(async (req, res) => {
  const a = await access(req);
  if (!a.u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
  const o = (await query(`${ORDER_SELECT} WHERE o.id=$1`, [Number(req.params.id)])).rows[0];
  if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
  const owner = o.user_id === a.u.id;
  const staff = a.has("verifier") || (a.roles.includes("saudi") && (o.saudi_agent_id === a.u.id || o.saudi_agent_id == null))
    || (a.roles.includes("hasahisa") && (o.hasahisa_agent_id === a.u.id || o.status === "shipped_to_sudan"));
  if (!owner && !staff) return res.status(403).json({ error: "غير مصرح" });
  const ev = await query(`SELECT e.status, e.note, e.created_at, u.name AS actor_name FROM shein_order_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.order_id=$1 ORDER BY e.created_at`, [o.id]);
  return res.json({ order: staff ? o : forCustomer(o), events: ev.rows.map((e: any) => (staff ? e : { ...e, actor_name: undefined })) });
}));

// POST /api/shein/orders/:id/cancel — العميل قبل تأكيد الدفع
router.post("/shein/orders/:id/cancel", writeLimiter, wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول أولاً" });
  const o = await transition(Number(req.params.id), ["pending_payment_verification"], "cancelled", u.id, { cancel_reason: "ألغاه العميل" }, "ألغيت الطلب", "user_id", u.id);
  if (!o) return res.status(409).json({ error: "لا يمكن إلغاء الطلب بعد تأكيد الدفع — تواصل مع الدعم" });
  return res.json({ order: o });
}));

// ── مدقق الدفع ────────────────────────────────────────────
// GET /api/shein/verify/queue
router.get("/shein/verify/queue", wrap(async (req, res) => {
  const a = await access(req);
  if (!a.has("verifier")) return res.status(403).json({ error: "هذه اللوحة لمدققي الدفع" });
  const st = String(req.query.status || "pending_payment_verification");
  const { rows } = await query(`${ORDER_SELECT} WHERE o.status=$1 ORDER BY o.created_at ASC LIMIT 200`, [SHEIN_STATUSES.includes(st as any) ? st : "pending_payment_verification"]);
  return res.json({ orders: rows });
}));

// POST /api/shein/orders/:id/verify  { approve, note, saudi_agent_id? }
router.post("/shein/orders/:id/verify", writeLimiter, wrap(async (req, res) => {
  const a = await access(req);
  if (!a.has("verifier") || !a.u) return res.status(403).json({ error: "غير مصرح" });
  const id = Number(req.params.id);
  const note = clip(req.body?.note, 300);
  if (!req.body?.approve) {
    if (!note) return res.status(400).json({ error: "اذكر سبب رفض الإيصال ليعرفه العميل" });
    const o = await transition(id, ["pending_payment_verification"], "cancelled", a.u.id, { cancel_reason: note, verified_by: a.u.id }, `رُفض الإيصال: ${note}`);
    if (!o) return res.status(409).json({ error: "تمت مراجعة هذا الطلب مسبقاً" });
    return res.json({ order: o });
  }
  // إسناد تلقائي لوكيل السعودية الأقل انشغالاً (أو المحدد)
  let agent = Number(req.body?.saudi_agent_id) || null;
  if (agent && !(await query(`SELECT 1 FROM shein_agents WHERE user_id=$1 AND role='saudi' AND active`, [agent])).rows.length) agent = null;
  if (!agent) {
    const r = await query(`SELECT a.user_id FROM shein_agents a LEFT JOIN shein_orders o ON o.saudi_agent_id=a.user_id AND o.status IN ('paid_and_processing','purchased_saudi')
      WHERE a.role='saudi' AND a.active GROUP BY a.user_id ORDER BY COUNT(o.id), a.user_id LIMIT 1`);
    agent = r.rows[0]?.user_id ?? null;
  }
  const o = await transition(id, ["pending_payment_verification"], "paid_and_processing", a.u.id, { verified_by: a.u.id, saudi_agent_id: agent }, note || undefined);
  if (!o) return res.status(409).json({ error: "تمت مراجعة هذا الطلب مسبقاً" });
  notify(agent ? [agent] : await agentIds("saudi"), "طلب شي إن للشراء", `#${o.id} — تم تأكيد الدفع، اشترِ المنتج`, { order_id: o.id, role: "saudi" }).catch(() => {});
  return res.json({ order: o });
}));

// ── وكيل السعودية ─────────────────────────────────────────
// GET /api/shein/saudi/orders — المسندة إليّ + غير المسندة (للاستلام)
router.get("/shein/saudi/orders", wrap(async (req, res) => {
  const a = await access(req);
  if (!a.has("saudi") || !a.u) return res.status(403).json({ error: "هذه اللوحة لوكلاء السعودية" });
  const { rows } = await query(`${ORDER_SELECT} WHERE o.status IN ('paid_and_processing','purchased_saudi')
    AND ($2::boolean OR o.saudi_agent_id=$1 OR o.saudi_agent_id IS NULL) ORDER BY o.status, o.updated_at ASC LIMIT 300`, [a.u.id, a.admin]);
  const pk = await query(`SELECT p.*, COUNT(o.id)::int AS orders FROM shein_packages p LEFT JOIN shein_orders o ON o.package_id=p.id
    WHERE ($2::boolean OR p.saudi_agent_id=$1) GROUP BY p.id ORDER BY p.shipped_at DESC LIMIT 50`, [a.u.id, a.admin]);
  return res.json({ orders: rows, packages: pk.rows });
}));

// POST /api/shein/orders/:id/claim — استلام طلب غير مسند
router.post("/shein/orders/:id/claim", writeLimiter, wrap(async (req, res) => {
  const a = await access(req);
  if (!a.roles.includes("saudi") || !a.u) return res.status(403).json({ error: "غير مصرح" });
  const r = await query(`UPDATE shein_orders SET saudi_agent_id=$1, updated_at=NOW() WHERE id=$2 AND saudi_agent_id IS NULL AND status='paid_and_processing' RETURNING id`, [a.u.id, Number(req.params.id)]);
  if (!r.rows.length) return res.status(409).json({ error: "استلمه وكيل آخر" });
  return res.json({ ok: true });
}));

// POST /api/shein/orders/:id/purchased  { shein_order_no? }
router.post("/shein/orders/:id/purchased", writeLimiter, wrap(async (req, res) => {
  const a = await access(req);
  if (!a.has("saudi") || !a.u) return res.status(403).json({ error: "غير مصرح" });
  const no = clip(req.body?.shein_order_no, 80) || null;
  const o = a.admin
    ? await transition(Number(req.params.id), ["paid_and_processing"], "purchased_saudi", a.u.id, { shein_order_no: no })
    : await transition(Number(req.params.id), ["paid_and_processing"], "purchased_saudi", a.u.id, { shein_order_no: no }, undefined, "saudi_agent_id", a.u.id);
  if (!o) return res.status(409).json({ error: "الطلب ليس مسنداً إليك أو تجاوز هذه المرحلة" });
  return res.json({ order: o });
}));

// POST /api/shein/packages  { order_ids[], waybill, tracking_number, carrier, note }
router.post("/shein/packages", writeLimiter, wrap(async (req, res) => {
  const a = await access(req);
  if (!a.has("saudi") || !a.u) return res.status(403).json({ error: "غير مصرح" });
  const ids = [...new Set((Array.isArray(req.body?.order_ids) ? req.body.order_ids : []).map(Number).filter((n: number) => n > 0))].slice(0, 200) as number[];
  const tracking = clip(req.body?.tracking_number, 80);
  const waybill = clip(req.body?.waybill, 80);
  if (!ids.length) return res.status(400).json({ error: "اختر الطلبات المراد تجميعها في الطرد" });
  if (!tracking && !waybill) return res.status(400).json({ error: "أدخل رقم بوليصة الشحن أو رقم التتبع" });
  const c = await dbClient();
  try {
    await c.query("BEGIN");
    const ok = await c.query(`SELECT id FROM shein_orders WHERE id = ANY($1::int[]) AND status='purchased_saudi' AND package_id IS NULL AND ($2::boolean OR saudi_agent_id=$3) FOR UPDATE`, [ids, a.admin, a.u.id]);
    if (ok.rows.length !== ids.length) { await c.query("ROLLBACK"); return res.status(409).json({ error: "بعض الطلبات ليست مسندة إليك أو لم تُشترَ بعد أو شُحنت مسبقاً" }); }
    const p = (await c.query(`INSERT INTO shein_packages (waybill, tracking_number, carrier, note, saudi_agent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [waybill || null, tracking || waybill, clip(req.body?.carrier, 80) || null, clip(req.body?.note, 300) || null, a.u.id])).rows[0];
    const upd = await c.query(`UPDATE shein_orders SET status='shipped_to_sudan', package_id=$1, tracking_number=$2, updated_at=NOW() WHERE id = ANY($3::int[]) RETURNING *`, [p.id, p.tracking_number, ids]);
    for (const o of upd.rows) await c.query(`INSERT INTO shein_order_events (order_id, status, note, actor_id) VALUES ($1,'shipped_to_sudan',$2,$3)`, [o.id, `رقم التتبع ${p.tracking_number}`, a.u.id]);
    await c.query("COMMIT");
    for (const o of upd.rows) notifyOwner(o, `رقم التتبع ${p.tracking_number}`).catch(() => {});
    notify(await agentIds("hasahisa"), "طرد شي إن في الطريق", `طرد #${p.id} (${upd.rows.length} طلب) — تتبع ${p.tracking_number}`, { package_id: p.id, role: "hasahisa" }).catch(() => {});
    return res.status(201).json({ package: p, orders: upd.rows.length });
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
  finally { c.release(); }
}));

// ── وكيل الحصاحيصا ────────────────────────────────────────
// GET /api/shein/hasahisa/board — طرود قادمة + طلبات بانتظار التسليم لديّ
router.get("/shein/hasahisa/board", wrap(async (req, res) => {
  const a = await access(req);
  if (!a.has("hasahisa") || !a.u) return res.status(403).json({ error: "هذه اللوحة لوكلاء الحصاحيصا" });
  const pk = await query(`SELECT p.*, COUNT(o.id)::int AS orders, sa.name AS saudi_agent_name FROM shein_packages p
    JOIN shein_orders o ON o.package_id=p.id LEFT JOIN users sa ON sa.id=p.saudi_agent_id
    WHERE p.status='shipped' GROUP BY p.id, sa.name ORDER BY p.shipped_at ASC LIMIT 100`);
  const { rows } = await query(`${ORDER_SELECT} WHERE o.status='received_hasahisa' AND ($2::boolean OR o.hasahisa_agent_id=$1) ORDER BY o.updated_at ASC LIMIT 300`, [a.u.id, a.admin]);
  const done = await query(`${ORDER_SELECT} WHERE o.status='delivered' AND ($2::boolean OR o.hasahisa_agent_id=$1) ORDER BY o.updated_at DESC LIMIT 30`, [a.u.id, a.admin]);
  return res.json({ packages: pk.rows, orders: rows, delivered: done.rows });
}));

// POST /api/shein/packages/:id/receive — استلام الطرد في الحصاحيصا (يُسند كل طلباته إليّ)
router.post("/shein/packages/:id/receive", writeLimiter, wrap(async (req, res) => {
  const a = await access(req);
  if (!a.has("hasahisa") || !a.u) return res.status(403).json({ error: "غير مصرح" });
  const pid = Number(req.params.id);
  const p = (await query(`UPDATE shein_packages SET status='received', received_at=NOW(), hasahisa_agent_id=$1 WHERE id=$2 AND status='shipped' RETURNING *`, [a.u.id, pid])).rows[0];
  if (!p) return res.status(409).json({ error: "استُلم الطرد مسبقاً" });
  const upd = await query(`UPDATE shein_orders SET status='received_hasahisa', hasahisa_agent_id=$1, updated_at=NOW() WHERE package_id=$2 AND status='shipped_to_sudan' RETURNING *`, [a.u.id, pid]);
  for (const o of upd.rows) {
    await query(`INSERT INTO shein_order_events (order_id, status, actor_id) VALUES ($1,'received_hasahisa',$2)`, [o.id, a.u.id]);
    notifyOwner(o, "سنتواصل معك للتسليم").catch(() => {});
  }
  return res.json({ package: p, orders: upd.rows.length });
}));

// POST /api/shein/orders/:id/delivered
router.post("/shein/orders/:id/delivered", writeLimiter, wrap(async (req, res) => {
  const a = await access(req);
  if (!a.has("hasahisa") || !a.u) return res.status(403).json({ error: "غير مصرح" });
  const o = a.admin
    ? await transition(Number(req.params.id), ["received_hasahisa"], "delivered", a.u.id, {}, "شكراً لاستخدامك حصاحيصاوي")
    : await transition(Number(req.params.id), ["received_hasahisa"], "delivered", a.u.id, {}, "شكراً لاستخدامك حصاحيصاوي", "hasahisa_agent_id", a.u.id);
  if (!o) return res.status(409).json({ error: "الطلب ليس مسنداً إليك أو سُلّم مسبقاً" });
  return res.json({ order: o });
}));

// ── الإدارة ───────────────────────────────────────────────
// GET /api/admin/shein/overview — كل الطلبات + الإحصاءات + الوكلاء + الإعدادات
router.get("/admin/shein/overview", wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!(await isSheinAdmin(u))) return res.status(403).json({ error: "غير مصرح" });
  const st = String(req.query.status || "");
  const orders = await query(`${ORDER_SELECT} ${SHEIN_STATUSES.includes(st as any) ? "WHERE o.status=$1" : ""} ORDER BY o.created_at DESC LIMIT 200`, SHEIN_STATUSES.includes(st as any) ? [st] : []);
  const counts = await query(`SELECT status, COUNT(*)::int AS n, COALESCE(SUM((financials->>'total_sdg')::numeric),0)::bigint AS sdg FROM shein_orders GROUP BY status`);
  const agents = await query(`SELECT a.user_id, a.role, a.active, u.name, u.phone FROM shein_agents a JOIN users u ON u.id=a.user_id ORDER BY a.role, u.name`);
  return res.json({ orders: orders.rows, counts: counts.rows, agents: agents.rows, settings: await getSettings() });
}));

// PUT /api/admin/shein/settings
router.put("/admin/shein/settings", wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!(await isSheinAdmin(u))) return res.status(403).json({ error: "غير مصرح" });
  const b = req.body ?? {};
  const entries: [string, string][] = [];
  if (b.status !== undefined) {
    if (!["active", "coming_soon", "maintenance"].includes(b.status)) return res.status(400).json({ error: "حالة غير صالحة" });
    entries.push(["status", b.status]);
  }
  if (b.note !== undefined) entries.push(["note", clip(b.note, 300)]);
  if (b.bank_info !== undefined) entries.push(["bank_info", clip(b.bank_info, 600)]);
  for (const k of NUM_KEYS) if (b[k] !== undefined) {
    const n = pos(b[k], 10_000_000);
    if (!Number.isFinite(n)) return res.status(400).json({ error: `قيمة غير صحيحة: ${k}` });
    if (k === "sar_to_sdg" && n <= 0) return res.status(400).json({ error: "سعر الصرف يجب أن يكون أكبر من صفر" });
    entries.push([k, String(n)]);
  }
  for (const [k, v] of entries) await query(`INSERT INTO admin_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`, [`shein_${k}`, v]);
  return res.json({ settings: await getSettings() });
}));

// POST /api/admin/shein/agents  { phone, role }   ·  DELETE /api/admin/shein/agents/:userId/:role
router.post("/admin/shein/agents", wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!(await isSheinAdmin(u))) return res.status(403).json({ error: "غير مصرح" });
  const role = String(req.body?.role || "") as Role;
  if (!ROLES.includes(role)) return res.status(400).json({ error: "الدور غير صالح" });
  const digits = String(req.body?.phone || "").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").slice(-9);
  if (digits.length < 9) return res.status(400).json({ error: "أدخل رقم هاتف صحيحاً" });
  const m = (await query(`SELECT id, name FROM users WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone,''),'[^0-9]','','g'),9)=$1 LIMIT 1`, [digits])).rows[0];
  if (!m) return res.status(404).json({ error: "لا يوجد حساب بهذا الرقم — اطلب منه التسجيل أولاً" });
  await query(`INSERT INTO shein_agents (user_id, role) VALUES ($1,$2) ON CONFLICT (user_id, role) DO UPDATE SET active=TRUE`, [m.id, role]);
  notify([m.id], "تمت إضافتك لفريق شي إن", role === "verifier" ? "يمكنك الآن مراجعة إيصالات الدفع" : role === "saudi" ? "يمكنك الآن تنفيذ الشراء والشحن من السعودية" : "يمكنك الآن استلام الطرود والتسليم في الحصاحيصا", { role }).catch(() => {});
  return res.json({ agent: { user_id: m.id, name: m.name, role } });
}));
router.delete("/admin/shein/agents/:userId/:role", wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!(await isSheinAdmin(u))) return res.status(403).json({ error: "غير مصرح" });
  await query(`DELETE FROM shein_agents WHERE user_id=$1 AND role=$2`, [Number(req.params.userId), String(req.params.role)]);
  return res.json({ ok: true });
}));

// POST /api/admin/shein/orders/:id/cancel  { reason } — إلغاء إداري (قبل التسليم)
router.post("/admin/shein/orders/:id/cancel", wrap(async (req, res) => {
  const u = await sessionUser(req);
  if (!u || !(await isSheinAdmin(u))) return res.status(403).json({ error: "غير مصرح" });
  const reason = clip(req.body?.reason, 300);
  if (!reason) return res.status(400).json({ error: "اذكر سبب الإلغاء" });
  const o = await transition(Number(req.params.id), ["pending_payment_verification", "paid_and_processing", "purchased_saudi"], "cancelled", u.id, { cancel_reason: reason }, reason);
  if (!o) return res.status(409).json({ error: "لا يمكن إلغاء طلب شُحن أو سُلّم" });
  return res.json({ order: o });
}));

export default router;
