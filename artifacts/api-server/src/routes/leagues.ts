// ════════════════════════════════════════════════════════════════
// 🏆 الدوريات والبطولات — تنظيم احترافي:
//  • دوري بنظام النقاط (ذهاب أو ذهاب وإياب) أو مجموعات، مع مولّد جدول آلي (طريقة الدائرة).
//  • جدول ترتيب محسوب من النتائج لكل مجموعة: لعب/فوز/تعادل/خسارة/له/عليه/الفارق/النقاط/آخر 5.
//  • أحداث المباراة (أهداف، بطاقات، تبديلات) وقائمة الهدافين.
//  • الأدوار: اللجنة المنظمة (كل شيء)، الحكام (نتيجة مبارياتهم المسندة إليهم وتقريرها وأحداثها)،
//    موظفو البوابة (التحقق من التذاكر). المنشئ عضو في اللجنة المنظمة تلقائياً.
//  • التذاكر للملاعب المغلقة: فئات لكل مباراة بسعر وسعة، حجز برمز فريد، تأكيد الدفع من اللجنة،
//    ومسح عند البوابة يُستخدم مرة واحدة فقط.
// ════════════════════════════════════════════════════════════════
import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { logger } from "../lib/logger";
import { query, sessionUser, dbClient, type SessionUser } from "../lib/shared-db";
import { writeLimiter } from "../lib/rate-limiters";

const router = Router();
// كل المسارات هنا غير متزامنة: نلتقط أي خطأ ونرد JSON بدل صفحة خطأ Express (ولا تتعطل العملية)
for (const method of ["get", "post", "patch", "put", "delete"] as const) {
  const original = (router as any)[method].bind(router);
  (router as any)[method] = (path: string, ...handlers: any[]) => original(path, ...handlers.map((h) =>
    (req: Request, res: Response, next: any) => Promise.resolve(h(req, res, next)).catch((err: any) => {
      logger.error({ err: err?.message, path }, "[leagues] route error");
      if (!res.headersSent) res.status(500).json({ error: "حدث خطأ في الخادم" });
    })));
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const httpsUrl = (v: unknown) => (/^https:\/\/\S+$/i.test(String(v ?? "")) ? String(v).slice(0, 500) : null);
const int = (v: unknown, d = 0) => { const n = parseInt(String(v ?? ""), 10); return Number.isFinite(n) ? n : d; };
const SPORTS = ["football", "basketball", "volleyball", "handball", "other"];
const FORMATS = ["league", "groups", "cup"];
const ROLES = ["organizer", "referee", "gate"] as const;
type Role = typeof ROLES[number];
const EVENT_TYPES = ["goal", "own_goal", "penalty_goal", "yellow", "red", "sub", "penalty_miss"];
const MATCH_STATUS = ["scheduled", "live", "finished", "postponed", "cancelled"];

let ready: Promise<void> | null = null;
export function ensureLeaguesDb(): Promise<void> {
  return (ready ??= (async () => {
    await query(`CREATE TABLE IF NOT EXISTS leagues (
      id SERIAL PRIMARY KEY, name VARCHAR(160) NOT NULL, season VARCHAR(40), sport VARCHAR(20) NOT NULL DEFAULT 'football',
      format VARCHAR(12) NOT NULL DEFAULT 'league', logo_url TEXT, cover_url TEXT, description TEXT, rules TEXT,
      points_win INTEGER NOT NULL DEFAULT 3, points_draw INTEGER NOT NULL DEFAULT 1, points_loss INTEGER NOT NULL DEFAULT 0,
      venue VARCHAR(200), start_date DATE, end_date DATE, primary_color VARCHAR(9),
      status VARCHAR(14) NOT NULL DEFAULT 'registration', approved BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS league_staff (
      league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL, role VARCHAR(12) NOT NULL, title VARCHAR(80),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (league_id, user_id, role))`);
    await query(`CREATE TABLE IF NOT EXISTS league_teams (
      id SERIAL PRIMARY KEY, league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      club_id INTEGER, name VARCHAR(120) NOT NULL, short_name VARCHAR(30), logo_url TEXT, color VARCHAR(9),
      group_name VARCHAR(10), coach VARCHAR(120), manager_name VARCHAR(120), manager_phone VARCHAR(30),
      status VARCHAR(10) NOT NULL DEFAULT 'approved', registered_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`ALTER TABLE league_teams ADD COLUMN IF NOT EXISTS color2 VARCHAR(9)`);
    await query(`CREATE TABLE IF NOT EXISTS league_players (
      id SERIAL PRIMARY KEY, team_id INTEGER NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL, number INTEGER, position VARCHAR(30), photo_url TEXT)`);
    await query(`CREATE TABLE IF NOT EXISTS league_matches (
      id SERIAL PRIMARY KEY, league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
      round INTEGER NOT NULL DEFAULT 1, stage VARCHAR(60), group_name VARCHAR(10),
      home_team_id INTEGER REFERENCES league_teams(id) ON DELETE CASCADE,
      away_team_id INTEGER REFERENCES league_teams(id) ON DELETE CASCADE,
      kickoff TIMESTAMPTZ, venue VARCHAR(200), status VARCHAR(12) NOT NULL DEFAULT 'scheduled',
      home_score INTEGER, away_score INTEGER, referee_user_id INTEGER, referee_name VARCHAR(120),
      assistants VARCHAR(250), referee_report TEXT, tickets_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS league_matches_lg_idx ON league_matches(league_id, round)`);
    await query(`CREATE TABLE IF NOT EXISTS league_match_events (
      id SERIAL PRIMARY KEY, match_id INTEGER NOT NULL REFERENCES league_matches(id) ON DELETE CASCADE,
      minute INTEGER, type VARCHAR(14) NOT NULL, team_id INTEGER, player_name VARCHAR(120), note VARCHAR(160),
      created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS league_ticket_types (
      id SERIAL PRIMARY KEY, match_id INTEGER NOT NULL REFERENCES league_matches(id) ON DELETE CASCADE,
      name VARCHAR(60) NOT NULL, price NUMERIC(12,2) NOT NULL DEFAULT 0, capacity INTEGER NOT NULL DEFAULT 0, note VARCHAR(160))`);
    await query(`CREATE TABLE IF NOT EXISTS league_tickets (
      id SERIAL PRIMARY KEY, code VARCHAR(16) NOT NULL UNIQUE,
      match_id INTEGER NOT NULL REFERENCES league_matches(id) ON DELETE CASCADE,
      type_id INTEGER NOT NULL REFERENCES league_ticket_types(id) ON DELETE CASCADE,
      user_id INTEGER, holder_name VARCHAR(120), phone VARCHAR(30),
      status VARCHAR(10) NOT NULL DEFAULT 'reserved', used_at TIMESTAMPTZ, used_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await query(`CREATE INDEX IF NOT EXISTS league_tickets_user_idx ON league_tickets(user_id)`);
  })().catch((e) => { ready = null; throw e; }));
}

// ── الصلاحيات ─────────────────────────────────────────────
/** إدارة الرياضة: مدير التطبيق، أو المشرف الممنوح صلاحية «الرياضة والدوريات» (leagues) */
export async function isSportsAdmin(u: SessionUser | null): Promise<boolean> {
  if (!u) return false;
  if (u.role === "admin") return true;
  if (u.role !== "moderator") return false;
  const r = await query(`SELECT 1 FROM moderator_permissions WHERE user_id=$1 AND section='leagues' LIMIT 1`, [u.id]).catch(() => ({ rows: [] as any[] }));
  return r.rows.length > 0;
}

async function rolesOf(u: SessionUser | null, leagueId: number): Promise<Set<Role | "admin">> {
  const s = new Set<Role | "admin">();
  if (!u) return s;
  if (await isSportsAdmin(u)) { s.add("admin"); s.add("organizer"); }
  const r = await query(`SELECT role FROM league_staff WHERE league_id=$1 AND user_id=$2`, [leagueId, u.id]);
  for (const x of r.rows) s.add(x.role);
  return s;
}
const isOrg = (r: Set<string>) => r.has("organizer");
async function leagueOfMatch(mid: number): Promise<any | null> {
  return (await query(`SELECT m.*, l.points_win, l.points_draw, l.points_loss FROM league_matches m JOIN leagues l ON l.id=m.league_id WHERE m.id=$1`, [mid])).rows[0] ?? null;
}
async function deny(res: Response, msg = "هذا الإجراء للجنة المنظمة فقط") { return res.status(403).json({ error: msg }); }

// ── جدول الترتيب والهدافون ─────────────────────────────────
export function computeStandings(teams: any[], matches: any[], pts = { w: 3, d: 1, l: 0 }) {
  type Row = { team_id: number; name: string; short_name: string | null; logo_url: string | null; color: string | null; color2?: string | null; group: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number; form: string[] };
  const rows = new Map<number, Row>();
  for (const t of teams) if (t.status === "approved") rows.set(t.id, { team_id: t.id, name: t.name, short_name: t.short_name, logo_url: t.logo_url, color: t.color, color2: t.color2, group: t.group_name || "", p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] });
  const done = matches.filter(m => m.status === "finished" && m.home_score != null && m.away_score != null)
    .sort((a, b) => +new Date(a.kickoff || 0) - +new Date(b.kickoff || 0));
  for (const m of done) {
    const h = rows.get(m.home_team_id), a = rows.get(m.away_team_id);
    if (!h || !a) continue;
    const hs = Number(m.home_score), as = Number(m.away_score);
    h.p++; a.p++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) { h.w++; a.l++; h.pts += pts.w; a.pts += pts.l; h.form.push("W"); a.form.push("L"); }
    else if (hs < as) { a.w++; h.l++; a.pts += pts.w; h.pts += pts.l; a.form.push("W"); h.form.push("L"); }
    else { h.d++; a.d++; h.pts += pts.d; a.pts += pts.d; h.form.push("D"); a.form.push("D"); }
  }
  const groups: Record<string, Row[]> = {};
  for (const r of rows.values()) {
    r.gd = r.gf - r.ga; r.form = r.form.slice(-5).reverse();
    (groups[r.group] ??= []).push(r);
  }
  for (const g of Object.values(groups)) g.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name, "ar"));
  return groups;
}

// ── القراءة العامة ─────────────────────────────────────────
router.get("/leagues", async (req: Request, res: Response) => {
  try {
    await ensureLeaguesDb();
    const u = await sessionUser(req);
    const r = await query(
      `SELECT l.*, (SELECT COUNT(*)::int FROM league_teams t WHERE t.league_id=l.id AND t.status='approved') AS teams_count,
              (SELECT COUNT(*)::int FROM league_matches m WHERE m.league_id=l.id) AS matches_count,
              (SELECT COUNT(*)::int FROM league_matches m WHERE m.league_id=l.id AND m.status='live') AS live_count,
              EXISTS (SELECT 1 FROM league_staff s WHERE s.league_id=l.id AND s.user_id=$1) AS is_staff
         FROM leagues l
        WHERE l.approved OR l.created_by=$1 OR $2
        ORDER BY (l.status='running') DESC, l.updated_at DESC`, [u?.id ?? 0, await isSportsAdmin(u)]);
    return res.json({ leagues: r.rows, can_manage: await isSportsAdmin(u) });
  } catch (e: any) { logger.error({ err: e?.message }, "leagues list"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

router.get("/leagues/:id", async (req: Request, res: Response) => {
  try {
    await ensureLeaguesDb();
    const id = int(req.params.id);
    const l = (await query(`SELECT * FROM leagues WHERE id=$1`, [id])).rows[0];
    if (!l) return res.status(404).json({ error: "الدوري غير موجود" });
    const u = await sessionUser(req);
    const roles = await rolesOf(u, id);
    if (!l.approved && !roles.size && l.created_by !== u?.id) return res.status(404).json({ error: "الدوري غير موجود" });
    const [teams, matches, staff, scorers] = await Promise.all([
      query(`SELECT t.*, (SELECT COUNT(*)::int FROM league_players p WHERE p.team_id=t.id) AS players_count FROM league_teams t WHERE t.league_id=$1 ORDER BY t.group_name NULLS LAST, t.name`, [id]),
      query(`SELECT * FROM league_matches WHERE league_id=$1 ORDER BY round, kickoff NULLS LAST, id`, [id]),
      query(`SELECT s.user_id, s.role, s.title, u.name FROM league_staff s LEFT JOIN users u ON u.id=s.user_id WHERE s.league_id=$1 ORDER BY s.role, u.name`, [id]),
      query(`SELECT e.player_name, e.team_id, t.name AS team_name, t.logo_url, COUNT(*)::int AS goals
               FROM league_match_events e JOIN league_matches m ON m.id=e.match_id JOIN league_teams t ON t.id=e.team_id
              WHERE m.league_id=$1 AND e.type IN ('goal','penalty_goal') AND COALESCE(e.player_name,'')<>''
              GROUP BY e.player_name, e.team_id, t.name, t.logo_url ORDER BY goals DESC, e.player_name LIMIT 20`, [id]),
    ]);
    const visibleTeams = isOrg(roles) ? teams.rows : teams.rows.filter((t: any) => t.status === "approved");
    const standings = computeStandings(teams.rows, matches.rows, { w: l.points_win, d: l.points_draw, l: l.points_loss });
    return res.json({ league: l, teams: visibleTeams, matches: matches.rows, standings, scorers: scorers.rows, staff: staff.rows, roles: [...roles] });
  } catch (e: any) { logger.error({ err: e?.message }, "league get"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

router.get("/leagues/matches/:mid", async (req: Request, res: Response) => {
  try {
    await ensureLeaguesDb();
    const m = await leagueOfMatch(int(req.params.mid));
    if (!m) return res.status(404).json({ error: "المباراة غير موجودة" });
    const u = await sessionUser(req);
    const [league, teams, events, types, roles] = await Promise.all([
      query(`SELECT id, name, season, logo_url, primary_color, approved, created_by FROM leagues WHERE id=$1`, [m.league_id]),
      query(`SELECT t.*, COALESCE((SELECT json_agg(p ORDER BY p.number NULLS LAST, p.name) FROM league_players p WHERE p.team_id=t.id), '[]') AS players
               FROM league_teams t WHERE t.id IN ($1,$2)`, [m.home_team_id, m.away_team_id]),
      query(`SELECT * FROM league_match_events WHERE match_id=$1 ORDER BY minute NULLS LAST, id`, [m.id]),
      query(`SELECT tt.*, (SELECT COUNT(*)::int FROM league_tickets k WHERE k.type_id=tt.id AND k.status<>'cancelled') AS sold
               FROM league_ticket_types tt WHERE tt.match_id=$1 ORDER BY tt.price DESC`, [m.id]),
      rolesOf(u, m.league_id),
    ]);
    const home = teams.rows.find((t: any) => t.id === m.home_team_id), away = teams.rows.find((t: any) => t.id === m.away_team_id);
    const canReferee = isOrg(roles) || (roles.has("referee") && m.referee_user_id === u?.id);
    return res.json({ match: m, league: league.rows[0], home, away, events: events.rows, ticket_types: types.rows, roles: [...roles], can_referee: canReferee });
  } catch (e: any) { logger.error({ err: e?.message }, "league match get"); return res.status(500).json({ error: "تعذّر التحميل" }); }
});

// ── الإنشاء والتعديل ───────────────────────────────────────
function leagueFields(b: any) {
  const f: Record<string, unknown> = {};
  if (b?.name !== undefined) f.name = clip(b.name, 160);
  if (b?.season !== undefined) f.season = clip(b.season, 40) || null;
  if (b?.sport !== undefined && SPORTS.includes(b.sport)) f.sport = b.sport;
  if (b?.format !== undefined && FORMATS.includes(b.format)) f.format = b.format;
  if (b?.logo_url !== undefined) f.logo_url = httpsUrl(b.logo_url);
  if (b?.cover_url !== undefined) f.cover_url = httpsUrl(b.cover_url);
  if (b?.description !== undefined) f.description = clip(b.description, 2000) || null;
  if (b?.rules !== undefined) f.rules = clip(b.rules, 4000) || null;
  if (b?.venue !== undefined) f.venue = clip(b.venue, 200) || null;
  if (b?.primary_color !== undefined) f.primary_color = /^#[0-9a-f]{6}$/i.test(b.primary_color) ? b.primary_color : null;
  if (b?.start_date !== undefined) f.start_date = /^\d{4}-\d{2}-\d{2}$/.test(b.start_date) ? b.start_date : null;
  if (b?.end_date !== undefined) f.end_date = /^\d{4}-\d{2}-\d{2}$/.test(b.end_date) ? b.end_date : null;
  if (b?.status !== undefined && ["registration", "running", "finished"].includes(b.status)) f.status = b.status;
  for (const k of ["points_win", "points_draw", "points_loss"]) if (b?.[k] !== undefined) f[k] = Math.max(0, Math.min(10, int(b[k])));
  return f;
}

router.post("/leagues", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول لإنشاء دوري" });
  try {
    await ensureLeaguesDb();
    const f = leagueFields(req.body);
    if (!f.name || String(f.name).length < 3) return res.status(400).json({ error: "اسم الدوري مطلوب" });
    const keys = Object.keys(f);
    const sportsAdmin = await isSportsAdmin(u);
    const r = await query(
      `INSERT INTO leagues (${keys.join(",")}, created_by, approved) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}, $${keys.length + 1}, $${keys.length + 2}) RETURNING *`,
      [...keys.map(k => f[k]), u.id, sportsAdmin]);
    await query(`INSERT INTO league_staff (league_id, user_id, role, title) VALUES ($1,$2,'organizer','رئيس اللجنة المنظمة') ON CONFLICT DO NOTHING`, [r.rows[0].id, u.id]);
    return res.status(201).json({ league: r.rows[0], message: sportsAdmin ? "أُنشئ الدوري" : "أُنشئ الدوري — يظهر للجمهور بعد اعتماد إدارة التطبيق، ويمكنك تجهيزه الآن." });
  } catch (e: any) { logger.error({ err: e?.message }, "league create"); return res.status(500).json({ error: "Server error" }); }
});

router.patch("/leagues/:id", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!isOrg(await rolesOf(u, id))) return deny(res);
  try {
    const f = leagueFields(req.body);
    if (typeof req.body?.approved === "boolean" && await isSportsAdmin(u)) f.approved = req.body.approved;
    const keys = Object.keys(f).filter(k => !(k === "name" && !f[k]));
    if (!keys.length) return res.status(400).json({ error: "لا توجد تغييرات" });
    const r = await query(`UPDATE leagues SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(", ")}, updated_at=NOW() WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map(k => f[k]), id]);
    return res.json({ league: r.rows[0] });
  } catch (e: any) { logger.error({ err: e?.message }, "league patch"); return res.status(500).json({ error: "Server error" }); }
});

router.delete("/leagues/:id", async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  const l = (await query(`SELECT created_by FROM leagues WHERE id=$1`, [id]).catch(() => ({ rows: [] as any[] }))).rows[0];
  if (!l) return res.status(404).json({ error: "الدوري غير موجود" });
  if (!(await isSportsAdmin(u) || l.created_by === u?.id)) return deny(res, "الحذف لمنشئ الدوري أو إدارة الرياضة");
  await query(`DELETE FROM leagues WHERE id=$1`, [id]);
  return res.json({ ok: true });
});

// اللجنة المنظمة والحكام وموظفو البوابة — بإضافة رقم حساب في التطبيق
router.post("/leagues/:id/staff", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!isOrg(await rolesOf(u, id))) return deny(res);
  const role = String(req.body?.role || "") as Role;
  if (!ROLES.includes(role)) return res.status(400).json({ error: "دور غير صالح" });
  const digits = String(req.body?.phone || "").replace(/\D/g, "").slice(-9);
  if (digits.length < 9) return res.status(400).json({ error: "أدخل رقم هاتف صحيحاً" });
  const m = (await query(`SELECT id, name FROM users WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone,''),'[^0-9]','','g'),9)=$1 LIMIT 1`, [digits])).rows[0];
  if (!m) return res.status(404).json({ error: "لا يوجد حساب في التطبيق بهذا الرقم — اطلب منه التسجيل أولاً" });
  await query(`INSERT INTO league_staff (league_id, user_id, role, title) VALUES ($1,$2,$3,$4) ON CONFLICT (league_id,user_id,role) DO UPDATE SET title=EXCLUDED.title`,
    [id, m.id, role, clip(req.body?.title, 80) || null]);
  return res.json({ ok: true, member: { user_id: m.id, name: m.name, role } });
});
router.delete("/leagues/:id/staff/:uid/:role", async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!isOrg(await rolesOf(u, id))) return deny(res);
  await query(`DELETE FROM league_staff WHERE league_id=$1 AND user_id=$2 AND role=$3`, [id, int(req.params.uid), req.params.role]);
  return res.json({ ok: true });
});

// الفرق: اللجنة تضيف مباشرة؛ ومسؤول فريق يسجّل فريقه فينتظر الاعتماد
router.post("/leagues/:id/teams", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!u) return res.status(401).json({ error: "سجّل الدخول" });
  const org = isOrg(await rolesOf(u, id));
  const name = clip(req.body?.name, 120);
  if (name.length < 2) return res.status(400).json({ error: "اسم الفريق مطلوب" });
  const dup = await query(`SELECT 1 FROM league_teams WHERE league_id=$1 AND LOWER(name)=LOWER($2)`, [id, name]);
  if (dup.rows.length) return res.status(409).json({ error: "يوجد فريق بهذا الاسم في الدوري" });
  const r = await query(
    `INSERT INTO league_teams (league_id, club_id, name, short_name, logo_url, color, group_name, coach, manager_name, manager_phone, status, registered_by, color2)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [id, req.body?.club_id ? int(req.body.club_id) : null, name, clip(req.body?.short_name, 30) || null, httpsUrl(req.body?.logo_url),
     /^#[0-9a-f]{6}$/i.test(req.body?.color) ? req.body.color : null, clip(req.body?.group_name, 10).toUpperCase() || null,
     clip(req.body?.coach, 120) || null, clip(req.body?.manager_name, 120) || null, clip(req.body?.manager_phone, 30) || null,
     org ? "approved" : "pending", u.id, /^#[0-9a-f]{6}$/i.test(req.body?.color2) ? req.body.color2 : null]);
  return res.status(201).json({ team: r.rows[0], message: org ? "أُضيف الفريق" : "وصل طلب تسجيل فريقك إلى اللجنة المنظمة" });
});
router.patch("/leagues/:id/teams/:tid", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!isOrg(await rolesOf(u, id))) return deny(res);
  const b = req.body || {}; const sets: string[] = []; const vals: unknown[] = [];
  const put = (k: string, v: unknown) => { vals.push(v); sets.push(`${k}=$${vals.length}`); };
  if (b.name !== undefined) put("name", clip(b.name, 120));
  if (b.short_name !== undefined) put("short_name", clip(b.short_name, 30) || null);
  if (b.logo_url !== undefined) put("logo_url", httpsUrl(b.logo_url));
  if (b.color !== undefined) put("color", /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : null);
  if (b.color2 !== undefined) put("color2", /^#[0-9a-f]{6}$/i.test(b.color2) ? b.color2 : null);
  if (b.group_name !== undefined) put("group_name", clip(b.group_name, 10).toUpperCase() || null);
  if (b.coach !== undefined) put("coach", clip(b.coach, 120) || null);
  if (b.status !== undefined && ["approved", "pending", "rejected"].includes(b.status)) put("status", b.status);
  if (!sets.length) return res.status(400).json({ error: "لا توجد تغييرات" });
  vals.push(int(req.params.tid), id);
  const r = await query(`UPDATE league_teams SET ${sets.join(", ")} WHERE id=$${vals.length - 1} AND league_id=$${vals.length} RETURNING *`, vals);
  return res.json({ team: r.rows[0] });
});
router.delete("/leagues/:id/teams/:tid", async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!isOrg(await rolesOf(u, id))) return deny(res);
  await query(`DELETE FROM league_teams WHERE id=$1 AND league_id=$2`, [int(req.params.tid), id]);
  return res.json({ ok: true });
});
router.post("/leagues/:id/teams/:tid/players", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!isOrg(await rolesOf(u, id))) return deny(res);
  const list = Array.isArray(req.body?.players) ? req.body.players : [req.body];
  const out: any[] = [];
  for (const p of list.slice(0, 40)) {
    const name = clip(p?.name, 120); if (!name) continue;
    out.push((await query(`INSERT INTO league_players (team_id, name, number, position) VALUES ($1,$2,$3,$4) RETURNING *`,
      [int(req.params.tid), name, p?.number ? int(p.number) : null, clip(p?.position, 30) || null])).rows[0]);
  }
  return res.status(201).json({ players: out });
});
router.delete("/leagues/:id/players/:pid", async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!isOrg(await rolesOf(u, id))) return deny(res);
  await query(`DELETE FROM league_players WHERE id=$1 AND team_id IN (SELECT id FROM league_teams WHERE league_id=$2)`, [int(req.params.pid), id]);
  return res.json({ ok: true });
});

// مولّد الجدول: دوري بطريقة الدائرة لكل مجموعة (ذهاب أو ذهاب وإياب)
export function roundRobin(ids: number[], double: boolean): Array<Array<[number, number]>> {
  const t = [...ids]; if (t.length % 2) t.push(-1);
  const n = t.length, rounds: Array<Array<[number, number]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a !== -1 && b !== -1) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    t.splice(1, 0, t.pop()!);
  }
  return double ? [...rounds, ...rounds.map(rd => rd.map(([a, b]) => [b, a] as [number, number]))] : rounds;
}

router.post("/leagues/:id/fixtures/generate", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!isOrg(await rolesOf(u, id))) return deny(res);
  try {
    const l = (await query(`SELECT * FROM leagues WHERE id=$1`, [id])).rows[0];
    const teams = (await query(`SELECT id, group_name FROM league_teams WHERE league_id=$1 AND status='approved' ORDER BY id`, [id])).rows;
    if (teams.length < 2) return res.status(400).json({ error: "أضف فريقين على الأقل" });
    const existing = (await query(`SELECT COUNT(*)::int AS n FROM league_matches WHERE league_id=$1`, [id])).rows[0].n;
    if (existing && !req.body?.replace) return res.status(409).json({ error: "يوجد جدول مباريات بالفعل. أرسل replace لاستبداله.", existing });
    const double = !!req.body?.double_round;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.start_date) ? new Date(`${req.body.start_date}T${/^\d{2}:\d{2}$/.test(req.body?.time) ? req.body.time : "16:00"}:00+02:00`) : null;
    const gap = Math.max(1, Math.min(30, int(req.body?.days_between, 7)));
    const groups = new Map<string, number[]>();
    for (const t of teams) { const g = l.format === "groups" ? (t.group_name || "A") : ""; (groups.get(g) ?? groups.set(g, []).get(g)!).push(t.id); }
    const c = await dbClient();
    let created = 0;
    try {
      await c.query("BEGIN");
      if (existing) await c.query(`DELETE FROM league_matches WHERE league_id=$1`, [id]);
      for (const [g, ids] of groups) {
        const rounds = roundRobin(ids, double);
        for (let ri = 0; ri < rounds.length; ri++) {
          const kickoff = start ? new Date(start.getTime() + ri * gap * 86400000) : null;
          for (const [h, a] of rounds[ri]) {
            await c.query(`INSERT INTO league_matches (league_id, round, stage, group_name, home_team_id, away_team_id, kickoff, venue) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [id, ri + 1, `الجولة ${ri + 1}`, g || null, h, a, kickoff, l.venue]);
            created++;
          }
        }
      }
      await c.query(`UPDATE leagues SET status='running', updated_at=NOW() WHERE id=$1 AND status='registration'`, [id]);
      await c.query("COMMIT");
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
    return res.json({ ok: true, created });
  } catch (e: any) { logger.error({ err: e?.message }, "fixtures generate"); return res.status(500).json({ error: "تعذّر توليد الجدول" }); }
});

// مباراة يدوية (أدوار إقصائية، نهائي…)
router.post("/leagues/:id/matches", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req); const id = int(req.params.id);
  if (!isOrg(await rolesOf(u, id))) return deny(res);
  const h = int(req.body?.home_team_id), a = int(req.body?.away_team_id);
  if (!h || !a || h === a) return res.status(400).json({ error: "اختر فريقين مختلفين" });
  const r = await query(`INSERT INTO league_matches (league_id, round, stage, group_name, home_team_id, away_team_id, kickoff, venue) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, Math.max(1, int(req.body?.round, 1)), clip(req.body?.stage, 60) || null, clip(req.body?.group_name, 10) || null, h, a,
     req.body?.kickoff ? new Date(req.body.kickoff) : null, clip(req.body?.venue, 200) || null]);
  return res.status(201).json({ match: r.rows[0] });
});

// تعديل المباراة: اللجنة كل شيء؛ الحكم المسند إليه: النتيجة والحالة والتقرير فقط
router.patch("/leagues/matches/:mid", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const m = await leagueOfMatch(int(req.params.mid));
  if (!m) return res.status(404).json({ error: "المباراة غير موجودة" });
  const roles = await rolesOf(u, m.league_id);
  const org = isOrg(roles);
  const ref = roles.has("referee") && m.referee_user_id === u?.id;
  if (!org && !ref) return deny(res, "هذا الإجراء للجنة المنظمة أو حكم المباراة");
  const b = req.body || {}; const sets: string[] = []; const vals: unknown[] = [];
  const put = (k: string, v: unknown) => { vals.push(v); sets.push(`${k}=$${vals.length}`); };
  if (b.status !== undefined && MATCH_STATUS.includes(b.status)) put("status", b.status);
  if (b.home_score !== undefined) put("home_score", b.home_score === null ? null : Math.max(0, int(b.home_score)));
  if (b.away_score !== undefined) put("away_score", b.away_score === null ? null : Math.max(0, int(b.away_score)));
  if (b.referee_report !== undefined) put("referee_report", clip(b.referee_report, 4000) || null);
  if (org) {
    if (b.kickoff !== undefined) put("kickoff", b.kickoff ? new Date(b.kickoff) : null);
    if (b.venue !== undefined) put("venue", clip(b.venue, 200) || null);
    if (b.stage !== undefined) put("stage", clip(b.stage, 60) || null);
    if (b.referee_user_id !== undefined) put("referee_user_id", b.referee_user_id ? int(b.referee_user_id) : null);
    if (b.referee_name !== undefined) put("referee_name", clip(b.referee_name, 120) || null);
    if (b.assistants !== undefined) put("assistants", clip(b.assistants, 250) || null);
    if (b.tickets_enabled !== undefined) put("tickets_enabled", !!b.tickets_enabled);
  }
  if (!sets.length) return res.status(400).json({ error: "لا توجد تغييرات" });
  vals.push(m.id);
  const r = await query(`UPDATE league_matches SET ${sets.join(", ")}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
  return res.json({ match: r.rows[0] });
});

router.post("/leagues/matches/:mid/events", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const m = await leagueOfMatch(int(req.params.mid));
  if (!m) return res.status(404).json({ error: "المباراة غير موجودة" });
  const roles = await rolesOf(u, m.league_id);
  if (!isOrg(roles) && !(roles.has("referee") && m.referee_user_id === u?.id)) return deny(res, "هذا الإجراء للجنة المنظمة أو حكم المباراة");
  const type = String(req.body?.type || "");
  const team = int(req.body?.team_id);
  if (!EVENT_TYPES.includes(type)) return res.status(400).json({ error: "نوع الحدث غير صالح" });
  if (team !== m.home_team_id && team !== m.away_team_id) return res.status(400).json({ error: "الفريق ليس طرفاً في المباراة" });
  const e = (await query(`INSERT INTO league_match_events (match_id, minute, type, team_id, player_name, note, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [m.id, req.body?.minute ? Math.max(0, Math.min(150, int(req.body.minute))) : null, type, team, clip(req.body?.player_name, 120) || null, clip(req.body?.note, 160) || null, u!.id])).rows[0];
  // الأهداف تحدّث النتيجة تلقائياً (الهدف العكسي يُحتسب للخصم)
  if (["goal", "penalty_goal", "own_goal"].includes(type)) {
    const scorerSide = type === "own_goal" ? (team === m.home_team_id ? "away" : "home") : (team === m.home_team_id ? "home" : "away");
    await query(`UPDATE league_matches SET home_score=COALESCE(home_score,0)+$2, away_score=COALESCE(away_score,0)+$3,
                 status=CASE WHEN status='scheduled' THEN 'live' ELSE status END, updated_at=NOW() WHERE id=$1`,
      [m.id, scorerSide === "home" ? 1 : 0, scorerSide === "away" ? 1 : 0]);
  }
  return res.status(201).json({ event: e });
});
router.delete("/leagues/matches/:mid/events/:eid", async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const m = await leagueOfMatch(int(req.params.mid));
  if (!m) return res.status(404).json({ error: "المباراة غير موجودة" });
  const roles = await rolesOf(u, m.league_id);
  if (!isOrg(roles) && !(roles.has("referee") && m.referee_user_id === u?.id)) return deny(res);
  const e = (await query(`DELETE FROM league_match_events WHERE id=$1 AND match_id=$2 RETURNING *`, [int(req.params.eid), m.id])).rows[0];
  if (e && ["goal", "penalty_goal", "own_goal"].includes(e.type)) {
    const side = e.type === "own_goal" ? (e.team_id === m.home_team_id ? "away" : "home") : (e.team_id === m.home_team_id ? "home" : "away");
    await query(`UPDATE league_matches SET ${side}_score=GREATEST(COALESCE(${side}_score,0)-1,0), updated_at=NOW() WHERE id=$1`, [m.id]);
  }
  return res.json({ ok: true });
});

// ── التذاكر ────────────────────────────────────────────────
router.put("/leagues/matches/:mid/ticket-types", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const m = await leagueOfMatch(int(req.params.mid));
  if (!m) return res.status(404).json({ error: "المباراة غير موجودة" });
  if (!isOrg(await rolesOf(u, m.league_id))) return deny(res);
  const list = Array.isArray(req.body?.types) ? req.body.types.slice(0, 8) : [];
  for (const t of list) {
    const name = clip(t?.name, 60); if (!name) continue;
    const price = Math.max(0, Number(t?.price) || 0), cap = Math.max(0, Math.min(200000, int(t?.capacity)));
    if (t?.id) await query(`UPDATE league_ticket_types SET name=$1, price=$2, capacity=GREATEST($3,(SELECT COUNT(*) FROM league_tickets k WHERE k.type_id=$4 AND k.status<>'cancelled')), note=$5 WHERE id=$4 AND match_id=$6`, [name, price, cap, int(t.id), clip(t?.note, 160) || null, m.id]);
    else await query(`INSERT INTO league_ticket_types (match_id, name, price, capacity, note) VALUES ($1,$2,$3,$4,$5)`, [m.id, name, price, cap, clip(t?.note, 160) || null]);
  }
  await query(`UPDATE league_matches SET tickets_enabled=TRUE WHERE id=$1`, [m.id]);
  const types = (await query(`SELECT tt.*, (SELECT COUNT(*)::int FROM league_tickets k WHERE k.type_id=tt.id AND k.status<>'cancelled') AS sold FROM league_ticket_types tt WHERE match_id=$1 ORDER BY price DESC`, [m.id])).rows;
  return res.json({ ticket_types: types });
});

router.post("/leagues/matches/:mid/tickets", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول لحجز تذكرة" });
  const m = await leagueOfMatch(int(req.params.mid));
  if (!m || !m.tickets_enabled) return res.status(400).json({ error: "التذاكر غير متاحة لهذه المباراة" });
  if (["finished", "cancelled"].includes(m.status)) return res.status(400).json({ error: "انتهى الحجز لهذه المباراة" });
  const qty = Math.max(1, Math.min(6, int(req.body?.qty, 1)));
  const holder = clip(req.body?.holder_name, 120) || u.name;
  const phone = clip(req.body?.phone, 30) || u.phone || null;
  const c = await dbClient();
  try {
    await c.query("BEGIN");
    // قفل الفئة لمنع تجاوز السعة عند الحجز المتزامن
    const t = (await c.query(`SELECT * FROM league_ticket_types WHERE id=$1 AND match_id=$2 FOR UPDATE`, [int(req.body?.type_id), m.id])).rows[0];
    if (!t) { await c.query("ROLLBACK"); return res.status(404).json({ error: "فئة التذكرة غير موجودة" }); }
    const sold = (await c.query(`SELECT COUNT(*)::int AS n FROM league_tickets WHERE type_id=$1 AND status<>'cancelled'`, [t.id])).rows[0].n;
    if (sold + qty > t.capacity) { await c.query("ROLLBACK"); return res.status(409).json({ error: t.capacity - sold > 0 ? `المتبقي ${t.capacity - sold} تذكرة فقط في هذه الفئة` : "نفدت تذاكر هذه الفئة" }); }
    const out: any[] = [];
    for (let i = 0; i < qty; i++) {
      const code = randomBytes(6).toString("hex").toUpperCase();
      out.push((await c.query(`INSERT INTO league_tickets (code, match_id, type_id, user_id, holder_name, phone, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [code, m.id, t.id, u.id, holder, phone, Number(t.price) > 0 ? "reserved" : "paid"])).rows[0]);
    }
    await c.query("COMMIT");
    return res.status(201).json({ tickets: out, message: Number(t.price) > 0 ? "حُجزت تذكرتك — ادفع للجنة المنظمة لتأكيدها، ثم اعرض رمزها عند البوابة." : "تذكرتك جاهزة — اعرض رمزها عند البوابة." });
  } catch (e: any) { await c.query("ROLLBACK").catch(() => {}); logger.error({ err: e?.message }, "ticket reserve"); return res.status(500).json({ error: "تعذّر الحجز" }); }
  finally { c.release(); }
});

router.get("/leagues/tickets/mine", async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  if (!u) return res.status(401).json({ error: "سجّل الدخول" });
  await ensureLeaguesDb();
  const r = await query(
    `SELECT k.*, tt.name AS type_name, tt.price, m.kickoff, m.venue, m.stage, m.status AS match_status, l.name AS league_name, l.id AS league_id,
            h.name AS home_name, h.logo_url AS home_logo, a.name AS away_name, a.logo_url AS away_logo
       FROM league_tickets k JOIN league_ticket_types tt ON tt.id=k.type_id JOIN league_matches m ON m.id=k.match_id
       JOIN leagues l ON l.id=m.league_id JOIN league_teams h ON h.id=m.home_team_id JOIN league_teams a ON a.id=m.away_team_id
      WHERE k.user_id=$1 ORDER BY m.kickoff DESC NULLS LAST, k.id DESC LIMIT 100`, [u.id]);
  return res.json({ tickets: r.rows });
});

// قائمة تذاكر مباراة للجنة (تأكيد الدفع)
router.get("/leagues/matches/:mid/tickets", async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const m = await leagueOfMatch(int(req.params.mid));
  if (!m) return res.status(404).json({ error: "المباراة غير موجودة" });
  const roles = await rolesOf(u, m.league_id);
  if (!isOrg(roles) && !roles.has("gate")) return deny(res);
  const r = await query(`SELECT k.*, tt.name AS type_name, tt.price FROM league_tickets k JOIN league_ticket_types tt ON tt.id=k.type_id WHERE k.match_id=$1 ORDER BY k.id DESC`, [m.id]);
  return res.json({ tickets: r.rows });
});

router.patch("/leagues/tickets/:code", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const t = (await query(`SELECT k.*, m.league_id FROM league_tickets k JOIN league_matches m ON m.id=k.match_id WHERE k.code=$1`, [clip(req.params.code, 16).toUpperCase()])).rows[0];
  if (!t) return res.status(404).json({ error: "التذكرة غير موجودة" });
  const roles = await rolesOf(u, t.league_id);
  const own = t.user_id === u?.id;
  const status = String(req.body?.status || "");
  if (status === "cancelled" && own && t.status === "reserved") { /* المشتري يلغي حجزاً غير مدفوع */ }
  else if (!isOrg(roles) || !["paid", "cancelled", "reserved"].includes(status)) return deny(res);
  const r = await query(`UPDATE league_tickets SET status=$1 WHERE id=$2 RETURNING *`, [status, t.id]);
  return res.json({ ticket: r.rows[0] });
});

// التحقق عند البوابة: مدفوعة وغير مستخدمة ← تُعلَّم مستخدمة
router.post("/leagues/tickets/check", writeLimiter, async (req: Request, res: Response) => {
  const u = await sessionUser(req);
  const code = clip(req.body?.code, 32).toUpperCase().replace(/^HSW-TICKET:/, "");
  const t = (await query(
    `SELECT k.*, m.league_id, m.kickoff, tt.name AS type_name, h.name AS home_name, a.name AS away_name
       FROM league_tickets k JOIN league_matches m ON m.id=k.match_id JOIN league_ticket_types tt ON tt.id=k.type_id
       JOIN league_teams h ON h.id=m.home_team_id JOIN league_teams a ON a.id=m.away_team_id WHERE k.code=$1`, [code])).rows[0];
  if (!t) return res.status(404).json({ ok: false, result: "invalid", error: "تذكرة غير صالحة" });
  const roles = await rolesOf(u, t.league_id);
  if (!isOrg(roles) && !roles.has("gate")) return deny(res, "التحقق لموظفي البوابة واللجنة المنظمة");
  if (req.body?.match_id && int(req.body.match_id) !== t.match_id) return res.status(409).json({ ok: false, result: "wrong_match", error: `التذكرة لمباراة أخرى: ${t.home_name} × ${t.away_name}`, ticket: t });
  if (t.status === "cancelled") return res.status(409).json({ ok: false, result: "cancelled", error: "التذكرة ملغاة", ticket: t });
  if (t.status === "reserved") return res.status(409).json({ ok: false, result: "unpaid", error: "لم يُؤكَّد دفع هذه التذكرة", ticket: t });
  if (t.status === "used") return res.status(409).json({ ok: false, result: "used", error: `استُخدمت التذكرة مسبقاً ${new Date(t.used_at).toLocaleTimeString("ar-SD")}`, ticket: t });
  const r = await query(`UPDATE league_tickets SET status='used', used_at=NOW(), used_by=$1 WHERE id=$2 AND status='paid' RETURNING *`, [u!.id, t.id]);
  if (!r.rows.length) return res.status(409).json({ ok: false, result: "used", error: "استُخدمت التذكرة للتو" });
  return res.json({ ok: true, result: "valid", ticket: { ...t, status: "used" } });
});

export default router;
