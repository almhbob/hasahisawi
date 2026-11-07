/**
 * بطاقة الإيقاف المؤقت بعد محاولات دخول خاطئة: عدّاد تنازلي دائري، شريط تقدّم،
 * وإرشاد لاستعادة كلمة المرور. تختفي تلقائياً عند انتهاء المهلة.
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { NeuInset, NeuRaised } from "./neu";

export function useLockout() {
  const [until, setUntil] = useState(0);
  const [total, setTotal] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) { setUntil(0); clearInterval(t); }
    }, 250);
    return () => clearInterval(t);
  }, [until]);
  const left = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  return {
    locked: left > 0,
    left,
    total,
    lock: (seconds: number) => { setTotal(seconds); setNow(Date.now()); setUntil(Date.now() + seconds * 1000); },
  };
}

export const fmtWait = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function LockoutCard({ left, total, onForgot }: { left: number; total: number; onForgot?: () => void }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const pct = total ? Math.max(0, Math.min(1, left / total)) : 0;

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)}>
      <NeuRaised radius={20} depth={7} style={s.card}>
        <View style={s.row}>
          <Animated.View style={[s.iconWrap, pulseStyle]}>
            <Ionicons name="lock-closed" size={22} color="#946B00" />
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>تم إيقاف المحاولات مؤقتاً</Text>
            <Text style={s.body}>حمايةً لحسابك بعد 3 محاولات خاطئة. يمكنك المحاولة مجدداً بعد انتهاء العدّاد.</Text>
          </View>
          <NeuInset radius={16} style={s.timer}>
            <Text style={s.timerNum} accessibilityLiveRegion="polite" accessibilityLabel={`الوقت المتبقي ${left} ثانية`}>{fmtWait(left)}</Text>
          </NeuInset>
        </View>
        <View style={s.track}><View style={[s.fill, { width: `${pct * 100}%` }]} /></View>
        {onForgot ? (
          <TouchableOpacity onPress={onForgot} style={s.forgot} accessibilityRole="button">
            <Ionicons name="key-outline" size={15} color={Colors.primary} />
            <Text style={s.forgotText}>نسيت كلمة المرور؟ استعدها الآن</Text>
          </TouchableOpacity>
        ) : null}
      </NeuRaised>
    </Animated.View>
  );
}

/** نقاط المحاولات المتبقية: ● ● ○ */
export function AttemptsDots({ left, max = 3 }: { left: number; max?: number }) {
  return (
    <View style={s.dotsRow} accessibilityLabel={`تبقّت ${left} من ${max} محاولات`}>
      <Text style={s.dotsLabel}>المحاولات المتبقية</Text>
      {Array.from({ length: max }).map((_, i) => (
        <View key={i} style={[s.dot, { backgroundColor: i < left ? (left === 1 ? "#E8A900" : Colors.primary) : Colors.divider }]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: 14, gap: 12 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  iconWrap: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#F59E0B1F", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#946B00", textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 19 },
  timer: { paddingHorizontal: 12, paddingVertical: 8, minWidth: 66, alignItems: "center" },
  timerNum: { fontFamily: "Cairo_700Bold", fontSize: 19, color: "#946B00", writingDirection: "ltr" },
  track: { height: 5, borderRadius: 3, backgroundColor: Colors.divider, overflow: "hidden", flexDirection: "row-reverse" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: "#E8A900" },
  forgot: { flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "center" },
  forgotText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  dotsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "flex-end", marginTop: -4 },
  dotsLabel: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, marginLeft: 4 },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
