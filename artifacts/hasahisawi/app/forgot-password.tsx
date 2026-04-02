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

type Step = "phone" | "password" | "done";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 20 : insets.top;

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [userName, setUserName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCheckPhone = async () => {
    if (!phone.trim()) {
      Alert.alert("خطأ", "أدخل رقم الهاتف");
      return;
    }
    setLoading(true);
    try {
      const base = getApiUrl();
      const res = await fetch(`${base}/api/auth/check-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!data.exists) {
        Alert.alert("غير موجود", "لا يوجد حساب مسجّل بهذا الرقم");
        return;
      }
      setUserName(data.name);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("password");
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert("خطأ", "أدخل كلمة المرور الجديدة وتأكيدها");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("خطأ", "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("خطأ", "كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    try {
      const base = getApiUrl();
      const res = await fetch(`${base}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("خطأ", data.error || "حدث خطأ ما");
        return;
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("done");
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-forward" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>استعادة كلمة المرور</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <View style={styles.stepsRow}>
          {(["phone", "password", "done"] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <View style={[
                styles.stepDot,
                (step === s || (step === "password" && i < 2) || step === "done") && styles.stepDotActive,
              ]}>
                {step === "done" || (step === "password" && i === 0) ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <Text style={styles.stepNum}>{i + 1}</Text>
                )}
              </View>
              {i < 2 && (
                <View style={[
                  styles.stepLine,
                  ((step === "password" && i === 0) || step === "done") && styles.stepLineActive,
                ]} />
              )}
            </React.Fragment>
          ))}
        </View>
        <View style={styles.stepsLabelRow}>
          <Text style={styles.stepLabel}>رقم الهاتف</Text>
          <Text style={styles.stepLabel}>كلمة المرور</Text>
          <Text style={styles.stepLabel}>تم</Text>
        </View>

        {/* ── Step 1: Phone ── */}
        {step === "phone" && (
          <Animated.View entering={FadeInDown.springify()} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="phone-portrait-outline" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.cardTitle}>أدخل رقم هاتفك</Text>
            <Text style={styles.cardSub}>سنتحقق من وجود الحساب ثم نسمح لك بتغيير كلمة المرور</Text>

            <View style={styles.inputWrap}>
              <Ionicons name="call-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="09XXXXXXXX"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
                textAlign="right"
                returnKeyType="done"
                onSubmitEditing={handleCheckPhone}
              />
            </View>

            <TouchableOpacity
              onPress={handleCheckPhone}
              disabled={loading}
              activeOpacity={0.85}
              style={styles.btnWrap}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>التحقق من الرقم</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Step 2: New Password ── */}
        {step === "password" && (
          <Animated.View entering={FadeInDown.springify()} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-open-outline" size={36} color={Colors.accent} />
            </View>
            <Text style={styles.cardTitle}>مرحباً، {userName}</Text>
            <Text style={styles.cardSub}>أدخل كلمة المرور الجديدة لحسابك</Text>

            {/* New Password */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>كلمة المرور الجديدة *</Text>
              <View style={styles.inputWrap}>
                <TouchableOpacity onPress={() => setShowNew(!showNew)} style={styles.inputIcon}>
                  <Ionicons name={showNew ? "eye-outline" : "eye-off-outline"} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="6 أحرف على الأقل"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showNew}
                  textAlign="right"
                />
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>تأكيد كلمة المرور *</Text>
              <View style={styles.inputWrap}>
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={styles.inputIcon}>
                  <Ionicons name={showConfirm ? "eye-outline" : "eye-off-outline"} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="أعد كتابة كلمة المرور"
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry={!showConfirm}
                  textAlign="right"
                />
              </View>
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <Text style={styles.errText}>كلمتا المرور غير متطابقتين</Text>
              )}
            </View>

            {/* Strength indicator */}
            <View style={styles.strengthRow}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={[
                  styles.strengthBar,
                  newPassword.length >= i * 2 && {
                    backgroundColor: newPassword.length >= 8 ? Colors.primary : newPassword.length >= 4 ? Colors.accent : Colors.danger,
                  },
                ]} />
              ))}
              <Text style={styles.strengthLabel}>
                {newPassword.length === 0 ? "" : newPassword.length < 4 ? "ضعيفة" : newPassword.length < 8 ? "متوسطة" : "قوية"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleReset}
              disabled={loading}
              activeOpacity={0.85}
              style={styles.btnWrap}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnText}>تغيير كلمة المرور</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Step 3: Done ── */}
        {step === "done" && (
          <Animated.View entering={FadeInUp.springify()} style={[styles.card, { alignItems: "center", gap: 20 }]}>
            <LinearGradient
              colors={[Colors.primary + "22", Colors.primary + "08"]}
              style={styles.successCircle}
            >
              <Ionicons name="checkmark-circle" size={72} color={Colors.primary} />
            </LinearGradient>
            <Text style={styles.successTitle}>تم بنجاح!</Text>
            <Text style={styles.successSub}>
              تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة
            </Text>
            <TouchableOpacity
              onPress={() => router.replace("/login" as any)}
              activeOpacity={0.85}
              style={styles.btnWrap}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDim]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                <Text style={styles.btnText}>تسجيل الدخول</Text>
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
  stepsRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    marginBottom: 4,
  },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.cardBg,
    borderWidth: 2, borderColor: Colors.divider,
    alignItems: "center", justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  stepNum: { fontFamily: "Cairo_700Bold", fontSize: 11, color: Colors.textMuted },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.divider, maxWidth: 60 },
  stepLineActive: { backgroundColor: Colors.primary },
  stepsLabelRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-around",
    marginBottom: 24,
  },
  stepLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    flex: 1,
  },
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 24,
    gap: 16,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: Colors.primary + "15",
    alignItems: "center", justifyContent: "center",
    alignSelf: "center",
  },
  cardTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  cardSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  fieldBlock: { gap: 6 },
  fieldLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "right",
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
  inputIcon: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
  },
  input: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: Colors.textPrimary,
    paddingHorizontal: 8,
  },
  errText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.danger,
    textAlign: "right",
  },
  strengthRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: -4,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
  },
  strengthLabel: {
    fontFamily: "Cairo_500Medium",
    fontSize: 12,
    color: Colors.textMuted,
    minWidth: 40,
    textAlign: "right",
  },
  btnWrap: { marginTop: 4 },
  btn: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  successCircle: {
    width: 130, height: 130,
    borderRadius: 65,
    alignItems: "center", justifyContent: "center",
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
