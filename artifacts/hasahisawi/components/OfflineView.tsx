import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNetworkStatus } from "@/lib/network";

type Props = {
  onRetry?: () => void;
  isRetrying?: boolean;
  message?: string;
};

export default function OfflineView({
  onRetry,
  isRetrying = false,
  message = "تعذّر تحميل البيانات. تحقق من اتصالك بالإنترنت.",
}: Props) {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const offline = isConnected === false || isInternetReachable === false;

  return (
    <View style={styles.container}>
      <Ionicons
        name={offline ? "cloud-offline-outline" : "alert-circle-outline"}
        size={64}
        color="#9CA3AF"
      />
      <Text style={styles.title}>
        {offline ? "لا يوجد اتصال بالإنترنت" : "حدث خطأ في التحميل"}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={[styles.button, isRetrying && styles.buttonDisabled]}
          onPress={onRetry}
          disabled={isRetrying}
          activeOpacity={0.8}
        >
          {isRetrying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.buttonText}>إعادة المحاولة</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
    backgroundColor: "#F9FAFB",
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: "#374151",
    textAlign: "center",
  },
  message: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1A7A4A",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
