import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter } from "./lib/rate-limiters";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// ── Trust Replit/Render reverse proxy ──────────────────────────────────────
app.set("trust proxy", 1);

// ── Security headers (Helmet) ──────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

// ── CORS ───────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  "https://hasahisawi.onrender.com",
  "https://hasahisawi.firebaseapp.com",
  "https://hasahisawi.web.app",
  ...(process.env.REPLIT_DEV_DOMAIN
    ? [`https://${process.env.REPLIT_DEV_DOMAIN}`]
    : []),
  ...(process.env.REPLIT_DOMAINS
    ? process.env.REPLIT_DOMAINS.split(",").map((d) => `https://${d.trim()}`)
    : []),
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return callback(null, true);
      if (
        process.env.NODE_ENV !== "production" &&
        (origin.startsWith("http://localhost") || origin.startsWith("http://127."))
      ) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-pin", "x-user-token"],
  }),
);

// ── Request logging ────────────────────────────────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ── Body size limits (DoS protection) ─────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ── Global rate limiter: 300 req/15 min per IP ────────────────────────────
app.use(globalLimiter);

// ── Static files ───────────────────────────────────────────────────────────
const publicDir = path.join(__dirname, "..", "public");
const uploadsDir = path.join(publicDir, "uploads");
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

// ── API routes ─────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Global error handler ───────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.startsWith("CORS:")) {
    return res.status(403).json({ error: "غير مسموح بالوصول من هذا النطاق" });
  }
  logger.error(err, "Unhandled error");
  return res.status(500).json({ error: "خطأ في الخادم" });
});

export default app;
