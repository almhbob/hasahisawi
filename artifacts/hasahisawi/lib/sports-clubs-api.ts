// واجهة الأندية الرياضية على الخادم (بدلاً من التخزين المحلي القديم)
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

export type ClubSport = "football" | "basketball" | "volleyball" | "athletics" | "swimming" | "boxing" | "other";

export type Club = {
  id: number;
  name: string;
  short_name?: string | null;
  sport: ClubSport;
  league?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  primary_color?: string | null;
  colors?: string | null;
  founded?: string | null;
  district?: string | null;
  address?: string | null;
  stadium?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  facebook?: string | null;
  president?: string | null;
  coach?: string | null;
  training_times?: string | null;
  membership_fee?: string | null;
  accepts_members: boolean;
  achievements?: string | null;
  description?: string | null;
  status: "pending" | "approved" | "rejected";
  verified: boolean;
  owner_id?: number | null;
  followers: number;
  is_following?: boolean;
  is_owner?: boolean;
  created_at: string;
};

export type ClubStats = { played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; form: ("W" | "D" | "L")[] };

export type ClubDetail = {
  club: Club;
  players: any[];
  matches: any[];
  posts: any[];
  stats: ClubStats;
  pending_requests: number;
  can_manage: boolean;
  can_moderate: boolean;
};

export type StandingRow = {
  team: string; club_id: number | null; logo_url: string | null; primary_color: string | null;
  p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number; form: string[];
};

export type JoinRequest = {
  id: number; club_id: number; user_id: number; name: string; phone?: string | null;
  age?: number | null; position?: string | null; note?: string | null;
  status: "pending" | "accepted" | "rejected"; created_at: string;
};

export const SPORT_META: Record<ClubSport, { label: string; icon: string; color: string }> = {
  football:   { label: "كرة قدم",   icon: "football-outline",   color: "#0E9C64" },
  basketball: { label: "كرة سلة",   icon: "basketball-outline", color: "#D9822B" },
  volleyball: { label: "كرة طائرة", icon: "tennisball-outline", color: "#2186C2" },
  athletics:  { label: "ألعاب قوى", icon: "walk-outline",       color: "#06325A" },
  swimming:   { label: "سباحة",     icon: "water-outline",      color: "#0E5A80" },
  boxing:     { label: "ملاكمة",    icon: "fitness-outline",    color: "#C26D3D" },
  other:      { label: "أخرى",      icon: "trophy-outline",     color: "#5B6B63" },
};

export const SPORT_KEYS = Object.keys(SPORT_META) as ClubSport[];

export class ApiError extends Error { status: number; constructor(msg: string, status: number) { super(msg); this.status = status; } }

async function call<T>(path: string, token: string | null | undefined, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(`${getApiUrl()}${path}`, {
      method: init.method || "GET", headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("تعذّر الاتصال — تحقق من الإنترنت", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as any)?.error || `خطأ (${res.status})`, res.status);
  return data as T;
}

export const clubsApi = {
  list: (token?: string | null, params: { sport?: ClubSport | ""; q?: string; mine?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.sport) qs.set("sport", params.sport);
    if (params.q) qs.set("q", params.q);
    if (params.mine) qs.set("mine", "1");
    const s = qs.toString();
    return call<{ clubs: Club[]; can_moderate: boolean }>(`/api/sports/clubs${s ? "?" + s : ""}`, token);
  },
  get: (id: number | string, token?: string | null) => call<ClubDetail>(`/api/sports/clubs/${id}`, token),
  create: (token: string | null | undefined, body: Partial<Club>) => call<{ club: Club; message: string }>(`/api/sports/clubs`, token, { method: "POST", body }),
  update: (token: string | null | undefined, id: number, body: Partial<Club>) => call<{ club: Club }>(`/api/sports/clubs/${id}`, token, { method: "PATCH", body }),
  remove: (token: string | null | undefined, id: number) => call<{ ok: true }>(`/api/sports/clubs/${id}`, token, { method: "DELETE" }),
  follow: (token: string | null | undefined, id: number) => call<{ following: boolean; followers: number }>(`/api/sports/clubs/${id}/follow`, token, { method: "POST", body: {} }),
  join: (token: string | null | undefined, id: number, body: { name?: string; phone?: string; age?: string; position?: string; note?: string }) =>
    call<{ message: string }>(`/api/sports/clubs/${id}/join`, token, { method: "POST", body }),
  requests: (token: string | null | undefined, id: number) => call<{ requests: JoinRequest[] }>(`/api/sports/clubs/${id}/requests`, token),
  decide: (token: string | null | undefined, id: number, rid: number, status: "accepted" | "rejected") =>
    call<{ request: JoinRequest }>(`/api/sports/clubs/${id}/requests/${rid}`, token, { method: "PATCH", body: { status } }),
  standings: () => call<{ standings: StandingRow[] }>(`/api/sports/standings`, null),
};

export function clubInitials(name: string) {
  const parts = name.replace(/^(نادي|نادى|فريق)\s+/, "").trim().split(/\s+/);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}
