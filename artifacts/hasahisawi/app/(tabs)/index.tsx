import React, { useState, useMemo } from "react";
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
import AuthModal from "@/components/AuthModal";
import AnimatedPress from "@/components/AnimatedPress";
import { useLang } from "@/lib/lang-context";

const { width } = Dimensions.get("window");
const LOGO       = require("@/assets/images/logo.png");
const CITY_IMAGE = require("@/assets/images/hasahisa-city.jpg");

type ServiceItem = {
  id: string; label: string; sub: string; icon: any;
  color: string; bg: string; route: any; iconType: "ionicons" | "material";
};

function ServiceGridItem({
  item, onPress, index,
}: { item: ServiceItem; onPress: () => void; index: number }) {
  return (
    <Animated.View
      entering={FadeInDown.delay(180 + index * 45).springify().damping(16)}
      style={styles.gridItemContainer}
    >
      <AnimatedPress onPress={onPress}>
        <View style={styles.gridItem}>
          {/* توهج خلفي للبطاقة */}
          <View style={[styles.gridGlow, { backgroundColor: item.color + "12" }]} />
          <View style={[styles.gridIconWrap, { backgroundColor: item.color + "18", borderColor: item.color + "40" }]}>
            {item.iconType === "ionicons"
              ? <Ionicons name={item.icon} size={26} color={item.color} />
              : <MaterialCommunityIcons name={item.icon} size={26} color={item.color} />}
          </View>
          <Text style={styles.gridLabel} numberOfLines={1}>{item.label}</Text>
          <Text style={styles.gridSub} numberOfLines={1}>{item.sub}</Text>
          {/* حد نيوني سفلي */}
          <View style={[styles.gridBottomLine, { backgroundColor: item.color + "80" }]} />
        </View>
      </AnimatedPress>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const { t, isRTL, lang, tr } = useLang();
  const insets  = useSafeAreaInsets();
  const topPad  = Platform.OS === "web" ? 67 : insets.top;
  const auth    = useAuth();
  const [showAuth, setShowAuth] = useState(false);

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
    { id: "appointments",label: "حجز المواعيد",                    sub: "صحي وحكومي",                     icon: "calendar",          iconType: "ionicons"  as const, color: Colors.accent,  bg: Colors.accent+"20",    route: "/(tabs)/appointments" as const },
    { id: "reports",   label: "التبليغ السريع",                   sub: "مياه · كهرباء · بيئة",           icon: "megaphone",         iconType: "ionicons"  as const, color: Colors.danger,  bg: Colors.danger+"20",    route: "/(tabs)/reports"      as const },
    { id: "numbers",   label: "أرقام مهمة",                       sub: "طوارئ وخدمات",                   icon: "call",              iconType: "ionicons"  as const, color: "#3E9CBF",  bg: "#3E9CBF20",    route: "/(tabs)/numbers"      as const },
  ], [lang]);

  const handlePress = (route: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 100 : 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ═══ HERO ═══ */}
      <ImageBackground
        source={CITY_IMAGE}
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

        {/* شريط الهوية — الشعار وسط + توهج */}
        <Animated.View entering={FadeIn.delay(100).duration(800)} style={styles.brandBanner}>
          <LinearGradient
            colors={[Colors.primary + "18", Colors.accent + "10", Colors.primary + "08"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.brandBannerGrad}
          >
            <View style={styles.brandGlowLeft} />
            <Image source={LOGO} style={styles.brandLogo} resizeMode="contain" />
            <View style={{ flex: 1, marginHorizontal: 14 }}>
              <Text style={styles.brandTitle}>حصاحيصاوي</Text>
              <Text style={styles.brandSub}>بوابتك الذكية لمدينة الحصاحيصا</Text>
            </View>
            <View style={[styles.brandBadge, { backgroundColor: Colors.primary }]}>
              <Text style={styles.brandBadgeText}>v1.0</Text>
            </View>
            <View style={styles.brandGlowRight} />
          </LinearGradient>
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
              <Text style={styles.quickBannerSub}>صحي · حكومي</Text>
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
          {SERVICES.map((item, idx) => (
            <ServiceGridItem key={item.id} item={item} onPress={() => handlePress(item.route)} index={idx} />
          ))}
        </View>

        {/* قسم المستخدم */}
        <View style={styles.footerActions}>
          {auth.user && !auth.isGuest ? (
            <AnimatedPress onPress={() => auth.logout()}>
              <View style={[styles.actionStrip, { borderColor: Colors.danger + "40" }]}>
                <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
                <Text style={[styles.actionText, { color: Colors.danger }]}>{t('auth', 'logout')} ({auth.user.name})</Text>
              </View>
            </AnimatedPress>
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
          {/* إطار متوهج */}
          <LinearGradient
            colors={[Colors.accent + "90", Colors.primary + "70", Colors.cyber + "60", Colors.violet + "70", Colors.accent + "90"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.devCardBorder}
          >
            <LinearGradient
              colors={["#0D1A12", "#142119", "#0D1A12"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.devCardInner}
            >
              {/* شعاع ضوء خلفي */}
              <View style={styles.devGlowTop} />
              <View style={styles.devGlowBottom} />

              {/* رأس البطاقة */}
              <View style={styles.devCardTop}>
                <View style={styles.devBadge}>
                  <Text style={styles.devBadgeText}>DEVELOPER</Text>
                </View>
                <LinearGradient
                  colors={[Colors.accent + "30", Colors.primary + "20"]}
                  style={styles.devAppLabel}
                >
                  <Text style={styles.devAppLabelText}>حصاحيصاوي v1.0</Text>
                </LinearGradient>
              </View>

              {/* الهوية */}
              <View style={styles.devIdentity}>
                <LinearGradient
                  colors={[Colors.accent, Colors.primary]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.devAvatar}
                >
                  <Text style={styles.devAvatarText}>ع</Text>
                </LinearGradient>

                <View style={styles.devInfo}>
                  <Text style={styles.devName}>عاصم عبدالرحمن محمد</Text>
                  <Text style={styles.devRole}>مطوّر تطبيقات · محلل بيانات</Text>
                  <View style={styles.devContactRow}>
                    <Ionicons name="location-outline" size={12} color={Colors.primary} />
                    <Text style={[styles.devContact, { color: Colors.primary }]}>حصاحيصا · ولاية الجزيرة · السودان</Text>
                  </View>
                  <Text style={styles.devBirth}>م. 2 مايو 1991</Text>
                </View>
              </View>

              {/* فاصل متوهج */}
              <LinearGradient
                colors={["transparent", Colors.accent + "60", Colors.primary + "60", "transparent"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.devDivider, { marginBottom: 14 }]}
              />

              {/* نبذة تعريفية */}
              <View style={styles.devBioBox}>
                <View style={styles.devBioHeader}>
                  <Ionicons name="person-circle-outline" size={15} color={Colors.accent} />
                  <Text style={styles.devBioTitle}>نبذة تعريفية</Text>
                </View>
                <Text style={styles.devBioText}>
                  مطوّر تطبيقات جوّال ومحلّل بيانات من مدينة حصاحيصا، ولاية الجزيرة، السودان.
                  {"\n\n"}
                  يمتلك خبرةً متخصصة في بناء تطبيقات React Native وTypeScript، وتحليل البيانات، والأمن السيبراني. صاحب شغف حقيقي بالتقنية وتوظيفها لخدمة المجتمع وتيسير حياة أبناء مدينته.
                  {"\n\n"}
                  حاصل على شهادات دولية معتمدة من Google وIBM وCisco وIntel وFortinet، ويؤمن بأن التكنولوجيا جسرٌ نحو تنمية الأوطان.
                </Text>
              </View>

              <LinearGradient
                colors={["transparent", Colors.primary + "30", "transparent"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.devDivider, { marginBottom: 14 }]}
              />

              {/* وسائل التواصل */}
              {[
                { icon: "logo-whatsapp",  color: "#25D366", label: "+966 530 658 285",              url: "https://wa.me/966530658285" },
                { icon: "logo-whatsapp",  color: "#25D366", label: "+249 916 897 578",              url: "https://wa.me/249916897578" },
                { icon: "logo-linkedin",  color: "#0A66C2", label: "linkedin.com/in/asim-abdulrahman", url: "https://www.linkedin.com/in/asim-abdulrahman" },
                { icon: "logo-facebook",  color: "#1877F2", label: "facebook.com/almhbob2013",     url: "https://www.facebook.com/almhbob2013" },
                { icon: "mail-outline",   color: Colors.cyber, label: "almhbob.iii@gmail.com",    url: "mailto:almhbob.iii@gmail.com" },
              ].map((item) => (
                <AnimatedPress key={item.url} onPress={() => Linking.openURL(item.url)}>
                  <View style={styles.devSocialRow}>
                    <View style={[styles.devSocialIcon, { backgroundColor: item.color + "18", borderColor: item.color + "40" }]}>
                      <Ionicons name={item.icon as any} size={15} color={item.color} />
                    </View>
                    <Text style={[styles.devSocialLabel, { color: item.color }]}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={13} color={item.color + "60"} />
                  </View>
                </AnimatedPress>
              ))}

              {/* فاصل متوهج */}
              <LinearGradient
                colors={["transparent", Colors.violet + "50", Colors.cyber + "50", "transparent"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.devDivider, { marginTop: 14, marginBottom: 14 }]}
              />

              {/* الشهادات والتقنيات */}
              <Text style={styles.devSectionTitle}>الشهادات والمهارات</Text>
              <View style={styles.devTechRow}>
                {[
                  { label: "React Native",    color: Colors.cyber },
                  { label: "Data Analytics",  color: Colors.accent },
                  { label: "Cybersecurity",   color: Colors.danger },
                  { label: "Cloud DevOps",    color: "#6366F1" },
                  { label: "Data Science",    color: "#3B82F6" },
                  { label: "TypeScript",      color: "#60A5FA" },
                  { label: "Node.js",         color: Colors.primary },
                ].map(tech => (
                  <View key={tech.label} style={[styles.devTechBadge, { borderColor: tech.color + "50", backgroundColor: tech.color + "12" }]}>
                    <View style={[styles.devTechDot, { backgroundColor: tech.color }]} />
                    <Text style={[styles.devTechText, { color: tech.color }]}>{tech.label}</Text>
                  </View>
                ))}
              </View>

              {/* شارة Credly */}
              <AnimatedPress onPress={() => Linking.openURL("https://www.credly.com/users/asim-abdulrahman")}>
                <LinearGradient
                  colors={[Colors.accent + "15", Colors.primary + "10"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.devCredlyRow}
                >
                  <Ionicons name="ribbon-outline" size={16} color={Colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.devCredlyTitle}>الشهادات المعتمدة · Credly</Text>
                    <Text style={styles.devCredlyText}>Google · IBM · Cisco · Intel · Fortinet</Text>
                  </View>
                  <Ionicons name="open-outline" size={14} color={Colors.accent + "80"} />
                </LinearGradient>
              </AnimatedPress>

              {/* حقوق */}
              <Text style={styles.devCopyright}>
                © 2026 · صُنع بـ ❤️ في حصاحيصا · السودان
              </Text>
            </LinearGradient>
          </LinearGradient>
        </Animated.View>

        <View style={{ height: 40 }} />
      </View>

      <AuthModal visible={showAuth} onClose={() => setShowAuth(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  /* ══ HERO ══ */
  hero: {
    minHeight: 340,
    justifyContent: "flex-end",
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  heroImage: { resizeMode: "cover" },

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

  /* Brand Banner */
  brandBanner: {
    borderRadius: 20, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.primary + "30",
    marginBottom: 28,
  },
  brandBannerGrad: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  brandGlowLeft: {
    position: "absolute", left: -20, top: "50%", marginTop: -30,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.primary, opacity: 0.12,
  },
  brandGlowRight: {
    position: "absolute", right: -20, top: "50%", marginTop: -30,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: Colors.accent, opacity: 0.12,
  },
  brandLogo: { width: 44, height: 44, borderRadius: 10 },
  brandTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary,
  },
  brandSub: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2,
  },
  brandBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  brandBadgeText: {
    fontFamily: "Cairo_700Bold", fontSize: 11, color: "#000",
  },

  /* Section Header */
  sectionHeader: {
    alignItems: "center", gap: 10, marginBottom: 18,
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

  /* Grid */
  gridContainer: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "space-between", gap: 12,
  },
  gridItemContainer: {
    width: (width - 32 - 12) / 2, marginBottom: 4,
  },
  gridItem: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20, padding: 16,
    alignItems: "center", height: 148,
    justifyContent: "center",
    borderWidth: 1, borderColor: Colors.divider,
    overflow: "hidden",
  },
  gridGlow: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 60, borderRadius: 20,
  },
  gridIconWrap: {
    width: 54, height: 54, borderRadius: 16,
    justifyContent: "center", alignItems: "center",
    marginBottom: 10, borderWidth: 1,
  },
  gridLabel: {
    fontFamily: "Cairo_700Bold", fontSize: 14,
    color: Colors.textPrimary, textAlign: "center",
  },
  gridSub: {
    fontFamily: "Cairo_400Regular", fontSize: 10,
    color: Colors.textSecondary, textAlign: "center", marginTop: 2,
  },
  gridBottomLine: {
    position: "absolute", bottom: 0, left: 16, right: 16, height: 2, borderRadius: 1, opacity: 0.6,
  },

  /* Quick Banners Row */
  quickBannersRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
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
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  devCardBorder: {
    borderRadius: 24,
    padding: 1.5,
  },
  devCardInner: {
    borderRadius: 23,
    padding: 20,
    overflow: "hidden",
  },
  devGlowTop: {
    position: "absolute", top: -40, left: "20%",
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: Colors.accent + "10",
  },
  devGlowBottom: {
    position: "absolute", bottom: -40, right: "10%",
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: Colors.cyber + "10",
  },
  devCardTop: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 18,
  },
  devBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: Colors.accent + "20",
    borderWidth: 1, borderColor: Colors.accent + "50",
  },
  devBadgeText: {
    fontFamily: "Cairo_700Bold", fontSize: 10,
    color: Colors.accent, letterSpacing: 2,
  },
  devAppLabel: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10,
  },
  devAppLabelText: {
    fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary,
  },
  devIdentity: {
    flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 18,
  },
  devAvatar: {
    width: 58, height: 58, borderRadius: 18,
    justifyContent: "center", alignItems: "center",
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 12, elevation: 10,
  },
  devAvatarText: {
    fontFamily: "Cairo_700Bold", fontSize: 26, color: "#000",
  },
  devInfo: { flex: 1, gap: 3 },
  devName: {
    fontFamily: "Cairo_700Bold", fontSize: 18,
    color: Colors.textPrimary,
    textShadowColor: Colors.accent + "60",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  devRole: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary,
  },
  devContactRow: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2,
  },
  devContact: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted,
  },
  devDivider: {
    height: 1, borderRadius: 1, marginBottom: 14,
  },
  devBioBox: {
    backgroundColor: Colors.cardBgElevated,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.accent + "25",
  },
  devBioHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  devBioTitle: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.accent,
    letterSpacing: 0.3,
  },
  devBioText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: "right",
    writingDirection: "rtl",
  },
  devTechRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16,
  },
  devTechBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    borderWidth: 1,
  },
  devTechDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  devTechText: {
    fontFamily: "Cairo_400Regular", fontSize: 11,
  },
  devBirth: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2,
  },
  devSocialRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  devSocialIcon: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1,
  },
  devSocialLabel: {
    fontFamily: "Cairo_400Regular", fontSize: 13, flex: 1,
  },
  devSectionTitle: {
    fontFamily: "Cairo_600SemiBold", fontSize: 12,
    color: Colors.textMuted, marginBottom: 10, letterSpacing: 0.5,
  },
  devCredlyRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, padding: 12, marginTop: 12, marginBottom: 14,
    borderWidth: 1, borderColor: Colors.accent + "30",
  },
  devCredlyTitle: {
    fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.accent,
  },
  devCredlyText: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 1,
  },
  devCopyright: {
    fontFamily: "Cairo_400Regular", fontSize: 11,
    color: Colors.textMuted, textAlign: "center", marginTop: 2,
  },
});
