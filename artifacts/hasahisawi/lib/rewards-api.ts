// نقاط التطوع والمسابقات — واجهة الخادم
import { getApiUrl } from "./query-client";

async function api(path: string, token?: string | null, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${getApiUrl().replace(/\/$/, "")}/api${path}`, {
    method: init.method || "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error || `خطأ ${res.status}`), { status: res.status });
  return d;
}

export type Level = { key: string; name: string; min: number; next: { name: string; min: number; remaining: number } | null };
export type MyPoints = {
  total: number; volunteer: number; competition: number; this_month: number; rank: number;
  level: Level; levels: { key: string; name: string; min: number }[];
  volunteer_hours: number; volunteer_count: number;
  history: { points: number; kind: string; reason: string; created_at: string }[];
};
export type BoardUser = { id: number; name: string; avatar_url: string | null; is_verified: boolean; points: number; level: string };
export type Opportunity = {
  id: number; title: string; description: string | null; org_name: string | null; location: string | null;
  starts_at: string | null; duration_hours: number | null; points: number; slots: number | null; cover_url: string | null;
  contact_phone: string | null; status: string; registered: number; my_status: string | null;
};
export type CompetitionSummary = {
  id: number; title: string; description: string | null; kind: "quiz" | "photo" | "text"; prize: string | null;
  points_first: number; points_participation: number; cover_url: string | null; starts_at: string; ends_at: string | null;
  status: string; live_status: "upcoming" | "active" | "ended" | "finished" | "cancelled"; questions_count: number; entries: number; participated: boolean;
};
export type CompetitionDetail = CompetitionSummary & {
  questions: { q: string; options: string[]; answer?: number }[];
  my_entry: { score: number; rank: number | null; is_winner: boolean; content: string | null; image_url: string | null } | null;
  entries: { id: number; name: string; avatar_url: string | null; score: number; duration_sec: number | null; is_winner: boolean; rank: number | null; content?: string | null; image_url?: string | null }[];
  can_manage: boolean;
};

export const LEVEL_STYLE: Record<string, { color: string; icon: string }> = {
  bronze: { color: "#B87333", icon: "medal-outline" },
  silver: { color: "#8E9AAF", icon: "medal" },
  gold: { color: "#D4A017", icon: "trophy" },
  platinum: { color: "#5BA4CF", icon: "diamond" },
};
export const levelStyleByName = (name: string) =>
  name === "بلاتيني" ? LEVEL_STYLE.platinum : name === "ذهبي" ? LEVEL_STYLE.gold : name === "فضي" ? LEVEL_STYLE.silver : LEVEL_STYLE.bronze;

export const rewardsApi = {
  myPoints: (t: string) => api(`/points/me`, t) as Promise<MyPoints>,
  userPoints: (id: number) => api(`/points/user/${id}`) as Promise<{ total: number; level: Level }>,
  leaderboard: (period: "month" | "all") => api(`/points/leaderboard?period=${period}`) as Promise<{ users: BoardUser[] }>,
  grant: (t: string, body: { user_id: number; points: number; reason: string }) => api(`/points/grant`, t, { method: "POST", body }),

  opportunities: (t: string | null | undefined, scope: "open" | "mine" | "past") => api(`/volunteer/opportunities?scope=${scope}`, t) as Promise<{ opportunities: Opportunity[]; can_manage: boolean }>,
  createOpp: (t: string, body: any) => api(`/volunteer/opportunities`, t, { method: "POST", body }),
  editOpp: (t: string, id: number, body: any) => api(`/volunteer/opportunities/${id}`, t, { method: "PATCH", body }),
  signup: (t: string, id: number, note?: string) => api(`/volunteer/opportunities/${id}/signup`, t, { method: "POST", body: { note } }),
  cancelSignup: (t: string, id: number) => api(`/volunteer/opportunities/${id}/signup`, t, { method: "DELETE" }),
  signups: (t: string, id: number) => api(`/volunteer/opportunities/${id}/signups`, t) as Promise<{ signups: { id: number; name: string; phone: string | null; avatar_url: string | null; status: string; note: string | null }[] }>,
  attendance: (t: string, id: number, attended: number[], absent: number[]) => api(`/volunteer/opportunities/${id}/attendance`, t, { method: "POST", body: { attended, absent } }) as Promise<{ granted: number }>,

  competitions: (t?: string | null) => api(`/competitions`, t) as Promise<{ competitions: CompetitionSummary[]; can_manage: boolean }>,
  competition: (id: number, t?: string | null) => api(`/competitions/${id}`, t) as Promise<CompetitionDetail>,
  createComp: (t: string, body: any) => api(`/competitions`, t, { method: "POST", body }) as Promise<{ id: number }>,
  editComp: (t: string, id: number, body: any) => api(`/competitions/${id}`, t, { method: "PATCH", body }),
  enter: (t: string, id: number, body: { answers?: number[]; content?: string; image_url?: string; duration_sec?: number }) =>
    api(`/competitions/${id}/enter`, t, { method: "POST", body }) as Promise<{ score: number; total: number; points: number }>,
  finish: (t: string, id: number, body: { winners?: number[]; count?: number }) => api(`/competitions/${id}/finish`, t, { method: "POST", body }) as Promise<{ winners: number[] }>,
};

export function fmtDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ar", { weekday: "short", day: "numeric", month: "short" }) + (withTime ? ` · ${d.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit" })}` : "");
  } catch { return ""; }
}
