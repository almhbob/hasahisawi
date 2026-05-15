import { rateLimit } from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل دخول كثيرة، يرجى الانتظار 15 دقيقة" },
  skipSuccessfulRequests: true,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات تسجيل كثيرة من هذا الجهاز، يرجى الانتظار ساعة" },
  skipSuccessfulRequests: false,
});

export const pinLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة، يرجى الانتظار 10 دقائق" },
  skipSuccessfulRequests: true,
});

export const writeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عمليات كتابة كثيرة، يرجى الانتظار قليلاً" },
  skip: (req) => req.method === "GET" || req.method === "OPTIONS",
});

export const heavyWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولات كثيرة، يرجى الانتظار قليلاً" },
});

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جداً، يرجى المحاولة لاحقاً" },
  skip: (req) => req.method === "OPTIONS",
});
