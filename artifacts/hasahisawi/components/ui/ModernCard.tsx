import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ModernCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
}

/** بطاقة بيضاء بزوايا دائرية وظل ناعم، أساس كل البطاقات في التصميم العصري. */
export function ModernCard({ children, onPress, style, padded = true }: ModernCardProps) {
  const content = (
    <View style={[styles.card, padded && styles.cardPadded, style]}>
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={style}>
      <View style={[styles.card, padded && styles.cardPadded]}>{children}</View>
    </TouchableOpacity>
  );
}

interface ModernGridItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  color?: string;
  style?: ViewStyle;
}

/** عنصر شبكة بأيقونة دائرية ولقب أسفلها، مطابق لشبكة "جميع الخدمات". */
export function ModernGridItem({ icon, label, onPress, color = Colors.primary, style }: ModernGridItemProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.gridItem, style]}>
      <View style={[styles.gridIconWrap, { backgroundColor: color + "14" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.gridLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: Colors.radius.lg,
    ...Colors.shadow.card,
  },
  cardPadded: {
    padding: 16,
  },
  gridItem: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 6,
    width: "31%",
    backgroundColor: "#fff",
    borderRadius: Colors.radius.md,
    ...Colors.shadow.card,
  },
  gridIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Colors.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  gridLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12.5,
    color: Colors.textPrimary,
    textAlign: "center",
  },
});

export default ModernCard;
