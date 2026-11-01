import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { StarPattern } from "@/components/ui/Ornament";
import { isDarkTheme } from "@/constants/theme-mode";

interface Props {
  style?: ViewStyle;
  opacity?: number;
  variant?: "diagonal" | "corner" | "header";
}

// زخرفة الهوية: نجمة ثمانية (خاتم) بخطوط رفيعة — بدل «الشبكة التقنية» السابقة.
// قيم opacity القديمة صُممت لرسومات كثيفة، فنضاعفها للخطوط الرفيعة مع سقف لا يزعج القراءة.
const GOLD = "#E8B931";
const GREEN = "#0E8A5F";

export default function BrandPattern({ style, opacity = 0.045, variant = "diagonal" }: Props) {
  const strength = Math.min(variant === "header" ? 0.22 : 0.16, opacity * (variant === "header" ? 5 : 4));
  const color = isDarkTheme ? GOLD : GREEN;
  const size = variant === "corner" ? 56 : variant === "header" ? 40 : 48;
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <StarPattern color={color} opacity={strength} size={size} />
    </View>
  );
}
