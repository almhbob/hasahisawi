// الملف الشخصي الاحترافي — واجهة الخادم
import { getApiUrl } from "./query-client";

export type Cert = {
  id: number; kind: CertKind; title: string; issuer: string | null; issued_on: string | null;
  credential_id: string | null; credential_url: string | null; file_url: string | null; file_type: "pdf" | "image" | null;
  is_public: boolean; reviewed?: boolean; created_at?: string;
};
export type CertKind = "degree" | "course" | "license" | "award" | "experience" | "other";
export type SkillItem = { name: string; count: number; mine: boolean };

export type FullProfile = {
  id: number; name: string; role: string; avatar_url: string | null; created_at: string;
  bio: string | null; neighborhood: string | null; headline: string | null; profession: string | null;
  skills: SkillItem[]; social_links: Partial<Record<SocialKey, string>>;
  open_to_work: boolean; show_certs: boolean; is_verified: boolean; verified_label: string | null; verified_at: string | null;
  cover_theme: string | null; online: boolean; last_seen_at: string | null;
  certificates: Cert[]; posts_count: number; reports_count: number; endorsers_count: number;
  views_30d?: number; verification?: { status: "pending" | "approved" | "rejected"; admin_note: string | null; created_at: string } | null;
  completeness?: { percent: number; missing: string[] };
  locked?: boolean; profile_locked?: boolean;
  admin_contact?: { phone: string | null; email: string | null; neighborhood: string | null };
};

export type SocialKey = "whatsapp" | "facebook" | "instagram" | "x" | "tiktok" | "linkedin" | "youtube" | "telegram" | "snapchat" | "github" | "website";

export const SOCIALS: { key: SocialKey; label: string; icon: string; color: string; hint: string }[] = [
  { key: "whatsapp", label: "واتساب", icon: "logo-whatsapp", color: "#25D366", hint: "رقم الهاتف" },
  { key: "facebook", label: "فيسبوك", icon: "logo-facebook", color: "#1877F2", hint: "اسم المستخدم أو الرابط" },
  { key: "instagram", label: "إنستغرام", icon: "logo-instagram", color: "#E1306C", hint: "@اسم_المستخدم" },
  { key: "x", label: "X (تويتر)", icon: "logo-twitter", color: "#111111", hint: "@اسم_المستخدم" },
  { key: "tiktok", label: "تيك توك", icon: "logo-tiktok", color: "#111111", hint: "@اسم_المستخدم" },
  { key: "linkedin", label: "لينكدإن", icon: "logo-linkedin", color: "#0A66C2", hint: "اسم الملف أو الرابط" },
  { key: "youtube", label: "يوتيوب", icon: "logo-youtube", color: "#FF0000", hint: "@القناة أو الرابط" },
  { key: "telegram", label: "تيليجرام", icon: "paper-plane", color: "#229ED9", hint: "اسم المستخدم" },
  { key: "snapchat", label: "سناب شات", icon: "logo-snapchat", color: "#E8C800", hint: "اسم المستخدم" },
  { key: "github", label: "GitHub", icon: "logo-github", color: "#24292F", hint: "اسم المستخدم" },
  { key: "website", label: "موقع إلكتروني", icon: "globe-outline", color: "#00966A", hint: "example.com" },
];

export const CERT_KINDS: { key: CertKind; label: string; icon: string; color: string }[] = [
  { key: "degree", label: "مؤهل علمي", icon: "school", color: "#2A6FA8" },
  { key: "course", label: "دورة تدريبية", icon: "ribbon", color: "#00966A" },
  { key: "license", label: "رخصة مهنية", icon: "id-card", color: "#7C4DFF" },
  { key: "award", label: "جائزة / تكريم", icon: "trophy", color: "#C98A00" },
  { key: "experience", label: "خبرة عملية", icon: "briefcase", color: "#B4532F" },
  { key: "other", label: "أخرى", icon: "document-text", color: "#5B6B66" },
];

async function api(path: string, token: string | null | undefined, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${getApiUrl().replace(/\/$/, "")}/api${path}`, {
    method: init.method || "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const profileApi = {
  full: (id: number, token?: string | null) => api(`/profile/${id}/full`, token) as Promise<FullProfile>,
  update: (token: string, patch: Partial<{ headline: string; profession: string; bio: string; neighborhood: string; skills: string[]; social_links: Record<string, string>; open_to_work: boolean; show_certs: boolean; profile_locked: boolean }>) =>
    api(`/profile/me`, token, { method: "PATCH", body: patch }) as Promise<FullProfile>,
  addCert: (token: string, c: Partial<Cert>) => api(`/profile/me/certificates`, token, { method: "POST", body: c }) as Promise<Cert>,
  editCert: (token: string, id: number, c: Partial<Cert>) => api(`/profile/me/certificates/${id}`, token, { method: "PATCH", body: c }) as Promise<Cert>,
  delCert: (token: string, id: number) => api(`/profile/me/certificates/${id}`, token, { method: "DELETE" }),
  endorse: (token: string, id: number, skill: string) => api(`/profile/${id}/endorse`, token, { method: "POST", body: { skill } }) as Promise<{ endorsed: boolean; count: number }>,
  visitors: (token: string) => api(`/profile/me/visitors`, token) as Promise<{ visitors: { id: number; name: string; avatar_url: string | null; headline: string | null; is_verified: boolean; viewed_at: string }[] }>,
  requestVerification: (token: string, body: { doc_url: string; kind: string; note?: string }) => api(`/profile/me/verification`, token, { method: "POST", body }),
  activeNow: (token?: string | null) => api(`/social/active-now`, token) as Promise<{ users: ActiveUser[]; total: number }>,
  adminRequests: (token: string, status = "pending") => api(`/admin/verification-requests?status=${status}`, token) as Promise<{ requests: any[] }>,
  adminReview: (token: string, id: number, status: "approved" | "rejected", admin_note?: string) => api(`/admin/verification-requests/${id}`, token, { method: "PATCH", body: { status, admin_note } }),
  adminVerify: (token: string, userId: number, verified: boolean, label?: string) => api(`/admin/users/${userId}/verify`, token, { method: "POST", body: { verified, label } }),
};

export type ActiveUser = { id: number; name: string; avatar_url: string | null; headline: string | null; profession: string | null; is_verified: boolean; last_seen_at: string };

export const publicCvUrl = (id: number) => `${getApiUrl().replace(/\/$/, "")}/api/public/cv/${id}`;
