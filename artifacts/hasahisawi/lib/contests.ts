// واجهة المسابقات: الجارية والمنتهية، المشاركة، والإدارة.
import { useEffect, useState } from "react";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

export type ContestState = "upcoming" | "active" | "ended";
export type ContestPerson = { user_id: number; name: string; avatar_url: string | null };
export type ContestWinner = ContestPerson & { rank: number | null; score: number };
export type ContestCategory = "culture" | "religious" | "sports" | "literary" | "photo" | "kids" | "science" | "general";
export type Contest = {
  id: number; title: string; description: string | null;
  kind: "sponsored" | "seasonal"; occasion: string | null; type: "quiz" | "entry";
  sponsor_name: string | null; sponsor_logo: string | null; prize: string | null; terms: string | null;
  entry_prompt: string | null; winners_count: number; starts_at: string; ends_at: string; created_at?: string;
  status: string; state: ContestState; shares: number; entries_count: number;
  entered?: boolean; questions_count?: number;
  cover_image?: string | null; category?: ContestCategory | null; prizes?: string[] | null; featured?: boolean;
  participants?: ContestPerson[]; top_winners?: ContestWinner[];
};
export type MyContest = Contest & {
  my_entry: { score: number; is_winner: boolean; rank: number | null; created_at: string; entry_number: number };
};
export type ContestQuestion = { id: number; question: string; options: string[]; correct_index?: number };
export type ContestDetail = Contest & {
  questions: ContestQuestion[];
  mine: { answers: number[] | null; score: number; content: string | null; image_url: string | null; is_winner: boolean; rank: number | null; entry_number?: number } | null;
  winners: ContestWinner[];
  participants: ContestPerson[];
  canManage: boolean;
};
export type Occasion = { key: string; name: string; title: string; description: string; date: string; daysAway: number; calendar?: "hijri" | "gregorian" };
export type HallOfFame = {
  leaders: (ContestPerson & { wins: number; firsts: number; entries: number })[];
  recent: (ContestPerson & { rank: number | null; contest_id: number; contest_title: string; occasion: string | null; kind: string; prize: string | null; ends_at: string })[];
};

/** تصنيفات المسابقات (المفتاح يُخزَّن في الخادم). */
export const CATEGORIES: Record<ContestCategory, { label: string; icon: string }> = {
  culture: { label: "ثقافية", icon: "library-outline" },
  religious: { label: "دينية", icon: "moon-outline" },
  sports: { label: "رياضية", icon: "football-outline" },
  literary: { label: "أدبية", icon: "create-outline" },
  photo: { label: "تصوير", icon: "camera-outline" },
  kids: { label: "أطفال", icon: "happy-outline" },
  science: { label: "علمية", icon: "flask-outline" },
  general: { label: "عامة", icon: "apps-outline" },
};

/** جوائز المراكز: الجديدة من prizes، والقديمة من حقل prize الواحد. */
export function prizeTiers(c: Pick<Contest, "prizes" | "prize">): string[] {
  const list = (c.prizes ?? []).filter(Boolean);
  return list.length ? list : c.prize ? [c.prize] : [];
}

export const RANK_LABEL = ["المركز الأول", "المركز الثاني", "المركز الثالث", "المركز الرابع", "المركز الخامس", "المركز السادس", "المركز السابع", "المركز الثامن", "المركز التاسع", "المركز العاشر"];

/** هوية بصرية لكل مناسبة: ألوان التدرج، أيقونة، ونص الترويسة. */
// التباين مُتحقَّق: النص الأبيض ولون التمييز ≥ 4.5:1 على طرفي التدرج.
// ألوان هوية حصاحيصاوي: أخضر التطبيق وذهبه، وألوان علم السودان للمناسبات الوطنية — بلا بنفسجي/نيلي
export const OCCASION_THEME: Record<string, { grad: [string, string]; accent: string; icon: string; label: string }> = {
  ramadan: { grad: ["#0B3B2C", "#0D4A37"], accent: "#F2C94C", icon: "moon", label: "رمضان كريم" },
  eid_fitr: { grad: ["#006B4A", "#004D36"], accent: "#FCD34D", icon: "gift", label: "عيد فطر مبارك" },
  eid_adha: { grad: ["#5C3F0C", "#7A5512"], accent: "#FFE9A8", icon: "star", label: "عيد أضحى مبارك" },
  hijri_new_year: { grad: ["#123A2C", "#1D5A44"], accent: "#F2C94C", icon: "calendar", label: "عام هجري سعيد" },
  mawlid: { grad: ["#0E5132", "#0F6238"], accent: "#FDE68A", icon: "sparkles", label: "المولد النبوي الشريف" },
  isra_miraj: { grad: ["#3D2A0E", "#6B4A16"], accent: "#F5D27A", icon: "planet", label: "الإسراء والمعراج" },
  independence: { grad: ["#8E0D18", "#1A1A1A"], accent: "#86EFAC", icon: "flag", label: "عيد الاستقلال المجيد" },
  sponsored: { grad: ["#006B4A", "#004D36"], accent: "#FCD34D", icon: "trophy", label: "مسابقات حصاحيصاوي" },
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
  mine: (token: string | null | undefined) => call<MyContest[]>(`/api/contests/mine`, token),
  hallOfFame: (token?: string | null) => call<HallOfFame>(`/api/contests/hall-of-fame`, token),
  occasions: () => call<Occasion[]>(`/api/contests/occasions`),
  enter: (id: number, token: string | null | undefined, body: { answers?: number[]; content?: string; image_url?: string }) =>
    call<{ success: boolean; score: number; total: number | null; entry_number: number | null }>(`/api/contests/${id}/enter`, token, { method: "POST", body: JSON.stringify(body) }),
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

/** عدد الأسئلة بصيغة عربية صحيحة. */
export const qCount = (n: number) => (n === 1 ? "سؤال واحد" : n === 2 ? "سؤالان" : n <= 10 ? `${n} أسئلة` : `${n} سؤالاً`);

/** أجزاء العدّ التنازلي حتى تاريخ معيّن. */
export function countdownParts(iso: string, now = Date.now()) {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  return {
    done: ms <= 0,
    days: Math.floor(ms / 86400_000),
    hours: Math.floor((ms % 86400_000) / 3600_000),
    minutes: Math.floor((ms % 3600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
  };
}

/** نسبة الوقت المنقضي من عمر المسابقة (0..1). */
export function elapsedRatio(c: Pick<Contest, "starts_at" | "ends_at">, now = Date.now()) {
  const a = new Date(c.starts_at).getTime();
  const b = new Date(c.ends_at).getTime();
  if (!(b > a)) return 1;
  return Math.min(1, Math.max(0, (now - a) / (b - a)));
}

/** وصف مختصر للوقت: «تبدأ خلال…» أو «تنتهي خلال…». */
export function shortWhen(c: Pick<Contest, "state" | "starts_at" | "ends_at">, now = Date.now()) {
  if (c.state === "ended") return "انتهت";
  const p = countdownParts(c.state === "upcoming" ? c.starts_at : c.ends_at, now);
  const span = p.days > 0 ? (p.days === 1 ? "يوم" : p.days === 2 ? "يومين" : `${p.days} ${p.days <= 10 ? "أيام" : "يوماً"}`)
    : p.hours > 0 ? (p.hours === 1 ? "ساعة" : p.hours === 2 ? "ساعتين" : `${p.hours} ${p.hours <= 10 ? "ساعات" : "ساعة"}`)
      : `${Math.max(1, p.minutes)} دقيقة`;
  return c.state === "upcoming" ? `تبدأ خلال ${span}` : `تنتهي خلال ${span}`;
}

/** عدّاد يتجدد كل ثانية (أو كل فترة) لعرض العدّ التنازلي. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
