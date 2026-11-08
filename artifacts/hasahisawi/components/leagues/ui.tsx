import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { NeuRaised } from "@/components/auth/neu";
import { fmtKickoff, LEAGUE_ACCENT, STATUS_AR, type Match, type StandingRow, type Team } from "@/lib/leagues-api";
import { isLight } from "@/components/leagues/KitColorPicker";

// تدرجات شعار التطبيق: الأخضر والذهبي
const PALETTE = ["#00966A", "#CB9200", "#006B4A", "#946B00", "#004D36", "#E8A900", "#008259", "#6B4D00"];
export const teamColor = (t?: { id?: number; color?: string | null } | null) => t?.color || PALETTE[(t?.id ?? 0) % PALETTE.length];

export function TeamBadge({ team, size = 40 }: { team?: (Pick<Team, "id" | "name" | "logo_url" | "color" | "short_name"> & { color2?: string | null }) | null; size?: number }) {
  if (team?.logo_url) return <Image source={{ uri: team.logo_url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#fff" }} />;
  const c = teamColor(team as any);
  const c2 = team?.color2 || null;
  // نتجاوز «ال» التعريف حتى لا تتشابه الشارات (الأهلي، الهلال، النيل… كلها «ا»)
  const initials = (team?.short_name || team?.name || "؟").trim().split(/\s+/)
    .map(w => (w.startsWith("ال") && w.length > 2 ? w[2] : w[0])).slice(0, 2).join("");
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: "center", justifyContent: "center", overflow: "hidden",
      borderWidth: 2, borderColor: isLight(c) && !c2 ? "#00000026" : "#ffffff90" }}>
      {/* طقم بلونين: النصف الأيسر باللون الثاني */}
      {c2 ? <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: size / 2, backgroundColor: c2 }} /> : null}
      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: size * 0.36, color: isLight(c) && (!c2 || isLight(c2)) ? "#1A2C25" : "#fff",
        textShadowColor: c2 ? "rgba(0,0,0,0.45)" : "transparent", textShadowRadius: c2 ? 3 : 0 }}>{initials}</Text>
    </View>
  );
}

/** النتيجة بترتيب ثابت: هدف المضيف تحت المضيف (يمين) — لا نعتمد على اتجاه النص */
export function ScorePair({ home, away, style }: { home: number; away: number; style?: any }) {
  return (
    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }} accessibilityLabel={`${home} مقابل ${away}`}>
      <Text style={style}>{home}</Text>
      <Text style={[style, { opacity: 0.5, fontSize: 22 }]}>-</Text>
      <Text style={style}>{away}</Text>
    </View>
  );
}

export function StatusPill({ status }: { status: string }) {
  const m = STATUS_AR[status] || STATUS_AR.scheduled;
  return (
    <View style={[u.pill, { backgroundColor: m.color + "1A" }]}>
      {status === "live" ? <View style={[u.liveDot, { backgroundColor: m.color }]} /> : null}
      <Text style={[u.pillText, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

export function MatchCard({ m, home, away, onPress }: { m: Match; home?: Team; away?: Team; onPress?: () => void }) {
  const done = m.status === "finished" || m.status === "live";
  const hs = m.home_score ?? 0, as = m.away_score ?? 0;
  const homeWin = m.status === "finished" && hs > as, awayWin = m.status === "finished" && as > hs;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${home?.name} ضد ${away?.name}${done ? ` ${hs} - ${as}` : ""}`}>
      <NeuRaised radius={20} depth={6} style={u.card}>
        <View style={u.cardTop}>
          <Text style={u.meta} numberOfLines={1}>{m.stage || `الجولة ${m.round}`}{m.group_name ? ` · المجموعة ${m.group_name}` : ""}</Text>
          <StatusPill status={m.status} />
        </View>
        <View style={u.row}>
          <View style={u.side}>
            <TeamBadge team={home} size={44} />
            <Text style={[u.team, homeWin && u.winner]} numberOfLines={2}>{home?.name || "—"}</Text>
          </View>
          <View style={u.center}>
            {done ? (
              <ScorePair home={hs} away={as} style={[u.score, m.status === "live" && { color: "#D93636" }]} />
            ) : (
              <>
                <Text style={u.time}>{m.kickoff ? new Date(m.kickoff).toLocaleTimeString("ar-SD", { hour: "numeric", minute: "2-digit" }) : "—"}</Text>
                <Text style={u.vs}>VS</Text>
              </>
            )}
          </View>
          <View style={u.side}>
            <TeamBadge team={away} size={44} />
            <Text style={[u.team, awayWin && u.winner]} numberOfLines={2}>{away?.name || "—"}</Text>
          </View>
        </View>
        <View style={u.foot}>
          <Ionicons name="calendar-outline" size={12} color={Colors.textMuted} />
          <Text style={u.meta} numberOfLines={1}>{fmtKickoff(m.kickoff)}{m.venue ? ` · ${m.venue}` : ""}</Text>
          {m.tickets_enabled && m.status !== "finished" ? (
            <View style={u.ticketTag}><Ionicons name="ticket" size={11} color={LEAGUE_ACCENT} /><Text style={u.ticketText}>تذاكر</Text></View>
          ) : null}
        </View>
      </NeuRaised>
    </Pressable>
  );
}

const FORM_C: Record<string, string> = { W: "#00966A", D: "#9AABA3", L: "#D93636" };
const FORM_AR: Record<string, string> = { W: "ف", D: "ت", L: "خ" };

export function StandingsTable({ rows, title, onTeam }: { rows: StandingRow[]; title?: string; onTeam?: (id: number) => void }) {
  return (
    <NeuRaised radius={20} depth={6} style={{ overflow: "hidden" }}>
      {title ? <Text style={u.tableTitle}>{title}</Text> : null}
      <View style={[u.tr, u.th]}>
        <Text style={[u.cPos, u.thText]}>#</Text>
        <Text style={[u.cTeam, u.thText]}>الفريق</Text>
        {["لعب", "ف", "ت", "خ", "+/-", "نقاط"].map(h => <Text key={h} style={[u.cNum, u.thText, h === "نقاط" && { width: 40 }]}>{h}</Text>)}
      </View>
      {rows.map((r, i) => (
        <Pressable key={r.team_id} onPress={() => onTeam?.(r.team_id)} style={[u.tr, i % 2 === 1 && { backgroundColor: Colors.bg + "AA" }]}>
          <View style={[u.cPos, { alignItems: "center" }]}>
            <View style={[u.posBar, { backgroundColor: i === 0 ? "#00966A" : i < 3 ? "#008259" : i >= rows.length - 2 && rows.length > 5 ? "#D93636" : "transparent" }]} />
            <Text style={u.pos}>{i + 1}</Text>
          </View>
          <View style={[u.cTeam, { flexDirection: "row-reverse", alignItems: "center", gap: 8 }]}>
            <TeamBadge team={{ id: r.team_id, name: r.name, logo_url: r.logo_url, color: r.color, short_name: r.short_name }} size={26} />
            <View style={{ flex: 1 }}>
              <Text style={u.tName} numberOfLines={1}>{r.name}</Text>
              {r.form.length ? (
                <View style={u.formRow}>{r.form.map((f, k) => <View key={k} style={[u.form, { backgroundColor: FORM_C[f] }]}><Text style={u.formText}>{FORM_AR[f]}</Text></View>)}</View>
              ) : null}
            </View>
          </View>
          {[r.p, r.w, r.d, r.l].map((v, k) => <Text key={k} style={u.cNum}>{v}</Text>)}
          <Text style={[u.cNum, { color: r.gd > 0 ? "#00966A" : r.gd < 0 ? "#D93636" : Colors.textSecondary }]}>{r.gd > 0 ? `+${r.gd}` : r.gd}</Text>
          <Text style={[u.cNum, u.pts]}>{r.pts}</Text>
        </Pressable>
      ))}
    </NeuRaised>
  );
}

const u = StyleSheet.create({
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 2, borderRadius: 10 },
  pillText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  card: { padding: 14, gap: 10 },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row-reverse", alignItems: "center" },
  side: { flex: 1, alignItems: "center", gap: 6 },
  team: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "center" },
  winner: { fontFamily: "Cairo_700Bold", color: Colors.primary },
  center: { width: 92, alignItems: "center" },
  score: { fontFamily: "Cairo_700Bold", fontSize: 28, color: Colors.textPrimary, writingDirection: "ltr" },
  dash: { color: Colors.textMuted, fontSize: 22 },
  time: { fontFamily: "Cairo_700Bold", fontSize: 16, color: LEAGUE_ACCENT },
  vs: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textMuted, letterSpacing: 2 },
  foot: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  meta: { flexShrink: 1, fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  ticketTag: { flexDirection: "row-reverse", alignItems: "center", gap: 3, marginRight: "auto", backgroundColor: LEAGUE_ACCENT + "14", paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8 },
  ticketText: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: LEAGUE_ACCENT },

  tableTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right", padding: 12, paddingBottom: 4 },
  tr: { flexDirection: "row-reverse", alignItems: "center", paddingVertical: 8, paddingHorizontal: 8 },
  th: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  thText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: Colors.textMuted },
  cPos: { width: 26, textAlign: "center" },
  cTeam: { flex: 1, textAlign: "right" },
  cNum: { width: 28, textAlign: "center", fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  pts: { width: 40, fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  pos: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: Colors.textPrimary },
  posBar: { position: "absolute", right: -8, top: -4, bottom: -4, width: 3, borderRadius: 2 },
  tName: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  formRow: { flexDirection: "row-reverse", gap: 2, marginTop: 1 },
  form: { width: 14, height: 14, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  formText: { fontFamily: "Cairo_700Bold", fontSize: 8.5, color: "#fff" },
});
