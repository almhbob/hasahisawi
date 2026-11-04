// قائمة قوالب السيرة من الخادم (الظهور/المستوى/الشارة/السعر بقرار الإدارة) مع نسخة محلية احتياطية،
// وتسجيل أحداث الاستخدام (معاينة/اختيار/تصدير/طلب) لإحصاءات الإدارة.
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { CV_TEMPLATES, type CVTemplateMeta, type CVTier, type CVTemplateId } from "@/lib/cv-templates";

export type CatalogItem = CVTemplateMeta & { tier: CVTier; badge: string | null; price?: number | null };
export type CVEvent = "preview" | "select" | "export" | "request";

const CACHE_KEY = "hsh_cv_catalog_v1";
const DEVICE_KEY = "views_device_id_v1"; // نفس معرّف الجهاز المستخدم لعدّاد المشاهدات

type ServerRow = { id: string; tier: CVTier; badge: string | null; sort_order?: number; price?: number };

/** القائمة المحلية الافتراضية (حين يتعذّر الوصول للخادم) */
export const localCatalog = (): CatalogItem[] => CV_TEMPLATES.map((t) => ({ ...t, badge: t.badge ?? null }));

function merge(rows: ServerRow[]): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const r of rows) {
    const t = CV_TEMPLATES.find((x) => x.id === r.id);
    if (t) out.push({ ...t, tier: r.tier === "premium" ? "premium" : "free", badge: r.badge ?? null, price: r.price ?? null });
  }
  return out;
}

let memo: { list: CatalogItem[]; pricing: boolean; fromServer: boolean } | null = null;

export function useCvCatalog() {
  const [state, setState] = useState(() => memo || { list: localCatalog(), pricing: false, fromServer: false });
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/cv/templates`);
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const list = merge(d.templates || []);
      if (!list.length) throw new Error("empty");
      memo = { list, pricing: !!d.pricing_visible, fromServer: true };
      setState(memo);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(d)).catch(() => {});
    } catch {
      // بلا اتصال: آخر نسخة محفوظة ثم القائمة المحلية
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        const d = raw ? JSON.parse(raw) : null;
        const list = d ? merge(d.templates || []) : [];
        if (list.length) { memo = { list, pricing: !!d.pricing_visible, fromServer: false }; setState(memo); }
      } catch {}
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

let deviceId: string | null = null;
async function device(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    const v = await AsyncStorage.getItem(DEVICE_KEY);
    if (v) return (deviceId = v);
    const n = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_KEY, n);
    return (deviceId = n);
  } catch { return (deviceId = "anon"); }
}

/** يسجّل حدث استخدام لقالب (لا يرمي أخطاء) */
export async function trackCvEvent(id: CVTemplateId, event: CVEvent, token?: string | null) {
  try {
    const dev = await device();
    await fetch(`${getApiUrl()}/api/cv/templates/${id}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": dev, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ event, device_id: dev }),
    });
  } catch {}
}

// ── واجهة الإدارة ──
export type AdminTplRow = { id: string; visible: boolean; tier: CVTier; price: number | null; sort_order: number; badge: string | null };
export type Win = { d7: number; d30: number; all: number };
export type TplStats = { preview: Win; select: Win; export: Win; request: Win; approved: Win };
export type AdminCatalog = { templates: AdminTplRow[]; stats: Record<string, TplStats>; pricing_visible: boolean; auto_badge: string; auto_badge_template: string | null };

async function adminFetch(path: string, token: string, init?: RequestInit) {
  const r = await fetch(`${getApiUrl()}/api${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || "تعذّر التنفيذ");
  return d;
}
export const cvTemplatesAdminApi = {
  list: (token: string): Promise<AdminCatalog> => adminFetch("/admin/cv/templates", token),
  patch: (token: string, id: string, body: Partial<Omit<AdminTplRow, "id">>) => adminFetch(`/admin/cv/templates/${id}`, token, { method: "PATCH", body: JSON.stringify(body) }),
  reorder: (token: string, ids: string[]) => adminFetch("/admin/cv/templates/reorder", token, { method: "POST", body: JSON.stringify({ ids }) }),
};
