// بطاقة المتطوع: تصميم رسمي فاخر (كحلي وذهبي، إطار زخرفي، شريط بألوان علم السودان، رمز تحقق).
// المقاس بنسبة البطاقات البنكية (85.6 × 54 مم). الرسم بـ SVG وألوان ثابتة حتى تُحفظ كصورة كما تظهر.
import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle, G } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { TIER_STYLE, fmtDate, verifyCardUrl, type VolunteerLevel } from "@/lib/volunteer";

export const CARD_W = 340;
export const CARD_H = Math.round(CARD_W / 1.586);

const NAVY = "#0B1F3A";
const NAVY2 = "#163764";
const GOLD = "#D4AF37";
const GOLD_LIGHT = "#F3E2A9";
const IVORY = "#F7EFD8";

type Props = {
  name: string;
  cardNo: string;
  levelName: string;
  tier: VolunteerLevel["tier"];
  points: number;
  hours: number;
  issuedAt?: string | null;
  expiresAt?: string | null;
  /** يعرض ختم «منتهية» فوق البطاقة */
  expired?: boolean;
  scale?: number;
};

/** خطوط «جيلوش» متموجة كالتي في البطاقات والعملات الرسمية. */
function Guilloche({ w, h }: { w: number; h: number }) {
  const lines: string[] = [];
  for (let i = 0; i < 14; i++) {
    const y0 = (h / 14) * i + 6;
    let d = `M 0 ${y0}`;
    for (let x = 0; x <= w; x += 12) {
      const y = y0 + Math.sin((x / w) * Math.PI * 4 + i * 0.6) * 7;
      d += ` L ${x} ${y.toFixed(1)}`;
    }
    lines.push(d);
  }
  return (
    <G opacity={0.16}>
      {lines.map((d, i) => <Path key={i} d={d} stroke={GOLD} strokeWidth={0.6} fill="none" />)}
    </G>
  );
}

const VolunteerCard = forwardRef<View, Props>(function VolunteerCard(
  { name, cardNo, levelName, tier, points, hours, issuedAt, expiresAt, expired, scale = 1 }, ref,
) {
  const W = CARD_W * scale;
  const H = CARD_H * scale;
  const t = TIER_STYLE[tier];
  const s = (n: number) => n * scale;

  return (
    // direction: "ltr" يثبّت ترتيب العناصر: الويب بالعربية يقلب row-reverse، فتختلف البطاقة عن الهاتف
    <View ref={ref} collapsable={false} style={{ width: W, height: H, borderRadius: s(16), overflow: "hidden", backgroundColor: NAVY, direction: "ltr" }}>
      {/* الخلفية: تدرّج كحلي + زخرفة + إطار ذهبي مزدوج */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={NAVY2} />
            <Stop offset="0.55" stopColor={NAVY} />
            <Stop offset="1" stopColor="#081629" />
          </LinearGradient>
          <LinearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#B8892B" />
            <Stop offset="0.5" stopColor={GOLD_LIGHT} />
            <Stop offset="1" stopColor="#B8892B" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#bg)" />
        <Guilloche w={W} h={H} />
        {/* ختم دائري خلفي باهت */}
        <Circle cx={W * 0.2} cy={H * 0.56} r={s(70)} stroke={GOLD} strokeOpacity={0.12} strokeWidth={s(10)} fill="none" />
        <Circle cx={W * 0.2} cy={H * 0.56} r={s(52)} stroke={GOLD} strokeOpacity={0.08} strokeWidth={s(2)} fill="none" />
        <Rect x={s(6)} y={s(6)} width={W - s(12)} height={H - s(12)} rx={s(12)} stroke="url(#gold)" strokeWidth={s(1.6)} fill="none" />
        <Rect x={s(10)} y={s(10)} width={W - s(20)} height={H - s(20)} rx={s(9)} stroke={GOLD} strokeOpacity={0.35} strokeWidth={s(0.6)} fill="none" />
        {/* شريط بألوان علم السودان على الحافة اليسرى */}
        <Rect x={s(10)} y={s(10)} width={s(5)} height={(H - s(20)) / 3} fill="#D21034" />
        <Rect x={s(10)} y={s(10) + (H - s(20)) / 3} width={s(5)} height={(H - s(20)) / 3} fill="#FFFFFF" />
        <Rect x={s(10)} y={s(10) + ((H - s(20)) * 2) / 3} width={s(5)} height={(H - s(20)) / 3} fill="#000000" />
        <Path d={`M ${s(15)} ${s(10)} L ${s(22)} ${s(10) + (H - s(20)) / 2} L ${s(15)} ${H - s(10)} Z`} fill="#007229" />
      </Svg>

      {/* الرأس */}
      <View style={[st.head, { top: s(16), right: s(18), left: s(30) }]}>
        <View style={[st.emblem, { width: s(34), height: s(34), borderRadius: s(17), borderWidth: s(1.2) }]}>
          <MaterialCommunityIcons name="hand-heart" size={s(19)} color={GOLD} />
        </View>
        <View style={{ flex: 1, marginRight: s(8) }}>
          <Text style={[st.org, { fontSize: s(8.5) }]}>حصاحيصاوي · مدينة الحصاحيصا</Text>
          <Text style={[st.title, { fontSize: s(15) }]}>بطاقة متطوع</Text>
        </View>
        <Text style={[st.en, { fontSize: s(7.5) }]}>VOLUNTEER{"\n"}CARD</Text>
      </View>

      {/* الاسم والمستوى */}
      <View style={{ position: "absolute", top: s(64), right: s(18), left: s(104) }}>
        <Text style={[st.name, { fontSize: s(16) }]} numberOfLines={1}>{name}</Text>
        <View style={[st.tierPill, { marginTop: s(5), paddingHorizontal: s(8), height: s(18), borderRadius: s(9), backgroundColor: t.metal[0] }]}>
          <Text style={[st.tierTxt, { fontSize: s(9), color: t.ink }]}>{levelName} · {t.label}</Text>
        </View>
        <View style={[st.stats, { marginTop: s(8), gap: s(12) }]}>
          <View><Text style={[st.k, { fontSize: s(7) }]}>النقاط</Text><Text style={[st.v, { fontSize: s(11) }]}>{points}</Text></View>
          <View><Text style={[st.k, { fontSize: s(7) }]}>ساعات التطوع</Text><Text style={[st.v, { fontSize: s(11) }]}>{hours}</Text></View>
        </View>
      </View>

      {/* رمز التحقق */}
      <View style={[st.qr, { left: s(26), top: s(64), padding: s(4), borderRadius: s(6) }]}>
        <QRCode value={verifyCardUrl(cardNo)} size={s(62)} color={NAVY} backgroundColor={IVORY} />
      </View>

      {/* التذييل */}
      <View style={[st.foot, { bottom: s(16), right: s(18), left: s(26) }]}>
        <View>
          <Text style={[st.k, { fontSize: s(7) }]}>رقم البطاقة</Text>
          <Text style={[st.no, { fontSize: s(11.5), letterSpacing: s(1) }]}>{cardNo}</Text>
        </View>
        <View style={{ flexDirection: "row-reverse", gap: s(12) }}>
          <View><Text style={[st.k, { fontSize: s(7) }]}>الإصدار</Text><Text style={[st.d, { fontSize: s(9) }]}>{fmtDate(issuedAt)}</Text></View>
          <View><Text style={[st.k, { fontSize: s(7) }]}>صالحة حتى</Text><Text style={[st.d, { fontSize: s(9) }]}>{fmtDate(expiresAt)}</Text></View>
        </View>
      </View>

      {expired && (
        <View style={[StyleSheet.absoluteFill, st.expiredWrap]}>
          <View style={[st.expired, { paddingHorizontal: s(16), paddingVertical: s(4), borderWidth: s(2), borderRadius: s(6) }]}>
            <Text style={[st.expiredTxt, { fontSize: s(16) }]}>منتهية · تحتاج تجديداً</Text>
          </View>
        </View>
      )}
    </View>
  );
});

export default VolunteerCard;

const st = StyleSheet.create({
  head: { position: "absolute", flexDirection: "row-reverse", alignItems: "center" },
  emblem: { borderColor: GOLD, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(212,175,55,0.08)" },
  org: { fontFamily: "Cairo_600SemiBold", color: GOLD_LIGHT, textAlign: "right", opacity: 0.85 },
  title: { fontFamily: "Cairo_700Bold", color: GOLD, textAlign: "right", marginTop: -2 },
  en: { fontFamily: "Cairo_700Bold", color: GOLD, opacity: 0.7, textAlign: "left", lineHeight: 10 },
  name: { fontFamily: "Cairo_700Bold", color: IVORY, textAlign: "right" },
  tierPill: { alignSelf: "flex-end", justifyContent: "center" },
  tierTxt: { fontFamily: "Cairo_700Bold" },
  stats: { flexDirection: "row-reverse" },
  k: { fontFamily: "Cairo_500Medium", color: GOLD_LIGHT, opacity: 0.75, textAlign: "right" },
  v: { fontFamily: "Cairo_700Bold", color: IVORY, textAlign: "right" },
  qr: { position: "absolute", backgroundColor: IVORY },
  foot: { position: "absolute", flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between" },
  no: { fontFamily: "Cairo_700Bold", color: GOLD, textAlign: "right" },
  d: { fontFamily: "Cairo_600SemiBold", color: IVORY, textAlign: "right" },
  expiredWrap: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(8,22,41,0.55)" },
  expired: { borderColor: "#F87171", transform: [{ rotate: "-8deg" }], backgroundColor: "rgba(127,29,29,0.75)" },
  expiredTxt: { fontFamily: "Cairo_700Bold", color: "#FEE2E2" },
});
