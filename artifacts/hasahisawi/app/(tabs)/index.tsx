import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";

const LOGO = require("@/assets/images/logo.png");

type Service = {
  id: string;
  label: string;
  sub: string;
  icon: any;
  iconType: "ionicons" | "material";
  tone: "green" | "gold";
  route: any;
  badge?: string;
};

const SERVICES: Service[] = [
  { id: "medical", label: "الدليل الطبي", sub: "صيدليات · مستشفيات · عيادات", icon: "medkit", iconType: "ionicons", tone: "green", route: "/(tabs)/medical" },
  { id: "missing", label: "مفقودات", sub: "أعلن عن غرض مفقود أو موجود", icon: "search", iconType: "ionicons", tone: "gold", route: "/(tabs)/missing" },
  { id: "student", label: "الخدمات الطلابية", sub: "مدارس · معاهد · التعليم", icon: "school", iconType: "ionicons", tone: "green", route: "/(tabs)/student" },
  { id: "restaurants", label: "المطاعم والكافتريات", sub: "منيو مصور · كاشير · فواتير", icon: "restaurant-outline", iconType: "ionicons", tone: "gold", route: "/(tabs)/restaurants", badge: "جديد" },
  { id: "market", label: "السوق", sub: "الأسر المنتجة · دلالة وأدوات", icon: "storefront", iconType: "ionicons", tone: "green", route: "/(tabs)/market" },
  { id: "product-showcase", label: "سوق المتاجر", sub: "ملابس · عطور · أحذية · بوتيكات", icon: "storefront-outline", iconType: "ionicons", tone: "gold", route: "/(tabs)/product-showcase", badge: "جديد" },
  { id: "jobs", label: "وظائف", sub: "وظائف وفرص عمل محلية", icon: "briefcase", iconType: "ionicons", tone: "green", route: "/(tabs)/jobs" },
  { id: "women", label: "قسم المرأة", sub: "متاجر وخدمات نسائية", icon: "face-woman", iconType: "material", tone: "green", route: "/(tabs)/women" },
  { id: "social", label: "المجتمع", sub: "منشورات · صور · تعليقات", icon: "chatbubbles", iconType: "ionicons", tone: "green", route: "/(tabs)/social" },
  { id: "sports", label: "النشاط الرياضي", sub: "الأندية · الفعاليات · البطولات", icon: "football", iconType: "ionicons", tone: "green", route: "/(tabs)/sports" },
  { id: "culture", label: "النشاط الثقافي", sub: "معارض · فعاليات · مراكز", icon: "palette", iconType: "material", tone: "gold", route: "/(tabs)/culture" },
  { id: "orgs", label: "المنظمات", sub: "جمعيات خيرية · مبادرات", icon: "hand-heart", iconType: "material", tone: "green", route: "/(tabs)/orgs" },
  { id: "transport", label: "مشاويرك علينا", sub: "طلبات مباشرة للسائقين", icon: "car-side", iconType: "material", tone: "gold", route: "/(tabs)/transport" },
  { id: "cv-builder", label: "منشئ السيرة الذاتية", sub: "قوالب مجانية · PDF", icon: "document-text-outline", iconType: "ionicons", tone: "green", route: "/(tabs)/cv-builder", badge: "جديد" },
  { id: "calendar", label: "التقويم", sub: "أعياد ومناسبات", icon: "calendar", iconType: "ionicons", tone: "gold", route: "/(tabs)/calendar" },
  { id: "appointments", label: "المواعيد", sub: "حجز وتنبيهات", icon: "calendar-check-outline", iconType: "material", tone: "green", route: "/(tabs)/appointments" },
  { id: "reports", label: "التبليغ السريع", sub: "مياه · كهرباء · بيئة", icon: "megaphone", iconType: "ionicons", tone: "gold", route: "/(tabs)/reports" },
  { id: "numbers", label: "أرقام مهمة", sub: "طوارئ وخدمات", icon: "call", iconType: "ionicons", tone: "green", route: "/(tabs)/numbers" },
  { id: "telecom", label: "الاتصالات", sub: "MTN · Zain · Sudani", icon: "cellular", iconType: "ionicons", tone: "green", route: "/(tabs)/telecom" },
  { id: "travel", label: "السفر والرحلات", sub: "وكالات · حجوزات · تذاكر", icon: "airplane", iconType: "ionicons", tone: "gold", route: "/(tabs)/travel" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 18) return "مساء الخير";
  return "مساء النور";
}

function toneColor(tone: Service["tone"]) {
  return tone === "gold" ? Colors.accent : Colors.primary;
}

function ServiceCard({ item, index }: { item: Service; index: number }) {
  const color = toneColor(item.tone);
  return (
    <Animated.View entering={FadeInDown.delay(90 + index * 24).springify()} style={styles.cardWrap}>
      <AnimatedPress onPress={() => router.push(item.route)}>
        <View style={styles.serviceCard}>
          <LinearGradient colors={[color + "18", "rgba(255,255,255,0.72)"]} style={StyleSheet.absoluteFill} />
          <View style={[styles.iconBox, { borderColor: color + "38", backgroundColor: color + "12" }]}>
            {item.iconType === "ionicons"
              ? <Ionicons name={item.icon} size={22} color={color} />
              : <MaterialCommunityIcons name={item.icon} size={22} color={color} />}
          </View>
          <Text style={styles.serviceLabel} numberOfLines={2}>{item.label}</Text>
          <Text style={styles.serviceSub} numberOfLines={3}>{item.sub}</Text>
          {item.badge ? (
            <View style={[styles.badge, { borderColor: color + "44", backgroundColor: color + "14" }]}>
              <Text style={[styles.badgeText, { color }]}>{item.badge}</Text>
            </View>
          ) : null}
          <View style={[styles.bottomLine, { backgroundColor: color }]} />
        </View>
      </AnimatedPress>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 28 : insets.top + 12;
  const date = useMemo(() => new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" }), []);

  return (
    <View style={styles.container}>
      <LinearGradient colors={Colors.gradients.appShell} style={StyleSheet.absoluteFill} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={[styles.hero, { paddingTop: topPad }]}> 
          <View style={styles.heroGlowGreen} />
          <View style={styles.heroGlowGold} />

          <Animated.View entering={FadeIn.duration(500)} style={styles.topRow}>
            <View style={styles.logoShell}>
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>منصة حصاحيصا المحلية</Text>
              <Text style={styles.title}>حصاحيصاوي</Text>
              <Text style={styles.subtitle}>كل احتياجاتك اليومية في تجربة واحدة</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/(tabs)/settings" as any)} style={styles.roundBtn}>
              <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.heroCard}>
            <LinearGradient colors={["rgba(255,255,255,0.86)", "rgba(255,255,255,0.48)"]} style={StyleSheet.absoluteFill} />
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroTitle}>خدمات، سوق، مشاوير، مطاعم، ومجتمع في مكان واحد</Text>
              <Text style={styles.heroText}>تصميم زجاجي حديث يعتمد على أخضر الشعار وذهبه فقط، بواجهة عربية مريحة وواضحة.</Text>
            </View>
            <View style={styles.heroIconCluster}>
              <View style={[styles.miniIcon, { backgroundColor: Colors.primary + "14" }]}><Ionicons name="airplane" size={20} color={Colors.primary} /></View>
              <View style={[styles.miniIcon, { backgroundColor: Colors.accent + "18" }]}><Ionicons name="cube" size={20} color={Colors.accentDeep} /></View>
              <View style={[styles.miniIcon, { backgroundColor: Colors.primary + "14" }]}><Ionicons name="bag" size={20} color={Colors.primary} /></View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(170).springify()} style={styles.statsRow}>
            <View style={styles.statCard}><Text style={styles.statNum}>آمن</Text><Text style={styles.statText}>تجربة موثوقة</Text></View>
            <View style={styles.statCard}><Text style={[styles.statNum, { color: Colors.accentDeep }]}>محلي</Text><Text style={styles.statText}>قريب من الناس</Text></View>
            <View style={styles.statCard}><Text style={styles.statNum}>شامل</Text><Text style={styles.statText}>كل الخدمات</Text></View>
          </Animated.View>
        </View>

        <View style={styles.body}>
          <Animated.View entering={FadeInDown.delay(130).springify()} style={styles.greetingCard}>
            <LinearGradient colors={Colors.gradients.glass} style={StyleSheet.absoluteFill} />
            <View style={styles.avatar}><Text style={styles.avatarText}>ع</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{greeting()}، عاصم</Text>
              <Text style={styles.dateText}>{date}</Text>
            </View>
            <View style={styles.onlineBadge}><Text style={styles.onlineText}>جاهز</Text></View>
          </Animated.View>

          <View style={styles.highlightCard}>
            <LinearGradient colors={[Colors.primary + "10", Colors.accent + "12"]} style={StyleSheet.absoluteFill} />
            <View style={styles.highlightIcon}><Ionicons name="sparkles" size={20} color={Colors.accentDeep} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.highlightTitle}>هوية موحدة من الشعار</Text>
              <Text style={styles.highlightText}>تم اعتماد الأخضر والذهبي فقط مع بطاقات زجاجية، حواف ناعمة، ومساحات بيضاء احترافية.</Text>
            </View>
          </View>

          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>الخدمات</Text>
              <Text style={styles.sectionSub}>ألوان موحدة · واجهة زجاجية · تجربة أسرع</Text>
            </View>
            <View style={styles.sectionMark} />
          </View>

          <View style={styles.grid}>
            {SERVICES.map((item, index) => <ServiceCard key={item.id} item={item} index={index} />)}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hero: { paddingHorizontal: 18, paddingBottom: 22, overflow: "hidden" },
  heroGlowGreen: { position: "absolute", width: 210, height: 210, borderRadius: 120, backgroundColor: Colors.primary + "16", top: 12, right: -70 },
  heroGlowGold: { position: "absolute", width: 180, height: 180, borderRadius: 100, backgroundColor: Colors.accent + "18", bottom: -50, left: -60 },
  topRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  logoShell: { width: 54, height: 54, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.88)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.borderSubtle, shadowColor: Colors.primary, shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  logo: { width: 44, height: 44, borderRadius: 15 },
  eyebrow: { fontFamily: "Cairo_600SemiBold", color: Colors.primary, fontSize: 11, textAlign: "right", marginBottom: 2 },
  title: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 24, textAlign: "right" },
  subtitle: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 12, textAlign: "right", marginTop: 2 },
  roundBtn: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.74)", borderWidth: 1, borderColor: Colors.borderSubtle },
  heroCard: { marginTop: 22, borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, padding: 18, flexDirection: "row-reverse", alignItems: "center", gap: 14, shadowColor: Colors.primary, shadowOpacity: 0.10, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 3 },
  heroTextBlock: { flex: 1 },
  heroTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 19, lineHeight: 30, textAlign: "right" },
  heroText: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 12, lineHeight: 21, textAlign: "right", marginTop: 6 },
  heroIconCluster: { gap: 8 },
  miniIcon: { width: 45, height: 45, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.borderSubtle },
  statsRow: { flexDirection: "row-reverse", gap: 10, marginTop: 14 },
  statCard: { flex: 1, minHeight: 72, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.68)", borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  statNum: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 17 },
  statText: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 10.5, marginTop: 2 },
  body: { padding: 16, paddingTop: 8 },
  greetingCard: { borderRadius: 24, minHeight: 76, overflow: "hidden", backgroundColor: Colors.glassCard, borderWidth: 1, borderColor: Colors.borderSubtle, flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, marginBottom: 14 },
  avatar: { width: 48, height: 48, borderRadius: 17, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.primary + "30" },
  avatarText: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 18 },
  greeting: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right", fontSize: 15 },
  dateText: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "right", fontSize: 11, marginTop: 3 },
  onlineBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30" },
  onlineText: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 10 },
  highlightCard: { borderRadius: 24, overflow: "hidden", backgroundColor: Colors.glassCard, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, marginBottom: 16, flexDirection: "row-reverse", gap: 12, alignItems: "center" },
  highlightIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: Colors.accent + "18", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.accent + "30" },
  highlightTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 15, textAlign: "right" },
  highlightText: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 12, textAlign: "right", lineHeight: 21, marginTop: 3 },
  sectionHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 19, textAlign: "right" },
  sectionSub: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 11, textAlign: "right", marginTop: 2 },
  sectionMark: { width: 42, height: 5, borderRadius: 999, backgroundColor: Colors.accent },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  cardWrap: { width: "31.5%" },
  serviceCard: { minHeight: 122, borderRadius: 22, overflow: "hidden", backgroundColor: Colors.glassCard, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 10, alignItems: "center", justifyContent: "center" },
  iconBox: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 8 },
  serviceLabel: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "center", fontSize: 11, lineHeight: 16 },
  serviceSub: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", fontSize: 9, lineHeight: 13, marginTop: 4 },
  badge: { position: "absolute", top: 6, right: 6, borderWidth: 1, borderRadius: 9, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 8 },
  bottomLine: { position: "absolute", bottom: 0, left: 12, right: 12, height: 2, borderRadius: 3, opacity: 0.9 },
});
