// لوحة المحكّم: مشاركات مجهولة الهوية (رمز فقط)، تقييم كل معيار من 0 إلى 10 بخطوة نصف درجة، وملاحظة.
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/xplatform";
import { litApi, WINE, GOLD, INK, PAPER, type Criterion, type JudgeEntry } from "@/lib/lit";
import { LitBody } from "@/components/lit/ui";
import { stripMarkup } from "@/lib/lit-markup";
import { Empty, Pill, ithraaStyles as u } from "@/components/ithraa/ui";

export default function JudgeScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ criteria: Criterion[]; entries: JudgeEntry[]; phase: string } | null>(null);
  const [cur, setCur] = useState<number | null>(null);
  const [filter, setFilter] = useState<"todo" | "done" | "all">("todo");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try { setData(await litApi.judgeEntries(token, Number(id))); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
  }, [token, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const entry = data?.entries.find((e) => e.id === cur) || null;
  const total = useMemo(() => (data?.criteria ?? []).reduce((a, k) => a + ((scores[k.key] ?? 0) / 10) * k.weight, 0), [scores, data]);
  const openEntry = (e: JudgeEntry) => {
    setCur(e.id);
    setScores(e.my_scores || Object.fromEntries((data?.criteria ?? []).map((k) => [k.key, 5])));
    setComment(e.my_comment || "");
  };
  const save = async (next: boolean) => {
    if (!token || !entry || !data) return;
    setSaving(true);
    try {
      await litApi.score(token, Number(id), entry.id, scores, comment.trim());
      await load();
      const list = data.entries;
      const idx = list.findIndex((x) => x.id === entry.id);
      const n = next ? list.slice(idx + 1).find((x) => x.my_total == null) || list.find((x) => x.my_total == null && x.id !== entry.id) : null;
      if (n) openEntry(n); else { setCur(null); notify("حُفظ التقييم", next ? "أنهيت كل المشاركات — شكراً لك" : ""); }
    } catch (e: any) { notify("تعذّر الحفظ", e?.message); } finally { setSaving(false); }
  };

  if (!data) return <View style={st.center}><ActivityIndicator color={WINE} /></View>;
  const done = data.entries.filter((e) => e.my_total != null).length;
  const shown = data.entries.filter((e) => filter === "all" || (filter === "done" ? e.my_total != null : e.my_total == null));
  const back = () => { if (cur) setCur(null); else if (router.canGoBack()) router.back(); else router.replace({ pathname: "/lit-contest", params: { id } } as any); };

  return (
    <View style={{ flex: 1, backgroundColor: entry ? PAPER : Colors.bg }}>
      <View style={[st.bar, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={back} style={st.barBtn} hitSlop={8} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color={INK} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={st.barTitle}>{entry ? `مشاركة ${entry.code}` : "لوحة التحكيم"}</Text>
          <Text style={st.barSub}>{done} من {data.entries.length} مُقيَّمة</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <View style={st.progress}><View style={[st.progressFill, { width: `${data.entries.length ? (done / data.entries.length) * 100 : 0}%` }]} /></View>

      {!entry ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}>
          <View style={[u.card, { flexDirection: "row-reverse", gap: 10, alignItems: "center", marginBottom: 12 }]}>
            <Ionicons name="eye-off" size={22} color={WINE} />
            <Text style={[u.hint, { flex: 1, color: Colors.textSecondary }]}>المشاركات مجهولة الهوية. قيّم النص وحده، وإن عرفت كاتبه فأبلغ المشرف لتتنحّى عن تقييمه.</Text>
          </View>
          <View style={[u.rowR, { gap: 6, marginBottom: 12 }]}>
            <Pill label={`بانتظار التقييم (${data.entries.length - done})`} on={filter === "todo"} onPress={() => setFilter("todo")} color={WINE} />
            <Pill label={`قيّمتها (${done})`} on={filter === "done"} onPress={() => setFilter("done")} color={WINE} />
            <Pill label="الكل" on={filter === "all"} onPress={() => setFilter("all")} color={WINE} />
          </View>
          {shown.map((e) => (
            <Pressable key={e.id} onPress={() => openEntry(e)} style={[u.card, { marginBottom: 10 }]}>
              <View style={[u.rowR, { justifyContent: "space-between" }]}>
                <Text style={st.code}>{e.code}</Text>
                <Text style={[u.hint, { color: WINE }]}>{e.category_label}</Text>
              </View>
              <Text style={st.eTitle}>{e.title}</Text>
              <View style={[u.rowR, { justifyContent: "space-between", marginTop: 4 }]}>
                <Text style={u.hint}>{stripMarkup(e.body).split(/\s+/).length} كلمة</Text>
                {e.my_total != null ? <Text style={st.myTotal}>{e.my_total} / 100</Text> : <Text style={[u.hint, { color: "#B7791F" }]}>لم تُقيَّم</Text>}
              </View>
            </Pressable>
          ))}
          {!shown.length && <Empty icon="checkmark-done-circle-outline" title={filter === "todo" ? "أنهيت كل المشاركات" : "لا شيء هنا"} />}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <Text style={st.cat}>{entry.category_label}</Text>
          <Text style={st.title}>{entry.title}</Text>
          <View style={st.orn}><View style={st.line} /><Ionicons name="leaf" size={13} color={GOLD} /><View style={st.line} /></View>
          <LitBody text={{ form: entry.category, group: entry.group, body: entry.body }} size={17} />

          <View style={st.panel}>
            <View style={[u.rowR, { justifyContent: "space-between" }]}>
              <Text style={st.panelT}>التقييم</Text>
              <Text style={st.total}>{Math.round(total * 10) / 10}<Text style={st.totalOf}> / 100</Text></Text>
            </View>
            {data.criteria.map((k) => (
              <View key={k.key} style={{ marginTop: 12 }}>
                <View style={[u.rowR, { justifyContent: "space-between" }]}>
                  <Text style={st.crit}>{k.label} <Text style={st.critW}>({k.weight}%)</Text></Text>
                  <Text style={st.val}>{scores[k.key] ?? 0}</Text>
                </View>
                <View style={st.scale}>
                  {Array.from({ length: 11 }, (_, n) => (
                    <Pressable key={n} onPress={() => setScores({ ...scores, [k.key]: n })} style={[st.dot, (scores[k.key] ?? 0) >= n && { backgroundColor: WINE, borderColor: WINE }]} accessibilityLabel={`${k.label} ${n}`}>
                      <Text style={[st.dotT, (scores[k.key] ?? 0) >= n && { color: "#fff" }]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={[u.rowR, { gap: 6, justifyContent: "flex-start", marginTop: 4 }]}>
                  <Pressable onPress={() => setScores({ ...scores, [k.key]: Math.max(0, (scores[k.key] ?? 0) - 0.5) })} style={st.half}><Text style={st.halfT}>−½</Text></Pressable>
                  <Pressable onPress={() => setScores({ ...scores, [k.key]: Math.min(10, (scores[k.key] ?? 0) + 0.5) })} style={st.half}><Text style={st.halfT}>+½</Text></Pressable>
                </View>
              </View>
            ))}
            <Text style={[u.label, { marginTop: 14 }]}>ملاحظات المحكّم (سرية للمشرف)</Text>
            <TextInput value={comment} onChangeText={setComment} multiline maxLength={600} placeholder="نقاط القوة والضعف…" placeholderTextColor={Colors.textMuted} style={[u.input, { minHeight: 70, textAlignVertical: "top" }]} />
            <View style={[u.rowR, { gap: 8, marginTop: 12 }]}>
              <Pressable onPress={() => save(true)} disabled={saving} style={[u.primaryBtn, { flex: 1, backgroundColor: WINE }]}>
                {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}<Text style={u.primaryText}>حفظ والتالي</Text>
              </Pressable>
              <Pressable onPress={() => save(false)} disabled={saving} style={[u.ghostBtn, { paddingHorizontal: 16 }]}><Text style={u.ghostText}>حفظ</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  bar: { flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, backgroundColor: Colors.cardBg, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  barBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  barTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: INK, textAlign: "center" },
  barSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  progress: { height: 4, backgroundColor: Colors.divider, transform: [{ scaleX: -1 }] },
  progressFill: { height: 4, backgroundColor: GOLD },
  code: { fontFamily: "Cairo_700Bold", fontSize: 13, color: WINE, backgroundColor: WINE + "10", paddingHorizontal: 8, borderRadius: 8, overflow: "hidden", letterSpacing: 1 },
  eTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", marginTop: 6 },
  myTotal: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#0E8A5F" },
  cat: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: WINE, textAlign: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 24, color: INK, textAlign: "center", lineHeight: 36 },
  orn: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14, justifyContent: "center" },
  line: { height: 1, width: 60, backgroundColor: GOLD + "88" },
  panel: { marginTop: 24, backgroundColor: "#fff", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#EFE5D2" },
  panelT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: INK },
  total: { fontFamily: "Cairo_700Bold", fontSize: 26, color: WINE },
  totalOf: { fontSize: 13, color: Colors.textMuted },
  crit: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: INK },
  critW: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  val: { fontFamily: "Cairo_700Bold", fontSize: 15, color: WINE },
  scale: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 6 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: Colors.divider, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  dotT: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },
  half: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: Colors.divider },
  halfT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
});
