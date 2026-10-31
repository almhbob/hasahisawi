// ملصق المسابقة للمشاركة على مواقع التواصل (مربع 1:1). ألوان ثابتة حسب المناسبة
// واتجاه مثبّت حتى يُحفظ كصورة بالشكل نفسه على الهاتف والويب.
import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { themeOf, publicContestUrl, type Contest } from "@/lib/contests";

export const POSTER = 320;

const ContestPoster = forwardRef<View, { contest: Contest; winnerName?: string | null }>(function ContestPoster({ contest, winnerName }, ref) {
  const t = themeOf(contest);
  const ends = new Date(contest.ends_at);
  return (
    <View ref={ref} collapsable={false} style={[st.root, { direction: "ltr" }]}>
      <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* زخرفة: دوائر وخطوط خفيفة */}
      <View style={[st.ring, { width: 260, height: 260, borderRadius: 130, top: -90, left: -90, borderColor: t.accent }]} />
      <View style={[st.ring, { width: 180, height: 180, borderRadius: 90, bottom: -60, right: -50, borderColor: t.accent }]} />

      <View style={st.head}>
        <View style={[st.badge, { borderColor: t.accent }]}><Ionicons name={t.icon as any} size={20} color={t.accent} /></View>
        <Text style={[st.occasion, { color: t.accent }]} numberOfLines={1}>
          {contest.kind === "sponsored" && contest.sponsor_name ? `برعاية ${contest.sponsor_name}` : t.label}
        </Text>
      </View>

      <Text style={st.title} numberOfLines={3}>{winnerName ? "🏆 الفائز في" : "🏆"} {contest.title}</Text>
      {winnerName ? (
        <Text style={[st.winner, { color: t.accent }]} numberOfLines={1}>{winnerName}</Text>
      ) : contest.prize ? (
        <View style={[st.prize, { backgroundColor: t.accent }]}>
          <Text style={st.prizeText} numberOfLines={2}>الجائزة: {contest.prize}</Text>
        </View>
      ) : null}

      <View style={st.foot}>
        <View style={{ flex: 1 }}>
          <Text style={st.cta}>{winnerName ? "تابع مسابقاتنا القادمة" : "شارك الآن من تطبيق"}</Text>
          <Text style={[st.app, { color: t.accent }]}>حصاحيصاوي</Text>
          {!winnerName && (
            <Text style={st.date}>حتى {ends.getDate()}/{ends.getMonth() + 1}/{ends.getFullYear()}</Text>
          )}
        </View>
        <View style={st.qr}><QRCode value={publicContestUrl(contest.id)} size={62} color="#0B1F3A" backgroundColor="#FFFFFF" /></View>
      </View>
    </View>
  );
});

export default ContestPoster;

const st = StyleSheet.create({
  root: { width: POSTER, height: POSTER, borderRadius: 24, overflow: "hidden", padding: 20, justifyContent: "space-between" },
  ring: { position: "absolute", borderWidth: 14, opacity: 0.12 },
  head: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  badge: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  occasion: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 24, lineHeight: 36, color: "#FFFFFF", textAlign: "right" },
  winner: { fontFamily: "Cairo_700Bold", fontSize: 26, textAlign: "right" },
  prize: { alignSelf: "flex-end", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  prizeText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#1F1300", textAlign: "right" },
  foot: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 12 },
  cta: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  app: { fontFamily: "Cairo_700Bold", fontSize: 20, textAlign: "right" },
  date: { fontFamily: "Cairo_500Medium", fontSize: 11, color: "rgba(255,255,255,0.75)", textAlign: "right" },
  qr: { padding: 5, borderRadius: 8, backgroundColor: "#FFFFFF" },
});
