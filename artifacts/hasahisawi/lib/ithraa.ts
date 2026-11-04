// «إثراء» — المكتبة الثقافية: واجهة الخادم + الرفع (نفس تخزين المكتبة المنهجية)
import { Platform } from "react-native";
import type * as DocumentPicker from "expo-document-picker";
import { getApiUrl } from "@/lib/query-client";
import { uploadToTarget } from "@/lib/big-upload";

export const ITHRAA = "#1B4D6B";
export const ITHRAA_DEEP = "#0F2E44";
export const ITHRAA_GOLD = "#C99A2E";
export const ITHRAA_SOFT = "#E8F0F5";

export type IthraaKind = "book" | "article";
export type IthraaShelf = { key: string; label: string; icon: string; color: string; books: number; articles: number };
export type IthraaMe = {
  signed_in: boolean; can_review: boolean; review_all?: boolean; review_shelves?: string[]; is_app_admin?: boolean; pending?: number;
};
export type IthraaMeta = {
  shelves: IthraaShelf[]; totals: { books: number; articles: number }; max_file_mb: number; points: number; article_min: number; me: IthraaMe;
};
export type IthraaItem = {
  id: number; kind: IthraaKind; category: string; category_label: string; title: string; author_name: string | null;
  description: string; excerpt: string | null; read_minutes: number | null; body?: string | null;
  cover_url: string | null; has_file: boolean; source: "upload" | "link" | null; file_size: number | null; file_format: string | null;
  language: string; pages: number | null; publish_year: number | null; rights: string; tags: string[];
  uploader_id: number | null; uploader_name: string; uploader_avatar: string | null;
  status: "pending" | "approved" | "rejected"; featured: boolean; views: number; downloads: number;
  created_at: string; reviewed_at: string | null; review_note?: string | null; reviewer_name?: string | null; file_url?: string | null;
};
export type IthraaModerator = { user_id: number; name: string; phone: string | null; avatar_url: string | null; categories: string[] | null; note: string | null; created_at: string; reviewed: number };
export type IthraaUserHit = { id: number; name: string; phone: string | null; avatar_url: string | null; role: string };
export type IthraaSubmission = {
  kind: IthraaKind; category: string; title: string; author_name?: string; description?: string; body?: string;
  cover_url?: string | null; file_url?: string | null; file_size?: number | null; file_format?: string | null;
  language?: string; pages?: number | null; publish_year?: number | null; rights: string; tags?: string[];
};

export const RIGHTS_OPTIONS: { key: string; label: string; hint: string }[] = [
  { key: "own", label: "أنا المؤلف", hint: "العمل من تأليفي وأوافق على نشره مجاناً" },
  { key: "public_domain", label: "ملكية عامة", hint: "كتاب تراثي أو انتهت حقوقه أو منشور للعامة مجاناً" },
  { key: "permission", label: "بإذن صاحب الحق", hint: "لديّ إذن من المؤلف أو الناشر بالمشاركة" },
];
export const LANG_LABEL: Record<string, string> = { ar: "العربية", en: "الإنجليزية", other: "لغة أخرى" };
export const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "قيد المراجعة", color: "#B7791F", icon: "time-outline" },
  approved: { label: "منشور", color: "#0E8A5F", icon: "checkmark-circle" },
  rejected: { label: "يحتاج تعديلاً", color: "#C0392B", icon: "alert-circle" },
};

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((j as any)?.error || `خطأ (${res.status})`), { status: res.status });
  return j as T;
}
const json = (b: unknown) => ({ body: JSON.stringify(b) });
const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};

export const ithraaApi = {
  meta: (token?: string | null) => call<IthraaMeta>(`/ithraa/meta`, token),
  items: (f: { kind?: IthraaKind; category?: string; q?: string; sort?: "new" | "popular" | "featured"; featured?: boolean; limit?: number; offset?: number; uploader?: number }) =>
    call<{ items: IthraaItem[]; has_more: boolean }>(`/ithraa/items${qs({ ...f, featured: f.featured ? "1" : undefined })}`),
  item: (id: number, token?: string | null) => call<{ item: IthraaItem; can_review: boolean; is_owner: boolean; related: IthraaItem[] }>(`/ithraa/items/${id}`, token),
  openUrl: (id: number) => call<{ url: string }>(`/ithraa/items/${id}/open?json=1`),
  mine: (token: string) => call<{ items: IthraaItem[]; points: number }>(`/ithraa/mine`, token),
  submit: (token: string, b: IthraaSubmission) => call<{ item: IthraaItem; message: string }>(`/ithraa/items`, token, { method: "POST", ...json(b) }),
  edit: (token: string, id: number, b: Partial<IthraaSubmission>) => call<{ item: IthraaItem; message: string }>(`/ithraa/items/${id}`, token, { method: "PATCH", ...json(b) }),
  remove: (token: string, id: number) => call<{ ok: true }>(`/ithraa/items/${id}`, token, { method: "DELETE" }),
  review: (token: string, status: "pending" | "approved" | "rejected", category?: string) =>
    call<{ items: IthraaItem[]; counts: Record<string, number> }>(`/ithraa/review${qs({ status, category })}`, token),
  act: (token: string, id: number, action: "approve" | "reject" | "feature" | "unfeature" | "unpublish", note?: string, category?: string) =>
    call<{ item: IthraaItem }>(`/ithraa/items/${id}/review`, token, { method: "POST", ...json({ action, note, category }) }),
  moderators: (token: string) => call<{ moderators: IthraaModerator[] }>(`/ithraa/moderators`, token),
  lookup: (token: string, q: string) => call<{ users: IthraaUserHit[] }>(`/ithraa/moderators/lookup${qs({ q })}`, token),
  setModerator: (token: string, userId: number, categories: string[] | null, note?: string) =>
    call<{ ok: true }>(`/ithraa/moderators/${userId}`, token, { method: "PUT", ...json({ categories, note }) }),
  removeModerator: (token: string, userId: number) => call<{ ok: true }>(`/ithraa/moderators/${userId}`, token, { method: "DELETE" }),
};

/** رفع ملف (كتاب أو صورة غلاف) إلى التخزين السحابي — Blob للكبير، وCloudinary احتياطاً */
export async function uploadLibraryFile(token: string, a: DocumentPicker.DocumentPickerAsset, onProgress?: (p: number) => void): Promise<string> {
  const api = getApiUrl();
  const tr = await fetch(`${api}/api/curriculum/upload-target`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ file_name: a.name, size: a.size ?? 0, content_type: a.mimeType || "" }),
  }).catch(() => null);
  const target = tr ? await tr.json().catch(() => ({})) : {};
  if (tr && !tr.ok && tr.status === 413) throw new Error(target.error || "الملف أكبر من المسموح");
  if (tr?.ok && target.provider === "blob") {
    return uploadToTarget(target, { uri: a.uri, file: (a as any).file, mimeType: a.mimeType, size: a.size }, onProgress);
  }
  const sr = await fetch(`${api}/api/curriculum/upload-signature`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ size: a.size ?? 0 }) });
  const sig = await sr.json().catch(() => ({}));
  if (!sr.ok) throw new Error(sig.error || "تعذّر بدء الرفع");
  const form = new FormData();
  if (Platform.OS === "web") {
    // بعض المتصفحات لا تعيد كائن File؛ نقرأ الرابط كملف بدل إرسال كائن الجوال الذي لا يفهمه المتصفح
    const webFile: File = (a as any).file ?? new File([await (await fetch(a.uri)).blob()], a.name || "file", { type: a.mimeType || "application/octet-stream" });
    form.append("file", webFile);
  } else form.append("file", { uri: a.uri, name: a.name, type: a.mimeType || "application/octet-stream" } as any);
  form.append("api_key", sig.api_key);
  form.append("timestamp", String(sig.timestamp));
  form.append("folder", sig.folder);
  form.append("signature", sig.signature);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resource_type}/upload`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) resolve(body.secure_url);
        else reject(new Error(/size|large/i.test(body?.error?.message || "") ? "حجم الملف أكبر من المسموح — أضفه كرابط (Google Drive مثلاً)." : (body?.error?.message || "فشل رفع الملف")));
      } catch { reject(new Error("فشل رفع الملف")); }
    };
    xhr.onerror = () => reject(new Error("انقطع الاتصال أثناء الرفع"));
    xhr.send(form as any);
  });
}

export function fmtSize(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} ك.ب`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} م.ب`;
}
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }); } catch { return ""; }
}
