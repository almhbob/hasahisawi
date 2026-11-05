// اتحاد الطلاب — أرشيف الأنشطة والانتخابات (واجهة الطالب)
import { getApiUrl } from "@/lib/query-client";

export type Activity = {
  id: number; title: string; body: string | null; category: string; category_label: string;
  activity_date: string; location: string | null; cover_url: string | null; images: string[]; attendees: number | null;
};
export type ActivityStats = { total: number; attendees: number; photos: number; years: number[] };

export type ElectionPhase = "draft" | "upcoming" | "nominations" | "campaign" | "voting" | "counting" | "results";
export type Candidate = { id: number; position_id: number; full_name: string; institution: string | null; major: string | null; photo_url: string | null; program: string | null; status: string };
export type Position = { id: number; title: string; seats: number; candidates: Candidate[] };
export type ResultCandidate = { candidate_id: number; full_name: string; institution: string | null; photo_url: string | null; votes: number; percent: number; winner: boolean };
export type ResultPosition = { position_id: number; title: string; seats: number; valid_votes: number; blank_votes: number; tie: boolean; candidates: ResultCandidate[] };
export type Results = { voters: number; receipts: number; consistent: boolean; positions: ResultPosition[]; published_at?: string };
export type LogEntry = { action: string; details: string | null; actor: string | null; created_at: string };
export type Election = {
  id: number; title: string; description: string | null;
  nominations_start: string; nominations_end: string; voting_start: string; voting_end: string;
  published_at: string | null; results_published_at: string | null;
  phase: ElectionPhase; phase_label: string; locked: boolean;
  turnout: { voters: number; eligible: number; percent: number };
  positions: Position[]; results: Results | null; log: LogEntry[];
  me?: { member: boolean; eligible: boolean; reason: string | null; voted: boolean; candidacy: { id: number; position_id: number; status: string; reject_reason: string | null } | null };
};

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((j as any)?.error || `خطأ (${res.status})`), { status: res.status });
  return j as T;
}

export const unionPlusApi = {
  activities: (q: { year?: number | null; category?: string | null } = {}) => {
    const p = new URLSearchParams();
    if (q.year) p.set("year", String(q.year));
    if (q.category) p.set("category", q.category);
    const qs = p.toString();
    return call<{ activities: Activity[]; stats: ActivityStats; categories: Record<string, string> }>(`/union/activities${qs ? `?${qs}` : ""}`);
  },
  activity: (id: number) => call<{ activity: Activity }>(`/union/activities/${id}`),
  elections: (token?: string | null) => call<{ elections: Election[] }>(`/union/elections`, token),
  nominate: (token: string, id: number, body: { position_id: number; program: string; photo_url?: string | null }) =>
    call<{ ok: true; message: string }>(`/union/elections/${id}/nominate`, token, { method: "POST", body: JSON.stringify(body) }),
  vote: (token: string, id: number, choices: Record<string, number[]>) =>
    call<{ ok: true; receipt: string; message: string }>(`/union/elections/${id}/vote`, token, { method: "POST", body: JSON.stringify({ choices }) }),
  verify: (id: number, receipt: string) =>
    call<{ counted: boolean; fingerprint: string }>(`/union/elections/${id}/verify`, null, { method: "POST", body: JSON.stringify({ receipt }) }),
  receipts: (id: number) => call<{ count: number; fingerprints: string[] }>(`/union/elections/${id}/receipts`),
};

export const fmtDay = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" }) : "");
export const fmtDayTime = (s?: string | null) => (s ? new Date(s).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

/** صياغة عربية مفهومة لسجل الشفافية */
export const LOG_LABEL: Record<string, string> = {
  created: "أُنشئ الانتخاب", published: "نُشر الانتخاب للأعضاء", schedule: "عُدّلت المواعيد", details: "عُدّل العنوان أو الوصف",
  nomination: "طلب ترشح جديد", candidate_approved: "اعتُمد مرشح", candidate_rejected: "رُفض طلب ترشح", candidate_pending: "أُعيد طلب ترشح للمراجعة",
  candidate_added: "أضافت الرئاسة مرشحاً", results: "أُعلنت النتائج الرسمية",
};
