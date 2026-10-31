// حاسبة درجات الشهادة — كل مادة من 100، مع المسارات السودانية، النسبة على أفضل المواد،
// حساب ما تحتاجه للوصول لنسبة مستهدفة، وحفظ تلقائي وطباعة كشف أنيق.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Share } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { paperDocument, printPaper, esc } from "@/lib/paper";

type Track = "sci" | "lit" | "mid" | "custom";
type Sub = { id: string; name: string; score: string };

const PRESETS: Record<Exclude<Track, "custom">, { label: string; subjects: string[] }> = {
  sci: { label: "الثانوي — علمي", subjects: ["التربية الإسلامية", "اللغة العربية", "اللغة الإنجليزية", "الرياضيات المتخصصة", "الفيزياء", "الكيمياء", "الأحياء", "الحاسوب"] },
  lit: { label: "الثانوي — أدبي", subjects: ["التربية الإسلامية", "اللغة العربية", "اللغة الإنجليزية", "الرياضيات الأساسية", "التاريخ", "الجغرافيا", "الأدب الإنجليزي", "الدراسات الإسلامية الإضافية"] },
  mid: { label: "المرحلة المتوسطة", subjects: ["التربية الإسلامية", "اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم", "الدراسات الاجتماعية", "الحاسوب"] },
};
const KEY = "edu_shahada_v2";
const MAX = 100;

export function gradeOf(v: number) {
  if (v >= 90) return { t: "ممتاز", c: "#0E8A5F" };
  if (v >= 80) return { t: "جيد جداً", c: "#2F7D6D" };
  if (v >= 70) return { t: "جيد", c: "#1D66D4" };
  if (v >= 60) return { t: "متوسط", c: "#946B00" };
  if (v >= 50) return { t: "مقبول", c: "#C2580A" };
  return { t: "دون النجاح", c: "#D93636" };
}

const mk = (names: string[]): Sub[] => names.map((name, i) => ({ id: `${Date.now()}-${i}`, name, score: "" }));

export default function ShahadaCalculator() {
  const [track, setTrack] = useState<Track>("sci");
  const [subs, setSubs] = useState<Sub[]>(mk(PRESETS.sci.subjects));
  const [best, setBest] = useState<0 | 7 | 8>(0);
  const [target, setTarget] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      try { if (raw) { const d = JSON.parse(raw); setTrack(d.track); setSubs(d.subs); setBest(d.best ?? 0); setTarget(d.target ?? ""); } } catch {}
      setLoaded(true);
    });
  }, []);
  useEffect(() => { if (loaded) AsyncStorage.setItem(KEY, JSON.stringify({ track, subs, best, target })).catch(() => {}); }, [loaded, track, subs, best, target]);

  const pickTrack = (t: Track) => {
    setTrack(t);
    if (t !== "custom") setSubs(mk(PRESETS[t].subjects));
  };
  const setScore = (id: string, v: string) => {
    const clean = v.replace(/[^\d.٠-٩]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).slice(0, 5);
    setSubs((s) => s.map((x) => (x.id === id ? { ...x, score: clean } : x)));
  };

  const r = useMemo(() => {
    const vals = subs.map((s) => ({ ...s, v: s.score === "" ? null : Number(s.score) }));
    const invalid = vals.filter((x) => x.v !== null && (isNaN(x.v) || x.v < 0 || x.v > MAX));
    const filled = vals.filter((x) => x.v !== null && !isNaN(x.v!) && x.v! >= 0 && x.v! <= MAX) as (Sub & { v: number })[];
    const counted = best && filled.length > best ? [...filled].sort((a, b) => b.v - a.v).slice(0, best) : filled;
    const total = counted.reduce((t, x) => t + x.v, 0);
    const maxTotal = counted.length * MAX;
    const pct = maxTotal ? (total / maxTotal) * 100 : 0;
    const failed = filled.filter((x) => x.v < 50);
    // ما تحتاجه في المواد غير المُدخلة للوصول للنسبة المستهدفة
    const tgt = Number(target);
    const remaining = vals.filter((x) => x.v === null).length;
    let need: number | null = null;
    if (tgt > 0 && tgt <= 100 && remaining > 0 && !best) {
      need = ((tgt / 100) * subs.length * MAX - filled.reduce((t, x) => t + x.v, 0)) / remaining;
    }
    return { invalid, filled, counted, total, maxTotal, pct, failed, need, remaining };
  }, [subs, best, target]);

  const g = gradeOf(r.pct);
  const share = () => {
    const lines = r.filled.map((s) => `• ${s.name}: ${s.v}/100`).join("\n");
    Share.share({ message: `نتيجتي في الشهادة (${track === "custom" ? "مخصص" : PRESETS[track].label})\n${lines}\nالمجموع: ${r.total}/${r.maxTotal}\nالنسبة: ${r.pct.toFixed(2)}% — ${g.t}\n— حاسبة الشهادة في تطبيق حصاحيصاوي` });
  };
  const print = () => {
    const rows = r.filled.map((s, i) => { const gg = gradeOf(s.v); return `<tr><td>${i + 1}</td><td class="r">${esc(s.name)}</td><td>100</td><td><b>${s.v}</b></td><td style="color:${gg.c};font-weight:700">${gg.t}</td></tr>`; }).join("");
    printPaper(paperDocument({
      theme: "academic", title: "كشف درجات الشهادة", subtitle: track === "custom" ? "مسار مخصّص" : PRESETS[track].label,
      bodyHtml: `<table><thead><tr><th>#</th><th class="r">المادة</th><th>الدرجة الكبرى</th><th>درجة الطالب</th><th>التقدير</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="box kv"><div>المجموع${best ? ` (أفضل ${best} مواد)` : ""}: <b>${r.total} / ${r.maxTotal}</b></div><div>النسبة المئوية: <b>${r.pct.toFixed(2)}%</b></div><div>التقدير العام: <b style="color:${g.c}">${g.t}</b></div><div>عدد المواد: <b>${r.filled.length}</b></div></div>`,
      note: "كشف تقديري للاسترشاد فقط — النتيجة الرسمية تصدر من إدارة الامتحانات.",
    }), "كشف درجات الشهادة");
  };

  return (
    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, gap: 12 }}>
      <View style={st.chips}>
        {(["sci", "lit", "mid", "custom"] as Track[]).map((t) => (
          <Pressable key={t} onPress={() => pickTrack(t)} style={[st.chip, track === t && st.chipOn]}>
            <Text style={[st.chipText, track === t && { color: "#fff" }]}>{t === "custom" ? "مخصّص" : PRESETS[t].label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={st.hint}>كل مادة من 100 درجة. يُحفظ ما تكتبه تلقائياً على جهازك.</Text>

      {subs.map((s) => {
        const v = s.score === "" ? null : Number(s.score);
        const bad = v !== null && (isNaN(v) || v > MAX);
        const gg = v !== null && !bad ? gradeOf(v) : null;
        return (
          <View key={s.id} style={[st.row, bad && { borderColor: "#D93636" }]}>
            <TextInput style={st.name} value={s.name} onChangeText={(t) => setSubs((x) => x.map((y) => (y.id === s.id ? { ...y, name: t } : y)))} placeholder="اسم المادة" placeholderTextColor={Colors.textMuted} />
            {gg && <Text style={[st.grade, { color: gg.c }]}>{gg.t}</Text>}
            <TextInput style={[st.score, bad && { color: "#D93636" }]} value={s.score} onChangeText={(t) => setScore(s.id, t)} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={Colors.textMuted} textAlign="center" maxLength={5} />
            <Text style={st.of}>/100</Text>
            <Pressable hitSlop={8} onPress={() => setSubs((x) => x.filter((y) => y.id !== s.id))}><Ionicons name="close-circle" size={18} color="#B9C2BE" /></Pressable>
          </View>
        );
      })}
      {r.invalid.length > 0 && <Text style={st.err}>الدرجة يجب أن تكون بين 0 و 100</Text>}
      <Pressable onPress={() => { setTrack("custom"); setSubs((x) => [...x, { id: String(Date.now()), name: "", score: "" }]); }} style={st.add}>
        <Ionicons name="add-circle-outline" size={18} color={Colors.primary} /><Text style={st.addText}>إضافة مادة</Text>
      </Pressable>

      <View style={st.chips}>
        {([0, 7, 8] as const).map((n) => (
          <Pressable key={n} onPress={() => setBest(n)} style={[st.chip, best === n && st.chipOn]}>
            <Text style={[st.chipText, best === n && { color: "#fff" }]}>{n === 0 ? "حساب كل المواد" : `أفضل ${n} مواد`}</Text>
          </Pressable>
        ))}
      </View>

      {r.filled.length > 0 && (
        <View style={[st.result, { borderColor: g.c + "55", backgroundColor: g.c + "10" }]}>
          <Text style={st.resLabel}>النسبة المئوية</Text>
          <Text style={[st.resPct, { color: g.c }]}>{r.pct.toFixed(2)}%</Text>
          <Text style={[st.resGrade, { color: g.c }]}>{g.t}</Text>
          <View style={st.resRow}>
            <View style={st.stat}><Text style={st.statV}>{r.total}</Text><Text style={st.statL}>المجموع</Text></View>
            <View style={st.stat}><Text style={st.statV}>{r.maxTotal}</Text><Text style={st.statL}>من</Text></View>
            <View style={st.stat}><Text style={st.statV}>{r.counted.length}</Text><Text style={st.statL}>مواد محسوبة</Text></View>
          </View>
          {r.failed.length > 0 && <Text style={st.warn}>⚠️ أقل من 50 في: {r.failed.map((f) => f.name).join("، ")}</Text>}
        </View>
      )}

      <View style={st.target}>
        <Text style={st.targetTitle}>🎯 كم أحتاج لأصل إلى نسبتي المستهدفة؟</Text>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
          <TextInput style={[st.score, { width: 80 }]} value={target} onChangeText={(t) => setTarget(t.replace(/[^\d.]/g, "").slice(0, 5))} keyboardType="decimal-pad" placeholder="90" placeholderTextColor={Colors.textMuted} textAlign="center" />
          <Text style={st.of}>%</Text>
        </View>
        <Text style={st.targetRes}>
          {best ? "اختر «حساب كل المواد» لاستخدام هذه الحاسبة."
            : !target ? "اكتب النسبة المستهدفة واترك خانات المواد التي لم تمتحنها فارغة."
            : r.remaining === 0 ? "أدخلت كل المواد — نسبتك الحالية أعلاه."
            : r.need === null ? "" : r.need > 100 ? `للأسف تحتاج ${r.need.toFixed(1)} في كل مادة متبقية (أعلى من 100) — جرّب هدفاً أقرب.`
            : r.need <= 0 ? "أنت فوق الهدف بالفعل 🎉" : `تحتاج متوسط ${r.need.toFixed(1)} من 100 في كل مادة من المواد المتبقية (${r.remaining}).`}
        </Text>
      </View>

      {r.filled.length > 0 && (
        <View style={{ flexDirection: "row-reverse", gap: 10 }}>
          <Pressable onPress={print} style={[st.btn, { backgroundColor: "#12355B" }]}><Ionicons name="print-outline" size={17} color="#fff" /><Text style={st.btnText}>طباعة الكشف</Text></Pressable>
          <Pressable onPress={share} style={[st.btn, { backgroundColor: Colors.primary }]}><Ionicons name="share-social-outline" size={17} color="#fff" /><Text style={st.btnText}>مشاركة</Text></Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: "#D6E2DD", backgroundColor: Colors.cardBg },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: "#E3ECE8", paddingHorizontal: 10, paddingVertical: 6 },
  name: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text, textAlign: "right", paddingVertical: 4 },
  grade: { fontFamily: "Cairo_700Bold", fontSize: 10.5 },
  score: { width: 58, height: 38, borderRadius: 10, backgroundColor: "#F4F8F6", borderWidth: 1, borderColor: "#DCE7E2", fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text },
  of: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  err: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#D93636", textAlign: "right" },
  add: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: Colors.primary + "66" },
  addText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  result: { borderRadius: 18, borderWidth: 1.5, padding: 16, alignItems: "center" },
  resLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  resPct: { fontFamily: "Cairo_700Bold", fontSize: 38, lineHeight: 52 },
  resGrade: { fontFamily: "Cairo_700Bold", fontSize: 16, marginTop: -4 },
  resRow: { flexDirection: "row-reverse", gap: 10, marginTop: 12, alignSelf: "stretch" },
  stat: { flex: 1, backgroundColor: Colors.cardBg, borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  statV: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text },
  statL: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  warn: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#C2580A", marginTop: 10, textAlign: "center" },
  target: { backgroundColor: "#FFF8E6", borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: "#F2DFA6" },
  targetTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: "#5C4A12", textAlign: "right" },
  targetRes: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#5C4A12", textAlign: "right", lineHeight: 20 },
  btn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
});
