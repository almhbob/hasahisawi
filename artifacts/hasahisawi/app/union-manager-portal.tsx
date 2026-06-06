import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
  RefreshControl, FlatList, Animated as RNAnimated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const UC   = "#6366F1";
const UC2  = "#A5B4FC";
const GREEN = "#22C55E";
const GOLD  = "#F59E0B";
const RED   = "#EF4444";

const MGTOKEN_KEY = "union_manager_token";
const MGINFO_KEY  = "union_manager_info";

type Manager = { id: number; full_name: string; title: string; username: string };
type Staff   = { id: number; full_name: string; role: string; committee?: string; phone?: string; email?: string; notes?: string; is_active: boolean; created_at: string };
type Meeting = { id: number; title: string; description?: string; meeting_date?: string; meeting_time?: string; location?: string; type: string; status: string; created_at: string };
type Msg     = { id: number; sender_name: string; content: string; is_pinned: boolean; created_at: string };
type JoinRequest = {
  id: number; full_name: string; phone?: string; email?: string;
  institution?: string; major?: string; study_stage?: string;
  status: "pending" | "approved" | "rejected";
  admin_note?: string; created_at: string;
  committees?: string; motivation?: string;
};

const COMMITTEES = [
  "الأمانة العامة", "أمانة الإعلام والثقافة", "أمانة التدريب والتطوير",
  "أمانة الشؤون الأكاديمية", "أمانة الأنشطة والفعاليات", "أمانة المرأة والأسرة",
  "أمانة الخدمات والرفاه", "أمانة العلاقات الخارجية", "أمانة الصحة والبيئة",
  "أمانة المال والإدارة",
];

const MTG_TYPES = ["meeting", "urgent", "workshop", "training"];
const MTG_TYPE_LABEL: Record<string, string> = { meeting: "اجتماع", urgent: "عاجل", workshop: "ورشة عمل", training: "تدريب" };
const MTG_TYPE_COLOR: Record<string, string> = { meeting: UC, urgent: RED, workshop: GOLD, training: GREEN };

function formatDate(s?: string) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return s; }
}

// ── تسجيل push token ──────────────────────────────────────────────
async function registerPushToken(token: string) {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;
    const pushToken = (await Notifications.getExpoPushTokenAsync()).data;
    await fetch(`${getApiUrl()}/api/union-manager/push-token`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pushToken }),
    });
  } catch {}
}

// ── شاشة تسجيل الدخول ─────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (token: string, mgr: Manager) => void }) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال اسم المستخدم وكلمة المرور"); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/union-manager/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        await AsyncStorage.setItem(MGTOKEN_KEY, data.token);
        await AsyncStorage.setItem(MGINFO_KEY, JSON.stringify(data.manager));
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onLogin(data.token, data.manager);
      } else {
        Alert.alert("خطأ في الدخول", data.error || "بيانات غير صحيحة");
      }
    } catch {
      Alert.alert("خطأ", "تعذر الاتصال بالخادم");
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={["#0B0F1A", "#1E1B4B"]} style={[ls.hero, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={ls.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={UC2} />
        </TouchableOpacity>
        <View style={ls.heroIcon}>
          <Ionicons name="shield-checkmark" size={44} color={UC2} />
        </View>
        <Text style={ls.heroTitle}>بوابة إدارة الاتحاد</Text>
        <Text style={ls.heroSub}>اتحاد طلاب محلية الحصاحيصا</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.delay(100).springify()} style={ls.card}>
          <Text style={ls.cardTitle}>تسجيل الدخول</Text>
          <Text style={ls.cardSub}>للمسؤولين المعتمدين من إدارة التطبيق فقط</Text>

          <Text style={ls.label}>اسم المستخدم</Text>
          <TextInput
            style={ls.input}
            value={username} onChangeText={setUsername}
            placeholder="أدخل اسم المستخدم"
            placeholderTextColor={Colors.textMuted}
            textAlign="right" autoCapitalize="none"
          />

          <Text style={ls.label}>كلمة المرور</Text>
          <View style={ls.passRow}>
            <TextInput
              style={[ls.input, { flex: 1 }]}
              value={password} onChangeText={setPassword}
              placeholder="أدخل كلمة المرور"
              placeholderTextColor={Colors.textMuted}
              textAlign="right" secureTextEntry={!showPass}
            />
            <TouchableOpacity onPress={() => setShowPass(p => !p)} style={ls.eyeBtn}>
              <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[ls.loginBtn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={ls.loginBtnText}>دخول</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()} style={ls.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
          <Text style={ls.infoText}>
            {"للحصول على بيانات دخول إدارة الاتحاد، يجب تقديم استمارة الانضمام والحصول على الموافقة من مشرف التطبيق."}
          </Text>
        </Animated.View>

        <TouchableOpacity style={ls.applyBtn} onPress={() => router.push("/union-manager-apply" as any)}>
          <Ionicons name="document-text-outline" size={20} color={UC} />
          <Text style={ls.applyBtnText}>تقديم استمارة الانضمام</Text>
          <Ionicons name="chevron-back" size={16} color={UC} />
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── تبويب طلبات الانضمام ──────────────────────────────────────────
function RequestsTab({ token, onBadge }: { token: string; onBadge: (n: number) => void }) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]     = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [selected, setSelected] = useState<JoinRequest | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving]     = useState(false);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/join-requests?status=${filter}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setRequests(d.applications || []);
        const pending = (d.applications || []).filter((a: JoinRequest) => a.status === "pending").length;
        onBadge(pending);
      }
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token, filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const updateStatus = async (id: number, status: "approved" | "rejected") => {
    setSaving(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/join-requests/${id}/status`, {
        method: "PATCH", headers,
        body: JSON.stringify({ status, admin_note: noteText.trim() || null }),
      });
      if (r.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSelected(null); setNoteText(""); load();
      } else { const d = await r.json(); Alert.alert("خطأ", d.error); }
    } catch { Alert.alert("خطأ", "فشل الاتصال"); } finally { setSaving(false); }
  };

  const STATUS_COLOR: Record<string, string> = { pending: GOLD, approved: GREEN, rejected: RED };
  const STATUS_LABEL: Record<string, string> = { pending: "معلّق", approved: "مقبول", rejected: "مرفوض" };
  const STATUS_ICON:  Record<string, string> = { pending: "time-outline", approved: "checkmark-circle", rejected: "close-circle" };

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "all",      label: "الكل" },
    { key: "pending",  label: "معلّق" },
    { key: "approved", label: "مقبول" },
    { key: "rejected", label: "مرفوض" },
  ];

  if (loading) return <View style={t.center}><ActivityIndicator color={UC} /></View>;

  return (
    <View style={{ flex: 1 }}>
      {/* فلاتر */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rq.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.key} onPress={() => setFilter(f.key)}
            style={[rq.filterChip, filter === f.key && rq.filterChipActive]}>
            <Text style={[rq.filterChipText, filter === f.key && rq.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
      >
        {requests.length === 0 ? (
          <View style={t.empty}>
            <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} />
            <Text style={t.emptyText}>لا توجد طلبات</Text>
          </View>
        ) : requests.map((req, i) => (
          <Animated.View key={req.id} entering={FadeInDown.delay(i * 50).springify()}>
            <TouchableOpacity style={[t.card, rq.reqCard]} onPress={() => { setSelected(req); setNoteText(req.admin_note || ""); }}>
              <View style={rq.reqHeader}>
                <View style={[rq.statusBadge, { backgroundColor: (STATUS_COLOR[req.status] || GOLD) + "20" }]}>
                  <Ionicons name={STATUS_ICON[req.status] as any} size={14} color={STATUS_COLOR[req.status] || GOLD} />
                  <Text style={[rq.statusText, { color: STATUS_COLOR[req.status] || GOLD }]}>{STATUS_LABEL[req.status]}</Text>
                </View>
                <Text style={rq.date}>{formatDate(req.created_at)}</Text>
              </View>

              <View style={rq.nameRow}>
                <View style={[t.avatar, { backgroundColor: UC + "20" }]}>
                  <Text style={[t.avatarText, { color: UC }]}>{req.full_name[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={t.cardName}>{req.full_name}</Text>
                  <Text style={t.cardSub}>{[req.institution, req.major, req.study_stage].filter(Boolean).join(" · ")}</Text>
                  {req.phone && <Text style={t.cardInfo}>{req.phone}</Text>}
                </View>
                <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
              </View>

              {req.admin_note && (
                <View style={rq.notePreview}>
                  <Text style={rq.notePreviewText} numberOfLines={1}>ملاحظة: {req.admin_note}</Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>

      {/* Modal التفاصيل والقرار */}
      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={m.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={[m.sheet, { maxHeight: "92%" }]}>
              <View style={m.handle} />
              <View style={rq.modalHeader}>
                <Text style={m.title}>تفاصيل الطلب</Text>
                <TouchableOpacity onPress={() => setSelected(null)} hitSlop={10}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {selected && (
                <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
                  {/* بيانات الطالب */}
                  <View style={rq.detailCard}>
                    <Text style={rq.detailSection}>بيانات المتقدم</Text>
                    {[
                      { label: "الاسم الكامل", val: selected.full_name },
                      { label: "الهاتف", val: selected.phone },
                      { label: "البريد", val: selected.email },
                      { label: "المؤسسة", val: selected.institution },
                      { label: "التخصص", val: selected.major },
                      { label: "المرحلة الدراسية", val: selected.study_stage },
                    ].filter(r => r.val).map(r => (
                      <View key={r.label} style={rq.detailRow}>
                        <Text style={rq.detailLabel}>{r.label}</Text>
                        <Text style={rq.detailVal}>{r.val}</Text>
                      </View>
                    ))}
                  </View>

                  {selected.motivation && (
                    <View style={rq.detailCard}>
                      <Text style={rq.detailSection}>الدافع للانضمام</Text>
                      <Text style={rq.motivText}>{selected.motivation}</Text>
                    </View>
                  )}

                  {/* حالة الطلب الحالية */}
                  <View style={[rq.detailCard, { flexDirection: "row-reverse", alignItems: "center", gap: 10 }]}>
                    <Ionicons name={STATUS_ICON[selected.status] as any} size={20} color={STATUS_COLOR[selected.status]} />
                    <Text style={[rq.detailSection, { color: STATUS_COLOR[selected.status], marginBottom: 0 }]}>
                      الحالة: {STATUS_LABEL[selected.status]}
                    </Text>
                  </View>

                  {/* ملاحظة المسؤول */}
                  <View>
                    <Text style={m.label}>ملاحظة (اختيارية)</Text>
                    <TextInput
                      style={[m.input, { height: 70, textAlignVertical: "top" }]}
                      value={noteText} onChangeText={setNoteText}
                      placeholder="أضف ملاحظة للطالب أو للسجل..."
                      placeholderTextColor={Colors.textMuted}
                      textAlign="right" multiline
                    />
                  </View>

                  {/* أزرار القرار */}
                  {selected.status === "pending" ? (
                    <View style={rq.actionRow}>
                      <TouchableOpacity
                        style={[rq.rejectBtn, saving && { opacity: 0.6 }]}
                        onPress={() => Alert.alert("تأكيد الرفض", `هل تريد رفض طلب ${selected.full_name}؟`, [
                          { text: "إلغاء", style: "cancel" },
                          { text: "رفض", style: "destructive", onPress: () => updateStatus(selected.id, "rejected") },
                        ])}
                        disabled={saving}
                      >
                        <Ionicons name="close-circle-outline" size={20} color={RED} />
                        <Text style={[rq.actionBtnText, { color: RED }]}>رفض</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[rq.approveBtn, saving && { opacity: 0.6 }]}
                        onPress={() => Alert.alert("تأكيد القبول", `هل تريد قبول طلب ${selected.full_name}؟`, [
                          { text: "إلغاء", style: "cancel" },
                          { text: "قبول", onPress: () => updateStatus(selected.id, "approved") },
                        ])}
                        disabled={saving}
                      >
                        {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                          <>
                            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                            <Text style={[rq.actionBtnText, { color: "#fff" }]}>قبول</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={rq.actionRow}>
                      <TouchableOpacity
                        style={[rq.rejectBtn, saving && { opacity: 0.6 }]}
                        onPress={() => updateStatus(selected.id, "rejected")}
                        disabled={saving}
                      >
                        <Ionicons name="close-circle-outline" size={18} color={RED} />
                        <Text style={[rq.actionBtnText, { color: RED }]}>تغيير لـ: مرفوض</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[rq.approveBtn, saving && { opacity: 0.6 }]}
                        onPress={() => updateStatus(selected.id, "approved")}
                        disabled={saving}
                      >
                        <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                        <Text style={[rq.actionBtnText, { color: "#fff" }]}>تغيير لـ: مقبول</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ── تبويب الموظفين ────────────────────────────────────────────────
function StaffTab({ token }: { token: string }) {
  const [staff, setStaff]       = useState<Staff[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [editItem, setEditItem]     = useState<Staff | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm] = useState({ full_name: "", role: "", committee: "", phone: "", email: "", notes: "" });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/staff`, { headers });
      if (r.ok) setStaff(await r.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEditItem(null); setForm({ full_name: "", role: "", committee: "", phone: "", email: "", notes: "" }); setShowModal(true); };
  const openEdit = (s: Staff) => { setEditItem(s); setForm({ full_name: s.full_name, role: s.role, committee: s.committee || "", phone: s.phone || "", email: s.email || "", notes: s.notes || "" }); setShowModal(true); };

  const save = async () => {
    if (!form.full_name.trim() || !form.role.trim()) { Alert.alert("تنبيه", "الاسم والمنصب مطلوبان"); return; }
    setSaving(true);
    try {
      const url = editItem ? `${getApiUrl()}/api/union-manager/staff/${editItem.id}` : `${getApiUrl()}/api/union-manager/staff`;
      const r = await fetch(url, { method: editItem ? "PATCH" : "POST", headers, body: JSON.stringify(form) });
      if (r.ok) { if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setShowModal(false); load(); }
      else { const d = await r.json(); Alert.alert("خطأ", d.error || "فشل الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذر الاتصال"); } finally { setSaving(false); }
  };

  const remove = (id: number, name: string) => {
    Alert.alert("تأكيد الحذف", `هل تريد حذف ${name}؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        try { await fetch(`${getApiUrl()}/api/union-manager/staff/${id}`, { method: "DELETE", headers }); setStaff(p => p.filter(s => s.id !== id)); }
        catch { Alert.alert("خطأ", "فشل الحذف"); }
      }},
    ]);
  };

  if (loading) return <View style={t.center}><ActivityIndicator color={UC} /></View>;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}>
        {staff.length === 0 ? (
          <View style={t.empty}>
            <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
            <Text style={t.emptyText}>لا يوجد موظفون بعد</Text>
          </View>
        ) : staff.map((s, i) => (
          <Animated.View key={s.id} entering={FadeInDown.delay(i * 60).springify()} style={t.card}>
            <View style={t.cardHeader}>
              <View style={t.avatar}><Text style={t.avatarText}>{s.full_name[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={t.cardName}>{s.full_name}</Text>
                <Text style={t.cardRole}>{s.role}</Text>
                {s.committee && <Text style={t.cardSub}>{s.committee}</Text>}
              </View>
              <View style={t.cardActions}>
                <TouchableOpacity onPress={() => openEdit(s)} style={t.actionBtn}><Ionicons name="pencil-outline" size={16} color={UC} /></TouchableOpacity>
                <TouchableOpacity onPress={() => remove(s.id, s.full_name)} style={[t.actionBtn, { borderColor: "#EF444420" }]}><Ionicons name="trash-outline" size={16} color={RED} /></TouchableOpacity>
              </View>
            </View>
            {(s.phone || s.email) && (
              <View style={t.cardFooter}>
                {s.phone && <Text style={t.cardInfo}>{s.phone}</Text>}
                {s.email && <Text style={t.cardInfo}>{s.email}</Text>}
              </View>
            )}
          </Animated.View>
        ))}
      </ScrollView>

      <TouchableOpacity style={t.fab} onPress={openAdd}>
        <LinearGradient colors={[UC, "#4338CA"]} style={t.fabInner}>
          <Ionicons name="person-add-outline" size={22} color="#fff" />
          <Text style={t.fabText}>إضافة موظف</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={m.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={m.sheet}>
              <View style={m.handle} />
              <Text style={m.title}>{editItem ? "تعديل الموظف" : "إضافة موظف جديد"}</Text>
              <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                {([
                  { key: "full_name", label: "الاسم الكامل *",         placeholder: "اسم الموظف" },
                  { key: "role",      label: "المنصب / الوظيفة *",     placeholder: "مثال: أمين الإعلام" },
                  { key: "phone",     label: "رقم الهاتف",             placeholder: "09XXXXXXXX", keyboardType: "phone-pad" },
                  { key: "email",     label: "البريد الإلكتروني",      placeholder: "example@email.com", keyboardType: "email-address" },
                  { key: "notes",     label: "ملاحظات",                placeholder: "أي ملاحظات...", multiline: true },
                ] as any[]).map(f => (
                  <View key={f.key}>
                    <Text style={m.label}>{f.label}</Text>
                    <TextInput
                      style={[m.input, f.multiline && { height: 80, textAlignVertical: "top" }]}
                      value={(form as any)[f.key]} onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                      placeholder={f.placeholder} placeholderTextColor={Colors.textMuted}
                      textAlign="right" keyboardType={f.keyboardType || "default"} multiline={f.multiline}
                    />
                  </View>
                ))}
                <Text style={m.label}>الأمانة / اللجنة</Text>
                <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
                  {COMMITTEES.map(c => (
                    <TouchableOpacity key={c} onPress={() => setForm(p => ({ ...p, committee: p.committee === c ? "" : c }))}
                      style={[m.chip, form.committee === c && m.chipActive]}>
                      <Text style={[m.chipText, form.committee === c && m.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <View style={m.btnRow}>
                <TouchableOpacity style={m.cancelBtn} onPress={() => setShowModal(false)}><Text style={m.cancelText}>إلغاء</Text></TouchableOpacity>
                <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={m.saveText}>حفظ</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ── تبويب الاجتماعات ──────────────────────────────────────────────
function MeetingsTab({ token }: { token: string }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [editItem, setEditItem]     = useState<Meeting | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm] = useState({ title: "", description: "", meeting_date: "", meeting_time: "", location: "", type: "meeting" });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/meetings`, { headers });
      if (r.ok) setMeetings(await r.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEditItem(null); setForm({ title: "", description: "", meeting_date: "", meeting_time: "", location: "", type: "meeting" }); setShowModal(true); };
  const openEdit = (mtg: Meeting) => { setEditItem(mtg); setForm({ title: mtg.title, description: mtg.description || "", meeting_date: mtg.meeting_date || "", meeting_time: mtg.meeting_time || "", location: mtg.location || "", type: mtg.type }); setShowModal(true); };

  const save = async () => {
    if (!form.title.trim()) { Alert.alert("تنبيه", "عنوان الاجتماع مطلوب"); return; }
    setSaving(true);
    try {
      const url = editItem ? `${getApiUrl()}/api/union-manager/meetings/${editItem.id}` : `${getApiUrl()}/api/union-manager/meetings`;
      const r = await fetch(url, { method: editItem ? "PATCH" : "POST", headers, body: JSON.stringify(form) });
      if (r.ok) { setShowModal(false); load(); if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      else { const d = await r.json(); Alert.alert("خطأ", d.error); }
    } catch { Alert.alert("خطأ", "فشل الحفظ"); } finally { setSaving(false); }
  };

  const remove = (id: number) => {
    Alert.alert("تأكيد", "هل تريد حذف هذا الاجتماع؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        await fetch(`${getApiUrl()}/api/union-manager/meetings/${id}`, { method: "DELETE", headers });
        setMeetings(p => p.filter(m => m.id !== id));
      }},
    ]);
  };

  if (loading) return <View style={t.center}><ActivityIndicator color={UC} /></View>;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}>
        {meetings.length === 0 ? (
          <View style={t.empty}>
            <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
            <Text style={t.emptyText}>لا توجد اجتماعات بعد</Text>
          </View>
        ) : meetings.map((mtg, i) => (
          <Animated.View key={mtg.id} entering={FadeInDown.delay(i * 60).springify()} style={t.card}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
              <View style={[t.mtgTypeIcon, { backgroundColor: (MTG_TYPE_COLOR[mtg.type] || UC) + "20" }]}>
                <Ionicons name={mtg.type === "urgent" ? "alert-circle" : "calendar"} size={20} color={MTG_TYPE_COLOR[mtg.type] || UC} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Text style={t.cardName}>{mtg.title}</Text>
                  <View style={[t.typeBadge, { backgroundColor: (MTG_TYPE_COLOR[mtg.type] || UC) + "20" }]}>
                    <Text style={[t.typeBadgeText, { color: MTG_TYPE_COLOR[mtg.type] || UC }]}>{MTG_TYPE_LABEL[mtg.type] || mtg.type}</Text>
                  </View>
                </View>
                {mtg.meeting_date && <Text style={t.cardSub}>{mtg.meeting_date} {mtg.meeting_time || ""}</Text>}
                {mtg.location && <Text style={t.cardInfo}>{mtg.location}</Text>}
              </View>
              <View style={t.cardActions}>
                <TouchableOpacity onPress={() => openEdit(mtg)} style={t.actionBtn}><Ionicons name="pencil-outline" size={16} color={UC} /></TouchableOpacity>
                <TouchableOpacity onPress={() => remove(mtg.id)} style={[t.actionBtn, { borderColor: "#EF444420" }]}><Ionicons name="trash-outline" size={16} color={RED} /></TouchableOpacity>
              </View>
            </View>
            {mtg.description && <Text style={[t.cardSub, { marginTop: 6 }]}>{mtg.description}</Text>}
          </Animated.View>
        ))}
      </ScrollView>

      <TouchableOpacity style={t.fab} onPress={openAdd}>
        <LinearGradient colors={[UC, "#4338CA"]} style={t.fabInner}>
          <Ionicons name="calendar-outline" size={22} color="#fff" />
          <Text style={t.fabText}>نداء اجتماع</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Modal visible={showModal} animationType="slide" transparent>
        <View style={m.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={m.sheet}>
              <View style={m.handle} />
              <Text style={m.title}>{editItem ? "تعديل الاجتماع" : "نداء اجتماع جديد"}</Text>
              <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                <Text style={m.label}>نوع الاجتماع</Text>
                <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
                  {MTG_TYPES.map(ty => (
                    <TouchableOpacity key={ty} onPress={() => setForm(p => ({ ...p, type: ty }))}
                      style={[m.chip, form.type === ty && { backgroundColor: (MTG_TYPE_COLOR[ty] || UC) + "30", borderColor: MTG_TYPE_COLOR[ty] || UC }]}>
                      <Text style={[m.chipText, form.type === ty && { color: MTG_TYPE_COLOR[ty] || UC }]}>{MTG_TYPE_LABEL[ty]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {([
                  { key: "title",        label: "عنوان الاجتماع *", placeholder: "موضوع الاجتماع" },
                  { key: "meeting_date", label: "التاريخ",           placeholder: "YYYY-MM-DD", keyboardType: "numeric" },
                  { key: "meeting_time", label: "الوقت",             placeholder: "HH:MM" },
                  { key: "location",     label: "المكان",             placeholder: "قاعة الاجتماعات / أونلاين..." },
                  { key: "description",  label: "تفاصيل إضافية",    placeholder: "جدول الأعمال...", multiline: true },
                ] as any[]).map(f => (
                  <View key={f.key}>
                    <Text style={m.label}>{f.label}</Text>
                    <TextInput
                      style={[m.input, f.multiline && { height: 80, textAlignVertical: "top" }]}
                      value={(form as any)[f.key]} onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                      placeholder={f.placeholder} placeholderTextColor={Colors.textMuted}
                      textAlign="right" keyboardType={f.keyboardType || "default"} multiline={f.multiline}
                    />
                  </View>
                ))}
              </ScrollView>
              <View style={m.btnRow}>
                <TouchableOpacity style={m.cancelBtn} onPress={() => setShowModal(false)}><Text style={m.cancelText}>إلغاء</Text></TouchableOpacity>
                <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={m.saveText}>{editItem ? "تعديل" : "إرسال النداء"}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ── تبويب التواصل الداخلي ─────────────────────────────────────────
function MessagesTab({ token, manager }: { token: string; manager: Manager }) {
  const [msgs, setMsgs]           = useState<Msg[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [content, setContent]     = useState("");
  const [senderName, setSenderName] = useState(manager.full_name);
  const [sending, setSending]     = useState(false);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/messages`, { headers });
      if (r.ok) setMsgs(await r.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/messages`, {
        method: "POST", headers,
        body: JSON.stringify({ sender_name: senderName.trim() || manager.full_name, content: content.trim() }),
      });
      if (r.ok) { setContent(""); if (Platform.OS !== "web") Haptics.selectionAsync(); load(); }
    } catch {} finally { setSending(false); }
  };

  const togglePin = async (id: number) => {
    try {
      await fetch(`${getApiUrl()}/api/union-manager/messages/${id}/pin`, { method: "PATCH", headers });
      setMsgs(p => p.map(msg => msg.id === id ? { ...msg, is_pinned: !msg.is_pinned } : msg));
    } catch {}
  };

  const deleteMsg = (id: number) => {
    Alert.alert("تأكيد", "هل تريد حذف هذه الرسالة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        await fetch(`${getApiUrl()}/api/union-manager/messages/${id}`, { method: "DELETE", headers });
        setMsgs(p => p.filter(msg => msg.id !== id));
      }},
    ]);
  };

  const pinned  = msgs.filter(msg => msg.is_pinned);
  const regular = msgs.filter(msg => !msg.is_pinned);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 180 }}>
        {loading && <ActivityIndicator color={UC} />}
        {pinned.length > 0 && (
          <>
            <Text style={msg_.sectionLabel}>📌 المثبتة</Text>
            {pinned.map((msg, i) => <MsgCard key={msg.id} msg={msg} i={i} onPin={togglePin} onDelete={deleteMsg} />)}
          </>
        )}
        {regular.length > 0 && (
          <>
            {pinned.length > 0 && <Text style={msg_.sectionLabel}>الرسائل</Text>}
            {regular.map((msg, i) => <MsgCard key={msg.id} msg={msg} i={i} onPin={togglePin} onDelete={deleteMsg} />)}
          </>
        )}
        {!loading && msgs.length === 0 && (
          <View style={t.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
            <Text style={t.emptyText}>لا توجد رسائل بعد</Text>
          </View>
        )}
      </ScrollView>

      <View style={msg_.inputArea}>
        <TextInput
          style={msg_.senderInput}
          value={senderName} onChangeText={setSenderName}
          placeholder="المرسل" placeholderTextColor={Colors.textMuted} textAlign="right"
        />
        <View style={msg_.contentRow}>
          <TextInput
            style={msg_.contentInput}
            value={content} onChangeText={setContent}
            placeholder="اكتب رسالة داخلية..." placeholderTextColor={Colors.textMuted}
            textAlign="right" multiline
          />
          <TouchableOpacity style={[msg_.sendBtn, !content.trim() && { opacity: 0.5 }]} onPress={send} disabled={!content.trim() || sending}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function MsgCard({ msg, i, onPin, onDelete }: { msg: Msg; i: number; onPin: (id: number) => void; onDelete: (id: number) => void }) {
  return (
    <Animated.View entering={FadeInDown.delay(i * 50).springify()} style={[t.card, msg.is_pinned && { borderColor: "#F59E0B50", borderWidth: 1 }]}>
      <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 }}>
        <View style={[t.avatar, { backgroundColor: UC + "30" }]}>
          <Text style={[t.avatarText, { color: UC }]}>{msg.sender_name[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
            <Text style={t.cardName}>{msg.sender_name}</Text>
            {msg.is_pinned && <Ionicons name="pin" size={14} color={GOLD} />}
          </View>
          <Text style={msg_.content}>{msg.content}</Text>
          <Text style={t.cardInfo}>{formatDate(msg.created_at)}</Text>
        </View>
        <View style={t.cardActions}>
          <TouchableOpacity onPress={() => onPin(msg.id)} style={t.actionBtn}>
            <Ionicons name={msg.is_pinned ? "pin" : "pin-outline"} size={14} color={msg.is_pinned ? GOLD : Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(msg.id)} style={[t.actionBtn, { borderColor: "#EF444420" }]}>
            <Ionicons name="trash-outline" size={14} color={RED} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ── تبويب الحساب (مع تغيير كلمة المرور) ──────────────────────────
function AccountTab({ token, manager, onLogout }: { token: string; manager: Manager; onLogout: () => void }) {
  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPass, setCurrentPass]       = useState("");
  const [newPass, setNewPass]               = useState("");
  const [confirmPass, setConfirmPass]       = useState("");
  const [showCurrent, setShowCurrent]       = useState(false);
  const [showNew, setShowNew]               = useState(false);
  const [saving, setSaving]                 = useState(false);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const changePassword = async () => {
    if (!currentPass.trim() || !newPass.trim()) { Alert.alert("تنبيه", "يرجى ملء جميع الحقول"); return; }
    if (newPass.length < 8) { Alert.alert("تنبيه", "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل"); return; }
    if (newPass !== confirmPass) { Alert.alert("تنبيه", "كلمة المرور الجديدة وتأكيدها غير متطابقتين"); return; }
    setSaving(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/change-password`, {
        method: "POST", headers,
        body: JSON.stringify({ current_password: currentPass.trim(), new_password: newPass.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ تم", "تم تغيير كلمة المرور بنجاح");
        setShowChangePass(false); setCurrentPass(""); setNewPass(""); setConfirmPass("");
      } else {
        Alert.alert("خطأ", d.error || "فشل تغيير كلمة المرور");
      }
    } catch { Alert.alert("خطأ", "تعذر الاتصال بالخادم"); } finally { setSaving(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      {/* معلومات الحساب */}
      <Animated.View entering={FadeInDown.delay(60).springify()} style={t.card}>
        <View style={ac.sectionHeader}>
          <Ionicons name="person-circle-outline" size={22} color={UC} />
          <Text style={ac.sectionTitle}>معلومات الحساب</Text>
        </View>
        {[
          { label: "الاسم الكامل", val: manager.full_name, icon: "person-outline" },
          { label: "المنصب",       val: manager.title,     icon: "ribbon-outline" },
          { label: "اسم المستخدم", val: manager.username,  icon: "at-outline" },
        ].map(r => (
          <View key={r.label} style={ac.infoRow}>
            <Ionicons name={r.icon as any} size={16} color={Colors.textMuted} style={{ marginLeft: 6 }} />
            <Text style={ac.infoLabel}>{r.label}</Text>
            <Text style={ac.infoVal}>{r.val}</Text>
          </View>
        ))}
      </Animated.View>

      {/* تغيير كلمة المرور */}
      <Animated.View entering={FadeInDown.delay(120).springify()} style={t.card}>
        <TouchableOpacity style={ac.sectionHeader} onPress={() => setShowChangePass(p => !p)}>
          <Ionicons name="key-outline" size={22} color={GOLD} />
          <Text style={[ac.sectionTitle, { flex: 1 }]}>تغيير كلمة المرور</Text>
          <Ionicons name={showChangePass ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
        </TouchableOpacity>

        {showChangePass && (
          <View style={{ gap: 12, marginTop: 12 }}>
            {/* كلمة المرور الحالية */}
            <View>
              <Text style={m.label}>كلمة المرور الحالية</Text>
              <View style={ls.passRow}>
                <TextInput
                  style={[ls.input, { flex: 1 }]}
                  value={currentPass} onChangeText={setCurrentPass}
                  placeholder="أدخل كلمة المرور الحالية"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right" secureTextEntry={!showCurrent}
                />
                <TouchableOpacity onPress={() => setShowCurrent(p => !p)} style={ls.eyeBtn}>
                  <Ionicons name={showCurrent ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* كلمة المرور الجديدة */}
            <View>
              <Text style={m.label}>كلمة المرور الجديدة</Text>
              <View style={ls.passRow}>
                <TextInput
                  style={[ls.input, { flex: 1 }]}
                  value={newPass} onChangeText={setNewPass}
                  placeholder="8 أحرف على الأقل"
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right" secureTextEntry={!showNew}
                />
                <TouchableOpacity onPress={() => setShowNew(p => !p)} style={ls.eyeBtn}>
                  <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* تأكيد كلمة المرور */}
            <View>
              <Text style={m.label}>تأكيد كلمة المرور الجديدة</Text>
              <TextInput
                style={ls.input}
                value={confirmPass} onChangeText={setConfirmPass}
                placeholder="أعد إدخال كلمة المرور الجديدة"
                placeholderTextColor={Colors.textMuted}
                textAlign="right" secureTextEntry
              />
              {confirmPass.length > 0 && newPass !== confirmPass && (
                <Text style={ac.mismatch}>كلمتا المرور غير متطابقتين</Text>
              )}
            </View>

            <TouchableOpacity
              style={[ac.savePassBtn, saving && { opacity: 0.7 }]}
              onPress={changePassword}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <><Ionicons name="checkmark-circle-outline" size={20} color="#fff" /><Text style={ac.savePassText}>حفظ كلمة المرور الجديدة</Text></>
              }
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {/* تسجيل الخروج */}
      <Animated.View entering={FadeInDown.delay(180).springify()}>
        <TouchableOpacity style={ac.logoutBtn} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={RED} />
          <Text style={ac.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

// ── الشاشة الرئيسية ────────────────────────────────────────────────
export default function UnionManagerPortalScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken]     = useState<string | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"requests" | "staff" | "meetings" | "messages" | "account">("requests");
  const [stats, setStats]     = useState({ staff: 0, upcoming_meetings: 0, messages: 0 });
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    AsyncStorage.multiGet([MGTOKEN_KEY, MGINFO_KEY]).then(([[, tok], [, info]]) => {
      if (tok && info) { setToken(tok); setManager(JSON.parse(info)); }
      setChecking(false);
    });
  }, []);

  const loadStats = useCallback(async (tok: string) => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/dashboard`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) { const d = await r.json(); setStats(d.stats); }
      else { setToken(null); setManager(null); await AsyncStorage.multiRemove([MGTOKEN_KEY, MGINFO_KEY]); }
    } catch {}
  }, []);

  useEffect(() => {
    if (token) {
      loadStats(token);
      registerPushToken(token);
    }
  }, [token]);

  const handleLogin = (tok: string, mgr: Manager) => { setToken(tok); setManager(mgr); };

  const logout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "خروج", style: "destructive", onPress: async () => {
        await AsyncStorage.multiRemove([MGTOKEN_KEY, MGINFO_KEY]);
        setToken(null); setManager(null);
      }},
    ]);
  };

  if (checking) return <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={UC} /></View>;
  if (!token || !manager) return <LoginScreen onLogin={handleLogin} />;

  const TABS = [
    { key: "requests",  icon: "document-text-outline", label: "الطلبات", badge: pendingCount },
    { key: "staff",     icon: "people-outline",         label: "الموظفون" },
    { key: "meetings",  icon: "calendar-outline",       label: "الاجتماعات" },
    { key: "messages",  icon: "chatbubbles-outline",    label: "التواصل" },
    { key: "account",   icon: "settings-outline",       label: "الحساب" },
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* الهيدر */}
      <LinearGradient colors={["#0B0F1A", "#1E1B4B"]} style={[ps.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={ls.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={UC2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={ps.headerTitle}>بوابة إدارة الاتحاد</Text>
          <Text style={ps.headerSub}>{manager.full_name} — {manager.title}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={ls.backBtn} hitSlop={12}>
          <Ionicons name="log-out-outline" size={20} color={RED} />
        </TouchableOpacity>
      </LinearGradient>

      {/* إحصائيات */}
      <View style={ps.statsRow}>
        {[
          { val: pendingCount,              label: "طلب معلق",      color: GOLD },
          { val: stats.staff,               label: "موظف",          color: UC },
          { val: stats.upcoming_meetings,   label: "اجتماع قادم",   color: GREEN },
        ].map((s, i) => (
          <View key={i} style={ps.statItem}>
            <Text style={[ps.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={ps.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* المحتوى */}
      <View style={{ flex: 1 }}>
        {tab === "requests"  && <RequestsTab token={token} onBadge={setPendingCount} />}
        {tab === "staff"     && <StaffTab token={token} />}
        {tab === "meetings"  && <MeetingsTab token={token} />}
        {tab === "messages"  && <MessagesTab token={token} manager={manager} />}
        {tab === "account"   && <AccountTab token={token} manager={manager} onLogout={logout} />}
      </View>

      {/* شريط التبويبات */}
      <View style={[ps.tabBar, { paddingBottom: insets.bottom + 4 }]}>
        {TABS.map(tb => {
          const active = tab === tb.key;
          const hasBadge = "badge" in tb && (tb as any).badge > 0;
          return (
            <TouchableOpacity key={tb.key} onPress={() => setTab(tb.key)} style={ps.tabItem}>
              <View style={{ position: "relative" }}>
                <Ionicons name={tb.icon as any} size={22} color={active ? UC : Colors.textMuted} />
                {hasBadge && (
                  <View style={ps.badge}>
                    <Text style={ps.badgeText}>{(tb as any).badge > 9 ? "9+" : (tb as any).badge}</Text>
                  </View>
                )}
              </View>
              <Text style={[ps.tabLabel, { color: active ? UC : Colors.textMuted }]}>{tb.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── الأنماط ────────────────────────────────────────────────────────
const ls = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 32, alignItems: "center", gap: 8 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: UC + "30", alignItems: "center", justifyContent: "center", marginTop: 16 },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff", textAlign: "center" },
  heroSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.6)", textAlign: "center" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 24, gap: 16, margin: 20, borderWidth: 1, borderColor: Colors.borderSubtle },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text, textAlign: "center" },
  cardSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right", marginBottom: 6 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right" },
  passRow: { flexDirection: "row-reverse", gap: 8, alignItems: "center" },
  eyeBtn: { padding: 10 },
  loginBtn: { backgroundColor: UC, borderRadius: 14, padding: 15, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 },
  loginBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  infoBox: { flexDirection: "row-reverse", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 14, marginHorizontal: 20, alignItems: "flex-start" },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, flex: 1, textAlign: "right", lineHeight: 22 },
  applyBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: UC + "10", borderRadius: 14, padding: 16, marginHorizontal: 20, marginTop: 12, borderWidth: 1, borderColor: UC + "30" },
  applyBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: UC, flex: 1, textAlign: "right" },
});

const ps = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: UC2, textAlign: "center" },
  statsRow: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statVal: { fontFamily: "Cairo_700Bold", fontSize: 20 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  tabBar: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 4 },
  tabLabel: { fontFamily: "Cairo_400Regular", fontSize: 10 },
  badge: { position: "absolute", top: -4, left: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: RED, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { fontSize: 9, fontFamily: "Cairo_700Bold", color: "#fff" },
});

const t = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: 12, paddingVertical: 60 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textMuted },
  card: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.borderSubtle },
  cardHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  cardName: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.text, textAlign: "right" },
  cardRole: { fontFamily: "Cairo_400Regular", fontSize: 13, color: UC2, textAlign: "right" },
  cardSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  cardInfo: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  cardFooter: { marginTop: 8, flexDirection: "row-reverse", gap: 16 },
  cardActions: { gap: 6 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: UC + "10", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: UC + "20" },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: UC + "20", alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: UC },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  typeBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  mtgTypeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", bottom: 16, left: 16 },
  fabInner: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30 },
  fabText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", alignItems: "center" },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, width: "100%", maxHeight: "90%", gap: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderSubtle, alignSelf: "center", marginBottom: 4 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.text, textAlign: "center" },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right", marginTop: 4 },
  input: { backgroundColor: Colors.cardBg, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 14, paddingVertical: 11, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle },
  chipActive: { backgroundColor: UC + "20", borderColor: UC },
  chipText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  chipTextActive: { color: UC },
  btnRow: { flexDirection: "row-reverse", gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center" },
  cancelText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textMuted },
  saveBtn: { flex: 2, padding: 13, borderRadius: 12, backgroundColor: UC, alignItems: "center" },
  saveText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});

const msg_ = StyleSheet.create({
  sectionLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  content: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", lineHeight: 22, marginTop: 4 },
  inputArea: { backgroundColor: Colors.cardBg, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, padding: 12, gap: 8 },
  senderInput: { backgroundColor: Colors.bg, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.text, textAlign: "right" },
  contentRow: { flexDirection: "row-reverse", gap: 8, alignItems: "flex-end" },
  contentInput: { flex: 1, backgroundColor: Colors.bg, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text, textAlign: "right", maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: UC, alignItems: "center", justifyContent: "center" },
});

const rq = StyleSheet.create({
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: "row-reverse" },
  filterChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderSubtle },
  filterChipActive: { backgroundColor: UC + "20", borderColor: UC },
  filterChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  filterChipTextActive: { color: UC },
  reqCard: { gap: 10 },
  reqHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  date: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  notePreview: { backgroundColor: GOLD + "10", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: GOLD + "30" },
  notePreviewText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: GOLD },
  modalHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  detailCard: { backgroundColor: Colors.cardBg, borderRadius: 12, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.borderSubtle },
  detailSection: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, marginBottom: 4 },
  detailRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  detailLabel: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  detailVal: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text, flex: 1, textAlign: "right", marginRight: 8 },
  motivText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.text, lineHeight: 22, textAlign: "right" },
  actionRow: { flexDirection: "row-reverse", gap: 12 },
  rejectBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: RED + "40", backgroundColor: RED + "10" },
  approveBtn: { flex: 2, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, borderRadius: 12, backgroundColor: GREEN },
  actionBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15 },
});

const ac = StyleSheet.create({
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 8 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle, gap: 6 },
  infoLabel: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, flex: 1, textAlign: "right" },
  infoVal: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text },
  savePassBtn: { backgroundColor: GREEN, borderRadius: 12, padding: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  savePassText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  mismatch: { fontFamily: "Cairo_400Regular", fontSize: 12, color: RED, textAlign: "right", marginTop: 4 },
  logoutBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: RED + "15", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: RED + "30" },
  logoutText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: RED, flex: 1, textAlign: "right" },
});
