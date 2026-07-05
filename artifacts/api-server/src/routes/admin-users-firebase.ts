import { Router, type Request, type Response } from "express";
import { Pool } from "pg";
import { timingSafeEqual } from "node:crypto";
import { listAllFirebaseUsers, verifyIdToken, type FirebaseUserRecord } from "../lib/firebase-admin";
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
      max: 12,
      allowExitOnIdle: false,
      ssl: dbUrl.includes("sslmode=require") || dbUrl.includes("ssl=true") || dbUrl.includes("railway") || dbUrl.includes("rlwy")
        ? { rejectUnauthorized: false }
        : false,
    })
  : null;

if (pool) {
  pool.on("error", (err) => logger.error({ err }, "admin-users-firebase pg pool idle-client error"));
}

const DEFAULT_ADMIN_PIN = process.env.DEFAULT_ADMIN_PIN ?? "4444";
const MAX_ADMIN_USERS_LIMIT = 1000;
const DEFAULT_ADMIN_USERS_LIMIT = 1000;
const FIREBASE_ONLY_PASSWORD_MARKER = "firebase_only_account";

type DbUser = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  neighborhood: string | null;
  birth_date: string | null;
  national_id: string | null;
  is_banned: boolean;
  created_at: string;
  firebase_uid: string | null;
  avatar_url: string | null;
  gender: string | null;
};

type SyncSummary = {
  firebase_total: number;
  synced: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  postgres_after_sync: number | null;
  firebase_synced_after_sync: number | null;
  all_firebase_users_visible_in_admin: boolean | null;
  details: Array<{ uid: string; email?: string; action: string; error?: string }>;
};

type FirebaseConnectionHealth = {
  configured: boolean;
  json_valid: boolean;
  project_id: string | null;
  client_email_present: boolean;
  status: "missing_env" | "invalid_json" | "configured";
  message: string;
};

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

function firebaseConnectionHealth(): FirebaseConnectionHealth {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) {
    return {
      configured: false,
      json_valid: false,
      project_id: null,
      client_email_present: false,
      status: "missing_env",
      message: "FIREBASE_SERVICE_ACCOUNT_JSON is not configured on the API server.",
    };
  }

  try {
    const serviceAccount = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
    const valid = !!serviceAccount.project_id && !!serviceAccount.client_email && !!serviceAccount.private_key;
    return {
      configured: valid,
      json_valid: true,
      project_id: serviceAccount.project_id ?? null,
      client_email_present: !!serviceAccount.client_email,
      status: "configured",
      message: valid
        ? "Firebase Admin credentials are configured."
        : "FIREBASE_SERVICE_ACCOUNT_JSON is present but missing required service-account fields.",
    };
  } catch {
    return {
      configured: false,
      json_valid: false,
      project_id: null,
      client_email_present: false,
      status: "invalid_json",
      message: "FIREBASE_SERVICE_ACCOUNT_JSON is present but is not valid JSON.",
    };
  }
}

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a.padEnd(64, "\0"));
    const bb = Buffer.from(b.padEnd(64, "\0"));
    return timingSafeEqual(ba, bb) && a.length === b.length;
  } catch {
    return false;
  }
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function parseOffset(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

async function getSessionUser(req: Request): Promise<Record<string, unknown> | null> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const tok = auth.slice(7);

  // 1. Backend session token
  const { rows } = await query(
    `SELECT u.*
     FROM users u
     JOIN user_sessions s ON s.user_id = u.id
     WHERE s.token = $1 AND (s.expires_at IS NULL OR s.expires_at > NOW())
     LIMIT 1`,
    [tok],
  );
  if (rows[0]) return rows[0];

  // 2. Firebase JWT fallback (handles cold-start and direct Firebase auth)
  if (tok.split(".").length === 3 && tok.startsWith("eyJ")) {
    try {
      const decoded = await verifyIdToken(tok);
      if (decoded?.uid) {
        const { rows: fbRows } = await query(
          `SELECT * FROM users WHERE firebase_uid = $1 LIMIT 1`,
          [decoded.uid],
        );
        if (fbRows[0]) return fbRows[0];
      }
    } catch { /* رمز Firebase غير صالح */ }
  }

  return null;
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const user = await getSessionUser(req).catch(() => null);
  if (user?.role === "admin") return true;

  const pinHeader = req.headers["x-admin-pin"] as string | undefined;
  const pinBody = (req.body as { admin_pin?: string } | undefined)?.admin_pin;
  const submittedPin = pinHeader || pinBody;
  if (!submittedPin || submittedPin.length < 4 || submittedPin.length > 20) return false;

  await ensureAdminSettings().catch(() => {});
  const { rows } = await query(`SELECT value FROM admin_settings WHERE key='admin_pin'`).catch(() => ({ rows: [] as any[] }));
  const storedPin = rows[0]?.value || DEFAULT_ADMIN_PIN;
  return safeCompare(submittedPin, storedPin);
}

function displayNameForFirebaseUser(user: FirebaseUserRecord): string {
  const fromEmail = user.email?.split("@")[0];
  return user.displayName?.trim() || fromEmail || user.phoneNumber || "مستخدم";
}

async function ensureAdminSettings(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS admin_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`);
  const pin = process.env.DEFAULT_ADMIN_PIN || DEFAULT_ADMIN_PIN;
  await query(`INSERT INTO admin_settings (key, value) VALUES ('admin_pin', $1) ON CONFLICT (key) DO NOTHING`, [pin]);
}

async function ensureUserColumns(): Promise<void> {
  await ensureAdminSettings();
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(200)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_created_at_desc ON users(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users(LOWER(email)) WHERE email IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_phone_text ON users(phone) WHERE phone IS NOT NULL`);
}

function providerSummary(fu: FirebaseUserRecord): string[] {
  const providers: string[] = Array.isArray(fu.providers) ? fu.providers.filter(Boolean) : [];
  if (!providers.length && fu.email) providers.push("password");
  if (!providers.length && fu.phoneNumber) providers.push("phone");
  return [...new Set<string>(providers)];
}

async function upsertFirebaseUser(fu: FirebaseUserRecord): Promise<"created" | "updated" | "skipped"> {
  const name = displayNameForFirebaseUser(fu);
  const email = fu.email || null;
  const phone = fu.phoneNumber || null;
  const photo = fu.photoURL || null;

  const existing = await query(
    `SELECT id, firebase_uid, name, email, phone, avatar_url, password_hash
     FROM users
     WHERE firebase_uid = $1
        OR ($2::text IS NOT NULL AND LOWER(email) = LOWER($2::text))
        OR ($3::text IS NOT NULL AND phone = $3::text)
     ORDER BY CASE WHEN firebase_uid = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [fu.uid, email, phone],
  );

  if (existing.rows[0]) {
    const row = existing.rows[0];
    const needsUpdate =
      row.firebase_uid !== fu.uid ||
      (!row.name && !!name) ||
      (!row.email && !!email) ||
      (!row.phone && !!phone) ||
      (!row.avatar_url && !!photo) ||
      row.password_hash === "$firebase$" ||
      row.password_hash === FIREBASE_ONLY_PASSWORD_MARKER;

    if (!needsUpdate) return "skipped";

    await query(
      `UPDATE users SET
        firebase_uid = $1,
        name = COALESCE(NULLIF($2, ''), name),
        email = COALESCE(email, $3),
        phone = COALESCE(phone, $4),
        avatar_url = COALESCE(avatar_url, $5),
        password_hash = CASE WHEN password_hash = '$firebase$' THEN $6 ELSE password_hash END
       WHERE id = $7`,
      [fu.uid, name, email, phone, photo, FIREBASE_ONLY_PASSWORD_MARKER, row.id],
    );
    return "updated";
  }

  await query(
    `INSERT INTO users (firebase_uid, name, email, phone, password_hash, role, avatar_url)
     VALUES ($1, $2, $3, $4, $5, 'user', $6)`,
    [fu.uid, name, email, phone, FIREBASE_ONLY_PASSWORD_MARKER, photo],
  );
  return "created";
}

async function getUserCounts(): Promise<{ postgres_total: number; firebase_synced_total: number }> {
  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS postgres_total,
       COUNT(*) FILTER (WHERE firebase_uid IS NOT NULL)::int AS firebase_synced_total
     FROM users`,
  );
  return {
    postgres_total: Number(rows[0]?.postgres_total ?? 0),
    firebase_synced_total: Number(rows[0]?.firebase_synced_total ?? 0),
  };
}

async function syncFirebaseUsersToPostgres(_detailLimit = 50): Promise<SyncSummary> {
  const health = firebaseConnectionHealth();
  if (!health.configured) {
    throw Object.assign(new Error(health.message), { code: health.status });
  }

  await ensureUserColumns();
  const firebaseUsers = await listAllFirebaseUsers();

  const summary: SyncSummary = {
    firebase_total: firebaseUsers.length,
    synced: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    postgres_after_sync: null,
    firebase_synced_after_sync: null,
    all_firebase_users_visible_in_admin: null,
    details: [],
  };

  if (!firebaseUsers.length) return summary;

  // Bulk UPSERT in chunks of 200 — far fewer DB round-trips than one-by-one
  const BULK = 200;
  for (let i = 0; i < firebaseUsers.length; i += BULK) {
    const batch = firebaseUsers.slice(i, i + BULK);
    const placeholders = batch.map((_, j) =>
      `($${j * 5 + 1},$${j * 5 + 2},$${j * 5 + 3},$${j * 5 + 4},$${j * 5 + 5},'${FIREBASE_ONLY_PASSWORD_MARKER}','user')`
    ).join(",");
    const params = batch.flatMap(fu => [
      fu.uid,
      displayNameForFirebaseUser(fu),
      fu.email || null,
      fu.phoneNumber || null,
      fu.photoURL || null,
    ]);
    try {
      const result = await query(
        `INSERT INTO users (firebase_uid,name,email,phone,avatar_url,password_hash,role)
         VALUES ${placeholders}
         ON CONFLICT (firebase_uid) WHERE firebase_uid IS NOT NULL DO UPDATE
           SET name=COALESCE(NULLIF(EXCLUDED.name,''),users.name),
               avatar_url=COALESCE(EXCLUDED.avatar_url,users.avatar_url),
               email=COALESCE(EXCLUDED.email,users.email)
         RETURNING (xmax = 0) AS inserted`,
        params
      );
      for (const row of result.rows) {
        if (row.inserted) summary.created++;
        else summary.updated++;
      }
    } catch {
      // Fallback: process individually to handle email-conflict edge cases
      await Promise.allSettled(batch.map(async (fu) => {
        try {
          const action = await upsertFirebaseUser(fu);
          if (action === "created") summary.created++;
          else if (action === "updated") summary.updated++;
          else summary.skipped++;
        } catch (err) {
          summary.errors++;
          logger.warn({ err, uid: fu.uid }, "failed to sync firebase user");
        }
      }));
    }
  }

  const counts = await getUserCounts();
  summary.synced = summary.created + summary.updated;
  summary.postgres_after_sync = counts.postgres_total;
  summary.firebase_synced_after_sync = counts.firebase_synced_total;
  summary.all_firebase_users_visible_in_admin =
    summary.errors === 0 && counts.firebase_synced_total >= firebaseUsers.length;
  return summary;
}

function formatUser(u: DbUser) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    neighborhood: u.neighborhood,
    birth_date: u.birth_date,
    gender: u.gender,
    national_id_masked: u.national_id ? String(u.national_id).slice(-4).padStart(String(u.national_id).length, "*") : null,
    is_banned: u.is_banned,
    created_at: u.created_at,
    firebase_uid: u.firebase_uid ? u.firebase_uid.slice(0, 8) + "…" : null,
    firebase_uid_full: u.firebase_uid,
    has_firebase: !!u.firebase_uid,
    avatar_url: u.avatar_url,
    source: u.firebase_uid ? "firebase_synced" : "postgres",
  };
}

async function listPostgresUsers(options: { search?: string; limit: number; offset: number }) {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (options.search?.trim()) {
    params.push(`%${options.search.trim()}%`);
    conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length} OR firebase_uid ILIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await query(`SELECT COUNT(*)::int AS total FROM users ${where}`, params);

  params.push(options.limit);
  const limitParam = params.length;
  params.push(options.offset);
  const offsetParam = params.length;

  const { rows } = await query(
    `SELECT id, name, phone, email, role, neighborhood, birth_date,
            national_id, is_banned, created_at, firebase_uid, avatar_url, gender
     FROM users
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params,
  );

  return {
    users: rows.map(formatUser),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

router.get("/admin/users", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });

    const limit = parsePositiveInt(req.query.limit, DEFAULT_ADMIN_USERS_LIMIT, MAX_ADMIN_USERS_LIMIT);
    const offset = parseOffset(req.query.offset);
    // Sync is opt-in only — never run automatically on page load
    const sync = null;

    const listed = await listPostgresUsers({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      limit,
      offset,
    });
    const counts = await getUserCounts();

    return res.json({
      users: listed.users,
      total: listed.total,
      count: listed.users.length,
      pagination: {
        limit,
        offset,
        has_more: offset + listed.users.length < listed.total,
        next_offset: offset + listed.users.length < listed.total ? offset + listed.users.length : null,
      },
      sync,
      sourceTotals: {
        postgres: counts.postgres_total - counts.firebase_synced_total,
        firebase_synced: counts.firebase_synced_total,
        all_postgres: counts.postgres_total,
      },
    });
  } catch (err) {
    logger.error({ err }, "admin users route error");
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/admin/sync-firebase-users", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    const sync = await syncFirebaseUsersToPostgres(100);
    return res.json(sync);
  } catch (err) {
    logger.error({ err }, "sync firebase users route error");
    return res.status(500).json({
      error: "تعذّر مزامنة المستخدمين",
      detail: err instanceof Error ? err.message : String(err),
      firebase: firebaseConnectionHealth(),
    });
  }
});

router.get("/admin/users-source-health", async (req: Request, res: Response) => {
  try {
    if (!await isAdminRequest(req)) return res.status(403).json({ error: "غير مصرح" });
    await ensureUserColumns();
    const firebase = firebaseConnectionHealth();
    const counts = await getUserCounts();

    let firebaseUsers: FirebaseUserRecord[] | null = null;
    let firebaseError: string | null = null;
    if (firebase.configured) {
      try {
        firebaseUsers = await listAllFirebaseUsers();
      } catch (err) {
        firebaseError = err instanceof Error ? err.message : String(err);
        logger.warn({ err }, "firebase users health check failed");
      }
    }

    const firebaseTotal = firebaseUsers?.length ?? null;
    const providerCounts: Record<string, number> = {};
    if (firebaseUsers) {
      for (const fu of firebaseUsers) {
        const providers = providerSummary(fu);
        if (!providers.length) providerCounts.unknown = (providerCounts.unknown ?? 0) + 1;
        for (const p of providers) providerCounts[p] = (providerCounts[p] ?? 0) + 1;
      }
    }

    const missing = firebaseTotal === null
      ? null
      : Math.max(0, firebaseTotal - counts.firebase_synced_total);

    return res.json({
      status:
        firebaseError ? "firebase_error" :
        !firebase.configured ? firebase.status :
        missing === 0 ? "healthy" : "needs_sync",
      postgres_users: counts.postgres_total,
      postgres_firebase_synced_users: counts.firebase_synced_total,
      firebase_users: firebaseTotal,
      firebase_provider_counts: providerCounts,
      firebase_admin_configured: firebase.configured,
      firebase,
      firebase_error: firebaseError,
      firebase_missing_in_postgres: missing,
      all_firebase_users_visible_in_admin: firebaseTotal === null ? null : missing === 0,
      supports_600_plus_users: true,
      account_continuity: {
        firebase_auth_is_source_of_truth: true,
        preserves_existing_firebase_uid: true,
        postgres_is_operational_mirror: true,
        destructive_reset_required: false,
      },
      admin_users_default_limit: DEFAULT_ADMIN_USERS_LIMIT,
      admin_users_max_limit: MAX_ADMIN_USERS_LIMIT,
    });
  } catch (err) {
    logger.error({ err }, "users source health route error");
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;