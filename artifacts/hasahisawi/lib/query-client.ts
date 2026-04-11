import { fetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

const PRODUCTION_API_HOST = "hasahisawi.vercel.app";

/**
 * Gets the base URL for the Express API server.
 * In production builds (__DEV__ === false), always uses hasahisawi.vercel.app.
 * In development, reads EXPO_PUBLIC_DOMAIN environment variable.
 */
export function getApiUrl(): string {
  const host = __DEV__
    ? (process.env.EXPO_PUBLIC_DOMAIN || PRODUCTION_API_HOST)
    : PRODUCTION_API_HOST;
  try {
    return new URL(`https://${host}`).href.replace(/\/$/, "");
  } catch {
    return `https://${PRODUCTION_API_HOST}`;
  }
}

export function isApiConfigured(): boolean {
  return true;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  if (!baseUrl) throw new Error("لا يوجد اتصال بالخادم");
  const url = new URL(route, baseUrl);

  const res = await fetch(url.toString(), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
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
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url.toString(), {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null as unknown as T;
    }

    await throwIfResNotOk(res);
    return await res.json() as T;
  };
}

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const status = parseInt(msg.split(":")[0], 10);
  if (!isNaN(status) && status >= 400 && status < 500) return false;
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 3 * 60 * 1000,
      gcTime: 15 * 60 * 1000,
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
    mutations: {
      retry: false,
    },
  },
});
