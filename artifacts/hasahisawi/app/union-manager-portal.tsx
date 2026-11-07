import React, { useState, useEffect, useCallback } from "react";
import LockoutCard, { AttemptsDots, useLockout, fmtWait } from "@/components/auth/LockoutCard";
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
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { confirmAction, notify, openExternal } from "@/lib/xplatform";
import { DateInput, TimeInput } from "@/components/ui/DateTimeField";
import { useAuth } from "@/lib/auth-context";
import { ImageUploadField, ImagesUploadField } from "@/components/union/ImageUploadField";
import { ArchiveTab, ElectionsTab } from "@/components/union/PortalArchiveElections";

const UC  = "#1F5C8A";
const UC2 = "#9DBBD6";
const GREEN = "#22C55E";
const MGTOKEN_KEY = "union_manager_token";
const MGINFO_KEY  = "union_manager_info";
// بعد تسجيل الخروج يدوياً لا نعيد دخول مدير التطبيق تلقائياً في الجلسة نفسها
let ssoAutoSkipped = false;

type Manager      = { id: number; full_name: string; title: string; username: string; staff_id?: number | null; permissions?: Partial<Permissions> | null };
type Permissions  = { can_manage_requests: boolean; can_manage_staff: boolean; can_manage_meetings: boolean; can_post_announcements: boolean; can_view_reports: boolean };
type Staff        = { id: number; full_name: string; role: string; committee?: string; phone?: string; email?: string; notes?: string; is_active: boolean; permissions?: Permissions; created_at: string };
type Meeting      = { id: number; title: string; description?: string; meeting_date?: string; meeting_time?: string; location?: string; type: string; status: string; created_at: string };
type Msg          = { id: number; sender_name: string; content: string; is_pinned: boolean; created_at: string };
type StudentReq   = { id: number; full_name: string; phone: string; email?: string; institution: string; major: string; year: string; motivation?: string; status: string; created_at: string; kind: "student" };
type EmployeeReq  = { id: number; full_name: string; phone: string; email?: string; role_applied: string; committee?: string; skills?: string; motivation?: string; status: string; created_at: string; kind: "employee" };
type AnyReq       = StudentReq | EmployeeReq;

// تسجيل push token لمدير الإتحاد بعد الدخول
async function registerUnionManagerPushToken(mgrToken: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    const perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== "granted") return;
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
    if (!pushToken?.startsWith("ExponentPushToken[")) return;
    await fetch(`${getApiUrl()}/api/union-manager/push-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${mgrToken}` },
      body: JSON.stringify({ token: pushToken, platform: Platform.OS }),
    });
  } catch {}
}

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
  const { token: appToken, user: appUser } = useAuth();
  const [ssoLoading, setSsoLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fIdent, setFIdent]     = useState("");
  const [fContact, setFContact] = useState("");
  const [fSending, setFSending] = useState(false);

  const finishLogin = async (data: { token: string; manager: Manager }) => {
    await AsyncStorage.setItem(MGTOKEN_KEY, data.token);
    await AsyncStorage.setItem(MGINFO_KEY, JSON.stringify(data.manager));
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    registerUnionManagerPushToken(data.token).catch(() => {});
    onLogin(data.token, data.manager);
  };

  // الدخول بحساب التطبيق: مدير التطبيق دائماً، ومدير الاتحاد إن طابق بريده أو هاتفه
  const ssoLogin = async (silent = false) => {
    if (!appToken) { if (!silent) notify("سجّل الدخول أولاً", "سجّل الدخول إلى التطبيق بحسابك ثم عُد إلى هنا."); return; }
    setSsoLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/union-manager/sso`, { method: "POST", headers: { Authorization: `Bearer ${appToken}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) await finishLogin(data);
      else if (!silent) notify("تعذّر الدخول", data.error || "حسابك غير مرتبط بإدارة الاتحاد");
    } catch { if (!silent) notify("خطأ", "تعذر الاتصال بالخادم"); }
    finally { setSsoLoading(false); }
  };

  // مدير التطبيق يدخل تلقائياً بلا كلمة مرور
  useEffect(() => { if (!ssoAutoSkipped && appToken && appUser?.role === "admin") ssoLogin(true); }, [appToken, appUser?.role]);

  const sendForgot = async () => {
    if (!fIdent.trim()) { notify("تنبيه", "اكتب اسم المستخدم أو رقم الهاتف"); return; }
    setFSending(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/union-manager/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: fIdent.trim(), contact: fContact.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setForgotOpen(false); setFIdent(""); setFContact(""); notify("وصل طلبك", data.message || "ستتواصل معك الإدارة بكلمة مرور جديدة."); }
      else notify("تنبيه", data.error || "تعذّر إرسال الطلب");
    } catch { notify("خطأ", "تعذر الاتصال بالخادم"); }
    finally { setFSending(false); }
  };

  const lockout = useLockout();
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const handleLogin = async () => {
    if (lockout.locked) return;
    if (!username.trim() || !password.trim()) {
      notify("تنبيه", "يرجى إدخال اسم المستخدم وكلمة المرور"); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/union-manager/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) {
        setAttemptsLeft(null);
        await finishLogin(data);
      } else if (data.locked && data.retry_after) {
        lockout.lock(Number(data.retry_after));
        setAttemptsLeft(null);
        setPassword("");
      } else {
        setAttemptsLeft(typeof data.attempts_left === "number" ? data.attempts_left : null);
        notify("خطأ في الدخول", data.error || "بيانات غير صحيحة");
      }
    } catch {
      notify("خطأ", "تعذر الاتصال بالخادم");
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={["#0B0F1A", "#16324F"]} style={[ls.hero, { paddingTop: insets.top + 20 }]}>
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
          <Text style={ls.cardSub}>لأعضاء إدارة اتحاد طلاب محلية الحصاحيصا</Text>

          {/* الدخول بحساب التطبيق — بلا كلمة مرور منفصلة */}
          <TouchableOpacity style={[ls.ssoBtn, ssoLoading && { opacity: 0.7 }]} onPress={() => ssoLogin(false)} disabled={ssoLoading}>
            {ssoLoading ? <ActivityIndicator color={UC2} /> : (
              <>
                <Ionicons name="person-circle-outline" size={22} color={UC2} />
                <View style={{ flex: 1 }}>
                  <Text style={ls.ssoBtnText}>الدخول بحسابي في التطبيق</Text>
                  <Text style={ls.ssoBtnSub} numberOfLines={1}>
                    {appUser ? `${appUser.name || ""}${appUser.email ? ` · ${appUser.email}` : appUser.phone ? ` · ${appUser.phone}` : ""}` : "سجّل الدخول إلى التطبيق أولاً"}
                  </Text>
                </View>
                <Ionicons name="chevron-back" size={16} color={UC2} />
              </>
            )}
          </TouchableOpacity>
          <View style={ls.orRow}><View style={ls.orLine} /><Text style={ls.orText}>أو باسم المستخدم</Text><View style={ls.orLine} /></View>

          <Text style={ls.label}>اسم المستخدم أو رقم الهاتف</Text>
          <TextInput
            style={ls.input}
            value={username} onChangeText={setUsername}
            placeholder="اسم المستخدم أو الهاتف المسجّل"
            placeholderTextColor={Colors.textMuted}
            textAlign="right" autoCapitalize="none" autoCorrect={false} spellCheck={false}
            textContentType="username" autoComplete="username"
          />

          <Text style={ls.label}>كلمة المرور</Text>
          <View style={ls.passRow}>
            <TextInput
              style={[ls.input, { flex: 1 }]}
              value={password} onChangeText={setPassword}
              placeholder="أدخل كلمة المرور"
              placeholderTextColor={Colors.textMuted}
              textAlign="right" secureTextEntry={!showPass}
              autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password"
            />
            <TouchableOpacity onPress={() => setShowPass(p => !p)} style={ls.eyeBtn}>
              <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {lockout.locked ? (
            <View style={{ marginTop: 12 }}><LockoutCard left={lockout.left} total={lockout.total} onForgot={() => setForgotOpen(true)} /></View>
          ) : attemptsLeft !== null && attemptsLeft < 3 ? <View style={{ marginTop: 10 }}><AttemptsDots left={attemptsLeft} /></View> : null}

          <TouchableOpacity style={[ls.loginBtn, (loading || lockout.locked) && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading || lockout.locked}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name={lockout.locked ? "time-outline" : "log-in-outline"} size={20} color="#fff" />
                <Text style={ls.loginBtnText}>{lockout.locked ? `أعد المحاولة بعد ${fmtWait(lockout.left)}` : "دخول"}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setForgotOpen(true)} style={{ alignSelf: "center", paddingVertical: 12 }}>
            <Text style={ls.forgotText}>نسيت كلمة المرور؟</Text>
          </TouchableOpacity>
        </Animated.View>

        <Modal visible={forgotOpen} transparent animationType="fade" onRequestClose={() => setForgotOpen(false)}>
          <View style={ls.fOverlay}>
            <View style={ls.fSheet}>
              <Text style={ls.cardTitle}>استعادة الدخول</Text>
              <View style={ls.fTip}>
                <Ionicons name="flash-outline" size={16} color={UC2} />
                <Text style={ls.fTipText}>الأسرع: إن كان بريدك أو هاتفك في التطبيق هو نفسه المسجّل لدى إدارة الاتحاد، اضغط «الدخول بحسابي في التطبيق». حساب التطبيق تستعيد كلمته برمز تحقق من شاشة الدخول.</Text>
              </View>
              <Text style={ls.label}>اسم المستخدم أو رقم الهاتف</Text>
              <TextInput style={ls.input} value={fIdent} onChangeText={setFIdent} placeholder="مثال: 0912345678" placeholderTextColor={Colors.textMuted} textAlign="right" autoCapitalize="none" />
              <Text style={ls.label}>رقم للتواصل معك (اختياري)</Text>
              <TextInput style={ls.input} value={fContact} onChangeText={setFContact} placeholder="واتساب أو هاتف" placeholderTextColor={Colors.textMuted} textAlign="right" keyboardType="phone-pad" />
              <Text style={[ls.infoText, { marginTop: 8 }]}>يصل طلبك إلى مدير التطبيق، فيعيّن لك كلمة مرور مؤقتة ويرسلها لك. غيّرها بعد الدخول.</Text>
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 14 }}>
                <TouchableOpacity style={[ls.loginBtn, { flex: 1, marginTop: 0 }, fSending && { opacity: 0.7 }]} onPress={sendForgot} disabled={fSending}>
                  {fSending ? <ActivityIndicator color="#fff" /> : <Text style={ls.loginBtnText}>أرسل الطلب</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[ls.fCancel, { flex: 1 }]} onPress={() => setForgotOpen(false)}>
                  <Text style={ls.fCancelText}>إلغاء</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <TouchableOpacity style={ls.applyBtn} onPress={() => router.push("/union-manager-apply" as any)}>
          <Ionicons name="document-text-outline" size={20} color={UC} />
          <Text style={ls.applyBtnText}>تقديم استمارة الانضمام</Text>
          <Ionicons name="chevron-back" size={16} color={UC} />
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── سجل الأعضاء: البحث والتجديد والإيقاف والتصدير ─────────────────
type Member = {
  id: number; full_name: string; phone: string; email?: string | null; institution: string; major: string; year: string;
  status: "approved" | "suspended"; member_no: string | null; card_issued_at: string | null; card_expires_at: string | null; admin_note?: string | null;
};
type MemberFilter = "all" | "valid" | "expiring" | "expired" | "suspended";

function memberState(m: Member): { label: string; color: string } {
  if (m.status === "suspended") return { label: "موقوفة", color: "#EF4444" };
  const exp = m.card_expires_at ? new Date(m.card_expires_at).getTime() : 0;
  if (!exp || exp <= Date.now()) return { label: "منتهية", color: "#D97706" };
  if (exp - Date.now() < 30 * 86400_000) return { label: "تنتهي قريباً", color: "#F59E0B" };
  return { label: "سارية", color: GREEN };
}
const fmtD = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }) : "—");

function MembersTab({ token, can }: { token: string; can: (p?: keyof Permissions) => boolean }) {
  const [list, setList]       = useState<Member[]>([]);
  const [counts, setCounts]   = useState({ active: 0, expiring: 0, expired: 0, suspended: 0 });
  const [q, setQ]             = useState("");
  const [filter, setFilter]   = useState<MemberFilter>("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen]       = useState<number | null>(null);
  const [reason, setReason]   = useState("");
  const [busy, setBusy]       = useState<number | null>(null);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/members?filter=${filter}&q=${encodeURIComponent(q.trim())}`, { headers });
      const d = await r.json();
      if (r.ok) { setList(d.members || []); setCounts(d.counts || counts); }
      else notify("تنبيه", d.error || "تعذّر تحميل الأعضاء");
    } catch { notify("خطأ", "تعذر الاتصال بالخادم"); }
    finally { setLoading(false); }
  }, [token, filter, q]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load]);

  const act = async (m: Member, action: "renew" | "suspend" | "reactivate") => {
    const msg = action === "renew" ? `تجديد بطاقة «${m.full_name}» سنة كاملة؟` : action === "suspend" ? `إيقاف عضوية «${m.full_name}»؟ تظهر بطاقته «موقوفة» عند التحقق.` : `إعادة تفعيل عضوية «${m.full_name}»؟`;
    if (!(await confirmAction(action === "renew" ? "تجديد البطاقة" : action === "suspend" ? "إيقاف العضوية" : "إعادة التفعيل", msg, "تأكيد", action === "suspend"))) return;
    setBusy(m.id);
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/members/${m.id}`, { method: "PATCH", headers, body: JSON.stringify({ action, note: reason.trim() || undefined }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setReason(""); notify("تم", action === "renew" ? "جُدّدت البطاقة ووصل إشعار للعضو." : action === "suspend" ? "أُوقفت العضوية ووصل إشعار للعضو." : "أُعيد تفعيل العضوية."); load(); }
      else notify("تنبيه", d.error || "تعذّر التنفيذ");
    } catch { notify("خطأ", "تعذر الاتصال بالخادم"); }
    finally { setBusy(null); }
  };

  const exportCsv = async () => {
    const url = `${getApiUrl()}/api/union-manager/members/export`;
    try {
      if (Platform.OS === "web") {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) { notify("تنبيه", (await r.json().catch(() => ({}))).error || "تعذّر التصدير"); return; }
        const blob = await r.blob();
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `union-members-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        return;
      }
      const FS = require("expo-file-system/legacy");
      const Sharing = require("expo-sharing");
      const dest = `${FS.cacheDirectory}union-members-${Date.now()}.csv`;
      const r = await FS.downloadAsync(url, dest, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status !== 200) { notify("تنبيه", "ليست لديك صلاحية التقارير أو تعذّر التصدير"); return; }
      await Sharing.shareAsync(r.uri, { mimeType: "text/csv", dialogTitle: "سجل أعضاء الاتحاد", UTI: "public.comma-separated-values-text" });
    } catch { notify("خطأ", "تعذّر تصدير الملف"); }
  };

  const FILTERS: { k: MemberFilter; l: string; n?: number; c: string }[] = [
    { k: "all", l: "الكل", n: counts.active + counts.suspended, c: UC },
    { k: "valid", l: "سارية", c: GREEN },
    { k: "expiring", l: "تنتهي خلال 30 يوماً", n: counts.expiring, c: "#F59E0B" },
    { k: "expired", l: "منتهية", n: counts.expired, c: "#D97706" },
    { k: "suspended", l: "موقوفة", n: counts.suspended, c: "#EF4444" },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={UC} />}>
      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
        <View style={[ls.input, { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 0 }]}>
          <Ionicons name="search" size={17} color={Colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="الاسم أو رقم العضوية أو المؤسسة أو الهاتف" placeholderTextColor={Colors.textMuted}
            style={{ flex: 1, paddingVertical: 11, fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.text, textAlign: "right" }} />
        </View>
        {can("can_view_reports") && (
          <TouchableOpacity onPress={exportCsv} style={mb.exportBtn} accessibilityLabel="تصدير سجل الأعضاء">
            <Ionicons name="download-outline" size={18} color="#fff" />
            <Text style={mb.exportT}>Excel</Text>
          </TouchableOpacity>
        )}
      </View>

      <RtlScrollRow contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map(f => {
          const on = filter === f.k;
          return (
            <TouchableOpacity key={f.k} onPress={() => setFilter(f.k)} style={[mb.chip, on && { backgroundColor: f.c + "25", borderColor: f.c }]}>
              <Text style={[mb.chipT, on && { color: f.c }]}>{f.l}{f.n != null ? ` · ${f.n}` : ""}</Text>
            </TouchableOpacity>
          );
        })}
      </RtlScrollRow>

      {loading ? <ActivityIndicator color={UC} style={{ marginTop: 30 }} /> : list.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
          <Ionicons name="people-outline" size={44} color={Colors.textMuted} />
          <Text style={mb.empty}>{q ? "لا نتائج مطابقة للبحث" : "لا أعضاء في هذا التصنيف"}</Text>
        </View>
      ) : list.map(m => {
        const st = memberState(m);
        const expanded = open === m.id;
        return (
          <View key={m.id} style={[t.card, { gap: 8 }]}>
            <TouchableOpacity onPress={() => { setOpen(expanded ? null : m.id); setReason(""); }} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
              <View style={[mb.avatar, { backgroundColor: st.color + "22" }]}><Text style={[mb.avatarT, { color: st.color }]}>{m.full_name.trim()[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={mb.name} numberOfLines={1}>{m.full_name}</Text>
                <Text style={mb.sub} numberOfLines={1}>{m.member_no || "بلا رقم"} · {m.institution}</Text>
              </View>
              <View style={{ alignItems: "flex-start", gap: 2 }}>
                <View style={[mb.pill, { backgroundColor: st.color + "22" }]}><Text style={[mb.pillT, { color: st.color }]}>{st.label}</Text></View>
                <Text style={mb.exp}>حتى {fmtD(m.card_expires_at)}</Text>
              </View>
            </TouchableOpacity>
            {expanded && (
              <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, paddingTop: 8 }}>
                <Text style={mb.detail}>{m.major}{m.year ? ` · ${m.year}` : ""} · الهاتف: {m.phone}{m.email ? ` · ${m.email}` : ""}</Text>
                {m.status === "suspended" && m.admin_note ? <Text style={[mb.detail, { color: "#EF4444" }]}>سبب الإيقاف: {m.admin_note}</Text> : null}
                <View style={{ flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" }}>
                  <TouchableOpacity style={mb.act} onPress={() => openExternal(`tel:${m.phone}`)}><Ionicons name="call-outline" size={15} color={UC2} /><Text style={mb.actT}>اتصال</Text></TouchableOpacity>
                  <TouchableOpacity style={mb.act} onPress={() => openExternal(`https://wa.me/${m.phone.replace(/\D/g, "").replace(/^0/, "249")}`)}><Ionicons name="logo-whatsapp" size={15} color="#22C55E" /><Text style={mb.actT}>واتساب</Text></TouchableOpacity>
                  {can("can_manage_requests") && m.status === "approved" && (
                    <TouchableOpacity style={[mb.act, { borderColor: GREEN + "60" }]} disabled={busy === m.id} onPress={() => act(m, "renew")}><Ionicons name="refresh" size={15} color={GREEN} /><Text style={[mb.actT, { color: GREEN }]}>تجديد سنة</Text></TouchableOpacity>
                  )}
                  {can("can_manage_requests") && m.status === "suspended" && (
                    <TouchableOpacity style={[mb.act, { borderColor: GREEN + "60" }]} disabled={busy === m.id} onPress={() => act(m, "reactivate")}><Ionicons name="play-circle-outline" size={15} color={GREEN} /><Text style={[mb.actT, { color: GREEN }]}>إعادة التفعيل</Text></TouchableOpacity>
                  )}
                </View>
                {can("can_manage_requests") && m.status === "approved" && (
                  <View style={{ flexDirection: "row-reverse", gap: 8, alignItems: "center" }}>
                    <TextInput value={reason} onChangeText={setReason} placeholder="سبب الإيقاف (يصل للعضو)" placeholderTextColor={Colors.textMuted}
                      style={[ls.input, { flex: 1, paddingVertical: 8, fontSize: 13 }]} textAlign="right" />
                    <TouchableOpacity style={[mb.act, { borderColor: "#EF444460" }]} disabled={busy === m.id} onPress={() => act(m, "suspend")}><Ionicons name="pause-circle-outline" size={15} color="#EF4444" /><Text style={[mb.actT, { color: "#EF4444" }]}>إيقاف</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const mb = StyleSheet.create({
  exportBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 12 },
  exportT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: Colors.borderSubtle, backgroundColor: Colors.cardBg },
  chipT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textMuted },
  empty: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarT: { fontFamily: "Cairo_700Bold", fontSize: 17 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.text, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  pillT: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  exp: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: Colors.textMuted },
  detail: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  act: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderSubtle },
  actT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.text },
});

// ── تغيير كلمة المرور من داخل البوابة ─────────────────────────────
function ChangePasswordCard({ token, ssoOnly }: { token: string; ssoOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur]   = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (next.length < 8) { notify("كلمة المرور", "8 أحرف على الأقل"); return; }
    setBusy(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/union-manager/change-password`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: cur, new_password: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { notify("تم", "تغيّرت كلمة المرور. سُجّل خروج أجهزتك الأخرى."); setOpen(false); setCur(""); setNext(""); }
      else notify("تنبيه", d.error || "تعذّر التغيير");
    } catch { notify("خطأ", "تعذر الاتصال بالخادم"); }
    finally { setBusy(false); }
  };
  return (
    <View style={t.card}>
      <TouchableOpacity style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }} onPress={() => setOpen(o => !o)}>
        <Ionicons name="key-outline" size={18} color={UC2} />
        <Text style={[ps.accountTitle, { flex: 1, marginBottom: 0 }]}>{ssoOnly ? "تعيين كلمة مرور للبوابة" : "تغيير كلمة المرور"}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textMuted} />
      </TouchableOpacity>
      {ssoOnly && !open && <Text style={[ls.infoText, { marginTop: 6 }]}>تدخل بحسابك في التطبيق، فلا تحتاج كلمة مرور. عيّن واحدة إن أردت الدخول باسم المستخدم أيضاً.</Text>}
      {open && (
        <View style={{ gap: 8, marginTop: 10 }}>
          {!ssoOnly && <TextInput style={ls.input} value={cur} onChangeText={setCur} placeholder="كلمة المرور الحالية" placeholderTextColor={Colors.textMuted} secureTextEntry textAlign="right" />}
          <TextInput style={ls.input} value={next} onChangeText={setNext} placeholder="كلمة المرور الجديدة (8 أحرف على الأقل)" placeholderTextColor={Colors.textMuted} secureTextEntry textAlign="right" />
          <TouchableOpacity style={[ls.loginBtn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={ls.loginBtnText}>حفظ</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── تبويب الموظفين ────────────────────────────────────────────────
function StaffTab({ token, canEdit = true }: { token: string; canEdit?: boolean }) {
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
        {canEdit && (
          <View style={{ flexDirection: "row-reverse", gap: 8, padding: 12, borderRadius: 12, backgroundColor: UC + "18", borderWidth: 1, borderColor: UC + "35" }}>
            <Ionicons name="key-outline" size={17} color={UC2} />
            <Text style={{ flex: 1, fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.text, textAlign: "right", lineHeight: 20 }}>
              يدخل الموظف البوابة بحسابه في التطبيق دون كلمة مرور، إذا طابق هاتفه أو بريده المسجّل هنا حسابه. حدّد ما يُسمح له به من زر الدرع 🛡.
            </Text>
          </View>
        )}
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
              {canEdit && <View style={t.cardActions}>
                <TouchableOpacity onPress={() => setPermStaff(s)} style={[t.actionBtn, { borderColor: "#5B8DB820", backgroundColor: "#5B8DB810" }]}>
                  <Ionicons name="shield-outline" size={16} color="#5B8DB8" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEdit(s)} style={t.actionBtn}>
                  <Ionicons name="pencil-outline" size={16} color={UC} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(s.id, s.full_name)} style={[t.actionBtn, { borderColor: "#EF444420" }]}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>}
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
                <Ionicons name="shield-checkmark" size={12} color="#5B8DB8" />
                <Text style={sf.permText}>
                  {Object.entries(s.permissions).filter(([,v]) => v).map(([k]) => PERMISSION_LABELS[k as keyof Permissions]).join(" · ")}
                </Text>
              </View>
            )}
          </Animated.View>
        ))}
      </ScrollView>

      {/* زر إضافة */}
      {canEdit && <TouchableOpacity style={t.fab} onPress={openAdd}>
        <LinearGradient colors={[UC, "#173F5F"]} style={t.fabInner}>
          <Ionicons name="person-add-outline" size={22} color="#fff" />
          <Text style={t.fabText}>إضافة موظف</Text>
        </LinearGradient>
      </TouchableOpacity>}

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
function MeetingsTab({ token, canEdit = true }: { token: string; canEdit?: boolean }) {
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
              {canEdit && <View style={t.cardActions}>
                <TouchableOpacity onPress={() => openEdit(mtg)} style={t.actionBtn}><Ionicons name="pencil-outline" size={16} color={UC} /></TouchableOpacity>
                <TouchableOpacity onPress={() => remove(mtg.id)} style={[t.actionBtn, { borderColor: "#EF444420" }]}><Ionicons name="trash-outline" size={16} color="#EF4444" /></TouchableOpacity>
              </View>}
            </View>
            {mtg.description && <Text style={[t.cardSub, { marginTop: 6 }]}>{mtg.description}</Text>}
          </Animated.View>
        ))}
      </ScrollView>

      {canEdit && <TouchableOpacity style={t.fab} onPress={openAdd}>
        <LinearGradient colors={[UC, "#173F5F"]} style={t.fabInner}>
          <Ionicons name="calendar-outline" size={22} color="#fff" />
          <Text style={t.fabText}>نداء اجتماع</Text>
        </LinearGradient>
      </TouchableOpacity>}

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
                ] as any[]).map(f => f.key === "meeting_date" ? (
                  <DateInput key={f.key} label={f.label} value={form.meeting_date} onChange={v => setForm(p => ({ ...p, meeting_date: v }))} minDate={new Date()} />
                ) : f.key === "meeting_time" ? (
                  <TimeInput key={f.key} label={f.label} value={form.meeting_time} onChange={v => setForm(p => ({ ...p, meeting_time: v }))} />
                ) : (
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

  // قرار الطالب يصحبه ملاحظة اختيارية تصل للطالب في إشعاره وشاشة حالة طلبه
  const [noteFor, setNoteFor] = useState<{ id: number; name: string; status: "approved" | "rejected" } | null>(null);
  const [note, setNote]       = useState("");

  const doReview = async (type: "student" | "employee", id: number, status: "approved" | "rejected", adminNote?: string) => {
    setActingId(id);
    try {
      const url = type === "student"
        ? `${getApiUrl()}/api/union-manager/requests/student/${id}/status`
        : `${getApiUrl()}/api/union-manager/requests/employee/${id}/status`;
      const r = await fetch(url, { method: "PATCH", headers, body: JSON.stringify({ status, admin_note: adminNote || undefined }) });
      if (r.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (type === "student") {
          setStudents(p => p.filter(s => s.id !== id));
          const d = await r.json().catch(() => ({}));
          if (status === "approved" && d?.application?.member_no) notify("تم القبول", `رقم العضوية: ${d.application.member_no}\nأُصدرت بطاقة العضوية وأُشعر الطالب.`);
        } else setEmployees(p => p.filter(e => e.id !== id));
        onBadgeChange(students.length + employees.length - 1);
      } else { const d = await r.json().catch(() => ({})); notify("خطأ", d.error || "فشلت العملية"); }
    } catch { notify("خطأ", "تعذر الاتصال"); } finally { setActingId(null); }
  };

  const review = async (type: "student" | "employee", id: number, status: "approved" | "rejected") => {
    const label = status === "approved" ? "قبول" : "رفض";
    const name  = type === "student"
      ? students.find(s => s.id === id)?.full_name
      : employees.find(e => e.id === id)?.full_name;
    if (type === "student") { setNote(""); setNoteFor({ id, name: name || "", status }); return; }
    if (await confirmAction(`تأكيد ${label}`, `هل تريد ${label} طلب ${name}؟`, label, status === "rejected")) doReview(type, id, status);
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

      <Modal visible={!!noteFor} transparent animationType="slide" onRequestClose={() => setNoteFor(null)}>
        <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <Text style={m.title}>{noteFor?.status === "approved" ? "قبول" : "رفض"} طلب {noteFor?.name}</Text>
            <Text style={[t.cardSub, { textAlign: "center" }]}>
              {noteFor?.status === "approved" ? "يُصدر رقم عضوية وبطاقة رقمية ويُشعر الطالب." : "يُشعر الطالب بالقرار، ويمكنه التقديم مجدداً."}
            </Text>
            <Text style={m.label}>{noteFor?.status === "approved" ? "رسالة للطالب (اختياري)" : "سبب الرفض / ملاحظة للطالب (اختياري)"}</Text>
            <TextInput style={[m.input, { minHeight: 90, textAlignVertical: "top" }]} value={note} onChangeText={setNote}
              placeholder="تظهر للطالب في شاشة حالة طلبه" placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
            <View style={m.btnRow}>
              <TouchableOpacity style={m.cancelBtn} onPress={() => setNoteFor(null)}><Text style={m.cancelText}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[m.saveBtn, noteFor?.status === "rejected" && { backgroundColor: "#EF4444" }]}
                onPress={() => { const n = noteFor; setNoteFor(null); if (n) doReview("student", n.id, n.status, note.trim()); }}>
                <Text style={m.saveText}>{noteFor?.status === "approved" ? "تأكيد القبول" : "تأكيد الرفض"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── تبويب صندوق رسائل الطلاب ──────────────────────────────────────
type InboxMsg = { id: number; user_id?: number | null; name: string; phone: string; subject?: string | null; message: string; extra?: Record<string, string>; status: "open" | "answered" | "closed"; reply?: string | null; replied_at?: string | null; created_at: string };
const INBOX_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "جديدة", color: "#F59E0B" }, answered: { label: "تم الرد", color: GREEN }, closed: { label: "مغلقة", color: "#94A3B8" },
};

function InboxTab({ token, onBadgeChange }: { token: string; onBadgeChange: (n: number) => void }) {
  const [filter, setFilter]   = useState<"open" | "answered" | "closed" | "all">("open");
  const [items, setItems]     = useState<InboxMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive]   = useState<InboxMsg | null>(null);
  const [reply, setReply]     = useState("");
  const [saving, setSaving]   = useState(false);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/inbox?status=${filter}`, { headers });
      if (r.ok) { const d = await r.json(); setItems(d.messages || []); onBadgeChange(d.open_count || 0); }
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token, filter]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const submit = async () => {
    if (!active) return;
    if (!reply.trim()) { notify("تنبيه", "اكتب الرد أولاً"); return; }
    setSaving(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/inbox/${active.id}`, {
        method: "PATCH", headers, body: JSON.stringify({ reply: reply.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify("خطأ", d.error || "فشلت العملية"); return; }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setActive(null); setReply(""); load();
      notify("تم الإرسال", active.user_id ? "وصل الرد للطالب مع إشعار." : "حُفظ الرد. المرسل زائر — تواصل معه هاتفياً.");
    } catch { notify("خطأ", "تعذر الاتصال"); } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={rq.filterRow}>
        {(["open", "answered", "closed", "all"] as const).map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[rq.filterBtn, filter === f && rq.filterBtnActive]}>
            <Text style={[rq.filterText, filter === f && rq.filterTextActive]}>{f === "all" ? "الكل" : INBOX_STATUS[f].label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <View style={t.center}><ActivityIndicator color={UC} /></View> : (
        <FlatList<InboxMsg>
          data={items}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 }}
          ListHeaderComponent={<Text style={[msg_.sectionLabel, { marginBottom: 2 }]}>صندوق رسائل الطلاب — رسائل «تواصل مع الإتحاد»</Text>}
          ListEmptyComponent={<View style={t.empty}><Ionicons name="mail-open-outline" size={48} color={Colors.textMuted} /><Text style={t.emptyText}>لا توجد رسائل</Text></View>}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).springify()} style={rq.card}>
              <View style={rq.cardTop}>
                <View style={rq.avatar}><Text style={rq.avatarText}>{item.name[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <Text style={[rq.name, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
                    <View style={[t.typeBadge, { backgroundColor: INBOX_STATUS[item.status].color + "22" }]}>
                      <Text style={[t.typeBadgeText, { color: INBOX_STATUS[item.status].color }]}>{INBOX_STATUS[item.status].label}</Text>
                    </View>
                  </View>
                  <Text style={rq.detail}>{item.subject || "استفسار عام"}</Text>
                  <Text style={rq.meta}>📞 {item.phone}{item.user_id ? " · مستخدم مسجّل" : " · زائر"}{item.extra?.best_time ? ` · ${item.extra.best_time}` : ""}</Text>
                </View>
              </View>
              <Text style={rq.motivation}>{item.message}</Text>
              {item.reply ? <Text style={[rq.skills, { color: UC2 }]}>↩ ردّكم: {item.reply}</Text> : null}
              <Text style={rq.date}>{formatDate(item.created_at)}</Text>
              <View style={rq.btnRow}>
                {item.status !== "closed" && (
                  <TouchableOpacity style={rq.rejectBtn} onPress={async () => {
                    if (!(await confirmAction("إغلاق الرسالة", "إغلاق هذه الرسالة دون رد إضافي؟", "إغلاق"))) return;
                    try {
                      await fetch(`${getApiUrl()}/api/union-manager/inbox/${item.id}`, { method: "PATCH", headers, body: JSON.stringify({ status: "closed" }) });
                      load();
                    } catch {}
                  }}>
                    <Ionicons name="archive-outline" size={16} color="#EF4444" />
                    <Text style={rq.rejectText}>إغلاق</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={rq.approveBtn} onPress={() => { setActive(item); setReply(item.reply || ""); }}>
                  <Ionicons name="return-down-back-outline" size={16} color="#fff" />
                  <Text style={rq.approveText}>{item.reply ? "تعديل الرد" : "رد"}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        />
      )}

      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <Text style={m.title}>الرد على {active?.name}</Text>
            <Text style={[rq.motivation, { maxHeight: 140 }]}>{active?.message}</Text>
            <Text style={m.label}>نص الرد</Text>
            <TextInput style={[m.input, { minHeight: 110, textAlignVertical: "top" }]} value={reply} onChangeText={setReply}
              placeholder="اكتب ردّ الاتحاد..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
            <View style={m.btnRow}>
              <TouchableOpacity style={m.cancelBtn} onPress={() => setActive(null)}><Text style={m.cancelText}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={submit}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={m.saveText}>إرسال الرد</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── تبويب الأخبار والإعلانات ──────────────────────────────────────
type UPost = { id: number; title: string; body: string; image_url?: string | null; is_pinned: boolean; created_at: string; author_name?: string | null };

function NewsTab({ token }: { token: string }) {
  const [posts, setPosts]     = useState<UPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [show, setShow]       = useState(false);
  const [title, setTitle]     = useState("");
  const [body, setBody]       = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [pinned, setPinned]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/student-union/posts?limit=100`);
      if (r.ok) setPosts((await r.json()).posts || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    if (!title.trim() || !body.trim()) { notify("تنبيه", "العنوان والمحتوى مطلوبان"); return; }
    setSaving(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/union-manager/posts`, {
        method: "POST", headers, body: JSON.stringify({ title: title.trim(), body: body.trim(), image_url: imageUrl.trim() || null, is_pinned: pinned }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { notify("خطأ", d.error || "فشل النشر"); return; }
      setShow(false); setTitle(""); setBody(""); setImageUrl(""); setPinned(false); load();
      notify("تم النشر", d.notified ? `وصل إشعار إلى ${d.notified} عضو.` : "ظهر الخبر في تبويب «إتحاد الطلاب».");
    } catch { notify("خطأ", "تعذر الاتصال"); } finally { setSaving(false); }
  };
  const togglePin = async (id: number) => {
    try { await fetch(`${getApiUrl()}/api/union-manager/posts/${id}/pin`, { method: "PATCH", headers }); load(); } catch {}
  };
  const remove = async (id: number) => {
    if (!(await confirmAction("حذف الخبر", "هل تريد حذف هذا الخبر نهائياً؟", "حذف", true))) return;
    try { await fetch(`${getApiUrl()}/api/union-manager/posts/${id}`, { method: "DELETE", headers }); setPosts(p => p.filter(x => x.id !== id)); } catch {}
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UC} />}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}>
        <Text style={msg_.sectionLabel}>الأخبار والإعلانات — تظهر للطلاب في تبويب «إتحاد الطلاب» ويُشعَر بها الأعضاء المقبولون</Text>
        {loading && <ActivityIndicator color={UC} />}
        {!loading && posts.length === 0 && (
          <View style={t.empty}><Ionicons name="megaphone-outline" size={48} color={Colors.textMuted} /><Text style={t.emptyText}>لم تُنشر أخبار بعد</Text></View>
        )}
        {posts.map((p, i) => (
          <Animated.View key={p.id} entering={FadeInDown.delay(Math.min(i, 8) * 40).springify()} style={[t.card, p.is_pinned && { borderColor: "#F59E0B50" }]}>
            <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                  {p.is_pinned && <Ionicons name="pin" size={14} color="#F59E0B" />}
                  <Text style={[t.cardName, { flex: 1 }]}>{p.title}</Text>
                </View>
                <Text style={msg_.content} numberOfLines={4}>{p.body}</Text>
                <Text style={t.cardInfo}>{formatDate(p.created_at)}{p.author_name ? ` · ${p.author_name}` : ""}</Text>
              </View>
              <View style={t.cardActions}>
                <TouchableOpacity onPress={() => togglePin(p.id)} style={t.actionBtn}>
                  <Ionicons name={p.is_pinned ? "pin" : "pin-outline"} size={14} color={p.is_pinned ? "#F59E0B" : Colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(p.id)} style={[t.actionBtn, { borderColor: "#EF444420" }]}>
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      <TouchableOpacity style={t.fab} onPress={() => setShow(true)}>
        <LinearGradient colors={[UC, "#173F5F"]} style={t.fabInner}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={t.fabText}>خبر جديد</Text>
        </LinearGradient>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView style={m.sheet} contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
            <View style={m.handle} />
            <Text style={m.title}>نشر خبر / إعلان</Text>
            <Text style={m.label}>العنوان *</Text>
            <TextInput style={m.input} value={title} onChangeText={setTitle} placeholder="عنوان الخبر" placeholderTextColor={Colors.textMuted} textAlign="right" maxLength={200} />
            <Text style={m.label}>المحتوى *</Text>
            <TextInput style={[m.input, { minHeight: 120, textAlignVertical: "top" }]} value={body} onChangeText={setBody} placeholder="نص الخبر أو الإعلان..." placeholderTextColor={Colors.textMuted} textAlign="right" multiline />
            <ImageUploadField label="صورة الخبر (اختياري)" value={imageUrl} onChange={setImageUrl} folder="union/news" />
            <TouchableOpacity onPress={() => setPinned(v => !v)} style={[pm.row, pinned && pm.rowActive]}>
              <Ionicons name={pinned ? "checkbox" : "square-outline"} size={20} color={pinned ? UC : Colors.textMuted} />
              <Text style={[pm.label, pinned && pm.labelActive]}>تثبيت في أعلى القائمة</Text>
            </TouchableOpacity>
            <View style={m.btnRow}>
              <TouchableOpacity style={m.cancelBtn} onPress={() => setShow(false)}><Text style={m.cancelText}>إلغاء</Text></TouchableOpacity>
              <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={publish}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={m.saveText}>نشر وإشعار الأعضاء</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
          <RtlScrollRow contentContainerStyle={{ gap: 8}}>
            {Object.keys(PERMISSION_PRESETS).map(pr => (
              <TouchableOpacity key={pr} onPress={() => applyPreset(pr)} style={m.chip}>
                <Text style={m.chipText}>{pr}</Text>
              </TouchableOpacity>
            ))}
          </RtlScrollRow>

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
  const [tab, setTab]     = useState<"staff" | "meetings" | "messages" | "requests" | "inbox" | "news" | "members" | "archive" | "elections" | "account">("requests");
  const [inboxBadge, setInboxBadge] = useState(0);
  const [stats, setStats] = useState({ staff: 0, upcoming_meetings: 0, messages: 0, pending_requests: 0, members: 0, expiring_cards: 0 });
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
        fetch(`${getApiUrl()}/api/union-manager/inbox?status=open`, { headers: { Authorization: `Bearer ${tok}` } })
          .then(x => x.ok ? x.json() : null).then(x => { if (x) setInboxBadge(x.open_count || 0); }).catch(() => {});
      } else { setToken(null); setManager(null); await AsyncStorage.multiRemove([MGTOKEN_KEY, MGINFO_KEY]); }
    } catch {}
  }, []);

  useEffect(() => { if (token) loadStats(token); }, [token]);

  // تحديث الصلاحيات من الخادم (قد تكون الرئاسة عدّلتها)
  useEffect(() => {
    if (!token) return;
    fetch(`${getApiUrl()}/api/union-manager/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.manager) { setManager(d.manager); AsyncStorage.setItem(MGINFO_KEY, JSON.stringify(d.manager)).catch(() => {}); } })
      .catch(() => {});
  }, [token]);

  /** رئاسة الاتحاد تملك كل الصلاحيات؛ الموظف مقيّد بما منحته له */
  const can = (p?: keyof Permissions) => !p || !manager?.staff_id || manager?.permissions?.[p] === true;

  const handleLogin = (tok: string, mgr: Manager) => { setToken(tok); setManager(mgr); };

  const logout = async () => {
    if (!(await confirmAction("تسجيل الخروج", "هل تريد تسجيل الخروج؟", "خروج", true))) return;
    ssoAutoSkipped = true;
    await AsyncStorage.multiRemove([MGTOKEN_KEY, MGINFO_KEY]);
    setToken(null); setManager(null);
  };

  if (checking) return <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}><ActivityIndicator color={UC} /></View>;
  if (!token || !manager) return <LoginScreen onLogin={handleLogin} />;

  const TABS = ([
    { key: "requests", icon: "mail-unread-outline",  label: "الطلبات",    badge: reqBadge,   show: can("can_manage_requests") },
    { key: "members",  icon: "id-card-outline",      label: "الأعضاء",    badge: stats.expiring_cards || 0, show: true },
    { key: "inbox",    icon: "file-tray-full-outline", label: "الرسائل",  badge: inboxBadge, show: can("can_manage_requests") },
    { key: "news",     icon: "megaphone-outline",     label: "الأخبار",    badge: 0, show: can("can_post_announcements") },
    { key: "elections", icon: "checkbox-outline",     label: "الانتخابات", badge: 0, show: true },
    { key: "archive",  icon: "images-outline",        label: "الأرشيف",    badge: 0, show: true },
    { key: "staff",    icon: "people-outline",        label: "الموظفون",   badge: 0, show: true },
    { key: "meetings", icon: "calendar-outline",      label: "الاجتماعات", badge: 0, show: true },
    { key: "messages", icon: "chatbubbles-outline",   label: "الفريق",     badge: 0, show: true },
    { key: "account",  icon: "settings-outline",      label: "الحساب",     badge: 0, show: true },
  ]).filter(x => x.show);
  const activeTab = TABS.some(x => x.key === tab) ? tab : (TABS[0].key as typeof tab);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      {/* الهيدر */}
      <LinearGradient colors={["#0B0F1A", "#16324F"]} style={[ps.header, { paddingTop: insets.top + 8 }]}>
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
          { val: stats.members ?? 0,     label: "عضو",        color: GREEN },
          { val: stats.staff,            label: "موظف",       color: UC },
          { val: stats.upcoming_meetings,label: "اجتماع",     color: "#F59E0B" },
        ].map((s, i) => (
          <View key={i} style={ps.statItem}>
            <Text style={[ps.statVal, { color: s.color }]}>{s.val}</Text>
            <Text style={ps.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* المحتوى */}
      <View style={{ flex: 1 }}>
        {activeTab === "members"  && <MembersTab token={token} can={can} />}
        {activeTab === "archive"  && <ArchiveTab token={token} canEdit={can("can_post_announcements")} />}
        {activeTab === "elections" && <ElectionsTab token={token} canManage={!manager.staff_id} />}
        {activeTab === "requests" && <RequestsTab token={token} onBadgeChange={n => { setReqBadge(n); setStats(p => ({ ...p, pending_requests: n })); }} />}
        {activeTab === "inbox"    && <InboxTab token={token} onBadgeChange={setInboxBadge} />}
        {activeTab === "news"     && <NewsTab token={token} />}
        {activeTab === "staff"    && <StaffTab token={token} canEdit={can("can_manage_staff")} />}
        {activeTab === "meetings" && <MeetingsTab token={token} canEdit={can("can_manage_meetings")} />}
        {activeTab === "messages" && <MessagesTab token={token} manager={manager} />}
        {activeTab === "account"  && (
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
            <ChangePasswordCard token={token} ssoOnly={manager.username.startsWith("app_admin_")} />
            <TouchableOpacity style={ps.logoutBtn} onPress={logout}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={ps.logoutText}>تسجيل الخروج</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* شريط التبويبات */}
      <View style={[ps.tabBar, { paddingBottom: insets.bottom + 4 }]}>
        <RtlScrollRow contentContainerStyle={{ paddingHorizontal: 4 }}>
        {TABS.map(tb => (
          <TouchableOpacity key={tb.key} onPress={() => setTab(tb.key as any)} style={[ps.tabItem, { minWidth: 70, flex: 0, paddingHorizontal: 6 }]}>
            <View style={{ position: "relative" }}>
              <Ionicons name={tb.icon as any} size={22} color={activeTab === tb.key ? UC : Colors.textMuted} />
              {tb.badge > 0 && (
                <View style={ps.badge}>
                  <Text style={ps.badgeText}>{tb.badge > 9 ? "9+" : String(tb.badge)}</Text>
                </View>
              )}
            </View>
            <Text style={[ps.tabLabel, { color: activeTab === tb.key ? UC : Colors.textMuted }]} numberOfLines={1}>{tb.label}</Text>
          </TouchableOpacity>
        ))}
        </RtlScrollRow>
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
  ssoBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: UC2 + "60", backgroundColor: UC + "22", marginTop: 6 },
  ssoBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  ssoBtnSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  orRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginVertical: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.borderSubtle },
  orText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  forgotText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: UC2, textDecorationLine: "underline" },
  fOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 18 },
  fSheet: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 18, width: "100%", maxWidth: 440, alignSelf: "center" },
  fTip: { flexDirection: "row-reverse", gap: 8, padding: 12, borderRadius: 12, backgroundColor: UC + "22", marginVertical: 10 },
  fTipText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.text, textAlign: "right", lineHeight: 21 },
  fCancel: { borderRadius: 14, padding: 15, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  fCancelText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text },
  infoBox: { flexDirection: "row-reverse", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 14, marginHorizontal: 20, alignItems: "flex-start" },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, flex: 1, textAlign: "right", lineHeight: 22 },
  applyBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: UC + "10", borderRadius: 14, padding: 16, marginHorizontal: 20, marginTop: 12, borderWidth: 1, borderColor: UC + "30" },
  applyBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: UC, flex: 1, textAlign: "right" },
});

const ps = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: UC2, textAlign: "center" },
  statsRow: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle },
  statItem: { flex: 1, alignItems: "center", paddingVertical: 10 },
  statVal: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  tabBar: { flexDirection: "row-reverse", backgroundColor: Colors.cardBg, borderTopWidth: 1, borderTopColor: Colors.borderSubtle, paddingTop: 8 },
  tabItem: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 4 },
  tabLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, textAlign: "center" },
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
  detail: { fontFamily: "Cairo_400Regular", fontSize: 13, color: UC2, textAlign: "right", marginTop: 2 },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  motivation: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.text, textAlign: "right", lineHeight: 20, backgroundColor: Colors.bg, borderRadius: 8, padding: 8 },
  skills: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  date: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "left" },
  btnRow: { flexDirection: "row-reverse", gap: 10 },
  approveBtn: { flex: 2, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#22C55E", borderRadius: 10, paddingVertical: 10 },
  approveText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  rejectBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: "#EF444430", backgroundColor: "#EF444410" },
  rejectText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#EF4444" },
});

const sf = StyleSheet.create({
  permRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 4 },
  permText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#5B8DB8", flex: 1, textAlign: "right" },
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
  cardSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  cardInfo: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
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
  chipText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
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
