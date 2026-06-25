import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStatus } from "@/lib/network";
import { useOfflineQueueStatus } from "@/lib/offline-queue";
import Colors from "@/constants/colors";

export default function NetworkBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const queue = useOfflineQueueStatus();
  const insets = useSafeAreaInsets();

  // On web, NetInfo's isInternetReachable is unreliable — use only isConnected
  const offline = Platform.OS === "web"
    ? isConnected === false
    : isConnected === false || isInternetReachable === false;

  const showQueue = queue.total > 0;
  const text = offline
    ? (showQueue ? `لا يوجد إنترنت · ${queue.pending + queue.syncing} إجراء محفوظ وسيُرسل لاحقاً` : "لا يوجد اتصال بالإنترنت")
    : queue.syncing > 0
      ? `جارٍ مزامنة ${queue.syncing} إجراء محفوظ…`
      : queue.pending > 0
        ? `${queue.pending} إجراء محفوظ بانتظار الإرسال`
        : queue.failed > 0
          ? `${queue.failed} إجراء يحتاج إعادة إرسال`
          : "";

  const translateY = useSharedValue(-80);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    if (offline || showQueue) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      opacity.value    = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(-80, { duration: 350 });
      opacity.value    = withTiming(0, { duration: 300 });
    }
  }, [offline, showQueue]);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!offline && !showQueue) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        !offline && queue.failed === 0 && styles.bannerSync,
        !offline && queue.failed > 0 && styles.bannerWarn,
        { top: insets.top + 4 },
        bannerStyle,
      ]}
      pointerEvents="none"
    >
      <Ionicons name={offline ? "wifi-outline" : queue.failed > 0 ? "warning-outline" : "cloud-upload-outline"} size={16} color="#fff" />
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: "#C0392B",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  bannerSync: {
    backgroundColor: "#0E9F6E",
  },
  bannerWarn: {
    backgroundColor: "#F59E0B",
  },
  text: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
});
