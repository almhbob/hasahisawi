// إدارة التطبيق: اعتماد مهام التطوع الكبرى من المنظمات واتحاد الطلاب + السقف الشهري لنقاط الجهات
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { notify } from "@/lib/xplatform";

const GREEN = "#00966A";
const GOLD = "#E8A900";
async function api<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${getApiUrl()}/api${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any)?.error || `خطأ (${r.status})`);
  return j as T;
}

export default function EntityTasksReview({ token, isAdmin, onCount }: { token: string; isAdmin: boolean; onCount?: (n: number) => void }) {
  const [state, setState] = useState<"pending" | "approved" | "rejected">("pending");
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [cap, setCap] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const load = useCallback(async () => {
    try { const r = await api(token, `/admin/volunteer/entity-tasks?approval=${state}`); setTasks(r.tasks); setCap(String(r.cap)); if (state === "pending") onCount?.(r.tasks.length); }
    catch (e: any) { notify("تعذّر", e.message); setTasks([]); }
  }, [token, state, onCount]);
  useEffect(() => { load(); }, [load]);
  const review = async (t: any, approve: boolean) => {
    try { await api(token, `/admin/volunteer/entity-tasks/${t.id}/review`, { method: "POST", body: JSON.stringify({ approve, note: notes[t.id] }) }); notify(approve ? "اعتُمدت ونُشرت ✅" : "رُفضت المهمة"); load(); }
    catch (e: any) { notify("تعذّر", e.message); }
  };
  const saveCap = async () => {
    try { const r = await api(token, `/admin/volunteer/entity-cap`, { method: "PUT", body: JSON.stringify({ cap: Number(cap) }) }); notify("حُفظ السقف", `${r.cap} نقطة شهرياً لكل جهة`); }
    catch (e: any) { notify("تعذّر", e.message); }
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={st.capBox}>
        <Text style={st.h}>سقف النقاط الشهري لكل جهة</Text>
        <Text style={st.muted}>تمنح المنظمات واتحاد الطلاب نقاطاً ضمن نطاق حجم المهمة وحتى هذا السقف شهرياً. المهام الكبرى (١٠٠–٢٠٠ نقطة) تنتظر اعتمادك.</Text>
        <View style={st.row}>
          <TextInput value={cap} onChangeText={(v) => setCap(v.replace(/\D/g, ""))} editable={isAdmin} keyboardType="number-pad" style={[st.input, { flex: 1 }]} accessibilityLabel="السقف الشهري" />
          {isAdmin ? <Pressable onPress={saveCap} style={st.btn}><Text style={st.btnT}>حفظ</Text></Pressable> : null}
        </View>
      </View>
      <View style={st.seg}>
        {([["pending", "بانتظار الاعتماد"], ["approved", "المعتمدة"], ["rejected", "المرفوضة"]] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setState(k)} style={[st.segBtn, state === k && { backgroundColor: GREEN }]}><Text style={[st.segT, state === k && { color: "#fff" }]}>{l}</Text></Pressable>
        ))}
      </View>
      {tasks === null ? <ActivityIndicator color={GREEN} /> : !tasks.length ? <Text style={[st.muted, { textAlign: "center", padding: 20 }]}>لا توجد مهام هنا.</Text> : tasks.map((t) => (
        <View key={t.id} style={st.card}>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>{t.title}</Text>
              <Text style={st.muted}>{t.owner_kind === "union" ? "اتحاد الطلاب" : t.organizer} · مهمة {t.size_label || ""} · أنشأها {t.created_by_name || "—"}</Text>
            </View>
            <View style={st.pts}><Text style={st.ptsN}>{t.points}</Text><Text style={st.ptsL}>نقطة</Text></View>
          </View>
          {t.description ? <Text style={st.body} numberOfLines={5}>{t.description}</Text> : null}
          {state === "pending" ? (
            <>
              <TextInput value={notes[t.id] || ""} onChangeText={(v) => setNotes({ ...notes, [t.id]: v })} placeholder="ملاحظة (مطلوبة عند الرفض)" placeholderTextColor={Colors.textMuted} style={st.input} />
              <View style={st.row}>
                <Pressable onPress={() => review(t, true)} style={[st.btn, { flex: 1 }]}><Ionicons name="checkmark" size={16} color="#fff" /><Text style={st.btnT}>اعتماد ونشر</Text></Pressable>
                <Pressable onPress={() => review(t, false)} style={[st.btn, { flex: 1, backgroundColor: "#C628281A" }]}><Text style={[st.btnT, { color: "#C62828" }]}>رفض</Text></Pressable>
              </View>
            </>
          ) : t.review_note ? <Text style={st.muted}>ملاحظة: {t.review_note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  body: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 21 },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 19 },
  capBox: { backgroundColor: "#FFFBEF", borderRadius: 18, padding: 12, gap: 8, borderWidth: 1, borderColor: GOLD + "60" },
  input: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 9 },
  btn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  btnT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  seg: { flexDirection: "row-reverse", gap: 6, padding: 4, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  segT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 12, gap: 8, borderWidth: 1, borderColor: Colors.divider },
  pts: { alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: GOLD + "26" },
  ptsN: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#7A5900" },
  ptsL: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: "#7A5900", marginTop: -4 },
});
