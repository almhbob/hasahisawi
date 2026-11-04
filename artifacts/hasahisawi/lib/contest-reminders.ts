// «ذكّرني» للمسابقات والمناسبات القادمة.
// على الهاتف: إشعار محلي صباح يوم البدء (أو قبل الموعد بساعة إن كان قريباً).
// على الويب: يُحفظ الاختيار فقط (لا إشعارات محلية في المتصفح).
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "contest_reminders_v1";
type Store = Record<string, { at: string; notifId?: string | null }>;

async function read(): Promise<Store> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || "{}") || {}; } catch { return {}; }
}
async function write(s: Store) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export async function reminderKeys(): Promise<Set<string>> {
  return new Set(Object.keys(await read()));
}

/** وقت التذكير: التاسعة صباحاً يوم البدء، أو قبل البدء بساعة إذا كانت التاسعة قد فاتت. */
function fireTime(startIso: string): Date | null {
  const start = new Date(startIso);
  const morning = new Date(start);
  morning.setHours(9, 0, 0, 0);
  const at = morning.getTime() <= start.getTime() && morning.getTime() > Date.now() ? morning : new Date(start.getTime() - 3600_000);
  return at.getTime() > Date.now() + 60_000 ? at : null;
}

/**
 * يفعّل التذكير أو يلغيه. يُرجع الحالة الجديدة.
 * key: "occasion:<key>" أو "contest:<id>".
 */
export async function toggleReminder(key: string, title: string, body: string, startIso: string): Promise<{ on: boolean; scheduled: boolean }> {
  const s = await read();
  if (s[key]) {
    const id = s[key].notifId;
    delete s[key];
    await write(s);
    if (id && Platform.OS !== "web") {
      try { const N = await import("expo-notifications"); await N.cancelScheduledNotificationAsync(id); } catch {}
    }
    return { on: false, scheduled: false };
  }
  let notifId: string | null = null;
  if (Platform.OS !== "web") {
    const at = fireTime(startIso);
    if (at) {
      try {
        const N = await import("expo-notifications");
        let { status } = await N.getPermissionsAsync();
        if (status !== "granted") status = (await N.requestPermissionsAsync()).status;
        if (status === "granted") {
          notifId = await N.scheduleNotificationAsync({
            content: { title, body, data: key.startsWith("contest:") ? { type: "contest", contest_id: key.slice(8) } : { type: "contests" } },
            trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: at } as any,
          });
        }
      } catch {}
    }
  }
  s[key] = { at: startIso, notifId };
  await write(s);
  return { on: true, scheduled: !!notifId };
}
