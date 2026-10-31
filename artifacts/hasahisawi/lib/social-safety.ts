// أمان المجتمع: الإبلاغ عن المحتوى وحظر المستخدمين.
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

export type ReportReason = "spam" | "abuse" | "hate" | "sexual" | "violence" | "false_info" | "privacy" | "other";

export const REPORT_REASONS: { key: ReportReason; label: string; icon: string }[] = [
  { key: "spam", label: "إزعاج أو ترويج", icon: "megaphone-outline" },
  { key: "abuse", label: "إساءة أو تنمّر", icon: "hand-left-outline" },
  { key: "hate", label: "خطاب كراهية", icon: "flame-outline" },
  { key: "sexual", label: "محتوى غير لائق", icon: "eye-off-outline" },
  { key: "violence", label: "عنف أو تهديد", icon: "warning-outline" },
  { key: "false_info", label: "معلومات كاذبة", icon: "alert-circle-outline" },
  { key: "privacy", label: "انتهاك خصوصية", icon: "lock-closed-outline" },
  { key: "other", label: "سبب آخر", icon: "ellipsis-horizontal-circle-outline" },
];

export type BlockedUser = { id: number; name: string; avatar_url?: string | null; created_at: string };

function url(path: string) {
  return `${getApiUrl()}${path}`;
}

async function send(path: string, token: string | null | undefined, init: RequestInit = {}) {
  if (!token) throw new Error("سجّل الدخول أولاً");
  const res = await fetchWithTimeout(url(path), {
    ...init,
    offlineQueue: false,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  } as any);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `خطأ في الخادم (${res.status})`);
  return json;
}

export function reportContent(
  type: "post" | "comment", id: number, reason: ReportReason, details: string, token?: string | null,
): Promise<{ success: boolean; already?: boolean }> {
  return send(`/api/${type === "post" ? "posts" : "comments"}/${id}/report`, token, {
    method: "POST",
    body: JSON.stringify({ reason, details }),
  });
}

export function blockUser(userId: number, token?: string | null) {
  return send(`/api/users/${userId}/block`, token, { method: "POST" });
}

export function unblockUser(userId: number, token?: string | null) {
  return send(`/api/users/${userId}/block`, token, { method: "DELETE" });
}

export function fetchBlockedUsers(token?: string | null): Promise<BlockedUser[]> {
  return send(`/api/me/blocks`, token, { method: "GET" });
}
