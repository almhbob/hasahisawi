import React, { useEffect } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
  ZoomIn,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type HonoredFigure = {
  id: number;
  name: string;
  title: string;
  city_role: string;
  photo_url: string;
  tribute: string;
  start_date: string;
  end_date: string;
};

const { width } = Dimensions.get("window");

const GOLD      = "#D4AF37";
const GOLD_LITE = "#F5C842";
const GOLD_DIM  = "#A08820";
const AMBER     = "#F59E0B";

function daysLeft(end: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((endDate.getTime() - now.getTime()) / 86400000));
}

function formatArabicDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-SD", { day: "numeric", month: "long", year: "numeric" });
}

type Props = { figure: HonoredFigure };

export default function HonorCard({ figure }: Props) {
  const shimmer = useSharedValue(0);
  const pulse   = useSharedValue(1);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.00, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const borderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.55, 1]),
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [1, 1.06], [1, 1.06]) }],
  }));

  const days = daysLeft(figure.end_date);

  return (
    <Animated.View entering={FadeInDown.delay(80).springify().damping(16)} style={s.outerWrap}>
      {/* ── Gold shimmer border ── */}
      <Animated.View style={[StyleSheet.absoluteFill, s.borderWrap, borderStyle]} pointerEvents="none">
        <LinearGradient
          colors={[GOLD_DIM, GOLD, GOLD_LITE, AMBER, GOLD_DIM]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* ── Inner card ── */}
      <View style={s.card}>
        {/* ── Photo section ── */}
        <View style={s.photoWrap}>
          <Image
            source={{ uri: figure.photo_url }}
            style={s.photo}
            resizeMode="cover"
          />
          {/* Top vignette */}
          <LinearGradient
            colors={["rgba(10,20,8,0.15)", "transparent"]}
            locations={[0, 0.4]}
            style={[StyleSheet.absoluteFill, { borderRadius: 0 }]}
          />
          {/* Bottom overlay: name + title */}
          <LinearGradient
            colors={["transparent", "rgba(6,14,5,0.65)", "rgba(6,14,5,0.93)", "#060E05"]}
            locations={[0.28, 0.58, 0.78, 1]}
            style={s.photoOverlay}
          >
            {/* Badge */}
            <Animated.View style={[s.badge, badgeStyle]}>
              <LinearGradient
                colors={[GOLD, AMBER, GOLD_DIM]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.badgeGrad}
              >
                <Ionicons name="star" size={10} color="#1A0F00" />
                <Text style={s.badgeText}>شخصية المدينة</Text>
                <Ionicons name="star" size={10} color="#1A0F00" />
              </LinearGradient>
            </Animated.View>

            {/* Name */}
            <Text style={s.name}>{figure.name}</Text>
            {/* Title */}
            {!!figure.title && (
              <View style={s.titleRow}>
                <View style={s.titleLine} />
                <Text style={s.title}>{figure.title}</Text>
                <View style={s.titleLine} />
              </View>
            )}
            {!!figure.city_role && (
              <Text style={s.role}>{figure.city_role}</Text>
            )}
          </LinearGradient>
        </View>

        {/* ── Content section ── */}
        <LinearGradient
          colors={["#060E05", "#091409", "#0A1A10"]}
          style={s.content}
        >
          {/* Tribute / testimonial */}
          {!!figure.tribute && (
            <View style={s.tributeBox}>
              <View style={s.tributeAccent} />
              <View style={{ flex: 1 }}>
                <Text style={s.quoteIcon}>"</Text>
                <Text style={s.tribute}>{figure.tribute}</Text>
              </View>
            </View>
          )}

          {/* Footer row */}
          <View style={s.footer}>
            <View style={s.footerLeft}>
              <LinearGradient
                colors={[GOLD + "28", GOLD + "10"]}
                style={s.daysChip}
              >
                <Ionicons name="time-outline" size={12} color={GOLD} />
                <Text style={s.daysText}>
                  {days > 0 ? `يتبقى ${days} ${days === 1 ? "يوم" : "أيام"}` : "آخر يوم"}
                </Text>
              </LinearGradient>
            </View>

            <View style={s.hallLabel}>
              <Ionicons name="trophy" size={13} color={GOLD} />
              <Text style={s.hallText}>قاعة التكريم</Text>
            </View>
          </View>

          {/* Date range */}
          <Text style={s.dateRange}>
            {formatArabicDate(figure.start_date)} — {formatArabicDate(figure.end_date)}
          </Text>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

const CARD_W = width - 32;

const s = StyleSheet.create({
  outerWrap: {
    marginHorizontal: 16,
    borderRadius: 22,
    padding: 2,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: GOLD,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.32,
        shadowRadius: 18,
      },
      android: { elevation: 12 },
    }),
  },
  borderWrap: {
    borderRadius: 22,
    overflow: "hidden",
  },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#060E05",
  },

  /* Photo */
  photoWrap: {
    width: CARD_W - 4,
    height: 260,
    position: "relative",
    overflow: "hidden",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 18,
    paddingHorizontal: 16,
    gap: 6,
  },

  /* Badge */
  badge: {
    marginBottom: 4,
    borderRadius: 20,
    overflow: "hidden",
    alignSelf: "center",
  },
  badgeGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: "#1A0F00",
    letterSpacing: 0.5,
  },

  /* Name + Title */
  name: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    color: "#FFFFFF",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    lineHeight: 32,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  titleLine: {
    height: 1,
    flex: 1,
    backgroundColor: GOLD + "60",
  },
  title: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: GOLD_LITE,
    textAlign: "center",
  },
  role: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 2,
  },

  /* Content section */
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12,
  },

  /* Tribute */
  tributeBox: {
    flexDirection: "row-reverse",
    gap: 10,
    alignItems: "flex-start",
  },
  tributeAccent: {
    width: 3,
    borderRadius: 2,
    backgroundColor: GOLD,
    alignSelf: "stretch",
    minHeight: 36,
    opacity: 0.8,
  },
  quoteIcon: {
    fontFamily: "Cairo_700Bold",
    fontSize: 28,
    color: GOLD + "50",
    lineHeight: 22,
    marginBottom: -4,
    textAlign: "right",
  },
  tribute: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13.5,
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: "right",
  },

  /* Footer */
  footer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  daysChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD + "30",
  },
  daysText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: GOLD,
  },
  hallLabel: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
  },
  hallText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: GOLD,
    letterSpacing: 0.3,
  },

  /* Date range */
  dateRange: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: "center",
    opacity: 0.7,
    marginTop: -4,
  },
});
