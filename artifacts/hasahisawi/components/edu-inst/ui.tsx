// عناصر واجهة بيئة المؤسسات التعليمية + شبكة جدول الحصص القابلة لإعادة الاستخدام.
import React from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { EDU, EDU_DEEP, EDU_GOLD, DAY_AR, periodTime, todayIndex, type Settings, type Slot } from "@/lib/edu-inst";

export function Hero({ title, sub, kicker, insetTop, right, children, onBack }: {
  title: string; sub?: string; kicker?: string; insetTop: number; right?: React.ReactNode; children?: React.ReactNode; onBack?: () => void;
}) {
  return (
    <LinearGradient colors={[EDU_DEEP, EDU]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[s.hero, { paddingTop: insetTop + 8 }]}>
      <View style={s.rowB}>
        <Pressable accessibilityRole="button" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)))} style={s.iconBtn} hitSlop={8} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </Pressable>
        {right ?? <View style={{ width: 40 }} />}
      </View>
      {!!kicker && <Text style={s.kicker}>{kicker}</Text>}
      <Text style={s.heroTitle}>{title}</Text>
      {!!sub && <Text style={s.heroSub}>{sub}</Text>}
      {children}
    </LinearGradient>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function H({ children, action, onAction }: { children: React.ReactNode; action?: string; onAction?: () => void }) {
  return (
    <View style={[s.rowB, { marginTop: 18, marginBottom: 8 }]}>
      <View style={[s.rowR, { gap: 8 }]}><View style={s.bar} /><Text style={s.h}>{children}</Text></View>
      {!!action && <Pressable onPress={onAction} hitSlop={8}><Text style={s.link}>{action}</Text></Pressable>}
    </View>
  );
}
export function Pill({ label, on, onPress, color = EDU, icon }: { label: string; on: boolean; onPress: () => void; color?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} style={[s.pill, on && { backgroundColor: color, borderColor: color }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      {!!icon && <Ionicons name={icon} size={14} color={on ? "#fff" : Colors.textSecondary} />}
      <Text style={[s.pillT, on && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}
export function Btn({ label, onPress, icon, color = EDU, ghost, busy, small, disabled }: {
  label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; color?: string; ghost?: boolean; busy?: boolean; small?: boolean; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={busy || disabled} style={[s.btn, small && s.btnSm, ghost ? { borderWidth: 1, borderColor: color + "66", backgroundColor: color + "0D" } : { backgroundColor: color }, (busy || disabled) && { opacity: 0.55 }]}>
      {busy ? <ActivityIndicator color={ghost ? color : "#fff"} size="small" /> : icon ? <Ionicons name={icon} size={small ? 15 : 17} color={ghost ? color : "#fff"} /> : null}
      <Text style={[s.btnT, small && { fontSize: 12.5 }, { color: ghost ? color : "#fff" }]}>{label}</Text>
    </Pressable>
  );
}
export function Field({ label, value, onChange, placeholder, multiline, keyboard }: { label?: string; value: string; onChange: (t: string) => void; placeholder?: string; multiline?: boolean; keyboard?: any }) {
  return (
    <View>
      {!!label && <Text style={s.label}>{label}</Text>}
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textMuted} multiline={multiline} keyboardType={keyboard}
        style={[s.input, multiline && { minHeight: 90, textAlignVertical: "top" }]} />
    </View>
  );
}
export function Empty({ icon = "school-outline", title, sub }: { icon?: keyof typeof Ionicons.glyphMap; title: string; sub?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 28, gap: 6 }}>
      <Ionicons name={icon} size={38} color={EDU + "77"} />
      <Text style={s.emptyT}>{title}</Text>
      {!!sub && <Text style={s.muted}>{sub}</Text>}
    </View>
  );
}
export function Stat({ n, l, icon, color = EDU }: { n: number | string; l: string; icon: keyof typeof Ionicons.glyphMap; color?: string }) {
  return (
    <View style={s.stat}>
      <View style={[s.statI, { backgroundColor: color + "14" }]}><Ionicons name={icon} size={18} color={color} /></View>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.muted}>{l}</Text>
    </View>
  );
}

/** شبكة الجدول: الأيام صفوف، الحصص أعمدة (تمرير أفقي) — تظهر المادة والمعلم أو الفصل */
export function TimetableGrid({ settings, slots, mode, onCell, highlightToday = true }: {
  settings: Settings; slots: Slot[]; mode: "class" | "teacher"; onCell?: (day: number, period: number, slot?: Slot) => void; highlightToday?: boolean;
}) {
  const today = todayIndex();
  const periods = Array.from({ length: settings.periods }, (_, i) => i + 1);
  const map = new Map(slots.map((x) => [`${x.day}:${x.period}`, x]));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ transform: [{ scaleX: -1 }] }}>
      <View style={{ transform: [{ scaleX: -1 }] }}>
        <View style={s.gRow}>
          <View style={[s.gHead, s.gDay]}><Text style={s.gHeadT}>اليوم</Text></View>
          {periods.map((p) => (
            <React.Fragment key={p}>
              <View style={[s.gHead, s.gCell]}>
                <Text style={s.gHeadT}>الحصة {p}</Text>
                <Text style={s.gTime}>{periodTime(settings, p)}</Text>
              </View>
              {settings.breaks?.some((b) => b.after === p) && <View style={[s.gHead, s.gBreak]}><Ionicons name="cafe-outline" size={14} color="rgba(255,255,255,0.85)" accessibilityLabel={settings.breaks.find((b) => b.after === p)?.label || "استراحة"} /></View>}
            </React.Fragment>
          ))}
        </View>
        {settings.days.map((d) => {
          const isToday = highlightToday && d === today;
          return (
            <View key={d} style={s.gRow}>
              <View style={[s.gDayCell, s.gDay, isToday && { backgroundColor: EDU_GOLD }]}>
                <Text style={[s.gDayT, isToday && { color: "#fff" }]}>{DAY_AR[d]}</Text>
                {isToday && <Text style={[s.gTime, { color: "#fff" }]}>اليوم</Text>}
              </View>
              {periods.map((p) => {
                const x = map.get(`${d}:${p}`);
                return (
                  <React.Fragment key={p}>
                    <Pressable onPress={onCell ? () => onCell(d, p, x) : undefined} disabled={!onCell}
                      style={[s.gCell, s.gSlot, x ? { backgroundColor: x.subject_color + "1C", borderColor: x.subject_color + "66" } : null, isToday && !x && { backgroundColor: EDU_GOLD + "0F" }]}
                      accessibilityLabel={`${DAY_AR[d]} الحصة ${p}${x ? ` ${x.subject_name}` : " فارغة"}`}>
                      {x ? (
                        <>
                          <Text style={[s.gSub, { color: x.subject_color }]} numberOfLines={1}>{x.subject_name}</Text>
                          <Text style={s.gWho} numberOfLines={1}>{mode === "class" ? x.teacher_name || "—" : x.class_name}</Text>
                          {!!x.room && <Text style={s.gRoom} numberOfLines={1}>{x.room}</Text>}
                        </>
                      ) : onCell ? <Ionicons name="add" size={18} color={Colors.textMuted} /> : null}
                    </Pressable>
                    {settings.breaks?.some((b) => b.after === p) && <View style={[s.gBreak, { backgroundColor: Colors.divider + "55" }]} />}
                  </React.Fragment>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

export const eduStyles = StyleSheet.create({
  rowR: { flexDirection: "row-reverse", alignItems: "center" },
  wrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 19 },
  t: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
});

const CELL = 92;
const s = StyleSheet.create({
  rowR: { flexDirection: "row-reverse", alignItems: "center" },
  rowB: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  hero: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  kicker: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: EDU_GOLD, textAlign: "right", marginTop: 10 },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#fff", textAlign: "right", lineHeight: 36 },
  heroSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", textAlign: "right", lineHeight: 21 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider },
  bar: { width: 4, height: 18, borderRadius: 2, backgroundColor: EDU_GOLD },
  h: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13, color: EDU },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  pillT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  btn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, height: 46, borderRadius: 14 },
  btnSm: { height: 36, paddingHorizontal: 12, borderRadius: 11 },
  btnT: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "center" },
  muted: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  stat: { flex: 1, alignItems: "center", gap: 2, backgroundColor: Colors.cardBg, borderRadius: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.divider },
  statI: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  statN: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  gRow: { flexDirection: "row-reverse" },
  gHead: { backgroundColor: EDU, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  gHeadT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  gTime: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "rgba(255,255,255,0.85)" },
  gRoom: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  gDay: { width: 74 },
  gDayCell: { backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: Colors.divider },
  gDayT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textPrimary },
  gCell: { width: CELL, minHeight: 64 },
  gSlot: { margin: 2, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center", padding: 4 },
  gSub: { fontFamily: "Cairo_700Bold", fontSize: 12, textAlign: "center" },
  gWho: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "center" },
  gBreak: { width: 22, alignItems: "center", justifyContent: "center" },
});
