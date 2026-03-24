import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView,
  Platform, FlatList,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import BrandPattern from "@/components/BrandPattern";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
};

type GeminiPart = { text: string };
type GeminiContent = { role: string; parts: GeminiPart[] };

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  text: "مرحباً بك في مساعد حصاحيصاوي الذكي 👋\n\nأنا هنا لمساعدتك في:\n• معلومات عن مدينة الحصاحيصا\n• الخدمات المتاحة في التطبيق\n• الإجابة على استفساراتك\n\nكيف يمكنني مساعدتك اليوم؟",
  timestamp: new Date(),
};

export default function AiSupportScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [checkingEnabled, setCheckingEnabled] = useState(true);
  const scrollRef = useRef<FlatList>(null);

  useEffect(() => {
    checkAiEnabled();
  }, []);

  const checkAiEnabled = async () => {
    try {
      const base = getApiUrl();
      if (!base) { setEnabled(false); setCheckingEnabled(false); return; }
      const res = await fetch(`${base}api/ai/status`);
      if (res.ok) {
        const data = await res.json() as { enabled: boolean };
        setEnabled(data.enabled);
      } else {
        setEnabled(false);
      }
    } catch {
      setEnabled(false);
    } finally {
      setCheckingEnabled(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const base = getApiUrl();
      if (!base) throw new Error("API غير متاح");

      const history: GeminiContent[] = messages
        .filter(m => m.id !== "welcome")
        .map(m => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.text }],
        }));

      const res = await fetch(`${base}api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await res.json() as { reply?: string; error?: string };
      const reply = data.reply || data.error || "حدث خطأ غير متوقع";

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: reply,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: "عذراً، حدث خطأ في الاتصال. يرجى المحاولة مجدداً.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100);
    }
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });

  if (checkingEnabled) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (enabled === false) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <BrandPattern variant="diagonal" opacity={0.025} />
        <LinearGradient colors={["#0D1A12", "#0D1A12CC", "transparent"]} style={s.headerGrad}>
          <View style={s.header}>
            <Ionicons name="sparkles" size={24} color={Colors.primary} />
            <Text style={s.headerTitle}>المساعد الذكي</Text>
          </View>
        </LinearGradient>
        <View style={s.disabledWrap}>
          <View style={s.disabledIcon}>
            <Ionicons name="construct-outline" size={48} color={Colors.textMuted} />
          </View>
          <Text style={s.disabledTitle}>الخدمة غير مفعّلة</Text>
          <Text style={s.disabledSub}>
            يمكن للإدارة تفعيل خدمة الذكاء الاصطناعي من لوحة الإدارة → إعدادات الذكاء الاصطناعي
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.bottom + 10}
    >
      <BrandPattern variant="diagonal" opacity={0.025} />

      {/* Header */}
      <LinearGradient colors={["#0D1A12", "#0D1A12CC", "transparent"]} style={s.headerGrad}>
        <View style={s.header}>
          <View style={s.aiAvatar}>
            <Ionicons name="sparkles" size={20} color="#000" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>المساعد الذكي</Text>
            <View style={s.onlineRow}>
              <View style={s.onlineDot} />
              <Text style={s.onlineTxt}>متصل</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Messages */}
      <FlatList
        ref={scrollRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={s.messagesList}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item: msg }) => (
          <Animated.View
            entering={FadeInDown.duration(200)}
            style={[s.msgRow, msg.role === "user" ? s.msgRowUser : s.msgRowAi]}
          >
            {msg.role === "assistant" && (
              <View style={s.aiAvatarSmall}>
                <Ionicons name="sparkles" size={12} color="#000" />
              </View>
            )}
            <View style={[s.bubble, msg.role === "user" ? s.bubbleUser : s.bubbleAi]}>
              <Text style={[s.bubbleText, msg.role === "user" ? s.bubbleTextUser : s.bubbleTextAi]}>
                {msg.text}
              </Text>
              <Text style={s.timeText}>{formatTime(msg.timestamp)}</Text>
            </View>
          </Animated.View>
        )}
        ListFooterComponent={
          loading ? (
            <View style={s.typingRow}>
              <View style={s.aiAvatarSmall}>
                <Ionicons name="sparkles" size={12} color="#000" />
              </View>
              <View style={s.typingBubble}>
                <ActivityIndicator color={Colors.primary} size="small" />
                <Text style={s.typingText}>يكتب...</Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* Input */}
      <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={s.input}
          placeholder="اكتب رسالتك..."
          placeholderTextColor={Colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={1000}
          textAlign="right"
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={input.trim() && !loading ? [Colors.primary, Colors.primaryDim] : ["#2A3A2A", "#1A2A1A"]}
            style={s.sendGrad}
          >
            <Ionicons name="arrow-back" size={20} color={input.trim() && !loading ? "#000" : Colors.textMuted} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: Colors.bg },
  headerGrad:  { paddingBottom: 16 },
  header:      { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary },
  aiAvatar:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center" },
  aiAvatarSmall: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center", marginLeft: 6 },
  onlineRow:   { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  onlineDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary },
  onlineTxt:   { fontSize: 11, color: Colors.primary },
  messagesList: { padding: 16, gap: 12, paddingBottom: 8 },
  msgRow:      { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  msgRowUser:  { justifyContent: "flex-start" },
  msgRowAi:    { justifyContent: "flex-end" },
  bubble:      { maxWidth: "78%", borderRadius: 16, padding: 12 },
  bubbleUser:  { backgroundColor: Colors.cardBg, borderBottomRightRadius: 4 },
  bubbleAi:    { backgroundColor: Colors.primary + "22", borderBottomLeftRadius: 4 },
  bubbleText:  { fontSize: 15, lineHeight: 22, textAlign: "right" },
  bubbleTextUser: { color: Colors.textPrimary },
  bubbleTextAi:   { color: Colors.primary },
  timeText:    { fontSize: 10, color: Colors.textMuted, marginTop: 4, textAlign: "left" },
  typingRow:   { flexDirection: "row", alignItems: "center", marginTop: 8 },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12 },
  typingText:  { color: Colors.textMuted, fontSize: 13 },
  inputBar:    { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8, backgroundColor: Colors.cardBg, borderTopWidth: 1, borderTopColor: Colors.divider },
  input:       { flex: 1, backgroundColor: Colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: Colors.textPrimary, maxHeight: 120 },
  sendBtn:     { width: 44, height: 44 },
  sendBtnDisabled: { opacity: 0.5 },
  sendGrad:    { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  disabledWrap:  { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  disabledIcon:  { marginBottom: 16 },
  disabledTitle: { fontSize: 20, fontWeight: "700", color: Colors.textPrimary, marginBottom: 8 },
  disabledSub:   { fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
});
