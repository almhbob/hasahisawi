import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Share, Platform,
  RefreshControl, KeyboardAvoidingView, Keyboard,
} from "react-native";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

// ─────────────────────────────────────────────
//  الألوان
// ─────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD2  = "#F0A500";
const BG     = "#0A150F";
const CARD   = "#0E1F14";

// ─────────────────────────────────────────────
//  التقويم الهجري — دوال الحساب
// ─────────────────────────────────────────────
const HIJRI_MONTHS = [
  "محرم","صفر","ربيع الأول","ربيع الثاني",
  "جمادى الأولى","جمادى الثانية","رجب","شعبان",
  "رمضان","شوال","ذو القعدة","ذو الحجة",
];
const WEEKDAYS = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

function gToH(gy: number, gm: number, gd: number) {
  const jd = Math.floor((1461 * (gy + 4800 + Math.floor((gm - 14) / 12))) / 4)
    + Math.floor((367 * (gm - 2 - 12 * Math.floor((gm - 14) / 12))) / 12)
    - Math.floor((3 * Math.floor((gy + 4900 + Math.floor((gm - 14) / 12)) / 100)) / 4)
    + gd - 32075;
  let l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719)
    + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  return {
    year: 30 * n + j - 30,
    month: Math.ceil((l * 24) / 709),
    day: l - Math.floor((709 * Math.ceil((l * 24) / 709)) / 24),
  };
}

function hToGDate(hy: number, hm: number, hd: number): Date {
  const jd = Math.floor((11 * hy + 3) / 30)
    + 354 * hy + 30 * hm
    - Math.floor((hm - 1) / 2)
    + hd + 1948440 - 385;
  let a = jd + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m2 = Math.floor((5 * e + 2) / 153);
  return new Date(
    100 * b + d - 4800 + Math.floor(m2 / 10),
    m2 + 3 - 12 * Math.floor(m2 / 10) - 1,
    e - Math.floor((153 * m2 + 2) / 5) + 1,
  );
}

function hijriMonthDays(hy: number, hm: number): number {
  const first = hToGDate(hy, hm, 1);
  const next  = hm < 12 ? hToGDate(hy, hm + 1, 1) : hToGDate(hy + 1, 1, 1);
  return Math.round((next.getTime() - first.getTime()) / 86400000);
}

// ─────────────────────────────────────────────
//  المناسبات الإسلامية (حسب التقويم الهجري)
// ─────────────────────────────────────────────
type IslamicOccasion = {
  key: string; name: string; emoji: string; color: string;
  hMonth: number; hDayStart: number; hDayEnd: number;
  greeting: string;
};

const OCCASIONS: IslamicOccasion[] = [
  {
    key:"new_hijri", name:"رأس السنة الهجرية", emoji:"🌙", color:"#8B5CF6",
    hMonth:1, hDayStart:1, hDayEnd:1,
    greeting:"🌙 بمناسبة حلول رأس السنة الهجرية الجديدة\nأسأل الله أن يجعلها عام خير وبركة وعافية على الجميع\n\nكل عام وأهل الحصاحيصا بخير 💚",
  },
  {
    key:"ashura", name:"يوم عاشوراء", emoji:"🤲", color:"#3B82F6",
    hMonth:1, hDayStart:10, hDayEnd:10,
    greeting:"🤲 يوم عاشوراء مبارك\nنسأل الله أن يغفر لنا ذنوب العام الماضي\n\nكل عام وأنتم بخير",
  },
  {
    key:"mawlid", name:"المولد النبوي الشريف", emoji:"✨", color:"#10B981",
    hMonth:3, hDayStart:12, hDayEnd:12,
    greeting:"✨ بمناسبة ذكرى المولد النبوي الشريف\nاللهم صلِّ وسلِّم وبارك على سيدنا محمد وعلى آله وصحبه أجمعين\n\nكل عام وأهل الحصاحيصا بخير 💚",
  },
  {
    key:"isra_miraj", name:"ليلة الإسراء والمعراج", emoji:"🌟", color:"#F59E0B",
    hMonth:7, hDayStart:27, hDayEnd:27,
    greeting:"🌟 بمناسبة ذكرى الإسراء والمعراج المباركة\nنسأل الله أن يبلغنا الأوقات الفاضلة وأن يتقبل منا صالح الأعمال\n\nكل عام وأنتم بخير",
  },
  {
    key:"ramadan", name:"شهر رمضان المبارك", emoji:"🌙", color:"#D97706",
    hMonth:9, hDayStart:1, hDayEnd:30,
    greeting:"🌙 رمضان كريم\nأعاده الله عليكم بالخير والبركة والغفران\n\nتقبّل الله منا ومنكم الصيام والقيام\nوكل عام وأهل الحصاحيصا بخير 💚",
  },
  {
    key:"laylat_qadr", name:"ليلة القدر", emoji:"⭐", color:"#A78BFA",
    hMonth:9, hDayStart:27, hDayEnd:27,
    greeting:"⭐ ليلة القدر خير من ألف شهر\nنسأل الله أن يجعلنا من المقبولين فيها\nوأن يغفر لنا ولوالدينا وللمسلمين",
  },
  {
    key:"eid_fitr", name:"عيد الفطر المبارك", emoji:"🎊", color:"#22C55E",
    hMonth:10, hDayStart:1, hDayEnd:3,
    greeting:"🎊 عيد الفطر المبارك\nتقبّل الله منا ومنكم الصيام والقيام\n\nكل عام وأهل الحصاحيصا بخير وعافية 💚\nعيدكم مبارك",
  },
  {
    key:"arafat", name:"يوم عرفة", emoji:"🤲", color:"#F97316",
    hMonth:12, hDayStart:9, hDayEnd:9,
    greeting:"🤲 يوم عرفة المبارك\nنسأل الله أن يتقبل حج الحجاج\nوأن يغفر لنا جميعاً ذنوبنا",
  },
  {
    key:"eid_adha", name:"عيد الأضحى المبارك", emoji:"🐑", color:"#F0A500",
    hMonth:12, hDayStart:10, hDayEnd:13,
    greeting:"🐑 عيد الأضحى المبارك\nتقبّل الله منا ومنكم صالح الأعمال\n\nكل عام وأهل الحصاحيصا بخير 💚",
  },
];

// مناسبات ميلادية سودانية
const GREGORIAN_OCCASIONS = [
  { key:"independence", name:"يوم الاستقلال السوداني", month:1, day:1, emoji:"🇸🇩", color:"#CC0001",
    greeting:"🇸🇩 تحية لذكرى استقلال السودان\nكل عام وأرض السودان بخير وعافية وسلام\nوكل عام وأهل الحصاحيصا بخير 💚" },
];

function getActiveOccasion(today: Date): IslamicOccasion | null {
  const h = gToH(today.getFullYear(), today.getMonth() + 1, today.getDate());
  for (const occ of OCCASIONS) {
    if (occ.hMonth === h.month && h.day >= occ.hDayStart && h.day <= occ.hDayEnd)
      return occ;
  }
  return null;
}

function getUpcoming(today: Date, limit = 6) {
  const results: { occ: IslamicOccasion; date: Date; daysLeft: number }[] = [];
  const h = gToH(today.getFullYear(), today.getMonth() + 1, today.getDate());

  for (const occ of OCCASIONS) {
    let hYear = h.year;
    let d = hToGDate(hYear, occ.hMonth, occ.hDayStart);
    if (d < today) {
      hYear++;
      d = hToGDate(hYear, occ.hMonth, occ.hDayStart);
    }
    results.push({ occ, date: d, daysLeft: Math.ceil((d.getTime() - today.getTime()) / 86400000) });
  }
  results.sort((a, b) => a.daysLeft - b.daysLeft);
  return results.slice(0, limit);
}

// ─────────────────────────────────────────────
//  بطاقة مناسبة
// ─────────────────────────────────────────────
function OccasionCard({ item, idx, today }: { item: ReturnType<typeof getUpcoming>[0]; idx: number; today: Date }) {
  const isActive = item.daysLeft === 0;
  const occ = item.occ;

  function shareGreeting() {
    Share.share({ message: occ.greeting, title: occ.name }).catch(() => {});
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const dateStr = item.date.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Animated.View entering={FadeInDown.delay(idx * 60).springify()}>
      <TouchableOpacity activeOpacity={0.88} onPress={shareGreeting} style={styles.occCard}>
        <LinearGradient colors={[occ.color + "22", CARD]} style={styles.occGrad}>
          {isActive && (
            <View style={[styles.activeBadge, { backgroundColor: occ.color }]}>
              <Text style={styles.activeBadgeText}>الآن 🔴</Text>
            </View>
          )}
          <View style={styles.occTop}>
            <View style={[styles.occEmojiBox, { backgroundColor: occ.color + "25", borderColor: occ.color + "55" }]}>
              <Text style={styles.occEmoji}>{occ.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.occName}>{occ.name}</Text>
              <Text style={styles.occDate}>{dateStr}</Text>
              {item.daysLeft > 0 && (
                <View style={[styles.countdownBadge, { borderColor: occ.color + "50" }]}>
                  <Text style={[styles.countdownText, { color: occ.color }]}>
                    بعد {item.daysLeft} يوم
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.greetingPreview} numberOfLines={3}>{occ.greeting}</Text>

          <View style={styles.shareRow}>
            <Ionicons name="share-social-outline" size={15} color={occ.color} />
            <Text style={[styles.shareLabel, { color: occ.color }]}>مشاركة التهنئة</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
//  التقويم الهجري
// ─────────────────────────────────────────────
function HijriCalendar({ today }: { today: Date }) {
  const todayH = gToH(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const [hYear, setHYear]   = useState(todayH.year);
  const [hMonth, setHMonth] = useState(todayH.month);

  const daysInMonth = hijriMonthDays(hYear, hMonth);
  const firstDay    = hToGDate(hYear, hMonth, 1);
  const startWeekday = firstDay.getDay(); // 0=Sun

  const prevMonth = () => {
    if (hMonth === 1) { setHYear(y => y - 1); setHMonth(12); }
    else setHMonth(m => m - 1);
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };
  const nextMonth = () => {
    if (hMonth === 12) { setHYear(y => y + 1); setHMonth(1); }
    else setHMonth(m => m + 1);
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  // اكتشاف مناسبات الشهر
  const monthOccasions = OCCASIONS.filter(o => o.hMonth === hMonth);
  function getOccasionForDay(day: number): IslamicOccasion | null {
    return OCCASIONS.find(o => o.hMonth === hMonth && day >= o.hDayStart && day <= o.hDayEnd) ?? null;
  }

  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={styles.calSection}>
      {/* رأس الشهر */}
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.calMonthName}>{HIJRI_MONTHS[hMonth - 1]}</Text>
          <Text style={styles.calYear}>{hYear} هـ</Text>
        </View>
        <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* أيام الأسبوع */}
      <View style={styles.weekHeader}>
        {["أح","اث","ثل","أر","خم","جم","سب"].map(d => (
          <Text key={d} style={[styles.weekDay, d === "جم" && { color: GOLD2 }]}>{d}</Text>
        ))}
      </View>

      {/* شبكة الأيام */}
      <View style={styles.daysGrid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`e-${idx}`} style={styles.dayCell} />;
          const occ     = getOccasionForDay(day);
          const isToday = hYear === todayH.year && hMonth === todayH.month && day === todayH.day;
          const isFri   = (startWeekday + day - 1) % 7 === 5;
          return (
            <View key={day} style={[styles.dayCell, isToday && styles.todayCell, occ && styles.occCell, { backgroundColor: occ ? occ.color + "15" : undefined }]}>
              <Text style={[styles.dayNum, isToday && styles.todayNum, isFri && { color: GOLD2 }, occ && { color: occ.color }]}>
                {day}
              </Text>
              {occ && <View style={[styles.occDot, { backgroundColor: occ.color }]} />}
            </View>
          );
        })}
      </View>

      {/* مناسبات الشهر */}
      {monthOccasions.length > 0 && (
        <View style={styles.monthOccList}>
          <Text style={styles.monthOccTitle}>مناسبات {HIJRI_MONTHS[hMonth - 1]}</Text>
          {monthOccasions.map(o => (
            <View key={o.key} style={styles.monthOccRow}>
              <View style={[styles.occDotSm, { backgroundColor: o.color }]} />
              <Text style={styles.monthOccName}>{o.emoji} {o.name}</Text>
              <Text style={styles.monthOccDates}>
                {o.hDayStart === o.hDayEnd ? `${o.hDayStart}` : `${o.hDayStart}–${o.hDayEnd}`} {HIJRI_MONTHS[hMonth - 1]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
//  منبر التهنئة (من قاعدة البيانات)
// ─────────────────────────────────────────────
type GreetingPost = {
  id: number; author_name: string; text: string;
  occasion_name: string; created_at: string;
};

function GreetingsBoard({ token }: { token: string | null }) {
  const [posts,     setPosts]     = useState<GreetingPost[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [text,      setText]      = useState("");
  const [occasion,  setOccasion]  = useState("تهنئة عامة");
  const [sending,   setSending]   = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const res = await fetch(`${base}/api/greetings?limit=30`);
      if (res.ok) setPosts(await res.json());
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function post() {
    if (!text.trim()) return;
    if (!token) return Alert.alert("تسجيل الدخول مطلوب", "سجّل دخولك لنشر تهنئتك");
    Keyboard.dismiss();
    setSending(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const res = await fetch(`${base}/api/greetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: text.trim(), occasion_name: occasion }),
      });
      if (res.ok) { setText(""); load(); if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      else { const d = await res.json(); Alert.alert("خطأ", d.error || "حدث خطأ"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال"); }
    setSending(false);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} ساعة`;
    return `منذ ${Math.floor(hrs / 24)} يوم`;
  }

  return (
    <View>
      {/* نموذج الكتابة */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.composeBox}>
          <Text style={styles.composeTitle}>📝 شارك تهنئتك</Text>
          {/* اختيار المناسبة */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
            {["تهنئة عامة", "عيد مبارك", "رمضان كريم", "مولد النبي ﷺ", "السنة الجديدة", "الاستقلال", "أخرى"].map(o => (
              <TouchableOpacity key={o} onPress={() => setOccasion(o)}
                style={[styles.occPill, occasion === o && { backgroundColor: Colors.primary + "28", borderColor: Colors.primary + "80" }]}>
                <Text style={[styles.occPillText, occasion === o && { color: Colors.primary }]}>{o}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput
            style={styles.composeInput}
            value={text}
            onChangeText={setText}
            placeholder="اكتب تهنئتك هنا..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={400}
            textAlign="right"
            textAlignVertical="top"
          />
          <View style={styles.composeBottom}>
            <Text style={styles.charCount}>{text.length}/400</Text>
            <TouchableOpacity style={[styles.postBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
              onPress={post} disabled={!text.trim() || sending}>
              {sending ? <ActivityIndicator size={16} color="#000" /> : (
                <><Ionicons name="send" size={15} color="#000" />
                <Text style={styles.postBtnText}>نشر</Text></>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* قائمة التهنئات */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : posts.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>💌</Text>
          <Text style={styles.emptyText}>لا توجد تهنئات بعد\nكن أول من يهنئ!</Text>
        </View>
      ) : (
        posts.map((p, i) => (
          <Animated.View key={p.id} entering={FadeInDown.delay(i * 40).springify()}>
            <View style={styles.postCard}>
              <View style={styles.postHeader}>
                <View style={styles.postAvatar}>
                  <Text style={styles.postAvatarText}>{p.author_name?.charAt(0) || "؟"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.postAuthor}>{p.author_name}</Text>
                  <View style={styles.postMeta}>
                    <Text style={styles.postOccasion}>{p.occasion_name}</Text>
                    <Text style={styles.postTime}>{timeAgo(p.created_at)}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.postText}>{p.text}</Text>
            </View>
          </Animated.View>
        ))
      )}
    </View>
  );
}

// ─────────────────────────────────────────────
//  الشاشة الرئيسية
// ─────────────────────────────────────────────
type TabKey = "occasions" | "calendar" | "board";

export default function GreetingsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [tab, setTab] = useState<TabKey>("occasions");
  const today = new Date();
  const todayH  = gToH(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const upcoming = getUpcoming(today, 8);
  const active   = getActiveOccasion(today);

  const todayHijri = `${todayH.day} ${HIJRI_MONTHS[todayH.month - 1]} ${todayH.year} هـ`;
  const todayGreg  = today.toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── رأس الشاشة ── */}
      <LinearGradient colors={["#111A0E", BG]} style={styles.header}>
        {active ? (
          <Animated.View entering={ZoomIn.springify()} style={[styles.activeBanner, { borderColor: active.color + "60" }]}>
            <LinearGradient colors={[active.color + "28", "#0A150F"]} style={StyleSheet.absoluteFill} />
            <Text style={styles.activeBannerEmoji}>{active.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.activeBannerTitle, { color: active.color }]}>{active.name}</Text>
              <Text style={styles.activeBannerSub}>تهنئة بهذه المناسبة المباركة</Text>
            </View>
          </Animated.View>
        ) : (
          <View style={styles.dateBox}>
            <Ionicons name="moon" size={18} color={GOLD} />
            <View>
              <Text style={styles.hijriDate}>{todayHijri}</Text>
              <Text style={styles.gregDate}>{todayGreg}</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* ── التبويبات ── */}
      <View style={styles.tabsRow}>
        {([
          { key:"occasions", label:"المناسبات", icon:"calendar" },
          { key:"calendar",  label:"التقويم",   icon:"moon"      },
          { key:"board",     label:"المنبر",     icon:"chatbubbles" },
        ] as { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[]).map(t => (
          <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => { setTab(t.key); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
            <Ionicons name={tab === t.key ? t.icon : `${t.icon}-outline` as any} size={17}
              color={tab === t.key ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.tabBtnLabel, tab === t.key && { color: Colors.primary }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── المحتوى ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "occasions" && (
          <View style={{ gap: 12 }}>
            {upcoming.map((item, i) => (
              <OccasionCard key={item.occ.key} item={item} idx={i} today={today} />
            ))}
          </View>
        )}

        {tab === "calendar" && (
          <HijriCalendar today={today} />
        )}

        {tab === "board" && (
          <GreetingsBoard token={token} />
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────
//  StyleSheet
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: { paddingHorizontal: 18, paddingVertical: 14, gap: 10 },

  activeBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    borderRadius: 16, padding: 14, borderWidth: 1, overflow: "hidden",
  },
  activeBannerEmoji: { fontSize: 36 },
  activeBannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17 },
  activeBannerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },

  dateBox: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  hijriDate: { fontFamily: "Cairo_700Bold", fontSize: 16, color: GOLD, textAlign: "right" },
  gregDate:  { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },

  tabsRow: {
    flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: Colors.divider,
    backgroundColor: "#0C1910",
  },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 11, gap: 3, flexDirection: "row-reverse", justifyContent: "center" },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabBtnLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  // بطاقة مناسبة
  occCard: { borderRadius: 18, overflow: "hidden" },
  occGrad: { borderRadius: 18, padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.divider },
  occTop:  { flexDirection: "row-reverse", gap: 12, alignItems: "flex-start" },
  occEmojiBox: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  occEmoji:  { fontSize: 28 },
  occName:   { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  occDate:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  countdownBadge: { alignSelf: "flex-end", borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  countdownText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  activeBadge: { position: "absolute", top: 10, left: 10, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#000" },
  greetingPreview: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary,
    textAlign: "right", lineHeight: 22, borderRightWidth: 3, borderRightColor: Colors.primary + "50",
    paddingRight: 10, marginRight: 4,
  },
  shareRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, alignSelf: "flex-end" },
  shareLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13 },

  // التقويم الهجري
  calSection: { gap: 12 },
  calHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    backgroundColor: CARD, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.divider,
  },
  calNavBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + "18", alignItems: "center", justifyContent: "center" },
  calMonthName: { fontFamily: "Cairo_700Bold", fontSize: 17, color: GOLD, textAlign: "center" },
  calYear:      { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },

  weekHeader: { flexDirection: "row-reverse", paddingHorizontal: 4 },
  weekDay: { flex: 1, textAlign: "center", fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted, paddingVertical: 6 },

  daysGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 2 },
  dayCell: {
    width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center",
    borderRadius: 10, gap: 2,
  },
  todayCell: { backgroundColor: Colors.primary + "25", borderWidth: 1.5, borderColor: Colors.primary + "70" },
  occCell:   { borderRadius: 10 },
  dayNum:    { fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary },
  todayNum:  { color: Colors.primary },
  occDot:    { width: 5, height: 5, borderRadius: 3 },

  monthOccList: {
    backgroundColor: CARD, borderRadius: 14, padding: 14, gap: 10,
    borderWidth: 1, borderColor: Colors.divider,
  },
  monthOccTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: GOLD, textAlign: "right", marginBottom: 4 },
  monthOccRow:   { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  occDotSm:      { width: 8, height: 8, borderRadius: 4 },
  monthOccName:  { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },
  monthOccDates: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  // منبر التهنئة
  composeBox: {
    backgroundColor: CARD, borderRadius: 16, padding: 14, gap: 10,
    borderWidth: 1, borderColor: Colors.primary + "30", marginBottom: 12,
  },
  composeTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  occPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: "#0E1F14",
  },
  occPillText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },
  composeInput: {
    backgroundColor: "#0C1910", borderRadius: 12, padding: 12,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
    minHeight: 90, borderWidth: 1, borderColor: Colors.divider, textAlign: "right",
  },
  composeBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  charCount: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  postBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9,
  },
  postBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#000" },

  postCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.divider, gap: 10,
  },
  postHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  postAvatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primary + "25", borderWidth: 1, borderColor: Colors.primary + "50",
    alignItems: "center", justifyContent: "center",
  },
  postAvatarText: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.primary },
  postAuthor: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  postMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  postOccasion: {
    fontFamily: "Cairo_500Medium", fontSize: 10, color: Colors.primary,
    backgroundColor: Colors.primary + "18", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  postTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  postText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right", lineHeight: 22 },

  emptyBox: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyEmoji: { fontSize: 52 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textMuted, textAlign: "center", lineHeight: 24 },
});
