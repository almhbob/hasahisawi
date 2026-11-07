/** ⚽ مركز المباراة: النتيجة، الأحداث، التشكيلة، الطاقم، حجز التذاكر، ولوحة الحكم */
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { confirmAction, notify } from "@/lib/xplatform";
import { neu, NeuButton, NeuInset, NeuRaised } from "@/components/auth/neu";
import { ScorePair, StatusPill, TeamBadge } from "@/components/leagues/ui";
import { EVENT_META, fmtKickoff, LEAGUE_ACCENT, leaguesApi, money, type MatchDetail } from "@/lib/leagues-api";

export default function LeagueMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token, user, isGuest } = useAuth();
  const [d, setD] = useState<MatchDetail | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"events" | "lineups" | "tickets">("events");

  const load = useCallback(async () => {
    try { setD(await leaguesApi.match(Number(id), token)); setError(""); } catch (e: any) { setError(e?.message || "تعذّر التحميل"); }
  }, [id, token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (d?.match.status !== "live") return;
    const t = setInterval(load, 20000); return () => clearInterval(t);
  }, [d?.match.status, load]);
  useEffect(() => { if (d?.match.tickets_enabled && d.match.status !== "finished") setView(v => v === "events" && !d.events.length ? "tickets" : v); }, [d?.match.id]);

  if (error) return <View style={[s.center, { paddingTop: insets.top }]}><Text style={s.muted}>{error}</Text></View>;
  if (!d) return <View style={s.center}><ActivityIndicator color={LEAGUE_ACCENT} /></View>;
  const { match: m, home, away } = d;
  const color = d.league.primary_color || LEAGUE_ACCENT;
  const showScore = m.status === "live" || m.status === "finished";
  const loggedIn = !!user && !isGuest && !!token;

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={color} />}>
        <LinearGradient colors={[color, "#1E1B4B"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[s.board, { paddingTop: insets.top + 8 }]}>
          <View style={s.boardTop}>
            <TouchableOpacity onPress={() => router.back()} style={s.round} accessibilityLabel="رجوع"><Ionicons name="arrow-forward" size={20} color="#fff" /></TouchableOpacity>
            <Pressable onPress={() => router.push({ pathname: "/league", params: { id: String(d.league.id) } } as any)}>
              <Text style={s.leagueName} numberOfLines={1}>{d.league.name}</Text>
            </Pressable>
            <View style={{ width: 40 }} />
          </View>
          <Text style={s.stage}>{m.stage || `الجولة ${m.round}`}{m.group_name ? ` · المجموعة ${m.group_name}` : ""}</Text>
          <View style={s.scoreRow}>
            <View style={s.side}><TeamBadge team={home} size={64} /><Text style={s.teamName} numberOfLines={2}>{home?.name}</Text></View>
            <View style={s.mid}>
              {showScore ? <ScorePair home={m.home_score ?? 0} away={m.away_score ?? 0} style={s.score} />
                : <Text style={s.kick}>{m.kickoff ? new Date(m.kickoff).toLocaleTimeString("ar-SD", { hour: "numeric", minute: "2-digit" }) : "—"}</Text>}
              <View style={{ marginTop: 6 }}><StatusPill status={m.status} /></View>
            </View>
            <View style={s.side}><TeamBadge team={away} size={64} /><Text style={s.teamName} numberOfLines={2}>{away?.name}</Text></View>
          </View>
          <View style={s.infoRow}>
            <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.85)" /><Text style={s.info}>{fmtKickoff(m.kickoff)}</Text>
          </View>
          {m.venue ? <View style={s.infoRow}><Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.85)" /><Text style={s.info}>{m.venue}</Text></View> : null}
          {(m.referee_name || m.assistants) ? <View style={s.infoRow}><Ionicons name="flag-outline" size={13} color="rgba(255,255,255,0.85)" /><Text style={s.info}>الحكم: {m.referee_name || "—"}{m.assistants ? ` · المساعدون: ${m.assistants}` : ""}</Text></View> : null}
        </LinearGradient>

        <View style={{ padding: 16, gap: 14 }}>
          {d.can_referee && <RefereePanel d={d} token={token!} onChanged={load} />}

          <NeuInset radius={16} style={s.tabs}>
            {([["events", "الأحداث", "list"], ["lineups", "التشكيلة", "people"], ["tickets", "التذاكر", "ticket"]] as const).map(([k, label, icon]) => (
              <Pressable key={k} onPress={() => setView(k)} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: view === k }}>
                {view === k ? <NeuRaised radius={12} depth={3} style={s.tab}><Ionicons name={icon} size={15} color={color} /><Text style={[s.tabText, { color }]}>{label}</Text></NeuRaised>
                  : <View style={s.tab}><Ionicons name={(icon + "-outline") as any} size={15} color={Colors.textMuted} /><Text style={s.tabText}>{label}</Text></View>}
              </Pressable>
            ))}
          </NeuInset>

          <Animated.View key={view} entering={FadeIn.duration(200)} style={{ gap: 10 }}>
            {view === "events" && (d.events.length === 0 ? <Text style={[s.muted, { textAlign: "center", paddingVertical: 24 }]}>لا توجد أحداث مسجّلة بعد</Text> : (
              <NeuRaised radius={20} depth={6} style={{ padding: 12, gap: 4 }}>
                {d.events.map(e => {
                  const meta = EVENT_META[e.type] || EVENT_META.goal;
                  const isHome = e.team_id === m.home_team_id;
                  return (
                    <View key={e.id} style={[s.ev, { flexDirection: isHome ? "row-reverse" : "row" }]}>
                      <View style={s.evMin}><Text style={s.evMinText}>{e.minute != null ? `${e.minute}'` : "—"}</Text></View>
                      <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                      <View style={{ flex: 1, alignItems: isHome ? "flex-end" : "flex-start" }}>
                        <Text style={s.evName}>{e.player_name || meta.label}</Text>
                        <Text style={s.muted}>{meta.label}{e.note ? ` · ${e.note}` : ""}</Text>
                      </View>
                    </View>
                  );
                })}
              </NeuRaised>
            ))}

            {view === "lineups" && (
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                {[home, away].map(t => (
                  <NeuRaised key={t?.id} radius={18} depth={5} style={{ flex: 1, padding: 12, gap: 6 }}>
                    <View style={{ alignItems: "center", gap: 4 }}><TeamBadge team={t} size={36} /><Text style={s.evName}>{t?.name}</Text>{t?.coach ? <Text style={s.muted}>المدرب: {t.coach}</Text> : null}</View>
                    {(t?.players || []).length === 0 ? <Text style={[s.muted, { textAlign: "center" }]}>لم تُعلن القائمة</Text> : (t!.players!).map(p => (
                      <View key={p.id} style={s.player}><Text style={s.num}>{p.number ?? "-"}</Text><Text style={s.pName} numberOfLines={1}>{p.name}</Text></View>
                    ))}
                  </NeuRaised>
                ))}
              </View>
            )}

            {view === "tickets" && <TicketsPanel d={d} token={token} loggedIn={loggedIn} onBooked={load} />}
          </Animated.View>

          {m.referee_report && m.status === "finished" ? (
            <NeuRaised radius={18} depth={5} style={{ padding: 14, gap: 4 }}>
              <Text style={s.h}>تقرير الحكم</Text><Text style={s.body}>{m.referee_report}</Text>
            </NeuRaised>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function TicketsPanel({ d, token, loggedIn, onBooked }: { d: MatchDetail; token: string | null; loggedIn: boolean; onBooked: () => void }) {
  const [typeId, setTypeId] = useState<number | null>(d.ticket_types[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const m = d.match;
  if (!m.tickets_enabled || d.ticket_types.length === 0) return <Text style={[s.muted, { textAlign: "center", paddingVertical: 24 }]}>لا تُباع تذاكر لهذه المباراة عبر التطبيق</Text>;
  const t = d.ticket_types.find(x => x.id === typeId);
  const left = t ? t.capacity - t.sold : 0;
  const book = async () => {
    if (!loggedIn) { router.push("/login" as any); return; }
    if (!t) return;
    setBusy(true);
    try { const r = await leaguesApi.reserve(token!, m.id, { type_id: t.id, qty }); notify("تم الحجز ✅", r.message); onBooked(); router.push("/my-tickets" as any); }
    catch (e: any) { notify("تعذّر الحجز", e?.message); }
    setBusy(false);
  };
  return (
    <View style={{ gap: 10 }}>
      {d.ticket_types.map(x => {
        const on = x.id === typeId; const rem = x.capacity - x.sold;
        return (
          <Pressable key={x.id} onPress={() => rem > 0 && setTypeId(x.id)} disabled={rem <= 0} accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <NeuRaised radius={18} depth={on ? 2 : 6} style={[s.tt, on && { borderWidth: 2, borderColor: LEAGUE_ACCENT }, rem <= 0 && { opacity: 0.5 }]}>
              <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={LEAGUE_ACCENT} />
              <View style={{ flex: 1 }}>
                <Text style={s.ttName}>{x.name}</Text>
                <Text style={s.muted}>{rem <= 0 ? "نفدت" : `متبقٍ ${rem} من ${x.capacity}`}{x.note ? ` · ${x.note}` : ""}</Text>
                <View style={s.bar}><View style={[s.barFill, { width: `${Math.min(100, (x.sold / Math.max(1, x.capacity)) * 100)}%` }]} /></View>
              </View>
              <Text style={s.ttPrice}>{money(x.price)}</Text>
            </NeuRaised>
          </Pressable>
        );
      })}
      {t && left > 0 && (
        <View style={s.qtyRow}>
          <Text style={s.evName}>العدد</Text>
          <View style={s.stepper}>
            <TouchableOpacity onPress={() => setQty(q => Math.min(6, Math.min(left, q + 1)))} style={s.step}><Ionicons name="add" size={18} color="#fff" /></TouchableOpacity>
            <Text style={s.qty}>{qty}</Text>
            <TouchableOpacity onPress={() => setQty(q => Math.max(1, q - 1))} style={[s.step, { backgroundColor: Colors.divider }]}><Ionicons name="remove" size={18} color={Colors.textPrimary} /></TouchableOpacity>
          </View>
          <Text style={s.total}>{money(Number(t.price) * qty)}</Text>
        </View>
      )}
      <NeuButton label={loggedIn ? "احجز التذاكر" : "سجّل الدخول للحجز"} icon="ticket-outline" onPress={book} loading={busy} disabled={!t || left <= 0} />
      <Text style={[s.muted, { textAlign: "center" }]}>التذاكر المدفوعة تُؤكَّد بعد الدفع للجنة المنظمة، وتُمسح عند بوابة الملعب مرة واحدة.</Text>
    </View>
  );
}

function RefereePanel({ d, token, onChanged }: { d: MatchDetail; token: string; onChanged: () => void }) {
  const m = d.match;
  const [team, setTeam] = useState<number>(m.home_team_id);
  const [type, setType] = useState("goal");
  const [player, setPlayer] = useState("");
  const [minute, setMinute] = useState("");
  const [report, setReport] = useState(m.referee_report || "");
  const [busy, setBusy] = useState<string | null>(null);
  const players = (team === m.home_team_id ? d.home : d.away)?.players || [];

  const run = async (k: string, fn: () => Promise<any>) => { setBusy(k); try { await fn(); onChanged(); } catch (e: any) { notify("خطأ", e?.message); } setBusy(null); };
  const addEvent = () => run("ev", async () => { await leaguesApi.addEvent(token, m.id, { team_id: team, type, player_name: player.trim() || undefined, minute: minute ? Number(minute) : undefined } as any); setPlayer(""); setMinute(""); });
  const setStatus = async (status: string) => {
    if (status === "finished" && !(await confirmAction("إنهاء المباراة", `اعتماد النتيجة ${m.home_score ?? 0} - ${m.away_score ?? 0}؟ تدخل في جدول الترتيب.`, "اعتماد"))) return;
    run(status, () => leaguesApi.updateMatch(token, m.id, { status } as any));
  };

  return (
    <Animated.View entering={FadeInDown}>
      <NeuRaised radius={20} depth={7} style={{ padding: 14, gap: 10, borderWidth: 1.5, borderColor: "#F59E0B66" }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
          <Ionicons name="flag" size={18} color="#B45309" /><Text style={[s.h, { color: "#B45309" }]}>لوحة الحكم</Text>
        </View>
        <View style={{ flexDirection: "row-reverse", gap: 6 }}>
          {([["scheduled", "لم تبدأ"], ["live", "بدأت (مباشر)"], ["finished", "انتهت"]] as const).map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => setStatus(k)} disabled={!!busy} style={[s.stBtn, m.status === k && { backgroundColor: k === "live" ? "#EF4444" : k === "finished" ? "#10B981" : "#64748B", borderColor: "transparent" }]}>
              {busy === k ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[s.stText, m.status === k && { color: "#fff" }]}>{l}</Text>}
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.label}>تسجيل حدث</Text>
        <View style={{ flexDirection: "row-reverse", gap: 6 }}>
          {[d.home, d.away].map(t => (
            <TouchableOpacity key={t.id} onPress={() => setTeam(t.id)} style={[s.teamBtn, team === t.id && { borderColor: LEAGUE_ACCENT, backgroundColor: LEAGUE_ACCENT + "12" }]}>
              <TeamBadge team={t} size={22} /><Text style={s.stText} numberOfLines={1}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(EVENT_META).map(([k, v]) => (
            <TouchableOpacity key={k} onPress={() => setType(k)} style={[s.evBtn, type === k && { borderColor: v.color, backgroundColor: v.color + "1A" }]}>
              <Ionicons name={v.icon as any} size={13} color={v.color} /><Text style={s.evBtnText}>{v.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {players.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 6, flexDirection: "row-reverse" }}>
            {players.map(p => (
              <TouchableOpacity key={p.id} onPress={() => setPlayer(p.name)} style={[s.pChip, player === p.name && { backgroundColor: LEAGUE_ACCENT }]}>
                <Text style={[s.pChipText, player === p.name && { color: "#fff" }]}>{p.number ? `${p.number} · ` : ""}{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          <NeuInset radius={12} style={{ flex: 1 }}><TextInput value={player} onChangeText={setPlayer} placeholder="اسم اللاعب" placeholderTextColor={Colors.textSubtle} style={s.input} /></NeuInset>
          <NeuInset radius={12} style={{ width: 80 }}><TextInput value={minute} onChangeText={v => setMinute(v.replace(/\D/g, "").slice(0, 3))} placeholder="الدقيقة" keyboardType="number-pad" placeholderTextColor={Colors.textSubtle} style={s.input} /></NeuInset>
        </View>
        <NeuButton label="إضافة الحدث" icon="add-circle-outline" onPress={addEvent} loading={busy === "ev"} />
        {d.events.length > 0 && (
          <View style={{ gap: 4 }}>
            {d.events.slice(-4).map(e => (
              <View key={e.id} style={s.evRow}>
                <Text style={s.muted} numberOfLines={1}>{e.minute ?? "—"}' · {(EVENT_META[e.type] || EVENT_META.goal).label} · {e.player_name || ""}</Text>
                <TouchableOpacity onPress={() => run("del" + e.id, () => leaguesApi.removeEvent(token, m.id, e.id))} accessibilityLabel="حذف الحدث"><Ionicons name="trash-outline" size={16} color="#EF4444" /></TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <Text style={s.label}>تقرير الحكم</Text>
        <NeuInset radius={12}><TextInput value={report} onChangeText={setReport} multiline placeholder="ملاحظات الانضباط، الإصابات، أحداث خارج الملعب…" placeholderTextColor={Colors.textSubtle} style={[s.input, { minHeight: 70, textAlignVertical: "top" }]} /></NeuInset>
        <NeuButton variant="soft" label="حفظ التقرير" icon="document-text-outline" onPress={() => run("rep", () => leaguesApi.updateMatch(token, m.id, { referee_report: report } as any))} loading={busy === "rep"} />
      </NeuRaised>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: neu.base },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  board: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: 4 },
  boardTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  leagueName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", maxWidth: 240 },
  stage: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: "rgba(255,255,255,0.85)", textAlign: "center", marginTop: 6 },
  scoreRow: { flexDirection: "row-reverse", alignItems: "center", marginVertical: 12 },
  side: { flex: 1, alignItems: "center", gap: 8 },
  teamName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", textAlign: "center" },
  mid: { width: 120, alignItems: "center" },
  score: { fontFamily: "Cairo_700Bold", fontSize: 40, color: "#fff", writingDirection: "ltr" },
  kick: { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#FACC15" },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5 },
  info: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "rgba(255,255,255,0.9)", textAlign: "center" },
  tabs: { flexDirection: "row-reverse", padding: 4, gap: 2 },
  tab: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9 },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textMuted },
  ev: { alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  evMin: { minWidth: 36, alignItems: "center", backgroundColor: Colors.bg, borderRadius: 8, paddingVertical: 2 },
  evMinText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },
  evName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary },
  player: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  num: { width: 24, textAlign: "center", fontFamily: "Cairo_700Bold", fontSize: 12, color: LEAGUE_ACCENT },
  pName: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textPrimary, textAlign: "right" },
  tt: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 14 },
  ttName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  ttPrice: { fontFamily: "Cairo_700Bold", fontSize: 15, color: LEAGUE_ACCENT },
  bar: { height: 4, borderRadius: 2, backgroundColor: Colors.divider, marginTop: 5, overflow: "hidden", flexDirection: "row-reverse" },
  barFill: { height: "100%", backgroundColor: LEAGUE_ACCENT },
  qtyRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  stepper: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  step: { width: 34, height: 34, borderRadius: 11, backgroundColor: LEAGUE_ACCENT, alignItems: "center", justifyContent: "center" },
  qty: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, minWidth: 20, textAlign: "center" },
  total: { marginRight: "auto", fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  body: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 21 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textSecondary, textAlign: "right" },
  stBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  stText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary, flexShrink: 1 },
  teamBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 6, padding: 8, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.divider },
  evBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider },
  evBtnText: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: Colors.textSecondary },
  pChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  pChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary },
  input: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingHorizontal: 12, paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  evRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
