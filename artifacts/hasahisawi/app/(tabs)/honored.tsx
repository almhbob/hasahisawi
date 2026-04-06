import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image, Modal,
  Dimensions, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, {
  FadeIn, FadeInDown, FadeInUp, ZoomIn,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming,
  Easing, interpolate,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import HonorCard, { HonoredFigure } from "@/components/HonorCard";

// ── ثوابت الألوان الذهبية ───────────────────────────────────────
const GOLD      = "#D4AF37";
const GOLD_LITE = "#F5C842";
const GOLD_DIM  = "#A08820";
const AMBER     = "#F59E0B";

const { width: W } = Dimensions.get("window");

// ── أنواع البيانات ────────────────────────────────────────────
type Figure = HonoredFigure & { is_current?: boolean };

// ── مساعد التاريخ ─────────────────────────────────────────────
function arabicDate(s: string) {
  return new Date(s).toLocaleDateString("ar-SD", { day: "numeric", month: "long", year: "numeric" });
}
function arabicYear(s: string) {
  return new Date(s).getFullYear().toString();
}

// ══════════════════════════════════════════════════════════════
// مكوّن: بطاقة مُكرَّم صغيرة في القائمة
// ══════════════════════════════════════════════════════════════
function FigureCard({ figure, index, onPress }: {
  figure: Figure; index: number; onPress: (f: Figure) => void;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
      <TouchableOpacity
        style={fc.card}
        activeOpacity={0.82}
        onPress={() => onPress(figure)}
      >
        {/* صورة المكرَّم */}
        <View style={fc.avatarWrap}>
          {figure.is_current && (
            <Animated.View
              entering={ZoomIn.delay(index * 60 + 200).springify()}
              style={fc.currentRing}
            />
          )}
          <Image
            source={{ uri: figure.photo_url || "https://via.placeholder.com/80" }}
            style={fc.avatar}
            resizeMode="cover"
          />
          {figure.is_current && (
            <View style={fc.starBadge}>
              <Ionicons name="star" size={9} color="#1A0F00" />
            </View>
          )}
        </View>

        {/* المعلومات */}
        <View style={fc.info}>
          <View style={fc.nameRow}>
            <Text style={fc.name} numberOfLines={1}>{figure.name}</Text>
            {figure.is_current && (
              <View style={fc.currentBadge}>
                <Text style={fc.currentBadgeText}>المكرَّم الحالي</Text>
              </View>
            )}
          </View>
          {!!figure.title && (
            <Text style={fc.title} numberOfLines={1}>{figure.title}</Text>
          )}
          {!!figure.city_role && (
            <Text style={fc.role} numberOfLines={1}>{figure.city_role}</Text>
          )}
          <View style={fc.dateRow}>
            <Ionicons name="calendar-outline" size={11} color={GOLD_DIM} />
            <Text style={fc.date}>
              {arabicDate(figure.start_date)} — {arabicDate(figure.end_date)}
            </Text>
          </View>
        </View>

        <Ionicons name="chevron-back" size={18} color={GOLD_DIM} style={{ opacity: 0.6 }} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ══════════════════════════════════════════════════════════════
// مكوّن: مودال التفاصيل الكاملة
// ══════════════════════════════════════════════════════════════
function DetailModal({ figure, onClose }: { figure: Figure; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    );
  }, []);
  const shimAnim = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.5, 1]),
  }));

  return (
    <Modal animationType="slide" transparent={false} visible onRequestClose={onClose}>
      <StatusBar style="light" />
      <View style={[dm.root, { paddingTop: insets.top }]}>
        {/* الرأس */}
        <LinearGradient colors={["#050E04", "#0A1A0A"]} style={dm.header}>
          <TouchableOpacity onPress={onClose} style={dm.closeBtn} activeOpacity={0.8}>
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Animated.View style={[dm.headerDecor, shimAnim]} pointerEvents="none">
            <LinearGradient
              colors={[GOLD_DIM + "00", GOLD + "18", GOLD_DIM + "00"]}
              start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <View style={dm.headerContent}>
            <Ionicons name="trophy" size={16} color={GOLD} />
            <Text style={dm.headerTitle}>قاعة التكريم</Text>
          </View>
        </LinearGradient>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        >
          {/* الصورة */}
          <View style={dm.photoWrap}>
            <Image
              source={{ uri: figure.photo_url || "https://via.placeholder.com/400x300" }}
              style={dm.photo}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["transparent", "rgba(5,14,4,0.75)", "#050E04"]}
              locations={[0.4, 0.75, 1]}
              style={StyleSheet.absoluteFill}
            />
            {figure.is_current && (
              <Animated.View entering={ZoomIn.springify()} style={dm.currentChip}>
                <LinearGradient colors={[GOLD, AMBER, GOLD_DIM]} style={dm.currentChipGrad}>
                  <Ionicons name="star" size={11} color="#1A0F00" />
                  <Text style={dm.currentChipText}>المكرَّم الحالي</Text>
                  <Ionicons name="star" size={11} color="#1A0F00" />
                </LinearGradient>
              </Animated.View>
            )}
          </View>

          <View style={dm.body}>
            {/* الاسم */}
            <Animated.View entering={FadeInUp.delay(100).springify()} style={dm.nameSection}>
              <Text style={dm.name}>{figure.name}</Text>
              {!!figure.title && (
                <View style={dm.titleRow}>
                  <View style={dm.titleLine} />
                  <Text style={dm.titleText}>{figure.title}</Text>
                  <View style={dm.titleLine} />
                </View>
              )}
              {!!figure.city_role && (
                <Text style={dm.role}>{figure.city_role}</Text>
              )}
            </Animated.View>

            {/* فترة التكريم */}
            <Animated.View entering={FadeInDown.delay(150).springify()} style={dm.periodCard}>
              <View style={dm.periodRow}>
                <Ionicons name="calendar" size={15} color={GOLD} />
                <Text style={dm.periodLabel}>فترة التكريم</Text>
              </View>
              <View style={dm.periodDates}>
                <View style={dm.periodDate}>
                  <Text style={dm.periodDateLabel}>من</Text>
                  <Text style={dm.periodDateVal}>{arabicDate(figure.start_date)}</Text>
                </View>
                <View style={dm.periodSep}>
                  <Ionicons name="arrow-back" size={16} color={GOLD_DIM} />
                </View>
                <View style={dm.periodDate}>
                  <Text style={dm.periodDateLabel}>إلى</Text>
                  <Text style={dm.periodDateVal}>{arabicDate(figure.end_date)}</Text>
                </View>
              </View>
            </Animated.View>

            {/* كلمة التكريم */}
            {!!figure.tribute && (
              <Animated.View entering={FadeInDown.delay(200).springify()} style={dm.tributeCard}>
                <View style={dm.tributeHeader}>
                  <MaterialCommunityIcons name="format-quote-open" size={20} color={GOLD} />
                  <Text style={dm.tributeTitle}>كلمة التكريم</Text>
                </View>
                <View style={dm.tributeAccentLine} />
                <Text style={dm.tributeText}>{figure.tribute}</Text>
              </Animated.View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════
// الشاشة الرئيسية
// ══════════════════════════════════════════════════════════════
export default function HonoredScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [figures, setFigures]       = useState<Figure[]>([]);
  const [current, setCurrent]       = useState<Figure | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected]     = useState<Figure | null>(null);
  const [page, setPage]             = useState(1);
  const [total, setTotal]           = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    );
  }, []);
  const goldShim = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.4, 0.85]),
  }));

  const base = getApiUrl();

  const load = useCallback(async (p = 1, append = false) => {
    if (!base) { setLoading(false); return; }
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const res = await fetch(`${base}/api/honored-figures?page=${p}&limit=15`);
      if (res.ok) {
        const data = await res.json() as { figures: Figure[]; total: number };
        setTotal(data.total);
        if (append) setFigures(prev => [...prev, ...data.figures]);
        else {
          setFigures(data.figures);
          const cur = data.figures.find(f => f.is_current) ?? null;
          setCurrent(cur);
        }
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, [base]);

  useEffect(() => { load(1); }, [load]);

  const onRefresh = () => { setRefreshing(true); setPage(1); load(1); };
  const loadMore  = () => {
    if (loadingMore || figures.length >= total) return;
    const next = page + 1;
    setPage(next);
    load(next, true);
  };

  const previous = figures.filter(f => !f.is_current);
  const grouped  = groupByYear(previous);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ══ الرأس ══ */}
      <View style={s.header}>
        {/* خلفية ذهبية شيمر */}
        <Animated.View style={[StyleSheet.absoluteFill, goldShim]} pointerEvents="none">
          <LinearGradient
            colors={[GOLD_DIM + "00", GOLD + "14", GOLD_DIM + "00"]}
            start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        <Animated.View entering={FadeIn.delay(50)} style={s.headerCenter}>
          <LinearGradient colors={[GOLD + "22", GOLD_DIM + "10"]} style={s.trophyWrap}>
            <Ionicons name="trophy" size={30} color={GOLD} />
          </LinearGradient>
          <Text style={s.headerTitle}>قاعة التكريم</Text>
          <Text style={s.headerSub}>أبطال الحصاحيصا عبر الزمن</Text>
        </Animated.View>

        {/* شريط ذهبي سفلي */}
        <View style={s.headerDivider}>
          <LinearGradient
            colors={[GOLD_DIM + "00", GOLD, AMBER, GOLD, GOLD_DIM + "00"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ height: 2, flex: 1 }}
          />
        </View>
      </View>

      {/* ══ المحتوى ══ */}
      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={s.loaderText}>جارٍ التحميل...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32, gap: 0 }}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 100) loadMore();
          }}
          scrollEventThrottle={300}
        >
          {/* ─ المكرَّم الحالي ─ */}
          {current ? (
            <Animated.View entering={FadeInDown.delay(80).springify()}>
              <TouchableOpacity
                onPress={() => setSelected(current)}
                activeOpacity={0.92}
              >
                <View style={s.sectionHeader}>
                  <View style={s.sectionLine} />
                  <View style={s.sectionChip}>
                    <Ionicons name="star" size={12} color="#1A0F00" />
                    <Text style={s.sectionChipText}>المكرَّم الحالي</Text>
                    <Ionicons name="star" size={12} color="#1A0F00" />
                  </View>
                  <View style={s.sectionLine} />
                </View>
                <HonorCard figure={current} />
                <Text style={s.tapHint}>اضغط لعرض التفاصيل الكاملة</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.delay(100)} style={s.noCurrentCard}>
              <Ionicons name="trophy-outline" size={36} color={GOLD_DIM} />
              <Text style={s.noCurrentText}>لا يوجد مكرَّم حالي</Text>
            </Animated.View>
          )}

          {/* ─ سجل المكرّمين ─ */}
          {previous.length > 0 && (
            <Animated.View entering={FadeInDown.delay(160).springify()} style={s.prevSection}>
              <View style={s.prevHeader}>
                <MaterialCommunityIcons name="book-open-page-variant" size={16} color={GOLD} />
                <Text style={s.prevTitle}>سجل المكرّمين</Text>
                <View style={s.prevCount}>
                  <Text style={s.prevCountText}>{total}</Text>
                </View>
              </View>

              {Object.entries(grouped).map(([year, list]) => (
                <View key={year} style={s.yearGroup}>
                  {/* رأس السنة */}
                  <View style={s.yearHeader}>
                    <View style={s.yearLine} />
                    <View style={s.yearBadge}>
                      <Text style={s.yearText}>{year}</Text>
                    </View>
                    <View style={s.yearLine} />
                  </View>
                  {list.map((f, i) => (
                    <FigureCard key={f.id} figure={f} index={i} onPress={setSelected} />
                  ))}
                </View>
              ))}

              {loadingMore && (
                <View style={s.loadMoreRow}>
                  <ActivityIndicator size="small" color={GOLD} />
                  <Text style={s.loadMoreText}>جارٍ التحميل...</Text>
                </View>
              )}

              {figures.length >= total && total > 0 && (
                <Animated.View entering={FadeIn} style={s.endBanner}>
                  <Ionicons name="trophy" size={14} color={GOLD_DIM} />
                  <Text style={s.endText}>هذا هو السجل الكامل للمكرَّمين</Text>
                  <Ionicons name="trophy" size={14} color={GOLD_DIM} />
                </Animated.View>
              )}
            </Animated.View>
          )}

          {figures.length === 0 && !loading && (
            <Animated.View entering={FadeIn.delay(200)} style={s.emptyWrap}>
              <Ionicons name="trophy-outline" size={54} color={GOLD_DIM + "60"} />
              <Text style={s.emptyTitle}>قاعة التكريم فارغة</Text>
              <Text style={s.emptySub}>لم يُضف المشرفون أي شخصية مكرَّمة بعد</Text>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* مودال التفاصيل */}
      {selected && (
        <DetailModal figure={selected} onClose={() => setSelected(null)} />
      )}
    </View>
  );
}

// ── تجميع حسب السنة ─────────────────────────────────────────
function groupByYear(list: Figure[]): Record<string, Figure[]> {
  return list.reduce((acc, f) => {
    const y = arabicYear(f.start_date);
    if (!acc[y]) acc[y] = [];
    acc[y].push(f);
    return acc;
  }, {} as Record<string, Figure[]>);
}

// ══════════════════════════════════════════════════════════════
// الأنماط — الشاشة الرئيسية
// ══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050E04" },

  /* الرأس */
  header: {
    paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8,
    backgroundColor: "#050E04", gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.cardBg + "80",
    justifyContent: "center", alignItems: "center",
  },
  headerCenter: { alignItems: "center", gap: 8 },
  trophyWrap: {
    width: 64, height: 64, borderRadius: 20,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1.5, borderColor: GOLD + "35",
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 26,
    color: GOLD_LITE, letterSpacing: 1,
  },
  headerSub: {
    fontFamily: "Cairo_400Regular", fontSize: 13,
    color: GOLD_DIM, letterSpacing: 0.3,
  },
  headerDivider: { paddingHorizontal: 32 },

  /* لودر */
  loader: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14 },
  loaderText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: GOLD_DIM },

  /* المكرَّم الحالي */
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, marginBottom: 12, marginTop: 8,
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: GOLD + "30" },
  sectionChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
  },
  sectionChipText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#1A0F00" },
  tapHint: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: GOLD_DIM,
    textAlign: "center", marginTop: 8, marginBottom: 4, opacity: 0.7,
  },
  noCurrentCard: {
    alignItems: "center", gap: 10, paddingVertical: 36,
    marginHorizontal: 16,
  },
  noCurrentText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: GOLD_DIM },

  /* سجل المكرّمين */
  prevSection: { paddingTop: 16 },
  prevHeader: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    paddingHorizontal: 16, marginBottom: 12,
  },
  prevTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: GOLD_LITE, flex: 1 },
  prevCount: {
    backgroundColor: GOLD + "22", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: GOLD + "35",
  },
  prevCountText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: GOLD },

  /* مجموعة سنوية */
  yearGroup: { marginBottom: 8 },
  yearHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, marginVertical: 10,
  },
  yearLine: { flex: 1, height: 1, backgroundColor: GOLD_DIM + "30" },
  yearBadge: {
    backgroundColor: GOLD_DIM + "22", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 3,
    borderWidth: 1, borderColor: GOLD_DIM + "40",
  },
  yearText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: GOLD_DIM },

  /* لود المزيد */
  loadMoreRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 16,
  },
  loadMoreText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: GOLD_DIM },

  /* نهاية القائمة */
  endBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 20,
  },
  endText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: GOLD_DIM, opacity: 0.7 },

  /* فارغ */
  emptyWrap: { alignItems: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: GOLD_DIM },
  emptySub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
});

// ══════════════════════════════════════════════════════════════
// أنماط بطاقة المكرَّم الصغيرة
// ══════════════════════════════════════════════════════════════
const fc = StyleSheet.create({
  card: {
    flexDirection: "row-reverse", alignItems: "center", gap: 14,
    marginHorizontal: 12, marginBottom: 6,
    backgroundColor: "#0A180A", borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: GOLD + "18",
  },
  avatarWrap: {
    width: 58, height: 58, borderRadius: 16,
    position: "relative", justifyContent: "center", alignItems: "center",
  },
  currentRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16, borderWidth: 2, borderColor: GOLD,
    zIndex: 1,
  },
  avatar: {
    width: 54, height: 54, borderRadius: 14,
    backgroundColor: Colors.cardBg,
  },
  starBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 6,
    backgroundColor: GOLD, justifyContent: "center", alignItems: "center",
    zIndex: 2,
  },
  info: { flex: 1, gap: 3, alignItems: "flex-end" },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#FFFFFF" },
  currentBadge: {
    backgroundColor: GOLD + "22", borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: GOLD + "40",
  },
  currentBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: GOLD },
  title: { fontFamily: "Cairo_500Medium", fontSize: 12, color: GOLD_LITE },
  role:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  dateRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 2 },
  date:  { fontFamily: "Cairo_400Regular", fontSize: 10, color: GOLD_DIM },
});

// ══════════════════════════════════════════════════════════════
// أنماط مودال التفاصيل
// ══════════════════════════════════════════════════════════════
const dm = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050E04" },
  header: {
    paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: "row", alignItems: "center", gap: 12,
    overflow: "hidden",
  },
  headerDecor: { ...StyleSheet.absoluteFillObject },
  closeBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: Colors.cardBg + "80",
    justifyContent: "center", alignItems: "center",
  },
  headerContent: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: GOLD },
  photoWrap: { width: W, height: W * 0.72, position: "relative", overflow: "hidden" },
  photo: { width: "100%", height: "100%", backgroundColor: Colors.cardBg },
  currentChip: { position: "absolute", top: 16, alignSelf: "center" },
  currentChipGrad: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
  },
  currentChipText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#1A0F00" },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 18 },
  nameSection: { alignItems: "center", gap: 8 },
  name: {
    fontFamily: "Cairo_700Bold", fontSize: 26, color: "#FFFFFF",
    textAlign: "center", lineHeight: 34,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%" },
  titleLine: { flex: 1, height: 1, backgroundColor: GOLD + "50" },
  titleText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: GOLD_LITE },
  role: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  periodCard: {
    backgroundColor: "#0A180A", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: GOLD + "25", gap: 12,
  },
  periodRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  periodLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: GOLD },
  periodDates: { flexDirection: "row-reverse", alignItems: "center", gap: 0 },
  periodDate: { flex: 1, alignItems: "center", gap: 4 },
  periodDateLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  periodDateVal: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: GOLD_LITE, textAlign: "center" },
  periodSep: { paddingHorizontal: 8 },
  tributeCard: {
    backgroundColor: GOLD + "08", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: GOLD + "25", gap: 12,
  },
  tributeHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  tributeTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: GOLD },
  tributeAccentLine: { height: 1, backgroundColor: GOLD + "30" },
  tributeText: {
    fontFamily: "Cairo_400Regular", fontSize: 14,
    color: Colors.textSecondary, lineHeight: 24, textAlign: "right",
  },
});
