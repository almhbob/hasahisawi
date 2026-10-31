import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Pressable, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import GuestGate from "@/components/GuestGate";
import Colors from "@/constants/colors";
import UserAvatar from "@/components/UserAvatar";
import OrgInviteCard from "@/components/OrgInviteCard";
import ModernHeader from "@/components/ui/ModernHeader";
import { LoadError } from "@/components/ui/LoadState";

import {
  apiGetUsers, apiGetOrCreateChat, apiMarkRead,
  getOtherUser, ApiUser,
} from "@/lib/api-chat";
import { useChatList, chatApi, type ChatListItem } from "@/lib/chat-plus";

type ApiChat = ChatListItem;
const getMyUnread = (c: ChatListItem, _myId: number) => c.unread || 0;

// ── مساعدات ──────────────────────────────────────────────────────────────────

function formatTime(ts: string | null): string {
  if (!ts) return "";
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return "الآن";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} د`;
  if (diff < 86_400_000) return date.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("ar", { day: "numeric", month: "short" });
}

// ── بطاقة محادثة ─────────────────────────────────────────────────────────────

function ChatCard({
  chat, myId, onPress, onLongPress,
}: {
  chat: ApiChat;
  myId: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const other = getOtherUser(chat as any, myId);
  const unread = getMyUnread(chat, myId);
  const isMe = chat.last_sender_id === myId;

  return (
    <TouchableOpacity style={[styles.chatCard, chat.pinned && { backgroundColor: Colors.primary + "08" }]} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.75} delayLongPress={350}>
      <View>
        <UserAvatar name={other.name} avatarUrl={other.avatar} size={52} borderRadius={16} />
        {chat.other_online ? <View style={styles.onlineDot} /> : null}
      </View>
      <View style={styles.chatInfo}>
        <View style={styles.chatRow}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, flex: 1 }}>
            <Text style={[styles.chatName, { flexShrink: 1 }]} numberOfLines={1}>{other.name}</Text>
            {chat.pinned ? <Ionicons name="pin" size={12} color={Colors.textMuted} /> : null}
            {chat.muted ? <Ionicons name="notifications-off" size={12} color={Colors.textMuted} /> : null}
          </View>
          <Text style={[styles.chatTime, unread > 0 && { color: Colors.primary }]}>{formatTime(chat.last_message_at)}</Text>
        </View>
        <View style={styles.chatRow}>
          {chat.other_typing ? (
            <Text style={[styles.lastMsg, { color: Colors.primary, fontFamily: "Cairo_600SemiBold" }]} numberOfLines={1}>يكتب الآن…</Text>
          ) : (
            <Text style={[styles.lastMsg, unread > 0 && styles.lastMsgUnread]} numberOfLines={1}>
              {isMe ? "أنت: " : ""}{chat.blocked_by_me ? "محظور" : chat.last_message || "ابدأ المحادثة"}
            </Text>
          )}
          {unread > 0 && (
            <View style={[styles.badge, chat.muted && { backgroundColor: Colors.textMuted }]}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── مودال اختيار مستخدم ──────────────────────────────────────────────────────

function NewChatModal({
  visible, onClose, myId, token,
}: {
  visible: boolean;
  onClose: () => void;
  myId: number;
  token: string;
}) {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [starting, setStarting] = useState<number | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setLoadFailed(false);
    apiGetUsers(token)
      .then((u) => { setUsers(u); setLoading(false); })
      .catch(() => { setLoadFailed(true); setLoading(false); });
  }, [visible, token, reloadKey]);

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function startChat(other: ApiUser) {
    setStarting(other.id);
    try {
      const chat = await apiGetOrCreateChat(token, other.id);
      onClose();
      router.push({
        pathname: "/conversation",
        params: { chatId: String(chat.id), otherName: other.name },
      } as any);
    } catch {
      Alert.alert("خطأ", "تعذّر بدء المحادثة");
    } finally {
      setStarting(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>محادثة جديدة</Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="ابحث عن مستخدم..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                cursorColor={Colors.primary}
                selectionColor={Colors.primary + "60"}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
            ) : loadFailed && users.length === 0 ? (
              <LoadError onRetry={() => setReloadKey(k => k + 1)} message="تعذّر تحميل قائمة المستخدمين" />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(i) => String(i.id)}
                contentContainerStyle={{ paddingBottom: 32 }}
                ListEmptyComponent={
                  <View style={styles.emptyWrap}>
                    <Ionicons name="people-outline" size={42} color={Colors.textMuted} />
                    <Text style={styles.emptyText}>لا يوجد مستخدمون</Text>
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userItem}
                    onPress={() => startChat(item)}
                    disabled={starting === item.id}
                    activeOpacity={0.75}
                  >
                    <UserAvatar name={item.name} avatarUrl={item.avatar_url} size={42} borderRadius={13} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{item.name}</Text>
                      <Text style={styles.userRole}>{item.role === "admin" ? "مدير" : "عضو"}</Text>
                    </View>
                    {starting === item.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <View style={styles.startChatBtn}>
                        <Ionicons name="chatbubble-outline" size={15} color={Colors.primary} />
                        <Text style={styles.startChatBtnText}>محادثة</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── الشاشة الرئيسية ───────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, isGuest } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "unread" | "hidden">("all");
  const [sheet, setSheet] = useState<ApiChat | null>(null);

  const myId = user?.id ?? 0;
  const { chats: allChats, setChats, loading, refresh } = useChatList(isGuest ? null : token);
  const chats = allChats.filter((c) => (filterTab === "hidden" ? c.hidden : !c.hidden));
  const hiddenCount = allChats.filter((c) => c.hidden).length;
  const hiddenUnread = allChats.filter((c) => c.hidden).reduce((s2, c) => s2 + (c.unread || 0), 0);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const totalUnread = chats.reduce((sum, c) => sum + getMyUnread(c, myId), 0);

  const filteredChats = chats.filter((c) => {
    const other = getOtherUser(c as any, myId);
    const q = search.trim().toLowerCase();
    const matchSearch = !q || other.name.toLowerCase().includes(q) || (c.last_message || "").toLowerCase().includes(q);
    const matchTab = filterTab !== "unread" || getMyUnread(c, myId) > 0;
    return matchSearch && matchTab;
  });

  if (isGuest) {
    return <GuestGate title="سجّل الدخول للوصول إلى الدردشة والتواصل مع أهالي الحصاحيصا" />;
  }

  if (!token) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  function openConversation(chat: ApiChat) {
    const other = getOtherUser(chat as any, myId);
    router.push({
      pathname: "/conversation",
      params: { chatId: String(chat.id), otherName: other.name, otherAvatar: other.avatar ?? "" },
    } as any);
  }

  function handleLongPress(chat: ApiChat) { setSheet(chat); }

  async function chatAction(chat: ApiChat, kind: "read" | "pinned" | "muted" | "hidden" | "clear") {
    setSheet(null);
    if (!token) return;
    try {
      if (kind === "read") { await apiMarkRead(token, chat.id); setChats((l) => l.map((c) => c.id === chat.id ? { ...c, unread: 0 } : c)); return; }
      if (kind === "clear") {
        const go = async () => { await chatApi.clear(token, chat.id); refresh(); };
        if (Platform.OS === "web") { if ((globalThis as any).confirm?.("مسح رسائل المحادثة لديك؟")) await go(); return; }
        Alert.alert("مسح المحادثة", "ستُمسح الرسائل من جهازك فقط.", [{ text: "إلغاء", style: "cancel" }, { text: "مسح", style: "destructive", onPress: () => { go().catch(() => {}); } }]);
        return;
      }
      const v = !chat[kind];
      setChats((l) => l.map((c) => c.id === chat.id ? { ...c, [kind]: v } : c));
      await chatApi.state(token, chat.id, { [kind]: v });
      refresh();
    } catch (e: any) { Alert.alert("تعذّر التنفيذ", e?.message || "حاول مجدداً"); refresh(); }
  }

  return (
    <View style={styles.container}>
      <ModernHeader
        title="الدردشة"
        icon="chatbubbles-outline"
        rightSlot={
          <TouchableOpacity style={styles.newBtn} onPress={() => setModalVisible(true)} activeOpacity={0.8}>
            <Ionicons name="create-outline" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInputMain}
          placeholder="بحث في المحادثات..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          cursorColor={Colors.primary}
          selectionColor={Colors.primary + "60"}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, filterTab === "all" && styles.tabBtnActive]}
          onPress={() => setFilterTab("all")}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabText, filterTab === "all" && styles.tabTextActive]}>الكل</Text>
          {totalUnread > 0 && filterTab !== "all" && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{totalUnread > 99 ? "99+" : totalUnread}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, filterTab === "unread" && styles.tabBtnActive]}
          onPress={() => setFilterTab("unread")}
          activeOpacity={0.75}
        >
          <Text style={[styles.tabText, filterTab === "unread" && styles.tabTextActive]}>غير مقروء</Text>
          {totalUnread > 0 && (
            <View style={[styles.tabBadge, filterTab === "unread" && { backgroundColor: "rgba(255,255,255,0.3)" }]}>
              <Text style={styles.tabBadgeText}>{totalUnread > 99 ? "99+" : totalUnread}</Text>
            </View>
          )}
        </TouchableOpacity>
        {hiddenCount > 0 || filterTab === "hidden" ? (
          <TouchableOpacity style={[styles.tabBtn, filterTab === "hidden" && styles.tabBtnActive]} onPress={() => setFilterTab("hidden")} activeOpacity={0.75}>
            <Ionicons name="eye-off-outline" size={14} color={filterTab === "hidden" ? "#fff" : Colors.textSecondary} />
            <Text style={[styles.tabText, filterTab === "hidden" && styles.tabTextActive]}>المخفية ({hiddenCount})</Text>
            {hiddenUnread > 0 ? <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{hiddenUnread}</Text></View> : null}
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : chats.length === 0 && filterTab === "hidden" ? (
        <View style={styles.center}>
          <Ionicons name="eye-off-outline" size={56} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>لا توجد محادثات مخفية</Text>
          <TouchableOpacity style={styles.startBtn} onPress={() => setFilterTab("all")}><Text style={styles.startBtnText}>عرض الكل</Text></TouchableOpacity>
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>لا توجد محادثات بعد</Text>
          <Text style={styles.emptyText}>ابدأ محادثة جديدة مع أحد أهالي الحصاحيصا</Text>
          <TouchableOpacity style={styles.startBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.startBtnText}>ابدأ محادثة</Text>
          </TouchableOpacity>
        </View>
      ) : filteredChats.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name={filterTab === "unread" ? "checkmark-done-outline" : "search-outline"}
            size={56}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            {filterTab === "unread" ? "لا توجد رسائل غير مقروءة" : "لا توجد نتائج"}
          </Text>
          <Text style={styles.emptyText}>
            {filterTab === "unread" ? "أنت على اطلاع تام!" : `لا يوجد ما يطابق "${search}"`}
          </Text>
          {filterTab === "unread" ? (
            <TouchableOpacity style={styles.startBtn} onPress={() => setFilterTab("all")}>
              <Text style={styles.startBtnText}>عرض الكل</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16, paddingTop: 8 }}
          ListFooterComponent={<OrgInviteCard />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
              <ChatCard
                chat={item}
                myId={myId}
                onPress={() => openConversation(item)}
                onLongPress={() => handleLongPress(item)}
              />
            </Animated.View>
          )}
        />
      )}

      {chats.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 20 }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="create" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {sheet ? (<>
              <Text style={styles.sheetTitle}>{getOtherUser(sheet as any, myId).name}</Text>
              {[
                ["chatbubble-outline", "فتح المحادثة", () => { const c = sheet; setSheet(null); openConversation(c); }],
                ...(sheet.unread > 0 ? [["checkmark-done-outline", "تعليم كمقروء", () => chatAction(sheet, "read")]] : []),
                [sheet.pinned ? "pin-outline" : "pin", sheet.pinned ? "إلغاء التثبيت" : "تثبيت أعلى القائمة", () => chatAction(sheet, "pinned")],
                [sheet.muted ? "notifications-outline" : "notifications-off-outline", sheet.muted ? "إلغاء الكتم" : "كتم الإشعارات", () => chatAction(sheet, "muted")],
                [sheet.hidden ? "eye-outline" : "eye-off-outline", sheet.hidden ? "إظهار المحادثة" : "إخفاء المحادثة", () => chatAction(sheet, "hidden")],
                ["brush-outline", "مسح الرسائل لديّ", () => chatAction(sheet, "clear")],
              ].map(([icon, label, fn]: any) => (
                <TouchableOpacity key={label} onPress={fn} style={styles.sheetBtn}>
                  <Ionicons name={icon} size={20} color={label.startsWith("مسح") ? "#C62828" : Colors.textPrimary} />
                  <Text style={[styles.sheetBtnTxt, label.startsWith("مسح") && { color: "#C62828" }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </>) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {token && (
        <NewChatModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          myId={myId}
          token={token}
        />
      )}
    </View>
  );
}

// ── الأنماط ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  onlineDot: { position: "absolute", bottom: 0, left: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: "#22C55E", borderWidth: 2, borderColor: Colors.bg },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 12 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginBottom: 6 },
  sheetBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sheetBtnTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  newBtn: {
    width: 38, height: 38,
    borderRadius: Colors.radius.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Search bar
  searchWrap: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.cardBg,
    borderRadius: Colors.radius.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Colors.shadow.card,
  },
  searchInputMain: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
    includeFontPadding: false,
  },

  // Filter tabs
  tabRow: {
    flexDirection: "row-reverse",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tabBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: Colors.radius.pill,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { color: "#fff" },
  tabBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Colors.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  tabBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },

  chatCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: Colors.cardBg,
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: Colors.radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Colors.shadow.card,
  },
  chatInfo: { flex: 1 },
  chatRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chatName: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  chatTime: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  lastMsg: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2, textAlign: "right" },
  lastMsgUnread: { color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold" },
  badge: {
    minWidth: 20, height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    marginTop: 2,
  },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },

  emptyTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textPrimary, textAlign: "center" },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 10 },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Colors.radius.md,
  },
  startBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: "#fff" },

  fab: {
    position: "absolute",
    right: 20,
    width: 56, height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: Colors.radius.xl,
    borderTopRightRadius: Colors.radius.xl,
    maxHeight: "82%",
    paddingTop: 8,
  },
  modalHandle: {
    width: 44, height: 4, borderRadius: 2,
    backgroundColor: Colors.divider,
    alignSelf: "center",
    marginTop: 8, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  searchBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    margin: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.bg,
    borderRadius: Colors.radius.md,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right", includeFontPadding: false },
  userItem: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  userName: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  userRole: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  startChatBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Colors.radius.pill,
    backgroundColor: Colors.primary + "15",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
  },
  startChatBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },
});
