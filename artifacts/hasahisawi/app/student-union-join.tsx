import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

const UC = "#6366F1";
const UC2 = "#A5B4FC";

type Field = { label: string; key: string; placeholder: string; keyboardType?: any; required?: boolean };

const FIELDS: Field[] = [
  { label: "الاسم الثلاثي", key: "full_name", placeholder: "أدخل اسمك الثلاثي", required: true },
  { label: "الرقم الوطني", key: "national_id", placeholder: "00000000000", keyboardType: "numeric", required: true },
  { label: "رقم الهاتف", key: "phone", placeholder: "09XXXXXXXX", keyboardType: "phone-pad", required: true },
  { label: "البريد الإلكتروني", key: "email", placeholder: "example@email.com", keyboardType: "email-address" },
  { label: "الجامعة / المعهد", key: "institution", placeholder: "اسم الجامعة أو المعهد", required: true },
  { label: "التخصص / القسم", key: "major", placeholder: "مثال: هندسة حاسوب", required: true },
  { label: "السنة الدراسية", key: "year", placeholder: "مثال: الثالثة", required: true },
  { label: "الحي / المنطقة", key: "neighborhood", placeholder: "حيّ السكن في الحصاحيصا" },
];

export default function StudentUnionJoinScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const validate = () => {
    for (const f of FIELDS) {
      if (f.required && !form[f.key]?.trim()) return `يرجى إدخال ${f.label}`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { Alert.alert("تنبيه", err); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/student-union/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, user_id: user?.id }),
      });

      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "تم الإرسال ✓",
          "تم تقديم طلب العضوية بنجاح. سيتم مراجعته والرد عليك خلال 48 ساعة.",
          [{ text: "حسناً", onPress: () => router.back() }]
        );
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "فشل إرسال الطلب");
      }
    } catch (e: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "تعذر إرسال الطلب، يرجى المحاولة مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* الهيدر */}
      <LinearGradient
        colors={["#0B1224", "#172554"]}
        style={[s.header, { paddingTop: insets.top + 12 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#A5B4FC" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>طلب عضوية اتحاد الطلاب</Text>
          <Text style={s.headerSub}>محلية الحصاحيصا</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* بطاقة تعريفية */}
        <Animated.View entering={FadeInDown.springify()} style={s.infoCard}>
          <View style={s.infoIcon}>
            <Ionicons name="school-outline" size={28} color={UC2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.infoTitle}>عضوية اتحاد الطلاب</Text>
            <Text style={s.infoText}>
              أكمل البيانات أدناه للانضمام إلى اتحاد طلاب محلية الحصاحيصا.
              سيصلك رد خلال 48 ساعة.
            </Text>
          </View>
        </Animated.View>

        {/* الحقول */}
        {FIELDS.map((field, i) => (
          <Animated.View key={field.key} entering={FadeInDown.delay(i * 40).springify()}>
            <Text style={s.label}>
              {field.label}
              {field.required && <Text style={s.required}> *</Text>}
            </Text>
            <TextInput
              style={s.input}
              value={form[field.key] || ""}
              onChangeText={v => set(field.key, v)}
              placeholder={field.placeholder}
              placeholderTextColor={Colors.textMuted}
              keyboardType={field.keyboardType || "default"}
              textAlign="right"
            />
          </Animated.View>
        ))}

        {/* زر الإرسال */}
        <TouchableOpacity
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={submitting}
          style={[s.submitBtn, submitting && { opacity: 0.6 }]}
        >
          <LinearGradient colors={[UC, "#4338CA"]} style={s.submitGrad}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="paper-plane-outline" size={19} color="#fff" />
                  <Text style={s.submitText}>إرسال طلب العضوية</Text>
                </>
            }
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF10",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: "#fff",
    textAlign: "center",
  },
  headerSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: UC2,
    textAlign: "center",
    marginTop: 2,
  },
  infoCard: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#0B1224",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: UC + "40",
    padding: 16,
    marginBottom: 20,
  },
  infoIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: UC + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: "#fff",
    textAlign: "right",
    marginBottom: 4,
  },
  infoText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "right",
    lineHeight: 20,
  },
  label: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    textAlign: "right",
    marginBottom: 6,
    marginTop: 12,
  },
  required: {
    color: "#EF4444",
  },
  input: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 13,
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Cairo_400Regular",
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  submitBtn: {
    marginTop: 28,
    borderRadius: 16,
    overflow: "hidden",
  },
  submitGrad: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  submitText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
