import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

const USER_TOKEN_KEY = "auth_backend_token";

/**
 * رابط السيرفر الرسمي الحالي.
 * تم تثبيته مباشرة لتجنب أي متغيرات بناء قديمة تشير إلى Vercel أو Render.
 */
const API_URL = "https://workspaceapi-server-production-3e22.up.railway.app";

export function getApiUrl(): string {
  return API_URL;
}

/** رابط احتياطي للتوافق مع أي أجزاء قديمة في التطبيق */
export const LEGACY_API_URL = API_URL;

export function isApiConfigured(): boolean {
  return true;
}

/**
 * يرسل طلب فحص سريع للسيرفر.
 */
export async function wakeUpServer(): Promise<void> {
  const url = getApiUrl() + "/api/healthz";
  const MAX_ATTEMPTS = 3;
  const ATTEMPT_TIMEOUT = 10000;
  const RETRY_DELAY = 3000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT);

      const res = await fetch(url, { signal: ctrl.signal });

      clearTimeout(tid);

      if (res.ok) {
        return;
      }
    } catch {
      // تجاهل الخطأ وحاول مرة أخرى
    }

    if (i < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }
}

/**
 * fetch بمهلة زمنية واضحة.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 15000,
): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);

  try {
    return await fetch(url, { ...init, signal: ctrl.signal } as any);
  } finally {
    clearTimeout(tid);
  }
}

/**
 * يرجع هيدر التوثيق إذا كان المستخدم مسجلًا.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await AsyncStorage.getItem(USER_TOKEN_KEY);

    if (token) {
      return {
        Authorization: `Bearer ${token}`,
      };
    }
  } catch {
    // تجاهل الخطأ
  }

  return {};
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;

    if (text.trim().startsWith("<")) {
      throw new Error(`${res.status}: الخادم غير متاح مؤقتاً`);
    }

    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * طلب مع إعادة المحاولة عند أخطاء الشبكة أو أخطاء 5xx.
 */
async function fetchWithRetry(
  url: string,
  init: any,
  attempts = 2,
): Promise<Response> {
  let lastErr: any;
  const TIMEOUT_MS = 15000;
  const RETRY_DELAY = 3000;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * i));
    }

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });

      clearTimeout(tid);

      if (res.status >= 500 && i < attempts - 1) {
        continue;
      }

      return res;
    } catch (e: any) {
      clearTimeout(tid);

      lastErr =
        e?.name === "AbortError"
          ? new Error("انتهت مهلة الاتصال، جاري إعادة المحاولة…")
          : new Error("تعذّر الاتصال بالخادم — تحقق من الإنترنت");
    }
  }

  throw lastErr || new Error("تعذّر الاتصال بالخادم");
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const baseUrl = getApiUrl();
