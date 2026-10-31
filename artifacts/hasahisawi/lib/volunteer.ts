// واجهة نظام التطوع: المهام، النقاط والمستويات، وبطاقة المتطوع.
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

export type VolunteerTask = {
  id: number; title: string; description: string | null; category: string; location: string | null;
  starts_at: string | null; ends_at: string | null; points: number; slots: number | null;
  status: "open" | "closed" | "done"; image_url: string | null; organizer: string | null;
  joined_count: number; my_status: "joined" | "completed" | "rejected" | "cancelled" | null;
};

export type VolunteerLevel = {
  key: string; name: string; min: number; tier: "bronze" | "silver" | "gold" | "platinum" | "diamond";
  index: number; next: { name: string; min: number; remaining: number } | null; progress: number;
};

export type VolunteerCardRow = {
  id: number; card_no: string; kind: "new" | "renew"; status: "pending" | "active" | "expired" | "rejected";
  level_key: string | null; amount: string; payment_ref: string | null;
  issued_at: string | null; expires_at: string | null; review_note: string | null;
};

export type VolunteerMe = {
  points: number; tasks: number; hours: number; level: VolunteerLevel;
  history: { points: number; reason: string; created_at: string }[];
  myTasks: { status: string; points_awarded: number; hours: number | null; task_id: number; title: string; starts_at: string | null }[];
  card: VolunteerCardRow | null;
  cardConfig: { feeRequired: boolean; price: number | null; currency: string; months: number; paymentInfo: string };
  canManage: boolean;
};

export type VolunteerSummary = { points: number; tasks: number; hours: number; level: VolunteerLevel; card: { card_no: string; expires_at: string } | null };

export const TASK_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  environment: { label: "بيئة ونظافة", icon: "leaf-outline", color: "#16A34A" },
  health: { label: "صحة", icon: "medkit-outline", color: "#E05567" },
  education: { label: "تعليم", icon: "school-outline", color: "#2563EB" },
  social: { label: "خدمة مجتمع", icon: "people-outline", color: "#00966A" },
  events: { label: "فعاليات", icon: "calendar-outline", color: "#9333EA" },
  relief: { label: "إغاثة", icon: "heart-outline", color: "#DC2626" },
  other: { label: "أخرى", icon: "ellipsis-horizontal-circle-outline", color: "#64748B" },
};

/** ألوان كل مستوى — ذهب ومعادن على كحلي البطاقة */
export const TIER_STYLE: Record<VolunteerLevel["tier"], { label: string; metal: [string, string]; ink: string }> = {
  bronze: { label: "برونزي", metal: ["#C8875A", "#8C5634"], ink: "#FFF4E8" },
  silver: { label: "فضي", metal: ["#E5E7EB", "#9CA3AF"], ink: "#1F2937" },
  gold: { label: "ذهبي", metal: ["#F4D47C", "#B8892B"], ink: "#3A2A05" },
  platinum: { label: "بلاتيني", metal: ["#E7F0F7", "#8FA9BF"], ink: "#132233" },
  diamond: { label: "ماسي", metal: ["#C9F2FF", "#5FB8D9"], ink: "#062433" },
};

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithTimeout(`${getApiUrl()}${path}`, {
    ...init,
    offlineQueue: false,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  } as any);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || `خطأ في الخادم (${res.status})`);
  return json as T;
}

export const volunteerApi = {
  tasks: (token?: string | null, status = "open") => call<VolunteerTask[]>(`/api/volunteer/tasks?status=${status}`, token),
  join: (id: number, token?: string | null) => call(`/api/volunteer/tasks/${id}/join`, token, { method: "POST" }),
  leave: (id: number, token?: string | null) => call(`/api/volunteer/tasks/${id}/join`, token, { method: "DELETE" }),
  me: (token?: string | null) => call<VolunteerMe>(`/api/volunteer/me`, token),
  summary: (userId: number) => call<VolunteerSummary>(`/api/volunteer/users/${userId}/summary`),
  leaderboard: () => call<{ id: number; name: string; avatar_url: string | null; is_verified: boolean; points: number; level: VolunteerLevel }[]>(`/api/volunteer/leaderboard`),
  requestCard: (token?: string | null, paymentRef?: string) =>
    call<{ success: boolean; card: VolunteerCardRow }>(`/api/volunteer/card/request`, token, { method: "POST", body: JSON.stringify({ payment_ref: paymentRef }) }),
  // ── الإدارة ──
  createTask: (token: string | null | undefined, body: Partial<VolunteerTask>) => call<VolunteerTask>(`/api/volunteer/tasks`, token, { method: "POST", body: JSON.stringify(body) }),
  updateTask: (token: string | null | undefined, id: number, body: Partial<VolunteerTask>) => call<VolunteerTask>(`/api/volunteer/tasks/${id}`, token, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTask: (token: string | null | undefined, id: number) => call(`/api/volunteer/tasks/${id}`, token, { method: "DELETE" }),
  signups: (token: string | null | undefined, taskId: number) =>
    call<{ id: number; user_id: number; name: string; phone: string | null; status: string; points_awarded: number; hours: string | null }[]>(`/api/volunteer/tasks/${taskId}/signups`, token),
  review: (token: string | null | undefined, signupId: number, action: "complete" | "reject", extra: { points?: number; hours?: number; note?: string } = {}) =>
    call(`/api/volunteer/signups/${signupId}/review`, token, { method: "POST", body: JSON.stringify({ action, ...extra }) }),
  cards: (token: string | null | undefined, status = "pending") =>
    call<(VolunteerCardRow & { name: string; phone: string | null; user_id: number })[]>(`/api/admin/volunteer/cards?status=${status}`, token),
  reviewCard: (token: string | null | undefined, id: number, action: "approve" | "reject", note?: string) =>
    call(`/api/admin/volunteer/cards/${id}/review`, token, { method: "POST", body: JSON.stringify({ action, note }) }),
  settings: (token: string | null | undefined) =>
    call<{ price: number; priceVisible: boolean; feeRequired: boolean; months: number; paymentInfo: string; currency: string }>(`/api/admin/volunteer/settings`, token),
  saveSettings: (token: string | null | undefined, body: Record<string, unknown>) =>
    call(`/api/admin/volunteer/settings`, token, { method: "PUT", body: JSON.stringify(body) }),
};

export function verifyCardUrl(cardNo: string) {
  return `${getApiUrl()}/api/public/volunteer-card/${encodeURIComponent(cardNo)}`;
}

export function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
