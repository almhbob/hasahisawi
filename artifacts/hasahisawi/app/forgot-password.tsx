import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Platform,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { firebaseSendPasswordReset, isFirebaseAvailable } from "@/lib/firebase/auth";

type Step = "identifier" | "done";

function identifierToFirebaseEmail(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const clean = trimmed.replace(/\s+/g, "").replace(/^\+/, "");
  return `${clean}@hasahisawi.app`;
}

async function parseJsonSafe(res: Response): Promise<Record<string, any>> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [step, setStep] = useState<Step>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const isEmailInput = identifier.includes("@");

  const handleReset = async () => {
    const value = identifier.trim();
    if (!value) {
      Alert.alert("خطأ", "أدخل رقم الهاتف أو البريد الإلكتروني");
      return;
    }

    setLoading(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const checkRes = await fetch(`${base}/api/auth/check-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: value }),
      });
      const check = await parseJsonSafe(checkRes);

      if (checkRes.ok && check.exists === false) {
        Alert.alert("غير موجود", "لا يوجد حساب مسجّل بهذا الرقم أو البريد الإلكتروني");
        return;
      }

      if (!isFirebaseAvailable()) {
        Alert.alert("غير متاح حالياً", "خدمة استعادة كلمة المرور عبر Firebase غير مفعّلة في هذا الإصدار.");
        return;
      }

      const email = identifierToFirebaseEmail(value);
      await firebaseSendPasswordReset(email);
      setSentTo(value.includes("@") ? value : `حساب الرقم ${value}`);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("done");
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/user-not-found") {
        Alert.alert("غير موجود", "لا يوجد حساب Firebase مرتبط بهذه البيانات");
      } else if (code === "auth/invalid-email") {
        Alert.alert("بيانات غير صحيحة", "أدخل بريداً صحيحاً أو رقم هاتف صحيح");
      } else {
        Alert.alert("خطأ", "تعذّر إرسال رابط الاستعادة. تحقق من الإنترنت أو حاول لاحقاً.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}> 
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>استعادة كلمة المرور</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === "identifier" && (
          <Animated.View entering={FadeInDown.springify()} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark-outline" size={38} color={Colors.primary} />
            </View>
            <Text style={styles.cardTitle}>استعادة آمنة</Text>
            <Text style={styles.cardSub}>
              أدخل رقم الهاتف أو البريد، وسنرسل رابط إعادة تعيين كلمة المرور عبر Firebase للحساب المرتبط.
            </Text>

            <View style={styles.inputWrap}>
              <Ionicons
                name={isEmailInput ? "mail-outline" : "call-outline"}
                size={18}
                color={Colors.textMuted}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="09XXXXXXXX أو البريد الإلكتروني"
                placeholderTextColor={Colors.textMuted}
                keyboardType={isEmailInput ? "email-address" : "phone-pad"}
                autoCapitalize="none"
                textAlign="right"
                returnKeyType="done"
                onSubmitEditing={handleReset}
              />
            </View>

            <TouchableOpacity onPress={handleReset} disabled={loading} activeOpacity={0.85} style={styles.btnWrap}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>إرسال رابط الاستعادة</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.note}>
              ملاحظة: الحسابات التي سُجلت برقم الهاتف تستخدم بريداً داخلياً بصيغة hasahisawi.app، لذلك إن لم يصل الرابط تواصل مع الإدارة لتحديث بريدك الحقيقي.
            </Text>
          </Animated.View>
        )}

        {step === "done" && (
          <Animated.View entering={FadeInUp.springify()} style={[styles.card, { alignItems: "center", gap: 20 }]}> 
            <LinearGradient colors={[Colors.primary + "22", Colors.primary + "08"]} style={styles.successCircle}>
              <Ionicons name="mail-open-outline" size={72} color={Colors.primary} />
            </LinearGradient>
            <Text style={styles.successTitle}>تم الإرسال</Text>
            <Text style={styles.successSub}>
              أرسلنا رابط استعادة كلمة المرور إلى {sentTo}. افتح الرابط ثم سجّل الدخول بكلمة المرور الجديدة.
            </Text>
            <TouchableOpacity onPress={() => router.replace("/login" as any)} activeOpacity={0.85} style={styles.btnWrapFull}>
              <LinearGradient colors={[Colors.primary, Colors.primaryDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                <Text style={styles.btnText}>العودة لتسجيل الدخول</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  scroll: { padding: 20, gap: 16 },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 24,
    gap: 16,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  cardTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  cardSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 23,
  },
  inputWrap: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: Colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.divider,
    height: 52,
    paddingHorizontal: 4,
  },
  inputIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: Colors.textPrimary,
    paddingHorizontal: 8,
  },
  btnWrap: { marginTop: 4 },
  btnWrapFull: { marginTop: 4, width: "100%" },
  btn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  note: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 21,
  },
  successCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  successSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
});
