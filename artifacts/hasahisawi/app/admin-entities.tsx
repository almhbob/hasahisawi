/** 🚫 الإشراف على المنشآت: إيقاف للمخالفة، إعادة تفعيل، وحذف نهائي (المطاعم، المتاجر، المحطات، الأندية، المؤسسات) */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, notify } from "@/lib/xplatform";
import { neu, NeuButton, NeuInset, NeuRaised } from "@/components/auth/neu";
import { fmtResume, type EntityType } from "@/components/EntityNotice";

type Item = { id: number; name: string; suspended: boolean; suspend_reason?: string | null; paused: boolean; pause_message?: string | null; resume_at?: string | null };
const TYPES: { k: EntityType; label: string; icon: any }[] = [
  { k: "food", label: "المطاعم", icon: "restaurant" }, { k: "store", label: "المتاجر", icon: "storefront" },
  { k: "fuel", label: "الوقود والغاز", icon: "speedometer" }, { k: "org", label: "المنظمات", icon: "business" },
  { k: "community", label: "الجاليات", icon: "people" }, { k: "club", label: "الأندية", icon: "football" },
];
const REASONS = ["بيع منتجات مخالفة أو مقلدة", "شكاوى متكررة من العملاء", "معلومات مضللة أو احتيال", "محتوى مسيء", "عدم الالتزام بالأسعار المعلنة"];

export default function AdminEntities() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const api = getApiUrl();
  const [type, setType] = useState<EntityType>("food");
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Item | null>(null);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = useCallback(async () => {
    setItems(null);
    try {
      const r = await fetch(`${api}/api/admin/entities?type=${type}&q=${encodeURIComponent(q.trim())}`, { headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setItems(d.items);
    } catch (e: any) { notify("تعذّر التحميل", e?.message); setItems([]); }
  }, [type, q, token]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const reactivate = async (it: Item) => {
    const r = await fetch(`${api}/api/admin/entity-status/${type}/${it.id}`, { method: "PUT", headers, body: JSON.stringify({ suspended: false }) });
    if (!r.ok) return notify("خطأ", (await r.json().catch(() => ({}))).error);
    load();
  };
  const remove = async (it: Item) => {
    if (!(await confirmAction("حذف نهائي", `حذف «${it.name}» وكل بياناته نهائياً؟ لا يمكن التراجع. الإيقاف أفضل إن كانت المخالفة قابلة للإصلاح.`, "حذف نهائياً", true))) return;
    const r = await fetch(`${api}/api/admin/entity/${type}/${it.id}`, { method: "DELETE", headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return notify("تعذّر الحذف", d.error);
    notify("تم الحذف", d.deleted); load();
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>الإشراف على المنشآت</Text>
          <Text style={s.sub}>إيقاف المخالف وإعادة التفعيل والحذف</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row-reverse" }}>
        {TYPES.map(t => (
          <TouchableOpacity key={t.k} onPress={() => setType(t.k)} style={[s.chip, type === t.k && s.chipOn]}>
            <Ionicons name={t.icon} size={15} color={type === t.k ? "#fff" : "#B42323"} /><Text style={[s.chipText, type === t.k && { color: "#fff" }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 16 }}>
        <NeuInset radius={14} style={s.search}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="ابحث بالاسم" placeholderTextColor={Colors.textMuted} style={s.input} />
        </NeuInset>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        {items === null ? <ActivityIndicator color="#B42323" style={{ marginTop: 30 }} /> : items.length === 0 ? <Text style={[s.muted, { textAlign: "center", padding: 30 }]}>لا توجد نتائج</Text> : items.map((it, i) => (
          <Animated.View key={it.id} entering={FadeInDown.delay(Math.min(i, 8) * 30)}>
            <NeuRaised radius={18} depth={5} style={[s.card, it.suspended && { borderWidth: 1.5, borderColor: "#F2A3A3" }]}>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{it.name}</Text>
                  {it.suspended ? <Text style={[s.muted, { color: "#B42323" }]}>موقوفة: {it.suspend_reason}</Text>
                    : it.paused ? <Text style={[s.muted, { color: "#946B00" }]}>متوقفة مؤقتاً بقرار صاحبها · تعود {fmtResume(it.resume_at)}</Text>
                    : <Text style={[s.muted, { color: "#006B4A" }]}>نشطة</Text>}
                </View>
                <View style={[s.dot, { backgroundColor: it.suspended ? "#D93636" : it.paused ? "#E8A900" : "#00966A" }]} />
              </View>
              <View style={s.row}>
                {it.suspended ? (
                  <TouchableOpacity onPress={() => reactivate(it)} style={[s.btn, { backgroundColor: "#00966A" }]}><Ionicons name="play-circle" size={15} color="#fff" /><Text style={s.btnText}>إعادة التفعيل</Text></TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setTarget(it)} style={[s.btn, { backgroundColor: "#E8A900" }]}><Ionicons name="pause-circle" size={15} color="#fff" /><Text style={s.btnText}>إيقاف لمخالفة</Text></TouchableOpacity>
                )}
                {user?.role === "admin" && (
                  <TouchableOpacity onPress={() => remove(it)} style={[s.btn, { borderWidth: 1, borderColor: "#EF444466", flex: 0.7 }]}><Ionicons name="trash-outline" size={15} color="#D93636" /><Text style={[s.btnText, { color: "#D93636" }]}>حذف</Text></TouchableOpacity>
                )}
              </View>
            </NeuRaised>
          </Animated.View>
        ))}
      </ScrollView>
      <SuspendSheet item={target} type={type} onClose={() => setTarget(null)} onDone={() => { setTarget(null); load(); }} api={api} headers={headers} />
    </View>
  );
}

function SuspendSheet({ item, type, onClose, onDone, api, headers }: { item: Item | null; type: EntityType; onClose: () => void; onDone: () => void; api: string; headers: any }) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setReason(""), [item?.id]);
  if (!item) return null;
  const go = async () => {
    setBusy(true);
    const r = await fetch(`${api}/api/admin/entity-status/${type}/${item.id}`, { method: "PUT", headers, body: JSON.stringify({ suspended: true, reason }) });
    setBusy(false);
    if (!r.ok) return notify("خطأ", (await r.json().catch(() => ({}))).error);
    notify("تم الإيقاف", "أُخفيت المنشأة عن الجمهور ويرى صاحبها سبب الإيقاف.");
    onDone();
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={s.title}>إيقاف «{item.name}»</Text>
          <Text style={s.muted}>تُخفى المنشأة من القوائم ويرى صاحبها السبب ليعالج المخالفة.</Text>
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
            {REASONS.map(r => <TouchableOpacity key={r} onPress={() => setReason(r)} style={[s.rChip, reason === r && { backgroundColor: "#B42323", borderColor: "#B42323" }]}><Text style={[s.rText, reason === r && { color: "#fff" }]}>{r}</Text></TouchableOpacity>)}
          </View>
          <NeuInset radius={12}><TextInput value={reason} onChangeText={setReason} multiline placeholder="سبب الإيقاف (يظهر لصاحب المنشأة)" placeholderTextColor={Colors.textSubtle} style={[s.input, { minHeight: 70, textAlignVertical: "top", paddingHorizontal: 12 }]} /></NeuInset>
          <NeuButton label="تأكيد الإيقاف" icon="ban" onPress={go} loading={busy} disabled={reason.trim().length < 5} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: "#F2A3A3", backgroundColor: Colors.cardBg },
  chipOn: { backgroundColor: "#B42323", borderColor: "#B42323" },
  chipText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#B42323" },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  input: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  card: { padding: 14, gap: 10 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  btn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: 12 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#fff" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: neu.base, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, gap: 10, width: "100%", maxWidth: 620, alignSelf: "center" },
  rChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  rText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
});
