import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

// ── معرّفات قنوات التنبيه (Android) ─────────────────────────────────────────
export const CHANNELS = {
  DEFAULT:   "hasahisawi-default",    // عام
  CHAT:      "hasahisawi-chat",       // رسائل الدردشة
  URGENT:    "hasahisawi-urgent",     // تنبيهات عاجلة
  TRANSPORT: "hasahisawi-transport",  // تحديثات السفر
  PRAYER:    "hasahisawi-prayer",     // أذان
} as const;

// للتوافق مع الكود القديم
export const NOTIF_CHANNEL_ID = CHANNELS.DEFAULT;

export type PushNotification = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: keyof typeof CHANNELS;
};

// ── إنشاء قنوات Android المتعددة ─────────────────────────────────────────────
async function ensureAndroidChannels(
  Notifications: typeof import("expo-notifications")
): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    // قناة عامة
    await Notifications.setNotificationChannelAsync(CHANNELS.DEFAULT, {
      name: "حصاحيصاوي — تنبيهات عامة",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: "#27AE68",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // قناة الدردشة — صوت ونبض مميّز
    await Notifications.setNotificationChannelAsync(CHANNELS.CHAT, {
      name: "حصاحيصاوي — رسائل",
      description: "رسائل الدردشة والمحادثات",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 100, 80, 100, 80, 100],
      lightColor: "#3B82F6",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    // قناة عاجلة — MAX + اهتزاز طويل
    await Notifications.setNotificationChannelAsync(CHANNELS.URGENT, {
      name: "حصاحيصاوي — تنبيهات عاجلة",
      description: "تنبيهات تستلزم اهتماماً فورياً",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 600, 200, 600, 200, 600],
      lightColor: "#EF4444",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      sound: "default",
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // قناة المواصلات
    await Notifications.setNotificationChannelAsync(CHANNELS.TRANSPORT, {
      name: "حصاحيصاوي — تحديثات السفر",
      description: "حالة الرحلات والتذاكر",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 150, 300],
      lightColor: "#0EA5E9",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // قناة الأذان — HIGH + اهتزاز خاص
    await Notifications.setNotificationChannelAsync(CHANNELS.PRAYER, {
      name: "حصاحيصاوي — أوقات الصلاة",
      description: "تذكير بأوقات الصلاة والأذان",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 100, 400],
      lightColor: "#F59E0B",
      enableLights: true,
      enableVibrate: true,
      showBadge: false,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {}
}

// ── معالج الإشعارات العام ─────────────────────────────────────────────────────
async function setupHandler(
  Notifications: typeof import("expo-notifications")
): Promise<void> {
  await Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const channelId = (notification.request.content.data as any)?.channelId as string | undefined;
      const isUrgent  = channelId === CHANNELS.URGENT;
      return {
        shouldShowAlert:  true,
        shouldPlaySound:  true,
        shouldSetBadge:   true,
        shouldShowBanner: true,
        shouldShowList:   true,
        priority: isUrgent
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
      };
    },
  });
}

// ── تسجيل Push Token ─────────────────────────────────────────────────────────
export async function registerForPushNotifications(
  _userId: string,
  authToken?: string,
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const Notifications = await import("expo-notifications");

    await setupHandler(Notifications);
    await ensureAndroidChannels(Notifications);

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert:          true,
          allowBadge:          true,
          allowSound:          true,
          allowCriticalAlerts: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId:
        process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ??
        "0d3b27d0-5d06-49dd-9b21-be26fb7a5a1a",
    }).catch(() => null);

    const token = tokenData?.data ?? null;
    if (!token) return null;

    if (authToken) {
      fetch(`${getApiUrl()}/api/push-tokens`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token, platform: Platform.OS }),
      }).catch(() => {});
    }

    return token;
  } catch {
    return null;
  }
}

// ── إرسال إشعار محلي ─────────────────────────────────────────────────────────
export async function scheduleLocalNotification(
  notification: PushNotification,
  delaySeconds = 0,
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    await setupHandler(Notifications);
    await ensureAndroidChannels(Notifications);

    const ch = notification.channel ?? "DEFAULT";
    const channelId = CHANNELS[ch] ?? CHANNELS.DEFAULT;

    // اهتزاز بحسب نوع القناة
    const vibrationMap: Record<string, number[]> = {
      [CHANNELS.CHAT]:      [0, 100, 80, 100, 80, 100],
      [CHANNELS.URGENT]:    [0, 600, 200, 600, 200, 600],
      [CHANNELS.TRANSPORT]: [0, 300, 150, 300],
      [CHANNELS.PRAYER]:    [0, 400, 100, 400],
      [CHANNELS.DEFAULT]:   [0, 200, 100, 200],
    };

    await Notifications.scheduleNotificationAsync({
      content: {
        title:   notification.title,
        body:    notification.body,
        data:    { ...(notification.data ?? {}), channelId },
        sound:   "default",
        priority: ch === "URGENT"
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
        vibrate: vibrationMap[channelId] ?? [0, 200, 100, 200],
        ...(Platform.OS === "android" && { channelId }),
      },
      trigger: delaySeconds > 0
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds, repeats: false }
        : null,
    });
  } catch {}
}

// ── إشعار عاجل (MAX priority) ────────────────────────────────────────────────
export async function scheduleUrgentNotification(
  notification: PushNotification,
): Promise<void> {
  return scheduleLocalNotification({ ...notification, channel: "URGENT" });
}

// ── إشعار دردشة ──────────────────────────────────────────────────────────────
export async function scheduleChatNotification(
  notification: PushNotification,
): Promise<void> {
  return scheduleLocalNotification({ ...notification, channel: "CHAT" });
}

// ── إشعار سفر ────────────────────────────────────────────────────────────────
export async function scheduleTransportNotification(
  notification: PushNotification,
): Promise<void> {
  return scheduleLocalNotification({ ...notification, channel: "TRANSPORT" });
}

// ── إشعار الأذان + تشغيل صوت الأذان داخل التطبيق ───────────────────────────
export async function schedulePrayerNotification(
  notification: PushNotification,
  playAdhan = false,
): Promise<void> {
  await scheduleLocalNotification({ ...notification, channel: "PRAYER" });
  if (playAdhan) {
    const { playSound } = await import("@/lib/sounds").catch(() => ({ playSound: null }));
    playSound?.("prayer");
  }
}

// ── إشعار مؤجّل (للمناسبات) ──────────────────────────────────────────────────
export async function scheduleOccasionReminder(
  notification: PushNotification,
  atDate: Date,
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const Notifications = await import("expo-notifications");
    await setupHandler(Notifications);
    await ensureAndroidChannels(Notifications);

    const ch = notification.channel ?? "DEFAULT";
    const channelId = CHANNELS[ch] ?? CHANNELS.DEFAULT;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title:   notification.title,
        body:    notification.body,
        data:    { ...(notification.data ?? {}), channelId },
        sound:   "default",
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
        ...(Platform.OS === "android" && { channelId }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: atDate,
      },
    });
    return id;
  } catch {
    return null;
  }
}

// ── إلغاء إشعار مجدوَل ───────────────────────────────────────────────────────
export async function cancelScheduledNotification(id: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

// ── مستمع الإشعارات ──────────────────────────────────────────────────────────
export function addNotificationListener(
  onReceived: (n: PushNotification) => void,
  onResponse: (data: Record<string, unknown>) => void,
): (() => void) {
  if (Platform.OS === "web") return () => {};
  let sub1: any, sub2: any;
  import("expo-notifications").then((Notifications) => {
    sub1 = Notifications.addNotificationReceivedListener((n) => {
      // تشغيل اهتزاز داخلي مُميَّز عند استقبال تنبيه والتطبيق مفتوح
      const channelId = (n.request.content.data as any)?.channelId as string | undefined;
      import("@/lib/sounds").then(({ vibrateForType }) => {
        if (channelId === CHANNELS.URGENT)    vibrateForType("alert");
        else if (channelId === CHANNELS.CHAT) vibrateForType("message");
        else if (channelId === CHANNELS.TRANSPORT) vibrateForType("transport");
      }).catch(() => {});

      onReceived({
        title:   n.request.content.title ?? "",
        body:    n.request.content.body  ?? "",
        data:    n.request.content.data as Record<string, unknown>,
        channel: (
          channelId === CHANNELS.CHAT      ? "CHAT"
          : channelId === CHANNELS.URGENT  ? "URGENT"
          : channelId === CHANNELS.TRANSPORT ? "TRANSPORT"
          : channelId === CHANNELS.PRAYER  ? "PRAYER"
          : "DEFAULT"
        ) as keyof typeof CHANNELS,
      });
    });
    sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
      onResponse(r.notification.request.content.data as Record<string, unknown>);
    });
  }).catch(() => {});

  return () => {
    try { sub1?.remove(); } catch {}
    try { sub2?.remove(); } catch {}
  };
}

// ── ضبط شارة التطبيق ─────────────────────────────────────────────────────────
export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.setBadgeCountAsync(count);
  } catch {}
}
