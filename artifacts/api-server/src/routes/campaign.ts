// الحملة الإعلانية المجدولة — تعمل من خادم التطبيق نفسه (بدون n8n):
// - POST /api/campaign/run      ينشر منشور اليوم من calendar.json على القنوات المهيّأة.
//      المصادقة: رمز OIDC من GitHub Actions (هذا المستودع، فرع master، audience hasahisawi-campaign)
//      أو Authorization: Bearer CAMPAIGN_PUSH_KEY. كل قناة تُنشر مرة واحدة لكل يوم (لا تكرار).
//      phase=publish ينشر حاويات إنستغرام المعلّقة (الفيديو يحتاج دقائق للمعالجة).
// - POST /api/campaign/push     إشعار جماعي (n8n أو يدوياً) — مرة كل 20 ساعة كحد أقصى.
// - GET  /api/campaign/status   آخر ما نُشر وحالة القنوات.
// القنوات تُفعَّل بمتغيرات البيئة: FB_PAGE_ID + FB_PAGE_TOKEN، IG_USER_ID، TG_BOT_TOKEN + TG_CHAT_ID،
//      TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET (ثم ربط الحساب مرة عبر /api/tiktok/connect — انظر lib/tiktok.ts).
// عدة تقويمات: body.calendar = "main" (الافتراضي) أو "unsaid" (سلسلة «أشياء لا تقال»).
//      سجلات التقويمات الأخرى تُميَّز ببادئة في عمود channel (مثل "unsaid:tiktok").
// - GET  /api/tiktok/connect?key=CAMPAIGN_PUSH_KEY   ربط حساب تيك توك (مرة واحدة)
// - GET  /api/tiktok/callback                        يعود إليه تيك توك بعد الموافقة
import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";
import { query, dbEnabled } from "../lib/shared-db";
import { sendExpoPushBroadcast } from "./hasahisawi";
import { verifyGithubOidc } from "./ci-play-token";
import { tiktokConfigured, tiktokAuthUrl, tiktokHandleCallback, tiktokStatus, tiktokPostVideo, tiktokPublishStatus } from "../lib/tiktok";

const router = Router();
const COOLDOWN_HOURS = 20;
const CALENDARS: Record<string, string> = {
  main: process.env.CAMPAIGN_CALENDAR_URL || "https://hasahisawi.pages.dev/campaign/calendar.json",
  unsaid: process.env.CAMPAIGN_UNSAID_CALENDAR_URL || "https://hasahisawi.pages.dev/campaign/unsaid/calendar.json",
};
const GRAPH = "https://graph.facebook.com/v21.0";

function keyOk(req: Request): boolean {
  const want = process.env.CAMPAIGN_PUSH_KEY || "";
  if (want.length < 24) return false;
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function authOk(req: Request): Promise<string | null> {
  if (keyOk(req)) return "key";
  const tok = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (tok.split(".").length === 3) {
    try { const c = await verifyGithubOidc(tok, "hasahisawi-campaign"); return `gh:${c.workflow || "?"}`; } catch { /* fallthrough */ }
  }
  return null;
}

let ready: Promise<void> | null = null;
const ensure = () => (ready ??= (async () => {
  await query(`CREATE TABLE IF NOT EXISTS campaign_push_log (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, day INT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query(`CREATE TABLE IF NOT EXISTS campaign_runs (
    id SERIAL PRIMARY KEY, day INT NOT NULL, channel VARCHAR(20) NOT NULL, status VARCHAR(20) NOT NULL,
    ref TEXT, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (day, channel))`);
})());

type Item = { day: number; type: "video" | "image"; file: string; ig_file: string | null; caption: string; caption_short?: string; push: { title: string; body: string } | null };
type Calendar = { base_url: string; start_date: string; timezone?: string; channels?: string[]; items: Item[] };

async function loadCalendar(name: string): Promise<Calendar> {
  const r = await fetch(`${CALENDARS[name]}?t=${Date.now()}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`calendar ${r.status}`);
  return (await r.json()) as Calendar;
}
function todayIndex(cal: Calendar): number {
  const tz = cal.timezone || "Asia/Riyadh";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const today = Date.UTC(+parts.slice(0, 4), +parts.slice(5, 7) - 1, +parts.slice(8, 10));
  const [y, m, d] = cal.start_date.split("-").map(Number);
  return Math.round((today - Date.UTC(y, m - 1, d)) / 86400000) + 1;
}

async function doPush(title: string, body: string, day: number | null) {
  const last = (await query(`SELECT created_at FROM campaign_push_log ORDER BY id DESC LIMIT 1`)).rows[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < COOLDOWN_HOURS * 3600_000) {
    return { ok: false, status: 429, error: `cooldown: one campaign push per ${COOLDOWN_HOURS}h` };
  }
  await query(`INSERT INTO campaign_push_log (title, body, day) VALUES ($1,$2,$3)`, [title, body, day]);
  const data = { screen: "home", campaign: true };
  await query(`INSERT INTO notifications (user_id, type, title, body, data) SELECT id, 'broadcast', $1, $2, $3 FROM users`,
    [title, body, JSON.stringify(data)]).catch((e) => logger.warn({ err: e?.message }, "[campaign] notifications insert"));
  await sendExpoPushBroadcast(title, body, data);
  const n = (await query(`SELECT COUNT(*)::int AS n FROM push_tokens WHERE token LIKE 'ExponentPushToken%'`)).rows[0]?.n ?? 0;
  return { ok: true, status: 200, devices: n };
}

async function graphPost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: process.env.FB_PAGE_TOKEN || "" });
  const r = await fetch(`${GRAPH}/${path}`, { method: "POST", body, signal: AbortSignal.timeout(45000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j?.error?.message || `graph ${r.status}`);
  return j;
}
async function tgSend(item: Item, url: string) {
  const method = item.type === "video" ? "sendVideo" : "sendPhoto";
  const r = await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ chat_id: process.env.TG_CHAT_ID, [item.type === "video" ? "video" : "photo"]: url, caption: item.caption.slice(0, 1024) }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j?.description || `telegram ${r.status}`);
  return String(j.result?.message_id ?? "");
}

const channels = () => ({
  facebook: !!(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN),
  instagram: !!(process.env.IG_USER_ID && process.env.FB_PAGE_TOKEN),
  telegram: !!(process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID),
  tiktok: tiktokConfigured(),
  push: true,
});

async function claim(day: number, ch: string, force: boolean): Promise<boolean> {
  if (force) await query(`DELETE FROM campaign_runs WHERE day=$1 AND channel=$2`, [day, ch]);
  const r = await query(`INSERT INTO campaign_runs (day, channel, status) VALUES ($1,$2,'running') ON CONFLICT (day, channel) DO NOTHING RETURNING id`, [day, ch]);
  return !!r.rows[0];
}
const done = (day: number, ch: string, status: string, ref?: string | null, error?: string | null) =>
  query(`UPDATE campaign_runs SET status=$3, ref=$4, error=$5, updated_at=NOW() WHERE day=$1 AND channel=$2`, [day, ch, status, ref ?? null, error ? error.slice(0, 500) : null]);

router.post("/campaign/run", async (req: Request, res: Response) => {
  const who = await authOk(req);
  if (!who) return res.status(401).json({ error: "unauthorized" });
  if (!dbEnabled) return res.status(503).json({ error: "db" });
  try {
    await ensure();
    const phase = String(req.query.phase || req.body?.phase || "post");
    const force = req.body?.force === true;
    const only: string[] | null = Array.isArray(req.body?.only) ? req.body.only : null;
    const calName = String(req.body?.calendar || req.query.calendar || "main");
    if (!CALENDARS[calName]) return res.status(400).json({ error: "unknown calendar" });
    const cal = await loadCalendar(calName);
    const want = (ch: string) => (!only || only.includes(ch)) && (!cal.channels || cal.channels.includes(ch));
    // مفتاح السجل لكل قناة: التقويم الرئيسي بدون بادئة (توافق مع السجلات القديمة)
    const K = (ch: string) => (calName === "main" ? ch : `${calName}:${ch}`);
    const claimK = (d: number, ch: string, f: boolean) => claim(d, K(ch), f);
    const doneK = (d: number, ch: string, st: string, ref?: string | null, err?: string | null) => done(d, K(ch), st, ref, err);
    const day = Number.isInteger(Number(req.body?.day)) && Number(req.body.day) > 0 ? Number(req.body.day) : todayIndex(cal);
    const item = cal.items.find((x) => x.day === day);
    const out: Record<string, any> = { calendar: calName, day, phase, by: who, enabled: channels() };
    if (!item) return res.json({ ...out, skipped: "no post for this day" });
    const url = cal.base_url + item.file;
    const en = channels();

    if (phase === "publish") {
      // إنستغرام: نشر الحاوية المعلّقة
      const p = (await query(`SELECT ref FROM campaign_runs WHERE day=$1 AND channel=$2 AND status='container'`, [day, K("instagram")])).rows[0];
      if (p?.ref && en.instagram) {
        try {
          const st: any = await (await fetch(`${GRAPH}/${p.ref}?fields=status_code&access_token=${process.env.FB_PAGE_TOKEN}`)).json();
          if (st.status_code && st.status_code !== "FINISHED") { out.instagram = { waiting: st.status_code }; }
          else { const j = await graphPost(`${process.env.IG_USER_ID}/media_publish`, { creation_id: p.ref }); await doneK(day, "instagram", "posted", j.id); out.instagram = { posted: j.id }; }
        } catch (e: any) { await doneK(day, "instagram", "error", p.ref, e.message); out.instagram = { error: e.message }; }
      }
      // تيك توك: متابعة حالة المعالجة
      const t = (await query(`SELECT ref FROM campaign_runs WHERE day=$1 AND channel=$2 AND status='processing'`, [day, K("tiktok")])).rows[0];
      if (t?.ref) {
        try {
          const st = await tiktokPublishStatus(t.ref);
          if (st.status === "FAILED") { await doneK(day, "tiktok", "error", t.ref, st.fail_reason || "failed"); out.tiktok = { error: st.fail_reason }; }
          else if (st.status === "PUBLISH_COMPLETE" || st.status === "SEND_TO_USER_INBOX") { await doneK(day, "tiktok", "posted", t.ref); out.tiktok = { posted: t.ref, status: st.status }; }
          else out.tiktok = { waiting: st.status };
        } catch (e: any) { out.tiktok = { error: e.message }; }
      }
      return res.json(out);
    }

    if (en.facebook && want("facebook") && await claimK(day, "facebook", force)) {
      try {
        const j = item.type === "video"
          ? await graphPost(`${process.env.FB_PAGE_ID}/videos`, { file_url: url, description: item.caption })
          : await graphPost(`${process.env.FB_PAGE_ID}/photos`, { url, caption: item.caption });
        await doneK(day, "facebook", "posted", j.post_id || j.id); out.facebook = { posted: j.post_id || j.id };
      } catch (e: any) { await doneK(day, "facebook", "error", null, e.message); out.facebook = { error: e.message }; }
    }
    if (en.instagram && want("instagram") && item.ig_file && await claimK(day, "instagram", force)) {
      try {
        const igUrl = cal.base_url + item.ig_file;
        const j = item.type === "video"
          ? await graphPost(`${process.env.IG_USER_ID}/media`, { media_type: "REELS", video_url: igUrl, caption: item.caption, share_to_feed: "true" })
          : await graphPost(`${process.env.IG_USER_ID}/media`, { image_url: igUrl, caption: item.caption });
        await doneK(day, "instagram", "container", j.id); out.instagram = { container: j.id, note: "publish phase posts it" };
      } catch (e: any) { await doneK(day, "instagram", "error", null, e.message); out.instagram = { error: e.message }; }
    }
    if (en.telegram && want("telegram") && await claimK(day, "telegram", force)) {
      try { const id = await tgSend(item, url); await doneK(day, "telegram", "posted", id); out.telegram = { posted: id }; }
      catch (e: any) { await doneK(day, "telegram", "error", null, e.message); out.telegram = { error: e.message }; }
    }
    if (item.push && want("push") && await claimK(day, "push", force)) {
      try { const r = await doPush(item.push.title, item.push.body, day); await doneK(day, "push", r.ok ? "posted" : "skipped", null, r.ok ? null : r.error); out.push = r; }
      catch (e: any) { await doneK(day, "push", "error", null, e.message); out.push = { error: e.message }; }
    }
    if (en.tiktok && want("tiktok") && item.type === "video" && await claimK(day, "tiktok", force)) {
      try {
        const r = await tiktokPostVideo(url, item.caption);
        await doneK(day, "tiktok", "processing", r.publish_id); out.tiktok = { publish_id: r.publish_id, note: r.note };
      } catch (e: any) { await doneK(day, "tiktok", "error", null, e.message); out.tiktok = { error: e.message }; }
    }
    logger.info(out, "[campaign] run");
    return res.json(out);
  } catch (err: any) {
    logger.error({ err }, "[campaign] run");
    return res.status(500).json({ error: err?.message || "run failed" });
  }
});

// POST /api/campaign/push  { title, body, day? } — للاستخدام اليدوي أو من n8n
router.post("/campaign/push", async (req: Request, res: Response) => {
  if (!keyOk(req)) return res.status(401).json({ error: "unauthorized" });
  if (!dbEnabled) return res.status(503).json({ error: "db" });
  try {
    await ensure();
    const title = String(req.body?.title || "").trim().slice(0, 80);
    const body = String(req.body?.body || "").trim().slice(0, 200);
    if (title.length < 3 || body.length < 3) return res.status(400).json({ error: "title/body required" });
    const day = Number.isInteger(Number(req.body?.day)) ? Number(req.body.day) : null;
    const r = await doPush(title, body, day);
    return res.status(r.status).json(r);
  } catch (err) {
    logger.error({ err }, "[campaign] push");
    return res.status(500).json({ error: "push failed" });
  }
});

router.get("/campaign/status", async (req: Request, res: Response) => {
  if (!(await authOk(req))) return res.status(401).json({ error: "unauthorized" });
  try {
    await ensure();
    const runs = await query(`SELECT day, channel, status, ref, error, updated_at FROM campaign_runs ORDER BY day DESC, channel LIMIT 40`);
    const pushes = await query(`SELECT title, day, created_at FROM campaign_push_log ORDER BY id DESC LIMIT 10`);
    return res.json({ enabled: channels(), runs: runs.rows, pushes: pushes.rows, cooldown_hours: COOLDOWN_HOURS });
  } catch { return res.status(500).json({ error: "status failed" }); }
});

// ── ربط حساب تيك توك ───────────────────────────────────────────
router.get("/tiktok/connect", async (req: Request, res: Response) => {
  const want = process.env.CAMPAIGN_PUSH_KEY || "";
  const got = String(req.query.key || "");
  const a = Buffer.from(got), b = Buffer.from(want);
  if (want.length < 24 || a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).send("unauthorized");
  if (!tiktokConfigured()) return res.status(503).send("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set");
  if (!dbEnabled) return res.status(503).send("db");
  try { return res.redirect(await tiktokAuthUrl()); }
  catch (e: any) { return res.status(500).send(e?.message || "error"); }
});

router.get("/tiktok/callback", async (req: Request, res: Response) => {
  const page = (msg: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;direction:rtl;padding:24px">${msg}</body>`;
  if (req.query.error) return res.status(400).send(page(`❌ رفض تيك توك الطلب: ${String(req.query.error_description || req.query.error).replace(/[<>&]/g, "")}`));
  try {
    const r = await tiktokHandleCallback(String(req.query.code || ""), String(req.query.state || ""));
    logger.info({ open_id: r.open_id, scope: r.scope }, "[tiktok] connected");
    return res.send(page(`✅ تم ربط حساب تيك توك بنجاح. سينشر الخادم فيديوهات الحملة تلقائياً.<br><small>الصلاحيات: ${String(r.scope).replace(/[<>&]/g, "")}</small>`));
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[tiktok] callback");
    return res.status(400).send(page(`❌ فشل الربط: ${String(e?.message || "").replace(/[<>&]/g, "")}`));
  }
});

router.get("/tiktok/status", async (req: Request, res: Response) => {
  if (!(await authOk(req))) return res.status(401).json({ error: "unauthorized" });
  try { return res.json(await tiktokStatus()); }
  catch (e: any) { return res.status(500).json({ error: e?.message }); }
});

export default router;
