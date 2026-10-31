// المتابعة بين المستخدمين.
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

export type FollowStats = { followers: number; following: number; i_follow: boolean; follows_me: boolean };
export type FollowUser = { id: number; name: string; avatar_url?: string | null; headline?: string | null; is_verified: boolean; i_follow: boolean };

async function call<T>(path: string, token: string | null | undefined, method = "GET"): Promise<T> {
  if (method !== "GET" && !token) throw new Error("سجّل الدخول أولاً");
  const res = await fetchWithTimeout(`${getApiUrl()}${path}`, {
    method,
    offlineQueue: false,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  } as any);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || `خطأ في الخادم (${res.status})`);
  return json as T;
}

export const followUser = (id: number, token?: string | null) => call(`/api/users/${id}/follow`, token, "POST");
export const unfollowUser = (id: number, token?: string | null) => call(`/api/users/${id}/follow`, token, "DELETE");
export const fetchFollowStats = (id: number, token?: string | null) => call<FollowStats>(`/api/users/${id}/follow-stats`, token);
export const fetchFollowList = (id: number, kind: "followers" | "following", token?: string | null) =>
  call<FollowUser[]>(`/api/users/${id}/${kind}`, token);
