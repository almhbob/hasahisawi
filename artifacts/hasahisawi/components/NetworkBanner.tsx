import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStatus } from "@/lib/network";
import Colors from "@/constants/colors";

export default function NetworkBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const insets = useSafeAreaInsets();

  const offline = isConnected === false || isInternetReachable === false;
  const translateY = useSharedValue(-80);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    if (offline) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      opacity.value    = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(-80, { duration: 350 });
      opacity.value    = withTiming(0, { duration: 300 });
    }
  }, [offline]);

  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.banner,
        { top: insets.top + 4 },
        bannerStyle,
      ]}
      pointerEvents="none"
    >
      <Ionicons name="wifi-outline" size={16} color="#fff" />
      <Text style={styles.text}>لا يوجد اتصال بالإنترنت</Text>
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
  text: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
});
