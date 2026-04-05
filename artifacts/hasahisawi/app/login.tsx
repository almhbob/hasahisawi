import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Platform, ActivityIndicator, Image,
  KeyboardAvoidingView, Pressable, Dimensions, Modal, FlatList, Alert,
} from "react-native";
import Animated, {
  FadeIn, FadeInDown, FadeInUp,
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ImageBackground } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { HASAHISA_LOCATIONS } from "@/constants/neighborhoods";
import { getBiometricLabel, getBiometricIcon } from "@/lib/biometrics";

const CITY_IMAGE = require("@/assets/images/hasahisa-city.jpg");
const FERRIS     = require("@/assets/images/ferris-wheel.jpg");
const LOGO       = require("@/assets/images/logo.png");

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

type Mode = "login" | "register";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, register, enterAsGuest, loginWithBiometrics,
          enableBiometrics, biometricsAvailable, biometricsEnabled } = useAuth();

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
  const [showNbrModal, setShowNbrModal] = useState(false);
  const [nbrSearch, setNbrSearch]     = useState("");
  const [customNbr, setCustomNbr]     = useState("");
  const [gender, setGender]           = useState<"male" | "female" | "">("");
  const [bioLabel, setBioLabel]       = useState("البصمة");
  const [bioIcon, setBioIcon]         = useState<keyof typeof Ionicons.glyphMap>("finger-print-outline");
  const [bioLoading, setBioLoading]   = useState(false);

  useEffect(() => {
    (async () => {
      const label = await getBiometricLabel();
      const icon  = await getBiometricIcon() as keyof typeof Ionicons.glyphMap;
      setBioLabel(label);
      setBioIcon(icon);
    })();
  }, []);

  useEffect(() => {
    if (biometricsEnabled && biometricsAvailable && mode === "login") {
      handleBiometricLogin();
    }
  }, [biometricsEnabled, biometricsAvailable]);

  const scrollRef = useRef<ScrollView>(null);

  const reset = () => {
    setName(""); setNationalId(""); setIdentifier("");
    setPassword(""); setConfirmPwd(""); setError("");
    setShowPwd(false); setUseEmail(false);
    setBirthDay(""); setBirthMonth(""); setBirthYear("");
    setNeighborhood(""); setNbrSearch(""); setCustomNbr("");
  };

  const getBirthDateISO = (): string | undefined => {
    const d = birthDay.padStart(2, "0");
    const m = birthMonth.padStart(2, "0");
    const y = birthYear;
    if (d && m && y.length === 4) return `${y}-${m}-${d}`;
    return undefined;
  };

  const filteredLocations = HASAHISA_LOCATIONS.filter(l =>
    l.label.includes(nbrSearch) || nbrSearch === ""
  );

  const switchMode = (m: Mode) => { reset(); setMode(m); };

  const validate = (): string | null => {
    if (mode === "register") {
      if (!name.trim()) return "يرجى إدخال الاسم الكامل";
      const nid = nationalId.trim().replace(/\s+/g, "");
      if (nid && !/^\d{8,20}$/.test(nid)) return "رقم الهوية يجب أن يكون 8–20 رقماً";
    }
    if (!identifier.trim()) return "يرجى إدخال البريد أو رقم الهاتف";
    if (!password)           return "يرجى إدخال كلمة المرور";
    if (password.length < 6) return "كلمة المرور 6 أحرف على الأقل";
    if (mode === "register" && password !== confirmPwd) return "كلمتا المرور غير متطابقتين";
    return null;
  };

  const handleSubmit = async () => {
    setError("");
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    try {
      const id = identifier.trim();
      if (mode === "login") {
        await login(id, password);
        promptEnableBiometrics(id);
      } else {
        const isEmail = useEmail || identifier.includes("@");
        const nid = nationalId.trim().replace(/\s+/g, "");
        await register(name.trim(), nid, id, isEmail, password, getBirthDateISO(), neighborhood || undefined, gender || undefined);
        promptEnableBiometrics(id);
      }
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || "حدث خطأ، يرجى المحاولة مرة أخرى");
      if (Platform.OS !== "web")
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = () => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    enterAsGuest();
  };

  const handleBiometricLogin = async () => {
    setBioLoading(true);
    try {
      const success = await loginWithBiometrics();
      if (!success) {
        if (Platform.OS !== "web")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        if (Platform.OS !== "web")
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setBioLoading(false);
    }
  };

  const promptEnableBiometrics = (id: string) => {
    if (!biometricsAvailable || biometricsEnabled) return;
    Alert.alert(
      `تفعيل ${bioLabel}`,
      `هل تريد استخدام ${bioLabel} لتسجيل الدخول بسرعة في المرة القادمة؟`,
      [
        { text: "لا شكراً", style: "cancel" },
        { text: "نعم، فعّل", onPress: () => enableBiometrics(id) },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ─── Hero ─────────────────────────────────────── */}
      <ImageBackground
        source={FERRIS}
        style={[styles.hero, { paddingTop: insets.top }]}
        imageStyle={styles.heroImage}
      >
        {/* طبقة تدرج داكنة */}
        <LinearGradient
          colors={[
            "rgba(9,15,12,0.25)",
            "rgba(13,26,18,0.50)",
            "rgba(9,15,12,0.88)",
            Colors.bg,
          ]}
          locations={[0, 0.35, 0.72, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* محتوى الـ Hero */}
        <Animated.View
          entering={FadeIn.delay(80).duration(900)}
          style={styles.heroContent}
        >
          {/* الشعار */}
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[Colors.primary + "30", Colors.accent + "20"]}
              style={styles.logoGlow}
            />
            <View style={styles.logoWrap}>
              <Image source={LOGO} style={styles.logoImg} resizeMode="contain" />
            </View>
          </View>

          {/* اسم التطبيق */}
          <Animated.View entering={FadeInUp.delay(260).springify().damping(18)} style={styles.heroTitleWrap}>
            <Text style={styles.appName}>حصاحيصاوي</Text>
            <View style={styles.taglineRow}>
              <View style={styles.taglineDot} />
              <Text style={styles.tagline}>بوابتك الذكية لمدينة الحصاحيصا</Text>
              <View style={styles.taglineDot} />
            </View>
          </Animated.View>
        </Animated.View>
      </ImageBackground>

      {/* ─── Form card ────────────────────────────────── */}
      <Animated.View entering={FadeInUp.delay(160).springify().damping(20)} style={styles.card}>
        {/* Mode tabs */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, mode === "login" && styles.modeTabActive]}
            onPress={() => switchMode("login")}
            activeOpacity={0.8}
          >
            {mode === "login" && (
              <LinearGradient
                colors={[Colors.primary + "22", Colors.primary + "0A"]}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Ionicons
              name={mode === "login" ? "log-in" : "log-in-outline"}
              size={17}
              color={mode === "login" ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.modeTabText, mode === "login" && styles.modeTabTextActive]}>
              تسجيل الدخول
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, mode === "register" && styles.modeTabActive]}
            onPress={() => switchMode("register")}
            activeOpacity={0.8}
          >
            {mode === "register" && (
              <LinearGradient
                colors={[Colors.primary + "22", Colors.primary + "0A"]}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Ionicons
              name={mode === "register" ? "person-add" : "person-add-outline"}
              size={17}
              color={mode === "register" ? Colors.primary : Colors.textMuted}
            />
            <Text style={[styles.modeTabText, mode === "register" && styles.modeTabTextActive]}>
              حساب جديد
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.formScroll}
        >
          {/* الاسم */}
          {mode === "register" && (
            <Field label="الاسم الكامل" required icon="person-outline">
              <TextInput
                style={styles.input}
                placeholder="أدخل اسمك الكامل"
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </Field>
          )}

          {/* رقم الهوية */}
          {mode === "register" && (
            <Field label="رقم الهوية الوطنية" icon="id-card-outline" optional>
              <TextInput
                style={styles.input}
                placeholder="اختياري — للتوثيق فقط"
                placeholderTextColor={Colors.textMuted}
                value={nationalId}
                onChangeText={v => setNationalId(v.replace(/\D/g, ""))}
                keyboardType="numeric"
                maxLength={20}
              />
              {nationalId.length >= 8 && (
                <Ionicons name="checkmark-circle" size={20} color={Colors.primary} style={{ marginLeft: 10 }} />
              )}
            </Field>
          )}

          {/* نوع التسجيل */}
          {mode === "register" && (
            <View style={styles.typeRow}>
              <TypeToggle
                label="رقم الهاتف" icon="call-outline"
                active={!useEmail} onPress={() => { setUseEmail(false); setIdentifier(""); }}
              />
              <TypeToggle
                label="بريد إلكتروني" icon="mail-outline"
                active={useEmail} onPress={() => { setUseEmail(true); setIdentifier(""); }}
              />
            </View>
          )}

          {/* البريد / الهاتف */}
          <Field
            label={mode === "login" ? "البريد أو رقم الهاتف" : useEmail ? "البريد الإلكتروني" : "رقم الهاتف"}
            required
            icon={useEmail || mode === "login" ? "mail-outline" : "call-outline"}
          >
            <TextInput
              style={styles.input}
              placeholder={
                mode === "login" ? "أدخل البريد أو رقم الهاتف"
                  : useEmail ? "example@email.com" : "09xxxxxxxx"
              }
              placeholderTextColor={Colors.textMuted}
              value={identifier}
              onChangeText={setIdentifier}
              keyboardType={useEmail || mode === "login" ? "email-address" : "phone-pad"}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>

          {/* كلمة المرور */}
          <Field label="كلمة المرور" required icon="lock-closed-outline">
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="أدخل كلمة المرور"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
            />
            <Pressable onPress={() => setShowPwd(p => !p)} hitSlop={10} style={styles.eyeBtn}>
              <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textMuted} />
            </Pressable>
          </Field>

          {/* تأكيد كلمة المرور */}
          {mode === "register" && (
            <Field label="تأكيد كلمة المرور" required icon="lock-closed-outline">
              <TextInput
                style={styles.input}
                placeholder="أعد إدخال كلمة المرور"
                placeholderTextColor={Colors.textMuted}
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                secureTextEntry={!showPwd}
              />
            </Field>
          )}

          {/* تاريخ الميلاد */}
          {mode === "register" && (
            <View style={s2.fieldWrap}>
              <View style={s2.fieldHeader}>
                <Ionicons name="calendar-outline" size={15} color={Colors.textMuted} />
                <Text style={s2.fieldLabel}>تاريخ الميلاد</Text>
                <Text style={s2.optional}>(اختياري)</Text>
              </View>
              <View style={s2.dateRow}>
                <View style={[s2.dateBox, { flex: 1 }]}>
                  <Text style={s2.dateLabel}>اليوم</Text>
                  <TextInput
                    style={s2.dateInput}
                    placeholder="01"
                    placeholderTextColor={Colors.textMuted}
                    value={birthDay}
                    onChangeText={v => setBirthDay(v.replace(/\D/g,"").slice(0,2))}
                    keyboardType="numeric"
                    maxLength={2}
                    textAlign="center"
                  />
                </View>
                <View style={[s2.dateBox, { flex: 1 }]}>
                  <Text style={s2.dateLabel}>الشهر</Text>
                  <TextInput
                    style={s2.dateInput}
                    placeholder="01"
                    placeholderTextColor={Colors.textMuted}
                    value={birthMonth}
                    onChangeText={v => setBirthMonth(v.replace(/\D/g,"").slice(0,2))}
                    keyboardType="numeric"
                    maxLength={2}
                    textAlign="center"
                  />
                </View>
                <View style={[s2.dateBox, { flex: 2 }]}>
                  <Text style={s2.dateLabel}>السنة</Text>
                  <TextInput
                    style={s2.dateInput}
                    placeholder="1990"
                    placeholderTextColor={Colors.textMuted}
                    value={birthYear}
                    onChangeText={v => setBirthYear(v.replace(/\D/g,"").slice(0,4))}
                    keyboardType="numeric"
                    maxLength={4}
                    textAlign="center"
                  />
                </View>
              </View>
            </View>
          )}

          {/* الجنس */}
          {mode === "register" && (
            <View style={s2.fieldWrap}>
              <View style={s2.fieldHeader}>
                <Ionicons name="person-outline" size={15} color={Colors.textMuted} />
                <Text style={s2.fieldLabel}>الجنس</Text>
                <Text style={s2.optional}>(مطلوب)</Text>
              </View>
              <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 4 }}>
                {([
                  { val: "male"   as const, label: "ذكر",  icon: "man-outline"   as const },
                  { val: "female" as const, label: "أنثى", icon: "woman-outline"  as const },
                ]).map(opt => (
                  <TouchableOpacity
                    key={opt.val}
                    onPress={() => setGender(opt.val)}
                    style={{
                      flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
                      gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
                      borderColor: gender === opt.val ? Colors.primary : Colors.divider,
                      backgroundColor: gender === opt.val ? Colors.primary + "15" : Colors.cardBg,
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={opt.icon} size={18}
                      color={gender === opt.val ? Colors.primary : Colors.textMuted} />
                    <Text style={{
                      fontFamily: gender === opt.val ? "Cairo_700Bold" : "Cairo_400Regular",
                      fontSize: 14,
                      color: gender === opt.val ? Colors.primary : Colors.textSecondary,
                    }}>{opt.label}</Text>
                    {gender === opt.val && (
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* الحي / القرية */}
          {mode === "register" && (
            <View style={s2.fieldWrap}>
              <View style={s2.fieldHeader}>
                <Ionicons name="location-outline" size={15} color={Colors.textMuted} />
                <Text style={s2.fieldLabel}>الحي أو القرية</Text>
                <Text style={s2.optional}>(اختياري)</Text>
              </View>
              <Pressable style={s2.pickerBtn} onPress={() => setShowNbrModal(true)}>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={neighborhood ? Colors.primary : Colors.textMuted}
                />
                <Text style={neighborhood ? s2.pickerVal : s2.pickerPlaceholder}>
                  {neighborhood || "اختر من أحياء وقرى الحصاحيصا"}
                </Text>
                {neighborhood && (
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                )}
              </Pressable>
            </View>
          )}

          {/* خطأ */}
          {!!error && (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          )}

          {/* زر الإرسال */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.88}
            style={{ opacity: loading ? 0.75 : 1, marginTop: 6 }}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDim]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.submitBtn}
            >
              {loading
                ? <ActivityIndicator color="#000" size="small" />
                : <>
                    <Text style={styles.submitText}>
                      {mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}
                    </Text>
                    <Ionicons
                      name={mode === "login" ? "arrow-back" : "person-add-outline"}
                      size={19} color="#000"
                    />
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>

          {/* نسيت كلمة المرور */}
          {mode === "login" && (
            <TouchableOpacity
              onPress={() => router.push("/forgot-password" as any)}
              activeOpacity={0.7}
              style={{ alignSelf: "center", marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Ionicons name="lock-open-outline" size={15} color={Colors.primary} />
              <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.primary, textDecorationLine: "underline" }}>
                نسيت كلمة المرور؟
              </Text>
            </TouchableOpacity>
          )}

          {/* زر البصمة */}
          {mode === "login" && biometricsAvailable && biometricsEnabled && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <TouchableOpacity
                onPress={handleBiometricLogin}
                disabled={bioLoading}
                activeOpacity={0.85}
                style={[styles.bioBtn, bioLoading && { opacity: 0.7 }]}
              >
                <View style={styles.bioBtnIcon}>
                  {bioLoading
                    ? <ActivityIndicator color={Colors.primary} size="small" />
                    : <Ionicons name={bioIcon} size={24} color={Colors.primary} />
                  }
                </View>
                <Text style={styles.bioText}>{bioLabel}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* فاصل */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>أو</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* زائر */}
          <TouchableOpacity style={styles.guestBtn} onPress={handleGuest} activeOpacity={0.8}>
            <Ionicons name="eye-outline" size={20} color={Colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.guestTitle}>متابعة كزائر</Text>
              <Text style={styles.guestSub}>تصفح بدون حساب · مشاهدة فقط</Text>
            </View>
            <View style={styles.guestArrow}>
              <Ionicons name="arrow-back" size={14} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 12 }} />
        </ScrollView>
      </Animated.View>

      {/* مودال الحي / القرية */}
      <Modal visible={showNbrModal} animationType="slide" transparent onRequestClose={() => setShowNbrModal(false)}>
        <Pressable style={s2.modalOverlay} onPress={() => setShowNbrModal(false)}>
          <Pressable style={[s2.modalSheet, { paddingBottom: insets.bottom + 12 }]} onPress={e => e.stopPropagation()}>
            <View style={s2.modalHandle} />
            <Text style={s2.modalTitle}>اختر الحي أو القرية</Text>
            <View style={s2.searchWrap}>
              <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
              <TextInput
                style={s2.searchInput}
                placeholder="ابحث..."
                placeholderTextColor={Colors.textMuted}
                value={nbrSearch}
                onChangeText={setNbrSearch}
              />
            </View>
            <FlatList
              data={filteredLocations}
              keyExtractor={i => i.label}
              style={{ maxHeight: 340 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[s2.nbrRow, neighborhood === item.label && s2.nbrRowActive]}
                  onPress={() => { setNeighborhood(item.label); setShowNbrModal(false); setNbrSearch(""); setCustomNbr(""); }}
                >
                  <Ionicons
                    name={item.type === "neighborhood" ? "home-outline" : "leaf-outline"}
                    size={16}
                    color={neighborhood === item.label ? Colors.primary : (item.type === "neighborhood" ? Colors.primary : Colors.accent)}
                  />
                  <Text style={[s2.nbrLabel, neighborhood === item.label && s2.nbrLabelActive]}>
                    {item.label}
                  </Text>
                  <View style={[s2.nbrTypeBadge, { backgroundColor: item.type === "neighborhood" ? Colors.primary + "20" : Colors.accent + "20" }]}>
                    <Text style={[s2.nbrType, { color: item.type === "neighborhood" ? Colors.primary : Colors.accent }]}>
                      {item.type === "neighborhood" ? "حي" : "قرية"}
                    </Text>
                  </View>
                </Pressable>
              )}
              ListFooterComponent={
                <View style={s2.customNbrWrap}>
                  <View style={s2.customNbrDivider}>
                    <View style={s2.customNbrLine} />
                    <Text style={s2.customNbrDividerText}>أو أدخل اسم الحي / القرية يدوياً</Text>
                    <View style={s2.customNbrLine} />
                  </View>
                  <View style={s2.customNbrRow}>
                    <TextInput
                      style={s2.customNbrInput}
                      placeholder="اكتب اسم الحي أو القرية..."
                      placeholderTextColor={Colors.textMuted}
                      value={customNbr}
                      onChangeText={setCustomNbr}
                      textAlign="right"
                    />
                    <Pressable
                      style={[s2.customNbrBtn, !customNbr.trim() && { opacity: 0.45 }]}
                      disabled={!customNbr.trim()}
                      onPress={() => {
                        setNeighborhood(customNbr.trim());
                        setShowNbrModal(false);
                        setNbrSearch("");
                        setCustomNbr("");
                      }}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              }
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ─── مساعدات ─────────────────────────────── */
function Field({
  label, icon, required, optional, children,
}: {
  label: string; icon: keyof typeof Ionicons.glyphMap;
  required?: boolean; optional?: boolean; children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.labelRow}>
        {required && <Text style={styles.req}>*</Text>}
        {optional && <Text style={styles.optionalTag}>اختياري</Text>}
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <View style={styles.fieldWrap}>
        <Ionicons name={icon} size={18} color={Colors.textMuted} style={styles.fieldIcon} />
        {children}
      </View>
    </View>
  );
}

function TypeToggle({ label, icon, active, onPress }: {
  label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.typeBtn, active && styles.typeBtnActive]}
      onPress={onPress} activeOpacity={0.8}
    >
      {active && (
        <LinearGradient
          colors={[Colors.primary + "20", Colors.primary + "08"]}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Ionicons name={icon} size={15} color={active ? Colors.primary : Colors.textMuted} />
      <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ─── أنماط ────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: Colors.bg,
  },

  /* Hero */
  hero: {
    height: SCREEN_H * 0.40,
    justifyContent: "flex-end",
    paddingBottom: 0,
  },
  heroImage: {
    resizeMode: "cover",
  },
  heroContent: {
    alignItems: "center",
    paddingBottom: 28,
    gap: 12,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoGlow: {
    position: "absolute",
    width: 100, height: 100, borderRadius: 50,
    opacity: 0.6,
  },
  logoWrap: {
    width: 72, height: 72,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    borderWidth: 2, borderColor: Colors.primary + "80",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 20, elevation: 12,
  },
  logoImg: { width: "100%", height: "100%" },
  heroTitleWrap: { alignItems: "center", gap: 6 },
  appName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 30, color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  taglineRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  taglineDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: Colors.primary,
    opacity: 0.8,
  },
  tagline: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13, color: "rgba(255,255,255,0.80)",
  },

  /* Card */
  card: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.primary + "30",
    overflow: "hidden",
    marginTop: -12,
  },

  /* Mode tabs */
  modeTabs: {
    flexDirection: "row",
    margin: 16,
    marginBottom: 10,
    backgroundColor: Colors.bg,
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 12, borderRadius: 13, overflow: "hidden",
  },
  modeTabActive: {
    borderWidth: 1, borderColor: Colors.primary + "40",
  },
  modeTabText: {
    fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted,
  },
  modeTabTextActive: {
    fontFamily: "Cairo_700Bold", color: Colors.primary,
  },

  /* Form */
  formScroll: {
    paddingHorizontal: 20, gap: 12, paddingBottom: 12,
  },
  fieldBlock: { gap: 7 },
  labelRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  fieldLabel: {
    fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary,
    flex: 1, textAlign: "right",
  },
  req: {
    color: Colors.danger, fontFamily: "Cairo_700Bold", fontSize: 16,
    lineHeight: 20,
  },
  optionalTag: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted,
    backgroundColor: Colors.divider, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  fieldWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5, borderColor: Colors.divider,
    borderRadius: 16, backgroundColor: Colors.bg,
    overflow: "hidden",
    minHeight: 52,
  },
  fieldIcon: { paddingHorizontal: 13 },
  input: {
    flex: 1,
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    paddingVertical: 14,
    textAlign: "right",
  },
  eyeBtn: { paddingHorizontal: 14 },

  /* Type row */
  typeRow: {
    flexDirection: "row-reverse", gap: 8,
    backgroundColor: Colors.bg, borderRadius: 14, padding: 4,
  },
  typeBtn: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 10, borderRadius: 11, overflow: "hidden",
  },
  typeBtnActive: {
    borderWidth: 1, borderColor: Colors.primary + "40",
  },
  typeBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  typeBtnTextActive: { color: Colors.primary, fontFamily: "Cairo_600SemiBold" },

  /* Error */
  errorBox: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: Colors.danger + "14",
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.danger + "30",
  },
  errorText: {
    fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.danger,
    flex: 1, textAlign: "right", lineHeight: 20,
  },

  /* Submit */
  submitBtn: {
    borderRadius: 18, paddingVertical: 15,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 10,
  },
  submitText: {
    fontFamily: "Cairo_700Bold", fontSize: 16, color: "#000",
  },

  /* Biometric */
  bioBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 12, borderRadius: 16, paddingVertical: 13,
    borderWidth: 1.5, borderColor: Colors.primary + "40",
    backgroundColor: Colors.primary + "0A",
  },
  bioBtnIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primary + "18",
    alignItems: "center", justifyContent: "center",
  },
  bioText: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.primary,
  },

  /* Divider */
  dividerRow: {
    flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 2,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
  dividerText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },

  /* Guest */
  guestBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 14,
    backgroundColor: Colors.bg, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: Colors.divider,
  },
  guestTitle: {
    fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary,
    textAlign: "right",
  },
  guestSub: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted,
    marginTop: 2, textAlign: "right",
  },
  guestArrow: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.divider,
    alignItems: "center", justifyContent: "center",
  },
});

const s2 = StyleSheet.create({
  fieldWrap: { marginBottom: 12 },
  fieldHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 8 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  optional: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  dateRow: { flexDirection: "row-reverse", gap: 8 },
  dateBox: {
    backgroundColor: Colors.cardBg, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.divider, padding: 8,
  },
  dateLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", marginBottom: 4 },
  dateInput: {
    fontFamily: "Cairo_600SemiBold", fontSize: 17, color: Colors.textPrimary,
    height: 38, textAlignVertical: "center",
  },
  pickerBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.bg, borderRadius: 16,
    borderWidth: 1.5, borderColor: Colors.divider,
    paddingHorizontal: 14, paddingVertical: 15, gap: 10, minHeight: 52,
  },
  pickerVal: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  pickerPlaceholder: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, flex: 1, textAlign: "right" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 12, paddingHorizontal: 0,
    borderTopWidth: 1, borderColor: Colors.primary + "25",
  },
  modalHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "center", marginBottom: 14 },
  searchWrap: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.bg, borderRadius: 14, marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: Colors.divider,
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  nbrRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  nbrRowActive: { backgroundColor: Colors.primary + "12" },
  nbrLabel: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  nbrLabelActive: { color: Colors.primary, fontFamily: "Cairo_700Bold" },
  nbrTypeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  nbrType: { fontFamily: "Cairo_500Medium", fontSize: 11 },
  // ─── Custom neighborhood entry ───────────────────────────────────────────
  customNbrWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  customNbrDivider: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 },
  customNbrLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
  customNbrDividerText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "center" },
  customNbrRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  customNbrInput: {
    flex: 1, backgroundColor: Colors.bg, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.divider, textAlign: "right",
  },
  customNbrBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    width: 44, height: 44, justifyContent: "center", alignItems: "center",
  },
});
