// الدردشة المتقدمة — مزامنة الرسائل مع التعديلات والحذف، الحالة، والإجراءات
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getApiUrl } from "./query-client";

export type ReplyRef = { id: number; sender_id: number; sender_name: string; content: string; image: boolean; deleted: boolean };

export type ChatMsg = {
  id: number; chat_id: number; sender_id: number; sender_name: string;
  content: string; image_url: string | null; type: "text" | "image";
  created_at: string; is_read: boolean; read_at?: string | null;
  edited_at?: string | null; deleted_at?: string | null; updated_at?: string;
  reactions: Record<string, string>; reply_to_id?: number | null; reply_to?: ReplyRef | null;
  pending?: boolean; failed?: boolean; localId?: string;
};

export type ChatOther = { id: number; name?: string; avatar_url?: string | null; online: boolean; last_seen_at: string | null; typing: boolean };
export type ChatState = { hidden: boolean; pinned: boolean; muted: boolean };

export type ChatListItem = {
  id: number; user1_id: number; user2_id: number; user1_name: string; user2_name: string;
  user1_avatar: string | null; user2_avatar: string | null;
  last_message: string; last_message_at: string; last_sender_id: number | null;
  unread: number; hidden: boolean; pinned: boolean; muted: boolean;
  other_online: boolean; other_last_seen_at: string | null; other_typing: boolean; blocked_by_me: boolean;
};

export const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

// حالة التطبيق — على بعض أجهزة Android تبقى AppState.currentState «unknown» عند الإقلاع
// فكان التحديث الدوري لا يعمل ولا تظهر الرسائل الواردة. نعتبره نشطاً ما لم يذهب للخلفية.
let appActive = AppState.currentState !== "background" && AppState.currentState !== "inactive";
AppState.addEventListener("change", (s) => { appActive = s !== "background" && s !== "inactive"; });
export const isAppActive = () => appActive;

async function api(path: string, token: string, init: { method?: string; body?: unknown } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${getApiUrl().replace(/\/$/, "")}/api${path}`, {
      method: init.method || "GET", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.blocked ? `🚫 ${data.reason || data.error}` : data?.error || `HTTP ${res.status}`);
    return data;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("انتهت مهلة الاتصال");
    throw e;
  } finally { clearTimeout(t); }
}

export const chatApi = {
  list: (token: string) => api("/chats/list", token) as Promise<{ chats: ChatListItem[] }>,
  send: (token: string, chatId: number, content: string, opts: { image_url?: string; reply_to_id?: number | null } = {}) =>
    api(`/chats/${chatId}/messages`, token, { method: "POST", body: { content, image_url: opts.image_url, reply_to_id: opts.reply_to_id || undefined } }) as Promise<ChatMsg>,
  edit: (token: string, chatId: number, id: number, content: string) => api(`/chats/${chatId}/messages/${id}`, token, { method: "PATCH", body: { content } }),
  remove: (token: string, chatId: number, id: number, scope: "me" | "all") => api(`/chats/${chatId}/messages/${id}?for=${scope}`, token, { method: "DELETE" }),
  react: (token: string, chatId: number, id: number, emoji: string | null) => api(`/chats/${chatId}/messages/${id}/react`, token, { method: "POST", body: { emoji } }),
  typing: (token: string, chatId: number, stop = false) => api(`/chats/${chatId}/typing`, token, { method: "POST", body: { stop } }),
  state: (token: string, chatId: number, patch: Partial<ChatState>) => api(`/chats/${chatId}/state`, token, { method: "PATCH", body: patch }),
  clear: (token: string, chatId: number) => api(`/chats/${chatId}/clear`, token, { method: "POST", body: {} }),
  block: (token: string, chatId: number, unblock = false) => api(`/chats/${chatId}/block`, token, { method: "POST", body: { unblock } }),
  read: (token: string, chatId: number) => api(`/chats/${chatId}/read`, token, { method: "POST", body: {} }),
  ping: (token: string) => api(`/presence/ping`, token, { method: "POST", body: {} }),
  presence: (token: string) => api(`/presence/settings`, token) as Promise<{ show_presence: boolean }>,
  setPresence: (token: string, show: boolean) => api(`/presence/settings`, token, { method: "PATCH", body: { show_presence: show } }),
};

/** «نشط الآن» / «آخر ظهور …» */
export function presenceText(online: boolean, lastSeen: string | null, typing?: boolean) {
  if (typing) return "يكتب الآن…";
  if (online) return "نشط الآن";
  if (!lastSeen) return "";
  const m = Math.round((Date.now() - new Date(lastSeen).getTime()) / 60000);
  if (m < 60) return `آخر ظهور قبل ${Math.max(1, m)} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `آخر ظهور قبل ${h} س`;
  const d = new Date(lastSeen);
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `آخر ظهور أمس ${d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}`;
  return `آخر ظهور ${d.toLocaleDateString("ar", { day: "numeric", month: "short" })}`;
}

/** نبض الحضور ما دام التطبيق مفتوحاً */
export function usePresencePing(token: string | null | undefined) {
  useEffect(() => {
    if (!token) return;
    let active = isAppActive();
    const beat = () => { if (active) chatApi.ping(token).catch(() => {}); };
    beat();
    const t = setInterval(beat, 60000);
    const sub = AppState.addEventListener("change", (s) => { active = s !== "background" && s !== "inactive"; if (active) beat(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [token]);
}

/** قائمة المحادثات (تحديث كل 6 ثوانٍ أثناء فتح الشاشة) */
export function useChatList(token: string | null | undefined) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try { const r = await chatApi.list(token); setChats(r.chats); setError(null); }
    catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => {
    refresh();
    if (!token) return;
    const t = setInterval(() => { if (isAppActive()) refresh(); }, 5000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [token, refresh]);
  return { chats, setChats, loading, error, refresh };
}

/** مزامنة محادثة: رسائل جديدة + المعدّلة/المحذوفة + حالة الطرف الآخر */
export function useChatSync(token: string | null | undefined, chatId: number | null) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [other, setOther] = useState<ChatOther | null>(null);
  const [state, setState] = useState<ChatState>({ hidden: false, pinned: false, muted: false });
  const [blocked, setBlocked] = useState({ byMe: false, me: false });
  const [loading, setLoading] = useState(true);
  const lastId = useRef(0);
  const since = useRef<string | null>(null);
  const busy = useRef(false);

  const merge = useCallback((incoming: ChatMsg[], removed: number[] = []) => {
    setMessages((prev) => {
      const map = new Map(prev.filter((m) => !m.pending).map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, { ...m, reactions: m.reactions || {} });
      for (const id of removed) map.delete(id);
      const pend = prev.filter((m) => m.pending || m.failed);
      return [...[...map.values()].sort((a, b) => a.id - b.id), ...pend];
    });
  }, []);

  const sync = useCallback(async (full = false) => {
    if (!token || !chatId || busy.current) return;
    busy.current = true;
    try {
      const qs = full || !lastId.current ? "" : `?after_id=${lastId.current}${since.current ? `&since=${encodeURIComponent(since.current)}` : ""}`;
      const r = await api(`/chats/${chatId}/sync${qs}`, token);
      if (!qs) setMessages((r.messages as ChatMsg[]).map((m) => ({ ...m, reactions: m.reactions || {} })));
      else merge(r.messages, r.removed);
      const maxId = (r.messages as ChatMsg[]).reduce((mx, m) => Math.max(mx, m.id), lastId.current);
      lastId.current = maxId;
      since.current = r.server_time;
      setOther(r.other); setState(r.state); setBlocked({ byMe: r.blocked_by_me, me: r.blocked_me });
    } catch { /* الشبكة — نعيد المحاولة في الدورة القادمة */ }
    finally { busy.current = false; setLoading(false); }
  }, [token, chatId, merge]);

  useEffect(() => {
    lastId.current = 0; since.current = null; setMessages([]); setLoading(true);
    if (!token || !chatId) { setLoading(!chatId); return; }
    sync(true);
    const t = setInterval(() => { if (isAppActive()) sync(); }, 2500);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") sync(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [token, chatId, sync]);

  const addPending = (m: ChatMsg) => setMessages((p) => [...p, m]);
  const dropLocal = (localId: string) => setMessages((p) => p.filter((m) => m.localId !== localId));
  const markFailed = (localId: string) => setMessages((p) => p.map((m) => m.localId === localId ? { ...m, pending: false, failed: true } : m));
  const patchLocal = (id: number, patch: Partial<ChatMsg>) => setMessages((p) => p.map((m) => m.id === id ? { ...m, ...patch } : m));
  const removeLocal = (id: number) => setMessages((p) => p.filter((m) => m.id !== id));

  return { messages, other, state, setState, blocked, setBlocked, loading, sync, addPending, dropLocal, markFailed, patchLocal, removeLocal };
}
