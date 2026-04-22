import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

const USER_TOKEN_KEY = "auth_backend_token"; // يطابق BACKEND_TOKEN_KEY في auth-context

/**
 * Gets the base URL for the Express API server.
 * Falls back to the production Replit domain when EXPO_PUBLIC_DOMAIN is not set.
 */
const FALLBACK_DOMAIN = "hasahisawi.onrender.com";

export function getApiUrl(): string {
  const host = process.env.EXPO_PUBLIC_DOMAIN || FALLBACK_DOMAIN;
  try {
    return new URL(`https://${host}`).href.replace(/\/$/, "");
  } catch {
    return `https://${FALLBACK_DOMAIN}`;
  }
}

export function isApiConfigured(): boolean {
  return true;
}

/**
 * يُرسل ping متكرر إلى السيرفر حتى يستيقظ تماماً قبل أي طلب حقيقي.
 * يتعامل مع cold-start في Render بإعادة المحاولة كل 5 ثواني لمدة 90 ثانية.
 */
export async function wakeUpServer(): Promise<void> {
  const url = getApiUrl() + "/api/healthz";
  const MAX_ATTEMPTS = 6;
  const ATTEMPT_TIMEOUT = 15000;
  const RETRY_DELAY = 5000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) return;
    } catch {
      // السيرفر لم يستيقظ بعد
    }
    if (i < MAX_ATTEMPTS - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }
}

/** يُعيد Authorization header إذا كان المستخدم مسجلاً */
async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await AsyncStorage.getItem(USER_TOKEN_KEY);
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {}
  return {};
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // إذا كانت الاستجابة HTML (خطأ من proxy) أعطِ رسالة واضحة
    if (text.trim().startsWith("<")) {
      throw new Error(`${res.status}: الخادم غير متاح مؤقتاً`);
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * يُرسل الطلب مع retry وtimeout مناسبَين لمواجهة cold-start في Render.
 * - timeout: 45 ثانية لكل محاولة
 * - يُعيد المحاولة عند: انتهاء المهلة، خطأ شبكة، 5xx، HTML بدلاً من JSON
 */
async function fetchWithRetry(url: string, init: any, attempts = 3): Promise<Response> {
  let lastErr: any;
  const TIMEOUT_MS = 45000;
  const RETRY_DELAY = 4000;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY * i));
    }
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(tid);
      // إذا أعاد الخادم 5xx جرّب مجدداً
      if (res.status >= 500 && i < attempts - 1) {
        continue;
      }
      return res;
    } catch (e: any) {
      clearTimeout(tid);
      lastErr = e?.name === "AbortError"
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
  if (!baseUrl) throw new Error("لا يوجد اتصال بالخادم");
  const url = baseUrl + route;

  const authHeaders = await getAuthHeaders();

  const res = await fetchWithRetry(url, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...authHeaders,
      ...extraHeaders,
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export function getQueryFn<T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  const { on401: unauthorizedBehavior } = options;
  return async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    if (!baseUrl) return null as unknown as T;

    const path = queryKey.join("/") as string;
    const url = path.startsWith("http") ? path : baseUrl + path;

    const authHeaders = await getAuthHeaders();

    const res = await fetchWithRetry(url, { headers: authHeaders });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as unknown as T;
    }

    await throwIfResNotOk(res);

    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      // إذا كانت الاستجابة HTML (cold-start) أعطِ خطأ واضح
      throw new Error("الخادم يستيقظ، أعد المحاولة بعد لحظة");
    }
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: 2,
      retryDelay: (attempt) => Math.min(5000 * (attempt + 1), 15000),
    },
    mutations: {
      retry: false,
    },
  },
});
