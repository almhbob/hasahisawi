import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rateLimit } from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// ── Rate Limiting ────────────────────────────────────────────────────────────

// حد عام: 200 طلب لكل IP في الدقيقة
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جداً، حاول بعد دقيقة" },
  skip: (req) => req.method === "OPTIONS",
});

// حد صارم لمسارات المصادقة: 10 محاولات لكل IP في 15 دقيقة
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "محاولات دخول كثيرة جداً، انتظر 15 دقيقة" },
});

// حد متوسط للعمليات الحساسة: 30 طلب في الدقيقة
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جداً، حاول لاحقاً" },
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: (origin, callback) => {
    // السماح بطلبات بدون origin (مثل تطبيقات الموبايل والـ curl)
    if (!origin) return callback(null, true);
    // السماح بجميع النطاقات الموثوقة
    const allowed = [
      /^https?:\/\/localhost(:\d+)?$/,
      /\.replit\.dev$/,
      /\.replit\.app$/,
      /\.pike\.replit\.dev$/,
      /hasahisawi\.vercel\.app$/,
      /hasahisawi\.app$/,
    ];
    if (allowed.some(r => r.test(origin))) return callback(null, origin);
    callback(null, origin); // اقبل أي origin في مرحلة التطوير
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تقديم الملفات المرفوعة كـ static
const publicDir = path.join(__dirname, "..", "public");
const uploadsDir = path.join(publicDir, "uploads");
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

app.use("/api", generalLimiter);
app.use("/api/login",    authLimiter);
app.use("/api/register", authLimiter);
app.use("/api/auth",     authLimiter);
app.use("/api/admin/push/broadcast", sensitiveLimiter);
app.use("/api", router);

export default app;
