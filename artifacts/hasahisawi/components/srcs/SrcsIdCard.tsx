// بطاقة المسعف/المتطوع — تصميم ثابت النسبة يُرسم بأي عرض (للعرض العادي ولعارض التكبير)
// الوجه: هوية الجمعية + شعار حصاحيصاوي + بيانات حامل البطاقة + شريط تنبيه رسمي
// الظهر: نص التنبيه الكامل للجهات + رمز التحقق
import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Line, Rect } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import RedCrescentMark from "@/components/srcs/RedCrescentMark";
import { ROLE_LABEL, SRCS_RED, SRCS_RED_DEEP, type SrcsMember } from "@/lib/red-crescent";

const LOGO = require("@/assets/images/logo.png");
export const CARD_RATIO = 0.72;
const BASE = 340;
export const CARD_NOTICE_SHORT = "يُرجى تسهيل مهمة حامل هذه البطاقة والسماح له بدخول المرافق الصحية وجميع الأماكن عند الضرورة لتقديم العون والمساندة";
export const CARD_NOTICE_FULL =
  "إلى جميع الجهات الرسمية والأمنية والمرافق الصحية والمؤسسات العامة والخاصة:\n" +
  "حامل هذه البطاقة عضو معتمد في جمعية الهلال الأحمر السوداني — فرعية الحصاحيصا. " +
  "نرجو التكرم بتسهيل مهمته الإنسانية، والسماح له بدخول المستشفيات والمرافق الصحية وجميع الأماكن عند الضرورة " +
  "لتقديم الإسعاف والعون والمساندة، وتقديم ما يلزم من تعاون. شاكرين لكم حسن التعاون.";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "short" }) : "—");

type Holder = { name?: string | null; avatar_url?: string | null };

/** خطوط مائلة تحذيرية تملأ المساحة */
function Stripes({ w, h, color, gap, width, opacity = 1 }: { w: number; h: number; color: string; gap: number; width: number; opacity?: number }) {
  const lines = [];
  for (let x = -h; x < w + h; x += gap) lines.push(<Line key={x} x1={x} y1={h} x2={x + h} y2={0} stroke={color} strokeWidth={width} />);
  return <Svg width={w} height={h} style={StyleSheet.absoluteFill} opacity={opacity} pointerEvents="none">{lines}</Svg>;
}

/** شريط تحذير أصفر/أسود */
function Hazard({ w, h }: { w: number; h: number }) {
  return (
    <View style={{ width: w, height: h, backgroundColor: "#FACC15", overflow: "hidden" }}>
      <Stripes w={w} h={h} color="#111827" gap={h * 1.6} width={h * 0.55} />
    </View>
  );
}

export function SrcsCardFront({ m, holder, width }: { m: SrcsMember; holder: Holder; width: number }) {
  const u = width / BASE, h = width * CARD_RATIO;
  const revoked = !!m.revoked_at || m.status === "banned";
  const valid = !revoked && m.status === "active" && !!m.card_expires_at && new Date(m.card_expires_at) > new Date();
  const z = (n: number) => n * u;
  return (
    <View style={{ width, height: h, borderRadius: z(18), overflow: "hidden", backgroundColor: SRCS_RED_DEEP }}>
      <LinearGradient colors={[SRCS_RED_DEEP, SRCS_RED, "#DC2626"]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <Stripes w={width} h={h} color="#FFFFFF" gap={z(14)} width={z(4)} opacity={0.06} />
      {/* علامة مائية */}
      <View style={{ position: "absolute", left: -z(30), top: z(40), opacity: 0.1 }} pointerEvents="none">
        <RedCrescentMark size={z(170)} color="#FFFFFF" background={null} />
      </View>

      {/* الرأس */}
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: z(8), paddingHorizontal: z(12), paddingTop: z(10) }}>
        <View style={{ width: z(32), height: z(32), borderRadius: z(9), backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
          <RedCrescentMark size={z(26)} background={null} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(12.5), lineHeight: z(18), color: "#fff", textAlign: "right" }} numberOfLines={1}>جمعية الهلال الأحمر السوداني</Text>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: z(9.5), lineHeight: z(14), color: "rgba(255,255,255,0.88)", textAlign: "right" }} numberOfLines={1}>فرعية الحصاحيصا · بطاقة {ROLE_LABEL[m.role]}</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Image source={LOGO} style={{ width: z(32), height: z(32), borderRadius: z(9), borderWidth: z(1.5), borderColor: "#fff" }} />
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(6.5), lineHeight: z(10), color: "#fff", marginTop: z(1) }}>حصاحيصاوي</Text>
        </View>
      </View>

      {/* الجسم */}
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: z(10), paddingHorizontal: z(12), marginTop: z(6) }}>
        <View style={{ width: z(62), height: z(76), borderRadius: z(10), borderWidth: z(2), borderColor: "#fff", backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          {holder.avatar_url ? <Image source={{ uri: holder.avatar_url }} style={{ width: "100%", height: "100%" }} /> :
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(26), color: "#fff" }}>{(holder.name || "؟").trim().charAt(0)}</Text>}
        </View>
        <View style={{ flex: 1, gap: z(3) }}>
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(16), lineHeight: z(23), color: "#fff", textAlign: "right" }} numberOfLines={2}>{holder.name}</Text>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: z(5) }}>
            <View style={{ paddingHorizontal: z(8), paddingVertical: z(1), borderRadius: z(8), backgroundColor: "#fff" }}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(10), lineHeight: z(15), color: SRCS_RED_DEEP }}>{ROLE_LABEL[m.role]}</Text>
            </View>
            <View style={{ paddingHorizontal: z(7), paddingVertical: z(1), borderRadius: z(8), backgroundColor: revoked ? "#111827" : valid ? "#16A34A" : "#B45309" }}>
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(9), lineHeight: z(14), color: "#fff" }}>{revoked ? "ملغاة" : valid ? "سارية" : "غير سارية"}</Text>
            </View>
          </View>
          {m.unit ? <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: z(9.5), lineHeight: z(14), color: "#fff", textAlign: "right" }} numberOfLines={1}>الوحدة: {m.unit}</Text> : null}
          {m.affiliation ? <Text style={{ fontFamily: "Cairo_400Regular", fontSize: z(9), lineHeight: z(13), color: "rgba(255,255,255,0.9)", textAlign: "right" }} numberOfLines={1}>الجهة: {m.affiliation}</Text> : null}
        </View>
      </View>

      {/* الحقول */}
      <View style={{ flexDirection: "row-reverse", gap: z(6), paddingHorizontal: z(12), marginTop: z(7) }}>
        {([["رقم البطاقة", m.card_no || "—", true], ["فصيلة الدم", m.blood_type || "—", true], ["صالحة حتى", fmt(m.card_expires_at), false]] as const).map(([k, v, ltr]) => (
          <View key={k} style={{ flex: k === "رقم البطاقة" ? 1.5 : 1, paddingHorizontal: z(6), paddingVertical: z(3), borderRadius: z(7), backgroundColor: "rgba(0,0,0,0.22)" }}>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: z(7.5), lineHeight: z(11), color: "rgba(255,255,255,0.8)", textAlign: "right" }}>{k}</Text>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(9.5), lineHeight: z(14), color: "#fff", textAlign: "right", writingDirection: ltr ? "ltr" : undefined }} numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
          </View>
        ))}
      </View>

      {revoked ? (
        <View pointerEvents="none" style={{ position: "absolute", top: h * 0.32, left: width * 0.18, right: width * 0.18, alignItems: "center", transform: [{ rotate: "-14deg" }] }}>
          <View style={{ borderWidth: z(3), borderColor: "#FFFFFF", borderRadius: z(10), paddingHorizontal: z(14), paddingVertical: z(2), backgroundColor: "rgba(17,24,39,0.55)" }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(22), lineHeight: z(32), color: "#fff" }}>بطاقة ملغاة</Text>
          </View>
        </View>
      ) : null}

      {/* شريط التنبيه */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <Hazard w={width} h={z(4)} />
        <View style={{ backgroundColor: "#FFF7D6", flexDirection: "row-reverse", alignItems: "center", gap: z(6), paddingHorizontal: z(10), paddingVertical: z(4) }}>
          <View style={{ width: z(18), height: z(18), borderRadius: z(9), backgroundColor: SRCS_RED, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(12), lineHeight: z(16), color: "#fff" }}>!</Text>
          </View>
          <Text style={{ flex: 1, fontFamily: "Cairo_700Bold", fontSize: z(8.2), lineHeight: z(12.5), color: "#3F1D0B", textAlign: "right" }} numberOfLines={2}>{CARD_NOTICE_SHORT}</Text>
        </View>
      </View>
    </View>
  );
}

export function SrcsCardBack({ m, holder, width }: { m: SrcsMember; holder: Holder; width: number }) {
  const u = width / BASE, h = width * CARD_RATIO;
  const z = (n: number) => n * u;
  return (
    <View style={{ width, height: h, borderRadius: z(18), overflow: "hidden", backgroundColor: "#FFFDF7", borderWidth: z(1.5), borderColor: SRCS_RED + "55" }}>
      <Stripes w={width} h={h} color="#FACC15" gap={z(16)} width={z(5)} opacity={0.13} />
      <View style={{ position: "absolute", right: z(70), top: z(50), opacity: 0.06 }} pointerEvents="none">
        <Image source={LOGO} style={{ width: z(150), height: z(150), borderRadius: z(30) }} />
      </View>
      <Hazard w={width} h={z(6)} />

      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: z(6), paddingHorizontal: z(12), paddingTop: z(6) }}>
        <Svg width={z(18)} height={z(18)} viewBox="0 0 24 24"><Rect x="0" y="0" width="24" height="24" rx="6" fill={SRCS_RED} /><Rect x="10.5" y="5" width="3" height="9" rx="1.5" fill="#fff" /><Rect x="10.5" y="16" width="3" height="3" rx="1.5" fill="#fff" /></Svg>
        <Text style={{ flex: 1, fontFamily: "Cairo_700Bold", fontSize: z(11.5), lineHeight: z(17), color: SRCS_RED_DEEP, textAlign: "right" }} numberOfLines={1}>تنبيه رسمي — مهمة إنسانية</Text>
      </View>

      <View style={{ flexDirection: "row-reverse", gap: z(10), paddingHorizontal: z(12), marginTop: z(4), flex: 1 }}>
        <Text style={{ flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: z(8.4), lineHeight: z(13.4), color: "#1F2937", textAlign: "right" }}>{CARD_NOTICE_FULL}</Text>
        <View style={{ alignItems: "center", gap: z(3) }}>
          <View style={{ padding: z(4), borderRadius: z(8), backgroundColor: "#fff", borderWidth: z(1.5), borderColor: SRCS_RED }}>
            {m.card_url ? <QRCode value={m.card_url} size={z(84)} color={SRCS_RED_DEEP} backgroundColor="#fff" /> : <View style={{ width: z(84), height: z(84) }} />}
          </View>
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(7.5), lineHeight: z(11), color: SRCS_RED_DEEP }}>امسح للتحقق</Text>
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: z(7.5), lineHeight: z(11), color: "#374151", writingDirection: "ltr" }}>{m.card_no}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: z(6), paddingHorizontal: z(12), paddingVertical: z(6), borderTopWidth: z(1), borderTopColor: SRCS_RED + "22", backgroundColor: "#FFFFFFCC" }}>
        <Image source={LOGO} style={{ width: z(18), height: z(18), borderRadius: z(5) }} />
        <Text style={{ flex: 1, fontFamily: "Cairo_400Regular", fontSize: z(7.5), lineHeight: z(11), color: "#4B5563", textAlign: "right" }} numberOfLines={1}>
          صادرة إلكترونياً عبر تطبيق حصاحيصاوي · {holder.name} · صالحة حتى {fmt(m.card_expires_at)}
        </Text>
        <RedCrescentMark size={z(16)} />
      </View>
    </View>
  );
}
