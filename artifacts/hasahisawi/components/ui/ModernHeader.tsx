import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

interface ModernHeaderProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  showBack?: boolean;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  gradient?: readonly [string, string, ...string[]];
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * رأس صفحة عصري بتدرج أخضر وزوايا سفلية دائرية، يستخدم في الشاشات الفرعية
 * (الرياضة، السوق، الحساب...) بدلاً من رؤوس الصفحات المخصصة المتفرقة.
 */
export default function ModernHeader({
  title,
  subtitle,
  icon,
  showBack = false,
  onBack,
  rightSlot,
  gradient = Colors.gradients.brand,
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
    <LinearGradient
      colors={gradient as unknown as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, { paddingTop: insets.top + 12 }, style]}
    >
      <View style={styles.topRow}>
        {showBack ? (
          <TouchableOpacity onPress={handleBack} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtnGhost} />
        )}

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            {icon && (
              <View style={styles.titleIconWrap}>
                <Ionicons name={icon} size={18} color="#fff" />
              </View>
            )}
            <Text style={styles.title}>{title}</Text>
          </View>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {rightSlot ?? <View style={styles.iconBtnGhost} />}
      </View>

      {children && <View style={styles.childrenWrap}>{children}</View>}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomLeftRadius: Colors.radius.xl,
    borderBottomRightRadius: Colors.radius.xl,
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 14,
  },
  topRow: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Colors.radius.pill,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnGhost: {
    width: 36,
    height: 36,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
    alignItems: "flex-end",
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  titleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: Colors.radius.sm,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 19,
    color: "#fff",
    textAlign: "right",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12.5,
    color: "rgba(255,255,255,0.82)",
    textAlign: "right",
    lineHeight: 18,
  },
  childrenWrap: {
    marginTop: 2,
  },
});
