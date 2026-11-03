// بطاقة عضوية ديوان الكُتّاب — تصميم عصري بلون الفئة، مع QR للتحقق العلني وأوسمة العضو.
import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Path } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import { MEMBER_STATUS, shade, type Badge, type Member } from "@/lib/lit-members";

const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { year: "numeric", month: "2-digit" }) : "—");

export default function MemberCard({ m, badges = [], width = 340 }: { m: Member; badges?: Badge[]; width?: number }) {
  const h = Math.round(width * 0.63);
  const st = MEMBER_STATUS[m.status] || MEMBER_STATUS.pending;
  const dim = m.status !== "active";
  return (
    <View style={[s.wrap, { width, height: h }]}>
      <LinearGradient colors={[m.color, shade(m.color, -55)]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* زخرفة: أقواس ونقاط بلون التمييز */}
      <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
        <Circle cx={width * 0.08} cy={h * 1.05} r={h * 0.62} stroke={m.accent} strokeOpacity={0.18} strokeWidth={1.5} fill="none" />
        <Circle cx={width * 0.08} cy={h * 1.05} r={h * 0.44} stroke={m.accent} strokeOpacity={0.12} strokeWidth={1} fill="none" />
        <Path d={`M ${width * 0.55} 0 Q ${width * 0.7} ${h * 0.5} ${width} ${h * 0.42}`} stroke="#fff" strokeOpacity={0.07} strokeWidth={30} fill="none" />
      </Svg>
      <View style={[s.band, { backgroundColor: m.accent }]} />

      <View style={s.top}>
        <View style={s.brand}>
          <Ionicons name="create" size={14} color={m.accent} />
          <Text style={s.brandT}>ديوان الكُتّاب</Text>
          <Text style={s.brandS}>· حصاحيصاوي</Text>
        </View>
        <View style={[s.status, { backgroundColor: dim ? st.color : "rgba(255,255,255,0.16)" }]}>
          <Ionicons name={st.icon as any} size={11} color="#fff" />
          <Text style={s.statusT}>{m.status === "suspended" && m.suspended_reason === "inactive" ? "معلّقة · توقف النشر" : st.label}</Text>
        </View>
      </View>

      <View style={s.mid}>
        <View style={[s.photo, { borderColor: m.accent }]}>
          {m.avatar_url ? <Image source={{ uri: m.avatar_url }} style={s.img} /> : <Ionicons name={m.icon as any} size={30} color="#fff" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cat, { color: m.accent }]}>{m.category_title}</Text>
          <Text style={s.name} numberOfLines={1}>{m.pen_name || m.full_name}</Text>
          {!!m.pen_name && <Text style={s.real} numberOfLines={1}>{m.full_name}</Text>}
          {m.category === "journalist" && !!m.press_org && <Text style={s.real} numberOfLines={1}>{m.press_role ? `${m.press_role} · ` : ""}{m.press_org}</Text>}
          <View style={s.badges}>
            {badges.slice(0, 5).map((b) => (
              <View key={b.key} style={[s.badge, { borderColor: m.accent + "88" }]}><Ionicons name={b.icon as any} size={11} color={m.accent} /></View>
            ))}
          </View>
        </View>
        {!!m.card_url && (
          <View style={s.qr}><QRCode value={m.card_url} size={Math.round(width * 0.17)} color="#111" backgroundColor="#fff" /></View>
        )}
      </View>

      <View style={s.bottom}>
        <View>
          <Text style={s.k}>رقم العضوية</Text>
          <Text style={s.no}>{m.member_no || "يصدر بعد الاعتماد"}</Text>
        </View>
        <View>
          <Text style={s.k}>{m.tier_label}</Text>
          <Text style={s.v}>صالحة حتى {fmt(m.valid_until)}</Text>
        </View>
      </View>
      {dim && <View style={s.veil} pointerEvents="none" />}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: "hidden", padding: 16, justifyContent: "space-between", alignSelf: "center",
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  band: { position: "absolute", top: 0, right: 0, width: 6, bottom: 0, opacity: 0.9 },
  top: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  brandT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  brandS: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)" },
  status: { flexDirection: "row-reverse", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusT: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  mid: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  photo: { width: 64, height: 64, borderRadius: 16, borderWidth: 2, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  img: { width: "100%", height: "100%" },
  cat: { fontFamily: "Cairo_700Bold", fontSize: 11.5, textAlign: "right", letterSpacing: 0.4 },
  name: { fontFamily: "Cairo_700Bold", fontSize: 19, color: "#fff", textAlign: "right", lineHeight: 28 },
  real: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.78)", textAlign: "right" },
  badges: { flexDirection: "row-reverse", gap: 4, marginTop: 4 },
  badge: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.18)" },
  qr: { padding: 4, backgroundColor: "#fff", borderRadius: 8 },
  bottom: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-end" },
  k: { fontFamily: "Cairo_400Regular", fontSize: 9.5, color: "rgba(255,255,255,0.65)", textAlign: "right" },
  no: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff", letterSpacing: 1.2, textAlign: "right" },
  v: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#fff", textAlign: "left" },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" },
});
