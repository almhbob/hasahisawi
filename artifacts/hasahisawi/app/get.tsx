// صفحة التثبيت الذكية (هدف الباركود): تتعرّف على الجهاز
//  - أندرويد → Google Play
//  - آيفون/آيباد → إرشاد احترافي لإضافة حصاحيصاوي إلى الشاشة الرئيسية (تطبيق ويب يعمل كتطبيق كامل)
//  - الحاسوب → باركود لمسحه بالهاتف
// وتحفظ رمز الدعوة (‎?ref=) ليُحتسب للداعي بعد التسجيل.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import { StarPattern } from "@/components/ui/Ornament";
import { copyText, notify, openExternal } from "@/lib/xplatform";
import { rememberInviteRef, cleanCode, PLAY_URL, WEB_APP_URL } from "@/lib/invites";

const LOGO = require("@/assets/images/logo.png");
const PHOTO = require("@/assets/images/ferris-wheel.jpg");
type Kind = "android" | "ios" | "ios-other-browser" | "ios-installed" | "desktop" | "native";

function detect(): Kind {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return "native";
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1);
  if (ios) {
    if ((navigator as any).standalone || (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches)) return "ios-installed";
    // التثبيت على الشاشة الرئيسية متاح من Safari؛ متصفحات التطبيقات (فيسبوك، واتساب…) لا تدعمه
    if (/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|Line\/|WhatsApp|GSA\//i.test(ua)) return "ios-other-browser";
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export default function GetAppScreen() {
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const code = cleanCode(String(ref ?? ""));
  const kind = useMemo(detect, []);
  const [here, setHere] = useState(`${WEB_APP_URL}/get${code ? `?ref=${code}` : ""}`);
  const playUrl = `${PLAY_URL}${code ? `&referrer=${encodeURIComponent(`ref=${code}`)}` : ""}`;

  useEffect(() => {
    rememberInviteRef(code);
    if (Platform.OS === "web" && typeof window !== "undefined") setHere(window.location.href);
    if (kind === "native" || kind === "ios-installed") {
      // التطبيق مثبّت أصلاً: ننتقل للدخول/التسجيل، ويُحتسب الرمز بعده
      const t = setTimeout(() => router.replace("/" as any), 600);
      return () => clearTimeout(t);
    }
  }, [code, kind]);

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <View style={s.heroWrap}>
        <Image source={PHOTO} style={s.photo} resizeMode="cover" accessibilityLabel="عجلة الحصاحيصا على ضفة النيل" />
        <LinearGradient colors={["rgba(3,34,24,0.35)", "rgba(3,30,21,0.92)"]} style={StyleSheet.absoluteFill} />
        <StarPattern opacity={0.16} />
        <View style={s.heroInner}>
          <View style={s.logoBox}><Image source={LOGO} style={s.logo} resizeMode="contain" /></View>
          <Text style={s.brand}>حصاحيصاوي</Text>
          <Text style={s.tagline}>خدمات مدينة الحصاحيصا في مكان واحد</Text>
          {code ? <View style={s.refPill}><Ionicons name="gift" size={14} color="#3A2A00" /><Text style={s.refTxt}>دعوة برمز {code}</Text></View> : null}
        </View>
      </View>

      {kind === "android" ? (
        <View style={s.card}>
          <Text style={s.h}>ثبّت التطبيق من Google Play</Text>
          <TouchableOpacity style={s.storeBtn} onPress={() => openExternal(playUrl)} accessibilityRole="link">
            <Ionicons name="logo-google-playstore" size={22} color="#fff" />
            <Text style={s.storeTxt}>تحميل من Google Play</Text>
          </TouchableOpacity>
          <Text style={s.note}>بعد التثبيت سجّل حسابك، وأدخل رمز الدعوة {code ? `(${code}) ` : ""}من «ادعُ أصدقاءك» إن لم يُحتسب تلقائياً.</Text>
          <TouchableOpacity onPress={() => router.replace("/" as any)}><Text style={s.link}>أو استخدم نسخة الويب الآن</Text></TouchableOpacity>
        </View>
      ) : null}

      {kind === "ios" ? (
        <View style={s.card}>
          <Text style={s.h}>ثبّت حصاحيصاوي على الآيفون</Text>
          <Text style={s.note}>يعمل كتطبيق كامل بأيقونته على الشاشة الرئيسية، بلا متجر وفي ثوانٍ:</Text>
          <Step n={1} icon="share-outline" text="اضغط زر المشاركة في أسفل Safari" />
          <Step n={2} icon="add-circle-outline" text="اختر «إضافة إلى الشاشة الرئيسية»" />
          <Step n={3} icon="checkmark-circle-outline" text="اضغط «إضافة» في الأعلى" />
          <Step n={4} icon="apps-outline" text="افتح حصاحيصاوي من أيقونته على الشاشة الرئيسية" />
          <TouchableOpacity style={[s.storeBtn, { backgroundColor: "#0B6B49" }]} onPress={() => router.replace("/" as any)}>
            <Ionicons name="open-outline" size={20} color="#fff" />
            <Text style={s.storeTxt}>أو افتح التطبيق في المتصفح الآن</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {kind === "ios-other-browser" ? (
        <View style={s.card}>
          <Text style={s.h}>افتح الرابط في Safari</Text>
          <Text style={s.note}>التثبيت على الشاشة الرئيسية يتم من متصفح Safari. انسخ الرابط ثم الصقه في Safari، أو اضغط ⋯ واختر «فتح في Safari».</Text>
          <TouchableOpacity style={s.storeBtn} onPress={async () => { if ((await copyText(here)) === "copied") notify("تم النسخ", "الصق الرابط في Safari"); }}>
            <Ionicons name="copy-outline" size={20} color="#fff" />
            <Text style={s.storeTxt}>نسخ الرابط</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {kind === "desktop" ? (
        <View style={[s.card, { alignItems: "center" }]}>
          <Text style={s.h}>امسح الباركود بهاتفك</Text>
          <View style={s.qrBox}><QRCode value={here} size={200} color="#063B2A" backgroundColor="#fff" /></View>
          <View style={{ flexDirection: "row-reverse", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <TouchableOpacity style={s.smallBtn} onPress={() => openExternal(playUrl)}><Ionicons name="logo-google-playstore" size={16} color="#0B6B49" /><Text style={s.smallTxt}>Google Play</Text></TouchableOpacity>
            <TouchableOpacity style={s.smallBtn} onPress={() => router.replace("/" as any)}><Ionicons name="globe-outline" size={16} color="#0B6B49" /><Text style={s.smallTxt}>نسخة الويب</Text></TouchableOpacity>
          </View>
        </View>
      ) : null}

      {kind === "native" || kind === "ios-installed" ? (
        <View style={s.card}><Text style={s.h}>جارٍ فتح حصاحيصاوي…</Text></View>
      ) : null}
    </ScrollView>
  );
}

function Step({ n, icon, text }: { n: number; icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={s.step}>
      <View style={s.stepNum}><Text style={s.stepNumTxt}>{n}</Text></View>
      <Ionicons name={icon} size={22} color="#0B6B49" />
      <Text style={s.stepTxt}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F4F7F5" },
  content: { padding: 16, gap: 14, maxWidth: 520, width: "100%", alignSelf: "center" },
  heroWrap: { height: 260, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(232,185,49,0.45)" },
  photo: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  heroInner: { flex: 1, alignItems: "center", justifyContent: "flex-end", padding: 18, gap: 4 },
  logoBox: { width: 64, height: 64, borderRadius: 18, backgroundColor: "#fff", overflow: "hidden", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  logo: { width: 64, height: 64 },
  brand: { fontFamily: "Cairo_700Bold", fontSize: 26, color: "#fff" },
  tagline: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#F3D27A" },
  refPill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 6, paddingHorizontal: 12, paddingVertical: 3, borderRadius: 20, backgroundColor: "#E8B931" },
  refTxt: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#3A2A00" },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: "#E3ECE7" },
  h: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#0F2A20", textAlign: "right" },
  note: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, color: "#4A5F56", textAlign: "right" },
  storeBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 16, backgroundColor: "#111" },
  storeTxt: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#0B6B49", textAlign: "center" },
  step: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 10, borderRadius: 14, backgroundColor: "#F1F7F4" },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#0B6B49", alignItems: "center", justifyContent: "center" },
  stepNumTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  stepTxt: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#0F2A20", textAlign: "right" },
  qrBox: { padding: 12, borderRadius: 18, backgroundColor: "#fff", borderWidth: 3, borderColor: "#E8B931" },
  smallBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: "#0B6B4955" },
  smallTxt: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#0B6B49" },
});
