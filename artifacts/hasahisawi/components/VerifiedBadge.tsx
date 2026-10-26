// شارة «موثوق» — تظهر بجانب أسماء الحسابات الموثّقة
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const VERIFIED_BLUE = "#1D9BF0";

export default function VerifiedBadge({ size = 16, label, compact = true }: { size?: number; label?: string | null; compact?: boolean }) {
  if (compact) {
    return (
      <View accessibilityLabel="حساب موثوق" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="checkmark-circle" size={size} color={VERIFIED_BLUE} />
      </View>
    );
  }
  return (
    <View style={st.pill} accessibilityLabel="حساب موثوق">
      <Ionicons name="shield-checkmark" size={12} color="#fff" />
      <Text style={st.text}>{label || "موثوق"}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  pill: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: VERIFIED_BLUE, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  text: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },
});
