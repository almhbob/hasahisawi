import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Share, Platform,
  RefreshControl, KeyboardAvoidingView, Keyboard, Modal,
  Pressable, Dimensions,
} from "react-native";
import Animated, { FadeInDown, FadeIn, ZoomIn, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

const { width: SW } = Dimensions.get("window");
const GOLD  = "#D4AF37";
const GOLD2 = "#F0A500";
const BG    = "#050D08";
const CARD  = "#0B1A10";

// ─── التقويم الهجري ───────────────────────────────────────────────────────────
const HIJRI_MONTHS = ["محرم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الثانية","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];

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
  return { year: 30 * n + j - 30, month: Math.ceil((l * 24) / 709), day: l - Math.floor((709 * Math.ceil((l * 24) / 709)) / 24) };
}

function hToGDate(hy: number, hm: number, hd: number): Date {
  const jd = Math.floor((11 * hy + 3) / 30) + 354 * hy + 30 * hm - Math.floor((hm - 1) / 2) + hd + 1948440 - 385;
  let a = jd + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m2 = Math.floor((5 * e + 2) / 153);
  return new Date(100 * b + d - 4800 + Math.floor(m2 / 10), m2 + 3 - 12 * Math.floor(m2 / 10) - 1, e - Math.floor((153 * m2 + 2) / 5) + 1);
}

function hijriMonthDays(hy: number, hm: number): number {
  const first = hToGDate(hy, hm, 1);
  const next = hm < 12 ? hToGDate(hy, hm + 1, 1) : hToGDate(hy + 1, 1, 1);
  return Math.round((next.getTime() - first.getTime()) / 86400000);
}

// ─── المناسبات ───────────────────────────────────────────────────────────────
type IslamicOccasion = {
  key: string; name: string; emoji: string; color: string; gradients: [string, string, string];
  hMonth: number; hDayStart: number; hDayEnd: number;
  greeting: string; pattern: string; verse?: string;
};

const OCCASIONS: IslamicOccasion[] = [
  {
    key: "new_hijri", name: "رأس السنة الهجرية", emoji: "🌙", color: "#8B5CF6",
    gradients: ["#1E0A4E", "#3B1A8B", "#0A0520"],
    hMonth: 1, hDayStart: 1, hDayEnd: 1, pattern: "✦ ✦ ✦",
    verse: "﴿ وَجَعَلْنَا اللَّيْلَ وَالنَّهَارَ آيَتَيْنِ ﴾",
    greeting: `🌙 بمناسبة حلول رأس السنة الهجرية الجديدة
نسأل الله العظيم أن يجعلها عام خير وبركة وعافية على أهل الحصاحيصا والمسلمين جميعاً

كل عام وأهلنا الكرام بألف خير 💚
— حصاحيصاوي | مدينة الحصاحيصا 🇸🇩`,
  },
  {
    key: "ashura", name: "يوم عاشوراء", emoji: "🤲", color: "#3B82F6",
    gradients: ["#0A1E4E", "#1A3B8B", "#05102A"],
    hMonth: 1, hDayStart: 10, hDayEnd: 10, pattern: "◆ ◆ ◆",
    verse: "﴿ وَتُوبُوا إِلَى اللَّهِ جَمِيعًا ﴾",
    greeting: `🤲 يوم عاشوراء مبارك
اللهم اغفر لنا ذنوب العام الماضي واستقبل بنا العام الجديد في خير

كل عام وأنتم بخير 💙
— حصاحيصاوي | الحصاحيصا 🇸🇩`,
  },
  {
    key: "mawlid", name: "المولد النبوي الشريف", emoji: "✨", color: "#10B981",
    gradients: ["#042B1A", "#0A5C39", "#021509"],
    hMonth: 3, hDayStart: 12, hDayEnd: 12, pattern: "❋ ❋ ❋",
    verse: "﴿ وَمَا أَرْسَلْنَاكَ إِلَّا رَحْمَةً لِّلْعَالَمِينَ ﴾",
    greeting: `✨ بمناسبة ذكرى المولد النبوي الشريف
اللهم صلِّ وسلِّم وبارك على سيدنا محمد وعلى آله وصحبه أجمعين

كل عام وأهل الحصاحيصا بخير 💚
— حصاحيصاوي | مدينة الحصاحيصا 🇸🇩`,
  },
  {
    key: "rajab", name: "شهر رجب المعظّم", emoji: "🌟", color: "#F59E0B",
    gradients: ["#2D1A00", "#5C3A00", "#150D00"],
    hMonth: 7, hDayStart: 1, hDayEnd: 1, pattern: "★ ★ ★",
    verse: "﴿ وَسَبِّحْ بِحَمْدِ رَبِّكَ ﴾",
    greeting: `🌟 مرحباً بشهر رجب المعظّم
اللهم بارك لنا في رجب وشعبان وبلّغنا رمضان

كل عام وأهلنا الكرام في أتم صحة ونعمة 💛
— حصاحيصاوي | الحصاحيصا 🇸🇩`,
  },
  {
    key: "isra", name: "ليلة الإسراء والمعراج", emoji: "🚀", color: "#6366F1",
    gradients: ["#0F0A3E", "#201880", "#060412"],
    hMonth: 7, hDayStart: 27, hDayEnd: 27, pattern: "⬟ ⬟ ⬟",
    verse: "﴿ سُبْحَانَ الَّذِي أَسْرَىٰ بِعَبْدِهِ لَيْلًا ﴾",
    greeting: `🚀 بمناسبة ليلة الإسراء والمعراج المباركة
نسأل الله أن يرزقنا اتباع سنة النبي الكريم ﷺ

كل عام وأهل الحصاحيصا في أحسن حال 💜
— حصاحيصاوي | مدينة الحصاحيصا 🇸🇩`,
  },
  {
    key: "shaban", name: "النصف من شعبان", emoji: "🌕", color: "#D4AF37",
    gradients: ["#2D2200", "#5C4500", "#151000"],
    hMonth: 8, hDayStart: 15, hDayEnd: 15, pattern: "◈ ◈ ◈",
    verse: "﴿ يُفَرَّقُ فِيهَا كُلُّ أَمْرٍ حَكِيمٍ ﴾",
    greeting: `🌕 بمناسبة ليلة النصف من شعبان
اللهم اغفر للمسلمين وارحمهم وتب عليهم

كل عام وأهلنا في الحصاحيصا بخير وعافية 💛
— حصاحيصاوي | الحصاحيصا 🇸🇩`,
  },
  {
    key: "ramadan", name: "رمضان الكريم", emoji: "🕌", color: "#10B981",
    gradients: ["#042B1A", "#075A36", "#021509"],
    hMonth: 9, hDayStart: 1, hDayEnd: 1, pattern: "☽ ☽ ☽",
    verse: "﴿ شَهْرُ رَمَضَانَ الَّذِي أُنزِلَ فِيهِ الْقُرْآنُ ﴾",
    greeting: `🕌 رمضان كريم وكل عام وأنتم بخير
نسأل الله أن يبلّغنا رمضان ويعيننا على صيامه وقيامه وتلاوة كتابه

رمضان مبارك لأهل الحصاحيصا الكرام 💚
— حصاحيصاوي | مدينة الحصاحيصا 🇸🇩`,
  },
  {
    key: "eid_fitr", name: "عيد الفطر المبارك", emoji: "🎊", color: "#F59E0B",
    gradients: ["#2D1A00", "#6B3A00", "#150D00"],
    hMonth: 10, hDayStart: 1, hDayEnd: 3, pattern: "✿ ✿ ✿",
    verse: "﴿ وَلِتُكْمِلُوا الْعِدَّةَ وَلِتُكَبِّرُوا اللَّهَ ﴾",
    greeting: `🎊 عيد الفطر المبارك
تقبّل الله منّا ومنكم صالح الأعمال

كل عام وأهل الحصاحيصا بألف خير وسلامة 🌙✨
— حصاحيصاوي | مدينة الحصاحيصا 🇸🇩`,
  },
  {
    key: "arafah", name: "يوم عرفة", emoji: "🤍", color: "#E2E8F0",
    gradients: ["#1A1A1A", "#3A3A3A", "#0A0A0A"],
    hMonth: 12, hDayStart: 9, hDayEnd: 9, pattern: "◇ ◇ ◇",
    verse: "﴿ الْيَوْمَ أَكْمَلْتُ لَكُمْ دِينَكُمْ ﴾",
    greeting: `🤍 يوم عرفة المبارك
نسأل الله أن يعتق رقابنا من النار ويغفر لنا ذنوبنا في هذا اليوم العظيم

اللهم آمين — أهل الحصاحيصا 💚
— حصاحيصاوي | مدينة الحصاحيصا 🇸🇩`,
  },
  {
    key: "eid_adha", name: "عيد الأضحى المبارك", emoji: "🐏", color: "#10B981",
    gradients: ["#042B1A", "#0A5C39", "#021509"],
    hMonth: 12, hDayStart: 10, hDayEnd: 13, pattern: "✦ ✦ ✦",
    verse: "﴿ فَصَلِّ لِرَبِّكَ وَانْحَرْ ﴾",
    greeting: `🐏 عيد الأضحى المبارك
تقبّل الله منّا ومنكم صالح الأعمال وكل عام وأنتم بخير

أضحى مبارك لأهل الحصاحيصا الكرام 💚
— حصاحيصاوي | مدينة الحصاحيصا 🇸🇩`,
  },
];

function getActiveOccasion(today: Date): IslamicOccasion | null {
  const h = gToH(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return OCCASIONS.find(o => o.hMonth === h.month && h.day >= o.hDayStart && h.day <= o.hDayEnd) ?? null;
}

function getUpcoming(today: Date, limit = 6): { occ: IslamicOccasion; date: Date; daysLeft: number }[] {
  const h = gToH(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const results = OCCASIONS.map(occ => {
    let hy = h.year;
    let d = hToGDate(hy, occ.hMonth, occ.hDayStart);
    if (d < today) { hy++; d = hToGDate(hy, occ.hMonth, occ.hDayStart); }
    return { occ, date: d, daysLeft: Math.ceil((d.getTime() - today.getTime()) / 86400000) };
  });
  results.sort((a, b) => a.daysLeft - b.daysLeft);
  return results.slice(0, limit);
}

// ─── بطاقة التهنئة الاحترافية (مودال) ───────────────────────────────────────
function GreetingCardModal({ occ, onClose }: { occ: IslamicOccasion | null; onClose: () => void }) {
  const [senderName, setSenderName] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(0);

  if (!occ) return null;

  const CARD_STYLES = [
    { label: "إسلامي", grad: occ.gradients },
    { label: "ذهبي", grad: ["#1A1000", "#3D2A00", "#0A0800"] as [string,string,string] },
    { label: "فضي", grad: ["#0D1520", "#1E2D40", "#080F17"] as [string,string,string] },
    { label: "أخضر", grad: ["#021509", "#042B1A", "#010A05"] as [string,string,string] },
  ];

  const grads = CARD_STYLES[selectedStyle].grad;
  const accentColor = selectedStyle === 0 ? occ.color : selectedStyle === 1 ? GOLD : selectedStyle === 2 ? "#94A3B8" : "#10B981";

  const fullGreeting = senderName.trim()
    ? occ.greeting.replace("— حصاحيصاوي", `— ${senderName.trim()} · حصاحيصاوي`)
    : occ.greeting;

  async function shareCard() {
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await Share.share({
        message: fullGreeting,
        title: occ?.name ?? "",
      });
    } catch {}
  }

  return (
    <Modal visible={!!occ} transparent animationType="slide" onRequestClose={onClose}>
      <View style={cm.overlay}>
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View entering={FadeInUp.springify().damping(22)} style={cm.sheet}>
          <LinearGradient colors={["#0A1A0D", "#050D08"]} style={StyleSheet.absoluteFill} />

          {/* الزر الإغلاق */}
          <View style={cm.sheetHeader}>
            <TouchableOpacity onPress={onClose} style={cm.closeBtn}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
            <Text style={cm.sheetTitle}>بطاقة التهنئة</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 20 }}>
            {/* بطاقة التهنئة المرئية */}
            <View style={cm.cardPreview}>
              <LinearGradient colors={grads} style={cm.previewGrad}>
                {/* نمط الزخرفة العلوي */}
                <View style={cm.patternRow}>
                  {[...Array(5)].map((_, i) => (
                    <Text key={i} style={[cm.patternStar, { color: accentColor + "60", fontSize: i === 2 ? 18 : 12 }]}>
                      {occ.pattern.split(" ")[0]}
                    </Text>
                  ))}
                </View>

                {/* الإيموجي والاسم */}
                <View style={cm.cardCenter}>
                  <Text style={cm.cardEmoji}>{occ.emoji}</Text>
                  <Text style={[cm.cardTitle, { color: accentColor }]}>{occ.name}</Text>
                  {occ.verse && (
                    <View style={[cm.verseBox, { borderColor: accentColor + "40" }]}>
                      <Text style={[cm.verseText, { color: accentColor + "CC" }]}>{occ.verse}</Text>
                    </View>
                  )}
                </View>

                {/* نص التهنئة */}
                <View style={cm.greetingTextWrap}>
                  <Text style={cm.greetingText}>{fullGreeting}</Text>
                </View>

                {/* النمط السفلي والختم */}
                <View style={cm.cardFooterRow}>
                  <View style={[cm.stamp, { borderColor: accentColor + "40", backgroundColor: accentColor + "10" }]}>
                    <Text style={[cm.stampText, { color: accentColor }]}>🇸🇩 الحصاحيصا</Text>
                  </View>
                  <Text style={[cm.watermark, { color: accentColor + "45" }]}>حصاحيصاوي</Text>
                </View>

                {/* خط التدرج السفلي */}
                <LinearGradient
                  colors={["transparent", accentColor + "15"]}
                  style={cm.bottomAccent}
                />
              </LinearGradient>
            </View>

            {/* اختيار النمط */}
            <View style={{ gap: 8 }}>
              <Text style={cm.sectionLabel}>نمط البطاقة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CARD_STYLES.map((cs, i) => (
                  <TouchableOpacity key={i} onPress={() => setSelectedStyle(i)}
                    style={[cm.stylePill, selectedStyle === i && cm.stylePillActive]}>
                    <Text style={[cm.stylePillText, selectedStyle === i && { color: "#10B981" }]}>{cs.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* اسم المرسِل */}
            <View style={{ gap: 6 }}>
              <Text style={cm.sectionLabel}>اسم المُهنِّئ (اختياري)</Text>
              <View style={cm.inputWrap}>
                <Ionicons name="person-outline" size={16} color={Colors.textMuted} style={{ marginHorizontal: 10 }} />
                <TextInput
                  style={cm.input}
                  value={senderName}
                  onChangeText={setSenderName}
                  placeholder="اكتب اسمك ليظهر في البطاقة..."
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                  maxLength={40}
                />
              </View>
            </View>

            {/* زر المشاركة */}
            <TouchableOpacity onPress={shareCard} style={cm.shareBtn} activeOpacity={0.85}>
              <LinearGradient colors={[accentColor, accentColor + "BB"]} start={{x:0,y:0}} end={{x:1,y:0}} style={cm.shareBtnGrad}>
                <Ionicons name="share-social" size={20} color="#000" />
                <Text style={cm.shareBtnText}>مشاركة البطاقة</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* زر نسخ النص */}
            <TouchableOpacity
              onPress={() => { if (Platform.OS !== "web") Haptics.selectionAsync(); Alert.alert("تمت النسخ!", "يمكنك لصق التهنئة في أي تطبيق"); }}
              style={cm.copyBtn}
            >
              <Ionicons name="copy-outline" size={16} color={Colors.textMuted} />
              <Text style={cm.copyBtnText}>نسخ نص التهنئة</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── بطاقة مناسبة في القائمة ─────────────────────────────────────────────────
function OccasionCard({ item, idx, onOpen }: { item: ReturnType<typeof getUpcoming>[0]; idx: number; onOpen: (occ: IslamicOccasion) => void }) {
  const isActive = item.daysLeft === 0;
  const occ = item.occ;
  const dateStr = item.date.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Animated.View entering={FadeInDown.delay(idx * 50).springify()}>
      <TouchableOpacity activeOpacity={0.88} onPress={() => onOpen(occ)} style={s.occCard}>
        <LinearGradient colors={[occ.gradients[0], occ.gradients[2]]} style={StyleSheet.absoluteFill} />

        {/* شريط ملوّن علوي */}
        <LinearGradient
          colors={[occ.color, occ.color + "00"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.occTopStrip}
        />

        {isActive && (
          <View style={[s.activeBadge, { backgroundColor: occ.color }]}>
            <View style={[s.activeDot, { backgroundColor: "#fff" }]} />
            <Text style={s.activeBadgeText}>الآن</Text>
          </View>
        )}

        <View style={s.occContent}>
          {/* الإيموجي */}
          <View style={[s.occEmojiBox, { backgroundColor: occ.color + "20", borderColor: occ.color + "40" }]}>
            <Text style={s.occEmoji}>{occ.emoji}</Text>
          </View>

          {/* المعلومات */}
          <View style={{ flex: 1 }}>
            <Text style={s.occName}>{occ.name}</Text>
            <Text style={[s.occDate, { color: occ.color + "BB" }]}>{dateStr}</Text>
            {item.daysLeft > 0 ? (
              <View style={[s.countdownBadge, { borderColor: occ.color + "45", backgroundColor: occ.color + "12" }]}>
                <Ionicons name="time-outline" size={11} color={occ.color} />
                <Text style={[s.countdownText, { color: occ.color }]}>بعد {item.daysLeft} يوم</Text>
              </View>
            ) : (
              <View style={[s.countdownBadge, { borderColor: "#10B98145", backgroundColor: "#10B98112" }]}>
                <View style={[s.activeDot, { backgroundColor: "#10B981" }]} />
                <Text style={[s.countdownText, { color: "#10B981" }]}>اليوم مبارك</Text>
              </View>
            )}
          </View>

          {/* زر البطاقة */}
          <View style={[s.cardBadge, { backgroundColor: occ.color + "20", borderColor: occ.color + "40" }]}>
            <Ionicons name="card-outline" size={16} color={occ.color} />
          </View>
        </View>

        {/* معاينة التهنئة */}
        <View style={[s.greetingPreviewWrap, { borderColor: occ.color + "20" }]}>
          <Text style={s.greetingPreview} numberOfLines={2}>{occ.greeting.split("\n")[0]}</Text>
        </View>

        {/* زر المشاركة */}
        <View style={s.shareRow}>
          <Ionicons name="share-social-outline" size={14} color={occ.color} />
          <Text style={[s.shareLabel, { color: occ.color }]}>إنشاء بطاقة تهنئة احترافية</Text>
          <Ionicons name="arrow-back" size={12} color={occ.color + "80"} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── التقويم الهجري ───────────────────────────────────────────────────────────
function HijriCalendar({ today }: { today: Date }) {
  const todayH = gToH(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const [hYear, setHYear] = useState(todayH.year);
  const [hMonth, setHMonth] = useState(todayH.month);
  const daysInMonth = hijriMonthDays(hYear, hMonth);
  const firstDay = hToGDate(hYear, hMonth, 1);
  const startWeekday = firstDay.getDay();

  function getOccasionForDay(day: number): IslamicOccasion | null {
    return OCCASIONS.find(o => o.hMonth === hMonth && day >= o.hDayStart && day <= o.hDayEnd) ?? null;
  }

  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthOccasions = OCCASIONS.filter(o => o.hMonth === hMonth);

  return (
    <View style={s.calSection}>
      <View style={s.calHeader}>
        <TouchableOpacity onPress={() => { if (hMonth === 12) { setHYear(y => y+1); setHMonth(1); } else setHMonth(m => m+1); }} style={s.calNavBtn}>
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={s.calMonthName}>{HIJRI_MONTHS[hMonth - 1]}</Text>
          <Text style={s.calYear}>{hYear} هـ</Text>
        </View>
        <TouchableOpacity onPress={() => { if (hMonth === 1) { setHYear(y => y-1); setHMonth(12); } else setHMonth(m => m-1); }} style={s.calNavBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={s.weekHeader}>
        {["أح","اث","ثل","أر","خم","جم","سب"].map(d => (
          <Text key={d} style={[s.weekDay, d === "جم" && { color: GOLD2 }]}>{d}</Text>
        ))}
      </View>
      <View style={s.daysGrid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`e-${idx}`} style={s.dayCell} />;
          const occ = getOccasionForDay(day);
          const isToday = hYear === todayH.year && hMonth === todayH.month && day === todayH.day;
          const isFri = (startWeekday + day - 1) % 7 === 5;
          return (
            <View key={day} style={[s.dayCell, isToday && s.todayCell, occ && { backgroundColor: occ.color + "15" }]}>
              <Text style={[s.dayNum, isToday && s.todayNum, isFri && { color: GOLD2 }, occ && { color: occ.color }]}>{day}</Text>
              {occ && <View style={[s.occDot, { backgroundColor: occ.color }]} />}
            </View>
          );
        })}
      </View>
      {monthOccasions.length > 0 && (
        <View style={s.monthOccList}>
          <Text style={s.monthOccTitle}>مناسبات {HIJRI_MONTHS[hMonth - 1]}</Text>
          {monthOccasions.map(o => (
            <View key={o.key} style={s.monthOccRow}>
              <View style={[s.occDotSm, { backgroundColor: o.color }]} />
              <Text style={s.monthOccName}>{o.emoji} {o.name}</Text>
              <Text style={s.monthOccDates}>{o.hDayStart === o.hDayEnd ? `${o.hDayStart}` : `${o.hDayStart}–${o.hDayEnd}`} {HIJRI_MONTHS[hMonth - 1]}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── منبر التهنئات ────────────────────────────────────────────────────────────
type GreetingPost = { id: number; author_name: string; text: string; occasion_name: string; created_at: string };

function GreetingsBoard({ token }: { token: string | null }) {
  const [posts, setPosts] = useState<GreetingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState("");
  const [occasion, setOccasion] = useState("تهنئة عامة");
  const [sending, setSending] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetch(`${getApiUrl().replace(/\/$/, "")}/api/greetings?limit=30`);
      if (res.ok) setPosts(await res.json());
    } catch {}
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function post() {
    if (!text.trim()) return;
    if (!token) return Alert.alert("تسجيل الدخول مطلوب", "سجّل دخولك لنشر تهنئتك");
    Keyboard.dismiss(); setSending(true);
    try {
      const res = await fetch(`${getApiUrl().replace(/\/$/, "")}/api/greetings`, {
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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.composeBox}>
          <View style={s.composeTitleRow}>
            <MaterialCommunityIcons name="pencil-outline" size={18} color={GOLD} />
            <Text style={s.composeTitle}>شارك تهنئتك مع أهل الحصاحيصا</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
            {["تهنئة عامة","عيد مبارك","رمضان كريم","مولد النبي ﷺ","السنة الجديدة","الاستقلال","أخرى"].map(o => (
              <TouchableOpacity key={o} onPress={() => setOccasion(o)}
                style={[s.occPill, occasion === o && { backgroundColor: Colors.primary + "28", borderColor: Colors.primary + "80" }]}>
                <Text style={[s.occPillText, occasion === o && { color: Colors.primary }]}>{o}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput style={s.composeInput} value={text} onChangeText={setText}
            placeholder="اكتب كلمات تهنئتك هنا..." placeholderTextColor={Colors.textMuted}
            multiline maxLength={400} textAlign="right" textAlignVertical="top" />
          <View style={s.composeBottom}>
            <Text style={s.charCount}>{text.length}/400</Text>
            <TouchableOpacity style={[s.postBtn, (!text.trim() || sending) && { opacity: 0.5 }]}
              onPress={post} disabled={!text.trim() || sending}>
              {sending ? <ActivityIndicator size={16} color="#000" /> : (
                <><Ionicons name="send" size={14} color="#000" /><Text style={s.postBtnText}>نشر</Text></>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : posts.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyEmoji}>💌</Text>
          <Text style={s.emptyText}>لا توجد تهنئات بعد{"\n"}كن أول من يهنئ!</Text>
        </View>
      ) : (
        posts.map((p, i) => (
          <Animated.View key={p.id} entering={FadeInDown.delay(i * 40).springify()}>
            <View style={s.postCard}>
              <LinearGradient colors={["rgba(37,99,235,0.06)", "transparent"]} style={StyleSheet.absoluteFill} />
              <View style={s.postHeader}>
                <LinearGradient colors={[Colors.primary, Colors.primary + "AA"]} style={s.postAvatar}>
                  <Text style={s.postAvatarText}>{p.author_name?.charAt(0) || "؟"}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={s.postAuthor}>{p.author_name}</Text>
                  <View style={s.postMeta}>
                    <View style={[s.occasionTag, { backgroundColor: Colors.primary + "18" }]}>
                      <Text style={s.postOccasion}>{p.occasion_name}</Text>
                    </View>
                    <Text style={s.postTime}>{timeAgo(p.created_at)}</Text>
                  </View>
                </View>
              </View>
              <Text style={s.postText}>{p.text}</Text>
            </View>
          </Animated.View>
        ))
      )}
    </View>
  );
}

// ─── الشاشة الرئيسية ──────────────────────────────────────────────────────────
type TabKey = "occasions" | "calendar" | "board";

export default function GreetingsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [tab, setTab] = useState<TabKey>("occasions");
  const [selectedOcc, setSelectedOcc] = useState<IslamicOccasion | null>(null);

  const today = new Date();
  const todayH = gToH(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const upcoming = getUpcoming(today, 10);
  const active = getActiveOccasion(today);
  const todayHijri = `${todayH.day} ${HIJRI_MONTHS[todayH.month - 1]} ${todayH.year} هـ`;
  const todayGreg = today.toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* الرأس */}
      <LinearGradient colors={["#0B1A0E", BG]} style={s.header}>
        {active ? (
          <Animated.View entering={ZoomIn.springify()} style={[s.activeBanner, { borderColor: active.color + "50" }]}>
            <LinearGradient colors={[active.color + "25", "transparent"]} style={StyleSheet.absoluteFill} />
            <Text style={s.activeBannerEmoji}>{active.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.activeBannerTitle, { color: active.color }]}>{active.name}</Text>
              <Text style={s.activeBannerSub}>اضغط على المناسبة لإنشاء بطاقة تهنئة 🎊</Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedOcc(active)} style={[s.activeCTA, { backgroundColor: active.color }]}>
              <Text style={s.activeCTAText}>بطاقة</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={s.dateBox}>
            <Ionicons name="moon" size={18} color={GOLD} />
            <View>
              <Text style={s.hijriDate}>{todayHijri}</Text>
              <Text style={s.gregDate}>{todayGreg}</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* التبويبات */}
      <View style={s.tabsRow}>
        {([
          { key: "occasions", label: "المناسبات", icon: "calendar" },
          { key: "calendar",  label: "التقويم",   icon: "moon"      },
          { key: "board",     label: "المنبر",     icon: "chatbubbles" },
        ] as { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[]).map(t => (
          <TouchableOpacity key={t.key} style={[s.tabBtn, tab === t.key && s.tabBtnActive]}
            onPress={() => { setTab(t.key); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
            <Ionicons name={tab === t.key ? t.icon : `${t.icon}-outline` as any} size={16}
              color={tab === t.key ? Colors.primary : Colors.textMuted} />
            <Text style={[s.tabBtnLabel, tab === t.key && { color: Colors.primary }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* المحتوى */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === "occasions" && (
          <View style={{ gap: 10 }}>
            <View style={s.hintBanner}>
              <Ionicons name="sparkles" size={14} color={GOLD} />
              <Text style={s.hintText}>اضغط على أي مناسبة لإنشاء بطاقة تهنئة فريدة قابلة للمشاركة</Text>
            </View>
            {upcoming.map((item, i) => (
              <OccasionCard key={item.occ.key} item={item} idx={i} onOpen={setSelectedOcc} />
            ))}
          </View>
        )}
        {tab === "calendar" && <HijriCalendar today={today} />}
        {tab === "board" && <GreetingsBoard token={token} />}
      </ScrollView>

      {/* مودال البطاقة */}
      <GreetingCardModal occ={selectedOcc} onClose={() => setSelectedOcc(null)} />
    </View>
  );
}

// ─── الأنماط ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },

  activeBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    borderRadius: 16, padding: 14, borderWidth: 1, overflow: "hidden",
  },
  activeBannerEmoji: { fontSize: 32 },
  activeBannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" },
  activeBannerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  activeCTA: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  activeCTAText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#000" },

  dateBox: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  hijriDate: { fontFamily: "Cairo_700Bold", fontSize: 15, color: GOLD, textAlign: "right" },
  gregDate: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },

  tabsRow: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: Colors.divider, paddingHorizontal: 14 },
  tabBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabBtnLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  hintBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: GOLD + "12", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: GOLD + "25",
  },
  hintText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: GOLD + "CC", textAlign: "right", flex: 1 },

  // بطاقات المناسبات
  occCard: {
    borderRadius: 18, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    gap: 10,
  },
  occTopStrip: { height: 3 },
  activeBadge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  occContent: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12, paddingHorizontal: 14, paddingTop: 12 },
  occEmojiBox: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  occEmoji: { fontSize: 26 },
  occName: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  occDate: { fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "right", marginTop: 2 },
  countdownBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5, alignSelf: "flex-end" },
  countdownText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  cardBadge: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  greetingPreviewWrap: { marginHorizontal: 14, borderTopWidth: 1, paddingTop: 8 },
  greetingPreview: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 20 },
  shareRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingBottom: 12 },
  shareLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12, flex: 1 },

  // التقويم
  calSection: { backgroundColor: CARD, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  calHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  calNavBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  calMonthName: { fontFamily: "Cairo_700Bold", fontSize: 17, color: GOLD, textAlign: "center" },
  calYear: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  weekHeader: { flexDirection: "row-reverse", marginBottom: 4 },
  weekDay: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.textMuted, textAlign: "center" },
  daysGrid: { flexDirection: "row-reverse", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  todayCell: { backgroundColor: Colors.primary + "22", borderWidth: 1.5, borderColor: Colors.primary },
  dayNum: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  todayNum: { color: Colors.primary, fontFamily: "Cairo_700Bold" },
  occDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  monthOccList: { marginTop: 12, gap: 6, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 10 },
  monthOccTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right", marginBottom: 4 },
  monthOccRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  occDotSm: { width: 8, height: 8, borderRadius: 4 },
  monthOccName: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  monthOccDates: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  // المنبر
  composeBox: { backgroundColor: CARD, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", marginBottom: 14 },
  composeTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  composeTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: GOLD },
  occPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  occPillText: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted },
  composeInput: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, minHeight: 90, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary },
  composeBottom: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  charCount: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  postBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  postBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#000" },
  emptyBox: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, textAlign: "center", lineHeight: 22 },
  postCard: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", overflow: "hidden", gap: 8 },
  postHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  postAvatar: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  postAvatarText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  postAuthor: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  postMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 3 },
  occasionTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  postOccasion: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.primary },
  postTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  postText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },
});

// ─── أنماط مودال البطاقة ─────────────────────────────────────────────────────
const cm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden", maxHeight: "92%",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    padding: 20, gap: 16,
  },
  sheetHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },

  // معاينة البطاقة
  cardPreview: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", aspectRatio: 0.75 },
  previewGrad: { flex: 1, padding: 20, justifyContent: "space-between" },
  patternRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 8 },
  patternStar: { fontFamily: "Cairo_400Regular" },
  cardCenter: { alignItems: "center", gap: 10 },
  cardEmoji: { fontSize: 54 },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, textAlign: "center" },
  verseBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 4 },
  verseText: { fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "center", lineHeight: 22 },
  greetingTextWrap: { backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 14 },
  greetingText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.9)", textAlign: "right", lineHeight: 22 },
  cardFooterRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  stamp: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  stampText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  watermark: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  bottomAccent: { position: "absolute", bottom: 0, left: 0, right: 0, height: 60 },

  sectionLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary, textAlign: "right" },

  stylePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  stylePillActive: { backgroundColor: "#10B98118", borderColor: "#10B98145" },
  stylePillText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  inputWrap: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, height: 48 },
  input: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, paddingHorizontal: 6 },

  shareBtn: { borderRadius: 14, overflow: "hidden" },
  shareBtnGrad: { height: 52, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  shareBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#000" },

  copyBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  copyBtnText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
});
