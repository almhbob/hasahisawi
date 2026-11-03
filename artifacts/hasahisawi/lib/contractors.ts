// شركات المقاولات — الأنواع وواجهة الخادم
import { getApiUrl } from "@/lib/query-client";

export const CON = "#B45309";       // برتقالي الخوذة
export const CON_DEEP = "#1F2937";  // رمادي الخرسانة
export const CON_SOFT = "#FFF7ED";

export type Specialty = { key: string; label: string; icon: string; count?: number };
export type Perm = "settings" | "staff" | "projects" | "quotes" | "contracts" | "jobs";
export type Company = {
  id: number; name: string; tagline: string | null; description: string; specialties: string[]; specialty_labels: string[]; service_areas: string[];
  logo_url: string | null; cover_url: string | null; phone: string | null; whatsapp: string | null; email: string | null; address: string | null; city: string | null;
  license_no: string | null; founded_year: number | null; team_size: number | null; working_hours: string | null; accepts_quotes: boolean;
  status: "pending" | "active" | "suspended" | "rejected"; admin_note: string | null; created_at: string;
  rating: number | null; reviews_count: number; projects_count: number; completed_count: number;
  owner_name?: string; owner_phone?: string; owner_id?: number;
};
export type Project = {
  id: number; contractor_id: number; title: string; specialty: string | null; location: string | null; description: string | null;
  before_images: string[]; after_images: string[]; gallery: string[]; completed_on: string | null; duration_days: number | null; client_label: string | null; featured: boolean; created_at: string;
};
export type Review = { id: number; user_name: string; avatar_url: string | null; rating: number; quality: number | null; punctuality: number | null; price_value: number | null; comment: string | null; reply: string | null; created_at: string };
export type Job = {
  id: number; contractor_id: number; kind: string; kind_label: string; title: string; trade: string | null; workers_needed: number; wage: number | null; wage_unit: string; wage_unit_label: string;
  duration: string | null; location: string | null; start_date: string | null; description: string | null; requirements: string | null; status: "open" | "closed"; created_at: string;
  company_name?: string; logo_url?: string | null; applicants?: number; new_applicants?: number;
};
export type Quote = {
  id: number; contractor_id: number; client_id: number | null; client_name: string; client_phone: string; specialty: string | null; title: string; details: string | null; location: string | null;
  budget: string | null; preferred_start: string | null; images: string[]; status: string; status_label: string; quote_amount: number | null; quote_note: string | null; quote_valid_until: string | null;
  internal_note?: string | null; assigned_to?: number | null; assigned_name?: string | null; client_avatar?: string | null; created_at: string; updated_at: string;
  company_name?: string; logo_url?: string | null; company_phone?: string | null; company_whatsapp?: string | null; reviewed?: boolean;
  contract?: { id: number; contract_no: string; status: string; price: number } | null;
};
export type PayStep = { label: string; percent?: number | null; amount?: number | null };
export type Contract = {
  id: number; contract_no: string; contractor_id: number; quote_id: number | null; client_id: number | null; client_name: string; client_phone: string | null; client_id_no: string | null;
  title: string; scope: string; location: string | null; price: number; currency: string; payment_schedule: PayStep[]; start_date: string | null; duration_days: number | null;
  warranty_months: number | null; terms: string[]; status: "draft" | "sent" | "accepted" | "declined" | "completed" | "cancelled"; client_response_note: string | null;
  accepted_at: string | null; created_at: string; company_name?: string;
};
export type Application = { id: number; job_id: number; user_id: number | null; name: string; phone: string; experience: string | null; note: string | null; status: string; created_at: string; avatar_url?: string | null };
export type StaffMember = { contractor_id: number; user_id: number; role: string; role_label: string; title: string | null; name: string; avatar_url: string | null; phone: string | null; perms: Perm[] };
export type Meta = {
  specialties: Specialty[]; roles: Record<string, string>; role_perms: Record<string, Perm[]>; quote_labels: Record<string, string>; job_kinds: Record<string, string>; wage_units: Record<string, string>;
  totals: { companies: number; projects: number; jobs: number };
  me: { signed_in: boolean; is_admin?: boolean; company?: { id: number; name: string; status: string; role: string; perms: Perm[] } | null };
};
export type PortalMe = { company: Company | null; role?: string; role_label?: string; perms?: Perm[]; counts?: { new_quotes: number; active_jobs: number; pending_contracts: number; new_applicants: number } };

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as any)?.error || `خطأ (${res.status})`);
  return j as T;
}
const json = (b: unknown) => ({ body: JSON.stringify(b) });
const qs = (o: Record<string, unknown>) => { const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`); return p.length ? `?${p.join("&")}` : ""; };

export const conApi = {
  meta: (t?: string | null) => call<Meta>(`/contractors/meta`, t),
  list: (f: { specialty?: string; q?: string; sort?: string }) => call<{ companies: Company[] }>(`/contractors${qs(f)}`),
  allJobs: () => call<{ jobs: Job[] }>(`/contractors/jobs`),
  company: (id: number, t?: string | null) => call<{ company: Company; projects: Project[]; team: { role: string; role_label: string; title: string | null; name: string; avatar_url: string | null }[]; reviews: Review[]; jobs: Job[]; is_staff: boolean }>(`/contractors/${id}`, t),
  register: (t: string, b: Record<string, unknown>) => call<{ company: Company; message: string }>(`/contractors/register`, t, { method: "POST", ...json(b) }),
  requestQuote: (t: string, id: number, b: Record<string, unknown>) => call<{ quote: Quote; message: string }>(`/contractors/${id}/quotes`, t, { method: "POST", ...json(b) }),
  myQuotes: (t: string) => call<{ quotes: Quote[] }>(`/contractors/my/quotes`, t),
  quoteAction: (t: string, qid: number, action: "accept" | "decline" | "cancel") => call<{ ok: true; status: string }>(`/contractors/quotes/${qid}/client`, t, { method: "POST", ...json({ action }) }),
  review: (t: string, qid: number, b: Record<string, unknown>) => call<{ ok: true }>(`/contractors/quotes/${qid}/review`, t, { method: "POST", ...json(b) }),
  myContracts: (t: string) => call<{ contracts: Contract[] }>(`/contractors/my/contracts`, t),
  contract: (t: string, kid: number) => call<{ contract: Contract; text: string; company: Company; is_client: boolean }>(`/contractors/contracts/${kid}`, t),
  respondContract: (t: string, kid: number, action: "accept" | "decline", note?: string) => call<{ ok: true; status: string }>(`/contractors/contracts/${kid}/respond`, t, { method: "POST", ...json({ action, note }) }),
  applyJob: (t: string, jid: number, b: Record<string, unknown>) => call<{ ok: true; message: string }>(`/contractors/jobs/${jid}/apply`, t, { method: "POST", ...json(b) }),

  portal: (t: string) => call<PortalMe>(`/contractor-portal/me`, t),
  saveCompany: (t: string, b: Record<string, unknown>) => call<{ company: Company }>(`/contractor-portal/company`, t, { method: "PUT", ...json(b) }),
  projects: (t: string) => call<{ projects: Project[] }>(`/contractor-portal/projects`, t),
  saveProject: (t: string, b: Record<string, unknown>, id?: number) => call<{ project: Project }>(id ? `/contractor-portal/projects/${id}` : `/contractor-portal/projects`, t, { method: id ? "PUT" : "POST", ...json(b) }),
  deleteProject: (t: string, id: number) => call<{ ok: true }>(`/contractor-portal/projects/${id}`, t, { method: "DELETE" }),
  quotes: (t: string, status?: string) => call<{ quotes: Quote[]; counts: Record<string, number> }>(`/contractor-portal/quotes${qs({ status })}`, t),
  updateQuote: (t: string, id: number, b: Record<string, unknown>) => call<{ quote: Quote }>(`/contractor-portal/quotes/${id}`, t, { method: "PATCH", ...json(b) }),
  contracts: (t: string) => call<{ contracts: Contract[] }>(`/contractor-portal/contracts`, t),
  createContract: (t: string, b: Record<string, unknown>) => call<{ contract: Contract; text: string }>(`/contractor-portal/contracts`, t, { method: "POST", ...json(b) }),
  contractAction: (t: string, id: number, action: "send" | "complete" | "cancel") => call<{ ok: true; status: string }>(`/contractor-portal/contracts/${id}`, t, { method: "PATCH", ...json({ action }) }),
  jobs: (t: string) => call<{ jobs: Job[] }>(`/contractor-portal/jobs`, t),
  createJob: (t: string, b: Record<string, unknown>) => call<{ job: Job }>(`/contractor-portal/jobs`, t, { method: "POST", ...json(b) }),
  setJobStatus: (t: string, id: number, status: "open" | "closed") => call<{ ok: true }>(`/contractor-portal/jobs/${id}`, t, { method: "PATCH", ...json({ status }) }),
  applications: (t: string, jid: number) => call<{ applications: Application[] }>(`/contractor-portal/jobs/${jid}/applications`, t),
  setApplication: (t: string, aid: number, status: "accepted" | "rejected" | "contacted") => call<{ ok: true }>(`/contractor-portal/applications/${aid}`, t, { method: "PATCH", ...json({ status }) }),
  staff: (t: string) => call<{ staff: StaffMember[]; roles: Record<string, string>; role_perms: Record<string, Perm[]> }>(`/contractor-portal/staff`, t),
  lookup: (t: string, q: string) => call<{ users: { id: number; name: string; avatar_url: string | null }[] }>(`/contractor-portal/users/lookup${qs({ q })}`, t),
  setStaff: (t: string, uid: number, role: string, title?: string) => call<{ ok: true }>(`/contractor-portal/staff/${uid}`, t, { method: "PUT", ...json({ role, title }) }),
  removeStaff: (t: string, uid: number) => call<{ ok: true }>(`/contractor-portal/staff/${uid}`, t, { method: "DELETE" }),

  adminList: (t: string, status?: string) => call<{ companies: Company[]; counts: Record<string, number> }>(`/admin/contractors${qs({ status })}`, t),
  adminSet: (t: string, id: number, status: string, note?: string) => call<{ company: Company }>(`/admin/contractors/${id}`, t, { method: "PATCH", ...json({ status, note }) }),
};

export const PERM_LABEL: Record<Perm, string> = { settings: "إعدادات الشركة", staff: "الطاقم", projects: "المشاريع", quotes: "طلبات الأسعار", contracts: "العقود", jobs: "التوظيف" };
export const QUOTE_COLOR: Record<string, string> = {
  new: "#2563EB", reviewing: "#B7791F", quoted: "#7C3AED", accepted: "#0E8A5F", rejected: "#B42318", in_progress: CON, completed: "#0E8A5F", cancelled: "#6B7280",
};
export const CONTRACT_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "#6B7280" }, sent: { label: "بانتظار موافقة العميل", color: "#B7791F" }, accepted: { label: "موقّع من العميل", color: "#0E8A5F" },
  declined: { label: "اعتذر العميل", color: "#B42318" }, completed: { label: "منجز", color: "#0E8A5F" }, cancelled: { label: "ملغي", color: "#6B7280" },
};
export const money = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toLocaleString("en-US")} ج.س`);
export const fmtD = (s?: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("ar-EG", { dateStyle: "medium" }); } catch { return ""; } };
