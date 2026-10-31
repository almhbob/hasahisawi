import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { contestsApi, themeOf, timeLeft, OCCASION_THEME, type Contest, type Occasion } from "@/lib/contests";
import RtlScrollRow from "@/components/ui/RtlScrollRow";
import { useSectionVisible } from "@/lib/feature-flags-context";

export default function ContestsScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const staff = user?.role === "admin" || user?.role === "moderator";
  const sectionVisible = useSectionVisible("contests");
  const [list, setList] = useState<Contest[]>([]);
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [tab, setTab] = useState<"active" | "ended">("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [l, o] = await Promise.all([contestsApi.list(token), contestsApi.occasions().catch(() => [])]);
      setList(l);
      setOccasions(o);
    } catch (e: any) {
      setError(e?.message || "تعذّر التحميل");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = list.filter((c) => (tab === "active" ? c.state !== "ended" : c.state === "ended"));

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>المسابقات</Text>
        {staff ? (
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push("/contests-admin" as any)} accessibilityLabel="إدارة المسابقات">
            <Ionicons name="settings-outline" size={20} color={Colors.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} />}
      </View>

      {!sectionVisible && staff ? (
        <View style={s.hiddenNote}>
          <Ionicons name="eye-off-outline" size={16} color={Colors.accent} />
          <Text style={s.hiddenNoteText}>القسم مخفي عن المستخدمين — أظهره من لوحة الإدارة ← أقسام التطبيق</Text>
        </View>
      ) : null}

      {!sectionVisible && !staff ? (
        <View style={s.empty}>
          <Ionicons name="trophy-outline" size={54} color={Colors.textMuted} />
          <Text style={s.emptyText}>قسم المسابقات غير متاح حالياً.</Text>
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
      >
        {/* المناسبات القادمة */}
        {occasions.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={[s.section, { paddingHorizontal: 16 }]}>مناسبات قادمة</Text>
            <RtlScrollRow contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
              {occasions.map((o) => {
                const t = OCCASION_THEME[o.key] ?? OCCASION_THEME.sponsored;
                return (
                  <LinearGradient key={o.key} colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.occ}>
                    <Ionicons name={t.icon as any} size={18} color={t.accent} />
                    <Text style={s.occName} numberOfLines={1}>{o.name}</Text>
                    <Text style={[s.occDays, { color: t.accent }]}>{o.daysAway === 0 ? "اليوم" : `بعد ${o.daysAway} يوماً`}</Text>
                  </LinearGradient>
                );
              })}
            </RtlScrollRow>
          </View>
        )}

        <View style={s.tabs}>
          {([["active", "الجارية والقادمة"], ["ended", "المنتهية والفائزون"]] as const).map(([k, l]) => (
            <TouchableOpacity key={k} style={[s.tab, tab === k && s.tabOn]} onPress={() => setTab(k)}>
              <Text style={[s.tabText, tab === k && { color: Colors.onColor }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 30 }} /> : error ? (
          <Text style={s.error}>{error}</Text>
        ) : shown.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="trophy-outline" size={54} color={Colors.textMuted} />
            <Text style={s.emptyText}>{tab === "active" ? "لا توجد مسابقات جارية الآن. تابعنا في المناسبات القادمة!" : "لا توجد مسابقات منتهية بعد."}</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            {shown.map((c) => {
              const t = themeOf(c);
              return (
                <TouchableOpacity key={c.id} activeOpacity={0.88} onPress={() => router.push({ pathname: "/contest" as any, params: { id: String(c.id) } })}>
                  <LinearGradient colors={t.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
                    <View style={s.cardHead}>
                      <View style={[s.iconCircle, { borderColor: t.accent }]}><Ionicons name={t.icon as any} size={18} color={t.accent} /></View>
                      <Text style={[s.kind, { color: t.accent }]} numberOfLines={1}>
                        {c.kind === "sponsored" && c.sponsor_name ? `برعاية ${c.sponsor_name}` : t.label}
                      </Text>
                      <Text style={s.type}>{c.type === "quiz" ? "أسئلة" : "مشاركة"}</Text>
                    </View>
                    <Text style={s.cardTitle} numberOfLines={2}>{c.title}</Text>
                    {c.prize ? (
                      <View style={[s.prize, { backgroundColor: t.accent }]}><Text style={s.prizeText} numberOfLines={1}>🎁 {c.prize}</Text></View>
                    ) : null}
                    <View style={s.cardFoot}>
                      <Text style={s.footText}>
                        {c.state === "upcoming" ? "تبدأ قريباً" : c.state === "ended" ? "انتهت" : timeLeft(c.ends_at)} · {c.entries_count} مشارك
                      </Text>
                      {c.entered ? <Text style={[s.footText, { color: t.accent }]}>✓ شاركت</Text> : null}
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text },
  section: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.text, textAlign: "right" },
  occ: { width: 140, padding: 12, borderRadius: 16, gap: 4 },
  occName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#FFFFFF", textAlign: "right" },
  occDays: { fontFamily: "Cairo_600SemiBold", fontSize: 12, textAlign: "right" },
  tabs: { flexDirection: "row-reverse", marginHorizontal: 16, padding: 4, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  tab: { flex: 1, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: Colors.primary },
  tabText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  card: { borderRadius: 22, padding: 18, gap: 10, minHeight: 170 },
  cardHead: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  kind: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "right" },
  type: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.85)", paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, lineHeight: 32, color: "#FFFFFF", textAlign: "right" },
  prize: { alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, maxWidth: "100%" },
  prizeText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#1F1300" },
  cardFoot: { flexDirection: "row-reverse", justifyContent: "space-between", marginTop: 2 },
  footText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.85)" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 30 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 24 },
  hiddenNote: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: Colors.accentSoft },
  hiddenNoteText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.text, textAlign: "right" },
  error: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.danger, textAlign: "center" },
});
