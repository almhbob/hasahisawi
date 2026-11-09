// زواجل — خدمة توصيل الهدايا والرسائل (نُقلت من hasahisawi.ts دون تغيير في السلوك)
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { notifyZawajilManagers } from "./zawajil-admin";
import {
  query, getSessionUser, isAdminRequest, requesterOwnsPhone, sendExpoPushToUser, canZawajilRequest,
  PHONE_LOGIN_MSG, PHONE_MISMATCH_MSG,
} from "./hasahisawi";

const router = Router();

// ══════════════════════════════════════════════════════════════════
// زواجل — خدمة توصيل الهدايا والرسائل
// ══════════════════════════════════════════════════════════════════

async function ensureZawajilTables() {
  await query(`CREATE TABLE IF NOT EXISTS zawajil_products (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    description  TEXT,
    price        NUMERIC(12,2) DEFAULT 0,
    category     VARCHAR(60) DEFAULT 'general',
    image_url    TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS zawajil_orders (
    id                     SERIAL PRIMARY KEY,
    order_number           VARCHAR(30) UNIQUE,
    sender_id              INTEGER,
    sender_name            VARCHAR(100),
    sender_phone           VARCHAR(30),
    sender_anonymous       BOOLEAN DEFAULT FALSE,
    recipient_name         VARCHAR(100) NOT NULL,
    recipient_phone        VARCHAR(30),
    recipient_address      TEXT,
    delivery_location      VARCHAR(20) DEFAULT 'inside_city',
    service_type           VARCHAR(30) NOT NULL,
    occasion_type          VARCHAR(30),
    message_text           TEXT,
    message_by_us          BOOLEAN DEFAULT FALSE,
    voice_presentation     BOOLEAN DEFAULT FALSE,
    gift_type              VARCHAR(20) DEFAULT 'none',
    gift_product_id        INTEGER,
    gift_product_name      VARCHAR(200),
    gift_external_desc     TEXT,
    gift_money_amount      NUMERIC(12,2) DEFAULT 0,
    status                 VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    estimated_cost         NUMERIC(12,2) DEFAULT 0,
    admin_notes            TEXT,
    rejection_reason       TEXT,
    modification_request   TEXT,
    pledge_accepted        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS sender_anonymous BOOLEAN DEFAULT FALSE`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS assigned_zaajil_id INTEGER`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS assigned_zaajil_name VARCHAR(200)`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS assigned_zaajil_phone VARCHAR(50)`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS pickup_time TIMESTAMPTZ`).catch(() => {});
  await query(`ALTER TABLE zawajil_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`).catch(() => {});
  await query(`CREATE TABLE IF NOT EXISTS zawajil_applications (
    id            SERIAL PRIMARY KEY,
    role          VARCHAR(60) NOT NULL,
    gender        VARCHAR(10),
    full_name     VARCHAR(200) NOT NULL,
    phone         VARCHAR(50) NOT NULL,
    age           INTEGER,
    neighborhood  VARCHAR(100),
    experience    TEXT,
    notes         TEXT,
    samples_url   VARCHAR(500),
    status        VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS zawajil_shoubash_guests (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER REFERENCES zawajil_orders(id) ON DELETE CASCADE,
    guest_name  VARCHAR(100),
    guest_phone VARCHAR(30),
    gift_desc   VARCHAR(300),
    gift_amount NUMERIC(12,2) DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`ALTER TABLE zawajil_applications ADD COLUMN IF NOT EXISTS admin_notes TEXT`).catch(() => {});
  await query(`ALTER TABLE zawajil_applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`).catch(() => {});
  await query(`ALTER TABLE sick_leaves ADD COLUMN IF NOT EXISTS admin_notes TEXT`).catch(() => {});
  await query(`ALTER TABLE sick_leaves ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`).catch(() => {});
  await query(`ALTER TABLE hospital_admissions ADD COLUMN IF NOT EXISTS discharge_date TIMESTAMPTZ`).catch(() => {});
}

router.get("/zawajil/products", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    const r = await query(`SELECT * FROM zawajil_products WHERE is_available=TRUE ORDER BY sort_order,name`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/zawajil/orders", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    const { sender_name, sender_phone, sender_anonymous, recipient_name, recipient_phone, recipient_address,
      delivery_location, service_type, occasion_type, message_text, message_by_us,
      voice_presentation, gift_type, gift_product_id, gift_product_name,
      gift_external_desc, gift_money_amount, pledge_accepted } = req.body;
    if (!recipient_name || !service_type) return res.status(400).json({ error: "الاسم ونوع الخدمة مطلوبان" });
    if (!pledge_accepted) return res.status(400).json({ error: "يجب قبول التعهد للمتابعة" });
    const countR = await query(`SELECT COUNT(*) FROM zawajil_orders`);
    const n = parseInt(countR.rows[0].count) + 1;
    const orderNumber = `ZWJ-${new Date().getFullYear()}-${String(n).padStart(4,"0")}`;
    // صاحب الطلب من جلسة الدخول (لإيصال إشعارات حالة الطلب إليه)
    let senderId: number | null = null;
    try { const su = await getSessionUser(req); senderId = su?.id ? Number(su.id) : null; } catch { /* ignore */ }
    const r = await query(`INSERT INTO zawajil_orders
      (order_number,sender_id,sender_name,sender_phone,sender_anonymous,recipient_name,recipient_phone,recipient_address,
       delivery_location,service_type,occasion_type,message_text,message_by_us,voice_presentation,
       gift_type,gift_product_id,gift_product_name,gift_external_desc,gift_money_amount,pledge_accepted)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [orderNumber,senderId,sender_name||null,sender_phone||null,Boolean(sender_anonymous),
       recipient_name,recipient_phone||null,recipient_address||null,delivery_location||"inside_city",
       service_type,occasion_type||null,message_text||null,Boolean(message_by_us),Boolean(voice_presentation),
       gift_type||"none",gift_product_id||null,gift_product_name||null,gift_external_desc||null,
       gift_money_amount||0,true]);
    const SVC: Record<string,string> = { hamasat_itab: "همسات عتاب", nifaj: "نفاج", shoubash: "شوبش", tabrikat: "تبريكات", salamat: "سلامات" };
    await notifyZawajilManagers("💌 طلب زواجل جديد", `${r.rows[0].order_number} · ${SVC[service_type] || service_type} إلى ${recipient_name}`, { order_id: r.rows[0].id });
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/zawajil/apply", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    const { role, gender, full_name, phone, age, neighborhood, experience, notes, samples_url } = req.body;
    if (!role || !full_name?.trim() || !phone?.trim()) {
      return res.status(400).json({ error: "الاسم ورقم الهاتف ونوع الطلب مطلوبة" });
    }
    if (full_name.length > 200 || phone.length > 50) return res.status(400).json({ error: "بيانات غير صالحة" });
    const r = await query(
      `INSERT INTO zawajil_applications(role,gender,full_name,phone,age,neighborhood,experience,notes,samples_url)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [role, gender||null, full_name.trim(), phone.trim(), age ? parseInt(age) : null,
       neighborhood||null, experience||null, notes||null, samples_url||null]
    );
    await notifyZawajilManagers("🙋 طلب انضمام لزواجل", `${full_name.trim()} — ${role}`, { application_id: r.rows[0].id });
    return res.status(201).json({ ok: true, id: r.rows[0].id });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/zawajil/orders/mine", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    // البحث بالاسم (ILIKE) كان يكشف طلبات كل الناس — أُزيل. الهاتف يجب أن يكون هاتف الحساب.
    const { phone } = req.query as Record<string,string>;
    if (!phone) return res.json([]);
    const own = await requesterOwnsPhone(req, phone);
    if (own !== "ok") return res.status(own === "login" ? 401 : 403).json({ error: own === "login" ? PHONE_LOGIN_MSG : PHONE_MISMATCH_MSG });
    const params: unknown[] = [phone];
    const where = "WHERE sender_phone=$1";
    const r = await query(`SELECT * FROM zawajil_orders ${where} ORDER BY created_at DESC LIMIT 50`, params);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/zawajil/shoubash-guests", async (req: Request, res: Response) => {
  try {
    await ensureZawajilTables();
    const { order_id, guest_name, guest_phone, gift_desc, gift_amount } = req.body;
    if (!order_id || !guest_name) return res.status(400).json({ error: "رقم الطلب والاسم مطلوبان" });
    const r = await query(`INSERT INTO zawajil_shoubash_guests(order_id,guest_name,guest_phone,gift_desc,gift_amount) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [order_id,guest_name,guest_phone||null,gift_desc||null,gift_amount||0]);
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/zawajil/orders", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const { status } = req.query as Record<string,string>;
    const params: unknown[] = [];
    let where = "WHERE 1=1";
    if (status && status !== "all") { params.push(status); where += ` AND status=$${params.length}`; }
    const r = await query(`SELECT o.*, (SELECT json_agg(g) FROM zawajil_shoubash_guests g WHERE g.order_id=o.id) AS shoubash_guests FROM zawajil_orders o ${where} ORDER BY o.created_at DESC`, params);
    return res.json({ orders: r.rows });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/zawajil/orders/:id/review", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const { action, admin_notes, rejection_reason, modification_request, estimated_cost } = req.body;
    const MAP: Record<string,string> = { approve:"approved", reject:"rejected", request_modification:"modification_requested" };
    const newStatus = MAP[action];
    if (!newStatus) return res.status(400).json({ error: "action غير صالح" });
    const r = await query(`UPDATE zawajil_orders SET status=$1,admin_notes=COALESCE($2,admin_notes),rejection_reason=COALESCE($3,rejection_reason),modification_request=COALESCE($4,modification_request),estimated_cost=COALESCE($5::numeric,estimated_cost),updated_at=NOW() WHERE id=$6 RETURNING *`,
      [newStatus,admin_notes||null,rejection_reason||null,modification_request||null,estimated_cost!=null?Number(estimated_cost):null,req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: "لم يُعثر" });
    // إشعار تلقائي للمُرسِل
    const order = r.rows[0];
    if (order.sender_id) {
      const NOTIF: Record<string, { title: string; body: (o: any) => string }> = {
        approved:               { title: "✅ تم قبول طلبك!", body: o => `طلب زواجل رقم ${o.order_number} مقبول. التكلفة: ${o.estimated_cost} SDG` },
        rejected:               { title: "❌ طلبك مرفوض", body: o => `طلب رقم ${o.order_number}. السبب: ${o.rejection_reason || "تواصل مع الإدارة"}` },
        modification_requested: { title: "✏️ يحتاج طلبك تعديل", body: o => `طلب رقم ${o.order_number}: ${o.modification_request || "راجع التفاصيل في التطبيق"}` },
      };
      const n = NOTIF[newStatus];
      if (n) {
        await query(`INSERT INTO notifications(user_id,type,title,body,data) VALUES($1,'zawajil',$2,$3,$4)`,
          [order.sender_id, n.title, n.body(order), JSON.stringify({ order_id: order.id, order_number: order.order_number })]).catch(() => {});
        sendExpoPushToUser(order.sender_id, n.title, n.body(order), { screen: "zawajil", order_id: order.id }, "hasahisawi-default").catch(() => {});
      }
    }
    return res.json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/zawajil/orders/:id/status", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const { status, admin_notes } = req.body;
    const VALID = ["pending_review","modification_requested","approved","preparing","sending","completed","rejected","returned"];
    if (!VALID.includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    const r = await query(`UPDATE zawajil_orders SET status=$1,admin_notes=COALESCE($2,admin_notes),updated_at=NOW() WHERE id=$3 RETURNING *`,
      [status,admin_notes||null,req.params.id]);
    // إشعار تلقائي للمُرسِل
    if (r.rows[0]?.sender_id) {
      const order = r.rows[0];
      const MSGS: Record<string,{ title: string; body: string }> = {
        preparing: { title: "📦 جاري تجهيز طلبك!",     body: `طلب رقم ${order.order_number} قيد التجهيز.` },
        sending:   { title: "🚀 طلبك في الطريق إليك!",  body: `طلب رقم ${order.order_number} خرج للتوصيل.` },
        completed: { title: "🎉 تم إيصال طلبك بنجاح!", body: `طلب رقم ${order.order_number} اكتمل. شكراً لثقتك!` },
        returned:  { title: "↩️ طلبك مُعاد",             body: `طلب رقم ${order.order_number} تمت إعادته.` },
      };
      const m = MSGS[status];
      if (m) {
        await query(`INSERT INTO notifications(user_id,type,title,body,data) VALUES($1,'zawajil',$2,$3,$4)`,
          [order.sender_id, m.title, m.body, JSON.stringify({ order_id: order.id, order_number: order.order_number })]).catch(() => {});
        sendExpoPushToUser(order.sender_id, m.title, m.body, { screen: "zawajil", order_id: order.id }, "hasahisawi-default").catch(() => {});
      }
    }
    return res.json(r.rows[0] || { error: "لم يُعثر" });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.get("/admin/zawajil/products", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const r = await query(`SELECT * FROM zawajil_products ORDER BY sort_order,name`);
    return res.json(r.rows);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.post("/admin/zawajil/products", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await ensureZawajilTables();
    const { name, description, price, category, image_url, is_available, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
    const r = await query(`INSERT INTO zawajil_products(name,description,price,category,image_url,is_available,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name,description||null,price||0,category||"general",image_url||null,is_available!==false,sort_order||0]);
    return res.status(201).json(r.rows[0]);
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/zawajil/products/:id", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { name, description, price, category, image_url, is_available, sort_order } = req.body;
    const r = await query(`UPDATE zawajil_products SET name=COALESCE($1,name),description=COALESCE($2,description),price=COALESCE($3::numeric,price),category=COALESCE($4,category),image_url=COALESCE($5,image_url),is_available=COALESCE($6,is_available),sort_order=COALESCE($7::int,sort_order) WHERE id=$8 RETURNING *`,
      [name||null,description||null,price!=null?Number(price):null,category||null,image_url||null,is_available!=null?Boolean(is_available):null,sort_order!=null?Number(sort_order):null,req.params.id]);
    return res.json(r.rows[0] || { error: "لم يُعثر" });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/admin/zawajil/products/:id", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    await query(`DELETE FROM zawajil_products WHERE id=$1`, [req.params.id]);
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/zawajil/orders/:id/assign — assign a zaajil courier to order
router.patch("/admin/zawajil/orders/:id/assign", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { zaajil_id, zaajil_name, zaajil_phone, delivery_notes, pickup_time } = req.body as any;
    const r = await query(
      `UPDATE zawajil_orders SET
        assigned_zaajil_id=$1, assigned_zaajil_name=$2, assigned_zaajil_phone=$3,
        delivery_notes=COALESCE($4, delivery_notes),
        pickup_time=COALESCE($5::timestamptz, pickup_time),
        status=CASE WHEN status='approved' THEN 'preparing' ELSE status END,
        updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [zaajil_id||null, zaajil_name||null, zaajil_phone||null, delivery_notes||null, pickup_time||null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json({ success: true, order: r.rows[0] });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/zawajil/orders/:id/complete-delivery — mark as delivered
router.patch("/admin/zawajil/orders/:id/complete-delivery", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { delivery_notes } = req.body as any;
    await query(
      `UPDATE zawajil_orders SET status='completed', delivered_at=NOW(), delivery_notes=COALESCE($1,delivery_notes), updated_at=NOW() WHERE id=$2`,
      [delivery_notes||null, req.params.id]
    );
    return res.json({ success: true });
  } catch (err) { logger.error({ err }, "Server error"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/zawajil/zaajileen — list approved zaajil (couriers) for assignment
router.get("/admin/zawajil/zaajileen", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const r = await query(`SELECT id, full_name, phone, neighborhood, experience FROM zawajil_applications WHERE role='zaajil' AND status='approved' ORDER BY full_name`);
    return res.json({ zaajileen: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// GET /api/admin/zawajil/applications
router.get("/admin/zawajil/applications", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const role = req.query.role as string;
    const where = role ? `WHERE role=$1` : "";
    const params = role ? [role] : [];
    const r = await query(
      `SELECT * FROM zawajil_applications ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    return res.json({ applications: r.rows });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/admin/zawajil/applications/:id/status
router.patch("/admin/zawajil/applications/:id/status", async (req: Request, res: Response) => {
  if (!await canZawajilRequest(req)) return res.status(403).json({ error: "غير مصرح" });
  try {
    const { status, notes } = req.body as any;
    if (!["approved","rejected","pending"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    await query(
      `UPDATE zawajil_applications SET status=$1, admin_notes=$2, reviewed_at=NOW() WHERE id=$3`,
      [status, notes || null, req.params.id]
    );
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Server error" }); }
});


export default router;
