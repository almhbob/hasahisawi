import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
  RefreshControl, FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const UC  = "#6366F1";
const UC2 = "#A5B4FC";
const GREEN = "#22C55E";
const MGTOKEN_KEY = "union_manager_token";
const MGINFO_KEY  = "union_manager_info";

type Manager      = { id: number; full_name: string; title: string; username: string };
type Permissions  = { can_manage_requests: boolean; can_manage_staff: boolean; can_manage_meetings: boolean; can_post_announcements: boolean; can_view_reports: boolean };
type Staff        = { id: number; full_name: string; role: string; committee?: string; phone?: string; email?: string; notes?: string; is_active: boolean; permissions?: Permissions; created_at: string };
type Meeting      = { id: number; title: string; description?: string; meeting_date?: string; meeting_time?: string; location?: string; type: string; status: string; created_at: string };
type Msg          = { id: number; sender_name: string; content: string; is_pinned: boolean; created_at: string };
type StudentReq   = { id: number; full_name: string; phone: string; email?: string; institution: string; major: string; year: string; motivation?: string; status: string; created_at: string; kind: "student" };
type EmployeeReq  = { id: number; full_name: string; phone: string; email?: string; role_applied: string; committee?: string; skills?: string; motivation?: string; status: string; created_at: string; kind: "employee" };
type AnyReq       = StudentReq | EmployeeReq;

const DEFAULT_PERMISSIONS: Permissions = { can_manage_requests: false, can_manage_staff: false, can_manage_meetings: false, can_post_announcements: false, can_view_reports: false };
const PERMISSION_PRESETS: Record<string, Permissions> = {
  "أمين عام":       { can_manage_requests: true,  can_manage_staff: true,  can_manage_meetings: true,  can_post_announcements: true,  can_view_reports: true  },
  "نائب أمين عام":  { can_manage_requests: true,  can_manage_staff: false, can_manage_meetings: true,  can_post_announcements: true,  can_view_reports: true  },
  "أمين الإعلام":   { can_manage_requests: false, can_manage_staff: false, can_manage_meetings: false, can_post_announcements: true,  can_view_reports: false },
  "أمين التدريب":   { can_manage_requests: false, can_manage_staff: false, can_manage_meetings: true,  can_post_announcements: false, can_view_reports: false },
  "أمين المال":     { can_manage_requests: false, can_manage_staff: false, can_manage_meetings: false, can_post_announcements: false, can_view_reports: true  },
  "عضو لجنة":      { can_manage_requests: false, can_manage_staff: false, can_manage_meetings: false, can_post_announcements: false, can_view_reports: false },
};
const PERMISSION_LABELS: Record<keyof Permissions, string> = {
  can_manage_requests:    "مراجعة طلبات الانضمام",
  can_manage_staff:       "إدارة الموظفين",
  can_manage_meetings:    "إدارة الاجتماعات",
  can_post_announcements: "نشر الإعلانات",
  can_view_reports:       "عرض التقارير",
};

const COMMITTEES = [
  "الأمانة العامة", "أمانة الإعلام والثقافة", "أمانة التدريب والتطوير",
  "أمانة الشؤون الأكاديمية", "أمانة الأنشطة والفعاليات", "أمانة المرأة والأسرة",
  "أمانة الخدمات والرفاه", "أمانة العلاقات الخارجية", "أمانة الصحة والبيئة",
  "أمانة المال والإدارة",
];

const MTG_TYPES = ["meeting", "urgent", "workshop", "training"];
const MTG_TYPE_LABEL: Record<string, string> = { meeting: "اجتماع", urgent: "عاجل", workshop: "ورشة عمل", training: "تدريب" };
const MTG_TYPE_COLOR: Record<string, string> = { meeting: UC, urgent: "#EF4444", workshop: "#F59E0B", training: GREEN };

function formatDate(s?: string) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return s; }
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

// ── تبويب الموظفين ────────────────────────────────────────────────
function StaffTab({ token }: { token: string }) {
  const [staff, setStaff]           = useState<Staff[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [editItem, setEditItem]     = useState<Staff | null>(null);
  const [saving, setSaving]         = useState(false);
  const [permStaff, setPermStaff]   = useState<Staff | null>(null);

  const [form, setForm] = useState({ full_name: "", role: "", committee: "", phone: "", email: "", notes: "" });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/staff`, { headers });
      if (r.ok) setStaff(await r.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditItem(null); setForm({ full_name: "", role: "", committee: "", phone: "", email: "", notes: "" }); setShowModal(true); };
  const openEdit = (s: Staff) => { setEditItem(s); setForm({ full_name: s.full_name, role: s.role, committee: s.committee || "", phone: s.phone || "", email: s.email || "", notes: s.notes || "" }); setShowModal(true); };

  const save = async () => {
    if (!form.full_name.trim() || !form.role.trim()) { Alert.alert("تنبيه", "الاسم والمنصب مطلوبان"); return; }
    setSaving(true);
    try {
      const url = editItem ? `${getApiUrl()}/api/union-manager/staff/${editItem.id}` : `${getApiUrl()}/api/union-manager/staff`;
      const method = editItem ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers, body: JSON.stringify(form) });
      if (r.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowModal(false); load();
      } else { const d = await r.json(); Alert.alert("خطأ", d.error || "فشل الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذر الاتصال"); } finally { setSaving(false); }
  };

  const remove = (id: number, name: string) => {
    Alert.alert("تأكيد الحذف", `هل تريد حذف ${name}؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: "حذف", style: "destructive", onPress: async () => {
        try {
          await fetch(`${getApiUrl()}/api/union-manager/staff/${id}`, { method: "DELETE", headers });
          setStaff(p => p.filter(s => s.id !== id));
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch { Alert.alert("خطأ", "فشل الحذف"); }
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
              <View style={t.avatar}>
                <Text style={t.avatarText}>{s.full_name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={t.cardName}>{s.full_name}</Text>
                <Text style={t.cardRole}>{s.role}</Text>
                {s.committee && <Text style={t.cardSub}>{s.committee}</Text>}
              </View>
              <View style={t.cardActions}>
                <TouchableOpacity onPress={() => setPermStaff(s)} style={[t.actionBtn, { borderColor: "#A78BFA20", backgroundColor: "#A78BFA10" }]}>
                  <Ionicons name="shield-outline" size={16} color="#A78BFA" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEdit(s)} style={t.actionBtn}>
                  <Ionicons name="pencil-outline" size={16} color={UC} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(s.id, s.full_name)} style={[t.actionBtn, { borderColor: "#EF444420" }]}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
            {(s.phone || s.email) && (
              <View style={t.cardFooter}>
                {s.phone && <Text style={t.cardInfo}><Ionicons name="call-outline" size={12} color={Colors.textMuted} /> {s.phone}</Text>}
                {s.email && <Text style={t.cardInfo}><Ionicons name="mail-outline" size={12} color={Colors.textMuted} /> {s.email}</Text>}
              </View>
            )}
            {/* مؤشر الصلاحيات */}
            {s.permissions && Object.values(s.permissions).some(Boolean) && (
              <View style={sf.permRow}>
                <Ionicons name="shield-checkmark" size={12} color="#A78BFA" />
                <Text style={sf.permText}>
                  {Object.entries(s.permissions).filter(([,v]) => v).map(([k]) => PERMISSION_LABELS[k as keyof Permissions]).join(" · ")}
                </Text>
              </View>
            )}
          </Animated.View>
        ))}
      </ScrollView>

      {/* زر إضافة */}
      <TouchableOpacity style={t.fab} onPress={openAdd}>
        <LinearGradient colors={[UC, "#4338CA"]} style={t.fabInner}>
          <Ionicons name="person-add-outline" size={22} color="#fff" />
          <Text style={t.fabText}>إضافة موظف</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* مودال الصلاحيات */}
      {permStaff && (
        <PermissionsModal
          staff={permStaff} token={token} visible={!!permStaff}
          onClose={() => setPermStaff(null)}
          onSaved={(updated) => { setStaff(p => p.map(s => s.id === updated.id ? updated : s)); setPermStaff(null); }}
        />
      )}

      {/* Modal الإضافة/التعديل */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={m.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
            <View style={m.sheet}>
              <View style={m.handle} />
              <Text style={m.title}>{editItem ? "تعديل الموظف" : "إضافة موظف جديد"}</Text>

              <ScrollView contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                {([
                  { key: "full_name", label: "الاسم الكامل *", placeholder: "اسم الموظف" },
                  { key: "role", label: "المنصب / الوظيفة *", placeholder: "مثال: أمين الإعلام" },
                  { key: "phone", label: "رقم الهاتف", placeholder: "09XXXXXXXX", keyboardType: "phone-pad" },
                  { key: "email", label: "البريد الإلكتروني", placeholder: "example@email.com", keyboardType: "email-address" },
                  { key: "notes", label: "ملاحظات", placeholder: "أي ملاحظات إضافية...", multiline: true },
                ] as any[]).map(f => (
                  <View key={f.key}>
                    <Text style={m.label}>{f.label}</Text>
                    <TextInput
                      style={[m.input, f.multiline && { height: 80, textAlignVertical: "top" }]}
                      value={(form as any)[f.key]}
                      onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                      placeholder={f.placeholder}
                      placeholderTextColor={Colors.textMuted}
                      textAlign="right" keyboardType={f.keyboardType || "default"}
                      multiline={f.multiline}
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
                <TouchableOpacity style={m.cancelBtn} onPress={() => setShowModal(false)}>
                  <Text style={m.cancelText}>إلغاء</Text>
                </TouchableOpacity>
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
  const [meetings, setMeetings]   = useState<Meeting[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem]   = useState<Meeting | null>(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm] = useState({ title: "", description: "", meeting_date: "", meeting_time: "", location: "", type: "meeting" });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/meetings`, { headers });
      if (r.ok) setMeetings(await r.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditItem(null); setForm({ title: "", description: "", meeting_date: "", meeting_time: "", location: "", type: "meeting" }); setShowModal(true); };
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
                {mtg.location && <Text style={t.cardInfo}><Ionicons name="location-outline" size={12} /> {mtg.location}</Text>}
              </View>
              <View style={t.cardActions}>
                <TouchableOpacity onPress={() => openEdit(mtg)} style={t.actionBtn}><Ionicons name="pencil-outline" size={16} color={UC} /></TouchableOpacity>
                <TouchableOpacity onPress={() => remove(mtg.id)} style={[t.actionBtn, { borderColor: "#EF444420" }]}><Ionicons name="trash-outline" size={16} color="#EF4444" /></TouchableOpacity>
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
                  { key: "title", label: "عنوان الاجتماع *", placeholder: "موضوع الاجتماع" },
                  { key: "meeting_date", label: "التاريخ", placeholder: "YYYY-MM-DD", keyboardType: "numeric" },
                  { key: "meeting_time", label: "الوقت", placeholder: "HH:MM" },
                  { key: "location", label: "المكان", placeholder: "قاعة الاجتماعات / أونلاين..." },
                  { key: "description", label: "تفاصيل إضافية", placeholder: "جدول الأعمال والتفاصيل...", multiline: true },
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
      if (r.ok) {
        setContent("");
        if (Platform.OS !== "web") Haptics.selectionAsync();
        load();
      }
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

  const pinned = msgs.filter(m => m.is_pinned);
  const regular = msgs.filter(m => !m.is_pinned);

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

      {/* حقل الإرسال */}
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
            {msg.is_pinned && <Ionicons name="pin" size={14} color="#F59E0B" />}
          </View>
          <Text style={msg_.content}>{msg.content}</Text>
          <Text style={t.cardInfo}>{formatDate(msg.created_at)}</Text>
        </View>
        <View style={t.cardActions}>
          <TouchableOpacity onPress={() => onPin(msg.id)} style={t.actionBtn}>
            <Ionicons name={msg.is_pinned ? "pin" : "pin-outline"} size={14} color={msg.is_pinned ? "#F59E0B" : Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(msg.id)} style={[t.actionBtn, { borderColor: "#EF444420" }]}>
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ── تبويب الطلبات ─────────────────────────────────────────────────
function RequestsTab({ token, onBadgeChange }: { token: string; onBadgeChange: (n: number) => void }) {
  const [subTab, setSubTab]         = useState<"students" | "employees">("students");
  const [filter, setFilter]         = useState<"pending" | "approved" | "rejected">("pending");
  const [students, setStudents]     = useState<StudentReq[]>([]);
  const [employees, setEmployees]   = useState<EmployeeReq[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId]     = useState<number | null>(null);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/requests?status=${filter}`, { headers });
      if (r.ok) {
        const d = await r.json();
        setStudents((d.students || []).map((s: any) => ({ ...s, kind: "student" })));
        setEmployees((d.employees || []).map((e: any) => ({ ...e, kind: "employee" })));
        if (filter === "pending") onBadgeChange((d.students?.length || 0) + (d.employees?.length || 0));
      }
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token, filter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const review = async (type: "student" | "employee", id: number, status: "approved" | "rejected") => {
    const label = status === "approved" ? "قبول" : "رفض";
    const name  = type === "student"
      ? students.find(s => s.id === id)?.full_name
      : employees.find(e => e.id === id)?.full_name;
    Alert.alert(`تأكيد ${label}`, `هل تريد ${label} طلب ${name}؟`, [
      { text: "إلغاء", style: "cancel" },
      { text: label, style: status === "approved" ? "default" : "destructive", onPress: async () => {
        setActingId(id);
        try {
          const url = type === "student"
            ? `${getApiUrl()}/api/union-manager/requests/student/${id}/status`
            : `${getApiUrl()}/api/union-manager/requests/employee/${id}/status`;
          const r = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ status }) });
          if (r.ok) {
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (type === "student") setStudents(p => p.filter(s => s.id !== id));
            else setEmployees(p => p.filter(e => e.id !== id));
            onBadgeChange(students.length + employees.length - 1);
          } else { const d = await r.json(); Alert.alert("خطأ", d.error || "فشلت العملية"); }
        } catch { Alert.alert("خطأ", "تعذر الاتصال"); } finally { setActingId(null); }
      }},
    ]);
  };

  const currentList: AnyReq[] = (subTab === "students" ? students : employees) as AnyReq[];

  const renderRequest = ({ item, index }: { item: AnyReq; index: number }) => {
    const isEmployee = item.kind === "employee";
    const emp = item as EmployeeReq;
    const stu = item as StudentReq;
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).springify()} style={rq.card}>
        <View style={rq.cardTop}>
          <View style={rq.avatar}>
            <Text style={rq.avatarText}>{item.full_name[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={rq.name}>{item.full_name}</Text>
            <Text style={rq.detail}>
              {isEmployee
                ? `${emp.role_applied}${emp.committee ? ` — ${emp.committee}` : ""}`
                : `${stu.institution} — ${stu.major} — السنة ${stu.year}`
              }
            </Text>
            <Text style={rq.meta}>📞 {item.phone}</Text>
          </View>
        </View>
        {item.motivation ? <Text style={rq.motivation} numberOfLines={3}>{item.motivation}</Text> : null}
        {isEmployee && emp.skills ? <Text style={rq.skills} numberOfLines={2}>🛠 {emp.skills}</Text> : null}
        <Text style={rq.date}>{formatDate(item.created_at)}</Text>
        {filter === "pending" && (
          <View style={rq.btnRow}>
            <TouchableOpacity
              style={[rq.rejectBtn, actingId === item.id && { opacity: 0.6 }]}
              onPress={() => review(isEmployee ? "employee" : "student", item.id, "rejected")}
              disabled={actingId === item.id}
            >
              <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
              <Text style={rq.rejectText}>رفض</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[rq.approveBtn, actingId === item.id && { opacity: 0.6 }]}
              onPress={() => review(isEmployee ? "employee" : "student", item.id, "approved")}
              disabled={actingId === item.id}
            >
              {actingId === item.id ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={rq.approveText}>قبول</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* فلتر الحالة */}
      <View style={rq.filterRow}>
        {(["pending","approved","rejected"] as const).map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[rq.filterBtn, filter === f && rq.filterBtnActive]}>
            <Text style={[rq.filterText, filter === f && rq.filterTextActive]}>
              {f === "pending" ? "معلَّق" : f === "approved" ? "مقبول" : "مرفوض"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* تبويب فرعي */}
      <View style={rq.subTabRow}>
        <TouchableOpacity onPress={() => setSubTab("employees")} style={[rq.subTab, subTab === "employees" && rq.subTabActive]}>
          <Ionicons name="briefcase-outline" size={15} color={subTab === "employees" ? UC : Colors.textMuted} />
          <Text style={[rq.subTabText, subTab === "employees" && rq.subTabTextActive]}>
            موظفون ({employees.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSubTab("students")} style={[rq.subTab, subTab === "students" && rq.subTabActive]}>
          <Ionicons name="school-outline" size={15} color={subTab === "students" ? UC : Colors.textMuted} />
          <Text style={[rq.subTabText, subTab === "students" && rq.subTabTextActive]}>
            طلاب ({students.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={t.center}><ActivityIndicator color={UC} /></View>
      ) : (
        <FlatList<AnyReq>
          data={currentList}
          keyExtractor={item => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={t.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color={Colors.textMuted} />
              <Text style={t.emptyText}>لا توجد طلبات {filter === "pending" ? "معلقة" : filter === "approved" ? "مقبولة" : "مرفوضة"}</Text>
            </View>
          }
          renderItem={renderRequest}
        />
      )}
    </View>
  );
}

// ── مودال الصلاحيات ───────────────────────────────────────────────
function PermissionsModal({ staff, token, visible, onClose, onSaved }: {
  staff: Staff; token: string; visible: boolean; onClose: () => void; onSaved: (updated: Staff) => void;
}) {
  const [perms, setPerms] = useState<Permissions>({ ...DEFAULT_PERMISSIONS, ...(staff.permissions || {}) });
  const [saving, setSaving] = useState(false);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    if (visible) setPerms({ ...DEFAULT_PERMISSIONS, ...(staff.permissions || {}) });
  }, [visible, staff]);

  const applyPreset = (preset: string) => {
    if (PERMISSION_PRESETS[preset]) setPerms({ ...PERMISSION_PRESETS[preset] });
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/staff/${staff.id}/permissions`, {
        method: "PATCH", headers, body: JSON.stringify({ permissions: perms }),
      });
      if (r.ok) {
        const updated = await r.json();
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSaved(updated);
        onClose();
      } else { const d = await r.json(); Alert.alert("خطأ", d.error || "فشل الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذر الاتصال"); } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={m.overlay}>
        <View style={[m.sheet, { gap: 14 }]}>
          <View style={m.handle} />
          <Text style={m.title}>صلاحيات {staff.full_name}</Text>

          <Text style={[m.label, { textAlign: "right", marginBottom: 2 }]}>قوالب جاهزة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse" }}>
            {Object.keys(PERMISSION_PRESETS).map(pr => (
              <TouchableOpacity key={pr} onPress={() => applyPreset(pr)} style={m.chip}>
                <Text style={m.chipText}>{pr}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ gap: 10, marginTop: 4 }}>
            {(Object.keys(DEFAULT_PERMISSIONS) as (keyof Permissions)[]).map(k => (
              <TouchableOpacity key={k} onPress={() => setPerms(p => ({ ...p, [k]: !p[k] }))}
                style={[pm.row, perms[k] && pm.rowActive]}>
                <Ionicons name={perms[k] ? "checkmark-circle" : "ellipse-outline"} size={22} color={perms[k] ? UC : Colors.textMuted} />
                <Text style={[pm.label, perms[k] && pm.labelActive]}>{PERMISSION_LABELS[k]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={m.btnRow}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={m.saveText}>حفظ الصلاحيات</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── الشاشة الرئيسية للبوابة ────────────────────────────────────────
export default function UnionManagerPortalScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken]     = useState<string | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab]     = useState<"staff" | "meetings" | "messages" | "requests" | "account">("staff");
  const [stats, setStats] = useState({ staff: 0, upcoming_meetings: 0, messages: 0, pending_requests: 0 });
  const [reqBadge, setReqBadge] = useState(0);

  useEffect(() => {
    AsyncStorage.multiGet([MGTOKEN_KEY, MGINFO_KEY]).then(([[, tok], [, info]]) => {
      if (tok && info) { setToken(tok); setManager(JSON.parse(info)); }
      setChecking(false);
    });
  }, []);

  const loadStats = useCallback(async (tok: string) => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/dashboard`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) {
        const d = await r.json();
        setStats(d.stats);
        setReqBadge(d.stats.pending_requests || 0);
      } else { setToken(null); setManager(null); await AsyncStorage.multiRemove([MGTOKEN_KEY, MGINFO_KEY]); }
    } catch {}
  }, []);

  useEffect(() => { if (token) loadStats(token); }, [token]);

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
    { key: "requests", icon: "mail-unread-outline",  label: "الطلبات",     badge: reqBadge },
    { key: "staff",    icon: "people-outline",        label: "الموظفون",    badge: 0 },
    { key: "meetings", icon: "calendar-outline",      label: "الاجتماعات",  badge: 0 },
    { key: "messages", icon: "chatbubbles-outline",   label: "التواصل",     badge: 0 },
    { key: "account",  icon: "settings-outline",      label: "الحساب",      badge: 0 },
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
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </LinearGradient>

      {/* إحصائيات سريعة */}
      <View style={ps.statsRow}>
        {[
          { val: stats.pending_requests, label: "طلب معلَّق", color: stats.pending_requests > 0 ? "#EF4444" : Colors.textMuted },
          { val: stats.staff,            label: "موظف",       color: UC },
          { val: stats.upcoming_meetings,label: "اجتماع",     color: "#F59E0B" },
          { val: stats.messages,         label: "رسالة",      color: GREEN },
        ].map((s, i) => (
          <View key={i} style={ps.statItem}>
            <Text style={[ps.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={ps.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* المحتوى */}
      <View style={{ flex: 1 }}>
        {tab === "requests" && <RequestsTab token={token} onBadgeChange={n => { setReqBadge(n); setStats(p => ({ ...p, pending_requests: n })); }} />}
        {tab === "staff"    && <StaffTab token={token} />}
        {tab === "meetings" && <MeetingsTab token={token} />}
        {tab === "messages" && <MessagesTab token={token} manager={manager} />}
        {tab === "account"  && (
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
            <Animated.View entering={FadeInDown.delay(80).springify()} style={t.card}>
              <Text style={ps.accountTitle}>معلومات الحساب</Text>
              {[
                { label: "الاسم الكامل", val: manager.full_name },
                { label: "المنصب", val: manager.title },
                { label: "اسم المستخدم", val: manager.username },
              ].map(r => (
                <View key={r.label} style={ps.accountRow}>
                  <Text style={ps.accountLabel}>{r.label}</Text>
                  <Text style={ps.accountVal}>{r.val}</Text>
                </View>
              ))}
            </Animated.View>
            <TouchableOpacity style={ps.logoutBtn} onPress={logout}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={ps.logoutText}>تسجيل الخروج</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* شريط التبويبات */}
      <View style={[ps.tabBar, { paddingBottom: insets.bottom + 4 }]}>
        {TABS.map(tb => (
          <TouchableOpacity key={tb.key} onPress={() => setTab(tb.key as any)} style={ps.tabItem}>
            <View style={{ position: "relative" }}>
              <Ionicons name={tb.icon as any} size={22} color={tab === tb.key ? UC : Colors.textMuted} />
              {tb.badge > 0 && (
                <View style={ps.badge}>
                  <Text style={ps.badgeText}>{tb.badge > 9 ? "9+" : String(tb.badge)}</Text>
                </View>
              )}
            </View>
            <Text style={[ps.tabLabel, { color: tab === tb.key ? UC : Colors.textMuted }]}>{tb.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── الأنماط ────────────────────────────────────────────────────────
const ls = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 32, alignItems: "center", gap: 8 },
  backBtn: { position: "absolute", top: 56, right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
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
  statItem: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statVal: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  tabBar: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 4 },
  tabLabel: { fontFamily: "Cairo_400Regular", fontSize: 10 },
  badge: { position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 9, color: "#fff" },
  accountTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.text, textAlign: "center", marginBottom: 8 },
  accountRow: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  accountLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted },
  accountVal: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.text },
  logoutBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: "#EF444415", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#EF444430" },
  logoutText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: "#EF4444", flex: 1, textAlign: "right" },
});

const rq = StyleSheet.create({
  filterRow: { flexDirection: "row-reverse", gap: 8, padding: 12, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  filterBtn: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle },
  filterBtnActive: { backgroundColor: UC + "20", borderColor: UC },
  filterText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  filterTextActive: { color: UC },
  subTabRow: { flexDirection: "row-reverse", gap: 0, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  subTab: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  subTabActive: { borderBottomWidth: 2, borderBottomColor: UC },
  subTabText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  subTabTextActive: { color: UC },
  card: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.borderSubtle, gap: 8 },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: UC + "20", alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Cairo_700Bold", fontSize: 18, color: UC },
  name: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  detail: { fontFamily: "Cairo_400Regular", fontSize: 12, color: UC2, textAlign: "right", marginTop: 2 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  motivation: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.text, textAlign: "right", lineHeight: 20, backgroundColor: Colors.bg, borderRadius: 8, padding: 8 },
  skills: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  date: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "left" },
  btnRow: { flexDirection: "row-reverse", gap: 10 },
  approveBtn: { flex: 2, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#22C55E", borderRadius: 10, paddingVertical: 10 },
  approveText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  rejectBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: "#EF444430", backgroundColor: "#EF444410" },
  rejectText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#EF4444" },
});

const sf = StyleSheet.create({
  permRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 4 },
  permText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#A78BFA", flex: 1, textAlign: "right" },
});

const pm = StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.bg },
  rowActive: { borderColor: UC + "50", backgroundColor: UC + "08" },
  label: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, flex: 1, textAlign: "right" },
  labelActive: { color: Colors.text, fontFamily: "Cairo_600SemiBold" },
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
