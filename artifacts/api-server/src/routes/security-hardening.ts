import { Router, type Request, type Response, type NextFunction } from "express";
import { Pool } from "pg";
import { timingSafeEqual } from "node:crypto";
import { verifyIdToken } from "../lib/firebase-admin";
import { authLimiter, heavyWriteLimiter, pinLimiter } from "../lib/rate-limiters";

const router = Router();

const isProduction = process.env.NODE_ENV === "production";
const hardeningEnabled = process.env.DISABLE_SECURITY_HARDENING !== "true";
const requireOtp = process.env.REQUIRE_OTP === "true" || (isProduction && process.env.REQUIRE_OTP !== "false");
const allowPublicUpload = process.env.ALLOW_PUBLIC_UPLOAD === "true";
const allowAdminRegistration = process.env.ALLOW_ADMIN_REGISTRATION === "true";

const dbUrl = process.env.DATABASE_URL ?? "";
const dbEnabled =
  dbUrl.length > 0 &&
  !dbUrl.includes(".invalid") &&
  !dbUrl.includes("placeholder") &&
  !dbUrl.includes("nodb");

const pool: Pool | null = dbEnabled
  ? new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      max: 4,
      allowExitOnIdle: true,
      ssl:
        dbUrl.includes("sslmode=require") ||
        dbUrl.includes("ssl=true") ||
        dbUrl.includes("railway") ||
        dbUrl.includes("rlwy") ||
        dbUrl.includes("neon.tech")
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

async function query(sql: string, params: unknown[] = []) {
  if (!pool) throw Object.assign(new Error("db_not_configured"), { code: "DB_NOT_CONFIGURED" });
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

function bearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

function isJwt(token: string): boolean {
  return token.split(".").length === 3 && token.startsWith("eyJ");
}

function safeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a.padEnd(128, "\0"));
    const bb = Buffer.from(b.padEnd(128, "\0"));
    return a.length === b.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

async function sessionUserFromBackendToken(token: string): Promise<Record<string, unknown> | null> {
  const { rows } = await query(
    `SELECT u.* FROM users u
     JOIN user_sessions s ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [token],
  );
  return rows[0] ?? null;
}

async function sessionUserFromFirebaseToken(token: string): Promise<Record<string, unknown> | null> {
  const decoded = await verifyIdToken(token);
  if (!decoded?.uid) return null;
  const { rows } = await query(`SELECT * FROM users WHERE firebase_uid = $1 LIMIT 1`, [decoded.uid]);
  return rows[0] ?? null;
}

async function getVerifiedUser(req: Request): Promise<Record<string, unknown> | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const backendUser = await sessionUserFromBackendToken(token).catch(() => null);
  if (backendUser) return backendUser;
  if (!isJwt(token)) return null;
  return sessionUserFromFirebaseToken(token).catch(() => null);
}

async function requireAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!hardeningEnabled || allowPublicUpload) return next();
  const user = await getVerifiedUser(req).catch(() => null);
  if (!user) return res.status(401).json({ error: "يجب تسجيل الدخول قبل تنفيذ هذه العملية" });
  return next();
}

async function requireAdminSession(req: Request, res: Response, next: NextFunction) {
  if (!hardeningEnabled) return next();
  const user = await getVerifiedUser(req).catch(() => null);
  if (user?.role !== "admin") return res.status(403).json({ error: "صلاحية مدير مطلوبة" });
  return next();
}

async function storedAdminPin(): Promise<string | null> {
  const configured = (process.env.DEFAULT_ADMIN_PIN ?? "").trim();
  if (configured && configured !== "4444") return configured;
  const result = await query(`SELECT value FROM admin_settings WHERE key='admin_pin' LIMIT 1`).catch(() => ({ rows: [] as any[] }));
  const dbPin = String(result.rows[0]?.value ?? "").trim();
  if (dbPin && dbPin !== "4444") return dbPin;
  return null;
}

router.use((req: Request, res: Response, next: NextFunction) => {
  if (!hardeningEnabled || !isProduction) return next();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const pinInHeader = typeof req.headers["x-admin-pin"] === "string";
  const pinInBody = typeof body.admin_pin === "string" || typeof body.current_pin === "string";
  if (pinInHeader || pinInBody) {
    return res.status(403).json({
      error: "تم تعطيل صلاحيات PIN في الإنتاج. استخدم جلسة مدير موثقة.",
    });
  }
  return next();
});

router.post("/auth/register", (req: Request, res: Response, next: NextFunction) => {
  if (!hardeningEnabled || !requireOtp) return next();
  const otp = typeof req.body?.otp_code === "string" ? req.body.otp_code.trim() : "";
  if (!otp) {
    return res.status(400).json({
      error: "رمز التحقق مطلوب قبل إنشاء الحساب في نسخة الإنتاج.",
    });
  }
  return next();
});

router.post("/auth/register-admin", (req: Request, res: Response, next: NextFunction) => {
  if (!hardeningEnabled || allowAdminRegistration) return next();
  return res.status(403).json({
    error: "تم تعطيل إنشاء حسابات الإدارة من الواجهة. أنشئ المدير الأول من بيئة آمنة فقط.",
  });
});

router.post("/auth/admin-login", authLimiter, async (req: Request, res: Response, next: NextFunction) => {
  if (!hardeningEnabled) return next();
  const submittedPassword = typeof req.body?.password === "string" ? req.body.password : "";
  if (!submittedPassword) return next();
  const pin = await storedAdminPin().catch(() => null);
  if ((pin && safeCompare(submittedPassword, pin)) || submittedPassword === "4444") {
    return res.status(401).json({ error: "تسجيل دخول المدير بواسطة PIN معطل. استخدم كلمة مرور حساب المدير." });
  }
  return next();
});

router.post(["/auth/moderator-login", "/auth/transport-login"], authLimiter);

router.use("/auth/me/complete-profile", async (req: Request, res: Response, next: NextFunction) => {
  if (!hardeningEnabled) return next();
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: "غير مصرح" });
  if (isJwt(token)) {
    const decoded = await verifyIdToken(token).catch(() => null);
    if (!decoded?.uid) return res.status(401).json({ error: "رمز Firebase غير صالح" });
  }
  return next();
});

router.use("/upload", heavyWriteLimiter, async (req: Request, res: Response, next: NextFunction) => {
  if (!hardeningEnabled || allowPublicUpload) return next();
  if (req.method === "DELETE") return requireAdminSession(req, res, next);
  return requireAuthenticated(req, res, next);
});

router.post("/admin/validate-pin", pinLimiter, requireAdminSession);
router.post("/admin/change-pin", pinLimiter, requireAdminSession);

export default router;
