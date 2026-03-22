import { Platform } from "react-native";
import { isFirebaseConfigured } from "./index";
import { fsSetDoc, fsUpdateDoc, COLLECTIONS } from "./firestore";

// ── نوع الإشعار ───────────────────────────────────────────────────────────────
export type PushNotification = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

// ── تسجيل Push Token ──────────────────────────────────────────────────────────

export async function registerForPushNotifications(
  userId: string,
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const Notifications = await import("expo-notifications");

    await Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_REPL_ID ?? undefined,
    }).catch(() => null);

    const token = tokenData?.data ?? null;

    if (token && isFirebaseConfigured) {
      await fsUpdateDoc(COLLECTIONS.USERS, userId, {
        pushToken: token,
        pushTokenUpdatedAt: new Date().toISOString(),
        platform: Platform.OS,
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
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
        sound: true,
      },
      trigger: null,
    });
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
