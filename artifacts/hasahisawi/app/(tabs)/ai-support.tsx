import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput,
  TouchableOpacity, ActivityIndicator, KeyboardAvoidingView,
  Platform, FlatList, I18nManager,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import BrandPattern from "@/components/BrandPattern";

const isRTL = I18nManager.isRTL;

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
  isLocal?: boolean;
};

type GeminiPart = { text: string };
type GeminiContent = { role: string; parts: GeminiPart[] };

type AiStatus = {
  enabled: boolean;
  quotaExceeded: boolean;
  resetIn: string | null;
};

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  text: "مرحباً بك في مساعد حصاحيصاوي الذكي 👋\n\nأنا هنا لمساعدتك في:\n• معلومات عن مدينة الحصاحيصا\n• الخدمات المتاحة في التطبيق\n• الإجابة على استفساراتك\n\nكيف يمكنني مساعدتك اليوم؟",
  timestamp: new Date(),
};

export default function AiSupportScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const scrollRef = useRef<FlatList>(null);

  useEffect(() => { fetchStatus(); }, []);

  const fetchStatus = async () => {
    setCheckingStatus(true);
    try {
      const base = getApiUrl();
      const res = await fetch(`${base}/api/ai/status`);
      if (res.ok) {
        setStatus(await res.json() as AiStatus);
      } else {
        setStatus({ enabled: false, quotaExceeded: false, resetIn: null });
      }
    } catch {
      setStatus({ enabled: false, quotaExceeded: false, resetIn: null });
    } finally {
      setCheckingStatus(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { id: Date.now().toString(), role: "user", text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const base = getApiUrl();
      const history: GeminiContent[] = messages
        .filter(m => m.id !== "welcome")
        .map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] }));

      const res = await fetch(`${base}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, history }),
      });

      const data = await res.json() as {
        reply?: string; error?: string;
        quotaExceeded?: boolean; resetIn?: string; local?: boolean;
      };

      if (data.quotaExceeded && !data.reply) {
        // حصة منتهية — رسالة خاصة
        setStatus(prev => prev ? { ...prev, quotaExceeded: true, resetIn: data.resetIn || prev.resetIn } : null);
        const msg: Message = {
          id: (Date.now() + 1).toString(), role: "assistant",
          text: data.error || "الخدمة مؤقتاً خارج الخدمة. حاول مجدداً لاحقاً.",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, msg]);
      } else {
        const reply = data.reply || data.error || "حدث خطأ غير متوقع";
        const msg: Message = {
          id: (Date.now() + 1).toString(), role: "assistant",
          text: reply, timestamp: new Date(), isLocal: !!data.local,
        };
        setMessages(prev => [...prev, msg]);
        // تحديث حالة الـ quota إذا نجح الرد
        if (data.reply && !data.local && status?.quotaExceeded) {
          setStatus(prev => prev ? { ...prev, quotaExceeded: false, resetIn: null } : null);
        }
      }
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: "assistant",
        text: "عذراً، تعذّر الاتصال. تحقق من الإنترنت وأعد المحاولة.",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 100);
    }
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });

  if (checkingStatus) {
    return (
      <View style={[s.root, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!status?.enabled) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <BrandPattern variant="diagonal" opacity={0.025} />
        <LinearGradient colors={["#0D1A12", "#0D1A12CC", "transparent"]} style={s.headerGrad}>
          <View style={s.header}>
            <Ionicons name="sparkles" size={24} color={Colors.primary} />
            <Text style={s.headerTitle}>المساعد الذكي</Text>
          </View>
        </LinearGradient>
        <View style={s.offlineWrap}>
          <View style={s.offlineIcon}>
            <Ionicons name="construct-outline" size={48} color={Colors.textMuted} />
          </View>
          <Text style={s.offlineTitle}>الخدمة غير مفعّلة</Text>
          <Text style={s.offlineSub}>يمكن للإدارة تفعيل خدمة الذكاء الاصطناعي من لوحة الإدارة</Text>
        </View>
      </View>
    );
  }

  const quotaExceeded = !!status?.quotaExceeded;
  const isOnline = !quotaExceeded;

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
          <View style={[s.aiAvatar, quotaExceeded && s.aiAvatarOffline]}>
            <Ionicons name={quotaExceeded ? "moon-outline" : "sparkles"} size={20} color="#000" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>المساعد الذكي</Text>
            <View style={s.statusRow}>
              <View style={[s.statusDot, isOnline ? s.statusDotOnline : s.statusDotOffline]} />
              <Text style={[s.statusTxt, isOnline ? s.statusTxtOnline : s.statusTxtOffline]}>
                {isOnline ? "متصل" : `مؤقتاً غير متاح${status?.resetIn ? ` — يعود ${status.resetIn}` : ""}`}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={fetchStatus} style={s.refreshBtn}>
            <Ionicons name="refresh-outline" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Quota banner */}
      {quotaExceeded && (
        <View style={s.quotaBanner}>
          <Ionicons name="information-circle-outline" size={16} color="#F5A623" />
          <Text style={s.quotaTxt}>
            الحصة اليومية نفدت. أرد على الأسئلة الشائعة فقط{status?.resetIn ? ` حتى ${status.resetIn}` : ""}.
          </Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={scrollRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={s.messagesList}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item: msg }) => {
          const isUser = msg.role === "user";
          return (
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowAi]}
            >
              {!isUser && (
                <View style={[s.aiAvatarSmall, msg.isLocal && s.aiAvatarSmallLocal]}>
                  <Ionicons name={msg.isLocal ? "information" : "sparkles"} size={12} color="#000" />
                </View>
              )}
              <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAi]}>
                <Text style={[s.bubbleText, isUser ? s.bubbleTextUser : s.bubbleTextAi]}>
                  {msg.text}
                </Text>
                <Text style={[s.timeText, isUser ? s.timeUser : s.timeAi]}>
                  {formatTime(msg.timestamp)}{msg.isLocal ? " · إجابة محلية" : ""}
                </Text>
              </View>
            </Animated.View>
          );
        }}
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
            <Ionicons
              name={isRTL ? "arrow-back" : "arrow-forward"}
              size={20}
              color={input.trim() && !loading ? "#000" : Colors.textMuted}
            />
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
  headerTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", color: Colors.textPrimary },

  aiAvatar:    { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center" },
  aiAvatarOffline: { backgroundColor: "#555" },
  aiAvatarSmall: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center", marginLeft: 6 },
  aiAvatarSmallLocal: { backgroundColor: "#F5A623" },

  statusRow:   { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  statusDot:   { width: 7, height: 7, borderRadius: 4 },
  statusDotOnline:  { backgroundColor: Colors.primary },
  statusDotOffline: { backgroundColor: "#F5A623" },
  statusTxt:   { fontSize: 11, fontFamily: "Cairo_400Regular" },
  statusTxtOnline:  { color: Colors.primary },
  statusTxtOffline: { color: "#F5A623" },
  refreshBtn:  { padding: 6 },

  quotaBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#F5A62318", borderLeftWidth: 3, borderLeftColor: "#F5A623",
    paddingHorizontal: 14, paddingVertical: 8, marginHorizontal: 12, marginBottom: 8,
    borderRadius: 8,
  },
  quotaTxt:    { flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular", color: "#F5A623", lineHeight: 18 },

  messagesList: { padding: 16, gap: 12, paddingBottom: 8 },
  msgRow:      { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  msgRowUser:  { justifyContent: "flex-start", flexDirection: isRTL ? "row" : "row-reverse" },
  msgRowAi:    { justifyContent: "flex-end",   flexDirection: isRTL ? "row-reverse" : "row" },

  bubble:      { maxWidth: "78%", borderRadius: 16, padding: 12 },
  bubbleUser:  { backgroundColor: Colors.primary, borderBottomStartRadius: 4 },
  bubbleAi:    { backgroundColor: Colors.cardBg, borderBottomEndRadius: 4 },
  bubbleText:  { fontSize: 15, lineHeight: 22, fontFamily: "Cairo_400Regular", textAlign: "right" },
  bubbleTextUser: { color: "#000" },
  bubbleTextAi:   { color: Colors.textPrimary },
  timeText:    { fontSize: 10, fontFamily: "Cairo_400Regular", marginTop: 4 },
  timeUser:    { color: "#000000AA", textAlign: "left" },
  timeAi:      { color: Colors.textMuted, textAlign: "right" },

  typingRow:   { flexDirection: "row", alignItems: "center", marginTop: 8 },
  typingBubble: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 12 },
  typingText:  { color: Colors.textMuted, fontSize: 13, fontFamily: "Cairo_400Regular" },

  inputBar:    { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8, backgroundColor: Colors.cardBg, borderTopWidth: 1, borderTopColor: Colors.divider },
  input:       { flex: 1, backgroundColor: Colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Cairo_400Regular", color: Colors.textPrimary, maxHeight: 120 },
  sendBtn:     { width: 44, height: 44 },
  sendBtnDisabled: { opacity: 0.5 },
  sendGrad:    { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },

  offlineWrap:  { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  offlineIcon:  { marginBottom: 16 },
  offlineTitle: { fontSize: 20, fontFamily: "Cairo_700Bold", color: Colors.textPrimary, marginBottom: 8 },
  offlineSub:   { fontSize: 14, fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
});
