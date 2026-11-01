// مساحة جمعية الهلال الأحمر السوداني — واجهة الخادم + الربط مع تطبيق «مسعف»
import { Linking, Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

export type SrcsRole = "volunteer" | "paramedic" | "leader" | "admin";
export type SrcsMember = {
  id: number; user_id: number; role: SrcsRole; desired_role: SrcsRole | null; status: "pending" | "active" | "suspended" | "rejected";
  unit: string | null; phone: string | null; blood_type: string | null; experience: string | null; certifications: string | null;
  musif_code: string | null; card_no: string | null; card_issued_at: string | null; card_expires_at: string | null;
  admin_note: string | null; created_at: string; role_label?: string; card_url?: string | null;
  name?: string; avatar_url?: string | null; account_phone?: string | null;
};
export type SrcsAnnouncement = { id: number; title: string; body: string; audience: string; pinned: boolean; created_at: string };
export type SrcsActivity = { id: number; title: string; type: string; description: string | null; place: string | null; happened_at: string; images: string[]; beneficiaries: number; published: boolean; points: number; volunteers?: number };
export type SrcsMeeting = { id: number; title: string; agenda: string | null; place: string | null; starts_at: string; audience: string; minutes?: string | null; my_rsvp?: string | null; going?: number; attended?: number };
export type SrcsOverview = {
  stats: { members: number; paramedics: number; activities: number; beneficiaries: number };
  announcements: SrcsAnnouncement[]; activities: SrcsActivity[]; meetings: SrcsMeeting[];
  membership: SrcsMember | null; isAdmin: boolean;
};

export const ROLE_LABEL: Record<SrcsRole, string> = { volunteer: "متطوع", paramedic: "مسعف", leader: "قائد فريق", admin: "إدارة الفرع" };
export const ACTIVITY_TYPES: Record<string, { label: string; icon: string }> = {
  training: { label: "تدريب", icon: "school" }, campaign: { label: "حملة", icon: "megaphone" }, response: { label: "استجابة طوارئ", icon: "pulse" },
  awareness: { label: "توعية", icon: "bulb" }, blood: { label: "تبرع بالدم", icon: "water" }, relief: { label: "إغاثة", icon: "cube" }, other: { label: "نشاط", icon: "ellipse" },
};
export const AUDIENCE_LABEL: Record<string, string> = { public: "للجميع", members: "الأعضاء", paramedics: "المسعفون", admins: "الإدارة" };
export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
// لون الهوية: أحمر داكن هادئ (لا نرسم شارة الهلال الأحمر — استخدامها مقيّد قانوناً وبإذن الجمعية)
export const SRCS_RED = "#B91C1C";
export const SRCS_RED_DEEP = "#7F1D1D";

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((j as any)?.error || `خطأ (${res.status})`), { status: res.status });
  return j as T;
}
const body = (b: unknown) => ({ body: JSON.stringify(b) });

export const srcsApi = {
  overview: (token?: string | null) => call<SrcsOverview>(`/srcs/overview`, token),
  join: (token: string, b: Partial<SrcsMember> & { desired_role: SrcsRole }) => call<{ membership: SrcsMember }>(`/srcs/join`, token, { method: "POST", ...body(b) }),
  updateMe: (token: string, b: Partial<Pick<SrcsMember, "musif_code" | "blood_type" | "phone">>) => call<{ membership: SrcsMember }>(`/srcs/me`, token, { method: "PATCH", ...body(b) }),
  rsvp: (token: string, id: number, status: "going" | "not_going" | "maybe") => call(`/srcs/meetings/${id}/rsvp`, token, { method: "POST", ...body({ status }) }),
  admin: {
    dashboard: (t: string) => call<Record<string, number>>(`/srcs/admin/dashboard`, t),
    members: (t: string, status?: string) => call<{ members: SrcsMember[] }>(`/srcs/admin/members${status ? `?status=${status}` : ""}`, t),
    updateMember: (t: string, id: number, b: Record<string, unknown>) => call<{ member: SrcsMember }>(`/srcs/admin/members/${id}`, t, { method: "PATCH", ...body(b) }),
    meetings: (t: string) => call<{ meetings: SrcsMeeting[] }>(`/srcs/admin/meetings`, t),
    createMeeting: (t: string, b: Record<string, unknown>) => call<{ meeting: SrcsMeeting }>(`/srcs/admin/meetings`, t, { method: "POST", ...body(b) }),
    updateMeeting: (t: string, id: number, b: Record<string, unknown>) => call(`/srcs/admin/meetings/${id}`, t, { method: "PATCH", ...body(b) }),
    deleteMeeting: (t: string, id: number) => call(`/srcs/admin/meetings/${id}`, t, { method: "DELETE" }),
    rsvps: (t: string, id: number) => call<{ rsvps: { user_id: number; name: string; role: SrcsRole; status: string | null; attended: boolean }[] }>(`/srcs/admin/meetings/${id}/rsvps`, t),
    createAnnouncement: (t: string, b: Record<string, unknown>) => call(`/srcs/admin/announcements`, t, { method: "POST", ...body(b) }),
    deleteAnnouncement: (t: string, id: number) => call(`/srcs/admin/announcements/${id}`, t, { method: "DELETE" }),
    createActivity: (t: string, b: Record<string, unknown>) => call<{ activity: SrcsActivity }>(`/srcs/admin/activities`, t, { method: "POST", ...body(b) }),
    updateActivity: (t: string, id: number, b: Record<string, unknown>) => call(`/srcs/admin/activities/${id}`, t, { method: "PATCH", ...body(b) }),
    deleteActivity: (t: string, id: number) => call(`/srcs/admin/activities/${id}`, t, { method: "DELETE" }),
    participants: (t: string, id: number, user_ids: number[]) => call<{ participants: number; awarded: number }>(`/srcs/admin/activities/${id}/participants`, t, { method: "POST", ...body({ user_ids }) }),
  },
};

// ── التكامل مع تطبيق «مسعف» (com.almhbob.musif · musif://) ──────────
// حصاحيصاوي: المجتمع والتنظيم (العضوية، الاجتماعات، الإعلانات، الأنشطة)
// مسعف: العمل الميداني (نداء الاستغاثة، استقبال البلاغات، الموقع اللحظي)
export const MUSIF_PLAY = "https://play.google.com/store/apps/details?id=com.almhbob.musif";
export const musifVerifyUrl = (code: string) => `https://musif.app/v/${encodeURIComponent(code)}`;

/** يفتح شاشة في تطبيق مسعف إن كان مثبتاً، وإلا صفحته على Google Play */
export async function openMusif(path: "sos" | "responder" | "signup" | "first-aid" | "" = "", params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, from: "hasahisawi" }).toString();
  const deep = `musif://${path}${qs ? `?${qs}` : ""}`;
  if (Platform.OS !== "web") {
    try { await Linking.openURL(deep); return; } catch { /* غير مثبّت */ }
  }
  await Linking.openURL(MUSIF_PLAY).catch(() => {});
}
