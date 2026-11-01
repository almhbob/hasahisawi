import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Platform, ActivityIndicator, Image, Alert, Linking, Keyboard,
  Modal, Pressable, Share,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import UserAvatar from "@/components/UserAvatar";
import { apiGetOrCreateChat } from "@/lib/api-chat";
import { chatApi, useChatSync, presenceText, REACTIONS, type ChatMsg } from "@/lib/chat-plus";
import { callsApi } from "@/lib/calls";
import { getApiUrl } from "@/lib/query-client";
import { filePart, notify } from "@/lib/xplatform";

const EDIT_MIN = 60;
const DELETE_ALL_H = 24;

// أرقام سودانية داخل نص الرسالة تصبح قابلة للاتصال بلمسة
const PHONE_RE = /(\+?249\d{9}|0\d{9})/g;
function splitPhones(text: string): Array<{ t: string; phone?: string }> {
  const out: Array<{ t: string; phone?: string }> = [];
  let last = 0;
  for (const m of text.matchAll(PHONE_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: text.slice(last, i) });
    out.push({ t: m[0], phone: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
function dial(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`).catch(() => Alert.alert("تعذّر الاتصال", "لا يمكن فتح تطبيق الهاتف على هذا الجهاز"));
}
const timeOf = (ts: string) => ts ? new Date(ts).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) : "";
function daySep(ts: string) {
  const d = new Date(ts); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "اليوم";
  if (d.toDateString() === y.toDateString()) return "أمس";
  return d.toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" });
}
function confirm(title: string, msg: string, ok: string, destructive = false): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(!!(globalThis as any).confirm?.(`${title}\n${msg}`));
  return new Promise((r) => Alert.alert(title, msg, [{ text: "إلغاء", style: "cancel", onPress: () => r(false) }, { text: ok, style: destructive ? "destructive" : "default", onPress: () => r(true) }]));
}
const tap = () => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

// ── فقاعة رسالة ──────────────────────────────────────────────────────────────
function Bubble({ msg, isMe, myId, otherName, showAvatar, otherAvatar, highlight, onLong, onReplyTap, onRetry, onOpenSender }: {
  onOpenSender?: () => void;
  msg: ChatMsg; isMe: boolean; myId: number; otherName: string; showAvatar: boolean; otherAvatar: string | null; highlight: string;
  onLong: () => void; onReplyTap: (id: number) => void; onRetry: () => void;
}) {
  const deleted = !!msg.deleted_at;
  const reacts = Object.entries(msg.reactions || {});
  const grouped = reacts.reduce<Record<string, number>>((a, [, e]) => { a[e] = (a[e] || 0) + 1; return a; }, {});
  const mineReact = msg.reactions?.[String(myId)];
  const parts = msg.content ? splitPhones(msg.content) : [];
  const hl = highlight.trim();
  return (
    <View style={[st.bWrap, isMe ? st.bWrapMe : st.bWrapOther]}>
      {!isMe ? <View style={{ width: 30, alignSelf: "flex-end" }}>{showAvatar ? <Pressable onPress={onOpenSender} hitSlop={6} accessibilityRole="button" accessibilityLabel={`الصفحة الشخصية لـ ${otherName}`}><UserAvatar name={otherName} avatarUrl={otherAvatar} size={28} borderRadius={9} /></Pressable> : null}</View> : null}
      <View style={{ maxWidth: "80%" }}>
        <Pressable onLongPress={deleted || msg.pending ? undefined : onLong} delayLongPress={280}
          style={[st.bubble, isMe ? st.bMe : st.bOther, deleted && st.bDeleted, hl && msg.content?.includes(hl) && st.bHit]}>
          {msg.reply_to && !deleted ? (
            <TouchableOpacity onPress={() => onReplyTap(msg.reply_to!.id)} style={[st.quote, isMe ? st.quoteMe : st.quoteOther]}>
              <Text style={[st.quoteName, isMe && { color: "#E7FFF3" }]} numberOfLines={1}>{msg.reply_to.sender_id === myId ? "أنت" : msg.reply_to.sender_name}</Text>
              <Text style={[st.quoteTxt, isMe && { color: "rgba(255,255,255,0.85)" }]} numberOfLines={2}>
                {msg.reply_to.deleted ? "رسالة محذوفة" : msg.reply_to.image && !msg.reply_to.content ? "📷 صورة" : msg.reply_to.content}
              </Text>
            </TouchableOpacity>
          ) : null}
          {deleted ? (
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
              <Ionicons name="ban-outline" size={14} color={isMe ? "rgba(255,255,255,0.7)" : Colors.textMuted} />
              <Text style={[st.deletedTxt, isMe && { color: "rgba(255,255,255,0.8)" }]}>{isMe ? "حذفت هذه الرسالة" : "تم حذف هذه الرسالة"}</Text>
            </View>
          ) : (
            <>
              {msg.image_url ? <Image source={{ uri: msg.image_url }} style={st.img} resizeMode="cover" /> : null}
              {msg.content ? (
                <Text style={[st.txt, isMe ? { color: "#fff" } : { color: Colors.textPrimary }]}>
                  {parts.map((p, i) => p.phone
                    ? <Text key={i} onPress={() => dial(p.phone!)} style={{ textDecorationLine: "underline", fontFamily: "Cairo_700Bold" }}>{p.t} 📞</Text>
                    : <Text key={i}>{p.t}</Text>)}
                </Text>
              ) : null}
            </>
          )}
          <View style={st.meta}>
            {msg.edited_at && !deleted ? <Text style={[st.metaTxt, isMe ? st.metaMe : st.metaOther]}>معدّلة ·</Text> : null}
            <Text style={[st.metaTxt, isMe ? st.metaMe : st.metaOther]}>{timeOf(msg.created_at)}</Text>
            {isMe && !deleted ? (
              msg.failed ? <Ionicons name="alert-circle" size={13} color="#FFD1CF" />
              : msg.pending ? <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.6)" />
              : <Ionicons name={msg.is_read ? "checkmark-done" : "checkmark"} size={14} color={msg.is_read ? "#9FE7FF" : "rgba(255,255,255,0.6)"} />
            ) : null}
          </View>
        </Pressable>
        {Object.keys(grouped).length ? (
          <View style={[st.reacts, isMe ? { alignSelf: "flex-start" } : { alignSelf: "flex-end" }]}>
            {Object.entries(grouped).map(([e, n]) => (
              <View key={e} style={[st.react, mineReact === e && st.reactMine]}><Text style={st.reactTxt}>{e}{n > 1 ? ` ${n}` : ""}</Text></View>
            ))}
          </View>
        ) : null}
        {msg.failed ? <TouchableOpacity onPress={onRetry}><Text style={st.retry}>لم تُرسل — اضغط لإعادة المحاولة</Text></TouchableOpacity> : null}
      </View>
    </View>
  );
}

// ── الشاشة ────────────────────────────────────────────────────────────────────
export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ chatId?: string; userId?: string; otherName: string; otherAvatar?: string }>();
  const { chatId, userId, otherName: paramName, otherAvatar: paramAvatar } = params;
  const { user, token } = useAuth();
  const myId = Number(user?.id ?? 0);

  const [chatIdNum, setChatIdNum] = useState<number | null>(chatId ? parseInt(chatId) || null : null);
  const [openError, setOpenError] = useState("");
  useEffect(() => {
    if (chatIdNum || !userId || !token) return;
    if (Number(userId) === myId) { setOpenError("لا يمكنك مراسلة نفسك"); return; }
    apiGetOrCreateChat(token, Number(userId)).then((c) => setChatIdNum(c.id)).catch((e: any) => setOpenError(e?.message || "تعذّر فتح المحادثة"));
  }, [userId, token, chatIdNum, myId]);

  const sync = useChatSync(token, chatIdNum);
  const { messages, other, state, blocked } = sync;
  const otherName = other?.name || paramName || "محادثة";
  const otherAvatar = other?.avatar_url ?? paramAvatar ?? null;
  const otherId = Number(other?.id ?? userId ?? 0) || 0;
  /** الضغط على اسم/صورة الطرف الآخر يفتح صفحته الشخصية */
  const openOtherProfile = () => { if (otherId) router.push({ pathname: "/profile" as any, params: { id: String(otherId) } }); };

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [editing, setEditing] = useState<ChatMsg | null>(null);
  const [action, setAction] = useState<ChatMsg | null>(null);
  const [menu, setMenu] = useState(false);
  const [searchOn, setSearchOn] = useState(false);
  const [search, setSearch] = useState("");
  const flatRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const typingAt = useRef(0);
  const nearBottom = useRef(true);

  // تعليم كمقروء عند فتح المحادثة ومع وصول رسائل جديدة من الطرف الآخر
  const lastOtherId = useMemo(() => [...messages].reverse().find((m) => m.sender_id !== myId && !m.pending)?.id ?? 0, [messages, myId]);
  useFocusEffect(useCallback(() => { if (chatIdNum && token) chatApi.read(token, chatIdNum).catch(() => {}); }, [chatIdNum, token, lastOtherId]));

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => { if (nearBottom.current) setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 60); });
    return () => sub.remove();
  }, []);
  const lastKey = messages.length ? `${messages[messages.length - 1].id}-${messages.length}` : "";
  useEffect(() => { if (lastKey && nearBottom.current) setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 60); }, [lastKey]);

  const onType = (t: string) => {
    setText(t);
    if (!token || !chatIdNum || editing) return;
    const now = Date.now();
    if (t && now - typingAt.current > 4000) { typingAt.current = now; chatApi.typing(token, chatIdNum).catch(() => {}); }
  };

  const ensureReady = () => {
    if (!token) { Alert.alert("سجّل الدخول", "يجب تسجيل الدخول لإرسال الرسائل"); return false; }
    if (!chatIdNum) { Alert.alert("لحظة", openError || "جارٍ تجهيز المحادثة… حاول بعد ثانية"); return false; }
    return true;
  };

  async function sendText(body: string, reply: ChatMsg | null, retryLocal?: string) {
    if (!ensureReady()) return;
    const localId = retryLocal || `l${Date.now()}`;
    if (retryLocal) sync.dropLocal(retryLocal);
    sync.addPending({
      id: Number.MAX_SAFE_INTEGER - Date.now() % 1000000, localId, chat_id: chatIdNum!, sender_id: myId, sender_name: user?.name || "",
      content: body, image_url: null, type: "text", created_at: new Date().toISOString(), is_read: false, reactions: {},
      reply_to_id: reply?.id ?? null, reply_to: reply ? { id: reply.id, sender_id: reply.sender_id, sender_name: reply.sender_name, content: reply.content, image: !!reply.image_url, deleted: !!reply.deleted_at } : null,
      pending: true,
    });
    nearBottom.current = true;
    try {
      await chatApi.send(token!, chatIdNum!, body, { reply_to_id: reply?.id });
      sync.dropLocal(localId);
      sync.sync();
    } catch (e: any) {
      sync.markFailed(localId);
      if (String(e?.message).startsWith("🚫") || /حظر|مراسلة/.test(String(e?.message))) Alert.alert("تعذّر الإرسال", e.message);
    }
  }

  async function handleSend() {
    const t = text.trim();
    if (!t || sending) return;
    if (editing) {
      if (!ensureReady()) return;
      setSending(true);
      try {
        await chatApi.edit(token!, chatIdNum!, editing.id, t);
        sync.patchLocal(editing.id, { content: t, edited_at: new Date().toISOString() });
        setEditing(null); setText("");
      } catch (e: any) { Alert.alert("تعذّر التعديل", e?.message || "حاول مجدداً"); }
      finally { setSending(false); }
      return;
    }
    setText(""); const r = replyTo; setReplyTo(null);
    if (chatIdNum && token) chatApi.typing(token, chatIdNum, true).catch(() => {});
    await sendText(t, r);
  }

  async function handleSendImage() {
    if (!ensureReady()) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول للمعرض"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setImgUploading(true);
    try {
      const form = new FormData();
      form.append("image", (await filePart(result.assets[0].uri, "chat.jpg", "image/jpeg")) as any);
      const r = await fetch(`${getApiUrl()}/api/chats/${chatIdNum}/image`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data: any = await r.json().catch(() => ({}));
      if (!r.ok || !data?.url) throw new Error(data?.error || "تعذّر رفع الصورة");
      await chatApi.send(token!, chatIdNum!, "", { image_url: data.url, reply_to_id: replyTo?.id });
      setReplyTo(null); nearBottom.current = true; sync.sync();
    } catch (e: any) { Alert.alert("تعذّر إرسال الصورة", e?.message || "حاول مجدداً"); }
    finally { setImgUploading(false); }
  }

  const [calling, setCalling] = useState(false);
  async function startVoiceCall() {
    if (!ensureReady() || calling) return;
    // Alert.alert لا يظهر شيئاً في المتصفح، فنستخدم notify الذي يعمل على الويب أيضاً
    if (Platform.OS === "web") { notify("المكالمات الصوتية", "المكالمات الصوتية متاحة في تطبيق حصاحيصاوي على الجوال."); return; }
    setCalling(true);
    try {
      const r = await callsApi.start(token!, chatIdNum!);
      router.push({ pathname: "/call" as any, params: { callId: String(r.call.id), role: "caller", name: otherName, avatar: otherAvatar || "" } });
    } catch (e: any) { Alert.alert("تعذّر الاتصال", e?.message || "حاول مجدداً"); }
    finally { setCalling(false); }
  }

  function handlePhoneOptions() {
    const theirPhone = [...messages].reverse().filter((m) => m.sender_id !== myId && m.content && !m.deleted_at)
      .map((m) => (m.content.match(PHONE_RE) || [])[0]).find(Boolean);
    const myPhone = user?.phone ? String(user.phone) : "";
    const buttons: any[] = [];
    if (theirPhone) buttons.push({ text: `اتصل بـ ${theirPhone}`, onPress: () => dial(theirPhone) });
    if (myPhone) buttons.push({ text: "أرسل رقمي ليتصل بي", onPress: () => sendText(`📞 هذا رقمي، اتصل بي: ${myPhone}`, null) });
    buttons.push({ text: "إلغاء", style: "cancel" });
    Alert.alert("اتصال", theirPhone ? `شارك ${otherName} رقمه في المحادثة.` : `رقم ${otherName} مخفي حفاظاً على خصوصيته. أرسل رقمك ليتصل بك، أو اطلب منه مشاركة رقمه هنا.`, buttons);
  }

  // ── إجراءات الرسالة ───────────────────────────────────────────────
  const act = action;
  const actMine = !!act && act.sender_id === myId;
  const canEdit = !!act && actMine && !!act.content && !act.deleted_at && Date.now() - new Date(act.created_at).getTime() < EDIT_MIN * 60000;
  const canDeleteAll = !!act && actMine && !act.deleted_at && Date.now() - new Date(act.created_at).getTime() < DELETE_ALL_H * 3600000;

  async function react(emoji: string) {
    if (!act || !token || !chatIdNum) return;
    const mine = act.reactions?.[String(myId)] === emoji;
    const next = { ...(act.reactions || {}) };
    if (mine) delete next[String(myId)]; else next[String(myId)] = emoji;
    sync.patchLocal(act.id, { reactions: next }); setAction(null); tap();
    try { await chatApi.react(token, chatIdNum, act.id, mine ? null : emoji); } catch { sync.sync(true); }
  }
  async function del(scope: "me" | "all") {
    if (!act || !token || !chatIdNum) return;
    const m = act; setAction(null);
    const ok = await confirm(scope === "all" ? "حذف للجميع" : "حذف لديّ", scope === "all" ? "ستُحذف الرسالة من المحادثة لدى الطرفين." : "ستُحذف الرسالة من جهازك فقط، وتبقى لدى الطرف الآخر.", "حذف", true);
    if (!ok) return;
    if (scope === "me") sync.removeLocal(m.id); else sync.patchLocal(m.id, { deleted_at: new Date().toISOString(), content: "", image_url: null, reactions: {} });
    try { await chatApi.remove(token, chatIdNum, m.id, scope); } catch (e: any) { Alert.alert("تعذّر الحذف", e?.message); sync.sync(true); }
  }

  // ── قائمة المحادثة ─────────────────────────────────────────────────
  async function toggleState(k: "muted" | "pinned" | "hidden") {
    if (!token || !chatIdNum) return;
    const v = !state[k]; setMenu(false);
    sync.setState({ ...state, [k]: v });
    try {
      await chatApi.state(token, chatIdNum, { [k]: v });
      if (k === "hidden" && v) { Alert.alert("تم إخفاء المحادثة", "تجدها في «المحادثات المخفية» أسفل قائمة الدردشة."); router.back(); }
    } catch (e: any) { Alert.alert("تعذّر التنفيذ", e?.message); sync.sync(); }
  }
  async function clearChat() {
    setMenu(false);
    if (!token || !chatIdNum) return;
    if (!(await confirm("مسح المحادثة", "ستُمسح كل الرسائل من جهازك فقط، ولن تُحذف لدى الطرف الآخر.", "مسح", true))) return;
    try { await chatApi.clear(token, chatIdNum); sync.sync(true); } catch (e: any) { Alert.alert("تعذّر المسح", e?.message); }
  }
  async function toggleBlock() {
    setMenu(false);
    if (!token || !chatIdNum) return;
    const un = blocked.byMe;
    if (!un && !(await confirm(`حظر ${otherName}`, "لن يتمكن من مراسلتك ولن تتمكن من مراسلته حتى تُلغي الحظر.", "حظر", true))) return;
    try { await chatApi.block(token, chatIdNum, un); sync.setBlocked({ ...blocked, byMe: !un }); } catch (e: any) { Alert.alert("تعذّر التنفيذ", e?.message); }
  }

  const jumpTo = (id: number) => {
    const idx = listData.findIndex((g) => g.type === "msg" && g.msg.id === id);
    if (idx >= 0) flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.4 });
  };

  // تجميع الرسائل مع فواصل اليوم (+ تصفية البحث)
  const visible = useMemo(() => {
    const q = search.trim();
    return searchOn && q ? messages.filter((m) => !m.deleted_at && m.content?.includes(q)) : messages;
  }, [messages, search, searchOn]);
  const grouped = useMemo(() => {
    const out: Array<{ type: "sep"; label: string; key: string } | { type: "msg"; msg: ChatMsg; key: string }> = [];
    let lastDay = "";
    for (const m of visible) {
      const day = new Date(m.created_at).toDateString();
      if (day !== lastDay) { out.push({ type: "sep", label: daySep(m.created_at), key: `sep-${day}` }); lastDay = day; }
      out.push({ type: "msg", msg: m, key: m.localId || String(m.id) });
    }
    return out;
  }, [visible]);
  // القائمة مقلوبة (الأحدث في الأسفل دائماً) — فلا تختفي الرسائل الواردة خارج الشاشة
  const listData = useMemo(() => [...grouped].reverse(), [grouped]);
  const [newBelow, setNewBelow] = useState(0);
  const prevLast = useRef<number>(0);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    if (prevLast.current && last.id !== prevLast.current && last.sender_id !== myId && !nearBottom.current) setNewBelow((n) => n + 1);
    prevLast.current = last.id;
  }, [messages, myId]);
  const toBottom = () => { setNewBelow(0); nearBottom.current = true; flatRef.current?.scrollToOffset({ offset: 0, animated: true }); };

  const status = other ? presenceText(other.online, other.last_seen_at, other.typing) : "";
  const blockedAny = blocked.byMe || blocked.me;

  return (
    <KeyboardAvoidingView style={[st.container, { paddingTop: insets.top }]} behavior="padding">
      {/* الرأس */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={st.hBtn} accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={22} color={Colors.textPrimary} /></TouchableOpacity>
        <TouchableOpacity onPress={openOtherProfile} disabled={!otherId} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`الصفحة الشخصية لـ ${otherName}`}
          style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
        <View>
          <UserAvatar name={otherName} avatarUrl={otherAvatar} size={42} borderRadius={14} />
          {other?.online ? <View style={st.onlineDot} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5 }}>
            <Text style={st.hName} numberOfLines={1}>{otherName}</Text>
            {state.muted ? <Ionicons name="notifications-off" size={13} color={Colors.textMuted} /> : null}
            {state.pinned ? <Ionicons name="pin" size={13} color={Colors.textMuted} /> : null}
          </View>
          {status ? <Text style={[st.hStatus, (other?.online || other?.typing) && { color: Colors.primary }]} numberOfLines={1}>{status}</Text> : null}
        </View>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={10} style={st.hBtn} onPress={() => { setSearchOn((v) => !v); setSearch(""); }} accessibilityLabel="بحث في المحادثة"><Ionicons name="search" size={19} color={Colors.textPrimary} /></TouchableOpacity>
        <TouchableOpacity hitSlop={10} style={st.hBtn} onPress={startVoiceCall} onLongPress={handlePhoneOptions} disabled={calling || blocked.byMe || blocked.me} accessibilityLabel="مكالمة صوتية">{calling ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="call" size={19} color={Colors.primary} />}</TouchableOpacity>
        <TouchableOpacity hitSlop={10} style={st.hBtn} onPress={() => setMenu(true)} accessibilityLabel="خيارات المحادثة"><Ionicons name="ellipsis-vertical" size={19} color={Colors.textPrimary} /></TouchableOpacity>
      </View>
      {searchOn ? (
        <View style={st.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput autoFocus value={search} onChangeText={setSearch} placeholder="ابحث في الرسائل…" placeholderTextColor={Colors.textMuted} style={st.searchInput} textAlign="right" />
          {search.trim() ? <Text style={st.searchCount}>{visible.length} نتيجة</Text> : null}
        </View>
      ) : null}

      {/* الرسائل */}
      {sync.loading && chatIdNum ? (
        <View style={st.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : listData.length === 0 ? (
        <View style={st.center}>
          <Ionicons name={searchOn ? "search-outline" : "chatbubble-ellipses-outline"} size={54} color={Colors.textMuted} />
          <Text style={st.emptyTitle}>{openError ? "تعذّر فتح المحادثة" : searchOn ? "لا نتائج" : "ابدأ المحادثة"}</Text>
          <Text style={st.emptyText}>{openError || (searchOn ? "جرّب كلمة أخرى" : `أرسل رسالتك الأولى لـ ${otherName}`)}</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
        <FlatList
          ref={flatRef}
          inverted
          data={listData}
          keyExtractor={(i) => i.key}
          contentContainerStyle={[st.list, { paddingTop: 10 }]}
          onScroll={(e) => { const near = e.nativeEvent.contentOffset.y < 160; nearBottom.current = near; if (near && newBelow) setNewBelow(0); }}
          scrollEventThrottle={100}
          onScrollToIndexFailed={() => {}}
          ListHeaderComponent={other?.typing ? (
            <View style={[st.bWrap, st.bWrapOther]}><View style={{ width: 30 }} /><View style={[st.bubble, st.bOther, { paddingVertical: 10 }]}><Text style={st.typingTxt}>يكتب الآن…</Text></View></View>
          ) : null}
          renderItem={({ item, index }) => {
            if (item.type === "sep") return <View style={st.sep}><Text style={st.sepTxt}>{item.label}</Text></View>;
            const m = item.msg; const isMe = m.sender_id === myId;
            const nx = listData[index - 1]; // العنصر الأحدث (القائمة مقلوبة)
            const lastOfGroup = !nx || nx.type === "sep" || nx.msg.sender_id !== m.sender_id;
            return (
              <Bubble msg={m} isMe={isMe} myId={myId} otherName={otherName} otherAvatar={otherAvatar} showAvatar={lastOfGroup && !isMe} onOpenSender={openOtherProfile}
                highlight={searchOn ? search : ""}
                onLong={() => { tap(); setAction(m); }}
                onReplyTap={(id) => { if (searchOn) { setSearchOn(false); setSearch(""); } setTimeout(() => jumpTo(id), 50); }}
                onRetry={() => m.localId && sendText(m.content, m.reply_to ? (messages.find((x) => x.id === m.reply_to!.id) || null) : null, m.localId)} />
            );
          }}
        />
        {newBelow > 0 ? (
          <TouchableOpacity style={st.newPill} onPress={toBottom} activeOpacity={0.85}>
            <Ionicons name="arrow-down" size={15} color="#fff" />
            <Text style={st.newPillTxt}>{newBelow === 1 ? "رسالة جديدة" : `${newBelow} رسائل جديدة`}</Text>
          </TouchableOpacity>
        ) : null}
        </View>
      )}

      {/* شريط الكتابة */}
      {blockedAny ? (
        <View style={[st.blockedBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={st.blockedTxt}>{blocked.byMe ? `حظرت ${otherName}` : "لا يمكنك الرد على هذه المحادثة"}</Text>
          {blocked.byMe ? <TouchableOpacity onPress={toggleBlock}><Text style={st.unblock}>إلغاء الحظر</Text></TouchableOpacity> : null}
        </View>
      ) : (
        <View style={{ backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.divider }}>
          {replyTo || editing ? (
            <View style={st.ctxBar}>
              <View style={[st.ctxLine, editing && { backgroundColor: "#F0B400" }]} />
              <View style={{ flex: 1 }}>
                <Text style={st.ctxTitle}>{editing ? "تعديل الرسالة" : `ردّ على ${replyTo!.sender_id === myId ? "نفسك" : replyTo!.sender_name}`}</Text>
                <Text style={st.ctxTxt} numberOfLines={1}>{(editing || replyTo)!.content || "📷 صورة"}</Text>
              </View>
              <TouchableOpacity onPress={() => { if (editing) setText(""); setEditing(null); setReplyTo(null); }} hitSlop={10} accessibilityLabel="إلغاء"><Ionicons name="close" size={20} color={Colors.textMuted} /></TouchableOpacity>
            </View>
          ) : null}
          <View style={[st.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TouchableOpacity style={[st.sendBtn, (!text.trim() || sending) && st.sendOff]} onPress={handleSend} disabled={!text.trim() || sending} accessibilityLabel={editing ? "حفظ التعديل" : "إرسال"}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={editing ? "checkmark" : "send"} size={18} color="#fff" style={editing ? undefined : { transform: [{ scaleX: -1 }] }} />}
            </TouchableOpacity>
            <TextInput ref={inputRef} style={st.input} placeholder={editing ? "عدّل رسالتك…" : "اكتب رسالة..."} placeholderTextColor={Colors.textMuted}
              value={text} onChangeText={onType} multiline maxLength={2000} textAlign="right" />
            {!editing ? (
              <TouchableOpacity style={st.attach} onPress={handleSendImage} disabled={imgUploading} accessibilityLabel="إرسال صورة">
                {imgUploading ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="image-outline" size={22} color={Colors.textMuted} />}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}

      {/* إجراءات الرسالة */}
      <Modal visible={!!act} transparent animationType="fade" onRequestClose={() => setAction(null)}>
        <Pressable style={st.backdrop} onPress={() => setAction(null)}>
          <Pressable style={[st.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={st.handle} />
            <View style={st.reactRow}>
              {REACTIONS.map((e) => (
                <TouchableOpacity key={e} onPress={() => react(e)} style={[st.reactBtn, act?.reactions?.[String(myId)] === e && st.reactBtnOn]} accessibilityLabel={`تفاعل ${e}`}>
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {act?.content ? <Text style={st.preview} numberOfLines={3}>{act.content}</Text> : null}
            <SheetBtn icon="arrow-undo-outline" label="ردّ" onPress={() => { setReplyTo(act); setEditing(null); setAction(null); setTimeout(() => inputRef.current?.focus(), 150); }} />
            {act?.content ? <SheetBtn icon="share-outline" label="نسخ / مشاركة النص" onPress={() => { const t = act.content; setAction(null); Share.share({ message: t }).catch(() => {}); }} /> : null}
            {canEdit ? <SheetBtn icon="create-outline" label="تعديل" onPress={() => { setEditing(act); setReplyTo(null); setText(act!.content); setAction(null); setTimeout(() => inputRef.current?.focus(), 150); }} /> : null}
            <SheetBtn icon="trash-outline" label="حذف لديّ" danger onPress={() => del("me")} />
            {canDeleteAll ? <SheetBtn icon="trash" label="حذف للجميع" danger onPress={() => del("all")} /> : null}
            {act ? <Text style={st.sheetMeta}>{act.sender_id === myId ? (act.is_read ? `قُرئت ${act.read_at ? timeOf(act.read_at) : ""}` : "أُرسلت — لم تُقرأ بعد") : `من ${act.sender_name}`} · {timeOf(act.created_at)}</Text> : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* قائمة المحادثة */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={st.backdrop} onPress={() => setMenu(false)}>
          <Pressable style={[st.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={st.handle} />
            <Text style={st.sheetTitle}>{otherName}</Text>
            <SheetBtn icon="search-outline" label="بحث في المحادثة" onPress={() => { setMenu(false); setSearchOn(true); }} />
            <SheetBtn icon="call-outline" label="مكالمة صوتية عبر الإنترنت" onPress={() => { setMenu(false); startVoiceCall(); }} />
            <SheetBtn icon="keypad-outline" label="اتصال هاتفي عادي" onPress={() => { setMenu(false); handlePhoneOptions(); }} />
            <SheetBtn icon={state.muted ? "notifications-outline" : "notifications-off-outline"} label={state.muted ? "إلغاء كتم الإشعارات" : "كتم الإشعارات"} onPress={() => toggleState("muted")} />
            <SheetBtn icon={state.pinned ? "pin-outline" : "pin"} label={state.pinned ? "إلغاء التثبيت" : "تثبيت أعلى القائمة"} onPress={() => toggleState("pinned")} />
            <SheetBtn icon={state.hidden ? "eye-outline" : "eye-off-outline"} label={state.hidden ? "إظهار المحادثة" : "إخفاء المحادثة"} onPress={() => toggleState("hidden")} />
            <SheetBtn icon="brush-outline" label="مسح الرسائل لديّ" danger onPress={clearChat} />
            <SheetBtn icon={blocked.byMe ? "lock-open-outline" : "hand-left-outline"} label={blocked.byMe ? "إلغاء الحظر" : `حظر ${otherName}`} danger={!blocked.byMe} onPress={toggleBlock} />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function SheetBtn({ icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={st.sheetBtn}>
      <Ionicons name={icon} size={20} color={danger ? "#C62828" : Colors.textPrimary} />
      <Text style={[st.sheetBtnTxt, danger && { color: "#C62828" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.divider, backgroundColor: Colors.bg },
  hBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },
  onlineDot: { position: "absolute", bottom: -1, left: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: "#22C55E", borderWidth: 2, borderColor: Colors.bg },
  hName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", flexShrink: 1 },
  hStatus: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right", marginTop: -2 },
  searchBar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, paddingVertical: 0 },
  searchCount: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textPrimary },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  list: { paddingHorizontal: 10, paddingTop: 10, flexGrow: 1 },
  sep: { alignItems: "center", marginVertical: 10 },
  sepTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textMuted, backgroundColor: Colors.cardBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 3, overflow: "hidden" },
  bWrap: { marginVertical: 2, flexDirection: "row-reverse", alignItems: "flex-end", gap: 4 },
  bWrapMe: { justifyContent: "flex-end" },
  bWrapOther: { justifyContent: "flex-start" },
  bubble: { borderRadius: 18, paddingHorizontal: 13, paddingTop: 8, paddingBottom: 5 },
  bMe: { backgroundColor: Colors.primary, borderBottomLeftRadius: 5 },
  bOther: { backgroundColor: Colors.cardBgElevated, borderBottomRightRadius: 5 },
  bDeleted: { opacity: 0.75 },
  bHit: { borderWidth: 2, borderColor: "#F0B400" },
  quote: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, marginBottom: 5, borderRightWidth: 3 },
  quoteMe: { backgroundColor: "rgba(0,0,0,0.14)", borderRightColor: "#BFF5DC" },
  quoteOther: { backgroundColor: Colors.bg, borderRightColor: Colors.primary },
  quoteName: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: Colors.primary, textAlign: "right" },
  quoteTxt: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  img: { width: 220, height: 200, borderRadius: 12, marginBottom: 4 },
  txt: { fontFamily: "Cairo_400Regular", fontSize: 15, lineHeight: 23, textAlign: "right" },
  deletedTxt: { fontFamily: "Cairo_400Regular", fontSize: 13.5, fontStyle: "italic", color: Colors.textMuted },
  meta: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", gap: 4, marginTop: 2 },
  metaTxt: { fontFamily: "Cairo_400Regular", fontSize: 10.5 },
  metaMe: { color: "rgba(255,255,255,0.7)" },
  metaOther: { color: Colors.textMuted },
  reacts: { flexDirection: "row-reverse", gap: 3, marginTop: -6, marginHorizontal: 8 },
  react: { backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: Colors.divider },
  reactMine: { borderColor: Colors.primary },
  reactTxt: { fontSize: 13 },
  retry: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: "#C62828", textAlign: "left", marginTop: 2 },
  typingTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  ctxBar: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 8 },
  ctxLine: { width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: Colors.primary },
  ctxTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary, textAlign: "right" },
  ctxTxt: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  inputBar: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 8 },
  attach: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.divider },
  input: { flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 16, paddingVertical: 9, fontFamily: "Cairo_400Regular", fontSize: 14.5, color: Colors.textPrimary, textAlignVertical: "center" },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  sendOff: { backgroundColor: Colors.divider },
  blockedBar: { alignItems: "center", gap: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.divider },
  blockedTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textMuted },
  unblock: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginBottom: 6 },
  reactRow: { flexDirection: "row-reverse", justifyContent: "space-between", backgroundColor: Colors.cardBg, borderRadius: 30, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 10 },
  reactBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  reactBtnOn: { backgroundColor: Colors.primary + "22" },
  preview: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", backgroundColor: Colors.cardBg, borderRadius: 12, padding: 10, marginBottom: 6 },
  sheetBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sheetBtnTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  sheetMeta: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", marginTop: 10 },
  newPill: { position: "absolute", bottom: 12, alignSelf: "center", flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  newPillTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
});
