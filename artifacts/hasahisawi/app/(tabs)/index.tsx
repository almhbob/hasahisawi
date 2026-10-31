import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { reloadAppAsync } from "expo";
import { isDarkTheme, saveThemeMode } from "@/constants/theme-mode";
import { useFeatureFlags } from "@/lib/feature-flags-context";
import { StarPattern, SectionMark } from "@/components/ui/Ornament";

const CITY_PHOTO = require("@/assets/images/ferris-wheel.jpg");
const APP_LOGO = require("@/assets/images/logo.png");
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

function normalizeHomeGender(value: string | null | undefined) {
  const g = String(value ?? "").trim().toLowerCase();
  if (["male", "m", "man", "ذكر", "رجل", "ولد"].includes(g)) return "male";
  if (["female", "f", "woman", "أنثى", "انثى", "امرأة", "امراة", "بنت"].includes(g)) return "female";
  return null;
}

type GroupKey = "daily" | "pro" | "health" | "community";

type Service = {
  id: string;
  label: string;
  short: string;
  sub: string;
  keywords?: string;
  icon: any;
  iconType: "ionicons" | "material";
  group: GroupKey;
  route: any;
  isNew?: boolean;
};

const SERVICES: Service[] = [
  // يومي
  { id: "transport", label: "مشاويرك علينا", short: "مشاويرك", sub: "اطلب سائقاً مباشرة", keywords: "مشوار تاكسي ركشة سائق توصيل", icon: "car-side", iconType: "material", group: "daily", route: "/(tabs)/transport" },
  { id: "market", label: "السوق", short: "السوق", sub: "الأسر المنتجة والدلالة", keywords: "بيع شراء أسر منتجة", icon: "storefront", iconType: "ionicons", group: "daily", route: "/(tabs)/market" },
  { id: "product-showcase", label: "سوق المتاجر", short: "المتاجر", sub: "ملابس، عطور، أحذية", keywords: "بوتيك محل متجر", icon: "storefront-outline", iconType: "ionicons", group: "daily", route: "/(tabs)/product-showcase" },
  { id: "restaurants", label: "المطاعم والكافتريات", short: "المطاعم", sub: "منيو مصوّر وطلبات", keywords: "أكل مطعم كافتيريا وجبات", icon: "restaurant-outline", iconType: "ionicons", group: "daily", route: "/(tabs)/restaurants" },
  { id: "travel", label: "السفر والرحلات", short: "السفر", sub: "وكالات وحجز تذاكر", keywords: "بص سفريات تذكرة طيران وكالة", icon: "airplane", iconType: "ionicons", group: "daily", route: "/(tabs)/travel" },
  { id: "appointments", label: "المواعيد", short: "المواعيد", sub: "حجز وتنبيهات", keywords: "حجز موعد", icon: "calendar-check-outline", iconType: "material", group: "daily", route: "/(tabs)/appointments" },
  { id: "calendar", label: "التقويم", short: "التقويم", sub: "أعياد ومناسبات", keywords: "تاريخ هجري مناسبة", icon: "calendar", iconType: "ionicons", group: "daily", route: "/(tabs)/calendar" },
  { id: "telecom", label: "الاتصالات", short: "الاتصالات", sub: "MTN · زين · سوداني", keywords: "رصيد شبكة باقات زين سوداني ام تي ان", icon: "cellular", iconType: "ionicons", group: "daily", route: "/(tabs)/telecom" },
  { id: "numbers", label: "أرقام مهمة", short: "أرقام مهمة", sub: "طوارئ وخدمات", keywords: "شرطة إسعاف مطافي طوارئ رقم", icon: "call", iconType: "ionicons", group: "daily", route: "/(tabs)/numbers" },
  // مهني وقانوني
  { id: "lawyers", label: "المحامون والخدمات القانونية", short: "المحامون", sub: "استشارات وعقود", keywords: "محامي قانون عقد استشارة توثيق", icon: "scale-balance", iconType: "material", group: "pro", route: "/(tabs)/lawyers" },
  { id: "jobs", label: "وظائف", short: "وظائف", sub: "فرص عمل محلية", keywords: "عمل وظيفة توظيف", icon: "briefcase", iconType: "ionicons", group: "pro", route: "/(tabs)/jobs" },
  { id: "cv-builder", label: "السيرة الذاتية", short: "السيرة", sub: "قوالب مجانية PDF", keywords: "سي في cv سيرة", icon: "document-text-outline", iconType: "ionicons", group: "pro", route: "/(tabs)/cv-builder", isNew: true },
  // صحة وتعليم
  { id: "medical", label: "الدليل الطبي", short: "الطبي", sub: "صيدليات ومستشفيات", keywords: "صيدلية مستشفى عيادة دكتور طبيب", icon: "medkit", iconType: "ionicons", group: "health", route: "/(tabs)/medical" },
  { id: "student", label: "الخدمات الطلابية", short: "الطلاب", sub: "مدارس ومعاهد", keywords: "مدرسة جامعة معهد تعليم", icon: "school", iconType: "ionicons", group: "health", route: "/(tabs)/student" },
  // المجتمع
  { id: "social", label: "المجتمع", short: "المجتمع", sub: "منشورات وصور", keywords: "منشور بوست", icon: "chatbubbles", iconType: "ionicons", group: "community", route: "/(tabs)/social" },
  { id: "women", label: "قسم المرأة", short: "المرأة", sub: "متاجر وخدمات نسائية", keywords: "نساء", icon: "face-woman", iconType: "material", group: "community", route: "/(tabs)/women" },
  { id: "volunteer", label: "التطوع", short: "التطوع", sub: "مهام ونقاط وبطاقة متطوع", keywords: "تطوع متطوع مبادرة نقاط عمل خيري", icon: "hand-heart-outline", iconType: "material", group: "community", route: "/volunteer", isNew: true },
  { id: "contests", label: "المسابقات", short: "المسابقات", sub: "جوائز ومسابقات موسمية", keywords: "مسابقة جائزة رمضان عيد استقلال", icon: "trophy-outline", iconType: "ionicons", group: "community", route: "/contests", isNew: true },
  { id: "orgs", label: "المنظمات", short: "المنظمات", sub: "جمعيات ومبادرات", keywords: "خيري جمعية تطوع", icon: "hand-heart", iconType: "material", group: "community", route: "/(tabs)/orgs" },
  { id: "sports", label: "النشاط الرياضي", short: "الرياضة", sub: "أندية وبطولات", keywords: "كورة نادي دوري", icon: "football", iconType: "ionicons", group: "community", route: "/(tabs)/sports" },
  { id: "culture", label: "النشاط الثقافي", short: "الثقافة", sub: "معارض وفعاليات", keywords: "ثقافة فن معرض", icon: "palette", iconType: "material", group: "community", route: "/(tabs)/culture" },
  { id: "missing", label: "مفقودات", short: "مفقودات", sub: "مفقود أو موجود", keywords: "ضائع فقدت لقيت", icon: "search", iconType: "ionicons", group: "community", route: "/(tabs)/missing" },
  { id: "reports", label: "التبليغ السريع", short: "التبليغ", sub: "مياه، كهرباء، بيئة", keywords: "بلاغ شكوى كهرباء موية", icon: "megaphone", iconType: "ionicons", group: "community", route: "/(tabs)/reports" },
];

const GROUPS: { key: GroupKey; title: string }[] = [
  { key: "daily", title: "يومي" },
  { key: "pro", title: "مهني وقانوني" },
  { key: "health", title: "صحة وتعليم" },
  { key: "community", title: "المجتمع" },
];

const DEFAULT_TOP = ["transport", "market", "lawyers", "appointments"];
const USAGE_KEY = "hsh_home_usage_v1";

const G = Colors.primary;
const G_DEEP = Colors.primaryDeep;
const G_TINT = Colors.primarySoft;

// Arabic-aware normalisation so «أ/إ/آ → ا», «ة → ه», «ى → ي» all match
function norm(s: string) {
  return s
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

const FEATURED: { route: string; title: string; sub: string; icon: any; grad: [string, string] }[] = [
  { route: "/volunteer", title: "بوابة المتطوعين", sub: "مهام، نقاط، مستويات وبطاقة متطوع", icon: "heart-circle", grad: ["#0E8A5F", "#064E3B"] },
  { route: "/contests", title: "المسابقات", sub: "جوائز ومسابقات موسمية", icon: "trophy", grad: ["#B7791F", "#7C2D12"] },
];

async function toggleTheme() {
  const needsReload = await saveThemeMode(isDarkTheme ? "light" : "dark").catch(() => false);
  if (!needsReload) return;
  // الألوان تُقرأ عند فتح التطبيق، فنعيد فتحه ليُطبَّق المظهر على كل الشاشات
  if (Platform.OS === "web") { try { window.location.reload(); } catch {} return; }
  reloadAppAsync().catch(() => {});
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 18) return "مساء الخير";
  return "مساء النور";
}

function SvcIcon({ item, size, color }: { item: Service; size: number; color: string }) {
  return item.iconType === "ionicons"
    ? <Ionicons name={item.icon} size={size} color={color} />
    : <MaterialCommunityIcons name={item.icon} size={size} color={color} />;
}

function ServiceRow({ item, onOpen }: { item: Service; onOpen: (s: Service) => void }) {
  return (
    <View style={styles.cardWrap}>
    <AnimatedPress onPress={() => onOpen(item)}>
      <View style={styles.card} accessible accessibilityRole="button" accessibilityLabel={item.label}>
        <View style={styles.cardIcon}><SvcIcon item={item} size={21} color={G_DEEP} /></View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.label}</Text>
            {item.isNew ? <View style={styles.newBadge}><Text style={styles.newBadgeText}>جديد</Text></View> : null}
          </View>
          <Text style={styles.cardSub} numberOfLines={1}>{item.sub}</Text>
        </View>
      </View>
    </AnimatedPress>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 24 : insets.top + 10;
  const { user, isGuest, logout } = useAuth();
  const displayName = (user?.name?.trim().split(/\s+/)[0]) || "زائر";

  const [query, setQuery] = useState("");
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(USAGE_KEY);
        if (raw) setUsage(JSON.parse(raw) || {});
      } catch {}
    })();
  }, []);

  // Refresh the bell count whenever the home tab regains focus
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/notifications`);
        if (!res.ok) return;
        const data = await res.json();
        if (alive && Array.isArray(data)) setUnread(data.filter((n: any) => !n?.is_read).length);
      } catch {}
    })();
    return () => { alive = false; };
  }, []));

  // أقسام تخفيها الإدارة من «أقسام التطبيق» (الطاقم يراها ليديرها)
  const { sections } = useFeatureFlags();
  const isStaff = user?.role === "admin" || user?.role === "moderator";
  const hiddenIds = useMemo(() => new Set<string>(
    isStaff ? [] : (["contests", "volunteer"] as const).filter(k => sections[k]?.visible === false)
  ), [sections, isStaff]);
  const featured = useMemo(() => FEATURED.filter(f => !hiddenIds.has(f.route.slice(1))), [hiddenIds]);

  const services = useMemo(() => {
    const gender = normalizeHomeGender(user?.gender);
    const base = SERVICES.filter(s => !hiddenIds.has(s.id));
    if (gender === "male" && user?.role !== "admin") return base.filter(s => s.id !== "women");
    return base;
  }, [user?.gender, user?.role, hiddenIds]);

  const top = useMemo(() => {
    const byId = new Map(services.map(s => [s.id, s]));
    const used = Object.entries(usage).filter(([id]) => byId.has(id)).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const ids = [...used, ...DEFAULT_TOP.filter(id => !used.includes(id))].slice(0, 4);
    return ids.map(id => byId.get(id)!).filter(Boolean);
  }, [services, usage]);

  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return null;
    const terms = q.split(/\s+/).filter(Boolean);
    return services.filter(s => {
      const hay = norm(`${s.label} ${s.short} ${s.sub} ${s.keywords ?? ""}`);
      return terms.every(t => hay.includes(t));
    });
  }, [query, services]);

  const open = useCallback((s: Service) => {
    setUsage(prev => {
      const next = { ...prev, [s.id]: (prev[s.id] || 0) + 1 };
      AsyncStorage.setItem(USAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    router.push(s.route);
  }, []);

  const hasUsage = Object.keys(usage).length > 0;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Hero: صورة الحصاحيصا + الشعار + التحية */}
        <Animated.View entering={FadeIn.duration(400)} style={[styles.heroWrap, { marginTop: topPad }]}>
          <View style={styles.hero}>
            <Image source={CITY_PHOTO} style={styles.heroImg} resizeMode="cover" accessibilityLabel="عجلة الحصاحيصا على ضفة النيل" />
            <LinearGradient colors={["rgba(3,34,24,0.55)", "rgba(3,34,24,0.10)", "rgba(3,30,21,0.90)"]} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} />
            <StarPattern opacity={0.16} style={{ height: 70, bottom: undefined }} />

            {/* الشعار والأزرار */}
            <View style={styles.heroTop}>
              <View style={styles.brand}>
                <View style={styles.logoBox}><Image source={APP_LOGO} style={styles.logo} resizeMode="contain" /></View>
                <View>
                  <Text style={styles.brandName}>حصاحيصاوي</Text>
                  <Text style={styles.brandSub}>مدينة النيل والصناعة</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                {/* تبديل سريع بين الفاتح والداكن */}
                <TouchableOpacity
                  onPress={toggleTheme}
                  style={styles.glassBtn}
                  accessibilityRole="button"
                  accessibilityLabel={isDarkTheme ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name={isDarkTheme ? "sunny-outline" : "moon-outline"} size={19} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push("/notifications" as any)}
                  style={styles.glassBtn}
                  accessibilityRole="button"
                  accessibilityLabel={unread > 0 ? `الإشعارات، ${unread} غير مقروءة` : "الإشعارات"}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name="notifications-outline" size={20} color="#fff" />
                  {unread > 0 ? (
                    <View style={styles.bellBadge}><Text style={styles.bellBadgeText}>{unread > 9 ? "9+" : unread}</Text></View>
                  ) : null}
                </TouchableOpacity>
              </View>
            </View>

            {/* التحية */}
            <View style={styles.heroBottom}>
              <TouchableOpacity
                style={styles.headerUser}
                activeOpacity={isGuest ? 1 : 0.8}
                disabled={isGuest}
                onPress={() => router.push("/profile" as any)}
                accessibilityRole={isGuest ? undefined : "button"}
                accessibilityLabel={isGuest ? undefined : "ملفي الشخصي"}
              >
                <View style={styles.avatar}>
                  {!isGuest && user?.avatar_url
                    ? <Image source={{ uri: user.avatar_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                    : <Text style={styles.avatarText}>{displayName.trim().charAt(0) || "؟"}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hello} numberOfLines={1}>{greeting()}، {displayName}</Text>
                  <Text style={styles.helloSub} numberOfLines={1}>خدمات مدينتك في مكان واحد</Text>
                </View>
              </TouchableOpacity>
              {isGuest ? (
                <TouchableOpacity style={styles.loginBtn} activeOpacity={0.85} onPress={() => { logout(); }} accessibilityRole="button" accessibilityLabel="تسجيل الدخول">
                  <Ionicons name="log-in-outline" size={15} color="#fff" />
                  <Text style={styles.loginBtnText}>دخول</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </Animated.View>

        {/* Search */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث: محامي، مشوار، صيدلية…"
            placeholderTextColor={Colors.textMuted}
            style={styles.searchInput}
            textAlign="right"
            returnKeyType="search"
            accessibilityLabel="بحث في الخدمات"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="مسح البحث">
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </Animated.View>

        <View style={styles.body}>
          {results ? (
            <View>
              <Text style={styles.groupTitle}>{results.length ? `النتائج (${results.length})` : "لا توجد خدمة بهذا الاسم"}</Text>
              {results.length === 0 ? (
                <Text style={styles.emptyText}>جرّب كلمة أخرى مثل: صيدلية، تذكرة، وظيفة، بلاغ</Text>
              ) : (
                <View style={styles.grid}>{results.map(s => <ServiceRow key={s.id} item={s} onOpen={open} />)}</View>
              )}
            </View>
          ) : (
            <>
              {/* المميز: بوابة المتطوعين والمسابقات */}
              {featured.length ? <Animated.View entering={FadeInDown.delay(90).springify()} style={styles.featureRow}>
                {featured.map(f => (
                  <View key={f.route} style={{ flex: 1 }}>
                    <AnimatedPress onPress={() => router.push(f.route as any)}>
                      <LinearGradient colors={f.grad} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.feature}>
                        <View style={styles.featureTop}>
                          <View style={styles.featureIcon}><Ionicons name={f.icon} size={20} color="#fff" /></View>
                          <View style={styles.featureNew}><Text style={styles.featureNewText}>جديد</Text></View>
                        </View>
                        <Text style={styles.featureTitle} numberOfLines={1}>{f.title}</Text>
                        <Text style={styles.featureSub} numberOfLines={2}>{f.sub}</Text>
                      </LinearGradient>
                    </AnimatedPress>
                  </View>
                ))}
              </Animated.View> : null}

              {/* Quick access */}
              <Animated.View entering={FadeInDown.delay(110).springify()}>
                <View style={styles.groupHead}>
                  <SectionMark />
                  <Text style={[styles.groupTitle, styles.headTitle]}>{hasUsage ? "الأكثر استخداماً لك" : "ابدأ من هنا"}</Text>
                </View>
                <View style={styles.quickRow}>
                  {top.map(s => (
                    <View key={s.id} style={{ flex: 1 }}><AnimatedPress onPress={() => open(s)}>
                      <View style={styles.quick} accessible accessibilityRole="button" accessibilityLabel={s.label}>
                        <View style={styles.quickIcon}><SvcIcon item={s} size={24} color="#fff" /></View>
                        <Text style={styles.quickText} numberOfLines={1}>{s.short}</Text>
                      </View>
                    </AnimatedPress></View>
                  ))}
                </View>
              </Animated.View>

              {GROUPS.map((g, gi) => {
                const items = services.filter(s => s.group === g.key);
                if (!items.length) return null;
                return (
                  <Animated.View key={g.key} entering={FadeInDown.delay(160 + gi * 50).springify()} style={{ marginTop: 22 }}>
                    <View style={styles.groupHead}>
                      <SectionMark />
                      <Text style={[styles.groupTitle, styles.headTitle]}>{g.title}</Text>
                      <Text style={[styles.groupCount, styles.headTitle]}>{items.length}</Text>
                    </View>
                    <View style={styles.grid}>{items.map(s => <ServiceRow key={s.id} item={s} onOpen={open} />)}</View>
                  </Animated.View>
                );
              })}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  heroWrap: { marginHorizontal: 16, marginBottom: 14, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(232,185,49,0.35)" },
  hero: { height: 214, justifyContent: "space-between", padding: 14 },
  heroImg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  logoBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logo: { width: 40, height: 40 },
  brandName: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 16, textAlign: "right", lineHeight: 24 },
  brandSub: { fontFamily: "Cairo_600SemiBold", color: "#F3D27A", fontSize: 11, textAlign: "right", lineHeight: 16 },
  heroActions: { flexDirection: "row", gap: 8 },
  glassBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", alignItems: "center", justifyContent: "center" },
  heroBottom: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  headerUser: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, overflow: "hidden", borderWidth: 2, borderColor: "#E8B931", backgroundColor: G_TINT, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: "Cairo_700Bold", color: G_DEEP, fontSize: 18 },
  hello: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 19, textAlign: "right", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 6 },
  helloSub: { fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.85)", fontSize: 12, textAlign: "right", marginTop: -2 },
  bell: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  bellBadge: { position: "absolute", top: 6, right: 6, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, backgroundColor: "#D64545", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#fff" },
  bellBadgeText: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 9.5, lineHeight: 13 },
  loginBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 12, height: 34, backgroundColor: G },
  loginBtnText: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 13 },
  searchBox: { marginHorizontal: 16, height: 48, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)", flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 14, gap: 8 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, paddingVertical: 0, writingDirection: "rtl" },
  body: { paddingHorizontal: 16, paddingTop: 18 },
  groupHead: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 10 },
  headTitle: { marginBottom: 0 },
  groupTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 15.5, textAlign: "right", marginBottom: 10 },
  groupCount: { fontFamily: "Cairo_600SemiBold", color: Colors.textMuted, fontSize: 13, marginBottom: 10 },
  emptyText: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 13, textAlign: "right" },
  quickRow: { flexDirection: "row-reverse", gap: 10 },
  quick: { alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  quickIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: G, alignItems: "center", justifyContent: "center" },
  quickText: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 13 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  cardWrap: { width: "48.4%" },
  card: { flexDirection: "row-reverse", alignItems: "center", gap: 10, minHeight: 66, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 14, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  cardIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: G_TINT, alignItems: "center", justifyContent: "center" },
  cardTitle: { flexShrink: 1, fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 13, textAlign: "right" },
  cardSub: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 10.5, textAlign: "right", marginTop: -1 },
  featureRow: { flexDirection: "row-reverse", gap: 10, marginBottom: 22 },
  feature: { borderRadius: 18, padding: 14, minHeight: 112, gap: 4 },
  featureTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  featureIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  featureNew: { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 8, paddingHorizontal: 7 },
  featureNewText: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 10, lineHeight: 18 },
  featureTitle: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 15, textAlign: "right" },
  featureSub: { fontFamily: "Cairo_400Regular", color: "rgba(255,255,255,0.85)", fontSize: 11, textAlign: "right", lineHeight: 17 },
  newBadge: { backgroundColor: Colors.accent, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 0 },
  newBadgeText: { fontFamily: "Cairo_700Bold", color: "#3A2A00", fontSize: 9, lineHeight: 15 },
});
