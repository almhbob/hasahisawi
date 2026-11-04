// ديوان الكُتّاب ومسابقة حصاحيصاوي الأدبية — واجهة الخادم والأنواع
import { getApiUrl } from "@/lib/query-client";
import { splitVerseMarked, type LitLayout } from "@/lib/lit-markup";
export type { LitLayout } from "@/lib/lit-markup";

export const INK = "#3A1E1A";
export const WINE = "#7A2E3A";
export const PAPER = "#FBF7EF";
export const GOLD = "#C99A2E";

export type LitGroupKey = "story" | "poetry" | "prose";
export type LitGroup = { key: LitGroupKey; label: string; icon: string; color: string; count: number };
export type LitForm = { key: string; label: string; group: LitGroupKey; min: number; max: number; lines?: [number, number]; hint: string; count: number; about?: string; example?: { title: string; body: string }; innovative?: boolean };
export type LitMeta = {
  groups: LitGroup[]; forms: LitForm[]; totals: { texts: number; writers: number };
  me: { signed_in: boolean; can_review: boolean; pending?: number; is_app_admin?: boolean; contest_supervisor?: boolean; name?: string };
};
export type LitText = {
  id: number; doc_no: string | null; doc_hash: string; form: string; form_label: string; group: LitGroupKey; group_label: string;
  title: string; excerpt: string; body?: string; dedication?: string | null; author_id: number; author_name: string; author_avatar: string | null;
  status: "pending" | "approved" | "rejected" | "ai_flagged" | "contest" | "withdrawn"; featured: boolean; views: number; likes: number; liked: boolean;
  created_at: string; published_at: string | null; pledge_at: string; contest_id: number | null; lines: number | null; words: number; verify_url: string | null;
  review_note?: string | null; ai_score?: number; ai_verdict?: "human" | "review" | "ai"; ai_signals?: { key: string; label: string; weight: number }[];
  appeal?: boolean; appeal_note?: string | null; pasted_ratio?: number | null; reviewer_name?: string | null;
  image_url?: string | null; image_caption?: string | null; layout?: LitLayout | null;
  has_translation?: boolean; translation_lang?: string | null; translation?: string | null; translation_by?: string | null;
};
/** مرفقات النص: ترجمة وصورة وتنسيق العرض */
export type LitAttachments = {
  translation?: string; translation_lang?: string; translation_by?: string;
  image_url?: string; image_caption?: string; layout?: LitLayout | null;
};
export type Pledge = { original: boolean; not_copied: boolean; no_ai: boolean; unpublished?: boolean; signature: string };
export type Telemetry = { pasted_chars: number; typed_chars: number; compose_seconds: number };

export type Criterion = { key: string; label: string; weight: number };
export type Prize = { rank: number; label: string; reward: string };
export type ContestPhase = "draft" | "upcoming" | "open" | "judging" | "results";
export type Contest = {
  id: number; title: string; edition: string | null; slogan: string | null; description: string; theme: string | null;
  categories: { key: string; label: string; group: LitGroupKey }[]; rules: string[]; criteria: Criterion[]; prizes: Prize[];
  starts_at: string; ends_at: string; results_at: string | null; max_entries: number; show_judges: boolean;
  published: boolean; results_published: boolean; results_note: string | null; phase: ContestPhase; entries: number; participants: number;
  i_judge?: boolean; per_category?: Record<string, number>;
};
export type ContestDetail = {
  contest: Contest;
  judges: { user_id: number; title: string | null; name: string; avatar_url: string | null }[];
  mine: { id: number; code: string; category: string; status: string; status_note: string | null; rank: number | null; award: string | null; final_score: string | null; certificate_no: string | null; text_id: number; title: string; doc_no: string; created_at: string }[];
  results: { id: number; category: string; category_label: string; rank: number; award: string; final_score: number | null; certificate_no: string; text_id: number; title: string; doc_no: string; author_name: string; author_avatar: string | null; author_id: number }[];
  me: { supervisor: boolean; judge: boolean; signed_in: boolean };
};
export type SupEntry = {
  id: number; code: string; category: string; category_label: string; status: string; status_note: string | null; title: string; body: string; doc_no: string;
  author_id: number; author_name: string; author_avatar: string | null; ai_score: number; ai_verdict: string; ai_signals: { label: string }[]; pasted_ratio: number | null;
  scored: number; avg_total: number | null; final_score: number | null; rank: number | null; award: string | null; created_at: string;
};
export type JudgeEntry = { id: number; code: string; category: string; category_label: string; group: LitGroupKey; title: string; body: string; my_scores: Record<string, number> | null; my_total: number | null; my_comment: string };
export type UserHit = { id: number; name: string; avatar_url: string | null; headline?: string | null };

export class LitError extends Error {
  status: number; code?: string; data: any;
  constructor(msg: string, status: number, data: any) { super(msg); this.status = status; this.code = data?.code; this.data = data; }
}
async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new LitError((j as any)?.error || `خطأ (${res.status})`, res.status, j);
  return j as T;
}
const json = (b: unknown) => ({ body: JSON.stringify(b) });
const qs = (o: Record<string, unknown>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};

export const litApi = {
  meta: (t?: string | null) => call<LitMeta>(`/lit/meta`, t),
  texts: (f: { group?: string; form?: string; q?: string; sort?: string; author?: number; featured?: boolean; limit?: number; offset?: number }, t?: string | null) =>
    call<{ texts: LitText[]; has_more: boolean }>(`/lit/texts${qs({ ...f, featured: f.featured ? 1 : undefined })}`, t),
  top: () => call<{ writers: { id: number; name: string; avatar_url: string | null; texts: number; likes: number }[] }>(`/lit/writers/top`),
  text: (id: number, t?: string | null) => call<{ text: LitText; is_owner: boolean; can_review: boolean; more: LitText[] }>(`/lit/texts/${id}`, t),
  mine: (t: string) => call<{ texts: LitText[] }>(`/lit/mine`, t),
  create: (t: string, b: { form: string; title: string; body: string; pen_name?: string; dedication?: string; pledge: Pledge; telemetry: Telemetry } & LitAttachments) =>
    call<{ text: LitText; message: string }>(`/lit/texts`, t, { method: "POST", ...json(b) }),
  /** تحديث المرفقات والتنسيق فقط (المتن موثّق ولا يُعدَّل) */
  updateAttachments: (t: string, id: number, b: LitAttachments) =>
    call<{ text: LitText; message: string }>(`/lit/texts/${id}`, t, { method: "PATCH", ...json(b) }),
  appeal: (t: string, id: number, note: string) => call<{ ok: true; message: string }>(`/lit/texts/${id}/appeal`, t, { method: "POST", ...json({ note }) }),
  like: (t: string, id: number) => call<{ liked: boolean; likes: number }>(`/lit/texts/${id}/like`, t, { method: "POST" }),
  withdraw: (t: string, id: number) => call<{ ok: true }>(`/lit/texts/${id}`, t, { method: "DELETE" }),
  review: (t: string, status: string) => call<{ texts: LitText[]; counts: Record<string, number> }>(`/lit/review${qs({ status })}`, t),
  act: (t: string, id: number, action: string, note?: string) => call<{ text: LitText }>(`/lit/texts/${id}/review`, t, { method: "POST", ...json({ action, note }) }),
  verify: (no: string) => call<{ valid: boolean; doc_no: string; hash: string; documented_at: string; author: string; form_label: string; status: string; title: string | null; text_id: number | null }>(`/lit/verify/${encodeURIComponent(no)}`),

  contests: (t?: string | null) => call<{ contests: Contest[]; me: { supervisor: boolean; is_app_admin: boolean } }>(`/lit/contests`, t),
  contest: (id: number, t?: string | null) => call<ContestDetail>(`/lit/contests/${id}`, t),
  enter: (t: string, id: number, b: { form: string; title: string; body: string; pen_name?: string; pledge: Pledge; telemetry: Telemetry }) =>
    call<{ entry: { id: number; code: string; status: string; doc_no: string; text_id: number; title: string }; message: string }>(`/lit/contests/${id}/enter`, t, { method: "POST", ...json(b) }),
  withdrawEntry: (t: string, id: number, eid: number) => call<{ ok: true; message: string }>(`/lit/contests/${id}/entries/${eid}/withdraw`, t, { method: "POST" }),
  createContest: (t: string, b: Partial<Contest> & { categories: string[] }) => call<{ contest: Contest }>(`/lit/contests`, t, { method: "POST", ...json(b) }),
  updateContest: (t: string, id: number, b: Record<string, unknown>) => call<{ contest: Contest }>(`/lit/contests/${id}`, t, { method: "PATCH", ...json(b) }),
  deleteContest: (t: string, id: number) => call<{ ok: true }>(`/lit/contests/${id}`, t, { method: "DELETE" }),
  setJudges: (t: string, id: number, judges: { user_id: number; title?: string | null }[]) => call<{ ok: true }>(`/lit/contests/${id}/judges`, t, { method: "PUT", ...json({ judges }) }),
  supEntries: (t: string, id: number) => call<{ role: "supervisor"; judges: number; criteria: Criterion[]; entries: SupEntry[] }>(`/lit/contests/${id}/entries`, t),
  judgeEntries: (t: string, id: number) => call<{ role: "judge"; judges: number; criteria: Criterion[]; phase: ContestPhase; entries: JudgeEntry[] }>(`/lit/contests/${id}/entries?as=judge`, t),
  entryStatus: (t: string, id: number, eid: number, status: "qualified" | "disqualified", note?: string) =>
    call<{ ok: true }>(`/lit/contests/${id}/entries/${eid}/status`, t, { method: "POST", ...json({ status, note }) }),
  score: (t: string, id: number, eid: number, scores: Record<string, number>, comment: string) =>
    call<{ ok: true; total: number }>(`/lit/contests/${id}/entries/${eid}/score`, t, { method: "PUT", ...json({ scores, comment }) }),
  compute: (t: string, id: number) => call<{ ok: true; ranked: number; incomplete: number; judges: number }>(`/lit/contests/${id}/compute`, t, { method: "POST" }),
  publishResults: (t: string, id: number, note: string) => call<{ ok: true; winners: number }>(`/lit/contests/${id}/publish-results`, t, { method: "POST", ...json({ note }) }),
  lookup: (t: string, q: string) => call<{ users: UserHit[] }>(`/lit/users/lookup${qs({ q })}`, t),
  supervisors: (t: string) => call<{ supervisors: { user_id: number; name: string; avatar_url: string | null; created_at: string }[] }>(`/lit/contest-supervisors`, t),
  addSupervisor: (t: string, uid: number) => call<{ ok: true }>(`/lit/contest-supervisors/${uid}`, t, { method: "PUT" }),
  removeSupervisor: (t: string, uid: number) => call<{ ok: true }>(`/lit/contest-supervisors/${uid}`, t, { method: "DELETE" }),
};

export const PHASE_META: Record<ContestPhase, { label: string; color: string; icon: string }> = {
  draft: { label: "مسودة", color: "#7A8794", icon: "create-outline" },
  upcoming: { label: "قريباً", color: "#2B6CB0", icon: "time-outline" },
  open: { label: "باب المشاركة مفتوح", color: "#0E8A5F", icon: "lock-open-outline" },
  judging: { label: "قيد التحكيم", color: "#B7791F", icon: "hourglass-outline" },
  results: { label: "أُعلنت النتائج", color: WINE, icon: "trophy-outline" },
};
export const TEXT_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "قيد المراجعة", color: "#B7791F", icon: "time-outline" },
  approved: { label: "منشور", color: "#0E8A5F", icon: "checkmark-circle" },
  rejected: { label: "يحتاج تعديلاً", color: "#C0392B", icon: "alert-circle" },
  ai_flagged: { label: "رُفض آلياً (ذكاء اصطناعي)", color: "#9B2C2C", icon: "hardware-chip-outline" },
  contest: { label: "مشاركة في مسابقة", color: GOLD, icon: "trophy-outline" },
  withdrawn: { label: "مسحوب", color: "#7A8794", icon: "archive-outline" },
};

export function fmtDate(s?: string | null, time = false): string {
  if (!s) return "";
  try { return new Date(s).toLocaleString("ar-EG", time ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" }); } catch { return ""; }
}
/** عدّاد تنازلي بسيط بالأيام والساعات */
export function countdown(to: string): string {
  const ms = new Date(to).getTime() - Date.now();
  if (ms <= 0) return "انتهى";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d} يوماً · ${h} ساعة` : h > 0 ? `${h} ساعة · ${m} دقيقة` : `${m} دقيقة`;
}
/** يقسم بيت الشعر العمودي إلى صدر وعجز */
export function splitVerse(line: string): [string, string] | null {
  return splitVerseMarked(line);
}
