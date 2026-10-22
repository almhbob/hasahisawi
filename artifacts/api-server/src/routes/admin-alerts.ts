// تنبيهات الإدارة الموحّدة: كل طلب انضمام / طلب جديد يُسجَّل هنا مرة واحدة
// ويُرسل إشعاراً فورياً (بصوت) لكل مشرف، ويظهر داخل التطبيق كتنبيه مرئي وصوتي.
import { Router, type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";
import { query, dbEnabled, sessionUser, isStaff } from "../lib/shared-db";

type Rule = { re: RegExp; kind: string; title: string; screen: string };

// POST paths (relative to /api) that represent a new request needing admin attention.
export const ALERT_RULES: Rule[] = [
  { re: /^\/lawyer-applications\/?$/,                     kind: "lawyer",          title: "⚖️ طلب انضمام محامٍ",          screen: "lawyers" },
  { re: /^\/lawyers\/\d+\/contracts\/?$/,                 kind: "lawyer_contract", title: "📑 طلب خدمة قانونية",          screen: "lawyers" },
  { re: /^\/institution-applications\/?$/,                kind: "institution",     title: "🏢 طلب انضمام مؤسسة",          screen: "institutions" },
  { re: /^\/women\/join-request\/?$/,                     kind: "women_service",   title: "🌸 طلب انضمام لركن المرأة",     screen: "women" },
  { re: /^\/women\/stores\/apply\/?$/,                    kind: "women_store",     title: "🛍️ طلب متجر في ركن المرأة",    screen: "women" },
  { re: /^\/women\/product-requests\/?$/,                 kind: "women_product",   title: "🧺 طلب منتج من ركن المرأة",     screen: "women" },
  { re: /^\/men\/join-request\/?$/,                       kind: "men_service",     title: "🧔 طلب انضمام لقسم الرجال",     screen: "requests" },
  { re: /^\/(join-requests|merchants?\/join-request|food\/join-request|transport\/driver\/join-request)\/?$/, kind: "join", title: "📝 طلب انضمام جديد", screen: "requests" },
  { re: /^\/store\/register\/?$/,                         kind: "store",           title: "🏪 طلب تسجيل متجر",            screen: "stores" },
  { re: /^\/occasions\/join-request\/?$/,                 kind: "occasions",       title: "🎉 طلب مقدّم خدمات مناسبات",    screen: "requests" },
  { re: /^\/transport\/drivers\/register\/?$/,            kind: "driver",          title: "🚗 طلب تسجيل سائق",            screen: "transport" },
  { re: /^\/external-partnerships\/apply\/?$/,            kind: "partnership",     title: "🤝 طلب شراكة خارجية",          screen: "partnerships" },
  { re: /^\/education\/register-student\/?$/,             kind: "student_reg",     title: "🎓 طلب تسجيل طالب",            screen: "education" },
  { re: /^\/education\/transfer-request\/?$/,             kind: "student_transfer",title: "🔁 طلب نقل طالب",              screen: "education" },
  { re: /^\/unions\/apply\/?$/,                           kind: "union_member",    title: "🪪 طلب عضوية اتحاد",           screen: "unions" },
  { re: /^\/student-union\/apply\/?$/,                    kind: "student_union",   title: "🎓 طلب انضمام لاتحاد الطلاب",   screen: "unions" },
  { re: /^\/union-partnership\/apply\/?$/,                kind: "union_partner",   title: "🤝 طلب شراكة اتحاد",           screen: "unions" },
  { re: /^\/union-manager\/apply\/?$/,                    kind: "union_manager",   title: "🎓 طلب تولّي إدارة اتحاد",      screen: "unions" },
  { re: /^\/union-staff\/apply\/?$/,                      kind: "union_staff",     title: "👥 طلب موظف اتحاد",            screen: "unions" },
  { re: /^\/zawajil\/apply\/?$/,                          kind: "zawajil",         title: "💍 طلب انضمام زواجل",          screen: "zawajil" },
  { re: /^\/travel-agencies\/apply\/?$/,                  kind: "travel_agency",   title: "✈️ طلب انضمام وكالة سفر",      screen: "travel" },
  { re: /^\/travel\/bookings\/?$/,                        kind: "travel_booking",  title: "🎫 حجز سفر جديد",              screen: "travel" },
  { re: /^\/travel\/bookings\/\d+\/submit-payment\/?$/,   kind: "travel_payment",  title: "💳 إيصال دفع لحجز سفر",        screen: "travel" },
  { re: /^\/medical\/staff\/register\/?$/,                kind: "medical_staff",   title: "🩺 طلب تسجيل كادر طبي",        screen: "requests" },
  { re: /^\/communities\/register\/?$/,                   kind: "community",       title: "🏘️ طلب تسجيل مجتمع",          screen: "requests" },
  { re: /^\/ads\/request\/?$/,                            kind: "ad",              title: "📣 طلب إعلان",                 screen: "ads" },
];

const NAME_KEYS = ["full_name", "owner_name", "applicant_name", "inst_name", "org_name", "agency_name", "store_name",
  "shop_name", "business_name", "student_name", "passenger_name", "client_name", "customer_name", "driver_name", "contact_name", "name"];
const DETAIL_KEYS = ["service_type", "inst_type", "specialties", "category", "type", "sector", "institution", "to_city", "service_title", "role"];
const PHONE_KEYS = ["phone", "whatsapp", "contact_phone", "client_phone", "customer_phone", "passenger_phone", "parent_phone", "mobile"];

function pick(body: any, keys: string[]): string {
  if (!body || typeof body !== "object") return "";
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 80);
    if (typeof v === "number") return String(v);
  }
  return "";
}

let ready: Promise<void> | null = null;
export function ensureAdminAlertsDb(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS admin_alerts(
        id BIGSERIAL PRIMARY KEY,
        kind VARCHAR(40) NOT NULL,
        title VARCHAR(160) NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        screen VARCHAR(40) NOT NULL DEFAULT 'requests',
        source_path VARCHAR(200),
        ref_id TEXT,
        phone VARCHAR(40),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await query(`CREATE INDEX IF NOT EXISTS idx_admin_alerts_created ON admin_alerts(id DESC)`);
      await query(`CREATE TABLE IF NOT EXISTS admin_alert_cursor(
        user_id INTEGER PRIMARY KEY,
        last_seen_id BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function pushToStaff(title: string, body: string, data: Record<string, unknown>) {
  const { rows } = await query(
    `SELECT DISTINCT pt.token FROM push_tokens pt JOIN users u ON u.id=pt.user_id
     WHERE u.role IN ('admin','moderator') AND pt.token LIKE 'ExponentPushToken[%'`);
  if (!rows.length) return;
  const messages = rows.map((r: any) => ({
    to: r.token, title, body, sound: "hasahisawi_urgent", channelId: "hasahisawi-urgent", priority: "high",
    badge: 1, data: { ...data, channelId: "hasahisawi-urgent" },
  }));
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });
  } finally { clearTimeout(t); }
}

export async function recordAdminAlert(a: { kind: string; title: string; body: string; screen: string; path?: string; refId?: string; phone?: string }) {
  if (!dbEnabled) return null;
  await ensureAdminAlertsDb();
  const r = await query(
    `INSERT INTO admin_alerts(kind,title,body,screen,source_path,ref_id,phone) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [a.kind, a.title, a.body.slice(0, 400), a.screen, a.path ?? null, a.refId ?? null, a.phone ?? null]);
  const id = r.rows[0]?.id;
  await pushToStaff(a.title, a.body || "طلب جديد بانتظار المراجعة", { type: "admin_alert", kind: a.kind, alert_id: String(id), screen: a.screen })
    .catch((e) => logger.warn({ err: e?.message }, "[admin-alerts] push failed"));
  return id;
}

/**
 * Express middleware: when a matching POST finishes successfully, record one
 * alert before the response leaves (serverless instances may freeze right after).
 */
export function captureAdminAlerts(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "POST") return next();
  const rule = ALERT_RULES.find((r) => r.re.test(req.path));
  if (!rule) return next();
  const origJson = res.json.bind(res);
  let handled = false;
  (res as any).json = (payload: any) => {
    if (handled || res.statusCode < 200 || res.statusCode >= 300 || payload?.duplicate === true) return origJson(payload);
    handled = true;
    const body: any = req.body || {};
    const who = pick(body, NAME_KEYS) || pick(payload, NAME_KEYS) || pick(payload?.request, NAME_KEYS);
    const what = pick(body, DETAIL_KEYS);
    const phone = pick(body, PHONE_KEYS);
    const refId = String(payload?.id ?? payload?.request?.id ?? payload?.application?.id ?? payload?.booking?.id ?? "") || undefined;
    const text = [who, what].filter(Boolean).join(" — ") || "طلب جديد بانتظار المراجعة";
    recordAdminAlert({ kind: rule.kind, title: rule.title, body: text, screen: rule.screen, path: req.path, refId, phone })
      .catch((e) => logger.warn({ err: e?.message }, "[admin-alerts] record failed"))
      .finally(() => origJson(payload));
    return res;
  };
  next();
}

const router = Router();

async function requireStaff(req: Request, res: Response) {
  const u = await sessionUser(req);
  if (!isStaff(u)) { res.status(403).json({ error: "غير مصرح" }); return null; }
  return u!;
}

// GET /api/admin/alerts?after=<id>&limit=30
router.get("/admin/alerts", async (req, res) => {
  try {
    const u = await requireStaff(req, res); if (!u) return;
    await ensureAdminAlertsDb();
    const after = Math.max(0, Number(req.query.after) || 0);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const cur = await query(`SELECT last_seen_id FROM admin_alert_cursor WHERE user_id=$1`, [u.id]);
    const lastSeen = Number(cur.rows[0]?.last_seen_id ?? 0);
    const list = await query(`SELECT * FROM admin_alerts WHERE id>$1 ORDER BY id DESC LIMIT $2`, [after, limit]);
    const unread = await query(`SELECT COUNT(*)::int AS n FROM admin_alerts WHERE id>$1`, [lastSeen]);
    const max = await query(`SELECT COALESCE(MAX(id),0)::bigint AS m FROM admin_alerts`);
    res.json({ alerts: list.rows, unread: unread.rows[0].n, last_seen_id: lastSeen, latest_id: Number(max.rows[0].m) });
  } catch (e: any) { res.status(500).json({ error: e?.message || "Server error" }); }
});

// POST /api/admin/alerts/seen  { last_id }
router.post("/admin/alerts/seen", async (req, res) => {
  try {
    const u = await requireStaff(req, res); if (!u) return;
    await ensureAdminAlertsDb();
    const id = Math.max(0, Number(req.body?.last_id) || 0);
    await query(
      `INSERT INTO admin_alert_cursor(user_id,last_seen_id) VALUES($1,$2)
       ON CONFLICT(user_id) DO UPDATE SET last_seen_id=GREATEST(admin_alert_cursor.last_seen_id,EXCLUDED.last_seen_id), updated_at=NOW()`,
      [u.id, id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e?.message || "Server error" }); }
});

export default router;
