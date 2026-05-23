import Colors from "@/constants/colors";
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
import { StatusBar } from "expo-status-bar";
import NetworkBanner from "@/components/NetworkBanner";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient, wakeUpServer } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { FeatureFlagsProvider } from "@/lib/feature-flags-context";
import { LangProvider, getStoredLang } from "@/lib/lang-context";
import { FirebaseProvider } from "@/lib/firebase/context";
import { markFirebaseRuntimeFailed } from "@/lib/firebase/auth";
import { initAppCheck } from "@/lib/firebase/app-check";
import { I18nManager, Platform, View, LogBox, Text, TextInput } from "react-native";
import type { Lang } from "@/lib/translations";
import { registerForPushNotifications, addNotificationListener, setBadgeCount } from "@/lib/firebase/notifications";
import { useApiUnread } from "@/lib/api-chat";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ONBOARDING_KEY } from "./onboarding";
import UpdateBanner from "@/components/UpdateBanner";

// ── ضبط حجم الخط على الموبايل ─────────────────────────────────────
// بعض الأجهزة تكون عليها إعدادات Accessibility بحجم خط كبير جداً، وهذا كان يسبب
// تداخل البطاقات في شاشة الإعدادات. نسمح بتكبير بسيط فقط للحفاظ على الشكل.
try {
  (Text as any).defaultProps = {
    ...((Text as any).defaultProps || {}),
    maxFontSizeMultiplier: 1.12,
  };
  (TextInput as any).defaultProps = {
    ...((TextInput as any).defaultProps || {}),
    maxFontSizeMultiplier: 1.08,
  };
} catch {}

// ── إعداد RTL متزامن قبل أي render ─────────────────────────────
// التطبيق عربي بالأساس — يُطبَّق RTL مباشرةً عند تحميل الموديول
if (Platform.OS !== "web") {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

// ── تجاهل تحذيرات Firebase في LogBox ────────────────────────────
LogBox.ignoreLogs([
  "Firebase: Error",
  "@firebase/auth:",
  "Firebase Auth",
  "auth/invalid-api-key",
  "auth/network-request-failed",
]);

// ── معالج أخطاء React Native (Hermes) العالمي ───────────────────
// يمنع Firebase من كسر التطبيق عند وجود مفتاح API غير صالح
try {
  const EU = (globalThis as any).ErrorUtils;
  if (EU?.getGlobalHandler && EU?.setGlobalHandler) {
    const prev = EU.getGlobalHandler();
    EU.setGlobalHandler((error: Error, isFatal: boolean) => {
      const msg = error?.message ?? String(error);
      if (
        msg.includes("auth/invalid-api-key") ||
        msg.includes("Firebase") ||
        msg.includes("@firebase")
      ) {
        console.warn("[Firebase global error suppressed]", msg);
        try { markFirebaseRuntimeFailed(); } catch {}
        return; // لا نُعيد رميه → لا كراش
      }
      prev?.(error, isFatal);
    });
  }
} catch {}

// ── معالجة رفض الـ Promises غير المُعالَجة (web) ────────────────
if (typeof globalThis !== "undefined") {
  const origHandler = (globalThis as any).onunhandledrejection;
  (globalThis as any).onunhandledrejection = (event: any) => {
    const msg = String(event?.reason?.message ?? event?.reason ?? "");
    if (
      msg.includes("Firebase") ||
      msg.includes("auth/invalid-api-key") ||
      msg.includes("@firebase")
    ) {
      event?.preventDefault?.();
      return;
    }
    if (origHandler) origHandler(event);
  };
}

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
    registerForPushNotifications(user.uid ?? String(user.id), token ?? undefined).catch(() => {});
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
    const inLogin           = segments[0] === "login";
    const inOnboarding      = segments[0] === "onboarding";
    const inCompleteProfile = segments[0] === "complete-profile";

    if (!user) {
      if (!inLogin && !inOnboarding) {
        AsyncStorage.getItem(ONBOARDING_KEY).then((done) => {
          if (!done) {
            router.replace("/onboarding" as any);
          } else {
            router.replace("/login");
          }
        });
      }
      return;
    }

    // إذا لم يُحدَّد الجنس (مستخدم Google جديد) → أجبره على إكمال الملف
    const needsGender = !isGuest && user && !user.gender;
    if (needsGender && !inCompleteProfile) {
      router.replace("/complete-profile" as any);
      return;
    }

    if (inLogin || inOnboarding || inCompleteProfile) {
      router.replace("/(tabs)/" as any);
    }
  }, [user, isLoading, segments, isGuest]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <StatusBar style="light" />
      <AuthGate />
      <Stack screenOptions={{ headerBackTitle: "رجوع", headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="(tabs)"          options={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }} />
        <Stack.Screen name="login"           options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="onboarding"      options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="report"          options={{ headerShown: false }} />
        <Stack.Screen name="profile"         options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="forgot-password"    options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="complete-profile"   options={{ headerShown: false, animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="admin"            options={{ headerShown: false, animation: "slide_from_left" }} />
        <Stack.Screen name="admin-transport" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="conversation"    options={{ headerShown: false, animation: "slide_from_left" }} />
        <Stack.Screen name="org-join"        options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="external-partnership" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="inst-portal"     options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="staff-portal"     options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="lawyer-portal"        options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="client-case-chat"     options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="medical-patient-hub"  options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="sick-leave"           options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="hospital-admission"   options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="student-union-join"   options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="student-union-contact" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="student-union-admin"    options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="union-manager-apply"      options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="union-manager-portal"     options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="union-partnership-apply"  options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="designer"                 options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="notifications"            options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="search"                   options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="medical-record-setup"     options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="admin-sections-config"    options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="travel-agencies"          options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="qr-scanner"               options={{ headerShown: false, animation: "slide_from_bottom", presentation: "fullScreenModal" }} />
        <Stack.Screen name="qr-web-login"             options={{ headerShown: false, animation: "slide_from_right" }} />
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
    // إيقاظ السيرفر مبكراً عند فتح التطبيق لتقليل وقت الانتظار
    wakeUpServer();
    // تهيئة Firebase App Check (الويب فقط — تخطّي صامت على الموبايل)
    initAppCheck().catch(() => {});
  }, []);

  useEffect(() => {
    // على الويب: إذا لم يُحدَّد اللغة خلال ثانيتين نستخدم العربية افتراضياً
    const fallback = Platform.OS === "web"
      ? setTimeout(() => setInitialLang(prev => prev ?? "ar"), 2000)
      : null;
    getStoredLang().then((lang) => {
      setInitialLang(lang);
    }).finally(() => {
      if (fallback) clearTimeout(fallback);
    });
    return () => { if (fallback) clearTimeout(fallback); };
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && initialLang !== null) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, initialLang]);

  // على الويب: الخطوط تُحمَّل عبر CSS — لا نحتاج لانتظارها
  const fontReady = Platform.OS === "web" ? true : (fontsLoaded || !!fontError);
  if (!fontReady || initialLang === null) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LangProvider initialLang={initialLang}>
          <FirebaseProvider>
            <AuthProvider>
              <FeatureFlagsProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <KeyboardProvider>
                  <View style={{ flex: 1, backgroundColor: Colors.bg, direction: Platform.OS === "web" ? (initialLang === "ar" ? "rtl" : "ltr") : undefined }}>
                    <RootLayoutNav />
                    <NetworkBanner />
                    <UpdateBanner />
                  </View>
                </KeyboardProvider>
              </GestureHandlerRootView>
              </FeatureFlagsProvider>
            </AuthProvider>
          </FirebaseProvider>
        </LangProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}