import React from "react";
import { Pressable, Platform, StyleSheet, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const SPRING_CONFIG = { damping: 15, stiffness: 300, mass: 0.8 };

// Props that place the element inside its parent. They must sit on the outer
// animated wrapper: on the inner Pressable, `flex: 1` or `alignSelf` had no
// effect (the wrapper is what the parent row lays out), so "equal width"
// buttons and cards sized to their content and overflowed the row.
const OUTER_KEYS = new Set([
  "flex", "flexGrow", "flexShrink", "flexBasis", "alignSelf",
  "width", "minWidth", "maxWidth",
  "margin", "marginHorizontal", "marginVertical", "marginTop", "marginBottom",
  "marginLeft", "marginRight", "marginStart", "marginEnd",
  "position", "top", "bottom", "left", "right", "start", "end", "zIndex",
]);

function splitStyle(style: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (OUTER_KEYS.has(k) ? outer : inner)[k] = v;
  // When the wrapper grows (flex in a column), let the pressable fill it.
  if (outer.flex != null || outer.flexGrow != null) inner.flexGrow = 1;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

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
  const { outer, inner } = splitStyle(style);

  return (
    <Animated.View style={[outer, animStyle]}>
      <Pressable
        style={inner}
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
