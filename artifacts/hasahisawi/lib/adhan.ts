// الأذان — الإعدادات، الأصوات، والجدولة المحلية (تعمل والتطبيق مغلق)
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

export const ADHAN_SETTINGS_KEY = "adhan_settings_v2";
const LEGACY_ENABLED_KEY = "adhan_enabled_v1";
export const PRAYER_CACHE_KEY = "prayer_cache_v1";
const ID_PREFIX = "adhan-";

export type AdhanPrayer = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";
export const ADHAN_PRAYERS: { key: AdhanPrayer; name: string }[] = [
  { key: "Fajr", name: "الفجر" },
  { key: "Dhuhr", name: "الظهر" },
  { key: "Asr", name: "العصر" },
  { key: "Maghrib", name: "المغرب" },
  { key: "Isha", name: "العشاء" },
];

/**
 * أصوات الأذان. كل صوت له قناة Android خاصة لأن صوت القناة لا يتغيّر بعد إنشائها.
 * `sound` = اسم الملف داخل res/raw (بدون امتداد) — `null` يعني إشعاراً صامتاً.
 * لإضافة صوت جديد (مثل أذان شيخ سوداني): ضع الملف في assets/sounds/adhan/ وأضفه هنا وفي app.json.
 */
export type AdhanVoice = {
  id: string; name: string; desc: string; sound: string | null;
  channel: string; asset: (() => unknown) | null; available: boolean;
};

export const ADHAN_VOICES: AdhanVoice[] = [
  {
    id: "sudani", name: "أذان بصوت شيخ سوداني", desc: "أذان كامل بالمقام السوداني (حوالي دقيقتين)",
    sound: "hasahisawi_adhan_sd", channel: "adhan-sd-v4",
    asset: () => require("../assets/sounds/adhan/sd.mp3"), available: true,
  },
  {
    id: "full", name: "الأذان الكامل", desc: "أذان كامل بصوت المؤذّن (حوالي دقيقة ونصف)",
    sound: "hasahisawi_adhan_full", channel: "adhan-full-v3",
    asset: () => require("../assets/sounds/adhan.mp3"), available: true,
  },
  {
    id: "short", name: "تنبيه قصير", desc: "نغمة قصيرة مع إشعار الصلاة",
    sound: "hasahisawi_prayer", channel: "adhan-short-v3",
    asset: () => require("../assets/sounds/hasahisawi_prayer.wav"), available: true,
  },
  {
    id: "silent", name: "إشعار بلا صوت", desc: "إشعار واهتزاز فقط",
    sound: null, channel: "adhan-silent-v3", asset: null, available: true,
  },
];

/** مستوى صوت الأذان — لكل مستوى ملف صوت مُعايَر وقناة Android خاصة، فيعمل حتى والتطبيق مغلق */
export type AdhanVolume = "low" | "med" | "high" | "max";
export const ADHAN_VOLUMES: { id: AdhanVolume; name: string; icon: string; gain: number }[] = [
  { id: "low", name: "منخفض", icon: "volume-low", gain: 0.25 },
  { id: "med", name: "متوسط", icon: "volume-medium", gain: 0.5 },
  { id: "high", name: "عالٍ", icon: "volume-high", gain: 1 },
  { id: "max", name: "أعلى صوت", icon: "megaphone", gain: 1 },
];

/** اسم ملف الصوت (res/raw) والقناة لصوت ومستوى معيّنين */
export function adhanSoundFor(v: AdhanVoice, level: AdhanVolume): { sound: string | null; channel: string } {
  if (!v.sound) return { sound: null, channel: v.channel };
  if (level === "high") return { sound: v.sound, channel: v.channel };
  return { sound: `${v.sound}_${level}`, channel: `${v.channel}-${level}` };
}

export type AdhanSettings = {
  enabled: boolean;
  voice: string;
  volume: AdhanVolume;
  prayers: Record<AdhanPrayer, boolean>;
  /** تذكير قبل الصلاة بالدقائق (0 = بدون) */
  remindBefore: number;
};

export const DEFAULT_ADHAN: AdhanSettings = {
  enabled: true,
  voice: "sudani",
  volume: "high",
  prayers: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
  remindBefore: 0,
};

export function voiceById(id: string): AdhanVoice {
  const v = ADHAN_VOICES.find((x) => x.id === id && x.available);
  return v || ADHAN_VOICES[0];
}

export async function loadAdhanSettings(): Promise<AdhanSettings> {
  try {
    const raw = await AsyncStorage.getItem(ADHAN_SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...DEFAULT_ADHAN, ...p, volume: ADHAN_VOLUMES.some((x) => x.id === p.volume) ? p.volume : "high", prayers: { ...DEFAULT_ADHAN.prayers, ...(p.prayers || {}) } };
    }
    const legacy = await AsyncStorage.getItem(LEGACY_ENABLED_KEY);
    return { ...DEFAULT_ADHAN, enabled: legacy === null ? true : legacy === "1" };
  } catch { return DEFAULT_ADHAN; }
}

export async function saveAdhanSettings(s: AdhanSettings) {
  try {
    await AsyncStorage.setItem(ADHAN_SETTINGS_KEY, JSON.stringify(s));
    await AsyncStorage.setItem(LEGACY_ENABLED_KEY, s.enabled ? "1" : "0");
  } catch {}
}

async function ensureChannels() {
  if (Platform.OS !== "android") return;
  for (const v of ADHAN_VOICES) {
    if (!v.available) continue;
    for (const lvl of (v.sound ? ADHAN_VOLUMES : ADHAN_VOLUMES.slice(2, 3))) {
    const ss = adhanSoundFor(v, lvl.id);
    try {
      await Notifications.setNotificationChannelAsync(ss.channel, {
        name: `أذان الصلاة — ${v.name}${v.sound && lvl.id !== "high" ? ` (${lvl.name})` : ""}`,
        importance: Notifications.AndroidImportance.MAX,
        sound: ss.sound ?? null,
        enableVibrate: true,
        vibrationPattern: [0, 400, 250, 400],
        lightColor: "#27AE68",
        enableLights: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.MUSIC },
      } as any);
    } catch {}
    }
  }
  try {
    await Notifications.setNotificationChannelAsync("adhan-remind-v3", {
      name: "تذكير قبل الصلاة",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "hasahisawi_notif",
      enableVibrate: true,
    });
  } catch {}
  // القناة القديمة كانت بصوت النظام الافتراضي
  Notifications.deleteNotificationChannelAsync("adhan-channel").catch(() => {});
}

export async function requestAdhanPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return true;
    return (await Notifications.requestPermissionsAsync()).status === "granted";
  } catch { return false; }
}

/** يلغي إشعارات الأذان فقط (لا يمسّ باقي إشعارات التطبيق المجدولة) */
export async function cancelAdhan() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      const isAdhan = n.identifier.startsWith(ID_PREFIX) || (n.content as any)?.data?.kind === "adhan";
      // الإصدارات القديمة كانت تجدول بمعرّفات عشوائية وبعنوان «حان وقت صلاة»
      const legacy = typeof n.content?.title === "string" && n.content.title.includes("حان وقت صلاة");
      if (isAdhan || legacy) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
  } catch {}
}

function fmt(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
}

/** جدولة الأذان لسبعة أيام قادمة وفق الإعدادات */
export async function scheduleAdhan(times: Record<string, string>, s?: AdhanSettings) {
  if (Platform.OS === "web") return;
  const settings = s || (await loadAdhanSettings());
  await cancelAdhan();
  if (!settings.enabled) return;
  await ensureChannels();
  const voice = voiceById(settings.voice);
  const snd = adhanSoundFor(voice, settings.volume || "high");
  const now = Date.now();
  for (let d = 0; d < 7; d++) {
    for (const p of ADHAN_PRAYERS) {
      if (!settings.prayers[p.key]) continue;
      const t = times[p.key];
      if (!t) continue;
      const [h, m] = t.split(":").map(Number);
      const at = new Date();
      at.setDate(at.getDate() + d);
      at.setHours(h, m, 0, 0);
      const tag = `${at.getFullYear()}${at.getMonth() + 1}${at.getDate()}-${p.key}`;
      if (at.getTime() > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${ID_PREFIX}${tag}`,
          content: {
            title: `🕌 حان الآن موعد أذان ${p.name}`,
            body: p.key === "Fajr" ? `الصلاة خيرٌ من النوم — ${fmt(t)}` : `الله أكبر، حيّ على الصلاة — ${fmt(t)}`,
            sound: snd.sound ? `${snd.sound}${voice.id === "short" ? ".wav" : ".mp3"}` : undefined,
            priority: Notifications.AndroidNotificationPriority.MAX,
            data: { kind: "adhan", prayer: p.key, url: "/(tabs)/prayer" },
            ...(Platform.OS === "android" ? { channelId: snd.channel } : {}),
          } as any,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: snd.channel } as any,
        }).catch(() => {});
      }
      if (settings.remindBefore > 0) {
        const r = new Date(at.getTime() - settings.remindBefore * 60000);
        if (r.getTime() > now) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${ID_PREFIX}r-${tag}`,
            content: {
              title: `⏰ بقي ${settings.remindBefore} دقيقة على ${p.name}`,
              body: `استعدّ للصلاة — الأذان ${fmt(t)}`,
              data: { kind: "adhan", prayer: p.key, url: "/(tabs)/prayer" },
              ...(Platform.OS === "android" ? { channelId: "adhan-remind-v3" } : {}),
            } as any,
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r, channelId: "adhan-remind-v3" } as any,
          }).catch(() => {});
        }
      }
    }
  }
}

/** يُستدعى عند فتح التطبيق: يجدّد الجدولة من آخر مواقيت محفوظة */
export async function rescheduleAdhanFromCache() {
  if (Platform.OS === "web") return;
  try {
    const raw = await AsyncStorage.getItem(PRAYER_CACHE_KEY);
    const timings = raw ? JSON.parse(raw)?.data?.timings : null;
    if (!timings) return;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    await scheduleAdhan(timings);
  } catch {}
}

/** تشغيل تجريبي للصوت داخل التطبيق */
let preview: any = null;
export async function previewAdhan(voiceId: string, level: AdhanVolume = "high"): Promise<boolean> {
  await stopAdhanPreview();
  const v = voiceById(voiceId);
  if (!v.asset || Platform.OS === "web") return false;
  try {
    const { Audio } = await import("expo-av");
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: true, staysActiveInBackground: false });
    const { sound } = await Audio.Sound.createAsync(v.asset() as any, { shouldPlay: true, volume: ADHAN_VOLUMES.find((x) => x.id === level)?.gain ?? 1 });
    preview = sound;
    sound.setOnPlaybackStatusUpdate((st: any) => { if (st?.didJustFinish) stopAdhanPreview(); });
    return true;
  } catch { return false; }
}
/** تغيير صوت المعاينة أثناء التشغيل */
export async function setPreviewVolume(level: AdhanVolume) {
  if (preview) { try { await preview.setVolumeAsync(ADHAN_VOLUMES.find((x) => x.id === level)?.gain ?? 1); } catch {} }
}
export async function stopAdhanPreview() {
  const s = preview; preview = null;
  if (s) { try { await s.stopAsync(); await s.unloadAsync(); } catch {} }
}
