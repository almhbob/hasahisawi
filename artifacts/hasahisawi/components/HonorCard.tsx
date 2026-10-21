import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
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
  const days = daysLeft(figure.end_date);

  return (
    <Animated.View entering={FadeInDown.delay(80).springify().damping(16)} style={s.card}>
      {/* ── Photo ── */}
      <View style={s.photoWrap}>
        <Image
          source={{ uri: figure.photo_url }}
          style={s.photo}
          resizeMode="cover"
        />
        <View style={s.badge}>
          <Ionicons name="star" size={10} color="#fff" />
          <Text style={s.badgeText}>شخصية المدينة</Text>
          <Ionicons name="star" size={10} color="#fff" />
        </View>
      </View>

      {/* ── Content ── */}
      <View style={s.content}>
        <View style={s.nameBlock}>
          <Text style={s.name}>{figure.name}</Text>
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
        </View>

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
            <View style={s.daysChip}>
              <Ionicons name="time-outline" size={12} color={Colors.accentDeep} />
              <Text style={s.daysText}>
                {days > 0 ? `يتبقى ${days} ${days === 1 ? "يوم" : "أيام"}` : "آخر يوم"}
              </Text>
            </View>
          </View>

          <View style={s.hallLabel}>
            <Ionicons name="trophy" size={13} color={Colors.accentDeep} />
            <Text style={s.hallText}>قاعة التكريم</Text>
          </View>
        </View>

        {/* Date range */}
        <Text style={s.dateRange}>
          {formatArabicDate(figure.start_date)} — {formatArabicDate(figure.end_date)}
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: Colors.radius.lg,
    overflow: "hidden",
    backgroundColor: Colors.cardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },

  /* Photo */
  photoWrap: {
    width: "100%",
    height: 260,
    position: "relative",
    overflow: "hidden",
    backgroundColor: Colors.bg,
  },
  photo: {
    width: "100%",
    height: "100%",
  },

  /* Badge */
  badge: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Colors.radius.pill,
    backgroundColor: Colors.accentDeep,
  },
  badgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: "#fff",
    letterSpacing: 0.5,
  },

  /* Content section */
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12,
  },

  /* Name + Title */
  nameBlock: { alignItems: "center", gap: 4 },
  name: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: Colors.textPrimary,
    textAlign: "center",
    lineHeight: 32,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
  },
  titleLine: {
    height: StyleSheet.hairlineWidth,
    flex: 1,
    backgroundColor: Colors.border,
  },
  title: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.accentDeep,
    textAlign: "center",
  },
  role: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
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
    backgroundColor: Colors.accent,
    alignSelf: "stretch",
    minHeight: 36,
  },
  quoteIcon: {
    fontFamily: "Cairo_700Bold",
    fontSize: 28,
    color: Colors.accentDeep,
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
    borderRadius: Colors.radius.pill,
    backgroundColor: Colors.accentSoft,
  },
  daysText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: Colors.accentDeep,
  },
  hallLabel: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
  },
  hallText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: Colors.accentDeep,
    letterSpacing: 0.3,
  },

  /* Date range */
  dateRange: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: -4,
  },
});
