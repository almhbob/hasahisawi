import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  ImageBackground,
  Dimensions,
  Image,
  Linking,
  TouchableOpacity,
  Alert,
  FlatList,
} from "react-native";
import Animated, {
  FadeInDown, FadeIn, FadeInUp, FadeInRight,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/feature-flags-context";
import type { RideStatus } from "@/lib/feature-flags-context";
import { getApiUrl } from "@/lib/query-client";
import AuthModal from "@/components/AuthModal";
import AnimatedPress from "@/components/AnimatedPress";
import BrandPattern from "@/components/BrandPattern";
import HonorCard, { HonoredFigure } from "@/components/HonorCard";
import { useLang } from "@/lib/lang-context";
import { getBiometricLabel, getBiometricIcon } from "@/lib/biometrics";

const { width } = Dimensions.get("window");
const LOGO         = require("@/assets/images/logo.png");
const CITY_IMAGE   = require("@/assets/images/hasahisa-city.jpg");
const FERRIS_WHEEL = require("@/assets/images/ferris-wheel.jpg");

type ApiLandmark = { id: number; name: string; sub: string; image_url: string };

const LOCAL_IMAGES: Record<string, any> = {
  "local:ferris-wheel":  FERRIS_WHEEL,
  "local:hasahisa-city": CITY_IMAGE,
};

function resolveLandmarkImage(url: string) {
  if (LOCAL_IMAGES[url]) return LOCAL_IMAGES[url];
  return { uri: url };
}

const FALLBACK_LANDMARKS: ApiLandmark[] = [
  { id: -1, image_url: "local:ferris-wheel",  name: "عجلة الهواء",  sub: "كورنيش الحصاحيصا" },
  { id: -2, image_url: "local:hasahisa-city", name: "كورنيش النيل", sub: "إطلالة على النيل الأزرق" },
];

type ServiceItem = {
  id: string; label: string; sub: string; icon: any;
  color: string; bg: string; route: any; iconType: "ionicons" | "material";
  soon?: boolean;
  rideStatus?: RideStatus;
};

const RIDE_BADGE: Record<RideStatus, { label: string; color: string; bg: string; icon: string }> = {
  soon:        { label: "قريباً",  color: "#FBBF24", bg: "#FBBF2420", icon: "clock-fast" },
  maintenance: { label: "صيانة",   color: "#F87171", bg: "#F8717120", icon: "wrench" },
  available:   { label: "متاح",    color: "#3EFF9C", bg: "#3EFF9C20", icon: "check-circle" },
};

function ServiceGridItem({
  item, onPress, index,
}: { item: ServiceItem; onPress: () => void; index: number }) {
  const badge = item.rideStatus ? RIDE_BADGE[item.rideStatus] : null;
  const isAvailable = item.rideStatus === "available";
  const isSoonOrMaint = badge && !isAvailable;

  return (
    <Animated.View
      entering={FadeInDown.delay(180 + index * 45).springify().damping(16)}
      style={styles.gridItemContainer}
    >
      <AnimatedPress onPress={onPress}>
        <View style={[styles.gridItem, (item.soon || isSoonOrMaint) && { opacity: 0.88 }]}>
          {/* توهج خلفي للبطاقة */}
          <View style={[styles.gridGlow, { backgroundColor: item.color + "12" }]} />
          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "18", borderColor: item.color + "40" }]}>
            {item.iconType === "ionicons"
              ? <Ionicons name={item.icon} size={22} color={item.color} />
              : <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />}
          </View>
          <Text style={styles.gridLabel} numberOfLines={1}>{item.label}</Text>
          <Text style={styles.gridSub} numberOfLines={1}>{item.sub}</Text>
          {/* شارة ديناميكية لمشوارك علينا */}
          {badge && (
            <View style={[styles.soonBadge, { backgroundColor: badge.bg }]}>
              <MaterialCommunityIcons name={badge.icon as any} size={9} color={badge.color} />
              <Text style={[styles.soonBadgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          )}
          {/* شارة قريباً العادية لغير مشوارك */}
          {item.soon && !item.rideStatus && (
            <View style={styles.soonBadge}>
              <MaterialCommunityIcons name="clock-fast" size={9} color="#FBBF24" />
              <Text style={styles.soonBadgeText}>قريباً</Text>
            </View>
          )}
          {/* حد نيوني سفلي */}
          <View style={[styles.gridBottomLine, { backgroundColor: item.color + "80" }]} />
        </View>
      </AnimatedPress>
    </Animated.View>
  );
}

function getGreeting(): { ar: string; en: string } {
  const h = new Date().getHours();
  if (h < 5)  return { ar: "تصبح على خير", en: "Good Night" };
  if (h < 12) return { ar: "صباح الخير", en: "Good Morning" };
  if (h < 17) return { ar: "مساء الخير", en: "Good Afternoon" };
  if (h < 21) return { ar: "مساء النور", en: "Good Evening" };
  return { ar: "تصبح على خير", en: "Good Night" };
}

function getArabicDate(): string {
  const now = new Date();
  const dayNames = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
  const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  return `${dayNames[now.getDay()]} · ${now.getDate()} ${monthNames[now.getMonth()]}`;
}

export default function HomeScreen() {
  const { t, isRTL, lang, tr } = useLang();
  const insets  = useSafeAreaInsets();
  const topPad  = Platform.OS === "web" ? 67 : insets.top;
  const auth    = useAuth();
  const { gov_services_enabled, gov_appointments_enabled, gov_reports_enabled, ride_status } = useFeatureFlags();
  const [showAuth, setShowAuth] = useState(false);
  const [bioLabel, setBioLabel] = useState("البصمة");
  const [bioIcon, setBioIcon]   = useState<keyof typeof Ionicons.glyphMap>("finger-print-outline");
  const [landmarks, setLandmarks] = useState<ApiLandmark[]>(FALLBACK_LANDMARKS);
  const [featuredAd, setFeaturedAd] = useState<{ institution_name: string; title: string; description?: string; type: string } | null>(null);
  const [honoredFigure, setHonoredFigure] = useState<HonoredFigure | null>(null);
  const greeting = useMemo(() => getGreeting(), []);
  const arabicDate = useMemo(() => getArabicDate(), []);

  useEffect(() => {
    (async () => {
      setBioLabel(await getBiometricLabel());
      setBioIcon(await getBiometricIcon() as keyof typeof Ionicons.glyphMap);
    })();
  }, []);

  useEffect(() => {
    const base = getApiUrl();
    if (!base) return;
    fetch(new URL("/api/landmarks", base).toString())
      .then(r => r.ok ? r.json() : null)
      .then((data: ApiLandmark[] | null) => {
        if (Array.isArray(data) && data.length > 0) setLandmarks(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const base = getApiUrl();
    if (!base) return;
    fetch(new URL("/api/ads", base).toString())
      .then(r => r.ok ? r.json() : null)
      .then((data: any[] | null) => {
        if (Array.isArray(data) && data.length > 0) setFeaturedAd(data[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const base = getApiUrl();
    if (!base) return;
    fetch(new URL("/api/honored-figure", base).toString())
      .then(r => r.ok ? r.json() : null)
      .then((data: HonoredFigure | null) => {
        if (data && data.id) setHonoredFigure(data);
      })
      .catch(() => {});
  }, []);

  const SERVICES = useMemo(() => [
    { id: "medical",   label: t('home','medical').label,         sub: t('home','medical').sub,         icon: "medkit",            iconType: "ionicons"  as const, color: "#3E9CBF", bg: "#3E9CBF20", route: "/(tabs)/medical"   as const },
    { id: "lost",      label: t('home','lost').label,            sub: t('home','lost').sub,             icon: "search",            iconType: "ionicons"  as const, color: Colors.accent, bg: Colors.accent+"20", route: "/(tabs)/missing"   as const },
    { id: "student",   label: t('home','student').label,         sub: t('home','student').sub,          icon: "school",            iconType: "ionicons"  as const, color: "#A855F7", bg: "#A855F720", route: "/(tabs)/student"   as const },
    { id: "jobs",      label: t('home','jobsService').label,     sub: t('home','jobsService').sub,      icon: "briefcase",         iconType: "ionicons"  as const, color: Colors.primary, bg: Colors.primary+"20", route: "/(tabs)/jobs"   as const },
    { id: "market",    label: t('home','marketService').label,   sub: t('home','marketService').sub,    icon: "storefront",        iconType: "ionicons"  as const, color: "#FF6B35", bg: "#FF6B3520", route: "/(tabs)/market"    as const },
    { id: "sports",    label: t('home','sports').label,          sub: t('home','sports').sub,           icon: "football",          iconType: "ionicons"  as const, color: "#27AE68", bg: "#27AE6820", route: "/(tabs)/sports"    as const },
    { id: "culture",   label: t('home','culture').label,         sub: t('home','culture').sub,          icon: "palette",           iconType: "material"  as const, color: "#FF4FA3", bg: "#FF4FA320", route: "/(tabs)/culture"   as const },
    { id: "social",    label: t('home','social').label,          sub: t('home','social').sub,           icon: "chatbubbles",       iconType: "ionicons"  as const, color: "#3E9CBF", bg: "#3E9CBF20", route: "/(tabs)/social"    as const },
    { id: "calendar",  label: t('home','calendarService').label, sub: t('home','calendarService').sub,  icon: "calendar",          iconType: "ionicons"  as const, color: Colors.accent, bg: Colors.accent+"20", route: "/(tabs)/calendar"  as const },
    { id: "women",     label: t('home','womenService').label,    sub: t('home','womenService').sub,     icon: "face-woman",        iconType: "material"  as const, color: "#FF4FA3", bg: "#FF4FA320", route: "/(tabs)/women"     as const },
    { id: "orgs",        label: t('home','orgsService').label,     sub: t('home','orgsService').sub,      icon: "hand-heart",        iconType: "material"  as const, color: "#A855F7", bg: "#A855F720", route: "/(tabs)/orgs"         as const },
    { id: "communities", label: "الجاليات",                          sub: "مجتمعات المنطقة",                 icon: "earth",             iconType: "ionicons"  as const, color: Colors.cyber, bg: Colors.cyber+"20", route: "/(tabs)/communities"  as const },
    { id: "appointments",label: "حجز المواعيد",                    sub: "صحي وحكومي",                     icon: "calendar",          iconType: "ionicons"  as const, color: Colors.accent,  bg: Colors.accent+"20",    route: "/(tabs)/appointments" as const },
    { id: "reports",   label: "التبليغ السريع",                   sub: "مياه · كهرباء · بيئة",           icon: "megaphone",         iconType: "ionicons"  as const, color: Colors.danger,  bg: Colors.danger+"20",    route: "/(tabs)/reports"      as const },
    { id: "numbers",   label: "أرقام مهمة",                       sub: "طوارئ وخدمات",                   icon: "call",              iconType: "ionicons"  as const, color: "#3E9CBF",  bg: "#3E9CBF20",    route: "/(tabs)/numbers"      as const },
    { id: "transport", label: "مشاويرك علينا وخدمات التوصيل",      sub: "سيارات · ركشات · طلبات",         icon: "car-side",          iconType: "material"  as const, color: "#F97316",  bg: "#F9731620",    route: "/(tabs)/transport"    as const, rideStatus: ride_status },
  ], [lang]);

  const handlePress = (route: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      <BrandPattern variant="diagonal" opacity={0.03} />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 100 : 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ═══ HERO ═══ */}
      <ImageBackground
        source={FERRIS_WHEEL}
        style={[styles.hero, { paddingTop: topPad }]}
        imageStyle={styles.heroImage}
      >
        {/* طبقة التدرج الثلاثية المستقبلية */}
        <LinearGradient
          colors={[
            "rgba(4,13,24,0.15)",
            "rgba(0,214,143,0.08)",
            "rgba(4,13,24,0.7)",
            "rgba(4,13,24,0.98)",
          ]}
          locations={[0, 0.3, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* شريط علوي: الشعار + اسم التطبيق */}
        <Animated.View
          entering={FadeIn.delay(80).duration(700)}
          style={[styles.topBar, { flexDirection: isRTL ? "row-reverse" : "row" }]}
        >
          {/* الشعار */}
          <View style={styles.logoWrap}>
            <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            <LinearGradient
              colors={["transparent", Colors.primary + "20"]}
              style={StyleSheet.absoluteFill}
            />
          </View>
          {/* العنوان */}
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text style={[styles.appTitle, { textAlign: isRTL ? "right" : "left" }]}>
              حصاحيصاوي
            </Text>
            <Text style={[styles.appSubtitle, { textAlign: isRTL ? "right" : "left" }]}>
              {t('home','appSubtitle')}
            </Text>
          </View>
          {/* أيقونة الإشعارات */}
          <AnimatedPress onPress={() => handlePress("/(tabs)/settings")}>
            <View style={styles.topBarIcon}>
              <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
              <View style={styles.notifDot} />
            </View>
          </AnimatedPress>
        </Animated.View>

        {/* الحد النيوني */}
        <View style={styles.heroDivider} />

        {/* إحصائيات المدينة */}
        <Animated.View
          entering={FadeInUp.delay(250).springify().damping(14)}
          style={[styles.statsRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}
        >
          {[
            { num: "١٢+", label: t('home','pharmacies'), icon: "medkit-outline",    color: "#3E9CBF" },
            { num: "٤٨+", label: t('home','jobs'),       icon: "briefcase-outline", color: Colors.accent },
            { num: "٦",   label: t('home','schools'),    icon: "school-outline",    color: Colors.primary },
          ].map((stat, i) => (
            <Animated.View
              key={i}
              entering={FadeInUp.delay(300 + i * 80).springify()}
              style={styles.statCard}
            >
              <LinearGradient
                colors={[stat.color + "18", stat.color + "06"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.statIcon, { borderColor: stat.color + "40" }]}>
                <Ionicons name={stat.icon as any} size={16} color={stat.color} />
              </View>
              <Text style={[styles.statNum, { color: stat.color }]}>{stat.num}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <View style={[styles.statGlowLine, { backgroundColor: stat.color }]} />
            </Animated.View>
          ))}
        </Animated.View>
      </ImageBackground>

      {/* ═══ BODY ═══ */}
      <View style={styles.body}>

        {/* ═══ بطاقة التحية الشخصية ═══ */}
        <Animated.View entering={FadeInDown.delay(100).springify().damping(18)} style={styles.greetingCard}>
          <LinearGradient
            colors={[Colors.primary + "14", Colors.cardBg]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.greetingLeft, { alignSelf: "flex-end" }]}>
            <Text style={styles.greetingText}>
              {lang === "ar" ? greeting.ar : greeting.en}
              {auth.user && !auth.isGuest ? `، ${auth.user.name.split(" ")[0]}` : ""}
            </Text>
            <Text style={styles.greetingDate}>{arabicDate}</Text>
          </View>
          <View style={styles.greetingRight}>
            <View style={styles.greetingIconWrap}>
              {auth.user && !auth.isGuest ? (
                <Text style={styles.greetingInitial}>
                  {auth.user.name?.charAt(0) || "؟"}
                </Text>
              ) : (
                <Ionicons name="person-outline" size={22} color={Colors.primary} />
              )}
            </View>
            {auth.user?.role === "admin" && (
              <View style={styles.roleBadge}>
                <Ionicons name="shield-checkmark" size={10} color="#000" />
                <Text style={styles.roleBadgeText}>مشرف</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* لافتة وضع الزائر */}
        {auth.isGuest && (
          <Animated.View entering={FadeInDown.delay(100).springify()} style={{ paddingHorizontal: 16, marginBottom: 4 }}>
            <LinearGradient
              colors={[Colors.accent + "22", Colors.accent + "10"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.accent + "35", flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent + "25", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person-outline" size={18} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.accent, textAlign: "right" }}>
                  {tr("أنت تتصفح كزائر", "You're browsing as Guest")}
                </Text>
                <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" }}>
                  {tr("سجّل للاستمتاع بكل خدمات التطبيق", "Register to unlock all app features")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={async () => { await auth.logout(); }}
                style={{ backgroundColor: Colors.accent, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 }}
              >
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: "#000" }}>
                  {tr("سجّل", "Register")}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          </Animated.View>
        )}

        {/* ═══ قاعة التكريم ═══ */}
        {honoredFigure && (
          <Animated.View entering={FadeInDown.delay(105).springify()} style={styles.honorSection}>
            {/* Header */}
            <View style={styles.honorHeader}>
              <View style={styles.honorDotGroup}>
                <View style={[styles.honorDot, { backgroundColor: "#D4AF37" }]} />
                <View style={[styles.honorDot, { width: 5, height: 5, backgroundColor: "#D4AF3770" }]} />
              </View>
              <View style={styles.honorTitleRow}>
                <Ionicons name="trophy" size={15} color="#D4AF37" />
                <Text style={styles.honorTitle}>قاعة التكريم</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push("/(tabs)/honored" as any)}
                style={styles.honorSeeAll}
                activeOpacity={0.7}
              >
                <Text style={styles.honorSeeAllText}>عرض الكل</Text>
                <Ionicons name="chevron-back" size={13} color="#D4AF37" />
              </TouchableOpacity>
            </View>
            <HonorCard figure={honoredFigure} />
          </Animated.View>
        )}

        {/* ═══ معالم المدينة ═══ */}
        <Animated.View entering={FadeInDown.delay(110).springify()} style={styles.landmarksSection}>
          <View style={styles.landmarksHeader}>
            <View style={[styles.landmarksDot, { backgroundColor: Colors.primary }]} />
            <Text style={styles.landmarksTitle}>معالم المدينة</Text>
            <View style={[styles.landmarksDot, { backgroundColor: Colors.accent }]} />
          </View>
          <FlatList
            data={landmarks}
            keyExtractor={item => String(item.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToAlignment="center"
            decelerationRate="fast"
            snapToInterval={width - 48}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInRight.delay(150 + index * 80).springify().damping(14)}
                style={[styles.landmarkCard, { width: width - 64 }]}
              >
                <ImageBackground
                  source={resolveLandmarkImage(item.image_url)}
                  style={styles.landmarkImage}
                  imageStyle={{ borderRadius: 18 }}
                >
                  <LinearGradient
                    colors={["transparent", "rgba(4,13,24,0.78)", "rgba(4,13,24,0.96)"]}
                    locations={[0.35, 0.72, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.landmarkInfo}>
                    <View style={[styles.landmarkBadge, { backgroundColor: Colors.primary + "30", borderColor: Colors.primary + "60" }]}>
                      <Ionicons name="location-outline" size={12} color={Colors.primary} />
                      <Text style={[styles.landmarkBadgeText, { color: Colors.primary }]}>معلم بارز</Text>
                    </View>
                    <Text style={styles.landmarkName}>{item.name}</Text>
                    <Text style={styles.landmarkSub}>{item.sub}</Text>
                  </View>
                  <View style={[styles.landmarkGlow, { backgroundColor: Colors.primary }]} />
                </ImageBackground>
              </Animated.View>
            )}
          />
        </Animated.View>

        {/* بانرات الخدمات السريعة */}
        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.quickBannersRow}>
          {/* حجز المواعيد */}
          <AnimatedPress style={{ flex: 1 }} onPress={() => handlePress("/(tabs)/appointments")}>
            <LinearGradient
              colors={[Colors.accent + "22", Colors.primary + "18"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.quickBanner, { borderColor: Colors.accent + "40" }]}
            >
              <View style={[styles.quickBannerIcon, { backgroundColor: Colors.accent + "20", borderColor: Colors.accent + "40" }]}>
                <Ionicons name="calendar" size={22} color={Colors.accent} />
              </View>
              <Text style={styles.quickBannerTitle}>حجز موعد</Text>
              <Text style={styles.quickBannerSub}>{gov_appointments_enabled ? "صحي · حكومي" : "خدمات صحية"}</Text>
            </LinearGradient>
          </AnimatedPress>

          {/* التبليغ السريع */}
          <AnimatedPress style={{ flex: 1 }} onPress={() => handlePress("/(tabs)/reports")}>
            <LinearGradient
              colors={[Colors.danger + "22", Colors.danger + "08"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.quickBanner, { borderColor: Colors.danger + "40" }]}
            >
              <View style={[styles.quickBannerIcon, { backgroundColor: Colors.danger + "20", borderColor: Colors.danger + "40" }]}>
                <Ionicons name="megaphone" size={22} color={Colors.danger} />
              </View>
              <Text style={styles.quickBannerTitle}>بلّغ عن مشكلة</Text>
              <Text style={styles.quickBannerSub}>مياه · كهرباء · طرق</Text>
            </LinearGradient>
          </AnimatedPress>
        </Animated.View>

        {/* ── بانر الإعلان المميز ── */}
        {featuredAd && (
          <Animated.View entering={FadeInDown.delay(120).springify()}>
            <TouchableOpacity
              style={styles.featuredAdBanner}
              onPress={() => router.push("/(tabs)/ads" as any)}
              activeOpacity={0.85}
            >
              <View style={styles.featuredAdLeft}>
                <View style={styles.featuredAdIcon}>
                  <Ionicons name="megaphone" size={16} color={Colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featuredAdInstitution} numberOfLines={1}>{featuredAd.institution_name}</Text>
                  <Text style={styles.featuredAdTitle} numberOfLines={1}>{featuredAd.title}</Text>
                </View>
              </View>
              <View style={styles.featuredAdChip}>
                <Text style={styles.featuredAdChipText}>إعلان</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* عنوان قسم الخدمات */}
        <Animated.View entering={FadeInRight.delay(150).springify()} style={[styles.sectionHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <LinearGradient
            colors={[Colors.primary, Colors.accent]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.sectionAccentBar}
          />
          <Text style={styles.sectionTitle}>{t('home','services')}</Text>
          <View style={styles.sectionLine} />
          <View style={[styles.sectionDot, { backgroundColor: Colors.accent }]} />
        </Animated.View>

        {/* شبكة الخدمات */}
        <View style={styles.gridContainer}>
          {SERVICES.filter(item =>
            item.id !== "women" || auth.user?.gender === "female" || (!auth.user?.gender && !auth.isGuest)
          ).map((item, idx) => (
            <ServiceGridItem key={item.id} item={item} onPress={() => handlePress(item.route)} index={idx} />
          ))}
        </View>

        {/* قسم المستخدم */}
        <View style={styles.footerActions}>
          {auth.user && !auth.isGuest ? (
            <>
              {/* زر البصمة — تفعيل / تعطيل */}
              {auth.biometricsAvailable && (
                <AnimatedPress onPress={() => {
                  if (auth.biometricsEnabled) {
                    Alert.alert(
                      `تعطيل ${bioLabel}`,
                      `هل تريد تعطيل ${bioLabel} لتسجيل الدخول؟`,
                      [
                        { text: "إلغاء", style: "cancel" },
                        { text: "تعطيل", style: "destructive", onPress: () => auth.disableBiometrics() },
                      ],
                    );
                  } else {
                    Alert.alert(
                      `تفعيل ${bioLabel}`,
                      `هل تريد استخدام ${bioLabel} لتسجيل الدخول بسرعة؟`,
                      [
                        { text: "لا شكراً", style: "cancel" },
                        { text: "نعم، فعّل", onPress: () => auth.enableBiometrics(auth.user?.phone || auth.user?.email || "") },
                      ],
                    );
                  }
                }}>
                  <View style={[styles.actionStrip, {
                    borderColor: auth.biometricsEnabled ? Colors.primary + "60" : Colors.divider,
                    marginBottom: 8,
                  }]}>
                    <Ionicons name={bioIcon} size={20} color={auth.biometricsEnabled ? Colors.primary : Colors.textMuted} />
                    <Text style={[styles.actionText, { color: auth.biometricsEnabled ? Colors.primary : Colors.textMuted, flex: 1 }]}>
                      {auth.biometricsEnabled ? `${bioLabel} مفعّلة` : `تفعيل ${bioLabel}`}
                    </Text>
                    <View style={[{
                      width: 36, height: 20, borderRadius: 10, justifyContent: "center",
                      backgroundColor: auth.biometricsEnabled ? Colors.primary : Colors.divider,
                      paddingHorizontal: 2,
                    }]}>
                      <View style={[{
                        width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff",
                        alignSelf: auth.biometricsEnabled ? "flex-end" : "flex-start",
                      }]} />
                    </View>
                  </View>
                </AnimatedPress>
              )}

              <AnimatedPress onPress={() => auth.logout()}>
                <View style={[styles.actionStrip, { borderColor: Colors.danger + "40" }]}>
                  <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
                  <Text style={[styles.actionText, { color: Colors.danger }]}>{t('auth', 'logout')} ({auth.user.name})</Text>
                </View>
              </AnimatedPress>
            </>
          ) : auth.isGuest ? (
            <AnimatedPress onPress={() => { auth.logout(); setShowAuth(true); }}>
              <LinearGradient
                colors={[Colors.accent + "18", Colors.primary + "12"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.actionStrip, { borderColor: Colors.accent + "50" }]}
              >
                <Ionicons name="eye-outline" size={20} color={Colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionText, { color: Colors.accent }]}>أنت تتصفح كزائر</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary }}>اضغط لتسجيل الدخول والنشر</Text>
                </View>
                <Ionicons name="person-circle-outline" size={20} color={Colors.accent} />
              </LinearGradient>
            </AnimatedPress>
          ) : (
            <AnimatedPress onPress={() => setShowAuth(true)}>
              <LinearGradient
                colors={[Colors.primary + "22", Colors.cyber + "12"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.actionStrip, { borderColor: Colors.primary + "50" }]}
              >
                <Ionicons name="person-outline" size={20} color={Colors.primary} />
                <Text style={[styles.actionText, { color: Colors.primary }]}>{t('home', 'login')} / {t('home', 'register')}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary + "80"} />
              </LinearGradient>
            </AnimatedPress>
          )}

          <AnimatedPress onPress={() => handlePress("/(tabs)/settings")}>
            <View style={[styles.actionStrip, { marginTop: 10, borderColor: Colors.violet + "40" }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.violet} />
              <Text style={[styles.actionText, { color: Colors.violet }]}>{t('admin', 'title')}</Text>
            </View>
          </AnimatedPress>
        </View>

        {/* ── بطاقة المطور ── */}
        <Animated.View entering={FadeInDown.delay(400).springify().damping(20)} style={styles.devCardOuter}>
          <LinearGradient
            colors={["#C9A84C", "#F0C040", "#C9A84C", "#8B6914"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.devCardBorder}
          >
            <View style={styles.devCardInner}>

              {/* ── Hero Header ── */}
              <LinearGradient
                colors={["#1A1200", "#0F1E0A", "#0A1210"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.devHero}
              >
                {/* زخارف خلفية */}
                <View style={[styles.devOrb, { top: -30, right: -20, backgroundColor: "#C9A84C18", width: 130, height: 130 }]} />
                <View style={[styles.devOrb, { bottom: -20, left: 10, backgroundColor: Colors.primary + "14", width: 90, height: 90 }]} />
                <View style={[styles.devOrb, { top: 10, left: "40%", backgroundColor: Colors.cyber + "10", width: 60, height: 60 }]} />

                {/* سطر أعلى */}
                <View style={styles.devHeroTop}>
                  <LinearGradient
                    colors={["#C9A84C40", "#C9A84C15"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.devHeroBadge}
                  >
                    <View style={styles.devHeroBadgeDot} />
                    <Text style={styles.devHeroBadgeText}>MOBILE DEVELOPER</Text>
                  </LinearGradient>
                  <View style={styles.devHeroVersion}>
                    <Text style={styles.devHeroVersionText}>حصاحيصاوي v1.0</Text>
                  </View>
                </View>

                {/* الهوية الرئيسية */}
                <View style={styles.devHeroIdentity}>
                  {/* Avatar */}
                  <LinearGradient
                    colors={["#C9A84C", "#F0C040", "#A87820"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.devAvatarRing}
                  >
                    <LinearGradient
                      colors={["#1A1200", "#0F1800"]}
                      style={styles.devAvatarInner}
                    >
                      <Text style={styles.devAvatarLetter}>ع</Text>
                    </LinearGradient>
                  </LinearGradient>

                  {/* Info */}
                  <View style={styles.devHeroInfo}>
                    <Text style={styles.devHeroName}>عاصم عبدالرحمن محمد</Text>
                    <Text style={styles.devHeroTitle}>مطوّر تطبيقات جوّال · محلّل بيانات</Text>
                    <View style={styles.devHeroLocation}>
                      <Ionicons name="location-sharp" size={11} color="#C9A84C" />
                      <Text style={styles.devHeroLocationText}>الحصاحيصا، ولاية الجزيرة</Text>
                    </View>
                  </View>
                </View>

                {/* إحصائيات سريعة */}
                <View style={styles.devStatsRow}>
                  {[
                    { value: "5+",  label: "سنوات خبرة" },
                    { value: "10+", label: "شهادة دولية" },
                    { value: "3+",  label: "تطبيقات" },
                  ].map((s, i) => (
                    <View key={i} style={[styles.devStatItem, i === 1 && styles.devStatItemCenter]}>
                      <Text style={styles.devStatValue}>{s.value}</Text>
                      <Text style={styles.devStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>

              {/* ── Body ── */}
              <View style={styles.devBody}>

                {/* النبذة */}
                <View style={styles.devBioCard}>
                  <View style={styles.devBioAccent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.devBioHeading}>نبذة تعريفية</Text>
                    <Text style={styles.devBioText}>
                      أنا مطوّر تطبيقات جوّال ومحلّل بيانات من مدينة الحصاحيصا، أمتلك خبرةً في بناء تطبيقات React Native وTypeScript وتحليل البيانات والأمن السيبراني. أؤمن بأن التكنولوجيا جسرٌ حقيقي نحو تنمية الأوطان.
                    </Text>
                  </View>
                </View>

                {/* المهارات */}
                <View style={styles.devSkillsSection}>
                  <Text style={styles.devSkillsTitle}>المهارات والتقنيات</Text>
                  <View style={styles.devSkillsGrid}>
                    {[
                      { label: "React Native", color: Colors.cyber,   icon: "phone-portrait-outline" },
                      { label: "TypeScript",   color: "#60A5FA",      icon: "code-slash-outline" },
                      { label: "Data Science", color: "#A78BFA",      icon: "analytics-outline" },
                      { label: "Cybersecurity",color: Colors.danger,  icon: "shield-checkmark-outline" },
                      { label: "Node.js",      color: Colors.primary, icon: "server-outline" },
                      { label: "Cloud DevOps", color: "#6366F1",      icon: "cloud-outline" },
                    ].map(skill => (
                      <View key={skill.label} style={[styles.devSkillChip, { borderColor: skill.color + "40", backgroundColor: skill.color + "10" }]}>
                        <Ionicons name={skill.icon as any} size={12} color={skill.color} />
                        <Text style={[styles.devSkillText, { color: skill.color }]}>{skill.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* الشهادات */}
                <AnimatedPress onPress={() => Linking.openURL("https://www.credly.com/users/asim-abdulrahman")}>
                  <LinearGradient
                    colors={["#C9A84C18", "#C9A84C08"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.devCertCard}
                  >
                    <LinearGradient
                      colors={["#C9A84C", "#F0C040"]}
                      style={styles.devCertIcon}
                    >
                      <Ionicons name="ribbon" size={18} color="#000" />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.devCertTitle}>الشهادات المعتمدة دولياً</Text>
                      <Text style={styles.devCertSub}>Google · IBM · Cisco · Intel · Fortinet</Text>
                    </View>
                    <View style={styles.devCertArrow}>
                      <Ionicons name="chevron-back" size={14} color="#C9A84C" />
                    </View>
                  </LinearGradient>
                </AnimatedPress>

                {/* وسائل التواصل */}
                <Text style={styles.devContactTitle}>وسائل التواصل</Text>
                <View style={styles.devContactGrid}>
                  {[
                    { icon: "logo-whatsapp", color: "#25D366", label: "واتساب",  url: "https://wa.me/966530658285" },
                    { icon: "logo-linkedin", color: "#0A66C2", label: "لينكدإن", url: "https://www.linkedin.com/in/asim-abdulrahman" },
                    { icon: "logo-facebook", color: "#1877F2", label: "فيسبوك",  url: "https://www.facebook.com/almhbob2013" },
                    { icon: "mail",          color: Colors.cyber, label: "الإيميل", url: "mailto:almhbob.iii@gmail.com" },
                  ].map(item => (
                    <AnimatedPress key={item.url} onPress={() => Linking.openURL(item.url)}>
                      <View style={[styles.devContactBtn, { borderColor: item.color + "50", backgroundColor: item.color + "12" }]}>
                        <Ionicons name={item.icon as any} size={18} color={item.color} />
                        <Text style={[styles.devContactBtnText, { color: item.color }]}>{item.label}</Text>
                      </View>
                    </AnimatedPress>
                  ))}
                </View>

                {/* زر عرض الملف */}
                <AnimatedPress onPress={() => router.push("/designer")}>
                  <LinearGradient
                    colors={["#C9A84C", "#F0C040", "#C9A84C"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.devProfileBtn}
                  >
                    <Ionicons name="person-circle" size={18} color="#000" />
                    <Text style={styles.devProfileBtnText}>عرض الملف الكامل</Text>
                    <Ionicons name="arrow-back" size={16} color="#000" />
                  </LinearGradient>
                </AnimatedPress>

                {/* فوتر */}
                <Text style={styles.devFooter}>© 2026 · صُنع بـ ❤️ في الحصاحيصا · السودان</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={{ height: 40 }} />
      </View>

      <AuthModal visible={showAuth} onClose={() => setShowAuth(false)} />
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  /* ══ HERO ══ */
  hero: {
    minHeight: 360,
    justifyContent: "flex-end",
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  heroImage: {
    resizeMode: "cover",
    top: -30,
  },

  /* Top Bar */
  topBar: {
    alignItems: "center",
    marginBottom: 16,
    paddingTop: 8,
  },
  logoWrap: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    borderWidth: 1.5, borderColor: Colors.primary + "60",
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 8,
  },
  logoImg: { width: "100%", height: "100%" },
  appTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 24, color: "#FFFFFF",
    textShadowColor: Colors.primary + "80", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10,
  },
  appSubtitle: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 1,
  },
  topBarIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primary + "18", borderWidth: 1, borderColor: Colors.primary + "40",
    justifyContent: "center", alignItems: "center",
  },
  notifDot: {
    position: "absolute", top: 8, right: 8,
    width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent,
  },

  /* Hero Divider */
  heroDivider: {
    height: 1,
    marginBottom: 16,
    backgroundColor: Colors.primary + "30",
  },

  /* Stats */
  statsRow: { gap: 10 },
  statCard: {
    flex: 1, borderRadius: 16, padding: 12, alignItems: "center",
    borderWidth: 1, borderColor: Colors.divider,
    backgroundColor: Colors.cardBg,
    overflow: "hidden",
  },
  statIcon: {
    width: 32, height: 32, borderRadius: 10,
    borderWidth: 1, justifyContent: "center", alignItems: "center",
    marginBottom: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  statNum: {
    fontFamily: "Cairo_700Bold", fontSize: 22,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  statLabel: {
    fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 1,
  },
  statGlowLine: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 2, opacity: 0.7,
  },

  /* ══ BODY ══ */
  body: { paddingHorizontal: 16, paddingTop: 20, backgroundColor: Colors.bg },

  /* Greeting Card */
  greetingCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 20, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.primary + "28",
    marginBottom: 22,
    paddingHorizontal: 18, paddingVertical: 16,
  },
  greetingLeft: {
    flex: 1,
    gap: 4,
  },
  greetingText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18, color: Colors.textPrimary,
    textAlign: "right",
  },
  greetingDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12, color: Colors.textSecondary,
    textAlign: "right",
  },
  greetingRight: {
    alignItems: "center",
    gap: 4,
    marginRight: 14,
  },
  greetingIconWrap: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: Colors.primary + "20",
    borderWidth: 1.5, borderColor: Colors.primary + "50",
    alignItems: "center", justifyContent: "center",
  },
  greetingInitial: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22, color: Colors.primary,
  },
  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.primary, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  roleBadgeText: {
    fontFamily: "Cairo_700Bold", fontSize: 9, color: "#000",
  },

  /* Featured Ad Banner */
  featuredAdBanner: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.cardBg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.accent + "35",
    marginBottom: 14,
  },
  featuredAdLeft: { flexDirection: "row-reverse", alignItems: "center", gap: 10, flex: 1 },
  featuredAdIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.accent + "18",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  featuredAdInstitution: {
    fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right",
  },
  featuredAdTitle: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right",
  },
  featuredAdChip: {
    backgroundColor: Colors.accent + "15", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0,
  },
  featuredAdChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.accent },

  sectionHeader: {
    alignItems: "center", gap: 10, marginTop: 4, marginBottom: 18,
  },
  sectionAccentBar: {
    width: 4, height: 22, borderRadius: 2,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary,
  },
  sectionLine: {
    flex: 1, height: 1, backgroundColor: Colors.divider,
  },
  sectionDot: {
    width: 6, height: 6, borderRadius: 3,
  },

  /* Grid — 3 columns */
  gridContainer: {
    flexDirection: "row", flexWrap: "wrap",
    gap: 10,
  },
  gridItemContainer: {
    width: (width - 32 - 20) / 3, marginBottom: 2,
  },
  gridItem: {
    backgroundColor: Colors.cardBg,
    borderRadius: 18, padding: 14,
    alignItems: "center", height: 124,
    justifyContent: "center",
    borderWidth: 1, borderColor: Colors.divider,
    overflow: "hidden",
  },
  gridGlow: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 50, borderRadius: 18,
  },
  gridIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
    marginBottom: 8, borderWidth: 1,
  },
  gridLabel: {
    fontFamily: "Cairo_700Bold", fontSize: 12,
    color: Colors.textPrimary, textAlign: "center",
  },
  gridSub: {
    fontFamily: "Cairo_400Regular", fontSize: 9,
    color: Colors.textSecondary, textAlign: "center", marginTop: 2,
    lineHeight: 13,
  },
  gridBottomLine: {
    position: "absolute", bottom: 0, left: 14, right: 14, height: 2, borderRadius: 1, opacity: 0.55,
  },
  soonBadge: {
    position: "absolute", top: 7, left: 7,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#FBBF2420", borderWidth: 1, borderColor: "#FBBF2450",
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  soonBadgeText: {
    fontFamily: "Cairo_700Bold", fontSize: 9, color: "#FBBF24",
  },

  /* Quick Banners Row */
  quickBannersRow: { flexDirection: "row", gap: 12, marginBottom: 6 },
  quickBanner: {
    borderRadius: 18, padding: 16, borderWidth: 1,
    overflow: "hidden", alignItems: "center", gap: 8,
  },
  quickBannerIcon: {
    width: 50, height: 50, borderRadius: 14,
    justifyContent: "center", alignItems: "center", borderWidth: 1,
  },
  quickBannerTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "center",
  },
  quickBannerSub: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "center",
  },

  /* Footer */
  footerActions: { marginTop: 28, marginBottom: 20, gap: 10 },
  actionStrip: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.cardBg, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.divider, gap: 12,
  },
  actionText: {
    fontFamily: "Cairo_600SemiBold", fontSize: 15,
    color: Colors.textPrimary, flex: 1,
  },

  /* ── Developer Card ── */
  devCardOuter: {
    marginTop: 32, marginHorizontal: 4,
    shadowColor: "#C9A84C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 22,
  },
  devCardBorder: {
    borderRadius: 26,
    padding: 2,
  },
  devCardInner: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#0A100A",
  },

  /* Hero */
  devHero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 0,
    overflow: "hidden",
  },
  devOrb: {
    position: "absolute", borderRadius: 999,
  },
  devHeroTop: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 20,
  },
  devHeroBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: "#C9A84C50",
  },
  devHeroBadgeDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: "#C9A84C",
  },
  devHeroBadgeText: {
    fontFamily: "Cairo_700Bold", fontSize: 9,
    color: "#C9A84C", letterSpacing: 2,
  },
  devHeroVersion: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1, borderColor: Colors.primary + "35",
  },
  devHeroVersionText: {
    fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.primary,
  },
  devHeroIdentity: {
    flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 22,
  },
  devAvatarRing: {
    width: 80, height: 80, borderRadius: 24,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#C9A84C",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 16, elevation: 14,
  },
  devAvatarInner: {
    width: 72, height: 72, borderRadius: 20,
    justifyContent: "center", alignItems: "center",
  },
  devAvatarLetter: {
    fontFamily: "Cairo_700Bold", fontSize: 34, color: "#C9A84C",
  },
  devHeroInfo: { flex: 1, gap: 4 },
  devHeroName: {
    fontFamily: "Cairo_700Bold", fontSize: 17,
    color: "#F5EAC8",
    letterSpacing: 0.3,
  },
  devHeroTitle: {
    fontFamily: "Cairo_400Regular", fontSize: 12,
    color: Colors.textSecondary,
  },
  devHeroLocation: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2,
  },
  devHeroLocationText: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: "#C9A84CAA",
  },

  /* Stats */
  devStatsRow: {
    flexDirection: "row",
    backgroundColor: "#00000030",
    borderTopWidth: 1, borderTopColor: "#C9A84C20",
    marginHorizontal: -20,
  },
  devStatItem: {
    flex: 1, paddingVertical: 14, alignItems: "center",
  },
  devStatItemCenter: {
    borderLeftWidth: 1, borderRightWidth: 1,
    borderLeftColor: "#C9A84C20", borderRightColor: "#C9A84C20",
  },
  devStatValue: {
    fontFamily: "Cairo_700Bold", fontSize: 20, color: "#C9A84C",
  },
  devStatLabel: {
    fontFamily: "Cairo_400Regular", fontSize: 10,
    color: Colors.textMuted, marginTop: 1,
  },

  /* Body */
  devBody: {
    padding: 20,
    backgroundColor: "#0A100A",
    gap: 14,
  },

  /* Bio */
  devBioCard: {
    flexDirection: "row", gap: 12,
    backgroundColor: "#FFFFFF07",
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "#FFFFFF10",
  },
  devBioAccent: {
    width: 3, borderRadius: 3,
    backgroundColor: "#C9A84C",
    alignSelf: "stretch",
    minHeight: 50,
  },
  devBioHeading: {
    fontFamily: "Cairo_600SemiBold", fontSize: 12,
    color: "#C9A84C", marginBottom: 6,
  },
  devBioText: {
    fontFamily: "Cairo_400Regular", fontSize: 13,
    color: Colors.textSecondary, lineHeight: 21,
    textAlign: "right",
  },

  /* Skills */
  devSkillsSection: {
    backgroundColor: "#FFFFFF05",
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "#FFFFFF0D",
  },
  devSkillsTitle: {
    fontFamily: "Cairo_600SemiBold", fontSize: 11,
    color: Colors.textMuted, marginBottom: 12, letterSpacing: 0.8,
  },
  devSkillsGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
  },
  devSkillChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1,
  },
  devSkillText: {
    fontFamily: "Cairo_400Regular", fontSize: 11,
  },

  /* Cert */
  devCertCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "#C9A84C30",
  },
  devCertIcon: {
    width: 42, height: 42, borderRadius: 13,
    justifyContent: "center", alignItems: "center",
  },
  devCertTitle: {
    fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#C9A84C",
  },
  devCertSub: {
    fontFamily: "Cairo_400Regular", fontSize: 11,
    color: Colors.textMuted, marginTop: 2,
  },
  devCertArrow: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "#C9A84C15",
    justifyContent: "center", alignItems: "center",
  },

  /* Contact */
  devContactTitle: {
    fontFamily: "Cairo_600SemiBold", fontSize: 11,
    color: Colors.textMuted, letterSpacing: 0.8,
  },
  devContactGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
  },
  devContactBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1,
  },
  devContactBtnText: {
    fontFamily: "Cairo_600SemiBold", fontSize: 12,
  },

  /* Profile Button */
  devProfileBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 16, paddingVertical: 14,
    marginTop: 2,
  },
  devProfileBtnText: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: "#000",
  },

  /* Footer */
  devFooter: {
    fontFamily: "Cairo_400Regular", fontSize: 11,
    color: Colors.textMuted, textAlign: "center",
    paddingBottom: 4,
  },

  /* ─ قاعة التكريم ─ */
  honorSection: {
    marginBottom: 22,
  },
  honorHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  honorSeeAll: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#D4AF3718",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D4AF3730",
  },
  honorSeeAllText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: "#D4AF37",
  },
  honorDotGroup: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  honorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    opacity: 0.9,
  },
  honorTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  honorTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#D4AF37",
    letterSpacing: 0.8,
  },

  landmarksSection: {
    marginBottom: 20,
  },
  landmarksHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  landmarksTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  landmarksDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.8,
  },
  landmarkCard: {
    borderRadius: 18,
    overflow: "hidden",
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  landmarkImage: {
    height: 190,
    justifyContent: "flex-end",
  },
  landmarkInfo: {
    padding: 14,
    gap: 4,
  },
  landmarkBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  landmarkBadgeText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 10,
  },
  landmarkName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: "#fff",
    textAlign: "right",
  },
  landmarkSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
    textAlign: "right",
  },
  landmarkGlow: {
    height: 2.5,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 2,
    opacity: 0.6,
  },
});
