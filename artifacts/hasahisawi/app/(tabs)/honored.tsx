import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image, Modal,
  Dimensions, Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Animated, {
  FadeIn, FadeInDown, FadeInUp, ZoomIn,
} from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import HonorCard, { HonoredFigure } from "@/components/HonorCard";
import OrgInviteCard from "@/components/OrgInviteCard";
import ModernHeader, { headerUI } from "@/components/ui/ModernHeader";


// ── ألوان التكريم (ذهبي النظام للإبراز فقط) ─────────────────────
const GOLD      = Colors.accentDeep;
const GOLD_SOFT = Colors.accentSoft;
const MUTED     = Colors.textMuted;

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
              <Ionicons name="star" size={9} color="#fff" />
            </View>
          )}
        </View>

        {/* المعلومات */}
        <View style={fc.info}>
          <View style={fc.nameRow}>
            <Text style={fc.name} numberOfLines={2}>{figure.name}</Text>
            {figure.is_current && (
              <View style={fc.currentBadge}>
                <Text style={fc.currentBadgeText}>المكرَّم الحالي</Text>
              </View>
            )}
          </View>
          {!!figure.title && (
            <Text style={fc.title} numberOfLines={2}>{figure.title}</Text>
          )}
          {!!figure.city_role && (
            <Text style={fc.role} numberOfLines={2}>{figure.city_role}</Text>
          )}
          <View style={fc.dateRow}>
            <Ionicons name="calendar-outline" size={11} color={MUTED} />
            <Text style={fc.date}>
              {arabicDate(figure.start_date)} — {arabicDate(figure.end_date)}
            </Text>
          </View>
        </View>

        <Ionicons name="chevron-back" size={18} color={MUTED} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ══════════════════════════════════════════════════════════════
// مكوّن: مودال التفاصيل الكاملة
// ══════════════════════════════════════════════════════════════
function DetailModal({ figure, onClose }: { figure: Figure; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" transparent={false} visible onRequestClose={onClose}>
      <StatusBar style="dark" />
      <View style={dm.root}>
        {/* الرأس */}
        <ModernHeader
          title="قاعة التكريم"
          icon="trophy"
          rightSlot={
            <TouchableOpacity onPress={onClose} style={headerUI.iconBtn} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          }
        />

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
            {figure.is_current && (
              <Animated.View entering={ZoomIn.springify()} style={dm.currentChip}>
                <View style={dm.currentChipGrad}>
                  <Ionicons name="star" size={11} color="#fff" />
                  <Text style={dm.currentChipText}>المكرَّم الحالي</Text>
                  <Ionicons name="star" size={11} color="#fff" />
                </View>
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
                  <Ionicons name="arrow-back" size={16} color={MUTED} />
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
    <View style={s.root}>

      {/* ══ الرأس ══ */}
      <ModernHeader
        title="قاعة التكريم"
        subtitle="أبطال الحصاحيصا عبر الزمن"
        icon="trophy"
        showBack
        onBack={() => router.back()}
      />

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
                    <Ionicons name="star" size={12} color="#fff" />
                    <Text style={s.sectionChipText}>المكرَّم الحالي</Text>
                    <Ionicons name="star" size={12} color="#fff" />
                  </View>
                  <View style={s.sectionLine} />
                </View>
                <HonorCard figure={current} />
                <Text style={s.tapHint}>اضغط لعرض التفاصيل الكاملة</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.delay(100)} style={s.noCurrentCard}>
              <Ionicons name="trophy-outline" size={36} color={MUTED} />
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
                  <Ionicons name="trophy" size={14} color={MUTED} />
                  <Text style={s.endText}>هذا هو السجل الكامل للمكرَّمين</Text>
                  <Ionicons name="trophy" size={14} color={MUTED} />
                </Animated.View>
              )}
            </Animated.View>
          )}

          {figures.length === 0 && !loading && (
            <Animated.View entering={FadeIn.delay(200)} style={s.emptyWrap}>
              <Ionicons name="trophy-outline" size={54} color={Colors.textSubtle} />
              <Text style={s.emptyTitle}>قاعة التكريم فارغة</Text>
              <Text style={s.emptySub}>لم يُضف المشرفون أي شخصية مكرَّمة بعد</Text>
            </Animated.View>
          )}
                <OrgInviteCard />
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
  root: { flex: 1, backgroundColor: Colors.bg },

  /* لودر */
  loader: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14 },
  loaderText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: MUTED },

  /* المكرَّم الحالي */
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, marginBottom: 12, marginTop: 16,
  },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  sectionChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 5, borderRadius: Colors.radius.pill,
  },
  sectionChipText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
  tapHint: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: MUTED,
    textAlign: "center", marginTop: 8, marginBottom: 4,
  },
  noCurrentCard: {
    alignItems: "center", gap: 10, paddingVertical: 36,
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  noCurrentText: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textSecondary },

  /* سجل المكرّمين */
  prevSection: { paddingTop: 16 },
  prevHeader: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    paddingHorizontal: 16, marginBottom: 12,
  },
  prevTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  prevCount: {
    backgroundColor: GOLD_SOFT, borderRadius: Colors.radius.pill,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  prevCountText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: GOLD },

  /* مجموعة سنوية */
  yearGroup: { marginBottom: 8 },
  yearHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, marginVertical: 10,
  },
  yearLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  yearBadge: {
    backgroundColor: Colors.header.control, borderRadius: Colors.radius.pill,
    paddingHorizontal: 12, paddingVertical: 3,
  },
  yearText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textSecondary },

  /* لود المزيد */
  loadMoreRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 16,
  },
  loadMoreText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: MUTED },

  /* نهاية القائمة */
  endBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 20,
  },
  endText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: MUTED },

  /* فارغ */
  emptyWrap: { alignItems: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  emptySub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center" },
});

// ══════════════════════════════════════════════════════════════
// أنماط بطاقة المكرَّم الصغيرة
// ══════════════════════════════════════════════════════════════
const fc = StyleSheet.create({
  card: {
    flexDirection: "row-reverse", alignItems: "center", gap: 14,
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  avatarWrap: {
    width: 58, height: 58, borderRadius: Colors.radius.lg,
    position: "relative", justifyContent: "center", alignItems: "center",
  },
  currentRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Colors.radius.lg, borderWidth: 2, borderColor: Colors.accent,
    zIndex: 1,
  },
  avatar: {
    width: 54, height: 54, borderRadius: Colors.radius.md,
    backgroundColor: Colors.bg,
  },
  starBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: Colors.radius.sm,
    backgroundColor: GOLD, justifyContent: "center", alignItems: "center",
    zIndex: 2,
  },
  info: { flex: 1, gap: 3, alignItems: "flex-end" },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  currentBadge: {
    backgroundColor: GOLD_SOFT, borderRadius: Colors.radius.sm,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  currentBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: GOLD },
  title: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  role:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  dateRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 2 },
  date:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: MUTED },
});

// ══════════════════════════════════════════════════════════════
// أنماط مودال التفاصيل
// ══════════════════════════════════════════════════════════════
const dm = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  photoWrap: { width: W, height: W * 0.72, position: "relative", overflow: "hidden", backgroundColor: Colors.cardBg },
  photo: { width: "100%", height: "100%", backgroundColor: Colors.bg },
  currentChip: { position: "absolute", top: 16, alignSelf: "center" },
  currentChipGrad: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: Colors.radius.pill,
    backgroundColor: GOLD,
  },
  currentChipText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  body: { paddingHorizontal: 16, paddingTop: 20, gap: 14 },
  nameSection: { alignItems: "center", gap: 8 },
  name: {
    fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.textPrimary,
    textAlign: "center", lineHeight: 34,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%" },
  titleLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  titleText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: GOLD },
  role: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  periodCard: {
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, gap: 12,
  },
  periodRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  periodLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  periodDates: { flexDirection: "row-reverse", alignItems: "center", gap: 0 },
  periodDate: { flex: 1, alignItems: "center", gap: 4 },
  periodDateLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  periodDateVal: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, textAlign: "center" },
  periodSep: { paddingHorizontal: 8 },
  tributeCard: {
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border, gap: 12,
  },
  tributeHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  tributeTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary },
  tributeAccentLine: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border },
  tributeText: {
    fontFamily: "Cairo_400Regular", fontSize: 14,
    color: Colors.textSecondary, lineHeight: 24, textAlign: "right",
  },
});
