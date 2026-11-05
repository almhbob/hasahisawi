// حقل تاريخ ووقت بتقويم عربي (السبت أول الأسبوع) واختيار الساعة بالنقر. مكتوب بـ React Native فقط،
// فيعمل على أندرويد وآيفون والويب دون مكتبة أصلية ودون إصدار جديد من التطبيق.
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEK_HEAD = ["س", "ح", "ن", "ث", "ر", "خ", "ج"]; // يبدأ بالسبت
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 15, 30, 45];

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pad = (n: number) => String(n).padStart(2, "0");

export function formatDateTime(d: Date, withTime = true): string {
  const date = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (!withTime) return date;
  const h = d.getHours() % 12 || 12;
  return `${date} · ${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "ص" : "م"}`;
}

/** المدة بين تاريخين بصياغة عربية قصيرة: «7 أيام»، «يوم و5 ساعات»، «3 ساعات». */
export function formatDuration(from: Date, to: Date): string {
  const mins = Math.round((to.getTime() - from.getTime()) / 60000);
  if (mins <= 0) return "";
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const d = days === 0 ? "" : days === 1 ? "يوم" : days === 2 ? "يومان" : days <= 10 ? `${days} أيام` : `${days} يوماً`;
  const h = hours === 0 ? "" : hours === 1 ? "ساعة" : hours === 2 ? "ساعتان" : hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`;
  if (d && h) return `${d} و ${h}`;
  return d || h || `${mins} دقيقة`;
}

type Preset = { label: string; get: () => Date };
export type DateTimeMode = "datetime" | "date" | "time";

const timeText = (d: Date) => `${d.getHours() % 12 || 12}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "ص" : "م"}`;
const display = (d: Date, mode: DateTimeMode) => (mode === "time" ? timeText(d) : formatDateTime(d, mode === "datetime"));

export default function DateTimeField({
  label, value, onChange, minDate, maxDate, withTime = true, mode: modeProp, presets, hint, placeholder, onClear, initialView, onDark,
}: {
  label: string;
  /** null = لم يُختر بعد */
  value: Date | null;
  onChange: (d: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  /** للتوافق القديم؛ استخدم mode */
  withTime?: boolean;
  mode?: DateTimeMode;
  presets?: Preset[];
  hint?: string;
  placeholder?: string;
  /** يُظهر زر مسح عند وجود قيمة */
  onClear?: () => void;
  /** التاريخ الذي يفتح عليه التقويم إن كانت القيمة فارغة (مثلاً قبل 25 سنة لتاريخ الميلاد) */
  initialView?: Date;
  /** للحقول داخل لوحة داكنة ثابتة اللون */
  onDark?: boolean;
}) {
  const mode: DateTimeMode = modeProp ?? (withTime ? "datetime" : "date");
  const fallback = () => {
    const d = initialView ? new Date(initialView) : new Date();
    if (mode !== "date" && !initialView) {
      d.setMinutes(0, 0, 0);
      const h = d.getHours() + 1;
      if (h < 8 || h > 21) { if (h > 21 && mode === "datetime") d.setDate(d.getDate() + 1); d.setHours(mode === "time" ? 18 : 9); } else d.setHours(h);
    }
    if (mode === "date") d.setHours(12, 0, 0, 0);
    return d;
  };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? fallback());
  const [month, setMonth] = useState(new Date(draft.getFullYear(), draft.getMonth(), 1));
  const [yearPick, setYearPick] = useState(false);

  const show = () => {
    const d = value ?? fallback();
    setDraft(d); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setYearPick(false); setOpen(true);
  };
  const done = () => { onChange(draft); setOpen(false); };

  const min = minDate ? startOfDay(minDate) : null;
  const max = maxDate ? startOfDay(maxDate) : null;
  const today = new Date();

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 1) % 7; // السبت = 0
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const arr: (Date | null)[] = Array(lead).fill(null);
    for (let i = 1; i <= count; i++) arr.push(new Date(month.getFullYear(), month.getMonth(), i));
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [month]);

  const years = useMemo(() => {
    const y0 = min ? min.getFullYear() : today.getFullYear() - 100;
    const y1 = max ? max.getFullYear() : today.getFullYear() + 10;
    const out: number[] = [];
    for (let y = y1; y >= y0; y--) out.push(y);
    return out;
  }, [min?.getTime(), max?.getTime()]);

  const setDay = (d: Date) => setDraft(new Date(d.getFullYear(), d.getMonth(), d.getDate(), draft.getHours(), draft.getMinutes()));
  const setHour12 = (h12: number) => {
    const pmNow = draft.getHours() >= 12;
    const n = new Date(draft); n.setHours((h12 % 12) + (pmNow ? 12 : 0)); setDraft(n);
  };
  const setMinute = (m: number) => { const n = new Date(draft); n.setMinutes(m, 0, 0); setDraft(n); };
  const setPm = (v: boolean) => {
    const h = draft.getHours();
    if (v === h >= 12) return;
    const n = new Date(draft); n.setHours(v ? h + 12 : h - 12); setDraft(n);
  };
  const pickYear = (y: number) => {
    setMonth(new Date(y, month.getMonth(), 1));
    const last = new Date(y, draft.getMonth() + 1, 0).getDate();
    setDraft(new Date(y, draft.getMonth(), Math.min(draft.getDate(), last), draft.getHours(), draft.getMinutes()));
    setYearPick(false);
  };
  const shiftMonth = (k: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + k, 1));
  const canPrev = !min || new Date(month.getFullYear(), month.getMonth(), 0) >= min;
  const canNext = !max || new Date(month.getFullYear(), month.getMonth() + 1, 1) <= max;
  const outOfRange = (!!min && startOfDay(draft) < min) || (!!max && startOfDay(draft) > max);

  const h12 = draft.getHours() % 12 || 12;
  const pm = draft.getHours() >= 12;
  const minutes = MINUTES.includes(draft.getMinutes()) ? MINUTES : [...MINUTES, draft.getMinutes()].sort((a, b) => a - b);
  const icon = mode === "time" ? "time-outline" : "calendar-outline";

  return (
    <View style={{ gap: 4 }}>
      {!!label && <Text style={[s.label, onDark && { color: "#94A3B8" }]}>{label}</Text>}
      <TouchableOpacity style={[s.field, onDark && s.fieldDark]} onPress={show} accessibilityRole="button" accessibilityLabel={`${label}: ${value ? display(value, mode) : placeholder || "لم يُحدد"}`}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
        <Text style={[s.fieldText, onDark && { color: "#fff" }, !value && { color: onDark ? "#94A3B8" : Colors.textMuted, fontFamily: "Cairo_500Medium" }]} numberOfLines={1}>
          {value ? display(value, mode) : placeholder || (mode === "time" ? "اختر الوقت" : "اختر التاريخ")}
        </Text>
        {value && onClear ? (
          <TouchableOpacity onPress={onClear} hitSlop={10} accessibilityLabel={`مسح ${label}`}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
        )}
      </TouchableOpacity>
      {!!hint && <Text style={s.hint}>{hint}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <ScrollView contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
              <Text style={s.sheetTitle}>{label || (mode === "time" ? "اختر الوقت" : "اختر التاريخ")}</Text>

              {!!presets?.length && (
                <View style={s.wrapRow}>
                  {presets.map((p) => (
                    <TouchableOpacity key={p.label} style={s.preset} onPress={() => { const d = p.get(); setDraft(d); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>
                      <Text style={s.presetText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {mode !== "time" && (
                <>
                  {/* رأس الشهر: السهم الأيمن للشهر السابق والأيسر للتالي. الضغط على الشهر يفتح اختيار السنة */}
                  <View style={s.monthRow}>
                    <TouchableOpacity style={[s.navBtn, (!canPrev || yearPick) && { opacity: 0.3 }]} disabled={!canPrev || yearPick} onPress={() => shiftMonth(-1)} accessibilityLabel="الشهر السابق">
                      <Ionicons name="chevron-forward" size={20} color={Colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.monthBtn} onPress={() => setYearPick((v) => !v)} accessibilityLabel="اختيار السنة">
                      <Text style={s.monthText}>{MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
                      <Ionicons name={yearPick ? "chevron-up" : "chevron-down"} size={14} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.navBtn, (!canNext || yearPick) && { opacity: 0.3 }]} disabled={!canNext || yearPick} onPress={() => shiftMonth(1)} accessibilityLabel="الشهر التالي">
                      <Ionicons name="chevron-back" size={20} color={Colors.text} />
                    </TouchableOpacity>
                  </View>

                  {yearPick ? (
                    <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
                      <View style={s.yearGrid}>
                        {years.map((y) => {
                          const on = y === month.getFullYear();
                          return (
                            <TouchableOpacity key={y} style={[s.yearCell, on && s.chipOn]} onPress={() => pickYear(y)}>
                              <Text style={[s.chipText, on && s.chipTextOn]}>{y}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  ) : (
                    <View style={s.grid}>
                      {WEEK_HEAD.map((w) => <Text key={w} style={[s.cell, s.weekHead]}>{w}</Text>)}
                      {cells.map((d, i) => {
                        if (!d) return <View key={`e${i}`} style={s.cell} />;
                        const off = (!!min && d < min) || (!!max && d > max);
                        const sel = sameDay(d, draft);
                        const isToday = sameDay(d, today);
                        return (
                          <TouchableOpacity key={i} style={s.cell} disabled={off} onPress={() => setDay(d)} accessibilityLabel={formatDateTime(d, false)}>
                            <View style={[s.day, isToday && s.dayToday, sel && s.daySel]}>
                              <Text style={[s.dayText, off && { color: Colors.textMuted, opacity: 0.4 }, sel && { color: Colors.onColor, fontFamily: "Cairo_700Bold" }]}>{d.getDate()}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </>
              )}

              {mode !== "date" && (
                <View style={{ gap: 8 }}>
                  <Text style={s.sub}>الساعة</Text>
                  <View style={s.wrapRow}>
                    {HOURS.map((h) => (
                      <TouchableOpacity key={h} style={[s.chip, h === h12 && s.chipOn]} onPress={() => setHour12(h)}>
                        <Text style={[s.chipText, h === h12 && s.chipTextOn]}>{h}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={[s.wrapRow, { justifyContent: "space-between" }]}>
                    <View style={s.wrapRow}>
                      {minutes.map((m) => {
                        const on = draft.getMinutes() === m;
                        return (
                          <TouchableOpacity key={m} style={[s.chip, on && s.chipOn]} onPress={() => setMinute(m)}>
                            <Text style={[s.chipText, on && s.chipTextOn]}>:{pad(m)}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={s.seg}>
                      {[{ k: false, t: "صباحاً" }, { k: true, t: "مساءً" }].map((o) => (
                        <TouchableOpacity key={o.t} style={[s.segBtn, pm === o.k && s.segOn]} onPress={() => setPm(o.k)}>
                          <Text style={[s.chipText, pm === o.k && s.chipTextOn]}>{o.t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              <View style={s.summary}>
                <Ionicons name={icon} size={16} color={Colors.primary} />
                <Text style={s.summaryText}>{display(draft, mode)}</Text>
              </View>

              <View style={[s.wrapRow, { gap: 10 }]}>
                <TouchableOpacity style={[s.btn, { flex: 1 }, outOfRange && { opacity: 0.4 }]} disabled={outOfRange} onPress={done}><Text style={s.btnText}>تم</Text></TouchableOpacity>
                <TouchableOpacity style={[s.btnGhost, { flex: 1 }]} onPress={() => setOpen(false)}><Text style={s.btnGhostText}>إلغاء</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── غلافات للحقول المخزّنة نصاً ──────────────────────────────────────────────

/** "YYYY-MM-DD" ↔ Date (منتصف النهار محلياً لتفادي انزلاق اليوم مع فروق التوقيت) */
export const ymdToDate = (v?: string | null): Date | null => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec((v || "").trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12);
  return isNaN(d.getTime()) ? null : d;
};
export const dateToYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** حقل تاريخ بقيمة نصية "YYYY-MM-DD" (فارغ = لم يُحدد). */
export function DateInput({
  label, value, onChange, minDate, maxDate, placeholder, hint, clearable = true, initialView, presets, onDark,
}: {
  label: string; value: string; onChange: (v: string) => void;
  minDate?: Date; maxDate?: Date; placeholder?: string; hint?: string; clearable?: boolean; initialView?: Date; presets?: Preset[]; onDark?: boolean;
}) {
  return (
    <DateTimeField
      label={label} mode="date" value={ymdToDate(value)} onChange={(d) => onChange(dateToYmd(d))}
      minDate={minDate} maxDate={maxDate} placeholder={placeholder} hint={hint} initialView={initialView} presets={presets} onDark={onDark}
      onClear={clearable ? () => onChange("") : undefined}
    />
  );
}

/** حقل وقت بقيمة نصية "HH:MM" بنظام 24 ساعة. */
export function TimeInput({
  label, value, onChange, placeholder, hint, clearable = true, onDark,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; clearable?: boolean; onDark?: boolean }) {
  const m = /^(\d{1,2}):(\d{2})/.exec((value || "").trim());
  const d = m ? (() => { const x = new Date(); x.setHours(+m[1], +m[2], 0, 0); return x; })() : null;
  return (
    <DateTimeField
      label={label} mode="time" value={d} onChange={(x) => onChange(`${pad(x.getHours())}:${pad(x.getMinutes())}`)}
      placeholder={placeholder} hint={hint} onClear={clearable ? () => onChange("") : undefined} onDark={onDark}
    />
  );
}

const s = StyleSheet.create({
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  hint: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  field: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, backgroundColor: Colors.bg, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  fieldDark: { backgroundColor: "#FFFFFF0D", borderColor: "#FFFFFF18" },
  fieldText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 },
  sheet: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 16, maxHeight: "92%", width: "100%", maxWidth: 420, alignSelf: "center" },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.text, textAlign: "right" },
  sub: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  wrapRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, alignItems: "center" },
  preset: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.primary + "18", borderWidth: 1, borderColor: Colors.primary + "40" },
  presetText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primary },
  monthRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  navBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  monthBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  yearGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  yearCell: { width: "22%", height: 40, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  monthText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", textAlign: "center" },
  weekHead: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textMuted, aspectRatio: undefined, height: 26 },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dayToday: { borderWidth: 1.5, borderColor: Colors.primary },
  daySel: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dayText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text },
  chip: { minWidth: 42, paddingHorizontal: 10, height: 36, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.text },
  chipTextOn: { color: Colors.onColor, fontFamily: "Cairo_700Bold" },
  seg: { flexDirection: "row-reverse", borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  segBtn: { paddingHorizontal: 12, height: 36, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: Colors.primary },
  summary: { flexDirection: "row-reverse", alignItems: "center", gap: 6, padding: 10, borderRadius: 12, backgroundColor: Colors.primary + "12" },
  summaryText: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.text, textAlign: "right" },
  btn: { height: 46, borderRadius: 14, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.onColor },
  btnGhost: { height: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  btnGhostText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text },
});
