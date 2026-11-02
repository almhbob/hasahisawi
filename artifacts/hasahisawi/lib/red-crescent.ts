// مساحة جمعية الهلال الأحمر السوداني — واجهة الخادم + الربط مع تطبيق «مسعف»
import { Alert, Linking, Platform } from "react-native";
import { router } from "expo-router";
import { getApiUrl } from "@/lib/query-client";

export type SrcsRole = "volunteer" | "paramedic" | "leader" | "admin";
export type SrcsPerm = "requests" | "members" | "meetings" | "announcements" | "activities" | "courses" | "results" | "cohorts" | "certificates";
export const PERM_LABEL: Record<SrcsPerm, string> = {
  requests: "مراجعة الطلبات", members: "إدارة الأعضاء", meetings: "الاجتماعات", announcements: "الإعلانات", activities: "الأنشطة",
  courses: "الدورات والورش", results: "رصد النتائج", cohorts: "الدفعات والسجل", certificates: "الشهادات والمدفوعات",
};
export const PERM_ICON: Record<SrcsPerm, string> = {
  requests: "person-add", members: "people", meetings: "calendar", announcements: "megaphone", activities: "images",
  courses: "school", results: "stats-chart", cohorts: "albums", certificates: "ribbon",
};
/** الصلاحيات الافتراضية لكل دور (تُضاف إليها الصلاحيات الممنوحة فردياً) */
export const ROLE_DEFAULT_PERMS: Record<SrcsRole, SrcsPerm[]> = {
  volunteer: [], paramedic: [], leader: ["meetings", "announcements", "activities"],
  admin: ["requests", "members", "meetings", "announcements", "activities", "courses", "results", "cohorts", "certificates"],
};
export type SrcsMember = {
  id: number; user_id: number; role: SrcsRole; desired_role: SrcsRole | null; status: "pending" | "active" | "suspended" | "rejected" | "banned";
  unit: string | null; phone: string | null; blood_type: string | null; experience: string | null; certifications: string | null;
  musif_code: string | null; card_no: string | null; card_issued_at: string | null; card_expires_at: string | null;
  admin_note: string | null; created_at: string;
  national_id_no?: string | null; id_doc_url?: string | null; cert_doc_url?: string | null;
  affiliation?: string | null; cohort_id?: number | null; cohort_name?: string | null; perms?: SrcsPerm[]; revoked_at?: string | null; revoke_reason?: string | null; card_token?: string | null; role_label?: string; card_url?: string | null;
  name?: string; avatar_url?: string | null; account_phone?: string | null;
};
export type SrcsAnnouncement = { id: number; title: string; body: string; audience: string; pinned: boolean; created_at: string };
export type SrcsActivity = { id: number; title: string; type: string; description: string | null; place: string | null; happened_at: string; images: string[]; beneficiaries: number; published: boolean; points: number; volunteers?: number };
export type SrcsMeeting = { id: number; title: string; agenda: string | null; place: string | null; starts_at: string; ends_at?: string | null; audience: string; minutes?: string | null; my_rsvp?: string | null; going?: number; attended?: number };
export type SrcsOverview = {
  stats: { members: number; paramedics: number; activities: number; beneficiaries: number };
  announcements: SrcsAnnouncement[]; activities: SrcsActivity[]; meetings: SrcsMeeting[];
  membership: SrcsMember | null; isAdmin: boolean; perms?: SrcsPerm[]; isAppAdmin?: boolean;
};
export type SrcsFile = { name: string; url: string; size?: number | null; type?: string | null };
export type SrcsCourse = {
  id: number; title: string; kind: "course" | "workshop"; description: string | null; trainer: string | null; place: string | null;
  starts_at: string | null; ends_at: string | null; seats: number; enrolled: number; cohort_id: number | null; cohort_name?: string | null;
  cover_url: string | null; files: SrcsFile[]; files_count?: number; audience: "public" | "members"; registration_open: boolean;
  pass_mark: number; max_score: number; results_published: boolean; cert_enabled: boolean; cert_hours: number | null; published: boolean;
  my_enrollment_id?: number | null; my_status?: string | null; my_score?: number | null; my_passed?: boolean | null; my_cert_status?: string | null; my_cert_url?: string | null;
  passed_count?: number; cert_pending?: number;
};
export type SrcsEnrollment = {
  id: number; course_id: number; user_id: number; status: string; attended: boolean; score: number | null; passed: boolean | null; result_note: string | null;
  cert_status: "none" | "pending" | "issued" | "rejected" | "revoked"; cert_amount: number | null; payment_ref: string | null; payment_proof_url: string | null;
  cert_no: string | null; cert_issued_at: string | null; cert_note: string | null; cert_url?: string | null;
  name?: string; avatar_url?: string | null; role?: SrcsRole; unit?: string | null; card_no?: string | null; cohort_name?: string | null;
  title?: string; kind?: string; starts_at?: string | null; results_published?: boolean; max_score?: number; pass_mark?: number;
};
export type SrcsDoc = { id: number; user_id: number; kind: string; title: string; url: string; verified: boolean; source: string; profile_cert_id: number | null; created_at: string };
export type SrcsCohort = { id: number; name: string; year: number | null; notes: string | null; members: number; courses: number };
export type SrcsDossier = {
  member: (SrcsMember & { email?: string | null }) | null; docs: SrcsDoc[]; enrollments: SrcsEnrollment[];
  activities: { id: number; title: string; type: string; happened_at: string; points: number }[]; meetings: { attended: number; invited: number }; points: number;
};
export type SrcsSettings = { cert_price: number; cert_currency: string; cert_payment_info: string };
export const DOC_KIND_LABEL: Record<string, string> = {
  national_id: "هوية / رقم وطني", certificate: "شهادة", license: "رخصة مزاولة", photo: "صورة شخصية", other: "مستند", srcs_certificate: "شهادة صادرة من الجمعية",
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

/**
 * رفع مستند خاص (صورة الهوية، إشعار الدفع): يُحفظ في قاعدة البيانات لا في التخزين العام،
 * ويُعرض فقط برابط موقّع قصير العمر لصاحبه وللإدارة المخوّلة. يُرجع مرجعاً "priv:…" يُرسل مع الطلب.
 */
export async function uploadPrivateDoc(token: string, uri: string, opts: { name?: string | null; mime?: string | null; kind: "national_id" | "payment_proof" | "other" }): Promise<{ ref: string; url: string }> {
  const name = (opts.name || `doc_${Date.now()}.jpg`).replace(/[\\/]+/g, "_");
  const type = opts.mime || (/\.pdf$/i.test(name) ? "application/pdf" : "image/jpeg");
  const fd = new FormData();
  fd.append("kind", opts.kind);
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    fd.append("file", blob, name);
  } else {
    fd.append("file", { uri, name, type } as any);
  }
  const res = await fetch(`${getApiUrl()}/api/srcs/private-upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as any)?.error || `تعذّر الرفع (${res.status})`);
  return j as { ref: string; url: string };
}
export type SrcsAudit = { id: number; actor_id: number | null; actor_name: string | null; action: string; target: string; detail: Record<string, any>; created_at: string };
export const AUDIT_LABEL: Record<string, string> = {
  member_update: "تعديل عضو", perms: "تعديل صلاحيات", ban: "حظر", card_revoke: "إلغاء/إعادة بطاقة", settings: "تعديل سعر الشهادة",
  cert_approve: "اعتماد دفع شهادة", cert_issue: "إصدار شهادة", cert_reject: "رفض دفع", cert_revoke: "إلغاء شهادة", cert_restore: "استعادة شهادة",
  results_publish: "إعلان نتيجة", results_hide: "إخفاء نتيجة", course_delete: "حذف دورة", cohort_delete: "حذف دفعة",
  doc_verify: "توثيق مستند", doc_unverify: "إلغاء توثيق", export: "تصدير", checkin: "تسجيل حضور بالمسح",
};

export const srcsApi = {
  overview: (token?: string | null) => call<SrcsOverview>(`/srcs/overview`, token),
  join: (token: string, b: Partial<SrcsMember> & { desired_role: SrcsRole }) => call<{ membership: SrcsMember }>(`/srcs/join`, token, { method: "POST", ...body(b) }),
  updateMe: (token: string, b: Partial<Pick<SrcsMember, "musif_code" | "blood_type" | "phone">>) => call<{ membership: SrcsMember }>(`/srcs/me`, token, { method: "PATCH", ...body(b) }),
  settings: () => call<SrcsSettings>(`/srcs/settings`),
  courses: (token?: string | null) => call<{ courses: SrcsCourse[] }>(`/srcs/courses`, token),
  enroll: (token: string, id: number) => call(`/srcs/courses/${id}/enroll`, token, { method: "POST" }),
  unenroll: (token: string, id: number) => call(`/srcs/courses/${id}/enroll`, token, { method: "DELETE" }),
  requestCert: (token: string, id: number, b: { payment_ref?: string; payment_proof_url?: string | null }) =>
    call<{ enrollment: SrcsEnrollment; cert_url?: string | null }>(`/srcs/courses/${id}/certificate`, token, { method: "POST", ...body(b) }),
  dossier: (token: string) => call<SrcsDossier>(`/srcs/me/dossier`, token),
  addDoc: (token: string, b: { kind: string; title: string; url: string }) => call<{ doc: SrcsDoc }>(`/srcs/me/docs`, token, { method: "POST", ...body(b) }),
  deleteDoc: (token: string, id: number) => call(`/srcs/me/docs/${id}`, token, { method: "DELETE" }),
  rsvp: (token: string, id: number, status: "going" | "not_going" | "maybe") => call(`/srcs/meetings/${id}/rsvp`, token, { method: "POST", ...body({ status }) }),
  admin: {
    dashboard: (t: string) => call<Record<string, number> & { perms?: SrcsPerm[]; isAppAdmin?: boolean }>(`/srcs/admin/dashboard`, t),
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
    settings: (t: string, b: Partial<SrcsSettings>) => call<SrcsSettings>(`/srcs/admin/settings`, t, { method: "PATCH", ...body(b) }),
    courses: (t: string) => call<{ courses: SrcsCourse[] }>(`/srcs/admin/courses`, t),
    createCourse: (t: string, b: Record<string, unknown>) => call<{ course: SrcsCourse }>(`/srcs/admin/courses`, t, { method: "POST", ...body(b) }),
    updateCourse: (t: string, id: number, b: Record<string, unknown>) => call<{ course: SrcsCourse }>(`/srcs/admin/courses/${id}`, t, { method: "PATCH", ...body(b) }),
    deleteCourse: (t: string, id: number) => call(`/srcs/admin/courses/${id}`, t, { method: "DELETE" }),
    enrollments: (t: string, id: number) => call<{ enrollments: SrcsEnrollment[] }>(`/srcs/admin/courses/${id}/enrollments`, t),
    enrollUsers: (t: string, id: number, b: { user_ids?: number[]; cohort_id?: number }) => call<{ added: number }>(`/srcs/admin/courses/${id}/enroll`, t, { method: "POST", ...body(b) }),
    saveResults: (t: string, id: number, rows: { id: number; score: number | null; attended?: boolean; note?: string }[]) => call<{ saved: number }>(`/srcs/admin/courses/${id}/results`, t, { method: "POST", ...body({ rows }) }),
    certAction: (t: string, enrollmentId: number, action: "approve" | "reject" | "issue" | "revoke" | "restore", note?: string) =>
      call<{ enrollment: SrcsEnrollment }>(`/srcs/admin/enrollments/${enrollmentId}/certificate`, t, { method: "PATCH", ...body({ action, note }) }),
    pendingCerts: (t: string) => call<{ pending: SrcsEnrollment[] }>(`/srcs/admin/certificates/pending`, t),
    cohorts: (t: string) => call<{ cohorts: SrcsCohort[] }>(`/srcs/admin/cohorts`, t),
    createCohort: (t: string, b: { name: string; year?: number; notes?: string }) => call<{ cohort: SrcsCohort }>(`/srcs/admin/cohorts`, t, { method: "POST", ...body(b) }),
    updateCohort: (t: string, id: number, b: Record<string, unknown>) => call(`/srcs/admin/cohorts/${id}`, t, { method: "PATCH", ...body(b) }),
    deleteCohort: (t: string, id: number) => call(`/srcs/admin/cohorts/${id}`, t, { method: "DELETE" }),
    dossier: (t: string, memberId: number) => call<SrcsDossier>(`/srcs/admin/members/${memberId}/dossier`, t),
    verifyDoc: (t: string, id: number, verified: boolean) => call(`/srcs/admin/docs/${id}`, t, { method: "PATCH", ...body({ verified }) }),
    exportLink: (t: string, kind: "members" | "cohort" | "course" | "meeting", id: number | null, format: "csv" | "html") =>
      call<{ url: string }>(`/srcs/admin/export-link`, t, { method: "POST", ...body({ kind, id, format }) }),
    audit: (t: string) => call<{ entries: SrcsAudit[] }>(`/srcs/admin/audit`, t),
    checkin: (t: string, b: { code: string; meeting_id?: number; course_id?: number }) =>
      call<{ ok: boolean; member: { name: string; role_label: string; unit: string | null; card_no: string } }>(`/srcs/admin/checkin`, t, { method: "POST", ...body(b) }),
    participants: (t: string, id: number, user_ids: number[]) => call<{ participants: number; awarded: number }>(`/srcs/admin/activities/${id}/participants`, t, { method: "POST", ...body({ user_ids }) }),
  },
};

// ── التكامل مع تطبيق «مسعف» (com.almhbob.musif · musif://) ──────────
// حصاحيصاوي: المجتمع والتنظيم (العضوية، الاجتماعات، الإعلانات، الأنشطة)
// مسعف: العمل الميداني (نداء الاستغاثة، استقبال البلاغات، الموقع اللحظي)
// رابط المتجر يُضبط فقط بعد نشر «مسعف» (كان رابط Google Play يفتح صفحة «لم يتم العثور على العنصر»)
export const MUSIF_STORE_URL = (process.env.EXPO_PUBLIC_MUSIF_STORE_URL || "").trim();
export const musifVerifyUrl = (code: string) => `https://musif.app/v/${encodeURIComponent(code)}`;

/** يفتح شاشة في تطبيق مسعف إن كان مثبتاً. يُرجع false إن لم يكن مثبتاً (أو على الويب). */
export async function openMusif(path: "sos" | "responder" | "signup" | "first-aid" | "" = "", params: Record<string, string> = {}): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const qs = new URLSearchParams({ ...params, from: "hasahisawi" }).toString();
  try { await Linking.openURL(`musif://${path}${qs ? `?${qs}` : ""}`); return true; }
  catch { return false; }
}

/**
 * زر الطوارئ وما شابهه: يفتح «مسعف» إن كان مثبتاً؛ وإلا يعرض بدائل تعمل فوراً
 * (أرقام الطوارئ، ورابط تحميل مسعف حين يُنشر) بدل صفحة متجر غير موجودة.
 */
export async function openMusifOrHelp(path: "sos" | "responder" | "signup" | "first-aid", params: Record<string, string> = {}) {
  if (await openMusif(path, params)) return;
  const sos = path === "sos";
  const buttons: { text: string; style?: "cancel" | "default"; onPress?: () => void }[] = [
    { text: "أرقام الطوارئ", onPress: () => router.push("/(tabs)/numbers" as any) },
  ];
  if (MUSIF_STORE_URL) buttons.push({ text: "تحميل تطبيق مسعف", onPress: () => { Linking.openURL(MUSIF_STORE_URL).catch(() => {}); } });
  buttons.push({ text: "إلغاء", style: "cancel" });
  Alert.alert(
    sos ? "طلب إسعاف" : "تطبيق «مسعف»",
    (sos ? "في حالة الطوارئ اتصل فوراً بأرقام الإسعاف والطوارئ.\n\n" : "") +
      (MUSIF_STORE_URL ? "تطبيق «مسعف» غير مثبّت على هذا الجهاز." : "تطبيق «مسعف» لم يُطرح بعد على المتاجر — سيتوفر قريباً."),
    buttons,
  );
}
