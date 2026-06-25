import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { canQueueRequest, isOnline, queueOfflineRequest, syncOfflineQueue } from "@/lib/offline-queue";

const USER_TOKEN_KEY = "auth_backend_token";

const DEFAULT_PRODUCTION_API_URL = "https://api-server-gilt-ten.vercel.app";

function cleanBaseUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

const API_URL =
  cleanBaseUrl(process.env.EXPO_PUBLIC_API_URL) ||
  cleanBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL) ||
  cleanBaseUrl(process.env.VITE_API_BASE_URL) ||
  DEFAULT_PRODUCTION_API_URL;

export function getApiUrl(): string {
  return API_URL;
}

export const LEGACY_API_URL = API_URL;

export function isApiConfigured(): boolean {
  return !!API_URL && /^https?:\/\//.test(API_URL);
}

async function tryHealthEndpoint(path: string, timeoutMs = 10000): Promise<boolean> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(tid);
  }
}

export async function wakeUpServer(): Promise<void> {
  // نُنبّه عدة endpoints لأن كل مسار في Vercel instance منفصل
  const paths = [
    "/api/readyz",
    "/api/healthz",
    "/api/auth/firebase-exchange",  // ينبّه instance المصادقة مسبقاً
    "/api/posts",
  ];
  // أرسل كل الطلبات دفعة واحدة — أي واحد يرد = الخادم صاحٍ
  const raceResult = await Promise.race(
    paths.map(p => tryHealthEndpoint(p, 15000)),
  );
  if (raceResult) return;
  // محاولة ثانية بعد 4 ثوانٍ
  await new Promise(r => setTimeout(r, 4000));
  await Promise.allSettled(paths.map(p => tryHealthEndpoint(p, 10000)));
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeout?: number; offlineQueue?: boolean } = {},
  ms = 15000,
): Promise<Response> {
  const timeout = (init as any).timeout ?? ms;
  const { timeout: _ignored, offlineQueue: _offlineQueue, ...cleanInit } = init as any;
  const shouldQueue = _offlineQueue !== false && canQueueRequest(url, cleanInit);

  if (shouldQueue && !(await isOnline())) {
    return queueOfflineRequest(url, cleanInit, "offline");
  }

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...cleanInit, signal: ctrl.signal } as any);
    if (shouldQueue) syncOfflineQueue().catch(() => {});
    return res;
  } catch (error: any) {
    if (shouldQueue) {
      return queueOfflineRequest(url, cleanInit, error?.message || "network_error");
    }
    throw error;
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
    if (text.trim().startsWith("<")) {
      throw new Error(`${res.status}: الخادم غير متاح مؤقتاً`);
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

async function fetchWithRetry(url: string, init: any, attempts = 2): Promise<Response> {
  let lastErr: any;
  const TIMEOUT_MS = 15000;
  const RETRY_DELAY = 3000;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * i));

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(tid);
      if (res.status >= 500 && i < attempts - 1) continue;
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
  const path = route.startsWith("/") ? route : `/${route}`;
  const url = API_URL + path;
  const authHeaders = await getAuthHeaders();
  const init = {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...authHeaders,
      ...extraHeaders,
    },
    body: data ? JSON.stringify(data) : undefined,
  };

  if (canQueueRequest(url, init) && !(await isOnline())) {
    return queueOfflineRequest(url, init, "offline");
  }

  let res: Response;
  try {
    res = await fetchWithRetry(url, init);
  } catch (error: any) {
    if (canQueueRequest(url, init)) {
      return queueOfflineRequest(url, init, error?.message || "network_error");
    }
    throw error;
  }

  await throwIfResNotOk(res);
  if (canQueueRequest(url, init)) syncOfflineQueue().catch(() => {});
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export function getQueryFn<T>(options: { on401: UnauthorizedBehavior }): QueryFunction<T> {
  const { on401: unauthorizedBehavior } = options;

  return async ({ queryKey }) => {
    const path = queryKey.join("/") as string;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = normalizedPath.startsWith("http") ? normalizedPath : API_URL + normalizedPath;
    const authHeaders = await getAuthHeaders();

    const res = await fetchWithRetry(url, {
      headers: authHeaders,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as unknown as T;
    }

    await throwIfResNotOk(res);

    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
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
