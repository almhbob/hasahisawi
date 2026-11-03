// جهات حجز المواعيد (صحية وحكومية) — تديرها الإدارة بدل القائمة الثابتة الوهمية التي كانت داخل التطبيق.
// + إلغاء الإدارة لموعد مع ذكر السبب وإشعار صاحب الموعد.
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();
const CATS = ["health", "government"] as const;

let ready: Promise<void> | null = null;
export function ensureBookingEntities(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS booking_entities (
      id SERIAL PRIMARY KEY,
      category VARCHAR(12) NOT NULL DEFAULT 'health',
      name VARCHAR(160) NOT NULL,
      subcategory VARCHAR(60),
      address VARCHAR(200),
      phone VARCHAR(30),
      whatsapp VARCHAR(30),
      services TEXT[] NOT NULL DEFAULT '{}',
      work_days VARCHAR(80),
      hours VARCHAR(60),
      slots TEXT[] NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_reason TEXT`).catch(() => {});
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(10)`).catch(() => {});
  })().catch((e) => { ready = null; throw e; }));
}

const clean = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const list = (v: unknown, n = 20) => (Array.isArray(v) ? v : String(v ?? "").split(/[,،\n]/)).map((x) => clean(x, 80)).filter(Boolean).slice(0, n);
async function admin(req: Request) { const u = await sessionUser(req); return u && u.role === "admin" ? u : null; }

router.get("/appointments/entities", async (req: Request, res: Response) => {
  try {
    await ensureBookingEntities();
    const all = req.query.all === "1" && (await admin(req));
    const { rows } = await query(`SELECT * FROM booking_entities ${all ? "" : "WHERE is_active=TRUE"} ORDER BY category, sort_order, name`);
    return res.json({ entities: rows });
  } catch (err) { logger.error({ err }, "booking/entities"); return res.status(500).json({ error: "Server error" }); }
});

function parse(b: any) {
  const name = clean(b.name, 160);
  if (name.length < 3) return { error: "اسم الجهة مطلوب" } as const;
  const category = (CATS as readonly string[]).includes(b.category) ? b.category : "health";
  return { v: { category, name, subcategory: clean(b.subcategory, 60) || null, address: clean(b.address, 200) || null, phone: clean(b.phone, 30) || null,
    whatsapp: clean(b.whatsapp, 30) || null, services: list(b.services), work_days: clean(b.work_days, 80) || null, hours: clean(b.hours, 60) || null,
    slots: list(b.slots, 30).filter((t) => /^\d{1,2}:\d{2}$/.test(t)), is_active: b.is_active !== false } } as const;
}

router.post("/admin/appointments/entities", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureBookingEntities();
    const me = await admin(req);
    if (!me) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const p = parse(req.body || {});
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    const { rows } = await query(`INSERT INTO booking_entities (category,name,subcategory,address,phone,whatsapp,services,work_days,hours,slots,is_active,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [v.category, v.name, v.subcategory, v.address, v.phone, v.whatsapp, v.services, v.work_days, v.hours, v.slots, v.is_active, me.id]);
    return res.status(201).json({ entity: rows[0] });
  } catch (err) { logger.error({ err }, "booking/entities create"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/appointments/entities/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureBookingEntities();
    if (!(await admin(req))) return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const cur = (await query(`SELECT * FROM booking_entities WHERE id=$1`, [Number(req.params.id)])).rows[0];
    if (!cur) return res.status(404).json({ error: "غير موجود" });
    const p = parse({ ...cur, ...req.body });
    if ("error" in p) return res.status(400).json({ error: p.error });
    const v = p.v;
    const { rows } = await query(`UPDATE booking_entities SET category=$1,name=$2,subcategory=$3,address=$4,phone=$5,whatsapp=$6,services=$7,work_days=$8,hours=$9,slots=$10,is_active=$11 WHERE id=$12 RETURNING *`,
      [v.category, v.name, v.subcategory, v.address, v.phone, v.whatsapp, v.services, v.work_days, v.hours, v.slots, v.is_active, cur.id]);
    return res.json({ entity: rows[0] });
  } catch (err) { logger.error({ err }, "booking/entities update"); return res.status(500).json({ error: "Server error" }); }
});

// إلغاء الإدارة/الجهة لموعد مع سبب — يصل إشعار لصاحب الموعد
router.post("/admin/appointments/:id/cancel", writeLimiter, async (req: Request, res: Response) => {
  try {
    await ensureBookingEntities();
    if (!(await admin(req))) return res.status(403).json({ error: "غير مصرح" });
    const reason = clean(req.body?.reason, 300);
    if (reason.length < 3) return res.status(400).json({ error: "اكتب سبب الإلغاء" });
    const r = await query(`UPDATE appointments SET status='cancelled', cancelled_at=NOW(), cancel_reason=$2, cancelled_by='admin'
      WHERE id=$1 AND status NOT IN ('cancelled','completed') RETURNING user_id, facility_name, appointment_date, appointment_time`, [Number(req.params.id), reason]);
    const a = r.rows[0];
    if (!a) return res.status(409).json({ error: "لا يمكن إلغاء هذا الموعد" });
    await query(`INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,'appointment',$2,$3,$4)`,
      [a.user_id, "أُلغي موعدك", `${a.facility_name || "الموعد"} — ${String(a.appointment_date).slice(0, 10)} ${a.appointment_time}: ${reason}`, JSON.stringify({ screen: "appointments" })]).catch(() => {});
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "admin cancel appointment"); return res.status(500).json({ error: "Server error" }); }
});

export default router;
