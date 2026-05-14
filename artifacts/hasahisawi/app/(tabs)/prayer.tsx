import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  ActivityIndicator, Platform, Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
// ملاحظة: تم إزالة expo-av عمداً.
// الأذان الآن يعمل عبر إشعارات النظام المحلية فقط (تؤذن في وقتها حتى لو كان التطبيق مغلقاً)
// ولا يُشغّل أي صوت من داخل التطبيق نفسه.
import * as Notifications from "expo-notifications";

const ADHAN_ENABLED_KEY = "adhan_enabled_v1";
const PRAYER_CACHE_KEY  = "prayer_cache_v1";

// ─── ثوابت ────────────────────────────────────────────────────────────────────
const HASAHISA_LAT  = 14.0566;
const HASAHISA_LON  = 33.4001;
const SETTINGS_KEY  = "prayer_settings_v2";
const NOTIF_CHANNEL = "adhan-channel";

const PRAYER_LIST = [
  { key: "Fajr",    name: "الفجر",   icon: "moon-outline"         as const, color: "#818CF8" },
  { key: "Sunrise", name: "الشروق",  icon: "sunny-outline"        as const, color: "#F0A500" },
  { key: "Dhuhr",   name: "الظهر",   icon: "sunny"                as const, color: "#27AE68" },
  { key: "Asr",     name: "العصر",   icon: "partly-sunny-outline" as const, color: "#3E9CBF" },
  { key: "Maghrib", name: "المغرب",  icon: "sunset-outline"       as const, color: "#F97316" },
  { key: "Isha",    name: "العشاء",  icon: "moon"                 as const, color: "#A78BFA" },
];

const ATHAN_PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

const METHODS = [
  { id: 3,  name: "الهيئة المصرية العامة للمساحة (موصى به للسودان)" },
  { id: 1,  name: "رابطة العالم الإسلامي" },
  { id: 4,  name: "جامعة أم القرى، مكة المكرمة" },
  { id: 5,  name: "جامعة العلوم الإسلامية، كراتشي" },
  { id: 2,  name: "الجمعية الإسلامية لأمريكا الشمالية" },
  { id: 12, name: "مؤسسة الهلال (تحري الرؤية)" },
];

const SCHOOLS = [
  { id: 0, name: "شافعي / مالكي / حنبلي (العصر: الفيء مثل الشيء)" },
  { id: 1, name: "حنفي (العصر: الفيء مثلي الشيء)" },
];

const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر",
  "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان",
  "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

const WEEKDAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEKDAYS_SHORT_AR = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

// ─── أنواع ──────────────────────────────────────────────────────────────────
type PrayerSettings = {
  method: number;
  school: number;
  latitude: number;
  longitude: number;
  offsets: { Fajr: number; Dhuhr: number; Asr: number; Maghrib: number; Isha: number };
};

const DEFAULT_SETTINGS: PrayerSettings = {
  method: 3,
  school: 0,
  latitude: HASAHISA_LAT,
  longitude: HASAHISA_LON,
  offsets: { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 },
};

// ─── دوال مساعدة ─────────────────────────────────────────────────────────────
function parseTime(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(t: string, fmt24 = false): string {
  const [h, m] = t.split(":").map(Number);
  if (fmt24) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const period = h < 12 ? "ص" : "م";
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, "0")} ${period}`;
}

function formatCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h > 0 ? h + "س " : ""}${String(m).padStart(2, "0")}د ${String(s).padStart(2, "0")}ث`;
}

// ─── التقويم الهجري ───────────────────────────────────────────────────────────
function hijriMonthDays(year: number, month: number): number {
  const leapYears = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29];
  if (month === 12 && leapYears.includes(year % 30)) return 30;
  return month % 2 === 1 ? 30 : 29;
}

function hijriToJD(year: number, month: number, day: number): number {
  return day
    + Math.ceil(29.5 * (month - 1))
    + (year - 1) * 354
    + Math.floor((3 + 11 * year) / 30)
    + 1948439.5;
}

function jdWeekday(jd: number): number {
  return Math.floor(jd + 1.5) % 7;
}

// ─── إشعارات الأذان المحلية ───────────────────────────────────────────────────
async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(NOTIF_CHANNEL, {
      name: "أذان الصلاة",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      enableVibrate: true,
      vibrationPattern: [0, 300, 200, 300],
      lightColor: "#27AE68",
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      showBadge: false,
    });
  } catch {}
}

async function requestNotifPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

async function scheduleAdhanNotifications(times: Record<string, string>) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = new Date();
    // جدول للأيام الـ 7 القادمة حتى لا يضطر المستخدم لفتح التطبيق يومياً
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      for (const key of ATHAN_PRAYERS) {
        const timeStr = times[key];
        if (!timeStr) continue;
        const [h, m] = timeStr.split(":").map(Number);
        const prayerDate = new Date();
        prayerDate.setDate(prayerDate.getDate() + dayOffset);
        prayerDate.setHours(h, m, 0, 0);
        if (prayerDate <= now) continue;
        const prayerName = PRAYER_LIST.find(p => p.key === key)?.name ?? key;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🕌 حان وقت صلاة ${prayerName}`,
            body: `الله أكبر — ${formatTime(timeStr)}`,
            sound: "default",
            priority: Notifications.AndroidNotificationPriority.MAX,
            ...(Platform.OS === "android" ? { channelId: NOTIF_CHANNEL } : {}),
          } as any,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: prayerDate,
          },
        });
      }
    }
  } catch {}
}

async function cancelAdhanNotifications() {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
}

// ─── مكوّن خلية اليوم الهجري ─────────────────────────────────────────────────
function HijriDayCell({
  day, isToday, isHoliday, onPress,
}: { day: number | null; isToday?: boolean; isHoliday?: boolean; onPress?: () => void }) {
  if (!day) return <View style={hc.cell} />;
  return (
    <AnimatedPress
      style={[hc.cell, isToday && hc.cellToday, isHoliday && !isToday && hc.cellHoliday]}
      onPress={onPress}
      scaleDown={0.9}
    >
      <Text style={[hc.dayNum, isToday && hc.dayNumToday, isHoliday && !isToday && { color: Colors.accent }]}>
        {day}
      </Text>
    </AnimatedPress>
  );
}

const HIJRI_SPECIAL: Record<number, number[]> = {
  1: [1, 10],
  3: [12],
  7: [27],
  8: [15],
  9: [1, 17, 21, 23, 27, 29, 30],
  10: [1, 2, 3],
  12: [8, 9, 10, 11, 12, 13],
};

// ─── آية اليوم (تتغير كل يوم بناءً على رقمه) ─────────────────────────────────
const DAILY_VERSES = [
  { text: "وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ ۖ أُجِيبُ دَعْوَةَ الدَّاعِ إِذَا دَعَانِ", surah: "البقرة: ١٨٦" },
  { text: "إِنَّ مَعَ الْعُسْرِ يُسْرًا", surah: "الشرح: ٦" },
  { text: "وَمَن يَتَّقِ اللَّهَ يَجْعَل لَّهُ مَخْرَجًا ۚ وَيَرْزُقْهُ مِنْ حَيْثُ لَا يَحْتَسِبُ", surah: "الطلاق: ٢-٣" },
  { text: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ", surah: "آل عمران: ١٧٣" },
  { text: "وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰ", surah: "الضحى: ٥" },
  { text: "إِنَّ اللَّهَ مَعَ الصَّابِرِينَ", surah: "البقرة: ١٥٣" },
  { text: "وَقُل رَّبِّ زِدْنِي عِلْمًا", surah: "طه: ١١٤" },
  { text: "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا ۝ إِنَّ مَعَ الْعُسْرِ يُسْرًا", surah: "الشرح: ٥-٦" },
  { text: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", surah: "البقرة: ٢٠١" },
  { text: "وَاللَّهُ يَعْلَمُ وَأَنتُمْ لَا تَعْلَمُونَ", surah: "البقرة: ٢١٦" },
  { text: "يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ", surah: "البقرة: ١٥٣" },
  { text: "وَهُوَ مَعَكُمْ أَيْنَ مَا كُنتُمْ", surah: "الحديد: ٤" },
  { text: "إِنَّ اللَّهَ لَا يُضِيعُ أَجْرَ الْمُحْسِنِينَ", surah: "التوبة: ١٢٠" },
  { text: "وَاعْلَمُوا أَنَّ اللَّهَ مَعَ الْمُتَّقِينَ", surah: "البقرة: ١٩٤" },
];

// ─── بيانات الأذكار ───────────────────────────────────────────────────────────
type DhikrItem = { id: number; title: string; text: string; count: number; ref: string };

const ADHKAR_MORNING: DhikrItem[] = [
  { id: 1, title: "أذكار الصباح — البدء", text: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ", count: 1, ref: "مسلم" },
  { id: 2, title: "آية الكرسي", text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ", count: 1, ref: "البقرة: ٢٥٥" },
  { id: 3, title: "سورة الإخلاص", text: "قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ", count: 3, ref: "قرآن كريم" },
  { id: 4, title: "سورة الفلق", text: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ۝ مِن شَرِّ مَا خَلَقَ ۝ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ۝ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ", count: 3, ref: "قرآن كريم" },
  { id: 5, title: "سورة الناس", text: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ ۝ مَلِكِ النَّاسِ ۝ إِلَٰهِ النَّاسِ ۝ مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ۝ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ", count: 3, ref: "قرآن كريم" },
  { id: 6, title: "التسبيح", text: "سُبْحَانَ اللهِ وَبِحَمْدِهِ", count: 100, ref: "البخاري ومسلم" },
  { id: 7, title: "طلب العافية", text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ", count: 3, ref: "أبو داود وابن ماجه" },
  { id: 8, title: "حسبي الله", text: "حَسْبِيَ اللهُ لَا إِلَٰهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ", count: 7, ref: "أبو داود" },
];

const ADHKAR_EVENING: DhikrItem[] = [
  { id: 1, title: "أذكار المساء — البدء", text: "أَمْسَيْنَا وَأَمْسَىٰ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ", count: 1, ref: "مسلم" },
  { id: 2, title: "دعاء المساء", text: "اللَّهُمَّ بِكَ أَمْسَيْنَا وَبِكَ أَصْبَحْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ النُّشُورُ", count: 1, ref: "الترمذي" },
  { id: 3, title: "آية الكرسي مساءً", text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ", count: 1, ref: "البقرة: ٢٥٥" },
  { id: 4, title: "التسبيح المسائي", text: "سُبْحَانَ اللهِ وَبِحَمْدِهِ", count: 100, ref: "البخاري" },
  { id: 5, title: "طلب المغفرة", text: "أَسْتَغْفِرُ اللهَ وَأَتُوبُ إِلَيْهِ", count: 100, ref: "البخاري" },
  { id: 6, title: "الحفاظ من الشر", text: "أَعُوذُ بِكَلِمَاتِ اللهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ", count: 3, ref: "مسلم" },
  { id: 7, title: "الصلاة على النبي ﷺ", text: "اللَّهُمَّ صَلِّ وَسَلِّمْ وَبَارِكْ عَلَىٰ نَبِيِّنَا مُحَمَّدٍ", count: 10, ref: "السنة النبوية" },
];

const ADHKAR_POST_PRAYER: DhikrItem[] = [
  { id: 1, title: "الاستغفار", text: "أَسْتَغْفِرُ اللهَ", count: 3, ref: "مسلم" },
  { id: 2, title: "دعاء السلام", text: "اللَّهُمَّ أَنْتَ السَّلَامُ وَمِنْكَ السَّلَامُ تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ", count: 1, ref: "مسلم" },
  { id: 3, title: "لا إله إلا الله", text: "لَا إِلَٰهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ", count: 1, ref: "مسلم" },
  { id: 4, title: "التسبيح", text: "سُبْحَانَ اللهِ", count: 33, ref: "مسلم" },
  { id: 5, title: "التحميد", text: "الْحَمْدُ لِلَّهِ", count: 33, ref: "مسلم" },
  { id: 6, title: "التكبير", text: "اللهُ أَكْبَرُ", count: 33, ref: "مسلم" },
  { id: 7, title: "إتمام المئة", text: "لَا إِلَٰهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ", count: 1, ref: "مسلم" },
];

// ─── أنواع المسبحة ────────────────────────────────────────────────────────────
const TASBIH_PRESETS = [
  { text: "سُبْحَانَ اللهِ",           target: 33,  color: "#22C55E", label: "تسبيح" },
  { text: "الْحَمْدُ لِلَّهِ",         target: 33,  color: "#F59E0B", label: "تحميد" },
  { text: "اللهُ أَكْبَرُ",            target: 33,  color: "#E05567", label: "تكبير" },
  { text: "لَا إِلَٰهَ إِلَّا اللهُ", target: 100, color: "#818CF8", label: "تهليل" },
  { text: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ", target: 100, color: "#F97316", label: "صلاة" },
];

// ─── المكوّن الرئيسي ───────────────────────────────────────────────────────────
export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [tab, setTab] = useState<"prayer" | "adhkar" | "tasbih" | "hijri">("prayer");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [fmt24, setFmt24] = useState(false);

  const [times, setTimes] = useState<Record<string, string> | null>(null);
  const [hijri, setHijri] = useState<{
    day: string; month: number; monthName: string; year: string; weekday: string;
  } | null>(null);
  const [gregorian, setGregorian] = useState<{ readable: string } | null>(null);

  const [settings, setSettings] = useState<PrayerSettings>(DEFAULT_SETTINGS);
  const [editSettings, setEditSettings] = useState<PrayerSettings>(DEFAULT_SETTINGS);

  const [nextPrayer, setNextPrayer] = useState<{
    name: string; key: string; color: string; time: string; secsLeft: number;
  } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── المسبحة الرقمية ───────────────────────────────────────────────────────
  const [tasbihIdx,   setTasbihIdx]   = useState(0);
  const [tasbihCount, setTasbihCount] = useState(0);
  const tasbihPreset = TASBIH_PRESETS[tasbihIdx];

  // ── الأذكار ───────────────────────────────────────────────────────────────
  const [adhkarCat, setAdhkarCat] = useState<"morning" | "evening" | "post">("morning");
  const [dhikrDone, setDhikrDone] = useState<Record<number, number>>({});

  const adhkarList = adhkarCat === "morning"
    ? ADHKAR_MORNING
    : adhkarCat === "evening"
    ? ADHKAR_EVENING
    : ADHKAR_POST_PRAYER;

  // آية اليوم بناءً على يوم الشهر
  const dailyVerse = React.useMemo(() => {
    const dayOfMonth = new Date().getDate();
    return DAILY_VERSES[dayOfMonth % DAILY_VERSES.length];
  }, []);

  // ── الأذان (إشعارات نظام محلية فقط — لا تشغيل صوت داخل التطبيق) ─────────
  const [adhanEnabled, setAdhanEnabled] = useState(true);
  const adhanEnabledRef = useRef(true);
  const timesRef        = useRef<Record<string, string> | null>(null);

  useEffect(() => { adhanEnabledRef.current = adhanEnabled; }, [adhanEnabled]);
  useEffect(() => { timesRef.current = times; }, [times]);

  // تهيئة الإشعارات عند التحميل (بدون أي صوت داخلي)
  useEffect(() => {
    AsyncStorage.getItem(ADHAN_ENABLED_KEY).then(v => {
      const enabled = v === null ? true : v === "1";
      setAdhanEnabled(enabled);
      adhanEnabledRef.current = enabled;
    });

    ensureAndroidChannel();

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }, []);

  // ── تفعيل / إيقاف جدولة الأذان ───────────────────────────────────────────
  const toggleAdhanEnabled = useCallback(async (next: boolean) => {
    setAdhanEnabled(next);
    adhanEnabledRef.current = next;
    try { await AsyncStorage.setItem(ADHAN_ENABLED_KEY, next ? "1" : "0"); } catch {}

    if (!next) {
      cancelAdhanNotifications();
    } else {
      const granted = await requestNotifPermission();
      if (granted && timesRef.current) {
        scheduleAdhanNotifications(timesRef.current);
      }
    }
  }, []);

  // ── التقويم الهجري ─────────────────────────────────────────────────────────
  const [hijriViewMonth, setHijriViewMonth] = useState(1);
  const [hijriViewYear,  setHijriViewYear]  = useState(1447);

  // ── تحميل الإعدادات ────────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    try {
      const apiBase = getApiUrl();
      if (apiBase) {
        const res = await fetch(`${apiBase}/api/prayer-settings`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const data = await res.json();
          if (data.settings) {
            const merged: PrayerSettings = {
              method:    data.settings.method    ?? DEFAULT_SETTINGS.method,
              school:    data.settings.school    ?? DEFAULT_SETTINGS.school,
              latitude:  parseFloat(data.settings.latitude)  || DEFAULT_SETTINGS.latitude,
              longitude: parseFloat(data.settings.longitude) || DEFAULT_SETTINGS.longitude,
              offsets: {
                Fajr:    data.settings.fajr_offset    ?? 0,
                Dhuhr:   data.settings.dhuhr_offset   ?? 0,
                Asr:     data.settings.asr_offset     ?? 0,
                Maghrib: data.settings.maghrib_offset ?? 0,
                Isha:    data.settings.isha_offset    ?? 0,
              },
            };
            const local = await AsyncStorage.getItem(SETTINGS_KEY);
            if (local) {
              const parsed = JSON.parse(local);
              setSettings({ ...merged, ...parsed });
              setEditSettings({ ...merged, ...parsed });
            } else {
              setSettings(merged);
              setEditSettings(merged);
            }
            return;
          }
        }
      }
    } catch {}
    try {
      const local = await AsyncStorage.getItem(SETTINGS_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        setSettings(parsed);
        setEditSettings(parsed);
      }
    } catch {}
  }, []);

  // ── حساب الصلاة القادمة ─────────────────────────────────────────────────────
  const computeNextPrayer = useCallback((t: Record<string, string>) => {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    for (const key of ATHAN_PRAYERS) {
      const mins = parseTime(t[key]);
      if (mins > nowMins) {
        const diff = (mins - nowMins) * 60 - now.getSeconds();
        const info = PRAYER_LIST.find(p => p.key === key)!;
        setNextPrayer({ key, name: info.name, color: info.color, time: t[key], secsLeft: diff });
        setCountdown(diff);
        return;
      }
    }
    // بعد العشاء → الفجر غداً
    const fajrMins = parseTime(t["Fajr"]);
    const diff     = ((24 * 60 - nowMins) + fajrMins) * 60 - now.getSeconds();
    setNextPrayer({ key: "Fajr", name: "الفجر", color: "#818CF8", time: t["Fajr"], secsLeft: diff });
    setCountdown(diff);
  }, []);

  // ── جلب أوقات الصلاة ────────────────────────────────────────────────────────
  const fetchTimes = useCallback(async (s: PrayerSettings) => {
    setLoading(true);
    setError(null);
    try {
      const tune = `0,${s.offsets.Fajr},0,${s.offsets.Dhuhr},${s.offsets.Asr},${s.offsets.Maghrib},0,${s.offsets.Isha},0`;
      const now  = new Date();
      const dd   = String(now.getDate()).padStart(2, "0");
      const mm   = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();
      const dateStr = `${dd}-${mm}-${yyyy}`;

      // مساعد fetch مع AbortController صريح (AbortSignal.timeout غير موثوق في RN)
      const fetchWithTimeout = async (url: string, ms: number): Promise<Response> => {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), ms);
        try { return await fetch(url, { signal: ctrl.signal }); }
        finally { clearTimeout(tid); }
      };

      // المسارات: البروكسي الخلفي أولاً (أسرع وأكثر موثوقية)، ثم aladhan مباشرة
      const apiBase = getApiUrl();
      const backendParams = new URLSearchParams({
        date: dateStr, latitude: String(s.latitude), longitude: String(s.longitude),
        method: String(s.method), school: String(s.school), tune,
      });
      const urls: [string, number][] = [
        [`${apiBase}/api/prayer-times?${backendParams}`, 15000],
        [`https://api.aladhan.com/v1/timings/${dateStr}?latitude=${s.latitude}&longitude=${s.longitude}&method=${s.method}&school=${s.school}&tune=${tune}`, 20000],
        [`https://api.aladhan.com/v1/timingsByCity/${dateStr}?city=Hasahisa&country=SD&method=${s.method}&school=${s.school}`, 20000],
      ];

      let data: any = null;
      for (const [url, ms] of urls) {
        try {
          const res = await fetchWithTimeout(url, ms);
          if (!res.ok) continue;
          const json = await res.json();
          if (json.code === 200 && json.data?.timings?.Fajr) { data = json.data; break; }
        } catch {}
      }

      if (!data) throw new Error("no data");

      // حفظ نسخة احتياطية في التخزين المحلي
      await AsyncStorage.setItem(PRAYER_CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() })).catch(() => {});

      setTimes(data.timings);
      setGregorian(data.date.gregorian);
      const h = data.date.hijri;
      setHijri({
        day: h.day, month: parseInt(h.month.number, 10),
        monthName: h.month.ar, year: h.year, weekday: h.weekday.ar,
      });
      setHijriViewMonth(parseInt(h.month.number, 10));
      setHijriViewYear(parseInt(h.year, 10));
      computeNextPrayer(data.timings);

      // جدولة الإشعارات المحلية إذا كان الأذان مفعّلاً
      if (adhanEnabledRef.current) {
        const granted = await requestNotifPermission();
        if (granted) scheduleAdhanNotifications(data.timings);
      }
    } catch {
      // محاولة استخدام البيانات المخزّنة مسبقاً عند فقدان الاتصال
      try {
        const cached = await AsyncStorage.getItem(PRAYER_CACHE_KEY);
        if (cached) {
          const { data } = JSON.parse(cached);
          setTimes(data.timings);
          setGregorian(data.date.gregorian);
          const h = data.date.hijri;
          setHijri({
            day: h.day, month: parseInt(h.month.number, 10),
            monthName: h.month.ar, year: h.year, weekday: h.weekday.ar,
          });
          computeNextPrayer(data.timings);
          setError("⚠️ يعرض مواقيت آخر يوم متاح — تحقق من الاتصال لتحديثها");
          return;
        }
      } catch {}
      setError("تعذّر جلب مواقيت الآذان. تحقق من اتصالك بالإنترنت.");
    } finally {
      setLoading(false);
    }
  }, [computeNextPrayer]);

  // ── العداد التنازلي (لا يُشغّل أي صوت — الأذان يأتي من إشعار النظام) ────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          // حلّ وقت الصلاة — أعِد حساب الصلاة القادمة فقط
          const currentTimes = timesRef.current;
          if (currentTimes) computeNextPrayer(currentTimes);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [computeNextPrayer]);

  // ── التهيئة ───────────────────────────────────────────────────────────────
  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { fetchTimes(settings); }, [settings]);

  // ── حفظ الإعدادات ──────────────────────────────────────────────────────────
  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(editSettings));
      setSettings(editSettings);
      setSettingsVisible(false);
    } catch {}
  };

  // ── بيانات التقويم ──────────────────────────────────────────────────────────
  const hijriCalendarCells = React.useMemo(() => {
    const totalDays = hijriMonthDays(hijriViewYear, hijriViewMonth);
    const firstJD   = hijriToJD(hijriViewYear, hijriViewMonth, 1);
    const firstWd   = jdWeekday(firstJD);
    const cells: (number | null)[] = Array(firstWd).fill(null);
    for (let d = 1; d <= totalDays; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [hijriViewMonth, hijriViewYear]);

  const specialDays = HIJRI_SPECIAL[hijriViewMonth] ?? [];

  // ─── UI ────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>

      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 12 }]}>
        <Pressable style={s.settingsBtn} onPress={() => { setEditSettings(settings); setSettingsVisible(true); }}>
          <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
        </Pressable>
        <Text style={s.headerTitle}>المساحة الدينية</Text>
        <Pressable style={s.fmtBtn} onPress={() => setFmt24(v => !v)}>
          <Text style={s.fmtBtnText}>{fmt24 ? "24" : "12"}</Text>
        </Pressable>
      </View>

      {/* آية اليوم */}
      <Animated.View entering={FadeIn.duration(600)} style={s.verseCard}>
        <LinearGradient
          colors={["rgba(129,140,248,0.12)", "rgba(10,15,12,0.6)"]}
          style={StyleSheet.absoluteFill as any}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />
        <Text style={s.verseLabel}>✦ آية اليوم</Text>
        <Text style={s.verseText}>{dailyVerse.text}</Text>
        <Text style={s.verseSurah}>— {dailyVerse.surah}</Text>
      </Animated.View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScrollRow} contentContainerStyle={s.tabRowContent}>
        {([
          { key: "prayer",  label: "مواقيت الآذان", icon: "time-outline",            color: "#818CF8" },
          { key: "adhkar",  label: "الأذكار",        icon: "leaf-outline",            color: "#22C55E" },
          { key: "tasbih",  label: "المسبحة",        icon: "radio-button-on-outline", color: "#F59E0B" },
          { key: "hijri",   label: "التقويم الهجري", icon: "moon-outline",            color: Colors.accent },
        ] as const).map(t => (
          <Pressable
            key={t.key}
            style={[s.tabBtn, tab === t.key && { ...s.tabBtnActive, borderColor: t.color + "55", backgroundColor: t.color + "14" }]}
            onPress={() => setTab(t.key as any)}
          >
            <Ionicons name={t.icon as any} size={15} color={tab === t.key ? t.color : Colors.textMuted} />
            <Text style={[s.tabBtnText, tab === t.key && { color: t.color }]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadingText}>جارٍ جلب مواقيت الآذان...</Text>
        </View>
      ) : error && !times ? (
        <View style={s.errorWrap}>
          <Ionicons name="wifi-outline" size={48} color={Colors.textMuted} />
          <Text style={s.errorText}>{error}</Text>
          <AnimatedPress style={s.retryBtn} onPress={() => fetchTimes(settings)} scaleDown={0.95}>
            <Text style={s.retryBtnText}>إعادة المحاولة</Text>
          </AnimatedPress>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 100 : 120 }}>

          {/* تحذير عند استخدام بيانات مخزّنة */}
          {error && times && (
            <Pressable
              style={s.cacheWarning}
              onPress={() => fetchTimes(settings)}
            >
              <Ionicons name="cloud-offline-outline" size={14} color="#F59E0B" />
              <Text style={s.cacheWarningText}>{error}</Text>
            </Pressable>
          )}

          {/* شريط التاريخ */}
          {hijri && (
            <Animated.View entering={FadeIn.duration(400)} style={s.dateBar}>
              <View style={s.dateBarRight}>
                <Text style={s.dateHijri}>{hijri.weekday}، {hijri.day} {hijri.monthName} {hijri.year} هـ</Text>
                <Text style={s.dateGregorian}>{gregorian?.readable}</Text>
              </View>
              <View style={s.moonIcon}>
                <Ionicons name="moon" size={24} color={Colors.accent} />
              </View>
            </Animated.View>
          )}

          {tab === "prayer" && times && (
            <>
              {/* ── بطاقة الصلاة القادمة ── */}
              {nextPrayer && (
                <Animated.View entering={FadeInDown.duration(500).springify()} style={[s.nextCard, { borderColor: nextPrayer.color + "50" }]}>

                  {/* اسم الصلاة + وقتها */}
                  <View style={s.nextPrayerIconWrap}>
                    <View style={[s.nextPrayerIcon, { backgroundColor: nextPrayer.color + "20" }]}>
                      <Ionicons
                        name={(PRAYER_LIST.find(p => p.key === nextPrayer.key)?.icon ?? "time-outline") as any}
                        size={28}
                        color={nextPrayer.color}
                      />
                    </View>
                  </View>

                  <View style={s.nextBadge}>
                    <Text style={[s.nextBadgeText, { color: nextPrayer.color }]}>الصلاة القادمة</Text>
                  </View>
                  <Text style={[s.nextName, { color: nextPrayer.color }]}>{nextPrayer.name}</Text>
                  <Text style={s.nextTime}>{formatTime(nextPrayer.time, fmt24)}</Text>

                  {/* العداد التنازلي */}
                  <View style={s.countdownRow}>
                    <Ionicons name="timer-outline" size={16} color={Colors.textMuted} />
                    <Text style={s.countdownText}>سيحين بعد: {formatCountdown(countdown)}</Text>
                  </View>

                  {/* ── التحكم بالأذان التلقائي ── */}
                  <View style={s.adhanControlRow}>

                    {/* مفتاح التفعيل */}
                    <View style={[s.toggleWrap, adhanEnabled && s.toggleWrapOn]}>
                      <Ionicons
                        name={adhanEnabled ? "notifications" : "notifications-off-outline"}
                        size={16}
                        color={adhanEnabled ? Colors.primary : Colors.textMuted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.toggleLabel, adhanEnabled && { color: Colors.primary }]}>
                          {adhanEnabled ? "الأذان مُفعَّل" : "الأذان معطّل"}
                        </Text>
                        <Text style={s.toggleSub}>
                          {adhanEnabled ? "سيؤذَّن تلقائياً عند كل صلاة" : "اضغط لتفعيل الأذان التلقائي"}
                        </Text>
                      </View>
                      <Switch
                        value={adhanEnabled}
                        onValueChange={toggleAdhanEnabled}
                        trackColor={{ false: Colors.divider, true: Colors.primary + "60" }}
                        thumbColor={adhanEnabled ? Colors.primary : Colors.textMuted}
                        ios_backgroundColor={Colors.divider}
                      />
                    </View>
                  </View>

                </Animated.View>
              )}

              {/* قائمة أوقات الصلوات */}
              <View style={s.prayerList}>
                {PRAYER_LIST.map((p, i) => {
                  const isNext = nextPrayer?.key === p.key;
                  return (
                    <Animated.View key={p.key} entering={FadeInDown.delay(i * 60).springify().damping(18)}>
                      <View style={[s.prayerRow, isNext && s.prayerRowActive, { borderRightColor: p.color }]}>
                        <View style={[s.prayerIconBox, { backgroundColor: p.color + "18" }]}>
                          <Ionicons name={p.icon as any} size={20} color={p.color} />
                        </View>
                        <View style={s.prayerInfo}>
                          <Text style={[s.prayerName, isNext && { color: p.color }]}>{p.name}</Text>
                          {isNext && (
                            <Text style={[s.prayerSub, { color: p.color }]}>● القادمة</Text>
                          )}
                        </View>
                        <Text style={[s.prayerTime, isNext && { color: p.color, fontFamily: "Cairo_700Bold" }]}>
                          {times[p.key] ? formatTime(times[p.key], fmt24) : "--"}
                        </Text>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>

              <Text style={s.calcNote}>
                طريقة الحساب: {METHODS.find(m => m.id === settings.method)?.name?.split("(")[0] ?? "—"}
                {" | "}{SCHOOLS.find(sc => sc.id === settings.school)?.name?.split("(")[0] ?? "—"}
              </Text>
            </>
          )}

          {/* ── التقويم الهجري ── */}
          {tab === "hijri" && (
            <>
              <View style={s.monthNav}>
                <AnimatedPress style={s.navBtn} onPress={() => {
                  if (hijriViewMonth === 1) { setHijriViewMonth(12); setHijriViewYear(y => y - 1); }
                  else setHijriViewMonth(m => m - 1);
                }} scaleDown={0.9}>
                  <Ionicons name="chevron-forward" size={22} color={Colors.primary} />
                </AnimatedPress>
                <View style={s.monthTitleWrap}>
                  <Text style={s.monthTitle}>{HIJRI_MONTHS[hijriViewMonth - 1]}</Text>
                  <Text style={s.yearText}>{hijriViewYear} هـ</Text>
                </View>
                <AnimatedPress style={s.navBtn} onPress={() => {
                  if (hijriViewMonth === 12) { setHijriViewMonth(1); setHijriViewYear(y => y + 1); }
                  else setHijriViewMonth(m => m + 1);
                }} scaleDown={0.9}>
                  <Ionicons name="chevron-back" size={22} color={Colors.primary} />
                </AnimatedPress>
              </View>

              <Animated.View key={`${hijriViewYear}-${hijriViewMonth}`} entering={FadeIn.duration(300)} style={s.calCard}>
                <View style={hc.weekRow}>
                  {WEEKDAYS_SHORT_AR.map((d, i) => (
                    <View key={i} style={hc.weekHeader}>
                      <Text style={[hc.weekHeaderText, i === 5 && { color: Colors.accent }]}>{d}</Text>
                    </View>
                  ))}
                </View>
                {Array.from({ length: hijriCalendarCells.length / 7 }, (_, row) => (
                  <View key={row} style={hc.weekRow}>
                    {hijriCalendarCells.slice(row * 7, row * 7 + 7).map((day, col) => (
                      <HijriDayCell
                        key={col}
                        day={day}
                        isToday={
                          day !== null &&
                          hijriViewMonth === (hijri?.month ?? -1) &&
                          hijriViewYear  === (hijri ? parseInt(hijri.year) : -1) &&
                          String(day)    === (hijri?.day ?? "")
                        }
                        isHoliday={day !== null && specialDays.includes(day)}
                      />
                    ))}
                  </View>
                ))}
              </Animated.View>

              {specialDays.length > 0 && (
                <View style={s.specialSection}>
                  <Text style={s.specialTitle}>أيام مميزة في {HIJRI_MONTHS[hijriViewMonth - 1]}</Text>
                  {specialDays.map(d => (
                    <View key={d} style={s.specialItem}>
                      <View style={s.specialDot} />
                      <Text style={s.specialText}>اليوم {d} {HIJRI_MONTHS[hijriViewMonth - 1]}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={s.hijriInfoCard}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
                <Text style={s.hijriInfoText}>
                  عدد أيام شهر {HIJRI_MONTHS[hijriViewMonth - 1]}: {hijriMonthDays(hijriViewYear, hijriViewMonth)} يوماً
                  {"\n"}يبدأ يوم {WEEKDAYS_AR[jdWeekday(hijriToJD(hijriViewYear, hijriViewMonth, 1))]}
                </Text>
              </View>

              <Text style={s.calcNote}>
                التقويم الهجري بالحساب الحسابي (جدول). قد يختلف يوم واحد عن الرؤية الفعلية.
              </Text>
            </>
          )}

          {/* ── تبويب الأذكار ── */}
          {tab === "adhkar" && (
            <>
              {/* فئات الأذكار */}
              <View style={s.adhkarCatRow}>
                {([
                  { key: "morning", label: "🌅 صباحية", color: "#F59E0B" },
                  { key: "evening", label: "🌙 مسائية",  color: "#818CF8" },
                  { key: "post",    label: "🕌 بعد الصلاة", color: "#22C55E" },
                ] as const).map(cat => (
                  <Pressable
                    key={cat.key}
                    style={[s.adhkarCatBtn, adhkarCat === cat.key && { backgroundColor: cat.color + "18", borderColor: cat.color + "50" }]}
                    onPress={() => { setAdhkarCat(cat.key); setDhikrDone({}); }}
                  >
                    <Text style={[s.adhkarCatText, adhkarCat === cat.key && { color: cat.color }]}>{cat.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* قائمة الأذكار */}
              <View style={s.dhikrList}>
                {adhkarList.map((dhikr, i) => {
                  const done = dhikrDone[dhikr.id] ?? 0;
                  const isComplete = done >= dhikr.count;
                  return (
                    <Animated.View key={dhikr.id} entering={FadeInDown.delay(i * 50).springify().damping(18)}>
                      <Pressable
                        style={[s.dhikrCard, isComplete && s.dhikrCardDone]}
                        onPress={() => {
                          if (!isComplete) {
                            setDhikrDone(prev => ({ ...prev, [dhikr.id]: (prev[dhikr.id] ?? 0) + 1 }));
                          }
                        }}
                      >
                        {/* Header */}
                        <View style={s.dhikrHeader}>
                          <View style={[s.dhikrCountBadge, isComplete && { backgroundColor: "#22C55E30", borderColor: "#22C55E60" }]}>
                            {isComplete
                              ? <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                              : <Text style={s.dhikrCountText}>{done}/{dhikr.count}</Text>
                            }
                          </View>
                          <Text style={[s.dhikrTitle, isComplete && { color: Colors.textMuted }]}>{dhikr.title}</Text>
                        </View>

                        {/* النص */}
                        <Text style={[s.dhikrText, isComplete && { opacity: 0.55 }]}>{dhikr.text}</Text>

                        {/* المرجع */}
                        <View style={s.dhikrRefRow}>
                          <Text style={s.dhikrRef}>{dhikr.ref}</Text>
                          <Text style={s.dhikrHint}>
                            {isComplete ? "✓ تمّ" : `اضغط ${dhikr.count > 1 ? `(${dhikr.count} مرات)` : "مرة"}`}
                          </Text>
                        </View>

                        {/* شريط التقدم */}
                        {dhikr.count > 1 && (
                          <View style={s.dhikrProgress}>
                            <View style={[s.dhikrProgressFill, { width: `${Math.min(100, (done / dhikr.count) * 100)}%` as any, backgroundColor: isComplete ? "#22C55E" : Colors.primary }]} />
                          </View>
                        )}
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>

              {/* إعادة ضبط */}
              <Pressable style={s.resetAllBtn} onPress={() => setDhikrDone({})}>
                <Ionicons name="refresh-outline" size={15} color={Colors.textMuted} />
                <Text style={s.resetAllText}>إعادة ضبط الأذكار</Text>
              </Pressable>
            </>
          )}

          {/* ── تبويب المسبحة ── */}
          {tab === "tasbih" && (
            <View style={s.tasbihContainer}>

              {/* اختيار نوع التسبيح */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tasbihPresetRow}>
                {TASBIH_PRESETS.map((preset, idx) => (
                  <Pressable
                    key={idx}
                    style={[s.tasbihPresetBtn, tasbihIdx === idx && { backgroundColor: preset.color + "20", borderColor: preset.color + "60" }]}
                    onPress={() => { setTasbihIdx(idx); setTasbihCount(0); }}
                  >
                    <Text style={[s.tasbihPresetLabel, tasbihIdx === idx && { color: preset.color }]}>{preset.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* نص التسبيح */}
              <Animated.View key={tasbihIdx} entering={FadeIn.duration(300)} style={[s.tasbihTextCard, { borderColor: tasbihPreset.color + "30" }]}>
                <Text style={[s.tasbihMainText, { color: tasbihPreset.color }]}>
                  {tasbihPreset.text}
                </Text>
              </Animated.View>

              {/* العداد الدائري */}
              <View style={s.tasbihCounterWrap}>
                <View style={[s.tasbihRing, { borderColor: tasbihPreset.color + "30" }]}>
                  <View style={[s.tasbihRingInner, { borderColor: tasbihPreset.color + "60" }]}>
                    <Text style={[s.tasbihNumber, { color: tasbihPreset.color }]}>
                      {tasbihCount}
                    </Text>
                    <Text style={s.tasbihTarget}>من {tasbihPreset.target}</Text>
                  </View>
                </View>

                {/* شريط التقدم الدائري بديل (مستطيل) */}
                <View style={s.tasbihBar}>
                  <View style={[
                    s.tasbihBarFill,
                    { width: `${Math.min(100, (tasbihCount / tasbihPreset.target) * 100)}%` as any, backgroundColor: tasbihPreset.color }
                  ]} />
                </View>

                {tasbihCount >= tasbihPreset.target && (
                  <Animated.View entering={FadeInDown.springify()} style={[s.tasbihDoneBadge, { backgroundColor: tasbihPreset.color + "20", borderColor: tasbihPreset.color + "50" }]}>
                    <Ionicons name="checkmark-circle" size={20} color={tasbihPreset.color} />
                    <Text style={[s.tasbihDoneText, { color: tasbihPreset.color }]}>أحسنت! اكتملت {tasbihPreset.target} مرة</Text>
                  </Animated.View>
                )}
              </View>

              {/* زر الضغط الكبير */}
              <Pressable
                style={({ pressed }) => [
                  s.tasbihBtn,
                  { backgroundColor: tasbihPreset.color, opacity: pressed ? 0.8 : 1 },
                  tasbihCount >= tasbihPreset.target && { opacity: 0.5 }
                ]}
                onPress={() => {
                  if (tasbihCount < tasbihPreset.target * 3) setTasbihCount(c => c + 1);
                }}
              >
                <Text style={s.tasbihBtnText}>اضغط للتسبيح</Text>
                <Text style={s.tasbihBtnSub}>{tasbihPreset.text}</Text>
              </Pressable>

              {/* إعادة ضبط */}
              <Pressable style={s.resetAllBtn} onPress={() => setTasbihCount(0)}>
                <Ionicons name="refresh-outline" size={15} color={Colors.textMuted} />
                <Text style={s.resetAllText}>إعادة الضبط</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── نافذة الإعدادات ── */}
      <Modal visible={settingsVisible} transparent animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <View style={ms.overlay}>
          <Pressable style={ms.backdrop} onPress={() => setSettingsVisible(false)} />
          <View style={ms.sheet}>
            <View style={ms.handle} />
            <View style={ms.sheetHeader}>
              <Text style={ms.sheetTitle}>إعدادات مواقيت الآذان</Text>
              <Pressable onPress={() => setSettingsVisible(false)} hitSlop={12}>
                <Ionicons name="close-circle" size={26} color={Colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={ms.sectionLabel}>طريقة الحساب</Text>
              {METHODS.map(m => (
                <Pressable key={m.id}
                  style={[ms.optionRow, editSettings.method === m.id && ms.optionRowActive]}
                  onPress={() => setEditSettings(s => ({ ...s, method: m.id }))}
                >
                  <View style={[ms.radio, editSettings.method === m.id && ms.radioActive]}>
                    {editSettings.method === m.id && <View style={ms.radioDot} />}
                  </View>
                  <Text style={[ms.optionText, editSettings.method === m.id && { color: Colors.primary }]}>{m.name}</Text>
                </Pressable>
              ))}

              <Text style={ms.sectionLabel}>مذهب صلاة العصر</Text>
              {SCHOOLS.map(school => (
                <Pressable key={school.id}
                  style={[ms.optionRow, editSettings.school === school.id && ms.optionRowActive]}
                  onPress={() => setEditSettings(s => ({ ...s, school: school.id }))}
                >
                  <View style={[ms.radio, editSettings.school === school.id && ms.radioActive]}>
                    {editSettings.school === school.id && <View style={ms.radioDot} />}
                  </View>
                  <Text style={[ms.optionText, editSettings.school === school.id && { color: Colors.primary }]}>{school.name}</Text>
                </Pressable>
              ))}

              <Text style={ms.sectionLabel}>تعديل الدقائق (+ أو -)</Text>
              <Text style={ms.sectionSub}>للتصحيح الدقيق لمواقيت بلدك</Text>
              {(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const).map(key => {
                const nameMap: Record<string, string> = {
                  Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء",
                };
                return (
                  <View key={key} style={ms.offsetRow}>
                    <Text style={ms.offsetLabel}>{nameMap[key]}</Text>
                    <View style={ms.offsetControls}>
                      <Pressable style={ms.offsetBtn}
                        onPress={() => setEditSettings(s => ({ ...s, offsets: { ...s.offsets, [key]: s.offsets[key] - 1 } }))}>
                        <Ionicons name="remove" size={18} color={Colors.primary} />
                      </Pressable>
                      <Text style={ms.offsetVal}>{editSettings.offsets[key] > 0 ? "+" : ""}{editSettings.offsets[key]}</Text>
                      <Pressable style={ms.offsetBtn}
                        onPress={() => setEditSettings(s => ({ ...s, offsets: { ...s.offsets, [key]: s.offsets[key] + 1 } }))}>
                        <Ionicons name="add" size={18} color={Colors.primary} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              <View style={ms.btnRow}>
                <AnimatedPress style={ms.resetBtn} onPress={() => setEditSettings(DEFAULT_SETTINGS)} scaleDown={0.95}>
                  <Text style={ms.resetBtnText}>إعادة تعيين</Text>
                </AnimatedPress>
                <AnimatedPress style={ms.saveBtn} onPress={saveSettings} scaleDown={0.95}>
                  <Text style={ms.saveBtnText}>حفظ التغييرات</Text>
                </AnimatedPress>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── الأنماط ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  headerTitle:  { fontFamily: "Cairo_700Bold",  fontSize: 20, color: Colors.textPrimary },
  settingsBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.cardBg,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.divider,
  },
  fmtBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + "18",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.primary + "35",
  },
  fmtBtnText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primary },

  // ── آية اليوم ──
  verseCard: {
    marginHorizontal: 16, marginTop: 10, marginBottom: 2,
    borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: "rgba(129,140,248,0.22)",
    overflow: "hidden", gap: 6,
  },
  verseLabel: {
    fontFamily: "Cairo_600SemiBold", fontSize: 11,
    color: "#818CF8", textAlign: "right",
  },
  verseText: {
    fontFamily: "Cairo_600SemiBold", fontSize: 17,
    color: Colors.textPrimary, textAlign: "right",
    lineHeight: 32,
  },
  verseSurah: {
    fontFamily: "Cairo_400Regular", fontSize: 12,
    color: "#818CF880", textAlign: "right",
  },

  // ── شريط التبويبات القابل للتمرير ──
  tabScrollRow: { flexGrow: 0 },
  tabRowContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tabRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  tabBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
  },
  tabBtnActive: { backgroundColor: Colors.primary + "18", borderColor: Colors.primary + "40" },
  tabBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  // ── الأذكار ──
  adhkarCatRow: {
    flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 4, marginTop: 4,
  },
  adhkarCatBtn: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 6,
    borderRadius: 12, backgroundColor: Colors.cardBg,
    borderWidth: 1, borderColor: Colors.divider, alignItems: "center",
  },
  adhkarCatText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  dhikrList: { marginHorizontal: 16, marginTop: 4, gap: 8 },
  dhikrCard: {
    backgroundColor: Colors.cardBg, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: Colors.divider, gap: 10,
  },
  dhikrCardDone: { backgroundColor: "#22C55E0A", borderColor: "#22C55E22" },
  dhikrHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  dhikrCountBadge: {
    minWidth: 42, height: 26, borderRadius: 8,
    backgroundColor: Colors.primary + "15",
    borderWidth: 1, borderColor: Colors.primary + "35",
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  dhikrCountText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: Colors.primary },
  dhikrTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 14,
    color: Colors.textPrimary, flex: 1, textAlign: "right",
  },
  dhikrText: {
    fontFamily: "Cairo_500Medium", fontSize: 15,
    color: Colors.textSecondary, textAlign: "right",
    lineHeight: 28,
  },
  dhikrRefRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  dhikrRef: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  dhikrHint: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary },
  dhikrProgress: {
    height: 4, backgroundColor: Colors.divider, borderRadius: 2, overflow: "hidden",
  },
  dhikrProgressFill: { height: 4, borderRadius: 2 },
  resetAllBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
  },
  resetAllText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },

  // ── المسبحة ──
  tasbihContainer: { paddingHorizontal: 16, gap: 12 },
  tasbihPresetRow: { gap: 8, paddingVertical: 4 },
  tasbihPresetBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
  },
  tasbihPresetLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textMuted },
  tasbihTextCard: {
    backgroundColor: Colors.cardBgElevated, borderRadius: 18,
    padding: 20, alignItems: "center",
    borderWidth: 1.5,
  },
  tasbihMainText: {
    fontFamily: "Cairo_700Bold", fontSize: 22,
    textAlign: "center", lineHeight: 38,
  },
  tasbihCounterWrap: { alignItems: "center", gap: 12 },
  tasbihRing: {
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 8, alignItems: "center", justifyContent: "center",
  },
  tasbihRingInner: {
    width: 148, height: 148, borderRadius: 74,
    borderWidth: 3, alignItems: "center", justifyContent: "center", gap: 4,
  },
  tasbihNumber: { fontFamily: "Cairo_700Bold", fontSize: 52, lineHeight: 56 },
  tasbihTarget: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  tasbihBar: {
    width: "90%", height: 6, backgroundColor: Colors.divider,
    borderRadius: 3, overflow: "hidden",
  },
  tasbihBarFill: { height: 6, borderRadius: 3 },
  tasbihDoneBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14,
    borderWidth: 1,
  },
  tasbihDoneText: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  tasbihBtn: {
    marginHorizontal: 0, paddingVertical: 18, borderRadius: 20,
    alignItems: "center", gap: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  tasbihBtnText: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  tasbihBtnSub: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "rgba(255,255,255,0.7)" },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted },
  errorWrap:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
  errorText:   { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  retryBtn: {
    backgroundColor: Colors.primary + "18", borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.primary + "40",
  },
  retryBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary },

  cacheWarning: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#F59E0B18", borderRadius: 10,
    marginHorizontal: 16, marginTop: 8, marginBottom: 2,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: "#F59E0B40",
  },
  cacheWarningText: {
    fontFamily: "Cairo_500Medium", fontSize: 12,
    color: "#F59E0B", flex: 1, textAlign: "right",
  },

  dateBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    backgroundColor: Colors.cardBg, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  dateBarRight:  { gap: 2 },
  dateHijri:     { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  dateGregorian: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  moonIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.accent + "18", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.accent + "30",
  },

  // ── بطاقة الصلاة القادمة ──
  nextCard: {
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    backgroundColor: Colors.cardBgElevated, borderRadius: 22,
    padding: 20, alignItems: "center", gap: 5,
    borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15, shadowRadius: 14, elevation: 8,
  },
  nextPrayerIconWrap: {
    width: 64, height: 64, alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  nextPrayerIcon: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: "center", justifyContent: "center",
  },
  nextBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2,
  },
  nextBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  nextName: { fontFamily: "Cairo_700Bold", fontSize: 34 },
  nextTime: { fontFamily: "Cairo_700Bold", fontSize: 26, color: Colors.textPrimary },
  countdownRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  countdownText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },

  // ── التحكم بالأذان ──
  adhanControlRow: {
    marginTop: 14, width: "100%",
  },
  toggleWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16,
    backgroundColor: Colors.cardBg,
    borderWidth: 1.5, borderColor: Colors.divider,
    width: "100%",
  },
  toggleWrapOn: { backgroundColor: Colors.primary + "0D", borderColor: Colors.primary + "50" },
  toggleLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textMuted },
  toggleSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  // ── قائمة الصلوات ──
  prayerList: { marginHorizontal: 16, marginTop: 8, gap: 6 },
  prayerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.divider, borderRightWidth: 4,
  },
  prayerRowActive: {
    backgroundColor: Colors.cardBgElevated,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  prayerIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  prayerInfo:    { flex: 1, gap: 2 },
  prayerName:    { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  prayerSub:     { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right" },
  prayerTime:    { fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textSecondary },

  calcNote: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted,
    textAlign: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },

  // ── هجري ──
  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 24, paddingVertical: 12,
  },
  navBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.primary + "12",
    alignItems: "center", justifyContent: "center",
  },
  monthTitleWrap: { alignItems: "center" },
  monthTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary },
  yearText:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  calCard: {
    marginHorizontal: 16, backgroundColor: Colors.cardBg,
    borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  specialSection: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: Colors.accent + "0C", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.accent + "25", gap: 8,
  },
  specialTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.accent, textAlign: "right" },
  specialItem:  { flexDirection: "row", alignItems: "center", gap: 8 },
  specialDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  specialText:  { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  hijriInfoCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    marginHorizontal: 16, marginTop: 10, padding: 12,
    backgroundColor: Colors.cardBg, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  hijriInfoText: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted,
    flex: 1, textAlign: "right", lineHeight: 20,
  },
});

const CELL_SIZE = (Platform.OS === "web" ? 400 : 360) / 7;

const hc = StyleSheet.create({
  weekRow:       { flexDirection: "row" },
  weekHeader:    { width: CELL_SIZE, alignItems: "center", paddingBottom: 6 },
  weekHeaderText:{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  cell:          { width: CELL_SIZE, height: CELL_SIZE, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  cellToday:     { backgroundColor: Colors.primary },
  cellHoliday:   { backgroundColor: Colors.accent + "1A" },
  dayNum:        { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary },
  dayNumToday:   { color: "#fff", fontFamily: "Cairo_700Bold" },
});

const ms = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#0D1910",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "88%", paddingHorizontal: 20, paddingBottom: 40,
    borderTopWidth: 1, borderColor: Colors.primary + "30",
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.textMuted + "50",
    alignSelf: "center", marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, marginBottom: 4,
  },
  sheetTitle:  { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  sectionLabel:{
    fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textSecondary,
    marginTop: 16, marginBottom: 6, textAlign: "right",
  },
  sectionSub: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted,
    marginTop: -4, marginBottom: 6, textAlign: "right",
  },
  optionRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
    marginBottom: 4, backgroundColor: Colors.cardBg,
    borderWidth: 1, borderColor: Colors.divider,
  },
  optionRowActive: { borderColor: Colors.primary + "50", backgroundColor: Colors.primary + "0D" },
  radio:      { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.textMuted, alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 },
  radioActive:{ borderColor: Colors.primary },
  radioDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  optionText: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  offsetRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
    marginBottom: 6, backgroundColor: Colors.cardBg,
    borderWidth: 1, borderColor: Colors.divider,
  },
  offsetLabel:   { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  offsetControls:{ flexDirection: "row", alignItems: "center", gap: 12 },
  offsetBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primary + "18",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.primary + "35",
  },
  offsetVal: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, minWidth: 30, textAlign: "center" },
  btnRow:    { flexDirection: "row", gap: 12, marginTop: 20 },
  resetBtn:  { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  resetBtnText:{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted },
  saveBtn:   { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: "center", backgroundColor: Colors.primary },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
