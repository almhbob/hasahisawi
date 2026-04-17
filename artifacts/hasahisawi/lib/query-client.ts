import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

const USER_TOKEN_KEY = "auth_backend_token"; // يطابق BACKEND_TOKEN_KEY في auth-context

/**
 * Gets the base URL for the Express API server.
 * Falls back to the production Replit domain when EXPO_PUBLIC_DOMAIN is not set.
 */
const FALLBACK_DOMAIN = "4b24ae9d-7d73-4744-bf4e-af36fce0744f-00-3tym1kjh3g6wy.pike.replit.dev";

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
    throw new Error(`${res.status}: ${text}`);
  }
}

/** يحاول إرسال الطلب مع إعادة محاولة عند فشل الشبكة (يساعد عند إيقاظ الخادم) */
async function fetchWithRetry(url: string, init: any, attempts = 3): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const ctrl = new AbortController();
      const timeoutMs = i === 0 ? 8000 : 20000; // المحاولة الأولى أقصر، ثم نطيل لإيقاظ الخادم
      const tid = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(tid);
      // إذا أعاد الخادم 502/503/504 (نائم) جرّب مجدداً
      if ([502, 503, 504].includes(res.status) && i < attempts - 1) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        continue;
      }
      return res;
    } catch (e: any) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
      }
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

    const res = await fetch(url, { headers: authHeaders });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as unknown as T;
    }

    await throwIfResNotOk(res);
    return (await res.json()) as T;
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
