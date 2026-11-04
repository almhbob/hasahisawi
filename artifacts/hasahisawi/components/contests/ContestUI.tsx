// عناصر واجهة المسابقات المشتركة: العدّ التنازلي، شارات الحالة والتصنيف، الصور المتراصة،
// شريط الوقت، الهياكل أثناء التحميل، منصة التتويج، رسم الحالة الفارغة، واحتفال الإرسال.
import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Dimensions, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import UserAvatar from "@/components/UserAvatar";
import { CATEGORIES, countdownParts, type ContestCategory, type ContestState } from "@/lib/contests";

// ── العدّ التنازلي ───────────────────────────────────────────────
export function Countdown({ to, now, tone = "light", compact }: { to: string; now: number; tone?: "light" | "dark"; compact?: boolean }) {
  const p = countdownParts(to, now);
  const units: [number, string][] = [[p.days, "يوم"], [p.hours, "ساعة"], [p.minutes, "دقيقة"], [p.seconds, "ثانية"]];
  const onDark = tone === "light";
  return (
    <View
      style={[cd.row, compact && { gap: 6 }]}
      accessibilityRole="timer"
      accessibilityLabel={`متبقٍ ${p.days} يوم و${p.hours} ساعة و${p.minutes} دقيقة`}
    >
      {units.map(([n, l]) => (
        <View key={l} style={[cd.box, compact && cd.boxCompact, onDark ? cd.boxOnDark : cd.boxOnLight]}>
          <Text style={[cd.num, compact && { fontSize: 20, lineHeight: 28 }, { color: onDark ? "#FFFFFF" : Colors.text }]}>{String(n).padStart(2, "0")}</Text>
          <Text style={[cd.unit, { color: onDark ? "rgba(255,255,255,0.88)" : Colors.textSecondary }]}>{l}</Text>
        </View>
      ))}
    </View>
  );
}
const cd = StyleSheet.create({
  row: { flexDirection: "row-reverse", gap: 8 },
  box: { flex: 1, borderRadius: 16, paddingVertical: 8, alignItems: "center", minWidth: 58 },
  boxCompact: { borderRadius: 12, paddingVertical: 4, minWidth: 48 },
  boxOnDark: { backgroundColor: "rgba(0,0,0,0.28)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  boxOnLight: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border },
  num: { fontFamily: "Cairo_700Bold", fontSize: 26, lineHeight: 36, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },
});

// ── شارة الحالة ──────────────────────────────────────────────────
const STATE_STYLE: Record<ContestState, { bg: string; fg: string; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  active: { bg: "#DCFCE7", fg: "#14532D", label: "جارية", icon: "radio-button-on" },
  upcoming: { bg: "#FEF3C7", fg: "#78350F", label: "قادمة", icon: "time-outline" },
  ended: { bg: "#E5E7EB", fg: "#1F2937", label: "منتهية", icon: "flag-outline" },
};
export function StatusPill({ state, style }: { state: ContestState; style?: StyleProp<ViewStyle> }) {
  const t = STATE_STYLE[state];
  return (
    <View style={[pill.base, { backgroundColor: t.bg }, style]}>
      {state === "active" ? <LiveDot color={t.fg} /> : <Ionicons name={t.icon} size={13} color={t.fg} />}
      <Text style={[pill.text, { color: t.fg }]}>{t.label}</Text>
    </View>
  );
}

function LiveDot({ color }: { color: string }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withSequence(withTiming(0.25, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
  }, [reduce, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, st]} />;
}

export function CategoryChip({ category, onDark, style }: { category?: ContestCategory | null; onDark?: boolean; style?: StyleProp<ViewStyle> }) {
  if (!category || !CATEGORIES[category]) return null;
  const c = CATEGORIES[category];
  return (
    <View style={[pill.base, onDark ? pill.onDark : { backgroundColor: Colors.primarySoft }, style]}>
      <Ionicons name={c.icon as any} size={13} color={onDark ? "#FFFFFF" : Colors.primaryDeep} />
      <Text style={[pill.text, { color: onDark ? "#FFFFFF" : Colors.primaryDeep }]}>{c.label}</Text>
    </View>
  );
}

export function SponsorChip({ name, logo, onDark }: { name: string; logo?: string | null; onDark?: boolean }) {
  return (
    <View style={[pill.base, onDark ? pill.onDark : { backgroundColor: Colors.accentSoft }, { maxWidth: "100%" }]}>
      {logo ? (
        <Image source={{ uri: logo }} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFFFFF" }} contentFit="cover" accessibilityLabel={`شعار ${name}`} />
      ) : (
        <Ionicons name="ribbon-outline" size={13} color={onDark ? "#FFFFFF" : Colors.accentDeep} />
      )}
      <Text style={[pill.text, { color: onDark ? "#FFFFFF" : Colors.accentDeep, flexShrink: 1 }]} numberOfLines={1}>برعاية {name}</Text>
    </View>
  );
}

const pill = StyleSheet.create({
  base: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, minHeight: 26, borderRadius: 999, alignSelf: "flex-start" },
  onDark: { backgroundColor: "rgba(0,0,0,0.30)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  text: { fontFamily: "Cairo_700Bold", fontSize: 12 },
});

// ── صور المشاركين المتراصة ───────────────────────────────────────
export function AvatarStack({ people, total, onDark, size = 28 }: {
  people: { user_id: number; name: string; avatar_url: string | null }[]; total: number; onDark?: boolean; size?: number;
}) {
  const shown = people.slice(0, 4);
  const label = total === 0 ? "كن أول المشاركين" : total === 1 ? "مشارك واحد" : total === 2 ? "مشاركان" : `${total} مشارك`;
  return (
    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }} accessibilityLabel={label}>
      {shown.length > 0 && (
        <View style={{ flexDirection: "row-reverse" }}>
          {shown.map((p, i) => (
            <View key={p.user_id} style={{ marginRight: i === 0 ? 0 : -size * 0.32, borderRadius: size / 2 + 2, borderWidth: 2, borderColor: onDark ? "rgba(0,0,0,0.35)" : Colors.cardBg }}>
              <UserAvatar name={p.name} avatarUrl={p.avatar_url} size={size} borderRadius={size / 2} />
            </View>
          ))}
        </View>
      )}
      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: onDark ? "#FFFFFF" : Colors.textSecondary }}>{label}</Text>
    </View>
  );
}

// ── شريط الوقت المنقضي ───────────────────────────────────────────
export function TimeBar({ ratio, onDark, color }: { ratio: number; onDark?: boolean; color?: string }) {
  const pct = Math.round(ratio * 100);
  return (
    <View
      style={{ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: onDark ? "rgba(255,255,255,0.22)" : Colors.border, flexDirection: "row-reverse" }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      accessibilityLabel={`انقضى ${pct}٪ من وقت المسابقة`}
    >
      <View style={{ width: `${pct}%`, backgroundColor: color ?? (onDark ? "#FFFFFF" : Colors.primary), borderRadius: 3 }} />
    </View>
  );
}

// ── هيكل التحميل ─────────────────────────────────────────────────
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.55, { duration: 650 })), -1);
  }, [reduce, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ backgroundColor: Colors.border, borderRadius: 12 }, style, st]} />;
}

export function ContestsSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, gap: 14 }} accessibilityLabel="جارٍ تحميل المسابقات">
      <Skeleton style={{ height: 230, borderRadius: 26 }} />
      <View style={{ flexDirection: "row-reverse", gap: 10 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} style={{ width: 150, height: 112, borderRadius: 18 }} />)}
      </View>
      <Skeleton style={{ height: 44, borderRadius: 14 }} />
      {[0, 1].map((i) => <Skeleton key={i} style={{ height: 190, borderRadius: 22 }} />)}
    </View>
  );
}

// ── منصة التتويج ─────────────────────────────────────────────────
const PODIUM = [
  { h: 92, bg: "#F2C94C", fg: "#3B2A00", ring: "#E8A900", icon: "trophy" as const },
  { h: 68, bg: "#CBD5E1", fg: "#1F2937", ring: "#94A3B8", icon: "medal" as const },
  { h: 52, bg: "#E3B583", fg: "#3B2410", ring: "#C08348", icon: "medal" as const },
];
export type PodiumItem = { user_id: number; name: string; avatar_url: string | null; rank: number; sub?: string | null };
export function Podium({ items, onPress, onDark }: { items: PodiumItem[]; onPress?: (userId: number) => void; onDark?: boolean }) {
  const byRank = (r: number) => items.find((i) => i.rank === r);
  // ترتيب العرض من اليمين: الثاني، الأول، الثالث
  const order = [2, 1, 3].map(byRank);
  return (
    <View style={{ flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "center", gap: 8 }}>
      {order.map((it, idx) => {
        const rank = [2, 1, 3][idx];
        const t = PODIUM[rank - 1];
        if (!it) return <View key={rank} style={{ flex: 1 }} />;
        const big = rank === 1;
        return (
          <View key={rank} style={{ flex: 1, alignItems: "center", gap: 6 }}>
            {big && <Ionicons name="star" size={18} color={onDark ? "#FDE68A" : Colors.accentDeep} />}
            <Pressable
              style={{ borderWidth: 3, borderColor: t.ring, borderRadius: 999, padding: 2 }}
              onPress={onPress ? () => onPress(it.user_id) : undefined}
              disabled={!onPress}
              accessibilityRole={onPress ? "button" : undefined}
              accessibilityLabel={`${it.name}، المركز ${rank}`}
              hitSlop={6}
            >
              <UserAvatar name={it.name} avatarUrl={it.avatar_url} size={big ? 64 : 50} borderRadius={999} />
            </Pressable>
            <Text style={[pod.name, { color: onDark ? "#FFFFFF" : Colors.text }]} numberOfLines={2}>{it.name}</Text>
            {it.sub ? <Text style={[pod.sub, { color: onDark ? "rgba(255,255,255,0.88)" : Colors.textSecondary }]} numberOfLines={2}>{it.sub}</Text> : null}
            <View style={[pod.block, { height: t.h, backgroundColor: t.bg }]}>
              <Ionicons name={t.icon} size={16} color={t.fg} />
              <Text style={[pod.rank, { color: t.fg }]}>{rank}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
const pod = StyleSheet.create({
  name: { fontFamily: "Cairo_700Bold", fontSize: 13, textAlign: "center", lineHeight: 20 },
  sub: { fontFamily: "Cairo_600SemiBold", fontSize: 12, textAlign: "center", lineHeight: 18 },
  block: { alignSelf: "stretch", borderTopLeftRadius: 14, borderTopRightRadius: 14, alignItems: "center", justifyContent: "center", gap: 0 },
  rank: { fontFamily: "Cairo_700Bold", fontSize: 20, lineHeight: 26 },
});

// ── رسم الحالة الفارغة (تركيب أيقونات) ───────────────────────────
export function EmptyArt({ icon = "trophy", accent = Colors.accent }: { icon?: keyof typeof Ionicons.glyphMap; accent?: string }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.value = withRepeat(withSequence(withTiming(-6, { duration: 1400, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) })), -1);
  }, [reduce, y]);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={art.wrap} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[art.ring, { width: 150, height: 150, borderColor: Colors.primary + "22" }]} />
      <View style={[art.ring, { width: 112, height: 112, borderColor: Colors.primary + "33" }]} />
      <Animated.View style={[art.core, float]}>
        <Ionicons name={icon} size={42} color="#FFFFFF" />
      </Animated.View>
      <View style={[art.sat, { top: 8, right: 22, backgroundColor: Colors.accentSoft }]}><Ionicons name="star" size={16} color={Colors.accentDeep} /></View>
      <View style={[art.sat, { bottom: 14, left: 14, backgroundColor: Colors.primarySoft }]}><Ionicons name="calendar" size={16} color={Colors.primaryDeep} /></View>
      <View style={[art.sat, { top: 40, left: 2, backgroundColor: Colors.accentSoft }]}><Ionicons name="gift" size={15} color={accent === Colors.accent ? Colors.accentDeep : accent} /></View>
    </View>
  );
}
const art = StyleSheet.create({
  wrap: { width: 170, height: 160, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  ring: { position: "absolute", borderRadius: 999, borderWidth: 2 },
  core: { width: 82, height: 82, borderRadius: 28, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-6deg" }] },
  sat: { position: "absolute", width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});

// ── احتفال (قصاصات ملونة) عند الإرسال ────────────────────────────
const CONFETTI_COLORS = ["#E8A900", "#00966A", "#F2C94C", "#4EC99D", "#FFFFFF", "#D93636"];
function Piece({ seed, height }: { seed: number; height: number }) {
  const rnd = (n: number) => { const x = Math.sin(seed * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
  const W = Dimensions.get("window").width;
  const startX = rnd(1) * W;
  const drift = (rnd(2) - 0.5) * 160;
  const size = 7 + rnd(3) * 7;
  const dur = 1700 + rnd(4) * 1100;
  const delay = rnd(5) * 400;
  const p = useSharedValue(0);
  useEffect(() => { p.value = withDelay(delay, withTiming(1, { duration: dur, easing: Easing.out(Easing.quad) })); }, [p, delay, dur]);
  const st = useAnimatedStyle(() => ({
    opacity: p.value < 0.85 ? 1 : (1 - p.value) / 0.15,
    transform: [
      { translateX: startX + drift * p.value },
      { translateY: -30 + (height + 60) * p.value },
      { rotate: `${p.value * (rnd(6) > 0.5 ? 540 : -540)}deg` },
    ],
  }));
  return <Animated.View style={[{ position: "absolute", top: 0, left: 0, width: size, height: size * 0.45, borderRadius: 2, backgroundColor: CONFETTI_COLORS[seed % CONFETTI_COLORS.length] }, st]} />;
}
export function Confetti({ run, count = 36 }: { run: number; count?: number }) {
  const reduce = useReducedMotion();
  const H = Dimensions.get("window").height;
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => i + run * 100), [run, count]);
  if (!run || reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {seeds.map((s) => <Piece key={s} seed={s} height={H} />)}
    </View>
  );
}
