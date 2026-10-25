import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import { useAuth } from "@/lib/auth-context";
import ClubFormModal from "@/components/sports/ClubFormModal";
import { clubsApi, SPORT_META, SPORT_KEYS, clubInitials, type Club, type ClubSport, type StandingRow } from "@/lib/sports-clubs-api";

export function ClubLogo({ club, size = 52 }: { club: Pick<Club, "name" | "logo_url" | "primary_color" | "sport">; size?: number }) {
  const bg = club.primary_color || SPORT_META[club.sport || "football"].color;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: bg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {club.logo_url
        ? <Image source={{ uri: club.logo_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        : <Text style={{ fontFamily: "Cairo_700Bold", color: "#fff", fontSize: size * 0.36 }}>{clubInitials(club.name)}</Text>}
    </View>
  );
}

function FormDots({ form }: { form: string[] }) {
  return (
    <View style={{ flexDirection: "row-reverse", gap: 3 }}>
      {form.map((r, i) => (
        <View key={i} style={[s.dot, { backgroundColor: r === "W" ? "#0E9C64" : r === "D" ? "#9AA5A0" : "#D64545" }]}>
          <Text style={s.dotTxt}>{r === "W" ? "ف" : r === "D" ? "ت" : "خ"}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ClubsHub({ search }: { search?: string }) {
  const { token, user } = useAuth();
  const [view, setView] = useState<"clubs" | "table">("clubs");
  const [sport, setSport] = useState<ClubSport | "">("");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [table, setTable] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, t] = await Promise.all([clubsApi.list(token, { sport }), clubsApi.standings().catch(() => ({ standings: [] }))]);
      setClubs(c.clubs); setTable(t.standings);
    } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
    finally { setLoading(false); }
  }, [token, sport]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const q = (search || "").trim();
    return q ? clubs.filter((c) => c.name.includes(q) || (c.district || "").includes(q) || (c.league || "").includes(q)) : clubs;
  }, [clubs, search]);

  const toggleFollow = async (c: Club) => {
    if (!token) return router.push("/login" as any);
    setClubs((prev) => prev.map((x) => x.id === c.id ? { ...x, is_following: !x.is_following, followers: x.followers + (x.is_following ? -1 : 1) } : x));
    try {
      const r = await clubsApi.follow(token, c.id);
      setClubs((prev) => prev.map((x) => x.id === c.id ? { ...x, is_following: r.following, followers: r.followers } : x));
    } catch { load(); }
  };

  const openRegister = () => { if (!token) return router.push("/login" as any); setForm(true); };

  return (
    <View>
      {/* Segmented */}
      <View style={s.seg}>
        {([["clubs", "الأندية", "shield-outline"], ["table", "جدول الترتيب", "podium-outline"]] as const).map(([k, l, ic]) => (
          <TouchableOpacity key={k} onPress={() => setView(k)} style={[s.segBtn, view === k && s.segOn]}>
            <Ionicons name={ic as any} size={15} color={view === k ? "#fff" : Colors.textSecondary} />
            <Text style={[s.segTxt, view === k && { color: "#fff" }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {flash ? (
        <View style={s.flash}><Ionicons name="checkmark-circle" size={16} color="#0B7A4E" /><Text style={s.flashTxt}>{flash}</Text></View>
      ) : null}

      {view === "clubs" ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
            <TouchableOpacity onPress={() => setSport("")} style={[s.chip, sport === "" && s.chipOn]}>
              <Text style={[s.chipTxt, sport === "" && { color: "#fff" }]}>الكل</Text>
            </TouchableOpacity>
            {SPORT_KEYS.map((k) => (
              <TouchableOpacity key={k} onPress={() => setSport(k)} style={[s.chip, sport === k && s.chipOn]}>
                <Ionicons name={SPORT_META[k].icon as any} size={13} color={sport === k ? "#fff" : SPORT_META[k].color} />
                <Text style={[s.chipTxt, sport === k && { color: "#fff" }]}>{SPORT_META[k].label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <AnimatedPress onPress={openRegister}>
            <View style={s.cta}>
              <View style={s.ctaIcon}><Ionicons name="add" size={22} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.ctaTitle}>سجّل ناديك في حصاحيصاوي</Text>
                <Text style={s.ctaSub}>صفحة رسمية، متابعون، واستقبال طلبات اللاعبين</Text>
              </View>
              <Ionicons name="chevron-back" size={18} color={Colors.primary} />
            </View>
          </AnimatedPress>

          {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 30 }} /> : error ? (
            <TouchableOpacity onPress={load} style={s.empty}><Ionicons name="refresh" size={28} color={Colors.textMuted} /><Text style={s.emptyTxt}>{error} — اضغط لإعادة المحاولة</Text></TouchableOpacity>
          ) : shown.length === 0 ? (
            <View style={s.empty}><Ionicons name="shield-outline" size={36} color={Colors.textMuted} /><Text style={s.emptyTxt}>لا توجد أندية {sport ? `في ${SPORT_META[sport].label}` : ""} بعد — كن أول من يسجّل ناديه</Text></View>
          ) : shown.map((c) => {
            const m = SPORT_META[c.sport] || SPORT_META.other;
            return (
              <AnimatedPress key={c.id} onPress={() => router.push({ pathname: "/sports-club", params: { id: String(c.id) } } as any)}>
                <View style={s.card}>
                  <ClubLogo club={c} />
                  <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                      <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                      {c.verified ? <Ionicons name="checkmark-circle" size={15} color="#2186C2" /> : null}
                    </View>
                    <Text style={s.meta} numberOfLines={1}>
                      {m.label}{c.district ? ` · ${c.district}` : ""}{c.league ? ` · ${c.league}` : ""}
                    </Text>
                    <View style={s.badges}>
                      <Text style={s.followers}><Ionicons name="people" size={11} color={Colors.textMuted} /> {c.followers} متابع</Text>
                      {c.status === "pending" ? <View style={[s.pill, { backgroundColor: "#FFF4D6" }]}><Text style={[s.pillTxt, { color: "#8A6400" }]}>قيد المراجعة</Text></View> : null}
                      {c.status === "rejected" ? <View style={[s.pill, { backgroundColor: "#FDE8E8" }]}><Text style={[s.pillTxt, { color: "#B3261E" }]}>مرفوض</Text></View> : null}
                      {c.accepts_members && c.status === "approved" ? <View style={[s.pill, { backgroundColor: "#E8F5EE" }]}><Text style={[s.pillTxt, { color: "#0B7A4E" }]}>يستقبل لاعبين</Text></View> : null}
                    </View>
                  </View>
                  {c.status === "approved" ? (
                    <TouchableOpacity onPress={() => toggleFollow(c)} style={[s.followBtn, c.is_following && s.followOn]} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Text style={[s.followTxt, c.is_following && { color: Colors.primary }]}>{c.is_following ? "متابَع" : "تابع"}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </AnimatedPress>
            );
          })}
        </>
      ) : (
        <View style={s.tableCard}>
          <Text style={s.tableTitle}>الدوري المحلي — كرة القدم</Text>
          <Text style={s.tableSub}>يُحدَّث تلقائياً من نتائج المباريات المنتهية</Text>
          {table.length === 0 ? (
            <View style={s.empty}><Ionicons name="podium-outline" size={32} color={Colors.textMuted} /><Text style={s.emptyTxt}>لا توجد نتائج مباريات منتهية بعد</Text></View>
          ) : (
            <>
              <View style={[s.tr, s.th]}>
                <Text style={[s.td, s.pos]}>#</Text>
                <Text style={[s.td, s.team, s.thTxt]}>الفريق</Text>
                <Text style={[s.td, s.num, s.thTxt]}>لعب</Text>
                <Text style={[s.td, s.num, s.thTxt]}>ف</Text>
                <Text style={[s.td, s.num, s.thTxt]}>ت</Text>
                <Text style={[s.td, s.num, s.thTxt]}>خ</Text>
                <Text style={[s.td, s.num, s.thTxt]}>+/-</Text>
                <Text style={[s.td, s.num, s.thTxt]}>نقاط</Text>
              </View>
              {table.map((r, i) => (
                <TouchableOpacity key={r.team + i} disabled={!r.club_id} onPress={() => r.club_id && router.push({ pathname: "/sports-club", params: { id: String(r.club_id) } } as any)}
                  style={[s.tr, i < 3 && { backgroundColor: "#F2FAF5" }]}>
                  <Text style={[s.td, s.pos, i < 3 && { color: "#0B7A4E" }]}>{i + 1}</Text>
                  <View style={[s.team, { flexDirection: "row-reverse", alignItems: "center", gap: 6 }]}>
                    <ClubLogo club={{ name: r.team, logo_url: r.logo_url, primary_color: r.primary_color, sport: "football" }} size={22} />
                    <Text style={s.teamTxt} numberOfLines={1}>{r.team}</Text>
                  </View>
                  <Text style={[s.td, s.num]}>{r.p}</Text>
                  <Text style={[s.td, s.num]}>{r.w}</Text>
                  <Text style={[s.td, s.num]}>{r.d}</Text>
                  <Text style={[s.td, s.num]}>{r.l}</Text>
                  <Text style={[s.td, s.num]}>{r.gd > 0 ? `+${r.gd}` : r.gd}</Text>
                  <Text style={[s.td, s.num, { fontFamily: "Cairo_700Bold", color: Colors.textPrimary }]}>{r.pts}</Text>
                </TouchableOpacity>
              ))}
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 10 }}>
                <Text style={s.legend}>آخر النتائج:</Text>
                <FormDots form={["W", "D", "L"]} />
                <Text style={s.legend}>فوز · تعادل · خسارة</Text>
              </View>
            </>
          )}
        </View>
      )}

      <ClubFormModal
        visible={form}
        token={token}
        userId={user?.id}
        onClose={() => setForm(false)}
        onSaved={(c, msg) => { setClubs((prev) => [c, ...prev.filter((x) => x.id !== c.id)]); setFlash(msg || null); setTimeout(() => setFlash(null), 5000); }}
      />
    </View>
  );
}

export { FormDots };

const s = StyleSheet.create({
  seg: { flexDirection: "row-reverse", backgroundColor: "#EEF2EF", borderRadius: 14, padding: 4, marginBottom: 12 },
  segBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 11 },
  segOn: { backgroundColor: Colors.primary },
  segTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
  flash: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "#E8F5EE", borderRadius: 12, padding: 10, marginBottom: 10 },
  flashTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: "#0B7A4E", textAlign: "right" },
  chips: { flexDirection: "row-reverse", gap: 8, paddingBottom: 12 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textPrimary },
  cta: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: Colors.primary + "33", borderStyle: "dashed" },
  ctaIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  ctaTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  ctaSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  card: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  name: { flexShrink: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: -2 },
  badges: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  followers: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },
  pill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 },
  pillTxt: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  followBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: Colors.primary },
  followOn: { backgroundColor: "#E8F5EE" },
  followTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 34 },
  emptyTxt: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", paddingHorizontal: 20 },
  tableCard: { backgroundColor: "#fff", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  tableTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  tableSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right", marginBottom: 8 },
  tr: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)", borderRadius: 8 },
  th: { borderBottomColor: "rgba(0,0,0,0.12)" },
  thTxt: { fontFamily: "Cairo_700Bold", color: Colors.textSecondary },
  td: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary, textAlign: "center" },
  pos: { width: 22 },
  team: { flex: 1, textAlign: "right" },
  teamTxt: { flexShrink: 1, fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textPrimary, textAlign: "right" },
  num: { width: 30 },
  legend: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  dot: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dotTxt: { fontFamily: "Cairo_700Bold", fontSize: 8.5, color: "#fff", lineHeight: 12 },
});
