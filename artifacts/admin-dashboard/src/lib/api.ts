// يدعم الـ API المحلي في Replit والـ Firebase في الإنتاج
const FIREBASE_API = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = FIREBASE_API ? FIREBASE_API.replace(/\/$/, "") : "/api";

export async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("admin_token");
  const url = FIREBASE_API ? `${BASE}${path}` : `/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  return res;
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}
