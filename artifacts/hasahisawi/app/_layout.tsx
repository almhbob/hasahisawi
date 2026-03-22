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
import { registerForPushNotifications, addNotificationListener, setBadgeCount } from "@/lib/firebase/notifications";
import { useApiUnread } from "@/lib/api-chat";

SplashScreen.preventAutoHideAsync();

// ── بوابة المصادقة — تحجب التطبيق حتى يسجّل المستخدم دخوله ─────
function AuthGate() {
  const { user, token, isLoading, isGuest } = useAuth();
  const router   = useRouter();
  const segments = useSegments();
  const unread = useApiUnread(isGuest ? null : (token ?? null));

  // تسجيل الإشعارات عند تسجيل الدخول
  useEffect(() => {
    if (!user || isGuest) return;
    const uid = user.firebaseUid ?? String(user.id);
    registerForPushNotifications(uid).catch(() => {});
    const unsub = addNotificationListener(
      (_n) => {},
      (data) => {
        if (data?.chatId) {
          router.push({ pathname: "/conversation", params: { chatId: data.chatId, otherName: data.otherName ?? "" } } as any);
        }
      },
    );
    return unsub;
  }, [user?.id]);

  // تحديث شارة التطبيق
  useEffect(() => {
    setBadgeCount(unread).catch(() => {});
  }, [unread]);

  useEffect(() => {
    if (isLoading) return;
    const inLogin = segments[0] === "login";
    if (!user) {
      if (!inLogin) router.replace("/login");
    } else {
      if (inLogin) router.replace("/(tabs)/" as any);
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
        <Stack.Screen name="admin"        options={{ headerShown: false, animation: "slide_from_left" }} />
        <Stack.Screen name="conversation" options={{ headerShown: false, animation: "slide_from_left" }} />
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
