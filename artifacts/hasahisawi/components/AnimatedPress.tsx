import React from "react";
import { Pressable, Platform, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const SPRING_CONFIG = { damping: 15, stiffness: 300, mass: 0.8 };

interface AnimatedPressProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleDown?: number;
  haptic?: boolean;
  disabled?: boolean;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
}

export default function AnimatedPress({
  children,
  onPress,
  style,
  scaleDown = 0.96,
  haptic = true,
  disabled = false,
  hitSlop,
}: AnimatedPressProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={style}
        hitSlop={hitSlop}
        onPressIn={() => {
          if (disabled) return;
          scale.value = withSpring(scaleDown, SPRING_CONFIG);
          if (haptic && Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING_CONFIG);
        }}
        onPress={() => {
          if (!disabled && onPress) onPress();
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
