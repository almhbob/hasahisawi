import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function hasRealDatabaseUrl(): boolean {
  const dbUrl = process.env.DATABASE_URL ?? "";
  return dbUrl.length > 0 &&
    !dbUrl.includes(".invalid") &&
    !dbUrl.includes("placeholder") &&
    !dbUrl.includes("nodb");
}

function firebaseEnvStatus() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "";
  if (!raw.trim()) {
    return { configured: false, json_valid: false, project_id: null, reason: "missing_env" };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const projectId = typeof parsed.project_id === "string" ? parsed.project_id : null;
    const configured = !!projectId && typeof parsed.client_email === "string" && typeof parsed.private_key === "string";
    return {
      configured,
      json_valid: true,
      project_id: projectId,
      reason: configured ? null : "missing_required_fields",
    };
  } catch {
    return { configured: false, json_valid: false, project_id: null, reason: "invalid_json" };
  }
}

function cloudinaryEnvStatus() {
  const cloudinaryUrl = process.env.CLOUDINARY_URL ?? "";
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? "";
  const configured =
    (cloudinaryUrl.startsWith("cloudinary://") && !cloudinaryUrl.includes("<")) ||
    (!!cloudName && !!process.env.CLOUDINARY_API_KEY && !!process.env.CLOUDINARY_API_SECRET);
  return {
    configured,
    reason: configured ? null : "missing_cloudinary_env",
  };
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/full", (_req, res) => {
  const database = { configured: hasRealDatabaseUrl() };
  const firebase = firebaseEnvStatus();
  const cloudinary = cloudinaryEnvStatus();
  const ok = database.configured && firebase.configured;

  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    service: "api-server",
    environment: process.env.NODE_ENV ?? "unknown",
    uptime_seconds: Math.round(process.uptime()),
    checks: {
      database,
      firebase,
      cloudinary,
    },
  });
});

export default router;