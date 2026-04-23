import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { Platform, StyleSheet, View, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { DrawerProvider, useDrawer } from "@/lib/drawer-context";
import DrawerMenu from "@/components/DrawerMenu";
import { useAuth } from "@/lib/auth-context";
import { useApiUnread } from "@/lib/api-chat";

// ── شريط تبويب مخصص ─────────────────────────────────────────────
type TabItem = {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  color: string; // لون القسم المخصص
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
    <View style={[
      styles.tabBar,
      { paddingBottom: isWeb ? 8 : Math.max(insets.bottom, 8) }
    ]}>
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
            {/* مؤشر الأعلى */}
            <View style={[styles.topIndicator, focused && { backgroundColor: item.color }]} />
            <View style={[
              styles.iconWrap,
              focused && { backgroundColor: item.color + "1F", borderWidth: 1, borderColor: item.color + "40" }
            ]}>
              <Ionicons
                name={focused ? item.activeIcon : item.icon}
                size={22}
                color={focused ? item.color : "#6E9E84"}
              />
              {/* شارة عدد الرسائل غير المقروءة */}
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

      {/* زر القائمة الجانبية */}
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

// ── Native iOS tabs (Liquid Glass) ───────────────────────────────
function NativeTabLayout() {
  const { t } = useLang();
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
}

// ── Classic (Android / Web) ──────────────────────────────────────
function ClassicTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
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
    </Tabs>
  );
}

// ── Root with drawer ─────────────────────────────────────────────
function LayoutWithDrawer() {
  return (
    <>
      {isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
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
    backgroundColor: "#0C1A10",
    borderTopWidth: 1,
    borderTopColor: Colors.primary + "25",
    paddingTop: 6,
  },
  topIndicator: {
    height: 3,
    width: 22,
    borderRadius: 2,
    backgroundColor: "transparent",
    marginBottom: 4,
  },
  topIndicatorActive: {
    backgroundColor: Colors.primary,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  iconWrap: {
    width: 38, height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: Colors.primary + "1C",
  },
  tabBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger ?? "#E05567",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#0F1E16",
  },
  tabBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 9,
    color: "#fff",
    lineHeight: 12,
  },
  menuBtn: {
    width: 38, height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1.5,
    borderColor: Colors.primary + "50",
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 10,
    color: "#79A890",
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: Colors.primary,
  },
});
