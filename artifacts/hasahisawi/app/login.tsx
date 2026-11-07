import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Platform, ActivityIndicator, Image,
  KeyboardAvoidingView, Pressable, Alert, Modal,
} from "react-native";
import { statusCodes } from "@react-native-google-signin/google-signin";
import { GOOGLE_LOGIN_ENABLED } from "@/lib/features";
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeOut, ZoomIn,
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getBiometricLabel, getBiometricIcon } from "@/lib/biometrics";
import { getApiUrl } from "@/lib/query-client";
import { onlyDigits, toLatinDigits } from "@/lib/digits";
import OtpCodeInput, { OtpCodeInputHandle } from "@/components/auth/OtpCodeInput";
import { neu, NeuRaised, NeuInset, NeuBadge, NeuButton, NeuRoundButton, NeuField } from "@/components/auth/neu";

const LOGO = require("@/assets/images/logo.png");
const OTP_TTL = 600;        // 10 دقائق — تطابق صلاحية الخادم
const RESEND_AFTER = 60;    // ثوانٍ قبل السماح بإعادة الإرسال

type Mode = "login" | "register";
type IconName = keyof typeof Ionicons.glyphMap;

const haptic = (t: "ok" | "err" | "tap") => {
  if (Platform.OS === "web") return;
  if (t === "tap") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else Haptics.notificationAsync(t === "ok" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
};

/** يخفي منتصف الرقم/البريد: 0111339623 → 011•••9623 */
function maskIdentifier(id: string) {
  const v = id.trim();
  if (v.includes("@")) {
    const [u, d] = v.split("@");
    return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
  }
  if (v.length <= 6) return v;
  return `${v.slice(0, 3)}${"•".repeat(v.length - 7)}${v.slice(-4)}`;
}

function passwordStrength(p: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  if (!p) return { score: 0, label: "", color: Colors.divider };
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
  if (p.length < 6) return { score: 1, label: "قصيرة جداً", color: Colors.danger };
  if (s <= 1) return { score: 1, label: "ضعيفة", color: Colors.danger };
  if (s === 2) return { score: 2, label: "متوسطة", color: Colors.accent };
  return { score: 3, label: "قوية", color: Colors.primary };
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, register, enterAsGuest, loginWithBiometrics,
          enableBiometrics, biometricsAvailable, biometricsEnabled,
          loginWithGoogleWeb } = useAuth();

  const [mode, setMode]               = useState<Mode>("login");
  const [name, setName]               = useState("");
  const [nationalId, setNationalId]   = useState("");
  const [identifier, setIdentifier]   = useState("");
  const [useEmail, setUseEmail]       = useState(false);
  const [password, setPassword]       = useState("");
  const [confirmPwd, setConfirmPwd]   = useState("");
  const [showPwd, setShowPwd]         = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [birthDay, setBirthDay]       = useState("");
  const [birthMonth, setBirthMonth]   = useState("");
  const [birthYear, setBirthYear]     = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [gender, setGender]           = useState<"male" | "female" | "">("");
  const [feedback, setFeedback]       = useState("");
  const [showExtras, setShowExtras]   = useState(false);
  const [bioLabel, setBioLabel]       = useState("البصمة");
  const [bioIcon, setBioIcon]         = useState<IconName>("finger-print-outline");
  const [bioLoading, setBioLoading]   = useState(false);

  // ── OTP ──────────────────────────────────────────────────
  const [otpStep,      setOtpStep]      = useState(false);
  const [otpCode,      setOtpCode]      = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpSending,   setOtpSending]   = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError,     setOtpError]     = useState("");
  const [otpSuccess,   setOtpSuccess]   = useState(false);
  const [otpSentVia,   setOtpSentVia]   = useState<"sms" | "email" | "none" | null>(null);
  const [devOtp,       setDevOtp]       = useState<string | null>(null);
  const otpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<OtpCodeInputHandle>(null);
  const verifyingRef = useRef(false);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      setBioLabel(await getBiometricLabel());
      setBioIcon(await getBiometricIcon() as IconName);
    })();
  }, []);

  useEffect(() => {
    if (biometricsEnabled && biometricsAvailable && mode === "login") handleBiometricLogin();
  }, [biometricsEnabled, biometricsAvailable]);

  useEffect(() => () => { if (otpTimerRef.current) clearInterval(otpTimerRef.current); }, []);

  const promptEnableBiometrics = (id: string) => {
    if (!biometricsAvailable || biometricsEnabled) return;
    Alert.alert(
      `تفعيل ${bioLabel}`,
      `هل تريد استخدام ${bioLabel} لتسجيل الدخول بسرعة في المرة القادمة؟`,
      [
        { text: "لا شكراً", style: "cancel" },
        { text: "نعم، فعّل", onPress: () => { enableBiometrics(id).catch((e: any) => Alert.alert("تعذّر تفعيل البصمة", e?.message || "حاول لاحقاً من الملف الشخصي")); } },
      ],
    );
  };

  const reset = () => {
    setName(""); setNationalId(""); setIdentifier("");
    setPassword(""); setConfirmPwd(""); setError("");
    setShowPwd(false); setUseEmail(false);
    setBirthDay(""); setBirthMonth(""); setBirthYear("");
    setNeighborhood(""); setGender(""); setFeedback(""); setShowExtras(false);
  };

  const getBirthDateISO = (): string | undefined => {
    const d = birthDay.padStart(2, "0");
    const m = birthMonth.padStart(2, "0");
    const y = birthYear;
    if (birthDay && birthMonth && y.length === 4) return `${y}-${m}-${d}`;
    return undefined;
  };

  const buildNeighborhood = () => neighborhood.trim() || undefined;
  const cleanIdentifier = () => {
    const id = toLatinDigits(identifier).trim();
    const isEmail = useEmail || id.includes("@");
    return isEmail ? id : id.replace(/[\s-]+/g, "");
  };

  // قلب البطاقة بين «الدخول» و«حساب جديد» — تتبدّل المحتويات عند منتصف الدوران
  const flip = useSharedValue(0);
  const flipping = useRef(false);
  const applyMode = (m: Mode, keepIdentifier: string) => {
    reset();
    if (keepIdentifier) setIdentifier(keepIdentifier);
    setMode(m);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    flip.value = -90;
    flip.value = withTiming(0, { duration: 260 });
    flipping.current = false;
  };
  const switchMode = (m: Mode, keepIdentifier?: string) => {
    if (m === mode || flipping.current) return;
    haptic("tap");
    flipping.current = true;
    flip.value = withTiming(90, { duration: 200 }, done => { if (done) runOnJS(applyMode)(m, keepIdentifier ?? ""); });
  };
  const cardFlipStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 1200 }, { rotateY: `${flip.value}deg` }] }));

  const validate = (): string | null => {
    if (mode === "register") {
      if (!name.trim()) return "يرجى إدخال الاسم الثلاثي كاملاً";
      const nameParts = name.trim().split(/\s+/).filter(Boolean);
      if (nameParts.length < 3) return "يرجى إدخال الاسم ثلاثياً (الاسم الأول والثاني والثالث)";
      if (!gender) return "يرجى تحديد الجنس (ذكر أو أنثى)";
      const nid = nationalId.trim();
      if (nid && !/^\d{8,20}$/.test(nid)) return "رقم الهوية يجب أن يكون 8–20 رقماً";
      if (!useEmail) {
        const phone = cleanIdentifier();
        if (!phone) return "يرجى إدخال رقم الهاتف";
        if (!/^\d{10}$/.test(phone)) return "رقم الهاتف يجب أن يكون 10 أرقام بالضبط";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())) {
        return "صيغة البريد الإلكتروني غير صحيحة";
      }
    }
    if (!identifier.trim()) return "يرجى إدخال البريد أو رقم الهاتف";
    if (!password)           return "يرجى إدخال كلمة المرور";
    if (password.length < 6) return "كلمة المرور 6 أحرف على الأقل";
    if (mode === "register" && password !== confirmPwd) return "كلمتا المرور غير متطابقتين";
    return null;
  };

  const sendFeedback = (id: string, isEmail: boolean) => {
    if (!feedback.trim()) return;
    fetch(`${getApiUrl()}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "suggestion", title: "اقتراح عند التسجيل", body: feedback.trim(), sender_name: name.trim(), phone: !isEmail ? id : undefined, category: "تسجيل" }),
    }).catch(() => {});
  };

  const handleSubmit = async () => {
    setError("");
    const err = validate();
    if (err) { setError(err); haptic("err"); return; }

    if (mode === "register") { await handleSendOtp(); return; }

    setLoading(true);
    try {
      const id = cleanIdentifier();
      await login(id, password);
      promptEnableBiometrics(id);
      haptic("ok");
    } catch (e: any) {
      setError(e.message || "حدث خطأ، يرجى المحاولة مرة أخرى");
      haptic("err");
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => { haptic("tap"); enterAsGuest(); };

  const handleBiometricLogin = async () => {
    setBioLoading(true);
    try {
      let success = false;
      try { success = await loginWithBiometrics(); }
      catch (e: any) { setError(e?.message || "تعذّر الدخول بالبصمة"); }
      haptic(success ? "ok" : "err");
    } finally {
      setBioLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (loading) return;
    setError("");
    setLoading(true);
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setError("استغرق تسجيل الدخول وقتاً طويلاً. تحقق من اتصالك وأعد المحاولة.");
    }, 180000);
    try {
      await loginWithGoogleWeb();
      haptic("ok");
    } catch (e: any) {
      const code = e?.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || String(e?.message || "").startsWith("أُلغي")) return;
      if (code === "auth/unauthorized-domain" || e?.message?.includes("unauthorized-domain")) {
        setError("تسجيل الدخول بـ Google غير متاح حالياً. يرجى استخدام البريد الإلكتروني أو رقم الهاتف.");
      } else if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
        // ألغى المستخدم أو تسجيل جارٍ — لا خطأ
      } else if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError("خدمات Google غير متاحة على هذا الجهاز");
      } else if (code === "auth/popup-blocked") {
        setError("المتصفح حجب نافذة تسجيل الدخول. فعّل النوافذ المنبثقة وأعد المحاولة");
      } else if (String(code) === "10" || e?.message?.includes("DEVELOPER_ERROR")) {
        setError("يرجى المحاولة مرة أخرى — إذا استمرت المشكلة استخدم البريد الإلكتروني أو رقم الهاتف.");
      } else {
        setError(e?.message || "فشل تسجيل الدخول عبر Google");
      }
      haptic("err");
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false);
    }
  };

  // ── OTP Handlers ─────────────────────────────────────────
  const startOtpCountdown = () => {
    setOtpCountdown(OTP_TTL);
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    otpTimerRef.current = setInterval(() => {
      setOtpCountdown(c => {
        if (c <= 1) { clearInterval(otpTimerRef.current!); otpTimerRef.current = null; return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const closeOtp = () => {
    setOtpStep(false);
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
  };

  const proceedRegisterDirect = async () => {
    setLoading(true);
    try {
      const id = cleanIdentifier();
      const isEmail = useEmail || id.includes("@");
      await register(name.trim(), nationalId.trim(), id, isEmail, password, getBirthDateISO(), buildNeighborhood(), gender || undefined);
      promptEnableBiometrics(id);
      sendFeedback(id, isEmail);
    } catch (regErr: any) {
      setError(regErr?.message || "تعذر إنشاء الحساب، يرجى المحاولة مرة أخرى");
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = async () => {
    const res = await fetch(`${getApiUrl()}/api/auth/send-registration-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_or_email: cleanIdentifier() }),
    });
    let data: any = {};
    try { data = await res.json(); } catch { throw new Error("_otp_unavailable"); }
    if (!res.ok) throw new Error(data.error || "فشل إرسال الرمز");
    setDevOtp(data.dev_otp ?? null);
    setOtpSentVia(data.sent_via ?? "none");
    setOtpCode("");
    setOtpError("");
    setOtpSuccess(false);
    startOtpCountdown();
  };

  const handleSendOtp = async () => {
    setOtpSending(true);
    setError("");
    setDevOtp(null);
    try {
      await requestOtp();
      setOtpStep(true);
    } catch (e: any) {
      if (e.message === "_otp_unavailable") await proceedRegisterDirect();
      else { setError(e.message || "فشل إرسال رمز التحقق"); haptic("err"); }
    }
    setOtpSending(false);
  };

  const handleResendOtp = async () => {
    if (otpCountdown > OTP_TTL - RESEND_AFTER || otpSending) return;
    setOtpSending(true);
    try {
      await requestOtp();
      otpInputRef.current?.focus();
    } catch (e: any) {
      setOtpError(e.message === "_otp_unavailable" ? "تعذّر الاتصال بالخادم" : (e.message || "فشل إعادة الإرسال"));
    }
    setOtpSending(false);
  };

  const handleVerifyOtp = async (codeArg?: string) => {
    const code = onlyDigits(codeArg ?? otpCode, 6);
    if (code.length !== 6) { setOtpError("يرجى إدخال الرمز المكوّن من 6 أرقام"); return; }
    if (verifyingRef.current) return; // منع الإرسال المزدوج (ضغطتان أو تحقق تلقائي + زر)
    verifyingRef.current = true;
    setOtpVerifying(true);
    setOtpError("");
    try {
      const id = cleanIdentifier();
      const isEmail = useEmail || id.includes("@");
      await register(name.trim(), nationalId.trim(), id, isEmail, password, getBirthDateISO(), buildNeighborhood(), gender || undefined, code);
      setOtpSuccess(true);
      haptic("ok");
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      sendFeedback(id, isEmail);
      setTimeout(() => { setOtpStep(false); promptEnableBiometrics(id); }, 450);
    } catch (e: any) {
      const msg: string = e?.message || "رمز التحقق غير صحيح أو منتهي الصلاحية";
      haptic("err");
      // خطأ في بيانات الحساب لا في الرمز: نعود للنموذج ونعرضه هناك
      if (msg.includes("مسجّل مسبقاً") || msg.includes("مسجلة مسبقاً")) {
        closeOtp();
        setError(msg);
      } else {
        setOtpError(msg);
        if (msg.includes("غير صحيح")) setOtpCode("");
        otpInputRef.current?.focus();
      }
    } finally {
      verifyingRef.current = false;
      setOtpVerifying(false);
    }
  };

  const isRegister = mode === "register";
  const busy = loading || otpSending;
  const strength = passwordStrength(password);
  const pwdMismatch = isRegister && !!confirmPwd && confirmPwd !== password;
  const canResend = otpCountdown <= OTP_TTL - RESEND_AFTER;
  const showGoogle = GOOGLE_LOGIN_ENABLED && !isRegister;
  const showBio = !isRegister && biometricsAvailable && biometricsEnabled;
  const phoneMode = isRegister && !useEmail;
  const nameOk = name.trim().split(/\s+/).filter(Boolean).length >= 3;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* هالات لونية خفيفة خلف البطاقة */}
      <View pointerEvents="none" style={[styles.blob, { top: -90, right: -70, backgroundColor: Colors.primary + "1F" }]} />

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }]}
      >
        {/* ─── الهوية ─────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.brandRow}>
          <NeuRaised radius={18} depth={5} style={styles.logoChip}>
            <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
          </NeuRaised>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>حصاحيصاوي</Text>
            <Text style={styles.tagline}>بوابتك الذكية لمدينة الحصاحيصا</Text>
          </View>
        </Animated.View>

        {/* ─── البطاقة البارزة ─────────────────────── */}
        <Animated.View entering={FadeInUp.delay(100).springify().damping(18)} style={cardFlipStyle}>
          <NeuRaised radius={30} depth={12} style={styles.card}>
            <View style={styles.badgeWrap}>
              <NeuBadge icon={isRegister ? "sparkles" : "lock-closed"} color={isRegister ? Colors.accent : Colors.primary} />
            </View>
            <Text style={styles.heading}>{isRegister ? "إنشاء حساب" : "أهلاً بك"}</Text>
            <Text style={styles.subheading}>
              {isRegister ? "ابدأ رحلتك مع مجتمع الحصاحيصا" : "سجّل الدخول لمتابعة خدماتك"}
            </Text>

            <View style={styles.form}>
              {isRegister && (
                <NeuField
                  label="الاسم الثلاثي"
                  icon="person-outline"
                  value={name}
                  onChangeText={setName}
                  placeholder="محمد أحمد عبد الله"
                  autoCapitalize="words"
                  textContentType="name"
                  autoComplete="name"
                  trailing={nameOk ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} style={styles.trail} /> : undefined}
                />
              )}

              {isRegister && (
                <View style={styles.segRow}>
                  {([
                    { val: "male" as const,   label: "ذكر",  icon: "man-outline" as const },
                    { val: "female" as const, label: "أنثى", icon: "woman-outline" as const },
                  ]).map(opt => (
                    <Choice key={opt.val} label={opt.label} icon={opt.icon} on={gender === opt.val} onPress={() => { haptic("tap"); setGender(opt.val); }} />
                  ))}
                </View>
              )}

              {isRegister && (
                <NeuInset radius={16} style={styles.typeTrack}>
                  <TypeToggle label="رقم الهاتف" icon="call-outline" active={!useEmail} onPress={() => { setUseEmail(false); setIdentifier(""); }} />
                  <TypeToggle label="بريد إلكتروني" icon="mail-outline" active={useEmail} onPress={() => { setUseEmail(true); setIdentifier(""); }} />
                </NeuInset>
              )}

              <NeuField
                label={!isRegister ? "البريد أو رقم الهاتف" : useEmail ? "البريد الإلكتروني" : "رقم الهاتف"}
                icon={!isRegister ? "person-outline" : useEmail ? "mail-outline" : "call-outline"}
                value={identifier}
                onChangeText={v => setIdentifier(phoneMode ? onlyDigits(v, 10) : toLatinDigits(v))}
                placeholder={phoneMode ? "0912345678" : useEmail ? "example@email.com" : "0912345678 أو بريدك"}
                keyboardType={phoneMode ? "phone-pad" : "email-address"}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={phoneMode ? "telephoneNumber" : "username"}
                autoComplete={phoneMode ? "tel" : "username"}
                maxLength={phoneMode ? 10 : 120}
                hint={phoneMode ? "سيصلك رمز تحقق على هذا الرقم" : undefined}
                trailing={phoneMode ? <Text style={[styles.counter, identifier.length === 10 && { color: Colors.primary }]}>{identifier.length}/10</Text> : undefined}
              />

              <NeuField
                label="كلمة المرور"
                icon="lock-closed-outline"
                value={password}
                onChangeText={setPassword}
                placeholder={isRegister ? "6 أحرف على الأقل" : undefined}
                secureTextEntry={!showPwd}
                textContentType={isRegister ? "newPassword" : "password"}
                autoComplete={isRegister ? "password-new" : "password"}
                onSubmitEditing={!isRegister ? handleSubmit : undefined}
                returnKeyType={!isRegister ? "go" : "next"}
                trailing={
                  <Pressable onPress={() => setShowPwd(p => !p)} hitSlop={10} style={styles.trail} accessibilityLabel={showPwd ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                    <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textMuted} />
                  </Pressable>
                }
              />

              {isRegister && !!password && (
                <View style={styles.strengthRow}>
                  <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                  <View style={styles.strengthBars}>
                    {[1, 2, 3].map(i => (
                      <View key={i} style={[styles.strengthBar, { backgroundColor: i <= strength.score ? strength.color : neu.insetTop }]} />
                    ))}
                  </View>
                </View>
              )}

              {isRegister && (
                <NeuField
                  label="تأكيد كلمة المرور"
                  icon="shield-checkmark-outline"
                  value={confirmPwd}
                  onChangeText={setConfirmPwd}
                  secureTextEntry={!showPwd}
                  textContentType="newPassword"
                  error={pwdMismatch}
                  hint={pwdMismatch ? "كلمتا المرور غير متطابقتين" : undefined}
                  trailing={!!confirmPwd && !pwdMismatch ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} style={styles.trail} /> : undefined}
                />
              )}

              {!isRegister && (
                <TouchableOpacity onPress={() => router.push("/forgot-password" as any)} activeOpacity={0.7} style={styles.forgotBtn}>
                  <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
                </TouchableOpacity>
              )}

              {/* معلومات إضافية — مطوية افتراضياً لتقصير النموذج */}
              {isRegister && (
                <Pressable onPress={() => setShowExtras(v => !v)} style={styles.extrasToggle} accessibilityRole="button">
                  <Ionicons name={showExtras ? "remove-circle-outline" : "add-circle-outline"} size={19} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.extrasTitle}>معلومات إضافية</Text>
                    <Text style={styles.extrasSub}>الهوية، تاريخ الميلاد، الحي، اقتراح — اختيارية</Text>
                  </View>
                  <Ionicons name={showExtras ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
                </Pressable>
              )}

              {isRegister && showExtras && (
                <Animated.View entering={FadeInDown.duration(220)} style={{ gap: 14 }}>
                  <NeuField
                    label="رقم الهوية الوطنية (اختياري)"
                    icon="id-card-outline"
                    value={nationalId}
                    onChangeText={v => setNationalId(onlyDigits(v, 20))}
                    keyboardType="number-pad"
                    maxLength={20}
                    placeholder="للتوثيق فقط"
                  />
                  <View style={{ gap: 6 }}>
                    <Text style={styles.smallLabel}>تاريخ الميلاد (اختياري)</Text>
                    <View style={styles.dateRow}>
                      <DateBox label="اليوم" placeholder="01" value={birthDay} max={2} onChange={setBirthDay} />
                      <DateBox label="الشهر" placeholder="01" value={birthMonth} max={2} onChange={setBirthMonth} />
                      <DateBox label="السنة" placeholder="1990" value={birthYear} max={4} onChange={setBirthYear} flex={1.6} />
                    </View>
                  </View>
                  <NeuField
                    label="القرية أو الحي (اختياري)"
                    icon="location-outline"
                    value={neighborhood}
                    onChangeText={v => setNeighborhood(v.slice(0, 40))}
                    maxLength={40}
                  />
                  <NeuField
                    label="مشكلة أو اقتراح (اختياري)"
                    icon="chatbubble-ellipses-outline"
                    value={feedback}
                    onChangeText={setFeedback}
                    placeholder="هل لديك مشكلة أو اقتراح لميزة جديدة؟"
                    multiline
                  />
                </Animated.View>
              )}

              {!!error && (
                <Animated.View entering={FadeInDown.duration(200)} style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.errorText}>{error}</Text>
                    {isRegister && (error.includes("مسجّل مسبقاً") || error.includes("مسجلة مسبقاً")) && (
                      <TouchableOpacity onPress={() => switchMode("login", identifier)} style={{ marginTop: 6 }}>
                        <Text style={styles.errorLink}>انتقل إلى تسجيل الدخول ←</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Animated.View>
              )}

              <NeuButton
                label={isRegister ? "متابعة والتحقق" : "تسجيل الدخول"}
                icon={isRegister ? "shield-checkmark-outline" : "arrow-back"}
                loading={busy}
                onPress={handleSubmit}
              />

              {/* تبديل الوضع: زر دائري بارز كما في التصميم المرجعي */}
              <View style={styles.switchRow}>
                <Text style={styles.switchHint}>{isRegister ? "لديك حساب بالفعل؟" : "ليس لديك حساب؟"}</Text>
                <NeuRoundButton
                  icon={isRegister ? "arrow-forward" : "add"}
                  onPress={() => switchMode(isRegister ? "login" : "register")}
                  accessibilityLabel={isRegister ? "تسجيل الدخول" : "إنشاء حساب جديد"}
                />
                <Text style={styles.switchLink} onPress={() => switchMode(isRegister ? "login" : "register")}>
                  {isRegister ? "سجّل الدخول" : "أنشئ حساباً"}
                </Text>
              </View>

              {(showBio || showGoogle) && (
                <View style={styles.altRow}>
                  {showBio && (
                    <View style={styles.altItem}>
                      <NeuRoundButton icon={bioIcon} onPress={handleBiometricLogin} loading={bioLoading} size={52} accessibilityLabel={bioLabel} />
                      <Text style={styles.altText}>{bioLabel}</Text>
                    </View>
                  )}
                  {showGoogle && (
                    <View style={styles.altItem}>
                      <NeuRoundButton icon="logo-google" onPress={handleGoogleLogin} size={52} color="#4285F4" accessibilityLabel="المتابعة عبر Google" />
                      <Text style={styles.altText}>Google</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </NeuRaised>
        </Animated.View>

        <TouchableOpacity style={styles.guestBtn} onPress={handleGuest} activeOpacity={0.7}>
          <Ionicons name="compass-outline" size={18} color={Colors.textSecondary} />
          <Text style={styles.guestText}>تصفّح كزائر بدون حساب</Text>
          <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      {/* ─── شاشة رمز التحقق ──────────────────────── */}
      <Modal visible={otpStep} animationType="slide" onRequestClose={closeOtp} statusBarTranslucent>
        <KeyboardAvoidingView style={otpS.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View pointerEvents="none" style={[styles.blob, { top: -80, left: -60, backgroundColor: Colors.primary + "1F" }]} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[otpS.scroll, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 20 }]}>
            <View style={otpS.topBar}>
              <NeuRoundButton icon="arrow-forward" onPress={closeOtp} size={42} color={Colors.textPrimary} accessibilityLabel="رجوع" />
              <Text style={otpS.stepText}>الخطوة الأخيرة</Text>
              <View style={{ width: 42 }} />
            </View>

            <NeuRaised radius={30} depth={12} style={otpS.card}>
              {otpSuccess ? (
                <Animated.View entering={ZoomIn.springify().damping(14)} style={otpS.successWrap}>
                  <NeuBadge size={96}>
                    <Ionicons name="checkmark" size={46} color={Colors.primary} />
                  </NeuBadge>
                  <Text style={[otpS.title, { color: Colors.primary }]}>تم التحقق بنجاح</Text>
                  <Text style={otpS.subtitle}>أُنشئ حسابك — مرحباً بك في حصاحيصاوي</Text>
                </Animated.View>
              ) : (
                <>
                  <View style={styles.badgeWrap}>
                    <NeuBadge icon={otpSentVia === "email" ? "mail-open-outline" : "chatbubble-ellipses-outline"} />
                  </View>
                  <Text style={otpS.title}>أدخل رمز التحقق</Text>
                  <Text style={otpS.subtitle}>
                    {otpSentVia === "email" ? "أرسلنا رمزاً من 6 أرقام إلى بريدك" : otpSentVia === "sms" ? "أرسلنا رسالة برمز من 6 أرقام إلى" : "رمز من 6 أرقام لتأكيد"}
                  </Text>
                  <View style={otpS.idRow}>
                    <Text style={otpS.idText}>{maskIdentifier(cleanIdentifier())}</Text>
                    <Text style={otpS.editLink} onPress={closeOtp}>تعديل</Text>
                  </View>

                  {devOtp ? (
                    <Pressable onPress={() => { haptic("tap"); setOtpCode(devOtp); setOtpError(""); }} accessibilityRole="button" accessibilityLabel={`تعبئة الرمز ${devOtp}`}>
                      <NeuInset radius={18} style={otpS.devCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={otpS.devLabel}>رمزك</Text>
                          <Text style={otpS.devCode}>{devOtp}</Text>
                        </View>
                        <View style={otpS.fillBtn}>
                          <Ionicons name="flash" size={14} color="#fff" />
                          <Text style={otpS.fillText}>تعبئة</Text>
                        </View>
                      </NeuInset>
                    </Pressable>
                  ) : otpSentVia === "none" ? (
                    <View style={otpS.warnCard}>
                      <Ionicons name="warning-outline" size={18} color={Colors.accentDeep} />
                      <Text style={otpS.warnText}>تعذّر إرسال الرمز تلقائياً — تواصل مع الدعم لتلقّي رمزك</Text>
                    </View>
                  ) : null}

                  <View style={{ marginTop: 10 }}>
                    <OtpCodeInput
                      ref={otpInputRef}
                      value={otpCode}
                      onChange={v => { setOtpCode(v); if (otpError) setOtpError(""); }}
                      onComplete={c => handleVerifyOtp(c)}
                      error={!!otpError}
                      disabled={otpVerifying}
                    />
                  </View>

                  {!!otpError && (
                    <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(120)} style={otpS.errorRow}>
                      <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                      <Text style={otpS.errorText}>{otpError}</Text>
                    </Animated.View>
                  )}

                  <View style={otpS.timerWrap}>
                    <NeuInset radius={4} style={otpS.timerTrack}>
                      <View style={[otpS.timerFill, { width: `${(otpCountdown / OTP_TTL) * 100}%`, backgroundColor: otpCountdown > 60 ? Colors.primary : Colors.danger }]} />
                    </NeuInset>
                    <Text style={[otpS.timerText, otpCountdown <= 60 && { color: Colors.danger }]}>
                      {otpCountdown > 0
                        ? `صالح لمدة ${Math.floor(otpCountdown / 60)}:${String(otpCountdown % 60).padStart(2, "0")}`
                        : "انتهت صلاحية الرمز — اطلب رمزاً جديداً"}
                    </Text>
                  </View>

                  <NeuButton
                    label="تأكيد وإنشاء الحساب"
                    icon="checkmark-circle-outline"
                    loading={otpVerifying}
                    disabled={otpCode.length < 6}
                    onPress={() => handleVerifyOtp()}
                  />

                  <View style={otpS.resendRow}>
                    <Text style={otpS.resendHint}>لم يصلك الرمز؟</Text>
                    {otpSending ? (
                      <ActivityIndicator color={Colors.primary} size="small" />
                    ) : canResend ? (
                      <TouchableOpacity onPress={handleResendOtp} hitSlop={8} style={otpS.resendBtn}>
                        <Ionicons name="refresh" size={14} color={Colors.primary} />
                        <Text style={otpS.resendLink}>إعادة الإرسال</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={otpS.resendWait}>إعادة الإرسال بعد {otpCountdown - (OTP_TTL - RESEND_AFTER)} ث</Text>
                    )}
                  </View>
                </>
              )}
            </NeuRaised>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ─── مكوّنات مساعدة ─────────────────────────────── */
function Choice({ label, icon, on, onPress }: { label: string; icon: IconName; on: boolean; onPress: () => void }) {
  const inner = (
    <View style={styles.choiceInner}>
      <Ionicons name={icon} size={18} color={on ? Colors.primary : Colors.textMuted} />
      <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{label}</Text>
      {on && <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />}
    </View>
  );
  // المختار يبدو «مضغوطاً» (غائراً)، وغير المختار بارزاً
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="radio" accessibilityState={{ selected: on }}>
      {on ? <NeuInset radius={16} tint={Colors.primary}>{inner}</NeuInset> : <NeuRaised radius={16} depth={5}>{inner}</NeuRaised>}
    </Pressable>
  );
}

function TypeToggle({ label, icon, active, onPress }: { label: string; icon: IconName; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}>
      {active ? (
        <NeuRaised radius={12} depth={4} style={styles.typeBtn}>
          <Ionicons name={icon} size={15} color={Colors.primary} />
          <Text style={[styles.typeText, styles.typeTextOn]}>{label}</Text>
        </NeuRaised>
      ) : (
        <View style={styles.typeBtn}>
          <Ionicons name={icon} size={15} color={Colors.textMuted} />
          <Text style={styles.typeText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

function DateBox({ label, placeholder, value, max, onChange, flex = 1 }: {
  label: string; placeholder: string; value: string; max: number; onChange: (v: string) => void; flex?: number;
}) {
  return (
    <NeuInset radius={14} style={[styles.dateBox, { flex }]}>
      <Text style={styles.dateLabel}>{label}</Text>
      <TextInput
        style={styles.dateInput}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSubtle}
        value={value}
        onChangeText={v => onChange(onlyDigits(v, max))}
        keyboardType="number-pad"
        maxLength={max}
        textAlign="center"
        accessibilityLabel={label}
      />
    </NeuInset>
  );
}

/* ─── أنماط ────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base, overflow: "hidden" },
  blob: { position: "absolute", width: 280, height: 280, borderRadius: 140 },
  scroll: { flexGrow: 1, paddingHorizontal: 18, gap: 18, maxWidth: 520, width: "100%", alignSelf: "center" },

  brandRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  logoChip: { width: 54, height: 54, padding: 6 },
  logoImg: { width: "100%", height: "100%", borderRadius: 12, backgroundColor: "#fff" },
  appName: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary, textAlign: "right", lineHeight: 32 },
  tagline: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted, textAlign: "right" },

  card: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 22 },
  badgeWrap: { alignItems: "center", marginBottom: 12 },
  heading: { fontFamily: "Cairo_700Bold", fontSize: 24, color: Colors.textPrimary, textAlign: "center" },
  subheading: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textMuted, textAlign: "center", marginTop: 2 },

  form: { gap: 14, marginTop: 20 },
  trail: { paddingHorizontal: 14 },
  counter: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.textMuted, paddingHorizontal: 12 },

  segRow: { flexDirection: "row-reverse", gap: 12 },
  choiceInner: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13 },
  choiceText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  choiceTextOn: { fontFamily: "Cairo_700Bold", color: Colors.primary },

  typeTrack: { flexDirection: "row-reverse", padding: 5, gap: 6 },
  typeBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9 },
  typeText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  typeTextOn: { fontFamily: "Cairo_700Bold", color: Colors.primary },

  strengthRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: -6, paddingHorizontal: 6 },
  strengthBars: { flex: 1, flexDirection: "row-reverse", gap: 5 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, minWidth: 56, textAlign: "right" },

  forgotBtn: { alignSelf: "flex-start", marginTop: -4, paddingVertical: 2, paddingHorizontal: 4 },
  forgotText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },

  extrasToggle: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14,
    borderWidth: 1.2, borderStyle: "dashed", borderColor: Colors.primary + "50",
  },
  extrasTitle: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  extrasSub: { fontFamily: "Cairo_400Regular", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },

  smallLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textMuted, textAlign: "right", paddingHorizontal: 6 },
  dateRow: { flexDirection: "row-reverse", gap: 10 },
  dateBox: { paddingTop: 6, paddingBottom: 2 },
  dateLabel: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted, textAlign: "center" },
  dateInput: {
    fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, height: 38, paddingVertical: 0,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },

  errorBox: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.danger + "12", borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: Colors.danger + "35",
  },
  errorText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.danger, textAlign: "right", lineHeight: 20 },
  errorLink: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary, textAlign: "right" },

  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 4 },
  switchHint: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  switchLink: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },

  altRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 28, marginTop: 6 },
  altItem: { alignItems: "center", gap: 6 },
  altText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },

  guestBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, alignSelf: "center" },
  guestText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary },
});

/* ─── أنماط شاشة رمز التحقق ─────────────────────────────── */
const otpS = StyleSheet.create({
  root: { flex: 1, backgroundColor: neu.base, overflow: "hidden" },
  scroll: { flexGrow: 1, paddingHorizontal: 18, gap: 16, maxWidth: 520, width: "100%", alignSelf: "center" },
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  stepText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  card: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 20, gap: 10 },
  successWrap: { alignItems: "center", gap: 12, paddingVertical: 36 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 23, color: Colors.textPrimary, textAlign: "center" },
  subtitle: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },
  idRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 12, marginTop: -4 },
  idText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, letterSpacing: 1, writingDirection: "ltr" },
  editLink: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.primary },

  devCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14 },
  devLabel: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  devCode: { fontFamily: "Cairo_700Bold", fontSize: 26, color: Colors.primary, letterSpacing: 6, textAlign: "right", writingDirection: "ltr" },
  fillBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  fillText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },

  warnCard: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: Colors.accent + "16", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: Colors.accent + "45",
  },
  warnText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.accentDeep, textAlign: "right" },

  errorRow: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.danger + "12", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: Colors.danger + "35",
  },
  errorText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.danger, textAlign: "right", lineHeight: 20 },

  timerWrap: { gap: 6, marginTop: 4, marginBottom: 4 },
  timerTrack: { height: 8, flexDirection: "row-reverse", padding: 2 },
  timerFill: { height: "100%", borderRadius: 3 },
  timerText: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textMuted, textAlign: "center" },

  resendRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 },
  resendHint: { fontFamily: "Cairo_400Regular", fontSize: 13.5, color: Colors.textMuted },
  resendBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  resendLink: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.primary },
  resendWait: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSubtle },
});
