import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Share,
  Alert, Modal, useWindowDimensions, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, Easing, FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Path, Rect, Polygon, Defs, Text as SvgText, TextPath } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { uploadAvatar } from "@/lib/firebase/storage";
import { isFirebaseAvailable } from "@/lib/firebase/auth";

const MAP = require("@/assets/images/member-card/map.png");
const LOGO = require("@/assets/images/member-card/logo.png");

type Tier = "admin" | "moderator" | "business" | "female" | "male";
type CardPhoto = { type: "photo"; url: string } | { type: "preset"; preset: string } | { type: "none" };
type MemberCard = {
  number: string; mrz: string; tier: Tier; tier_label: string; tier_en: string; name: string;
  photo: CardPhoto; role_label: string; member_since: number; verified: boolean;
  verify_url: string; share_text: string;
};

// خامات الفئات — مطابقة لصفحة التحقّق على الخادم
const TIERS: Record<Tier, { bg: [string, string]; accent: string; text: string; muted: string; photoBg: string; light: boolean; seal: number; ferris: number; desc: string }> = {
  male:      { bg: ["#21423A", "#1A352E"], accent: "#C9B68C", text: "#F1EEE6", muted: "rgba(241,238,230,0.6)", photoBg: "#17302A", light: false, seal: 0.85, ferris: 0.2,  desc: "أخضر غابي مطفأ بنقش نحاسي" },
  female:    { bg: ["#F4EFE9", "#E8E0D7"], accent: "#96685A", text: "#2F2624", muted: "rgba(47,38,36,0.6)",    photoBg: "#E3D9CF", light: true,  seal: 0.85, ferris: 0.26, desc: "عاجي لؤلؤي بنقش ذهبي وردي" },
  business:  { bg: ["#34363A", "#27292C"], accent: "#CDB98F", text: "#EFECE6", muted: "rgba(239,236,230,0.6)", photoBg: "#222427", light: false, seal: 0.85, ferris: 0.18, desc: "رمادي جرافيتي بنقش شمبانيا" },
  moderator: { bg: ["#2A3848", "#1F2B38"], accent: "#B7C1CC", text: "#EEF1F4", muted: "rgba(238,241,244,0.6)", photoBg: "#1B2631", light: false, seal: 0.85, ferris: 0.18, desc: "كحلي أردوازي بنقش فضي" },
  admin:     { bg: ["#1A1A1A", "#0E0E0E"], accent: "#C9A45C", text: "#F3EFE6", muted: "rgba(243,239,230,0.6)", photoBg: "#141414", light: false, seal: 0.85, ferris: 0.22, desc: "أسود مطفأ بإطار ونقش ذهبي" },
};

type Shape = { d?: string[]; polygon?: string; circle?: [number, number, number] };
const PRESETS: { key: string; label: string; bg: string; ink: string; shape: Shape }[] = [
  { key: "palm",     label: "نخلة",  bg: "#21423A", ink: "#C9B68C", shape: { d: ["M12 22V11", "M12 11C11 8 8 6 4 7", "M12 11c1-3 4-5 8-4", "M12 11c-3-1-6 0-8 3", "M12 11c3-1 6 0 8 3"] } },
  { key: "nile",     label: "النيل", bg: "#2A3848", ink: "#B7C1CC", shape: { d: ["M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0", "M2 15c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"] } },
  { key: "star",     label: "نجمة",  bg: "#EAE2D8", ink: "#A97D6E", shape: { polygon: "12 3 14.6 9 21 9.3 16 13.4 17.8 20 12 16.3 6.2 20 8 13.4 3 9.3 9.4 9" } },
  { key: "crescent", label: "هلال",  bg: "#1F2B38", ink: "#B7C1CC", shape: { d: ["M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"] } },
  { key: "sun",      label: "شمس",   bg: "#8C6B4A", ink: "#F4EDE2", shape: { circle: [12, 12, 4], d: ["M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"] } },
  { key: "diamond",  label: "ماسة",  bg: "#34363A", ink: "#CDB98F", shape: { d: ["M6 3h12l4 6-10 12L2 9z", "M2 9h20"] } },
  { key: "bolt",     label: "برق",   bg: "#5E6B5A", ink: "#EDEBE3", shape: { d: ["M13 2L4 14h7l-1 8 9-12h-7z"] } },
  { key: "heart",    label: "قلب",   bg: "#7A4E4A", ink: "#F3E6E1", shape: { d: ["M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"] } },
];
const presetByKey = (k: string) => PRESETS.find((p) => p.key === k) ?? PRESETS[0];

const RATIO = 270 / 428;
const FERRIS_SPOKES = "M75 68L131 68M75 68L123.5 96M75 68L103 116.5M75 68L75 124M75 68L47 116.5M75 68L26.5 96M75 68L19 68M75 68L26.5 40M75 68L47 19.5M75 68L75 12M75 68L103 19.5M75 68L123.5 40";
const GONDOLAS: [number, number][] = [[131, 66], [123, 96], [101, 118], [19, 96], [11, 66], [19, 36], [41, 14], [71, 6], [101, 14], [123, 36]];

function PresetIcon({ shape, ink, size }: { shape: Shape; ink: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      {shape.circle && <Circle cx={shape.circle[0]} cy={shape.circle[1]} r={shape.circle[2]} />}
      {shape.polygon && <Polygon points={shape.polygon} />}
      {shape.d?.map((d, i) => <Path key={i} d={d} />)}
    </Svg>
  );
}

function FerrisWheel({ color, width }: { color: string; width: number }) {
  return (
    <Svg width={width} height={width * (170 / 150)} viewBox="0 0 150 170" fill="none" stroke={color} strokeWidth={0.7} strokeLinecap="round">
      <Circle cx={75} cy={68} r={56} /><Circle cx={75} cy={68} r={52} /><Circle cx={75} cy={68} r={22} /><Circle cx={75} cy={68} r={4} />
      <Path d={FERRIS_SPOKES} />
      {GONDOLAS.map(([x, y], i) => <Rect key={i} x={x} y={y} width={8} height={7} rx={2} />)}
    </Svg>
  );
}

function SudanFlag({ w }: { w: number }) {
  return (
    <Svg width={w} height={w * (12 / 18)} viewBox="0 0 18 12" accessibilityLabel="علم السودان">
      <Rect width={18} height={4} fill="#D21034" /><Rect y={4} width={18} height={4} fill="#FFFFFF" />
      <Rect y={8} width={18} height={4} fill="#000000" /><Polygon points="0,0 7,6 0,12" fill="#007229" />
    </Svg>
  );
}

function Seal({ color, size, id }: { color: string; size: number; id: string }) {
  return (
    <View style={{ width: size, height: size, transform: [{ rotate: "-14deg" }] }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs><Path id={id} d="M32 32 m-24 0 a24 24 0 1 1 48 0 a24 24 0 1 1 -48 0" /></Defs>
        <Circle cx={32} cy={32} r={31} fill="none" stroke={color} strokeWidth={1.1} />
        <Circle cx={32} cy={32} r={29} fill="none" stroke={color} strokeWidth={0.5} />
        <Circle cx={32} cy={32} r={18} fill="none" stroke={color} strokeWidth={0.6} />
        <SvgText fill={color} fontSize={5.6} fontWeight="600" letterSpacing={1.1}>
          <TextPath href={`#${id}`}>HASAHISAWI · VERIFIED · 2026 ·</TextPath>
        </SvgText>
      </Svg>
      <Image source={LOGO} resizeMode="contain" style={{ position: "absolute", left: size * 0.34, top: size * 0.35, width: size * 0.32, height: size * 0.3, tintColor: color }} />
    </View>
  );
}

function CardPhotoView({ photo, t, s }: { photo: CardPhoto; t: typeof TIERS.male; s: number }) {
  const box = { width: 84 * s, height: 104 * s, borderRadius: 12 * s, borderWidth: 1, borderColor: t.accent + "8C", backgroundColor: t.photoBg, overflow: "hidden" as const };
  if (photo.type === "photo") return <View style={box}><Image source={{ uri: photo.url }} style={{ width: "100%", height: "100%" }} /></View>;
  const p = presetByKey(photo.type === "preset" ? photo.preset : "palm");
  const usePresetBg = photo.type === "preset";
  return (
    <View style={[box, { alignItems: "center", justifyContent: "center", backgroundColor: usePresetBg ? p.bg : t.photoBg }]}>
      <PresetIcon shape={p.shape} ink={usePresetBg ? p.ink : t.accent} size={38 * s} />
    </View>
  );
}

export function CardFront({ card, width, sealId = "seal-front" }: { card: MemberCard; width: number; sealId?: string }) {
  const t = TIERS[card.tier];
  const s = width / 428;
  return (
    <LinearGradient colors={t.bg} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
      style={[styles.card, { width, height: width * RATIO, borderRadius: 20 * s }, t.light && styles.lightBorder]}>
      <View style={{ position: "absolute", left: -62 * s, bottom: -96 * s, opacity: t.ferris }} pointerEvents="none">
        <FerrisWheel color={t.accent} width={240 * s} />
      </View>
      {card.tier === "admin" && <View pointerEvents="none" style={{ position: "absolute", top: 8 * s, left: 8 * s, right: 8 * s, bottom: 8 * s, borderRadius: 14 * s, borderWidth: 1, borderColor: t.accent + "66" }} />}

      <View style={{ flex: 1, paddingTop: 22 * s, paddingHorizontal: 24 * s, paddingBottom: 14 * s, justifyContent: "space-between" }}>
        <View style={styles.rowTop}>
          <View>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 * s }}>
              <Image source={LOGO} resizeMode="contain" style={{ width: 22 * s, height: 21 * s, tintColor: t.text }} />
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 15 * s, color: t.text }}>حصاحيصاوي</Text>
            </View>
            <Text style={[styles.en, { fontSize: 8.5 * s, letterSpacing: 4 * s, color: t.accent }]}>HASAHISAWI</Text>
          </View>
          <View style={{ alignItems: "flex-start" }}>
            <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 12 * s, color: t.text }}>{card.tier_label}</Text>
            <Text style={[styles.en, { fontSize: 8.5 * s, letterSpacing: 3 * s, color: t.accent }]}>{card.tier_en}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 18 * s }}>
          <View style={{ flex: 1, minWidth: 0, gap: 12 * s }}>
            <View>
              <Text numberOfLines={1} style={{ fontFamily: "Cairo_600SemiBold", fontSize: 21 * s, color: t.text, textAlign: "right" }}>{card.name}</Text>
              <Text numberOfLines={1} style={{ fontFamily: "Cairo_400Regular", fontSize: 11 * s, color: t.muted, textAlign: "right" }}>{card.role_label}</Text>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 8 * s }}>
              {[["رقم العضوية", card.number, true], ["منذ", String(card.member_since), true], ["الحالة", card.verified ? (card.tier === "female" ? "موثّقة" : "موثّق") : "سارية", false]].map(([k, v, mono], i) => (
                <View key={i} style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 8.5 * s, color: t.muted, textAlign: "right" }}>{k as string}</Text>
                  <Text numberOfLines={1} style={mono ? [styles.mono, { fontSize: 10 * s, color: t.text }] : { fontFamily: "Cairo_500Medium", fontSize: 11 * s, color: t.accent, textAlign: "right" }}>{v as string}</Text>
                </View>
              ))}
            </View>
          </View>
          <CardPhotoView photo={card.photo} t={t} s={s} />
        </View>

        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 10 * s }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: "Cairo_500Medium", fontSize: 11.5 * s, color: t.accent, textAlign: "right" }}>الحصاحيصا ليست مكاناً نسكنه… بل وطنٌ يسكننا</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 * s }}>
            <Text style={[styles.en, { fontSize: 8 * s, letterSpacing: 2.5 * s, color: t.accent }]}>SUDAN</Text>
            <SudanFlag w={18 * s} />
          </View>
        </View>
        <Text numberOfLines={1} style={[styles.mono, { fontSize: 8.5 * s, letterSpacing: 1.5 * s, color: t.muted, opacity: 0.55, textAlign: "left" }]}>{card.mrz}</Text>
      </View>

      <View style={{ position: "absolute", left: 74 * s, top: 150 * s, opacity: t.seal }} pointerEvents="none">
        <Seal color={t.accent} size={58 * s} id={sealId} />
      </View>
    </LinearGradient>
  );
}

function CardBack({ card, width }: { card: MemberCard; width: number }) {
  const t = TIERS[card.tier];
  const s = width / 428;
  return (
    <LinearGradient colors={t.bg} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
      style={[styles.card, { width, height: width * RATIO, borderRadius: 20 * s }, t.light && styles.lightBorder]}>
      <Image source={MAP} resizeMode="contain" style={{ position: "absolute", left: 133 * s, top: 76 * s, width: 250 * s, height: 228 * s, tintColor: t.accent, opacity: t.light ? 0.22 : 0.2 }} />
      <View style={{ position: "absolute", left: 293 * s, top: 198 * s, width: 14 * s, height: 14 * s, borderRadius: 7 * s, borderWidth: 1, borderColor: t.accent, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 5 * s, height: 5 * s, borderRadius: 3 * s, backgroundColor: t.accent }} />
      </View>
      <View style={{ position: "absolute", left: 313 * s, top: 193 * s }}>
        <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 10 * s, color: t.accent }}>الحصاحيصا</Text>
        <Text style={[styles.mono, { fontSize: 7.5 * s, color: t.muted, textAlign: "left" }]}>14.75°N 33.30°E</Text>
      </View>
      <View style={{ flex: 1, flexDirection: "row-reverse", padding: 24 * s, gap: 22 * s }}>
        <View style={{ flex: 1, gap: 9 * s }}>
          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 21 * s, lineHeight: 30 * s, color: t.text, textAlign: "right" }}>{"الحصاحيصا…\nفي القلب دائماً"}</Text>
          <Text style={[styles.en, { fontSize: 8 * s, letterSpacing: 3 * s, color: t.accent, textAlign: "right" }]}>HASAHISA · FOREVER IN OUR HEARTS</Text>
          <View style={{ height: 1, backgroundColor: t.accent + "59" }} />
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11.5 * s, color: t.muted, textAlign: "right" }}>امسح الرمز للتحقّق من العضوية</Text>
          <Text style={[styles.mono, { fontSize: 8.5 * s, color: t.muted, textAlign: "right" }]}>{card.number}</Text>
        </View>
        <View style={{ alignSelf: "center", width: 140 * s, height: 140 * s, borderRadius: 14 * s, backgroundColor: "#F4F1EA", borderWidth: 1, borderColor: t.accent + "99", alignItems: "center", justifyContent: "center" }}>
          <QRCode value={card.verify_url} size={112 * s} color={t.light ? "#2F2624" : t.bg[1]} backgroundColor="#F4F1EA" ecl="M" />
        </View>
      </View>
    </LinearGradient>
  );
}

// صورة جاهزة للنشر على مواقع التواصل (نسبة 4:5 المناسبة لإنستغرام وفيسبوك وحالات واتساب)
function SharePoster({ card, width }: { card: MemberCard; width: number }) {
  const s = width / 360;
  return (
    <View collapsable={false} style={{ width, height: width * 1.25, backgroundColor: "#ECEAE5", alignItems: "center", paddingTop: 26 * s, paddingHorizontal: 18 * s }}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 * s }}>
        <Image source={LOGO} resizeMode="contain" style={{ width: 24 * s, height: 23 * s, tintColor: "#21423A" }} />
        <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16 * s, color: "#21423A" }}>حصاحيصاوي</Text>
      </View>
      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 22 * s, color: "#1E1E1C", marginTop: 10 * s }}>بطاقتي في حصاحيصاوي</Text>
      <View style={{ marginTop: 14 * s, ...styles.posterShadow }}>
        <CardFront card={card} width={width - 36 * s} sealId="seal-poster" />
      </View>
      <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 16 * s, color: "#21423A", marginTop: 18 * s }}>الحصاحيصا… في القلب دائماً</Text>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 * s, marginTop: 14 * s, backgroundColor: "#F6F5F1", borderRadius: 14 * s, padding: 10 * s, alignSelf: "stretch" }}>
        <View style={{ backgroundColor: "#FFFFFF", padding: 4 * s, borderRadius: 6 * s }}>
          <QRCode value={card.verify_url} size={52 * s} color="#1A352E" backgroundColor="#FFFFFF" ecl="M" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13 * s, color: "#1E1E1C", textAlign: "right" }}>احصل على بطاقتك مجاناً</Text>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11 * s, color: "#6B675F", textAlign: "right" }}>حمّل تطبيق حصاحيصاوي · امسح الرمز للتحقّق</Text>
        </View>
      </View>
    </View>
  );
}

export default function MemberCardScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { token, user, logout } = useAuth();
  const [card, setCard] = useState<MemberCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const flip = useSharedValue(0);
  const posterRef = useRef<View>(null);

  const cardW = Math.min(screenW - 40, 428);
  const posterW = Math.min(screenW - 40, 360);
  const api = getApiUrl();

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(`${api}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) setSessionExpired(true);
    if (!r.ok) throw new Error(data.error || "حدث خطأ، حاول مرة أخرى");
    return data;
  }, [api, token]);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { setCard((await call("/api/member-card/me")).card); }
    catch (e: any) { setError(e?.message || "تعذّر تحميل البطاقة"); }
    finally { setLoading(false); }
  }, [token, call]);

  useEffect(() => { load(); }, [load]);

  const setSide = (back: boolean) => {
    if (back === showBack) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowBack(back);
    flip.value = withTiming(back ? 1 : 0, { duration: 520, easing: Easing.out(Easing.cubic) });
  };
  const frontStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }], opacity: flip.value < 0.5 ? 1 : 0 }));
  const backStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }], opacity: flip.value >= 0.5 ? 1 : 0 }));

  const choosePreset = async (key: string) => {
    if (!card || busy) return;
    setBusy("photo");
    try { setCard((await call("/api/member-card/me/photo", { method: "PATCH", body: JSON.stringify({ preset: key }) })).card); Haptics.selectionAsync().catch(() => {}); }
    catch (e: any) { Alert.alert("تعذّر ذلك", e?.message || ""); }
    finally { setBusy(null); }
  };

  // رفع صورة شخصية: تُحفظ صورةً للملف الشخصي وتظهر على البطاقة
  const uploadPhoto = async () => {
    if (!user || !token || busy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") { Alert.alert("الإذن مطلوب", "يرجى السماح للتطبيق بالوصول إلى مكتبة الصور"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 5], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setBusy("photo");
    try {
      let url: string;
      if (isFirebaseAvailable()) {
        url = await uploadAvatar(String(user.id), uri);
        await call("/api/auth/profile", { method: "PUT", body: JSON.stringify({ avatar_url: url }) });
      } else {
        const form = new FormData();
        form.append("file", { uri, type: "image/jpeg", name: "card-photo.jpg" } as any);
        const r = await fetch(`${api}/api/auth/upload-avatar`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
        if (!r.ok) throw new Error("تعذّر رفع الصورة");
        url = (await r.json()).url;
      }
      setCard((await call("/api/member-card/me/photo", { method: "PATCH", body: JSON.stringify({ photo_url: url }) })).card);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) { Alert.alert("تعذّر رفع الصورة", e?.message || ""); }
    finally { setBusy(null); }
  };

  const shareImage = async () => {
    if (!posterRef.current || !card) return;
    setBusy("share");
    try {
      const uri = await captureRef(posterRef, { format: "png", quality: 1, result: "tmpfile", width: 1080, height: 1350 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "مشاركة بطاقتي" });
      } else {
        await Share.share({ url: uri, message: card.share_text });
      }
      setPosterOpen(false);
    } catch (e: any) { if (!String(e?.message || "").includes("cancel")) Alert.alert("تعذّرت المشاركة", e?.message || ""); }
    finally { setBusy(null); }
  };

  const shareLink = async () => {
    if (!card) return;
    try { await Share.share(Platform.OS === "ios" ? { message: card.share_text, url: card.verify_url } : { message: card.share_text }); } catch {}
  };

  const rotate = () => {
    Alert.alert("إعادة إصدار رمز التحقّق", "سيتوقف الرمز الحالي عن العمل، ومن مسح بطاقتك أو تلقّى رابطها سابقاً لن يتمكن من فتحها. هل تريد المتابعة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "إعادة الإصدار", style: "destructive", onPress: async () => {
        setBusy("rotate");
        try { setCard((await call("/api/member-card/me/rotate", { method: "POST" })).card); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
        catch (e: any) { Alert.alert("تعذّر ذلك", e?.message || ""); }
        finally { setBusy(null); }
      } },
    ]);
  };

  const selectedPreset = card?.photo.type === "preset" ? card.photo.preset : null;
  const usingPhoto = card?.photo.type === "photo";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={22} color="#1E1E1C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>بطاقة العضوية</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => card && setPosterOpen(true)} disabled={!card} accessibilityRole="button" accessibilityLabel="مشاركة البطاقة">
          <Ionicons name="share-social-outline" size={21} color="#1E1E1C" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: "center", paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
        {!token || !user ? (
          <View style={styles.stateBox}>
            <Ionicons name="card-outline" size={40} color="#21423A" />
            <Text style={styles.stateTitle}>بطاقتك بانتظارك</Text>
            <Text style={styles.stateText}>سجّل الدخول لإصدار بطاقة عضويتك الرقمية الموثّقة.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push("/login" as any)} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>تسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={[styles.stateBox, { height: cardW * RATIO + 100 }]}>
            <ActivityIndicator color="#21423A" />
            <Text style={styles.stateText}>جارٍ إصدار بطاقتك…</Text>
          </View>
        ) : sessionExpired ? (
          <View style={styles.stateBox}>
            <Ionicons name="log-in-outline" size={38} color="#21423A" />
            <Text style={styles.stateTitle}>انتهت جلستك</Text>
            <Text style={styles.stateText}>سجّل الدخول من جديد لعرض بطاقة عضويتك.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => { logout(); }} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>تسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        ) : error || !card ? (
          <View style={styles.stateBox}>
            <Ionicons name="alert-circle-outline" size={38} color="#9A5B2E" />
            <Text style={styles.stateText}>{error || "تعذّر تحميل البطاقة"}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={load} accessibilityRole="button"><Text style={styles.primaryBtnText}>إعادة المحاولة</Text></TouchableOpacity>
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(450)} style={{ alignItems: "center", width: "100%" }}>
            <TouchableOpacity activeOpacity={0.97} onPress={() => setSide(!showBack)} accessibilityRole="button" accessibilityLabel={showBack ? "عرض الوجه الأمامي" : "عرض رمز التحقّق"} style={{ width: cardW, height: cardW * RATIO, marginTop: 16 }}>
              <Animated.View style={[StyleSheet.absoluteFill, styles.cardShadow, frontStyle]} pointerEvents={showBack ? "none" : "auto"}><CardFront card={card} width={cardW} /></Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.cardShadow, backStyle]} pointerEvents={showBack ? "auto" : "none"}><CardBack card={card} width={cardW} /></Animated.View>
            </TouchableOpacity>

            <View style={styles.segment}>
              {[["الوجه الأمامي", false], ["رمز التحقّق", true]].map(([label, back]) => (
                <TouchableOpacity key={String(label)} onPress={() => setSide(back as boolean)} accessibilityRole="button" accessibilityState={{ selected: showBack === back }} style={[styles.segBtn, showBack === back && styles.segBtnOn]}>
                  <Text style={[styles.segText, showBack === back && styles.segTextOn]}>{label as string}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setPosterOpen(true)} accessibilityRole="button" style={styles.actionMain}>
                <Ionicons name="image-outline" size={18} color="#F1EEE6" />
                <Text style={styles.actionMainText}>مشاركة صورة البطاقة</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={shareLink} accessibilityRole="button" style={styles.actionGhost}>
                <Ionicons name="link-outline" size={18} color="#1E1E1C" />
                <Text style={styles.actionGhostText}>الرابط</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>صورتك على البطاقة</Text>
                {busy === "photo" ? <ActivityIndicator size="small" color="#21423A" /> : <Text style={styles.panelHint}>صورة أو رمز</Text>}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 10, paddingVertical: 4, paddingHorizontal: 2 }}>
                <TouchableOpacity onPress={uploadPhoto} disabled={!!busy} accessibilityRole="button" accessibilityLabel="رفع صورة شخصية" style={[styles.tile, styles.uploadTile, usingPhoto && styles.tileOn]}>
                  <Ionicons name="camera-outline" size={20} color="#3E3B35" />
                  <Text style={styles.tileText}>صورتي</Text>
                </TouchableOpacity>
                {PRESETS.map((p) => (
                  <TouchableOpacity key={p.key} onPress={() => choosePreset(p.key)} disabled={!!busy} accessibilityRole="button" accessibilityLabel={`صورة رمزية: ${p.label}`} accessibilityState={{ selected: selectedPreset === p.key }}>
                    <View style={[styles.tile, { backgroundColor: p.bg, alignItems: "center", justifyContent: "center" }, selectedPreset === p.key && styles.tileOn]}>
                      <PresetIcon shape={p.shape} ink={p.ink} size={24} />
                    </View>
                    <Text style={[styles.tileLabel, selectedPreset === p.key && { color: "#1E1E1C", fontFamily: "Cairo_600SemiBold" }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.panelNote}>الصورة المرفوعة تصبح أيضاً صورة ملفك الشخصي.</Text>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>فئة بطاقتك: {card.tier_label}</Text>
                <Text style={styles.panelEn}>{card.tier_en}</Text>
              </View>
              <Text style={styles.panelBody}>{TIERS[card.tier].desc}. تُحدَّد الفئة تلقائياً من حسابك. لا تحمل البطاقة رقم هاتفك ولا رقمك الوطني.</Text>
              <TouchableOpacity onPress={rotate} disabled={!!busy} accessibilityRole="button" style={styles.rotateBtn}>
                {busy === "rotate" ? <ActivityIndicator size="small" color="#21423A" /> : <Ionicons name="refresh" size={16} color="#21423A" />}
                <Text style={styles.rotateText}>إعادة إصدار رمز التحقّق</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <Modal visible={posterOpen && !!card} transparent animationType="fade" onRequestClose={() => setPosterOpen(false)}>
        <View style={styles.modalBg}>
          <View style={{ borderRadius: 18, overflow: "hidden" }}>
            <View ref={posterRef} collapsable={false}>{card && <SharePoster card={card} width={posterW} />}</View>
          </View>
          <View style={[styles.actions, { width: posterW, marginTop: 16 }]}>
            <TouchableOpacity onPress={shareImage} disabled={busy === "share"} accessibilityRole="button" style={styles.actionMain}>
              {busy === "share" ? <ActivityIndicator color="#F1EEE6" /> : <Ionicons name="share-social" size={18} color="#F1EEE6" />}
              <Text style={styles.actionMainText}>مشاركة على مواقع التواصل</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPosterOpen(false)} accessibilityRole="button" accessibilityLabel="إغلاق" style={[styles.actionGhost, { paddingHorizontal: 14 }]}>
              <Ionicons name="close" size={20} color="#1E1E1C" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F3F1EC" },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#1E1E1C" },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  card: { overflow: "hidden" },
  lightBorder: { borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  cardShadow: { shadowColor: "#141414", shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 14 }, elevation: 10, backfaceVisibility: "hidden" },
  posterShadow: { shadowColor: "#141414", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  rowTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start" },
  en: { fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  mono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), textAlign: "right" },
  segment: { flexDirection: "row-reverse", width: "100%", maxWidth: 428, marginTop: 18, padding: 4, borderRadius: 12, backgroundColor: "#E6E3DC", gap: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segBtnOn: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: "#5C5A54" },
  segTextOn: { fontFamily: "Cairo_600SemiBold", color: "#1E1E1C" },
  actions: { flexDirection: "row-reverse", gap: 10, width: "100%", maxWidth: 428, marginTop: 14 },
  actionMain: { flex: 1, height: 50, borderRadius: 14, backgroundColor: "#21423A", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  actionMainText: { fontFamily: "Cairo_600SemiBold", color: "#F1EEE6", fontSize: 15 },
  actionGhost: { height: 50, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: "#D6D2C9", backgroundColor: "#FFFFFF", flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  actionGhostText: { fontFamily: "Cairo_500Medium", color: "#1E1E1C", fontSize: 14 },
  panel: { width: "100%", maxWidth: 428, marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: "#FFFFFF", gap: 10 },
  panelHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: "#1E1E1C" },
  panelHint: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#8A8478" },
  panelEn: { fontFamily: "Cairo_600SemiBold", fontSize: 9, letterSpacing: 3, color: "#8A8478" },
  panelBody: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 22, color: "#5C5A54", textAlign: "right" },
  panelNote: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: "#8A8478", textAlign: "right" },
  tile: { width: 58, height: 72, borderRadius: 10 },
  tileOn: { borderWidth: 2, borderColor: "#21423A" },
  uploadTile: { borderWidth: 1, borderStyle: "dashed", borderColor: "#8A8478", backgroundColor: "#FAF9F6", alignItems: "center", justifyContent: "center", gap: 2 },
  tileText: { fontFamily: "Cairo_500Medium", fontSize: 11, color: "#3E3B35" },
  tileLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "#6B675F", textAlign: "center", marginTop: 4 },
  rotateBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, minHeight: 44 },
  rotateText: { fontFamily: "Cairo_600SemiBold", color: "#21423A", fontSize: 13 },
  stateBox: { width: "100%", maxWidth: 428, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 44, marginTop: 20, borderRadius: 20, backgroundColor: "#FFFFFF" },
  stateTitle: { fontFamily: "Cairo_700Bold", color: "#1E1E1C", fontSize: 18 },
  stateText: { fontFamily: "Cairo_400Regular", color: "#6B675F", fontSize: 14, textAlign: "center", paddingHorizontal: 24 },
  primaryBtn: { marginTop: 4, height: 48, paddingHorizontal: 28, borderRadius: 14, backgroundColor: "#21423A", alignItems: "center", justifyContent: "center" },
  primaryBtnText: { fontFamily: "Cairo_600SemiBold", color: "#F1EEE6", fontSize: 15 },
  modalBg: { flex: 1, backgroundColor: "rgba(15,15,14,0.72)", alignItems: "center", justifyContent: "center", padding: 20 },
});
