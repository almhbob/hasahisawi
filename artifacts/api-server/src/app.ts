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

app.set("trust proxy", 1);

function allowedOrigins(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = [
    "http://localhost:19006",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8081",
    "https://hasahisawi.com",
    "https://www.hasahisawi.com",
    "https://hasahisawi.vercel.app",
  ];
  return Array.from(new Set([...configured, ...defaults]));
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      if (allowedOrigins().includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-pin", "x-user-token"],
  }),
);

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

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(globalLimiter);

function sendLiveness(_req: Request, res: Response) {
  res.status(200).json({
    status: "ok",
    service: "api-server",
    health: "/api/healthz",
    readiness: "/api/readyz",
  });
}

app.get("/", sendLiveness);
app.get("/healthz", sendLiveness);
app.get("/readyz", sendLiveness);

const publicDir = path.join(__dirname, "..", "public");
const uploadsDir = path.join(publicDir, "uploads");

if (process.env.NODE_ENV === "production") {
  app.use("/uploads", express.static("/tmp/uploads"));
}
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>سياسة الخصوصية — حصاحيصاوي</title></head>
<body style="font-family:Tahoma,Arial,sans-serif;background:#0F172A;color:#E2E8F0;line-height:1.8;padding:32px;direction:rtl">
<main style="max-width:820px;margin:auto"><h1>سياسة الخصوصية — حصاحيصاوي</h1><p>آخر تحديث: مايو 2026</p><p>باستخدامك تطبيق حصاحيصاوي فأنت تقر بقراءة هذه السياسة وقبولها.</p><h2>البيانات التي نجمعها</h2><p>نجمع بيانات الحساب والاستخدام الضرورية لتشغيل التطبيق وتحسينه.</p><h2>كيف نستخدم بياناتك</h2><p>نستخدم البيانات لتقديم الخدمات، المصادقة، الإشعارات، الدعم، والتحسين المستمر. لا نبيع بياناتك.</p><h2>الخدمات الطرفية</h2><p>نستخدم Firebase للمصادقة، Cloudinary لتخزين الوسائط، وقاعدة بيانات PostgreSQL للخدمات.</p><h2>حقوقك</h2><p>يمكنك طلب الاطلاع أو التصحيح أو الحذف عبر التواصل معنا.</p><h2>التواصل</h2><p><a href="mailto:Hasahisawi@hotmail.com" style="color:#60A5FA">Hasahisawi@hotmail.com</a></p><footer><p>© 2026 حصاحيصاوي</p></footer></main>
</body></html>`;

app.get("/privacy-policy", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(PRIVACY_HTML);
});

app.get("/privacy", (_req: Request, res: Response) => res.redirect(301, "/privacy-policy"));

// In production expose API only under /api to reduce ambiguity and attack surface.
// In development keep both prefixes for easier diagnostics.
app.use("/api", router);
if (process.env.NODE_ENV !== "production") {
  app.use(router);
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.startsWith("CORS:")) {
    return res.status(403).json({ error: "غير مسموح بالوصول من هذا النطاق" });
  }
  logger.error(err, "Unhandled error");
  return res.status(500).json({ error: "خطأ في الخادم" });
});

export default app;