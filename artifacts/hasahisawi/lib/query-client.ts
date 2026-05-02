import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

const USER_TOKEN_KEY = "auth_backend_token";
const FALLBACK_API_URL = "https://hasahisawi.onrender.com";

function normalizeApiUrl(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim().replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function looksLikeApiHost(value?: string | null): boolean {
  return !!value && /(api|server|backend|render|railway)/i.test(value);
}

export function getApiUrl(): string {
  const explicit =
    process.env.EXPO_PUBLIC_API_URL ||
    process.env.EXPO_PUBLIC_API_DOMAIN ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    process.env.EXPO_PUBLIC_BACKEND_DOMAIN ||
    process.env.EXPO_PUBLIC_SERVER_URL;

  const explicitUrl = normalizeApiUrl(explicit);
  if (explicitUrl) return explicitUrl;

  const legacyDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (looksLikeApiHost(legacyDomain)) {
    const legacyUrl = normalizeApiUrl(legacyDomain);
    if (legacyUrl) return legacyUrl;
  }

  return FALLBACK_API_URL;
}

export function isApiConfigured(): boolean {
  return true;
}

export async function wakeUpServer(): Promise<void> {
  const url = getApiUrl() + "/api/healthz";
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetchWithTimeout(url, {}, 15000);
      if (res.ok) return;
    } catch {}
    if (i < 5) await new Promise(r => setTimeout(r, 5000));
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

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
    if (text.trim().startsWith("<")) throw new Error(`${res.status}: الخادم غير متاح مؤقتاً`);
    throw new Error(`${res.status}: ${text}`);
  }
}

async function fetchWithRetry(url: string, init: any, attempts = 2): Promise<Response> {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 3000 * i));
    try {
      const res = await fetchWithTimeout(url, init, 15000);
      if (res.status >= 500 && i < attempts - 1) continue;
      return res;
    } catch (e: any) {
      lastErr = e?.name === "AbortError"
        ? new Error("انتهت مهلة الاتصال، جاري إعادة المحاولة…")
        : new Error("تعذّر الاتصال بالخادم — تحقق من الإنترنت");
    }
  }
  throw lastErr || new Error("تعذّر الاتصال بالخادم");
}

export async function apiRequest(method: string, route: string, data?: unknown, extraHeaders?: Record<string, string>): Promise<Response> {
  const url = getApiUrl() + route;
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
export function getQueryFn<T>(options: { on401: UnauthorizedBehavior }): QueryFunction<T> {
  return async ({ queryKey }) => {
    const path = queryKey.join("/") as string;
    const url = path.startsWith("http") ? path : getApiUrl() + path;
    const authHeaders = await getAuthHeaders();
    const res = await fetchWithRetry(url, { headers: authHeaders });

    if (options.on401 === "returnNull" && res.status === 401) return null as unknown as T;
    await throwIfResNotOk(res);

    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error("الخادم أعاد رداً غير صالح. أعد المحاولة بعد لحظة");
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
    mutations: { retry: false },
  },
});
