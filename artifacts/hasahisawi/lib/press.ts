// نافذة الصحافة (التوأمة مع نقابة الصحفيين) — الأنواع وواجهة الخادم
import { getApiUrl } from "@/lib/query-client";

export const PRESS_INK = "#0F172A";
export const PRESS_RED = "#C8102E";
export const PRESS_PAPER = "#FAFAF7";

export type PressSettings = { partner_name: string; window_title: string; status: "proposed" | "active" | "paused"; phase: number; agreement_no: string; about: string | null; contact_email: string | null; contact_phone: string | null; logo_url: string | null; launched_at: string | null };
export type PressFile = { name: string; url: string; type?: string | null; size?: number | null };
export type PressPost = {
  id: number; ref_no: string; kind: string; kind_label: string; title: string; summary: string; body?: string; cover_url: string | null; attachments: PressFile[];
  signed_by: string | null; urgent: boolean; pinned: boolean; status: "published" | "draft" | "withdrawn"; push_sent_at: string | null; push_count: number | null;
  views: number; published_at: string | null; created_at: string; author_name: string | null;
};
export type PressArchive = { id: number; kind: string; kind_label: string; title: string; description: string | null; event_date: string | null; place: string | null; files: PressFile[]; tags: string[]; source: string | null; created_at: string };
export type Journalist = { user_id: number; name: string; pen_name: string | null; press_org: string | null; press_role: string | null; press_years: number | null; city: string | null; member_no: string | null; avatar_url: string | null; accredited: boolean; union_card_no: string | null; specialty: string | null; beat: string | null; verified_at: string | null; whatsapp: string | null; email: string | null };
export type PressMe = { role: string; role_label: string; can_publish: boolean; can_push: boolean; can_manage: boolean } | null;
export type PressOverview = { settings: PressSettings; urgent: PressPost | null; stats: { posts: number; archive: number; journalists: number; accredited: number }; kinds: Record<string, { label: string }>; archive_kinds: Record<string, string>; me: PressMe };

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as any)?.error || `خطأ (${res.status})`);
  return j as T;
}
const json = (b: unknown) => ({ body: JSON.stringify(b) });
const qs = (o: Record<string, unknown>) => { const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`); return p.length ? `?${p.join("&")}` : ""; };

export const pressApi = {
  overview: (t?: string | null) => call<PressOverview>(`/press/overview`, t),
  posts: (f: { kind?: string; q?: string; all?: boolean; limit?: number; offset?: number }, t?: string | null) => call<{ posts: PressPost[]; has_more: boolean }>(`/press/posts${qs({ ...f, all: f.all ? 1 : undefined })}`, t),
  post: (id: number, t?: string | null) => call<{ post: PressPost; settings: PressSettings; can_edit: boolean }>(`/press/posts/${id}`, t),
  archive: (f: { kind?: string; year?: string; q?: string }) => call<{ items: PressArchive[]; years: number[] }>(`/press/archive${qs(f)}`),
  directory: (f: { q?: string; accredited?: boolean }) => call<{ journalists: Journalist[] }>(`/press/directory${qs({ ...f, accredited: f.accredited ? 1 : undefined })}`),
  create: (t: string, b: Record<string, unknown>) => call<{ post: PressPost; message: string; push: { sent: number; skipped?: string } }>(`/press/posts`, t, { method: "POST", ...json(b) }),
  update: (t: string, id: number, b: Record<string, unknown>) => call<{ post: PressPost; push: { sent: number; skipped?: string } }>(`/press/posts/${id}`, t, { method: "PATCH", ...json(b) }),
  withdraw: (t: string, id: number) => call<{ ok: true }>(`/press/posts/${id}`, t, { method: "DELETE" }),
  addArchive: (t: string, b: Record<string, unknown>) => call<{ item: PressArchive }>(`/press/archive`, t, { method: "POST", ...json(b) }),
  delArchive: (t: string, id: number) => call<{ ok: true }>(`/press/archive/${id}`, t, { method: "DELETE" }),
  accredit: (t: string, uid: number, b: Record<string, unknown>) => call<{ ok: true }>(`/press/accreditations/${uid}`, t, { method: "PUT", ...json(b) }),
  staff: (t: string) => call<{ staff: { user_id: number; name: string; avatar_url: string | null; role: string; role_label: string; title: string | null; can_push: boolean }[]; roles: Record<string, string> }>(`/press/staff`, t),
  setStaff: (t: string, uid: number, b: { role: string; title?: string; can_push?: boolean }) => call<{ ok: true }>(`/press/staff/${uid}`, t, { method: "PUT", ...json(b) }),
  delStaff: (t: string, uid: number) => call<{ ok: true }>(`/press/staff/${uid}`, t, { method: "DELETE" }),
  lookup: (t: string, q: string) => call<{ users: { id: number; name: string; avatar_url: string | null }[] }>(`/press/users/lookup${qs({ q })}`, t),
  saveSettings: (t: string, b: Partial<PressSettings>) => call<{ ok: true }>(`/press/settings`, t, { method: "PUT", ...json(b) }),
};

export const PARTNER_STATUS: Record<string, { label: string; color: string; note: string }> = {
  proposed: { label: "شراكة مقترحة", color: "#B7791F", note: "نافذة تجريبية — الشراكة قيد التنسيق والاعتماد، ولا تُعد هذه النافذة ناطقة رسمياً باسم النقابة حتى توقيع الاتفاق." },
  active: { label: "شراكة معتمدة", color: "#0E8A5F", note: "نافذة معتمدة تديرها الأمانة الإعلامية بموجب اتفاق التوأمة." },
  paused: { label: "متوقفة مؤقتاً", color: "#7A8794", note: "النافذة متوقفة مؤقتاً." },
};
export const fmtDay = (s?: string | null, time = false) => { if (!s) return ""; try { return new Date(s).toLocaleString("ar-EG", time ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" }); } catch { return ""; } };
