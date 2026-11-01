import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";

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

export const writeLimiter = limiter({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عمليات كتابة كثيرة، يرجى الانتظار قليلاً" },
  skip: (req) => req.method === "GET" || req.method === "OPTIONS",
});

export const heavyWriteLimiter = limiter({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة، يرجى الانتظار قليلاً" },
});

export const globalLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جداً، يرجى المحاولة لاحقاً" },
  skip: (req) => req.method === "OPTIONS",
});
