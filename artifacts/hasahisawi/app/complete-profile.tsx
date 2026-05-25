import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  Platform, KeyboardAvoidingView, Alert,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, completeProfile } = useAuth();

  // الجنس مقفل إذا كان محدداً مسبقاً — لا يمكن تعديله
  const genderLocked = !!user?.gender;

  const [gender, setGender]             = useState<"male" | "female" | null>(user?.gender ?? null);
  const [neighborhood, setNeighborhood] = useState<string>(user?.neighborhood ?? "");
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState("");
  const [countdown, setCountdown]       = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const canSave = !!gender;

  // تنظيف المؤقتات عند مغادرة الشاشة
  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
  }, []);

  const handleSave = async () => {
    if (!canSave) return;
    setError("");
    setCountdown(0);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    setSaving(true);
    try {
      await completeProfile(gender!, neighborhood.trim() || undefined);
      router.replace("/(tabs)/" as any);
    } catch (e: any) {
      const msg: string = e?.message || "تعذّر الحفظ، حاول مرة أخرى";
      setError(msg);
      // إعادة المحاولة تلقائياً بعد 12 ثانية إذا كان الخطأ من الخادم
      if (msg.includes("يستيقظ") || msg.includes("مهلة") || msg.includes("اتصال")) {
        let secs = 12;
        setCountdown(secs);
        countdownInterval.current = setInterval(() => {
          secs -= 1;
          setCountdown(secs);
          if (secs <= 0) clearInterval(countdownInterval.current!);
        }, 1000);
        retryTimer.current = setTimeout(() => {
          setCountdown(0);
          handleSave();
        }, 12000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGenderPress = (selected: "male" | "female") => {
    if (genderLocked) {
      Alert.alert(
        "الجنس محدد مسبقاً",
        "لا يمكن تغيير الجنس بعد تحديده لأول مرة. تواصل مع الإدارة إذا كان هناك خطأ.",
        [{ text: "حسناً" }]
      );
      return;
    }
    setGender(selected);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#070D0A" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── رأس الشاشة ── */}
        <Animated.View entering={FadeInDown.springify()} style={s.header}>
          <View style={s.iconWrap}>
            <LinearGradient colors={[Colors.primaryDeep + "66", Colors.primaryDeep + "22"]} style={s.iconCircle}>
              <Ionicons name="person-circle-outline" size={44} color={Colors.primary} />
            </LinearGradient>
          </View>
          <Text style={s.title}>أكمل ملفك الشخصي</Text>
          <Text style={s.subtitle}>معلومات مهمة تساعدنا على تقديم خدمات مناسبة لك</Text>
        </Animated.View>

        {/* ── الجنس ── */}
        <Animated.View entering={FadeInDown.delay(80).springify()} style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>الجنس</Text>
            <View style={genderLocked ? s.lockedBadge : s.requiredBadge}>
              <Ionicons name={genderLocked ? "lock-closed" : "alert-circle"} size={11} color={genderLocked ? Colors.textMuted : Colors.accent} />
              <Text style={[s.requiredTxt, genderLocked && { color: Colors.textMuted }]}>
                {genderLocked ? "محدد ومقفل" : "مطلوب — يُحدَّد مرة واحدة"}
              </Text>
            </View>
          </View>

          {genderLocked && (
            <View style={s.lockNote}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
              <Text style={s.lockNoteText}>الجنس لا يمكن تعديله بعد تحديده</Text>
            </View>
          )}

          <View style={s.genderRow}>
            <TouchableOpacity
              style={[s.genderBtn, gender === "male" && s.genderBtnMaleActive, genderLocked && s.genderBtnLocked]}
              onPress={() => handleGenderPress("male")}
              activeOpacity={genderLocked ? 1 : 0.8}
            >
              {gender === "male" && (
                <View style={s.checkMark}>
                  <Ionicons name={genderLocked ? "lock-closed" : "checkmark-circle"} size={18} color="#fff" />
                </View>
              )}
              <Ionicons name="male" size={28} color={gender === "male" ? "#fff" : Colors.textMuted} />
              <Text style={[s.genderTxt, gender === "male" && { color: "#fff" }]}>ذكر</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.genderBtn, gender === "female" && s.genderBtnFemaleActive, genderLocked && s.genderBtnLocked]}
              onPress={() => handleGenderPress("female")}
              activeOpacity={genderLocked ? 1 : 0.8}
            >
              {gender === "female" && (
                <View style={s.checkMark}>
                  <Ionicons name={genderLocked ? "lock-closed" : "checkmark-circle"} size={18} color="#fff" />
                </View>
              )}
              <Ionicons name="female" size={28} color={gender === "female" ? "#fff" : Colors.textMuted} />
              <Text style={[s.genderTxt, gender === "female" && { color: "#fff" }]}>أنثى</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── مكان السكن ── */}
        <Animated.View entering={FadeInDown.delay(160).springify()} style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>مكان السكن</Text>
            <View style={[s.requiredBadge, { backgroundColor: Colors.surface2 }]}>
              <Text style={[s.requiredTxt, { color: Colors.textMuted }]}>اختياري</Text>
            </View>
          </View>
          <Text style={s.sectionHint}>
            اكتب اسم حيّك أو قريتك أو المنطقة التي تسكن فيها
          </Text>

          <View style={[s.inputWrap, neighborhood.trim().length > 0 && { borderColor: Colors.primary + "66" }]}>
            <Ionicons name="location-outline" size={18} color={Colors.textMuted} style={s.inputIcon} />
            <TextInput
              style={s.input}
              value={neighborhood}
              onChangeText={v => setNeighborhood(v.slice(0, 60))}
              placeholder="مثال: حي الواحة، ود الكامل، أم دغينة..."
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
              returnKeyType="done"
              onSubmitEditing={handleSave}
              maxLength={60}
              autoCorrect={false}
            />
            {neighborhood.trim().length > 0 && (
              <TouchableOpacity onPress={() => setNeighborhood("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* اقتراحات سريعة */}
          <View style={s.suggestRow}>
            {["حي الواحة", "الحي الأوسط", "ود الكامل", "أركويت", "خارج المدينة"].map(sug => (
              <TouchableOpacity
                key={sug}
                style={[s.suggestChip, neighborhood === sug && s.suggestChipActive]}
                onPress={() => setNeighborhood(sug)}
                activeOpacity={0.7}
              >
                <Text style={[s.suggestTxt, neighborhood === sug && { color: Colors.primary }]}>{sug}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* ── خطأ ── */}
        {error ? (
          <Animated.View entering={FadeIn} style={s.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={s.errorTxt}>{error}</Text>
              {countdown > 0 && (
                <Text style={[s.errorTxt, { fontSize: 11, opacity: 0.7, marginTop: 2 }]}>
                  إعادة المحاولة خلال {countdown}ث...
                </Text>
              )}
            </View>
            {countdown > 0 && (
              <TouchableOpacity onPress={handleSave} hitSlop={8}>
                <Text style={{ color: Colors.primary, fontFamily: "Cairo_700Bold", fontSize: 13 }}>الآن</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        ) : null}

        {/* ── زر الحفظ ── */}
        <Animated.View entering={FadeInDown.delay(240).springify()}>
          <TouchableOpacity
            style={[s.saveBtn, (!canSave || saving) && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={canSave ? [Colors.primary, Colors.primaryDim] : [Colors.surface3, Colors.surface3]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.saveBtnGrad}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={s.saveBtnTxt}>متابعة إلى التطبيق</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {!canSave && (
            <Text style={s.helperTxt}>يرجى اختيار الجنس للمتابعة — لا يمكن تخطى هذه الخطوة</Text>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 20, gap: 20 },

  header: { alignItems: "center", gap: 10, paddingVertical: 8 },
  iconWrap: { marginBottom: 4 },
  iconCircle: {
    width: 88, height: 88, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
  },
  title: {
    fontFamily: "Cairo_700Bold", fontSize: 22,
    color: Colors.textPrimary, textAlign: "center",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular", fontSize: 14,
    color: Colors.textMuted, textAlign: "center",
    lineHeight: 22, maxWidth: 280,
  },

  section: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 1, borderColor: Colors.divider,
  },
  sectionHeader: {
    flexDirection: "row-reverse", alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary,
  },
  sectionHint: {
    fontFamily: "Cairo_400Regular", fontSize: 13,
    color: Colors.textSecondary, textAlign: "right", lineHeight: 20,
  },
  requiredBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.accent + "22", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  lockedBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: Colors.surface2, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  requiredTxt: {
    fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.accent,
  },
  lockNote: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    backgroundColor: Colors.surface2, borderRadius: 8, padding: 8,
  },
  lockNoteText: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted,
  },

  // Gender
  genderRow: { flexDirection: "row-reverse", gap: 12 },
  genderBtn: {
    flex: 1, flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    paddingVertical: 20, borderRadius: 14,
    borderWidth: 2, borderColor: Colors.divider,
    backgroundColor: Colors.surface1, gap: 6,
    position: "relative",
  },
  genderBtnMaleActive: {
    borderColor: Colors.primary, backgroundColor: Colors.primary + "22",
  },
  genderBtnFemaleActive: {
    borderColor: "#E05567", backgroundColor: "#E0556720",
  },
  genderBtnLocked: {
    opacity: 0.75,
  },
  genderTxt: {
    fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.textMuted,
  },
  checkMark: { position: "absolute", top: 8, left: 8 },

  // Input
  inputWrap: {
    flexDirection: "row-reverse", alignItems: "center",
    backgroundColor: Colors.bg,
    borderRadius: 14, borderWidth: 1.5, borderColor: Colors.divider,
    height: 54, paddingHorizontal: 4,
  },
  inputIcon: { marginHorizontal: 10 },
  input: {
    flex: 1, fontFamily: "Cairo_400Regular",
    fontSize: 15, color: Colors.textPrimary, paddingHorizontal: 4,
  },

  // Suggestions
  suggestRow: {
    flexDirection: "row-reverse", flexWrap: "wrap", gap: 6,
  },
  suggestChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.divider,
    backgroundColor: Colors.surface1,
  },
  suggestChipActive: {
    borderColor: Colors.primary, backgroundColor: Colors.primary + "18",
  },
  suggestTxt: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted,
  },

  // Error
  errorBox: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 8,
    backgroundColor: Colors.danger + "15",
    borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.danger + "33",
  },
  errorTxt: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13,
    color: "#FCA5A5", textAlign: "right", lineHeight: 20,
  },

  // Save button
  saveBtn: { borderRadius: 14, overflow: "hidden" },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnGrad: {
    height: 54, flexDirection: "row-reverse",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  saveBtnTxt: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  helperTxt: {
    fontFamily: "Cairo_400Regular", fontSize: 12,
    color: Colors.textMuted, textAlign: "center",
    marginTop: 8, lineHeight: 18,
  },
});
