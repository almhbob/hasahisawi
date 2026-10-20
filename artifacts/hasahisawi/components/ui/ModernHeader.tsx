import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

interface ModernHeaderProps {
  title: string;
  subtitle?: string;
  /** Kept for API compatibility; the light header shows no title icon. */
  icon?: keyof typeof Ionicons.glyphMap;
  showBack?: boolean;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  /** Deprecated: headers are always the light surface now. Ignored. */
  gradient?: readonly [string, string, ...string[]];
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Light large-title header used by every sub-screen.
 * White surface, ink title, hairline divider. Controls placed in `rightSlot`
 * or `children` should use the `headerUI` primitives below so every screen
 * looks the same.
 */
export default function ModernHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightSlot,
  children,
  style,
}: ModernHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 10 }, style]}>
      {/* Child order matches the previous header (back · title · actions) so
          placement stays identical under both forced-RTL native and web. */}
      <View style={styles.topRow}>
        {showBack && (
          <TouchableOpacity
            onPress={handleBack}
            style={headerUI.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="رجوع"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {rightSlot ? <View style={styles.actions}>{rightSlot}</View> : null}
      </View>
      {children ? <View style={styles.childrenWrap}>{children}</View> : null}
    </View>
  );
}

const H = Colors.header;

/** Shared building blocks for controls placed inside ModernHeader. */
export const headerUI = StyleSheet.create({
  /** Round neutral icon button (bell, filter, share…). Icon color: Colors.textPrimary, size 20. */
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: H.control,
    alignItems: "center", justifyContent: "center",
  },
  /** Filled primary action ("إضافة", "نشر"). Icon/text color: "#fff". */
  primaryBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    height: 38, paddingHorizontal: 14, borderRadius: 19,
    backgroundColor: Colors.primaryDeep,
  },
  primaryBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: "#fff" },
  /** Quiet secondary action with text. Icon/text color: Colors.textPrimary. */
  secondaryBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    height: 38, paddingHorizontal: 14, borderRadius: 19,
    backgroundColor: H.control,
  },
  secondaryBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 13.5, color: Colors.textPrimary },
  /** Horizontal filter chips. */
  chip: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    height: 34, paddingHorizontal: 14, borderRadius: 17,
    backgroundColor: H.control,
  },
  chipActive: { backgroundColor: Colors.primaryDeep },
  chipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  chipTextActive: { color: "#fff", fontFamily: "Cairo_600SemiBold" },
  /** Segmented control: wrap > segment(s). */
  segmentWrap: {
    flexDirection: "row-reverse", padding: 3, gap: 3,
    borderRadius: 12, backgroundColor: H.control,
  },
  segment: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
    height: 36, borderRadius: 9,
  },
  segmentActive: { backgroundColor: "#fff", ...Colors.shadow.card },
  segmentText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  segmentTextActive: { color: Colors.textPrimary, fontFamily: "Cairo_700Bold" },
  /** Search field. Icon color: Colors.textMuted. */
  search: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    height: 44, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: H.control,
  },
  searchInput: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14,
    color: Colors.textPrimary, textAlign: "right", paddingVertical: 0,
  },
  /** Small count badge. */
  badge: {
    minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11,
    backgroundColor: Colors.primarySoft, alignItems: "center", justifyContent: "center",
  },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.primaryDeep },
  /** Live/status pill (e.g. "مباشر"). */
  statusPill: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: Colors.primarySoft,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primary },
  statusText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.primaryDeep },
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: H.bg,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: H.divider,
  },
  topRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },
  titleBlock: { flex: 1, alignItems: "flex-end", gap: 2 },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    lineHeight: 34,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
    textAlign: "right",
  },
  actions: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  childrenWrap: {},
});
