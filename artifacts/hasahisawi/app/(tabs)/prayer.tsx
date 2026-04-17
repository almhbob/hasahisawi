import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal,
  ActivityIndicator, Platform, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import Colors from "@/constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { Audio } from "expo-av";

const ADHAN_SOUND = require("@/assets/sounds/adhan.mp3");
const ADHAN_ENABLED_KEY = "adhan_enabled_v1";

// ─── ثوابت ────────────────────────────────────────────────────────────────────
const HASAHISA_LAT  = 14.0566;
const HASAHISA_LON  = 33.4001;
const SETTINGS_KEY  = "prayer_settings_v2";

const PRAYER_LIST = [
  { key: "Fajr",    name: "الفجر",   icon: "moon-outline"       as any, color: "#818CF8" },
  { key: "Sunrise", name: "الشروق",  icon: "sunny-outline"      as any, color: "#F0A500" },
  { key: "Dhuhr",   name: "الظهر",   icon: "sunny"              as any, color: "#27AE68" },
  { key: "Asr",     name: "العصر",   icon: "partly-sunny-outline" as any, color: "#3E9CBF" },
  { key: "Maghrib", name: "المغرب",  icon: "sunset-outline"     as any, color: "#F97316" },
  { key: "Isha",    name: "العشاء",  icon: "moon"               as any, color: "#A78BFA" },
];

const ATHAN_PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]; // الصلوات الخمس للعد التنازلي

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

// ─── إعدادات افتراضية ─────────────────────────────────────────────────────────
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

// أيام مشهورة في الشهر الهجري (تواريخ مقدسة)
const HIJRI_SPECIAL: Record<number, number[]> = {
  1: [1, 10], // محرم: رأس السنة، عاشوراء
  3: [12],    // ربيع الأول: المولد النبوي
  7: [27],    // رجب: الإسراء والمعراج (تقريبي)
  8: [15],    // شعبان: نصف شعبان
  9: [1, 17, 21, 23, 27, 29, 30], // رمضان: أوله، ليلة القدر، نهايته
  10: [1, 2, 3], // شوال: عيد الفطر
  12: [8, 9, 10, 11, 12, 13], // ذو الحجة: الحج وعيد الأضحى
};

// ─── المكوّن الرئيسي ───────────────────────────────────────────────────────────
export default function PrayerScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // ── الحالة ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"prayer" | "hijri">("prayer");
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

  const [nextPrayer, setNextPrayer] = useState<{ name: string; key: string; color: string; time: string; secsLeft: number } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── الأذان الصوتي ────────────────────────────────────────────────────────────
  const [adhanEnabled, setAdhanEnabled] = useState(true);
  const [isPlayingAdhan, setIsPlayingAdhan] = useState(false);
  const adhanSoundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ADHAN_ENABLED_KEY).then(v => {
      if (v !== null) setAdhanEnabled(v === "1");
    });
    // اضبط وضع الصوت ليُسمع حتى عند الصامت
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
    return () => {
      adhanSoundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const playAdhan = useCallback(async () => {
    try {
      if (adhanSoundRef.current) {
        await adhanSoundRef.current.unloadAsync();
        adhanSoundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(ADHAN_SOUND, { shouldPlay: true, volume: 1.0 });
      adhanSoundRef.current = sound;
      setIsPlayingAdhan(true);
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          setIsPlayingAdhan(false);
          sound.unloadAsync().catch(() => {});
          adhanSoundRef.current = null;
        }
      });
    } catch (e) {
      setIsPlayingAdhan(false);
    }
  }, []);

  const stopAdhan = useCallback(async () => {
    try {
      if (adhanSoundRef.current) {
        await adhanSoundRef.current.stopAsync();
        await adhanSoundRef.current.unloadAsync();
        adhanSoundRef.current = null;
      }
    } catch (_) {}
    setIsPlayingAdhan(false);
  }, []);

  const toggleAdhanEnabled = useCallback(async () => {
    const next = !adhanEnabled;
    setAdhanEnabled(next);
    try { await AsyncStorage.setItem(ADHAN_ENABLED_KEY, next ? "1" : "0"); } catch {}
    if (!next) stopAdhan();
  }, [adhanEnabled, stopAdhan]);

  // ── الهجري: التقويم الشهري ──────────────────────────────────────────────────
  const [hijriViewMonth, setHijriViewMonth] = useState(1);
  const [hijriViewYear, setHijriViewYear] = useState(1447);

  // ── تحميل الإعدادات ─────────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    try {
      // حاول جلب الإعدادات من الـ Backend
      const apiBase = getApiUrl();
      if (!apiBase) return;
      const res = await fetch(`${apiBase}/api/prayer-settings`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          const merged: PrayerSettings = {
            method: data.settings.method ?? DEFAULT_SETTINGS.method,
            school: data.settings.school ?? DEFAULT_SETTINGS.school,
            latitude: parseFloat(data.settings.latitude) || DEFAULT_SETTINGS.latitude,
            longitude: parseFloat(data.settings.longitude) || DEFAULT_SETTINGS.longitude,
            offsets: {
              Fajr:    data.settings.fajr_offset    ?? 0,
              Dhuhr:   data.settings.dhuhr_offset   ?? 0,
              Asr:     data.settings.asr_offset     ?? 0,
              Maghrib: data.settings.maghrib_offset ?? 0,
              Isha:    data.settings.isha_offset    ?? 0,
            },
          };
          // تحقق من الإعدادات المحلية (للأولوية المحلية)
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
    } catch (_) {}
    // Fallback: الإعدادات المحلية
    try {
      const local = await AsyncStorage.getItem(SETTINGS_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        setSettings(parsed);
        setEditSettings(parsed);
      }
    } catch (_) {}
  }, []);

  // ── جلب أوقات الصلاة ────────────────────────────────────────────────────────
  const fetchTimes = useCallback(async (s: PrayerSettings) => {
    setLoading(true);
    setError(null);
    try {
      const tune = `0,${s.offsets.Fajr},0,${s.offsets.Dhuhr},${s.offsets.Asr},${s.offsets.Maghrib},0,${s.offsets.Isha},0`;
      const url = `https://api.aladhan.com/v1/timings?latitude=${s.latitude}&longitude=${s.longitude}&method=${s.method}&school=${s.school}&tune=${tune}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error("فشل الاتصال");
      const json = await res.json();
      const data = json.data;
      setTimes(data.timings);
      setGregorian(data.date.gregorian);
      const h = data.date.hijri;
      setHijri({
        day: h.day,
        month: parseInt(h.month.number, 10),
        monthName: h.month.ar,
        year: h.year,
        weekday: h.weekday.ar,
      });
      setHijriViewMonth(parseInt(h.month.number, 10));
      setHijriViewYear(parseInt(h.year, 10));
      computeNextPrayer(data.timings);
    } catch (e: any) {
      setError("تعذّر جلب مواقيت الآذان. تحقق من اتصالك بالإنترنت.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── حساب الصلاة القادمة ─────────────────────────────────────────────────────
  const computeNextPrayer = useCallback((t: Record<string, string>) => {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    let found = false;
    for (const key of ATHAN_PRAYERS) {
      const mins = parseTime(t[key]);
      if (mins > nowMins) {
        const diff = (mins - nowMins) * 60 - now.getSeconds();
        const info = PRAYER_LIST.find(p => p.key === key)!;
        setNextPrayer({ key, name: info.name, color: info.color, time: t[key], secsLeft: diff });
        setCountdown(diff);
        found = true;
        break;
      }
    }
    if (!found) {
      // بعد العشاء: الصلاة القادمة هي الفجر غداً
      const fajrMins = parseTime(t["Fajr"]);
      const minsLeft = (24 * 60 - nowMins) + fajrMins;
      const diff = minsLeft * 60 - now.getSeconds();
      setNextPrayer({ key: "Fajr", name: "الفجر", color: "#818CF8", time: t["Fajr"], secsLeft: diff });
      setCountdown(diff);
    }
  }, []);

  // ── العداد التنازلي ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          // حلّ وقت الصلاة — شغّل الأذان إذا كان مفعّلاً
          if (adhanEnabled) playAdhan();
          if (times) computeNextPrayer(times);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [times]);

  // ── التهيئة ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadSettings().then(() => {});
  }, []);

  useEffect(() => {
    fetchTimes(settings);
  }, [settings]);

  // ── حفظ الإعدادات ───────────────────────────────────────────────────────────
  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(editSettings));
      setSettings(editSettings);
      setSettingsVisible(false);
    } catch (_) {}
  };

  const resetSettings = () => {
    setEditSettings(DEFAULT_SETTINGS);
  };

  // ── بيانات التقويم الهجري ───────────────────────────────────────────────────
  const hijriCalendarCells = React.useMemo(() => {
    const totalDays = hijriMonthDays(hijriViewYear, hijriViewMonth);
    const firstJD = hijriToJD(hijriViewYear, hijriViewMonth, 1);
    const firstWd = jdWeekday(firstJD); // 0=Sun
    const cells: (number | null)[] = Array(firstWd).fill(null);
    for (let d = 1; d <= totalDays; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [hijriViewMonth, hijriViewYear]);

  const specialDays = HIJRI_SPECIAL[hijriViewMonth] ?? [];

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 12 }]}>
        <Pressable style={s.settingsBtn} onPress={() => { setEditSettings(settings); setSettingsVisible(true); }}>
          <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
        </Pressable>
        <Text style={s.headerTitle}>الآذان والتقويم</Text>
        <Pressable style={s.fmtBtn} onPress={() => setFmt24(v => !v)}>
          <Text style={s.fmtBtnText}>{fmt24 ? "24" : "12"}</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        <Pressable style={[s.tabBtn, tab === "prayer" && s.tabBtnActive]} onPress={() => setTab("prayer")}>
          <Ionicons name="time-outline" size={16} color={tab === "prayer" ? Colors.primary : Colors.textMuted} />
          <Text style={[s.tabBtnText, tab === "prayer" && { color: Colors.primary }]}>مواقيت الآذان</Text>
        </Pressable>
        <Pressable style={[s.tabBtn, tab === "hijri" && s.tabBtnActive]} onPress={() => setTab("hijri")}>
          <Ionicons name="moon-outline" size={16} color={tab === "hijri" ? Colors.primary : Colors.textMuted} />
          <Text style={[s.tabBtnText, tab === "hijri" && { color: Colors.primary }]}>التقويم الهجري</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadingText}>جارٍ جلب مواقيت الآذان...</Text>
        </View>
      ) : error ? (
        <View style={s.errorWrap}>
          <Ionicons name="wifi-outline" size={48} color={Colors.textMuted} />
          <Text style={s.errorText}>{error}</Text>
          <AnimatedPress style={s.retryBtn} onPress={() => fetchTimes(settings)} scaleDown={0.95}>
            <Text style={s.retryBtnText}>إعادة المحاولة</Text>
          </AnimatedPress>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 100 : 120 }}>

          {/* ── شريط التاريخ ── */}
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

          {/* ── تبويب الأوقات ── */}
          {tab === "prayer" && times && (
            <>
              {/* بطاقة الصلاة القادمة */}
              {nextPrayer && (
                <Animated.View entering={FadeInDown.duration(500).springify()} style={[s.nextCard, { borderColor: nextPrayer.color + "40" }]}>
                  <View style={[s.nextBadge, { backgroundColor: nextPrayer.color + "18" }]}>
                    <Text style={[s.nextBadgeText, { color: nextPrayer.color }]}>الصلاة القادمة</Text>
                  </View>
                  <Text style={[s.nextName, { color: nextPrayer.color }]}>{nextPrayer.name}</Text>
                  <Text style={s.nextTime}>{formatTime(nextPrayer.time, fmt24)}</Text>
                  <View style={s.countdownRow}>
                    <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
                    <Text style={s.countdownText}>سيحين بعد: {formatCountdown(countdown)}</Text>
                  </View>

                  {/* أزرار الأذان */}
                  <View style={s.adhanBtnRow}>
                    <Pressable
                      style={[s.adhanBtn, isPlayingAdhan ? s.adhanBtnStop : s.adhanBtnPlay]}
                      onPress={isPlayingAdhan ? stopAdhan : playAdhan}
                    >
                      <Ionicons
                        name={isPlayingAdhan ? "stop" : "play"}
                        size={16}
                        color={isPlayingAdhan ? "#fff" : Colors.primary}
                      />
                      <Text style={[s.adhanBtnText, isPlayingAdhan && { color: "#fff" }]}>
                        {isPlayingAdhan ? "إيقاف الأذان" : "تشغيل الأذان"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[s.adhanToggle, adhanEnabled && s.adhanToggleOn]}
                      onPress={toggleAdhanEnabled}
                    >
                      <Ionicons
                        name={adhanEnabled ? "notifications" : "notifications-off-outline"}
                        size={14}
                        color={adhanEnabled ? Colors.primary : Colors.textMuted}
                      />
                      <Text style={[s.adhanToggleText, adhanEnabled && { color: Colors.primary }]}>
                        {adhanEnabled ? "الأذان مفعّل" : "الأذان معطّل"}
                      </Text>
                    </Pressable>
                  </View>
                </Animated.View>
              )}

              {/* قائمة الصلوات */}
              <View style={s.prayerList}>
                {PRAYER_LIST.map((p, i) => {
                  const isNext = nextPrayer?.key === p.key;
                  return (
                    <Animated.View key={p.key} entering={FadeInDown.delay(i * 60).springify().damping(18)}>
                      <View style={[s.prayerRow, isNext && s.prayerRowActive, { borderRightColor: p.color }]}>
                        <View style={[s.prayerIconBox, { backgroundColor: p.color + "18" }]}>
                          <Ionicons name={p.icon} size={20} color={p.color} />
                        </View>
                        <View style={s.prayerInfo}>
                          <Text style={[s.prayerName, isNext && { color: p.color }]}>{p.name}</Text>
                          {isNext && <Text style={[s.prayerSub, { color: p.color }]}>● الآن</Text>}
                        </View>
                        <Text style={[s.prayerTime, isNext && { color: p.color }]}>
                          {times[p.key] ? formatTime(times[p.key], fmt24) : "--"}
                        </Text>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>

              {/* معلومة الحساب */}
              <Text style={s.calcNote}>
                طريقة الحساب: {METHODS.find(m => m.id === settings.method)?.name?.split("(")[0] ?? "—"}
                {" | "}{SCHOOLS.find(s => s.id === settings.school)?.name?.split("(")[0] ?? "—"}
              </Text>
            </>
          )}

          {/* ── تبويب التقويم الهجري ── */}
          {tab === "hijri" && (
            <>
              {/* شريط تنقل الشهر الهجري */}
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

              {/* الشبكة الهجرية */}
              <Animated.View key={`${hijriViewYear}-${hijriViewMonth}`} entering={FadeIn.duration(300)} style={s.calCard}>
                {/* أيام الأسبوع */}
                <View style={hc.weekRow}>
                  {WEEKDAYS_SHORT_AR.map((d, i) => (
                    <View key={i} style={hc.weekHeader}>
                      <Text style={[hc.weekHeaderText, (i === 5) && { color: Colors.accent }]}>{d}</Text>
                    </View>
                  ))}
                </View>
                {/* خلايا الأيام */}
                {Array.from({ length: hijriCalendarCells.length / 7 }, (_, row) => (
                  <View key={row} style={hc.weekRow}>
                    {hijriCalendarCells.slice(row * 7, row * 7 + 7).map((day, col) => (
                      <HijriDayCell
                        key={col}
                        day={day}
                        isToday={
                          day !== null &&
                          hijriViewMonth === (hijri ? hijri.month : -1) &&
                          hijriViewYear === (hijri ? parseInt(hijri.year) : -1) &&
                          String(day) === (hijri?.day ?? "")
                        }
                        isHoliday={day !== null && specialDays.includes(day)}
                      />
                    ))}
                  </View>
                ))}
              </Animated.View>

              {/* الأيام المميزة للشهر */}
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

              {/* معلومة عن الشهر الهجري */}
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
        </ScrollView>
      )}

      {/* ─── نافذة الإعدادات ─────────────────────────────────────────────────── */}
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
              {/* طريقة الحساب */}
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

              {/* المذهب */}
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

              {/* تعديل الدقائق */}
              <Text style={ms.sectionLabel}>تعديل الدقائق (+ أو -)</Text>
              <Text style={ms.sectionSub}>للتصحيح الدقيق لمواقيت بلدك</Text>
              {(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const).map(key => {
                const nameMap: Record<string, string> = { Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر", Maghrib: "المغرب", Isha: "العشاء" };
                return (
                  <View key={key} style={ms.offsetRow}>
                    <Text style={ms.offsetLabel}>{nameMap[key]}</Text>
                    <View style={ms.offsetControls}>
                      <Pressable style={ms.offsetBtn} onPress={() => setEditSettings(s => ({ ...s, offsets: { ...s.offsets, [key]: s.offsets[key] - 1 } }))}>
                        <Ionicons name="remove" size={18} color={Colors.primary} />
                      </Pressable>
                      <Text style={ms.offsetVal}>{editSettings.offsets[key] > 0 ? "+" : ""}{editSettings.offsets[key]}</Text>
                      <Pressable style={ms.offsetBtn} onPress={() => setEditSettings(s => ({ ...s, offsets: { ...s.offsets, [key]: s.offsets[key] + 1 } }))}>
                        <Ionicons name="add" size={18} color={Colors.primary} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              {/* أزرار */}
              <View style={ms.btnRow}>
                <AnimatedPress style={ms.resetBtn} onPress={resetSettings} scaleDown={0.95}>
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

// ─── الأنماط ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
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

  tabRow: {
    flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  tabBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 8, borderRadius: 12,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary + "18",
    borderColor: Colors.primary + "40",
  },
  tabBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted },
  errorWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
  errorText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  retryBtn: {
    backgroundColor: Colors.primary + "18", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.primary + "40",
  },
  retryBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary },

  dateBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    backgroundColor: Colors.cardBg, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  dateBarRight: { gap: 2 },
  dateHijri: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  dateGregorian: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  moonIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Colors.accent + "18",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.accent + "30",
  },

  nextCard: {
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    backgroundColor: Colors.cardBgElevated, borderRadius: 20,
    padding: 20, alignItems: "center", gap: 6,
    borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
  },
  nextBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 4,
  },
  nextBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  nextName: { fontFamily: "Cairo_700Bold", fontSize: 32 },
  nextTime: { fontFamily: "Cairo_700Bold", fontSize: 26, color: Colors.textPrimary },
  countdownRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  countdownText: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textSecondary },
  adhanBtnRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginTop: 14, flexWrap: "wrap",
  },
  adhanBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1,
  },
  adhanBtnPlay: {
    backgroundColor: Colors.primary + "18",
    borderColor: Colors.primary + "60",
  },
  adhanBtnStop: {
    backgroundColor: "#E74C3C",
    borderColor: "#E74C3C",
  },
  adhanBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },
  adhanToggle: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    backgroundColor: Colors.cardBgElevated,
    borderWidth: 1, borderColor: Colors.textMuted + "30",
  },
  adhanToggleOn: {
    backgroundColor: Colors.primary + "12",
    borderColor: Colors.primary + "50",
  },
  adhanToggleText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted },

  prayerList: { marginHorizontal: 16, marginTop: 8, gap: 6 },
  prayerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.divider,
    borderRightWidth: 4,
  },
  prayerRowActive: {
    backgroundColor: Colors.cardBgElevated,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  prayerIconBox: {
    width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
  },
  prayerInfo: { flex: 1, gap: 2 },
  prayerName: { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  prayerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "right" },
  prayerTime: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textSecondary },

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
  yearText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  calCard: {
    marginHorizontal: 16, backgroundColor: Colors.cardBg,
    borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  specialSection: {
    marginHorizontal: 16, marginTop: 12,
    backgroundColor: Colors.accent + "0C",
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: Colors.accent + "25",
    gap: 8,
  },
  specialTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.accent, textAlign: "right" },
  specialItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  specialDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  specialText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
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
  weekRow: { flexDirection: "row" },
  weekHeader: { width: CELL_SIZE, alignItems: "center", paddingBottom: 6 },
  weekHeaderText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textSecondary },
  cell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  cellToday: { backgroundColor: Colors.primary },
  cellHoliday: { backgroundColor: Colors.accent + "1A" },
  dayNum: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary },
  dayNumToday: { color: "#fff", fontFamily: "Cairo_700Bold" },
});

// ─── أنماط نافذة الإعدادات ───────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: "#0D1910",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "88%",
    paddingHorizontal: 20, paddingBottom: 40,
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
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  sectionLabel: {
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
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.textMuted,
    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
  },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  optionText: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  offsetRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10,
    marginBottom: 6, backgroundColor: Colors.cardBg,
    borderWidth: 1, borderColor: Colors.divider,
  },
  offsetLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  offsetControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  offsetBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primary + "18",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.primary + "35",
  },
  offsetVal: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, minWidth: 30, textAlign: "center" },
  btnRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  resetBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center",
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
  },
  resetBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted },
  saveBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: "center",
    backgroundColor: Colors.primary,
  },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
