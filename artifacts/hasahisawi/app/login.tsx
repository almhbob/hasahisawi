import React, { useState, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Platform, ActivityIndicator, Image,
  KeyboardAvoidingView, Pressable, Dimensions, Modal, FlatList,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import BrandPattern from "@/components/BrandPattern";
import { HASAHISA_LOCATIONS } from "@/constants/neighborhoods";

const CITY_CREST  = require("@/assets/images/city-crest.png");
const { height: SCREEN_H } = Dimensions.get("window");

type Mode = "login" | "register";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, register, enterAsGuest } = useAuth();

  const [mode, setMode]         = useState<Mode>("login");
  const [name, setName]         = useState("");
  const [nationalId, setNationalId] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [useEmail, setUseEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [birthDay, setBirthDay]     = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear]   = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [showNbrModal, setShowNbrModal] = useState(false);
  const [nbrSearch, setNbrSearch]   = useState("");

  const scrollRef = useRef<ScrollView>(null);

  const reset = () => {
    setName(""); setNationalId(""); setIdentifier("");
    setPassword(""); setConfirmPwd(""); setError("");
    setShowPwd(false); setUseEmail(false);
    setBirthDay(""); setBirthMonth(""); setBirthYear("");
    setNeighborhood(""); setNbrSearch("");
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
      if (mode === "login") {
        await login(identifier.trim(), password);
      } else {
        const isEmail = useEmail || identifier.includes("@");
        const nid = nationalId.trim().replace(/\s+/g, "");
        await register(name.trim(), nid, identifier.trim(), isEmail, password, getBirthDateISO(), neighborhood || undefined);
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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ─── Hero ─────────────────────────────────────── */}
      <View style={styles.hero}>
        {/* خلفية كريمية */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#F2EBD8" }]} />

        {/* علامة مائية بنمط الشعار */}
        <BrandPattern variant="corner" opacity={0.04} />

        {/* ── شعار المدينة يملأ الـ Hero ── */}
        <Animated.View
          entering={FadeIn.delay(60).duration(800)}
          style={[styles.crestZone, { paddingTop: insets.top }]}
        >
          <Image source={CITY_CREST} style={styles.crestImg} resizeMode="contain" />
        </Animated.View>

        {/* تدرج سفلي يذوب نحو داكن */}
        <LinearGradient
          colors={["transparent", "rgba(13,26,18,0.55)", Colors.bg]}
          locations={[0.5, 0.82, 1]}
          style={styles.heroFade}
        />

        {/* اسم التطبيق أسفل */}
        <Animated.View entering={FadeInUp.delay(300).springify().damping(18)} style={styles.heroBottom}>
          <Text style={styles.appName}>حصاحيصاوي</Text>
          <Text style={styles.tagline}>بوابتك الذكية لمدينة الحصاحيصا</Text>
        </Animated.View>
      </View>

      {/* ─── Form card ────────────────────────────────── */}
      <Animated.View entering={FadeInUp.delay(180).springify().damping(18)} style={styles.card}>
        {/* Mode tabs */}
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.modeTab, mode === "login" && styles.modeTabActive]}
            onPress={() => switchMode("login")}
            activeOpacity={0.8}
          >
            <Ionicons
              name={mode === "login" ? "log-in" : "log-in-outline"}
              size={16}
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
            <Ionicons
              name={mode === "register" ? "person-add" : "person-add-outline"}
              size={16}
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
                label="بريد إلكتروني" icon="mail-outline"
                active={useEmail} onPress={() => { setUseEmail(true); setIdentifier(""); }}
              />
              <TypeToggle
                label="رقم الهاتف" icon="call-outline"
                active={!useEmail} onPress={() => { setUseEmail(false); setIdentifier(""); }}
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
            <Pressable onPress={() => setShowPwd(p => !p)} hitSlop={10} style={{ paddingHorizontal: 12 }}>
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

          {/* ── تاريخ الميلاد ── */}
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

          {/* ── الحي / القرية ── */}
          {mode === "register" && (
            <View style={s2.fieldWrap}>
              <View style={s2.fieldHeader}>
                <Ionicons name="location-outline" size={15} color={Colors.textMuted} />
                <Text style={s2.fieldLabel}>الحي أو القرية</Text>
                <Text style={s2.optional}>(اختياري)</Text>
              </View>
              <Pressable style={s2.pickerBtn} onPress={() => setShowNbrModal(true)}>
                <Text style={neighborhood ? s2.pickerVal : s2.pickerPlaceholder}>
                  {neighborhood || "اختر من أحياء وقرى الحصاحيصا"}
                </Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
              </Pressable>
            </View>
          )}

          {/* خطأ */}
          {!!error && (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          )}

          {/* زر الإرسال */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.88}
            style={{ opacity: loading ? 0.75 : 1, marginTop: 8 }}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDim]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.submitBtn}
            >
              {loading
                ? <ActivityIndicator color="#000" />
                : <>
                    <Ionicons
                      name={mode === "login" ? "log-in-outline" : "person-add-outline"}
                      size={20} color="#000"
                    />
                    <Text style={styles.submitText}>
                      {mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}
                    </Text>
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>

          {/* فاصل */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>أو</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* زائر */}
          <TouchableOpacity style={styles.guestBtn} onPress={handleGuest} activeOpacity={0.8}>
            <Ionicons name="eye-outline" size={18} color={Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.guestTitle}>متابعة كزائر</Text>
              <Text style={styles.guestSub}>مشاهدة فقط · بدون نشر أو تعليق</Text>
            </View>
            <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 8 }} />
        </ScrollView>
      </Animated.View>

      {/* ── مودال الحي / القرية ── */}
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
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[s2.nbrRow, neighborhood === item.label && s2.nbrRowActive]}
                  onPress={() => { setNeighborhood(item.label); setShowNbrModal(false); setNbrSearch(""); }}
                >
                  <Ionicons
                    name={item.type === "neighborhood" ? "home-outline" : "leaf-outline"}
                    size={16}
                    color={item.type === "neighborhood" ? Colors.primary : Colors.accent}
                  />
                  <Text style={[s2.nbrLabel, neighborhood === item.label && s2.nbrLabelActive]}>
                    {item.label}
                  </Text>
                  <Text style={s2.nbrType}>{item.type === "neighborhood" ? "حي" : "قرية"}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/* ─── مساعدات الواجهة ─────────────────────────────── */
function Field({
  label, icon, required, optional, children,
}: {
  label: string; icon: keyof typeof Ionicons.glyphMap;
  required?: boolean; optional?: boolean; children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldBlock}>
      <View style={styles.labelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {required && <Text style={styles.req}> *</Text>}
        {optional && <Text style={styles.optionalTag}>اختياري</Text>}
      </View>
      <View style={styles.fieldWrap}>
        <Ionicons name={icon} size={18} color={Colors.textMuted} style={{ paddingHorizontal: 12 }} />
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
    height: SCREEN_H * 0.62,
    overflow: "hidden",
  },
  /* منطقة الشعار — تملأ الـ hero مع ترك مسافة سفلية للنص */
  crestZone: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    bottom: 80,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  crestImg: {
    width: "92%",
    height: "92%",
  },
  /* تدرج سفلي */
  heroFade: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: 200,
  },
  /* اسم التطبيق */
  heroBottom: {
    position: "absolute",
    bottom: 14,
    left: 0, right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  appName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 28,
    color: Colors.textPrimary,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  tagline: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  /* Card */
  card: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.primary + "28",
    overflow: "hidden",
  },

  /* Mode tabs */
  modeTabs: {
    flexDirection: "row",
    margin: 16,
    backgroundColor: Colors.bg,
    borderRadius: 14,
    padding: 3,
    gap: 3,
  },
  modeTab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 11, borderRadius: 11,
  },
  modeTabActive: {
    backgroundColor: Colors.cardBgElevated,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  modeTabText: {
    fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted,
  },
  modeTabTextActive: {
    fontFamily: "Cairo_700Bold", color: Colors.primary,
  },

  /* Form scroll */
  formScroll: {
    paddingHorizontal: 20, gap: 14, paddingBottom: 12,
  },

  /* Field */
  fieldBlock: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center" },
  fieldLabel: {
    fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary,
    textAlign: "right",
  },
  req: { color: Colors.danger, fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  optionalTag: {
    marginRight: 8,
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted,
    backgroundColor: Colors.divider, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  fieldWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5, borderColor: Colors.divider,
    borderRadius: 14, backgroundColor: Colors.bg,
    overflow: "hidden",
  },
  input: {
    flex: 1,
    fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary,
    paddingVertical: 13,
    textAlign: "right",
  },

  /* Type row */
  typeRow: {
    flexDirection: "row", gap: 8,
    backgroundColor: Colors.bg, borderRadius: 12, padding: 3,
  },
  typeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 9, borderRadius: 10,
  },
  typeBtnActive: {
    backgroundColor: Colors.cardBgElevated,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2,
  },
  typeBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textMuted },
  typeBtnTextActive: { color: Colors.primary, fontFamily: "Cairo_600SemiBold" },

  /* Error */
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.danger + "15",
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.danger + "30",
  },
  errorText: {
    fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.danger,
    flex: 1, textAlign: "right",
  },

  /* Submit */
  submitBtn: {
    borderRadius: 16, paddingVertical: 15,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  submitText: {
    fontFamily: "Cairo_700Bold", fontSize: 16, color: "#000",
  },

  /* Divider */
  dividerRow: {
    flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.divider },
  dividerText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },

  /* Guest */
  guestBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.bg, borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: Colors.divider, borderStyle: "dashed",
  },
  guestTitle: {
    fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textSecondary,
    textAlign: "right",
  },
  guestSub: {
    fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted,
    marginTop: 2, textAlign: "right",
  },
});

const s2 = StyleSheet.create({
  fieldWrap: { marginBottom: 14 },
  fieldHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 8 },
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  optional: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  dateRow: { flexDirection: "row-reverse", gap: 8 },
  dateBox: { backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider, padding: 6 },
  dateLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, textAlign: "center", marginBottom: 4 },
  dateInput: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, height: 36, textAlignVertical: "center" },
  pickerBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: Colors.divider,
    paddingHorizontal: 14, paddingVertical: 14, gap: 8,
  },
  pickerVal: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, flex: 1, textAlign: "right" },
  pickerPlaceholder: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, flex: 1, textAlign: "right" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: Colors.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 0,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary, textAlign: "center", marginBottom: 12 },
  searchWrap: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    backgroundColor: Colors.bg, borderRadius: 12, marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  nbrRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  nbrRowActive: { backgroundColor: Colors.primary + "15" },
  nbrLabel: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  nbrLabelActive: { color: Colors.primary, fontFamily: "Cairo_700Bold" },
  nbrType: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
});
