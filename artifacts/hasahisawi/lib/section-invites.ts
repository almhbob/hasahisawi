// دعوات الأقسام — روابط دعوة رسمية لكل قسم ينشئها مدير التطبيق وحده
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

export type SectionInfo = {
  key: string; title: string; tagline: string; icon: string; emoji: string; color: string;
  route: string; params: Record<string, string>;
  /** تصنيف القسم لتجميعه في لوحة الدعوات */
  group?: string; group_title?: string;
  /** فوائد ملموسة يجدها المنضم في القسم */
  benefits?: string[];
};
export type SectionCounts = { sent: number; opens: number; accepts: number; active: number };
export type SectionCatalogItem = SectionInfo & { template_person: string; template_org: string; counts: SectionCounts };
export type InviteStatus = "active" | "expired" | "used" | "revoked";
export type InviteKind = "person" | "org";

export type SectionInvite = {
  id: number; token: string; section_key: string; invitee_name: string; invitee_kind: InviteKind;
  invitee_phone: string | null; message: string | null; max_uses: number | null; uses: number; opens: number;
  expires_at: string | null; revoked_at: string | null; created_at: string;
  status: InviteStatus; section: SectionInfo | null; share_url: string; app_url: string; share_text: string;
  parent_id?: number | null; inviter_name?: string | null; depth?: number;
};

export type PublicInvite = {
  valid: boolean; reason: string | null; status: InviteStatus | "missing";
  section?: SectionInfo; invitee_name?: string; invitee_kind?: InviteKind; message?: string | null;
  expires_at?: string | null; created_at?: string; inviter?: string; share_url?: string; app_url?: string;
  /** دعوة مُمرَّرة من مستخدم (لا من الإدارة) */
  relayed?: boolean; depth?: number; can_forward?: boolean;
  accepted_by_me?: boolean; my_forwards?: number;
};

export type ForwardBody = { invitee_name: string; invitee_kind: InviteKind; invitee_phone?: string; note?: string };

export type AcceptResult = { ok: true; already: boolean; route: string; params: Record<string, string>; section: SectionInfo };

export type CreateInviteBody = {
  section_key: string; invitee_name: string; invitee_kind: InviteKind; invitee_phone?: string;
  message?: string; expires_days?: number; max_uses?: number | null;
};

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok && !(res.status === 404 && (j as any)?.status === "missing")) {
    throw Object.assign(new Error((j as any)?.error || `خطأ (${res.status})`), { status: res.status, body: j });
  }
  return j as T;
}

export const sectionInvitesApi = {
  sections: (token: string) => call<{ sections: SectionCatalogItem[]; totals: SectionCounts; inviter: string }>(`/admin/section-invites/sections`, token),
  list: (token: string, section?: string) => call<{ invites: SectionInvite[] }>(`/admin/section-invites${section ? `?section=${encodeURIComponent(section)}` : ""}`, token),
  create: (token: string, body: CreateInviteBody) => call<{ invite: SectionInvite }>(`/admin/section-invites`, token, { method: "POST", body: JSON.stringify(body) }),
  revoke: (token: string, id: number) => call<{ invite: SectionInvite }>(`/admin/section-invites/${id}`, token, { method: "PATCH", body: JSON.stringify({ action: "revoke" }) }),
  restore: (token: string, id: number) => call<{ invite: SectionInvite }>(`/admin/section-invites/${id}`, token, { method: "PATCH", body: JSON.stringify({ action: "restore" }) }),
  extend: (token: string, id: number, days: number, addUses = 0) =>
    call<{ invite: SectionInvite }>(`/admin/section-invites/${id}`, token, { method: "PATCH", body: JSON.stringify({ action: "extend", days, add_uses: addUses }) }),
  publicGet: (t: string, token?: string | null) => call<PublicInvite>(`/public/section-invites/${encodeURIComponent(t)}`, token),
  accept: (token: string, t: string) => call<AcceptResult>(`/section-invites/${encodeURIComponent(t)}/accept`, token, { method: "POST", body: "{}" }),
  /** المستلم يدعو شخصاً آخر أو جهة إلى القسم نفسه */
  forward: (token: string, t: string, body: ForwardBody) =>
    call<{ invite: SectionInvite }>(`/section-invites/${encodeURIComponent(t)}/forward`, token, { method: "POST", body: JSON.stringify(body) }),
  mine: (token: string, from?: string) => call<{ invites: SectionInvite[] }>(`/section-invites/mine${from ? `?from=${encodeURIComponent(from)}` : ""}`, token),
};

export const STATUS_META: Record<InviteStatus, { label: string; color: string; bg: string }> = {
  active: { label: "نشطة", color: "#0B7A52", bg: "#E3F6EE" },
  expired: { label: "منتهية", color: "#946B00", bg: "#FFF4D6" },
  used: { label: "مستخدمة", color: "#3B5BA9", bg: "#E6EDFB" },
  revoked: { label: "ملغاة", color: "#B42318", bg: "#FDE8E6" },
};

export const cleanInviteToken = (v: unknown) => String(v ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

export function fmtInviteDate(d?: string | null) {
  if (!d) return "";
  try { return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; }
}

/** رابط واتساب مباشر لرقم المدعو (يقبل 0912… أو ‎+249…) */
export function whatsappDirect(phone: string, text: string) {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "249" + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

// ── حفظ الدعوة حتى يُكمل المدعو تسجيل الدخول ──
const PENDING_KEY = "pending_section_invite";

export async function rememberSectionInvite(t: string) {
  const c = cleanInviteToken(t);
  if (c.length >= 6) await AsyncStorage.setItem(PENDING_KEY, c).catch(() => {});
}

/** بعد تسجيل الدخول: تُقبل الدعوة المحفوظة مرة واحدة وتُعاد وجهة الانضمام */
export async function resumePendingSectionInvite(token: string): Promise<AcceptResult | { error: string } | null> {
  const t = await AsyncStorage.getItem(PENDING_KEY).catch(() => null);
  if (!t) return null;
  try {
    const r = await sectionInvitesApi.accept(token, t);
    await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
    return r;
  } catch (e: any) {
    if (e?.status && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
      await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
      return { error: e?.message || "تعذّر قبول الدعوة" };
    }
    return null;
  }
}
