// واجهة قسم «المبادرات والمنظمات»: المنظمات، فعالياتها، حملات التبرع، والمسؤولون.
// كل البيانات من الخادم — لا بيانات تجريبية هنا.
import { Linking, Platform } from "react-native";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

export type OrgType = "charity" | "initiative" | "cooperative" | "volunteer";

export type Organization = {
  id: string;
  name: string;
  type: OrgType;
  description: string;
  fullDescription: string;
  contact: string;
  email?: string | null;
  members: number;
  founded: string;
  goals: string[];
  needs: string[];
  isVerified: boolean;
};

export type OrgEvent = {
  id: number;
  orgId: number;
  orgName: string;
  orgType: OrgType;
  orgPhone: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  status: "published" | "cancelled";
};

export type OrgCampaign = {
  id: number;
  orgId: number;
  orgName: string;
  orgType: OrgType;
  orgPhone: string;
  title: string;
  description: string;
  goal: number | null;
  raised: number;
  currency: string;
  endsAt: string | null;
  paymentInfo: string;
  status: "active" | "closed";
};

export type OrgStats = { total: number; by_type: Partial<Record<OrgType, number>>; members: number; events: number; campaigns: number };
export type ManagedOrg = { id: number; name: string; type: OrgType; is_verified: boolean };
export type OrgManager = { user_id: number; name: string; phone: string | null; role: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapOrg(row: any): Organization {
  return {
    id: String(row.id),
    name: row.name,
    type: (row.type || "initiative") as OrgType,
    description: row.description || "",
    fullDescription: row.full_description || "",
    contact: row.contact_phone || "",
    email: row.email,
    members: Number(row.members_count) || 0,
    founded: row.founded_year || "",
    goals: row.goals || [],
    needs: row.needs || [],
    isVerified: !!row.is_verified,
  };
}
export function mapEvent(r: any): OrgEvent {
  return {
    id: r.id, orgId: r.org_id, orgName: r.org_name || "", orgType: r.org_type, orgPhone: r.org_phone || "",
    title: r.title, description: r.description || "", startsAt: r.starts_at, endsAt: r.ends_at,
    location: r.location || "", status: r.status,
  };
}
export function mapCampaign(r: any): OrgCampaign {
  return {
    id: r.id, orgId: r.org_id, orgName: r.org_name || "", orgType: r.org_type, orgPhone: r.org_phone || "",
    title: r.title, description: r.description || "",
    goal: r.goal_amount == null ? null : Number(r.goal_amount), raised: Number(r.raised_amount) || 0,
    currency: r.currency || "SDG", endsAt: r.ends_at, paymentInfo: r.payment_info || "", status: r.status,
  };
}

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithTimeout(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "تعذّر إتمام الطلب");
  return data as T;
}

export const orgsApi = {
  list: async (params: { type?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params.type && params.type !== "all") q.set("type", params.type);
    if (params.search) q.set("search", params.search);
    const d = await call<{ organizations: any[] }>(`/organizations?${q}`);
    return (d.organizations || []).map(mapOrg);
  },
  stats: () => call<OrgStats>("/organizations/stats"),
  managed: (token: string | null) =>
    token ? call<{ organizations: ManagedOrg[]; is_admin?: boolean }>("/organizations/managed", token) : Promise.resolve({ organizations: [] as ManagedOrg[], is_admin: false }),
  detail: async (id: string, token: string | null) => {
    const d = await call<{ organization: any; events: any[]; campaigns: any[]; can_manage: boolean; is_admin: boolean }>(`/organizations/${encodeURIComponent(id)}`, token);
    return { org: mapOrg(d.organization), events: d.events.map(mapEvent), campaigns: d.campaigns.map(mapCampaign), canManage: d.can_manage, isAdmin: d.is_admin };
  },
  events: async () => (await call<{ events: any[] }>("/org-events")).events.map(mapEvent),
  campaigns: async () => (await call<{ campaigns: any[] }>("/org-campaigns")).campaigns.map(mapCampaign),
  createEvent: (orgId: string, body: Record<string, unknown>, token: string | null) =>
    call(`/organizations/${orgId}/events`, token, { method: "POST", body: JSON.stringify(body) }),
  updateEvent: (id: number, body: Record<string, unknown>, token: string | null) =>
    call(`/org-events/${id}`, token, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEvent: (id: number, token: string | null) => call(`/org-events/${id}`, token, { method: "DELETE" }),
  createCampaign: (orgId: string, body: Record<string, unknown>, token: string | null) =>
    call(`/organizations/${orgId}/campaigns`, token, { method: "POST", body: JSON.stringify(body) }),
  updateCampaign: (id: number, body: Record<string, unknown>, token: string | null) =>
    call(`/org-campaigns/${id}`, token, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCampaign: (id: number, token: string | null) => call(`/org-campaigns/${id}`, token, { method: "DELETE" }),
  managers: async (orgId: string, token: string | null) =>
    (await call<{ managers: OrgManager[] }>(`/admin/organizations/${orgId}/managers`, token)).managers,
  addManager: (orgId: string, user: string, token: string | null) =>
    call<{ manager: OrgManager }>(`/admin/organizations/${orgId}/managers`, token, { method: "POST", body: JSON.stringify({ user }) }),
  removeManager: (orgId: string, userId: number, token: string | null) =>
    call(`/admin/organizations/${orgId}/managers/${userId}`, token, { method: "DELETE" }),
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── تنسيق ─────────────────────────────────────────────
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const arNum = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);

export function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch { return d.toISOString().slice(0, 10); }
}
export function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try { return d.toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}
export function formatAmount(n: number, currency = "SDG"): string {
  const label = currency === "SDG" ? "جنيه" : currency;
  try { return `${Math.round(n).toLocaleString("ar-EG")} ${label}`; } catch { return `${Math.round(n)} ${label}`; }
}

export function openWhatsApp(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  Linking.openURL(`https://wa.me/${digits}${q}`).catch(() => {});
}
export function callPhone(phone: string) {
  if (!phone) return;
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => {});
}
export const isWeb = Platform.OS === "web";
