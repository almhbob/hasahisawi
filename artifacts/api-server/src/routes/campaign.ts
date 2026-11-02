// إشعارات الحملة الإعلانية المجدولة (n8n): إشعار جماعي لكل مستخدمي التطبيق.
// المصادقة بمفتاح سرّي في متغير البيئة CAMPAIGN_PUSH_KEY (يُخزَّن في n8n كـ Header Auth).
// حماية من الإزعاج: إشعار حملة واحد كل 20 ساعة كحد أقصى، والنص محدود الطول.
import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";
import { query, dbEnabled } from "../lib/shared-db";
import { sendExpoPushBroadcast } from "./hasahisawi";

const router = Router();
const COOLDOWN_HOURS = 20;

function keyOk(req: Request): boolean {
  const want = process.env.CAMPAIGN_PUSH_KEY || "";
  if (want.length < 24) return false;
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

let ready: Promise<void> | null = null;
const ensure = () => (ready ??= query(`CREATE TABLE IF NOT EXISTS campaign_push_log (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, day INT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).then(() => undefined));

// POST /api/campaign/push  { title, body, day?, url? }
router.post("/campaign/push", async (req: Request, res: Response) => {
  if (!keyOk(req)) return res.status(401).json({ error: "unauthorized" });
  if (!dbEnabled) return res.status(503).json({ error: "db" });
  try {
    await ensure();
    const title = String(req.body?.title || "").trim().slice(0, 80);
    const body = String(req.body?.body || "").trim().slice(0, 200);
    if (title.length < 3 || body.length < 3) return res.status(400).json({ error: "title/body required" });
    const last = (await query(`SELECT created_at FROM campaign_push_log ORDER BY id DESC LIMIT 1`)).rows[0];
    if (last && Date.now() - new Date(last.created_at).getTime() < COOLDOWN_HOURS * 3600_000) {
      return res.status(429).json({ error: `cooldown: one campaign push per ${COOLDOWN_HOURS}h`, last: last.created_at });
    }
    const day = Number.isInteger(Number(req.body?.day)) ? Number(req.body.day) : null;
    await query(`INSERT INTO campaign_push_log (title, body, day) VALUES ($1,$2,$3)`, [title, body, day]);
    const data = { screen: "home", campaign: true, url: typeof req.body?.url === "string" ? req.body.url.slice(0, 200) : undefined };
    await query(`INSERT INTO notifications (user_id, type, title, body, data) SELECT id, 'broadcast', $1, $2, $3 FROM users`,
      [title, body, JSON.stringify(data)]).catch((e) => logger.warn({ err: e?.message }, "[campaign] notifications insert"));
    await sendExpoPushBroadcast(title, body, data);
    const n = (await query(`SELECT COUNT(*)::int AS n FROM push_tokens WHERE token LIKE 'ExponentPushToken%'`)).rows[0]?.n ?? 0;
    logger.info({ title, day, devices: n }, "[campaign] push sent");
    return res.json({ ok: true, devices: n });
  } catch (err) {
    logger.error({ err }, "[campaign] push");
    return res.status(500).json({ error: "push failed" });
  }
});

// GET /api/campaign/status — آخر إشعارات الحملة (نفس المفتاح)
router.get("/campaign/status", async (req: Request, res: Response) => {
  if (!keyOk(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    await ensure();
    const r = await query(`SELECT title, day, created_at FROM campaign_push_log ORDER BY id DESC LIMIT 10`);
    return res.json({ recent: r.rows, cooldown_hours: COOLDOWN_HOURS });
  } catch { return res.status(500).json({ error: "status failed" }); }
});

export default router;
