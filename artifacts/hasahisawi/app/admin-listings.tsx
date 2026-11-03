// إدارة المحتوى العام — لإدارة التطبيق: تصفح أي قسم (مستشفيات، أطباء، متاجر، مطاعم، منظمات، نقابات…)
// والبحث فيه وحذف أي عنصر وهمي أو مخالف من مكان واحد، مع تنظيف البيانات التجريبية بضغطة.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { notify, confirmAction } from "@/lib/xplatform";

type Kind = { key: string; label: string; group: string };
type Item = { id: number; name: string; sub?: string | null; phone?: string | null; created_at?: string; active?: boolean; status?: string };

export default function AdminListings() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [kind, setKind] = useState<string>("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [note, setNote] = useState("");
  const [q, setQ] = useState(""); const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const api = getApiUrl();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${api}/api/admin/listings${kind ? `?kind=${kind}&q=${encodeURIComponent(query)}` : ""}`, { headers }).then((x) => x.json()).catch(() => null);
    if (!r) return;
    setKinds(r.kinds || []); setItems(kind ? r.items || [] : null); setNote(r.note || "");
  }, [kind, query, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const del = async (it: Item) => {
    if (!(await confirmAction("حذف نهائي", `حذف «${it.name}»؟ لا يمكن التراجع.`, "حذف", true))) return;
    const r = await fetch(`${api}/api/admin/listings/${kind}/${it.id}`, { method: "DELETE", headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return notify("تعذّر الحذف", d.error);
    setItems((xs) => (xs || []).filter((x) => x.id !== it.id));
  };
  const purge = async () => {
    if (!(await confirmAction("تنظيف البيانات التجريبية", "يحذف السجلات التجريبية القديمة (أرقام هواتف وهمية وأسماء البذر) فقط، ولا يمسّ بيانات المستخدمين.", "تنظيف"))) return;
    setBusy(true);
    try {
      const r = await fetch(`${api}/api/admin/purge-demo-data`, { method: "POST", headers }).then((x) => x.json());
      const n = Object.values(r.removed || {}).reduce((a: number, b: any) => a + Number(b || 0), 0);
      notify("تم التنظيف", `حُذف ${n} سجلاً تجريبياً`); load();
    } catch { notify("تعذّر", "حاول لاحقاً"); } finally { setBusy(false); }
  };

  if (user?.role !== "admin") return <View style={st.center}><Text style={st.muted}>لإدارة التطبيق فقط</Text></View>;
  const groups = [...new Set(kinds.map((k) => k.group))];
  const cur = kinds.find((k) => k.key === kind);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => (kind ? (setKind(""), setQ("")) : router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
        </Pressable>
        <Text style={st.barTitle}>{cur ? cur.label : "إدارة المحتوى العام"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {!kind ? (
          <>
            <Pressable onPress={purge} disabled={busy} style={st.purge}>
              {busy ? <ActivityIndicator color="#B42318" /> : <Ionicons name="sparkles" size={20} color="#B42318" />}
              <View style={{ flex: 1 }}>
                <Text style={st.purgeT}>تنظيف البيانات التجريبية</Text>
                <Text style={st.muted}>المستشفيات والمتاجر والأطباء والمحامون… الوهميون من النسخ القديمة</Text>
              </View>
            </Pressable>
            {groups.map((g) => (
              <View key={g} style={{ marginTop: 16 }}>
                <Text style={st.group}>{g}</Text>
                <View style={st.grid}>
                  {kinds.filter((k) => k.group === g).map((k) => (
                    <Pressable key={k.key} onPress={() => { setKind(k.key); setItems(null); }} style={st.tile}>
                      <Text style={st.tileT}>{k.label}</Text>
                      <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </>
        ) : (
          <>
            <View style={st.search}>
              <Ionicons name="search" size={17} color={Colors.textMuted} />
              <TextInput value={q} onChangeText={setQ} placeholder="ابحث بالاسم أو الهاتف" placeholderTextColor={Colors.textMuted} style={st.searchIn} />
            </View>
            {kind === "booking_entities" && <AddEntity onAdded={load} />}
            {!!note && <Text style={[st.muted, { marginTop: 10 }]}>{note}</Text>}
            {!items ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} /> : (
              <>
                <Text style={[st.muted, { marginTop: 10 }]}>{items.length} عنصر</Text>
                {items.map((it) => (
                  <View key={it.id} style={st.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.name} numberOfLines={1}>{it.name || "—"}</Text>
                      <Text style={st.muted} numberOfLines={1}>
                        #{it.id}{it.sub ? ` · ${it.sub}` : ""}{it.phone ? ` · ${it.phone}` : ""}
                        {it.active === false ? " · معطّل" : ""}{it.status ? ` · ${it.status}` : ""}
                      </Text>
                    </View>
                    <Pressable onPress={() => del(it)} style={st.delBtn} accessibilityLabel={`حذف ${it.name}`}>
                      <Ionicons name="trash-outline" size={18} color="#B42318" />
                    </Pressable>
                  </View>
                ))}
                {!items.length && <Text style={[st.muted, { textAlign: "center", marginTop: 24 }]}>لا عناصر</Text>}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// إضافة جهة لحجز المواعيد (تظهر فوراً في شاشة الحجز)
function AddEntity({ onAdded }: { onAdded: () => void }) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ category: "health", name: "", subcategory: "مستشفى", address: "", phone: "", services: "", work_days: "السبت - الخميس", hours: "" });
  const save = async () => {
    const r = await fetch(`${getApiUrl()}/api/admin/appointments/entities`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(f) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return notify("تعذّر", d.error);
    notify("أُضيفت الجهة", f.name); setF({ ...f, name: "", address: "", phone: "", services: "" }); setOpen(false); onAdded();
  };
  if (!open) return <Pressable onPress={() => setOpen(true)} style={[st.tile, { marginTop: 10, borderStyle: "dashed", borderColor: Colors.primary }]}><Text style={[st.tileT, { color: Colors.primary }]}>+ إضافة جهة حجز موثّقة</Text></Pressable>;
  const In = (k: keyof typeof f, ph: string) => <TextInput value={f[k]} onChangeText={(t) => setF({ ...f, [k]: t })} placeholder={ph} placeholderTextColor={Colors.textMuted} style={[st.search, st.searchIn, { marginTop: 8, height: 44 }]} />;
  return (
    <View style={{ marginTop: 10, padding: 12, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider }}>
      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
        {[["health", "صحية"], ["government", "حكومية"]].map(([k, l]) => (
          <Pressable key={k} onPress={() => setF({ ...f, category: k, subcategory: k === "health" ? "مستشفى" : "محلية" })} style={[st.tile, { flex: 1, justifyContent: "center", padding: 10 }, f.category === k && { borderColor: Colors.primary, backgroundColor: Colors.primary + "12" }]}><Text style={st.tileT}>{l}</Text></Pressable>
        ))}
      </View>
      {In("name", "اسم الجهة *")}{In("subcategory", "النوع (مستشفى، عيادة، مركز صحي، سجل مدني…)")}{In("address", "العنوان")}{In("phone", "هاتف الجهة")}
      {In("services", "الخدمات مفصولة بفاصلة")}{In("work_days", "أيام العمل")}{In("hours", "ساعات العمل")}
      <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 10 }}>
        <Pressable onPress={save} style={[st.tile, { flex: 1, justifyContent: "center", backgroundColor: Colors.primary }]}><Text style={[st.tileT, { color: "#fff" }]}>حفظ</Text></Pressable>
        <Pressable onPress={() => setOpen(false)} style={[st.tile, { justifyContent: "center", paddingHorizontal: 18 }]}><Text style={st.tileT}>إلغاء</Text></Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  bar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  purge: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: "#B4231833", backgroundColor: "#B423180A" },
  purgeT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#B42318", textAlign: "right" },
  group: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary, textAlign: "right", marginBottom: 8 },
  grid: { gap: 8 },
  tile: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  tileT: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, height: 44 },
  searchIn: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 0 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, marginTop: 8 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  delBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#B4231812", alignItems: "center", justifyContent: "center" },
});
