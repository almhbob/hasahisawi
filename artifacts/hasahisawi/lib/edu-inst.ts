// بيئة المؤسسات التعليمية — الأنواع وواجهة الخادم
import { getApiUrl } from "@/lib/query-client";

export const EDU = "#1F4E79";
export const EDU_DEEP = "#123456";
export const EDU_GOLD = "#C99A2E";
export const DAY_AR = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
export const KIND_AR: Record<string, string> = { school: "مدرسة", university: "جامعة", institute: "معهد" };
export const ROLE_AR: Record<string, string> = { owner: "المالك", principal: "المدير", vice: "الوكيل", registrar: "المسجّل", app: "إدارة التطبيق" };
export const PERM_AR: Record<string, string> = {
  staff: "الطاقم", students: "الطلاب", timetable: "الجدول", announcements: "الإعلانات", grades: "الدرجات",
  requests: "طلبات الطلاب", transfers: "النقل", settings: "الإعدادات", admins: "المدراء",
};

export type Settings = {
  days: number[]; periods: number; period_minutes: number; start_time: string; breaks: { after: number; minutes: number; label: string }[];
  academic_year: string; terms: string[]; current_term: string; max_score: number;
};
export type Institution = {
  id: number; name: string; kind: string; stage: string | null; city: string | null; address: string | null; phone: string | null; email: string | null;
  logo_url: string | null; description: string | null; status: string; admin_note?: string | null; settings: Settings; students?: number; teachers?: number; role?: string; staff_id?: number;
};
export type Staff = { id: number; user_id: number | null; name: string; kind: "teacher" | "employee"; title: string | null; subjects: string[]; phone: string | null; max_weekly: number; active: boolean; weekly_load?: number };
export type Klass = { id: number; name: string; level: string | null; section: string | null; room: string | null; homeroom_teacher_id: number | null; students?: number; slots?: number };
export type Subject = { id: number; name: string; color: string };
export type Slot = { id: number; class_id: number; day: number; period: number; subject_id: number; teacher_id: number | null; room: string | null;
  class_name: string; subject_name: string; subject_color: string; teacher_name: string | null };
export type Student = { id: number; user_id: number | null; name: string; student_no: string | null; class_id: number | null; class_name?: string | null; program: string | null;
  guardian_name: string | null; guardian_phone: string | null; status: string };
export type Announcement = { id: number; audience: string; class_id: number | null; title: string; body: string; pinned: boolean; created_at: string };
export type EduRequest = { id: number; kind: string; kind_label?: string; note: string | null; status: string; response: string | null; created_at: string; student_name?: string; student_no?: string; class_name?: string };
export type Transfer = { id: number; transfer_no: string; student_id: number; student_name: string; student_no: string | null; from_ws: number; to_ws: number; from_name: string; to_name: string;
  status: string; status_label: string; reason: string | null; from_note: string | null; to_note: string | null; created_at: string; updated_at: string;
  history: { step: string; at: string; note: string | null }[]; direction?: "incoming" | "outgoing" };
export type Overview = {
  institution: Institution; me: { role: string | null; perms: string[]; staff_id: number | null };
  staff: Staff[]; classes: Klass[]; subjects: Subject[]; admins: { user_id: number; role: string; perms: string[]; name: string; phone: string | null; avatar_url: string | null }[];
  counts: { students: number; pending_requests: number; pending_transfers: number }; roles: string[]; all_perms: string[];
};
export type Portal = {
  student: { id: number; name: string; student_no: string | null; ws_id: number; ws_name: string; class_id: number | null; class_name: string | null; program: string | null; status: string };
  settings: Settings; slots: Slot[]; announcements: Announcement[]; grades: { term: string; score: number | null; max_score: number; note: string | null; subject: string }[];
  attendance: Record<string, number>; requests: EduRequest[]; transfers: Transfer[];
};
export type MyEdu = {
  admin: Institution[]; teaching: Institution[];
  students: { id: number; ws_id: number; ws_name: string; name: string; student_no: string | null; class_id: number | null; class_name: string | null; program: string | null; relation: "self" | "guardian" }[];
};

export class EduError extends Error { code?: string; constructor(m: string, code?: string) { super(m); this.code = code; } }
async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new EduError(j?.error || `خطأ (${res.status})`, j?.code);
  return j as T;
}
const json = (b: unknown) => ({ body: JSON.stringify(b) });
const qs = (o: Record<string, unknown>) => { const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`); return p.length ? `?${p.join("&")}` : ""; };

export const eduApi = {
  list: (q?: string, kind?: string) => call<{ institutions: Institution[] }>(`/edu/institutions${qs({ q, kind })}`),
  get: (id: number, t?: string | null) => call<{ institution: Institution; stats: { students: number; teachers: number; classes: number }; announcements: Announcement[]; me: { role: string | null; perms: string[]; is_admin: boolean; is_teacher: boolean } }>(`/edu/institutions/${id}`, t),
  register: (t: string, b: Record<string, unknown>) => call<{ institution: Institution; message: string }>(`/edu/institutions`, t, { method: "POST", ...json(b) }),
  me: (t: string) => call<MyEdu>(`/edu/me`, t),
  overview: (t: string, id: number) => call<Overview>(`/edu/ws/${id}/overview`, t),
  saveSettings: (t: string, id: number, b: Record<string, unknown>) => call<{ institution: Institution }>(`/edu/ws/${id}/settings`, t, { method: "PUT", ...json(b) }),
  setAdmin: (t: string, id: number, uid: number, role: string, perms?: string[]) => call<{ ok: true }>(`/edu/ws/${id}/admins/${uid}`, t, { method: "PUT", ...json({ role, perms }) }),
  delAdmin: (t: string, id: number, uid: number) => call<{ ok: true }>(`/edu/ws/${id}/admins/${uid}`, t, { method: "DELETE" }),
  lookup: (t: string, q: string) => call<{ users: { id: number; name: string; avatar_url: string | null }[] }>(`/edu/users/lookup${qs({ q })}`, t),
  addStaff: (t: string, id: number, b: Record<string, unknown>) => call<{ ok: true; added: number }>(`/edu/ws/${id}/staff`, t, { method: "POST", ...json(b) }),
  editStaff: (t: string, id: number, sid: number, b: Record<string, unknown>) => call<{ staff: Staff }>(`/edu/ws/${id}/staff/${sid}`, t, { method: "PATCH", ...json(b) }),
  delStaff: (t: string, id: number, sid: number) => call<{ ok: true }>(`/edu/ws/${id}/staff/${sid}`, t, { method: "DELETE" }),
  addClasses: (t: string, id: number, b: Record<string, unknown>) => call<{ ok: true; added: number }>(`/edu/ws/${id}/classes`, t, { method: "POST", ...json(b) }),
  editClass: (t: string, id: number, cid: number, b: Record<string, unknown>) => call<{ class: Klass }>(`/edu/ws/${id}/classes/${cid}`, t, { method: "PATCH", ...json(b) }),
  delClass: (t: string, id: number, cid: number) => call<{ ok: true }>(`/edu/ws/${id}/classes/${cid}`, t, { method: "DELETE" }),
  addSubjects: (t: string, id: number, names: string[]) => call<{ ok: true; added: number }>(`/edu/ws/${id}/subjects`, t, { method: "POST", ...json({ names }) }),
  delSubject: (t: string, id: number, sid: number) => call<{ ok: true }>(`/edu/ws/${id}/subjects/${sid}`, t, { method: "DELETE" }),
  plan: (t: string, id: number, cid: number) => call<{ plan: { subject_id: number; teacher_id: number | null; weekly: number; placed: number }[] }>(`/edu/ws/${id}/classes/${cid}/plan`, t),
  savePlan: (t: string, id: number, cid: number, plan: { subject_id: number; teacher_id: number | null; weekly: number }[]) => call<{ ok: true }>(`/edu/ws/${id}/classes/${cid}/plan`, t, { method: "PUT", ...json({ plan }) }),
  timetable: (t: string, id: number, f: { class_id?: number; teacher_id?: number }) => call<{ settings: Settings; slots: Slot[]; my_staff_id: number | null }>(`/edu/ws/${id}/timetable${qs(f)}`, t),
  availability: (t: string, id: number, day: number, period: number, class_id: number) => call<{ busy: Record<string, string>; full: Record<string, string>; rooms: string[] }>(`/edu/ws/${id}/availability${qs({ day, period, class_id })}`, t),
  setSlot: (t: string, id: number, b: { class_id: number; day: number; period: number; subject_id: number; teacher_id: number | null; room?: string | null }) => call<{ slot: Slot }>(`/edu/ws/${id}/slots`, t, { method: "PUT", ...json(b) }),
  delSlot: (t: string, id: number, class_id: number, day: number, period: number) => call<{ ok: true }>(`/edu/ws/${id}/slots${qs({ class_id, day, period })}`, t, { method: "DELETE" }),
  clear: (t: string, id: number, class_id: number, day?: number) => call<{ ok: true; removed: number }>(`/edu/ws/${id}/timetable/clear`, t, { method: "POST", ...json({ class_id, day }) }),
  copyDay: (t: string, id: number, class_id: number, from: number, to: number) => call<{ ok: true; copied: number; skipped: string[] }>(`/edu/ws/${id}/timetable/copy-day`, t, { method: "POST", ...json({ class_id, from, to }) }),
  autofill: (t: string, id: number, class_id: number) => call<{ ok: true; placed: number; missing: string[] }>(`/edu/ws/${id}/timetable/autofill`, t, { method: "POST", ...json({ class_id }) }),
  students: (t: string, id: number, f: { class_id?: number; q?: string }) => call<{ students: Student[] }>(`/edu/ws/${id}/students${qs(f)}`, t),
  addStudents: (t: string, id: number, b: Record<string, unknown>) => call<{ ok: true; added: number; skipped: string[] }>(`/edu/ws/${id}/students`, t, { method: "POST", ...json(b) }),
  editStudent: (t: string, id: number, sid: number, b: Record<string, unknown>) => call<{ student: Student }>(`/edu/ws/${id}/students/${sid}`, t, { method: "PATCH", ...json(b) }),
  announcements: (t: string | null, id: number) => call<{ announcements: Announcement[] }>(`/edu/ws/${id}/announcements`, t),
  announce: (t: string, id: number, b: Record<string, unknown>) => call<{ announcement: Announcement; notified: number }>(`/edu/ws/${id}/announcements`, t, { method: "POST", ...json(b) }),
  delAnnouncement: (t: string, id: number, aid: number) => call<{ ok: true }>(`/edu/ws/${id}/announcements/${aid}`, t, { method: "DELETE" }),
  grades: (t: string, id: number, class_id: number, subject_id: number, term?: string) => call<{ term: string; rows: { student_id: number; name: string; student_no: string | null; score: string | null; max_score: string | null; note: string | null }[] }>(`/edu/ws/${id}/grades${qs({ class_id, subject_id, term })}`, t),
  saveGrades: (t: string, id: number, b: Record<string, unknown>) => call<{ ok: true; saved: number }>(`/edu/ws/${id}/grades`, t, { method: "PUT", ...json(b) }),
  attendance: (t: string, id: number, b: Record<string, unknown>) => call<{ ok: true; saved: number }>(`/edu/ws/${id}/attendance`, t, { method: "PUT", ...json(b) }),
  requests: (t: string, id: number) => call<{ requests: EduRequest[] }>(`/edu/ws/${id}/requests`, t),
  answerRequest: (t: string, id: number, rid: number, status: string, response?: string) => call<{ request: EduRequest }>(`/edu/ws/${id}/requests/${rid}`, t, { method: "PATCH", ...json({ status, response }) }),
  portal: (t: string, sid: number) => call<Portal>(`/edu/portal/${sid}`, t),
  request: (t: string, sid: number, kind: string, note: string) => call<{ request: EduRequest; message: string }>(`/edu/portal/${sid}/requests`, t, { method: "POST", ...json({ kind, note }) }),
  transfers: (t: string, ws?: number) => call<{ transfers: Transfer[] }>(`/edu/transfers${qs({ ws })}`, t),
  requestTransfer: (t: string, student_id: number, to_ws: number, reason: string) => call<{ transfer: Transfer; message: string }>(`/edu/transfers`, t, { method: "POST", ...json({ student_id, to_ws, reason }) }),
  release: (t: string, tid: number, approve: boolean, note?: string) => call<{ transfer: Transfer }>(`/edu/transfers/${tid}/release`, t, { method: "POST", ...json({ approve, note }) }),
  accept: (t: string, tid: number, approve: boolean, class_id?: number | null, note?: string) => call<{ transfer: Transfer }>(`/edu/transfers/${tid}/accept`, t, { method: "POST", ...json({ approve, class_id, note }) }),
  cancelTransfer: (t: string, tid: number) => call<{ transfer: Transfer }>(`/edu/transfers/${tid}/cancel`, t, { method: "POST" }),
};

export const REQ_KINDS: { k: string; l: string; i: string }[] = [
  { k: "enrollment_cert", l: "شهادة قيد", i: "document-text" }, { k: "transcript", l: "كشف درجات", i: "stats-chart" },
  { k: "good_conduct", l: "شهادة حسن سير وسلوك", i: "ribbon" }, { k: "leave", l: "إذن غياب", i: "calendar" }, { k: "other", l: "طلب آخر", i: "chatbox-ellipses" },
];
export const REQ_STATUS: Record<string, { l: string; c: string }> = {
  pending: { l: "قيد المراجعة", c: "#B7791F" }, approved: { l: "مقبول", c: "#0E8A5F" }, ready: { l: "جاهز للاستلام", c: "#2B6CB0" }, rejected: { l: "مرفوض", c: "#C0392B" },
};
export const TR_COLOR: Record<string, string> = { requested: "#B7791F", released: "#2B6CB0", completed: "#0E8A5F", rejected: "#C0392B", cancelled: "#7A8794" };

/** وقت بداية ونهاية الحصة حسب الإعدادات والاستراحات */
export function periodTime(s: Settings, p: number): string {
  const [h, m] = s.start_time.split(":").map(Number);
  let mins = h * 60 + m + (p - 1) * s.period_minutes;
  for (const b of s.breaks || []) if (p > b.after) mins += b.minutes;
  const f = (x: number) => `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
  return `${f(mins)}–${f(mins + s.period_minutes)}`;
}
/** اليوم الدراسي الحالي بفهرس السبت=0 */
export function todayIndex(): number { return (new Date().getDay() + 1) % 7; }
