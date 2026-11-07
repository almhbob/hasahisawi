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
export const setActiveCall = (id: number | null) => { activeCallId = id; if (id === null) setLiveCall(null); };

/** المكالمة الجارية المعروضة في الشريط العائم عند تصغير شاشتها */
export type LiveCall = { id: number; role: "caller" | "callee"; name: string; avatar?: string | null; chatId: number; since: number };
let liveCall: LiveCall | null = null;
const liveSubs = new Set<(c: LiveCall | null) => void>();
export function setLiveCall(c: LiveCall | null) { liveCall = c; liveSubs.forEach(f => f(c)); }
export const getLiveCall = () => liveCall;
export function onLiveCall(f: (c: LiveCall | null) => void): () => void { liveSubs.add(f); return () => { liveSubs.delete(f); }; }
export const getActiveCall = () => activeCallId;

// ── الرد التلقائي: ضغط «رد» على إشعار المكالمة يفتح الشاشة ويقبلها مباشرة ──
let autoAnswerId: number | null = null;
const autoAnswerSubs = new Set<(id: number) => void>();
export function requestAutoAnswer(id: number) { autoAnswerId = id; autoAnswerSubs.forEach((f) => f(id)); }
export const isAutoAnswerPending = (id: number) => autoAnswerId === id;
export function consumeAutoAnswer(id: number): boolean {
  if (autoAnswerId !== id) return false;
  autoAnswerId = null; return true;
}
export function onAutoAnswer(f: (id: number) => void): () => void {
  autoAnswerSubs.add(f); return () => { autoAnswerSubs.delete(f); };
}

/** فتح شاشة المكالمة الواردة مرة واحدة فقط مهما تعددت المصادر (إشعار، استطلاع، زر) */
let lastOpened = { id: 0, at: 0 };
export function openIncomingCall(
  nav: { push: (href: any) => void },
  p: { callId: number; name?: string; avatar?: string | null; auto?: boolean },
) {
  const id = Number(p.callId);
  if (!id) return;
  if (p.auto) requestAutoAnswer(id);
  if (getActiveCall() === id || (lastOpened.id === id && Date.now() - lastOpened.at < 10_000)) return;
  lastOpened = { id, at: Date.now() };
  nav.push({ pathname: "/call", params: { callId: String(id), role: "callee", name: p.name || "", avatar: p.avatar || "" } });
}
