/**
 * حسابات البوابات — مدير التطبيق يدير بيانات دخول مديري اتحاد الطلاب وموظفيه:
 * تعيين اسم مستخدم وكلمة مرور يدوياً، كلمة مرور مؤقتة، تعليق/تفعيل، وإرسال البيانات واتساب.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, copyText, notify, openExternal } from "@/lib/xplatform";
import { onlyDigits, toLatinDigits } from "@/lib/digits";

type Mgr = {
  id: number; full_name: string; title?: string | null; username: string;
  phone?: string | null; email?: string | null; is_active: boolean; created_at?: string;
  institution?: string | null;
};

const UNION = "#004D36";

function genPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let p = "";
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

/** اسم المستخدم المولَّد قديماً بحروف عربية — هو سبب تعذّر الدخول */
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
const isSsoOnly = (u: string) => u.startsWith("app_admin_");

export default function AdminPortalAccounts() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const api = getApiUrl();
  const [items, setItems] = useState<Mgr[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "suspended" | "fix">("all");
  const [editing, setEditing] = useState<Mgr | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${api}/api/admin/union-managers`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => []);
      setItems(Array.isArray(d) ? d.filter((m: Mgr) => !isSsoOnly(m.username)) : []);
    } catch { setItems([]); }
    setLoading(false);
  }, [api, token]);

  useEffect(() => { load(); }, [load]);

  const needsFix = (m: Mgr) => hasArabic(m.username) || /\s/.test(m.username);

  const shown = useMemo(() => {
    const t = toLatinDigits(q).trim().toLowerCase();
    return items.filter(m => {
      if (filter === "active" && !m.is_active) return false;
      if (filter === "suspended" && m.is_active) return false;
      if (filter === "fix" && !needsFix(m)) return false;
      if (!t) return true;
      return [m.full_name, m.username, m.phone, m.email, m.title].some(v => String(v || "").toLowerCase().includes(t));
    });
  }, [items, q, filter]);

  const counts = useMemo(() => ({
    all: items.length,
    active: items.filter(m => m.is_active).length,
    suspended: items.filter(m => !m.is_active).length,
    fix: items.filter(needsFix).length,
  }), [items]);

  const toggle = async (m: Mgr) => {
    const next = !m.is_active;
    if (!next && !(await confirmAction("تعليق الحساب", `تعليق دخول «${m.full_name}» إلى البوابة؟`, "تعليق", true))) return;
    setActing(m.id);
    try {
      const r = await fetch(`${api}/api/admin/union-managers/${m.id}/status`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      if (r.ok) setItems(prev => prev.map(x => x.id === m.id ? { ...x, is_active: next } : x));
      else notify("خطأ", (await r.json().catch(() => ({}))).error || "تعذّر التحديث");
    } catch { notify("خطأ", "تعذّر الاتصال"); }
    setActing(null);
  };

  if (user && user.role !== "admin") {
    return (
      <View style={[st.root, { alignItems: "center", justifyContent: "center", padding: 24 }]}>
        <Ionicons name="lock-closed" size={40} color={Colors.textMuted} />
        <Text style={st.emptyText}>هذه الصفحة لمدير التطبيق فقط</Text>
      </View>
    );
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.iconBtn} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>حسابات بوابة الاتحاد</Text>
          <Text style={st.sub}>بيانات دخول مديري اتحاد الطلاب وموظفيه</Text>
        </View>
        <TouchableOpacity onPress={load} style={st.iconBtn} accessibilityLabel="تحديث">
          <Ionicons name="refresh" size={18} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={Colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {counts.fix > 0 && (
          <Pressable onPress={() => setFilter("fix")} style={st.alert}>
            <Ionicons name="warning" size={20} color="#946B00" />
            <View style={{ flex: 1 }}>
              <Text style={st.alertTitle}>{counts.fix} حساب باسم مستخدم عربي</Text>
              <Text style={st.alertBody}>
                هذه الأسماء يصعب كتابتها حرفياً، وهي سبب تعذّر الدخول. الخادم صار يقبل الحروف العربية بأشكالها ورقم الهاتف أيضاً،
                لكن الأفضل تعيين اسم لاتيني بسيط لكل حساب من «تعديل بيانات الدخول».
              </Text>
            </View>
          </Pressable>
        )}

        <View style={st.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={st.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="ابحث بالاسم أو الهاتف أو اسم المستخدم"
            placeholderTextColor={Colors.textMuted}
            autoCorrect={false}
          />
          {!!q && <Ionicons name="close-circle" size={18} color={Colors.textMuted} onPress={() => setQ("")} />}
        </View>

        <View style={st.chips}>
          {([
            ["all", "الكل"], ["active", "مفعّلة"], ["suspended", "معلّقة"], ["fix", "تحتاج إصلاح"],
          ] as const).map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[st.chip, filter === k && st.chipOn]}>
              <Text style={[st.chipText, filter === k && st.chipTextOn]}>{label} · {counts[k]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : shown.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 50, gap: 8 }}>
            <Ionicons name="people-outline" size={42} color={Colors.textMuted} />
            <Text style={st.emptyText}>لا توجد حسابات مطابقة</Text>
          </View>
        ) : shown.map((m, i) => (
          <Animated.View key={m.id} entering={FadeInDown.delay(Math.min(i, 8) * 40)} style={st.card}>
            <View style={st.cardTop}>
              <View style={[st.avatar, { backgroundColor: (m.is_active ? UNION : Colors.textMuted) + "1A" }]}>
                <Text style={[st.avatarText, { color: m.is_active ? UNION : Colors.textMuted }]}>{m.full_name?.charAt(0) || "؟"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.name} numberOfLines={1}>{m.full_name}</Text>
                <Text style={st.role} numberOfLines={1}>{m.title || "مدير اتحاد"}{m.institution ? ` · ${m.institution}` : ""}</Text>
              </View>
              <View style={[st.badge, { backgroundColor: m.is_active ? "#10B98118" : "#EF444418" }]}>
                <View style={[st.dot, { backgroundColor: m.is_active ? "#00966A" : "#D93636" }]} />
                <Text style={[st.badgeText, { color: m.is_active ? "#006B4A" : "#B42323" }]}>{m.is_active ? "مفعّل" : "معلّق"}</Text>
              </View>
            </View>

            <View style={st.credBox}>
              <View style={st.credRow}>
                <Text style={st.credLabel}>اسم المستخدم</Text>
                <Text style={[st.credValue, needsFix(m) && { color: "#946B00" }]} selectable>{m.username}</Text>
                {needsFix(m) && <Ionicons name="warning" size={14} color="#946B00" />}
              </View>
              {!!m.phone && (
                <View style={st.credRow}>
                  <Text style={st.credLabel}>الهاتف</Text>
                  <Text style={st.credValue} selectable>{m.phone}</Text>
                </View>
              )}
            </View>

            <View style={st.actions}>
              <ActionBtn icon="key" label="تعديل بيانات الدخول" color={Colors.primary} filled onPress={() => setEditing(m)} />
              <ActionBtn
                icon={m.is_active ? "pause-circle-outline" : "play-circle-outline"}
                label={m.is_active ? "تعليق" : "تفعيل"}
                color={m.is_active ? "#D93636" : "#00966A"}
                loading={acting === m.id}
                onPress={() => toggle(m)}
              />
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      <CredentialsSheet
        mgr={editing}
        onClose={() => setEditing(null)}
        onSaved={(u) => { setItems(prev => prev.map(x => x.id === u.id ? { ...x, ...u } : x)); }}
        api={api}
        token={token || ""}
      />
    </View>
  );
}

function ActionBtn({ icon, label, color, onPress, filled, loading }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void; filled?: boolean; loading?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
      style={[st.actBtn, filled ? { backgroundColor: color, borderColor: color, flex: 1.6 } : { borderColor: color + "40", backgroundColor: color + "0F" }]}
    >
      {loading ? <ActivityIndicator size="small" color={filled ? "#fff" : color} /> : (
        <>
          <Ionicons name={icon} size={16} color={filled ? "#fff" : color} />
          <Text style={[st.actText, { color: filled ? "#fff" : color }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function CredentialsSheet({ mgr, onClose, onSaved, api, token }: {
  mgr: Mgr | null; onClose: () => void; onSaved: (m: Partial<Mgr> & { id: number }) => void; api: string; token: string;
}) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ username: string; password?: string } | null>(null);

  useEffect(() => {
    if (!mgr) return;
    const digits = onlyDigits(mgr.phone || "").slice(-9);
    // اقتراح اسم لاتيني إن كان الحالي عربياً
    setUsername(hasArabic(mgr.username) || /\s/.test(mgr.username) ? (digits.length >= 9 ? `su${digits}` : `union${mgr.id}`) : mgr.username);
    setPassword(genPassword());
    setPhone(mgr.phone || "");
    setError(""); setSaved(null);
  }, [mgr?.id]);

  const userValid = /^[a-z0-9._-]{3,30}$/.test(username);
  const passValid = !password || password.length >= 8;

  const save = async () => {
    if (!mgr) return;
    if (!userValid) { setError("اسم المستخدم: 3–30 حرفاً لاتينياً صغيراً أو أرقاماً، ويُسمح بـ . _ -"); return; }
    if (!passValid) { setError("كلمة المرور 8 أحرف على الأقل"); return; }
    setSaving(true); setError("");
    try {
      const body: any = {};
      if (username !== mgr.username) body.username = username;
      if (password) body.password = password;
      if ((phone || "") !== (mgr.phone || "")) body.phone = phone;
      const r = await fetch(`${api}/api/admin/union-managers/${mgr.id}/credentials`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "تعذّر الحفظ"); return; }
      onSaved({ id: mgr.id, username: d.manager?.username ?? username, phone: d.manager?.phone ?? phone, is_active: true });
      setSaved({ username: d.manager?.username ?? username, password: password || undefined });
    } catch { setError("تعذّر الاتصال بالخادم"); }
    finally { setSaving(false); }
  };

  const message = saved && mgr
    ? `مرحباً ${mgr.full_name}،\nبيانات دخولك إلى بوابة إدارة اتحاد الطلاب في تطبيق حصاحيصاوي:\n\nاسم المستخدم: ${saved.username}\n${saved.password ? `كلمة المرور: ${saved.password}\n` : ""}\nيمكنك أيضاً الدخول برقم هاتفك بدل اسم المستخدم. يُرجى تغيير كلمة المرور من «الحساب» بعد الدخول.`
    : "";

  const whatsapp = () => {
    const digits = onlyDigits(phone);
    const intl = digits.startsWith("0") ? `249${digits.slice(1)}` : digits;
    openExternal(`https://wa.me/${intl}?text=${encodeURIComponent(message)}`).catch(() => {});
  };

  return (
    <Modal visible={!!mgr} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={st.grabber} />
          <Text style={st.sheetTitle}>{saved ? "تم حفظ بيانات الدخول" : "بيانات الدخول"}</Text>
          <Text style={st.sheetSub}>{mgr?.full_name}</Text>

          {saved ? (
            <View style={{ gap: 12 }}>
              <View style={st.successBox}>
                <Ionicons name="checkmark-circle" size={22} color="#006B4A" />
                <Text style={st.successText}>أُنهيت جلساته السابقة. أرسل له البيانات الجديدة:</Text>
              </View>
              <View style={st.credBox}>
                <View style={st.credRow}><Text style={st.credLabel}>اسم المستخدم</Text><Text style={st.credValue} selectable>{saved.username}</Text></View>
                {!!saved.password && <View style={st.credRow}><Text style={st.credLabel}>كلمة المرور</Text><Text style={st.credValue} selectable>{saved.password}</Text></View>}
              </View>
              <View style={st.actions}>
                {onlyDigits(phone).length >= 9 && <ActionBtn icon="logo-whatsapp" label="إرسال واتساب" color="#00966A" filled onPress={whatsapp} />}
                <ActionBtn icon="copy-outline" label="نسخ" color={Colors.primary} onPress={() => copyText(message).then(r => r === "copied" && notify("تم النسخ"))} />
              </View>
              <ActionBtn icon="close" label="إغلاق" color={Colors.textSecondary} onPress={onClose} />
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {!!mgr && hasArabic(mgr.username) && (
                <Text style={st.note}>الاسم الحالي «{mgr.username}» عربي — اقترحنا اسماً لاتينياً سهل الكتابة.</Text>
              )}
              <Field label="اسم المستخدم (حروف لاتينية)" valid={userValid || !username}>
                <TextInput
                  style={[st.input, { textAlign: "left" }]}
                  value={username}
                  onChangeText={v => setUsername(toLatinDigits(v).toLowerCase().replace(/\s+/g, ""))}
                  autoCapitalize="none" autoCorrect={false}
                  placeholder="su0912345678"
                  placeholderTextColor={Colors.textSubtle}
                />
              </Field>
              <Field label="كلمة مرور جديدة (اتركها فارغة لعدم التغيير)" valid={passValid}>
                <TextInput
                  style={[st.input, { textAlign: "left" }]}
                  value={password}
                  onChangeText={v => setPassword(toLatinDigits(v))}
                  autoCapitalize="none" autoCorrect={false}
                  placeholder="8 أحرف على الأقل"
                  placeholderTextColor={Colors.textSubtle}
                />
                <TouchableOpacity onPress={() => setPassword(genPassword())} style={st.genBtn} accessibilityLabel="توليد كلمة مرور">
                  <Ionicons name="shuffle" size={16} color={Colors.primary} />
                </TouchableOpacity>
              </Field>
              <Field label="رقم الهاتف (يمكن الدخول به أيضاً)" valid>
                <TextInput
                  style={[st.input, { textAlign: "left" }]}
                  value={phone}
                  onChangeText={v => setPhone(onlyDigits(v, 14))}
                  keyboardType="phone-pad"
                  placeholder="0912345678"
                  placeholderTextColor={Colors.textSubtle}
                />
              </Field>
              {!!error && <Text style={st.error}>{error}</Text>}
              <TouchableOpacity onPress={save} disabled={saving} style={st.saveBtn} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="save-outline" size={18} color="#fff" />
                    <Text style={st.saveText}>حفظ وتفعيل الحساب</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, valid, children }: { label: string; valid: boolean; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.fieldLabel}>{label}</Text>
      <View style={[st.fieldWrap, !valid && { borderColor: Colors.danger }]}>{children}</View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },

  alert: { flexDirection: "row-reverse", gap: 10, padding: 14, borderRadius: 16, backgroundColor: "#F59E0B14", borderWidth: 1, borderColor: "#F59E0B45" },
  alertTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#946B00", textAlign: "right" },
  alertBody: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 20, marginTop: 2 },

  searchBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, paddingVertical: 11, textAlign: "right", ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  chipOn: { backgroundColor: Colors.primary + "15", borderColor: Colors.primary },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  chipTextOn: { color: Colors.primary, fontFamily: "Cairo_700Bold" },

  card: { backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1, borderColor: Colors.divider, padding: 14, gap: 12 },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  role: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },

  credBox: { backgroundColor: Colors.bg, borderRadius: 12, padding: 10, gap: 6 },
  credRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  credLabel: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, minWidth: 82, textAlign: "right" },
  credValue: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "left" },

  actions: { flexDirection: "row-reverse", gap: 8 },
  actBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  actText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center" },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, gap: 4, maxWidth: 560, width: "100%", alignSelf: "center" },
  grabber: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, marginBottom: 10 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  sheetSub: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted, textAlign: "right", marginBottom: 10 },
  note: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: "#946B00", textAlign: "right", backgroundColor: "#F59E0B12", padding: 10, borderRadius: 10 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  fieldWrap: { flexDirection: "row", alignItems: "center", borderRadius: 13, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.bg, paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, paddingVertical: 11, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  genBtn: { padding: 6, borderRadius: 8, backgroundColor: Colors.primary + "14" },
  error: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.danger, textAlign: "right" },
  saveBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  saveText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  successBox: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#10B98114", borderRadius: 12, padding: 12 },
  successText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#006B4A", textAlign: "right" },
});
