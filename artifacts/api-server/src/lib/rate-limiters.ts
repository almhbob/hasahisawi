import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { Request, RequestHandler } from "express";
import { createHash } from "node:crypto";

// في السودان تشارك شركات الاتصال عنوان IP واحداً بين مئات المشتركين (CGNAT)،
// لذلك يُحسب حد العمليات لكل حساب (رمز الجلسة) لا لكل عنوان، ويبقى للعنوان سقف أعلى
// يمنع التحايل بتبديل الرموز.
function clientIp(req: Request): string {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || "0.0.0.0");
}
function sessionKey(req: Request): string {
  const auth = String(req.headers.authorization || "");
  const tok = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (tok.length >= 16) return "u:" + createHash("sha256").update(tok).digest("base64url").slice(0, 32);
  return "ip:" + clientIp(req);
}
function chain(...hs: RequestHandler[]): RequestHandler {
  return (req, res, next) => {
    let i = 0;
    const step = (err?: unknown): void => {
      if (err || i >= hs.length) return next(err as any);
      hs[i++](req, res, step);
    };
    step();
  };
}

// express-rate-limit resolves Express types from the workspace root, which can be a
// different @types/express major than this server uses. Typing every limiter as this
// server's own RequestHandler keeps router.use()/route handlers type-compatible.
// Runtime behaviour is unchanged.
export const limiter = (options: Parameters<typeof rateLimit>[0]): RequestHandler =>
  rateLimit(options) as unknown as RequestHandler;

export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل دخول كثيرة، يرجى الانتظار 15 دقيقة" },
  skipSuccessfulRequests: true,
});

export const registerLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل كثيرة من هذا الجهاز، يرجى الانتظار ساعة" },
  skipSuccessfulRequests: false,
});

export const pinLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة، يرجى الانتظار 10 دقائق" },
  skipSuccessfulRequests: true,
});

const isRead = (req: Request) => req.method === "GET" || req.method === "OPTIONS";
export const writeLimiter = chain(
  limiter({
    windowMs: 5 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: sessionKey,
    message: { error: "عمليات كتابة كثيرة، يرجى الانتظار قليلاً" },
    skip: isRead,
  }),
  // سقف مشترك للعنوان الواحد (يتسع لمستخدمين كثيرين خلف شبكة الجوال نفسها)
  limiter({
    windowMs: 5 * 60 * 1000,
    max: 1500,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => "ipw:" + clientIp(req),
    message: { error: "عمليات كتابة كثيرة من هذه الشبكة، يرجى الانتظار قليلاً" },
    skip: isRead,
  }),
);

export const heavyWriteLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة، يرجى الانتظار قليلاً" },
});

export const globalLimiter = chain(
  limiter({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: sessionKey,
    message: { error: "طلبات كثيرة جداً، يرجى المحاولة لاحقاً" },
    skip: (req) => req.method === "OPTIONS",
  }),
  limiter({
    windowMs: 15 * 60 * 1000,
    max: 12000,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => "ipg:" + clientIp(req),
    message: { error: "طلبات كثيرة جداً من هذه الشبكة، يرجى المحاولة لاحقاً" },
    skip: (req) => req.method === "OPTIONS",
  }),
);
