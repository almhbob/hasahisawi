/**
 * client-case-chat.tsx
 * شاشة الدردشة والمستندات للعميل مع محاميه
 */
import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { fetch } from "expo/fetch";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { uploadFile } from "@/lib/firebase/storage";

// ─── Types ─────────────────────────────────────────────────────────────────
type Message = {
  id: number; sender_role: "lawyer" | "client"; sender_name: string;
  body: string; file_url: string; file_name: string; file_type: string;
  is_read: boolean; created_at: string;
};
type Document = {
  id: number; title: string; file_url: string; file_name: string;
  file_type: string; file_size: number; uploaded_by: "lawyer" | "client";
  notes: string; created_at: string;
};
type ContractInfo = {
  id: number; contract_no: string; service_title: string; status: string;
  lawyer_name: string; lawyer_title: string; client_name: string; client_phone: string;
  details: string; created_at: string; lawyer_note: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────
const BG     = "#0F0F1A";
const CARD   = "#1A1A2E";
const BORDER = "#2D2D44";
const PURPLE = "#8B5CF6";
const GREEN  = "#10B981";
const BLUE   = "#3B82F6";
const RED    = "#EF4444";
const GOLD   = "#F59E0B";

const STATUS_AR: Record<string, { label: string; color: string }> = {
  pending:     { label: "قيد المراجعة",  color: GOLD   },
  accepted:    { label: "مقبولة",         color: BLUE   },
  in_progress: { label: "قيد التنفيذ",   color: PURPLE },
  completed:   { label: "مكتملة",         color: GREEN  },
  rejected:    { label: "مرفوضة",         color: RED    },
  cancelled:   { label: "ملغية",          color: "#6B7280" },
};

const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("ar-SD") : "—";
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("ar-SD", { hour: "2-digit", minute: "2-digit" });
const fmtSize = (b: number) => b > 1e6 ? `${(b/1e6).toFixed(1)} MB` : `${Math.round(b/1024)} KB`;

function apiBase() { return getApiUrl() || ""; }
async function apiFetch(path: string, opts?: any, token?: string, deviceId?: string) {
  const url = new URL(path, apiBase()).toString();
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
}

const FILE_ICONS: Record<string, string> = { pdf: "📄", image: "🖼️", video: "🎥", audio: "🎵", default: "📎" };
const fileIcon = (type: string) => {
  if (type.includes("pdf")) return FILE_ICONS.pdf;
  if (type.includes("image")) return FILE_ICONS.image;
  if (type.includes("video")) return FILE_ICONS.video;
  if (type.includes("audio")) return FILE_ICONS.audio;
  return FILE_ICONS.default;
};

// ── Main ──────────────────────────────────────────────────────────────────
export default function ClientCaseChat() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { contractId } = useLocalSearchParams<{ contractId: string }>();
  const cid = Number(contractId);

  const [tab, setTab] = useState<"chat" | "docs" | "info">("chat");
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const msgListRef = useRef<FlatList>(null);

  useEffect(() => {
    AsyncStorage.getItem("device_id_v1").then(d => {
      if (d) setDeviceId(d);
    });
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const baseUrl = `${apiBase()}/api/client/cases/${cid}/messages`;
      const params = new URLSearchParams();
      if (deviceId) params.append("device_id", deviceId);
      const r = await fetch(`${baseUrl}?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (r.ok) {
        const d = await r.json();
        setContract(d.contract);
        setMessages(d.messages || []);
      }
      const dr = await fetch(`${apiBase()}/api/client/cases/${cid}/documents?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (dr.ok) setDocs(await dr.json());
    } catch {} finally {
      setLoading(false);
      setTimeout(() => msgListRef.current?.scrollToEnd({ animated: false }), 200);
    }
  };

  useEffect(() => { if (cid) loadData(); }, [cid, deviceId]);

  const sendMessage = async (fileUrl?: string, fileName?: string, fileType?: string) => {
    if (!msgText.trim() && !fileUrl) return;
    setSending(true);
    try {
      const params = new URLSearchParams();
      if (deviceId) params.append("device_id", deviceId);
      const r = await fetch(`${apiBase()}/api/client/cases/${cid}/messages?${params}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          body: msgText.trim(),
          file_url: fileUrl || "", file_name: fileName || "", file_type: fileType || "",
          sender_name: user?.name || contract?.client_name || "عميل",
          device_id: deviceId,
        }),
      });
      if (r.ok) {
        const msg = await r.json();
        setMessages(prev => [...prev, msg]);
        setMsgText("");
        setTimeout(() => msgListRef.current?.scrollToEnd({ animated: true }), 100);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {} finally { setSending(false); }
  };

  const uploadDoc = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setDocUploading(true);
      const uploadedUrl = await uploadFile(`case-docs/${Date.now()}_${asset.name || "document"}`, asset.uri);
      const params = new URLSearchParams();
      if (deviceId) params.append("device_id", deviceId);
      const r = await fetch(`${apiBase()}/api/client/cases/${cid}/documents?${params}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: docTitle || asset.name, file_url: uploadedUrl,
          file_name: asset.name, file_type: asset.mimeType || "application/octet-stream",
          file_size: asset.size || 0, device_id: deviceId,
        }),
      });
      if (r.ok) {
        const doc = await r.json();
        setDocs(prev => [doc, ...prev]);
        setDocTitle("");
        Alert.alert("✅ تم رفع المستند بنجاح");
      }
    } catch { Alert.alert("خطأ", "فشل رفع المستند"); }
    finally { setDocUploading(false); }
  };

  const pickAndSendFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setSending(true);
      const url = await uploadFile(`case-chat/${Date.now()}_${asset.name || "file"}`, asset.uri);
      await sendMessage(url, asset.name, asset.mimeType || "application/octet-stream");
    } catch { Alert.alert("خطأ في الرفع"); }
    finally { setSending(false); }
  };

  if (loading || !contract) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={PURPLE} size="large" />
        <Text style={{ color: "#9CA3AF", marginTop: 12 }}>جارٍ التحميل…</Text>
      </View>
    );
  }

  const statusConf = STATUS_AR[contract.status] || STATUS_AR.pending;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <LinearGradient colors={["#1A0A2E", BG]} style={{ paddingTop: insets.top + 4, paddingBottom: 14, paddingHorizontal: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }} numberOfLines={1}>
              {contract.lawyer_title} {contract.lawyer_name}
            </Text>
            <Text style={{ color: "#9CA3AF", fontSize: 12 }} numberOfLines={1}>{contract.service_title}</Text>
          </View>
          <View style={{ backgroundColor: statusConf.color + "22", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: statusConf.color + "55" }}>
            <Text style={{ color: statusConf.color, fontSize: 11, fontWeight: "700" }}>{statusConf.label}</Text>
          </View>
        </View>

        {/* Inner Tabs */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([ ["chat","💬 الدردشة"], ["docs","📎 المستندات"], ["info","ℹ️ التفاصيل"] ] as ["chat"|"docs"|"info", string][]).map(([key, lbl]) => (
            <TouchableOpacity key={key} onPress={() => setTab(key)}
              style={{ flex: 1, backgroundColor: tab === key ? PURPLE : "rgba(255,255,255,0.06)", borderRadius: 8, paddingVertical: 8, alignItems: "center" }}>
              <Text style={{ color: tab === key ? "#fff" : "#9CA3AF", fontSize: 12, fontWeight: tab === key ? "700" : "400" }}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </LinearGradient>

      {/* ── CHAT ── */}
      {tab === "chat" && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.top + 20}>
          <FlatList
            ref={msgListRef}
            data={messages}
            keyExtractor={m => String(m.id)}
            contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 20 }}
            ListEmptyComponent={() => (
              <View style={{ alignItems: "center", paddingTop: 60 }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
                <Text style={{ color: "#6B7280", textAlign: "center" }}>
                  ابدأ محادثتك مع محاميك هنا.{"\n"}سيرد عليك في أقرب وقت.
                </Text>
              </View>
            )}
            renderItem={({ item: m }: { item: Message }) => {
              const isClient = m.sender_role === "client";
              return (
                <View style={{ alignItems: isClient ? "flex-start" : "flex-end" }}>
                  <View style={{
                    maxWidth: "80%",
                    backgroundColor: isClient ? CARD : PURPLE + "33",
                    borderRadius: 16,
                    borderBottomLeftRadius: isClient ? 4 : 16,
                    borderBottomRightRadius: isClient ? 16 : 4,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: isClient ? BORDER : PURPLE + "55",
                  }}>
                    <Text style={{ color: isClient ? "#9CA3AF" : PURPLE, fontSize: 10, marginBottom: 4, fontWeight: "700" }}>
                      {isClient ? "أنت" : m.sender_name}
                    </Text>
                    {m.body ? <Text style={{ color: "#fff", fontSize: 14, lineHeight: 20 }}>{m.body}</Text> : null}
                    {m.file_url ? (
                      <TouchableOpacity onPress={() => Linking.openURL(m.file_url)}
                        style={{ marginTop: m.body ? 8 : 0, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 10 }}>
                        <Text style={{ fontSize: 22 }}>{fileIcon(m.file_type)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "#D1D5DB", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{m.file_name || "ملف مرفق"}</Text>
                          <Text style={{ color: "#6B7280", fontSize: 10 }}>اضغط للفتح</Text>
                        </View>
                      </TouchableOpacity>
                    ) : null}
                    <Text style={{ color: "#4B5563", fontSize: 10, marginTop: 4, textAlign: isClient ? "left" : "right" }}>{fmtTime(m.created_at)}</Text>
                  </View>
                </View>
              );
            }}
          />
          {/* Input */}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: "#111122" }}>
            <TouchableOpacity onPress={pickAndSendFile} style={{ padding: 10, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER }}>
              <Ionicons name="attach-outline" size={20} color="#9CA3AF" />
            </TouchableOpacity>
            <TextInput
              value={msgText} onChangeText={setMsgText}
              placeholder="اكتب رسالة لمحاميك…" placeholderTextColor="#4B5563"
              multiline maxLength={3000}
              style={{ flex: 1, color: "#fff", fontSize: 14, backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: BORDER, maxHeight: 120 }}
            />
            <TouchableOpacity onPress={() => sendMessage()} disabled={sending || !msgText.trim()}
              style={{ padding: 12, backgroundColor: msgText.trim() ? PURPLE : CARD, borderRadius: 12, borderWidth: 1, borderColor: msgText.trim() ? PURPLE : BORDER }}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color={msgText.trim() ? "#fff" : "#6B7280"} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── DOCS ── */}
      {tab === "docs" && (
        <View style={{ flex: 1 }}>
          {/* Upload button */}
          <View style={{ padding: 14, gap: 10 }}>
            <TextInput
              value={docTitle} onChangeText={setDocTitle}
              placeholder="اسم المستند (اختياري)…" placeholderTextColor="#4B5563"
              style={{ color: "#fff", backgroundColor: CARD, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: BORDER, fontSize: 13 }}
            />
            <TouchableOpacity onPress={uploadDoc} disabled={docUploading}
              style={{ backgroundColor: BLUE + "22", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BLUE, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 }}>
              {docUploading ? <ActivityIndicator color={BLUE} /> : (
                <>
                  <Ionicons name="cloud-upload-outline" size={20} color={BLUE} />
                  <Text style={{ color: BLUE, fontWeight: "700" }}>رفع مستند للمحامي</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <FlatList
            data={docs} keyExtractor={d => String(d.id)}
            contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}
            ListEmptyComponent={() => (
              <View style={{ alignItems: "center", paddingTop: 40 }}>
                <Text style={{ fontSize: 40, marginBottom: 10 }}>📂</Text>
                <Text style={{ color: "#6B7280" }}>لا توجد مستندات بعد</Text>
              </View>
            )}
            renderItem={({ item: d }: { item: Document }) => (
              <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Text style={{ fontSize: 28 }}>{fileIcon(d.file_type)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1}>{d.title}</Text>
                  <Text style={{ color: "#9CA3AF", fontSize: 11 }} numberOfLines={1}>{d.file_name}</Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 3 }}>
                    <Text style={{ color: d.uploaded_by === "lawyer" ? PURPLE : GREEN, fontSize: 10, fontWeight: "600" }}>
                      {d.uploaded_by === "lawyer" ? "📤 من المحامي" : "📥 منك"}
                    </Text>
                    {d.file_size > 0 && <Text style={{ color: "#4B5563", fontSize: 10 }}>{fmtSize(d.file_size)}</Text>}
                    <Text style={{ color: "#4B5563", fontSize: 10 }}>{fmt(d.created_at)}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => Linking.openURL(d.file_url)} style={{ padding: 8 }}>
                  <Ionicons name="open-outline" size={20} color={BLUE} />
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}

      {/* ── INFO ── */}
      {tab === "info" && (
        <View style={{ flex: 1, padding: 18 }}>
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER }}>
            {[
              ["رقم القضية",     contract.contract_no],
              ["المحامي",        `${contract.lawyer_title} ${contract.lawyer_name}`],
              ["الخدمة",         contract.service_title],
              ["الحالة",         statusConf.label],
              ["تاريخ التقديم", fmt(contract.created_at)],
            ].map(([label, value]) => (
              <View key={label} style={{ marginBottom: 14 }}>
                <Text style={{ color: "#6B7280", fontSize: 11, marginBottom: 2 }}>{label}</Text>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{value}</Text>
              </View>
            ))}
            {contract.details ? (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: "#6B7280", fontSize: 11, marginBottom: 2 }}>تفاصيل الطلب</Text>
                <Text style={{ color: "#D1D5DB", fontSize: 13, lineHeight: 20 }}>{contract.details}</Text>
              </View>
            ) : null}
            {contract.lawyer_note ? (
              <View style={{ backgroundColor: PURPLE + "22", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: PURPLE + "44" }}>
                <Text style={{ color: PURPLE, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>ملاحظة المحامي</Text>
                <Text style={{ color: "#D1D5DB", fontSize: 13, lineHeight: 20 }}>{contract.lawyer_note}</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}
