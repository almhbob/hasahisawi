import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import { checkContent } from "../lib/content-moderator";
import { writeLimiter } from "../lib/rate-limiters";
import { logger } from "../lib/logger";

const router = Router();

const dbUrl = process.env.DATABASE_URL ?? "";
const dbEnabled =
  dbUrl.length > 0 &&
  !dbUrl.includes(".invalid") &&
  !dbUrl.includes("placeholder") &&
  !dbUrl.includes("nodb");

const pool: Pool | null = dbEnabled
  ? new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      max: 8,
      allowExitOnIdle: false,
      ssl:
        dbUrl.includes("sslmode=require") ||
        dbUrl.includes("ssl=true") ||
        dbUrl.includes("railway") ||
        dbUrl.includes("rlwy") ||
        dbUrl.includes("neon.tech")
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

let initPromise: Promise<void> | null = null;
function ensureSocialDb() {
  initPromise ??= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id SERIAL PRIMARY KEY,
        author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
        content TEXT NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'عام',
        image_url TEXT,
        video_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS author_id INTEGER`);
    await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS image_url TEXT`);
    await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS video_url TEXT`);
    await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE`);
    await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS likes INTEGER NOT NULL DEFAULT 0`);
    await query(`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0`);
    await query(`CREATE INDEX IF NOT EXISTS idx_social_posts_feed ON social_posts(is_pinned DESC, created_at DESC, id DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_social_posts_category_feed ON social_posts(category, is_pinned DESC, created_at DESC, id DESC)`);

    await query(`
      CREATE TABLE IF NOT EXISTS social_comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        author_name VARCHAR(100) NOT NULL DEFAULT 'مجهول',
        content TEXT NOT NULL,
        parent_id INTEGER REFERENCES social_comments(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES social_comments(id) ON DELETE CASCADE`);
    await query(`CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id, created_at ASC)`);

    await query(`
      CREATE TABLE IF NOT EXISTS social_likes (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        device_id VARCHAR(200) NOT NULL,
        reaction VARCHAR(30) DEFAULT 'like',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(post_id, device_id)
      )
    `);
    await query(`ALTER TABLE social_likes ADD COLUMN IF NOT EXISTS reaction VARCHAR(30) DEFAULT 'like'`);
  })();
  return initPromise;
}

function pageLimit(req: Request) {
  const rawLimit = Number.parseInt(String(req.query.limit ?? "30"), 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 30, 1), 100);
  const page = Math.max(Number.parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
  const offsetFromPage = (page - 1) * limit;
  const rawOffset = Number.parseInt(String(req.query.offset ?? offsetFromPage), 10);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : offsetFromPage, 0);
  return { limit, offset };
}

function categoryFilter(req: Request): string | null {
  const category = String(req.query.category ?? "").trim();
  if (!category || category === "الكل" || category === "all") return null;
  return category;
}

function deviceId(req: Request): string {
  const q = String(req.query.device_id ?? "").trim();
  const b = typeof req.body?.device_id === "string" ? req.body.device_id.trim() : "";
  return q || b || "anonymous";
}

async function listPosts(req: Request, res: Response) {
  try {
    await ensureSocialDb();
    const { limit, offset } = pageLimit(req);
    const category = categoryFilter(req);
    const device = deviceId(req);

    const params: unknown[] = [device];
    let where = "WHERE 1=1";
    if (category) {
      params.push(category);
      where += ` AND p.category = $${params.length}`;
    }
    params.push(limit, offset);

    const result = await query(
      `SELECT
         p.id,
         COALESCE(NULLIF(p.author_name, ''), u.name, 'مجهول') AS author_name,
         u.avatar_url AS author_avatar,
         p.content,
         COALESCE(NULLIF(p.category, ''), 'عام') AS category,
         COALESCE(p.image_url, '') AS image_url,
         COALESCE(p.video_url, '') AS video_url,
         COALESCE(p.likes, 0)::int AS likes_count,
         COALESCE(p.views_count, 0)::int AS views_count,
         COALESCE(p.is_pinned, FALSE) AS is_pinned,
         p.created_at,
         COALESCE((SELECT COUNT(*)::int FROM social_comments c WHERE c.post_id = p.id), 0) AS comments_count,
         EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id = p.id AND l.device_id = $1) AS liked_by_me,
         (SELECT l.reaction FROM social_likes l WHERE l.post_id = p.id AND l.device_id = $1 LIMIT 1) AS my_reaction
       FROM social_posts p
       LEFT JOIN users u ON u.id = p.author_id
       ${where}
       ORDER BY COALESCE(p.is_pinned, FALSE) DESC, p.created_at DESC, p.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json(result.rows.map(row => ({
      ...row,
      image_url: row.image_url || null,
      video_url: row.video_url || null,
      my_reaction: row.my_reaction || null,
    })));
  } catch (err) {
    logger.error({ err }, "social posts list failed");
    res.status(500).json({ error: "تعذّر تحميل المنشورات" });
  }
}

async function createPost(req: Request, res: Response) {
  try {
    await ensureSocialDb();
    const body = req.body ?? {};
    const content = String(body.content ?? "").trim();
    const authorName = String(body.author_name ?? body.name ?? "مجهول").trim() || "مجهول";
    const category = String(body.category ?? "عام").trim() || "عام";
    const imageUrl = typeof body.image_url === "string" && body.image_url.trim() ? body.image_url.trim() : null;
    const videoUrl = typeof body.video_url === "string" && body.video_url.trim() ? body.video_url.trim() : null;

    if (!content && !imageUrl && !videoUrl) return res.status(400).json({ error: "المحتوى مطلوب" });
    if (content) {
      const moderation = checkContent(content);
      if (!moderation.allowed) {
        return res.status(400).json({ error: "تم رفض المنشور", blocked: true, reason: moderation.reason });
      }
    }

    const result = await query(
      `INSERT INTO social_posts (author_name, content, category, image_url, video_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, author_name, content, category, image_url, video_url, created_at, COALESCE(is_pinned, FALSE) AS is_pinned`,
      [authorName, content, category, imageUrl, videoUrl],
    );
    const row = result.rows[0];
    res.status(201).json({
      ...row,
      author_avatar: null,
      likes_count: 0,
      comments_count: 0,
      views_count: 0,
      liked_by_me: false,
      my_reaction: null,
    });
  } catch (err) {
    logger.error({ err }, "social post create failed");
    res.status(500).json({ error: "تعذّر إنشاء المنشور" });
  }
}

async function listComments(req: Request, res: Response) {
  try {
    await ensureSocialDb();
    const result = await query(
      `SELECT id, post_id, author_name, content, parent_id, created_at
       FROM social_comments
       WHERE post_id=$1
       ORDER BY created_at ASC, id ASC`,
      [Number(req.params.id)],
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "social comments list failed");
    res.status(500).json({ error: "تعذّر تحميل التعليقات" });
  }
}

async function createComment(req: Request, res: Response) {
  try {
    await ensureSocialDb();
    const content = String(req.body?.content ?? "").trim();
    const authorName = String(req.body?.author_name ?? "مجهول").trim() || "مجهول";
    const parentId = req.body?.parent_id ? Number(req.body.parent_id) : null;
    if (!content) return res.status(400).json({ error: "المحتوى مطلوب" });
    const moderation = checkContent(content);
    if (!moderation.allowed) {
      return res.status(400).json({ error: "تم رفض التعليق", blocked: true, reason: moderation.reason });
    }
    const result = await query(
      `INSERT INTO social_comments (post_id, author_name, content, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, post_id, author_name, content, parent_id, created_at`,
      [Number(req.params.id), authorName, content, parentId],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "social comment create failed");
    res.status(500).json({ error: "تعذّر إنشاء التعليق" });
  }
}

async function reactPost(req: Request, res: Response) {
  try {
    await ensureSocialDb();
    const postId = Number(req.params.id);
    const device = deviceId(req);
    const reaction = String(req.body?.reaction ?? "like").trim() || "like";
    const existing = await query(`SELECT reaction FROM social_likes WHERE post_id=$1 AND device_id=$2`, [postId, device]);
    if (existing.rows.length && existing.rows[0].reaction === reaction) {
      await query(`DELETE FROM social_likes WHERE post_id=$1 AND device_id=$2`, [postId, device]);
      await query(`UPDATE social_posts SET likes=GREATEST(COALESCE(likes,0)-1,0) WHERE id=$1`, [postId]);
      return res.json({ reacted: false, reaction: null });
    }
    if (existing.rows.length) {
      await query(`UPDATE social_likes SET reaction=$3 WHERE post_id=$1 AND device_id=$2`, [postId, device, reaction]);
      return res.json({ reacted: true, reaction });
    }
    await query(`INSERT INTO social_likes (post_id, device_id, reaction) VALUES ($1,$2,$3)`, [postId, device, reaction]);
    await query(`UPDATE social_posts SET likes=COALESCE(likes,0)+1 WHERE id=$1`, [postId]);
    return res.json({ reacted: true, reaction });
  } catch (err) {
    logger.error({ err }, "social reaction failed");
    res.status(500).json({ error: "تعذّر التفاعل" });
  }
}

async function trackView(req: Request, res: Response) {
  try {
    await ensureSocialDb();
    await query(`UPDATE social_posts SET views_count=COALESCE(views_count,0)+1 WHERE id=$1`, [Number(req.params.id)]);
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
}

router.get(["/posts", "/social/posts"], listPosts);
router.post(["/posts", "/social/posts"], writeLimiter, createPost);
router.get(["/posts/:id/comments", "/social/posts/:id/comments"], listComments);
router.post(["/posts/:id/comments", "/social/posts/:id/comments"], writeLimiter, createComment);
router.post(["/posts/:id/react", "/social/posts/:id/like"], writeLimiter, reactPost);
router.post(["/posts/:id/view", "/social/posts/:id/view"], trackView);

export default router;
