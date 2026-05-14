import { Tabs } from "expo-router";
import {
  Platform, StyleSheet, View, Pressable, Text, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { DrawerProvider, useDrawer } from "@/lib/drawer-context";
import DrawerMenu from "@/components/DrawerMenu";
import { useAuth } from "@/lib/auth-context";
import { useApiUnread } from "@/lib/api-chat";
import { router } from "expo-router";

// ── فحص Liquid Glass بأمان تام (iOS 26 فقط) ───────────────────
function tryIsLiquidGlassAvailable(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    const mod = require("expo-glass-effect");
    return typeof mod?.isLiquidGlassAvailable === "function"
      ? mod.isLiquidGlassAvailable()
      : false;
  } catch {
    return false;
  }
}

const USE_LIQUID_GLASS = tryIsLiquidGlassAvailable();

// ── أنواع ─────────────────────────────────────────────────────────
type TabItem = {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  color: string;
};

type ShortcutItem = {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

// ── اختصارات سريعة — الأقسام المخفية ──────────────────────────
const QUICK_SHORTCUTS: ShortcutItem[] = [
  { name: "social",         label: "المجتمع",    icon: "chatbubbles-outline",  color: Colors.primary },
  { name: "medical",        label: "الطب",       icon: "medkit-outline",        color: "#E05567"      },
  { name: "market",         label: "السوق",      icon: "storefront-outline",    color: "#F59E0B"      },
  { name: "jobs",           label: "الوظائف",    icon: "briefcase-outline",     color: "#3E9CBF"      },
  { name: "sports",         label: "الرياضة",    icon: "football-outline",      color: "#22C55E"      },
  { name: "missing",        label: "المفقودون",  icon: "eye-outline",           color: "#A78BFA"      },
  { name: "transport",      label: "المواصلات",  icon: "car-sport-outline",     color: "#F97316"      },
  { name: "ads",            label: "الإعلانات",  icon: "megaphone-outline",     color: "#F0A500"      },
  { name: "design-gallery", label: "التصاميم",   icon: "color-palette-outline", color: "#A855F7"      },
  { name: "student",        label: "الطلاب",     icon: "school-outline",        color: "#60A5FA"      },
  { name: "women",          label: "ركن المرأة", icon: "flower-outline",        color: "#C084FC"      },
  { name: "culture",        label: "الثقافة",    icon: "musical-notes-outline", color: "#EC4899"      },
];

// ── تبويبات رئيسية (4 + زر مركزي) ────────────────────────────
const TAB_ITEMS: TabItem[] = [
  { name: "index",        label: "الرئيسية", icon: "home-outline",        activeIcon: "home",        color: Colors.primary },
  { name: "prayer",       label: "الآذان",   icon: "moon-outline",        activeIcon: "moon",        color: "#818CF8"       },
  { name: "chat",         label: "الدردشة",  icon: "chatbubbles-outline", activeIcon: "chatbubbles", color: "#3E9CBF"       },
  { name: "appointments", label: "مواعيد",   icon: "calendar-outline",    activeIcon: "calendar",    color: "#F97316"       },
];

// ── شريط الاختصارات السريعة ────────────────────────────────────
function QuickShortcutsBar() {
  const currentRoute = "";
  return (
    <View style={styles.shortcutsWrap}>
      <LinearGradient
        colors={["rgba(34,197,94,0.04)", "rgba(10,15,12,0.85)"]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shortcutsContent}
        style={styles.shortcutsScroll}
      >
        {QUICK_SHORTCUTS.map((item) => (
          <Pressable
            key={item.name}
            style={({ pressed }) => [styles.shortcutChip, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(`/(tabs)/${item.name}` as any)}
          >
            <View style={[styles.shortcutIconWrap, { backgroundColor: item.color + "1A" }]}>
              <Ionicons name={item.icon} size={14} color={item.color} />
            </View>
            <Text style={[styles.shortcutLabel, { color: item.color }]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ── شريط تبويب مخصص ─────────────────────────────────────────────
function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const { open } = useDrawer();
  const isWeb = Platform.OS === "web";
  const { token, isGuest } = useAuth();
  const unread = useApiUnread(isGuest ? null : (token ?? null));

  const currentRouteName: string = state.routes[state.index]?.name ?? "";

  return (
    <View style={{ backgroundColor: "transparent" }}>

      {/* شريط الاختصارات السريعة */}
      <QuickShortcutsBar />

      {/* الشريط السفلي الرئيسي */}
      <View style={[styles.tabBar, { paddingBottom: isWeb ? 10 : Math.max(insets.bottom, 10) }]}>

        {/* طبقة الضبابية */}
        {Platform.OS !== "web" && (
          <BlurView
            intensity={Platform.OS === "ios" ? 70 : 28}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* تدرج الخلفية */}
        <LinearGradient
          colors={["rgba(10,20,14,0.97)", "rgba(5,10,7,0.99)"]}
          style={StyleSheet.absoluteFill}
        />

        {/* خط علوي متدرج */}
        <LinearGradient
          colors={["transparent", "rgba(34,197,94,0.35)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.topGradientLine}
        />

        {/* تبويبتا اليسار */}
        {TAB_ITEMS.slice(0, 2).map((item) => {
          const focused = currentRouteName === item.name;
          const isChatTab = item.name === "chat";
          return (
            <Pressable
              key={item.name}
              style={styles.tabItem}
              onPress={() => {
                const route = state.routes.find((r: any) => r.name === item.name);
                if (route) {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigation.navigate(item.name);
                }
              }}
              accessibilityRole="button"
            >
              <View style={[
                styles.iconPill,
                focused && { backgroundColor: item.color + "20", borderColor: item.color + "45" },
              ]}>
                <Ionicons
                  name={focused ? item.activeIcon : item.icon}
                  size={21}
                  color={focused ? item.color : "#5A8A6A"}
                />
                {isChatTab && unread > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{unread > 9 ? "9+" : unread}</Text>
                  </View>
                )}
              </View>
              <Text style={[
                styles.tabLabel,
                focused && { color: item.color, fontFamily: "Cairo_700Bold" },
              ]}>
                {item.label}
              </Text>
              {focused && <View style={[styles.activeBar, { backgroundColor: item.color }]} />}
            </Pressable>
          );
        })}

        {/* ── زر القائمة المركزي FAB ── */}
        <Pressable
          style={styles.fabWrap}
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="القائمة الرئيسية"
        >
          <LinearGradient
            colors={[Colors.primary + "EE", "#16A34A"]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.fabGradient}
          >
            <Ionicons name="grid-outline" size={23} color="#fff" />
          </LinearGradient>
          <View style={styles.fabGlow} />
          <Text style={styles.fabLabel}>القائمة</Text>
        </Pressable>

        {/* تبويبتا اليمين */}
        {TAB_ITEMS.slice(2).map((item) => {
          const focused = currentRouteName === item.name;
          const isChatTab = item.name === "chat";
          return (
            <Pressable
              key={item.name}
              style={styles.tabItem}
              onPress={() => {
                const route = state.routes.find((r: any) => r.name === item.name);
                if (route) {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigation.navigate(item.name);
                }
              }}
              accessibilityRole="button"
            >
              <View style={[
                styles.iconPill,
                focused && { backgroundColor: item.color + "20", borderColor: item.color + "45" },
              ]}>
                <Ionicons
                  name={focused ? item.activeIcon : item.icon}
                  size={21}
                  color={focused ? item.color : "#5A8A6A"}
                />
                {isChatTab && unread > 0 && (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{unread > 9 ? "9+" : unread}</Text>
                  </View>
                )}
              </View>
              <Text style={[
                styles.tabLabel,
                focused && { color: item.color, fontFamily: "Cairo_700Bold" },
              ]}>
                {item.label}
              </Text>
              {focused && <View style={[styles.activeBar, { backgroundColor: item.color }]} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Native iOS Liquid Glass tabs ─────────────────────────────────
function NativeTabLayout() {
  const { t } = useLang();
  try {
    const { NativeTabs, Icon, Label } = require("expo-router/unstable-native-tabs");
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <Icon sf={{ default: "house", selected: "house.fill" }} />
          <Label>{t("tabs", "home")}</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="prayer">
          <Icon sf={{ default: "moon", selected: "moon.fill" }} />
          <Label>الآذان</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="chat">
          <Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} />
          <Label>الدردشة</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="appointments">
          <Icon sf={{ default: "calendar.badge.plus", selected: "calendar.badge.plus" }} />
          <Label>مواعيد</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  } catch {
    return <ClassicTabLayout />;
  }
}

// ── Classic (Android / Web / iOS fallback) ───────────────────────
function ClassicTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
      sceneContainerStyle={{ backgroundColor: "#0A0F0C" }}
    >
      <Tabs.Screen name="index"        />
      <Tabs.Screen name="prayer"       />
      <Tabs.Screen name="chat"         />
      <Tabs.Screen name="appointments" />
      <Tabs.Screen name="medical"     options={{ href: null }} />
      <Tabs.Screen name="reports"     options={{ href: null }} />
      <Tabs.Screen name="search"      options={{ href: null }} />
      <Tabs.Screen name="missing"     options={{ href: null }} />
      <Tabs.Screen name="student"     options={{ href: null }} />
      <Tabs.Screen name="jobs"        options={{ href: null }} />
      <Tabs.Screen name="market"      options={{ href: null }} />
      <Tabs.Screen name="sports"      options={{ href: null }} />
      <Tabs.Screen name="culture"     options={{ href: null }} />
      <Tabs.Screen name="social"      options={{ href: null }} />
      <Tabs.Screen name="women"       options={{ href: null }} />
      <Tabs.Screen name="orgs"        options={{ href: null }} />
      <Tabs.Screen name="ratings"     options={{ href: null }} />
      <Tabs.Screen name="calendar"    options={{ href: null }} />
      <Tabs.Screen name="numbers"     options={{ href: null }} />
      <Tabs.Screen name="settings"    options={{ href: null }} />
      <Tabs.Screen name="ads"         options={{ href: null }} />
      <Tabs.Screen name="communities" options={{ href: null }} />
      <Tabs.Screen name="ai-support"  options={{ href: null }} />
      <Tabs.Screen name="transport"   options={{ href: null }} />
      <Tabs.Screen name="occasions"   options={{ href: null }} />
      <Tabs.Screen name="honored"     options={{ href: null }} />
      <Tabs.Screen name="greetings"   options={{ href: null }} />
      <Tabs.Screen name="events"      options={{ href: null }} />
      <Tabs.Screen name="design-gallery" options={{ href: null }} />
      <Tabs.Screen name="zawajil"     options={{ href: null }} />
      <Tabs.Screen name="telecom"     options={{ href: null }} />
    </Tabs>
  );
}

// ── Root with drawer ─────────────────────────────────────────────
function LayoutWithDrawer() {
  return (
    <>
      {USE_LIQUID_GLASS ? <NativeTabLayout /> : <ClassicTabLayout />}
      <DrawerMenu />
    </>
  );
}

export default function TabLayout() {
  return (
    <DrawerProvider>
      <LayoutWithDrawer />
    </DrawerProvider>
  );
}

// ── الأنماط ───────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // شريط الاختصارات
  shortcutsWrap: {
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  shortcutsScroll: {
    flexGrow: 0,
  },
  shortcutsContent: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 7,
  },
  shortcutChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 0.8,
    borderColor: "rgba(255,255,255,0.10)",
  },
  shortcutIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
  },

  // الشريط السفلي
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(5,10,7,0.96)",
    borderTopWidth: 0,
    paddingTop: 8,
  },
  topGradientLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },

  // تبويب عادي
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingTop: 2,
    position: "relative",
  },
  iconPill: {
    width: 46,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 10,
    color: "rgba(90,138,106,0.85)",
  },
  activeBar: {
    position: "absolute",
    bottom: -10,
    width: 20,
    height: 3,
    borderRadius: 2,
    opacity: 0,
  },

  // شارة الدردشة
  tabBadge: {
    position: "absolute",
    top: -3,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#E05567",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "rgba(5,10,8,0.97)",
  },
  tabBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 8.5,
    color: "#fff",
    lineHeight: 11,
  },

  // زر القائمة FAB
  fabWrap: {
    alignItems: "center",
    gap: 3,
    paddingTop: 2,
    width: 68,
  },
  fabGradient: {
    width: 52,
    height: 40,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  fabGlow: {
    position: "absolute",
    top: 2,
    width: 52,
    height: 40,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    opacity: 0.12,
    transform: [{ scaleX: 1.15 }, { scaleY: 1.3 }],
    zIndex: -1,
  },
  fabLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: Colors.primary,
  },
});
