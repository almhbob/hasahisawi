import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Image, Platform, Dimensions,
} from "react-native";
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

const { width: SCREEN_W } = Dimensions.get("window");
const DRAWER_W = Math.min(SCREEN_W * 0.82, 320);

const LOGO = require("@/assets/images/logo.png");

type Section = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color?: string;
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
      { title: "ركن المرأة",  icon: "flower-outline",     route: "/(tabs)/women",       color: "#C084FC"      },
      { title: "المنظمات",    icon: "people-outline",     route: "/(tabs)/orgs",        color: Colors.primary },
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
      { title: "الرياضة",     icon: "football-outline",   route: "/(tabs)/sports",      color: Colors.primary },
      { title: "الثقافة",     icon: "color-palette-outline",route: "/(tabs)/culture",   color: "#C084FC"      },
    ],
  },
  {
    label: "أدوات",
    items: [
      { title: "التقويم",     icon: "calendar-number-outline",route: "/(tabs)/calendar",color: Colors.cyber   },
      { title: "أرقام مهمة", icon: "call-outline",       route: "/(tabs)/numbers",     color: Colors.primary },
    ],
  },
];

export default function DrawerMenu() {
  const { isOpen, close } = useDrawer();
  const { user, isGuest } = useAuth();
  const insets = useSafeAreaInsets();
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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* الستارة الخلفية */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      {/* الدرج */}
      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: insets.top + 12 }]}>
        {/* الرأس */}
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={styles.appName}>حصاحيصاوي</Text>
              {displayName ? (
                <Text style={styles.userName}>{displayName}</Text>
              ) : null}
            </View>
          </View>
          <Pressable onPress={close} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </Pressable>
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
              {group.items.map((item) => (
                <Pressable
                  key={item.route}
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                  onPress={() => navigate(item.route)}
                >
                  <View style={[styles.iconBox, { backgroundColor: (item.color ?? Colors.primary) + "1A" }]}>
                    <Ionicons name={item.icon} size={20} color={item.color ?? Colors.primary} />
                  </View>
                  <Text style={styles.itemLabel}>{item.title}</Text>
                  <Ionicons name="chevron-back" size={16} color={Colors.textMuted} style={styles.chevron} />
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawer: {
    position: "absolute",
    top: 0, right: 0, bottom: 0,
    width: DRAWER_W,
    backgroundColor: "#0F1E16",
    borderLeftWidth: 1,
    borderLeftColor: Colors.primary + "30",
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 40, height: 40, borderRadius: 10,
  },
  appName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: Colors.textPrimary,
  },
  userName: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: Colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginHorizontal: 20,
    marginBottom: 8,
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
});
