// بطاقة الدعوة الرسمية للانضمام إلى قسم — تُستخدم في معاينة المدير وفي شاشة المدعو
import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import { StarPattern } from "@/components/ui/Ornament";
import { fmtInviteDate, type SectionInfo, type InviteKind } from "@/lib/section-invites";

const LOGO = require("@/assets/images/logo.png");

/** تغميق لون القسم للتدرّج */
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return hex;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

type Props = {
  section: SectionInfo;
  inviteeName: string;
  inviteeKind: InviteKind;
  message?: string | null;
  expiresAt?: string | null;
  qrValue?: string;
  inviter?: string;
  messageLines?: number;
};

export default function SectionInviteCard({ section, inviteeName, inviteeKind, message, expiresAt, qrValue, inviter = "إدارة حصاحيصاوي", messageLines = 4 }: Props) {
  const deep = shade(section.color, -0.24);
  return (
    <LinearGradient colors={[section.color, deep]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.card}>
      <StarPattern opacity={0.1} />
      <View style={s.glow} />
      <View style={s.ring} />

      <View style={s.top}>
        <View style={s.logoBox}><Image source={LOGO} style={s.logo} resizeMode="contain" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.brand}>حصاحيصاوي</Text>
          <Text style={s.brandSub}>خدمات مدينة الحصاحيصا</Text>
        </View>
        <View style={s.seal}><Ionicons name="ribbon-outline" size={12} color="#fff" /><Text style={s.sealT}>دعوة رسمية</Text></View>
      </View>

      <Text style={s.kicker}>دعوة رسمية للانضمام</Text>
      <View style={s.titleRow}>
        <View style={s.iconBox}><Ionicons name={section.icon as any} size={30} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{section.title}</Text>
          <Text style={s.tagline}>{section.tagline}</Text>
        </View>
      </View>

      <View style={s.toBox}>
        <Text style={s.toLbl}>{inviteeKind === "org" ? "إلى الجهة الكريمة" : "إلى"}</Text>
        <Text style={s.toName} numberOfLines={2}>{inviteeName || "—"}</Text>
      </View>

      {message ? <Text style={s.msg} numberOfLines={messageLines}>{message}</Text> : null}

      <View style={s.bottom}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={s.metaRow}><Ionicons name="time-outline" size={14} color="#fff" /><Text style={s.meta}>{expiresAt ? `صالحة حتى ${fmtInviteDate(expiresAt)}` : "مفتوحة الصلاحية"}</Text></View>
          <View style={s.metaRow}><Ionicons name="lock-closed-outline" size={14} color="#fff" /><Text style={s.meta}>دعوة خاصة باسم المدعو</Text></View>
          <Text style={s.sig}>— {inviter}</Text>
        </View>
        {qrValue ? (
          <View style={s.qr}><QRCode value={qrValue} size={92} color={deep} backgroundColor="#FFFFFF" /></View>
        ) : null}
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 26, padding: 20, overflow: "hidden", gap: 4 },
  glow: { position: "absolute", top: -90, left: -70, width: 240, height: 240, borderRadius: 120, backgroundColor: "rgba(255,255,255,0.12)" },
  ring: { position: "absolute", bottom: -80, right: -60, width: 200, height: 200, borderRadius: 100, borderWidth: 28, borderColor: "rgba(255,255,255,0.07)" },
  top: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  logoBox: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  logo: { width: 34, height: 34 },
  brand: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right" },
  brandSub: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: "rgba(255,255,255,0.85)", textAlign: "right", marginTop: -3 },
  seal: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  sealT: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  kicker: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "rgba(255,255,255,0.9)", textAlign: "right", marginTop: 18, letterSpacing: 0.3 },
  titleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginTop: 4 },
  iconBox: { width: 58, height: 58, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff", textAlign: "right", lineHeight: 34 },
  tagline: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  toBox: { marginTop: 14, backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  toLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: "#6B7B74", textAlign: "right" },
  toName: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#1A2C25", textAlign: "right" },
  msg: { fontFamily: "Cairo_500Medium", fontSize: 13.5, lineHeight: 24, color: "rgba(255,255,255,0.95)", textAlign: "right", marginTop: 12 },
  bottom: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 12, marginTop: 14 },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  meta: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#fff", textAlign: "right" },
  sig: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "rgba(255,255,255,0.95)", textAlign: "right", marginTop: 4 },
  qr: { padding: 7, backgroundColor: "#fff", borderRadius: 14 },
});
