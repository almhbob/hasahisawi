// رحلة المريض: فريق الرعاية + الملف الطبي المشترك (صور الفحوصات والروشتات والتقارير)
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { getApiUrl } from "@/lib/query-client";
import { uploadFile } from "@/lib/firebase/storage";

export type DocKind = "lab" | "xray" | "prescription" | "report" | "discharge" | "vaccine" | "other";
export const DOC_KIND_META: Record<DocKind, { label: string; icon: string; color: string }> = {
  lab: { label: "تحليل", icon: "flask", color: "#00966A" },
  xray: { label: "أشعة", icon: "scan", color: "#1F5C8A" },
  prescription: { label: "روشتة", icon: "document-text", color: "#B7791F" },
  report: { label: "تقرير", icon: "clipboard", color: "#006B4A" },
  discharge: { label: "ملخص خروج", icon: "exit", color: "#7A2E3A" },
  vaccine: { label: "تطعيم", icon: "shield-checkmark", color: "#0F766E" },
  other: { label: "أخرى", icon: "folder-open", color: "#5A6B7B" },
};
export const DOC_KINDS = Object.keys(DOC_KIND_META) as DocKind[];

export type MedDoc = {
  id: number; patient_user_id: number; uploaded_by: number | null; uploader_role: "patient" | "staff"; uploader_name: string | null;
  kind: DocKind; kind_label: string; title: string; note: string | null; images: string[]; doc_date: string | null; shared: boolean; created_at: string;
};
export type CareMember = {
  id: number; staff_user_id: number; status: "active" | "pending"; requested_by: "patient" | "staff"; name: string;
  type_label: string; specialty?: string | null; facility_name?: string | null; avatar_url?: string | null; created_at: string;
};
export type TimelineItem = { type: "appointment" | "prescription" | "lab" | "pharmacy" | "document"; id: number; at: string; title: string; sub: string };
export type Journey = {
  record: any | null; care_team: CareMember[]; suggested: { staff_user_id: number; name: string; facility_name?: string }[];
  documents: MedDoc[]; timeline: TimelineItem[]; upcoming: any | null;
  counts: Record<string, number>; steps: { key: string; label: string; done: boolean }[];
};
export type StaffPatient = {
  link_id: number; status: "active" | "pending"; requested_by: string; user_id: number; name: string; avatar_url?: string | null;
  record_number?: string | null; blood_type?: string | null; birth_date?: string | null; gender?: string | null;
  allergies?: string | null; chronic_diseases?: string | null; docs: number; last_doc_at?: string | null;
};
export type PatientFile = { patient: any; record: any | null; documents: MedDoc[]; prescriptions: any[]; lab_results: any[]; access: "link" | "care" };
export type NewDoc = { kind: DocKind; title: string; note?: string; doc_date?: string; images: string[]; shared?: boolean };

async function call<T>(path: string, token: string | null | undefined, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((j as any)?.error || `خطأ (${res.status})`), { status: res.status });
  return j as T;
}

export const journeyApi = {
  journey: (t: string) => call<Journey>(`/medical/journey`, t),
  addMember: (t: string, staffUserId: number) => call<{ link: any }>(`/medical/care-team`, t, { method: "POST", body: JSON.stringify({ staff_user_id: staffUserId }) }),
  member: (t: string, id: number, action: "approve" | "revoke") => call<{ link: any }>(`/medical/care-team/${id}`, t, { method: "PATCH", body: JSON.stringify({ action }) }),
  addDoc: (t: string, d: NewDoc) => call<{ document: MedDoc }>(`/medical/documents`, t, { method: "POST", body: JSON.stringify(d) }),
  patchDoc: (t: string, id: number, p: Partial<Pick<MedDoc, "shared" | "title" | "note">>) => call<{ document: MedDoc }>(`/medical/documents/${id}`, t, { method: "PATCH", body: JSON.stringify(p) }),
  delDoc: (t: string, id: number) => call<{ ok: true }>(`/medical/documents/${id}`, t, { method: "DELETE" }),
  // الكادر
  link: (t: string, recordNumber: string) => call<{ link: any; already?: boolean; patient_name?: string }>(`/medical/staff/link`, t, { method: "POST", body: JSON.stringify({ record_number: recordNumber }) }),
  patients: (t: string) => call<{ patients: StaffPatient[] }>(`/medical/staff/patients`, t),
  file: (t: string, uid: number) => call<PatientFile>(`/medical/staff/patients/${uid}/file`, t),
  staffDoc: (t: string, uid: number, d: NewDoc) => call<{ document: MedDoc }>(`/medical/staff/patients/${uid}/documents`, t, { method: "POST", body: JSON.stringify(d) }),
  doctors: () => call<{ doctors: { user_id: number; name: string; type_label: string; specialty?: string | null; facility_name?: string | null; avatar_url?: string | null }[] }>(`/medical-consultations/doctors`, null),
};

/** اختيار صور (معرض أو كاميرا) — يعيد مسارات محلية */
export async function pickImages(from: "library" | "camera"): Promise<string[]> {
  if (from === "camera") {
    if (Platform.OS !== "web") {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) throw new Error("اسمح بالوصول للكاميرا من إعدادات الجهاز");
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    return r.canceled ? [] : r.assets.map((a) => a.uri);
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: 10, quality: 0.8 });
  return r.canceled ? [] : r.assets.map((a) => a.uri).slice(0, 10);
}

/** رفع صور المستند إلى التخزين (يعيد روابط https) */
export async function uploadMedicalImages(userId: number | string, uris: string[], onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    out.push(await uploadFile(`medical-docs/${userId}/${name}`, uris[i]));
    onProgress?.(i + 1, uris.length);
  }
  return out;
}

export function fmtDay(d?: string | null) {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; }
}
