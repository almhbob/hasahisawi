/**
 * 🛠️ لوحة إدارة الدوري:
 *  • اللجنة المنظمة: الفرق واللاعبون، مولّد الجدول، جدولة المباريات وإسناد الحكام، التذاكر، اللجان، الإعدادات.
 *  • الحكم: مبارياته المسندة إليه (ويُدير كل مباراة من مركزها).
 *  • موظف البوابة: ماسح التذاكر عند المدخل.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { confirmAction, notify } from "@/lib/xplatform";
import { onlyDigits } from "@/lib/digits";
import { neu, NeuButton, NeuInset, NeuRaised } from "@/components/auth/neu";
import { ImageUploadField } from "@/components/union/ImageUploadField";
import { MatchCard, StatusPill, TeamBadge } from "@/components/leagues/ui";
import { fmtKickoff, LEAGUE_ACCENT, leaguesApi, money, ROLE_AR, type LeagueDetail, type Match, type Team, type Ticket, type TicketType } from "@/lib/leagues-api";

type Sec = "teams" | "fixtures" | "matches" | "tickets" | "gate" | "staff" | "settings" | "mine";

export default function LeagueManage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [d, setD] = useState<LeagueDetail | null>(null);
  const [sec, setSec] = useState<Sec | null>(null);

  const load = useCallback(async () => {
    try { setD(await leaguesApi.get(Number(id), token)); } catch (e: any) { notify("تعذّر التحميل", e?.message); }
  }, [id, token]);
  useEffect(() => { load(); }, [load]);

  const roles = d?.roles || [];
  const org = roles.includes("organizer");
  const SECS = useMemo(() => {
    const all: { k: Sec; label: string; icon: any; show: boolean }[] = [
      { k: "teams", label: "الفرق", icon: "shield", show: org },
      { k: "fixtures", label: "الجدول", icon: "git-network", show: org },
      { k: "matches", label: "المباريات", icon: "calendar", show: org },
      { k: "mine", label: "مبارياتي", icon: "flag", show: !org && roles.includes("referee") },
      { k: "tickets", label: "التذاكر", icon: "ticket", show: org },
      { k: "gate", label: "البوابة", icon: "scan", show: org || roles.includes("gate") },
      { k: "staff", label: "اللجان", icon: "people", show: org },
      { k: "settings", label: "الإعدادات", icon: "settings", show: org },
    ];
    return all.filter(x => x.show);
  }, [org, roles.join()]);
  useEffect(() => { if (!sec && SECS.length) setSec(SECS[0].k); }, [SECS]);

  if (!d) return <View style={s.center}><ActivityIndicator color={LEAGUE_ACCENT} /></View>;
  if (!roles.length) return <View style={s.center}><Text style={s.muted}>لا تملك صلاحية إدارة هذا الدوري</Text></View>;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} /></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{d.league.name}</Text>
          <Text style={s.sub}>{roles.filter(r => r !== "admin").map(r => ROLE_AR[r]).join(" · ")}{!d.league.approved ? " · بانتظار اعتماد الإدارة" : ""}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push({ pathname: "/league", params: { id: String(d.league.id) } } as any)} style={s.iconBtn} accessibilityLabel="عرض صفحة الدوري"><Ionicons name="eye-outline" size={18} color={Colors.textPrimary} /></TouchableOpacity>
      </View>
      {roles.includes("admin") && !d.league.approved && (
        <TouchableOpacity onPress={async () => { await leaguesApi.update(token!, d.league.id, { approved: true }); load(); }} style={s.approve}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" /><Text style={s.approveText}>اعتماد الدوري ونشره للجمهور (إدارة التطبيق)</Text>
        </TouchableOpacity>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row-reverse" }}>
        {SECS.map(x => (
          <TouchableOpacity key={x.k} onPress={() => setSec(x.k)} style={[s.secChip, sec === x.k && { backgroundColor: LEAGUE_ACCENT, borderColor: LEAGUE_ACCENT }]}>
            <Ionicons name={x.icon} size={15} color={sec === x.k ? "#fff" : LEAGUE_ACCENT} /><Text style={[s.secText, sec === x.k && { color: "#fff" }]}>{x.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Animated.View key={sec} entering={FadeIn.duration(180)} style={{ gap: 12 }}>
          {sec === "teams" && <TeamsSec d={d} token={token!} reload={load} />}
          {sec === "fixtures" && <FixturesSec d={d} token={token!} reload={load} />}
          {sec === "matches" && <MatchesSec d={d} token={token!} reload={load} />}
          {sec === "mine" && <MineSec d={d} uid={user?.id} />}
          {sec === "tickets" && <TicketsSec d={d} token={token!} />}
          {sec === "gate" && <GateSec d={d} token={token!} />}
          {sec === "staff" && <StaffSec d={d} token={token!} reload={load} />}
          {sec === "settings" && <SettingsSec d={d} token={token!} reload={load} />}
          {sec === "settings" && (roles.includes("admin") || d.league.created_by === user?.id) && (
            <NeuRaised radius={18} depth={4} style={{ padding: 14, gap: 8, borderWidth: 1, borderColor: "#D9363633" }}>
              <Text style={[s.label, { color: "#D93636" }]}>حذف الدوري</Text>
              <Text style={s.muted}>يحذف الدوري نهائياً مع الفرق والمباريات والأحداث والتذاكر. لإخفائه مؤقتاً غيّر حالته بدل الحذف.</Text>
              <TouchableOpacity accessibilityRole="button" style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: "#D93636" }} onPress={async () => {
                if (!(await confirmAction("حذف الدوري", `حذف «${d.league.name}» نهائياً؟ لا يمكن التراجع.`, "حذف نهائي", true))) return;
                try { await leaguesApi.remove(token!, d.league.id); notify("تم حذف الدوري"); router.replace("/leagues" as any); }
                catch (e: any) { notify("تعذّر الحذف", e?.message); }
              }}>
                <Ionicons name="trash" size={18} color="#fff" /><Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff" }}>حذف الدوري نهائياً</Text>
              </TouchableOpacity>
            </NeuRaised>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ── الفرق ─────────────────────────────────────────────────
function TeamsSec({ d, token, reload }: { d: LeagueDetail; token: string; reload: () => void }) {
  const [f, setF] = useState({ name: "", group_name: "", coach: "", logo_url: "" });
  const [busy, setBusy] = useState(false);
  const [squad, setSquad] = useState<Team | null>(null);
  const groups = d.league.format === "groups";
  const add = async () => {
    if (f.name.trim().length < 2) return notify("اكتب اسم الفريق");
    setBusy(true);
    try { await leaguesApi.addTeam(token, d.league.id, { ...f, logo_url: f.logo_url || null } as any); setF({ name: "", group_name: f.group_name, coach: "", logo_url: "" }); reload(); }
    catch (e: any) { notify("تعذّرت الإضافة", e?.message); }
    setBusy(false);
  };
  const pending = d.teams.filter(t => t.status === "pending");
  return (
    <>
      {pending.length > 0 && (
        <NeuRaised radius={18} depth={6} style={{ padding: 12, gap: 8, borderWidth: 1.5, borderColor: "#F59E0B55" }}>
          <Text style={s.h}>طلبات تسجيل فرق ({pending.length})</Text>
          {pending.map(t => (
            <View key={t.id} style={s.rowItem}>
              <TeamBadge team={t} size={34} />
              <View style={{ flex: 1 }}><Text style={s.itemTitle}>{t.name}</Text><Text style={s.muted}>{[t.manager_name, t.manager_phone, t.coach].filter(Boolean).join(" · ")}</Text></View>
              <TouchableOpacity onPress={async () => { await leaguesApi.updateTeam(token, d.league.id, t.id, { status: "approved" }); reload(); }} style={[s.mini, { backgroundColor: "#00966A" }]}><Text style={s.miniText}>اعتماد</Text></TouchableOpacity>
              <TouchableOpacity onPress={async () => { await leaguesApi.updateTeam(token, d.league.id, t.id, { status: "rejected" }); reload(); }} style={[s.mini, { backgroundColor: "#D93636" }]}><Text style={s.miniText}>رفض</Text></TouchableOpacity>
            </View>
          ))}
        </NeuRaised>
      )}
      <NeuRaised radius={18} depth={6} style={{ padding: 14, gap: 8 }}>
        <Text style={s.h}>إضافة فريق</Text>
        <ImageUploadField label="شعار الفريق (اختياري)" value={f.logo_url} onChange={u => setF({ ...f, logo_url: u })} folder="leagues" aspect={1} />
        <Field value={f.name} onChange={v => setF({ ...f, name: v })} placeholder="اسم الفريق" />
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          {groups && <View style={{ width: 90 }}><Field value={f.group_name} onChange={v => setF({ ...f, group_name: v.toUpperCase().slice(0, 2) })} placeholder="المجموعة" /></View>}
          <View style={{ flex: 1 }}><Field value={f.coach} onChange={v => setF({ ...f, coach: v })} placeholder="المدرب (اختياري)" /></View>
        </View>
        <NeuButton label="إضافة الفريق" icon="add" onPress={add} loading={busy} />
      </NeuRaised>
      {d.teams.filter(t => t.status === "approved").map(t => (
        <NeuRaised key={t.id} radius={16} depth={5} style={[s.rowItem, { padding: 12 }]}>
          <TeamBadge team={t} size={38} />
          <View style={{ flex: 1 }}><Text style={s.itemTitle}>{t.name}</Text><Text style={s.muted}>{t.group_name ? `المجموعة ${t.group_name} · ` : ""}{t.players_count || 0} لاعب{t.coach ? ` · ${t.coach}` : ""}</Text></View>
          <TouchableOpacity onPress={() => setSquad(t)} style={[s.mini, { backgroundColor: LEAGUE_ACCENT }]}><Text style={s.miniText}>اللاعبون</Text></TouchableOpacity>
          <TouchableOpacity onPress={async () => { if (await confirmAction("حذف الفريق", `حذف «${t.name}» ومبارياته؟`, "حذف", true)) { await leaguesApi.removeTeam(token, d.league.id, t.id); reload(); } }} accessibilityLabel="حذف"><Ionicons name="trash-outline" size={18} color="#D93636" /></TouchableOpacity>
        </NeuRaised>
      ))}
      <SquadSheet team={squad} d={d} token={token} onClose={() => { setSquad(null); reload(); }} />
    </>
  );
}

function SquadSheet({ team, d, token, onClose }: { team: Team | null; d: LeagueDetail; token: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    // سطر لكل لاعب: «10 محمد أحمد» أو «محمد أحمد - 10»
    const players = text.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
      const n = onlyDigits(l.match(/\d+/)?.[0] || "");
      return { name: l.replace(/[-–·]?\s*[\d٠-٩]+\s*[-–·]?/, "").trim(), number: n ? Number(n) : undefined };
    }).filter(p => p.name);
    if (!players.length || !team) return;
    setBusy(true);
    try { await leaguesApi.addPlayers(token, d.league.id, team.id, players as any); setText(""); notify("تمت الإضافة", `أُضيف ${players.length} لاعب`); onClose(); }
    catch (e: any) { notify("خطأ", e?.message); }
    setBusy(false);
  };
  return (
    <Modal visible={!!team} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>
          <Text style={s.h}>قائمة لاعبي {team?.name}</Text>
          <Text style={s.muted}>اكتب لاعباً في كل سطر مع رقمه، مثال: «10 محمد أحمد»</Text>
          <NeuInset radius={14}><TextInput value={text} onChangeText={setText} multiline placeholder={"1 حارس المرمى\n9 محمد أحمد\n10 علي عثمان"} placeholderTextColor={Colors.textSubtle} style={[s.input, { minHeight: 160, textAlignVertical: "top" }]} /></NeuInset>
          <NeuButton label="حفظ اللاعبين" icon="save-outline" onPress={save} loading={busy} />
        </View>
      </View>
    </Modal>
  );
}

// ── مولّد الجدول ───────────────────────────────────────────
function FixturesSec({ d, token, reload }: { d: LeagueDetail; token: string; reload: () => void }) {
  const today = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [f, setF] = useState({ start_date: today, time: "16:00", days_between: "7", double_round: true });
  const [busy, setBusy] = useState(false);
  const approved = d.teams.filter(t => t.status === "approved").length;
  const perGroup = d.league.format === "groups" ? "لكل مجموعة على حدة" : "";
  const n = approved % 2 ? approved + 1 : approved;
  const estimate = approved >= 2 ? (n - 1) * (f.double_round ? 2 : 1) : 0;
  const gen = async () => {
    const replace = d.matches.length > 0;
    if (replace && !(await confirmAction("استبدال الجدول", `يوجد ${d.matches.length} مباراة. سيُحذف الجدول الحالي ونتائجه وتذاكره.`, "استبدال", true))) return;
    setBusy(true);
    try { const r = await leaguesApi.generate(token, d.league.id, { ...f, days_between: Number(f.days_between) || 7, replace }); notify("تم توليد الجدول", `${r.created} مباراة`); reload(); }
    catch (e: any) { notify("تعذّر التوليد", e?.message); }
    setBusy(false);
  };
  return (
    <>
      <NeuRaised radius={18} depth={6} style={{ padding: 14, gap: 10 }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}><Ionicons name="git-network" size={20} color={LEAGUE_ACCENT} /><Text style={s.h}>مولّد الجدول الآلي</Text></View>
        <Text style={s.muted}>كل فريق يلاقي جميع الفرق الأخرى {perGroup}، بلا تكرار في الجولة نفسها، مع تبادل الأرض بين الجولات.</Text>
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          <View style={{ flex: 1.4 }}><Text style={s.label}>تاريخ أول جولة</Text><Field value={f.start_date} onChange={v => setF({ ...f, start_date: v })} placeholder="YYYY-MM-DD" ltr /></View>
          <View style={{ flex: 1 }}><Text style={s.label}>الساعة</Text><Field value={f.time} onChange={v => setF({ ...f, time: v })} placeholder="16:00" ltr /></View>
          <View style={{ flex: 1 }}><Text style={s.label}>أيام بين الجولات</Text><Field value={f.days_between} onChange={v => setF({ ...f, days_between: onlyDigits(v, 2) })} ltr /></View>
        </View>
        <View style={s.switchRow}><Text style={s.itemTitle}>ذهاب وإياب</Text><Switch value={f.double_round} onValueChange={v => setF({ ...f, double_round: v })} trackColor={{ true: LEAGUE_ACCENT + "88", false: Colors.divider }} thumbColor={f.double_round ? LEAGUE_ACCENT : "#f4f4f4"} /></View>
        <View style={s.estimate}><Ionicons name="information-circle" size={16} color={LEAGUE_ACCENT} /><Text style={s.estimateText}>{approved} فريق معتمد ← {estimate} جولة تقريباً</Text></View>
        <NeuButton label={d.matches.length ? "إعادة توليد الجدول" : "توليد الجدول"} icon="flash-outline" onPress={gen} loading={busy} disabled={approved < 2} />
      </NeuRaised>
      <ManualMatch d={d} token={token} reload={reload} />
    </>
  );
}

function ManualMatch({ d, token, reload }: { d: LeagueDetail; token: string; reload: () => void }) {
  const teams = d.teams.filter(t => t.status === "approved");
  const [h, setH] = useState<number | null>(null); const [a, setA] = useState<number | null>(null);
  const [stage, setStage] = useState(""); const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!h || !a || h === a) return notify("اختر فريقين مختلفين");
    setBusy(true);
    try { await leaguesApi.addMatch(token, d.league.id, { home_team_id: h, away_team_id: a, stage: stage || undefined, round: Math.max(1, ...d.matches.map(m => m.round)) + 1 } as any); setH(null); setA(null); setStage(""); reload(); }
    catch (e: any) { notify("خطأ", e?.message); }
    setBusy(false);
  };
  return (
    <NeuRaised radius={18} depth={6} style={{ padding: 14, gap: 8 }}>
      <Text style={s.h}>مباراة يدوية (ربع نهائي، نصف نهائي، نهائي…)</Text>
      <Field value={stage} onChange={setStage} placeholder="اسم الدور، مثال: النهائي" />
      {[["المضيف", h, setH], ["الضيف", a, setA]].map(([label, val, set]: any) => (
        <View key={label} style={{ gap: 4 }}>
          <Text style={s.label}>{label}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 6, flexDirection: "row-reverse" }}>
            {teams.map(t => (
              <TouchableOpacity key={t.id} onPress={() => set(t.id)} style={[s.teamPick, val === t.id && { borderColor: LEAGUE_ACCENT, backgroundColor: LEAGUE_ACCENT + "12" }]}>
                <TeamBadge team={t} size={22} /><Text style={s.miniDark} numberOfLines={1}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ))}
      <NeuButton variant="soft" label="إضافة المباراة" icon="add" onPress={add} loading={busy} />
    </NeuRaised>
  );
}

// ── المباريات: الموعد والملعب والحكم ──────────────────────────
function MatchesSec({ d, token, reload }: { d: LeagueDetail; token: string; reload: () => void }) {
  const [edit, setEdit] = useState<Match | null>(null);
  const byId = new Map(d.teams.map(t => [t.id, t]));
  if (!d.matches.length) return <Text style={[s.muted, { textAlign: "center", padding: 30 }]}>ولّد الجدول أولاً من قسم «الجدول»</Text>;
  return (
    <>
      {d.matches.map(m => (
        <View key={m.id} style={{ gap: 4 }}>
          <MatchCard m={m} home={byId.get(m.home_team_id)} away={byId.get(m.away_team_id)} onPress={() => setEdit(m)} />
          <View style={s.matchMeta}>
            <Ionicons name="flag-outline" size={12} color={m.referee_name ? "#00966A" : "#E8A900"} />
            <Text style={[s.muted, { flex: 1 }]}>{m.referee_name ? `الحكم: ${m.referee_name}` : "لم يُسند حكم"}</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: "/league-match", params: { id: String(m.id) } } as any)}><Text style={s.link}>مركز المباراة</Text></TouchableOpacity>
          </View>
        </View>
      ))}
      <MatchEditSheet m={edit} d={d} token={token} onClose={() => { setEdit(null); reload(); }} />
    </>
  );
}

function MatchEditSheet({ m, d, token, onClose }: { m: Match | null; d: LeagueDetail; token: string; onClose: () => void }) {
  const refs = d.staff.filter(x => x.role === "referee");
  const [f, setF] = useState({ date: "", time: "", venue: "", stage: "", referee_user_id: 0, assistants: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!m) return;
    const k = m.kickoff ? new Date(m.kickoff) : null;
    const pad = (n: number) => String(n).padStart(2, "0");
    setF({ date: k ? `${k.getFullYear()}-${pad(k.getMonth() + 1)}-${pad(k.getDate())}` : "", time: k ? `${pad(k.getHours())}:${pad(k.getMinutes())}` : "",
      venue: m.venue || "", stage: m.stage || "", referee_user_id: m.referee_user_id || 0, assistants: m.assistants || "" });
  }, [m?.id]);
  if (!m) return null;
  const save = async () => {
    setBusy(true);
    try {
      const ref = refs.find(r => r.user_id === f.referee_user_id);
      const kickoff = /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? new Date(`${f.date}T${/^\d{1,2}:\d{2}$/.test(f.time) ? f.time.padStart(5, "0") : "16:00"}:00`).toISOString() : null;
      await leaguesApi.updateMatch(token, m.id, { kickoff, venue: f.venue, stage: f.stage, referee_user_id: f.referee_user_id || null, referee_name: ref?.name || null, assistants: f.assistants } as any);
      onClose();
    } catch (e: any) { notify("خطأ", e?.message); }
    setBusy(false);
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>
          <Text style={s.h}>جدولة المباراة</Text>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>
            <View style={{ flex: 1.4 }}><Text style={s.label}>التاريخ</Text><Field value={f.date} onChange={v => setF({ ...f, date: v })} placeholder="YYYY-MM-DD" ltr /></View>
            <View style={{ flex: 1 }}><Text style={s.label}>الساعة</Text><Field value={f.time} onChange={v => setF({ ...f, time: v })} placeholder="16:00" ltr /></View>
          </View>
          <Text style={s.label}>الملعب</Text><Field value={f.venue} onChange={v => setF({ ...f, venue: v })} />
          <Text style={s.label}>الدور</Text><Field value={f.stage} onChange={v => setF({ ...f, stage: v })} />
          <Text style={s.label}>الحكم (من لجنة التحكيم)</Text>
          {refs.length === 0 ? <Text style={s.muted}>أضف حكاماً من قسم «اللجان» أولاً</Text> : (
            <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 }}>
              {refs.map(r => (
                <TouchableOpacity key={r.user_id} onPress={() => setF({ ...f, referee_user_id: r.user_id })} style={[s.teamPick, f.referee_user_id === r.user_id && { borderColor: LEAGUE_ACCENT, backgroundColor: LEAGUE_ACCENT + "12" }]}>
                  <Ionicons name="flag" size={13} color={LEAGUE_ACCENT} /><Text style={s.miniDark}>{r.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <Text style={s.label}>الحكام المساعدون</Text><Field value={f.assistants} onChange={v => setF({ ...f, assistants: v })} placeholder="الأسماء مفصولة بفاصلة" />
          <NeuButton label="حفظ" icon="save-outline" onPress={save} loading={busy} />
        </View>
      </View>
    </Modal>
  );
}

function MineSec({ d, uid }: { d: LeagueDetail; uid?: number }) {
  const mine = d.matches.filter(m => m.referee_user_id === uid);
  const byId = new Map(d.teams.map(t => [t.id, t]));
  if (!mine.length) return <Text style={[s.muted, { textAlign: "center", padding: 30 }]}>لم تُسند إليك مباريات بعد</Text>;
  return <>{mine.map(m => <MatchCard key={m.id} m={m} home={byId.get(m.home_team_id)} away={byId.get(m.away_team_id)} onPress={() => router.push({ pathname: "/league-match", params: { id: String(m.id) } } as any)} />)}</>;
}

// ── التذاكر ────────────────────────────────────────────────
function MatchPicker({ d, value, onChange }: { d: LeagueDetail; value: number | null; onChange: (id: number) => void }) {
  const byId = new Map(d.teams.map(t => [t.id, t]));
  const upcoming = d.matches.filter(m => m.status !== "finished" && m.status !== "cancelled");
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse" }}>
      {upcoming.map(m => (
        <TouchableOpacity key={m.id} onPress={() => onChange(m.id)} style={[s.mPick, value === m.id && { borderColor: LEAGUE_ACCENT, backgroundColor: LEAGUE_ACCENT + "10" }]}>
          <Text style={s.miniDark} numberOfLines={1}>{byId.get(m.home_team_id)?.name} × {byId.get(m.away_team_id)?.name}</Text>
          <Text style={s.muted}>{m.stage || `الجولة ${m.round}`} {m.tickets_enabled ? "· 🎟" : ""}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function TicketsSec({ d, token }: { d: LeagueDetail; token: string }) {
  const [mid, setMid] = useState<number | null>(d.matches.find(m => m.status !== "finished")?.id ?? null);
  const [types, setTypes] = useState<Partial<TicketType>[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!mid) return;
    const [m, t] = await Promise.all([leaguesApi.match(mid, token), leaguesApi.matchTickets(token, mid)]);
    setTypes(m.ticket_types.length ? m.ticket_types : [{ name: "المقصورة", price: 5000, capacity: 50 }, { name: "الدرجة الأولى", price: 2000, capacity: 300 }, { name: "الدرجة الثالثة", price: 1000, capacity: 1000 }]);
    setTickets(t.tickets);
  }, [mid, token]);
  useEffect(() => { load().catch(() => {}); }, [load]);
  const upd = (i: number, p: Partial<TicketType>) => setTypes(ts => ts.map((t, k) => k === i ? { ...t, ...p } : t));
  const save = async () => {
    if (!mid) return; setBusy(true);
    try { await leaguesApi.setTicketTypes(token, mid, types.filter(t => t.name)); notify("تم", "فُتح بيع التذاكر لهذه المباراة"); load(); }
    catch (e: any) { notify("خطأ", e?.message); }
    setBusy(false);
  };
  const sold = tickets.filter(t => t.status !== "cancelled");
  const revenue = sold.filter(t => t.status !== "reserved").reduce((n, t) => n + Number(t.price || 0), 0);
  return (
    <>
      <MatchPicker d={d} value={mid} onChange={setMid} />
      {mid && (
        <>
          <View style={s.kpis}>
            {[["محجوزة", tickets.filter(t => t.status === "reserved").length, "#E8A900"], ["مدفوعة", tickets.filter(t => t.status === "paid").length, "#00966A"], ["دخلت", tickets.filter(t => t.status === "used").length, LEAGUE_ACCENT], ["الإيراد", money(revenue), Colors.textPrimary]].map(([l, v, c]) => (
              <NeuRaised key={String(l)} radius={14} depth={4} style={s.kpi}><Text style={[s.kpiNum, { color: c as string }]}>{v}</Text><Text style={s.muted}>{l}</Text></NeuRaised>
            ))}
          </View>
          <NeuRaised radius={18} depth={6} style={{ padding: 14, gap: 8 }}>
            <Text style={s.h}>فئات التذاكر</Text>
            {types.map((t, i) => (
              <View key={i} style={{ flexDirection: "row-reverse", gap: 6 }}>
                <View style={{ flex: 1.5 }}><Field value={String(t.name || "")} onChange={v => upd(i, { name: v })} placeholder="الفئة" /></View>
                <View style={{ flex: 1 }}><Field value={String(t.price ?? "")} onChange={v => upd(i, { price: onlyDigits(v, 7) })} placeholder="السعر" ltr /></View>
                <View style={{ flex: 1 }}><Field value={String(t.capacity ?? "")} onChange={v => upd(i, { capacity: Number(onlyDigits(v, 6)) || 0 })} placeholder="السعة" ltr /></View>
              </View>
            ))}
            <TouchableOpacity onPress={() => setTypes(ts => [...ts, { name: "", price: 0, capacity: 100 }])}><Text style={s.link}>+ فئة أخرى</Text></TouchableOpacity>
            <NeuButton label="حفظ وفتح البيع" icon="ticket-outline" onPress={save} loading={busy} />
          </NeuRaised>
          {tickets.length > 0 && (
            <NeuRaised radius={18} depth={6} style={{ padding: 12, gap: 6 }}>
              <Text style={s.h}>الحجوزات</Text>
              {tickets.map(t => (
                <View key={t.id} style={s.rowItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemTitle}>{t.holder_name || "—"} · {t.type_name}</Text>
                    <Text style={s.muted}>{t.code} · {t.phone || ""}</Text>
                  </View>
                  <StatusPill status={t.status === "used" ? "finished" : t.status === "paid" ? "running" : t.status === "cancelled" ? "cancelled" : "postponed"} />
                  {t.status === "reserved" && (
                    <TouchableOpacity onPress={async () => { await leaguesApi.setTicket(token, t.code, "paid"); load(); }} style={[s.mini, { backgroundColor: "#00966A" }]}><Text style={s.miniText}>تأكيد الدفع</Text></TouchableOpacity>
                  )}
                </View>
              ))}
            </NeuRaised>
          )}
        </>
      )}
    </>
  );
}

// ── البوابة: مسح التذاكر ───────────────────────────────────
function GateSec({ d, token }: { d: LeagueDetail; token: string }) {
  const [mid, setMid] = useState<number | null>(d.matches.find(m => m.tickets_enabled && m.status !== "finished")?.id ?? null);
  const [perm, requestPerm] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ ok: boolean; title: string; sub: string } | null>(null);
  const lock = useRef(false);
  const check = async (raw: string) => {
    if (lock.current || !raw.trim()) return;
    lock.current = true;
    try {
      const r = await leaguesApi.check(token, raw.trim(), mid ?? undefined);
      setResult({ ok: true, title: "تذكرة صالحة ✓", sub: `${r.ticket.holder_name || ""} · ${r.ticket.type_name}` });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      setResult({ ok: false, title: "مرفوضة ✕", sub: e?.message || "تذكرة غير صالحة" });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setCode("");
    setTimeout(() => { lock.current = false; }, 1800);
  };
  return (
    <>
      <MatchPicker d={d} value={mid} onChange={setMid} />
      {result && (
        <Animated.View entering={ZoomIn} style={[s.result, { backgroundColor: result.ok ? "#00966A" : "#D93636" }]}>
          <Ionicons name={result.ok ? "checkmark-circle" : "close-circle"} size={54} color="#fff" />
          <Text style={s.resultTitle}>{result.title}</Text>
          <Text style={s.resultSub}>{result.sub}</Text>
        </Animated.View>
      )}
      {Platform.OS !== "web" && (
        scanning ? (
          <View style={s.camWrap}>
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={({ data }) => check(data)} />
            <View style={s.camFrame} pointerEvents="none" />
            <TouchableOpacity onPress={() => setScanning(false)} style={s.camClose}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
          </View>
        ) : (
          <NeuButton label="فتح ماسح التذاكر" icon="scan" onPress={async () => { if (!perm?.granted) { const p = await requestPerm(); if (!p.granted) return notify("إذن الكاميرا مطلوب"); } setScanning(true); }} />
        )
      )}
      <NeuRaised radius={18} depth={6} style={{ padding: 14, gap: 8 }}>
        <Text style={s.h}>إدخال الرمز يدوياً</Text>
        <Field value={code} onChange={v => setCode(v.toUpperCase())} placeholder="مثال: 3FA9C21B7D04" ltr />
        <NeuButton variant="soft" label="تحقق" icon="shield-checkmark-outline" onPress={() => check(code)} />
      </NeuRaised>
    </>
  );
}

// ── اللجان ─────────────────────────────────────────────────
function StaffSec({ d, token, reload }: { d: LeagueDetail; token: string; reload: () => void }) {
  const [phone, setPhone] = useState(""); const [role, setRole] = useState<"organizer" | "referee" | "gate">("referee");
  const [title, setTitle] = useState(""); const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { const r = await leaguesApi.addStaff(token, d.league.id, phone, role, title); notify("تمت الإضافة", `${r.member.name} — ${ROLE_AR[role]}`); setPhone(""); setTitle(""); reload(); }
    catch (e: any) { notify("تعذّرت الإضافة", e?.message); }
    setBusy(false);
  };
  return (
    <>
      <NeuRaised radius={18} depth={6} style={{ padding: 14, gap: 8 }}>
        <Text style={s.h}>إضافة عضو</Text>
        <View style={{ flexDirection: "row-reverse", gap: 6 }}>
          {(["organizer", "referee", "gate"] as const).map(r => (
            <TouchableOpacity key={r} onPress={() => setRole(r)} style={[s.roleBtn, role === r && { backgroundColor: LEAGUE_ACCENT, borderColor: LEAGUE_ACCENT }]}>
              <Text style={[s.miniDark, role === r && { color: "#fff" }]}>{ROLE_AR[r]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Field value={phone} onChange={v => setPhone(onlyDigits(v, 14))} placeholder="رقم هاتف حسابه في التطبيق" ltr />
        <Field value={title} onChange={setTitle} placeholder={role === "referee" ? "الصفة (حكم دولي، حكم ساحة…)" : "الصفة (مقرر اللجنة، مسؤول الإعلام…)"} />
        <NeuButton label="إضافة" icon="person-add-outline" onPress={add} loading={busy} disabled={phone.length < 9} />
      </NeuRaised>
      {(["organizer", "referee", "gate"] as const).map(r => {
        const list = d.staff.filter(x => x.role === r);
        if (!list.length) return null;
        return (
          <NeuRaised key={r} radius={18} depth={5} style={{ padding: 12, gap: 6 }}>
            <Text style={s.h}>{ROLE_AR[r]} ({list.length})</Text>
            {list.map(x => (
              <View key={x.user_id + r} style={s.rowItem}>
                <View style={s.avatar}><Text style={s.avatarText}>{(x.name || "؟").charAt(0)}</Text></View>
                <View style={{ flex: 1 }}><Text style={s.itemTitle}>{x.name}</Text>{x.title ? <Text style={s.muted}>{x.title}</Text> : null}</View>
                <TouchableOpacity onPress={async () => { if (await confirmAction("إزالة", `إزالة ${x.name} من ${ROLE_AR[r]}؟`, "إزالة", true)) { await leaguesApi.removeStaff(token, d.league.id, x.user_id, r); reload(); } }}><Ionicons name="close-circle-outline" size={20} color="#D93636" /></TouchableOpacity>
              </View>
            ))}
          </NeuRaised>
        );
      })}
    </>
  );
}

// ── الإعدادات ──────────────────────────────────────────────
function SettingsSec({ d, token, reload }: { d: LeagueDetail; token: string; reload: () => void }) {
  const [f, setF] = useState({ ...d.league });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await leaguesApi.update(token, d.league.id, {
        name: f.name, season: f.season, description: f.description, rules: f.rules, venue: f.venue, logo_url: f.logo_url, cover_url: f.cover_url,
        primary_color: f.primary_color, status: f.status, points_win: f.points_win, points_draw: f.points_draw, points_loss: f.points_loss,
        start_date: f.start_date?.slice(0, 10), end_date: f.end_date?.slice(0, 10),
      } as any);
      notify("تم الحفظ"); reload();
    } catch (e: any) { notify("خطأ", e?.message); }
    setBusy(false);
  };
  const COLORS = ["#00301F", "#004D36", "#006B4A", "#00966A", "#4EC99D", "#6B4D00", "#946B00", "#E8A900"];
  return (
    <NeuRaised radius={18} depth={6} style={{ padding: 14, gap: 8 }}>
      <ImageUploadField label="شعار الدوري" value={f.logo_url || ""} onChange={u => setF({ ...f, logo_url: u })} folder="leagues" aspect={1} />
      <ImageUploadField label="صورة الغلاف" value={f.cover_url || ""} onChange={u => setF({ ...f, cover_url: u })} folder="leagues" aspect={16 / 9} />
      <Text style={s.label}>الاسم</Text><Field value={f.name} onChange={v => setF({ ...f, name: v })} />
      <Text style={s.label}>الموسم</Text><Field value={f.season || ""} onChange={v => setF({ ...f, season: v })} />
      <Text style={s.label}>الملعب</Text><Field value={f.venue || ""} onChange={v => setF({ ...f, venue: v })} />
      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
        <View style={{ flex: 1 }}><Text style={s.label}>البداية</Text><Field value={(f.start_date || "").slice(0, 10)} onChange={v => setF({ ...f, start_date: v })} placeholder="YYYY-MM-DD" ltr /></View>
        <View style={{ flex: 1 }}><Text style={s.label}>النهاية</Text><Field value={(f.end_date || "").slice(0, 10)} onChange={v => setF({ ...f, end_date: v })} placeholder="YYYY-MM-DD" ltr /></View>
      </View>
      <Text style={s.label}>اللون</Text>
      <View style={{ flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" }}>
        {COLORS.map(c => <TouchableOpacity key={c} onPress={() => setF({ ...f, primary_color: c })} style={[s.color, { backgroundColor: c }, f.primary_color === c && { borderWidth: 3, borderColor: "#F7D76A" }]} accessibilityLabel={c} />)}
      </View>
      <Text style={s.label}>النقاط (فوز / تعادل / خسارة)</Text>
      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
        {(["points_win", "points_draw", "points_loss"] as const).map(k => <View key={k} style={{ flex: 1 }}><Field value={String(f[k])} onChange={v => setF({ ...f, [k]: Number(onlyDigits(v, 2)) || 0 })} ltr /></View>)}
      </View>
      <Text style={s.label}>الحالة</Text>
      <View style={{ flexDirection: "row-reverse", gap: 6 }}>
        {([["registration", "التسجيل"], ["running", "جارٍ"], ["finished", "انتهى"]] as const).map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setF({ ...f, status: k })} style={[s.roleBtn, f.status === k && { backgroundColor: LEAGUE_ACCENT, borderColor: LEAGUE_ACCENT }]}><Text style={[s.miniDark, f.status === k && { color: "#fff" }]}>{l}</Text></TouchableOpacity>
        ))}
      </View>
      <Text style={s.label}>نبذة</Text><Field value={f.description || ""} onChange={v => setF({ ...f, description: v })} multiline />
      <Text style={s.label}>اللائحة والقوانين</Text><Field value={f.rules || ""} onChange={v => setF({ ...f, rules: v })} multiline />
      <NeuButton label="حفظ الإعدادات" icon="save-outline" onPress={save} loading={busy} />
    </NeuRaised>
  );
}

function Field({ value, onChange, placeholder, ltr, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; ltr?: boolean; multiline?: boolean }) {
  return (
    <NeuInset radius={12}>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={Colors.textSubtle} multiline={multiline}
        style={[s.input, ltr && { textAlign: "left" }, multiline && { minHeight: 80, textAlignVertical: "top" }]} accessibilityLabel={placeholder} />
    </NeuInset>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: neu.base },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "right" },
  sub: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  approve: { marginHorizontal: 16, marginBottom: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#00966A", borderRadius: 14, paddingVertical: 10 },
  approveText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  secChip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.cardBg },
  secText: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textPrimary },
  h: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  label: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: LEAGUE_ACCENT, textAlign: "right" },
  input: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingHorizontal: 12, paddingVertical: 10, ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null) },
  rowItem: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  itemTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  mini: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  miniText: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: "#fff" },
  miniDark: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textPrimary },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  estimate: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: LEAGUE_ACCENT + "10", borderRadius: 10, padding: 8 },
  estimateText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: LEAGUE_ACCENT },
  teamPick: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg, maxWidth: 180 },
  matchMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 8 },
  mPick: { padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.cardBg, minWidth: 160, maxWidth: 220 },
  kpis: { flexDirection: "row-reverse", gap: 8 },
  kpi: { flex: 1, alignItems: "center", paddingVertical: 10 },
  kpiNum: { fontFamily: "Cairo_700Bold", fontSize: 15 },
  result: { borderRadius: 22, padding: 20, alignItems: "center", gap: 4 },
  resultTitle: { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#fff" },
  resultSub: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#fff", textAlign: "center" },
  camWrap: { height: 340, borderRadius: 22, overflow: "hidden", backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  camFrame: { width: 220, height: 220, borderRadius: 24, borderWidth: 4, borderColor: "#F7D76A" },
  camClose: { position: "absolute", top: 12, left: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  roleBtn: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider },
  avatar: { width: 34, height: 34, borderRadius: 11, backgroundColor: LEAGUE_ACCENT, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  color: { width: 34, height: 34, borderRadius: 17 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: neu.base, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 18, gap: 8, width: "100%", maxWidth: 620, alignSelf: "center", maxHeight: "90%" },
});
