import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";

const LOGO = require("@/assets/images/logo.png");

type Service = {
  id: string;
  label: string;
  sub: string;
  icon: any;
  iconType: "ionicons" | "material";
  color: string;
  route: any;
  badge?: string;
};

const SERVICES: Service[] = [
  { id: "medical", label: "الدليل الطبي", sub: "صيدليات · مستشفيات · عيادات", icon: "medkit", iconType: "ionicons", color: "#6CA6A6", route: "/(tabs)/medical" },
  { id: "missing", label: "مفقودات", sub: "أعلن عن غرض مفقود أو موجود", icon: "search", iconType: "ionicons", color: "#D49A2A", route: "/(tabs)/missing" },
  { id: "student", label: "الخدمات الطلابية", sub: "مدارس · معاهد · التعليم", icon: "school", iconType: "ionicons", color: "#9AA7A0", route: "/(tabs)/student" },
  { id: "restaurants", label: "المطاعم والكافتريات", sub: "منيو مصور · سلة · كاشير · فواتير", icon: "restaurant-outline", iconType: "ionicons", color: "#D49A2A", route: "/(tabs)/restaurants", badge: "جديد" },
  { id: "market", label: "السوق", sub: "الأسر المنتجة · دلالة وأدوات", icon: "storefront", iconType: "ionicons", color: "#1FA971", route: "/(tabs)/market" },
  { id: "product-showcase", label: "سوق المتاجر", sub: "ملابس · عطور · أحذية · بوتيكات", icon: "storefront-outline", iconType: "ionicons", color: "#14B8A6", route: "/(tabs)/product-showcase", badge: "جديد" },
  { id: "jobs", label: "وظائف", sub: "وظائف وفرص عمل محلية", icon: "briefcase", iconType: "ionicons", color: "#1FA971", route: "/(tabs)/jobs" },
  { id: "women", label: "قسم المرأة", sub: "متاجر وخدمات نسائية", icon: "face-woman", iconType: "material", color: "#1FA971", route: "/(tabs)/women" },
  { id: "social", label: "المجتمع", sub: "منشورات · صور متعددة · تعليقات", icon: "chatbubbles", iconType: "ionicons", color: "#6CA6A6", route: "/(tabs)/social" },
  { id: "sports", label: "النشاط الرياضي", sub: "الأندية · الفعاليات · البطولات", icon: "football", iconType: "ionicons", color: "#1FA971", route: "/(tabs)/sports" },
  { id: "culture", label: "النشاط الثقافي", sub: "معارض · فعاليات · مراكز", icon: "palette", iconType: "material", color: "#9AA7A0", route: "/(tabs)/culture" },
  { id: "orgs", label: "المنظمات", sub: "جمعيات خيرية · مبادرات مجتمعية", icon: "hand-heart", iconType: "material", color: "#1FA971", route: "/(tabs)/orgs" },
  { id: "transport", label: "مشاويرك علينا", sub: "طلبات مباشرة للسائقين", icon: "car-side", iconType: "material", color: "#D49A2A", route: "/(tabs)/transport" },
  { id: "cv-builder", label: "منشئ السيرة الذاتية", sub: "قوالب مجانية · صورة · ألوان · PDF", icon: "document-text-outline", iconType: "ionicons", color: "#6CA6A6", route: "/(tabs)/cv-builder", badge: "جديد" },
  { id: "calendar", label: "التقويم", sub: "أعياد ومناسبات", icon: "calendar", iconType: "ionicons", color: "#D49A2A", route: "/(tabs)/calendar" },
  { id: "appointments", label: "المواعيد", sub: "حجز وتنبيهات", icon: "calendar-check-outline", iconType: "material", color: "#6CA6A6", route: "/(tabs)/appointments" },
  { id: "reports", label: "التبليغ السريع", sub: "مياه · كهرباء · بيئة", icon: "megaphone", iconType: "ionicons", color: "#C96F6F", route: "/(tabs)/reports" },
  { id: "numbers", label: "أرقام مهمة", sub: "طوارئ وخدمات", icon: "call", iconType: "ionicons", color: "#6CA6A6", route: "/(tabs)/numbers" },
  { id: "telecom", label: "الاتصالات", sub: "MTN · Zain · Sudani", icon: "cellular", iconType: "ionicons", color: "#6CA6A6", route: "/(tabs)/telecom" },
  { id: "travel", label: "السفر والرحلات", sub: "وكالات · حجوزات · تذاكر", icon: "airplane", iconType: "ionicons", color: "#D49A2A", route: "/(tabs)/travel" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 18) return "مساء الخير";
  return "مساء النور";
}

function ServiceCard({ item, index }: { item: Service; index: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(90 + index * 28).springify()} style={styles.cardWrap}>
      <AnimatedPress onPress={() => router.push(item.route)}>
        <View style={styles.serviceCard}>
          <LinearGradient colors={[item.color + "20", "rgba(255,255,255,0.035)"]} style={StyleSheet.absoluteFill} />
          <View style={[styles.iconBox, { borderColor: item.color + "50", backgroundColor: item.color + "16" }]}>
            {item.iconType === "ionicons"
              ? <Ionicons name={item.icon} size={22} color={item.color} />
              : <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />}
          </View>
          <Text style={styles.serviceLabel} numberOfLines={2}>{item.label}</Text>
          <Text style={styles.serviceSub} numberOfLines={3}>{item.sub}</Text>
          {item.badge ? <View style={[styles.badge, { borderColor: item.color + "55" }]}><Text style={[styles.badgeText, { color: item.color }]}>{item.badge}</Text></View> : null}
          <View style={[styles.bottomLine, { backgroundColor: item.color }]} />
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <LinearGradient colors={["#10261B", "#08110D", "#050A08"]} style={[styles.hero, { paddingTop: topPad }]}> 
          <Animated.View entering={FadeIn.duration(500)} style={styles.topRow}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>حصاحيصاوي</Text>
              <Text style={styles.subtitle}>لخدمة مواطن المنطقة وقراها</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/(tabs)/settings" as any)} style={styles.roundBtn}>
              <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.statsRow}>
            <View style={styles.statCard}><Text style={styles.statNum}>١٢+</Text><Text style={styles.statText}>طبية</Text></View>
            <View style={styles.statCard}><Text style={[styles.statNum, { color: Colors.accent }]}>٤٨+</Text><Text style={styles.statText}>وظيفة</Text></View>
            <View style={styles.statCard}><Text style={[styles.statNum, { color: Colors.primary }]}>٢٠+</Text><Text style={styles.statText}>خدمة</Text></View>
          </Animated.View>
        </LinearGradient>

        <View style={styles.body}>
          <Animated.View entering={FadeInDown.delay(130).springify()} style={styles.greetingCard}>
            <LinearGradient colors={[Colors.primary + "18", "rgba(255,255,255,0.04)"]} style={StyleSheet.absoluteFill} />
            <View style={styles.avatar}><Text style={styles.avatarText}>A</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{greeting()}، Asim</Text>
              <Text style={styles.dateText}>{date}</Text>
            </View>
            <View style={styles.onlineBadge}><Text style={styles.onlineText}>متصل</Text></View>
          </Animated.View>

          <View style={styles.highlightCard}>
            <Text style={styles.highlightTitle}>آخر الإضافات</Text>
            <Text style={styles.highlightText}>قوالب CV مجانية، كاشير المطاعم، سوق المتاجر، صور اجتماعية متعددة، وتنبيهات الإدارة.</Text>
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>الخدمات</Text>
            <View style={styles.sectionDot} />
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
  hero: { paddingHorizontal: 18, paddingBottom: 22, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: "hidden" },
  topRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  logo: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#fff" },
  title: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 22, textAlign: "right" },
  subtitle: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 12, textAlign: "right", marginTop: 2 },
  roundBtn: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: Colors.glassCard, borderWidth: 1, borderColor: Colors.borderSubtle },
  statsRow: { flexDirection: "row-reverse", gap: 10, marginTop: 26 },
  statCard: { flex: 1, minHeight: 74, borderRadius: 18, backgroundColor: Colors.glassCard, borderWidth: 1, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  statNum: { fontFamily: "Cairo_700Bold", color: "#6CA6A6", fontSize: 20 },
  statText: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  body: { padding: 16 },
  greetingCard: { borderRadius: 22, minHeight: 76, overflow: "hidden", backgroundColor: Colors.glassCard, borderWidth: 1, borderColor: Colors.borderSubtle, flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, marginBottom: 14 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.primary + "45" },
  avatarText: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 18 },
  greeting: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right", fontSize: 15 },
  dateText: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "right", fontSize: 11, marginTop: 3 },
  onlineBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: Colors.primary + "18", borderWidth: 1, borderColor: Colors.primary + "45" },
  onlineText: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 10 },
  highlightCard: { borderRadius: 20, backgroundColor: Colors.glassCard, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 14, marginBottom: 16 },
  highlightTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 15, textAlign: "right" },
  highlightText: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 12, textAlign: "right", lineHeight: 21, marginTop: 5 },
  sectionHead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 18, textAlign: "right" },
  sectionDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  cardWrap: { width: "31.5%" },
  serviceCard: { minHeight: 112, borderRadius: 18, overflow: "hidden", backgroundColor: Colors.glassCard, borderWidth: 1, borderColor: Colors.borderSubtle, padding: 10, alignItems: "center" },
  iconBox: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 8 },
  serviceLabel: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "center", fontSize: 11, lineHeight: 16 },
  serviceSub: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "center", fontSize: 9, lineHeight: 13, marginTop: 4 },
  badge: { position: "absolute", top: 6, right: 6, borderWidth: 1, backgroundColor: "rgba(0,0,0,0.24)", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 8 },
  bottomLine: { position: "absolute", bottom: 0, left: 8, right: 8, height: 2, borderRadius: 3, opacity: 0.85 },
});
