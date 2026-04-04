import React, { useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Platform,
  TouchableOpacity, Linking, Alert,
} from "react-native";
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, withSequence, Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const ACCENT = "#F97316";
const ACCENT2 = "#FBBF24";
const SERVICE_COLOR = "#22C55E";

const FEATURES = [
  { icon: "car-side",         color: "#3E9CBF", label: "توصيل بالسيارات",     sub: "رحلات مريحة وسريعة داخل المدينة" },
  { icon: "rickshaw",         color: ACCENT,    label: "مشاوير بالركشة",      sub: "وسيلة التنقل الشعبية بتكلفة منخفضة" },
  { icon: "package-variant",  color: "#A855F7", label: "توصيل الطلبات",       sub: "إيصال بضائع ومشتريات لباب البيت" },
  { icon: "map-marker-path",  color: SERVICE_COLOR, label: "تتبع لحظي",       sub: "تتبع موقع السائق في الوقت الفعلي" },
  { icon: "star-circle",      color: ACCENT2,   label: "تقييم السائقين",      sub: "نظام تقييم لضمان جودة الخدمة" },
  { icon: "shield-check",     color: "#3E9CBF", label: "رحلات آمنة",          sub: "سائقون موثّقون ومراجَعون من الإدارة" },
];

const HOW_ITEMS = [
  { step: "١", text: "اختر نوع الخدمة (مشوار أو توصيل طلب)" },
  { step: "٢", text: "حدد موقعك والوجهة المطلوبة" },
  { step: "٣", text: "اختر أقرب سائق متاح من السيارات أو الركشات" },
  { step: "٤", text: "تابع رحلتك وقيّم السائق بعد الوصول" },
];

function PulseRing({ color, delay = 0 }: { color: string; delay?: number }) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(1);

  useEffect(() => {
    setTimeout(() => {
      scale.value  = withRepeat(withTiming(1.6, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
      opacity.value = withRepeat(withTiming(0,   { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
    }, delay);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[{
        position: "absolute", width: 90, height: 90, borderRadius: 45,
        borderWidth: 2, borderColor: color,
      }, style]}
    />
  );
}

export default function TransportScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
  }, []);

  const soonStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + shimmer.value * 0.3,
  }));

  const handleNotifyMe = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "✅ شكراً لاهتمامك",
      "سنُعلمك فور إطلاق مشاويرك علينا وخدمات التوصيل. ترقّب التحديثات القادمة!",
      [{ text: "حسناً" }],
    );
  };

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ══ HERO ══ */}
        <LinearGradient
          colors={["#081A0E", "#0D2B17", "#112E1B"]}
          style={[s.hero, { paddingTop: topPad + 16 }]}
        >
          {/* خلفية زخرفية */}
          <View style={s.heroDot1} />
          <View style={s.heroDot2} />
          <View style={s.heroDot3} />

          {/* أيقونات متحركة في المنتصف */}
          <Animated.View entering={FadeIn.delay(100).duration(600)} style={s.iconCluster}>
            <View style={s.pulseWrap}>
              <PulseRing color={ACCENT} delay={0} />
              <PulseRing color={ACCENT2} delay={600} />
              <LinearGradient colors={[ACCENT + "30", ACCENT2 + "20"]} style={s.iconCircle}>
                <MaterialCommunityIcons name="car-side" size={36} color={ACCENT} />
              </LinearGradient>
            </View>

            <View style={s.smallIconRow}>
              <View style={[s.smallIcon, { backgroundColor: "#3E9CBF20", borderColor: "#3E9CBF40" }]}>
                <MaterialCommunityIcons name="rickshaw" size={22} color="#3E9CBF" />
              </View>
              <View style={[s.smallIcon, { backgroundColor: "#A855F720", borderColor: "#A855F740" }]}>
                <MaterialCommunityIcons name="package-variant" size={22} color="#A855F7" />
              </View>
              <View style={[s.smallIcon, { backgroundColor: SERVICE_COLOR + "20", borderColor: SERVICE_COLOR + "40" }]}>
                <MaterialCommunityIcons name="map-marker-radius" size={22} color={SERVICE_COLOR} />
              </View>
            </View>
          </Animated.View>

          {/* شارة "قريباً" */}
          <Animated.View entering={FadeInDown.delay(200).springify()} style={s.soonBadgeWrap}>
            <Animated.View style={[s.soonBadge, soonStyle]}>
              <MaterialCommunityIcons name="clock-fast" size={13} color={ACCENT2} />
              <Text style={s.soonBadgeText}>قريباً · سيتم التفعيل</Text>
            </Animated.View>
          </Animated.View>

          <Animated.Text entering={FadeInDown.delay(280).springify()} style={s.heroTitle}>
            مشاويرك علينا{"\n"}وخدمات التوصيل
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(340).springify()} style={s.heroSub}>
            منصة ربط بين السكان وأصحاب السيارات والركشات{"\n"}
            لتسهيل التنقل وتوصيل الطلبات داخل الحصاحيصا
          </Animated.Text>

          {/* إحصائيات مستهدفة */}
          <Animated.View entering={FadeInDown.delay(400).springify()} style={s.statsRow}>
            {[
              { num: "٢٤س",    label: "متاح يومياً", color: ACCENT },
              { num: "٥٠٠+",   label: "سائق مرتقب", color: ACCENT2 },
              { num: "٣ د",    label: "متوسط الوصول", color: SERVICE_COLOR },
            ].map((st, i) => (
              <View key={i} style={s.statItem}>
                <Text style={[s.statNum, { color: st.color }]}>{st.num}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </Animated.View>
        </LinearGradient>

        <View style={s.body}>
          {/* ── بطاقة الإشعار ── */}
          <Animated.View entering={FadeInDown.delay(100).springify()} style={s.notifyCard}>
            <LinearGradient colors={[ACCENT + "15", ACCENT2 + "08"]} style={s.notifyGrad}>
              <View style={s.notifyIconWrap}>
                <MaterialCommunityIcons name="bell-ring-outline" size={24} color={ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.notifyTitle}>نُعلمك عند الإطلاق</Text>
                <Text style={s.notifySub}>كن أول من يستخدم مشاويرك علينا في حصاحيصا</Text>
              </View>
              <TouchableOpacity onPress={handleNotifyMe} style={s.notifyBtn}>
                <Text style={s.notifyBtnText}>أبلّغني</Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          {/* ── مميزات الخدمة ── */}
          <Animated.View entering={FadeInDown.delay(150).springify()} style={s.sectionHeader}>
            <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sectionBar} />
            <Text style={s.sectionTitle}>ما الذي تقدمه الخدمة؟</Text>
          </Animated.View>

          <View style={s.featuresGrid}>
            {FEATURES.map((f, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(180 + i * 60).springify()} style={s.featureCard}>
                <View style={[s.featureIconWrap, { backgroundColor: f.color + "18", borderColor: f.color + "30" }]}>
                  <MaterialCommunityIcons name={f.icon as any} size={24} color={f.color} />
                </View>
                <Text style={s.featureLabel}>{f.label}</Text>
                <Text style={s.featureSub}>{f.sub}</Text>
                <View style={[s.featureBottomLine, { backgroundColor: f.color + "70" }]} />
              </Animated.View>
            ))}
          </View>

          {/* ── كيف تعمل ── */}
          <Animated.View entering={FadeInDown.delay(350).springify()} style={s.sectionHeader}>
            <LinearGradient colors={[SERVICE_COLOR, SERVICE_COLOR + "60"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sectionBar} />
            <Text style={s.sectionTitle}>كيف ستعمل الخدمة؟</Text>
          </Animated.View>

          <View style={s.howCard}>
            {HOW_ITEMS.map((h, i) => (
              <View key={i} style={s.howRow}>
                <LinearGradient colors={[ACCENT, ACCENT2]} style={s.howBubble}>
                  <Text style={s.howStep}>{h.step}</Text>
                </LinearGradient>
                {i < HOW_ITEMS.length - 1 && <View style={s.howLine} />}
                <Text style={s.howText}>{h.text}</Text>
              </View>
            ))}
          </View>

          {/* ── من يمكنه الانضمام كسائق ── */}
          <Animated.View entering={FadeInDown.delay(420).springify()} style={s.sectionHeader}>
            <LinearGradient colors={["#3E9CBF", "#3E9CBF60"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sectionBar} />
            <Text style={s.sectionTitle}>هل تملك سيارة أو ركشة؟</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(460).springify()} style={s.driverCard}>
            <LinearGradient colors={["#3E9CBF18", "transparent"]} style={s.driverGrad}>
              <View style={{ flexDirection: "row-reverse", gap: 12, marginBottom: 14 }}>
                {[
                  { icon: "car-side",   label: "سيارة خاصة",  color: "#3E9CBF" },
                  { icon: "rickshaw",   label: "ركشة",         color: ACCENT },
                  { icon: "van-utility",label: "بيك أب",       color: "#A855F7" },
                ].map((v, i) => (
                  <View key={i} style={[s.vehicleChip, { borderColor: v.color + "40", backgroundColor: v.color + "12" }]}>
                    <MaterialCommunityIcons name={v.icon as any} size={18} color={v.color} />
                    <Text style={[s.vehicleChipText, { color: v.color }]}>{v.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.driverText}>
                سيُتاح لأصحاب المركبات التسجيل كسائقين معتمدين وتحقيق دخل إضافي من خلال التطبيق.
                سيتم التحقق من المركبة والوثائق لضمان سلامة المستخدمين.
              </Text>
              <TouchableOpacity onPress={handleNotifyMe} style={s.driverBtn}>
                <MaterialCommunityIcons name="steering" size={16} color="#fff" />
                <Text style={s.driverBtnText}>سجّل اهتمامك كسائق</Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          {/* ── CTA نهائي ── */}
          <Animated.View entering={FadeInDown.delay(500).springify()} style={s.ctaCard}>
            <LinearGradient colors={[ACCENT + "20", ACCENT2 + "10"]} style={s.ctaGrad}>
              <MaterialCommunityIcons name="clock-time-four-outline" size={36} color={ACCENT} style={{ marginBottom: 10 }} />
              <Text style={s.ctaTitle}>الخدمة تحت التطوير</Text>
              <Text style={s.ctaSub}>
                فريقنا يعمل على إطلاق خدمة مشاويرك علينا وخدمات التوصيل قريباً.{"\n"}
                سيتم إشعارك فور التفعيل الرسمي.
              </Text>
              <TouchableOpacity onPress={handleNotifyMe} style={s.ctaBtn} activeOpacity={0.85}>
                <LinearGradient colors={[ACCENT, ACCENT2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.ctaBtnGrad}>
                  <Ionicons name="notifications-outline" size={18} color="#fff" />
                  <Text style={s.ctaBtnText}>أبلّغني عند الإطلاق</Text>
                </LinearGradient>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // HERO
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  heroDot1: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: ACCENT + "08", top: -60, right: -60 },
  heroDot2: { position: "absolute", width: 150, height: 150, borderRadius: 75,  backgroundColor: ACCENT2 + "06", bottom: -40, left: -40 },
  heroDot3: { position: "absolute", width: 100, height: 100, borderRadius: 50,  backgroundColor: "#3E9CBF08", top: 80, left: 30 },

  iconCluster: { alignItems: "center", marginBottom: 16, marginTop: 8 },
  pulseWrap: { width: 90, height: 90, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  iconCircle: {
    width: 78, height: 78, borderRadius: 39,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: ACCENT + "50",
  },
  smallIconRow: { flexDirection: "row-reverse", gap: 12 },
  smallIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },

  soonBadgeWrap: { marginBottom: 12 },
  soonBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    backgroundColor: ACCENT2 + "18", borderWidth: 1, borderColor: ACCENT2 + "40",
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  soonBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: ACCENT2 },

  heroTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 30, color: Colors.textPrimary,
    textAlign: "center", lineHeight: 42, marginBottom: 10,
  },
  heroSub: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary,
    textAlign: "center", lineHeight: 22, marginBottom: 20,
  },

  statsRow: {
    flexDirection: "row-reverse",
    backgroundColor: "#ffffff08", borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 10,
    borderWidth: 1, borderColor: ACCENT + "20",
    width: "100%",
  },
  statItem: { flex: 1, alignItems: "center" },
  statNum:  { fontFamily: "Cairo_700Bold", fontSize: 22 },
  statLabel:{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  // BODY
  body: { paddingHorizontal: 16, paddingTop: 20, backgroundColor: Colors.bg },

  sectionHeader: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    marginBottom: 14, marginTop: 6,
  },
  sectionBar:   { width: 4, height: 22, borderRadius: 2 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },

  // Notify card
  notifyCard: {
    borderRadius: 16, overflow: "hidden",
    borderWidth: 1, borderColor: ACCENT + "30", marginBottom: 24,
  },
  notifyGrad: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16,
  },
  notifyIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: ACCENT + "20", borderWidth: 1, borderColor: ACCENT + "40",
    alignItems: "center", justifyContent: "center",
  },
  notifyTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  notifySub:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  notifyBtn: {
    backgroundColor: ACCENT, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  notifyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },

  // Features grid
  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  featureCard: {
    width: "47.5%", backgroundColor: Colors.cardBg,
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.divider,
    overflow: "hidden",
  },
  featureIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, marginBottom: 10,
  },
  featureLabel: { fontFamily: "Cairo_700Bold",   fontSize: 13, color: Colors.textPrimary,   textAlign: "right", marginBottom: 4 },
  featureSub:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right", lineHeight: 18 },
  featureBottomLine: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2 },

  // How it works
  howCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.divider, marginBottom: 24,
  },
  howRow: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12, position: "relative", minHeight: 52 },
  howBubble: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
  howLine: { position: "absolute", right: 15, top: 34, width: 2, height: 18, backgroundColor: ACCENT + "30" },
  howStep: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#000" },
  howText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", paddingTop: 6, lineHeight: 20 },

  // Driver card
  driverCard: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#3E9CBF30", marginBottom: 24 },
  driverGrad: { padding: 16 },
  vehicleChip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  vehicleChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  driverText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 21, marginBottom: 14 },
  driverBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#3E9CBF", borderRadius: 12, paddingVertical: 12,
  },
  driverBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },

  // CTA
  ctaCard: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: ACCENT + "30", marginBottom: 12 },
  ctaGrad: { padding: 24, alignItems: "center" },
  ctaTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, marginBottom: 8 },
  ctaSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 20 },
  ctaBtn: { width: "100%" },
  ctaBtnGrad: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 14, borderRadius: 14,
  },
  ctaBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
