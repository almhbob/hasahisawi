import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  getFirestore,
  increment,
  arrayUnion,
} from "firebase/firestore";
import { app, isFirebaseConfigured } from "./index";

// ── الأنواع ──────────────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  type: "text" | "image";
  createdAt: Timestamp | null;
  readBy: string[];
};

export type Chat = {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  lastSenderId: string;
  unread: Record<string, number>;
  createdAt: Timestamp | null;
};

// ── مساعدات ──────────────────────────────────────────────────────────────────

function getDB() {
  if (!isFirebaseConfigured) throw new Error("Firebase not configured");
  return getFirestore(app);
}

export function getChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}

// ── إنشاء أو جلب محادثة ──────────────────────────────────────────────────────

export async function getOrCreateChat(
  myUid: string,
  myName: string,
  otherUid: string,
  otherName: string,
): Promise<string> {
  const db = getDB();
  const chatId = getChatId(myUid, otherUid);
  const chatRef = doc(db, "chats", chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) {
    await setDoc(chatRef, {
      participants: [myUid, otherUid],
      participantNames: { [myUid]: myName, [otherUid]: otherName },
      lastMessage: "",
      lastMessageAt: serverTimestamp(),
      lastSenderId: "",
      unread: { [myUid]: 0, [otherUid]: 0 },
      createdAt: serverTimestamp(),
    });
  }
  return chatId;
}

// ── إرسال رسالة ──────────────────────────────────────────────────────────────

export async function sendMessage(
  chatId: string,
  senderId: string,
  senderName: string,
  otherUid: string,
  text: string,
  imageUrl?: string,
): Promise<void> {
  const db = getDB();
  const msgCol = collection(db, "chats", chatId, "messages");
  await addDoc(msgCol, {
    senderId,
    senderName,
    text: text.trim(),
    imageUrl: imageUrl ?? null,
    type: imageUrl ? "image" : "text",
    createdAt: serverTimestamp(),
    readBy: [senderId],
  });
  await updateDoc(doc(db, "chats", chatId), {
    lastMessage: imageUrl ? "📷 صورة" : text.trim(),
    lastMessageAt: serverTimestamp(),
    lastSenderId: senderId,
    [`unread.${otherUid}`]: increment(1),
  });
}

// ── تعليم الرسائل كمقروءة ────────────────────────────────────────────────────

export async function markChatRead(chatId: string, uid: string): Promise<void> {
  try {
    const db = getDB();
    await updateDoc(doc(db, "chats", chatId), {
      [`unread.${uid}`]: 0,
    });
  } catch {}
}

// ── Hook: قائمة المحادثات ─────────────────────────────────────────────────────

export function useChats(uid: string | null) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !isFirebaseConfigured) { setLoading(false); return; }
    const db = getDB();
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", uid),
      orderBy("lastMessageAt", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(q, (snap) => {
      setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Chat)));
      setLoading(false);
    });
    return unsub;
  }, [uid]);

  return { chats, loading };
}

// ── Hook: رسائل محادثة ────────────────────────────────────────────────────────

export function useMessages(chatId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chatId || !isFirebaseConfigured) { setLoading(false); return; }
    const db = getDB();
    const q = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt", "asc"),
      limit(200),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatMessage)));
      setLoading(false);
    });
    return unsub;
  }, [chatId]);

  return { messages, loading };
}

// ── Hook: عداد الرسائل غير المقروءة ──────────────────────────────────────────

export function useTotalUnread(uid: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid || !isFirebaseConfigured) return;
    const db = getDB();
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      let total = 0;
      snap.docs.forEach((d) => {
        const data = d.data() as Chat;
        total += data.unread?.[uid] ?? 0;
      });
      setCount(total);
    });
    return unsub;
  }, [uid]);

  return count;
}

// ── جلب قائمة المستخدمين للدردشة ─────────────────────────────────────────────

export async function fetchUsers(): Promise<{ uid: string; name: string }[]> {
  if (!isFirebaseConfigured) return [];
  try {
    const db = getDB();
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map((d) => ({
      uid: d.id,
      name: (d.data().name as string) ?? d.id,
    }));
  } catch {
    return [];
  }
}
