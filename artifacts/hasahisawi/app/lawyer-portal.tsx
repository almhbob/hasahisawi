/**
 * lawyer-portal.tsx
 * بوابة المحامي الشاملة — لوحة التحكم، القضايا، الدردشة، المستندات، الإعدادات
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, FlatList, Alert, Platform, ActivityIndicator, Pressable,
  KeyboardAvoidingView, Keyboard, Animated, Linking,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { fetch } from "expo/fetch";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { uploadFile } from "@/lib/firebase/storage";

// ─── Types ─────────────────────────────────────────────────────────────────
type Profile = {
  id: number; full_name: string; title: string; bio: string; phone: string;
  whatsapp: string; email: string; office_addr: string; district: string;
  bar_number: string; experience_y: number; languages: string; consult_fee: string;
  photo_url: string; is_active: boolean; is_featured: boolean; is_verified: boolean;
  avg_rating: number; review_count: number;
  total_contracts: number; pending_contracts: number; completed_contracts: number;
  plan_name?: string; plan_name_ar?: string; plan_color?: string; plan_icon?: string;
  plan_monthly_contacts?: number; has_unlimited_contacts?: boolean;
  commission_pct?: number; sub_started?: string; sub_expires?: string;
  services: Service[];
};
type Service = {
  id?: number; title: string; description: string; price_text: string; duration: string;
};
type Case = {
  id: number; contract_no: string; client_name: string; client_phone: string;
  service_title: string; details: string; status: string; lawyer_note: string;
  preferred_date?: string; created_at: string; updated_at: string;
  msg_count: number; unread_count: number; doc_count: number;
};
type Message = {
  id: number; contract_id: number; sender_role: "lawyer" | "client";
  sender_name: string; body: string; file_url: string; file_name: string;
  file_type: string; is_read: boolean; created_at: string;
};
type Document = {
  id: number; contract_id: number; title: string; file_url: string;
  file_name: string; file_type: string; file_size: number;
  uploaded_by: "lawyer" | "client"; notes: string; created_at: string;
};
type Stats = {
  contracts: { total: number; pending: number; accepted: number; in_progress: number; completed: number; cancelled: number };
  monthly: { month: string; count: number }[];
  recent_cases: Partial<Case>[];
  unread_messages: number;
};

// ─── Constants ─────────────────────────────────────────────────────────────
const PURPLE = "#8B5CF6";
const GOLD   = "#F59E0B";
const GREEN  = "#10B981";
const RED    = "#EF4444";
const BLUE   = "#3B82F6";
const BG     = "#0F0F1A";
const CARD   = "#1A1A2E";
const BORDER = "#2D2D44";

const STATUS_CONF: Record<string, { ar: string; color: string; icon: string }> = {
  pending:     { ar: "قيد المراجعة",  color: GOLD,   icon: "time-outline" },
  accepted:    { ar: "مقبولة",         color: BLUE,   icon: "checkmark-circle-outline" },
  in_progress: { ar: "قيد التنفيذ",   color: PURPLE, icon: "git-branch-outline" },
  completed:   { ar: "مكتملة",         color: GREEN,  icon: "checkmark-done-outline" },
  rejected:    { ar: "مرفوضة",         color: RED,    icon: "close-circle-outline" },
  cancelled:   { ar: "ملغية",          color: "#6B7280", icon: "ban-outline" },
};

const NEXT_STATUS: Record<string, { status: string; ar: string; color: string }[]> = {
  pending:     [{ status: "accepted", ar: "قبول", color: BLUE }, { status: "rejected", ar: "رفض", color: RED }],
  accepted:    [{ status: "in_progress", ar: "بدء التنفيذ", color: PURPLE }, { status: "cancelled", ar: "إلغاء", color: RED }],
  in_progress: [{ status: "completed", ar: "اكتمال", color: GREEN }, { status: "cancelled", ar: "إلغاء", color: RED }],
};

const SUDANESE_DISTRICTS = [
  "الخرطوم","أم درمان","بحري","حصاحيصا","ودمدني","الأبيض","الفاشر","القضارف",
  "بورتسودان","عطبرة","سنار","الدمازين","كوستي","مدني","شندي","ربك",
];

const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("ar-SD") : "—";
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("ar-SD", { hour: "2-digit", minute: "2-digit" });
const fmtSize = (b: number) => b > 1e6 ? `${(b/1e6).toFixed(1)} MB` : `${Math.round(b/1024)} KB`;

// ─── API helpers ────────────────────────────────────────────────────────────
function apiBase() { return getApiUrl() || ""; }
async function apiFetch(path: string, opts?: any, token?: string) {
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

// ─── Component helpers ─────────────────────────────────────────────────────
function Row({ children, style }: any) {
  return <View style={[{ flexDirection: "row", alignItems: "center" }, style]}>{children}</View>;
}
function SectionTitle({ text }: { text: string }) {
  return <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10, marginTop: 20 }}>{text}</Text>;
}
function StatCard({ icon, value, label, color, sub }: { icon: string; value: string | number; label: string; color: string; sub?: string }) {
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, flex: 1, minWidth: 130 }}>
      <Text style={{ fontSize: 22, marginBottom: 4 }}>{icon}</Text>
      <Text style={{ fontSize: 24, fontWeight: "800", color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{label}</Text>
      {sub ? <Text style={{ fontSize: 10, color: color + "99", marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}
function CaseBadge({ status }: { status: string }) {
  const c = STATUS_CONF[status] || STATUS_CONF.pending;
  return (
    <Row style={{ backgroundColor: c.color + "22", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 4 }}>
      <Ionicons name={c.icon as any} size={11} color={c.color} />
      <Text style={{ fontSize: 11, color: c.color, fontWeight: "700" }}>{c.ar}</Text>
    </Row>
  );
}
function Input({ label, value, onChangeText, placeholder, multiline, keyboardType, maxLength }: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 6, fontWeight: "600" }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor="#4B5563" multiline={multiline}
        keyboardType={keyboardType} maxLength={maxLength}
        style={[styles.input, multiline && { height: 90, textAlignVertical: "top" }]}
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//                               MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
type Tab = "dashboard" | "cases" | "chat" | "docs" | "settings";

export default function LawyerPortal() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();
  const [tab, setTab] = useState<Tab>("dashboard");

  // Profile
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notALawyer, setNotALawyer] = useState(false);

  // Cases
  const [cases, setCases]           = useState<Case[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [caseFilter, setCaseFilter] = useState("");
  const [caseSearch, setCaseSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [caseMessages, setCaseMessages] = useState<Message[]>([]);
  const [caseDocs, setCaseDocs]     = useState<Document[]>([]);
  const [caseDetailLoading, setCaseDetailLoading] = useState(false);
  const [msgText, setMsgText]       = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [docModal, setDocModal]     = useState(false);
  const [docTitle, setDocTitle]     = useState("");
  const [docNote, setDocNote]       = useState("");
  const [docUploading, setDocUploading] = useState(false);
  const msgListRef = useRef<FlatList>(null);

  // Settings
  const [settingsForm, setSettingsForm] = useState<Partial<Profile>>({});
  const [services, setServices]         = useState<Service[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // PDF
  const [pdfLoading, setPdfLoading] = useState(false);

  // ── Load profile on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setNotALawyer(true); setLoading(false); return; }
    loadProfile();
  }, [token]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/my-lawyer-profile", {}, token!);
      if (r.status === 401) { setNotALawyer(true); return; }
      if (!r.ok) { setNotALawyer(true); return; }
      const data: Profile = await r.json();
      setProfile(data);
      setSettingsForm({
        full_name: data.full_name, title: data.title, bio: data.bio,
        phone: data.phone, whatsapp: data.whatsapp, email: data.email,
        office_addr: data.office_addr, district: data.district,
        consult_fee: data.consult_fee, languages: data.languages, photo_url: data.photo_url,
      });
      setServices(data.services?.length ? data.services : [{ title: "", description: "", price_text: "", duration: "" }]);
    } catch { setNotALawyer(true); }
    finally { setLoading(false); }
  };

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const r = await apiFetch("/api/my-lawyer-stats", {}, token);
      if (r.ok) setStats(await r.json());
    } catch {}
  }, [token]);

  const loadCases = useCallback(async () => {
    if (!token) return;
    setCasesLoading(true);
    try {
      let url = "/api/my-lawyer-cases";
      const params: string[] = [];
      if (caseFilter) params.push(`status=${caseFilter}`);
      if (caseSearch) params.push(`search=${encodeURIComponent(caseSearch)}`);
      if (params.length) url += "?" + params.join("&");
      const r = await apiFetch(url, {}, token);
      if (r.ok) setCases(await r.json());
    } catch {} finally { setCasesLoading(false); }
  }, [token, caseFilter, caseSearch]);

  useEffect(() => { if (tab === "dashboard") { loadStats(); } }, [tab]);
  useEffect(() => { if (tab === "cases" || tab === "chat" || tab === "docs") loadCases(); }, [tab, caseFilter]);

  const openCase = async (c: Case) => {
    setSelectedCase(c);
    setCaseDetailLoading(true);
    try {
      const r = await apiFetch(`/api/my-lawyer-cases/${c.id}`, {}, token!);
      if (r.ok) {
        const d = await r.json();
        setCaseMessages(d.messages || []);
        setCaseDocs(d.documents || []);
      }
    } catch {} finally { setCaseDetailLoading(false); }
    setTimeout(() => msgListRef.current?.scrollToEnd({ animated: false }), 300);
  };

  const closeCase = () => {
    setSelectedCase(null);
    setCaseMessages([]);
    setCaseDocs([]);
    setMsgText("");
    loadCases();
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async (fileUrl?: string, fileName?: string, fileType?: string) => {
    if (!selectedCase || (!msgText.trim() && !fileUrl)) return;
    setMsgSending(true);
    try {
      const r = await apiFetch(`/api/my-lawyer-cases/${selectedCase.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: msgText.trim(), file_url: fileUrl || "", file_name: fileName || "", file_type: fileType || "" }),
      }, token!);
      if (r.ok) {
        const msg = await r.json();
        setCaseMessages(prev => [...prev, msg]);
        setMsgText("");
        setTimeout(() => msgListRef.current?.scrollToEnd({ animated: true }), 100);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {} finally { setMsgSending(false); }
  };

  // ── Change case status ────────────────────────────────────────────────────
  const changeStatus = async (newStatus: string) => {
    if (!selectedCase) return;
    const r = await apiFetch(`/api/my-lawyer-cases/${selectedCase.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus, lawyer_note: statusNote }),
    }, token!);
    if (r.ok) {
      setSelectedCase(prev => prev ? { ...prev, status: newStatus, lawyer_note: statusNote } : prev);
      setCases(prev => prev.map(c => c.id === selectedCase.id ? { ...c, status: newStatus } : c));
      setStatusModal(false); setStatusNote("");
      Alert.alert("✅ تم", `تم تغيير حالة القضية إلى: ${STATUS_CONF[newStatus]?.ar}`);
    }
  };

  // ── Upload document ───────────────────────────────────────────────────────
  const pickAndUploadDoc = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setDocUploading(true);
      const uploadedUrl = await uploadFile(`lawyer-docs/${Date.now()}_${asset.name || "document"}`, asset.uri);
      if (!selectedCase) return;
      const r = await apiFetch(`/api/my-lawyer-cases/${selectedCase.id}/documents`, {
        method: "POST",
        body: JSON.stringify({ title: docTitle || asset.name, file_url: uploadedUrl, file_name: asset.name, file_type: asset.mimeType || "application/octet-stream", file_size: asset.size || 0, notes: docNote }),
      }, token!);
      if (r.ok) {
        const doc = await r.json();
        setCaseDocs(prev => [doc, ...prev]);
        setDocModal(false); setDocTitle(""); setDocNote("");
        Alert.alert("✅ تم رفع المستند بنجاح");
      }
    } catch (e) { Alert.alert("خطأ", "فشل في رفع المستند"); }
    finally { setDocUploading(false); }
  };

  const deleteDoc = async (docId: number) => {
    if (!selectedCase) return;
    Alert.alert("حذف المستند", "هل تريد حذف هذا المستند نهائياً؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        await apiFetch(`/api/my-lawyer-cases/${selectedCase.id}/documents/${docId}`, { method: "DELETE" }, token!);
        setCaseDocs(prev => prev.filter(d => d.id !== docId));
      }},
    ]);
  };

  // ── Save settings ─────────────────────────────────────────────────────────
  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      const r = await apiFetch("/api/my-lawyer-profile", {
        method: "PUT",
        body: JSON.stringify({ ...settingsForm, services }),
      }, token!);
      if (r.ok) {
        Alert.alert("✅ تم حفظ بياناتك بنجاح");
        loadProfile();
      } else {
        const d = await r.json();
        Alert.alert("خطأ", d.error || "فشل الحفظ");
      }
    } finally { setSettingsSaving(false); }
  };

  // ── Export PDF ────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!token) return;
    setPdfLoading(true);
    try {
      const r = await apiFetch("/api/my-lawyer-pdf-data", {}, token);
      if (!r.ok) throw new Error("فشل جلب البيانات");
      const data = await r.json();
      const html = buildPdfHtml(data);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "مشاركة ملف المحامي" });
      } else {
        Alert.alert("✅ تم", "تم إنشاء ملف PDF بنجاح");
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("خطأ", e.message || "فشل إنشاء PDF");
    } finally { setPdfLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={{ color: "#9CA3AF", marginTop: 12, fontSize: 14 }}>جارٍ تحميل بوابتك…</Text>
      </View>
    );
  }

  if (notALawyer) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ fontSize: 60, marginBottom: 20 }}>⚖️</Text>
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 12 }}>بوابة المحامين</Text>
        <Text style={{ color: "#9CA3AF", fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 32 }}>
          هذه المنطقة مخصصة للمحامين المعتمدين فقط.{"\n"}يرجى تسجيل الدخول وتقديم طلب الانضمام من قسم الخدمات القانونية.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: PURPLE, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //                             MAIN RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <LinearGradient colors={["#1A0A2E", BG]} style={{ paddingTop: insets.top + 4, paddingBottom: 12, paddingHorizontal: 18 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }} numberOfLines={1}>{profile?.full_name}</Text>
            <Row style={{ gap: 6, marginTop: 2, flexWrap: "wrap" }}>
              <Text style={{ color: PURPLE, fontSize: 12 }}>{profile?.title}</Text>
              {profile?.is_verified && <Text style={{ fontSize: 12 }}>✅ موثّق</Text>}
              {profile?.is_featured && <Text style={{ fontSize: 12 }}>⭐ مميّز</Text>}
              {profile?.plan_icon && <Text style={{ fontSize: 12 }}>{profile.plan_icon} {profile.plan_name_ar}</Text>}
            </Row>
          </View>
          {stats?.unread_messages ? (
            <View style={{ backgroundColor: RED, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{stats.unread_messages} جديد</Text>
            </View>
          ) : null}
        </Row>
      </LinearGradient>

      {/* Tabs */}
      <View style={{ flexDirection: "row", backgroundColor: "#111122", borderBottomWidth: 1, borderBottomColor: BORDER }}>
        {([ ["dashboard","grid-outline","لوحتي"], ["cases","briefcase-outline","القضايا"], ["chat","chatbubbles-outline","الدردشة"], ["docs","documents-outline","المستندات"], ["settings","settings-outline","الإعدادات"] ] as [Tab, string, string][]).map(([key, icon, label]) => (
          <TouchableOpacity key={key} onPress={() => setTab(key)} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: tab === key ? PURPLE : "transparent" }}>
            <Ionicons name={icon as any} size={18} color={tab === key ? PURPLE : "#6B7280"} />
            <Text style={{ fontSize: 9, color: tab === key ? PURPLE : "#6B7280", marginTop: 2, fontWeight: tab === key ? "700" : "400" }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {tab === "dashboard" && <DashboardTab profile={profile!} stats={stats} onRefresh={loadStats} onOpenCase={openCase} cases={cases} loadCases={loadCases} />}
      {tab === "cases"     && <CasesTab cases={cases} loading={casesLoading} filter={caseFilter} setFilter={setCaseFilter} search={caseSearch} setSearch={setCaseSearch} onSearch={loadCases} onOpen={openCase} />}
      {tab === "chat"      && <ChatListTab cases={cases} loading={casesLoading} onOpen={openCase} />}
      {tab === "docs"      && <DocsListTab cases={cases} loading={casesLoading} onOpen={openCase} />}
      {tab === "settings"  && <SettingsTab form={settingsForm} setForm={setSettingsForm} services={services} setServices={setServices} saving={settingsSaving} onSave={saveSettings} pdfLoading={pdfLoading} onExportPdf={exportPDF} profile={profile!} />}

      {/* Case Detail Modal */}
      {selectedCase && (
        <Modal visible animationType="slide" onRequestClose={closeCase}>
          <CaseDetailScreen
            c={selectedCase} messages={caseMessages} docs={caseDocs}
            loading={caseDetailLoading} msgText={msgText} setMsgText={setMsgText}
            sending={msgSending} onSend={sendMessage} onClose={closeCase}
            onStatusModal={() => setStatusModal(true)}
            onDocModal={() => setDocModal(true)}
            onDeleteDoc={deleteDoc}
            msgListRef={msgListRef}
            token={token!}
            onSendWithFile={async () => {
              try {
                const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
                if (result.canceled || !result.assets?.[0]) return;
                const a = result.assets[0];
                const url = await uploadFile(`lawyer-chat/${Date.now()}_${a.name || "file"}`, a.uri);
                await sendMessage(url, a.name, a.mimeType || "application/octet-stream");
              } catch { Alert.alert("خطأ في الرفع"); }
            }}
          />
          {/* Status Modal */}
          {statusModal && (
            <Modal visible transparent animationType="slide" onRequestClose={() => setStatusModal(false)}>
              <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}>
                <View style={{ backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17, marginBottom: 16 }}>تغيير حالة القضية</Text>
                  <Text style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 8 }}>الحالة الحالية: {STATUS_CONF[selectedCase.status]?.ar}</Text>
                  {(NEXT_STATUS[selectedCase.status] || []).map(ns => (
                    <TouchableOpacity key={ns.status} onPress={() => changeStatus(ns.status)}
                      style={{ backgroundColor: ns.color + "22", borderWidth: 1, borderColor: ns.color, borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Ionicons name={STATUS_CONF[ns.status]?.icon as any} size={20} color={ns.color} />
                      <Text style={{ color: ns.color, fontWeight: "700", fontSize: 15 }}>{ns.ar}</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 8, marginBottom: 6 }}>ملاحظة (اختياري):</Text>
                  <TextInput value={statusNote} onChangeText={setStatusNote} placeholder="اكتب ملاحظة للعميل…" placeholderTextColor="#4B5563" style={[styles.input, { marginBottom: 12 }]} />
                  <TouchableOpacity onPress={() => setStatusModal(false)} style={{ padding: 14, borderWidth: 1, borderColor: BORDER, borderRadius: 12, alignItems: "center" }}>
                    <Text style={{ color: "#9CA3AF", fontWeight: "600" }}>إلغاء</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}
          {/* Document Upload Modal */}
          {docModal && (
            <Modal visible transparent animationType="slide" onRequestClose={() => setDocModal(false)}>
              <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" }}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
                  <View style={{ backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17, marginBottom: 16 }}>📎 رفع مستند جديد</Text>
                    <Input label="عنوان المستند" value={docTitle} onChangeText={setDocTitle} placeholder="مثال: عقد الوكالة، صورة بطاقة…" />
                    <Input label="ملاحظة (اختياري)" value={docNote} onChangeText={setDocNote} placeholder="أي معلومة إضافية…" multiline />
                    <TouchableOpacity onPress={pickAndUploadDoc} disabled={docUploading}
                      style={{ backgroundColor: PURPLE, borderRadius: 12, padding: 15, alignItems: "center", marginBottom: 10 }}>
                      {docUploading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>اختر ملفاً وارفعه</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDocModal(false)} style={{ padding: 14, alignItems: "center" }}>
                      <Text style={{ color: "#9CA3AF" }}>إلغاء</Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              </View>
            </Modal>
          )}
        </Modal>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//                             TAB: لوحتي
// ══════════════════════════════════════════════════════════════════════════════
function DashboardTab({ profile, stats, onRefresh, onOpenCase, cases, loadCases }: any) {
  useEffect(() => { onRefresh(); loadCases(); }, []);
  const isExpiringSoon = profile?.sub_expires && new Date(profile.sub_expires) < new Date(Date.now() + 30 * 86400000);
  const isExpired      = profile?.sub_expires && new Date(profile.sub_expires) < new Date();

  return (
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Subscription Alert */}
      {(isExpired || isExpiringSoon) && (
        <View style={{ backgroundColor: isExpired ? "#7F1D1D" : "#78350F", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: isExpired ? RED : GOLD }}>
          <Row style={{ gap: 8 }}>
            <Text style={{ fontSize: 20 }}>{isExpired ? "⛔" : "⚠️"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                {isExpired ? "انتهى اشتراكك!" : `اشتراكك ينتهي في ${fmt(profile.sub_expires)}`}
              </Text>
              <Text style={{ color: "#FCA5A5", fontSize: 11, marginTop: 2 }}>تواصل مع إدارة التطبيق لتجديد اشتراكك والحفاظ على مزاياك</Text>
            </View>
          </Row>
        </View>
      )}

      {/* Stats Grid */}
      <SectionTitle text="إحصائيات القضايا" />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
        <StatCard icon="📂" value={stats?.contracts.total || 0} label="إجمالي القضايا" color={PURPLE} />
        <StatCard icon="⏳" value={stats?.contracts.pending || 0} label="قيد المراجعة" color={GOLD} />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
        <StatCard icon="⚡" value={stats?.contracts.in_progress || 0} label="قيد التنفيذ" color={BLUE} />
        <StatCard icon="✅" value={stats?.contracts.completed || 0} label="مكتملة" color={GREEN} />
      </View>
      {stats?.unread_messages > 0 && (
        <View style={{ backgroundColor: RED + "22", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: RED, marginBottom: 8 }}>
          <Row style={{ gap: 8 }}>
            <Ionicons name="chatbubble-ellipses" size={18} color={RED} />
            <Text style={{ color: RED, fontWeight: "700" }}>{stats.unread_messages} رسالة غير مقروءة من العملاء</Text>
          </Row>
        </View>
      )}

      {/* Subscription Card */}
      <SectionTitle text="خطة الاشتراك" />
      <LinearGradient
        colors={profile?.plan_color ? [profile.plan_color + "33", profile.plan_color + "11"] : ["#2D1B69", "#1A0A2E"]}
        style={{ borderRadius: 16, padding: 18, borderWidth: 1, borderColor: profile?.plan_color || PURPLE, marginBottom: 8 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontSize: 28 }}>{profile?.plan_icon || "🔓"}</Text>
          <View style={{ flex: 1, marginHorizontal: 14 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>{profile?.plan_name_ar || "مجاني"}</Text>
            {profile?.sub_expires && <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>ينتهي: {fmt(profile.sub_expires)}</Text>}
            {profile?.commission_pct > 0 && <Text style={{ color: "#9CA3AF", fontSize: 12 }}>العمولة: {profile.commission_pct}%</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {profile?.is_verified && <Row style={{ backgroundColor: GREEN + "22", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, gap: 4 }}><Ionicons name="shield-checkmark" size={12} color={GREEN} /><Text style={{ color: GREEN, fontSize: 11, fontWeight: "700" }}>موثّق</Text></Row>}
          </View>
        </Row>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {[
            profile?.has_unlimited_contacts && "✅ تواصل غير محدود",
            profile?.has_ads && "📣 إعلانات ترويجية",
            profile?.is_featured && "⭐ ظهور مميّز",
            profile?.has_priority && "🚀 أولوية الترتيب",
          ].filter(Boolean).map((f: any) => (
            <View key={f} style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: "#D1D5DB", fontSize: 11 }}>{f}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Rating */}
      {profile?.review_count > 0 && (
        <>
          <SectionTitle text="تقييمك" />
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER }}>
            <Row style={{ gap: 12 }}>
              <Text style={{ fontSize: 36, fontWeight: "800", color: GOLD }}>{profile.avg_rating.toFixed(1)}</Text>
              <View>
                <Row style={{ gap: 3 }}>
                  {[1,2,3,4,5].map(s => (
                    <Ionicons key={s} name={s <= Math.round(profile.avg_rating) ? "star" : "star-outline"} size={16} color={s <= Math.round(profile.avg_rating) ? GOLD : "#4B5563"} />
                  ))}
                </Row>
                <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>{profile.review_count} تقييم</Text>
              </View>
            </Row>
          </View>
        </>
      )}

      {/* Recent Cases */}
      {stats?.recent_cases?.length > 0 && (
        <>
          <SectionTitle text="أحدث القضايا" />
          {stats.recent_cases.map((c: any) => (
            <View key={c.id} style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 8 }}>
              <Row style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }} numberOfLines={1}>{c.client_name}</Text>
                <CaseBadge status={c.status} />
              </Row>
              <Text style={{ color: "#9CA3AF", fontSize: 12 }} numberOfLines={1}>{c.service_title}</Text>
              <Text style={{ color: "#6B7280", fontSize: 11, marginTop: 4 }}>{fmt(c.created_at)} · #{c.contract_no}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//                             TAB: القضايا
// ══════════════════════════════════════════════════════════════════════════════
function CasesTab({ cases, loading, filter, setFilter, search, setSearch, onSearch, onOpen }: any) {
  const statuses = ["", "pending", "accepted", "in_progress", "completed", "rejected", "cancelled"];

  return (
    <View style={{ flex: 1 }}>
      {/* Search */}
      <View style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: "row", backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search-outline" size={16} color="#6B7280" />
          <TextInput value={search} onChangeText={setSearch} onSubmitEditing={onSearch} placeholder="بحث في القضايا…" placeholderTextColor="#4B5563" returnKeyType="search" style={{ flex: 1, color: "#fff", fontSize: 13, paddingVertical: 10 }} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Row style={{ gap: 8 }}>
            {statuses.map(s => {
              const conf = s ? STATUS_CONF[s] : null;
              const active = filter === s;
              return (
                <TouchableOpacity key={s || "all"} onPress={() => { setFilter(s); onSearch(); }}
                  style={{ backgroundColor: active ? (conf?.color || PURPLE) : CARD, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: active ? (conf?.color || PURPLE) : BORDER }}>
                  <Text style={{ color: active ? "#fff" : "#9CA3AF", fontSize: 12, fontWeight: active ? "700" : "400" }}>
                    {s ? conf?.ar : "الكل"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Row>
        </ScrollView>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={PURPLE} /></View>
      ) : cases.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📂</Text>
          <Text style={{ color: "#6B7280", fontSize: 15 }}>لا توجد قضايا</Text>
        </View>
      ) : (
        <FlatList
          data={cases} keyExtractor={c => String(c.id)}
          contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}
          renderItem={({ item: c }) => (
            <TouchableOpacity onPress={() => onOpen(c)}
              style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.unread_count > 0 ? PURPLE : BORDER }}>
              <Row style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>{c.client_name}</Text>
                  <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }} numberOfLines={1}>{c.service_title}</Text>
                </View>
                <CaseBadge status={c.status} />
              </Row>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={{ color: "#6B7280", fontSize: 11 }}>📅 {fmt(c.created_at)} · #{c.contract_no}</Text>
                <Row style={{ gap: 10 }}>
                  {c.unread_count > 0 && (
                    <View style={{ backgroundColor: RED, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{c.unread_count}</Text>
                    </View>
                  )}
                  {c.doc_count > 0 && <Row style={{ gap: 3 }}><Ionicons name="document-attach-outline" size={12} color="#6B7280" /><Text style={{ color: "#6B7280", fontSize: 11 }}>{c.doc_count}</Text></Row>}
                  {c.msg_count > 0 && <Row style={{ gap: 3 }}><Ionicons name="chatbubble-outline" size={12} color="#6B7280" /><Text style={{ color: "#6B7280", fontSize: 11 }}>{c.msg_count}</Text></Row>}
                </Row>
              </Row>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//                             TAB: الدردشة (قائمة)
// ══════════════════════════════════════════════════════════════════════════════
function ChatListTab({ cases, loading, onOpen }: any) {
  const active = cases.filter((c: Case) => c.status !== "completed" && c.status !== "cancelled" && c.status !== "rejected");
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 14, paddingBottom: 0 }}>
        <Text style={{ color: "#9CA3AF", fontSize: 12 }}>{active.length} محادثة نشطة</Text>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={PURPLE} /></View>
      ) : active.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
          <Text style={{ color: "#6B7280" }}>لا توجد محادثات نشطة</Text>
        </View>
      ) : (
        <FlatList
          data={active} keyExtractor={(c: Case) => String(c.id)}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 40 }}
          renderItem={({ item: c }: { item: Case }) => (
            <TouchableOpacity onPress={() => onOpen(c)}
              style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.unread_count > 0 ? PURPLE : BORDER, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: PURPLE + "33", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 20 }}>👤</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{c.client_name}</Text>
                  {c.unread_count > 0 && (
                    <View style={{ backgroundColor: PURPLE, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{c.unread_count}</Text>
                    </View>
                  )}
                </Row>
                <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }} numberOfLines={1}>{c.service_title}</Text>
                <Text style={{ color: "#4B5563", fontSize: 11, marginTop: 2 }}>📅 {fmt(c.updated_at)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//                             TAB: المستندات (قائمة)
// ══════════════════════════════════════════════════════════════════════════════
function DocsListTab({ cases, loading, onOpen }: any) {
  const withDocs = cases.filter((c: Case) => c.doc_count > 0);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 14, paddingBottom: 0 }}>
        <Text style={{ color: "#9CA3AF", fontSize: 12 }}>{withDocs.length} قضية تحتوي مستندات</Text>
      </View>
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={PURPLE} /></View>
      ) : withDocs.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>📎</Text>
          <Text style={{ color: "#6B7280" }}>لا توجد مستندات مرفوعة بعد</Text>
        </View>
      ) : (
        <FlatList
          data={cases} keyExtractor={(c: Case) => String(c.id)}
          contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 40 }}
          renderItem={({ item: c }: { item: Case }) => c.doc_count === 0 ? null : (
            <TouchableOpacity onPress={() => onOpen(c)}
              style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: BLUE + "22", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="documents-outline" size={22} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>{c.client_name}</Text>
                <Text style={{ color: "#9CA3AF", fontSize: 12 }}>{c.service_title}</Text>
                <Row style={{ gap: 4, marginTop: 4 }}>
                  <Ionicons name="document-attach-outline" size={12} color={BLUE} />
                  <Text style={{ color: BLUE, fontSize: 12, fontWeight: "600" }}>{c.doc_count} مستند</Text>
                </Row>
              </View>
              <Ionicons name="chevron-back" size={18} color="#6B7280" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//                             TAB: الإعدادات
// ══════════════════════════════════════════════════════════════════════════════
function SettingsTab({ form, setForm, services, setServices, saving, onSave, pdfLoading, onExportPdf, profile }: any) {
  const [section, setSection] = useState<"profile"|"services"|"backup">("profile");
  const f = (key: string) => (v: string) => setForm((p: any) => ({ ...p, [key]: v }));

  return (
    <View style={{ flex: 1 }}>
      {/* Section tabs */}
      <View style={{ flexDirection: "row", padding: 14, gap: 8 }}>
        {([ ["profile","ملف تعريفي"], ["services","الخدمات"], ["backup","النسخ الاحتياطي"] ] as [typeof section, string][]).map(([key, lbl]) => (
          <TouchableOpacity key={key} onPress={() => setSection(key)}
            style={{ flex: 1, backgroundColor: section === key ? PURPLE : CARD, borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: section === key ? PURPLE : BORDER }}>
            <Text style={{ color: section === key ? "#fff" : "#9CA3AF", fontSize: 12, fontWeight: "700" }}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {/* ── Profile Section ── */}
        {section === "profile" && (
          <>
            <SectionTitle text="بيانات الملف الشخصي" />
            <Input label="الاسم الكامل"     value={form.full_name || ""}   onChangeText={f("full_name")}   placeholder="المحامي / مكتب…" maxLength={150} />
            <Input label="اللقب المهني"      value={form.title || ""}       onChangeText={f("title")}       placeholder="محامٍ، مستشار قانوني…" />
            <Input label="نبذة تعريفية"     value={form.bio || ""}         onChangeText={f("bio")}         placeholder="تعريف موجز بتخصصك وخبرتك…" multiline />
            <Input label="رقم الهاتف"        value={form.phone || ""}       onChangeText={f("phone")}       keyboardType="phone-pad" />
            <Input label="واتساب"            value={form.whatsapp || ""}    onChangeText={f("whatsapp")}    keyboardType="phone-pad" />
            <Input label="البريد الإلكتروني" value={form.email || ""}       onChangeText={f("email")}       keyboardType="email-address" />
            <Input label="عنوان المكتب"      value={form.office_addr || ""} onChangeText={f("office_addr")} placeholder="الحي / الشارع / رقم المكتب" />
            <SectionTitle text="المنطقة الجغرافية" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <Row style={{ gap: 8 }}>
                {SUDANESE_DISTRICTS.map(d => (
                  <TouchableOpacity key={d} onPress={() => setForm((p: any) => ({ ...p, district: d }))}
                    style={{ backgroundColor: form.district === d ? PURPLE : CARD, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: form.district === d ? PURPLE : BORDER }}>
                    <Text style={{ color: form.district === d ? "#fff" : "#9CA3AF", fontSize: 12 }}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </Row>
            </ScrollView>
            <Input label="أتعاب الاستشارة"  value={form.consult_fee || ""} onChangeText={f("consult_fee")} placeholder="مثال: 500 ج.س / 30 دقيقة" />
            <Input label="اللغات"            value={form.languages || ""}   onChangeText={f("languages")}   placeholder="العربية، الإنجليزية…" />
            <TouchableOpacity onPress={onSave} disabled={saving}
              style={{ backgroundColor: PURPLE, borderRadius: 14, padding: 16, alignItems: "center", marginTop: 20 }}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>💾 حفظ التعديلات</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Services Section ── */}
        {section === "services" && (
          <>
            <SectionTitle text="خدماتي المقدّمة" />
            <Text style={{ color: "#9CA3AF", fontSize: 12, marginBottom: 16, lineHeight: 18 }}>
              أضف الخدمات القانونية التي تقدّمها (عقود، مرافعات، استشارات، توثيق…).{"\n"}تظهر هذه الخدمات للعملاء في ملفك الشخصي.
            </Text>
            {services.map((svc: Service, idx: number) => (
              <View key={idx} style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 12 }}>
                <Row style={{ justifyContent: "space-between", marginBottom: 10 }}>
                  <Text style={{ color: PURPLE, fontWeight: "700" }}>خدمة {idx + 1}</Text>
                  {services.length > 1 && (
                    <TouchableOpacity onPress={() => setServices((p: Service[]) => p.filter((_: any, i: number) => i !== idx))}>
                      <Ionicons name="trash-outline" size={18} color={RED} />
                    </TouchableOpacity>
                  )}
                </Row>
                <Input label="عنوان الخدمة *" value={svc.title} onChangeText={(v: string) => setServices((p: Service[]) => p.map((s: Service, i: number) => i === idx ? { ...s, title: v } : s))} placeholder="مثال: صياغة عقود الإيجار" maxLength={150} />
                <Input label="وصف الخدمة" value={svc.description} onChangeText={(v: string) => setServices((p: Service[]) => p.map((s: Service, i: number) => i === idx ? { ...s, description: v } : s))} placeholder="اشرح ما تشمله هذه الخدمة…" multiline />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Input label="الأتعاب" value={svc.price_text} onChangeText={(v: string) => setServices((p: Service[]) => p.map((s: Service, i: number) => i === idx ? { ...s, price_text: v } : s))} placeholder="500 ج.س" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input label="المدة" value={svc.duration} onChangeText={(v: string) => setServices((p: Service[]) => p.map((s: Service, i: number) => i === idx ? { ...s, duration: v } : s))} placeholder="30 دقيقة" />
                  </View>
                </View>
              </View>
            ))}
            <TouchableOpacity onPress={() => setServices((p: Service[]) => [...p, { title: "", description: "", price_text: "", duration: "" }])}
              style={{ backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER, borderStyle: "dashed", alignItems: "center", marginBottom: 20 }}>
              <Row style={{ gap: 8 }}><Ionicons name="add-circle-outline" size={20} color={PURPLE} /><Text style={{ color: PURPLE, fontWeight: "700" }}>إضافة خدمة جديدة</Text></Row>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} disabled={saving}
              style={{ backgroundColor: PURPLE, borderRadius: 14, padding: 16, alignItems: "center" }}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>💾 حفظ الخدمات</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── Backup Section ── */}
        {section === "backup" && (
          <>
            <SectionTitle text="النسخ الاحتياطي وتصدير البيانات" />
            <View style={{ backgroundColor: "#1E3A2F", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: GREEN + "44", marginBottom: 20 }}>
              <Row style={{ gap: 10, marginBottom: 10 }}>
                <Text style={{ fontSize: 24 }}>🔒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>بياناتك محفوظة في الخادم</Text>
                  <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                    جميع قضاياك ومستنداتك ومحادثاتك مخزّنة بأمان في الخادم. يمكنك تنزيل نسخة PDF شاملة لأرشفتها محلياً.
                  </Text>
                </View>
              </Row>
            </View>

            <Text style={{ color: "#9CA3AF", fontSize: 13, lineHeight: 20, marginBottom: 20 }}>
              يحتوي ملف PDF على:{"\n"}
              📋 بياناتك الشخصية والمهنية{"\n"}
              ⚖️ قائمة جميع قضاياك ({profile.total_contracts} قضية){"\n"}
              🌟 تقييماتك ({profile.review_count} تقييم){"\n"}
              💳 سجل الاشتراكات{"\n"}
              🔧 خدماتك المُقدَّمة
            </Text>

            <TouchableOpacity onPress={onExportPdf} disabled={pdfLoading}
              style={{ backgroundColor: GREEN, borderRadius: 14, padding: 18, alignItems: "center", marginBottom: 14 }}>
              {pdfLoading ? <ActivityIndicator color="#fff" /> : (
                <Row style={{ gap: 10 }}>
                  <Ionicons name="download-outline" size={22} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>تنزيل ملف PDF الشامل</Text>
                </Row>
              )}
            </TouchableOpacity>

            <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: "#D1D5DB", fontWeight: "700", fontSize: 14, marginBottom: 12 }}>📌 ملاحظات قانونية هامة</Text>
              {[
                "يُنصح بتحميل نسخة احتياطية دورية كل شهر",
                "ملف PDF يحمل تاريخ الإصدار ويمكن الاستشهاد به",
                "حافظ على سرية بيانات موكليك وفق أخلاقيات المهنة",
                "لا تشارك ملف البيانات الكامل مع غير المصرّح لهم",
              ].map(n => (
                <Row key={n} style={{ gap: 8, marginBottom: 8 }}>
                  <Ionicons name="alert-circle-outline" size={14} color={GOLD} />
                  <Text style={{ color: "#9CA3AF", fontSize: 12, flex: 1 }}>{n}</Text>
                </Row>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//                         Case Detail Screen (Full Modal)
// ══════════════════════════════════════════════════════════════════════════════
function CaseDetailScreen({ c, messages, docs, loading, msgText, setMsgText, sending, onSend, onClose, onStatusModal, onDocModal, onDeleteDoc, msgListRef, token, onSendWithFile }: any) {
  const insets = useSafeAreaInsets();
  const [innerTab, setInnerTab] = useState<"info"|"chat"|"docs">("chat");

  const FILE_ICONS: Record<string, string> = {
    pdf: "📄", image: "🖼️", video: "🎥", audio: "🎵", default: "📎",
  };
  const fileIcon = (type: string) => {
    if (type.includes("pdf")) return FILE_ICONS.pdf;
    if (type.includes("image")) return FILE_ICONS.image;
    if (type.includes("video")) return FILE_ICONS.video;
    if (type.includes("audio")) return FILE_ICONS.audio;
    return FILE_ICONS.default;
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <LinearGradient colors={["#1A0A2E", BG]} style={{ paddingTop: insets.top + 4, paddingBottom: 14, paddingHorizontal: 18 }}>
        <Row style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <Ionicons name="arrow-back" size={22} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }} numberOfLines={1}>{c.client_name}</Text>
            <Text style={{ color: "#9CA3AF", fontSize: 12 }} numberOfLines={1}>{c.service_title}</Text>
          </View>
          <TouchableOpacity onPress={onStatusModal} style={{ padding: 8 }}>
            <CaseBadge status={c.status} />
          </TouchableOpacity>
        </Row>

        {/* Inner Tabs */}
        <Row style={{ gap: 8 }}>
          {([ ["info","معلومات"], ["chat","الدردشة"], ["docs","المستندات"] ] as ["info"|"chat"|"docs", string][]).map(([key, lbl]) => (
            <TouchableOpacity key={key} onPress={() => setInnerTab(key)}
              style={{ backgroundColor: innerTab === key ? PURPLE : "rgba(255,255,255,0.06)", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}>
              <Text style={{ color: innerTab === key ? "#fff" : "#9CA3AF", fontSize: 13, fontWeight: innerTab === key ? "700" : "400" }}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </Row>
      </LinearGradient>

      {/* ── INFO TAB ── */}
      {innerTab === "info" && (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, marginBottom: 14 }}>
            {[
              ["رقم القضية",    c.contract_no],
              ["العميل",        c.client_name],
              ["الهاتف",        c.client_phone],
              ["الخدمة",        c.service_title],
              ["تاريخ التقديم", fmt(c.created_at)],
              ["تاريخ مفضّل",  c.preferred_date ? fmt(c.preferred_date) : "—"],
            ].map(([label, value]) => (
              <View key={label} style={{ marginBottom: 12 }}>
                <Text style={{ color: "#6B7280", fontSize: 11, marginBottom: 2 }}>{label}</Text>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{value}</Text>
              </View>
            ))}
            {c.details ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: "#6B7280", fontSize: 11, marginBottom: 2 }}>تفاصيل الطلب</Text>
                <Text style={{ color: "#D1D5DB", fontSize: 13, lineHeight: 20 }}>{c.details}</Text>
              </View>
            ) : null}
            {c.lawyer_note ? (
              <View style={{ backgroundColor: PURPLE + "22", borderRadius: 10, padding: 12, marginTop: 4, borderWidth: 1, borderColor: PURPLE + "44" }}>
                <Text style={{ color: PURPLE, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>ملاحظتك</Text>
                <Text style={{ color: "#D1D5DB", fontSize: 13 }}>{c.lawyer_note}</Text>
              </View>
            ) : null}
          </View>

          {/* Client contact buttons */}
          <SectionTitle text="التواصل مع العميل" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.client_phone}`)}
              style={{ flex: 1, backgroundColor: GREEN + "22", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: GREEN }}>
              <Ionicons name="call-outline" size={20} color={GREEN} />
              <Text style={{ color: GREEN, fontWeight: "700", fontSize: 13, marginTop: 6 }}>اتصال</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/${c.client_phone.replace(/\D/g, "")}`)}
              style={{ flex: 1, backgroundColor: "#25D366" + "22", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#25D366" }}>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              <Text style={{ color: "#25D366", fontWeight: "700", fontSize: 13, marginTop: 6 }}>واتساب</Text>
            </TouchableOpacity>
          </View>

          {/* Change Status button */}
          {NEXT_STATUS[c.status] && (
            <>
              <SectionTitle text="إجراءات القضية" />
              <TouchableOpacity onPress={onStatusModal} style={{ backgroundColor: PURPLE + "22", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: PURPLE, alignItems: "center" }}>
                <Row style={{ gap: 10 }}><Ionicons name="git-branch-outline" size={20} color={PURPLE} /><Text style={{ color: PURPLE, fontWeight: "700", fontSize: 15 }}>تغيير حالة القضية</Text></Row>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

      {/* ── CHAT TAB ── */}
      {innerTab === "chat" && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={insets.top + 20}>
          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={PURPLE} /></View>
          ) : (
            <FlatList
              ref={msgListRef}
              data={messages}
              keyExtractor={m => String(m.id)}
              contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 20 }}
              ListEmptyComponent={() => (
                <View style={{ alignItems: "center", paddingTop: 60 }}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
                  <Text style={{ color: "#6B7280" }}>ابدأ المحادثة مع عميلك</Text>
                </View>
              )}
              renderItem={({ item: m }: { item: Message }) => {
                const isLawyer = m.sender_role === "lawyer";
                return (
                  <View style={{ alignItems: isLawyer ? "flex-start" : "flex-end" }}>
                    <View style={{
                      maxWidth: "80%",
                      backgroundColor: isLawyer ? PURPLE + "33" : CARD,
                      borderRadius: 16,
                      borderBottomLeftRadius: isLawyer ? 4 : 16,
                      borderBottomRightRadius: isLawyer ? 16 : 4,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: isLawyer ? PURPLE + "55" : BORDER,
                    }}>
                      <Text style={{ color: isLawyer ? PURPLE : "#9CA3AF", fontSize: 10, marginBottom: 4, fontWeight: "700" }}>
                        {isLawyer ? "أنت" : m.sender_name}
                      </Text>
                      {m.body ? <Text style={{ color: "#fff", fontSize: 14, lineHeight: 20 }}>{m.body}</Text> : null}
                      {m.file_url ? (
                        <TouchableOpacity onPress={() => Linking.openURL(m.file_url)} style={{ marginTop: m.body ? 8 : 0, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 22 }}>{fileIcon(m.file_type)}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: "#D1D5DB", fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{m.file_name || "ملف مرفق"}</Text>
                            <Text style={{ color: "#6B7280", fontSize: 10 }}>اضغط للفتح</Text>
                          </View>
                        </TouchableOpacity>
                      ) : null}
                      <Text style={{ color: "#4B5563", fontSize: 10, marginTop: 4, textAlign: isLawyer ? "left" : "right" }}>{fmtTime(m.created_at)}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
          {/* Input */}
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: "#111122" }}>
            <TouchableOpacity onPress={onSendWithFile} style={{ padding: 10, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER }}>
              <Ionicons name="attach-outline" size={20} color="#9CA3AF" />
            </TouchableOpacity>
            <TextInput
              value={msgText} onChangeText={setMsgText}
              placeholder="اكتب رسالة…" placeholderTextColor="#4B5563"
              multiline maxLength={3000}
              style={{ flex: 1, color: "#fff", fontSize: 14, backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: BORDER, maxHeight: 120 }}
            />
            <TouchableOpacity onPress={() => onSend()} disabled={sending || !msgText.trim()}
              style={{ padding: 12, backgroundColor: msgText.trim() ? PURPLE : CARD, borderRadius: 12, borderWidth: 1, borderColor: msgText.trim() ? PURPLE : BORDER }}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color={msgText.trim() ? "#fff" : "#6B7280"} />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── DOCS TAB ── */}
      {innerTab === "docs" && (
        <View style={{ flex: 1 }}>
          <View style={{ padding: 14 }}>
            <TouchableOpacity onPress={onDocModal}
              style={{ backgroundColor: BLUE + "22", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BLUE, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 }}>
              <Ionicons name="cloud-upload-outline" size={20} color={BLUE} />
              <Text style={{ color: BLUE, fontWeight: "700", fontSize: 15 }}>رفع مستند جديد</Text>
            </TouchableOpacity>
          </View>
          {loading ? <ActivityIndicator color={PURPLE} style={{ marginTop: 40 }} /> :
            docs.length === 0 ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>📂</Text>
                <Text style={{ color: "#6B7280" }}>لا توجد مستندات بعد</Text>
              </View>
            ) : (
              <FlatList
                data={docs} keyExtractor={d => String(d.id)}
                contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 40 }}
                renderItem={({ item: d }: { item: Document }) => (
                  <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Row style={{ gap: 10, flex: 1 }}>
                        <Text style={{ fontSize: 28 }}>{fileIcon(d.file_type)}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1}>{d.title}</Text>
                          <Text style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>{d.file_name}</Text>
                          <Row style={{ gap: 8, marginTop: 3 }}>
                            <Text style={{ color: "#4B5563", fontSize: 10 }}>{d.file_size > 0 ? fmtSize(d.file_size) : ""}</Text>
                            <Text style={{ color: d.uploaded_by === "lawyer" ? PURPLE : GREEN, fontSize: 10, fontWeight: "600" }}>
                              {d.uploaded_by === "lawyer" ? "📤 أنت" : "📥 العميل"}
                            </Text>
                            <Text style={{ color: "#4B5563", fontSize: 10 }}>{fmt(d.created_at)}</Text>
                          </Row>
                          {d.notes ? <Text style={{ color: "#6B7280", fontSize: 11, marginTop: 4 }}>{d.notes}</Text> : null}
                        </View>
                      </Row>
                      <View style={{ gap: 8 }}>
                        <TouchableOpacity onPress={() => Linking.openURL(d.file_url)} style={{ padding: 8 }}>
                          <Ionicons name="open-outline" size={18} color={BLUE} />
                        </TouchableOpacity>
                        {d.uploaded_by === "lawyer" && (
                          <TouchableOpacity onPress={() => onDeleteDoc(d.id)} style={{ padding: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={RED} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </Row>
                  </View>
                )}
              />
            )}
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//                           PDF HTML Builder
// ══════════════════════════════════════════════════════════════════════════════
function buildPdfHtml(data: any): string {
  const p = data.profile || {};
  const cases = (data.cases || []) as any[];
  const services = (data.services || []) as any[];
  const ratings = (data.ratings || []) as any[];
  const history = (data.subscription_history || []) as any[];
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("ar-SD") : "—";
  const STATUS_AR: Record<string,string> = { pending: "قيد المراجعة", accepted: "مقبولة", in_progress: "قيد التنفيذ", completed: "مكتملة", rejected: "مرفوضة", cancelled: "ملغية" };

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ملف المحامي — ${p.full_name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', sans-serif; background: #f8f9fa; color: #1a1a2e; direction: rtl; font-size: 13px; }
  .page { max-width: 800px; margin: 0 auto; background: #fff; }
  .header { background: linear-gradient(135deg, #1a0a2e, #8B5CF6); color: #fff; padding: 30px 40px; }
  .header h1 { font-size: 26px; font-weight: 800; margin-bottom: 6px; }
  .header .sub { font-size: 14px; opacity: 0.8; }
  .meta { display: flex; gap: 20px; margin-top: 16px; flex-wrap: wrap; }
  .meta span { background: rgba(255,255,255,0.15); border-radius: 20px; padding: 4px 14px; font-size: 12px; }
  .section { padding: 24px 40px; border-bottom: 1px solid #e5e7eb; }
  .section h2 { font-size: 16px; color: #8B5CF6; font-weight: 800; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .field label { font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 3px; }
  .field value, .field .val { font-size: 13px; color: #1a1a2e; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f3f4f6; padding: 8px 12px; text-align: right; font-weight: 700; color: #374151; }
  td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #4b5563; }
  tr:nth-child(even) td { background: #fafafa; }
  .badge { display: inline-block; border-radius: 12px; padding: 2px 10px; font-size: 11px; font-weight: 700; }
  .footer { background: #f9fafb; padding: 20px 40px; text-align: center; font-size: 11px; color: #9ca3af; }
  .star { color: #F59E0B; }
  .stat-box { background: #f3f4f6; border-radius: 10px; padding: 14px; text-align: center; }
  .stat-val { font-size: 24px; font-weight: 800; color: #8B5CF6; }
  .stat-lbl { font-size: 11px; color: #6b7280; margin-top: 3px; }
  .svc-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 10px; }
  @media print { body { background: #fff; } .page { max-width: 100%; } }
</style>
</head>
<body>
<div class="page">

<!-- HEADER -->
<div class="header">
  <h1>⚖️ ${p.full_name}</h1>
  <div class="sub">${p.title || "محامٍ"} — رقم النقابة: ${p.bar_number || "—"}</div>
  <div class="meta">
    <span>📍 ${p.district || "—"}</span>
    <span>📞 ${p.phone || "—"}</span>
    ${p.experience_y ? `<span>⏱ ${p.experience_y} سنوات خبرة</span>` : ""}
    ${p.plan_name_ar ? `<span>${p.plan_icon || ""} ${p.plan_name_ar}</span>` : ""}
    <span>📅 صدر: ${new Date().toLocaleDateString("ar-SD")}</span>
  </div>
</div>

<!-- STATS -->
<div class="section">
  <h2>📊 إحصائيات سريعة</h2>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
    <div class="stat-box"><div class="stat-val">${cases.length}</div><div class="stat-lbl">إجمالي القضايا</div></div>
    <div class="stat-box"><div class="stat-val">${cases.filter((c:any)=>c.status==="completed").length}</div><div class="stat-lbl">مكتملة</div></div>
    <div class="stat-box"><div class="stat-val">${p.avg_rating?.toFixed(1) || "—"}</div><div class="stat-lbl">متوسط التقييم</div></div>
    <div class="stat-box"><div class="stat-val">${p.review_count || 0}</div><div class="stat-lbl">عدد التقييمات</div></div>
  </div>
</div>

<!-- PROFILE -->
<div class="section">
  <h2>👤 البيانات الشخصية والمهنية</h2>
  <div class="grid2">
    <div class="field"><label>الاسم الكامل</label><div class="val">${p.full_name || "—"}</div></div>
    <div class="field"><label>اللقب</label><div class="val">${p.title || "—"}</div></div>
    <div class="field"><label>الهاتف</label><div class="val">${p.phone || "—"}</div></div>
    <div class="field"><label>واتساب</label><div class="val">${p.whatsapp || "—"}</div></div>
    <div class="field"><label>البريد الإلكتروني</label><div class="val">${p.email || "—"}</div></div>
    <div class="field"><label>المنطقة</label><div class="val">${p.district || "—"}</div></div>
    <div class="field"><label>عنوان المكتب</label><div class="val">${p.office_addr || "—"}</div></div>
    <div class="field"><label>أتعاب الاستشارة</label><div class="val">${p.consult_fee || "—"}</div></div>
    <div class="field"><label>سنوات الخبرة</label><div class="val">${p.experience_y || 0} سنة</div></div>
    <div class="field"><label>اللغات</label><div class="val">${p.languages || "العربية"}</div></div>
  </div>
  ${p.bio ? `<div style="margin-top:16px;padding:14px;background:#f9fafb;border-radius:10px;color:#4b5563;line-height:1.7">${p.bio}</div>` : ""}
</div>

<!-- SERVICES -->
${services.length ? `
<div class="section">
  <h2>🔧 الخدمات المقدّمة</h2>
  ${services.map((s:any) => `
    <div class="svc-card">
      <strong>${s.title}</strong>
      ${s.price_text ? `<span style="color:#8B5CF6;margin-right:12px;font-size:12px">${s.price_text}</span>` : ""}
      ${s.duration ? `<span style="color:#6b7280;font-size:12px"> | ${s.duration}</span>` : ""}
      ${s.description ? `<p style="color:#6b7280;margin-top:6px;font-size:12px;line-height:1.6">${s.description}</p>` : ""}
    </div>
  `).join("")}
</div>` : ""}

<!-- CASES -->
<div class="section">
  <h2>📂 سجل القضايا (${cases.length} قضية)</h2>
  <table>
    <thead><tr>
      <th>رقم العقد</th><th>العميل</th><th>الخدمة</th><th>الحالة</th>
      <th>تاريخ التقديم</th><th>تاريخ آخر تحديث</th>
    </tr></thead>
    <tbody>
      ${cases.map((c:any) => `<tr>
        <td style="font-family:monospace;font-size:11px">${c.contract_no}</td>
        <td>${c.client_name}<br><span style="color:#9ca3af;font-size:10px">${c.client_phone}</span></td>
        <td>${c.service_title}</td>
        <td><span class="badge" style="background:${STATUS_CONF[c.status]?.color || "#6B7280"}22;color:${STATUS_CONF[c.status]?.color || "#6B7280"}">${STATUS_AR[c.status] || c.status}</span></td>
        <td>${fmtDate(c.created_at)}</td>
        <td>${fmtDate(c.updated_at)}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>

<!-- RATINGS -->
${ratings.length ? `
<div class="section">
  <h2>⭐ التقييمات (${ratings.length})</h2>
  <table>
    <thead><tr><th>المقيّم</th><th>التقييم</th><th>التعليق</th><th>التاريخ</th></tr></thead>
    <tbody>
      ${ratings.map((r:any) => `<tr>
        <td>${r.user_name}</td>
        <td>${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</td>
        <td>${r.comment || "—"}</td>
        <td>${fmtDate(r.created_at)}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>` : ""}

<!-- SUBSCRIPTION HISTORY -->
${history.length ? `
<div class="section">
  <h2>💳 سجل الاشتراكات</h2>
  <table>
    <thead><tr><th>الخطة</th><th>العمولة</th><th>تاريخ الانتهاء</th><th>مرجع الدفع</th><th>تاريخ التغيير</th></tr></thead>
    <tbody>
      ${history.map((h:any) => `<tr>
        <td>${h.plan_name_ar || h.plan_name}</td>
        <td>${h.commission_pct > 0 ? h.commission_pct + "%" : "—"}</td>
        <td>${fmtDate(h.expires_at)}</td>
        <td style="font-family:monospace;font-size:11px">${h.payment_ref || "—"}</td>
        <td>${fmtDate(h.changed_at)}</td>
      </tr>`).join("")}
    </tbody>
  </table>
</div>` : ""}

<!-- FOOTER -->
<div class="footer">
  <p>⚖️ تطبيق حصاحيصاوي — القسم القانوني</p>
  <p style="margin-top:6px">صدر هذا الملف بتاريخ ${new Date().toLocaleString("ar-SD")} — للاستفسار: تطبيق حصاحيصاوي</p>
  <p style="margin-top:8px;color:#d1d5db">المستند السري — للاستخدام الشخصي والمهني فقط</p>
</div>

</div>
</body>
</html>`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  input: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: "#fff",
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "System" : undefined,
  },
});
