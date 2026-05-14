import { Tabs } from "expo-router";
import { Platform, StyleSheet, View, Pressable, Text } from "react-native";
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

// ── شريط تبويب مخصص ─────────────────────────────────────────────
type TabItem = {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const TAB_ITEMS: TabItem[] = [
  { name: "index",        label: "الرئيسية", icon: "home-outline",       activeIcon: "home",        color: Colors.primary },
  { name: "prayer",       label: "الآذان",   icon: "moon-outline",       activeIcon: "moon",        color: Colors.sections.prayer.primary },
  { name: "medical",      label: "الطب",     icon: "medkit-outline",     activeIcon: "medkit",      color: Colors.sections.medical.primary },
  { name: "chat",         label: "الدردشة",  icon: "chatbubbles-outline",activeIcon: "chatbubbles", color: Colors.sections.chat.primary },
  { name: "appointments", label: "مواعيد",   icon: "calendar-outline",   activeIcon: "calendar",    color: Colors.sections.appointments.primary },
];

function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const { open } = useDrawer();
  const isWeb = Platform.OS === "web";
  const { user, token, isGuest } = useAuth();
  const unread = useApiUnread(isGuest ? null : (token ?? null));

  return (
    <View style={[styles.tabBar, { paddingBottom: isWeb ? 8 : Math.max(insets.bottom, 8) }]}>
      {Platform.OS !== "web" && (
        <BlurView
          intensity={Platform.OS === "ios" ? 55 : 22}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={["rgba(34,197,94,0.05)", "rgba(5,10,8,0.95)"]}
        style={StyleSheet.absoluteFill}
      />
      {TAB_ITEMS.map((item, idx) => {
        const focused = state.index === idx;
        const isChatTab = item.name === "chat";
        return (
          <Pressable
            key={item.name}
            style={styles.tabItem}
            onPress={() => {
              const event = navigation.emit({ type: "tabPress", target: state.routes[idx]?.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(item.name);
            }}
            accessibilityRole="button"
          >
            <View style={[styles.topIndicator, focused && { backgroundColor: item.color }]} />
            <View style={[
              styles.iconWrap,
              focused && {
                backgroundColor: item.color + "22",
                borderWidth: 1,
                borderColor: item.color + "50",
              }
            ]}>
              <Ionicons
                name={focused ? item.activeIcon : item.icon}
                size={22}
                color={focused ? item.color : "#6E9E84"}
              />
              {isChatTab && unread > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {unread > 9 ? "9+" : unread}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, focused && { color: item.color, fontFamily: "Cairo_700Bold" }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}

      <Pressable style={styles.tabItem} onPress={open}>
        <View style={styles.topIndicator} />
        <View style={styles.menuBtn}>
          <Ionicons name="menu" size={22} color={Colors.primary} />
        </View>
        <Text style={[styles.tabLabel, styles.tabLabelActive]}>القائمة</Text>
      </Pressable>
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
        <NativeTabs.Trigger name="medical">
          <Icon sf={{ default: "cross.case", selected: "cross.case.fill" }} />
          <Label>{t("tabs", "medical")}</Label>
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
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0A0F0C" } }}
      sceneContainerStyle={{ backgroundColor: "#0A0F0C" }}
    >
      <Tabs.Screen name="index"        />
      <Tabs.Screen name="prayer"       />
      <Tabs.Screen name="medical"      />
      <Tabs.Screen name="chat"         />
      <Tabs.Screen name="appointments" />
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
      <Tabs.Screen name="map"         options={{ href: null }} />
      <Tabs.Screen name="lawyers"     options={{ href: null }} />
      <Tabs.Screen name="telecom"     options={{ href: null }} />
      <Tabs.Screen name="unions"      options={{ href: null }} />
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

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(5,10,7,0.94)",
    borderTopWidth: 0.5,
    borderTopColor: "rgba(255,255,255,0.09)",
    paddingTop: 7,
  },
  topIndicator: {
    height: 3,
    width: 26,
    borderRadius: 2,
    backgroundColor: "transparent",
    marginBottom: 3,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  iconWrap: {
    width: 44, height: 34,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: Colors.danger ?? "#E05567",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: "rgba(5,10,8,0.95)",
  },
  tabBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 9,
    color: "#fff",
    lineHeight: 12,
  },
  menuBtn: {
    width: 40, height: 36,
    borderRadius: 13,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 10,
    color: "rgba(110,158,132,0.85)",
    letterSpacing: 0.15,
  },
  tabLabelActive: {
    color: Colors.primary,
  },
});
