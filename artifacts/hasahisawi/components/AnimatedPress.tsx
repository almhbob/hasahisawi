import React from "react";
import { Pressable, Platform, ViewStyle, StyleProp, StyleSheet } from "react-native";
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
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleDown?: number;
  haptic?: boolean;
  disabled?: boolean;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
}

export default function AnimatedPress({
  children,
  onPress,
  onLongPress,
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

  // Flex sizing must live on the outer animated wrapper, otherwise a child
  // styled `flex: 1` (segments, equal-width buttons) collapses to its content.
  const flat = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const outer: ViewStyle = {};
  for (const k of ["flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf"] as const) {
    if (flat[k] !== undefined) (outer as any)[k] = flat[k];
  }
  const fillInner = outer.flex !== undefined || outer.flexGrow !== undefined;

  return (
    <Animated.View style={[outer, animStyle]}>
      <Pressable
        style={fillInner ? [style, { flexGrow: 1 }] : style}
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
        onLongPress={() => {
          if (!disabled && onLongPress) onLongPress();
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
