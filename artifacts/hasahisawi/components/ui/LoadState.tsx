import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

/**
 * Shared loading / error states.
 *
 * Many screens used to swallow network errors and then render their empty state
 * ("لا توجد مواعيد"), so users on a slow or failed connection were told they had
 * no data. Render <LoadError onRetry={...}/> when a request fails instead.
 */

export function LoadError({
  onRetry,
  message = "تعذّر تحميل البيانات",
  hint = "تحقق من اتصالك بالإنترنت ثم أعد المحاولة",
}: {
  onRetry: () => void;
  message?: string;
  hint?: string;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <View style={[styles.iconCircle, { backgroundColor: Colors.danger + "14" }]}>
        <Ionicons name="cloud-offline-outline" size={30} color={Colors.danger} />
      </View>
      <Text style={styles.title}>{message}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <TouchableOpacity
        onPress={onRetry}
        style={styles.retryBtn}
        accessibilityRole="button"
        accessibilityLabel="إعادة المحاولة"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="refresh" size={18} color="#fff" />
        <Text style={styles.retryText}>إعادة المحاولة</Text>
      </TouchableOpacity>
    </View>
  );
}

export function LoadingBlock({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <View style={styles.wrap} accessibilityLabel={label}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={[styles.hint, { marginTop: 12 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 16, lineHeight: 26, color: Colors.textPrimary, textAlign: "center" },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 21, color: Colors.textSecondary, textAlign: "center", marginTop: 4 },
  retryBtn: {
    marginTop: 18, minHeight: 44, paddingHorizontal: 22, borderRadius: 22,
    backgroundColor: Colors.primaryDeep, flexDirection: "row-reverse", alignItems: "center", gap: 8,
  },
  retryText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});
