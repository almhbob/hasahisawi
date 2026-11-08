/** 🏆 الدوريات والبطولات — القائمة وإنشاء دوري جديد */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { confirmAction, notify } from "@/lib/xplatform";
import { neu, NeuButton, NeuInset, NeuRaised } from "@/components/auth/neu";
import { leaguesApi, LEAGUE_ACCENT, STATUS_AR, type League } from "@/lib/leagues-api";

const FORMAT_AR: Record<string, string> = { league: "دوري بالنقاط", groups: "مجموعات", cup: "كأس (خروج المغلوب)" };

export default function LeaguesScreen() {
  const insets = useSafeAreaInsets();
  const { token, user, isGuest } = useAuth();
  const [items, setItems] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [canManage, setCanManage] = useState(false);

  const load = useCallback(async () => {
    try { const r = await leaguesApi.list(token); setItems(r.leagues); setCanManage(!!r.can_manage); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const loggedIn = !!user && !isGuest && !!token;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={LEAGUE_ACCENT} />}>
        <LinearGradient colors={["#004D36", "#004D36", "#00301F"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.hero}>
          <View style={s.heroTop}>
            <TouchableOpacity onPress={() => router.back()} style={s.heroBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={20} color="#fff" /></TouchableOpacity>
            {loggedIn && (
              <TouchableOpacity onPress={() => router.push("/my-tickets" as any)} style={s.heroPill} accessibilityLabel="تذاكري">
                <Ionicons name="ticket" size={14} color="#fff" /><Text style={s.heroPillText}>تذاكري</Text>
              </TouchableOpacity>
            )}
          </View>
          <Ionicons name="trophy" size={34} color="#F7D76A" style={{ alignSelf: "flex-end" }} />
          <Text style={s.heroTitle}>الدوريات والبطولات</Text>
          <Text style={s.heroSub}>الجداول والنتائج والترتيب والهدافون وتذاكر المباريات في مكان واحد</Text>
          <View pointerEvents="none" style={s.heroCircle} />
        </LinearGradient>

        <View style={{ paddingHorizontal: 16, gap: 14, marginTop: -20 }}>
          {loggedIn && (
            <NeuButton label="أنشئ دورياً أو بطولة" icon="add-circle-outline" onPress={() => setCreating(true)} />
          )}
          {loading ? <ActivityIndicator color={LEAGUE_ACCENT} style={{ marginTop: 30 }} /> : items.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="trophy-outline" size={46} color={Colors.textMuted} />
              <Text style={s.emptyText}>لا توجد دوريات منشورة بعد</Text>
            </View>
          ) : items.map((l, i) => (
            <Animated.View key={l.id} entering={FadeInDown.delay(Math.min(i, 8) * 50)}>
              <Pressable onPress={() => router.push({ pathname: "/league", params: { id: String(l.id) } } as any)} accessibilityRole="button" accessibilityLabel={l.name}>
                <NeuRaised radius={22} depth={8} style={{ overflow: "hidden" }}>
                  <View style={s.cover}>
                    {l.cover_url ? <Image source={{ uri: l.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
                      <LinearGradient colors={[(l.primary_color || LEAGUE_ACCENT) + "EE", (l.primary_color || LEAGUE_ACCENT) + "88"]} style={StyleSheet.absoluteFill} />
                    )}
                    <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} style={StyleSheet.absoluteFill} />
                    {(l.live_count ?? 0) > 0 && <View style={s.live}><View style={s.liveDot} /><Text style={s.liveText}>{l.live_count} مباشر</Text></View>}
                    <View style={s.coverRow}>
                      {l.logo_url ? <Image source={{ uri: l.logo_url }} style={s.logo} /> : <View style={[s.logo, { alignItems: "center", justifyContent: "center" }]}><Ionicons name="trophy" size={24} color={LEAGUE_ACCENT} /></View>}
                      <View style={{ flex: 1 }}>
                        <Text style={s.name} numberOfLines={1}>{l.name}</Text>
                        <Text style={s.season}>{[l.season, FORMAT_AR[l.format]].filter(Boolean).join(" · ")}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.stats}>
                    <Stat icon="shield" label="فريق" value={l.teams_count ?? 0} />
                    <Stat icon="football" label="مباراة" value={l.matches_count ?? 0} />
                    <View style={[s.statusPill, { backgroundColor: STATUS_AR[l.status].color + "1A" }]}>
                      <Text style={[s.statusText, { color: STATUS_AR[l.status].color }]}>{STATUS_AR[l.status].label}</Text>
                    </View>
                    {!l.approved && <View style={[s.statusPill, { backgroundColor: "#E8A9001A" }]}><Text style={[s.statusText, { color: "#946B00" }]}>بانتظار الاعتماد</Text></View>}
                    {(canManage || l.created_by === user?.id) && token ? (
                      <TouchableOpacity hitSlop={10} accessibilityLabel={`حذف ${l.name}`} style={s.delBtn} onPress={async () => {
                        if (!(await confirmAction("حذف الدوري", `حذف «${l.name}» نهائياً مع فرقه ومبارياته وتذاكره؟ لا يمكن التراجع.`, "حذف نهائي", true))) return;
                        try { await leaguesApi.remove(token, l.id); setItems(xs => xs.filter(x => x.id !== l.id)); notify("تم حذف الدوري"); }
                        catch (e: any) { notify("تعذّر الحذف", e?.message); }
                      }}>
                        <Ionicons name="trash-outline" size={17} color="#D93636" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </NeuRaised>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
      <CreateSheet visible={creating} onClose={() => setCreating(false)} token={token || ""} onCreated={(id) => { setCreating(false); load(); router.push({ pathname: "/league-manage", params: { id: String(id) } } as any); }} />
    </View>
  );
}

function Stat({ icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <View style={s.stat}><Ionicons name={icon} size={14} color={LEAGUE_ACCENT} /><Text style={s.statNum}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>
  );
}

function CreateSheet({ visible, onClose, token, onCreated }: { visible: boolean; onClose: () => void; token: string; onCreated: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  const [f, setF] = useState({ name: "", season: String(new Date().getFullYear()), format: "league", venue: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (f.name.trim().length < 3) return notify("اسم الدوري مطلوب");
    setBusy(true);
    try { const r = await leaguesApi.create(token, f as any); notify("تم الإنشاء", r.message); onCreated(r.league.id); }
    catch (e: any) { notify("تعذّر الإنشاء", e?.message); }
    setBusy(false);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={s.sheetTitle}>دوري أو بطولة جديدة</Text>
          <Text style={s.label}>الاسم</Text>
          <NeuInset radius={14}><TextInput value={f.name} onChangeText={v => setF({ ...f, name: v })} placeholder="مثال: دوري الأحياء — الحصاحيصا" placeholderTextColor={Colors.textSubtle} style={s.input} /></NeuInset>
          <Text style={s.label}>الموسم</Text>
          <NeuInset radius={14}><TextInput value={f.season} onChangeText={v => setF({ ...f, season: v })} style={s.input} /></NeuInset>
          <Text style={s.label}>النظام</Text>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            {Object.entries(FORMAT_AR).map(([k, v]) => (
              <TouchableOpacity key={k} onPress={() => setF({ ...f, format: k })} style={[s.chip, f.format === k && { backgroundColor: LEAGUE_ACCENT, borderColor: LEAGUE_ACCENT }]}>
                <Text style={[s.chipText, f.format === k && { color: "#fff" }]}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.label}>الملعب الرئيسي</Text>
          <NeuInset radius={14}><TextInput value={f.venue} onChangeText={v => setF({ ...f, venue: v })} placeholder="مثال: استاد الحصاحيصا" placeholderTextColor={Colors.textSubtle} style={s.input} /></NeuInset>
          <View style={{ marginTop: 12 }}><NeuButton label="إنشاء ومتابعة التجهيز" icon="arrow-back" onPress={submit} loading={busy} /></View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  delBtn: { marginRight: "auto", width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FDECEC" },
  root: { flex: 1, backgroundColor: neu.base },
  hero: { margin: 12, borderRadius: 28, padding: 18, paddingBottom: 36, overflow: "hidden", gap: 2 },
  heroTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  heroBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  heroPill: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.22)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14 },
  heroPillText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 26, color: "#fff", textAlign: "right" },
  heroSub: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  heroCircle: { position: "absolute", width: 200, height: 200, borderRadius: 100, left: -60, top: -70, backgroundColor: "rgba(255,255,255,0.08)" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted },
  cover: { height: 130, justifyContent: "flex-end", padding: 12 },
  coverRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  logo: { width: 52, height: 52, borderRadius: 16, backgroundColor: "#fff" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "right" },
  season: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  live: { position: "absolute", top: 10, left: 10, flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#D93636", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
  liveText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  stats: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12, flexWrap: "wrap" },
  stat: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  statLabel: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },
  statusPill: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 10 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 11.5 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: neu.base, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, gap: 6, width: "100%", maxWidth: 620, alignSelf: "center" },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right", marginBottom: 4 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right", marginTop: 6 },
  input: { fontFamily: "Cairo_600SemiBold", fontSize: 14.5, color: Colors.textPrimary, textAlign: "right", paddingHorizontal: 12, paddingVertical: 11, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  chip: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  chipText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary, textAlign: "center" },
});
