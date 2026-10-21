import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, Share, Alert, useWindowDimensions, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate, Easing, FadeInDown,
} from "react-native-reanimated";
import Svg, { Defs, Pattern, Line, Rect } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

type Tier = "admin" | "moderator" | "business" | "female" | "male";

type MemberCard = {
  number: string;
  tier: Tier;
  tier_label: string;
  name: string;
  avatar_url: string | null;
  role_label: string;
  member_since: number;
  verified: boolean;
  verify_url: string;
};

// ألوان كل فئة — مطابقة لصفحة التحقّق على الخادم
const TIERS: Record<Tier, { bg: [string, string, string]; foil: [string, string, string]; ink: string; text: string; deep: string; patternAngle: number; desc: string }> = {
  male:      { bg: ["#012E22", "#00684B", "#013D2D"], foil: ["#F7E3A1", "#D9AE4F", "#A97C25"], ink: "#E9C978", text: "#F5F1E4", deep: "#013526", patternAngle: 45,  desc: "أخضر الزمرد بذهب الشعار" },
  female:    { bg: ["#2E0C26", "#6B2450", "#3D1131"], foil: ["#FBE1D6", "#E3A894", "#B8735E"], ink: "#EFC1AE", text: "#FCEFF2", deep: "#3A0F2E", patternAngle: -45, desc: "عنّابي عميق بالذهب الوردي" },
  business:  { bg: ["#121314", "#2B2C2F", "#18191B"], foil: ["#F3E6C1", "#CDB57A", "#8F7440"], ink: "#DCC793", text: "#F2EFE8", deep: "#1A1B1D", patternAngle: 0,   desc: "فحمي بذهب الشمبانيا" },
  moderator: { bg: ["#07142A", "#173E73", "#0B2143"], foil: ["#FFFFFF", "#C9D4E2", "#8695AA"], ink: "#D7E0EC", text: "#EEF3FA", deep: "#0B1F3E", patternAngle: 45,  desc: "كحلي ياقوتي بالبلاتين" },
  admin:     { bg: ["#000000", "#16130B", "#050505"], foil: ["#FFF0B8", "#E6B84A", "#9C6B12"], ink: "#F0CB6A", text: "#FBF6E8", deep: "#0D0B06", patternAngle: 45,  desc: "أسود الأونيكس بإطار ذهبي" },
};

const CARD_RATIO = 270 / 428;

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join(" ") || "ح";
}

function CardPattern({ angle, color }: { angle: number; color: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="lines" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform={`rotate(${angle})`}>
          <Line x1="0" y1="0" x2="0" y2="14" stroke={color} strokeWidth="1" />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#lines)" />
    </Svg>
  );
}

function Foil({ colors, style, children }: { colors: [string, string, string]; style?: any; children?: React.ReactNode }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={style}>
      {children}
    </LinearGradient>
  );
}

function CardFront({ card, width }: { card: MemberCard; width: number }) {
  const t = TIERS[card.tier];
  const s = width / 428; // كل المقاسات مأخوذة من تصميم 428×270
  const isAdmin = card.tier === "admin";
  return (
    <LinearGradient colors={t.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { width, height: width * CARD_RATIO, borderRadius: 22 * s }]}>
      <CardPattern angle={t.patternAngle} color={isAdmin ? "rgba(240,203,106,0.06)" : "rgba(255,255,255,0.05)"} />
      <LinearGradient colors={["rgba(255,255,255,0.18)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.7 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View pointerEvents="none" style={[styles.frame, { top: 10 * s, bottom: 10 * s, left: 10 * s, right: 10 * s, borderRadius: 15 * s, borderColor: t.ink + (isAdmin ? "B3" : "73"), borderWidth: isAdmin ? 1.5 : 1 }]} />
      {isAdmin && <View pointerEvents="none" style={[styles.frame, { top: 15 * s, bottom: 15 * s, left: 15 * s, right: 15 * s, borderRadius: 11 * s, borderColor: t.ink + "47" }]} />}

      <View style={{ flex: 1, paddingVertical: 24 * s, paddingHorizontal: 28 * s, justifyContent: "space-between" }}>
        <View style={styles.rowTop}>
          <View>
            <Text style={[styles.brand, { color: t.ink, fontSize: 20 * s }]}>حصاحيصاوي</Text>
            <Text style={[styles.small, { color: t.text, fontSize: 11 * s }]}>بطاقة العضوية الرقمية</Text>
          </View>
          {isAdmin ? (
            <Foil colors={t.foil} style={[styles.tierPill, { paddingHorizontal: 14 * s, paddingVertical: 4 * s }]}>
              <Text style={[styles.tierText, { color: "#120F06", fontSize: 12 * s }]}>{card.tier_label}</Text>
            </Foil>
          ) : (
            <View style={[styles.tierPill, { borderColor: t.ink + "8C", borderWidth: 1, paddingHorizontal: 14 * s, paddingVertical: 4 * s }]}>
              <Text style={[styles.tierText, { color: t.ink, fontSize: 12 * s }]}>{card.tier_label}</Text>
            </View>
          )}
        </View>

        <View style={[styles.rowMid, { gap: 16 * s }]}>
          <Foil colors={t.foil} style={{ width: 68 * s, height: 68 * s, borderRadius: 34 * s, padding: 2 }}>
            <View style={[styles.avatarIn, { backgroundColor: t.deep }]}>
              {card.avatar_url ? (
                <Image source={{ uri: card.avatar_url }} style={styles.avatarImg} accessibilityIgnoresInvertColors />
              ) : (
                <Text style={{ fontFamily: "Cairo_700Bold", color: t.ink, fontSize: 22 * s }}>{initials(card.name)}</Text>
              )}
            </View>
          </Foil>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
              <Text numberOfLines={1} style={[styles.name, { color: t.text, fontSize: 21 * s }]}>{card.name}</Text>
              {card.verified && <Ionicons name="checkmark-circle" size={18 * s} color={t.ink} accessibilityLabel="موثّق" />}
            </View>
            <Text numberOfLines={1} style={[styles.small, { color: t.text, fontSize: 12 * s, marginTop: 2 }]}>{card.role_label}</Text>
          </View>
          <Foil colors={t.foil} style={{ width: 46 * s, height: 36 * s, borderRadius: 7 * s }}>
            <View style={[styles.chipLine, { margin: 6 * s, borderRadius: 4 * s }]} />
          </Foil>
        </View>

        <View style={styles.rowBottom}>
          <View>
            <Text style={[styles.label, { color: t.text, fontSize: 10 * s }]}>رقم العضوية</Text>
            <Text style={[styles.number, { color: t.ink, fontSize: 15 * s }]}>{card.number}</Text>
          </View>
          <View style={{ alignItems: "flex-start" }}>
            <Text style={[styles.label, { color: t.text, fontSize: 10 * s }]}>منذ</Text>
            <Text style={{ fontFamily: "Cairo_600SemiBold", color: t.text, fontSize: 14 * s }}>{card.member_since}</Text>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

function CardBack({ card, width }: { card: MemberCard; width: number }) {
  const t = TIERS[card.tier];
  const s = width / 428;
  const qrSize = 118 * s;
  return (
    <LinearGradient colors={t.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { width, height: width * CARD_RATIO, borderRadius: 22 * s }]}>
      <CardPattern angle={t.patternAngle} color="rgba(255,255,255,0.05)" />
      <View pointerEvents="none" style={[styles.frame, { top: 10 * s, bottom: 10 * s, left: 10 * s, right: 10 * s, borderRadius: 15 * s, borderColor: t.ink + "73" }]} />
      <View style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 28 * s, gap: 20 * s }}>
        <View style={{ flex: 1, gap: 8 * s }}>
          <Text style={[styles.brand, { color: t.ink, fontSize: 18 * s }]}>تحقّق من العضوية</Text>
          <Text style={[styles.small, { color: t.text, fontSize: 12 * s, lineHeight: 20 * s, opacity: 0.88 }]}>امسح الرمز بكاميرا الهاتف لعرض البطاقة الموثّقة لصاحبها.</Text>
          <View style={{ height: 1, backgroundColor: t.ink + "4D" }} />
          <Text style={{ fontFamily: "Cairo_600SemiBold", color: t.text, fontSize: 12 * s }}>انضم إلى حصاحيصاوي واحصل على بطاقتك</Text>
        </View>
        <View style={{ backgroundColor: "#FFFFFF", borderRadius: 14 * s, padding: 10 * s }}>
          <QRCode value={card.verify_url} size={qrSize} color={t.deep} backgroundColor="#FFFFFF" ecl="M" />
        </View>
      </View>
    </LinearGradient>
  );
}

export default function MemberCardScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { token, user } = useAuth();
  const [card, setCard] = useState<MemberCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const flip = useSharedValue(0);
  const [showBack, setShowBack] = useState(false);

  const cardW = Math.min(screenW - 40, 428);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${getApiUrl()}/api/member-card/me`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "تعذّر تحميل البطاقة");
      setCard(data.card);
    } catch (e: any) {
      setError(e?.message || "تعذّر تحميل البطاقة");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = !showBack;
    setShowBack(next);
    flip.value = withTiming(next ? 1 : 0, { duration: 520, easing: Easing.out(Easing.cubic) });
  };

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
    opacity: flip.value < 0.5 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
    opacity: flip.value >= 0.5 ? 1 : 0,
  }));

  const share = async () => {
    if (!card) return;
    try {
      await Share.share({
        message: `بطاقة عضويتي في حصاحيصاوي — ${card.tier_label}\n${card.verify_url}`,
        ...(Platform.OS === "ios" ? { url: card.verify_url } : {}),
      });
    } catch {}
  };

  const rotate = () => {
    Alert.alert(
      "إعادة إصدار رمز التحقّق",
      "سيتوقف الرمز الحالي عن العمل، ومن مسح بطاقتك سابقاً لن يتمكن من فتحها. هل تريد المتابعة؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إعادة الإصدار", style: "destructive", onPress: async () => {
            setRotating(true);
            try {
              const r = await fetch(`${getApiUrl()}/api/member-card/me/rotate`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
              const data = await r.json().catch(() => ({}));
              if (!r.ok) throw new Error(data.error || "تعذّرت إعادة الإصدار");
              setCard(data.card);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            } catch (e: any) { Alert.alert("تعذّر ذلك", e?.message || ""); }
            finally { setRotating(false); }
          },
        },
      ],
    );
  };

  const tier = card ? TIERS[card.tier] : TIERS.male;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="رجوع">
          <Ionicons name="chevron-forward" size={24} color="#F2EFE8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>بطاقة العضوية</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={{ alignItems: "center", paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
        {!token || !user ? (
          <View style={styles.stateBox}>
            <Ionicons name="card-outline" size={44} color="#E9C978" />
            <Text style={styles.stateTitle}>بطاقتك بانتظارك</Text>
            <Text style={styles.stateText}>سجّل الدخول لإصدار بطاقة عضويتك الرقمية الموثّقة.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push("/login" as any)} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>تسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={[styles.stateBox, { height: cardW * CARD_RATIO + 120 }]}>
            <ActivityIndicator color="#E9C978" />
            <Text style={styles.stateText}>جارٍ إصدار بطاقتك…</Text>
          </View>
        ) : error || !card ? (
          <View style={styles.stateBox}>
            <Ionicons name="alert-circle-outline" size={40} color="#F2994A" />
            <Text style={styles.stateText}>{error || "تعذّر تحميل البطاقة"}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={load} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: "center", width: "100%" }}>
            <TouchableOpacity activeOpacity={0.95} onPress={toggleFlip} accessibilityRole="button" accessibilityLabel={showBack ? "اقلب لعرض الوجه الأمامي" : "اقلب لعرض رمز التحقّق"} style={{ width: cardW, height: cardW * CARD_RATIO, marginTop: 24 }}>
              <Animated.View style={[StyleSheet.absoluteFill, styles.shadow, frontStyle]} pointerEvents={showBack ? "none" : "auto"}>
                <CardFront card={card} width={cardW} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.shadow, backStyle]} pointerEvents={showBack ? "auto" : "none"}>
                <CardBack card={card} width={cardW} />
              </Animated.View>
            </TouchableOpacity>
            <Text style={styles.flipHint}>اضغط على البطاقة لقلبها</Text>

            <View style={styles.actions}>
              <TouchableOpacity onPress={share} accessibilityRole="button" style={{ flex: 1 }}>
                <LinearGradient colors={tier.foil} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionMain}>
                  <Ionicons name="share-social" size={18} color="#1A1405" />
                  <Text style={styles.actionMainText}>مشاركة البطاقة</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleFlip} accessibilityRole="button" style={styles.actionGhost}>
                <Ionicons name="qr-code-outline" size={18} color="#F2EFE8" />
                <Text style={styles.actionGhostText}>{showBack ? "الوجه الأمامي" : "رمز التحقّق"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>فئة بطاقتك: {card.tier_label}</Text>
              <Text style={styles.infoText}>{tier.desc}. تُحدَّد الفئة تلقائياً من حسابك، وتتغيّر البطاقة إذا تغيّرت صفتك في المنصة.</Text>
              <Text style={styles.infoText}>لا تحمل البطاقة رقم هاتفك ولا رقمك الوطني.</Text>
              <TouchableOpacity onPress={rotate} disabled={rotating} accessibilityRole="button" style={styles.rotateBtn}>
                {rotating ? <ActivityIndicator size="small" color="#A9A79F" /> : <Ionicons name="refresh" size={16} color="#A9A79F" />}
                <Text style={styles.rotateText}>إعادة إصدار رمز التحقّق</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0C0D0D" },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#F5F1E4" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  card: { overflow: "hidden" },
  frame: { position: "absolute", borderWidth: 1 },
  shadow: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 18 }, elevation: 14, backfaceVisibility: "hidden" },
  rowTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start" },
  rowMid: { flexDirection: "row-reverse", alignItems: "center" },
  rowBottom: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-end" },
  brand: { fontFamily: "Cairo_700Bold", textAlign: "right" },
  small: { fontFamily: "Cairo_400Regular", opacity: 0.78, textAlign: "right" },
  label: { fontFamily: "Cairo_400Regular", opacity: 0.62, textAlign: "right" },
  tierPill: { borderRadius: 999 },
  tierText: { fontFamily: "Cairo_600SemiBold" },
  avatarIn: { flex: 1, borderRadius: 999, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  name: { fontFamily: "Cairo_700Bold", textAlign: "right", flexShrink: 1 },
  chipLine: { flex: 1, borderWidth: 1, borderColor: "rgba(0,0,0,0.28)" },
  number: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), letterSpacing: 2, textAlign: "right" },
  flipHint: { fontFamily: "Cairo_400Regular", color: "#8C8A83", fontSize: 13, marginTop: 14 },
  actions: { flexDirection: "row-reverse", gap: 12, width: "100%", maxWidth: 428, marginTop: 22 },
  actionMain: { height: 50, borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  actionMainText: { fontFamily: "Cairo_700Bold", color: "#1A1405", fontSize: 15 },
  actionGhost: { height: 50, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: "rgba(242,239,232,0.22)", flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  actionGhostText: { fontFamily: "Cairo_600SemiBold", color: "#F2EFE8", fontSize: 14 },
  infoCard: { width: "100%", maxWidth: 428, marginTop: 24, padding: 18, borderRadius: 18, backgroundColor: "#151717", gap: 8 },
  infoTitle: { fontFamily: "Cairo_700Bold", color: "#F5F1E4", fontSize: 15, textAlign: "right" },
  infoText: { fontFamily: "Cairo_400Regular", color: "#A9A79F", fontSize: 13, lineHeight: 21, textAlign: "right" },
  rotateBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 6, minHeight: 44 },
  rotateText: { fontFamily: "Cairo_600SemiBold", color: "#A9A79F", fontSize: 13 },
  stateBox: { width: "100%", maxWidth: 428, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 48, marginTop: 24, borderRadius: 22, backgroundColor: "#151717" },
  stateTitle: { fontFamily: "Cairo_700Bold", color: "#F5F1E4", fontSize: 18 },
  stateText: { fontFamily: "Cairo_400Regular", color: "#A9A79F", fontSize: 14, textAlign: "center", paddingHorizontal: 24 },
  primaryBtn: { marginTop: 6, height: 48, paddingHorizontal: 28, borderRadius: 14, backgroundColor: "#D9AE4F", alignItems: "center", justifyContent: "center" },
  primaryBtnText: { fontFamily: "Cairo_700Bold", color: "#1A1405", fontSize: 15 },
});
