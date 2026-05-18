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

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin: true,
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

const publicDir = path.join(__dirname, "..", "public");
const uploadsDir = path.join(publicDir, "uploads");

if (process.env.NODE_ENV === "production") {
  app.use("/uploads", express.static("/tmp/uploads"));
}
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>سياسة الخصوصية — حصاحيصاوي</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#0F172A;color:#E2E8F0;line-height:1.8;font-size:15px}
  .wrap{max-width:820px;margin:0 auto;padding:40px 20px 80px}
  header{text-align:center;padding:40px 0 32px;border-bottom:1px solid #1E293B;margin-bottom:40px}
  .logo{display:inline-flex;align-items:center;gap:12px;margin-bottom:16px}
  .logo-icon{width:52px;height:52px;background:linear-gradient(135deg,#F97316,#FBBF24);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:26px}
  h1{font-size:28px;font-weight:700;color:#F8FAFC;margin-bottom:8px}
  .subtitle{color:#94A3B8;font-size:14px}
  .badge{display:inline-block;background:#1E3A5F;color:#60A5FA;font-size:12px;padding:4px 12px;border-radius:20px;margin-top:12px}
  h2{font-size:18px;font-weight:700;color:#F97316;margin:32px 0 12px;padding-bottom:8px;border-bottom:1px solid #1E293B}
  h2::before{content:"◆ "}
  p{color:#CBD5E1;margin-bottom:12px}
  ul,ol{padding-right:20px;margin-bottom:12px;color:#CBD5E1}
  li{margin-bottom:6px}
  .card{background:#1E293B;border:1px solid #334155;border-radius:14px;padding:20px 24px;margin-bottom:16px}
  .card-title{font-weight:700;color:#F8FAFC;margin-bottom:8px;font-size:15px}
  .highlight{background:#F97316;color:#fff;padding:2px 8px;border-radius:6px;font-size:13px}
  .contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px}
  @media(max-width:600px){.contact-grid{grid-template-columns:1fr}}
  .contact-item{background:#0F172A;border:1px solid #334155;border-radius:10px;padding:14px;text-align:center}
  .contact-item a{color:#60A5FA;text-decoration:none}
  footer{text-align:center;color:#475569;font-size:13px;margin-top:48px;padding-top:24px;border-top:1px solid #1E293B}
  .toc{background:#1E293B;border-radius:12px;padding:20px 24px;margin-bottom:32px}
  .toc-title{font-weight:700;color:#F8FAFC;margin-bottom:12px}
  .toc a{color:#60A5FA;text-decoration:none;display:block;padding:4px 0;font-size:14px}
  .toc a:hover{color:#F97316}
  .important{background:#FEF08A10;border:1px solid #F97316;border-radius:10px;padding:14px 18px;color:#FDE68A;margin-bottom:16px;font-size:14px}
</style>
</head>
<body>
<div class="wrap">
<header>
  <div class="logo"><div class="logo-icon">🏙️</div><div><h1>سياسة الخصوصية</h1><div class="subtitle">تطبيق حصاحيصاوي — بوابة مدينة الحصاحيصا</div></div></div>
  <div class="badge">آخر تحديث: مايو 2026</div>
</header>
<div class="important">⚠️ باستخدامك تطبيق حصاحيصاوي فأنت تقر بقراءة هذه السياسة وقبولها.</div>
<h2>البيانات التي نجمعها</h2><p>نجمع بيانات الحساب والاستخدام الضرورية لتشغيل التطبيق وتحسينه.</p>
<h2>كيف نستخدم بياناتك</h2><p>نستخدم البيانات لتقديم الخدمات، المصادقة، الإشعارات، الدعم، والتحسين المستمر. لا نبيع بياناتك.</p>
<h2>الخدمات الطرفية</h2><p>نستخدم Firebase للمصادقة، Cloudinary لتخزين الوسائط، وRailway لاستضافة قاعدة البيانات والخادم.</p>
<h2>حقوقك</h2><p>يمكنك طلب الاطلاع أو التصحيح أو الحذف عبر التواصل معنا.</p>
<h2>التواصل</h2><p><a href="mailto:Hasahisawi@hotmail.com" style="color:#60A5FA">Hasahisawi@hotmail.com</a></p>
<footer><p>© 2026 حصاحيصاوي</p></footer>
</div>
</body>
</html>`;

app.get("/privacy-policy", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(PRIVACY_HTML);
});

app.get("/privacy", (_req: Request, res: Response) => res.redirect(301, "/privacy-policy"));

// Expose routes both with and without /api.
// The mobile app uses /api/*, while direct Railway diagnostics may be opened as /*.
app.use("/api", router);
app.use(router);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.startsWith("CORS:")) {
    return res.status(403).json({ error: "غير مسموح بالوصول من هذا النطاق" });
  }
  logger.error(err, "Unhandled error");
  return res.status(500).json({ error: "خطأ في الخادم" });
});

export default app;
