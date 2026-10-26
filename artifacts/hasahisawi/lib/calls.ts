// المكالمات الصوتية عبر الإنترنت — واجهة الخادم
import { getApiUrl } from "./query-client";

export type VoiceCall = {
  id: number; chat_id: number; caller_id: number; callee_id: number;
  status: "ringing" | "accepted" | "ended" | "declined" | "missed";
  caller_name?: string; caller_avatar?: string | null; callee_name?: string; callee_avatar?: string | null;
  created_at: string; answered_at?: string | null;
};

async function api(path: string, token: string, method = "GET", body?: unknown) {
  const res = await fetch(`${getApiUrl().replace(/\/$/, "")}/api${path}`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d?.error || `HTTP ${res.status}`), { status: res.status, data: d });
  return d;
}

export const callsApi = {
  start: (token: string, chatId: number) => api(`/calls`, token, "POST", { chat_id: chatId }) as Promise<{ call: VoiceCall; ice: any[] }>,
  get: (token: string, id: number) => api(`/calls/${id}`, token) as Promise<{ call: VoiceCall; ice: any[] }>,
  incoming: (token: string) => api(`/calls/incoming`, token) as Promise<{ call: VoiceCall | null }>,
  accept: (token: string, id: number) => api(`/calls/${id}/accept`, token, "POST", {}) as Promise<{ call: VoiceCall; ice: any[] }>,
  decline: (token: string, id: number) => api(`/calls/${id}/decline`, token, "POST", {}),
  end: (token: string, id: number) => api(`/calls/${id}/end`, token, "POST", {}),
};

export const callPageUrl = () => `${getApiUrl().replace(/\/$/, "")}/api/calls/page`;

/** يمنع فتح شاشة المكالمة نفسها مرتين */
let activeCallId: number | null = null;
export const setActiveCall = (id: number | null) => { activeCallId = id; };
export const getActiveCall = () => activeCallId;
