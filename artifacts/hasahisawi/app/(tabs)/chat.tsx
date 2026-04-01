import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Pressable, ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import GuestGate from "@/components/GuestGate";
import Colors from "@/constants/colors";
import UserAvatar from "@/components/UserAvatar";
import {
  useApiChats, apiGetUsers, apiGetOrCreateChat,
  getOtherUser, getMyUnread, ApiChat, ApiUser,
} from "@/lib/api-chat";

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

function ChatCard({ chat, myId, onPress }: { chat: ApiChat; myId: number; onPress: () => void }) {
  const other = getOtherUser(chat, myId);
  const unread = getMyUnread(chat, myId);
  const isMe = chat.last_sender_id === myId;

  return (
    <TouchableOpacity style={styles.chatCard} onPress={onPress} activeOpacity={0.75}>
      <UserAvatar name={other.name} avatarUrl={other.avatar} size={52} borderRadius={16} />
      <View style={styles.chatInfo}>
        <View style={styles.chatRow}>
          <Text style={styles.chatName} numberOfLines={1}>{other.name}</Text>
          <Text style={styles.chatTime}>{formatTime(chat.last_message_at)}</Text>
        </View>
        <View style={styles.chatRow}>
          <Text style={[styles.lastMsg, unread > 0 && styles.lastMsgUnread]} numberOfLines={1}>
            {isMe ? "أنت: " : ""}{chat.last_message || "ابدأ المحادثة"}
          </Text>
          {unread > 0 && (
            <View style={styles.badge}>
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
  const [starting, setStarting] = useState<number | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setLoading(true);
    apiGetUsers(token)
      .then((u) => { setUsers(u); setLoading(false); })
      .catch(() => setLoading(false));
  }, [visible, token]);

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
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
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
            />
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(i) => String(i.id)}
              contentContainerStyle={{ paddingBottom: 32 }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>لا يوجد مستخدمون</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userItem}
                  onPress={() => startChat(item)}
                  disabled={starting === item.id}
                  activeOpacity={0.75}
                >
                  <UserAvatar name={item.name} avatarUrl={item.avatar_url} size={42} borderRadius={13} />
                  <Text style={styles.userName}>{item.name}</Text>
                  {starting === item.id ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Ionicons name="chatbubble-outline" size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── الشاشة الرئيسية ───────────────────────────────────────────────────────────

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, isGuest } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);

  const myId = user?.id ?? 0;
  const { chats, loading, refresh } = useApiChats(isGuest ? null : token);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  if (isGuest) {
    return <GuestGate title="سجّل الدخول للوصول إلى الدردشة والتواصل مع أهالي الحصاحيصا" />;
  }

  if (!token) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  function openConversation(chat: ApiChat) {
    const other = getOtherUser(chat, myId);
    router.push({
      pathname: "/conversation",
      params: { chatId: String(chat.id), otherName: other.name, otherAvatar: other.avatar ?? "" },
    } as any);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>الدردشة</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setModalVisible(true)} activeOpacity={0.8}>
          <Ionicons name="create-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
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
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16, paddingTop: 8 }}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
              <ChatCard chat={item} myId={myId} onPress={() => openConversation(item)} />
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  newBtn: {
    width: 38, height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: Colors.cardBg,
    marginHorizontal: 12,
    marginVertical: 5,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.divider,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 48, height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary + "20",
    borderWidth: 1.5,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.primary },
  chatInfo: { flex: 1 },
  chatRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chatName: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary },
  chatTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  lastMsg: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
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
  separator: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 20 },
  emptyTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textPrimary, textAlign: "center" },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: "#0F1E16",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  userItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 12 },
  userAvatar: {
    width: 42, height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary + "20",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 15, color: Colors.textPrimary },
});
