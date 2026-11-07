/** 🏆 صفحة الدوري: المباريات بالجولات، الترتيب، الهدافون، الفرق، والمعلومات */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { neu, NeuInset, NeuRaised } from "@/components/auth/neu";
import { MatchCard, StandingsTable, TeamBadge } from "@/components/leagues/ui";
import { leaguesApi, LEAGUE_ACCENT, ROLE_AR, STATUS_AR, type LeagueDetail, type Team } from "@/lib/leagues-api";

type TabKey = "matches" | "table" | "scorers" | "teams" | "about";
const TABS: { k: TabKey; label: string; icon: any }[] = [
  { k: "matches", label: "المباريات", icon: "football" },
  { k: "table", label: "الترتيب", icon: "podium" },
  { k: "scorers", label: "الهدافون", icon: "flame" },
  { k: "teams", label: "الفرق", icon: "shield" },
  { k: "about", label: "عن الدوري", icon: "information-circle" },
];

export default function LeagueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [d, setD] = useState<LeagueDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("matches");
  const [round, setRound] = useState<number | null>(null);
  const [team, setTeam] = useState<Team | null>(null);

  const load = useCallback(async () => {
    try { setD(await leaguesApi.get(Number(id), token)); setError(""); } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
  }, [id, token]);
  useEffect(() => { load(); }, [load]);
  // تحديث تلقائي أثناء المباريات المباشرة
  useEffect(() => {
    if (!d?.matches.some(m => m.status === "live")) return;
    const t = setInterval(load, 30000); return () => clearInterval(t);
  }, [d, load]);

  const teamsById = useMemo(() => new Map((d?.teams || []).map(t => [t.id, t])), [d]);
  const rounds = useMemo(() => [...new Set((d?.matches || []).map(m => m.round))].sort((a, b) => a - b), [d]);
  // الجولة الحالية: أول جولة فيها مباراة لم تنتهِ
  useEffect(() => {
    if (!d || round !== null) return;
    const cur = d.matches.find(m => m.status !== "finished")?.round ?? rounds[rounds.length - 1] ?? 1;
    setRound(cur);
  }, [d]);

  if (error) return <View style={[s.center, { paddingTop: insets.top }]}><Ionicons name="alert-circle-outline" size={40} color={Colors.textMuted} /><Text style={s.muted}>{error}</Text></View>;
  if (!d) return <View style={s.center}><ActivityIndicator color={LEAGUE_ACCENT} /></View>;
  const L = d.league;
  const color = L.primary_color || LEAGUE_ACCENT;
  const canManage = d.roles.includes("organizer") || d.roles.includes("referee") || d.roles.includes("gate");
  const groups = Object.keys(d.standings).sort();
  const live = d.matches.filter(m => m.status === "live");
  const roundMatches = d.matches.filter(m => m.round === round);

  return (
    <View style={[s.root]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={color} />} stickyHeaderIndices={[1]}>
        <View>
          <View style={[s.hero, { paddingTop: insets.top + 8 }]}>
            {L.cover_url ? <Image source={{ uri: L.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <LinearGradient colors={[color, "#00301F"]} style={StyleSheet.absoluteFill} />}
            <LinearGradient colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0.65)"]} style={StyleSheet.absoluteFill} />
            <View style={s.heroTop}>
              <TouchableOpacity onPress={() => router.back()} style={s.round} accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={20} color="#fff" /></TouchableOpacity>
              {canManage && (
                <TouchableOpacity onPress={() => router.push({ pathname: "/league-manage", params: { id: String(L.id) } } as any)} style={s.manage}>
                  <Ionicons name="settings" size={15} color="#fff" /><Text style={s.manageText}>لوحة {d.roles.includes("organizer") ? "اللجنة المنظمة" : ROLE_AR[d.roles[0]]}</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={s.heroBody}>
              {L.logo_url ? <Image source={{ uri: L.logo_url }} style={s.logo} /> : <View style={[s.logo, { alignItems: "center", justifyContent: "center" }]}><Ionicons name="trophy" size={32} color={color} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{L.name}</Text>
                <Text style={s.sub}>{[L.season, `${d.teams.filter(t => t.status === "approved").length} فريق`, STATUS_AR[L.status].label].filter(Boolean).join(" · ")}</Text>
              </View>
            </View>
          </View>
          {live.length > 0 && (
            <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 10 }}>
              <View style={s.liveHead}><View style={s.liveDot} /><Text style={s.liveTitle}>مباشر الآن</Text></View>
              {live.map(m => <MatchCard key={m.id} m={m} home={teamsById.get(m.home_team_id)} away={teamsById.get(m.away_team_id)} onPress={() => router.push({ pathname: "/league-match", params: { id: String(m.id) } } as any)} />)}
            </View>
          )}
        </View>

        <View style={s.tabsWrap}>
          <NeuInset radius={16} style={s.tabs}>
            {TABS.map(t => {
              const on = tab === t.k;
              return (
                <Pressable key={t.k} onPress={() => setTab(t.k)} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  {on ? <NeuRaised radius={12} depth={3} style={s.tab}><Ionicons name={t.icon} size={15} color={color} /><Text style={[s.tabText, { color }]}>{t.label}</Text></NeuRaised>
                    : <View style={s.tab}><Ionicons name={(t.icon + "-outline") as any} size={15} color={Colors.textMuted} /><Text style={s.tabText}>{t.label}</Text></View>}
                </Pressable>
              );
            })}
          </NeuInset>
        </View>

        <Animated.View key={tab} entering={FadeIn.duration(200)} style={{ paddingHorizontal: 16, gap: 12 }}>
          {tab === "matches" && (
            d.matches.length === 0 ? <Empty icon="calendar-outline" text="لم يُنشر جدول المباريات بعد" /> : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse", paddingVertical: 2 }}>
                  {rounds.map(r => {
                    const allDone = d.matches.filter(m => m.round === r).every(m => m.status === "finished");
                    return (
                      <TouchableOpacity key={r} onPress={() => setRound(r)} style={[s.roundChip, round === r && { backgroundColor: color, borderColor: color }]}>
                        <Text style={[s.roundText, round === r && { color: "#fff" }]}>الجولة {r}</Text>
                        {allDone ? <Ionicons name="checkmark-circle" size={13} color={round === r ? "#fff" : "#00966A"} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {roundMatches.map(m => <MatchCard key={m.id} m={m} home={teamsById.get(m.home_team_id)} away={teamsById.get(m.away_team_id)} onPress={() => router.push({ pathname: "/league-match", params: { id: String(m.id) } } as any)} />)}
              </>
            )
          )}

          {tab === "table" && (
            groups.length === 0 ? <Empty icon="podium-outline" text="يظهر الترتيب بعد اعتماد الفرق" /> : (
              <>
                {groups.map(g => <StandingsTable key={g} rows={d.standings[g]} title={g ? `المجموعة ${g}` : undefined} onTeam={tid => setTeam(teamsById.get(tid) || null)} />)}
                <View style={s.legend}>
                  {[["#00966A", "المتصدر"], ["#008259", "المراكز المتقدمة"], ["#D93636", "منطقة الهبوط"]].map(([c, l]) => (
                    <View key={l} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: c }]} /><Text style={s.legendText}>{l}</Text></View>
                  ))}
                </View>
              </>
            )
          )}

          {tab === "scorers" && (
            d.scorers.length === 0 ? <Empty icon="flame-outline" text="لم تُسجَّل أهداف بعد" /> : (
              <NeuRaised radius={20} depth={6} style={{ paddingVertical: 6 }}>
                {d.scorers.map((x, i) => (
                  <View key={x.player_name + x.team_id} style={s.scorer}>
                    <View style={[s.rank, i < 3 && { backgroundColor: ["#F7D76A", "#C9D6CF", "#CB9200"][i] }]}><Text style={[s.rankText, i < 3 && { color: "#1A2C25" }]}>{i + 1}</Text></View>
                    <TeamBadge team={{ id: x.team_id, name: x.team_name, logo_url: x.logo_url } as any} size={30} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.scorerName}>{x.player_name}</Text>
                      <Text style={s.muted}>{x.team_name}</Text>
                    </View>
                    <View style={s.goals}><Ionicons name="football" size={14} color={color} /><Text style={[s.goalsText, { color }]}>{x.goals}</Text></View>
                  </View>
                ))}
              </NeuRaised>
            )
          )}

          {tab === "teams" && (
            <View style={s.grid}>
              {d.teams.filter(t => t.status === "approved").map(t => (
                <Pressable key={t.id} onPress={() => setTeam(t)} style={{ width: "47.5%" }}>
                  <NeuRaised radius={18} depth={6} style={s.teamCard}>
                    <TeamBadge team={t} size={54} />
                    <Text style={s.teamName} numberOfLines={1}>{t.name}</Text>
                    <Text style={s.muted}>{t.group_name ? `المجموعة ${t.group_name} · ` : ""}{t.players_count || 0} لاعب</Text>
                  </NeuRaised>
                </Pressable>
              ))}
            </View>
          )}

          {tab === "about" && (
            <NeuRaised radius={20} depth={6} style={{ padding: 16, gap: 10 }}>
              {L.description ? <Text style={s.body}>{L.description}</Text> : null}
              <Info icon="location" label="الملعب" value={L.venue} />
              <Info icon="calendar" label="الفترة" value={[L.start_date, L.end_date].filter(Boolean).join(" ← ")} />
              <Info icon="podium" label="النقاط" value={`فوز ${L.points_win} · تعادل ${L.points_draw} · خسارة ${L.points_loss}`} />
              {L.rules ? <><Text style={s.h}>اللائحة</Text><Text style={s.body}>{L.rules}</Text></> : null}
              {d.staff.length > 0 && (
                <>
                  <Text style={s.h}>اللجان</Text>
                  {(["organizer", "referee"] as const).map(r => {
                    const list = d.staff.filter(x => x.role === r);
                    return list.length ? <Info key={r} icon={r === "organizer" ? "people" : "flag"} label={ROLE_AR[r]} value={list.map(x => x.name + (x.title ? ` (${x.title})` : "")).join("، ")} /> : null;
                  })}
                </>
              )}
            </NeuRaised>
          )}
        </Animated.View>
      </ScrollView>

      <Modal visible={!!team} transparent animationType="slide" onRequestClose={() => setTeam(null)}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTeam(null)} />
          {team && <TeamSheet team={team} d={d} onClose={() => setTeam(null)} />}
        </View>
      </Modal>
    </View>
  );
}

function TeamSheet({ team, d, onClose }: { team: Team; d: LeagueDetail; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const row = Object.values(d.standings).flat().find(r => r.team_id === team.id);
  const matches = d.matches.filter(m => m.home_team_id === team.id || m.away_team_id === team.id);
  const teamsById = new Map(d.teams.map(t => [t.id, t]));
  return (
    <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
      <View style={{ alignItems: "center", gap: 6 }}>
        <TeamBadge team={team} size={72} />
        <Text style={s.teamTitle}>{team.name}</Text>
        {team.coach ? <Text style={s.muted}>المدرب: {team.coach}</Text> : null}
      </View>
      {row && (
        <View style={s.teamStats}>
          {[["المركز", (Object.values(d.standings).flat().filter(r => r.group === row.group).indexOf(row) + 1)], ["لعب", row.p], ["فوز", row.w], ["تعادل", row.d], ["خسارة", row.l], ["نقاط", row.pts]].map(([l, v]) => (
            <View key={String(l)} style={s.ts}><Text style={s.tsNum}>{v}</Text><Text style={s.tsLabel}>{l}</Text></View>
          ))}
        </View>
      )}
      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
        {matches.slice(0, 12).map(m => {
          const home = m.home_team_id === team.id; const opp = teamsById.get(home ? m.away_team_id : m.home_team_id);
          const my = home ? m.home_score : m.away_score, their = home ? m.away_score : m.home_score;
          const res = m.status === "finished" && my != null && their != null ? (my > their ? ["ف", "#00966A"] : my < their ? ["خ", "#D93636"] : ["ت", "#9AABA3"]) : null;
          return (
            <Pressable key={m.id} onPress={() => { onClose(); router.push({ pathname: "/league-match", params: { id: String(m.id) } } as any); }} style={s.mRow}>
              {res ? <View style={[s.res, { backgroundColor: res[1] }]}><Text style={s.resText}>{res[0]}</Text></View> : <View style={[s.res, { backgroundColor: Colors.divider }]}><Ionicons name="time-outline" size={12} color={Colors.textMuted} /></View>}
              <Text style={s.mText} numberOfLines={1}>{home ? "ضد" : "عند"} {opp?.name}</Text>
              <Text style={s.mScore}>{m.status === "finished" ? `${my} - ${their}` : `الجولة ${m.round}`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Info({ icon, label, value }: { icon: any; label: string; value?: string | null }) {
  if (!value) return null;
  return <View style={s.info}><Ionicons name={icon} size={16} color={LEAGUE_ACCENT} /><Text style={s.infoLabel}>{label}</Text><Text style={s.infoValue}>{value}</Text></View>;
}
function Empty({ icon, text }: { icon: any; text: string }) {
  return <View style={{ alignItems: "center", gap: 8, paddingVertical: 40 }}><Ionicons name={icon} size={44} color={Colors.textMuted} /><Text style={s.muted}>{text}</Text></View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: neu.base },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  hero: { minHeight: 200, paddingHorizontal: 16, paddingBottom: 18, justifyContent: "space-between" },
  heroTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center" },
  manage: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  manageText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  heroBody: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: 30 },
  logo: { width: 68, height: 68, borderRadius: 20, backgroundColor: "#fff" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff", textAlign: "right" },
  sub: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  liveHead: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#D93636" },
  liveTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#D93636" },
  tabsWrap: { backgroundColor: neu.base, paddingHorizontal: 16, paddingVertical: 12 },
  tabs: { flexDirection: "row-reverse", padding: 4, gap: 2 },
  tab: { alignItems: "center", justifyContent: "center", gap: 1, paddingVertical: 7 },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: Colors.textMuted },
  roundChip: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  roundText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary },
  legend: { flexDirection: "row-reverse", gap: 14, justifyContent: "center" },
  legendItem: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted },
  scorer: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.divider, alignItems: "center", justifyContent: "center" },
  rankText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  scorerName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  goals: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  goalsText: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  teamCard: { alignItems: "center", gap: 6, padding: 14 },
  teamName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
  h: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", marginTop: 4 },
  info: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 },
  infoLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, minWidth: 70, textAlign: "right" },
  infoValue: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: neu.base, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, gap: 12, width: "100%", maxWidth: 620, alignSelf: "center" },
  teamTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  teamStats: { flexDirection: "row-reverse", justifyContent: "space-between", backgroundColor: Colors.cardBg, borderRadius: 16, padding: 10 },
  ts: { alignItems: "center", flex: 1 },
  tsNum: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  tsLabel: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted },
  mRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 10 },
  res: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  resText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  mText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  mScore: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textSecondary },
});
