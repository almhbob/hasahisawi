import {
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  useFonts,
} from "@expo-google-fonts/cairo";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import NetworkBanner from "@/components/NetworkBanner";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LangProvider, getStoredLang } from "@/lib/lang-context";
import { FirebaseProvider } from "@/lib/firebase/context";
import { I18nManager, Platform, View } from "react-native";
import type { Lang } from "@/lib/translations";

SplashScreen.preventAutoHideAsync();

// ── بوابة المصادقة — تحجب التطبيق حتى يسجّل المستخدم دخوله ─────
function AuthGate() {
  const { user, isLoading } = useAuth();
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inLogin = segments[0] === "login";
    if (!user) {
      // لا يوجد مستخدم → انتقل لصفحة الدخول
      if (!inLogin) router.replace("/login");
    } else {
      // المستخدم مسجّل → ابتعد عن صفحة الدخول
      if (inLogin) router.replace("/(tabs)/");
    }
  }, [user, isLoading, segments]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <AuthGate />
      <Stack screenOptions={{ headerBackTitle: "رجوع", headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login"  options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="report" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
    ...MaterialCommunityIcons.font,
    ...Ionicons.font,
  });
  const [initialLang, setInitialLang] = useState<Lang | null>(null);

  useEffect(() => {
    getStoredLang().then((lang) => {
      const isArabic = lang === "ar";
      if (Platform.OS !== "web") {
        I18nManager.forceRTL(isArabic);
      }
      setInitialLang(lang);
    });
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && initialLang !== null) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, initialLang]);

  if ((!fontsLoaded && !fontError) || initialLang === null) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LangProvider initialLang={initialLang}>
          <FirebaseProvider>
            <AuthProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <View style={{ flex: 1, direction: Platform.OS === "web" ? (initialLang === "ar" ? "rtl" : "ltr") : undefined }}>
                    <RootLayoutNav />
                    <NetworkBanner />
                  </View>
                </KeyboardProvider>
              </GestureHandlerRootView>
            </AuthProvider>
          </FirebaseProvider>
        </LangProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
