/** 🎟️ تذاكري: تذاكر المباريات برمز QR يُمسح عند بوابة الملعب */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { confirmAction, notify } from "@/lib/xplatform";
import { neu } from "@/components/auth/neu";
import { TeamBadge } from "@/components/leagues/ui";
import { fmtKickoff, LEAGUE_ACCENT, leaguesApi, money, ticketQr, type Ticket } from "@/lib/leagues-api";

const STATE: Record<string, { label: string; color: string; icon: any }> = {
  reserved: { label: "بانتظار تأكيد الدفع", color: "#E8A900", icon: "time" },
  paid: { label: "مؤكدة — جاهزة للدخول", color: "#00966A", icon: "checkmark-circle" },
  used: { label: "استُخدمت", color: "#6B7D75", icon: "enter" },
  cancelled: { label: "ملغاة", color: "#D93636", icon: "close-circle" },
};

export default function MyTickets() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [items, setItems] = useState<Ticket[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) { setItems([]); return; }
    try { setItems((await leaguesApi.myTickets(token)).tickets); } catch (e: any) { notify("تعذّر التحميل", e?.message); setItems([]); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={s.title}>تذاكري</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={LEAGUE_ACCENT} />}>
        {items === null ? <ActivityIndicator color={LEAGUE_ACCENT} /> : items.length === 0 ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 50 }}>
            <Ionicons name="ticket-outline" size={50} color={Colors.textMuted} />
            <Text style={s.muted}>لا توجد تذاكر بعد</Text>
            <TouchableOpacity onPress={() => router.push("/leagues" as any)}><Text style={s.link}>تصفّح الدوريات والمباريات</Text></TouchableOpacity>
          </View>
        ) : items.map((t, i) => {
          const st = STATE[t.status];
          const expanded = open === t.code || (open === null && i === 0 && t.status === "paid");
          return (
            <Animated.View key={t.id} entering={FadeInDown.delay(Math.min(i, 6) * 50)}>
              <Pressable onPress={() => setOpen(expanded ? "" : t.code)} style={s.ticket} accessibilityRole="button" accessibilityLabel={`تذكرة ${t.home_name} ضد ${t.away_name}، ${st.label}`}>
                <LinearGradient colors={["#004D36", "#00301F"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.top}>
                  <Text style={s.league} numberOfLines={1}>{t.league_name}{t.stage ? ` · ${t.stage}` : ""}</Text>
                  <View style={s.teams}>
                    <View style={s.team}><TeamBadge team={{ id: 1, name: t.home_name || "", logo_url: t.home_logo } as any} size={42} /><Text style={s.teamName} numberOfLines={1}>{t.home_name}</Text></View>
                    <Text style={s.vs}>×</Text>
                    <View style={s.team}><TeamBadge team={{ id: 2, name: t.away_name || "", logo_url: t.away_logo } as any} size={42} /><Text style={s.teamName} numberOfLines={1}>{t.away_name}</Text></View>
                  </View>
                  <Text style={s.when}>{fmtKickoff(t.kickoff)}{t.venue ? ` · ${t.venue}` : ""}</Text>
                </LinearGradient>
                {/* الحافة المثقوبة */}
                <View style={s.perf}><View style={[s.hole, { right: -12 }]} /><View style={s.dash} /><View style={[s.hole, { left: -12 }]} /></View>
                <View style={s.bottom}>
                  <View style={s.metaRow}>
                    <View><Text style={s.metaLabel}>الفئة</Text><Text style={s.metaVal}>{t.type_name}</Text></View>
                    <View><Text style={s.metaLabel}>السعر</Text><Text style={s.metaVal}>{money(t.price)}</Text></View>
                    <View><Text style={s.metaLabel}>الحامل</Text><Text style={s.metaVal} numberOfLines={1}>{t.holder_name}</Text></View>
                  </View>
                  <View style={[s.state, { backgroundColor: st.color + "16" }]}><Ionicons name={st.icon} size={16} color={st.color} /><Text style={[s.stateText, { color: st.color }]}>{st.label}</Text></View>
                  {expanded && t.status !== "cancelled" && (
                    <View style={s.qrBox}>
                      <View style={{ opacity: t.status === "paid" ? 1 : 0.35 }}><QRCode value={ticketQr(t.code)} size={170} ecl="M" /></View>
                      <Text style={s.code} selectable>{t.code}</Text>
                      <Text style={s.muted}>{t.status === "paid" ? "اعرض الرمز عند البوابة — يُستخدم مرة واحدة" : t.status === "used" ? `دخلت ${t.used_at ? new Date(t.used_at).toLocaleString("ar-SD") : ""}` : "ادفع للجنة المنظمة ليُفعَّل الرمز"}</Text>
                      {t.status === "reserved" && (
                        <TouchableOpacity onPress={async () => { if (await confirmAction("إلغاء الحجز", "إلغاء هذه التذكرة؟", "إلغاء الحجز", true)) { await leaguesApi.setTicket(token!, t.code, "cancelled").catch((e) => notify("خطأ", e?.message)); load(); } }}>
                          <Text style={[s.link, { color: "#D93636" }]}>إلغاء الحجز</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13, color: LEAGUE_ACCENT },
  ticket: { borderRadius: 22, overflow: "hidden", backgroundColor: Colors.cardBg, ...Colors.shadow.raised },
  top: { padding: 16, gap: 8 },
  league: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.85)", textAlign: "center" },
  teams: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 14 },
  team: { alignItems: "center", gap: 4, width: 110 },
  teamName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: "#fff" },
  vs: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#F7D76A" },
  when: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "#fff", textAlign: "center" },
  perf: { height: 20, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg },
  hole: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: neu.base },
  dash: { flex: 1, marginHorizontal: 18, borderTopWidth: 2, borderStyle: "dashed", borderColor: Colors.divider },
  bottom: { padding: 14, paddingTop: 2, gap: 10 },
  metaRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  metaLabel: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  metaVal: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right", maxWidth: 120 },
  state: { flexDirection: "row-reverse", alignItems: "center", gap: 6, borderRadius: 12, padding: 8 },
  stateText: { fontFamily: "Cairo_700Bold", fontSize: 12.5 },
  qrBox: { alignItems: "center", gap: 8, paddingVertical: 8 },
  code: { fontFamily: "Cairo_700Bold", fontSize: 18, letterSpacing: 3, color: Colors.textPrimary, writingDirection: "ltr" },
});
