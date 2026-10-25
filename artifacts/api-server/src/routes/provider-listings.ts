// ════════════════════════════════════════════════════════════════
// نشر مقدّمي الخدمات عند قبول طلباتهم + قسم الرجال
// ════════════════════════════════════════════════════════════════
// كان قبول الطلب في «مركز الطلبات» يغيّر الحالة فقط ولا يُنشئ شيئاً، فلا يظهر صاحب الطلب في قسمه.
// هنا: قبول طلب ركن المرأة يُنشر في women_services، وقبول طلب قسم الرجال يُنشر في men_services
// (جدول جديد — كان التطبيق يطلب /men-services ولم يكن موجوداً)، وقبول طلب تاجر يُنشئ متجره إن كان له حساب.
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, dbEnabled } from "../lib/shared-db";

const router = Router();

const WOMEN_TYPES = ["salon", "sewing", "health", "cooking", "childcare", "tip", "handmade"];
const MEN_TYPES = ["barber", "fashion", "perfume", "fitness", "craft", "jobs", "other"];
// أرقام البيانات التجريبية القديمة — لا تُعرض للناس
const SEED_PHONES = ["0912000011", "0912000012", "0912000013", "0912000014", "0912000015"];

let ready: Promise<void> | null = null;
export function ensureListingsDb(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS men_services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'other',
        address TEXT NOT NULL DEFAULT '',
        phone VARCHAR(50) NOT NULL DEFAULT '',
        hours VARCHAR(100) NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        rating NUMERIC(3,2) NOT NULL DEFAULT 5.0,
        tags TEXT[] NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        join_request_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_men_services_join ON men_services(join_request_id) WHERE join_request_id IS NOT NULL`);
      await query(`ALTER TABLE women_services ADD COLUMN IF NOT EXISTS join_request_id INTEGER`).catch(() => {});
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_women_services_join ON women_services(join_request_id) WHERE join_request_id IS NOT NULL`).catch(() => {});
      await query(`UPDATE women_services SET is_active=FALSE WHERE phone = ANY($1::text[]) AND join_request_id IS NULL`, [SEED_PHONES]).catch(() => {});
      await backfill();
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** الطلبات التي قُبلت قبل هذا الإصلاح ولم تُنشر — تُنشر الآن */
async function backfill() {
  try {
    const w = await query(`SELECT j.* FROM women_join_requests j LEFT JOIN women_services s ON s.join_request_id=j.id WHERE j.status='approved' AND s.id IS NULL`);
    for (const r of w.rows) await publishWomen(r);
  } catch (e: any) { logger.warn({ err: e?.message }, "[listings] women backfill"); }
  try {
    const m = await query(`SELECT j.* FROM join_requests j LEFT JOIN men_services s ON s.join_request_id=j.id WHERE j.request_type='men_service' AND j.status='approved' AND s.id IS NULL`);
    for (const r of m.rows) await publishMen(r);
  } catch (e: any) { logger.warn({ err: e?.message }, "[listings] men backfill"); }
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export async function publishWomen(r: any) {
  const type = WOMEN_TYPES.includes(r.service_type) ? r.service_type : "handmade";
  const res = await query(
    `INSERT INTO women_services (name,type,address,phone,hours,description,rating,tags,is_active,join_request_id)
     VALUES ($1,$2,$3,$4,'',$5,5.0,'{}',TRUE,$6)
     ON CONFLICT (join_request_id) WHERE join_request_id IS NOT NULL DO UPDATE SET is_active=TRUE, name=EXCLUDED.name, type=EXCLUDED.type, address=EXCLUDED.address, phone=EXCLUDED.phone, description=EXCLUDED.description
     RETURNING *`,
    [clip(r.owner_name, 200), type, clip(r.address, 300), clip(r.phone, 50), clip(r.description, 2000), r.id]);
  return res.rows[0];
}

export async function unpublishWomen(id: number) {
  await query(`UPDATE women_services SET is_active=FALSE WHERE join_request_id=$1`, [id]).catch(() => {});
}

export async function publishMen(r: any) {
  const p = r.payload || {};
  const type = MEN_TYPES.includes(p.service_type) ? p.service_type : "other";
  const res = await query(
    `INSERT INTO men_services (name,type,address,phone,hours,description,is_active,join_request_id)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7)
     ON CONFLICT (join_request_id) WHERE join_request_id IS NOT NULL DO UPDATE SET is_active=TRUE, name=EXCLUDED.name, type=EXCLUDED.type, address=EXCLUDED.address, phone=EXCLUDED.phone, description=EXCLUDED.description
     RETURNING *`,
    [clip(r.entity_name || r.applicant_name, 200), type, clip(p.address, 300), clip(r.phone, 50), clip(p.hours, 100), clip(p.description, 2000), r.id]);
  return res.rows[0];
}

export async function unpublishMen(id: number) {
  await query(`UPDATE men_services SET is_active=FALSE WHERE join_request_id=$1`, [id]).catch(() => {});
}

/** يبحث عن حساب بنفس رقم الهاتف (آخر 9 أرقام، لتجاوز اختلاف 0 / +249) */
async function userByPhone(phone: unknown): Promise<{ id: number; name: string; gender: string | null } | null> {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 9) return null;
  const tail = d.slice(-9);
  const r = await query(`SELECT id,name,gender FROM users WHERE RIGHT(regexp_replace(COALESCE(phone,''),'\\D','','g'),9)=$1 ORDER BY id LIMIT 1`, [tail]);
  return r.rows[0] ?? null;
}

async function publishMerchant(row: any): Promise<string> {
  const p = row.payload || {};
  const u = await userByPhone(row.phone);
  if (!u) return "مقبول — لا يوجد حساب بهذا الرقم بعد؛ اطلب من التاجر التسجيل في التطبيق ثم فتح «بوابة التاجر» لإنشاء متجره";
  const ex = await query(`SELECT id,status FROM stores WHERE owner_id=$1`, [u.id]).catch(() => ({ rows: [] as any[] }));
  if (ex.rows[0]) {
    if (ex.rows[0].status !== "active") await query(`UPDATE stores SET status='active', reviewed_at=NOW(), updated_at=NOW() WHERE id=$1`, [ex.rows[0].id]);
    return `تم تفعيل متجر ${u.name} — يظهر الآن في قسم المتاجر`;
  }
  const name = clip(row.entity_name || p.shop_name || p.store_name || row.applicant_name, 120);
  const women = p.women_only === true || p.women_only === "true";
  await query(
    `INSERT INTO stores(owner_id,name,type,description,phone,address,working_hours,women_only,status) VALUES($1,$2,'general',$3,$4,$5,$6,$7,'active')`,
    [u.id, name, clip(p.description, 1000), clip(row.phone, 40), clip(p.address, 200), clip(p.working_hours || p.hours, 80), women]);
  return `أُنشئ متجر «${name}» لحساب ${u.name} — يظهر الآن، ويضيف منتجاته من «بوابة التاجر»`;
}

async function publishFood(row: any): Promise<string> {
  const p = row.payload || {};
  const u = await userByPhone(row.phone);
  const name = clip(row.entity_name || p.business_name || row.applicant_name, 220);
  const ex = await query(`SELECT id FROM food_businesses WHERE LOWER(name)=LOWER($1) LIMIT 1`, [name]).catch(() => ({ rows: [] as any[] }));
  if (ex.rows[0]) {
    await query(`UPDATE food_businesses SET status='approved', owner_user_id=COALESCE(owner_user_id,$2), updated_at=NOW() WHERE id=$1`, [ex.rows[0].id, u?.id ?? null]);
  } else {
    const type = ["restaurant", "cafe", "bakery", "juice"].includes(p.business_type) ? p.business_type : "restaurant";
    await query(
      `INSERT INTO food_businesses(owner_user_id,name,business_type,phone,address,description,status) VALUES($1,$2,$3,$4,$5,$6,'approved')`,
      [u?.id ?? null, name, type, clip(row.phone, 40), clip(p.address, 300), clip(p.description, 1500)]);
  }
  return u ? `نُشر «${name}» في المطاعم ويديره ${u.name} من لوحة المطعم` : `نُشر «${name}» في المطاعم — اطلب من صاحبه التسجيل بنفس الرقم ليديره`;
}

/** قبول طلب عام: ينشر في القسم المناسب، ويُرجع وصفاً لما حدث يُعرض للإدارة */
export async function onGeneralRequestReviewed(row: any, status: string): Promise<string | null> {
  try {
    await ensureListingsDb();
    if (row.request_type === "men_service") {
      if (status === "approved") { await publishMen(row); return "نُشر في قسم الرجال"; }
      if (status === "rejected") { await unpublishMen(row.id); return null; }
    }
    if (status === "approved" && row.request_type === "merchant") return await publishMerchant(row);
    if (status === "approved" && row.request_type === "food_business") return await publishFood(row);
  } catch (e: any) { logger.warn({ err: e?.message }, "[listings] general publish"); }
  return null;
}

export async function onWomenRequestReviewed(row: any, status: string): Promise<string | null> {
  try {
    await ensureListingsDb();
    if (status === "approved") { await publishWomen(row); return "نُشرت في ركن المرأة"; }
    if (status === "rejected") await unpublishWomen(row.id);
  } catch (e: any) { logger.warn({ err: e?.message }, "[listings] women publish"); }
  return null;
}

// ── ركن المرأة: الخدمات المعتمدة فقط ─────────────────────────────
router.get("/women-services", async (req: Request, res: Response) => {
  if (!dbEnabled) return res.json({ services: [] });
  try {
    await ensureListingsDb();
    const type = String(req.query.type || "");
    const params: unknown[] = [];
    let sql = `SELECT * FROM women_services WHERE is_active=TRUE`;
    if (WOMEN_TYPES.includes(type)) { params.push(type); sql += ` AND type=$1`; }
    sql += ` ORDER BY created_at DESC LIMIT 300`;
    const { rows } = await query(sql, params);
    return res.json({ services: rows });
  } catch (e) { logger.error({ err: e }, "women-services"); return res.status(500).json({ error: "Server error" }); }
});

// ── قسم الرجال ───────────────────────────────────────────────────
router.get("/men-services", async (req: Request, res: Response) => {
  if (!dbEnabled) return res.json({ services: [] });
  try {
    await ensureListingsDb();
    const type = String(req.query.type || "");
    const params: unknown[] = [];
    let sql = `SELECT id,name,type,address,phone,hours,description,rating,tags,created_at FROM men_services WHERE is_active=TRUE`;
    if (MEN_TYPES.includes(type)) { params.push(type); sql += ` AND type=$1`; }
    sql += ` ORDER BY created_at DESC LIMIT 300`;
    const { rows } = await query(sql, params);
    return res.json({ services: rows });
  } catch (e) { logger.error({ err: e }, "men-services"); return res.status(500).json({ error: "Server error" }); }
});

// قوائم الإدارة لكلا القسمين (للتعديل والإخفاء)
router.get("/admin/listings/:section", async (req: Request, res: Response) => {
  try {
    const u = await sessionUser(req);
    if (!isStaff(u)) return res.status(403).json({ error: "غير مصرح" });
    await ensureListingsDb();
    const table = req.params.section === "men" ? "men_services" : req.params.section === "women" ? "women_services" : null;
    if (!table) return res.status(404).json({ error: "غير موجود" });
    if (table === "women_services" && u!.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const { rows } = await query(`SELECT * FROM ${table} ORDER BY is_active DESC, created_at DESC LIMIT 400`);
    return res.json({ services: rows });
  } catch (e) { logger.error({ err: e }, "admin listings"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/admin/listings/:section/:id", async (req: Request, res: Response) => {
  try {
    const u = await sessionUser(req);
    if (!isStaff(u)) return res.status(403).json({ error: "غير مصرح" });
    await ensureListingsDb();
    const table = req.params.section === "men" ? "men_services" : req.params.section === "women" ? "women_services" : null;
    if (!table || !/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    if (table === "women_services" && u!.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const sets: string[] = []; const vals: unknown[] = [];
    const b = req.body || {};
    if (typeof b.is_active === "boolean") { vals.push(b.is_active); sets.push(`is_active=$${vals.length}`); }
    for (const [k, n] of [["name", 200], ["address", 300], ["phone", 50], ["hours", 100], ["description", 2000]] as const) {
      if (k in b) { vals.push(clip(b[k], n)); sets.push(`${k}=$${vals.length}`); }
    }
    if ("type" in b) {
      const ok = (table === "men_services" ? MEN_TYPES : WOMEN_TYPES).includes(b.type);
      if (ok) { vals.push(b.type); sets.push(`type=$${vals.length}`); }
    }
    if (!sets.length) return res.status(400).json({ error: "لا توجد تعديلات" });
    vals.push(Number(req.params.id));
    const { rows } = await query(`UPDATE ${table} SET ${sets.join(",")} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!rows[0]) return res.status(404).json({ error: "غير موجود" });
    return res.json(rows[0]);
  } catch (e) { logger.error({ err: e }, "admin listings patch"); return res.status(500).json({ error: "Server error" }); }
});

export default router;
