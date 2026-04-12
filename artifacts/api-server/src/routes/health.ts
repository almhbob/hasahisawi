import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/version", (_req, res) => {
  res.json({
    deployed_at: new Date().toISOString(),
    build_time: process.env.VERCEL_BUILD_TIME || "unknown",
    git_sha: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || "local",
    env: process.env.VERCEL ? "vercel" : "local",
  });
});

export default router;
