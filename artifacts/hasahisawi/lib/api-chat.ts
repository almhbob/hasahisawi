import { useState, useEffect, useCallback, useRef } from "react";
import { getApiUrl } from "./query-client";

// ── الأنواع ───────────────────────────────────────────────────────────────────

export type ApiChat = {
  id: number;
  user1_id: number;
  user2_id: number;
  user1_name: string;
  user2_name: string;
  last_message: string;
  last_message_at: string;
  last_sender_id: number | null;
  unread_user1: number;
  unread_user2: number;
};

export type ApiMessage = {
  id: number;
  chat_id: number;
  sender_id: number;
  sender_name: string;
  content: string;
  image_url: string | null;
  type: "text" | "image";
  created_at: string;
  is_read: boolean;
};

export type ApiUser = {
  id: number;
  name: string;
  role: string;
};

// ── دالة fetch مساعدة ─────────────────────────────────────────────────────────

async function apiFetch(path: string, token: string, opts?: RequestInit) {
  const base = getApiUrl().replace(/\/$/, "");
  if (!base) throw new Error("API not configured");
  const res = await fetch(`${base}/api${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── جلب قائمة المستخدمين ──────────────────────────────────────────────────────

export async function apiGetUsers(token: string): Promise<ApiUser[]> {
  return apiFetch("/users/list", token);
}

// ── إنشاء أو جلب محادثة ──────────────────────────────────────────────────────

export async function apiGetOrCreateChat(token: string, otherUserId: number): Promise<ApiChat> {
  return apiFetch("/chats", token, {
    method: "POST",
    body: JSON.stringify({ other_user_id: otherUserId }),
  });
}

// ── إرسال رسالة ──────────────────────────────────────────────────────────────

export async function apiSendMessage(
  token: string,
  chatId: number,
  content: string,
  imageUrl?: string,
): Promise<ApiMessage> {
  return apiFetch(`/chats/${chatId}/messages`, token, {
    method: "POST",
    body: JSON.stringify({ content, image_url: imageUrl }),
  });
}

// ── تعليم محادثة كمقروءة ──────────────────────────────────────────────────────

export async function apiMarkRead(token: string, chatId: number): Promise<void> {
  await apiFetch(`/chats/${chatId}/read`, token, { method: "POST", body: "{}" });
}

// ── Hook: قائمة المحادثات (polling كل 5 ثوانٍ) ───────────────────────────────

export function useApiChats(token: string | null) {
  const [chats, setChats] = useState<ApiChat[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch("/chats", token);
      setChats(data);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch_();
    intervalRef.current = setInterval(fetch_, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, fetch_]);

  return { chats, loading, refresh: fetch_ };
}

// ── Hook: رسائل محادثة (polling كل 3 ثوانٍ) ──────────────────────────────────

export function useApiMessages(token: string | null, chatId: number | null) {
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const lastIdRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (!token || !chatId) return;
    try {
      const since = lastIdRef.current > 0 ? `?since=${lastIdRef.current}` : "";
      const data: ApiMessage[] = await apiFetch(`/chats/${chatId}/messages${since}`, token);
      if (since && data.length > 0) {
        setMessages((prev) => [...prev, ...data]);
        lastIdRef.current = data[data.length - 1].id;
      } else if (!since) {
        setMessages(data);
        if (data.length > 0) lastIdRef.current = data[data.length - 1].id;
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, [token, chatId]);

  useEffect(() => {
    if (!token || !chatId) { setLoading(false); return; }
    lastIdRef.current = 0;
    setMessages([]);
    setLoading(true);
    fetch_();
    intervalRef.current = setInterval(fetch_, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, chatId]);

  return { messages, loading };
}

// ── Hook: إجمالي الرسائل غير المقروءة ────────────────────────────────────────

export function useApiUnread(token: string | null): number {
  const [count, setCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiFetch("/chats/unread", token);
      setCount(data.total ?? 0);
    } catch {}
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch_();
    intervalRef.current = setInterval(fetch_, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, fetch_]);

  return count;
}

// ── مساعد: اسم المستخدم الآخر ────────────────────────────────────────────────

export function getOtherUser(chat: ApiChat, myId: number) {
  return myId === chat.user1_id
    ? { id: chat.user2_id, name: chat.user2_name }
    : { id: chat.user1_id, name: chat.user1_name };
}

export function getMyUnread(chat: ApiChat, myId: number) {
  return myId === chat.user1_id ? chat.unread_user1 : chat.unread_user2;
}
