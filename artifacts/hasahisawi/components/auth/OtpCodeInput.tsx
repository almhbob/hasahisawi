import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import { onlyDigits } from "@/lib/digits";
import { NeuInset } from "./neu";

export type OtpCodeInputHandle = { focus: () => void; blur: () => void; shake: () => void };

type Props = {
  value: string;
  onChange: (code: string) => void;
  /** يُستدعى مرة عند اكتمال الخانات — للتحقق التلقائي */
  onComplete?: (code: string) => void;
  length?: number;
  error?: boolean;
  success?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
};

/**
 * حقل رمز التحقق: حقل إدخال حقيقي واحد يغطي الخانات كلها (لا حقل مخفي بحجم 1px)،
 * فالضغط في أي مكان يفتح لوحة الأرقام، ويعمل اللصق وتعبئة رمز SMS تلقائياً.
 * الخانات تُعرض دائماً من اليسار إلى اليمين كما يُكتب الرمز، حتى في الواجهة العربية.
 */
const OtpCodeInput = forwardRef<OtpCodeInputHandle, Props>(function OtpCodeInput(
  { value, onChange, onComplete, length = 6, error, success, disabled, autoFocus = true },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const shakeX = useSharedValue(0);
  const caret = useSharedValue(1);
  const lastCompleted = useRef<string>("");

  const shake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 60 }),
      withTiming(-7, { duration: 60 }),
      withTiming(7, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    );
  };

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    shake,
  }));

  useEffect(() => {
    caret.value = withRepeat(withSequence(withTiming(0, { duration: 450 }), withTiming(1, { duration: 450 })), -1);
  }, []);

  useEffect(() => { if (error) shake(); }, [error]);

  // تعبئة من الخارج (زر «اضغط للتعبئة» أو رمز SMS) تُطلق التحقق التلقائي أيضاً
  useEffect(() => {
    if (value.length === length && value !== lastCompleted.current) {
      lastCompleted.current = value;
      onComplete?.(value);
    }
    if (value.length < length) lastCompleted.current = "";
  }, [value, length]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));

  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Animated.View style={[styles.wrap, shakeStyle]}>
      <View style={styles.row}>
        {Array.from({ length }).map((_, i) => {
          const ch = value[i] ?? "";
          const isActive = focused && !disabled && i === activeIndex && value.length < length;
          return (
            <NeuInset
              key={i}
              radius={16}
              tint={error ? Colors.danger : success ? Colors.primary : isActive ? Colors.primary : ch ? Colors.primary + "55" : undefined}
              style={styles.box}
            >
              {ch ? (
                <Text style={[styles.digit, error && { color: Colors.danger }]}>{ch}</Text>
              ) : isActive ? (
                <Animated.View style={[styles.caret, caretStyle]} />
              ) : (
                <View style={styles.placeholderDot} />
              )}
            </NeuInset>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(onlyDigits(t, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        importantForAutofill="yes"
        // لا نضع maxLength: لصق «رمزك هو 123456» يجب أن يصل كاملاً ثم نستخرج الأرقام
        caretHidden
        selectionColor="transparent"
        underlineColorAndroid="transparent"
        style={styles.hiddenInput}
        accessibilityLabel="رمز التحقق"
      />
      {/* على الويب: الضغط على الخانات يعيد التركيز للحقل */}
      {Platform.OS === "web" && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => inputRef.current?.focus()} />
      )}
    </Animated.View>
  );
});

export default OtpCodeInput;

const styles = StyleSheet.create({
  wrap: { width: "100%", alignSelf: "center", maxWidth: 380 },
  // direction:ltr — الرمز يُقرأ من اليسار مثل أي رقم، وإلا ظهر معكوساً في الواجهة العربية
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8, ...(Platform.OS === "web" ? null : { direction: "ltr" as const }) },
  box: { flex: 1, aspectRatio: 0.82, maxHeight: 64, alignItems: "center", justifyContent: "center" },
  digit: { fontFamily: "Cairo_700Bold", fontSize: 26, color: Colors.primary, includeFontPadding: false },
  caret: { width: 2, height: 26, borderRadius: 1, backgroundColor: Colors.primary },
  placeholderDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textSubtle },
  // حقل حقيقي بحجم الخانات وشفاف — يستقبل اللمس واللصق وتعبئة SMS
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    color: "transparent",
    backgroundColor: "transparent",
    fontSize: 18,
    textAlign: "center",
    opacity: Platform.OS === "web" ? 0 : 0.02,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
});
