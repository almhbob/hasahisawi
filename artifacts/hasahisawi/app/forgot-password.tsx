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
import { firebaseSendPasswordReset, isFirebaseAuthAvailable } from "@/lib/firebase/auth";

// ── المسارات ──────────────────────────────────────────────────────────────────
// email  → Firebase sendPasswordResetEmail (لا يحتاج SMTP)
// phone  → OTP مخصص عبر الخادم (يتطلب SMS مُهيَّأ)

type Step = "input" | "email_sent" | "otp" | "password" | "done";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 20 : insets.top;
  const confirmRef = useRef<TextInput>(null);
  const otpRefs = [
    useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null),
    useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null),
  ];

  const [step,            setStep]            = useState<Step>("input");
  const [identifier,     setIdentifier]      = useState("");
  const [userName,       setUserName]        = useState("");
  const [otpDigits,      setOtpDigits]       = useState(["","","","","",""]);
  const [otpTimer,       setOtpTimer]        = useState(0);
  const [resetToken,     setResetToken]      = useState("");
  const [newPassword,    setNewPassword]     = useState("");
  const [confirmPwd,     setConfirmPwd]      = useState("");
  const [showNew,        setShowNew]         = useState(false);
  const [showConfirm,    setShowConfirm]     = useState(false);
  const [loading,        setLoading]         = useState(false);
  const [error,          setError]           = useState("");

  const isEmail = identifier.includes("@");
  const base    = getApiUrl();

  // ── عداد إعادة الإرسال ───────────────────────────────────────────────────
  useEffect(() => {
    if (otpTimer <= 0) return;
    const t = setTimeout(() => setOtpTimer(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [otpTimer]);

  // ── Step 1: التحقق من وجود الحساب واختيار المسار ─────────────────────────
  const handleSubmitIdentifier = async () => {
    const id = identifier.trim();
    if (!id) { setError("أدخل رقم الهاتف أو البريد الإلكتروني"); return; }
    setError(""); setLoading(true);
    try {
      // تحقق من وجود الحساب في الخادم
      const res  = await fetchWithTimeout(`${base}/api/auth/check-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id }),
      }, 20000);
      const data = await res.json();

      if (!res.ok) { setError(data.error || "تعذّر الاتصال بالخادم"); return; }
      if (!data.exists) {
        setError("لا يوجد حساب مسجّل بهذا الرقم أو البريد الإلكتروني");
        return;
      }
      setUserName(data.name || "");

      if (isEmail) {
        // ── مسار البريد الإلكتروني: Firebase يرسل رابط الإعادة ──────────────
        if (!isFirebaseAuthAvailable()) {
          setError("خدمة إعادة كلمة المرور غير متاحة حالياً. تواصل مع الدعم.");
          return;
        }
        await firebaseSendPasswordReset(id.toLowerCase());
        setStep("email_sent");
      } else {
        // ── مسار الهاتف: إرسال OTP عبر الخادم ───────────────────────────────
        const otpRes  = await fetchWithTimeout(`${base}/api/auth/send-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone_or_email: id, type: "password_reset" }),
        }, 20000);
        const otpData = await otpRes.json();
        if (!otpRes.ok) { setError(otpData.error || "تعذّر إرسال رمز التحقق"); return; }
        setOtpTimer(120);
        setStep("otp");
      }
    } catch (e: any) {
      if (e?.code === "auth/user-not-found") {
        setError("لا يوجد حساب Firebase مرتبط بهذا البريد. جرّب مع رقم الهاتف.");
      } else if (e?.code === "auth/invalid-email") {
        setError("البريد الإلكتروني غير صالح");
      } else if (e?.code === "auth/too-many-requests") {
        setError("طلبات كثيرة جداً. انتظر بضع دقائق وحاول مجدداً.");
      } else {
        setError(e?.name === "AbortError"
          ? "انتهت مهلة الاتصال. تحقق من اتصالك بالإنترنت."
          : "تعذّر الاتصال. تحقق من اتصالك وحاول مجدداً.");
      }
    } finally { setLoading(false); }
  };

  // ── إعادة إرسال OTP (للهاتف فقط) ────────────────────────────────────────
  const handleResendOtp = async () => {
    setError(""); setLoading(true);
    try {
      const res  = await fetchWithTimeout(`${base}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_or_email: identifier.trim(), type: "password_reset" }),
      }, 20000);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "تعذّر إعادة الإرسال"); return; }
      setOtpDigits(["","","","","",""]);
      setOtpTimer(120);
    } catch { setError("تعذّر إرسال الرمز"); }
    finally { setLoading(false); }
  };

  // ── Step 2a: التحقق من OTP ────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length < 6) { setError("أدخل الرمز المكوّن من 6 أرقام"); return; }
    setError(""); setLoading(true);
    try {
      const res  = await fetchWithTimeout(`${base}/api/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_or_email: identifier.trim(), code }),
      }, 20000);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "رمز غير صحيح"); return; }
      setResetToken(data.reset_token);
      setStep("password");
    } catch (e: any) {
      setError(e?.name === "AbortError" ? "انتهت مهلة الاتصال." : "تعذّر التحقق. حاول مجدداً.");
    } finally { setLoading(false); }
  };

  // ── Step 3: تغيير كلمة المرور (للهاتف فقط) ───────────────────────────────
  const handleReset = async () => {
    if (!newPassword || !confirmPwd)  { setError("أدخل كلمة المرور الجديدة وتأكيدها"); return; }
    if (newPassword.length < 6)       { setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    if (newPassword !== confirmPwd)   { setError("كلمتا المرور غير متطابقتين"); return; }
    setError(""); setLoading(true);
    try {
      const res  = await fetchWithTimeout(`${base}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
      }, 20000);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "حدث خطأ. حاول مجدداً."); return; }
      setStep("done");
    } catch (e: any) {
      setError(e?.name === "AbortError" ? "انتهت مهلة الاتصال." : "تعذّر الاتصال. تحقق من اتصالك.");
    } finally { setLoading(false); }
  };

  const handleOtpChange = (value: string, index: number) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next  = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    if (digit && index < 5)     otpRefs[index + 1].current?.focus();
    if (!digit && index > 0 && !value) otpRefs[index - 1].current?.focus();
    setError("");
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otpDigits[index] && index > 0)
      otpRefs[index - 1].current?.focus();
  };

  const pwdStrength = newPassword.length === 0 ? "" : newPassword.length < 4 ? "ضعيفة" : newPassword.length < 8 ? "متوسطة" : "قوية";
  const pwdColor    = newPassword.length < 4 ? Colors.danger : newPassword.length < 8 ? Colors.accent : Colors.primary;

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

          {/* ══ Step 1: إدخال المعرّف ══ */}
          {step === "input" && (
            <Animated.View entering={FadeInDown.springify()} style={styles.card}>
              <View style={styles.iconWrap}>
                <LinearGradient colors={[Colors.primaryDeep + "66", Colors.primaryDeep + "22"]} style={styles.iconCircle}>
                  <Ionicons name="key-outline" size={34} color={Colors.primary} />
                </LinearGradient>
              </View>

              <Text style={styles.cardTitle}>استعادة كلمة المرور</Text>
              <Text style={styles.cardSub}>
                أدخل البريد الإلكتروني أو رقم الهاتف المرتبط بحسابك
              </Text>

              {/* بطاقات توضيح المسار */}
              <View style={styles.methodRow}>
                <View style={[styles.methodCard, isEmail && styles.methodCardActive]}>
                  <Ionicons name="mail-outline" size={18} color={isEmail ? Colors.primary : Colors.textMuted} />
                  <Text style={[styles.methodText, isEmail && { color: Colors.primary }]}>بريد إلكتروني</Text>
                  <Text style={[styles.methodSub, isEmail && { color: Colors.primary + "aa" }]}>رابط إعادة تعيين</Text>
                </View>
                <View style={[styles.methodCard, !isEmail && styles.methodCardActive]}>
                  <Ionicons name="phone-portrait-outline" size={18} color={!isEmail ? Colors.primary : Colors.textMuted} />
                  <Text style={[styles.methodText, !isEmail && { color: Colors.primary }]}>رقم الهاتف</Text>
                  <Text style={[styles.methodSub, !isEmail && { color: Colors.primary + "aa" }]}>رمز OTP</Text>
                </View>
              </View>

              <View style={[styles.inputWrap, error ? { borderColor: Colors.danger + "88" } : null]}>
                <Ionicons
                  name={isEmail ? "mail-outline" : "call-outline"}
                  size={18} color={Colors.textMuted} style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  value={identifier}
                  onChangeText={t => { setIdentifier(t); setError(""); }}
                  placeholder="09XXXXXXXX أو البريد الإلكتروني"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType={isEmail ? "email-address" : "phone-pad"}
                  autoCapitalize="none"
                  textAlign="right"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmitIdentifier}
                />
              </View>

              {error ? (
                <Animated.View entering={FadeIn} style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              ) : null}

              <TouchableOpacity
                onPress={handleSubmitIdentifier} disabled={loading} activeOpacity={0.85}
                style={[styles.btnWrap, loading && { opacity: 0.7 }]}
              >
                <LinearGradient colors={[Colors.primary, Colors.primaryDim]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name={isEmail ? "send-outline" : "chatbubble-ellipses-outline"} size={18} color="#fff" />
                        <Text style={styles.btnText}>
                          {isEmail ? "إرسال رابط الإعادة" : "إرسال رمز التحقق"}
                        </Text>
                      </>
                  }
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.back()} style={styles.linkRow}>
                <Text style={styles.linkText}>العودة إلى تسجيل الدخول</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ══ Step 2a: البريد الإلكتروني — تم الإرسال ══ */}
          {step === "email_sent" && (
            <Animated.View entering={FadeInUp.springify()} style={[styles.card, styles.doneCard]}>
              <LinearGradient colors={[Colors.primary + "22", Colors.primary + "08"]} style={styles.successCircle}>
                <Ionicons name="mail-open-outline" size={64} color={Colors.primary} />
              </LinearGradient>

              <Text style={styles.successTitle}>تحقق من بريدك الإلكتروني</Text>

              <Text style={styles.successSub}>
                أرسلنا رابطاً لإعادة تعيين كلمة المرور إلى{"\n"}
                <Text style={{ color: Colors.primary, fontWeight: "700" }}>{identifier}</Text>
              </Text>

              <View style={styles.tipBox}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.accent} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tipText}>• افتح البريد من Firebase (noreply@hasahisawi.firebaseapp.com)</Text>
                  <Text style={styles.tipText}>• اضغط على الرابط لتعيين كلمة مرور جديدة</Text>
                  <Text style={styles.tipText}>• تحقق من مجلد البريد المزعج إن لم تجده</Text>
                  <Text style={styles.tipText}>• الرابط صالح لمدة ساعة واحدة</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSubmitIdentifier}
                disabled={loading}
                style={[styles.secondaryBtn, loading && { opacity: 0.6 }]}
              >
                {loading
                  ? <ActivityIndicator color={Colors.primary} size="small" />
                  : <>
                      <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
                      <Text style={styles.secondaryBtnTxt}>إعادة الإرسال</Text>
                    </>
                }
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.replace("/login" as any)} activeOpacity={0.85} style={styles.btnWrap}>
                <LinearGradient colors={[Colors.primary, Colors.primaryDim]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btn}>
                  <Ionicons name="log-in-outline" size={18} color="#fff" />
                  <Text style={styles.btnText}>العودة لتسجيل الدخول</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ══ Step 2b: الهاتف — إدخال OTP ══ */}
          {step === "otp" && (
            <Animated.View entering={FadeInDown.springify()} style={styles.card}>
              <View style={styles.iconWrap}>
                <LinearGradient colors={[Colors.primaryDeep + "66", Colors.primaryDeep + "22"]} style={styles.iconCircle}>
                  <Ionicons name="phone-portrait-outline" size={34} color={Colors.primary} />
                </LinearGradient>
              </View>

              {/* بانر المستخدم */}
              {userName ? (
                <View style={styles.foundBanner}>
                  <LinearGradient
                    colors={[Colors.primaryDeep + "44", Colors.primaryDeep + "11"]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.foundAvatar}>
                    <Ionicons name="person-circle-outline" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foundLabel}>تم العثور على الحساب</Text>
                    <Text style={styles.foundName}>{userName}</Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.cardTitle}>أدخل رمز التحقق</Text>
              <Text style={styles.cardSub}>
                أرسلنا رمزاً مكوّناً من 6 أرقام عبر SMS إلى{"\n"}
                <Text style={{ color: Colors.primary, fontWeight: "700" }}>{identifier}</Text>
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
                    onSubmitEditing={() => i === 5 ? handleVerifyOtp() : otpRefs[i + 1].current?.focus()}
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
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>التحقق من الرمز</Text>}
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.resendRow}>
                {otpTimer > 0 ? (
                  <Text style={styles.resendTimer}>
                    إعادة الإرسال بعد {Math.floor(otpTimer / 60)}:{String(otpTimer % 60).padStart(2, "0")}
                  </Text>
                ) : (
                  <TouchableOpacity onPress={handleResendOtp} disabled={loading} style={styles.resendBtn}>
                    <Ionicons name="refresh-outline" size={14} color={Colors.primary} />
                    <Text style={styles.resendBtnTxt}>إعادة إرسال الرمز</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                onPress={() => { setStep("input"); setError(""); setOtpDigits(["","","","","",""]); }}
                style={styles.linkRow}
              >
                <Ionicons name="arrow-back-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.linkText}>تغيير الرقم أو استخدام البريد الإلكتروني</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ══ Step 3: كلمة المرور الجديدة (للهاتف) ══ */}
          {step === "password" && (
            <Animated.View entering={FadeInDown.springify()} style={styles.card}>
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
                  <Text style={styles.foundName}>{userName || identifier}</Text>
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
                <View style={[styles.inputWrap, confirmPwd.length > 0 && newPassword !== confirmPwd && { borderColor: Colors.danger + "88" }]}>
                  <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={styles.inputIcon}>
                    <Ionicons name={showConfirm ? "eye-outline" : "eye-off-outline"} size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <TextInput
                    ref={confirmRef}
                    style={styles.input}
                    value={confirmPwd}
                    onChangeText={t => { setConfirmPwd(t); setError(""); }}
                    placeholder="أعد كتابة كلمة المرور"
                    placeholderTextColor={Colors.textMuted}
                    secureTextEntry={!showConfirm}
                    textAlign="right"
                    returnKeyType="done"
                    onSubmitEditing={handleReset}
                  />
                  {confirmPwd.length > 0 && (
                    <Ionicons
                      name={newPassword === confirmPwd ? "checkmark-circle" : "close-circle"}
                      size={18}
                      color={newPassword === confirmPwd ? Colors.primary : Colors.danger}
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

          {/* ══ Step 4: تم بنجاح ══ */}
          {step === "done" && (
            <Animated.View entering={FadeInUp.springify()} style={[styles.card, styles.doneCard]}>
              <LinearGradient colors={[Colors.primary + "22", Colors.primary + "08"]} style={styles.successCircle}>
                <Ionicons name="checkmark-circle" size={72} color={Colors.primary} />
              </LinearGradient>
              <Text style={styles.successTitle}>تم بنجاح!</Text>
              <Text style={styles.successSub}>
                تم تغيير كلمة المرور بنجاح.{"\n"}يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.
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

  methodRow: { flexDirection: "row-reverse", gap: 10 },
  methodCard: {
    flex: 1, alignItems: "center", padding: 12, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.divider, backgroundColor: Colors.bg, gap: 4,
  },
  methodCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "10" },
  methodText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  methodSub:  { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },

  card:     { backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, borderColor: Colors.divider, padding: 24, gap: 16 },
  doneCard: { alignItems: "center" },

  iconWrap:   { alignSelf: "center", marginBottom: 4 },
  iconCircle: { width: 80, height: 80, borderRadius: 22, alignItems: "center", justifyContent: "center" },

  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "center" },
  cardSub:   { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },

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

  otpRow:      { flexDirection: "row-reverse", justifyContent: "center", gap: 10, marginVertical: 8 },
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

  fieldBlock: { gap: 6 },
  fieldLabel: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary, textAlign: "right" },

  strengthRow:  { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  strengthBar:  { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.divider },
  strengthLabel:{ fontFamily: "Cairo_500Medium", fontSize: 11, minWidth: 36, textAlign: "right" },

  btnWrap: { marginTop: 4 },
  btn:     { height: 52, borderRadius: 14, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  secondaryBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
    height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.primary,
  },
  secondaryBtnTxt: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary },

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

  tipBox: {
    flexDirection: "row-reverse", gap: 10,
    backgroundColor: Colors.accent + "12", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.accent + "33", alignItems: "flex-start",
  },
  tipText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", lineHeight: 22 },

  successCircle: { width: 130, height: 130, borderRadius: 65, alignItems: "center", justifyContent: "center" },
  successTitle:  { fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.textPrimary, textAlign: "center" },
  successSub:    { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 24 },
});
