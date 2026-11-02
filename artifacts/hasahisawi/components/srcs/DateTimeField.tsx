// حقل تاريخ ووقت احترافي يعمل على أندرويد وiOS والويب بلا مكتبات أصلية:
// تقويم شهري + اختيار الساعة والدقيقة (ص/م) + اختصارات سريعة.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { SRCS_RED } from "@/lib/red-crescent";

const DAYS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const HOURS12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export const fmtDateTime = (iso?: string | null, withTime = true) =>
  iso ? new Date(iso).toLocaleString("ar-EG", withTime
    ? { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

export default function DateTimeField({ label, value, onChange, withTime = true, required, minDate, placeholder }: {
  label: string; value: string | null | undefined; onChange: (iso: string | null) => void;
  withTime?: boolean; required?: boolean; minDate?: Date; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.label}>{label}{required ? " *" : ""}</Text>
      <TouchableOpacity style={[st.field, !!value && { borderColor: SRCS_RED + "80" }]} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name={withTime ? "calendar" : "calendar-outline"} size={18} color={value ? SRCS_RED : Colors.textMuted} />
        <Text style={[st.fieldTxt, !value && { color: Colors.textMuted }]} numberOfLines={1}>{value ? fmtDateTime(value, withTime) : placeholder || (withTime ? "اختر التاريخ والوقت" : "اختر التاريخ")}</Text>
        {value && !required ? (
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={10} accessibilityLabel="مسح"><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></TouchableOpacity>
        ) : <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />}
      </TouchableOpacity>
      <PickerModal visible={open} value={value} withTime={withTime} minDate={minDate} title={label}
        onClose={() => setOpen(false)} onPick={(iso) => { onChange(iso); setOpen(false); }} />
    </View>
  );
}

function PickerModal({ visible, value, withTime, minDate, title, onClose, onPick }: {
  visible: boolean; value?: string | null; withTime: boolean; minDate?: Date; title: string; onClose: () => void; onPick: (iso: string) => void;
}) {
  const init = () => { const d = value ? new Date(value) : new Date(); if (!value) { d.setHours(17, 0, 0, 0); } return d; };
  const [sel, setSel] = useState<Date>(init);
  const [month, setMonth] = useState(() => { const d = init(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  useEffect(() => { if (visible) { const d = init(); setSel(d); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const arr: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let i = 1; i <= days; i++) arr.push(new Date(month.getFullYear(), month.getMonth(), i));
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [month]);
  const min = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null;
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const today = new Date();
  const setDay = (d: Date) => setSel((p) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), p.getHours(), p.getMinutes()));
  const h = sel.getHours(), pm = h >= 12, h12 = h % 12 === 0 ? 12 : h % 12;
  const setHour12 = (v: number, isPm = pm) => setSel((p) => { const d = new Date(p); d.setHours((v % 12) + (isPm ? 12 : 0)); return d; });
  const setMin = (v: number) => setSel((p) => { const d = new Date(p); d.setMinutes(v); return d; });
  const quick = (addDays: number) => { const d = new Date(); d.setDate(d.getDate() + addDays); setDay(d); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.bg}>
        <View style={st.sheet}>
          <View style={st.head}>
            <Text style={st.title} numberOfLines={1}>{title}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="إغلاق"><Ionicons name="close" size={22} color={Colors.text} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 6 }}>
            <View style={{ flexDirection: "row-reverse", gap: 6 }}>
              {[["اليوم", 0], ["غداً", 1], ["بعد أسبوع", 7]].map(([l, n]) => (
                <TouchableOpacity key={String(l)} style={st.quick} onPress={() => quick(n as number)}><Text style={st.quickTxt}>{l}</Text></TouchableOpacity>
              ))}
            </View>
            <View style={st.monthRow}>
              <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={st.nav} accessibilityLabel="الشهر التالي"><Ionicons name="chevron-back" size={18} color={Colors.text} /></TouchableOpacity>
              <Text style={st.month}>{MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
              <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={st.nav} accessibilityLabel="الشهر السابق"><Ionicons name="chevron-forward" size={18} color={Colors.text} /></TouchableOpacity>
            </View>
            <View style={st.grid}>
              {DAYS.map((d) => <Text key={d} style={st.dow}>{d}</Text>)}
              {cells.map((d, i) => {
                if (!d) return <View key={`e${i}`} style={st.cell} />;
                const disabled = !!min && d < min;
                const on = sameDay(d, sel);
                return (
                  <TouchableOpacity key={i} disabled={disabled} onPress={() => setDay(d)} style={[st.cell, on && st.cellOn, !on && sameDay(d, today) && st.cellToday]}>
                    <Text style={[st.cellTxt, on && { color: "#fff" }, disabled && { color: Colors.border }]}>{d.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {withTime ? (
              <View style={{ gap: 8 }}>
                <View style={st.timeHead}>
                  <Ionicons name="time" size={16} color={SRCS_RED} />
                  <Text style={st.timeLbl}>الوقت</Text>
                  <View style={st.ampm}>
                    {([["ص", false], ["م", true]] as const).map(([l, v]) => (
                      <TouchableOpacity key={l} onPress={() => setHour12(h12, v)} style={[st.ampmBtn, pm === v && st.ampmOn]}><Text style={[st.ampmTxt, pm === v && { color: "#fff" }]}>{l}</Text></TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={st.chips}>
                  {HOURS12.map((v) => (
                    <TouchableOpacity key={v} onPress={() => setHour12(v)} style={[st.chip, h12 === v && st.chipOn]}><Text style={[st.chipTxt, h12 === v && { color: "#fff" }]}>{v}</Text></TouchableOpacity>
                  ))}
                </View>
                <View style={st.chips}>
                  {MINUTES.map((v) => (
                    <TouchableOpacity key={v} onPress={() => setMin(v)} style={[st.chip, sel.getMinutes() === v && st.chipOn]}><Text style={[st.chipTxt, sel.getMinutes() === v && { color: "#fff" }]}>:{String(v).padStart(2, "0")}</Text></TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={st.preview}><Ionicons name="checkmark-circle" size={18} color={SRCS_RED} /><Text style={st.previewTxt}>{fmtDateTime(sel.toISOString(), withTime)}</Text></View>
          </ScrollView>
          <TouchableOpacity style={st.ok} onPress={() => onPick(sel.toISOString())}><Text style={st.okTxt}>تأكيد</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  field: { flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, paddingHorizontal: 12 },
  fieldTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.text, textAlign: "right" },
  bg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 16 },
  sheet: { width: "100%", maxWidth: 420, maxHeight: "92%", backgroundColor: Colors.cardBg, borderRadius: 22, padding: 14, gap: 10 },
  head: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  title: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  quick: { flex: 1, height: 36, borderRadius: 18, borderWidth: 1, borderColor: SRCS_RED + "55", alignItems: "center", justifyContent: "center" },
  quickTxt: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: SRCS_RED },
  monthRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  nav: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  month: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap" },
  dow: { width: `${100 / 7}%`, textAlign: "center", fontFamily: "Cairo_600SemiBold", fontSize: 10.5, color: Colors.textMuted, paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  cellOn: { backgroundColor: SRCS_RED },
  cellToday: { borderWidth: 1.5, borderColor: SRCS_RED + "66" },
  cellTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text },
  timeHead: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  timeLbl: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  ampm: { flexDirection: "row-reverse", backgroundColor: Colors.bg, borderRadius: 16, padding: 3 },
  ampmBtn: { paddingHorizontal: 14, height: 30, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ampmOn: { backgroundColor: SRCS_RED },
  ampmTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  chip: { minWidth: 46, height: 36, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },
  chipOn: { backgroundColor: SRCS_RED, borderColor: SRCS_RED },
  chipTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text },
  preview: { flexDirection: "row-reverse", alignItems: "center", gap: 6, padding: 10, borderRadius: 12, backgroundColor: SRCS_RED + "10" },
  previewTxt: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text, textAlign: "right" },
  ok: { height: 48, borderRadius: 14, backgroundColor: SRCS_RED, alignItems: "center", justifyContent: "center" },
  okTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
