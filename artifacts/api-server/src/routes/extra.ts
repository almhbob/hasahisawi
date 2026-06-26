import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import a, { initStabilizationDb } from "./stabilization";
import b, { initFoodPosDb } from "./food-pos";
import c, { initJoinRequestsDb } from "./join-requests";

const dbUrl = process.env.DATABASE_URL ?? "";
const pool = dbUrl && !dbUrl.includes(".invalid") && !dbUrl.includes("placeholder") && !dbUrl.includes("nodb")
  ? new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000,
      max: 10,
      allowExitOnIdle: false,
      ssl: dbUrl.includes("sslmode=require") || dbUrl.includes("ssl=true") || dbUrl.includes("railway") || dbUrl.includes("rlwy") ? { rejectUnauthorized: false } : false,
    })
  : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

async function ensureSupervisorDb() {
  if (!pool) return;
  await query(`CREATE TABLE IF NOT EXISTS supervisor_section_permissions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, section)
  )`);
  await query(`CREATE INDEX IF NOT EXISTS idx_supervisor_section_permissions_user ON supervisor_section_permissions(user_id)`);
}

async function getSessionUser(req: Request) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const tok = auth.slice(7);
  const r = await query(`
    SELECT u.* FROM users u
    JOIN user_sessions s ON s.user_id = u.id
    WHERE s.token=$1 AND (s.expires_at IS NULL OR s.expires_at > NOW())
    LIMIT 1
  `, [tok]);
  return r.rows[0] ?? null;
}

function cleanSections(v: unknown) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(x => String(x || "").trim()).filter(Boolean))];
}

const r = Router();
r.use(c);
r.use(a);
r.use(b);

r.get("/admin/me/permissions", async (req: Request, res: Response) => {
  try {
    await ensureSupervisorDb();
    const me = await getSessionUser(req);
    if (!me) return res.status(401).json({ error: "غير مصرح" });
    if (me.role === "admin") return res.json({ role: me.role, all: true, sections: ["*"] });
    if (me.role === "transport_supervisor") return res.json({ role: me.role, all: false, sections: ["/transport"] });
    const q = await query(`SELECT section FROM supervisor_section_permissions WHERE user_id=$1 ORDER BY section`, [me.id]);
    return res.json({ role: me.role, all: false, sections: q.rows.map(x => x.section) });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

r.get("/admin/users/:id/permissions", async (req: Request, res: Response) => {
  try {
    await ensureSupervisorDb();
    const me = await getSessionUser(req);
    if (me?.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const userId = Number(req.params.id);
    const q = await query(`SELECT section FROM supervisor_section_permissions WHERE user_id=$1 ORDER BY section`, [userId]);
    return res.json({ user_id: userId, sections: q.rows.map(x => x.section) });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

r.put("/admin/users/:id/permissions", async (req: Request, res: Response) => {
  try {
    await ensureSupervisorDb();
    const me = await getSessionUser(req);
    if (me?.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const userId = Number(req.params.id);
    const sections = cleanSections(req.body?.sections);
    await query(`UPDATE users SET role='moderator' WHERE id=$1 AND role <> 'admin'`, [userId]);
    await query(`DELETE FROM supervisor_section_permissions WHERE user_id=$1`, [userId]);
    for (const section of sections) {
      await query(`INSERT INTO supervisor_section_permissions(user_id, section) VALUES($1,$2) ON CONFLICT DO NOTHING`, [userId, section]);
    }
    return res.json({ ok: true, user_id: userId, sections });
  } catch { return res.status(500).json({ error: "Server error" }); }
});

r.patch("/admin/users/:id/role", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (me?.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const role = String(req.body?.role || "user");
    if (!["user", "moderator", "admin", "transport_supervisor"].includes(role)) return res.status(400).json({ error: "دور غير صحيح" });
    const q = await query(`UPDATE users SET role=$1 WHERE id=$2 RETURNING id,name,email,phone,role,is_banned,created_at`, [role, Number(req.params.id)]);
    if (!q.rows[0]) return res.status(404).json({ error: "المستخدم غير موجود" });
    return res.json(q.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

r.patch("/admin/users/:id/ban", async (req: Request, res: Response) => {
  try {
    const me = await getSessionUser(req);
    if (me?.role !== "admin") return res.status(403).json({ error: "غير مصرح" });
    const q = await query(`UPDATE users SET is_banned=$1 WHERE id=$2 RETURNING id,name,email,phone,role,is_banned,created_at`, [!!req.body?.ban, Number(req.params.id)]);
    if (!q.rows[0]) return res.status(404).json({ error: "المستخدم غير موجود" });
    return res.json(q.rows[0]);
  } catch { return res.status(500).json({ error: "Server error" }); }
});

export async function initExtraDb() {
  try { await initJoinRequestsDb(); } catch {}
  try { await initStabilizationDb(); } catch {}
  try { await initFoodPosDb(); } catch {}
  try { await ensureSupervisorDb(); } catch {}
}

export default r;
