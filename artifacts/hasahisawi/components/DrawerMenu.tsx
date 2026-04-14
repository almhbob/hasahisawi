import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Image, Platform, Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, runOnJS, interpolate, Extrapolation,
} from "react-native-reanimated";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useDrawer } from "@/lib/drawer-context";
import { useAuth } from "@/lib/auth-context";
import BrandPattern from "@/components/BrandPattern";
import { useApiUnread } from "@/lib/api-chat";

const { width: SCREEN_W } = Dimensions.get("window");
const DRAWER_W = Math.min(SCREEN_W * 0.82, 320);

const LOGO = require("@/assets/images/logo.png");

type Section = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color?: string;
  soon?: boolean;
};

type Group = { label: string; items: Section[] };

const GROUPS: Group[] = [
  {
    label: "الرئيسية",
    items: [
      { title: "الرئيسية",    icon: "home-outline",       route: "/(tabs)/",            color: Colors.primary },
      { title: "البحث",       icon: "search-outline",     route: "/(tabs)/search",      color: Colors.cyber   },
    ],
  },
  {
    label: "صحة ومواعيد",
    items: [
      { title: "الطب والصحة",  icon: "medkit-outline",     route: "/(tabs)/medical",     color: "#E05567"      },
      { title: "حجز موعد",    icon: "calendar-outline",   route: "/(tabs)/appointments",color: Colors.accent  },
    ],
  },
  {
    label: "خدمات مجتمعية",
    items: [
      { title: "بلاغات",      icon: "megaphone-outline",  route: "/(tabs)/reports",     color: Colors.accent  },
      { title: "المفقودون",   icon: "eye-outline",        route: "/(tabs)/missing",     color: Colors.cyber   },
      { title: "المجتمع",     icon: "chatbubbles-outline",route: "/(tabs)/social",      color: Colors.primary },
      { title: "الدردشة",     icon: "chatbubble-outline", route: "/(tabs)/chat",        color: Colors.primary },
      { title: "ركن المرأة",  icon: "flower-outline",     route: "/(tabs)/women",       color: "#C084FC"      },
      { title: "المنظمات",    icon: "people-outline",     route: "/(tabs)/orgs",        color: Colors.primary },
      { title: "الجاليات",    icon: "earth-outline",      route: "/(tabs)/communities", color: Colors.cyber   },
      { title: "التقييمات",   icon: "star-outline",       route: "/(tabs)/ratings",     color: Colors.accent  },
    ],
  },
  {
    label: "تعليم وعمل",
    items: [
      { title: "الطلاب",      icon: "school-outline",     route: "/(tabs)/student",     color: Colors.cyber   },
      { title: "الوظائف",     icon: "briefcase-outline",  route: "/(tabs)/jobs",        color: Colors.accent  },
    ],
  },
  {
    label: "اقتصاد وترفيه",
    items: [
      { title: "السوق",        icon: "storefront-outline", route: "/(tabs)/market",      color: Colors.accent  },
      { title: "الإعلانات",    icon: "megaphone-outline",  route: "/(tabs)/ads",         color: "#F0A500"      },
      { title: "الرياضة",     icon: "football-outline",   route: "/(tabs)/sports",      color: Colors.primary },
      { title: "الثقافة",     icon: "color-palette-outline",route: "/(tabs)/culture",   color: "#C084FC"      },
    ],
  },
  {
    label: "المناسبات والتكريم",
    items: [
      { title: "الفعاليات والتأجير", icon: "calendar-outline",  route: "/(tabs)/events",    color: "#F0A500"  },
      { title: "مساحة التهنئة",    icon: "sparkles-outline",  route: "/(tabs)/greetings", color: "#D4AF37"  },
      { title: "مناسبتي",          icon: "gift-outline",       route: "/(tabs)/occasions", color: "#D97706"  },
      { title: "قاعة التكريم",     icon: "trophy-outline",    route: "/(tabs)/honored",   color: "#C084FC"  },
    ],
  },
  {
    label: "نقل وتوصيل",
    items: [
      { title: "مشاويرك علينا وخدمات التوصيل", icon: "car-outline", route: "/(tabs)/transport", color: "#F97316", soon: true },
    ],
  },
  {
    label: "أدوات",
    items: [
      { title: "خريطة المدينة",         icon: "map-outline",              route: "/(tabs)/map",        color: "#0EA5E9"       },
      { title: "التقويم الميلادي",       icon: "calendar-number-outline",  route: "/(tabs)/calendar",   color: Colors.cyber   },
      { title: "الآذان والتقويم الهجري", icon: "moon-outline",             route: "/(tabs)/prayer",     color: "#818CF8"      },
      { title: "أرقام مهمة",            icon: "call-outline",             route: "/(tabs)/numbers",    color: Colors.primary },
      { title: "المساعد الذكي",         icon: "sparkles",                  route: "/(tabs)/ai-support", color: Colors.accent  },
      { title: "الإعدادات",             icon: "settings-outline",          route: "/(tabs)/settings",   color: Colors.textMuted },
    ],
  },
];

export default function DrawerMenu() {
  const { isOpen, close } = useDrawer();
  const { user, token, isGuest } = useAuth();
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
      translateX: interpolate(progress.value, [0, 1], [DRAWER_W, 0], Extrapolation.CLAMP),
    }],
  }));

  if (!visible) return null;

  function navigate(route: string) {
    close();
    setTimeout(() => router.push(route as any), 120);
  }

  const displayName = isGuest ? "زائر" : (user?.name ?? "");
  const initial     = isGuest ? "ز" : (user?.name?.charAt(0) || "؟");
  const roleLabel   = user?.role === "admin" ? "مشرف" : user?.role === "moderator" ? "مراقب" : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* الستارة الخلفية */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      {/* الدرج */}
      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: insets.top + 8 }]}>
        {/* ── رأس الدرج ── */}
        <View style={[styles.header, { overflow: "hidden" }]}>
          <BrandPattern variant="header" opacity={0.06} />

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
          <View style={styles.userCard}>
            <LinearGradient
              colors={[Colors.primary + "18", Colors.cardBgElevated]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.avatar, isGuest && { backgroundColor: Colors.textMuted + "30", borderColor: Colors.textMuted + "40" }]}>
              <Text style={[styles.avatarText, isGuest && { color: Colors.textMuted }]}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
              {user?.neighborhood ? (
                <View style={styles.userDetail}>
                  <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                  <Text style={styles.userDetailText}>{user.neighborhood}</Text>
                </View>
              ) : user?.phone ? (
                <View style={styles.userDetail}>
                  <Ionicons name="call-outline" size={11} color={Colors.textMuted} />
                  <Text style={styles.userDetailText}>{user.phone}</Text>
                </View>
              ) : null}
            </View>
            {roleLabel && (
              <View style={[styles.roleBadge, { backgroundColor: Colors.primary }]}>
                <Ionicons name="shield-checkmark" size={11} color="#000" />
                <Text style={styles.roleBadgeText}>{roleLabel}</Text>
              </View>
            )}
            {isGuest && (
              <View style={[styles.roleBadge, { backgroundColor: Colors.textMuted + "30" }]}>
                <Text style={[styles.roleBadgeText, { color: Colors.textMuted }]}>زائر</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* الأقسام */}
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {GROUPS.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.items.map((item) => {
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
                    {item.soon && (
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
          ))}

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
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.60)",
  },
  drawer: {
    position: "absolute",
    top: 0, right: 0, bottom: 0,
    width: DRAWER_W,
    backgroundColor: "#0D1910",
    borderLeftWidth: 1,
    borderLeftColor: Colors.primary + "28",
    shadowColor: "#000",
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 28,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 14,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: Colors.cardBg,
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
    backgroundColor: "#fff",
  },
  appName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: Colors.textPrimary,
  },
  appTagline: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  userCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 11,
    borderRadius: 16, overflow: "hidden",
    borderWidth: 1, borderColor: Colors.primary + "25",
    paddingHorizontal: 14, paddingVertical: 12,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: Colors.primary + "28",
    borderWidth: 1.5, borderColor: Colors.primary + "60",
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
    fontSize: 11,
    color: Colors.textMuted,
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
    fontSize: 10, color: "#000",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginHorizontal: 6,
    marginBottom: 6,
  },
  scroll: { flex: 1 },
  group: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  groupLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  adminItem: {
    borderColor: "#E74C3C30",
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 2,
  },
  itemPressed: {
    backgroundColor: Colors.cardBg,
  },
  iconBox: {
    width: 36, height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  itemLabel: {
    flex: 1,
    fontFamily: "Cairo_500Medium",
    fontSize: 14,
    color: Colors.textPrimary,
  },
  chevron: {
    opacity: 0.5,
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
    fontSize: 10,
    color: "#fff",
    lineHeight: 14,
  },
  soonChip: {
    backgroundColor: "#FBBF2418",
    borderWidth: 1,
    borderColor: "#FBBF2445",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginRight: 4,
  },
  soonChipText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: "#FBBF24",
  },
});
