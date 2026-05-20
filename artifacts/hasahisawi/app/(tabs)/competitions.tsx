import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Alert, Modal, TextInput, Pressable, FlatList, Dimensions,
} from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeIn, useSharedValue, withRepeat, withTiming, useAnimatedStyle, Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";

const { width } = Dimensions.get("window");

// ── أنواع البيانات ─────────────────────────────────────────────────
type Competition = {
  id: string;
  title: string;
  desc: string;
  category: string;
  prize: string;
  prizeColor: string;
  endDate: Date;
  participants: number;
  maxParticipants?: number;
  difficulty: "سهل" | "متوسط" | "صعب";
  icon: string;
  gradient: [string, string];
  questions?: Question[];
  entered?: boolean;
  userScore?: number;
  userRank?: number;
};

type Question = {
  q: string;
  options: string[];
  correct: number;
};

type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
  time: string;
  isUser?: boolean;
};

// ── بيانات المسابقات ───────────────────────────────────────────────
const COMPETITIONS: Competition[] = [
  {
    id: "1",
    title: "مسابقة المعلومات العامة",
    desc: "اختبر معرفتك بالمعلومات العامة والثقافة العامة وقدّم إجاباتك بسرعة",
    category: "ثقافة",
    prize: "200 جنيه",
    prizeColor: "#F59E0B",
    endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    participants: 347,
    maxParticipants: 500,
    difficulty: "متوسط",
    icon: "brain",
    gradient: ["#7C3AED", "#4F46E5"],
    questions: [
      { q: "ما هي عاصمة السودان؟", options: ["الخرطوم", "بورتسودان", "أم درمان", "مدني"], correct: 0 },
      { q: "كم عدد ولايات السودان؟", options: ["15", "18", "25", "32"], correct: 2 },
      { q: "على أي نهر تقع مدينة الحصاحيصا؟", options: ["النيل الأبيض", "النيل الأزرق", "عطبرة", "الدندر"], correct: 1 },
      { q: "متى نال السودان استقلاله؟", options: ["1955", "1956", "1958", "1960"], correct: 1 },
      { q: "ما هي عملة السودان؟", options: ["الدولار", "الجنيه", "الريال", "الدينار"], correct: 1 },
    ],
  },
  {
    id: "2",
    title: "مسابقة الرياضيات السريعة",
    desc: "حل المسائل الرياضية في أقل وقت ممكن — من يكون الأسرع؟",
    category: "رياضيات",
    prize: "قسيمة 150 جنيه",
    prizeColor: "#22C55E",
    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    participants: 128,
    maxParticipants: 200,
    difficulty: "صعب",
    icon: "calculator",
    gradient: ["#059669", "#0EA5E9"],
    questions: [
      { q: "كم ناتج 7 × 8 ؟", options: ["54", "56", "58", "64"], correct: 1 },
      { q: "ما جذر 144؟", options: ["11", "12", "13", "14"], correct: 1 },
      { q: "كم ناتج 15% × 200؟", options: ["25", "30", "40", "45"], correct: 1 },
      { q: "ما ناتج 2⁸ ؟", options: ["64", "128", "256", "512"], correct: 2 },
      { q: "كم ناتج (100 - 37) × 2؟", options: ["116", "126", "136", "146"], correct: 1 },
    ],
  },
  {
    id: "3",
    title: "مسابقة التصوير الفوتوغرافي",
    desc: "شارك أجمل صورك من مدينة الحصاحيصا ليصوّت عليها المجتمع",
    category: "إبداع",
    prize: "جائزة تكريمية",
    prizeColor: "#EC4899",
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    participants: 64,
    difficulty: "سهل",
    icon: "camera",
    gradient: ["#EC4899", "#F97316"],
  },
  {
    id: "4",
    title: "مسابقة الثقافة الإسلامية",
    desc: "اختبار في القرآن الكريم والسيرة النبوية والفقه الإسلامي",
    category: "دين",
    prize: "مكافأة 300 جنيه",
    prizeColor: "#F59E0B",
    endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    participants: 521,
    maxParticipants: 1000,
    difficulty: "متوسط",
    icon: "book-open-variant",
    gradient: ["#D97706", "#92400E"],
    questions: [
      { q: "كم عدد سور القرآن الكريم؟", options: ["110", "114", "120", "124"], correct: 1 },
      { q: "ما هي أطول سورة في القرآن؟", options: ["آل عمران", "النساء", "البقرة", "المائدة"], correct: 2 },
      { q: "في أي شهر نزل القرآن الكريم؟", options: ["رجب", "شعبان", "رمضان", "محرم"], correct: 2 },
      { q: "كم عدد أركان الإسلام؟", options: ["4", "5", "6", "7"], correct: 1 },
      { q: "ما هي أولى القبلتين؟", options: ["المسجد الحرام", "المسجد النبوي", "المسجد الأقصى", "قبة الصخرة"], correct: 2 },
    ],
  },
];

// ── بيانات قائمة المتصدرين ────────────────────────────────────────
const LEADERBOARD_DATA: LeaderboardEntry[] = [
  { rank: 1, name: "محمد عبدالله", score: 500, time: "1:23" },
  { rank: 2, name: "فاطمة النور", score: 480, time: "1:45" },
  { rank: 3, name: "علي حسين", score: 460, time: "2:01" },
  { rank: 4, name: "سارة خالد", score: 440, time: "2:15" },
  { rank: 5, name: "أحمد محمود", score: 420, time: "2:30" },
  { rank: 12, name: "أنت", score: 320, time: "3:10", isUser: true },
];

// ── مكوّن العدّاد التنازلي ────────────────────────────────────────
function Countdown({ endDate }: { endDate: Date }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const diff = endDate.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("انتهت"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      if (d > 0) setTimeLeft(`${d}ي ${h}س`);
      else if (h > 0) setTimeLeft(`${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`);
      else setTimeLeft(`${m}:${String(sec).padStart(2, "0")}`);
    }
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [endDate]);

  const isUrgent = endDate.getTime() - Date.now() < 3600000;
  return (
    <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: isUrgent ? Colors.danger : Colors.accent }}>
      ⏱ {timeLeft}
    </Text>
  );
}

// ── مكوّن النبضة ─────────────────────────────────────────────────
function PulsingDot({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);
  useEffect(() => {
    scale.value = withRepeat(withTiming(1.5, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
    opacity.value = withRepeat(withTiming(0.2, { duration: 900 }), -1, true);
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return (
    <View style={{ width: 10, height: 10, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, position: "absolute" }, st]} />
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
    </View>
  );
}

// ── مودال المسابقة ────────────────────────────────────────────────
function QuizModal({
  comp, visible, onClose,
}: { comp: Competition; visible: boolean; onClose: (score?: number) => void }) {
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [startTime] = useState(Date.now());

  const questions = comp.questions ?? [];

  function handleAnswer(idx: number) {
    if (answered) return;
    setSelected(idx);
    setAnswered(true);
    const correct = questions[qIdx].correct === idx;
    if (correct) setScore(s => s + 100);
  }

  function next() {
    if (qIdx < questions.length - 1) {
      setQIdx(i => i + 1);
      setSelected(null);
      setAnswered(false);
    } else {
      setDone(true);
    }
  }

  function restart() {
    setQIdx(0); setSelected(null); setAnswered(false); setScore(0); setDone(false);
  }

  const elapsed = Math.floor((Date.now() - startTime) / 1000);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onClose()}>
      <View style={qm.overlay}>
        <Animated.View entering={FadeInUp.springify().damping(18)} style={qm.container}>
          <LinearGradient colors={comp.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={qm.header}>
            <TouchableOpacity onPress={() => onClose()} style={qm.closeBtn}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={qm.title}>{comp.title}</Text>
            {!done && (
              <Text style={qm.progress}>{qIdx + 1} / {questions.length}</Text>
            )}
          </LinearGradient>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {done ? (
              // نتيجة المسابقة
              <Animated.View entering={FadeIn} style={{ alignItems: "center", gap: 20 }}>
                <LinearGradient colors={comp.gradient} style={qm.trophyWrap}>
                  <MaterialCommunityIcons name="trophy" size={48} color="#fff" />
                </LinearGradient>
                <Text style={qm.resultTitle}>أحسنت! 🎉</Text>
                <Text style={qm.resultScore}>{score} نقطة</Text>
                <Text style={qm.resultSub}>من أصل {questions.length * 100} نقطة</Text>

                <View style={qm.statRow}>
                  <View style={qm.statBox}>
                    <Text style={qm.statValue}>{questions.filter((_, i) => i < qIdx + 1).length}</Text>
                    <Text style={qm.statLabel}>أسئلة</Text>
                  </View>
                  <View style={qm.statBox}>
                    <Text style={qm.statValue}>{score / 100}</Text>
                    <Text style={qm.statLabel}>صحيحة</Text>
                  </View>
                  <View style={qm.statBox}>
                    <Text style={qm.statValue}>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</Text>
                    <Text style={qm.statLabel}>الوقت</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={async () => {
                    await Share.share({ message: `🏆 حصلت على ${score} نقطة في مسابقة "${comp.title}" في تطبيق حصاحيصاوي! \nجرّبها أنت أيضاً 📱` });
                  }}
                  style={qm.shareBtn}
                >
                  <Ionicons name="share-social-outline" size={18} color={Colors.accent} />
                  <Text style={qm.shareBtnText}>شارك نتيجتك</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={restart} style={qm.retryBtn}>
                  <Ionicons name="refresh" size={16} color={Colors.textMuted} />
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textMuted }}>إعادة المحاولة</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => onClose(score)} style={[qm.retryBtn, { borderColor: comp.gradient[0] + "50" }]}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: comp.gradient[0] }}>العودة</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              // السؤال
              <Animated.View entering={FadeIn} key={qIdx}>
                {/* شريط التقدم */}
                <View style={qm.progressBar}>
                  <LinearGradient
                    colors={comp.gradient}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[qm.progressFill, { width: `${((qIdx + 1) / questions.length) * 100}%` as any }]}
                  />
                </View>

                {/* السؤال */}
                <View style={qm.questionBox}>
                  <Text style={qm.questionNumber}>السؤال {qIdx + 1}</Text>
                  <Text style={qm.questionText}>{questions[qIdx].q}</Text>
                </View>

                {/* الخيارات */}
                <View style={{ gap: 10, marginTop: 8 }}>
                  {questions[qIdx].options.map((opt, i) => {
                    const isCorrect = i === questions[qIdx].correct;
                    const isSelected = i === selected;
                    let bg = "rgba(255,255,255,0.04)";
                    let border = "rgba(255,255,255,0.1)";
                    let textColor = Colors.textPrimary;
                    if (answered) {
                      if (isCorrect) { bg = "#22C55E20"; border = "#22C55E60"; textColor = "#22C55E"; }
                      else if (isSelected) { bg = "#EF444420"; border = "#EF444460"; textColor = "#EF4444"; }
                    }
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => handleAnswer(i)}
                        style={[qm.option, { backgroundColor: bg, borderColor: border }]}
                        disabled={answered}
                      >
                        <View style={[qm.optionLetter, { backgroundColor: border }]}>
                          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: textColor }}>
                            {["أ", "ب", "ج", "د"][i]}
                          </Text>
                        </View>
                        <Text style={[qm.optionText, { color: textColor }]}>{opt}</Text>
                        {answered && isCorrect && <Ionicons name="checkmark-circle" size={18} color="#22C55E" />}
                        {answered && isSelected && !isCorrect && <Ionicons name="close-circle" size={18} color="#EF4444" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* زر التالي */}
                {answered && (
                  <Animated.View entering={FadeInDown.delay(200)} style={{ marginTop: 20 }}>
                    <TouchableOpacity onPress={next}>
                      <LinearGradient colors={comp.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={qm.nextBtn}>
                        <Text style={qm.nextBtnText}>
                          {qIdx < questions.length - 1 ? "السؤال التالي" : "عرض النتيجة"}
                        </Text>
                        <Ionicons name="arrow-back" size={18} color="#fff" />
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              </Animated.View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── بطاقة المسابقة ────────────────────────────────────────────────
function CompetitionCard({
  comp, onEnter, onShare, index,
}: { comp: Competition; onEnter: () => void; onShare: () => void; index: number }) {
  const pct = comp.maxParticipants ? (comp.participants / comp.maxParticipants) * 100 : 60;
  const diffColor = comp.difficulty === "سهل" ? "#22C55E" : comp.difficulty === "متوسط" ? "#F59E0B" : "#EF4444";

  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 70).springify().damping(16)}>
      <View style={c.card}>
        {/* رأس البطاقة */}
        <LinearGradient colors={comp.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={c.cardHeader}>
          {comp.entered && (
            <View style={c.enteredBadge}>
              <Ionicons name="checkmark-circle" size={12} color="#fff" />
              <Text style={c.enteredBadgeText}>مشترك</Text>
            </View>
          )}
          <View style={c.cardIconWrap}>
            <MaterialCommunityIcons name={comp.icon as any} size={32} color="#fff" />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={c.cardTitle}>{comp.title}</Text>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
              <View style={[c.diffBadge, { backgroundColor: diffColor + "30", borderColor: diffColor + "60" }]}>
                <Text style={[c.diffText, { color: diffColor }]}>{comp.difficulty}</Text>
              </View>
              <View style={[c.catBadge]}>
                <Text style={c.catText}>{comp.category}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* جسم البطاقة */}
        <View style={c.cardBody}>
          <Text style={c.desc}>{comp.desc}</Text>

          {/* الجائزة + الوقت */}
          <View style={c.infoRow}>
            <View style={c.infoItem}>
              <MaterialCommunityIcons name="trophy" size={16} color={comp.prizeColor} />
              <Text style={[c.infoValue, { color: comp.prizeColor }]}>{comp.prize}</Text>
            </View>
            <View style={c.infoItem}>
              <Ionicons name="people-outline" size={16} color={Colors.textMuted} />
              <Text style={c.infoValue}>{comp.participants.toLocaleString()} مشارك</Text>
            </View>
            <View style={c.infoItem}>
              <PulsingDot color={Colors.danger} />
              <Countdown endDate={comp.endDate} />
            </View>
          </View>

          {/* شريط التقدم */}
          {comp.maxParticipants && (
            <View style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 5 }}>
                <Text style={c.progressLabel}>المشاركون</Text>
                <Text style={c.progressLabel}>{comp.participants} / {comp.maxParticipants}</Text>
              </View>
              <View style={c.progressBg}>
                <LinearGradient
                  colors={comp.gradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[c.progressFill, { width: `${Math.min(pct, 100)}%` as any }]}
                />
              </View>
            </View>
          )}

          {/* نتيجة المستخدم */}
          {comp.entered && comp.userScore !== undefined && (
            <View style={[c.userResult, { borderColor: comp.gradient[0] + "40" }]}>
              <LinearGradient colors={[comp.gradient[0] + "15", comp.gradient[1] + "08"]} style={StyleSheet.absoluteFill} />
              <Ionicons name="medal-outline" size={16} color={comp.prizeColor} />
              <Text style={[c.userResultText, { color: comp.prizeColor }]}>
                نتيجتك: {comp.userScore} نقطة
              </Text>
              {comp.userRank && (
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, marginRight: "auto" }}>
                  <Ionicons name="trending-up-outline" size={14} color={Colors.primary} />
                  <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primary }}>
                    المركز #{comp.userRank}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* الأزرار */}
          <View style={c.btnRow}>
            <AnimatedPress onPress={onEnter} style={{ flex: 1 }}>
              <LinearGradient colors={comp.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={c.enterBtn}>
                <MaterialCommunityIcons name={comp.entered ? "refresh" : "play-circle-outline"} size={18} color="#fff" />
                <Text style={c.enterBtnText}>{comp.entered ? "إعادة المحاولة" : comp.questions ? "ابدأ الآن" : "شارك"}</Text>
              </LinearGradient>
            </AnimatedPress>

            <TouchableOpacity onPress={onShare} style={c.shareBtn}>
              <Ionicons name="share-social-outline" size={18} color={Colors.accent} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ── لوحة المتصدرين ────────────────────────────────────────────────
function LeaderboardModal({ visible, comp, onClose }: { visible: boolean; comp: Competition; onClose: () => void }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={lb.overlay}>
        <Animated.View entering={FadeInUp.springify().damping(18)} style={lb.container}>
          <LinearGradient colors={comp.gradient} style={lb.header}>
            <TouchableOpacity onPress={onClose} style={lb.closeBtn}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
            <MaterialCommunityIcons name="trophy" size={24} color="#fff" />
            <Text style={lb.title}>قائمة المتصدرين</Text>
            <Text style={lb.subtitle}>{comp.title}</Text>
          </LinearGradient>
          <FlatList
            data={LEADERBOARD_DATA}
            keyExtractor={item => String(item.rank)}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(60 + index * 40).springify()}>
                <View style={[lb.entry, item.isUser && lb.entryUser]}>
                  {item.rank <= 3 ? (
                    <Text style={lb.medal}>{medals[item.rank - 1]}</Text>
                  ) : (
                    <Text style={lb.rank}>#{item.rank}</Text>
                  )}
                  <View style={lb.entryInfo}>
                    <Text style={[lb.entryName, item.isUser && { color: Colors.primary }]}>{item.name}</Text>
                    <Text style={lb.entryTime}>⏱ {item.time}</Text>
                  </View>
                  <View style={[lb.scoreWrap, { backgroundColor: comp.gradient[0] + "20" }]}>
                    <Text style={[lb.score, { color: comp.gradient[0] }]}>{item.score}</Text>
                    <Text style={lb.scoreLabel}>نقطة</Text>
                  </View>
                </View>
              </Animated.View>
            )}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── الشاشة الرئيسية ───────────────────────────────────────────────
export default function CompetitionsScreen() {
  const insets = useSafeAreaInsets();
  const [competitions, setCompetitions] = useState<Competition[]>(COMPETITIONS);
  const [activeQuiz, setActiveQuiz] = useState<Competition | null>(null);
  const [activeLeaderboard, setActiveLeaderboard] = useState<Competition | null>(null);
  const [filter, setFilter] = useState("الكل");

  const categories = ["الكل", "ثقافة", "رياضيات", "إبداع", "دين"];
  const filtered = filter === "الكل" ? competitions : competitions.filter(c => c.category === filter);

  const totalParticipants = competitions.reduce((s, c) => s + c.participants, 0);
  const userScore = competitions.filter(c => c.entered && c.userScore).reduce((s, c) => s + (c.userScore ?? 0), 0);

  async function handleShare(comp: Competition) {
    await Share.share({
      message: `🏆 انضم إلى مسابقة "${comp.title}" في تطبيق حصاحيصاوي!\nالجائزة: ${comp.prize}\nالمشاركون: ${comp.participants} شخص\n\n📱 حمّل تطبيق حصاحيصاوي وشارك!`,
      title: `مسابقة ${comp.title}`,
    });
  }

  function handleEnter(comp: Competition) {
    if (comp.questions) {
      setActiveQuiz(comp);
    } else {
      Alert.alert(
        `المشاركة في ${comp.title}`,
        "سيتم إخطارك عند بدء المسابقة. هل تريد تسجيل اهتمامك؟",
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "سجّل اهتمامي",
            onPress: () => {
              setCompetitions(prev => prev.map(c =>
                c.id === comp.id ? { ...c, entered: true, participants: c.participants + 1 } : c
              ));
              Alert.alert("تم التسجيل ✅", "سيتم إخطارك عند انطلاق هذه المسابقة");
            },
          },
        ]
      );
    }
  }

  function handleQuizClose(score?: number) {
    if (score !== undefined && activeQuiz) {
      setCompetitions(prev => prev.map(c =>
        c.id === activeQuiz.id
          ? { ...c, entered: true, userScore: score, userRank: Math.floor(Math.random() * 10) + 5 }
          : c
      ));
    }
    setActiveQuiz(null);
  }

  return (
    <View style={[m.container, { paddingTop: insets.top }]}>
      {/* رأس الصفحة */}
      <Animated.View entering={FadeInDown.duration(400)} style={m.header}>
        <LinearGradient colors={["rgba(124,58,237,0.18)", "transparent"]} style={StyleSheet.absoluteFill} />
        <TouchableOpacity onPress={() => router.back()} style={m.backBtn} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color="#7C3AED" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={m.headerTitle}>المسابقات</Text>
          <Text style={m.headerSub}>تحدّ · فوز · تميّز</Text>
        </View>
        <View style={{ width: 36 }} />
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

        {/* بطاقة الإحصائيات */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={{ paddingHorizontal: 16, marginTop: 16, marginBottom: 10 }}>
          <LinearGradient colors={["#7C3AED", "#4F46E5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={m.statsCard}>
            {/* زخرفة */}
            <View style={m.statsOrb} />
            <View style={[m.statsOrb, { top: -20, right: "30%", width: 80, height: 80, opacity: 0.12 }]} />

            <View style={m.statsRow}>
              {[
                { value: competitions.length.toString(), label: "مسابقة نشطة", icon: "trophy" },
                { value: totalParticipants.toLocaleString(), label: "مشارك إجمالي", icon: "people" },
                { value: userScore > 0 ? userScore.toString() : "—", label: "نقاطك", icon: "star" },
              ].map((stat, i) => (
                <View key={i} style={[m.statItem, i === 1 && m.statItemCenter]}>
                  <Ionicons name={stat.icon as any} size={18} color="rgba(255,255,255,0.9)" />
                  <Text style={m.statValue}>{stat.value}</Text>
                  <Text style={m.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* فلتر الفئات */}
        <Animated.View entering={FadeInDown.delay(160).springify()}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 4 }}>
            {categories.map(cat => (
              <TouchableOpacity key={cat} onPress={() => setFilter(cat)}
                style={[m.filterChip, filter === cat && m.filterChipActive]}>
                <Text style={[m.filterText, filter === cat && m.filterTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* قائمة المسابقات */}
        <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 14 }}>
          {filtered.map((comp, i) => (
            <CompetitionCard
              key={comp.id}
              comp={comp}
              index={i}
              onEnter={() => handleEnter(comp)}
              onShare={() => handleShare(comp)}
            />
          ))}
          {filtered.length === 0 && (
            <View style={m.empty}>
              <MaterialCommunityIcons name="trophy-outline" size={48} color={Colors.textMuted} />
              <Text style={m.emptyText}>لا توجد مسابقات في هذه الفئة</Text>
            </View>
          )}
        </View>

        {/* قائمة المتصدرين — عرض الأولى فقط */}
        {competitions[0] && (
          <Animated.View entering={FadeInDown.delay(400).springify()} style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <Text style={m.sectionTitle}>🏅 المتصدرون — {competitions[0].title}</Text>
            <View style={m.miniLeaderboard}>
              {LEADERBOARD_DATA.slice(0, 3).map((entry, i) => (
                <View key={i} style={m.miniEntry}>
                  <Text style={m.miniMedal}>{["🥇", "🥈", "🥉"][i]}</Text>
                  <Text style={m.miniName}>{entry.name}</Text>
                  <Text style={m.miniScore}>{entry.score} نقطة</Text>
                </View>
              ))}
              <TouchableOpacity onPress={() => setActiveLeaderboard(competitions[0])} style={m.seeAll}>
                <Text style={m.seeAllText}>عرض الكل</Text>
                <Ionicons name="chevron-back" size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* مودال المسابقة */}
      {activeQuiz && (
        <QuizModal comp={activeQuiz} visible={!!activeQuiz} onClose={handleQuizClose} />
      )}

      {/* مودال المتصدرين */}
      {activeLeaderboard && (
        <LeaderboardModal
          visible={!!activeLeaderboard}
          comp={activeLeaderboard}
          onClose={() => setActiveLeaderboard(null)}
        />
      )}
    </View>
  );
}

// ── أنماط الشاشة الرئيسية ─────────────────────────────────────────
const m = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, paddingTop: 12,
    borderBottomWidth: 0.5, borderBottomColor: "rgba(124,58,237,0.2)", gap: 8,
  },
  backBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#7C3AED15", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  statsCard: { borderRadius: 22, padding: 20, overflow: "hidden" },
  statsOrb: { position: "absolute", top: -30, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: "#ffffff14" },
  statsRow: { flexDirection: "row" },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statItemCenter: { borderLeftWidth: 1, borderRightWidth: 1, borderLeftColor: "#ffffff20", borderRightColor: "#ffffff20" },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#fff" },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: "rgba(255,255,255,0.75)" },

  filterChip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
  },
  filterChipActive: { backgroundColor: "#7C3AED20", borderColor: "#7C3AED60" },
  filterText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  filterTextActive: { color: "#A78BFA" },

  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", marginBottom: 12 },
  miniLeaderboard: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  miniEntry: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)" },
  miniMedal: { fontSize: 20 },
  miniName: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, flex: 1 },
  miniScore: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.accent },
  seeAll: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  seeAllText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.primary },

  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textMuted },
});

// ── أنماط بطاقة المسابقة ──────────────────────────────────────────
const c = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 22, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  cardHeader: { flexDirection: "row-reverse", alignItems: "center", padding: 16, gap: 12 },
  enteredBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  enteredBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  cardIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff", flex: 1 },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  diffText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)" },
  catText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: "#fff" },

  cardBody: { padding: 14, gap: 12 },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, lineHeight: 20, textAlign: "right" },
  infoRow: { flexDirection: "row-reverse", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  infoItem: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  infoValue: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },

  progressLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  progressBg: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },

  userResult: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  userResultText: { fontFamily: "Cairo_700Bold", fontSize: 14 },

  btnRow: { flexDirection: "row-reverse", gap: 10 },
  enterBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14 },
  enterBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  shareBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: Colors.accent + "15", borderWidth: 1, borderColor: Colors.accent + "35", alignItems: "center", justifyContent: "center" },
});

// ── أنماط مودال المسابقة ──────────────────────────────────────────
const qm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  container: { backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "95%", overflow: "hidden" },
  header: { padding: 20, gap: 4, alignItems: "center" },
  closeBtn: { position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "center" },
  progress: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)" },

  progressBar: { height: 5, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 3, marginBottom: 20, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },

  questionBox: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  questionNumber: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginBottom: 8 },
  questionText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", lineHeight: 26 },

  option: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5 },
  optionLetter: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optionText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, flex: 1, textAlign: "right" },

  nextBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 14, borderRadius: 16 },
  nextBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  trophyWrap: { width: 100, height: 100, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  resultTitle: { fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.textPrimary },
  resultScore: { fontFamily: "Cairo_700Bold", fontSize: 48, color: Colors.accent },
  resultSub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted },
  statRow: { flexDirection: "row", gap: 20 },
  statBox: { alignItems: "center", gap: 4 },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.textPrimary },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  shareBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 13, paddingHorizontal: 28, borderRadius: 16, borderWidth: 1, borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "12" },
  shareBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.accent },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
});

// ── أنماط المتصدرين ───────────────────────────────────────────────
const lb = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  container: { backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "85%", overflow: "hidden" },
  header: { padding: 20, alignItems: "center", gap: 6 },
  closeBtn: { position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.25)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" },
  subtitle: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.8)" },
  entry: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.07)" },
  entryUser: { borderColor: Colors.primary + "50", backgroundColor: Colors.primary + "08" },
  medal: { fontSize: 22, width: 32, textAlign: "center" },
  rank: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textMuted, width: 32, textAlign: "center" },
  entryInfo: { flex: 1, gap: 2 },
  entryName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary },
  entryTime: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  scoreWrap: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignItems: "center" },
  score: { fontFamily: "Cairo_700Bold", fontSize: 18 },
  scoreLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
});
