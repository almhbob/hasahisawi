/**
 * عناصر «النقش البارز» (Neumorphism) لشاشات الدخول — مستوحاة من أسلوب الواجهات المنقوشة،
 * مُكيَّفة بألوان حصاحيصاوي وتعمل في الوضعين الفاتح والداكن.
 *
 * الظل المزدوج (فاتح أعلى-يمين + داكن أسفل-يسار) غير مدعوم في أندرويد، لذلك يُحاكى النقش
 * بتدرّج لوني وحواف فاتحة/داكنة فيبدو العنصر بارزاً أو غائراً على كل المنصات،
 * ويُضاف الظل الحقيقي حيث يدعمه النظام.
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Platform, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle,
} from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { isDarkTheme } from "@/constants/theme-mode";

type IconName = keyof typeof Ionicons.glyphMap;

export const neu = isDarkTheme
  ? { base: "#17221E", raisedTop: "#1E2C27", raisedBottom: "#131C19", light: "#24342E", dark: "#070B0A", insetTop: "#0F1714", insetBottom: "#1B2823", text: Colors.textPrimary }
  : { base: "#E7EEEA", raisedTop: "#F1F6F3", raisedBottom: "#DDE6E1", light: "#FFFFFF", dark: "#B7C6BE", insetTop: "#D6E0DA", insetBottom: "#EEF3F0", text: Colors.textPrimary };

const webShadow = (raised: boolean, d = 8) =>
  Platform.OS === "web"
    ? ({ boxShadow: raised ? `${d}px ${d}px ${d * 2}px ${neu.dark}, -${d}px -${d}px ${d * 2}px ${neu.light}` : `inset ${d / 2}px ${d / 2}px ${d}px ${neu.dark}, inset -${d / 2}px -${d / 2}px ${d}px ${neu.light}` } as any)
    : null;

/** سطح بارز: بطاقة، شارة، زر */
export function NeuRaised({ style, radius = 24, depth = 8, children }: { style?: StyleProp<ViewStyle>; radius?: number; depth?: number; children?: React.ReactNode }) {
  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: neu.base,
          shadowColor: neu.dark,
          shadowOffset: { width: depth * 0.6, height: depth * 0.8 },
          shadowOpacity: isDarkTheme ? 0.7 : 0.55,
          shadowRadius: depth * 1.4,
          elevation: Math.round(depth * 0.9),
        },
        webShadow(true, depth),
        style,
      ]}
    >
      <LinearGradient
        colors={[neu.raisedTop, neu.raisedBottom]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderTopColor: neu.light, borderRightColor: neu.light, borderBottomColor: "transparent", borderLeftColor: "transparent" }]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

/** سطح غائر: حقول الإدخال وخانات الرمز */
export function NeuInset({ style, radius = 16, children, tint }: { style?: StyleProp<ViewStyle>; radius?: number; children?: React.ReactNode; tint?: string }) {
  return (
    <View style={[{ borderRadius: radius, backgroundColor: neu.base, overflow: "hidden" }, webShadow(false, 6), style]}>
      <LinearGradient
        colors={[neu.insetTop, neu.base, neu.insetBottom]}
        locations={[0, 0.35, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, borderWidth: 1.2, borderTopColor: neu.dark + "55", borderRightColor: neu.dark + "40", borderBottomColor: neu.light, borderLeftColor: neu.light },
        ]}
        pointerEvents="none"
      />
      {!!tint && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1.5, borderColor: tint, backgroundColor: tint + "10" }]} />}
      {children}
    </View>
  );
}

/** شارة دائرية بارزة بأيقونة — مثل قفل البطاقة في التصميم */
export function NeuBadge({ icon, size = 76, color = Colors.primary, children }: { icon?: IconName; size?: number; color?: string; children?: React.ReactNode }) {
  return (
    <NeuRaised radius={size / 2} depth={7} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <NeuInset radius={(size - 18) / 2} style={{ width: size - 18, height: size - 18, alignItems: "center", justifyContent: "center" }}>
        {children ?? (icon ? <Ionicons name={icon} size={size * 0.38} color={color} /> : null)}
      </NeuInset>
    </NeuRaised>
  );
}

/** زر بارز يتحوّل إلى تدرّج أخضر عند الضغط أو التحميل — كما في التصميم المرجعي */
export function NeuButton({
  label, icon, onPress, loading, disabled, variant = "primary",
}: { label: string; icon?: IconName; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: "primary" | "soft" }) {
  const p = useSharedValue(0);
  const filled = variant === "primary";
  const [pressed, setPressed] = useState(false);
  const active = pressed || !!loading;
  useEffect(() => { p.value = withTiming(active ? 1 : 0, { duration: 160 }); }, [active]);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(p.value, [0, 1], [1, 0.975]) }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: filled ? 0.82 + p.value * 0.18 : p.value }));
  const fg = filled || active ? "#fff" : Colors.primary;
  return (
    <Animated.View style={[scaleStyle, { opacity: disabled ? 0.5 : 1 }]}>
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <NeuRaised radius={18} depth={active ? 3 : 8} style={{ minHeight: 56 }}>
          <Animated.View style={[StyleSheet.absoluteFill, fillStyle]} pointerEvents="none">
            <LinearGradient colors={[Colors.primaryLight, Colors.primary, Colors.primaryDim]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
          </Animated.View>
          <View style={nb.inner}>
            {loading ? <ActivityIndicator color={fg} size="small" /> : (
              <>
                <Text style={[nb.label, { color: fg }]} numberOfLines={1}>{label}</Text>
                {!!icon && <Ionicons name={icon} size={19} color={fg} />}
              </>
            )}
          </View>
        </NeuRaised>
      </Pressable>
    </Animated.View>
  );
}

/** زر دائري بارز صغير (+ / ← / بصمة) */
export function NeuRoundButton({ icon, onPress, size = 46, color = Colors.primary, accessibilityLabel, loading }: { icon: IconName; onPress: () => void; size?: number; color?: string; accessibilityLabel: string; loading?: boolean }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={6}>
      {pressed ? (
        <NeuInset radius={size / 2} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={size * 0.44} color={color} />
        </NeuInset>
      ) : (
        <NeuRaised radius={size / 2} depth={5} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
          {loading ? <ActivityIndicator color={color} size="small" /> : <Ionicons name={icon} size={size * 0.44} color={color} />}
        </NeuRaised>
      )}
    </Pressable>
  );
}

/**
 * حقل غائر بعنوان عائم: العنوان داخل الحقل، ويرتفع فوق النص عند التركيز أو وجود قيمة،
 * مع خط أخضر يمتدّ أسفل الحقل عند التركيز.
 */
export function NeuField({
  label, icon, value, trailing, error, hint, multiline, inputStyle, ...rest
}: TextInputProps & {
  label: string; icon?: IconName; value: string; trailing?: React.ReactNode; error?: boolean; hint?: string; multiline?: boolean; inputStyle?: any;
}) {
  const [focused, setFocused] = useState(false);
  const up = useSharedValue(value ? 1 : 0);
  const line = useSharedValue(0);
  useEffect(() => { up.value = withTiming(focused || !!value ? 1 : 0, { duration: 170 }); }, [focused, value]);
  useEffect(() => { line.value = withSpring(focused ? 1 : 0, { damping: 18, stiffness: 160 }); }, [focused]);

  const labelStyle = useAnimatedStyle(() => ({
    top: interpolate(up.value, [0, 1], [multiline ? 16 : 17, 6]),
    fontSize: interpolate(up.value, [0, 1], [14.5, 11]),
  }));
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: line.value }], opacity: line.value }));
  const tint = error ? Colors.danger : focused ? Colors.primary : undefined;

  return (
    <View style={{ gap: 5 }}>
      <NeuInset radius={16} tint={error ? Colors.danger : undefined} style={[nf.wrap, multiline && { minHeight: 96, alignItems: "flex-start" }]}>
        {!!icon && <Ionicons name={icon} size={18} color={tint ?? Colors.textMuted} style={[nf.icon, multiline && { marginTop: 18 }]} />}
        <View style={{ flex: 1, alignSelf: "stretch" }}>
          <Animated.Text style={[nf.label, labelStyle, { color: tint ?? Colors.textMuted }]} numberOfLines={1} pointerEvents="none">
            {label}
          </Animated.Text>
          <TextInput
            {...rest}
            value={value}
            multiline={multiline}
            placeholder={focused ? rest.placeholder : undefined}
            placeholderTextColor={Colors.textSubtle}
            onFocus={e => { setFocused(true); rest.onFocus?.(e); }}
            onBlur={e => { setFocused(false); rest.onBlur?.(e); }}
            style={[nf.input, multiline && nf.multiline, inputStyle]}
            accessibilityLabel={label}
          />
        </View>
        {trailing}
        <Animated.View pointerEvents="none" style={[nf.line, lineStyle, { backgroundColor: error ? Colors.danger : Colors.primary }]} />
      </NeuInset>
      {!!hint && <Text style={[nf.hint, error && { color: Colors.danger }]}>{hint}</Text>}
    </View>
  );
}

const nb = StyleSheet.create({
  inner: { minHeight: 56, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 18 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 16 },
});

const nf = StyleSheet.create({
  wrap: { flexDirection: "row-reverse", alignItems: "center", minHeight: 58 },
  icon: { paddingHorizontal: 14 },
  label: { position: "absolute", right: 0, left: 0, textAlign: "right", fontFamily: "Cairo_600SemiBold" },
  input: {
    flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textPrimary,
    paddingTop: 22, paddingBottom: 6, textAlign: "right",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  multiline: { minHeight: 90, textAlignVertical: "top", paddingTop: 28 },
  line: { position: "absolute", bottom: 0, left: 16, right: 16, height: 2.5, borderRadius: 2 },
  hint: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right", paddingHorizontal: 6 },
});
