import { Router, type IRouter } from "express";
import { Pool } from "pg";

const router: IRouter = Router();
const HEALTH_ROUTE_VERSION = "2026-05-18-api-health-v6";

function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? "";
}

function hasRealDatabaseUrl(): boolean {
  const dbUrl = getDatabaseUrl();
  return dbUrl.length > 0 &&
    !dbUrl.includes(".invalid") &&
    !dbUrl.includes("placeholder") &&
    !dbUrl.includes("nodb");
}

function shouldUseSsl(dbUrl: string): boolean {
  return dbUrl.includes("sslmode=require") ||
    dbUrl.includes("ssl=true") ||
    dbUrl.includes("railway.internal") ||
    dbUrl.includes("proxy.rlwy.net") ||
    dbUrl.includes("railway") ||
    dbUrl.includes("rlwy") ||
    dbUrl.includes("neon.tech");
}

async function databaseStatus() {
  const dbUrl = getDatabaseUrl();
  const configured = hasRealDatabaseUrl();

  if (!configured) {
    return { configured: false, connected: false, latency_ms: null, provider_hint: null, reason: "DATABASE_URL missing or placeholder" };
  }

  const providerHint = dbUrl.includes("railway") || dbUrl.includes("rlwy")
    ? "railway"
    : dbUrl.includes("neon.tech") ? "neon" : null;

  const started = Date.now();
  const pool = new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 1_000,
    max: 1,
    allowExitOnIdle: true,
    ssl: shouldUseSsl(dbUrl) ? { rejectUnauthorized: false } : false,
  });

  try {
    const result = await pool.query("SELECT 1 AS ok");
    return { configured: true, connected: result.rows[0]?.ok === 1, latency_ms: Date.now() - started, provider_hint: providerHint, reason: null };
  } catch (err) {
    return { configured: true, connected: false, latency_ms: Date.now() - started, provider_hint: providerHint, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function firebaseEnvStatus() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "";
  if (!raw.trim()) return { configured: false, json_valid: false, project_id: null, reason: "missing_env" };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const projectId = typeof parsed.project_id === "string" ? parsed.project_id : null;
    const configured = !!projectId && typeof parsed.client_email === "string" && typeof parsed.private_key === "string";
    return { configured, json_valid: true, project_id: projectId, reason: configured ? null : "missing_required_fields" };
  } catch {
    return { configured: false, json_valid: false, project_id: null, reason: "invalid_json" };
  }
}

function cloudinaryEnvStatus() {
  const cloudinaryUrl = process.env.CLOUDINARY_URL ?? "";
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME ?? "").trim();
  const apiKey = process.env.CLOUDINARY_API_KEY ?? "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET ?? "";
  const configured =
    (cloudinaryUrl.startsWith("cloudinary://") && !cloudinaryUrl.includes("<")) ||
    (!!cloudName && !!apiKey && !!apiSecret && !apiKey.includes("<") && !apiSecret.includes("<"));
  return {
    configured,
    provider: configured ? "cloudinary" : "local_ephemeral_fallback",
    persistent_uploads: configured,
    max_upload_mb: 500,
    accepted_extensions: ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "mp4", "mov", "webm"],
    reason: configured ? null : "missing_cloudinary_env_uploads_will_not_be_persistent",
  };
}

function authReadinessStatus(firebase: ReturnType<typeof firebaseEnvStatus>, database: Awaited<ReturnType<typeof databaseStatus>>) {
  return {
    ready: Boolean(firebase.configured && database.connected),
    firebase_auth_is_source_of_truth: true,
    postgres_is_operational_mirror: true,
    destructive_reset_required: false,
    exchange_endpoint: "/api/auth/firebase-exchange",
    legacy_password_login_endpoint: "/api/auth/login",
    admin_sync_endpoint: "/api/admin/sync-firebase-users",
    users_health_endpoint: "/api/admin/users-source-health",
    reason: firebase.configured && database.connected ? null : "firebase_or_database_not_ready",
  };
}

async function fullStatus() {
  const database = await databaseStatus();
  const firebase = firebaseEnvStatus();
  const cloudinary = cloudinaryEnvStatus();
  const auth = authReadinessStatus(firebase, database);
  const ok = database.connected && firebase.configured;
  return {
    ok,
    body: {
      status: ok ? "ok" : "degraded",
      service: "api-server",
      version: HEALTH_ROUTE_VERSION,
      environment: process.env.NODE_ENV ?? "unknown",
      uptime_seconds: Math.round(process.uptime()),
      checks: {
        database,
        firebase,
        auth,
        cloudinary,
        upload: {
          route: "/api/upload",
          ready: true,
          persistent: cloudinary.persistent_uploads,
          provider: cloudinary.provider,
          reason: cloudinary.reason,
        },
      },
    },
  };
}

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok", version: HEALTH_ROUTE_VERSION });
});

router.get("/healthz/full", async (_req, res) => {
  const status = await fullStatus();
  res.status(status.ok ? 200 : 503).json(status.body);
});

router.get("/readyz", async (_req, res) => {
  const status = await fullStatus();
  res.status(status.ok ? 200 : 503).json({
    ready: status.ok,
    version: HEALTH_ROUTE_VERSION,
    checks: {
      database: status.body.checks.database.connected,
      firebase: status.body.checks.firebase.configured,
      persistent_uploads: status.body.checks.cloudinary.persistent_uploads,
    },
    details: status.body.checks,
  });
});

export default router;