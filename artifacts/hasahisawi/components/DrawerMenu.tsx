import { useAdminUnread } from "@/lib/admin-alerts-store";
import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Image, Platform, Dimensions, I18nManager, PanResponder,
} from "react-native";
import { isDarkTheme } from "@/constants/theme-mode";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, runOnJS, interpolate, Extrapolation,
} from "react-native-reanimated";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors, { withAlpha } from "@/constants/colors";
import { useDrawer } from "@/lib/drawer-context";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/feature-flags-context";
import BrandPattern from "@/components/BrandPattern";
import { useApiUnread } from "@/lib/api-chat";

const { width: SCREEN_W } = Dimensions.get("window");
const DRAWER_W = Math.min(SCREEN_W * 0.82, 320);
const DRAWER_IS_RTL = I18nManager.isRTL;

const LOGO = require("@/assets/images/logo.png");

type Section = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color?: string;
  soon?: boolean;
  isTransport?: boolean;
  femaleOnly?: boolean;
  maleOnly?: boolean;
};

type Group = { label: string; items: Section[] };

const GROUPS: Group[] = [
  {
    label: "الرئيسية",
    items: [
      { title: "الرئيسية",    icon: "home-outline",       route: "/(tabs)/",            color: Colors.primary },
      { title: "ملفي الشخصي", icon: "person-circle-outline", route: "/profile",          color: Colors.primary },
      { title: "البحث",       icon: "search-outline",     route: "/(tabs)/search",      color: Colors.cyber   },
      { title: "بطاقة العضوية", icon: "card-outline",      route: "/member-card",        color: Colors.accent  },
    ],
  },
  {
    label: "صحة ومواعيد",
    items: [
      { title: "الطب والصحة",  icon: "medkit-outline",     route: "/(tabs)/medical",     color: "#E05567"      },
      { title: "حجز موعد",    icon: "calendar-number-outline", route: "/(tabs)/appointments", color: Colors.accent },
    ],
  },
  {
    label: "خدمات مجتمعية",
    items: [
      { title: "بلاغات",      icon: "megaphone-outline",  route: "/(tabs)/reports",     color: Colors.accent  },
      { title: "المفقودات",   icon: "eye-outline",        route: "/(tabs)/missing",     color: Colors.cyber   },
      { title: "المجتمع",     icon: "chatbubbles-outline",route: "/(tabs)/social",      color: Colors.primary },
      { title: "الدردشة",     icon: "chatbubble-outline", route: "/(tabs)/chat",        color: Colors.primary },
      { title: "ركن المرأة",  icon: "flower-outline",     route: "/(tabs)/women",       color: "#5B8DB8", femaleOnly: true },
      { title: "قسم الرجال",  icon: "man-outline",        route: "/(tabs)/men",         color: "#38BDF8"      },
      { title: "المنظمات",    icon: "people-outline",     route: "/(tabs)/orgs",        color: Colors.primary },
      { title: "التطوع",      icon: "heart-circle-outline", route: "/volunteer",        color: Colors.primary },
      { title: "المسابقات",   icon: "trophy-outline",     route: "/contests",           color: Colors.accent  },
      { title: "الجاليات",    icon: "earth-outline",      route: "/(tabs)/communities", color: Colors.cyber   },
      { title: "التقييمات",   icon: "star-outline",       route: "/(tabs)/ratings",     color: Colors.accent  },
    ],
  },
  {
    label: "تعليم وعمل",
    items: [
      { title: "المكتبة المنهجية", icon: "library-outline", route: "/curriculum",          color: "#2A6FA8"      },
      { title: "مساحة الطالب والمعلم", icon: "school-outline", route: "/edu-hub",          color: "#2F7D6D"      },
      { title: "الطلاب والمعلمون", icon: "school-outline", route: "/(tabs)/student",     color: Colors.cyber   },
      { title: "الوظائف",     icon: "briefcase-outline",  route: "/(tabs)/jobs",        color: Colors.accent  },
      { title: "منشئ السيرة الذاتية", icon: "document-text-outline", route: "/(tabs)/cv-builder", color: "#2F8A8A" },
    ],
  },
  {
    label: "تسوّق ومطاعم",
    items: [
      { title: "متاجر المجتمع",   icon: "bag-handle-outline",    route: "/stores",             color: Colors.accent  },
      { title: "المطاعم والكافيهات", icon: "restaurant-outline", route: "/(tabs)/restaurants", color: "#F97316"      },
      { title: "سوق المتاجر",     icon: "cart-outline",          route: "/(tabs)/product-showcase", color: Colors.cyber },
    ],
  },
  {
    label: "اقتصاد وترفيه",
    items: [
      { title: "السوق",          icon: "storefront-outline",    route: "/(tabs)/market",      color: Colors.accent  },
      { title: "السوق الزراعي", icon: "leaf-outline",           route: "/(tabs)/farmers",     color: "#4ADE80"      },
      { title: "الإعلانات",     icon: "megaphone-outline",      route: "/(tabs)/ads",         color: "#F0A500"      },
      { title: "الرياضة",       icon: "football-outline",       route: "/(tabs)/sports",      color: Colors.primary },
      { title: "الثقافة",       icon: "color-palette-outline",  route: "/(tabs)/culture",     color: "#5B8DB8"      },
      { title: "التأجير — عقارات ومعدات", icon: "home-outline", route: "/(tabs)/rental",     color: "#3E9CBF"      },
    ],
  },
  {
    label: "المناسبات والتكريم",
    items: [
      { title: "الفعاليات والتأجير", icon: "calendar-outline",  route: "/(tabs)/events",    color: "#F0A500"  },
      { title: "مساحة التهنئة",    icon: "sparkles-outline",  route: "/(tabs)/greetings", color: "#D4AF37"  },
      { title: "مناسبتي",          icon: "gift-outline",       route: "/(tabs)/occasions", color: "#D97706"  },
      { title: "قاعة التكريم",     icon: "trophy-outline",    route: "/(tabs)/honored",   color: "#5B8DB8"  },
      { title: "زواجل — أرسل هديتك", icon: "gift-outline",    route: "/(tabs)/zawajil",   color: "#C46A3A"  },
    ],
  },
  {
    label: "نقل وتوصيل",
    items: [
      { title: "مشاويرك علينا وخدمات التوصيل", icon: "car-outline", route: "/(tabs)/transport", color: "#F97316", isTransport: true },
      { title: "تذاكر السفر بين المدن", icon: "airplane-outline", route: "/(tabs)/travel", color: "#0EA5E9" },
    ],
  },
  {
    label: "دليل المدينة",
    items: [
      { title: "شركات الاتصالات", icon: "cellular-outline", route: "/(tabs)/telecom", color: "#0EA5E9" },
      { title: "المصانع والإنتاج المحلي", icon: "hardware-chip-outline", route: "/(tabs)/factories", color: "#F97316" },
      { title: "النقابات المهنية", icon: "people-circle-outline", route: "/(tabs)/unions", color: "#1F5C8A" },
      { title: "معرض التصاميم", icon: "color-palette-outline", route: "/(tabs)/design-gallery", color: "#3B78A6" },
    ],
  },
  {
    // Partners sign in inside these portals with their own accounts, so they stay
    // reachable — but grouped here instead of mixed into consumer services.
    label: "بوابات الشركاء",
    items: [
      { title: "بوابة التاجر",     icon: "storefront-outline", route: "/store-portal",           color: Colors.primary },
      { title: "بوابة مدير زواجل", icon: "shield-outline",     route: "/(tabs)/zawajil-manager", color: "#C46A3A" },
    ],
  },
  {
    label: "أدوات",
    items: [
      { title: "خريطة المدينة",         icon: "map-outline",              route: "/(tabs)/map",        color: "#0EA5E9"       },
      { title: "التقويم الميلادي",       icon: "calendar-number-outline",  route: "/(tabs)/calendar",   color: Colors.cyber   },
      { title: "الآذان والتقويم الهجري", icon: "moon-outline",             route: "/(tabs)/prayer",     color: "#5B8DB8"      },
      { title: "أرقام مهمة",            icon: "call-outline",             route: "/(tabs)/numbers",    color: Colors.primary },
      { title: "المساعد الذكي",         icon: "sparkles",                  route: "/(tabs)/ai-support", color: Colors.accent  },
      { title: "الإعدادات",             icon: "settings-outline",          route: "/(tabs)/settings",   color: Colors.textMuted },
    ],
  },
];

const TRANSPORT_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  available:    { label: "متاح",   color: Colors.primaryDeep, bg: Colors.primary + "18", border: Colors.primary + "45" },
  soon:         { label: "قريباً", color: "#946B00", bg: Colors.accentSoft, border: "#E8A90055" },
  maintenance:  { label: "صيانة",  color: "#B42323", bg: "#FDECEC", border: "#D9363640" },
};

export default function DrawerMenu() {
  const { isOpen, close, open } = useDrawer();
  const { user, token, isGuest, logout } = useAuth();
  const { ride_status } = useFeatureFlags();
  const insets = useSafeAreaInsets();
  const unreadCount = useApiUnread(isGuest ? null : (token ?? null));
  const progress = useSharedValue(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      progress.value = withSpring(1, { damping: 22, stiffness: 200, mass: 0.8 });
    } else {
      progress.value = withSpring(0, { damping: 22, stiffness: 200, mass: 0.8 }, (done) => {
        if (done) runOnJS(setVisible)(false);
      });
    }
  }, [isOpen]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: interpolate(progress.value, [0, 1], [DRAWER_IS_RTL ? -DRAWER_W : DRAWER_W, 0], Extrapolation.CLAMP),
    }],
  }));

  // ── السحب من الحافة لفتح الدرج ──
  const swipeThreshold = 60; // الحد الأدنى للسحب بالبكسل
  const velocityThreshold = 0.3;

  const edgePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        if (DRAWER_IS_RTL) {
          // السحب من اليسار إلى اليمين
          return g.dx > 10 && Math.abs(g.dy) < 60;
        }
        // السحب من اليمين إلى اليسار
        return g.dx < -10 && Math.abs(g.dy) < 60;
      },
      onPanResponderRelease: (_, g) => {
        const openSwipe = DRAWER_IS_RTL ? (g.dx > swipeThreshold || g.vx > velocityThreshold)
                                        : (g.dx < -swipeThreshold || g.vx < -velocityThreshold);
        if (openSwipe) open();
      },
    })
  ).current;

  const closePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        if (!isOpen) return false;
        if (DRAWER_IS_RTL) return g.dx < -10 && Math.abs(g.dy) < 60;
        return g.dx > 10 && Math.abs(g.dy) < 60;
      },
      onPanResponderRelease: (_, g) => {
        const closeSwipe = DRAWER_IS_RTL ? (g.dx < -swipeThreshold || g.vx < -velocityThreshold)
                                         : (g.dx > swipeThreshold || g.vx > velocityThreshold);
        if (closeSwipe) close();
      },
    })
  ).current;

  function navigate(route: string) {
    close();
    setTimeout(() => router.push(route as any), 120);
  }

  const displayName = isGuest ? "زائر" : (user?.name ?? "");
  const initial     = isGuest ? "ز" : (user?.name?.charAt(0) || "؟");
  const adminUnread = useAdminUnread();
  const roleLabel   = user?.role === "admin" ? "مسؤول" : user?.role === "moderator" ? "مشرف" : null;

  const EDGE_ZONE = 28;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

      {/* ── شريط الحافة الشفاف لاكتشاف السحب (دائم الظهور) ── */}
      {!isOpen && (
        <View
          style={[
            styles.edgeStrip,
            DRAWER_IS_RTL ? { left: 0 } : { right: 0 },
            { width: EDGE_ZONE },
          ]}
          {...edgePan.panHandlers}
        />
      )}

      {visible && (
        <>
          {/* الستارة الخلفية */}
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          </Animated.View>

          {/* الدرج — مع دعم السحب للإغلاق */}
          <Animated.View
            style={[styles.drawer, drawerStyle, { paddingTop: insets.top + 8 }]}
            {...closePan.panHandlers}
          >
        {/* زجاج خلفي */}
        {/* خلفية ثابتة بلون المظهر (كان تدرّجاً من الأبيض فيبدو مزعجاً في الوضع الداكن) */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDarkTheme ? Colors.bg : "#FFFFFF" }]} />
        {/* ── رأس الدرج ── */}
        <View style={[styles.header, { overflow: "hidden" }]}>
          <BrandPattern variant="header" opacity={0.04} />

          {/* زر الإغلاق */}
          <Pressable onPress={close} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>

          {/* الشعار + اسم التطبيق */}
          <View style={styles.appRow}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={styles.appName}>حصاحيصاوي</Text>
              <Text style={styles.appTagline}>مدينة الحصاحيصا · السودان</Text>
            </View>
          </View>

          {/* ملف المستخدم */}
          <Pressable
            style={({ pressed }) => [styles.userCard, pressed && !isGuest && { opacity: 0.9 }]}
            disabled={isGuest}
            onPress={() => navigate("/profile")}
            accessibilityRole={isGuest ? undefined : "button"}
            accessibilityLabel={isGuest ? undefined : "عرض ملفي الشخصي"}
          >
            <LinearGradient
              colors={[Colors.primary + "18", Colors.cardBgElevated]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            {!isGuest && user?.avatar_url ? (
              <View style={[styles.avatar, { overflow: "hidden" }]}>
                <Image source={{ uri: user.avatar_url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              </View>
            ) : (
              <View style={[styles.avatar, isGuest && { backgroundColor: withAlpha(Colors.textMuted, "30"), borderColor: withAlpha(Colors.textMuted, "40") }]}>
                <Text style={[styles.avatarText, isGuest && { color: Colors.textMuted }]}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={2}>{displayName}</Text>
              {user?.neighborhood ? (
                <View style={styles.userDetail}>
                  <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                  <Text style={styles.userDetailText}>{user.neighborhood}</Text>
                </View>
              ) : null}
              {!isGuest && (
                <View style={styles.userDetail}>
                  <Text style={[styles.userDetailText, { color: Colors.primary, fontFamily: "Cairo_600SemiBold" }]}>عرض ملفي وتعديل بياناتي</Text>
                  <Ionicons name="chevron-back" size={11} color={Colors.primary} />
                </View>
              )}
            </View>
            {roleLabel && (
              <View style={[styles.roleBadge, { backgroundColor: Colors.primary }]}>
                <Ionicons name="shield-checkmark" size={11} color="#fff" />
                <Text style={styles.roleBadgeText}>{roleLabel}</Text>
              </View>
            )}
            {isGuest && (
              <Pressable
                style={({ pressed }) => [styles.guestLoginBtn, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel="تسجيل الدخول أو إنشاء حساب"
                onPress={() => { close(); setTimeout(() => { logout(); }, 120); }}
              >
                <Ionicons name="log-in-outline" size={14} color="#fff" />
                <Text style={styles.guestLoginText}>تسجيل الدخول</Text>
              </Pressable>
            )}
          </Pressable>
        </View>

        <View style={styles.divider} />

        {/* الأقسام */}
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {GROUPS.map((group) => {
            // فلتر العناصر النسائية — لا تظهر للرجال
            const visibleItems = group.items.filter(item => {
              if (!item.femaleOnly) return true;
              return user?.gender !== "male" || user?.role === "admin";
            });
            if (visibleItems.length === 0) return null;
            return (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {visibleItems.map((item) => {
                const isChatItem = item.route === "/(tabs)/chat";
                const showBadge = isChatItem && unreadCount > 0;
                return (
                  <Pressable
                    key={item.route}
                    style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                    onPress={() => navigate(item.route)}
                  >
                    <View style={[styles.iconBox, { backgroundColor: (item.color ?? Colors.primary) + "1A" }]}>
                      <Ionicons name={item.icon} size={20} color={item.color ?? Colors.primary} />
                    </View>
                    <Text style={styles.itemLabel}>{item.title}</Text>
                    {item.isTransport && (() => {
                      const tb = TRANSPORT_BADGE[ride_status] ?? TRANSPORT_BADGE.soon;
                      return (
                        <View style={[styles.soonChip, { backgroundColor: tb.bg, borderColor: tb.border }]}>
                          <Text style={[styles.soonChipText, { color: tb.color }]}>{tb.label}</Text>
                        </View>
                      );
                    })()}
                    {item.soon && !item.isTransport && (
                      <View style={styles.soonChip}>
                        <Text style={styles.soonChipText}>قريباً</Text>
                      </View>
                    )}
                    {showBadge && (
                      <View style={styles.drawerBadge}>
                        <Text style={styles.drawerBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                      </View>
                    )}
                    <Ionicons name="chevron-back" size={16} color={Colors.textMuted} style={styles.chevron} />
                  </Pressable>
                );
              })}
            </View>
            );
          })}

          {/* ── قسم الإدارة (للمديرين والمشرفين فقط) ── */}
          {(user?.role === "admin" || user?.role === "moderator") && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>الإدارة</Text>
              <Pressable
                style={({ pressed }) => [styles.item, styles.adminItem, pressed && styles.itemPressed]}
                onPress={() => navigate("/admin")}
              >
                <View style={[styles.iconBox, { backgroundColor: "#E74C3C1A" }]}>
                  <Ionicons name="shield" size={20} color="#E74C3C" />
                </View>
                <Text style={[styles.itemLabel, { color: "#E74C3C" }]}>لوحة الإدارة</Text>
                <Ionicons name="chevron-back" size={16} color="#E74C3C88" style={styles.chevron} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={() => navigate("/admin-requests")}
              >
                <View style={[styles.iconBox, { backgroundColor: "#E8A9001F" }]}>
                  <Ionicons name="notifications" size={20} color="#B78200" />
                </View>
                <Text style={[styles.itemLabel, { color: "#7A5A00" }]}>مركز الطلبات</Text>
                {adminUnread > 0 && (
                  <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: "#D93636", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                    <Text style={{ color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 11 }}>{adminUnread > 99 ? "99+" : adminUnread}</Text>
                  </View>
                )}
                <Ionicons name="chevron-back" size={16} color="#B7820088" style={styles.chevron} />
              </Pressable>
            </View>
          )}
        </ScrollView>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  edgeStrip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    zIndex: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: isDarkTheme ? "rgba(0,0,0,0.55)" : "rgba(20,44,37,0.35)",
  },
  drawer: {
    position: "absolute",
    top: 0, bottom: 0,
    ...(DRAWER_IS_RTL ? { left: 0 } : { right: 0 }),
    width: DRAWER_W,
    overflow: "hidden",
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    shadowColor: "#0F2A20",
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 32,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 14,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: Colors.bgDeep ?? Colors.bgDeep,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  logo: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  appName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: Colors.textPrimary,
  },
  appTagline: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  userCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 11,
    borderRadius: 18, overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 13,
    backgroundColor: Colors.cardBg,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: Colors.primary + "14",
    borderWidth: 1.5, borderColor: Colors.primary + "40",
    alignItems: "center", justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18, color: Colors.primary,
  },
  userName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  userDetail: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  userDetailText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  guestLoginBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  guestLoginText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#fff",
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  roleBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11, color: "#fff",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginHorizontal: 10,
    marginBottom: 6,
  },
  scroll: { flex: 1 },
  group: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  groupLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
    color: Colors.primaryDeep ?? "#006B4A",
    letterSpacing: 1.0,
    textTransform: "uppercase",
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 13,
    marginBottom: 1,
  },
  adminItem: {
    borderColor: "rgba(217,54,54,0.25)",
    borderWidth: 1,
    borderRadius: 13,
    marginBottom: 2,
    backgroundColor: "rgba(231,76,60,0.04)",
  },
  itemPressed: {
    backgroundColor: Colors.primary + "10",
    borderWidth: 0,
  },
  iconBox: {
    width: 36, height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
  itemLabel: {
    flex: 1,
    fontFamily: "Cairo_500Medium",
    fontSize: 13.5,
    color: Colors.textPrimary,
  },
  chevron: {
    opacity: 0.45,
  },
  drawerBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#E05567",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    marginRight: 4,
  },
  drawerBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: "#fff",
    lineHeight: 14,
  },
  soonChip: {
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: "#E8A90055",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginRight: 4,
  },
  soonChipText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: "#946B00",
  },
});
