import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

// ── إصدار القنوات — ارفع الرقم عند تغيير إعدادات الصوت ──────────────────────
// Android يجمّد إعدادات القناة بعد أول إنشاء؛ تغيير الإصدار يُجبر إعادة البناء
const CHANNEL_VERSION     = "7";
/** إصدار القنوات الذي يُبلَّغ به الخادم ليختار القناة الصحيحة لكل جهاز */
export const PUSH_CHANNEL_VER = 3;
const CHANNEL_VERSION_KEY = "@hasahisawi/notif_ch_v";

// ── معرّفات قنوات التنبيه (Android) ─────────────────────────────────────────
// الجيل الثالث (-s3): كل القنوات تنبيه منبثق بصوت حتى والتطبيق مغلق
export const CHANNELS = {
  DEFAULT:   "hasahisawi-default-s3",
  CHAT:      "hasahisawi-chat-s3",
  URGENT:    "hasahisawi-urgent-s3",
  TRANSPORT: "hasahisawi-transport-s3",
  PRAYER:    "hasahisawi-prayer-s3",
  CALL:      "hasahisawi-call-s3",
} as const;

// نغمة مخصصة لكل قناة (اسم الملف بدون امتداد)
const CHANNEL_SOUNDS: Record<string, string> = {
  "hasahisawi-default-s3":   "hasahisawi_notif",
  "hasahisawi-chat-s3":      "hasahisawi_chat",
  "hasahisawi-urgent-s3":    "hasahisawi_urgent",
  "hasahisawi-transport-s3": "hasahisawi_urgent",
  "hasahisawi-prayer-s3":    "hasahisawi_prayer",
  "hasahisawi-call-s3":      "hasahisawi_ring",
};

// للتوافق مع الكود القديم
export const NOTIF_CHANNEL_ID = CHANNELS.DEFAULT;

export type PushNotification = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: keyof typeof CHANNELS;
};

// ── إنشاء قنوات Android (مع منطق إعادة البناء عند تغيير الإصدار) ───────────
async function ensureAndroidChannels(
  Notifications: typeof import("expo-notifications")
): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const stored = await AsyncStorage.getItem(CHANNEL_VERSION_KEY).catch(() => null);

    if (stored !== CHANNEL_VERSION) {
      // Android يستعيد إعدادات القناة المحذوفة إذا أُعيد إنشاؤها بنفس المعرّف (ومنها كتم الصوت)،
      // لذلك انتقلنا لمعرّفات جديدة (-s2) ونحذف القديمة فقط حتى لا تتكرر في الإعدادات.
      for (const base of ["hasahisawi-default", "hasahisawi-chat", "hasahisawi-urgent", "hasahisawi-transport", "hasahisawi-prayer"]) {
        await Notifications.deleteNotificationChannelAsync(base).catch(() => {});
      }
    }

    await Notifications.setNotificationChannelAsync(CHANNELS.DEFAULT, {
      name: "حصاحيصاوي — تنبيهات عامة",
      description: "إشعارات الطلبات والتحديثات والخدمات",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
      lightColor: "#22C55E",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      sound: CHANNEL_SOUNDS[CHANNELS.DEFAULT],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.CHAT, {
      name: "حصاحيصاوي — رسائل",
      description: "رسائل الدردشة والمحادثات",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 100, 80, 100, 80, 100],
      lightColor: "#3B82F6",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      sound: CHANNEL_SOUNDS[CHANNELS.CHAT],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.URGENT, {
      name: "حصاحيصاوي — تنبيهات عاجلة",
      description: "تنبيهات تستلزم اهتماماً فورياً",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 600, 200, 600, 200, 600],
      lightColor: "#EF4444",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      sound: CHANNEL_SOUNDS[CHANNELS.URGENT],
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.TRANSPORT, {
      name: "حصاحيصاوي — طلبات مشوارك علينا",
      description: "طلبات مشاوير فورية للسائقين والمشرفين",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 700, 200, 700, 200, 700, 300, 900],
      lightColor: "#F97316",
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
      sound: CHANNEL_SOUNDS[CHANNELS.TRANSPORT],
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.PRAYER, {
      name: "حصاحيصاوي — أوقات الصلاة",
      description: "تذكير بأوقات الصلاة والأذان",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 100, 400],
      lightColor: "#F59E0B",
      enableLights: true,
      enableVibrate: true,
      showBadge: false,
      sound: CHANNEL_SOUNDS[CHANNELS.PRAYER],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.CALL, {
      name: "حصاحيصاوي — مكالمات صوتية",
      description: "رنين المكالمات الواردة عبر الإنترنت",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 900, 700, 900, 700, 900, 700, 900],
      lightColor: "#22C55E",
      enableLights: true,
      enableVibrate: true,
      showBadge: false,
      sound: CHANNEL_SOUNDS[CHANNELS.CALL],
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      audioAttributes: { usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
    } as any);

    // احفظ الإصدار الجديد بعد نجاح الإنشاء
    if (stored !== CHANNEL_VERSION) {
      await AsyncStorage.setItem(CHANNEL_VERSION_KEY, CHANNEL_VERSION).catch(() => {});
    }
  } catch {}
}

// ── معالج الإشعارات العام ─────────────────────────────────────────────────────
async function setupHandler(
  Notifications: typeof import("expo-notifications")
): Promise<void> {
  await Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const channelId = (notification.request.content.data as any)?.channelId as string | undefined;
      const isUrgent  = channelId === CHANNELS.URGENT || channelId === CHANNELS.TRANSPORT;
      // المكالمة الواردة والتطبيق مفتوح: شاشة الرنين داخل التطبيق تكفي
      if ((notification.request.content.data as any)?.type === "call") {
        return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: true };
      }
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

let lastPushToken: string | null = null;
/** فصل الجهاز عن الحساب عند تسجيل الخروج */
export async function unregisterPushToken(authToken: string): Promise<void> {
  if (Platform.OS === "web" || !lastPushToken) return;
  try {
    await fetch(`${getApiUrl()}/api/push-tokens/remove`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ token: lastPushToken }),
    });
  } catch {}
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
        body: JSON.stringify({ token, platform: Platform.OS, channel_ver: PUSH_CHANNEL_VER }),
      }).catch(() => {});
    }
    lastPushToken = token;

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
      [CHANNELS.TRANSPORT]: [0, 700, 200, 700, 200, 700, 300, 900],
      [CHANNELS.PRAYER]:    [0, 400, 100, 400],
      [CHANNELS.DEFAULT]:   [0, 200, 100, 200],
    };

    const soundName = CHANNEL_SOUNDS[channelId] ?? CHANNEL_SOUNDS[CHANNELS.DEFAULT];

    await Notifications.scheduleNotificationAsync({
      content: {
        title:   notification.title,
        body:    notification.body,
        data:    { ...(notification.data ?? {}), channelId },
        sound:   Platform.OS === "ios" ? `${soundName}.wav` : soundName,
        priority: ch === "URGENT" || ch === "TRANSPORT"
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

// ── تذكير بمناسبة في وقت محدد (مثل رحلات السفر والمواعيد) ──────────────────
export async function scheduleOccasionReminder(
  notification: PushNotification,
  fireDate: Date,
): Promise<void> {
  const delaySeconds = Math.round((fireDate.getTime() - Date.now()) / 1000);
  if (delaySeconds <= 0) return;
  return scheduleLocalNotification(notification, delaySeconds);
}

const handledResponses = new Set<string | undefined>();

// ── الاستماع للإشعارات الواردة والمضغوط عليها ────────────────────────────────
export function addNotificationListener(
  onReceive?: (notification: import("expo-notifications").Notification) => void,
  onResponse?: (data: Record<string, unknown>) => void,
): () => void {
  if (Platform.OS === "web") return () => {};

  let receivedSub: { remove: () => void } | null = null;
  let responseSub: { remove: () => void } | null = null;
  let cancelled = false;

  import("expo-notifications").then((Notifications) => {
    if (cancelled) return;
    receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      onReceive?.(notification);
    });
    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handledResponses.add(response?.notification?.request?.identifier);
      const data = (response?.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
      onResponse?.(data);
    });
    // فتح التطبيق المغلق بالضغط على إشعار: نوجّه المستخدم لوجهته بعد اكتمال التحميل
    Notifications.getLastNotificationResponseAsync().then((r) => {
      const id = r?.notification?.request?.identifier;
      if (!r || cancelled || !id || handledResponses.has(id)) return;
      if (Date.now() - (r.notification.date || 0) > 10 * 60 * 1000) return;
      handledResponses.add(id);
      const data = (r.notification.request.content.data ?? {}) as Record<string, unknown>;
      setTimeout(() => onResponse?.(data), 600);
    }).catch(() => {});
  }).catch(() => {});

  return () => {
    cancelled = true;
    receivedSub?.remove();
    responseSub?.remove();
  };
}

// ── تحديث شارة عدد الإشعارات غير المقروءة على أيقونة التطبيق ───────────────
export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {}
}
