import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";

// ─── Types ────────────────────────────────────────────────────────────────────
type HolidayType = "national" | "islamic" | "local";

type Holiday = {
  month: number;
  day: number;
  year?: number;
  nameAr: string;
  nameEn: string;
  type: HolidayType;
  noteAr?: string;
  noteEn?: string;
};

// ─── Holidays Data ────────────────────────────────────────────────────────────
// Islamic holiday dates are approximate (تقريبية) — subject to moon sighting
const HOLIDAYS: Holiday[] = [
  // ── وطنية ثابتة ───────────────────────────────────────────────
  { month: 1,  day: 1,  nameAr: "يوم الاستقلال", nameEn: "Independence Day", type: "national", noteAr: "استقلال السودان 1956", noteEn: "Sudan Independence 1956" },
  { month: 4,  day: 6,  nameAr: "ذكرى ثورة أبريل", nameEn: "April Revolution Day", type: "national", noteAr: "انتفاضة أبريل 1985", noteEn: "April Uprising 1985" },
  { month: 12, day: 19, nameAr: "ذكرى ثورة ديسمبر", nameEn: "December Revolution Day", type: "national", noteAr: "ثورة ديسمبر 2018", noteEn: "December Revolution 2018" },

  // ── إسلامية 2025 ─────────────────────────────────────────────
  { month: 1,  day: 1,  year: 2025, nameAr: "رأس السنة الهجرية 1447", nameEn: "Islamic New Year 1447", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 3,  day: 30, year: 2025, nameAr: "عيد الفطر المبارك", nameEn: "Eid Al-Fitr", type: "islamic", noteAr: "1-3 شوال 1446 — تقريبي", noteEn: "1-3 Shawwal 1446 — Approx." },
  { month: 3,  day: 31, year: 2025, nameAr: "عيد الفطر (ثاني أيام)", nameEn: "Eid Al-Fitr (Day 2)", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 4,  day: 1,  year: 2025, nameAr: "عيد الفطر (ثالث أيام)", nameEn: "Eid Al-Fitr (Day 3)", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 6,  day: 5,  year: 2025, nameAr: "يوم عرفة", nameEn: "Arafat Day", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 6,  day: 6,  year: 2025, nameAr: "عيد الأضحى المبارك", nameEn: "Eid Al-Adha", type: "islamic", noteAr: "10 ذي الحجة 1446 — تقريبي", noteEn: "10 Dhu al-Hijjah 1446 — Approx." },
  { month: 6,  day: 7,  year: 2025, nameAr: "عيد الأضحى (ثاني أيام)", nameEn: "Eid Al-Adha (Day 2)", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 6,  day: 8,  year: 2025, nameAr: "عيد الأضحى (ثالث أيام)", nameEn: "Eid Al-Adha (Day 3)", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 6,  day: 26, year: 2025, nameAr: "رأس السنة الهجرية 1447", nameEn: "Islamic New Year 1447", type: "islamic", noteAr: "1 محرم 1447 — تقريبي", noteEn: "1 Muharram 1447 — Approx." },
  { month: 9,  day: 4,  year: 2025, nameAr: "المولد النبوي الشريف", nameEn: "Prophet's Birthday", type: "islamic", noteAr: "12 ربيع الأول 1447 — تقريبي", noteEn: "12 Rabi' al-Awwal 1447 — Approx." },

  // ── إسلامية 2026 ─────────────────────────────────────────────
  { month: 2,  day: 18, year: 2026, nameAr: "بداية شهر رمضان المبارك", nameEn: "Start of Ramadan", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 3,  day: 20, year: 2026, nameAr: "عيد الفطر المبارك", nameEn: "Eid Al-Fitr", type: "islamic", noteAr: "1-3 شوال 1447 — تقريبي", noteEn: "1-3 Shawwal 1447 — Approx." },
  { month: 3,  day: 21, year: 2026, nameAr: "عيد الفطر (ثاني أيام)", nameEn: "Eid Al-Fitr (Day 2)", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 3,  day: 22, year: 2026, nameAr: "عيد الفطر (ثالث أيام)", nameEn: "Eid Al-Fitr (Day 3)", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 5,  day: 26, year: 2026, nameAr: "يوم عرفة", nameEn: "Arafat Day", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 5,  day: 27, year: 2026, nameAr: "عيد الأضحى المبارك", nameEn: "Eid Al-Adha", type: "islamic", noteAr: "10 ذي الحجة 1447 — تقريبي", noteEn: "10 Dhu al-Hijjah 1447 — Approx." },
  { month: 5,  day: 28, year: 2026, nameAr: "عيد الأضحى (ثاني أيام)", nameEn: "Eid Al-Adha (Day 2)", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 5,  day: 29, year: 2026, nameAr: "عيد الأضحى (ثالث أيام)", nameEn: "Eid Al-Adha (Day 3)", type: "islamic", noteAr: "تقريبي", noteEn: "Approximate" },
  { month: 6,  day: 15, year: 2026, nameAr: "رأس السنة الهجرية 1448", nameEn: "Islamic New Year 1448", type: "islamic", noteAr: "1 محرم 1448 — تقريبي", noteEn: "1 Muharram 1448 — Approx." },
  { month: 8,  day: 24, year: 2026, nameAr: "المولد النبوي الشريف", nameEn: "Prophet's Birthday", type: "islamic", noteAr: "12 ربيع الأول 1448 — تقريبي", noteEn: "12 Rabi' al-Awwal 1448 — Approx." },

  // ── محلية / ذكرى ─────────────────────────────────────────────
  { month: 1,  day: 1,  nameAr: "رأس السنة الميلادية", nameEn: "New Year's Day", type: "local" },
  { month: 3,  day: 8,  nameAr: "يوم المرأة العالمي", nameEn: "International Women's Day", type: "local" },
  { month: 4,  day: 6,  nameAr: "يوم الأم في السودان", nameEn: "Mother's Day in Sudan", type: "local" },
  { month: 6,  day: 1,  nameAr: "يوم الطفل العالمي", nameEn: "International Children's Day", type: "local" },
  { month: 9,  day: 1,  nameAr: "بدء العام الدراسي", nameEn: "Start of School Year", type: "local" },
  { month: 10, day: 1,  nameAr: "يوم الرياضة العالمي", nameEn: "World Sports Day", type: "local" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}
function getHolidaysForDay(day: number, month: number, year: number): Holiday[] {
  return HOLIDAYS.filter(h =>
    h.month === month && h.day === day &&
    (h.year === undefined || h.year === year)
  );
}
function getHolidaysForMonth(month: number, year: number): Holiday[] {
  return HOLIDAYS.filter(h =>
    h.month === month &&
    (h.year === undefined || h.year === year)
  ).sort((a, b) => a.day - b.day);
}

// ─── Day Cell ─────────────────────────────────────────────────────────────────
function DayCell({
  day, month, year, today, onPress, typeConfig
}: {
  day: number | null;
  month: number;
  year: number;
  today: { d: number; m: number; y: number };
  onPress: (d: number) => void;
  typeConfig: any;
}) {
  if (!day) return <View style={cal.dayCell} />;

  const holidays = getHolidaysForDay(day, month, year);
  const isToday = day === today.d && month === today.m && year === today.y;
  const isWeekend = [0, 6].includes(new Date(year, month - 1, day).getDay());
  const firstHoliday = holidays[0];

  return (
    <AnimatedPress
      style={[
        cal.dayCell,
        isToday && cal.dayCellToday,
        firstHoliday && { backgroundColor: typeConfig[firstHoliday.type].color + "18" },
      ]}
      onPress={() => {
        onPress(day);
      }}
      scaleDown={0.92}
    >
      <Text style={[
        cal.dayNum,
        isToday && cal.dayNumToday,
        isWeekend && !isToday && { color: Colors.accent },
        firstHoliday && !isToday && { color: typeConfig[firstHoliday.type].color, fontFamily: "Cairo_700Bold" },
      ]}>
        {day}
      </Text>
      {holidays.length > 0 && (
        <View style={cal.dotsRow}>
          {holidays.slice(0, 3).map((h, i) => (
            <View key={i} style={[cal.dot, { backgroundColor: typeConfig[h.type].color }]} />
          ))}
        </View>
      )}
    </AnimatedPress>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { t, isRTL, lang, tr } = useLang();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const now = new Date();

  const months = t('calendar', 'months');
  const dayNames = t('calendar', 'days');

  const typeConfig: Record<HolidayType, { color: string; label: string; icon: string }> = {
    national: { color: Colors.accent,    label: t('calendar', 'national'),  icon: "flag" },
    islamic:  { color: Colors.primary,   label: t('calendar', 'islamic'), icon: "moon" },
    local:    { color: "#7B68EE",        label: t('calendar', 'local'), icon: "star" },
  };

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());

  const today = { d: now.getDate(), m: now.getMonth() + 1, y: now.getFullYear() };

  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const totalDays = getDaysInMonth(viewYear, viewMonth);

  const calCells = useMemo(() => {
    const cells: (number | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= totalDays; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth, firstDay, totalDays]);

  const monthHolidays = getHolidaysForMonth(viewMonth, viewYear);
  const selectedHolidays = selectedDay
    ? getHolidaysForDay(selectedDay, viewMonth, viewYear)
    : [];

  const prevMonth = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  };
  const goToday = () => {
    setViewYear(today.y); setViewMonth(today.m); setSelectedDay(today.d);
  };

  const flexDirection = isRTL ? "row-reverse" : "row";
  const textAlign = isRTL ? "right" : "left";

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 12, flexDirection }]}>
        <AnimatedPress onPress={goToday} style={s.todayBtn} scaleDown={0.92}>
          <Text style={s.todayBtnText}>{t('calendar', 'today')}</Text>
        </AnimatedPress>
        <Text style={s.headerTitle}>{t('calendar', 'title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 100 : 120 }}>
        {/* Month navigator */}
        <View style={[s.monthNav, { flexDirection }]}>
          <AnimatedPress onPress={isRTL ? nextMonth : prevMonth} style={s.navBtn} scaleDown={0.92}>
            <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={22} color={Colors.primary} />
          </AnimatedPress>
          <View style={s.monthTitleWrap}>
            <Text style={s.monthTitle}>{months[viewMonth - 1]}</Text>
            <Text style={s.yearText}>{viewYear}</Text>
          </View>
          <AnimatedPress onPress={isRTL ? prevMonth : nextMonth} style={s.navBtn} scaleDown={0.92}>
            <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={22} color={Colors.primary} />
          </AnimatedPress>
        </View>

        {/* Calendar Grid */}
        <Animated.View key={`${viewYear}-${viewMonth}`} entering={FadeIn.duration(300)} style={s.calCard}>
          {/* Day names header */}
          <View style={[cal.weekRow, { flexDirection }]}>
            {dayNames.map((d: string, i: number) => (
              <View key={i} style={cal.weekHeader}>
                <Text style={[
                  cal.weekHeaderText,
                  (isRTL ? (d === "ج" || d === "س") : (i === 5 || i === 6)) && { color: Colors.accent },
                ]}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Day cells */}
          {Array.from({ length: calCells.length / 7 }, (_, rowIdx) => (
            <View key={rowIdx} style={[cal.weekRow, { flexDirection }]}>
              {calCells.slice(rowIdx * 7, rowIdx * 7 + 7).map((day, colIdx) => (
                <DayCell
                  key={colIdx}
                  day={day}
                  month={viewMonth}
                  year={viewYear}
                  today={today}
                  onPress={setSelectedDay}
                  typeConfig={typeConfig}
                />
              ))}
            </View>
          ))}
        </Animated.View>

        {/* Selected day events */}
        {selectedDay && selectedHolidays.length > 0 && (
          <View style={s.selectedCard}>
            <Text style={[s.selectedDateTitle, { textAlign }]}>
              {isRTL ? `${selectedDay} ${months[viewMonth - 1]} ${viewYear}` : `${months[viewMonth - 1]} ${selectedDay}, ${viewYear}`}
            </Text>
            {selectedHolidays.map((h, i) => (
              <View key={i} style={[s.eventRow, i > 0 && s.eventRowBorder, { flexDirection }]}>
                <View style={[s.eventDot, { backgroundColor: typeConfig[h.type].color }]} />
                <View style={[s.eventInfo, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                  <Text style={[s.eventName, { textAlign }]}>{tr(h.nameAr, h.nameEn)}</Text>
                  {(h.noteAr || h.noteEn) && <Text style={[s.eventNote, { textAlign }]}>{tr(h.noteAr || "", h.noteEn || "")}</Text>}
                </View>
                <View style={[s.eventBadge, { backgroundColor: typeConfig[h.type].color + "1A" }]}>
                  <Text style={[s.eventBadgeText, { color: typeConfig[h.type].color }]}>
                    {typeConfig[h.type].label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Legend */}
        <View style={[s.legendRow, { flexDirection }]}>
          {(Object.entries(typeConfig) as [HolidayType, typeof typeConfig[HolidayType]][]).map(([key, cfg]) => (
            <View key={key} style={[s.legendItem, { flexDirection }]}>
              <View style={[s.legendDot, { backgroundColor: cfg.color }]} />
              <Text style={s.legendText}>{cfg.label}</Text>
            </View>
          ))}
        </View>

        {/* Month events list */}
        {monthHolidays.length > 0 && (
          <View style={s.listSection}>
            <View style={[s.sectionHeader, { flexDirection }]}>
              <View style={[s.sectionDot, { backgroundColor: Colors.primary }]} />
              <Text style={s.sectionTitle}>{isRTL ? `مناسبات ${months[viewMonth - 1]}` : `Events in ${months[viewMonth - 1]}`}</Text>
            </View>
            {monthHolidays.map((h, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(i * 60).springify().damping(18)}>
                <AnimatedPress
                  style={[s.listItem, { borderRightColor: isRTL ? typeConfig[h.type].color : "transparent", borderLeftColor: !isRTL ? typeConfig[h.type].color : "transparent", borderLeftWidth: isRTL ? 1 : 4, borderRightWidth: isRTL ? 4 : 1, flexDirection }]}
                  onPress={() => setSelectedDay(h.day)}
                >
                  <View style={[s.listBadge, { backgroundColor: typeConfig[h.type].color }]}>
                    <Text style={s.listBadgeDay}>{h.day}</Text>
                    <Text style={s.listBadgeMon}>{months[viewMonth - 1].slice(0, 3)}</Text>
                  </View>
                  <View style={[s.listInfo, { alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                    <Text style={[s.listName, { textAlign }]}>{tr(h.nameAr, h.nameEn)}</Text>
                    {(h.noteAr || h.noteEn) && <Text style={[s.listNote, { textAlign }]}>{tr(h.noteAr || "", h.noteEn || "")}</Text>}
                    <View style={[s.listTypePill, { backgroundColor: typeConfig[h.type].color + "18" }]}>
                      <Text style={[s.listTypeText, { color: typeConfig[h.type].color }]}>
                        {typeConfig[h.type].label}
                      </Text>
                    </View>
                  </View>
                </AnimatedPress>
              </Animated.View>
            ))}
          </View>
        )}

        {monthHolidays.length === 0 && (
          <View style={s.emptyWrap}>
            <Ionicons name="calendar-outline" size={40} color={Colors.textMuted} />
            <Text style={s.emptyText}>{t('calendar', 'noEvents')}</Text>
          </View>
        )}

        <Text style={s.disclaimer}>
          {t('calendar', 'holidayDisclaimer')}
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Calendar Styles ──────────────────────────────────────────────────────────
const CELL_SIZE = (Platform.OS === "web" ? Math.min(480, 400) : 360) / 7;

const cal = StyleSheet.create({
  weekRow: {
    borderBottomWidth: 0,
  },
  weekHeader: {
    width: CELL_SIZE, alignItems: "center", paddingBottom: 8,
  },
  weekHeaderText: {
    fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary,
  },
  dayCell: {
    width: CELL_SIZE, height: CELL_SIZE,
    alignItems: "center", justifyContent: "center",
    borderRadius: 10, gap: 2,
  },
  dayCellToday: {
    backgroundColor: Colors.primary,
  },
  dayNum: {
    fontFamily: "Cairo_500Medium", fontSize: 15, color: Colors.textPrimary,
  },
  dayNumToday: {
    color: "#fff", fontFamily: "Cairo_700Bold",
  },
  dotsRow: { flexDirection: "row", gap: 2, justifyContent: "center" },
  dot: { width: 4, height: 4, borderRadius: 2 },
});

// ─── Page Styles ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: Colors.bg,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  todayBtn: {
    backgroundColor: Colors.primary + "14", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: Colors.primary + "28",
  },
  todayBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },
  monthNav: {
    alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 16,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.primary + "12",
    alignItems: "center", justifyContent: "center",
  },
  monthTitleWrap: { alignItems: "center", gap: 2 },
  monthTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  yearText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted },
  calCard: {
    marginHorizontal: 16, backgroundColor: Colors.cardBg,
    borderRadius: 20, padding: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
    borderWidth: 1, borderColor: Colors.divider,
  },
  legendRow: {
    justifyContent: "center",
    gap: 20, paddingVertical: 14, paddingHorizontal: 20,
  },
  legendItem: { alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  selectedCard: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: Colors.cardBg, borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: Colors.divider,
  },
  selectedDateTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary,
    marginBottom: 12,
  },
  eventRow: {
    alignItems: "center", gap: 10, paddingVertical: 8,
  },
  eventRowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  eventDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  eventInfo: { flex: 1 },
  eventName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  eventNote: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  eventBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  eventBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  listSection: { marginHorizontal: 16, marginTop: 8 },
  sectionHeader: { alignItems: "center", gap: 8, marginBottom: 10 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  listItem: {
    backgroundColor: Colors.cardBg, borderRadius: 16,
    alignItems: "center", gap: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  listBadge: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  listBadgeDay: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  listBadgeMon: { fontFamily: "Cairo_400Regular", fontSize: 10, color: "#fff", opacity: 0.9 },
  listInfo: { flex: 1, gap: 4 },
  listName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  listNote: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  listTypePill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  listTypeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10 },
  emptyWrap: { alignItems: "center", gap: 12, paddingVertical: 30 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted },
  disclaimer: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted,
    textAlign: "center", paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4,
  },
});
