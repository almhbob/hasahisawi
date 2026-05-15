import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform,
  KeyboardAvoidingView,
} from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeIn } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

type Step = "phone" | "otp" | "password" | "done";

export default function ForgotPasswordScreen() {
  const insets   = useSafeAreaInsets();
  const topPad   = Platform.OS === "web" ? 20 : insets.top;
  const confirmRef    = useRef<TextInput>(null);
  const otpRefs       = [
    useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null),
    useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null),
  ];

  const [step,            setStep]            = useState<Step>("phone");
  const [phone,           setPhone]           = useState("");
  const [userName,        setUserName]        = useState("");
  const isEmailInput                          = phone.includes("@");
  const [otpDigits,       setOtpDigits]       = useState(["","","","","",""]);
  const [otpTimer,        setOtpTimer]        = useState(0);
  const [otpChannel,      setOtpChannel]      = useState<"sms"|"email">("sms");
  const [resetToken,      setResetToken]      = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");

  const base = getApiUrl();

  // ── عداد إعادة الإرسال ──────────────────────────────────────────────────
  useEffect(() => {
    if (otpTimer <= 0) return;
    const t = setTimeout(() => setOtpTimer(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [otpTimer]);

  // ── Step 1: التحقق من وجود الحساب + إرسال OTP ─────────────────────────
  const handleCheckPhone = async () => {
    const id = phone.trim();
    if (!id) { setError("أدخل رقم الهاتف أو البريد الإلكتروني"); return; }
    setError(""); setLoading(true);
    try {
      // تحقق من وجود الحساب
      const res = await fetchWithTimeout(`${base}/api/auth/check-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id }),
      }, 20000);
      const data = await res.json();
      if (!data.exists) {
        setError("لا يوجد حساب مسجّل بهذا الرقم أو البريد الإلكتروني");
        return;
      }
      setUserName(data.name || "");

      // إرسال OTP
      const otpRes = await fetchWithTimeout(`${base}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_or_email: id, type: "password_reset" }),
      }, 20000);
      const otpData = await otpRes.json();
      if (!otpRes.ok) { setError(otpData.error || "تعذّر إرسال رمز التحقق"); return; }

      setOtpChannel(otpData.channel === "email" ? "email" : "sms");
      setOtpTimer(120);
      setStep("otp");
    } catch (e: any) {
      setError(e?.name === "AbortError"
        ? "انتهت مهلة الاتصال. تحقق من اتصالك بالإنترنت."
        : "تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مجدداً.");
    } finally { setLoading(false); }
  };

  // ── إعادة إرسال OTP ────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    setError(""); setLoading(true);
    try {
      const res = await fetchWithTimeout(`${base}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_or_email: phone.trim(), type: "password_reset" }),
      }, 20000);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "تعذّر إعادة الإرسال"); return; }
      setOtpDigits(["","","","","",""]);
      setOtpTimer(120);
    } catch { setError("تعذّر إرسال الرمز"); }
    finally { setLoading(false); }
  };

  // ── Step 2: التحقق من OTP ──────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length < 6) { setError("أدخل الرمز المكوّن من 6 أرقام"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetchWithTimeout(`${base}/api/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_or_email: phone.trim(), code }),
      }, 20000);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "رمز غير صحيح"); return; }
      setResetToken(data.reset_token);
      setStep("password");
    } catch (e: any) {
      setError(e?.name === "AbortError"
        ? "انتهت مهلة الاتصال."
        : "تعذّر التحقق. حاول مجدداً.");
    } finally { setLoading(false); }
  };

  // ── Step 3: تغيير كلمة المرور ──────────────────────────────────────────
  const handleReset = async () => {
    if (!newPassword || !confirmPassword) { setError("أدخل كلمة المرور الجديدة وتأكيدها"); return; }
    if (newPassword.length < 6) { setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (newPassword !== confirmPassword) { setError("كلمتا المرور غير متطابقتين"); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetchWithTimeout(`${base}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
      }, 20000);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "حدث خطأ ما. حاول مجدداً."); return; }
      setStep("done");
    } catch (e: any) {
      setError(e?.name === "AbortError"
        ? "انتهت مهلة الاتصال."
        : "تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مجدداً.");
    } finally { setLoading(false); }
  };

  // معالجة إدخال OTP رقم برقم
  const handleOtpChange = (value: string, index: number) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next  = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5) otpRefs[index + 1].current?.focus();
    if (!digit && index > 0 && !value) otpRefs[index - 1].current?.focus();
    setError("");
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs[index - 1].current?.focus();
    }
  };

  const pwdStrength = newPassword.length === 0 ? "" : newPassword.length < 4 ? "ضعيفة" : newPassword.length < 8 ? "متوسطة" : "قوية";
  const pwdColor    = newPassword.length < 4 ? Colors.danger : newPassword.length < 8 ? Colors.accent : Colors.primary;
  const STEPS: Step[] = ["phone","otp","password","done"];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.container, { paddingTop: topPad }]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>استعادة كلمة المرور</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step indicator (4 خطوات) ── */}
          <View style={styles.stepsRow}>
            {STEPS.map((s, i) => {
              const idx    = STEPS.indexOf(step);
              const active = i === idx;
              const done   = i < idx;
              return (
                <React.Fragment key={s}>
                  <View style={[styles.stepDot, (active || done) && styles.stepDotActive]}>
                    {done
                      ? <Ionicons name="checkmark" size={12} color="#fff" />
                      : <Text style={[styles.stepNum, active && { color: "#fff" }]}>{i + 1}</Text>}
                  </View>
                  {i < STEPS.length - 1 && (
                    <View style={[styles.stepLine, done && styles.stepLineActive]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
          <View style={styles.stepsLabelRow}>
            {["التعرف","التحقق","كلمة المرور","تم ✓"].map((l, i) => (
              <Text key={l} style={[styles.stepLabel, STEPS[i] === step && { color: Colors.primary }]}>{l}</Text>
            ))}
          </View>

          {/* ══ Step 1: Phone ══ */}
          {step === "phone" && (
            <Animated.View entering={FadeInDown.springify()} style={styles.card}>
              <View style={styles.iconWrap}>
                <LinearGradient colors={[Colors.primaryDeep + "66", Colors.primaryDeep + "22"]} style={styles.iconCircle}>
                  <Ionicons name="key-outline" size={34} color={Colors.primary} />
                </LinearGradient>
              </View>

              <Text style={styles.cardTitle}>أدخل رقم هاتفك أو بريدك</Text>
              <Text style={styles.cardSub}>سنرسل رمز تحقق للتأكد من هويتك قبل تغيير كلمة المرور</Text>

              <View style={[styles.inputWrap, error ? { borderColor: Colors.danger + "88" } : null]}>
                <Ionicons
                  name={isEmailInput ? "mail-outline" : "call-outline"}
                  size={18} color={Colors.textMuted} style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={t => { setPhone(t); setError(""); }}
                  placeholder="09XXXXXXXX أو البريد الإلكتروني"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={isEmailInput ? "email-address" : "phone-pad"}
                  autoCapitalize="none"
                  textAlign="right"
                  returnKeyType="done"
                  onSubmitEditing={handleCheckPhone}
                />
              </View>

              {error ? (
                <Animated.View entering={FadeIn} style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              ) : null}

              <TouchableOpacity
                onPress={handleCheckPhone} disabled={loading} activeOpacity={0.85}
                style={[styles.btnWrap, loading && { opacity: 0.7 }]}
              >
                <LinearGradient colors={[Colors.primary, Colors.primaryDim]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>إرسال رمز التحقق</Text>}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.back()} style={styles.linkRow}>
                <Text style={styles.linkText}>العودة إلى تسجيل الدخول</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ══ Step 2: OTP ══ */}
          {step === "otp" && (
            <Animated.View entering={FadeInDown.springify()} style={styles.card}>
              <View style={styles.iconWrap}>
                <LinearGradient colors={[Colors.primaryDeep + "66", Colors.primaryDeep + "22"]} style={styles.iconCircle}>
                  <Ionicons name={otpChannel === "email" ? "mail-outline" : "phone-portrait-outline"} size={34} color={Colors.primary} />
                </LinearGradient>
              </View>

              <Text style={styles.cardTitle}>أدخل رمز التحقق</Text>
              <Text style={styles.cardSub}>
                أرسلنا رمزاً مكوّناً من 6 أرقام إلى {"\n"}
                <Text style={{ color: Colors.primary, fontWeight: "700" }}>{phone}</Text>
                {"\n"}صالح لمدة 5 دقائق
              </Text>

              {/* حقول OTP */}
              <View style={styles.otpRow}>
                {otpDigits.map((d, i) => (
                  <TextInput
                    key={i}
                    ref={otpRefs[i]}
                    style={[styles.otpCell, d && styles.otpCellFilled, error && !d && styles.otpCellError]}
                    value={d}
                    onChangeText={v => handleOtpChange(v, i)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    textAlign="center"
                    selectTextOnFocus
                    returnKeyType={i === 5 ? "done" : "next"}
                    onSubmitEditing={() => i === 5 ? handleVerifyOtp() : otpRefs[i+1].current?.focus()}
                  />
                ))}
              </View>

              {error ? (
                <Animated.View entering={FadeIn} style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              ) : null}

              <TouchableOpacity
                onPress={handleVerifyOtp}
                disabled={loading || otpDigits.join("").length < 6}
                activeOpacity={0.85}
                style={[styles.btnWrap, (loading || otpDigits.join("").length < 6) && { opacity: 0.5 }]}
              >
                <LinearGradient colors={[Colors.primary, Colors.primaryDim]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>تحقق من الرمز</Text>}
                </LinearGradient>
              </TouchableOpacity>

              {/* إعادة الإرسال */}
              <View style={styles.resendRow}>
                {otpTimer > 0 ? (
                  <Text style={styles.resendTimer}>
                    إعادة الإرسال بعد {Math.floor(otpTimer / 60)}:{String(otpTimer % 60).padStart(2,"0")}
                  </Text>
                ) : (
                  <TouchableOpacity onPress={handleResendOtp} disabled={loading} style={styles.resendBtn}>
                    <Ionicons name="refresh-outline" size={14} color={Colors.primary} />
                    <Text style={styles.resendBtnTxt}>إعادة إرسال الرمز</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity onPress={() => { setStep("phone"); setError(""); setOtpDigits(["","","","","",""]); }} style={styles.linkRow}>
                <Ionicons name="arrow-back-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.linkText}>تغيير الرقم/البريد</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ══ Step 3: New Password ══ */}
          {step === "password" && (
            <Animated.View entering={FadeInDown.springify()} style={styles.card}>
              {/* Found + verified banner */}
              <View style={styles.foundBanner}>
                <LinearGradient
                  colors={[Colors.primaryDeep + "44", Colors.primaryDeep + "11"]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[styles.foundAvatar, { backgroundColor: Colors.success + "22", borderColor: Colors.success + "44" }]}>
                  <Ionicons name="shield-checkmark" size={20} color={Colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.foundLabel, { color: Colors.success }]}>تم التحقق من الهوية ✓</Text>
                  <Text style={styles.foundName}>{userName || phone}</Text>
                </View>
              </View>

              <Text style={styles.cardTitle}>كلمة المرور الجديدة</Text>
              <Text style={styles.cardSub}>اختر كلمة مرور قوية لا تقل عن 6 أحرف</Text>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>كلمة المرور الجديدة</Text>
                <View style={styles.inputWrap}>
                  <TouchableOpacity onPress={() => setShowNew(p => !p)} style={styles.inputIcon}>
                    <Ionicons name={showNew ? "eye-outline" : "eye-off-outline"} size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={t => { setNewPassword(t); setError(""); }}
                    placeholder="6 أحرف على الأقل"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showNew}
                    textAlign="right"
                    returnKeyType="next"
                    onSubmitEditing={() => confirmRef.current?.focus()}
                  />
                </View>
                {newPassword.length > 0 && (
                  <Animated.View entering={FadeIn} style={styles.strengthRow}>
                    {[1, 2, 3, 4].map(i => (
                      <View key={i} style={[styles.strengthBar, newPassword.length >= i * 2 && { backgroundColor: pwdColor }]} />
                    ))}
                    <Text style={[styles.strengthLabel, { color: pwdColor }]}>{pwdStrength}</Text>
                  </Animated.View>
                )}
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>تأكيد كلمة المرور</Text>
                <View style={[styles.inputWrap, confirmPassword.length > 0 && newPassword !== confirmPassword && { borderColor: Colors.danger + "88" }]}>
                  <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={styles.inputIcon}>
                    <Ionicons name={showConfirm ? "eye-outline" : "eye-off-outline"} size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <TextInput
                    ref={confirmRef}
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={t => { setConfirmPassword(t); setError(""); }}
                    placeholder="أعد كتابة كلمة المرور"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showConfirm}
                    textAlign="right"
                    returnKeyType="done"
                    onSubmitEditing={handleReset}
                  />
                  {confirmPassword.length > 0 && (
                    <Ionicons
                      name={newPassword === confirmPassword ? "checkmark-circle" : "close-circle"}
                      size={18}
                      color={newPassword === confirmPassword ? Colors.primary : Colors.danger}
                      style={{ marginHorizontal: 8 }}
                    />
                  )}
                </View>
              </View>

              {error ? (
                <Animated.View entering={FadeIn} style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              ) : null}

              <TouchableOpacity
                onPress={handleReset}
                disabled={loading || newPassword.length < 6}
                activeOpacity={0.85}
                style={[styles.btnWrap, (loading || newPassword.length < 6) && { opacity: 0.5 }]}
              >
                <LinearGradient colors={[Colors.primary, Colors.primaryDim]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>تغيير كلمة المرور</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ══ Step 4: Done ══ */}
          {step === "done" && (
            <Animated.View entering={FadeInUp.springify()} style={[styles.card, styles.doneCard]}>
              <LinearGradient colors={[Colors.primary + "22", Colors.primary + "08"]} style={styles.successCircle}>
                <Ionicons name="checkmark-circle" size={72} color={Colors.primary} />
              </LinearGradient>
              <Text style={styles.successTitle}>تم بنجاح! 🎉</Text>
              <Text style={styles.successSub}>
                تم تغيير كلمة المرور بنجاح بعد التحقق من هويتك.{"\n"}يمكنك الآن تسجيل الدخول.
              </Text>
              <TouchableOpacity onPress={() => router.replace("/login" as any)} activeOpacity={0.85} style={styles.btnWrap}>
                <LinearGradient colors={[Colors.primary, Colors.primaryDim]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  <Ionicons name="log-in-outline" size={18} color="#fff" />
                  <Text style={styles.btnText}>تسجيل الدخول</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },

  scroll: { padding: 20, gap: 16 },

  // Steps (4)
  stepsRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.cardBg, borderWidth: 2, borderColor: Colors.divider,
    alignItems: "center", justifyContent: "center",
  },
  stepDotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  stepNum:       { fontFamily: "Cairo_700Bold", fontSize: 11, color: Colors.textMuted },
  stepLine:      { flex: 1, height: 2, backgroundColor: Colors.divider, maxWidth: 48 },
  stepLineActive:{ backgroundColor: Colors.primary },
  stepsLabelRow: { flexDirection: "row-reverse", justifyContent: "space-around", marginBottom: 24 },
  stepLabel:     { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", flex: 1 },

  // OTP
  otpRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 10, marginVertical: 8 },
  otpCell: {
    width: 46, height: 56, borderRadius: 14, borderWidth: 2, borderColor: Colors.divider,
    backgroundColor: Colors.bg, fontSize: 24, fontFamily: "Cairo_700Bold",
    color: Colors.textPrimary, textAlign: "center",
  },
  otpCellFilled: { borderColor: Colors.primary, backgroundColor: Colors.primary + "15" },
  otpCellError:  { borderColor: Colors.danger + "88" },

  resendRow:    { alignItems: "center", marginTop: 4 },
  resendTimer:  { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  resendBtn:    { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  resendBtnTxt: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.primary },

  // Card
  card:     { backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, padding: 24, gap: 16 },
  doneCard: { alignItems: "center" },

  iconWrap:   { alignSelf: "center", marginBottom: 4 },
  iconCircle: { width: 80, height: 80, borderRadius: 22, alignItems: "center", justifyContent: "center" },

  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "center" },
  cardSub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },

  fieldBlock: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },

  inputWrap: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: Colors.bg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider,
    height: 52, paddingHorizontal: 4,
  },
  inputIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  input:     { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingHorizontal: 8 },

  errorBox: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.danger + "15", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.danger + "33",
  },
  errorText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: "#FCA5A5", textAlign: "right", lineHeight: 20 },

  strengthRow:  { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  strengthBar:  { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.divider },
  strengthLabel:{ fontFamily: "Cairo_500Medium", fontSize: 11, minWidth: 36, textAlign: "right" },

  btnWrap: { marginTop: 4 },
  btn:     { height: 52, borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  linkRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4 },
  linkText:{ fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },

  foundBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.primary + "33", overflow: "hidden",
  },
  foundAvatar: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.primary + "22",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.primary + "44",
  },
  foundLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.primary, textAlign: "right", marginBottom: 2 },
  foundName:  { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },

  successCircle: { width: 130, height: 130, borderRadius: 65, alignItems: "center", justifyContent: "center" },
  successTitle:  { fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.textPrimary, textAlign: "center" },
  successSub:    { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 24 },
});
