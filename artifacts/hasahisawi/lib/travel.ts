// قسم السفريات: هوية بصرية واحدة (أزرق محيطي + رملي دافئ)، الأنواع، وواجهة الخادم لعروض الوكالات.
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

// ─── الهوية البصرية ─────────────────────────────────────────────
export const TRV = "#0B5F73";        // أزرق محيطي (نص أبيض فوقه 7:1)
export const TRV_DEEP = "#073B4C";   // أعمق للرؤوس
export const TRV_SOFT = Colors.isDark ? "rgba(11,95,115,0.22)" : "#E6F2F4";
export const SAND = "#E9C46A";       // رملي دافئ (يُكتب فوقه نص داكن)
export const SAND_INK = "#4A3500";   // نص فوق الرملي (≥ 7:1)
export const SAND_SOFT = Colors.isDark ? "rgba(233,196,106,0.16)" : "#FBF3E0";
export const TRV_GRADIENT = [TRV_DEEP, TRV] as const;

// ─── أنواع العروض ───────────────────────────────────────────────
export type OfferKind = "umrah" | "hajj" | "flight" | "bus" | "tour" | "hotel" | "visa" | "package";
export const OFFER_KINDS: { key: OfferKind; label: string; icon: string; color: string }[] = [
  { key: "umrah", label: "عمرة", icon: "mosque", color: "#0F766E" },
  { key: "hajj", label: "حج", icon: "star-crescent", color: "#8A6100" },
  { key: "flight", label: "طيران", icon: "airplane", color: "#1D5FA8" },
  { key: "tour", label: "رحلات سياحية", icon: "image-filter-hdr", color: "#2F7D32" },
  { key: "package", label: "باقات شاملة", icon: "bag-suitcase", color: "#7C3AED" },
  { key: "hotel", label: "فنادق", icon: "bed", color: "#B45309" },
  { key: "visa", label: "تأشيرات", icon: "passport", color: "#9F1239" },
  { key: "bus", label: "سفر بري", icon: "bus", color: "#0B5F73" },
];
export const kindInfo = (k: string) => OFFER_KINDS.find((x) => x.key === k) ?? OFFER_KINDS[0];

export const CURRENCIES: { key: string; label: string }[] = [
  { key: "SDG", label: "ج.س" }, { key: "USD", label: "$" }, { key: "SAR", label: "ر.س" }, { key: "EGP", label: "ج.م" }, { key: "AED", label: "د.إ" },
];
export const INCLUDE_SUGGESTIONS = ["تذكرة طيران", "تأشيرة", "سكن فندقي", "وجبة الإفطار", "مواصلات داخلية", "مرشد", "تأمين سفر", "مزارات", "حقيبة سفر"];

export type RequestStatus = "new" | "contacted" | "confirmed" | "cancelled";
export const REQUEST_STATUS: Record<RequestStatus, { label: string; color: string; icon: string }> = {
  new: { label: "جديد", color: "#1D5FA8", icon: "sparkles-outline" },
  contacted: { label: "تم التواصل", color: "#8A6100", icon: "call-outline" },
  confirmed: { label: "مؤكد", color: "#15803D", icon: "checkmark-circle-outline" },
  cancelled: { label: "ملغي", color: "#B42318", icon: "close-circle-outline" },
};

export type Offer = {
  id: number; agency_id: number; kind: OfferKind; kind_label: string; title: string;
  from_city: string | null; destination: string | null; country: string | null;
  depart_date: string | null; return_date: string | null; duration_days: number | null;
  price: number | null; currency: string; price_note: string | null; seats: number | null; seats_left: number | null;
  includes: string[]; images: string[]; description: string | null; status: "active" | "paused" | "expired";
  is_featured: boolean; is_past: boolean; created_at: string;
  agency_name: string; agency_logo: string | null; agency_type: string; agency_city: string | null;
  agency_phone?: string | null; agency_whatsapp?: string | null; agency_description?: string | null; agency_license?: string | null;
  requests_count?: number; new_requests?: number; views?: number;
};
export type Agency = {
  id: number; name: string; name_en?: string | null; agency_type: string; specialties: string[]; destinations: string[];
  services_offered: string[]; booking_products?: string[]; description: string | null; logo_url: string | null; cover_url: string | null;
  website: string | null; phone: string | null; whatsapp: string | null; email: string | null; city: string | null; country: string | null;
  address: string | null; license_number: string | null; founded_year: number | null; is_featured: boolean; offers_count?: number;
};
export type OfferRequest = {
  id: number; offer_id: number; agency_id: number; user_id: number | null; name: string; phone: string; travellers: number;
  notes: string | null; status: RequestStatus; status_label: string; agency_note: string | null; created_at: string; updated_at: string;
  offer_title: string; kind: OfferKind; kind_label?: string; depart_date: string | null; destination?: string | null;
  price?: number | null; currency?: string; image?: string | null; avatar_url?: string | null; seats_left?: number | null;
  agency_name?: string; agency_logo?: string | null; agency_phone?: string | null; agency_whatsapp?: string | null;
};
export type StaffMember = { agency_id: number; user_id: number; role: "owner" | "manager" | "agent"; role_label: string; name: string; avatar_url: string | null; phone: string | null };
export type PortalPerm = "profile" | "offers" | "requests" | "staff";
export type PortalMe = {
  agency: Agency | null; application?: { id: number; agency_name: string; status: string } | null;
  role?: "owner" | "manager" | "agent"; role_label?: string; perms?: PortalPerm[];
  counts?: { active_offers: number; total_offers: number; new_requests: number; confirmed_requests: number; total_requests: number };
};

// ─── تنسيق ──────────────────────────────────────────────────────
export function fmtPrice(o: { price: number | null; currency: string }): string | null {
  if (o.price === null || o.price === undefined) return null;
  const cur = CURRENCIES.find((c) => c.key === o.currency)?.label ?? o.currency;
  return `${Number(o.price).toLocaleString("en-US")} ${cur}`;
}
export function fmtDate(d: string | null | undefined, withYear = false): string {
  if (!d) return "";
  const dt = new Date(`${d}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("ar-EG", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
}
export function routeLabel(o: { from_city: string | null; destination: string | null; country: string | null }): string {
  const to = o.destination || o.country || "";
  return o.from_city && to ? `${o.from_city} ← ${to}` : to || o.from_city || "";
}

// ─── الخادم ─────────────────────────────────────────────────────
async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as any)?.error || `خطأ (${res.status})`);
  return j as T;
}
const body = (b: unknown) => ({ body: JSON.stringify(b) });
const qs = (o: Record<string, unknown>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};

export const travelApi = {
  offers: (f: { kind?: string; q?: string; to?: string; agency_id?: number }) => call<{ offers: Offer[]; counts: Record<string, number> }>(`/travel/offers${qs(f)}`),
  offer: (id: number, t?: string | null) => call<{ offer: Offer; is_staff: boolean; my_request: { id: number; status: RequestStatus; status_label: string } | null; more: Offer[]; me: { name: string; phone: string | null } | null }>(`/travel/offers/${id}`, t),
  agencies: () => call<{ agencies: Agency[] }>(`/travel-agencies`),
  agency: (id: number, t?: string | null) => call<{ agency: Agency; offers: Offer[]; stats: { offers: number; confirmed: number }; is_staff: boolean }>(`/travel-agencies/${id}`, t),
  request: (t: string, id: number, b: { name?: string; phone?: string; travellers: number; notes?: string }) => call<{ request: OfferRequest; message: string }>(`/travel/offers/${id}/request`, t, { method: "POST", ...body(b) }),
  myRequests: (t: string) => call<{ requests: OfferRequest[] }>(`/travel/my-requests`, t),
  cancelMine: (t: string, id: number) => call<{ ok: true }>(`/travel/my-requests/${id}/cancel`, t, { method: "POST" }),

  portal: (t: string) => call<PortalMe>(`/travel-agency-portal/me`, t),
  saveAgency: (t: string, b: Record<string, unknown>) => call<{ agency: Agency }>(`/travel-agency-portal/agency`, t, { method: "PUT", ...body(b) }),
  portalOffers: (t: string) => call<{ offers: Offer[] }>(`/travel-agency-portal/offers`, t),
  saveOffer: (t: string, b: Record<string, unknown>, id?: number) => call<{ ok?: true; message?: string }>(id ? `/travel-agency-portal/offers/${id}` : `/travel-agency-portal/offers`, t, { method: id ? "PUT" : "POST", ...body(b) }),
  offerStatus: (t: string, id: number, status: "active" | "paused" | "expired") => call<{ offer: { id: number; status: string } }>(`/travel-agency-portal/offers/${id}/status`, t, { method: "PATCH", ...body({ status }) }),
  deleteOffer: (t: string, id: number) => call<{ ok: true }>(`/travel-agency-portal/offers/${id}`, t, { method: "DELETE" }),
  portalRequests: (t: string, status?: string) => call<{ requests: OfferRequest[]; counts: Record<string, number> }>(`/travel-agency-portal/requests${qs({ status })}`, t),
  updateRequest: (t: string, id: number, b: { status?: RequestStatus; agency_note?: string }) => call<{ request: OfferRequest }>(`/travel-agency-portal/requests/${id}`, t, { method: "PATCH", ...body(b) }),
  staff: (t: string) => call<{ staff: StaffMember[] }>(`/travel-agency-portal/staff`, t),
  lookup: (t: string, q: string) => call<{ users: { id: number; name: string; avatar_url: string | null }[] }>(`/travel-agency-portal/users/lookup${qs({ q })}`, t),
  setStaff: (t: string, uid: number, role: "manager" | "agent") => call<{ ok: true }>(`/travel-agency-portal/staff/${uid}`, t, { method: "PUT", ...body({ role }) }),
  removeStaff: (t: string, uid: number) => call<{ ok: true }>(`/travel-agency-portal/staff/${uid}`, t, { method: "DELETE" }),
};
