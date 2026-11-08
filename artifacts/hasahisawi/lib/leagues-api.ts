import { getApiUrl } from "@/lib/query-client";

export type League = {
  id: number; name: string; season?: string | null; sport: string; format: "league" | "groups" | "cup";
  logo_url?: string | null; cover_url?: string | null; description?: string | null; rules?: string | null;
  points_win: number; points_draw: number; points_loss: number; venue?: string | null;
  start_date?: string | null; end_date?: string | null; primary_color?: string | null;
  status: "registration" | "running" | "finished"; approved: boolean; created_by?: number;
  teams_count?: number; matches_count?: number; live_count?: number; is_staff?: boolean;
};
export type Team = {
  id: number; league_id: number; name: string; short_name?: string | null; logo_url?: string | null; color?: string | null;
  group_name?: string | null; coach?: string | null; manager_name?: string | null; manager_phone?: string | null;
  status: "approved" | "pending" | "rejected"; players_count?: number; players?: Player[];
};
export type Player = { id: number; team_id: number; name: string; number?: number | null; position?: string | null };
export type Match = {
  id: number; league_id: number; round: number; stage?: string | null; group_name?: string | null;
  home_team_id: number; away_team_id: number; kickoff?: string | null; venue?: string | null;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  home_score: number | null; away_score: number | null; referee_user_id?: number | null; referee_name?: string | null;
  assistants?: string | null; referee_report?: string | null; tickets_enabled: boolean;
};
export type MatchEvent = { id: number; match_id: number; minute?: number | null; type: string; team_id: number; player_name?: string | null; note?: string | null };
export type StandingRow = { team_id: number; name: string; short_name?: string | null; logo_url?: string | null; color?: string | null; group: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number; form: string[] };
export type Scorer = { player_name: string; team_id: number; team_name: string; logo_url?: string | null; goals: number };
export type Staff = { user_id: number; role: "organizer" | "referee" | "gate"; title?: string | null; name?: string | null };
export type TicketType = { id: number; match_id: number; name: string; price: string | number; capacity: number; sold: number; note?: string | null };
export type Ticket = {
  id: number; code: string; match_id: number; type_id: number; holder_name?: string | null; phone?: string | null;
  status: "reserved" | "paid" | "used" | "cancelled"; created_at: string; used_at?: string | null;
  type_name?: string; price?: string | number; kickoff?: string | null; venue?: string | null; stage?: string | null;
  league_name?: string; league_id?: number; home_name?: string; home_logo?: string | null; away_name?: string; away_logo?: string | null; match_status?: string;
};
export type LeagueDetail = { league: League; teams: Team[]; matches: Match[]; standings: Record<string, StandingRow[]>; scorers: Scorer[]; staff: Staff[]; roles: string[] };
export type MatchDetail = { match: Match; league: League; home: Team; away: Team; events: MatchEvent[]; ticket_types: TicketType[]; roles: string[]; can_referee: boolean };

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${getApiUrl()}/api${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((d as any)?.error || `خطأ (${r.status})`), { status: r.status, data: d });
  return d as T;
}
const body = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) });

export const leaguesApi = {
  list: (t?: string | null) => call<{ leagues: League[]; can_manage?: boolean }>("/leagues", t),
  remove: (t: string, id: number) => call<{ ok: boolean }>(`/leagues/${id}`, t, { method: "DELETE" }),
  get: (id: number, t?: string | null) => call<LeagueDetail>(`/leagues/${id}`, t),
  create: (t: string, b: Partial<League>) => call<{ league: League; message: string }>("/leagues", t, body("POST", b)),
  update: (t: string, id: number, b: Partial<League> & { approved?: boolean }) => call<{ league: League }>(`/leagues/${id}`, t, body("PATCH", b)),
  addStaff: (t: string, id: number, phone: string, role: string, title?: string) => call<{ member: Staff }>(`/leagues/${id}/staff`, t, body("POST", { phone, role, title })),
  removeStaff: (t: string, id: number, uid: number, role: string) => call(`/leagues/${id}/staff/${uid}/${role}`, t, { method: "DELETE" }),
  addTeam: (t: string, id: number, b: Partial<Team>) => call<{ team: Team; message: string }>(`/leagues/${id}/teams`, t, body("POST", b)),
  updateTeam: (t: string, id: number, tid: number, b: Partial<Team>) => call<{ team: Team }>(`/leagues/${id}/teams/${tid}`, t, body("PATCH", b)),
  removeTeam: (t: string, id: number, tid: number) => call(`/leagues/${id}/teams/${tid}`, t, { method: "DELETE" }),
  addPlayers: (t: string, id: number, tid: number, players: Partial<Player>[]) => call<{ players: Player[] }>(`/leagues/${id}/teams/${tid}/players`, t, body("POST", { players })),
  generate: (t: string, id: number, b: { start_date?: string; time?: string; days_between?: number; double_round?: boolean; replace?: boolean }) => call<{ created: number }>(`/leagues/${id}/fixtures/generate`, t, body("POST", b)),
  addMatch: (t: string, id: number, b: Partial<Match>) => call<{ match: Match }>(`/leagues/${id}/matches`, t, body("POST", b)),
  match: (mid: number, t?: string | null) => call<MatchDetail>(`/leagues/matches/${mid}`, t),
  updateMatch: (t: string, mid: number, b: Partial<Match>) => call<{ match: Match }>(`/leagues/matches/${mid}`, t, body("PATCH", b)),
  addEvent: (t: string, mid: number, b: Partial<MatchEvent>) => call<{ event: MatchEvent }>(`/leagues/matches/${mid}/events`, t, body("POST", b)),
  removeEvent: (t: string, mid: number, eid: number) => call(`/leagues/matches/${mid}/events/${eid}`, t, { method: "DELETE" }),
  setTicketTypes: (t: string, mid: number, types: Partial<TicketType>[]) => call<{ ticket_types: TicketType[] }>(`/leagues/matches/${mid}/ticket-types`, t, body("PUT", { types })),
  reserve: (t: string, mid: number, b: { type_id: number; qty: number; holder_name?: string; phone?: string }) => call<{ tickets: Ticket[]; message: string }>(`/leagues/matches/${mid}/tickets`, t, body("POST", b)),
  myTickets: (t: string) => call<{ tickets: Ticket[] }>("/leagues/tickets/mine", t),
  matchTickets: (t: string, mid: number) => call<{ tickets: Ticket[] }>(`/leagues/matches/${mid}/tickets`, t),
  setTicket: (t: string, code: string, status: string) => call<{ ticket: Ticket }>(`/leagues/tickets/${code}`, t, body("PATCH", { status })),
  check: (t: string, code: string, match_id?: number) => call<{ ok: boolean; result: string; ticket: Ticket }>("/leagues/tickets/check", t, body("POST", { code, match_id })),
};

export const STATUS_AR: Record<string, { label: string; color: string }> = {
  registration: { label: "التسجيل مفتوح", color: "#008259" },
  running: { label: "جارٍ", color: "#00966A" },
  finished: { label: "انتهى", color: "#6B7D75" },
  scheduled: { label: "لم تبدأ", color: "#6B7D75" },
  live: { label: "مباشر", color: "#D93636" },
  postponed: { label: "مؤجلة", color: "#E8A900" },
  cancelled: { label: "ملغاة", color: "#9AABA3" },
};
export const EVENT_META: Record<string, { label: string; icon: string; color: string }> = {
  goal: { label: "هدف", icon: "football", color: "#00966A" },
  penalty_goal: { label: "هدف من جزاء", icon: "football", color: "#00966A" },
  own_goal: { label: "هدف عكسي", icon: "football", color: "#D93636" },
  penalty_miss: { label: "جزاء ضائع", icon: "close-circle", color: "#9AABA3" },
  yellow: { label: "بطاقة صفراء", icon: "square", color: "#F7D76A" },
  red: { label: "بطاقة حمراء", icon: "square", color: "#D93636" },
  sub: { label: "تبديل", icon: "swap-horizontal", color: "#008259" },
};
export const ROLE_AR: Record<string, string> = { organizer: "اللجنة المنظمة", referee: "لجنة التحكيم", gate: "موظفو البوابة", admin: "إدارة التطبيق" };
export const LEAGUE_ACCENT = "#004D36";

export function fmtKickoff(iso?: string | null) {
  if (!iso) return "الموعد لم يُحدد";
  const d = new Date(iso);
  return `${d.toLocaleDateString("ar-SD", { weekday: "long", day: "numeric", month: "long" })} · ${d.toLocaleTimeString("ar-SD", { hour: "numeric", minute: "2-digit" })}`;
}
export const money = (v: string | number | null | undefined) => (Number(v) > 0 ? `${Number(v).toLocaleString("en")} ج.س` : "مجاناً");
export const ticketQr = (code: string) => `HSW-TICKET:${code}`;
