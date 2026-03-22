import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
  Alert, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import { useMessages, sendMessage, markChatRead, ChatMessage } from "@/lib/firebase/chat";
import { uploadFile } from "@/lib/firebase/storage";

// ── مساعدات ──────────────────────────────────────────────────────────────────

function formatMsgTime(ts: any): string {
  if (!ts) return "";
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

// ── فقاعة رسالة ──────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe }: { msg: ChatMessage; isMe: boolean }) {
  return (
    <Animated.View
      entering={FadeInUp.springify().duration(300)}
      style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther]}
    >
      {!isMe && (
        <Text style={styles.senderName}>{msg.senderName}</Text>
      )}
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        {msg.type === "image" && msg.imageUrl ? (
          <Image source={{ uri: msg.imageUrl }} style={styles.msgImage} resizeMode="cover" />
        ) : null}
        {msg.text ? (
          <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>
            {msg.text}
          </Text>
        ) : null}
        <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>
          {formatMsgTime(msg.createdAt)}
          {isMe && (
            <Text> {msg.readBy.length > 1 ? " ✓✓" : " ✓"}</Text>
          )}
        </Text>
      </View>
    </Animated.View>
  );
}

// ── الشاشة ────────────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ chatId: string; otherName: string }>();
  const { chatId, otherName } = params;
  const { user } = useAuth();

  const myUid  = user?.firebaseUid ?? String(user?.id ?? "");
  const myName = user?.name ?? "مستخدم";
  const otherUid = chatId?.replace(myUid, "").replace("_", "") ?? "";

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const flatRef = useRef<FlatList>(null);

  const { messages, loading } = useMessages(chatId ?? null);

  // تعليم مقروءة عند الدخول
  useFocusEffect(
    useCallback(() => {
      if (chatId && myUid) {
        markChatRead(chatId, myUid).catch(() => {});
      }
    }, [chatId, myUid]),
  );

  // التمرير للأسفل عند وصول رسائل جديدة
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  async function handleSend() {
    if (!text.trim() || !chatId || sending) return;
    setSending(true);
    const t = text.trim();
    setText("");
    try {
      await sendMessage(chatId, myUid, myName, otherUid, t);
    } catch {
      Alert.alert("خطأ", "تعذّر إرسال الرسالة");
      setText(t);
    } finally {
      setSending(false);
    }
  }

  async function handlePickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    if (!chatId) return;

    setSending(true);
    try {
      const uri = result.assets[0].uri;
      const url = await uploadFile(
        `chats/${chatId}/${Date.now()}.jpg`,
        uri,
        (p) => setUploadProgress(p.percent),
      );
      setUploadProgress(null);
      await sendMessage(chatId, myUid, myName, otherUid, "", url);
    } catch {
      Alert.alert("خطأ", "تعذّر إرسال الصورة");
      setUploadProgress(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      {/* الرأس */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{otherName?.charAt(0) ?? "م"}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{otherName ?? "محادثة"}</Text>
          <Text style={styles.headerStatus}>متصل</Text>
        </View>
      </View>

      {/* الرسائل */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[
            styles.msgList,
            { paddingBottom: insets.bottom + 8 },
          ]}
          onContentSizeChange={() =>
            flatRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="chatbubble-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>ابدأ المحادثة...</Text>
            </View>
          }
          renderItem={({ item }) => (
            <MessageBubble msg={item} isMe={item.senderId === myUid} />
          )}
        />
      )}

      {/* شريط الكتابة */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {/* زر الصورة */}
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={handlePickImage}
          disabled={sending}
          activeOpacity={0.75}
        >
          {uploadProgress !== null ? (
            <Text style={styles.progressText}>{uploadProgress}%</Text>
          ) : (
            <Ionicons name="image-outline" size={22} color={Colors.primary} />
          )}
        </TouchableOpacity>

        {/* حقل النص */}
        <TextInput
          style={styles.input}
          placeholder="اكتب رسالة..."
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          textAlign="right"
          onSubmitEditing={handleSend}
        />

        {/* زر الإرسال */}
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
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  headerAvatar: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + "25",
    borderWidth: 1.5,
    borderColor: Colors.primary + "50",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: Colors.primary,
  },
  headerInfo: { flex: 1 },
  headerName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
    color: Colors.textPrimary,
  },
  headerStatus: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.primary,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  msgList: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 4,
    flexGrow: 1,
  },
  bubbleWrap: {
    marginVertical: 3,
    maxWidth: "78%",
  },
  bubbleWrapMe: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubbleWrapOther: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 6,
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.cardBgElevated,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
    color: Colors.primary,
    marginBottom: 2,
    marginLeft: 4,
  },
  msgImage: {
    width: 200,
    height: 160,
    borderRadius: 12,
    marginBottom: 4,
  },
  msgText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    lineHeight: 22,
  },
  msgTextMe: { color: "#fff" },
  msgTextOther: { color: Colors.textPrimary },
  msgTime: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  msgTimeMe: { color: "rgba(255,255,255,0.7)" },
  msgTimeOther: { color: Colors.textMuted },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    backgroundColor: Colors.bg,
  },
  attachBtn: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  progressText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: Colors.primary,
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
  sendBtnDisabled: {
    backgroundColor: Colors.cardBg,
    shadowOpacity: 0,
    elevation: 0,
  },
  emptyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
