import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";

function NativeTabLayout() {
  const { t } = useLang();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>{t("tabs", "home")}</Label>
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
        <Label>حجز موعد</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="missing">
        <Icon sf={{ default: "magnifyingglass.circle", selected: "magnifyingglass.circle.fill" }} />
        <Label>{t("tabs", "missing")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="jobs">
        <Icon sf={{ default: "briefcase", selected: "briefcase.fill" }} />
        <Label>{t("tabs", "jobs")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="market">
        <Icon sf={{ default: "storefront", selected: "storefront.fill" }} />
        <Label>{t("tabs", "market")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="student">
        <Icon sf={{ default: "graduationcap", selected: "graduationcap.fill" }} />
        <Label>{t("tabs", "students")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sports">
        <Icon sf={{ default: "sportscourt", selected: "sportscourt.fill" }} />
        <Label>{t("tabs", "sports")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="culture">
        <Icon sf={{ default: "theatermasks", selected: "theatermasks.fill" }} />
        <Label>{t("tabs", "culture")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="social">
        <Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} />
        <Label>{t("tabs", "community")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="women">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>ركن المرأة</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="orgs">
        <Icon sf={{ default: "heart.circle", selected: "heart.circle.fill" }} />
        <Label>المنظمات</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <Icon sf={{ default: "calendar", selected: "calendar.badge.checkmark" }} />
        <Label>{t("tabs", "calendar")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="numbers">
        <Icon sf={{ default: "phone.circle", selected: "phone.circle.fill" }} />
        <Label>أرقام مهمة</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { t } = useLang();
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : Colors.cardBg,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.divider,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.cardBg }]} />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Cairo_500Medium",
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen name="index"        options={{ title: t("tabs", "home"),      tabBarIcon: ({ color, size }) => <Ionicons name="home"           size={size} color={color} /> }} />
      <Tabs.Screen name="medical"      options={{ title: t("tabs", "medical"),   tabBarIcon: ({ color, size }) => <Ionicons name="medkit"         size={size} color={color} /> }} />
      <Tabs.Screen name="reports"      options={{ title: "بلاغات",               tabBarIcon: ({ color, size }) => <Ionicons name="megaphone"      size={size} color={color} /> }} />
      <Tabs.Screen name="appointments" options={{ title: "حجز موعد",             tabBarIcon: ({ color, size }) => <Ionicons name="calendar"       size={size} color={color} /> }} />
      <Tabs.Screen name="missing"      options={{ title: t("tabs", "missing"),   tabBarIcon: ({ color, size }) => <Ionicons name="search"         size={size} color={color} /> }} />
      <Tabs.Screen name="student"      options={{ title: t("tabs", "students"),  tabBarIcon: ({ color, size }) => <Ionicons name="school"         size={size} color={color} /> }} />
      <Tabs.Screen name="jobs"         options={{ title: t("tabs", "jobs"),      tabBarIcon: ({ color, size }) => <Ionicons name="briefcase"      size={size} color={color} /> }} />
      <Tabs.Screen name="market"       options={{ title: t("tabs", "market"),    tabBarIcon: ({ color, size }) => <Ionicons name="storefront"     size={size} color={color} /> }} />
      <Tabs.Screen name="sports"       options={{ title: t("tabs", "sports"),    tabBarIcon: ({ color, size }) => <Ionicons name="football"       size={size} color={color} /> }} />
      <Tabs.Screen name="culture"      options={{ title: t("tabs", "culture"),   tabBarIcon: ({ color, size }) => <Ionicons name="color-palette"  size={size} color={color} /> }} />
      <Tabs.Screen name="social"       options={{ title: t("tabs", "community"), tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles"    size={size} color={color} /> }} />
      <Tabs.Screen name="women"        options={{ title: "ركن المرأة",            tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} /> }} />
      <Tabs.Screen name="orgs"         options={{ title: t("tabs", "orgs"),      tabBarIcon: ({ color, size }) => <Ionicons name="people"         size={size} color={color} /> }} />
      <Tabs.Screen name="calendar"     options={{ title: t("tabs", "calendar"),  tabBarIcon: ({ color, size }) => <Ionicons name="calendar"       size={size} color={color} /> }} />
      <Tabs.Screen name="numbers"      options={{ title: "أرقام مهمة",           tabBarIcon: ({ color, size }) => <Ionicons name="call"           size={size} color={color} /> }} />
      <Tabs.Screen name="settings"     options={{ title: t("tabs", "admin"), href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
