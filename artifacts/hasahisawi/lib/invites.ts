// الدعوات ونقاطها — واجهة الخادم + حفظ رمز الدعوة القادم من الرابط حتى يُسجَّل المدعو
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

export type InviteMe = {
  code: string; link: string; pointsPerInvite: number; count: number; points: number; rank: number | null;
  recent: { id: number; name: string; avatar_url: string | null; points: number; created_at: string }[];
  invitedBy: { inviter_name: string; created_at: string } | null; canClaim: boolean;
};
export type InviteLeader = { id: number; name: string; avatar_url: string | null; count: number; points: number };

export const PLAY_URL = "https://play.google.com/store/apps/details?id=com.almhbob.hasahisawi";
export const WEB_APP_URL = "https://hasahisawi.pages.dev";
const PENDING_KEY = "pending_invite_ref_v1";

async function call<T>(path: string, token?: string | null, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((j as any)?.error || `خطأ (${res.status})`), { status: res.status });
  return j as T;
}

export const invitesApi = {
  me: (token: string) => call<InviteMe>(`/invites/me`, token),
  claim: (token: string, code: string) => call<{ ok: true; inviter: string; points: number }>(`/invites/claim`, token, { method: "POST", body: JSON.stringify({ code }) }),
  leaderboard: () => call<{ leaders: InviteLeader[]; pointsPerInvite: number }>(`/invites/leaderboard`),
};

export const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** يُحفظ رمز الدعوة من الرابط (‎/get?ref=…) حتى يُكمل الشخص التسجيل */
export async function rememberInviteRef(code?: string | null) {
  const c = cleanCode(String(code ?? ""));
  if (c.length >= 4) await AsyncStorage.setItem(PENDING_KEY, c).catch(() => {});
}

/** بعد تسجيل الدخول: إن وُجد رمز محفوظ نحتسبه مرة واحدة ثم نمحوه */
export async function claimPendingInvite(token: string): Promise<string | null> {
  const code = await AsyncStorage.getItem(PENDING_KEY).catch(() => null);
  if (!code) return null;
  try {
    const r = await invitesApi.claim(token, code);
    await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
    return r.inviter;
  } catch (e: any) {
    // أخطاء نهائية (رمز خاطئ، حساب قديم، سبق الاحتساب): لا داعي لإعادة المحاولة
    if (e?.status && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401) await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
    return null;
  }
}

export function inviteMessage(link: string, code: string) {
  return `انضم إليّ في تطبيق حصاحيصاوي — خدمات مدينة الحصاحيصا في مكان واحد 💚\nرمز دعوتي: ${code}\n${link}`;
}
