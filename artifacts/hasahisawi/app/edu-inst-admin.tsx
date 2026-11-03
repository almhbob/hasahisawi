// مراجعة طلبات انضمام المؤسسات التعليمية (لطاقم إدارة التطبيق).
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, RefreshControl, StyleSheet, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { confirmAction, notify } from "@/lib/xplatform";
import { EDU, EDU_DEEP } from "@/lib/edu-inst";

type Row = { id: number; name: string; kind?: string; city?: string | null; description?: string | null; status: string; admin_note?: string | null; owner_name?: string | null; owner_phone?: string | null; phone?: string | null; created_at?: string };
const TABS: { key: string; label: string }[] = [
  { key: "pending", label: "قيد المراجعة" }, { key: "active", label: "مفعّلة" }, { key: "suspended", label: "موقوفة" }, { key: "rejected", label: "مرفوضة" },
];

export default function EduInstAdmin() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${getApiUrl()}/api/admin/edu/institutions?status=${tab}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "تعذّر التحميل");
      setRows(j.institutions || []);
    } catch (e: any) { setErr(e.message); setRows([]); }
    setLoading(false);
  }, [tab, token]);
  useEffect(() => { load(); }, [load]);

  const act = async (row: Row, status: string, label: string) => {
    const note = (notes[row.id] || "").trim();
    if ((status === "rejected" || status === "suspended") && note.length < 3) { notify("اكتب السبب", "يصل السبب لمدير المؤسسة"); return; }
    if (!(await confirmAction(label, `${label}: ${row.name}؟`))) return;
    try {
      const r = await fetch(`${getApiUrl()}/api/admin/edu/institutions/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ status, note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "تعذّر الحفظ");
      notify("تم", label); load();
    } catch (e: any) { notify("خطأ", e.message); }
  };

  const actions = (s: string): [string, string, string][] =>
    s === "pending" ? [["active", "قبول وتفعيل", "#15803D"], ["rejected", "رفض", "#B91C1C"]]
    : s === "active" ? [["suspended", "إيقاف", "#B45309"]]
    : s === "suspended" ? [["active", "إعادة تفعيل", "#15803D"], ["rejected", "رفض نهائي", "#B91C1C"]]
    : [["active", "قبول", "#15803D"], ["pending", "إعادة للمراجعة", "#475569"]];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={[st.head, { paddingTop: insets.top + 8 }]}>
        <View style={st.row}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/admin-requests" as any))} hitSlop={10}><Ionicons name="chevron-forward" size={24} color="#fff" /></Pressable>
          <Text style={st.title}>المؤسسات التعليمية</Text>
          <Ionicons name="school" size={22} color="#fff" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12, flexDirection: "row-reverse" }}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[st.chip, tab === t.key && st.chipOn]}>
              <Text style={[st.chipT, tab === t.key && { color: EDU_DEEP }]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        {loading && <ActivityIndicator color={EDU} style={{ marginTop: 30 }} />}
        {!!err && <Text style={st.err}>{err}</Text>}
        {!loading && !err && !rows.length && <Text style={st.empty}>لا توجد مؤسسات في هذه القائمة</Text>}
        {rows.map((r) => (
          <View key={r.id} style={st.card}>
            <Text style={st.name}>{r.name}</Text>
            <Text style={st.meta}>{[r.kind, r.city].filter(Boolean).join(" · ")}</Text>
            {!!r.description && <Text style={st.desc}>{r.description}</Text>}
            <View style={[st.row, { justifyContent: "flex-start", gap: 6 }]}>
              <Ionicons name="person-outline" size={15} color={Colors.textSecondary} />
              <Text style={st.meta}>{r.owner_name || "—"}</Text>
              {!!(r.owner_phone || r.phone) && (
                <Pressable onPress={() => Linking.openURL(`tel:${r.owner_phone || r.phone}`)}><Text style={[st.meta, { color: EDU, textDecorationLine: "underline" }]}>{r.owner_phone || r.phone}</Text></Pressable>
              )}
            </View>
            {!!r.admin_note && <Text style={st.note}>ملاحظة سابقة: {r.admin_note}</Text>}
            <TextInput value={notes[r.id] || ""} onChangeText={(v) => setNotes((n) => ({ ...n, [r.id]: v }))} placeholder="ملاحظة للمؤسسة (مطلوبة عند الرفض أو الإيقاف)" placeholderTextColor={Colors.textSecondary} style={st.input} multiline />
            <View style={[st.row, { gap: 8, justifyContent: "flex-start", flexWrap: "wrap" }]}>
              {actions(r.status).map(([s, label, color]) => (
                <Pressable key={s} onPress={() => act(r, s, label)} style={[st.btn, { backgroundColor: color }]}><Text style={st.btnT}>{label}</Text></Pressable>
              ))}
              <Pressable onPress={() => router.push({ pathname: "/edu-institution", params: { id: String(r.id) } } as any)} style={[st.btn, { backgroundColor: "transparent", borderWidth: 1, borderColor: EDU }]}><Text style={[st.btnT, { color: EDU }]}>معاينة</Text></Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  head: { backgroundColor: EDU_DEEP, paddingHorizontal: 16, paddingBottom: 14 },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)" },
  chipOn: { backgroundColor: "#fff" },
  chipT: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#fff" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: Colors.divider },
  name: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right", lineHeight: 22 },
  note: { fontFamily: "Cairo_400Regular", fontSize: 12.5, color: "#B45309", textAlign: "right" },
  input: { borderWidth: 1, borderColor: Colors.divider, borderRadius: 10, padding: 10, minHeight: 44, fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  btnT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  err: { fontFamily: "Cairo_600SemiBold", color: "#B91C1C", textAlign: "center", marginTop: 20 },
  empty: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, textAlign: "center", marginTop: 30 },
});
