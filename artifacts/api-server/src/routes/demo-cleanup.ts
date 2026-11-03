// ════════════════════════════════════════════════════════════════
// 🧹 تنظيف البيانات التجريبية (الوهمية) + صلاحية الحذف للإدارة
// كانت نسخ قديمة تملأ الجداول الفارغة ببيانات تجريبية (مستشفيات وأطباء ومحامون ومنظمات
// ومدارس ومتاجر ونقابات وشخصيات وأخبار وإعلانات بأرقام هواتف وهمية). هذا الملف:
//  1) يحذفها مرة واحدة بمطابقة دقيقة (رقم الهاتف الوهمي أو الاسم الحرفي) — لا يمسّ بيانات الناس.
//  2) يوفّر لإدارة التطبيق حذف أي عنصر من الأقسام العامة.
// البذر نفسه أصبح معطّلاً إلا بمتغير SEED_DEMO_DATA=1 (للتطوير فقط).
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, dbEnabled } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();
const MARKER = "demo_purge_v1";

const range = (prefix: string, from: number, to: number, pad = 3) => Array.from({ length: to - from + 1 }, (_, i) => prefix + String(from + i).padStart(pad, "0"));
/** آخر 9 أرقام من أرقام الهواتف الوهمية المستخدمة في البذر */
const FAKE_PHONES = [
  ...range("912345", 1, 5), ...range("912345", 701, 703), ...range("912345", 601, 607), ...range("9123456", 11, 16, 2),
  ...range("1111000", 1, 6, 2), ...range("912000", 11, 15), "912000100", "912000101", "911200202", "923000200", "911000300", "912500400", "155000500",
  ...range("9123456", 82, 94, 2),
];
const SEED_NAMES: Record<string, string[]> = {
  rated_entities: ["محكمة الحصاحيصا", "مستشفى الحصاحيصا", "مدرسة الحصاحيصا الأساسية", "بريد الحصاحيصا", "بنك الخرطوم — فرع الحصاحيصا", "سوق الحصاحيصا المركزي",
    "أحمد عبدالله النور", "فاطمة إبراهيم", "موسى محمد أحمد", "عمر الفاضل", "مصطفى التوم", "إبراهيم سليمان", "يوسف عبدالرحمن", "علي الشيخ"],
  honored_figures: ["الشيخ الأمين محمد علي", "الدكتور عبدالرحمن آدم", "الأستاذة فاطمة إبراهيم خليل", "المهندس حسن الطيب النور"],
  city_news: ["افتتاح مشروع مياه الشرب النقية بأحياء الحصاحيصا", "انطلاق بطولة الحصاحيصا لكرة القدم في نسختها العاشرة",
    "توسعة مستشفى الحصاحيصا التعليمي تضيف وحدة نساء وتوليد جديدة", "انطلاق حملة التشجير الكبرى بالأحياء السكنية"],
  greetings: ["أبناء حي الصداقة", "جمعية أولياء الأمور", "أسرة تطبيق حصاحيصاوي"],
  jobs: ["شركة النيل للمقاولات", "مستشفى الحصاحيصا التعليمي", "مدارس الرواد الخاصة", "صيدلية الشفاء"],
  communities: ["رابطة أبناء الحصاحيصا في الخرطوم", "مجموعة شباب الحصاحيصا للتطوع", "رابطة خريجي مدارس الحصاحيصا"],
};

async function run(sql: string, params: unknown[] = []): Promise<number> {
  try { return (await query(sql, params)).rowCount ?? 0; } catch { return 0; }
}
const PHONE_SQL = (col: string) => `RIGHT(regexp_replace(COALESCE(${col},''),'\\D','','g'), 9) = ANY($1::text[])`;

export async function purgeDemoData(force = false): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!dbEnabled) return out;
  if (!force) {
    const done = await query(`SELECT 1 FROM admin_settings WHERE key=$1`, [MARKER]).catch(() => ({ rows: [1] }));
    if (done.rows.length) return out;
  }
  const P = [FAKE_PHONES];
  // المحامون التجريبيون وإعلاناتهم وتقييماتهم
  out.lawyer_ads = await run(`DELETE FROM lawyer_ads WHERE ${PHONE_SQL("cta_phone")}`, P);
  const lawyerEnt = await query(`SELECT id FROM rated_entities WHERE type='lawyer' AND ${PHONE_SQL("phone")}`, P).catch(() => ({ rows: [] as any[] }));
  const entIds = lawyerEnt.rows.map((r: any) => r.id);
  if (entIds.length) out.lawyer_ratings = await run(`DELETE FROM ratings WHERE entity_id = ANY($1::int[])`, [entIds]);
  out.lawyers = await run(`DELETE FROM lawyers WHERE ${PHONE_SQL("phone")}`, P);
  out.rated_lawyers = await run(`DELETE FROM rated_entities WHERE type='lawyer' AND ${PHONE_SQL("phone")}`, P);
  // كيانات التقييم التجريبية (بلا هاتف)
  const re = await query(`SELECT id FROM rated_entities WHERE name = ANY($1::text[]) AND type IN ('institution','employee','service_seeker') AND COALESCE(phone,'')=''`, [SEED_NAMES.rated_entities]).catch(() => ({ rows: [] as any[] }));
  const reIds = re.rows.map((r: any) => r.id);
  if (reIds.length) { await run(`DELETE FROM ratings WHERE entity_id = ANY($1::int[])`, [reIds]); out.rated_entities = await run(`DELETE FROM rated_entities WHERE id = ANY($1::int[])`, [reIds]); }
  // المنظمات والمدارس وركن المرأة والنقابات
  out.organizations = await run(`DELETE FROM organizations WHERE ${PHONE_SQL("contact_phone")}`, P);
  out.educational_institutions = await run(`DELETE FROM educational_institutions WHERE ${PHONE_SQL("phone")}`, P);
  await run(`ALTER TABLE women_services ADD COLUMN IF NOT EXISTS join_request_id INTEGER`);
  out.women_services = await run(`DELETE FROM women_services WHERE join_request_id IS NULL AND ${PHONE_SQL("phone")}`, P);
  out.unions = await run(`DELETE FROM unions WHERE ${PHONE_SQL("phone")}`, P);
  // الأطباء والإعلانات والوظائف والجاليات
  out.specialists = await run(`DELETE FROM specialists WHERE ${PHONE_SQL("phone")}`, P);
  out.ads = await run(`DELETE FROM ads WHERE ${PHONE_SQL("contact_phone")}`, P);
  out.jobs = await run(`DELETE FROM jobs WHERE author_name = ANY($1::text[]) AND company = ANY($1::text[])`, [SEED_NAMES.jobs]);
  out.communities = await run(`DELETE FROM communities WHERE name = ANY($1::text[])`, [SEED_NAMES.communities]);
  // شخصيات وأخبار وتهانٍ تجريبية
  out.honored_figures = await run(`DELETE FROM honored_figures WHERE name = ANY($1::text[])`, [SEED_NAMES.honored_figures]);
  out.city_news = await run(`DELETE FROM city_news WHERE title = ANY($1::text[])`, [SEED_NAMES.city_news]);
  out.greetings = await run(`DELETE FROM greetings WHERE author_name = ANY($1::text[]) AND likes IS NOT NULL AND created_at < '2026-06-01'`, [SEED_NAMES.greetings]);
  // شركة النقل التجريبية: تعطيل (قد ترتبط بها حجوزات قديمة)
  out.travel_companies = await run(`UPDATE travel_companies SET active=false WHERE ${PHONE_SQL("phone")}`, P);
  await query(`INSERT INTO admin_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2`, [MARKER, new Date().toISOString()]).catch(() => {});
  logger.info({ out }, "[demo-cleanup] purged demo data");
  return out;
}

// ─── الحذف الإداري من الأقسام العامة ─────────────────────────
// المفتاح: اسم ظاهر للقسم → الجدول. الحذف لإدارة التطبيق فقط ويُسجَّل.
const DELETABLE: Record<string, { table: string; label: string; group: string; name: string; sub?: string }> = {
  medical_specialists: { table: "specialists", label: "الأطباء", group: "الصحة", name: "name", sub: "specialty" },
  booking_entities: { table: "booking_entities", label: "جهات حجز المواعيد", group: "الصحة", name: "name", sub: "subcategory" },
  lawyers: { table: "lawyers", label: "المحامون", group: "مهني", name: "full_name", sub: "title" },
  rated_entities: { table: "rated_entities", label: "جهات التقييم", group: "مهني", name: "name", sub: "subtitle" },
  stores: { table: "stores", label: "المتاجر", group: "تجاري", name: "name", sub: "address" },
  merchants: { table: "merchant_spaces", label: "سوق المتاجر (البوتيكات)", group: "تجاري", name: "shop_name", sub: "address" },
  restaurants: { table: "food_businesses", label: "المطاعم والكافتيريات", group: "تجاري", name: "name", sub: "address" },
  travel_companies: { table: "travel_companies", label: "شركات النقل", group: "تجاري", name: "name", sub: "owner_name" },
  ads: { table: "ads", label: "الإعلانات", group: "تجاري", name: "title", sub: "institution_name" },
  organizations: { table: "organizations", label: "المنظمات والمبادرات", group: "مجتمع", name: "name", sub: "type" },
  women_services: { table: "women_services", label: "ركن المرأة", group: "مجتمع", name: "name", sub: "address" },
  men_services: { table: "men_services", label: "قسم الرجال", group: "مجتمع", name: "name", sub: "address" },
  unions: { table: "unions", label: "النقابات", group: "مجتمع", name: "name", sub: "field" },
  communities: { table: "communities", label: "الجاليات", group: "مجتمع", name: "name", sub: "neighborhood" },
  jobs: { table: "jobs", label: "الوظائف", group: "مجتمع", name: "title", sub: "company" },
  city_news: { table: "city_news", label: "أخبار المدينة", group: "مجتمع", name: "title", sub: "author_name" },
  honored_figures: { table: "honored_figures", label: "الشخصيات المكرّمة", group: "مجتمع", name: "name", sub: "title" },
  greetings: { table: "greetings", label: "التهاني", group: "مجتمع", name: "author_name", sub: "occasion_name" },
  schools: { table: "educational_institutions", label: "المؤسسات التعليمية", group: "تعليم", name: "name", sub: "address" },
  sports_clubs: { table: "sports_clubs", label: "الأندية", group: "مجتمع", name: "name" },
  cultural_centers: { table: "cultural_centers", label: "المراكز الثقافية", group: "مجتمع", name: "name" },
  gov_entities: { table: "gov_entities", label: "الجهات الحكومية", group: "مجتمع", name: "name", sub: "description" },
};

router.get("/admin/listings", async (req: Request, res: Response) => {
  const me = await sessionUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: "لإدارة التطبيق فقط" });
  const kinds = Object.entries(DELETABLE).map(([key, k]) => ({ key, label: k.label, group: k.group }));
  const kind = DELETABLE[String(req.query.kind || "")];
  if (!kind) return res.json({ kinds });
  try {
    const cols = (await query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1`, [kind.table])).rows.map((x: any) => x.column_name);
    const has = (c: string) => cols.includes(c);
    const phone = ["phone", "contact_phone", "whatsapp"].find(has);
    const params: unknown[] = [];
    let where = "TRUE";
    const q = String(req.query.q || "").trim().slice(0, 60);
    if (q) { params.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`); where = `${kind.name}::text ILIKE $1${phone ? ` OR ${phone}::text ILIKE $1` : ""}`; }
    const { rows } = await query(
      `SELECT id, ${kind.name}::text AS name${kind.sub && has(kind.sub) ? `, ${kind.sub}::text AS sub` : ""}${phone ? `, ${phone}::text AS phone` : ""}${has("created_at") ? ", created_at" : ""}
       ${has("is_active") ? ", is_active AS active" : has("active") ? ", active" : has("status") ? ", status::text AS status" : ""}
       FROM ${kind.table} WHERE ${where} ORDER BY id DESC LIMIT 300`, params);
    return res.json({ kinds, items: rows });
  } catch (err) {
    logger.warn({ err }, "admin/listings");
    return res.json({ kinds, items: [], note: "هذا القسم غير مُهيأ بعد في قاعدة البيانات" });
  }
});

router.delete("/admin/listings/:kind/:id", writeLimiter, async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me || me.role !== "admin") return res.status(403).json({ error: "لإدارة التطبيق فقط" });
    const k = DELETABLE[String(req.params.kind)];
    if (!k || !/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    const r = await query(`DELETE FROM ${k.table} WHERE id=$1`, [Number(req.params.id)]).catch(async (e: any) => {
      // قيود مراجع: نعطّل العنصر بدل حذفه إن تعذّر الحذف
      if (e?.code === "23503") {
        const cols = (await query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name IN ('is_active','active','status')`, [k.table])).rows.map((x: any) => x.column_name);
        if (cols.includes("is_active")) return query(`UPDATE ${k.table} SET is_active=false WHERE id=$1`, [Number(req.params.id)]);
        if (cols.includes("active")) return query(`UPDATE ${k.table} SET active=false WHERE id=$1`, [Number(req.params.id)]);
        if (cols.includes("status")) return query(`UPDATE ${k.table} SET status='deleted' WHERE id=$1`, [Number(req.params.id)]);
      }
      throw e;
    });
    if (!r.rowCount) return res.status(404).json({ error: "غير موجود" });
    logger.info({ by: me.id, kind: req.params.kind, id: req.params.id }, "[admin] listing deleted");
    return res.json({ ok: true, message: `حُذف ${k.label}` });
  } catch (err) {
    logger.error({ err }, "admin/listings delete");
    return res.status(500).json({ error: "تعذّر الحذف" });
  }
});

// إعادة التنظيف يدوياً (للإدارة) — آمنة: تطابق البيانات التجريبية فقط
router.post("/admin/purge-demo-data", writeLimiter, async (req: Request, res: Response) => {
  const me = await sessionUser(req);
  if (!isStaff(me) || me!.role !== "admin") return res.status(403).json({ error: "لإدارة التطبيق فقط" });
  try { return res.json({ ok: true, removed: await purgeDemoData(true) }); }
  catch (err) { logger.error({ err }, "purge-demo"); return res.status(500).json({ error: "تعذّر التنظيف" }); }
});

export default router;
