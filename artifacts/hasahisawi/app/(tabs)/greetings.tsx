import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Share, Platform,
  RefreshControl, KeyboardAvoidingView, Keyboard, Modal,
  Pressable, Dimensions,
} from "react-native";
import Animated, {
  FadeInDown, FadeIn, ZoomIn, FadeInUp, FadeInRight,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  interpolateColor, withSpring, Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

const { width: SW } = Dimensions.get("window");
const CARD_W = SW - 32;

// ─── ثوابت اللون ─────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD2  = "#F0C040";
const BG     = "#06080A";
const CARD   = "#0C0F12";
const CARD2  = "#111519";
const BORDER = "rgba(255,255,255,0.08)";

// ─── التقويم الهجري ───────────────────────────────────────────────────────────
const HIJRI_MONTHS = ["محرم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الثانية","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];

function gToH(gy: number, gm: number, gd: number) {
  const jd = Math.floor((1461*(gy+4800+Math.floor((gm-14)/12)))/4)
    + Math.floor((367*(gm-2-12*Math.floor((gm-14)/12)))/12)
    - Math.floor((3*Math.floor((gy+4900+Math.floor((gm-14)/12))/100))/4)
    + gd - 32075;
  let l = jd - 1948440 + 10632;
  const n = Math.floor((l-1)/10631);
  l = l - 10631*n + 354;
  const j = Math.floor((10985-l)/5316)*Math.floor((50*l)/17719)
    + Math.floor(l/5670)*Math.floor((43*l)/15238);
  l = l - Math.floor((30-j)/15)*Math.floor((17719*j)/50)
    - Math.floor(j/16)*Math.floor((15238*j)/43) + 29;
  return { year: 30*n+j-30, month: Math.ceil((l*24)/709), day: l-Math.floor((709*Math.ceil((l*24)/709))/24) };
}

function hToGDate(hy: number, hm: number, hd: number): Date {
  const jd = Math.floor((11*hy+3)/30)+354*hy+30*hm-Math.floor((hm-1)/2)+hd+1948440-385;
  let a=jd+32044;
  const b=Math.floor((4*a+3)/146097);
  const c=a-Math.floor((146097*b)/4);
  const d=Math.floor((4*c+3)/1461);
  const e=c-Math.floor((1461*d)/4);
  const m2=Math.floor((5*e+2)/153);
  return new Date(100*b+d-4800+Math.floor(m2/10),m2+3-12*Math.floor(m2/10)-1,e-Math.floor((153*m2+2)/5)+1);
}

function hijriMonthDays(hy: number, hm: number): number {
  const first=hToGDate(hy,hm,1);
  const next=hm<12?hToGDate(hy,hm+1,1):hToGDate(hy+1,1,1);
  return Math.round((next.getTime()-first.getTime())/86400000);
}

// ─── المناسبات مع نصوص تهنئة فاخرة ─────────────────────────────────────────
type IslamicOccasion = {
  key: string; name: string; emoji: string; color: string;
  gradients: [string,string,string]; accent: string;
  hMonth: number; hDayStart: number; hDayEnd: number;
  greeting: string; verse: string; pattern: string;
};

const OCCASIONS: IslamicOccasion[] = [
  {
    key: "new_hijri", name: "رأس السنة الهجرية", emoji: "🌙", color: "#A78BFA", accent: "#C4B5FD",
    gradients: ["#0F0525", "#1E0A4E", "#0A0318"],
    hMonth: 1, hDayStart: 1, hDayEnd: 1, pattern: "✦",
    verse: "﴿ وَجَعَلْنَا اللَّيْلَ وَالنَّهَارَ آيَتَيْنِ فَمَحَوْنَا آيَةَ اللَّيْلِ وَجَعَلْنَا آيَةَ النَّهَارِ مُبْصِرَةً ﴾",
    greeting: `بسم الله الرحمن الرحيم

🌙 مع حلول العام الهجري الجديد
تتجدد المعاني وتتسامى الآمال

نسأل المولى العظيم أن يجعله عاماً
مفعماً بالخير والبركة والعافية
وأن يُعيده على أمة الإسلام بالنصر والتمكين

كل عام وأهل الحصاحيصا الكرام
في أتم صحة ونعمة وسعادة 💜

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
  {
    key: "ashura", name: "يوم عاشوراء", emoji: "🤲", color: "#60A5FA", accent: "#93C5FD",
    gradients: ["#030D1F", "#061B3F", "#020812"],
    hMonth: 1, hDayStart: 10, hDayEnd: 10, pattern: "◆",
    verse: "﴿ وَاللَّهُ يُحِبُّ الصَّابِرِينَ ﴾",
    greeting: `بسم الله الرحمن الرحيم

🤲 يوم عاشوراء المبارك

يوم عظيم نجّى الله فيه موسى عليه السلام
فأحيوه بالصيام والذكر والشكران

اللهم اغفر لنا ذنوب العام الماضي
وبارك لنا في هذا اليوم المبارك

كل عام وأهل الحصاحيصا بخير وعافية 💙

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
  {
    key: "mawlid", name: "المولد النبوي الشريف", emoji: "☀️", color: "#34D399", accent: "#6EE7B7",
    gradients: ["#011A0D", "#022B1A", "#010D08"],
    hMonth: 3, hDayStart: 12, hDayEnd: 12, pattern: "❋",
    verse: "﴿ وَمَا أَرْسَلْنَاكَ إِلَّا رَحْمَةً لِّلْعَالَمِينَ ﴾",
    greeting: `بسم الله الرحمن الرحيم

☀️ بهجة المولد النبوي الشريف

في ذكرى مولد خير البشرية
سيدنا محمد صلى الله عليه وسلم

اللهم صلِّ وسلِّم وبارك عليه
صلاةً تملأ الآفاق وتُنير القلوب

أحييتم ذكراه بالصلاة والسلام عليه
فليكن قدوتنا في كل زمان ومكان 💚

كل عام وأهل الحصاحيصا في رعاية الله

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
  {
    key: "rajab", name: "شهر رجب المعظّم", emoji: "🌟", color: "#FBBF24", accent: "#FCD34D",
    gradients: ["#190D00", "#321A00", "#0D0600"],
    hMonth: 7, hDayStart: 1, hDayEnd: 1, pattern: "★",
    verse: "﴿ وَسَبِّحْ بِحَمْدِ رَبِّكَ وَكُن مِّنَ السَّاجِدِينَ ﴾",
    greeting: `بسم الله الرحمن الرحيم

🌟 مرحباً بشهر رجب المعظّم

شهر عظيم اصطفاه الله في الأشهر الحرم
فأكثروا فيه من الذكر والاستغفار والدعاء

اللهم بارك لنا في رجب وشعبان
وبلّغنا رمضان فنصومه ونقومه إيماناً واحتساباً

كل عام وأهلنا الكرام في نعمة وسعادة 💛

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
  {
    key: "isra", name: "ليلة الإسراء والمعراج", emoji: "🌌", color: "#818CF8", accent: "#A5B4FC",
    gradients: ["#07041A", "#100A30", "#040210"],
    hMonth: 7, hDayStart: 27, hDayEnd: 27, pattern: "⬟",
    verse: "﴿ سُبْحَانَ الَّذِي أَسْرَىٰ بِعَبْدِهِ لَيْلًا مِّنَ الْمَسْجِدِ الْحَرَامِ إِلَى الْمَسْجِدِ الْأَقْصَى ﴾",
    greeting: `بسم الله الرحمن الرحيم

🌌 ليلة الإسراء والمعراج المباركة

ليلة أسرى الله فيها بنبيه الكريم
من المسجد الحرام إلى المسجد الأقصى
ثم عَرَجَ به إلى السماوات العُلى

ففُرضت الصلاة — هدية السماء للمؤمنين

نسأل الله أن يُديم علينا نعمة الصلاة
وأن يجعلنا ممن يُقيمونها حق إقامتها 💜

كل عام وأهل الحصاحيصا في رحمة الله

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
  {
    key: "shaban", name: "النصف من شعبان", emoji: "🌕", color: "#F59E0B", accent: "#FCD34D",
    gradients: ["#150E00", "#2D1E00", "#0A0700"],
    hMonth: 8, hDayStart: 15, hDayEnd: 15, pattern: "◈",
    verse: "﴿ يُفَرَّقُ فِيهَا كُلُّ أَمْرٍ حَكِيمٍ ﴾",
    greeting: `بسم الله الرحمن الرحيم

🌕 ليلة النصف من شعبان

ليلة يُفرَّق فيها كل أمر حكيم
تُرفع فيها الأعمال وتُغفر الذنوب

قوموا هذه الليلة بالدعاء والاستغفار
فالله يطّلع على عباده ويغفر للمستغفرين

اللهم اغفر للمسلمين في كل مكان 💛
وارحم أهلنا في الحصاحيصا وكل أرض الله

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
  {
    key: "ramadan", name: "رمضان الكريم", emoji: "🕌", color: "#10B981", accent: "#34D399",
    gradients: ["#011A0D", "#023B1F", "#010D08"],
    hMonth: 9, hDayStart: 1, hDayEnd: 1, pattern: "☽",
    verse: "﴿ شَهْرُ رَمَضَانَ الَّذِي أُنزِلَ فِيهِ الْقُرْآنُ هُدًى لِّلنَّاسِ وَبَيِّنَاتٍ مِّنَ الْهُدَىٰ وَالْفُرْقَانِ ﴾",
    greeting: `بسم الله الرحمن الرحيم

🕌 رمضان كريم وكل عام وأنتم بخير

أهلاً وسهلاً بشهر القرآن والرحمة والمغفرة
شهر تُفتح فيه أبواب الجنان وتُغلق أبواب النيران

نسأل الله العظيم أن يبلّغنا رمضان
فيُعيننا على صيامه وقيامه وتلاوة كتابه

رمضان مبارك لأهل الحصاحيصا الأوفياء 💚

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
  {
    key: "eid_fitr", name: "عيد الفطر المبارك", emoji: "🎊", color: "#F59E0B", accent: "#FCD34D",
    gradients: ["#1A0D00", "#3D1F00", "#0D0600"],
    hMonth: 10, hDayStart: 1, hDayEnd: 3, pattern: "✿",
    verse: "﴿ وَلِتُكْمِلُوا الْعِدَّةَ وَلِتُكَبِّرُوا اللَّهَ عَلَىٰ مَا هَدَاكُمْ وَلَعَلَّكُمْ تَشْكُرُونَ ﴾",
    greeting: `بسم الله الرحمن الرحيم

🎊 عيد الفطر المبارك

تقبّل الله منّا ومنكم صالح الأعمال
وجعل أيامكم كلها عيداً وسعادةً وهناءً

كبّروا الله على ما هداكم
واشكروه على نعمة إتمام الصيام

كل عام وأهل الحصاحيصا الكرام
في أتم صحة وعافية وسلامة 🌙✨

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
  {
    key: "arafah", name: "يوم عرفة", emoji: "🕋", color: "#E2E8F0", accent: "#F1F5F9",
    gradients: ["#0C0C0C", "#1A1A1A", "#060606"],
    hMonth: 12, hDayStart: 9, hDayEnd: 9, pattern: "◇",
    verse: "﴿ الْيَوْمَ أَكْمَلْتُ لَكُمْ دِينَكُمْ وَأَتْمَمْتُ عَلَيْكُمْ نِعْمَتِي وَرَضِيتُ لَكُمُ الْإِسْلَامَ دِينًا ﴾",
    greeting: `بسم الله الرحمن الرحيم

🕋 يوم عرفة المبارك

أعظم أيام الله على الإطلاق
يوم أكمل الله فيه الدين وأتمّ النعمة

نسأل الله في هذا اليوم الكريم
أن يعتق رقابنا من النار
ويغفر لنا ما مضى من الذنوب والزلات

لبيك اللهم لبيك — اللهم آمين 🤍

كل عام وأهل الحصاحيصا في طاعة الله

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
  {
    key: "eid_adha", name: "عيد الأضحى المبارك", emoji: "🐏", color: "#10B981", accent: "#34D399",
    gradients: ["#011A0D", "#023B1F", "#010D08"],
    hMonth: 12, hDayStart: 10, hDayEnd: 13, pattern: "✦",
    verse: "﴿ فَصَلِّ لِرَبِّكَ وَانْحَرْ ﴾",
    greeting: `بسم الله الرحمن الرحيم

🐏 عيد الأضحى المبارك

تقبّل الله منّا ومنكم صالح الأعمال
وجعل ضحاياكم مقبولةً عنده سبحانه

شعائر الله نُعظّمها اقتداءً بأبينا إبراهيم
واتباعاً لسنة نبينا محمد عليه الصلاة والسلام

أضحى مبارك ومقبول لأهل الحصاحيصا الكرام 💚
وكل عام والجميع في نعمة وسلامة

❝ حصاحيصاوي — بوابة الحصاحيصا ❞`,
  },
];

function getActiveOccasion(today: Date): IslamicOccasion | null {
  const h = gToH(today.getFullYear(), today.getMonth()+1, today.getDate());
  return OCCASIONS.find(o => o.hMonth === h.month && h.day >= o.hDayStart && h.day <= o.hDayEnd) ?? null;
}

function getUpcoming(today: Date, limit = 6) {
  const h = gToH(today.getFullYear(), today.getMonth()+1, today.getDate());
  const results = OCCASIONS.map(occ => {
    let hy = h.year;
    let d = hToGDate(hy, occ.hMonth, occ.hDayStart);
    if (d < today) { hy++; d = hToGDate(hy, occ.hMonth, occ.hDayStart); }
    return { occ, date: d, daysLeft: Math.ceil((d.getTime()-today.getTime())/86400000) };
  });
  results.sort((a,b) => a.daysLeft - b.daysLeft);
  return results.slice(0, limit);
}

// ─── أنماط البطاقة الفاخرة ───────────────────────────────────────────────────
const CARD_STYLES = [
  { id: "royal_gold",     label: "ذهبي ملكي",    accent: "#D4AF37", grad: ["#0D0800","#1A1000","#2D1E00"] as [string,string,string] },
  { id: "royal_green",    label: "زمردي",          accent: "#34D399", grad: ["#011009","#021F12","#033520"] as [string,string,string] },
  { id: "royal_blue",     label: "ياقوت أزرق",    accent: "#60A5FA", grad: ["#030A18","#06152E","#0A1F42"] as [string,string,string] },
  { id: "royal_purple",   label: "أرجواني",        accent: "#C084FC", grad: ["#0C0318","#170830","#230C48"] as [string,string,string] },
  { id: "royal_silver",   label: "فضي",            accent: "#CBD5E1", grad: ["#080B0F","#0F1319","#161D26"] as [string,string,string] },
  { id: "royal_rose",     label: "وردي ياقوت",    accent: "#F9A8D4", grad: ["#150308","#270512","#3A071A"] as [string,string,string] },
];

// ─── نجوم الخلفية ────────────────────────────────────────────────────────────
function StarField({ color }: { color: string }) {
  const stars = Array.from({ length: 18 }, (_, i) => ({
    x: Math.random(), y: Math.random(), size: Math.random() * 2 + 1,
    op: Math.random() * 0.4 + 0.1, key: i,
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map(s => (
        <View
          key={s.key}
          style={{
            position: "absolute", left: `${s.x * 100}%` as any, top: `${s.y * 100}%` as any,
            width: s.size, height: s.size, borderRadius: s.size / 2,
            backgroundColor: color, opacity: s.op,
          }}
        />
      ))}
    </View>
  );
}

// ─── بطاقة التهنئة الفاخرة (المودال) ─────────────────────────────────────────
type GreetingPost = {
  id: number; author_name: string; text: string;
  occasion_name: string; occasion_key?: string;
  card_style?: string; likes_count: number;
  is_pinned: boolean; created_at: string;
};

function GreetingCardModal({
  occ, onClose, onPublished,
}: {
  occ: IslamicOccasion | null;
  onClose: () => void;
  onPublished?: () => void;
}) {
  const [senderName,    setSenderName]    = useState("");
  const [selectedStyle, setSelectedStyle] = useState(0);
  const [publishing,    setPublishing]    = useState(false);
  const [published,     setPublished]     = useState(false);
  const { token, user } = useAuth();

  useEffect(() => { if (occ) { setPublished(false); setSelectedStyle(0); } }, [occ]);
  if (!occ) return null;

  const cs = CARD_STYLES[selectedStyle];
  const accent = cs.accent;
  const grad   = cs.grad;

  const fullGreeting = senderName.trim()
    ? occ.greeting.replace("❝ حصاحيصاوي", `❝ ${senderName.trim()} · حصاحيصاوي`)
    : occ.greeting;

  async function shareCard() {
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try { await Share.share({ message: fullGreeting, title: occ?.name ?? "" }); } catch {}
  }

  function copyText() {
    try {
      // expo-clipboard غير مثبَّت — نستخدم Share كبديل
      Share.share({ message: fullGreeting, title: occ?.name ?? "" });
      if (Platform.OS !== "web") Haptics.selectionAsync();
    } catch {
      Alert.alert("نسخ النص", fullGreeting.substring(0, 200) + "...");
    }
  }

  async function publish() {
    if (!token) return Alert.alert("تسجيل الدخول مطلوب", "سجّل دخولك لنشر تهنئتك للمجتمع");
    setPublishing(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/greetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text: fullGreeting,
          occasion_name: occ.name,
          occasion_key: occ.key,
          card_style: cs.id,
        }),
      });
      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPublished(true);
        onPublished?.();
        Alert.alert("✅ نُشرت تهنئتك", "ظهرت تهنئتك في منبر المجتمع الآن 🎉");
      } else {
        const d = await res.json();
        Alert.alert("خطأ", d.error || "تعذّر النشر");
      }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    setPublishing(false);
  }

  return (
    <Modal visible={!!occ} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={cm.overlay}>
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View entering={FadeInUp.springify().damping(20)} style={cm.sheet}>
          <LinearGradient colors={["#0A0D10", "#060809"]} style={StyleSheet.absoluteFill} />

          {/* رأس المودال */}
          <View style={cm.sheetHeader}>
            <TouchableOpacity onPress={onClose} style={cm.closeBtn}>
              <Ionicons name="chevron-down" size={22} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
            <View style={{ alignItems: "center" }}>
              <Text style={cm.sheetTitle}>بطاقة التهنئة</Text>
              <Text style={cm.sheetSub}>{occ.name}</Text>
            </View>
            <TouchableOpacity onPress={shareCard} style={cm.headerShareBtn}>
              <Ionicons name="share-outline" size={20} color={accent} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={cm.scrollContent}>

            {/* ══ البطاقة الملكية الفاخرة ══ */}
            <View style={[cm.cardWrap, { borderColor: accent + "35" }]}>
              <LinearGradient colors={grad} style={cm.cardGrad}>
                <StarField color={accent} />

                {/* إطار ذهبي زخرفي علوي */}
                <View style={cm.ornamentTop}>
                  <View style={[cm.ornamentLine, { backgroundColor: accent + "40" }]} />
                  <View style={cm.ornamentCenter}>
                    {["✦","◆","✦"].map((c, i) => (
                      <Text key={i} style={[cm.ornamentChar, { color: accent + (i===1?"FF":"70"), fontSize: i===1?14:9 }]}>{c}</Text>
                    ))}
                  </View>
                  <View style={[cm.ornamentLine, { backgroundColor: accent + "40" }]} />
                </View>

                {/* الإيموجي الكبير */}
                <View style={cm.emojiWrap}>
                  <View style={[cm.emojiGlow, { backgroundColor: accent + "18" }]} />
                  <Text style={cm.bigEmoji}>{occ.emoji}</Text>
                </View>

                {/* اسم المناسبة */}
                <Text style={[cm.cardTitle, { color: accent }]}>{occ.name}</Text>

                {/* الآية الكريمة */}
                <View style={[cm.verseBox, { borderColor: accent + "30", backgroundColor: accent + "08" }]}>
                  <Text style={[cm.verseLabel, { color: accent + "80" }]}>— قال تعالى —</Text>
                  <Text style={[cm.verseText, { color: accent + "E0" }]}>{occ.verse}</Text>
                </View>

                {/* نص التهنئة */}
                <View style={[cm.greetBox, { borderColor: accent + "20" }]}>
                  <LinearGradient colors={["rgba(0,0,0,0.5)","rgba(0,0,0,0.3)"]} style={StyleSheet.absoluteFill} />
                  <Text style={cm.greetText}>{fullGreeting}</Text>
                </View>

                {/* الختم السفلي */}
                <View style={cm.cardFooter}>
                  <View style={[cm.footerLine, { backgroundColor: accent + "40" }]} />
                  <View style={cm.footerRow}>
                    <View style={[cm.stamp, { borderColor: accent + "50", backgroundColor: accent + "12" }]}>
                      <Text style={[cm.stampText, { color: accent }]}>🇸🇩 الحصاحيصا</Text>
                    </View>
                    <Text style={[cm.watermark, { color: accent + "40" }]}>حصاحيصاوي</Text>
                  </View>
                </View>

                {/* تدرج سفلي */}
                <LinearGradient colors={["transparent", accent + "12"]} style={cm.bottomGlow} />
              </LinearGradient>
            </View>

            {/* اختيار النمط */}
            <View style={cm.section}>
              <Text style={cm.sectionLabel}>🎨 نمط البطاقة</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cm.styleRow}>
                {CARD_STYLES.map((cs2, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => { setSelectedStyle(i); if (Platform.OS !== "web") Haptics.selectionAsync(); }}
                    style={[cm.stylePill, selectedStyle===i && { borderColor: cs2.accent, backgroundColor: cs2.accent + "15" }]}
                  >
                    <View style={[cm.styleColor, { backgroundColor: cs2.accent }]} />
                    <Text style={[cm.stylePillText, selectedStyle===i && { color: cs2.accent }]}>{cs2.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* اسم المرسِل */}
            <View style={cm.section}>
              <Text style={cm.sectionLabel}>✍️ اسم المُهنِّئ (اختياري)</Text>
              <View style={[cm.inputRow, { borderColor: accent + "30" }]}>
                <Ionicons name="person-outline" size={17} color={accent + "80"} style={{ marginHorizontal: 12 }} />
                <TextInput
                  style={cm.input} value={senderName} onChangeText={setSenderName}
                  placeholder={user?.name ?? "اكتب اسمك ليظهر في البطاقة..."}
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  textAlign="right" maxLength={40}
                />
              </View>
            </View>

            {/* أزرار الإجراءات */}
            <View style={cm.actionsGrid}>
              {/* نشر في المجتمع */}
              <TouchableOpacity
                style={[cm.actionCard, published && cm.actionCardPublished, { borderColor: "#10B981" + "40" }]}
                onPress={publish} disabled={publishing || published} activeOpacity={0.8}
              >
                <LinearGradient
                  colors={published ? ["#10B98125","#10B98108"] : ["#10B98115","#10B98105"]}
                  style={StyleSheet.absoluteFill}
                />
                {publishing
                  ? <ActivityIndicator color="#10B981" size="small" />
                  : <Ionicons name={published ? "checkmark-circle" : "globe-outline"} size={22} color="#10B981" />
                }
                <Text style={[cm.actionLabel, { color: "#10B981" }]}>
                  {published ? "نُشرت ✓" : "نشر للمجتمع"}
                </Text>
              </TouchableOpacity>

              {/* مشاركة */}
              <TouchableOpacity style={[cm.actionCard, { borderColor: accent + "40" }]} onPress={shareCard} activeOpacity={0.8}>
                <LinearGradient colors={[accent + "15", accent + "05"]} style={StyleSheet.absoluteFill} />
                <Ionicons name="share-social-outline" size={22} color={accent} />
                <Text style={[cm.actionLabel, { color: accent }]}>مشاركة</Text>
              </TouchableOpacity>

              {/* نسخ */}
              <TouchableOpacity style={[cm.actionCard, { borderColor: "#F59E0B40" }]} onPress={copyText} activeOpacity={0.8}>
                <LinearGradient colors={["#F59E0B15","#F59E0B05"]} style={StyleSheet.absoluteFill} />
                <Ionicons name="copy-outline" size={22} color="#F59E0B" />
                <Text style={[cm.actionLabel, { color: "#F59E0B" }]}>نسخ النص</Text>
              </TouchableOpacity>

              {/* واتساب */}
              <TouchableOpacity
                style={[cm.actionCard, { borderColor: "#25D36640" }]}
                onPress={() => {
                  const msg = encodeURIComponent(fullGreeting.substring(0, 500));
                  const url = `whatsapp://send?text=${msg}`;
                  import("react-native").then(({ Linking }) => Linking.openURL(url).catch(() => shareCard()));
                }}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#25D36615","#25D36605"]} style={StyleSheet.absoluteFill} />
                <MaterialCommunityIcons name="whatsapp" size={22} color="#25D366" />
                <Text style={[cm.actionLabel, { color: "#25D366" }]}>واتساب</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── بطاقة مناسبة (القائمة الرئيسية) ───────────────────────────────────────
function OccasionCard({ item, idx, onOpen }: {
  item: ReturnType<typeof getUpcoming>[0]; idx: number;
  onOpen: (occ: IslamicOccasion) => void;
}) {
  const isToday = item.daysLeft === 0;
  const occ = item.occ;
  const dateStr = item.date.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Animated.View entering={FadeInDown.delay(idx * 60).springify()}>
      <TouchableOpacity activeOpacity={0.87} onPress={() => { onOpen(occ); if (Platform.OS !== "web") Haptics.selectionAsync(); }}>
        <LinearGradient colors={[occ.gradients[0], occ.gradients[2]]} style={oc.card}>
          {/* خط ملوّن علوي */}
          <LinearGradient colors={[occ.accent, occ.color + "00"]} start={{x:0,y:0}} end={{x:1,y:0}} style={oc.topLine} />

          {/* نجوم خلفية */}
          <StarField color={occ.accent} />

          {/* حالة اليوم */}
          {isToday && (
            <View style={[oc.todayBadge, { backgroundColor: occ.color }]}>
              <Animated.View style={[oc.pulse, { backgroundColor: "#fff" }]} />
              <Text style={oc.todayText}>اليوم</Text>
            </View>
          )}

          <View style={oc.content}>
            {/* الأيقونة */}
            <View style={[oc.iconBox, { backgroundColor: occ.color + "18", borderColor: occ.accent + "30" }]}>
              <Text style={oc.emoji}>{occ.emoji}</Text>
            </View>

            {/* المعلومات */}
            <View style={{ flex: 1 }}>
              <Text style={oc.name}>{occ.name}</Text>
              <Text style={[oc.date, { color: occ.accent + "90" }]}>{dateStr}</Text>

              {item.daysLeft > 0 ? (
                <View style={[oc.pill, { borderColor: occ.accent + "40", backgroundColor: occ.color + "10" }]}>
                  <Ionicons name="time-outline" size={11} color={occ.accent} />
                  <Text style={[oc.pillText, { color: occ.accent }]}>بعد {item.daysLeft} يوم</Text>
                </View>
              ) : (
                <View style={[oc.pill, { borderColor: "#10B98145", backgroundColor: "#10B98110" }]}>
                  <View style={[oc.dot, { backgroundColor: "#10B981" }]} />
                  <Text style={[oc.pillText, { color: "#10B981" }]}>اليوم مبارك 🎉</Text>
                </View>
              )}
            </View>

            {/* أيقونة البطاقة */}
            <View style={[oc.cardIcon, { backgroundColor: occ.color + "15", borderColor: occ.accent + "30" }]}>
              <MaterialCommunityIcons name="card-text" size={18} color={occ.accent} />
            </View>
          </View>

          {/* معاينة الآية */}
          <View style={[oc.versePreview, { borderColor: occ.accent + "15" }]}>
            <Text style={[oc.versePreviewText, { color: occ.accent + "70" }]} numberOfLines={1}>{occ.verse}</Text>
          </View>

          {/* CTA */}
          <View style={oc.cta}>
            <MaterialCommunityIcons name="sparkles" size={12} color={occ.accent + "80"} />
            <Text style={[oc.ctaText, { color: occ.accent + "90" }]}>اضغط لإنشاء بطاقة تهنئة فاخرة</Text>
            <Ionicons name="arrow-back" size={12} color={occ.accent + "50"} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── التقويم الهجري ───────────────────────────────────────────────────────────
function HijriCalendar({ today }: { today: Date }) {
  const todayH = gToH(today.getFullYear(), today.getMonth()+1, today.getDate());
  const [hYear, setHYear] = useState(todayH.year);
  const [hMonth, setHMonth] = useState(todayH.month);
  const daysInMonth = hijriMonthDays(hYear, hMonth);
  const firstDay = hToGDate(hYear, hMonth, 1);
  const startWeekday = firstDay.getDay();
  const getOcc = (d: number) => OCCASIONS.find(o => o.hMonth===hMonth && d>=o.hDayStart && d<=o.hDayEnd) ?? null;
  const cells: (number|null)[] = [...Array(startWeekday).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  const monthOccs = OCCASIONS.filter(o => o.hMonth === hMonth);
  return (
    <View style={cal.wrap}>
      <View style={cal.header}>
        <TouchableOpacity onPress={()=>{if(hMonth===12){setHYear(y=>y+1);setHMonth(1);}else setHMonth(m=>m+1);}} style={cal.navBtn}>
          <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={{alignItems:"center"}}>
          <Text style={cal.monthName}>{HIJRI_MONTHS[hMonth-1]}</Text>
          <Text style={cal.year}>{hYear} هـ</Text>
        </View>
        <TouchableOpacity onPress={()=>{if(hMonth===1){setHYear(y=>y-1);setHMonth(12);}else setHMonth(m=>m-1);}} style={cal.navBtn}>
          <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
      <View style={cal.weekRow}>
        {["أح","اث","ثل","أر","خم","جم","سب"].map(d=>(
          <Text key={d} style={[cal.weekDay, d==="جم"&&{color:GOLD2}]}>{d}</Text>
        ))}
      </View>
      <View style={cal.grid}>
        {cells.map((day,i)=>{
          if(!day) return <View key={`e${i}`} style={cal.cell}/>;
          const occ=getOcc(day);
          const isToday=hYear===todayH.year&&hMonth===todayH.month&&day===todayH.day;
          const isFri=(startWeekday+day-1)%7===5;
          return(
            <View key={day} style={[cal.cell, isToday&&cal.todayCell, occ&&{backgroundColor:occ.color+"18"}]}>
              <Text style={[cal.dayNum, isToday&&cal.todayNum, isFri&&{color:GOLD2}, occ&&{color:occ.accent}]}>{day}</Text>
              {occ&&<View style={[cal.occDot,{backgroundColor:occ.color}]}/>}
            </View>
          );
        })}
      </View>
      {monthOccs.length>0&&(
        <View style={cal.occList}>
          <Text style={cal.occListTitle}>مناسبات {HIJRI_MONTHS[hMonth-1]}</Text>
          {monthOccs.map(o=>(
            <View key={o.key} style={cal.occRow}>
              <View style={[cal.occDotSm,{backgroundColor:o.color}]}/>
              <Text style={cal.occName}>{o.emoji} {o.name}</Text>
              <Text style={cal.occDates}>{o.hDayStart===o.hDayEnd?`${o.hDayStart}`:`${o.hDayStart}–${o.hDayEnd}`}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── منبر التهنئات ────────────────────────────────────────────────────────────
function GreetingsBoard({ token, refreshKey }: { token: string|null; refreshKey: number }) {
  const [posts,     setPosts]     = useState<GreetingPost[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [text,      setText]      = useState("");
  const [occasion,  setOccasion]  = useState("تهنئة عامة");
  const [sending,   setSending]   = useState(false);
  const [liking,    setLiking]    = useState<number|null>(null);

  const load = useCallback(async (refresh=false) => {
    if(refresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/greetings?limit=40`);
      if(r.ok) setPosts(await r.json());
    } catch {}
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(()=>{load();},[load, refreshKey]);

  async function post() {
    if(!text.trim()) return;
    if(!token) return Alert.alert("تسجيل الدخول مطلوب","سجّل دخولك لنشر تهنئتك");
    Keyboard.dismiss(); setSending(true);
    try {
      const r = await fetch(`${getApiUrl()}/api/greetings`,{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({text:text.trim(),occasion_name:occasion}),
      });
      if(r.ok){setText("");load();if(Platform.OS!=="web")Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);}
      else{const d=await r.json();Alert.alert("خطأ",d.error||"حدث خطأ");}
    }catch{Alert.alert("خطأ","تعذّر الاتصال");}
    setSending(false);
  }

  async function like(postId: number) {
    setLiking(postId);
    try {
      await fetch(`${getApiUrl()}/api/greetings/${postId}/like`,{
        method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},
        body:JSON.stringify({device_id:"anon"}),
      });
      setPosts(prev=>prev.map(p=>p.id===postId?{...p,likes_count:(p.likes_count||0)+1}:p));
      if(Platform.OS!=="web")Haptics.selectionAsync();
    }catch{}
    setLiking(null);
  }

  const timeAgo = (s: string) => {
    const d = Math.floor((Date.now()-new Date(s).getTime())/60000);
    if(d<1)return"الآن";if(d<60)return`منذ ${d}د`;
    const h=Math.floor(d/60);if(h<24)return`منذ ${h}س`;
    return`منذ ${Math.floor(h/24)} يوم`;
  };

  const OCCASION_TAGS = ["تهنئة عامة","عيد مبارك","رمضان كريم","مولد النبي ﷺ","السنة الهجرية","يوم عرفة","أخرى"];
  const OCC_COLORS: Record<string,string> = {
    "عيد مبارك":"#F59E0B","رمضان كريم":"#10B981","مولد النبي ﷺ":"#34D399",
    "السنة الهجرية":"#A78BFA","يوم عرفة":"#E2E8F0","أخرى":"#64748B","تهنئة عامة":GOLD,
  };

  return (
    <View>
      {/* صندوق الكتابة */}
      <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined}>
        <LinearGradient colors={["#0E1A10","#0A0F0B"]} style={b.compose}>
          <LinearGradient colors={[GOLD+"20","transparent"]} start={{x:0,y:0}} end={{x:1,y:0}} style={b.composeAccent}/>
          <View style={b.composeHeader}>
            <MaterialCommunityIcons name="feather" size={18} color={GOLD} />
            <Text style={b.composeTitle}>شارك تهنئتك مع أهل الحصاحيصا</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={b.tagsRow}>
            {OCCASION_TAGS.map(o => (
              <TouchableOpacity key={o} onPress={()=>setOccasion(o)}
                style={[b.tag, occasion===o&&{backgroundColor:(OCC_COLORS[o]||GOLD)+"20",borderColor:(OCC_COLORS[o]||GOLD)+"60"}]}>
                <Text style={[b.tagText, occasion===o&&{color:OCC_COLORS[o]||GOLD}]}>{o}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TextInput style={b.composeInput} value={text} onChangeText={setText}
            placeholder="اكتب كلمات تهنئتك من القلب..." placeholderTextColor="rgba(255,255,255,0.2)"
            multiline maxLength={400} textAlign="right" textAlignVertical="top" />

          <View style={b.composeBottom}>
            <Text style={b.charCount}>{text.length}/400</Text>
            <TouchableOpacity style={[b.postBtn,(!text.trim()||sending)&&{opacity:0.4}]}
              onPress={post} disabled={!text.trim()||sending}>
              <LinearGradient colors={[GOLD,GOLD2]} start={{x:0,y:0}} end={{x:1,y:0}} style={b.postBtnGrad}>
                {sending?<ActivityIndicator size={14} color="#000"/>:(
                  <><Ionicons name="send" size={14} color="#000"/><Text style={b.postBtnText}>نشر</Text></>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </KeyboardAvoidingView>

      {/* القائمة */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>load(true)} tintColor={GOLD}/>}
        scrollEnabled={false}
        contentContainerStyle={{gap:12}}
      >
        {loading?(
          <View style={{alignItems:"center",paddingVertical:50}}>
            <ActivityIndicator color={GOLD} size="large"/>
          </View>
        ):posts.length===0?(
          <View style={b.emptyBox}>
            <Text style={{fontSize:48}}>💌</Text>
            <Text style={b.emptyTitle}>لا توجد تهنئات بعد</Text>
            <Text style={b.emptySub}>كن أول من يُهنئ أهل الحصاحيصا 🌟</Text>
          </View>
        ):posts.map((p,i)=>{
          const clr = OCC_COLORS[p.occasion_name] || GOLD;
          const isBig = p.is_pinned || p.likes_count > 2;
          return(
            <Animated.View key={p.id} entering={FadeInDown.delay(i*50).springify()}>
              <LinearGradient colors={[CARD2, CARD]} style={[b.postCard, isBig&&b.postCardFeatured]}>
                <LinearGradient colors={[clr+"10","transparent"]} start={{x:0,y:0}} end={{x:1,y:0}} style={b.postAccent}/>
                {isBig&&<View style={[b.featuredBadge,{backgroundColor:clr}]}>
                  <Ionicons name="star" size={10} color="#000"/><Text style={b.featuredText}>مميّز</Text>
                </View>}

                <View style={b.postHeader}>
                  <LinearGradient colors={[clr,clr+"AA"]} style={b.avatar}>
                    <Text style={b.avatarText}>{p.author_name?.charAt(0)||"؟"}</Text>
                  </LinearGradient>
                  <View style={{flex:1}}>
                    <Text style={b.author}>{p.author_name}</Text>
                    <View style={b.postMeta}>
                      <View style={[b.occTag,{backgroundColor:clr+"18"}]}>
                        <Text style={[b.occTagText,{color:clr}]}>{p.occasion_name}</Text>
                      </View>
                      <Text style={b.timeAgo}>{timeAgo(p.created_at)}</Text>
                    </View>
                  </View>
                </View>

                <Text style={b.postText}>{p.text}</Text>

                <View style={b.postActions}>
                  <TouchableOpacity style={b.likeBtn} onPress={()=>like(p.id)} disabled={liking===p.id}>
                    {liking===p.id?(
                      <ActivityIndicator size={14} color={clr}/>
                    ):(
                      <><Ionicons name="heart-outline" size={16} color={clr}/>
                      <Text style={[b.likeCount,{color:clr}]}>{p.likes_count||0}</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={b.sharePostBtn} onPress={()=>Share.share({message:p.text,title:p.occasion_name}).catch(()=>{})}>
                    <Ionicons name="share-outline" size={15} color="rgba(255,255,255,0.3)"/>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── الشاشة الرئيسية ──────────────────────────────────────────────────────────
type TabKey = "occasions"|"calendar"|"board";

export default function GreetingsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [tab,         setTab]         = useState<TabKey>("occasions");
  const [selectedOcc, setSelectedOcc] = useState<IslamicOccasion|null>(null);
  const [boardRefresh,setBoardRefresh]= useState(0);

  const today    = new Date();
  const todayH   = gToH(today.getFullYear(), today.getMonth()+1, today.getDate());
  const upcoming = getUpcoming(today, 10);
  const active   = getActiveOccasion(today);
  const todayHijri = `${todayH.day} ${HIJRI_MONTHS[todayH.month-1]} ${todayH.year} هـ`;
  const todayGreg  = today.toLocaleDateString("ar-SA",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

  return (
    <View style={[s.root,{paddingTop:insets.top}]}>
      {/* ── الرأس ── */}
      <LinearGradient colors={["#0B1A0E","#08100A",BG]} style={s.header}>
        {active ? (
          <Animated.View entering={ZoomIn.springify()} style={[s.activeBanner,{borderColor:active.accent+"40"}]}>
            <LinearGradient colors={[active.color+"20","transparent"]} style={StyleSheet.absoluteFill}/>
            <StarField color={active.accent}/>
            <View style={s.activeBannerLeft}>
              <Text style={s.activeBannerEmoji}>{active.emoji}</Text>
            </View>
            <View style={{flex:1}}>
              <Text style={[s.activeBannerTitle,{color:active.accent}]}>{active.name}</Text>
              <Text style={s.activeBannerSub}>اضغط لإنشاء بطاقة تهنئة فاخرة 🎊</Text>
            </View>
            <TouchableOpacity onPress={()=>{setSelectedOcc(active);if(Platform.OS!=="web")Haptics.selectionAsync();}}
              style={[s.activeCTA,{backgroundColor:active.color}]}>
              <MaterialCommunityIcons name="card-text" size={14} color="#000"/>
              <Text style={s.activeCTAText}>بطاقة</Text>
            </TouchableOpacity>
          </Animated.View>
        ):(
          <View style={s.dateBox}>
            <LinearGradient colors={[GOLD+"20","transparent"]} style={s.dateIconWrap}>
              <Ionicons name="moon" size={18} color={GOLD}/>
            </LinearGradient>
            <View>
              <Text style={s.hijriDate}>{todayHijri}</Text>
              <Text style={s.gregDate}>{todayGreg}</Text>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* ── التبويبات ── */}
      <View style={s.tabs}>
        {([
          {key:"occasions",label:"المناسبات",icon:"calendar-outline",iconA:"calendar"},
          {key:"calendar", label:"التقويم",  icon:"moon-outline",    iconA:"moon"},
          {key:"board",    label:"المنبر",   icon:"chatbubbles-outline",iconA:"chatbubbles"},
        ] as {key:TabKey;label:string;icon:any;iconA:any}[]).map(t=>(
          <TouchableOpacity key={t.key}
            style={[s.tabBtn,tab===t.key&&s.tabBtnActive]}
            onPress={()=>{setTab(t.key);if(Platform.OS!=="web")Haptics.selectionAsync();}}>
            {tab===t.key&&<LinearGradient colors={[GOLD+"15","transparent"]} style={StyleSheet.absoluteFill}/>}
            <Ionicons name={tab===t.key?t.iconA:t.icon} size={16} color={tab===t.key?GOLD:Colors.textMuted}/>
            <Text style={[s.tabLabel,tab===t.key&&{color:GOLD}]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── المحتوى ── */}
      <ScrollView style={{flex:1}}
        contentContainerStyle={{padding:16,paddingBottom:insets.bottom+32}}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {tab==="occasions"&&(
          <View style={{gap:12}}>
            <Animated.View entering={FadeIn} style={s.hintCard}>
              <LinearGradient colors={[GOLD+"15","transparent"]} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill}/>
              <MaterialCommunityIcons name="sparkles" size={15} color={GOLD}/>
              <Text style={s.hintText}>اضغط على أي مناسبة لإنشاء بطاقة تهنئة ملكية فاخرة قابلة للمشاركة والنشر</Text>
            </Animated.View>
            {upcoming.map((item,i)=>(
              <OccasionCard key={item.occ.key} item={item} idx={i} onOpen={setSelectedOcc}/>
            ))}
          </View>
        )}
        {tab==="calendar"&&<HijriCalendar today={today}/>}
        {tab==="board"&&(
          <GreetingsBoard token={token} refreshKey={boardRefresh}/>
        )}
      </ScrollView>

      <GreetingCardModal
        occ={selectedOcc}
        onClose={()=>setSelectedOcc(null)}
        onPublished={()=>{setBoardRefresh(k=>k+1);}}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// الأنماط
// ═══════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root:   {flex:1,backgroundColor:BG},
  header: {paddingHorizontal:16,paddingVertical:14,gap:8},

  activeBanner: {
    flexDirection:"row-reverse",alignItems:"center",gap:12,
    borderRadius:20,padding:16,borderWidth:1,overflow:"hidden",
  },
  activeBannerLeft: {width:48,alignItems:"center"},
  activeBannerEmoji:{fontSize:36},
  activeBannerTitle:{fontFamily:"Cairo_700Bold",fontSize:16,textAlign:"right"},
  activeBannerSub:  {fontFamily:"Cairo_400Regular",fontSize:11,color:"rgba(255,255,255,0.5)",textAlign:"right",marginTop:2},
  activeCTA:{flexDirection:"row-reverse",alignItems:"center",gap:4,paddingHorizontal:12,paddingVertical:8,borderRadius:12},
  activeCTAText:{fontFamily:"Cairo_700Bold",fontSize:12,color:"#000"},

  dateBox:   {flexDirection:"row-reverse",alignItems:"center",gap:12},
  dateIconWrap:{width:38,height:38,borderRadius:12,alignItems:"center",justifyContent:"center"},
  hijriDate: {fontFamily:"Cairo_700Bold",fontSize:15,color:GOLD,textAlign:"right"},
  gregDate:  {fontFamily:"Cairo_400Regular",fontSize:11,color:"rgba(255,255,255,0.4)",textAlign:"right"},

  tabs:      {flexDirection:"row-reverse",borderBottomWidth:1,borderBottomColor:BORDER},
  tabBtn:    {flex:1,flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:5,paddingVertical:13,overflow:"hidden"},
  tabBtnActive:{borderBottomWidth:2,borderBottomColor:GOLD},
  tabLabel:  {fontFamily:"Cairo_600SemiBold",fontSize:13,color:Colors.textMuted},

  hintCard:  {flexDirection:"row-reverse",alignItems:"center",gap:8,borderRadius:14,padding:12,borderWidth:1,borderColor:GOLD+"20",overflow:"hidden"},
  hintText:  {fontFamily:"Cairo_400Regular",fontSize:12,color:GOLD+"BB",flex:1,textAlign:"right",lineHeight:20},
});

// بطاقات المناسبات
const oc = StyleSheet.create({
  card:        {borderRadius:22,overflow:"hidden",borderWidth:1,borderColor:BORDER},
  topLine:     {height:2.5},
  todayBadge:  {position:"absolute",top:14,left:14,flexDirection:"row-reverse",alignItems:"center",gap:4,borderRadius:10,paddingHorizontal:8,paddingVertical:3},
  todayText:   {fontFamily:"Cairo_700Bold",fontSize:10,color:"#fff"},
  pulse:       {width:5,height:5,borderRadius:2.5},
  content:     {flexDirection:"row-reverse",alignItems:"flex-start",gap:12,padding:16,paddingTop:14},
  iconBox:     {width:56,height:56,borderRadius:16,alignItems:"center",justifyContent:"center",borderWidth:1},
  emoji:       {fontSize:28},
  name:        {fontFamily:"Cairo_700Bold",fontSize:15,color:"#fff",textAlign:"right"},
  date:        {fontFamily:"Cairo_400Regular",fontSize:12,textAlign:"right",marginTop:2},
  pill:        {flexDirection:"row-reverse",alignItems:"center",gap:4,borderWidth:1,borderRadius:8,paddingHorizontal:8,paddingVertical:3,marginTop:6,alignSelf:"flex-end"},
  pillText:    {fontFamily:"Cairo_600SemiBold",fontSize:11},
  dot:         {width:5,height:5,borderRadius:2.5},
  cardIcon:    {width:38,height:38,borderRadius:10,alignItems:"center",justifyContent:"center",borderWidth:1},
  versePreview:{marginHorizontal:16,borderTopWidth:1,paddingTop:8},
  versePreviewText:{fontFamily:"Cairo_400Regular",fontSize:11,textAlign:"right"},
  cta:         {flexDirection:"row-reverse",alignItems:"center",gap:5,padding:14,paddingTop:6},
  ctaText:     {fontFamily:"Cairo_600SemiBold",fontSize:12,flex:1},
});

// التقويم
const cal = StyleSheet.create({
  wrap:      {backgroundColor:CARD,borderRadius:20,padding:16,borderWidth:1,borderColor:BORDER},
  header:    {flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",marginBottom:14},
  navBtn:    {width:36,height:36,borderRadius:10,backgroundColor:CARD2,alignItems:"center",justifyContent:"center"},
  monthName: {fontFamily:"Cairo_700Bold",fontSize:17,color:GOLD,textAlign:"center"},
  year:      {fontFamily:"Cairo_400Regular",fontSize:12,color:"rgba(255,255,255,0.4)",textAlign:"center"},
  weekRow:   {flexDirection:"row-reverse",marginBottom:4},
  weekDay:   {flex:1,fontFamily:"Cairo_600SemiBold",fontSize:11,color:"rgba(255,255,255,0.3)",textAlign:"center"},
  grid:      {flexDirection:"row-reverse",flexWrap:"wrap"},
  cell:      {width:`${100/7}%` as any,aspectRatio:1,alignItems:"center",justifyContent:"center",borderRadius:8},
  todayCell: {backgroundColor:GOLD+"22",borderWidth:1.5,borderColor:GOLD},
  dayNum:    {fontFamily:"Cairo_500Medium",fontSize:13,color:"rgba(255,255,255,0.5)"},
  todayNum:  {color:GOLD,fontFamily:"Cairo_700Bold"},
  occDot:    {width:4,height:4,borderRadius:2,marginTop:2},
  occList:   {marginTop:12,gap:7,borderTopWidth:1,borderTopColor:BORDER,paddingTop:10},
  occListTitle:{fontFamily:"Cairo_700Bold",fontSize:13,color:"rgba(255,255,255,0.8)",textAlign:"right",marginBottom:4},
  occRow:    {flexDirection:"row-reverse",alignItems:"center",gap:8},
  occDotSm:  {width:8,height:8,borderRadius:4},
  occName:   {fontFamily:"Cairo_500Medium",fontSize:13,color:"rgba(255,255,255,0.8)",flex:1,textAlign:"right"},
  occDates:  {fontFamily:"Cairo_400Regular",fontSize:11,color:"rgba(255,255,255,0.4)"},
});

// المودال
const cm = StyleSheet.create({
  overlay:  {flex:1,justifyContent:"flex-end"},
  sheet:    {borderTopLeftRadius:30,borderTopRightRadius:30,overflow:"hidden",maxHeight:"94%",borderWidth:1,borderColor:"rgba(255,255,255,0.1)"},
  sheetHeader:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",padding:20,paddingBottom:12},
  closeBtn: {width:40,height:40,borderRadius:14,backgroundColor:"rgba(255,255,255,0.07)",alignItems:"center",justifyContent:"center"},
  headerShareBtn:{width:40,height:40,borderRadius:14,backgroundColor:"rgba(255,255,255,0.07)",alignItems:"center",justifyContent:"center"},
  sheetTitle:{fontFamily:"Cairo_700Bold",fontSize:18,color:"#fff"},
  sheetSub:  {fontFamily:"Cairo_400Regular",fontSize:12,color:"rgba(255,255,255,0.4)",textAlign:"center",marginTop:2},
  scrollContent:{padding:20,paddingTop:4,gap:20,paddingBottom:30},

  // البطاقة
  cardWrap:  {borderRadius:24,overflow:"hidden",borderWidth:1},
  cardGrad:  {padding:22,gap:16,overflow:"hidden",minHeight:480},
  ornamentTop:{flexDirection:"row-reverse",alignItems:"center",gap:8},
  ornamentLine:{flex:1,height:1},
  ornamentCenter:{flexDirection:"row-reverse",alignItems:"center",gap:6},
  ornamentChar:{fontFamily:"Cairo_400Regular"},

  emojiWrap: {alignItems:"center",justifyContent:"center",marginVertical:4},
  emojiGlow: {position:"absolute",width:80,height:80,borderRadius:40},
  bigEmoji:  {fontSize:64,textShadowRadius:20,textShadowOffset:{width:0,height:0}},

  cardTitle: {fontFamily:"Cairo_700Bold",fontSize:26,textAlign:"center",letterSpacing:1},

  verseBox:  {borderWidth:1,borderRadius:14,padding:14,alignItems:"center"},
  verseLabel:{fontFamily:"Cairo_400Regular",fontSize:11,marginBottom:5},
  verseText: {fontFamily:"Cairo_400Regular",fontSize:14,textAlign:"center",lineHeight:26},

  greetBox:  {borderRadius:14,padding:14,borderWidth:1,overflow:"hidden"},
  greetText: {fontFamily:"Cairo_400Regular",fontSize:13,color:"rgba(255,255,255,0.88)",textAlign:"right",lineHeight:24},

  cardFooter:{gap:10,marginTop:4},
  footerLine:{height:1},
  footerRow: {flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},
  stamp:     {borderWidth:1,borderRadius:10,paddingHorizontal:10,paddingVertical:5},
  stampText: {fontFamily:"Cairo_700Bold",fontSize:12},
  watermark: {fontFamily:"Cairo_700Bold",fontSize:13},
  bottomGlow:{position:"absolute",bottom:0,left:0,right:0,height:60},

  section:   {gap:10},
  sectionLabel:{fontFamily:"Cairo_700Bold",fontSize:13,color:"rgba(255,255,255,0.8)",textAlign:"right"},
  styleRow:  {gap:8,paddingVertical:2},
  stylePill: {flexDirection:"row-reverse",alignItems:"center",gap:7,paddingHorizontal:14,paddingVertical:9,borderRadius:14,backgroundColor:"rgba(255,255,255,0.06)",borderWidth:1,borderColor:"rgba(255,255,255,0.1)"},
  styleColor:{width:10,height:10,borderRadius:5},
  stylePillText:{fontFamily:"Cairo_600SemiBold",fontSize:13,color:"rgba(255,255,255,0.5)"},

  inputRow:  {flexDirection:"row-reverse",alignItems:"center",backgroundColor:"rgba(255,255,255,0.05)",borderRadius:14,borderWidth:1,height:52},
  input:     {flex:1,fontFamily:"Cairo_400Regular",fontSize:14,color:"#fff",paddingHorizontal:6},

  actionsGrid:{flexDirection:"row-reverse",flexWrap:"wrap",gap:10},
  actionCard: {width:"47%",aspectRatio:1.8,borderRadius:16,borderWidth:1,alignItems:"center",justifyContent:"center",gap:6,overflow:"hidden"},
  actionCardPublished:{opacity:0.7},
  actionLabel:{fontFamily:"Cairo_700Bold",fontSize:13},
});

// المنبر
const b = StyleSheet.create({
  compose:     {borderRadius:20,padding:16,gap:10,borderWidth:1,borderColor:BORDER,marginBottom:16,overflow:"hidden"},
  composeAccent:{position:"absolute",top:0,left:0,right:0,height:4},
  composeHeader:{flexDirection:"row-reverse",alignItems:"center",gap:8},
  composeTitle: {fontFamily:"Cairo_700Bold",fontSize:15,color:GOLD},
  tagsRow:     {gap:8,paddingBottom:4},
  tag:         {paddingHorizontal:12,paddingVertical:5,borderRadius:14,backgroundColor:"rgba(255,255,255,0.05)",borderWidth:1,borderColor:BORDER},
  tagText:     {fontFamily:"Cairo_500Medium",fontSize:12,color:"rgba(255,255,255,0.4)"},
  composeInput:{backgroundColor:"rgba(255,255,255,0.05)",borderRadius:14,borderWidth:1,borderColor:BORDER,minHeight:88,padding:14,fontFamily:"Cairo_400Regular",fontSize:14,color:"#fff"},
  composeBottom:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between"},
  charCount:   {fontFamily:"Cairo_400Regular",fontSize:11,color:"rgba(255,255,255,0.3)"},
  postBtn:     {borderRadius:12,overflow:"hidden"},
  postBtnGrad: {flexDirection:"row-reverse",alignItems:"center",gap:6,paddingHorizontal:16,paddingVertical:9},
  postBtnText: {fontFamily:"Cairo_700Bold",fontSize:13,color:"#000"},

  emptyBox:  {alignItems:"center",paddingVertical:50,gap:8},
  emptyTitle:{fontFamily:"Cairo_700Bold",fontSize:16,color:"rgba(255,255,255,0.6)"},
  emptySub:  {fontFamily:"Cairo_400Regular",fontSize:13,color:"rgba(255,255,255,0.3)"},

  postCard:  {borderRadius:18,padding:16,borderWidth:1,borderColor:BORDER,overflow:"hidden",gap:10},
  postCardFeatured:{borderColor:GOLD+"30"},
  postAccent:{position:"absolute",top:0,left:0,right:0,height:3},
  featuredBadge:{position:"absolute",top:12,left:12,flexDirection:"row-reverse",alignItems:"center",gap:3,paddingHorizontal:7,paddingVertical:3,borderRadius:8},
  featuredText: {fontFamily:"Cairo_700Bold",fontSize:10,color:"#000"},

  postHeader:{flexDirection:"row-reverse",alignItems:"center",gap:10},
  avatar:    {width:40,height:40,borderRadius:13,alignItems:"center",justifyContent:"center"},
  avatarText:{fontFamily:"Cairo_700Bold",fontSize:17,color:"#fff"},
  author:    {fontFamily:"Cairo_700Bold",fontSize:14,color:"#fff",textAlign:"right"},
  postMeta:  {flexDirection:"row-reverse",alignItems:"center",gap:8,marginTop:3},
  occTag:    {borderRadius:7,paddingHorizontal:7,paddingVertical:2},
  occTagText:{fontFamily:"Cairo_600SemiBold",fontSize:11},
  timeAgo:   {fontFamily:"Cairo_400Regular",fontSize:11,color:"rgba(255,255,255,0.3)"},
  postText:  {fontFamily:"Cairo_400Regular",fontSize:13,color:"rgba(255,255,255,0.75)",textAlign:"right",lineHeight:23},
  postActions:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",paddingTop:4,borderTopWidth:1,borderTopColor:BORDER},
  likeBtn:   {flexDirection:"row-reverse",alignItems:"center",gap:5},
  likeCount: {fontFamily:"Cairo_600SemiBold",fontSize:13},
  sharePostBtn:{width:32,height:32,borderRadius:10,backgroundColor:"rgba(255,255,255,0.05)",alignItems:"center",justifyContent:"center"},
});
