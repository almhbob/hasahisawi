// إدارة شركات المقاولات — مراجعة طلبات التسجيل واعتمادها أو رفضها أو إيقافها مع ملاحظة للشركة.
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet, Image, Linking, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify, confirmAction } from "@/lib/xplatform";
import { conApi, CON, CON_DEEP, fmtD, type Company } from "@/lib/contractors";
import { Badge, Pill, conStyles as u } from "@/components/contractors/ui";

type Status = "pending" | "active" | "suspended" | "rejected";
const STATUS: Record<Status, { label: string; color: string; icon: string }> = {
  pending: { label: "بانتظار المراجعة", color: "#B7791F", icon: "time-outline" },
  active: { label: "معتمدة", color: "#0E8A5F", icon: "checkmark-circle-outline" },
  suspended: { label: "موقوفة", color: "#6B7280", icon: "pause-circle-outline" },
  rejected: { label: "مرفوضة", color: "#B42318", icon: "close-circle-outline" },
};
const ORDER: Status[] = ["pending", "active", "suspended", "rejected"];

export default function ContractorsAdmin() {
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const [status, setStatus] = useState<Status | "">("pending");
  const [d, setD] = useState<{ companies: Company[]; counts: Record<string, number> } | null>(null);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try { setD(await conApi.adminList(token, status || undefined)); setErr(""); }
    catch (e: any) { setErr(e?.message || "تعذّر التحميل"); }
  }, [token, status]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const back = () => (router.canGoBack() ? router.back() : router.replace("/contractors" as any));

  if (!token || isGuest) return <View style={st.center}><Ionicons name="lock-closed-outline" size={40} color={CON} /><Text style={[u.hint, { marginTop: 8 }]}>سجّل الدخول بحساب إداري</Text></View>;
  const total = d ? Object.values(d.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.head, { paddingTop: insets.top + 8 }]}>
        <View style={u.rowR}>
          <Pressable onPress={back} hitSlop={10} accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={22} color="#fff" /></Pressable>
          <MaterialCommunityIcons name="shield-check-outline" size={26} color="#FBBF24" style={{ marginRight: 12 }} />
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={st.hTitle}>إدارة شركات المقاولات</Text>
            <Text style={st.hSub}>مراجعة طلبات التسجيل واعتمادها</Text>
          </View>
        </View>
        <View style={[u.rowR, { gap: 8, marginTop: 12 }]}>
          {ORDER.map((s) => (
            <View key={s} style={st.stat}>
              <Text style={[st.statV, { color: s === "pending" ? "#FBBF24" : "#fff" }]}>{d?.counts[s] || 0}</Text>
              <Text style={st.statL} numberOfLines={1}>{STATUS[s].label}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ flexDirection: "row-reverse", gap: 8, padding: 12 }}>
        {ORDER.map((s) => <Pill key={s} label={`${STATUS[s].label}${d?.counts[s] ? ` (${d.counts[s]})` : ""}`} on={status === s} color={STATUS[s].color} onPress={() => setStatus(s)} />)}
        <Pill label={`الكل (${total})`} on={!status} onPress={() => setStatus("")} />
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={CON} />}>
        {err ? <Text style={[u.hint, { textAlign: "center", marginTop: 30 }]}>{err}</Text>
          : !d ? <ActivityIndicator color={CON} style={{ marginTop: 30 }} />
          : !d.companies.length ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <MaterialCommunityIcons name="inbox-outline" size={44} color={Colors.textMuted} />
              <Text style={[u.hint, { marginTop: 8 }]}>لا توجد شركات في هذا التصنيف</Text>
            </View>
          ) : d.companies.map((c) => <AdminCard key={c.id} c={c} onChanged={load} />)}
      </ScrollView>
    </View>
  );
}

function AdminCard({ c, onChanged }: { c: Company; onChanged: () => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(c.status === "pending");
  const [note, setNote] = useState(c.admin_note || "");
  const [busy, setBusy] = useState<string | null>(null);
  const s = STATUS[c.status as Status] || STATUS.pending;

  const act = async (next: Status) => {
    if (!token) return;
    if ((next === "rejected" || next === "suspended") && note.trim().length < 3) return notify("أضف ملاحظة", "اكتب سبب الرفض أو الإيقاف ليصل للشركة");
    const msgs: Record<Status, string> = {
      active: `اعتماد «${c.name}» وإظهارها للعملاء؟`, rejected: `رفض طلب «${c.name}»؟ ستصل الملاحظة لصاحب الشركة.`,
      suspended: `إيقاف «${c.name}» مؤقتاً وإخفاؤها من الدليل؟`, pending: `إعادة «${c.name}» إلى قائمة المراجعة؟`,
    };
    if (!(await confirmAction("تأكيد", msgs[next], "تأكيد", next === "rejected" || next === "suspended"))) return;
    setBusy(next);
    try { await conApi.adminSet(token, c.id, next, note.trim() || undefined); notify("تم", `الحالة الآن: ${STATUS[next].label}`); onChanged(); }
    catch (e: any) { notify("تعذّر التحديث", e?.message); } finally { setBusy(null); }
  };
  const actions: { s: Status; label: string; icon: string }[] = (
    c.status === "pending" ? [{ s: "active", label: "اعتماد", icon: "checkmark" }, { s: "rejected", label: "رفض", icon: "close" }]
      : c.status === "active" ? [{ s: "suspended", label: "إيقاف", icon: "pause" }]
      : c.status === "suspended" ? [{ s: "active", label: "إعادة التفعيل", icon: "play" }, { s: "rejected", label: "رفض نهائي", icon: "close" }]
      : [{ s: "active", label: "اعتماد", icon: "checkmark" }, { s: "pending", label: "إعادة للمراجعة", icon: "refresh" }]
  ) as { s: Status; label: string; icon: string }[];

  return (
    <View style={[u.card, { marginBottom: 12, padding: 0, overflow: "hidden" }]}>
      <Pressable onPress={() => setOpen((o) => !o)} style={[u.rowR, { gap: 10, padding: 14 }]}>
        <View style={st.logo}>{c.logo_url ? <Image source={{ uri: c.logo_url }} style={StyleSheet.absoluteFill} /> : <MaterialCommunityIcons name="hard-hat" size={22} color={CON} />}</View>
        <View style={{ flex: 1 }}>
          <Text style={u.h} numberOfLines={1}>{c.name}</Text>
          <Text style={u.hint} numberOfLines={1}>{[c.city, (c.specialty_labels || []).slice(0, 3).join("، ")].filter(Boolean).join(" · ")}</Text>
          <Text style={u.hint}>سُجّلت {fmtD(c.created_at)}</Text>
        </View>
        <Badge label={s.label} color={s.color} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
      </Pressable>

      {open && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.divider }}>
          {!!c.tagline && <Text style={[u.hint, { marginTop: 10, color: Colors.textPrimary }]}>{c.tagline}</Text>}
          {!!c.description && <Text style={[u.hint, { marginTop: 6 }]} numberOfLines={6}>{c.description}</Text>}
          <View style={st.grid}>
            <Info icon="person-outline" label="المالك" value={c.owner_name} />
            <Info icon="call-outline" label="هاتف المالك" value={c.owner_phone} onPress={c.owner_phone ? () => Linking.openURL(`tel:${c.owner_phone}`) : undefined} />
            <Info icon="business-outline" label="هاتف الشركة" value={c.phone} onPress={c.phone ? () => Linking.openURL(`tel:${c.phone}`) : undefined} />
            <Info icon="logo-whatsapp" label="واتساب" value={c.whatsapp} onPress={c.whatsapp ? () => Linking.openURL(`https://wa.me/${c.whatsapp!.replace(/[^\d]/g, "")}`) : undefined} />
            <Info icon="document-text-outline" label="الترخيص / السجل" value={c.license_no} />
            <Info icon="calendar-outline" label="سنة التأسيس" value={c.founded_year ? String(c.founded_year) : null} />
            <Info icon="people-outline" label="عدد العاملين" value={c.team_size ? String(c.team_size) : null} />
            <Info icon="location-outline" label="العنوان" value={[c.city, c.address].filter(Boolean).join(" — ") || null} />
          </View>
          {!c.license_no && <Text style={[u.hint, { color: "#B7791F", marginTop: 6 }]}>⚠️ لم يُرفق رقم ترخيص — يُستحسن التحقق قبل الاعتماد.</Text>}
          <Text style={[u.hint, { marginTop: 6 }]}>مشاريع: {c.projects_count} · تقييمات: {c.reviews_count}{c.rating ? ` (${c.rating.toFixed(1)}★)` : ""}</Text>

          <Text style={u.label}>ملاحظة للشركة {c.status === "pending" ? "(مطلوبة عند الرفض)" : ""}</Text>
          <TextInput style={[u.input, { minHeight: 64, textAlignVertical: "top" }]} multiline value={note} onChangeText={setNote}
            placeholder="مثال: يرجى إرفاق رقم السجل التجاري" placeholderTextColor={Colors.textMuted} />

          <View style={[u.wrap, { marginTop: 12 }]}>
            {actions.map((a) => {
              const color = STATUS[a.s].color;
              const primary = a.s === "active";
              return (
                <Pressable key={a.s} disabled={!!busy} onPress={() => act(a.s)}
                  style={[primary ? [u.primary, { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: color }] : [u.ghost, { borderColor: color }], busy && { opacity: 0.6 }]}>
                  {busy === a.s ? <ActivityIndicator size="small" color={primary ? "#fff" : color} />
                    : <><Ionicons name={a.icon as any} size={16} color={primary ? "#fff" : color} /><Text style={primary ? [u.primaryT, { fontSize: 14 }] : [u.ghostT, { color }]}>{a.label}</Text></>}
                </Pressable>
              );
            })}
            <Pressable style={u.ghost} onPress={() => router.push({ pathname: "/contractor", params: { id: String(c.id) } } as any)}>
              <Ionicons name="eye-outline" size={16} color={Colors.textPrimary} /><Text style={u.ghostT}>معاينة الملف</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Info({ icon, label, value, onPress }: { icon: string; label: string; value?: string | null; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={st.info}>
      <Ionicons name={icon as any} size={15} color={CON} />
      <View style={{ flex: 1 }}>
        <Text style={st.infoL}>{label}</Text>
        <Text style={[st.infoV, onPress && { color: CON }]} numberOfLines={2}>{value || "—"}</Text>
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: Colors.bg },
  head: { backgroundColor: CON_DEEP, paddingHorizontal: 14, paddingBottom: 14, borderBottomWidth: 4, borderBottomColor: CON },
  hTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "right" },
  hSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#D1D5DB", textAlign: "right" },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  statV: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 10.5, color: "#D1D5DB" },
  logo: { width: 46, height: 46, borderRadius: 12, backgroundColor: "#FFF7ED", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 12 },
  info: { width: "48%", flexGrow: 1, flexDirection: "row-reverse", gap: 6, alignItems: "flex-start", backgroundColor: "#F9FAFB", borderRadius: 10, padding: 8 },
  infoL: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  infoV: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textPrimary, textAlign: "right" },
});
