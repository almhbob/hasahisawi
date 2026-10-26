// ════════════════════════════════════════════════════════════════
// 💌 إدارة زواجل — الدخول بحساب الإدارة، أو بتفويض مشرف/مستخدم لإدارة القسم.
// (المسارات التشغيلية /admin/zawajil/* في hasahisawi.ts تستخدم canManageZawajil)
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, dbEnabled, type SessionUser } from "../lib/shared-db";

const router = Router();
const SECTION = "zawajil";

let ready: Promise<void> | null = null;
export function ensureSectionManagers(): Promise<void> {
  if (!dbEnabled) return Promise.resolve();
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS section_managers (
        section VARCHAR(40) NOT NULL,
        user_id INTEGER NOT NULL,
        granted_by INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (section, user_id)
      )`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export async function isSectionManager(userId: number, section = SECTION): Promise<boolean> {
  await ensureSectionManagers();
  const r = await query(`SELECT 1 FROM section_managers WHERE section=$1 AND user_id=$2`, [section, userId]);
  return r.rows.length > 0;
}

/** مسموح: الإدارة (admin) أو من مُنح إدارة القسم */
export async function canManageZawajil(user: SessionUser | null): Promise<boolean> {
  if (!user || user.is_banned) return false;
  if (user.role === "admin") return true;
  return isSectionManager(Number(user.id));
}

export async function zawajilManagerIds(): Promise<number[]> {
  await ensureSectionManagers();
  const r = await query(`SELECT user_id FROM section_managers WHERE section=$1
                         UNION SELECT id FROM users WHERE role='admin' AND COALESCE(is_banned,false)=false`, [SECTION]);
  return r.rows.map((x: any) => Number(x.user_id));
}

/** إشعار مدراء زواجل (مع الإدارة) */
export async function notifyZawajilManagers(title: string, body: string, data: Record<string, unknown> = {}) {
  try {
    const ids = await zawajilManagerIds();
    if (!ids.length) return;
    const { rows } = await query(`SELECT DISTINCT token FROM push_tokens WHERE user_id = ANY($1::int[]) AND token LIKE 'ExponentPushToken[%'`, [ids]);
    if (!rows.length) return;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title, body, sound: "hasahisawi_urgent", channelId: "hasahisawi-urgent-s2", priority: "high", data: { screen: "zawajil-manager", ...data } }))),
    }).finally(() => clearTimeout(t));
  } catch (e: any) { logger.warn({ err: e?.message }, "[zawajil] notify managers failed"); }
}

const digits = (s: unknown) => String(s ?? "").replace(/[^\d]/g, "");
function phoneVariants(raw: string): string[] {
  const d = digits(raw);
  if (!d) return [];
  const local = d.startsWith("249") ? "0" + d.slice(3) : d.startsWith("0") ? d : "0" + d;
  const intl = "249" + local.slice(1);
  return [...new Set([d, local, intl, "+" + intl, local.slice(1)])];
}

router.use("/zawajil-admin", async (_req, res, next) => {
  if (!dbEnabled) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  try { await ensureSectionManagers(); return next(); }
  catch (err) { logger.error({ err }, "[zawajil-admin] ensure"); return res.status(500).json({ error: "تعذّر التهيئة" }); }
});

// هل أملك صلاحية الإدارة؟
router.get("/zawajil-admin/access", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!me) return res.json({ allowed: false, reason: "login" });
    const allowed = await canManageZawajil(me);
    return res.json({ allowed, is_admin: me.role === "admin", name: me.name, role: me.role });
  } catch (err) { logger.error({ err }, "[zawajil-admin] access"); return res.status(500).json({ error: "خطأ" }); }
});

// لوحة الإحصاءات
router.get("/zawajil-admin/dashboard", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (!(await canManageZawajil(me))) return res.status(403).json({ error: "غير مصرح" });
    const [o, a, p] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status='pending_review')::int AS pending,
          COUNT(*) FILTER (WHERE status IN ('approved','preparing','sending'))::int AS active,
          COUNT(*) FILTER (WHERE status='completed')::int AS completed,
          COUNT(*) FILTER (WHERE status IN ('rejected','returned'))::int AS rejected,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')::int AS today,
          COALESCE(SUM(estimated_cost) FILTER (WHERE status='completed'),0)::float AS revenue
        FROM zawajil_orders`).catch(() => ({ rows: [{}] })),
      query(`SELECT COUNT(*) FILTER (WHERE status='pending')::int AS pending, COUNT(*)::int AS total FROM zawajil_applications`).catch(() => ({ rows: [{}] })),
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_available)::int AS available FROM zawajil_products`).catch(() => ({ rows: [{}] })),
    ]);
    const by = await query(`SELECT service_type, COUNT(*)::int AS n FROM zawajil_orders GROUP BY service_type ORDER BY n DESC`).catch(() => ({ rows: [] as any[] }));
    return res.json({ orders: o.rows[0], applications: a.rows[0], products: p.rows[0], by_service: by.rows });
  } catch (err) { logger.error({ err }, "[zawajil-admin] dashboard"); return res.status(500).json({ error: "خطأ" }); }
});

// ── المدراء المفوّضون (للإدارة فقط) ────────────────────────────
router.get("/zawajil-admin/managers", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (me?.role !== "admin") return res.status(403).json({ error: "للإدارة فقط" });
    const r = await query(`SELECT m.user_id AS id, u.name, u.phone, u.role, u.avatar_url, m.created_at
      FROM section_managers m JOIN users u ON u.id=m.user_id WHERE m.section=$1 ORDER BY m.created_at DESC`, [SECTION]);
    return res.json({ managers: r.rows });
  } catch (err) { logger.error({ err }, "[zawajil-admin] managers"); return res.status(500).json({ error: "خطأ" }); }
});

router.get("/zawajil-admin/candidates", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (me?.role !== "admin") return res.status(403).json({ error: "للإدارة فقط" });
    const q = String(req.query.q || "").trim();
    let r;
    if (q.length >= 2) {
      const vars = phoneVariants(q);
      r = await query(`SELECT id, name, phone, role, avatar_url FROM users
        WHERE COALESCE(is_banned,false)=false AND (name ILIKE $1 OR phone = ANY($2::text[])) ORDER BY (role='moderator') DESC, name LIMIT 20`, [`%${q}%`, vars]);
    } else {
      r = await query(`SELECT id, name, phone, role, avatar_url FROM users WHERE role IN ('moderator','admin') AND COALESCE(is_banned,false)=false ORDER BY role, name LIMIT 50`);
    }
    return res.json({ users: r.rows });
  } catch (err) { logger.error({ err }, "[zawajil-admin] candidates"); return res.status(500).json({ error: "خطأ" }); }
});

router.post("/zawajil-admin/managers", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (me?.role !== "admin") return res.status(403).json({ error: "للإدارة فقط" });
    let userId = Number(req.body?.user_id) || 0;
    if (!userId && req.body?.phone) {
      const u = await query(`SELECT id FROM users WHERE phone = ANY($1::text[]) LIMIT 1`, [phoneVariants(req.body.phone)]);
      userId = Number(u.rows[0]?.id) || 0;
    }
    if (!userId) return res.status(404).json({ error: "لم يُعثر على مستخدم بهذا الرقم" });
    const u = (await query(`SELECT id, name FROM users WHERE id=$1`, [userId])).rows[0];
    if (!u) return res.status(404).json({ error: "المستخدم غير موجود" });
    await query(`INSERT INTO section_managers (section, user_id, granted_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [SECTION, userId, Number(me.id)]);
    try {
      const { rows } = await query(`SELECT token FROM push_tokens WHERE user_id=$1 AND token LIKE 'ExponentPushToken[%'`, [userId]);
      if (rows.length) await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(2500),
        body: JSON.stringify(rows.map((r: any) => ({ to: r.token, title: "💌 صلاحية جديدة", body: "تم تكليفك بإدارة قسم زواجل — افتحه من القائمة ← بوابة مدير زواجل", sound: "hasahisawi_notif", channelId: "hasahisawi-default-s2", priority: "high", data: { screen: "zawajil-manager" } }))),
      });
    } catch {}
    return res.json({ ok: true, user: u });
  } catch (err) { logger.error({ err }, "[zawajil-admin] grant"); return res.status(500).json({ error: "خطأ" }); }
});

router.delete("/zawajil-admin/managers/:id", async (req: Request, res: Response) => {
  try {
    const me = await sessionUser(req);
    if (me?.role !== "admin") return res.status(403).json({ error: "للإدارة فقط" });
    await query(`DELETE FROM section_managers WHERE section=$1 AND user_id=$2`, [SECTION, Number(req.params.id)]);
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "[zawajil-admin] revoke"); return res.status(500).json({ error: "خطأ" }); }
});

export default router;
