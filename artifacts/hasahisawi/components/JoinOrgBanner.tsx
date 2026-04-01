import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Linking, Alert, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring, withSequence } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

// أنواع المؤسسات المدعوة للانضمام
const ORG_TYPES = [
  { icon: "school",               label: "المدارس",         color: "#4CAF93" },
  { icon: "domain",               label: "الشركات",         color: Colors.accent },
  { icon: "medical-bag",          label: "المستشفيات",      color: "#E74C6F" },
  { icon: "account-group",        label: "الجمعيات",        color: "#9B59B6" },
  { icon: "mosque",               label: "المساجد",         color: "#27AE60" },
  { icon: "office-building",      label: "الحكومية",        color: "#2980B9" },
] as const;

// مميزات الانضمام
const BENEFITS = [
  { icon: "people-outline",   text: "الوصول لأكثر من ٥٠٠٠ مستخدم من أبناء الحصاحيصا", color: Colors.primary },
  { icon: "megaphone-outline", text: "نشر فعالياتك وأنشطتك ومناسباتك مجاناً للمجتمع", color: Colors.accent },
  { icon: "shield-checkmark-outline", text: "ختم التحقق الرسمي وشارة الموثوقية على صفحتك", color: "#3E9CBF" },
  { icon: "bar-chart-outline", text: "إحصائيات مفصّلة عن التفاعل مع صفحة مؤسستك",  color: "#9B59B6" },
  { icon: "chatbubbles-outline", text: "تواصل مباشر مع أبناء المجتمع والمتطوعين",      color: "#E74C6F" },
] as const;

const CONTACT_PHONE    = "+249912345600";
const CONTACT_WHATSAPP = "+249912345600";

export default function JoinOrgBanner() {
  const pulse = useSharedValue(1);
  const router = useRouter();

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const handleJoinForm = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    pulse.value = withSequence(withSpring(0.94), withSpring(1));
    router.push("/org-join" as any);
  };

  const handleWhatsApp = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const msg = encodeURIComponent("السلام عليكم، أود الاستفسار عن تسجيل مؤسستي في تطبيق حصاحيصاوي");
    Linking.openURL(`https://wa.me/${CONTACT_WHATSAPP.replace(/\D/g, "")}?text=${msg}`).catch(() =>
      Alert.alert("تنبيه", "تأكد من تثبيت واتساب على هاتفك")
    );
  };

  const handleCall = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${CONTACT_PHONE}`).catch(() =>
      Alert.alert("تنبيه", "لا يمكن الاتصال من هذا الجهاز")
    );
  };

  return (
    <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.wrapper}>
      {/* ── الرأس المتدرج ── */}
      <LinearGradient
        colors={["#0B2A1A", "#0D3520", "#0F3D24"]}
        style={styles.topSection}
      >
        {/* نمط خلفي زخرفي */}
        <View style={styles.bgDot1} />
        <View style={styles.bgDot2} />
        <View style={styles.bgDot3} />

        {/* شارة */}
        <View style={styles.badge}>
          <Ionicons name="star" size={11} color={Colors.accent} />
          <Text style={styles.badgeText}>دعوة خاصة للمؤسسات</Text>
        </View>

        {/* العنوان الرئيسي */}
        <Text style={styles.headline}>سجِّل مؤسستك{"\n"}في حصاحيصاوي</Text>
        <Text style={styles.subheadline}>
          انضم إلى المنصة الرقمية الأولى لمدينة الحصاحيصا
          وكن جزءاً من مجتمع رقمي متكامل
        </Text>

        {/* إحصائيات */}
        <View style={styles.statsRow}>
          {[
            { num: "٥٠٠٠+", label: "مستخدم نشط",   color: Colors.primary },
            { num: "٦+",    label: "منظمة مسجّلة", color: Colors.accent },
            { num: "٢٤س",   label: "وقت الموافقة", color: "#3E9CBF" },
          ].map((st, i) => (
            <View key={i} style={styles.statItem}>
              <Text style={[styles.statNum, { color: st.color }]}>{st.num}</Text>
              <Text style={styles.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* ── أنواع المؤسسات ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <LinearGradient colors={[Colors.primary, Colors.primary + "40"]} style={styles.sectionBar} />
          <Text style={styles.sectionTitle}>من يمكنه الانضمام؟</Text>
        </View>
        <View style={styles.orgTypesGrid}>
          {ORG_TYPES.map((t, i) => (
            <View key={i} style={[styles.orgTypeChip, { borderColor: t.color + "35", backgroundColor: t.color + "12" }]}>
              <MaterialCommunityIcons name={t.icon as any} size={18} color={t.color} />
              <Text style={[styles.orgTypeLabel, { color: t.color }]}>{t.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── المميزات ── */}
      <View style={[styles.section, { backgroundColor: Colors.bg, borderRadius: 16, marginHorizontal: 16, marginTop: 0, padding: 16 }]}>
        <View style={styles.sectionHeader}>
          <LinearGradient colors={[Colors.accent, Colors.accent + "40"]} style={styles.sectionBar} />
          <Text style={styles.sectionTitle}>ماذا تحصل عند التسجيل؟</Text>
        </View>
        {BENEFITS.map((b, i) => (
          <Animated.View key={i} entering={FadeInDown.delay(300 + i * 80).springify()} style={styles.benefitRow}>
            <View style={[styles.benefitIcon, { backgroundColor: b.color + "18" }]}>
              <Ionicons name={b.icon as any} size={18} color={b.color} />
            </View>
            <Text style={styles.benefitText}>{b.text}</Text>
          </Animated.View>
        ))}
      </View>

      {/* ── خطوات التسجيل ── */}
      <View style={styles.stepsSection}>
        <View style={styles.sectionHeader}>
          <LinearGradient colors={["#3E9CBF", "#3E9CBF40"]} style={styles.sectionBar} />
          <Text style={styles.sectionTitle}>كيف يتم التسجيل؟</Text>
        </View>
        <View style={styles.stepsWrap}>
          {[
            { step: "١", text: "اضغط على 'قدّم طلب الانضمام' وأدخل بيانات مؤسستك" },
            { step: "٢", text: "حدد الخدمات التي تقدمها لمواطني المنطقة" },
            { step: "٣", text: "وقّع إلكترونياً على عهد الشراكة والالتزام" },
            { step: "٤", text: "يُراجَع الطلب ويُعتمد خلال ٣–٥ أيام عمل" },
          ].map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDim]} style={styles.stepBubble}>
                <Text style={styles.stepNum}>{s.step}</Text>
              </LinearGradient>
              {i < 3 && <View style={styles.stepLine} />}
              <Text style={styles.stepText}>{s.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── أزرار التواصل ── */}
      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>ابدأ الآن — التسجيل مجاني</Text>
        <Text style={styles.ctaSub}>قدّم طلبك إلكترونياً في أقل من ٥ دقائق</Text>

        <Animated.View style={[{ width: "100%", gap: 10 }, pulseStyle]}>
          <TouchableOpacity onPress={handleJoinForm} style={{ width: "100%" }} activeOpacity={0.85}>
            <LinearGradient colors={[Colors.primary, Colors.primary + "CC"]} style={styles.joinFormBtn}>
              <MaterialCommunityIcons name="domain-plus" size={22} color="#fff" />
              <Text style={styles.btnText}>قدّم طلب الانضمام الآن</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={handleWhatsApp} style={{ flex: 1 }} activeOpacity={0.85}>
              <View style={styles.whatsappBtn}>
                <MaterialCommunityIcons name="whatsapp" size={18} color="#25D366" />
                <Text style={styles.whatsappBtnText}>استفسار عبر واتساب</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleCall} style={styles.callBtn} activeOpacity={0.85}>
              <Ionicons name="call" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Text style={styles.freeNote}>
          <Ionicons name="checkmark-circle" size={13} color={Colors.primary} />
          {"  "}التسجيل مجاني تماماً · توقيع إلكتروني مُعتمَد
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 0,
    marginTop: 20,
    marginBottom: 8,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.primary + "30",
    backgroundColor: Colors.cardBg,
  },

  // ── رأس المتدرج
  topSection: {
    padding: 22,
    paddingBottom: 26,
    position: "relative",
    overflow: "hidden",
    alignItems: "flex-end",
  },
  bgDot1: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: Colors.primary + "08", top: -40, left: -40 },
  bgDot2: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.accent + "10", bottom: -20, left: 40 },
  bgDot3: { position: "absolute", width: 80,  height: 80,  borderRadius: 40, backgroundColor: "#3E9CBF10", top: 20, left: 80 },

  badge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.accent + "20", borderWidth: 1, borderColor: Colors.accent + "40",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 14, alignSelf: "flex-end",
  },
  badgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.accent },

  headline: {
    fontFamily: "Cairo_700Bold", fontSize: 26, color: Colors.textPrimary,
    textAlign: "right", lineHeight: 36, marginBottom: 10,
  },
  subheadline: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary,
    textAlign: "right", lineHeight: 22, marginBottom: 20,
  },

  statsRow: {
    flexDirection: "row", backgroundColor: "#ffffff08", borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 8,
    borderWidth: 1, borderColor: Colors.primary + "20",
  },
  statItem: { flex: 1, alignItems: "center" },
  statNum:  { fontFamily: "Cairo_700Bold", fontSize: 22 },
  statLabel:{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  // ── قسم عام
  section: { padding: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  sectionBar:    { width: 4, height: 22, borderRadius: 2 },
  sectionTitle:  { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },

  // ── شبكة أنواع المؤسسات
  orgTypesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  orgTypeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  orgTypeLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  // ── مزايا
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  benefitIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  benefitText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 20 },

  // ── خطوات
  stepsSection: { padding: 16, paddingTop: 4 },
  stepsWrap: { gap: 0 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, position: "relative", minHeight: 52 },
  stepBubble: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center", marginTop: 2 },
  stepNum:  { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#000" },
  stepLine: {
    position: "absolute", left: 15, top: 34, width: 2, height: 18,
    backgroundColor: Colors.primary + "30",
  },
  stepText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", paddingTop: 6, lineHeight: 20 },

  // ── CTA
  ctaSection: {
    margin: 16, marginTop: 4, padding: 20,
    backgroundColor: Colors.bg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.primary + "25",
    alignItems: "center",
  },
  ctaTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, marginBottom: 4, textAlign: "center" },
  ctaSub:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 16, textAlign: "center" },

  joinFormBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, borderRadius: 14, width: "100%",
  },
  btnRow: { flexDirection: "row", gap: 10, width: "100%" },
  whatsappBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: "#25D36640", backgroundColor: "#25D36612",
  },
  whatsappBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  callBtn: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.primary + "15",
    borderWidth: 1, borderColor: Colors.primary + "40",
    justifyContent: "center", alignItems: "center",
  },

  freeNote: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted,
    marginTop: 12, textAlign: "center",
  },
});
