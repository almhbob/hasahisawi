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
// نسمح لجميع origins لأن:
// 1. تطبيق React Native (Expo/AAB) قد يرسل Origin مختلف أو لا يرسل أصلاً
// 2. الحماية الفعلية تتمّ عبر Bearer tokens (x-user-token, x-admin-pin) وليس CORS
// 3. CORS مصمم لحماية المتصفحات من cookies cross-site؛ تطبيقنا لا يعتمد عليها
app.use(
  cors({
    origin: true,
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

// في الإنتاج على Render، الملفات المرفوعة تذهب إلى /tmp/uploads
// لذا يجب خدمتها من هناك أيضاً
if (process.env.NODE_ENV === "production") {
  app.use("/uploads", express.static("/tmp/uploads"));
}
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

// ── API routes ─────────────────────────────────────────────────────────────
// [FIX-E] إجبار Content-Type: application/json على كل ردود /api
app.use("/api", (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.use("/api", router);

// ── Global error handler ───────────────────────────────────────────────────
// [FIX-E] معالج الأخطاء العامة — يمنع إرسال HTML عند أي خطأ غير معالج
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.startsWith("CORS:")) {
    return res.status(403).json({ error: "غير مسموح بالوصول من هذا النطاق" });
  }
  if ((err as any).type === "entity.parse.failed") {
    return res.status(400).json({ error: "صيغة البيانات غير صحيحة" });
  }
  logger.error(err, "Unhandled error");
  return res.status(500).json({ error: "خطأ في الخادم" });
});

export default app;
