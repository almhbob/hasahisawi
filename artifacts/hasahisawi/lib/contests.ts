// واجهة المسابقات: الجارية والمنتهية، المشاركة، والإدارة.
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

export type ContestState = "upcoming" | "active" | "ended";
export type Contest = {
  id: number; title: string; description: string | null;
  kind: "sponsored" | "seasonal"; occasion: string | null; type: "quiz" | "entry";
  sponsor_name: string | null; sponsor_logo: string | null; prize: string | null; terms: string | null;
  entry_prompt: string | null; winners_count: number; starts_at: string; ends_at: string;
  status: string; state: ContestState; shares: number; entries_count: number;
  entered?: boolean; questions_count?: number;
};
export type ContestQuestion = { id: number; question: string; options: string[]; correct_index?: number };
export type ContestDetail = Contest & {
  questions: ContestQuestion[];
  mine: { answers: number[] | null; score: number; content: string | null; image_url: string | null; is_winner: boolean; rank: number | null } | null;
  winners: { rank: number | null; score: number; user_id: number; name: string; avatar_url: string | null }[];
  canManage: boolean;
};
export type Occasion = { key: string; name: string; title: string; description: string; date: string; daysAway: number };

/** هوية بصرية لكل مناسبة: ألوان التدرج، أيقونة، ونص الترويسة. */
export const OCCASION_THEME: Record<string, { grad: [string, string]; accent: string; icon: string; label: string }> = {
  ramadan: { grad: ["#1E1B4B", "#3730A3"], accent: "#FBBF24", icon: "moon", label: "رمضان كريم" },
  eid_fitr: { grad: ["#065F46", "#047857"], accent: "#FCD34D", icon: "gift", label: "عيد فطر مبارك" },
  eid_adha: { grad: ["#0F766E", "#115E59"], accent: "#FDE68A", icon: "star", label: "عيد أضحى مبارك" },
  hijri_new_year: { grad: ["#312E81", "#1E3A8A"], accent: "#C7D2FE", icon: "calendar", label: "عام هجري سعيد" },
  mawlid: { grad: ["#14532D", "#166534"], accent: "#BBF7D0", icon: "sparkles", label: "المولد النبوي الشريف" },
  isra_miraj: { grad: ["#4C1D95", "#5B21B6"], accent: "#DDD6FE", icon: "planet", label: "الإسراء والمعراج" },
  independence: { grad: ["#111827", "#7F1D1D"], accent: "#22C55E", icon: "flag", label: "عيد الاستقلال المجيد" },
  sponsored: { grad: ["#00966A", "#006B4A"], accent: "#E8A900", icon: "trophy", label: "مسابقة برعاية" },
};

export function themeOf(c: Pick<Contest, "occasion" | "kind">) {
  return OCCASION_THEME[c.occasion ?? ""] ?? OCCASION_THEME.sponsored;
}

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

export const contestsApi = {
  list: (token?: string | null) => call<Contest[]>(`/api/contests`, token),
  get: (id: number, token?: string | null) => call<ContestDetail>(`/api/contests/${id}`, token),
  occasions: () => call<Occasion[]>(`/api/contests/occasions`),
  enter: (id: number, token: string | null | undefined, body: { answers?: number[]; content?: string; image_url?: string }) =>
    call<{ success: boolean; score: number; total: number | null }>(`/api/contests/${id}/enter`, token, { method: "POST", body: JSON.stringify(body) }),
  share: (id: number) => call(`/api/contests/${id}/share`, null, { method: "POST" }).catch(() => null),
  create: (token: string | null | undefined, body: Record<string, unknown>) => call<Contest>(`/api/contests`, token, { method: "POST", body: JSON.stringify(body) }),
  update: (token: string | null | undefined, id: number, body: Record<string, unknown>) => call<Contest>(`/api/contests/${id}`, token, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (token: string | null | undefined, id: number) => call(`/api/contests/${id}`, token, { method: "DELETE" }),
  entries: (token: string | null | undefined, id: number) =>
    call<{ id: number; user_id: number; name: string; phone: string | null; score: number; content: string | null; image_url: string | null; is_winner: boolean; rank: number | null }[]>(`/api/contests/${id}/entries`, token),
  winners: (token: string | null | undefined, id: number, body: { auto?: boolean; entry_ids?: number[] }) =>
    call<{ success: boolean; winners: number }>(`/api/contests/${id}/winners`, token, { method: "POST", body: JSON.stringify(body) }),
};

export function publicContestUrl(id: number) {
  return `${getApiUrl()}/api/public/contest/${id}`;
}

export function timeLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "انتهت";
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  return d > 0 ? `باقي ${d} يوم${h ? ` و${h} ساعة` : ""}` : `باقي ${h || 1} ساعة`;
}
