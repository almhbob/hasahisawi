import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import Colors from "@/constants/colors";
import { useLang } from "@/lib/lang-context";

// التبويبات المرئية في الشريط: 5 فقط
// بقية الأقسام متاحة من الشاشة الرئيسية

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
          borderTopWidth: 1,
          borderTopColor: Colors.divider,
          elevation: 0,
          height: isWeb ? 64 : 58,
          paddingBottom: isWeb ? 8 : 6,
          paddingTop: 6,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.cardBg }]} />
          ),
        tabBarLabelStyle: {
          fontFamily: "Cairo_500Medium",
          fontSize: 10,
        },
      }}
    >
      {/* ── التبويبات الظاهرة ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs", "home"),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "بحث",
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="medical"
        options={{
          title: t("tabs", "medical"),
          tabBarIcon: ({ color, size }) => <Ionicons name="medkit" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "بلاغات",
          tabBarIcon: ({ color, size }) => <Ionicons name="megaphone" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: "مواعيد",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />

      {/* ── التبويبات المخفية من الشريط — متاحة من الرئيسية ── */}
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

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
