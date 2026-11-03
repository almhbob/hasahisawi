// بطاقة الانتساب الدولية — ديوان الكُتّاب. ثنائية اللغة (عربي/إنجليزي) بعلم دولة الإقامة ورمز QR للتحقق العلني.
// مقاس بطاقة ائتمان (ISO/IEC 7810 ID-1 ≈ 1.586:1) لتُطبع أو تُعرض في أي دولة.
import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Line } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import { MEMBER_STATUS, shade, type Member } from "@/lib/lit-members";
import { countryOf, flagOf } from "@/lib/countries";

const ymd = (s?: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : "—");
const STATUS_EN: Record<string, string> = { active: "VALID", pending: "PENDING", suspended: "SUSPENDED", expired: "EXPIRED", rejected: "NOT VALID" };

export default function IntlMemberCard({ m, width = 340 }: { m: Member; width?: number }) {
  const h = Math.round(width / 1.586);
  const c = countryOf(m.country);
  const st = MEMBER_STATUS[m.status] || MEMBER_STATUS.pending;
  const dim = m.status !== "active";
  const k = width / 340;
  return (
    <View style={[s.wrap, { width, height: h, padding: 14 * k }]}>
      <LinearGradient colors={["#0B1F33", shade(m.color, -40), "#0B1F33"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* شبكة خطوط الطول والعرض — رمز الانتساب الدولي */}
      <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
        <Circle cx={width * 0.86} cy={h * 0.5} r={h * 0.46} stroke={m.accent} strokeOpacity={0.16} strokeWidth={1.2} fill="none" />
        <Circle cx={width * 0.86} cy={h * 0.5} r={h * 0.3} stroke={m.accent} strokeOpacity={0.12} strokeWidth={1} fill="none" />
        <Line x1={width * 0.86 - h * 0.46} y1={h * 0.5} x2={width * 0.86 + h * 0.46} y2={h * 0.5} stroke={m.accent} strokeOpacity={0.12} strokeWidth={1} />
        <Line x1={width * 0.86} y1={h * 0.04} x2={width * 0.86} y2={h * 0.96} stroke={m.accent} strokeOpacity={0.12} strokeWidth={1} />
      </Svg>
      <View style={[s.goldBar, { backgroundColor: m.accent }]} />

      {/* الترويسة ثنائية اللغة */}
      <View style={s.head}>
        <View style={{ alignItems: "flex-start" }}>
          <Text style={[s.enTitle, { fontSize: 9.5 * k }]}>INTERNATIONAL MEMBERSHIP</Text>
          <Text style={[s.enSub, { fontSize: 8.5 * k }]}>Writers' Diwan · Hasahisawi</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[s.arTitle, { fontSize: 12 * k }]}>بطاقة انتساب دولية</Text>
          <Text style={[s.arSub, { fontSize: 9.5 * k }]}>ديوان الكُتّاب · حصاحيصاوي</Text>
        </View>
      </View>

      {/* الهوية */}
      <View style={s.mid}>
        <View style={[s.photo, { width: 58 * k, height: 70 * k, borderColor: m.accent }]}>
          {m.avatar_url ? <Image source={{ uri: m.avatar_url }} style={s.img} /> : <Ionicons name={m.icon as any} size={26 * k} color="#fff" />}
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={[s.name, { fontSize: 16 * k }]} numberOfLines={1}>{m.pen_name || m.full_name}</Text>
          {!!m.name_en && <Text style={[s.nameEn, { fontSize: 12 * k }]} numberOfLines={1}>{m.name_en.toUpperCase()}</Text>}
          <Text style={[s.cat, { color: m.accent, fontSize: 10.5 * k }]} numberOfLines={1}>{m.category_title}</Text>
          <View style={s.countryRow}>
            <Text style={{ fontSize: 15 * k }}>{flagOf(m.country)}</Text>
            <Text style={[s.country, { fontSize: 11 * k }]} numberOfLines={1}>{c.ar} · {c.en}</Text>
          </View>
        </View>
        <View style={{ alignItems: "center", gap: 5 }}>
          {!!m.card_url && <View style={s.qr}><QRCode value={m.card_url} size={Math.round(width * 0.15)} color="#0B1F33" backgroundColor="#fff" /></View>}
          <View style={[s.status, { backgroundColor: dim ? st.color : "rgba(16,185,129,0.25)", borderColor: dim ? st.color : "#34D399" }]}>
            <Text style={[s.statusT, { fontSize: 8.5 * k }]}>{STATUS_EN[m.status] || m.status.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* الأرقام والصلاحية */}
      <View style={s.foot}>
        <Cell k1="رقم العضوية" k2="Member No." v={m.member_no || "—"} mono scale={k} />
        <Cell k1="الإصدار" k2="Issued" v={ymd(m.issued_at)} scale={k} />
        <Cell k1="صالحة حتى" k2="Valid until" v={ymd(m.valid_until)} scale={k} />
      </View>
      {dim && <View style={s.veil} pointerEvents="none" />}
    </View>
  );
}

function Cell({ k1, k2, v, mono, scale }: { k1: string; k2: string; v: string; mono?: boolean; scale: number }) {
  return (
    <View style={{ alignItems: "flex-end" }}>
      <Text style={[s.k, { fontSize: 8.5 * scale }]}>{k1} · {k2}</Text>
      <Text style={[s.v, { fontSize: (mono ? 12.5 : 11.5) * scale, letterSpacing: mono ? 1 : 0.3 }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 18, overflow: "hidden", justifyContent: "space-between", alignSelf: "center",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  goldBar: { position: "absolute", top: 0, left: 0, right: 0, height: 4, opacity: 0.95 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  enTitle: { fontFamily: "Cairo_700Bold", color: "#fff", letterSpacing: 1.2 },
  enSub: { fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.7)" },
  arTitle: { fontFamily: "Cairo_700Bold", color: "#fff" },
  arSub: { fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.7)" },
  mid: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  photo: { borderRadius: 10, borderWidth: 2, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  img: { width: "100%", height: "100%" },
  name: { fontFamily: "Cairo_700Bold", color: "#fff", textAlign: "right" },
  nameEn: { fontFamily: "Cairo_600SemiBold", color: "rgba(255,255,255,0.92)", textAlign: "right", letterSpacing: 0.8 },
  cat: { fontFamily: "Cairo_700Bold", textAlign: "right" },
  countryRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  country: { fontFamily: "Cairo_600SemiBold", color: "#fff", textAlign: "right" },
  qr: { padding: 4, backgroundColor: "#fff", borderRadius: 8 },
  foot: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-end", gap: 6 },
  k: { fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.65)" },
  v: { fontFamily: "Cairo_700Bold", color: "#fff" },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  statusT: { fontFamily: "Cairo_700Bold", color: "#fff", letterSpacing: 1 },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
});
