import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import UserAvatar from "@/components/UserAvatar";
import { isFirebaseAvailable } from "@/lib/firebase/index";
import { uploadPostImage } from "@/lib/firebase/storage";
import { useApiMessages, apiSendMessage, apiMarkRead, ApiMessage } from "@/lib/api-chat";

// ── مساعدات ──────────────────────────────────────────────────────────────────

function formatMsgTime(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

function formatDaySeparator(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "اليوم";
  if (d.toDateString() === yesterday.toDateString()) return "أمس";
  return d.toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "long" });
}

// ── فقاعة رسالة ──────────────────────────────────────────────────────────────

function MessageBubble({
  msg, isMe, showAvatar, otherName, otherAvatar,
}: {
  msg: ApiMessage;
  isMe: boolean;
  showAvatar: boolean;
  otherName: string;
  otherAvatar: string | null;
}) {
  return (
    <Animated.View
      entering={FadeInUp.springify().duration(280)}
      style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}
    >
      {!isMe && (
        <View style={styles.bubbleAvatarCol}>
          {showAvatar
            ? <UserAvatar name={otherName} avatarUrl={otherAvatar} size={28} borderRadius={8} />
            : <View style={{ width: 28 }} />}
        </View>
      )}
      <View style={styles.bubbleContent}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          {msg.type === "image" && msg.image_url ? (
            <Image source={{ uri: msg.image_url }} style={styles.msgImage} resizeMode="cover" />
          ) : null}
          {msg.content ? (
            <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>
              {msg.content}
            </Text>
          ) : null}
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>
              {formatMsgTime(msg.created_at)}
            </Text>
            {isMe && (
              <Ionicons
                name={msg.is_read ? "checkmark-done" : "checkmark"}
                size={12}
                color={msg.is_read ? "#A0EBC5" : "rgba(255,255,255,0.5)"}
                style={{ marginRight: 2 }}
              />
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ── الشاشة ────────────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ chatId: string; otherName: string; otherAvatar?: string }>();
  const { chatId, otherName, otherAvatar } = params;
  const { user, token } = useAuth();

  const myId = user?.id ?? 0;
  const chatIdNum = chatId ? parseInt(chatId) : null;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const { messages, loading } = useApiMessages(token ?? null, chatIdNum);

  useFocusEffect(
    useCallback(() => {
      if (chatIdNum && token) {
        apiMarkRead(token, chatIdNum).catch(() => {});
      }
    }, [chatIdNum, token]),
  );

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  async function handleSend() {
    if (!text.trim() || !chatIdNum || !token || sending) return;
    setSending(true);
    const t = text.trim();
    setText("");
    try {
      await apiSendMessage(token, chatIdNum, t);
    } catch {
      Alert.alert("خطأ", "تعذّر إرسال الرسالة");
      setText(t);
    } finally {
      setSending(false);
    }
  }

  async function handleSendImage() {
    if (!chatIdNum || !token) return;
    if (!isFirebaseAvailable()) {
      Alert.alert("غير متاح", "إرسال الصور يتطلب Firebase");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("الإذن مطلوب", "يرجى السماح بالوصول للمعرض"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false, quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setImgUploading(true);
    try {
      const url = await uploadPostImage(String(myId), result.assets[0].uri);
      await apiSendMessage(token, chatIdNum, "", url);
    } catch {
      Alert.alert("خطأ", "تعذّر إرسال الصورة");
    } finally {
      setImgUploading(false);
    }
  }

  // تجميع الرسائل مع فواصل اليوم
  const grouped: Array<{ type: "separator"; label: string } | { type: "msg"; msg: ApiMessage }> = [];
  let lastDay = "";
  for (const msg of messages) {
    const day = new Date(msg.created_at).toDateString();
    if (day !== lastDay) {
      grouped.push({ type: "separator", label: formatDaySeparator(msg.created_at) });
      lastDay = day;
    }
    grouped.push({ type: "msg", msg });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* الرأس */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <UserAvatar
          name={otherName ?? "م"}
          avatarUrl={otherAvatar || null}
          size={40}
          borderRadius={13}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{otherName ?? "محادثة"}</Text>
          <Text style={styles.headerStatus}>عضو نشط</Text>
        </View>
        <TouchableOpacity hitSlop={10} style={styles.headerAction}>
          <Ionicons name="call-outline" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* الرسائل */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={grouped}
          keyExtractor={(item, idx) =>
            item.type === "separator" ? `sep-${idx}` : String(item.msg.id)
          }
          contentContainerStyle={[styles.msgList, { paddingBottom: insets.bottom + 8 }]}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubble-ellipses-outline" size={56} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>ابدأ المحادثة</Text>
              <Text style={styles.emptyText}>أرسل رسالتك الأولى لـ {otherName}</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            if (item.type === "separator") {
              return (
                <View style={styles.daySep}>
                  <View style={styles.daySepLine} />
                  <Text style={styles.daySepText}>{item.label}</Text>
                  <View style={styles.daySepLine} />
                </View>
              );
            }
            const msg = item.msg;
            const isMe = msg.sender_id === myId;
            // عرض الأفاتار عند تغيير المرسل أو آخر رسالة
            const nextItem = grouped[index + 1];
            const isLast = !nextItem || nextItem.type === "separator" ||
              (nextItem.type === "msg" && nextItem.msg.sender_id !== msg.sender_id);
            return (
              <MessageBubble
                msg={msg}
                isMe={isMe}
                showAvatar={isLast && !isMe}
                otherName={otherName ?? "م"}
                otherAvatar={otherAvatar || null}
              />
            );
          }}
        />
      )}

      {/* شريط الكتابة */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={handleSendImage}
          disabled={imgUploading}
          activeOpacity={0.75}
        >
          {imgUploading
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <Ionicons name="image-outline" size={22} color={Colors.textMuted} />}
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="اكتب رسالة..."
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          textAlign="right"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── الأنماط ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: Colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInfo: { flex: 1 },
  headerName: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary },
  headerStatus: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.primary, marginTop: 1 },
  headerAction: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: Colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textPrimary },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  msgList: { paddingHorizontal: 12, paddingTop: 12, flexGrow: 1 },

  // فاصل اليوم
  daySep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 12,
    paddingHorizontal: 4,
  },
  daySepLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
  daySepText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    paddingHorizontal: 4,
  },

  // فقاعة
  bubbleWrap: { marginVertical: 2, flexDirection: "row", alignItems: "flex-end" },
  bubbleWrapMe: { justifyContent: "flex-end" },
  bubbleWrapOther: { justifyContent: "flex-start" },
  bubbleAvatarCol: { marginLeft: 0, marginRight: 6, alignSelf: "flex-end", marginBottom: 2 },
  bubbleContent: { maxWidth: "78%" },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    paddingBottom: 5,
  },
  bubbleMe: { backgroundColor: Colors.primary, borderBottomRightRadius: 5 },
  bubbleOther: { backgroundColor: Colors.cardBgElevated, borderBottomLeftRadius: 5 },
  msgImage: { width: 200, height: 180, borderRadius: 12, marginBottom: 4 },
  msgText: { fontFamily: "Cairo_400Regular", fontSize: 15, lineHeight: 23 },
  msgTextMe: { color: "#fff" },
  msgTextOther: { color: Colors.textPrimary },
  msgMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 2 },
  msgTime: { fontFamily: "Cairo_400Regular", fontSize: 10 },
  msgTimeMe: { color: "rgba(255,255,255,0.65)" },
  msgTimeOther: { color: Colors.textMuted },

  // شريط الكتابة
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  attachBtn: {
    width: 38, height: 38,
    borderRadius: 12,
    backgroundColor: Colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlignVertical: "center",
  },
  sendBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  sendBtnDisabled: { backgroundColor: Colors.cardBg, shadowOpacity: 0, elevation: 0 },
});
