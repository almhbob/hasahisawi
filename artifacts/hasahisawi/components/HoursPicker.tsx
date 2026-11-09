// منتقي أوقات العمل العصري — يحل محل الإدخال النصي في كل التطبيق.
// أيام بشرائح، أنماط جاهزة، منتقي وقت (ساعة/دقائق/ص-م)، فترة ثانية اختيارية، و«24 ساعة».
// يُخرج نصاً موحّداً مقروءاً (مثل: «السبت – الخميس · 8 ص – 1 م، 5 م – 10 م») فتعمل شاشات العرض كما هي.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const GREEN = "#00966A";
const DEEP = "#004D36";
const GOLD = "#E8A900";

export const DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"] as const;
const SHORT = ["سبت", "أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];

type T = { h: number; m: number }; // 0..23
type Shift = { from: T; to: T };
type State = { days: boolean[]; allDay: boolean; shifts: Shift[] };

const PRESETS: { key: string; label: string; icon: any; shifts: Shift[] }[] = [
  { key: "full", label: "دوام كامل", icon: "sunny-outline", shifts: [{ from: { h: 8, m: 0 }, to: { h: 22, m: 0 } }] },
  { key: "morning", label: "صباحي", icon: "cafe-outline", shifts: [{ from: { h: 8, m: 0 }, to: { h: 14, m: 0 } }] },
  { key: "evening", label: "مسائي", icon: "moon-outline", shifts: [{ from: { h: 16, m: 0 }, to: { h: 23, m: 0 } }] },
  { key: "split", label: "فترتان", icon: "git-compare-outline", shifts: [{ from: { h: 8, m: 0 }, to: { h: 13, m: 0 } }, { from: { h: 17, m: 0 }, to: { h: 22, m: 0 } }] },
];

/* ───────── التحويل بين النص والبنية ───────── */
export function fmtTime(t: T) {
  const pm = t.h >= 12;
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return `${h12}${t.m ? `:${String(t.m).padStart(2, "0")}` : ""} ${pm ? "م" : "ص"}`;
}
function fmtDays(days: boolean[]) {
  const on = days.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
  if (on.length === 7) return "يومياً";
  if (!on.length) return "";
  // نطاق متصل (مع الالتفاف من الجمعة إلى السبت)
  for (let start = 0; start < 7; start++) {
    const seq = Array.from({ length: on.length }, (_, k) => (start + k) % 7);
    if (seq.every((i) => days[i]) && !days[(start + 7 - 1) % 7]) {
      return on.length >= 3 ? `${DAYS[seq[0]]} – ${DAYS[seq[seq.length - 1]]}` : seq.map((i) => DAYS[i]).join(" و");
    }
  }
  return on.map((i) => DAYS[i]).join("، ");
}
export function formatHours(s: State, withDays = true) {
  const time = s.allDay ? "24 ساعة" : s.shifts.map((x) => `${fmtTime(x.from)} – ${fmtTime(x.to)}`).join("، ");
  const d = withDays ? fmtDays(s.days) : "";
  return d ? `${d} · ${time}` : time;
}
const toLatin = (v: string) => v.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
function parse(text: string, daysText?: string): State {
  const raw = toLatin(`${daysText || ""} ${text || ""}`);
  const days = DAYS.map(() => false);
  const range = raw.match(new RegExp(`(${DAYS.join("|")})\\s*[–\\-—إلى]+\\s*(${DAYS.join("|")})`));
  if (range) {
    let i = DAYS.indexOf(range[1] as any); const j = DAYS.indexOf(range[2] as any);
    for (let k = 0; k < 7; k++) { days[i] = true; if (i === j) break; i = (i + 1) % 7; }
  } else DAYS.forEach((d, i) => { if (raw.includes(d)) days[i] = true; });
  if (/يومي|كل الأيام|طوال الأسبوع/.test(raw) || !days.some(Boolean)) days.fill(true);
  const allDay = /24\s*ساع|24\/7|على مدار/.test(raw);
  const times = [...raw.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(ص|م|صباح|مساء|AM|PM|am|pm)?/g)]
    .map((x) => {
      let h = Number(x[1]); const m = Number(x[2] || 0); const ap = x[3] || "";
      if (h > 23 || m > 59) return null;
      if (/م|مساء|PM|pm/.test(ap) && h < 12) h += 12;
      if (/ص|صباح|AM|am/.test(ap) && h === 12) h = 0;
      return { h, m };
    }).filter(Boolean) as T[];
  const shifts: Shift[] = [];
  for (let i = 0; i + 1 < times.length && shifts.length < 2; i += 2) shifts.push({ from: times[i], to: times[i + 1] });
  return { days, allDay, shifts: shifts.length ? shifts : PRESETS[0].shifts };
}

/* ───────── المكوّن ───────── */
export default function HoursPicker({ value, onChange, days, onDaysChange, label = "أوقات العمل", allow24 = true }: {
  value: string; onChange: (v: string) => void;
  /** إن كان للأيام حقل مستقل (مثل working_days) */
  days?: string; onDaysChange?: (v: string) => void;
  label?: string; allow24?: boolean;
}) {
  const separateDays = !!onDaysChange;
  const [s, setS] = useState<State>(() => parse(value, days));
  const [edit, setEdit] = useState<{ shift: number; end: "from" | "to" } | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; if (!value) emit(s); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const emit = (n: State) => {
    if (separateDays) { onDaysChange!(fmtDays(n.days)); onChange(formatHours(n, false)); }
    else onChange(formatHours(n, true));
  };
  const update = (n: State) => { setS(n); emit(n); };
  const toggleDay = (i: number) => { const d = [...s.days]; d[i] = !d[i]; if (!d.some(Boolean)) return; update({ ...s, days: d }); };
  const preset = (shifts: Shift[]) => update({ ...s, allDay: false, shifts: shifts.map((x) => ({ from: { ...x.from }, to: { ...x.to } })) });
  const activePreset = !s.allDay && PRESETS.find((p) => JSON.stringify(p.shifts) === JSON.stringify(s.shifts))?.key;
  const preview = useMemo(() => formatHours(s, true), [s]);

  return (
    <View style={st.wrap}>
      <View style={st.head}>
        <Ionicons name="time-outline" size={18} color={DEEP} />
        <Text style={st.label}>{label}</Text>
      </View>

      {/* الأيام */}
      <View style={st.row}>
        <Text style={st.sub}>أيام العمل</Text>
        <View style={{ flexDirection: "row-reverse", gap: 6 }}>
          <Pressable onPress={() => update({ ...s, days: DAYS.map(() => true) })} style={st.mini}><Text style={st.miniT}>يومياً</Text></Pressable>
          <Pressable onPress={() => update({ ...s, days: DAYS.map((_, i) => i !== 6) })} style={st.mini}><Text style={st.miniT}>السبت–الخميس</Text></Pressable>
        </View>
      </View>
      <View style={st.days}>
        {SHORT.map((d, i) => (
          <Pressable key={d} onPress={() => toggleDay(i)} style={[st.day, s.days[i] && st.dayOn]} accessibilityRole="checkbox" accessibilityState={{ checked: s.days[i] }} accessibilityLabel={DAYS[i]}>
            <Text style={[st.dayT, s.days[i] && { color: "#fff" }]}>{d}</Text>
          </Pressable>
        ))}
      </View>

      {/* الأنماط */}
      <Text style={[st.sub, { marginTop: 4 }]}>الدوام</Text>
      <View style={st.presets}>
        {PRESETS.map((p) => (
          <Pressable key={p.key} onPress={() => preset(p.shifts)} style={[st.preset, activePreset === p.key && st.presetOn]} accessibilityRole="radio" accessibilityState={{ selected: activePreset === p.key }}>
            <Ionicons name={p.icon} size={16} color={activePreset === p.key ? "#fff" : DEEP} />
            <Text style={[st.presetT, activePreset === p.key && { color: "#fff" }]}>{p.label}</Text>
          </Pressable>
        ))}
        {allow24 ? (
          <Pressable onPress={() => update({ ...s, allDay: !s.allDay })} style={[st.preset, s.allDay && { backgroundColor: GOLD, borderColor: GOLD }]} accessibilityRole="switch" accessibilityState={{ checked: s.allDay }}>
            <Ionicons name="infinite" size={16} color={s.allDay ? "#3D2C00" : DEEP} />
            <Text style={[st.presetT, s.allDay && { color: "#3D2C00" }]}>24 ساعة</Text>
          </Pressable>
        ) : null}
      </View>

      {/* الفترات */}
      {!s.allDay && s.shifts.map((sh, i) => (
        <View key={i} style={st.shift}>
          <Text style={st.shiftN}>{s.shifts.length > 1 ? (i === 0 ? "الفترة الأولى" : "الفترة الثانية") : "من — إلى"}</Text>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-start" }}>
            <TimeBtn t={sh.from} caption="يفتح" onPress={() => setEdit({ shift: i, end: "from" })} />
            <Ionicons name="arrow-back" size={16} color={Colors.textMuted} />
            <TimeBtn t={sh.to} caption="يغلق" onPress={() => setEdit({ shift: i, end: "to" })} />
          </View>
          {s.shifts.length > 1 ? (
            <Pressable onPress={() => update({ ...s, shifts: s.shifts.filter((_, k) => k !== i) })} hitSlop={8} accessibilityLabel="حذف الفترة"><Ionicons name="close-circle" size={20} color={Colors.textMuted} /></Pressable>
          ) : null}
        </View>
      ))}
      {!s.allDay && s.shifts.length < 2 ? (
        <Pressable onPress={() => update({ ...s, shifts: [...s.shifts, { from: { h: 17, m: 0 }, to: { h: 22, m: 0 } }] })} style={st.addShift} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={17} color={GREEN} /><Text style={st.addShiftT}>إضافة فترة ثانية (استراحة الظهر)</Text>
        </Pressable>
      ) : null}

      {/* المعاينة */}
      <View style={st.preview}>
        <Ionicons name="eye-outline" size={15} color={DEEP} />
        <Text style={st.previewT} numberOfLines={2}>{preview}</Text>
      </View>

      {edit ? (
        <TimeSheet
          title={edit.end === "from" ? "وقت الفتح" : "وقت الإغلاق"}
          value={s.shifts[edit.shift][edit.end]}
          onClose={() => setEdit(null)}
          onPick={(t) => { const shifts = s.shifts.map((x, k) => (k === edit.shift ? { ...x, [edit.end]: t } : x)); update({ ...s, shifts }); setEdit(null); }}
        />
      ) : null}
    </View>
  );
}

function TimeBtn({ t, caption, onPress }: { t: T; caption: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={st.timeBtn} accessibilityRole="button" accessibilityLabel={`${caption} ${fmtTime(t)}`}>
      <Text style={st.timeCap}>{caption}</Text>
      <Text style={st.timeT}>{fmtTime(t)}</Text>
    </Pressable>
  );
}

/* ───────── منتقي الوقت ───────── */
function TimeSheet({ title, value, onPick, onClose }: { title: string; value: T; onPick: (t: T) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [pm, setPm] = useState(value.h >= 12);
  const [h12, setH12] = useState(value.h % 12 === 0 ? 12 : value.h % 12);
  const [m, setM] = useState(value.m - (value.m % 15));
  const result: T = { h: (h12 % 12) + (pm ? 12 : 0), m };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={st.grab} />
          <Text style={st.sheetT}>{title}</Text>
          <Text style={st.big}>{fmtTime(result)}</Text>
          <View style={st.ampm}>
            {[[false, "صباحاً", "sunny"], [true, "مساءً", "moon"]].map(([v, l, ic]) => (
              <Pressable key={String(v)} onPress={() => setPm(v as boolean)} style={[st.ampmB, pm === v && st.ampmOn]} accessibilityRole="radio" accessibilityState={{ selected: pm === v }}>
                <Ionicons name={ic as any} size={16} color={pm === v ? "#fff" : DEEP} /><Text style={[st.ampmT, pm === v && { color: "#fff" }]}>{l as string}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={st.sub}>الساعة</Text>
          <View style={st.grid}>
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
              <Pressable key={h} onPress={() => setH12(h)} style={[st.cell, h12 === h && st.cellOn]} accessibilityRole="radio" accessibilityState={{ selected: h12 === h }}>
                <Text style={[st.cellT, h12 === h && { color: "#fff" }]}>{h}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={st.sub}>الدقائق</Text>
          <View style={[st.grid, { marginBottom: 14 }]}>
            {[0, 15, 30, 45].map((x) => (
              <Pressable key={x} onPress={() => setM(x)} style={[st.cell, { width: "23%" }, m === x && st.cellOn]} accessibilityRole="radio" accessibilityState={{ selected: m === x }}>
                <Text style={[st.cellT, m === x && { color: "#fff" }]}>{String(x).padStart(2, "0")} د</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => onPick(result)} style={st.done} accessibilityRole="button"><Text style={st.doneT}>تم</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 10, padding: 12, borderRadius: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, marginVertical: 6 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  sub: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  mini: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9, backgroundColor: GREEN + "12" },
  miniT: { fontFamily: "Cairo_700Bold", fontSize: 11, color: DEEP },
  days: { flexDirection: "row-reverse", gap: 5 },
  day: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  dayOn: { backgroundColor: GREEN, borderColor: GREEN },
  dayT: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: DEEP },
  presets: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 },
  preset: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  presetOn: { backgroundColor: DEEP, borderColor: DEEP },
  presetT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: DEEP },
  shift: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 8, borderRadius: 14, backgroundColor: GREEN + "0A", borderWidth: 1, borderColor: GREEN + "26" },
  shiftN: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: Colors.textSecondary, width: 66, textAlign: "right" },
  timeBtn: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1.5, borderColor: GREEN + "55", minWidth: 82 },
  timeCap: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.textMuted },
  timeT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: DEEP },
  addShift: { flexDirection: "row-reverse", alignItems: "center", gap: 5, alignSelf: "flex-end", paddingVertical: 2 },
  addShiftT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: GREEN },
  preview: { flexDirection: "row-reverse", alignItems: "center", gap: 6, padding: 10, borderRadius: 12, backgroundColor: GOLD + "18", borderWidth: 1, borderColor: GOLD + "50" },
  previewT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: "#3D2C00", textAlign: "right" },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: Colors.cardBg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, gap: 8, width: "100%", maxWidth: 520, alignSelf: "center" },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: Colors.divider, alignSelf: "center", marginTop: 8 },
  sheetT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textSecondary, textAlign: "center" },
  big: { fontFamily: "Cairo_700Bold", fontSize: 38, color: DEEP, textAlign: "center" },
  ampm: { flexDirection: "row-reverse", gap: 8, padding: 4, borderRadius: 14, backgroundColor: Colors.bg },
  ampmB: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 11 },
  ampmOn: { backgroundColor: DEEP },
  ampmT: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: DEEP },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  cell: { width: "14.6%", aspectRatio: 1.15, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  cellOn: { backgroundColor: GREEN, borderColor: GREEN },
  cellT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: DEEP },
  done: { alignItems: "center", justifyContent: "center", height: 50, borderRadius: 16, backgroundColor: DEEP },
  doneT: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
