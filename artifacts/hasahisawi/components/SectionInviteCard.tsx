// بطاقة الدعوة للانضمام إلى قسم — تذكرة عصرية بلون القسم مع ختم ذهبي من هوية حصاحيصاوي.
// تُستخدم في معاينة المدير، وفي شاشة المدعو، وفي الدعوات التي يمرّرها المستلم لغيره.
import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import { StarPattern } from "@/components/ui/Ornament";
import Colors from "@/constants/colors";
import { fmtInviteDate, type SectionInfo, type InviteKind } from "@/lib/section-invites";

const LOGO = require("@/assets/images/logo.png");
const GOLD = "#E8A900";

/** تغميق/تفتيح لون القسم للتدرّج */
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
  /** دعوة شخصية مُمرَّرة من مستخدم */
  relayed?: boolean;
};

export default function SectionInviteCard({ section, inviteeName, inviteeKind, message, expiresAt, qrValue, inviter = "إدارة حصاحيصاوي", messageLines = 4, relayed }: Props) {
  const deep = shade(section.color, -0.28);
  const mid = shade(section.color, -0.1);
  return (
    <View style={s.shadow}>
      <View style={s.ticket}>
        {/* الجزء العلوي: هوية القسم */}
        <LinearGradient colors={[shade(section.color, 0.06), mid, deep]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={s.head}>
          <StarPattern opacity={0.09} />
          <View style={s.orbA} />
          <View style={s.orbB} />

          <View style={s.top}>
            <View style={s.logoBox}><Image source={LOGO} style={s.logo} resizeMode="contain" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.brand}>حصاحيصاوي</Text>
              <Text style={s.brandSub}>خدمات مدينة الحصاحيصا</Text>
            </View>
            <View style={s.seal}>
              <Ionicons name={relayed ? "heart" : "ribbon"} size={11} color="#3D2C00" />
              <Text style={s.sealT}>{relayed ? "دعوة شخصية" : "دعوة رسمية"}</Text>
            </View>
          </View>

          <View style={s.hero}>
            <View style={s.iconHalo}>
              <View style={s.iconBox}><Ionicons name={section.icon as any} size={32} color="#fff" /></View>
            </View>
            <Text style={s.kicker}>{relayed ? "يدعوك للانضمام إلى" : "دعوة للانضمام إلى"}</Text>
            <Text style={s.title}>{section.title}</Text>
            <Text style={s.tagline}>{section.tagline}</Text>
          </View>
        </LinearGradient>

        {/* خط التمزيق بين جزأي التذكرة */}
        <View style={s.tear}>
          <View style={[s.notch, { right: -12 }]} />
          <View style={s.dash} />
          <View style={[s.notch, { left: -12 }]} />
        </View>

        {/* الجزء السفلي: المدعو والتفاصيل */}
        <View style={s.body}>
          <View style={s.toRow}>
            <View style={[s.toIcon, { backgroundColor: section.color + "18" }]}>
              <Ionicons name={inviteeKind === "org" ? "business" : "person"} size={18} color={section.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.toLbl}>{inviteeKind === "org" ? "إلى الجهة الكريمة" : "إلى"}</Text>
              <Text style={s.toName} numberOfLines={2}>{inviteeName || "—"}</Text>
            </View>
          </View>

          {message ? <Text style={s.msg} numberOfLines={messageLines}>{message}</Text> : null}

          <View style={s.bottom}>
            <View style={{ flex: 1, gap: 7 }}>
              <View style={s.metaRow}>
                <Ionicons name="time-outline" size={14} color={deep} />
                <Text style={s.meta}>{expiresAt ? `صالحة حتى ${fmtInviteDate(expiresAt)}` : "مفتوحة الصلاحية"}</Text>
              </View>
              <View style={s.metaRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color={deep} />
                <Text style={s.meta}>دعوة خاصة باسم المدعو</Text>
              </View>
              <View style={s.fromRow}>
                <View style={s.fromDot} />
                <Text style={s.from} numberOfLines={1}>من: {inviter}</Text>
              </View>
            </View>
            {qrValue ? (
              <View style={[s.qr, { borderColor: section.color + "40" }]}><QRCode value={qrValue} size={86} color={deep} backgroundColor="#FFFFFF" /></View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  shadow: { borderRadius: 28, shadowColor: "#0D2A20", shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  ticket: { borderRadius: 28, overflow: "hidden", backgroundColor: "#fff" },
  head: { padding: 18, paddingBottom: 22, overflow: "hidden" },
  orbA: { position: "absolute", top: -110, left: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(255,255,255,0.13)" },
  orbB: { position: "absolute", bottom: -70, right: -50, width: 180, height: 180, borderRadius: 90, borderWidth: 26, borderColor: "rgba(255,255,255,0.08)" },
  top: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  logoBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  logo: { width: 32, height: 32 },
  brand: { fontFamily: "Cairo_700Bold", fontSize: 15.5, color: "#fff", textAlign: "right" },
  brandSub: { fontFamily: "Cairo_500Medium", fontSize: 11, color: "rgba(255,255,255,0.85)", textAlign: "right", marginTop: -3 },
  seal: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: GOLD },
  sealT: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#3D2C00" },
  hero: { alignItems: "center", marginTop: 16, gap: 2 },
  iconHalo: { width: 84, height: 84, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  iconBox: { width: 64, height: 64, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center" },
  kicker: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: "rgba(255,255,255,0.9)" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#fff", textAlign: "center", lineHeight: 36 },
  tagline: { fontFamily: "Cairo_500Medium", fontSize: 13, color: "rgba(255,255,255,0.88)", textAlign: "center" },
  tear: { height: 0, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  notch: { position: "absolute", top: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.bg },
  dash: { flex: 1, marginHorizontal: 18, borderTopWidth: 2, borderStyle: "dashed", borderColor: "#DCE5E0" },
  body: { padding: 18, paddingTop: 20, gap: 12 },
  toRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  toIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  toLbl: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: "#6B7B74", textAlign: "right" },
  toName: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#1A2C25", textAlign: "right" },
  msg: { fontFamily: "Cairo_500Medium", fontSize: 13.5, lineHeight: 24, color: "#40524A", textAlign: "right", backgroundColor: "#F5F8F6", borderRadius: 16, padding: 12 },
  bottom: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 12 },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  meta: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#40524A", textAlign: "right" },
  fromRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 2 },
  fromDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD },
  from: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#1A2C25", textAlign: "right" },
  qr: { padding: 6, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1 },
});
