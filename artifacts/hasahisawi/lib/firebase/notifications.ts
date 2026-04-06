import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

export const NOTIF_CHANNEL_ID = "hasahisawi-default";

export type PushNotification = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

// ── إنشاء Android Channel ─────────────────────────────────────────────────────

async function ensureAndroidChannel(Notifications: typeof import("expo-notifications")) {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL_ID, {
      name: "حصاحيصاوي — تنبيهات",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#27AE68",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      sound: "default",
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {}
}

// ── معالج الإشعارات العام ─────────────────────────────────────────────────────

async function setupHandler(Notifications: typeof import("expo-notifications")) {
  await Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
}

// ── تسجيل Push Token وحفظه في API Server ────────────────────────────────────

export async function registerForPushNotifications(
  _userId: string,
  authToken?: string,
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const Notifications = await import("expo-notifications");

    await setupHandler(Notifications);
    await ensureAndroidChannel(Notifications);

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: "0d3b27d0-5d06-49dd-9b21-be26fb7a5a1a",
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

// ── إرسال إشعار محلي فوري ────────────────────────────────────────────────────

export async function scheduleLocalNotification(
  notification: PushNotification,
  delaySeconds = 0,
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    await setupHandler(Notifications);
    await ensureAndroidChannel(Notifications);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body:  notification.body,
        data:  notification.data ?? {},
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
        ...(Platform.OS === "android" && { channelId: NOTIF_CHANNEL_ID }),
      },
      trigger: delaySeconds > 0
        ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds, repeats: false }
        : null,
    });
  } catch {}
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
    await ensureAndroidChannel(Notifications);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body:  notification.body,
        data:  notification.data ?? {},
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 250, 250, 250],
        ...(Platform.OS === "android" && { channelId: NOTIF_CHANNEL_ID }),
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
      onReceived({
        title: n.request.content.title ?? "",
        body:  n.request.content.body  ?? "",
        data:  n.request.content.data as Record<string, unknown>,
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
