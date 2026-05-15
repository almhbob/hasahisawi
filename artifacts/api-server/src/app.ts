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

// ── Trust reverse proxy (Replit / Render / Railway) ───────────────────────
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

// في الإنتاج (Render / Railway) الملفات المرفوعة تُحفَظ في /tmp/uploads
// لأن نظام الملفات في كلا المنصتين ephemeral — خدّمها من هناك أيضاً
if (process.env.NODE_ENV === "production") {
  app.use("/uploads", express.static("/tmp/uploads"));
}
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(publicDir));

// ── صفحات قانونية عامة (لا تستلزم مصادقة) ────────────────────────────────
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
  <div class="logo">
    <div class="logo-icon">🏙️</div>
    <div>
      <h1>سياسة الخصوصية</h1>
      <div class="subtitle">تطبيق حصاحيصاوي — بوابة مدينة الحصاحيصا</div>
    </div>
  </div>
  <div class="badge">آخر تحديث: مايو 2026</div>
</header>

<div class="toc">
  <div class="toc-title">📋 محتويات السياسة</div>
  <a href="#collect">١. البيانات التي نجمعها</a>
  <a href="#use">٢. كيف نستخدم بياناتك</a>
  <a href="#share">٣. مشاركة البيانات مع أطراف ثالثة</a>
  <a href="#storage">٤. تخزين البيانات وحمايتها</a>
  <a href="#rights">٥. حقوقك كمستخدم</a>
  <a href="#children">٦. الخصوصية وحماية القاصرين</a>
  <a href="#updates">٧. التحديثات على هذه السياسة</a>
  <a href="#contact">٨. التواصل بشأن الخصوصية</a>
</div>

<div class="important">
  ⚠️ باستخدامك تطبيق حصاحيصاوي فأنت تقر بقراءة هذه السياسة وقبولها. إذا لم توافق على أي بند، يرجى التوقف عن استخدام التطبيق.
</div>

<h2 id="collect">١. البيانات التي نجمعها</h2>
<p>نجمع البيانات التالية لتوفير خدماتنا بشكل كامل وآمن:</p>

<div class="card">
  <div class="card-title">📱 بيانات الحساب (مطلوبة للتسجيل)</div>
  <ul>
    <li>الاسم الكامل</li>
    <li>رقم الهاتف أو البريد الإلكتروني</li>
    <li>كلمة المرور (مُشفَّرة بخوارزمية bcrypt ولا تُخزَّن بصيغتها الأصلية أبداً)</li>
    <li>الجنس (لتفعيل المحتوى المناسب — اختياري)</li>
    <li>الصورة الشخصية (اختيارية)</li>
  </ul>
</div>

<div class="card">
  <div class="card-title">📍 بيانات الاستخدام</div>
  <ul>
    <li>الموقع الجغرافي — فقط عند إرسال البلاغات أو طلب خدمة التوصيل، ولفترة الطلب فقط</li>
    <li>الصور والمقاطع المرفوعة في المنشورات والرسائل والإعلانات</li>
    <li>محتوى الرسائل في الدردشة المباشرة</li>
    <li>بيانات الحجوزات والرحلات (للمواصلات والسفر)</li>
    <li>رمز push notification لإرسال الإشعارات (يُخزَّن بشكل مجهول)</li>
  </ul>
</div>

<div class="card">
  <div class="card-title">🔧 بيانات تقنية تلقائية</div>
  <ul>
    <li>نوع الجهاز ونظام التشغيل (لأغراض التوافق التقني)</li>
    <li>سجلات الأخطاء التقنية (لتحسين الأداء)</li>
  </ul>
</div>

<h2 id="use">٢. كيف نستخدم بياناتك</h2>
<ul>
  <li><strong>تقديم الخدمات:</strong> تشغيل جميع وظائف التطبيق (السوق، الوظائف، المواصلات، الدردشة، إلخ)</li>
  <li><strong>المصادقة والأمان:</strong> التحقق من هويتك وحماية حسابك</li>
  <li><strong>الإشعارات:</strong> إرسال تنبيهات الرسائل وتحديثات الرحلات وأوقات الصلاة</li>
  <li><strong>التحسين المستمر:</strong> تحليل أنماط الاستخدام لتطوير التطبيق</li>
  <li><strong>دعم المستخدمين:</strong> الرد على استفساراتك ومساعدتك في المشكلات</li>
</ul>
<p><strong class="highlight">نحن لا نبيع بياناتك لأي طرف ثالث ولا نستخدمها للإعلانات المستهدفة.</strong></p>

<h2 id="share">٣. مشاركة البيانات مع أطراف ثالثة</h2>
<p>نستخدم الخدمات التالية بموجب سياسات خصوصيتها الخاصة:</p>

<div class="card">
  <div class="card-title">🔥 Firebase (Google)</div>
  <p>المصادقة وتسجيل الدخول بـ Google. سياسة الخصوصية: <a href="https://firebase.google.com/support/privacy" style="color:#60A5FA">firebase.google.com/support/privacy</a></p>
</div>
<div class="card">
  <div class="card-title">☁️ Cloudinary</div>
  <p>تخزين الصور والمقاطع المرفوعة. سياسة الخصوصية: <a href="https://cloudinary.com/privacy" style="color:#60A5FA">cloudinary.com/privacy</a></p>
</div>
<div class="card">
  <div class="card-title">🛤️ Railway</div>
  <p>استضافة قاعدة البيانات في بيئة آمنة. سياسة الخصوصية: <a href="https://railway.app/legal/privacy" style="color:#60A5FA">railway.app/legal/privacy</a></p>
</div>
<div class="card">
  <div class="card-title">▲ Vercel</div>
  <p>استضافة خادم API. سياسة الخصوصية: <a href="https://vercel.com/legal/privacy-policy" style="color:#60A5FA">vercel.com/legal/privacy-policy</a></p>
</div>

<h2 id="storage">٤. تخزين البيانات وحمايتها</h2>
<ul>
  <li>جميع البيانات تُنقَل عبر اتصالات HTTPS مشفّرة</li>
  <li>كلمات المرور مُشفَّرة بـ bcrypt (salt rounds: 10) ولا تُقرأ بأي حال</li>
  <li>قاعدة البيانات تعمل داخل بيئة معزولة (Railway PostgreSQL) مع تشفير SSL</li>
  <li>لا نحتفظ بالبيانات الحساسة (رموز OTP) أكثر من 5 دقائق</li>
  <li>رموز إعادة تعيين كلمة المرور تنتهي صلاحيتها خلال 15 دقيقة من الإصدار</li>
  <li>يحق لنا الاحتفاظ بالبيانات مدة لا تتجاوز 3 سنوات من آخر نشاط للحساب</li>
</ul>

<h2 id="rights">٥. حقوقك كمستخدم</h2>
<div class="card">
  <ul>
    <li>✅ <strong>الاطلاع:</strong> طلب نسخة من بياناتك الشخصية المحفوظة</li>
    <li>✅ <strong>التصحيح:</strong> تحديث معلوماتك من داخل التطبيق (الإعدادات)</li>
    <li>✅ <strong>الحذف:</strong> طلب حذف حسابك وجميع بياناتك نهائياً من داخل التطبيق (الإعدادات → حذف الحساب)</li>
    <li>✅ <strong>الاعتراض:</strong> إلغاء إذن الإشعارات أو الموقع في أي وقت من إعدادات الجهاز</li>
    <li>✅ <strong>النقل:</strong> طلب تصدير بياناتك بصيغة قابلة للقراءة</li>
  </ul>
</div>
<p>لممارسة أي من هذه الحقوق، تواصل معنا على: <a href="mailto:Hasahisawi@hotmail.com" style="color:#60A5FA">Hasahisawi@hotmail.com</a></p>

<h2 id="children">٦. الخصوصية وحماية القاصرين</h2>
<p>تطبيق حصاحيصاوي مصمم للمستخدمين الذين تتجاوز أعمارهم <strong>13 عاماً</strong>. لا نجمع عن قصد بيانات من القاصرين دون الـ 13. إذا اكتشفنا أن قاصراً قدّم بيانات شخصية بدون إذن والديه، سنحذف تلك البيانات فوراً.</p>
<p>يحق للآباء والأولياء التواصل معنا لمراجعة أو حذف بيانات أطفالهم.</p>

<h2 id="updates">٧. التحديثات على هذه السياسة</h2>
<p>قد نُحدّث هذه السياسة من وقت لآخر لمواكبة التطورات في خدماتنا أو المتطلبات القانونية. سنُخطرك بأي تغييرات جوهرية عبر إشعار داخل التطبيق. تاريخ "آخر تحديث" في أعلى الصفحة يعكس دائماً النسخة الحالية.</p>

<h2 id="contact">٨. التواصل بشأن الخصوصية</h2>
<p>لأي استفسار أو طلب يتعلق بخصوصيتك أو بياناتك الشخصية:</p>
<div class="contact-grid">
  <div class="contact-item">
    <div style="font-size:24px;margin-bottom:8px">📧</div>
    <div style="color:#94A3B8;font-size:12px;margin-bottom:4px">البريد الإلكتروني</div>
    <a href="mailto:Hasahisawi@hotmail.com">Hasahisawi@hotmail.com</a>
  </div>
  <div class="contact-item">
    <div style="font-size:24px;margin-bottom:8px">💬</div>
    <div style="color:#94A3B8;font-size:12px;margin-bottom:4px">واتساب أعمال</div>
    <a href="https://wa.me/966597083352">+966 597 083 352</a>
  </div>
</div>

<footer>
  <p>© 2026 حصاحيصاوي — بوابة مدينة الحصاحيصا، ولاية الجزيرة، السودان</p>
  <p style="margin-top:8px">الإصدار الحالي: v5.9.3 | آخر تحديث لهذه السياسة: مايو 2026</p>
</footer>

</div>
</body>
</html>`;

app.get("/privacy-policy", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(PRIVACY_HTML);
});

// اختصار مريح
app.get("/privacy", (_req: Request, res: Response) => res.redirect(301, "/privacy-policy"));

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
