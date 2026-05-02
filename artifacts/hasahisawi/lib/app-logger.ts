export type LogLevel = "info" | "warn" | "error";

type LogPayload = {
  level: LogLevel;
  scope: string;
  message: string;
  error?: unknown;
  extra?: Record<string, unknown>;
};

function toErrorMessage(error: unknown) {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function logAppEvent(payload: LogPayload) {
  const prefix = `[Hasahisawi:${payload.scope}] ${payload.message}`;
  const errorMessage = toErrorMessage(payload.error);
  const details = { ...payload.extra, error: errorMessage };

  if (payload.level === "error") {
    console.error(prefix, details);
    return;
  }

  if (payload.level === "warn") {
    console.warn(prefix, details);
    return;
  }

  console.log(prefix, details);
}

export function logAppError(scope: string, error: unknown, extra?: Record<string, unknown>) {
  logAppEvent({
    level: "error",
    scope,
    message: "Unhandled application error",
    error,
    extra,
  });
}

export function getUserFriendlyError(error: unknown, fallback = "حدث خطأ غير متوقع. حاول مرة أخرى.") {
  const text = toErrorMessage(error)?.toLowerCase() || "";

  if (text.includes("network") || text.includes("timeout") || text.includes("offline")) {
    return "تعذر الاتصال بالإنترنت. تحقق من الشبكة وحاول مرة أخرى.";
  }

  if (text.includes("permission") || text.includes("unauthorized") || text.includes("insufficient")) {
    return "لا توجد صلاحية كافية لتنفيذ العملية. تأكد من تسجيل الدخول أو صلاحيات الحساب.";
  }

  if (text.includes("upload preset") || text.includes("cloudinary")) {
    return "خدمة رفع الصور غير مكتملة الإعداد. تحقق من إعداد Cloudinary ثم حاول مرة أخرى.";
  }

  if (text.includes("sharing") || text.includes("shareasync")) {
    return "تعذر مشاركة الملف على هذا الجهاز. تم حفظ العملية ويمكن المحاولة بعد تحديث التطبيق.";
  }

  return fallback;
}
