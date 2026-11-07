/** شريط «مكالمة جارية» العائم: يظهر في كل الشاشات عند تصغير المكالمة، والضغط يعيدك إليها */
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLiveCall, onLiveCall, type LiveCall } from "@/lib/calls";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function ActiveCallPill() {
  const [c, setC] = useState<LiveCall | null>(getLiveCall());
  const [now, setNow] = useState(Date.now());
  const pathname = usePathname() || "";
  const insets = useSafeAreaInsets();
  const pulse = useSharedValue(1);
  useEffect(() => onLiveCall(setC), []);
  useEffect(() => {
    if (!c) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    pulse.value = withRepeat(withSequence(withTiming(0.35, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
    return () => clearInterval(t);
  }, [c?.id]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));
  if (!c || pathname.startsWith("/call")) return null;
  const back = () => router.navigate({ pathname: "/call", params: { callId: String(c.id), role: c.role, name: c.name, avatar: c.avatar || "" } } as any);
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={[s.wrap, { top: insets.top + 6 }]} pointerEvents="box-none">
      <Pressable onPress={back} style={s.pill} accessibilityRole="button" accessibilityLabel={`العودة للمكالمة مع ${c.name}`}>
        <Animated.View style={[s.dot, dot]} />
        <Ionicons name="call" size={15} color="#fff" />
        <Text style={s.text} numberOfLines={1}>مكالمة جارية مع {c.name}</Text>
        <Text style={s.time}>{fmt(Math.max(0, Math.round((now - c.since) / 1000)))}</Text>
        <View style={s.backBtn}><Text style={s.backTxt}>عودة</Text></View>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 9998, alignItems: "center" },
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#0B6B49", borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 520, width: "100%",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 12 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#4ADE80" },
  text: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff", textAlign: "right" },
  time: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#BBF7D0", writingDirection: "ltr" },
  backBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  backTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
});
