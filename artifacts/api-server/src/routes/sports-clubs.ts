// ════════════════════════════════════════════════════════════════
// 🏟️ الأندية الرياضية — ملف نادٍ كامل، متابعة، طلبات انضمام، وجدول ترتيب
// ════════════════════════════════════════════════════════════════
// يحلّ محل تخزين الأندية في Firestore على الجهاز (كانت لا تظهر لبقية المستخدمين).
import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { query, sessionUser, isStaff, dbEnabled, type SessionUser } from "../lib/shared-db";

const router = Router();

const SPORTS = ["football", "basketball", "volleyball", "athletics", "swimming", "boxing", "other"] as const;
type Sport = typeof SPORTS[number];

let ready: Promise<void> | null = null;
function ensureTables() {
  if (!ready) {
    ready = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS sport_clubs (
          id SERIAL PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          short_name VARCHAR(40),
          sport VARCHAR(20) NOT NULL DEFAULT 'football',
          league VARCHAR(120),
          logo_url TEXT,
          cover_url TEXT,
          primary_color VARCHAR(9),
          colors VARCHAR(80),
          founded VARCHAR(10),
          district VARCHAR(120),
          address VARCHAR(200),
          stadium VARCHAR(160),
          phone VARCHAR(30),
          whatsapp VARCHAR(30),
          facebook TEXT,
          president VARCHAR(120),
          coach VARCHAR(120),
          training_times VARCHAR(200),
          membership_fee VARCHAR(80),
          accepts_members BOOLEAN NOT NULL DEFAULT TRUE,
          achievements TEXT,
          description TEXT,
          status VARCHAR(12) NOT NULL DEFAULT 'pending',
          verified BOOLEAN NOT NULL DEFAULT FALSE,
          owner_id INTEGER,
          followers INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS sport_clubs_name_sport_uq ON sport_clubs (LOWER(name), sport)`);
      await query(`
        CREATE TABLE IF NOT EXISTS sport_club_follows (
          club_id INTEGER NOT NULL REFERENCES sport_clubs(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (club_id, user_id)
        )`);
      await query(`
        CREATE TABLE IF NOT EXISTS sport_club_join_requests (
          id SERIAL PRIMARY KEY,
          club_id INTEGER NOT NULL REFERENCES sport_clubs(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL,
          name VARCHAR(120) NOT NULL,
          phone VARCHAR(30),
          age INTEGER,
          position VARCHAR(80),
          note TEXT,
          status VARCHAR(12) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await query(`CREATE INDEX IF NOT EXISTS sport_club_join_club_idx ON sport_club_join_requests (club_id, status)`);
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const str = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s.slice(0, max) : null;
};
const httpsUrl = (v: unknown) => {
  const s = str(v, 600);
  return s && /^https:\/\/\S+$/i.test(s) ? s : null;
};
const phone = (v: unknown) => {
  const s = str(v, 30);
  return s ? s.replace(/[^\d+]/g, "").slice(0, 20) || null : null;
};
const color = (v: unknown) => {
  const s = str(v, 9);
  return s && /^#[0-9a-f]{6}$/i.test(s) ? s : null;
};

function canManage(user: SessionUser | null, club: { owner_id: number | null }) {
  return !!user && (isStaff(user) || (club.owner_id != null && club.owner_id === user.id));
}

function clubFields(b: any) {
  const sport: Sport = SPORTS.includes(b?.sport) ? b.sport : "football";
  return {
    name: str(b?.name, 120),
    short_name: str(b?.short_name, 40),
    sport,
    league: str(b?.league, 120),
    logo_url: httpsUrl(b?.logo_url),
    cover_url: httpsUrl(b?.cover_url),
    primary_color: color(b?.primary_color),
    colors: str(b?.colors, 80),
    founded: str(b?.founded, 10),
    district: str(b?.district, 120),
    address: str(b?.address, 200),
    stadium: str(b?.stadium, 160),
    phone: phone(b?.phone),
    whatsapp: phone(b?.whatsapp),
    facebook: httpsUrl(b?.facebook),
    president: str(b?.president, 120),
    coach: str(b?.coach, 120),
    training_times: str(b?.training_times, 200),
    membership_fee: str(b?.membership_fee, 80),
    accepts_members: b?.accepts_members === false ? false : true,
    achievements: str(b?.achievements, 2000),
    description: str(b?.description, 3000),
  };
}

const FIELD_KEYS = Object.keys(clubFields({})) as (keyof ReturnType<typeof clubFields>)[];

function guard(res: Response) {
  if (!dbEnabled) { res.status(503).json({ error: "الخدمة غير متاحة حالياً" }); return false; }
  return true;
}

// GET /api/sports/clubs?sport=&q=&mine=1
router.get("/sports/clubs", async (req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    await ensureTables();
    const user = await sessionUser(req);
    const where: string[] = [];
    const params: unknown[] = [];
    const sport = String(req.query.sport || "");
    if (SPORTS.includes(sport as Sport)) { params.push(sport); where.push(`c.sport=$${params.length}`); }
    const q = str(req.query.q, 60);
    if (q) { params.push(`%${q}%`); where.push(`(c.name ILIKE $${params.length} OR c.district ILIKE $${params.length} OR c.league ILIKE $${params.length})`); }
    if (isStaff(user)) {
      // الإدارة ترى كل شيء، والمعلّق أولاً
    } else if (user) {
      params.push(user.id); where.push(`(c.status='approved' OR c.owner_id=$${params.length})`);
    } else {
      where.push(`c.status='approved'`);
    }
    if (req.query.mine === "1" && user) { params.push(user.id); where.push(`c.owner_id=$${params.length}`); }
    params.push(user?.id ?? -1);
    const uid = `$${params.length}`;
    const { rows } = await query(
      `SELECT c.*,
         EXISTS(SELECT 1 FROM sport_club_follows f WHERE f.club_id=c.id AND f.user_id=${uid}) AS is_following,
         (c.owner_id=${uid}) AS is_owner
       FROM sport_clubs c ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY (c.status='pending') DESC, c.verified DESC, c.followers DESC, c.name ASC LIMIT 300`,
      params,
    );
    return res.json({ clubs: rows, can_moderate: isStaff(user) });
  } catch (err) { logger.error({ err }, "sports/clubs GET"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/sports/clubs/:id — الملف الكامل: النادي + اللاعبون + المباريات + الأخبار + الإحصائيات
router.get("/sports/clubs/:id", async (req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureTables();
    const user = await sessionUser(req);
    const { rows } = await query(
      `SELECT c.*, EXISTS(SELECT 1 FROM sport_club_follows f WHERE f.club_id=c.id AND f.user_id=$2) AS is_following
       FROM sport_clubs c WHERE c.id=$1`, [Number(req.params.id), user?.id ?? -1]);
    const club = rows[0];
    if (!club) return res.status(404).json({ error: "النادي غير موجود" });
    if (club.status !== "approved" && !canManage(user, club)) return res.status(404).json({ error: "النادي غير موجود" });

    const names = [club.name, club.short_name].filter(Boolean).map((n: string) => n.toLowerCase());
    const [players, matches, posts, pending] = await Promise.all([
      query(`SELECT * FROM sports_players WHERE LOWER(TRIM(team)) = ANY($1) ORDER BY goals DESC, name ASC LIMIT 60`, [names]).catch(() => ({ rows: [] as any[] })),
      query(`SELECT * FROM sports_matches WHERE LOWER(TRIM(home_team)) = ANY($1) OR LOWER(TRIM(away_team)) = ANY($1) ORDER BY match_date DESC LIMIT 40`, [names]).catch(() => ({ rows: [] as any[] })),
      query(`SELECT * FROM sports_posts WHERE LOWER(TRIM(COALESCE(team,''))) = ANY($1) OR title ILIKE $2 ORDER BY created_at DESC LIMIT 20`, [names, `%${club.name}%`]).catch(() => ({ rows: [] as any[] })),
      canManage(user, club)
        ? query(`SELECT COUNT(*)::int AS n FROM sport_club_join_requests WHERE club_id=$1 AND status='pending'`, [club.id])
        : Promise.resolve({ rows: [{ n: 0 }] }),
    ]);

    const isHome = (m: any) => names.includes(String(m.home_team || "").trim().toLowerCase());
    const stats = { played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, form: [] as string[] };
    for (const m of matches.rows) {
      if (m.status !== "finished" || m.home_score == null || m.away_score == null) continue;
      const gf = isHome(m) ? Number(m.home_score) : Number(m.away_score);
      const ga = isHome(m) ? Number(m.away_score) : Number(m.home_score);
      stats.played++; stats.goals_for += gf; stats.goals_against += ga;
      const r = gf > ga ? "W" : gf === ga ? "D" : "L";
      if (r === "W") stats.won++; else if (r === "D") stats.drawn++; else stats.lost++;
      if (stats.form.length < 5) stats.form.push(r);
    }

    return res.json({
      club: { ...club, is_owner: !!user && club.owner_id === user.id },
      players: players.rows, matches: matches.rows, posts: posts.rows,
      stats, pending_requests: pending.rows[0]?.n ?? 0,
      can_manage: canManage(user, club), can_moderate: isStaff(user),
    });
  } catch (err) { logger.error({ err }, "sports/clubs/:id GET"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/sports/clubs — تسجيل نادٍ (يُراجَع من الإدارة، والإدارة تُنشر مباشرةً)
router.post("/sports/clubs", async (req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    await ensureTables();
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: "سجّل الدخول لتسجيل النادي" });
    if (user.is_banned) return res.status(403).json({ error: "الحساب موقوف" });
    const f = clubFields(req.body);
    if (!f.name || f.name.length < 2) return res.status(400).json({ error: "اكتب اسم النادي" });
    if (!f.district && !f.address) return res.status(400).json({ error: "اكتب الحي أو العنوان" });
    if (!isStaff(user)) {
      const own = await query(`SELECT COUNT(*)::int AS n FROM sport_clubs WHERE owner_id=$1`, [user.id]);
      if ((own.rows[0]?.n ?? 0) >= 5) return res.status(429).json({ error: "وصلت للحد الأقصى من الأندية المسجّلة باسمك" });
    }
    const status = isStaff(user) ? "approved" : "pending";
    const cols = [...FIELD_KEYS, "status", "owner_id"];
    const vals = [...FIELD_KEYS.map((k) => (f as any)[k]), status, isStaff(user) && req.body?.no_owner ? null : user.id];
    const { rows } = await query(
      `INSERT INTO sport_clubs (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`, vals);
    return res.status(201).json({ club: rows[0], message: status === "approved" ? "تم نشر النادي" : "تم إرسال النادي للمراجعة — سيظهر للجميع بعد موافقة الإدارة" });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "يوجد نادٍ مسجّل بهذا الاسم في نفس الرياضة" });
    logger.error({ err }, "sports/clubs POST"); return res.status(500).json({ error: "Server error" });
  }
});

// PATCH /api/sports/clubs/:id — تعديل (المالك أو الإدارة)، والإدارة تتحكم في status/verified
router.patch("/sports/clubs/:id", async (req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureTables();
    const user = await sessionUser(req);
    const cur = await query(`SELECT * FROM sport_clubs WHERE id=$1`, [Number(req.params.id)]);
    const club = cur.rows[0];
    if (!club) return res.status(404).json({ error: "غير موجود" });
    if (!canManage(user, club)) return res.status(403).json({ error: "غير مسموح" });

    const sets: string[] = []; const params: unknown[] = [];
    const f = clubFields({ ...club, ...req.body });
    for (const k of FIELD_KEYS) {
      if (!(k in (req.body || {}))) continue;
      params.push((f as any)[k]); sets.push(`${k}=$${params.length}`);
    }
    if (isStaff(user)) {
      if (["approved", "pending", "rejected"].includes(req.body?.status)) { params.push(req.body.status); sets.push(`status=$${params.length}`); }
      if (typeof req.body?.verified === "boolean") { params.push(req.body.verified); sets.push(`verified=$${params.length}`); }
    }
    if (!sets.length) return res.json({ club });
    if (sets.some((s) => s.startsWith("name="))) {
      const nm = (f as any).name; if (!nm || nm.length < 2) return res.status(400).json({ error: "اسم النادي مطلوب" });
    }
    params.push(club.id);
    const { rows } = await query(`UPDATE sport_clubs SET ${sets.join(",")}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`, params);
    return res.json({ club: rows[0] });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "يوجد نادٍ آخر بنفس الاسم" });
    logger.error({ err }, "sports/clubs PATCH"); return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/sports/clubs/:id", async (req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureTables();
    const user = await sessionUser(req);
    const cur = await query(`SELECT id, owner_id FROM sport_clubs WHERE id=$1`, [Number(req.params.id)]);
    if (!cur.rows[0]) return res.status(404).json({ error: "غير موجود" });
    if (!canManage(user, cur.rows[0])) return res.status(403).json({ error: "غير مسموح" });
    await query(`DELETE FROM sport_clubs WHERE id=$1`, [cur.rows[0].id]);
    return res.json({ ok: true });
  } catch (err) { logger.error({ err }, "sports/clubs DELETE"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/sports/clubs/:id/follow — متابعة / إلغاء متابعة
router.post("/sports/clubs/:id/follow", async (req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureTables();
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: "سجّل الدخول لمتابعة النادي" });
    const id = Number(req.params.id);
    const ins = await query(`INSERT INTO sport_club_follows (club_id, user_id) SELECT $1,$2 WHERE EXISTS (SELECT 1 FROM sport_clubs WHERE id=$1 AND status='approved') ON CONFLICT DO NOTHING RETURNING club_id`, [id, user.id]);
    let following = true;
    if (!ins.rows.length) {
      const del = await query(`DELETE FROM sport_club_follows WHERE club_id=$1 AND user_id=$2 RETURNING club_id`, [id, user.id]);
      if (!del.rows.length) return res.status(404).json({ error: "النادي غير متاح" });
      following = false;
    }
    const { rows } = await query(
      `UPDATE sport_clubs SET followers=(SELECT COUNT(*) FROM sport_club_follows WHERE club_id=$1) WHERE id=$1 RETURNING followers`, [id]);
    return res.json({ following, followers: rows[0]?.followers ?? 0 });
  } catch (err) { logger.error({ err }, "sports/clubs follow"); return res.status(500).json({ error: "Server error" }); }
});

// POST /api/sports/clubs/:id/join — طلب انضمام لاعب/عضو
router.post("/sports/clubs/:id/join", async (req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureTables();
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: "سجّل الدخول لإرسال طلب الانضمام" });
    const id = Number(req.params.id);
    const c = await query(`SELECT id, accepts_members, status FROM sport_clubs WHERE id=$1`, [id]);
    if (!c.rows[0] || c.rows[0].status !== "approved") return res.status(404).json({ error: "النادي غير متاح" });
    if (!c.rows[0].accepts_members) return res.status(400).json({ error: "النادي لا يستقبل طلبات انضمام حالياً" });
    const dup = await query(`SELECT 1 FROM sport_club_join_requests WHERE club_id=$1 AND user_id=$2 AND status='pending'`, [id, user.id]);
    if (dup.rows.length) return res.status(409).json({ error: "لديك طلب قيد المراجعة لهذا النادي" });
    const name = str(req.body?.name, 120) || user.name;
    const ageN = Number(req.body?.age);
    const { rows } = await query(
      `INSERT INTO sport_club_join_requests (club_id, user_id, name, phone, age, position, note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, user.id, name, phone(req.body?.phone) || user.phone, Number.isFinite(ageN) && ageN > 4 && ageN < 90 ? Math.round(ageN) : null,
        str(req.body?.position, 80), str(req.body?.note, 600)]);
    return res.status(201).json({ request: rows[0], message: "تم إرسال طلبك — سيتواصل معك النادي" });
  } catch (err) { logger.error({ err }, "sports/clubs join"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/sports/clubs/:id/requests — للمالك والإدارة
router.get("/sports/clubs/:id/requests", async (req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ error: "غير موجود" });
    await ensureTables();
    const user = await sessionUser(req);
    const c = await query(`SELECT id, owner_id FROM sport_clubs WHERE id=$1`, [Number(req.params.id)]);
    if (!c.rows[0]) return res.status(404).json({ error: "غير موجود" });
    if (!canManage(user, c.rows[0])) return res.status(403).json({ error: "غير مسموح" });
    const { rows } = await query(`SELECT * FROM sport_club_join_requests WHERE club_id=$1 ORDER BY (status='pending') DESC, created_at DESC LIMIT 200`, [c.rows[0].id]);
    return res.json({ requests: rows });
  } catch (err) { logger.error({ err }, "sports/clubs requests"); return res.status(500).json({ error: "Server error" }); }
});

// PATCH /api/sports/clubs/:id/requests/:rid { status: accepted|rejected }
router.patch("/sports/clubs/:id/requests/:rid", async (req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    if (!/^\d+$/.test(String(req.params.id)) || !/^\d+$/.test(String(req.params.rid))) return res.status(404).json({ error: "غير موجود" });
    const status = String(req.body?.status || "");
    if (!["accepted", "rejected"].includes(status)) return res.status(400).json({ error: "حالة غير صالحة" });
    await ensureTables();
    const user = await sessionUser(req);
    const c = await query(`SELECT id, owner_id FROM sport_clubs WHERE id=$1`, [Number(req.params.id)]);
    if (!c.rows[0]) return res.status(404).json({ error: "غير موجود" });
    if (!canManage(user, c.rows[0])) return res.status(403).json({ error: "غير مسموح" });
    const { rows } = await query(`UPDATE sport_club_join_requests SET status=$1 WHERE id=$2 AND club_id=$3 RETURNING *`, [status, Number(req.params.rid), c.rows[0].id]);
    if (!rows.length) return res.status(404).json({ error: "الطلب غير موجود" });
    return res.json({ request: rows[0] });
  } catch (err) { logger.error({ err }, "sports/clubs request PATCH"); return res.status(500).json({ error: "Server error" }); }
});

// GET /api/sports/standings — جدول الترتيب محسوباً من نتائج المباريات المنتهية
router.get("/sports/standings", async (_req: Request, res: Response) => {
  if (!guard(res)) return;
  try {
    await ensureTables();
    const [m, c] = await Promise.all([
      query(`SELECT home_team, away_team, home_score, away_score, match_date FROM sports_matches
             WHERE status='finished' AND home_score IS NOT NULL AND away_score IS NOT NULL ORDER BY match_date ASC`).catch(() => ({ rows: [] as any[] })),
      query(`SELECT id, name, short_name, logo_url, primary_color FROM sport_clubs WHERE status='approved' AND sport='football'`),
    ]);
    const clubByName = new Map<string, any>();
    for (const cl of c.rows) {
      clubByName.set(String(cl.name).trim().toLowerCase(), cl);
      if (cl.short_name) clubByName.set(String(cl.short_name).trim().toLowerCase(), cl);
    }
    type Row = { team: string; club_id: number | null; logo_url: string | null; primary_color: string | null; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number; form: string[] };
    const table = new Map<string, Row>();
    const row = (raw: string): Row => {
      const key = raw.trim().toLowerCase();
      const cl = clubByName.get(key);
      const k = cl ? `c${cl.id}` : key;
      if (!table.has(k)) table.set(k, { team: cl?.name || raw.trim(), club_id: cl?.id ?? null, logo_url: cl?.logo_url ?? null, primary_color: cl?.primary_color ?? null, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });
      return table.get(k)!;
    };
    for (const x of m.rows) {
      const h = row(String(x.home_team)), a = row(String(x.away_team));
      const hs = Number(x.home_score), as = Number(x.away_score);
      h.p++; a.p++; h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
      if (hs > as) { h.w++; a.l++; h.pts += 3; h.form.push("W"); a.form.push("L"); }
      else if (hs < as) { a.w++; h.l++; a.pts += 3; a.form.push("W"); h.form.push("L"); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push("D"); a.form.push("D"); }
    }
    const standings = [...table.values()]
      .map((r) => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5).reverse() }))
      .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team, "ar"));
    return res.json({ standings });
  } catch (err) { logger.error({ err }, "sports/standings"); return res.status(500).json({ error: "Server error" }); }
});

export default router;
