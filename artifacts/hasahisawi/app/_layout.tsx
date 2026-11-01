import Colors from "@/constants/colors";
import { installWebAlert } from "@/lib/web-alert";
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
import AdminAlertsWatcher from "@/components/AdminAlertsWatcher";
import LaunchSplash from "@/components/LaunchSplash";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { reloadAppAsync } from "expo";
import { usePresencePing } from "@/lib/chat-plus";
import { rescheduleAdhanFromCache } from "@/lib/adhan";
import { callsApi, getActiveCall } from "@/lib/calls";
import { isAppActive } from "@/lib/chat-plus";
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
import { ActivityIndicator, Image } from "react-native";
import { Appearance, I18nManager, Platform, View, LogBox, Text, TextInput } from "react-native";

import type { Lang } from "@/lib/translations";
import { registerForPushNotifications, addNotificationListener, setBadgeCount } from "@/lib/firebase/notifications";
import { vibrateForType } from "@/lib/sounds";
import type { SoundType } from "@/lib/sounds";
import { useApiUnread } from "@/lib/api-chat";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ONBOARDING_KEY } from "./onboarding";
import UpdateBanner from "@/components/UpdateBanner";
import OfflineQueueSync from "@/components/OfflineQueueSync";
import * as SystemUI from "expo-system-ui";
import { activeScheme } from "@/constants/theme-mode";

// ── ضبط حجم الخط على الموبايل ─────────────────────────────────────
// بعض الأجهزة تكون عليها إعدادات Accessibility بحجم خط كبير جداً، وهذا كان يسبب
// تداخل البطاقات في شاشة الإعدادات. نسمح بتكبير بسيط فقط للحفاظ على الشكل.
try {
  (Text as any).defaultProps = {
    ...((Text as any).defaultProps || {}),
    maxFontSizeMultiplier: 1.25, // was 1.12: too low for older users who enlarge system text
  };
  (TextInput as any).defaultProps = {
    ...((TextInput as any).defaultProps || {}),
    maxFontSizeMultiplier: 1.2,
  };
} catch {}

// رسائل Alert.alert تظهر على الويب أيضاً (react-native-web يتجاهلها)
installWebAlert();

// ── اتجاه الواجهة ─────────────────────────────────────────────
// كل الشاشات مكتوبة بمحاذاة يمين صريحة (row-reverse + textAlign:"right").
// تفعيل RTL على مستوى النظام كان يعكسها مرة ثانية فتظهر الواجهة على اليسار
// كأنها إنجليزية. لذلك نثبّت التخطيط الأساسي LTR، والتصميم نفسه يتكفّل باليمين.
if (Platform.OS !== "web") {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
  I18nManager.swapLeftAndRightInRTL(true);
}

// ── المظهر (فاتح/داكن) ─────────────────────────────────────────
// الألوان تُحدَّد مرة عند فتح التطبيق (constants/theme-mode). نوحّد معها خلفية
// النظام ومظهر عناصره الأصلية (التنبيهات، منتقي التاريخ، لوحة المفاتيح).
SystemUI.setBackgroundColorAsync(Colors.bg).catch(() => {});
if (Platform.OS !== "web") {
  try { Appearance.setColorScheme(activeScheme); } catch {}
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
      (n) => {
        // اهتزاز مخصص بحسب القناة عند وصول الإشعار في الـ Foreground
        const channelId = (n.request.content.data as any)?.channelId as string | undefined;
        const soundType: SoundType =
          String(channelId).startsWith("hasahisawi-chat")      ? "message"
          : (String(channelId).startsWith("hasahisawi-urgent") || String(channelId).startsWith("hasahisawi-transport")) ? "alert"
          : String(channelId).startsWith("hasahisawi-prayer")  ? "prayer"
          : "success";
        vibrateForType(soundType).catch(() => {});
        const d: any = n.request.content.data;
        if (d?.type === "call" && d?.callId && getActiveCall() !== Number(d.callId)) {
          router.push({ pathname: "/call", params: { callId: String(d.callId), role: "callee", name: String(d.callerName ?? "") } } as any);
        }
      },
      (data) => {
        const type = data?.type as string | undefined;
        const screen = data?.screen as string | undefined;

        // ── مكالمة صوتية واردة ──
        if (type === "call" && data?.callId) {
          if (getActiveCall() !== Number(data.callId)) router.push({ pathname: "/call", params: { callId: String(data.callId), role: "callee", name: String(data.callerName ?? "") } } as any);
          return;
        }

        // ── محادثات ──
        if (data?.chatId) {
          router.push({ pathname: "/conversation", params: { chatId: data.chatId, otherName: data.otherName ?? "" } } as any);
          return;
        }

        // ── مشوارك علينا: السائقون والإدارة والمشرفون ──
        if (type === "transport_admin_request" || screen === "admin-transport") {
          router.push("/admin-transport" as any);
          return;
        }
        if (type === "transport_request" || screen === "transport") {
          router.push("/transport" as any);
          return;
        }

        // ── الإتحاد ──
        if (
          type === "student_union_application" ||
          type === "union_employee_application" ||
          type === "union_partnership_application" ||
          type === "union_manager_application"
        ) {
          router.push("/union-manager-portal" as any);
          return;
        }

        if (type === "volunteer") { router.push("/volunteer" as any); return; }
        if (type === "contest" && data?.contest_id) { router.push({ pathname: "/contest", params: { id: String(data.contest_id) } } as any); return; }
        // ── متابع جديد → ملفه الشخصي ──
        if (type === "follow" && data?.follower_id) {
          router.push({ pathname: "/profile", params: { id: String(data.follower_id) } } as any);
          return;
        }
        // ── تنبيه إدارة: أي طلب جديد → مركز الطلبات ──
        if (type === "admin_alert") {
          router.push((data?.kind === "social_report" ? "/admin-social-reports" : "/admin-requests") as any);
          return;
        }
        // ── المطاعم: طلب جديد للمالك، وتحديث حالة للعميل ──
        if ((type === "food_order" || type === "food_business") && data?.business_id) {
          router.push({ pathname: type === "food_order" ? "/restaurant-manage" : "/restaurant", params: { id: String(data.business_id) } } as any);
          return;
        }
        if (type === "food_order_status") { router.push("/my-food-orders" as any); return; }
        if (type === "store_review") { router.push("/store-portal" as any); return; }
        if (type === "store_order_update") { router.push("/stores" as any); return; }

        // ── المؤسسات / الشراكات / المحامون → لوحة الإدارة ──
        if (
          type === "institution_application" ||
          type === "external_partnership" ||
          type === "lawyer_application"
        ) {
          router.push("/admin" as any);
          return;
        }

        // ── زواجيل ──
        if (screen === "zawajil-manager") { router.push("/(tabs)/zawajil-manager" as any); return; }
        if (screen === "zawajil" || type === "zawajil") {
          router.push("/zawajil" as any);
          return;
        }

        // ── المتاجر ──
        if (type === "store_order" || type === "store_application" || type === "store_approved") {
          router.push(type === "store_order" ? "/store-portal" : "/stores" as any);
          return;
        }

        // ── إشعار عام أو بث → شاشة الإشعارات ──
        if (type === "broadcast" || type === "direct" || type === "general") {
          router.push("/notifications" as any);
          return;
        }

        // fallback: افتح شاشة الإشعارات
        router.push("/notifications" as any);
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
    // صفحات متاحة بدون تسجيل دخول (استعادة كلمة المرور لا يجب أن تعيد المستخدم لصفحة الدخول)
    // صفحات الانضمام العامة: الجهات والشركات تفتح رابط الدعوة وتقدّم طلبها بدون حساب
    const PUBLIC_JOIN = ["travel-agencies", "org-join", "union-partnership-apply", "external-partnership"];
    const inPublicAuth      = segments[0] === "forgot-password" || segments[0] === "auth-callback" || PUBLIC_JOIN.includes(String(segments[0]));

    if (!user) {
      if (!inLogin && !inOnboarding && !inPublicAuth) {
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

    // بعد حفظ الجنس في Firestore يُحدَّث user.gender مباشرةً → هذا الشرط يصبح false
    // const needsGender = !isGuest && !!user && !user.gender;
    // if (needsGender) {
    //   if (!inCompleteProfile) router.replace("/complete-profile" as any);
    //   return;
    // }

    if (inLogin || inOnboarding || inCompleteProfile) {
      router.replace("/(tabs)/" as any);
    }
  }, [user?.id, user?.gender, isLoading, isGuest, segments.join("/")]);

  return null;
}

// نبض «نشط الآن» للدردشة ما دام التطبيق مفتوحاً
function PresenceBeat() {
  // تجديد جدول الأذان لسبعة أيام عند كل فتح للتطبيق
  useEffect(() => { const t = setTimeout(() => { rescheduleAdhanFromCache(); }, 4000); return () => clearTimeout(t); }, []);
  const { token, isGuest } = useAuth();
  usePresencePing(isGuest ? null : token);
  // تنبيه لمرة واحدة: استثناء التطبيق من توفير البطارية حتى تصل الإشعارات والمكالمات والتطبيق مغلق
  useEffect(() => {
    if (Platform.OS !== "android" || isGuest || !token) return;
    const t = setTimeout(async () => {
      try {
        const AS = (await import("@react-native-async-storage/async-storage")).default;
        if (await AS.getItem("hsh_battery_tip_v1")) return;
        await AS.setItem("hsh_battery_tip_v1", "1");
        const { Alert, Linking } = await import("react-native");
        Alert.alert(
          "🔔 لا تفوّتك أي رسالة أو مكالمة",
          "لتصلك الإشعارات بصوت والمكالمات حتى والتطبيق مغلق، اسمح لحصاحيصاوي بالعمل في الخلفية:\n\n• البطارية ← «غير مقيّد» أو «بدون قيود»\n• الإشعارات ← مفعّلة لكل الفئات",
          [
            { text: "لاحقاً", style: "cancel" },
            { text: "إعدادات الإشعارات", onPress: () => Linking.openSettings().catch(() => {}) },
            { text: "إعدادات البطارية", onPress: () => Linking.sendIntent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS").catch(() => Linking.openSettings().catch(() => {})) },
          ],
        );
      } catch {}
    }, 9000);
    return () => clearTimeout(t);
  }, [token, isGuest]);

  // مراقبة المكالمات الواردة أثناء فتح التطبيق (احتياطاً إن تأخّر الإشعار)
  const nav = useRouter();
  useEffect(() => {
    if (isGuest || !token || Platform.OS === "web") return;
    let seen = 0;
    const check = async () => {
      if (!isAppActive() || getActiveCall()) return;
      try {
        const r = await callsApi.incoming(token);
        if (r.call && r.call.id !== seen) {
          seen = r.call.id;
          nav.push({ pathname: "/call", params: { callId: String(r.call.id), role: "callee", name: r.call.caller_name || "", avatar: r.call.caller_avatar || "" } } as any);
        }
      } catch {}
    };
    check();
    const t = setInterval(check, 6000);
    return () => clearInterval(t);
  }, [token, isGuest, nav]);
  return null;
}

function RootLayoutNav() {
  return (
    <>
      {/* Dark icons: most screens use the light #F7F9F8 background */}
      <StatusBar style={Colors.isDark ? "light" : "dark"} />
      <AuthGate />
      <PresenceBeat />
      <Stack screenOptions={{ headerBackTitle: "رجوع", headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="(tabs)"          options={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }} />
        <Stack.Screen name="login"           options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="onboarding"      options={{ headerShown: false, animation: "fade" }} />
        <Stack.Screen name="complete-profile"   options={{ headerShown: false, animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="report"          options={{ headerShown: false }} />
        <Stack.Screen name="call"            options={{ headerShown: false, animation: "fade", gestureEnabled: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="profile"         options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="curriculum"      options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="sports-club"     options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="restaurant"      options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="restaurant-manage" options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="my-food-orders"  options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="member-card"     options={{ headerShown: false, animation: "slide_from_bottom", contentStyle: { backgroundColor: "#F3F1EC" } }} />
        <Stack.Screen name="forgot-password"    options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="auth-callback"      options={{ headerShown: false, animation: "fade" }} />
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
        <Stack.Screen name="blocked-users"            options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="follows"                  options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="volunteer"                options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="volunteer-admin"          options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="contests"                 options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="contest"                  options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="contests-admin"           options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="admin-social-reports"     options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="search"                   options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="medical-record-setup"     options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="admin-sections-config"    options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="travel-agencies"          options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="qr-scanner"               options={{ headerShown: false, animation: "slide_from_bottom", presentation: "fullScreenModal" }} />
        <Stack.Screen name="qr-web-login"             options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="stores"                   options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="edu-hub"                  options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="admin-requests"           options={{ headerShown: false, animation: "slide_from_right" }} />
        <Stack.Screen name="store-portal"             options={{ headerShown: false, animation: "slide_from_right" }} />
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
    // الأجهزة التي كانت على وضع RTL القديم: إعادة تشغيل واحدة لتطبيق الاتجاه الصحيح فوراً
    if (Platform.OS !== "web" && I18nManager.isRTL) {
      AsyncStorage.getItem("hsh_dir_fix_v1").then((done) => {
        if (done) return;
        AsyncStorage.setItem("hsh_dir_fix_v1", "1").finally(() => { reloadAppAsync().catch(() => {}); });
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    initAppCheck().catch(() => {});
    // نوقظ الخادم في الخلفية دون أن نحجب الواجهة: التحقق من الجلسة يتحمّل بطء الخادم
    // (لا يُنهي الجلسة إلا رد 401 صريح)، فلا داعي لإبقاء المستخدم أمام شاشة انتظار.
    if (Platform.OS === "web" && !(typeof navigator !== "undefined" && navigator.onLine === false)) {
      wakeUpServer().catch(() => {});
    }
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
                  {/* الاتجاه LTR على كل المنصات (التصميم يتكفّل باليمين). كان الويب وحده RTL فتنعكس الواجهة */}
                  <View style={{ flex: 1, backgroundColor: Colors.bg, direction: Platform.OS === "web" ? "ltr" : undefined }}>
                    <OfflineQueueSync />
                    <RootLayoutNav />
                    <NetworkBanner />
                    <AdminAlertsWatcher />
                    <LaunchSplash />
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
