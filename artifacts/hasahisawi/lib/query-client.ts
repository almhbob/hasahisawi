import { fetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

const USER_TOKEN_KEY = "auth_backend_token";
const API_URL = "https://workspaceapi-server-production-3e22.up.railway.app";

export function getApiUrl(): string {
  return API_URL;
}

export const LEGACY_API_URL = API_URL;

export function isApiConfigured(): boolean {
  return true;
}

export async function wakeUpServer(): Promise<void> {
  const url = `${API_URL}/api/healthz`;
  for (let i = 0; i < 3; i++) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) return;
    } catch {
      clearTimeout(tid);
    }
    if (i < 2) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

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
  const url = API_URL + route;
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
  const { on401: unauthorizedBehavior } = options;

  return async ({ queryKey }) => {
    const path = queryKey.join("/") as string;
    const url = path.startsWith("http") ? path : API_URL + path;
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
