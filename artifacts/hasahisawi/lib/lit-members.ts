// عضوية ديوان الكُتّاب — الأنواع وواجهة الخادم
import { getApiUrl } from "@/lib/query-client";

export const REF_KEY = "lit_member_ref_v1";
export type MemberCategory = { key: string; label: string; title: string; color: string; accent: string; icon: string; members?: number };
export type Badge = { key: string; label: string; desc: string; icon: string; color: string };
export type Award = { id: number; title: string; description: string | null; icon: string; color: string; created_at: string };
export type Member = {
  id: number; user_id: number; category: string; category_label: string; category_title: string; color: string; accent: string; icon: string;
  tier: string; tier_label: string; full_name: string; pen_name: string | null; city: string | null; bio: string | null; genres: string[]; avatar_url: string | null;
  status: "pending" | "active" | "suspended" | "expired" | "rejected"; member_no: string | null; issued_at: string | null; valid_until: string | null; renewals: number;
  renewal_requested_at: string | null; suspended_reason: "inactive" | "admin" | null; suspended_at: string | null; press_org: string | null; press_role: string | null;
  created_at: string; card_url: string | null; last_activity_at: string | null;
  phone?: string; email?: string; birth_year?: number | null; publications?: string | null; press_card_no?: string | null; press_years?: number | null;
  works?: Work[]; pledge_signature?: string; pledge_at?: string; admin_note?: string | null; account_name?: string;
};
export type Work = { type: "diwan" | "external"; text_id?: number; title: string; form?: string; doc_no?: string; kind?: string; where?: string | null; year?: number | null; link?: string | null; excerpt?: string | null };
export type MembershipMe = {
  member: Member | null; badges: Badge[]; awards: Award[]; stats: { texts: number; likes: number; poetry: number; story: number; prose: number };
  my_texts: { id: number; title: string; form: string; doc_no: string; status: string }[]; invites: { sent: number; joined: number }; days_left: number | null; can_admin: boolean;
};

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as any)?.error || `خطأ (${res.status})`);
  return j as T;
}
const json = (b: unknown) => ({ body: JSON.stringify(b) });

export const membersApi = {
  meta: () => call<{ categories: MemberCategory[]; badges: Badge[]; rules: { inactive_days: number; works_required: number; validity_months: number } }>(`/lit/membership/meta`),
  me: (t: string) => call<MembershipMe>(`/lit/membership/me`, t),
  apply: (t: string, b: Record<string, unknown>) => call<{ member: Member; message: string }>(`/lit/membership/apply`, t, { method: "POST", ...json(b) }),
  renew: (t: string) => call<{ ok: true; message: string }>(`/lit/membership/renew`, t, { method: "POST" }),
  logInvite: (t: string, audience: string, channel: string) => call<{ ok: true; link: string }>(`/lit/membership/invite-log`, t, { method: "POST", ...json({ audience, channel }) }),
  publicMember: (uid: number) => call<{ member: Member; badges: Badge[]; awards: Award[] }>(`/lit/members/${uid}/public`),
  list: (t: string, status: string) => call<{ members: Member[]; counts: Record<string, number> }>(`/lit/members?status=${status}`, t),
  action: (t: string, id: number, action: string, extra: Record<string, unknown> = {}) => call<{ member: Member }>(`/lit/members/${id}/action`, t, { method: "POST", ...json({ action, ...extra }) }),
  award: (t: string, userId: number, b: { title: string; description?: string; icon?: string; color?: string }) => call<{ ok: true }>(`/lit/members/${userId}/award`, t, { method: "POST", ...json(b) }),
};

export const MEMBER_STATUS: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "قيد المراجعة", color: "#B7791F", icon: "time" },
  active: { label: "عضوية سارية", color: "#0E8A5F", icon: "checkmark-circle" },
  suspended: { label: "معلّقة", color: "#C2580A", icon: "pause-circle" },
  expired: { label: "منتهية", color: "#7A8794", icon: "hourglass" },
  rejected: { label: "غير معتمدة", color: "#C0392B", icon: "close-circle" },
};
export function shade(hex: string, amt = -40): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `#${((1 << 24) | (c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1)}`;
}
