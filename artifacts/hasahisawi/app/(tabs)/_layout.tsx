import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";
import { DrawerProvider, useDrawer } from "@/lib/drawer-context";
import DrawerMenu from "@/components/DrawerMenu";

// ── شريط تبويب مخصص ─────────────────────────────────────────────
type TabItem = {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
};

const TAB_ITEMS: TabItem[] = [
  { name: "index",        label: "الرئيسية", icon: "home-outline",     activeIcon: "home"       },
  { name: "search",       label: "بحث",      icon: "search-outline",   activeIcon: "search"     },
  { name: "medical",      label: "الطب",     icon: "medkit-outline",   activeIcon: "medkit"     },
  { name: "reports",      label: "بلاغات",   icon: "megaphone-outline",activeIcon: "megaphone"  },
  { name: "appointments", label: "مواعيد",   icon: "calendar-outline", activeIcon: "calendar"   },
];

function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const { open } = useDrawer();
  const isWeb = Platform.OS === "web";

  return (
    <View style={[
      styles.tabBar,
      { paddingBottom: isWeb ? 8 : Math.max(insets.bottom, 8) }
    ]}>
      {TAB_ITEMS.map((item, idx) => {
        const focused = state.index === idx;
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
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons
                name={focused ? item.activeIcon : item.icon}
                size={22}
                color={focused ? Colors.primary : "#8BBDA2"}
              />
            </View>
            <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}

      {/* زر القائمة الجانبية */}
      <Pressable style={styles.tabItem} onPress={open}>
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
      <NativeTabs.Trigger name="search">
        <Icon sf={{ default: "magnifyingglass", selected: "magnifyingglass" }} />
        <Label>بحث</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="medical">
        <Icon sf={{ default: "cross.case", selected: "cross.case.fill" }} />
        <Label>{t("tabs", "medical")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="reports">
        <Icon sf={{ default: "exclamationmark.bubble", selected: "exclamationmark.bubble.fill" }} />
        <Label>بلاغات</Label>
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
      <Tabs.Screen name="search"       />
      <Tabs.Screen name="medical"      />
      <Tabs.Screen name="reports"      />
      <Tabs.Screen name="appointments" />
      <Tabs.Screen name="missing"      options={{ href: null }} />
      <Tabs.Screen name="student"      options={{ href: null }} />
      <Tabs.Screen name="jobs"         options={{ href: null }} />
      <Tabs.Screen name="market"       options={{ href: null }} />
      <Tabs.Screen name="sports"       options={{ href: null }} />
      <Tabs.Screen name="culture"      options={{ href: null }} />
      <Tabs.Screen name="social"       options={{ href: null }} />
      <Tabs.Screen name="women"        options={{ href: null }} />
      <Tabs.Screen name="orgs"         options={{ href: null }} />
      <Tabs.Screen name="calendar"     options={{ href: null }} />
      <Tabs.Screen name="numbers"      options={{ href: null }} />
      <Tabs.Screen name="settings"     options={{ href: null }} />
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
    backgroundColor: "#0F1E16",
    borderTopWidth: 1,
    borderTopColor: Colors.primary + "30",
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  iconWrap: {
    width: 36, height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: {
    backgroundColor: Colors.primary + "18",
  },
  menuBtn: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 10,
    color: "#8BBDA2",
  },
  tabLabelActive: {
    color: Colors.primary,
  },
});
