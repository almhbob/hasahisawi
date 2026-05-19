import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const UC  = "#6366F1";
const UC2 = "#A5B4FC";

const INQUIRY_TYPES = [
  "استفسار عام", "طلب معلومات عن العضوية",
  "شكوى أو اقتراح", "طلب مشاركة في نشاط",
  "دعوة للتعاون", "أخرى",
];

const CONTACT_TIMES = ["صباحاً (8-12)", "ظهراً (12-4)", "مساءً (4-8)", "في أي وقت"];

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={s.label}>
      {text}{required && <Text style={{ color: "#EF4444" }}> *</Text>}
    </Text>
  );
}

function Input({ value, onChange, placeholder, keyboardType, multiline, numberOfLines }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  keyboardType?: any; multiline?: boolean; numberOfLines?: number;
}) {
  return (
    <TextInput
      style={[s.input, multiline && { height: (numberOfLines || 3) * 40, textAlignVertical: "top", paddingTop: 12 }]}
      value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={Colors.textMuted} keyboardType={keyboardType || "default"}
      textAlign="right" multiline={multiline} numberOfLines={numberOfLines}
    />
  );
}

function ChipSelect({ options, value, onSelect }: { options: string[]; value: string; onSelect: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
      {options.map(o => (
        <TouchableOpacity key={o} onPress={() => onSelect(o)}
          style={[s.chip, value === o && s.chipActive]}>
          <Text style={[s.chipText, value === o && s.chipTextActive]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function StudentUnionContactScreen() {
  const insets = useSafeAreaInsets();

  const [name, setName]             = useState("");
  const [phone, setPhone]           = useState("");
  const [whatsapp, setWhatsapp]     = useState("");
  const [email, setEmail]           = useState("");
  const [locality, setLocality]     = useState("");
  const [inquiryType, setInquiry]   = useState("");
  const [message, setMessage]       = useState("");
  const [bestTime, setBestTime]     = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim())    { Alert.alert("تنبيه", "الاسم مطلوب"); return; }
    if (!phone.trim())   { Alert.alert("تنبيه", "رقم الهاتف مطلوب"); return; }
    if (!message.trim()) { Alert.alert("تنبيه", "رسالة الاستفسار مطلوبة"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/contact-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_name: name.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || null,
          email: email.trim() || null,
          locality: locality.trim() || null,
          category: inquiryType || "استفسار عام",
          message: message.trim(),
          best_contact_time: bestTime || null,
          source: "student_union",
        }),
      });

      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "تم الإرسال",
          "تم استلام رسالتك بنجاح. سيتواصل معك فريق اتحاد الطلاب في أقرب وقت.",
          [{ text: "حسناً", onPress: () => router.back() }]
        );
      } else {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "فشل إرسال الرسالة");
      }
    } catch (e: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "تعذر إرسال الرسالة، يرجى المحاولة مرة أخرى");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient colors={["#0B1224", "#172554"]} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={UC2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>التواصل مع اتحاد الطلاب</Text>
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
            <Ionicons name="chatbubbles-outline" size={28} color={UC2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.infoTitle}>نموذج الاستفسار والتواصل</Text>
            <Text style={s.infoText}>
              يسعدنا التواصل معك. اترك تفاصيلك واستفسارك وسيقوم فريق
              الاتحاد بالرد عليك في أقرب وقت ممكن.
            </Text>
          </View>
        </Animated.View>

        {/* بيانات المرسِل */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={s.sectionBox}>
          <Text style={s.sectionBoxTitle}>بيانات المرسِل</Text>

          <FieldLabel text="الاسم" required />
          <Input value={name} onChange={setName} placeholder="اسمك الكامل" />

          <FieldLabel text="رقم الهاتف" required />
          <Input value={phone} onChange={setPhone} placeholder="09XXXXXXXX" keyboardType="phone-pad" />

          <FieldLabel text="رقم الواتساب" />
          <Input value={whatsapp} onChange={setWhatsapp} placeholder="إذا كان مختلفاً عن الهاتف" keyboardType="phone-pad" />

          <FieldLabel text="البريد الإلكتروني" />
          <Input value={email} onChange={setEmail} placeholder="example@email.com" keyboardType="email-address" />

          <FieldLabel text="الولاية / المحلية" />
          <Input value={locality} onChange={setLocality} placeholder="مثال: الجزيرة — الحصاحيصا" />
        </Animated.View>

        {/* تفاصيل الاستفسار */}
        <Animated.View entering={FadeInDown.delay(120).springify()} style={s.sectionBox}>
          <Text style={s.sectionBoxTitle}>تفاصيل الاستفسار</Text>

          <FieldLabel text="نوع الاستفسار" />
          <ChipSelect options={INQUIRY_TYPES} value={inquiryType} onSelect={setInquiry} />

          <FieldLabel text="رسالتك / استفسارك" required />
          <Input value={message} onChange={setMessage}
            placeholder="اكتب استفسارك أو رسالتك هنا..." multiline numberOfLines={5} />

          <FieldLabel text="أفضل وقت للتواصل معك" />
          <ChipSelect options={CONTACT_TIMES} value={bestTime} onSelect={setBestTime} />
        </Animated.View>

        {/* خيارات تواصل مباشر */}
        <Animated.View entering={FadeInDown.delay(180).springify()} style={s.directCard}>
          <Text style={s.directTitle}>أو تواصل مباشرة</Text>
          <View style={{ flexDirection: "row-reverse", gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={[s.directBtn, { backgroundColor: "#25D366" }]}
              onPress={() => Linking.openURL("https://wa.me/249XXXXXXXXX")}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={s.directBtnText}>واتساب</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.directBtn, { backgroundColor: "#2563EB" }]}
              onPress={() => Linking.openURL("tel:+249XXXXXXXXX")}
            >
              <Ionicons name="call-outline" size={18} color="#fff" />
              <Text style={s.directBtnText}>اتصال</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* زر الإرسال */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={[s.submitBtn, submitting && { opacity: 0.6 }]}
          activeOpacity={0.85}
        >
          <LinearGradient colors={[UC, "#4338CA"]} style={s.submitGrad}>
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="paper-plane-outline" size={19} color="#fff" />
                  <Text style={s.submitText}>إرسال الرسالة</Text>
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
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 16, gap: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#FFFFFF10", alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: UC2, textAlign: "center", marginTop: 2 },
  infoCard: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 12,
    backgroundColor: "#0B1224", borderRadius: 18, borderWidth: 1,
    borderColor: UC + "40", padding: 16, marginBottom: 16,
  },
  infoIcon: {
    width: 50, height: 50, borderRadius: 16,
    backgroundColor: UC + "18", alignItems: "center", justifyContent: "center",
  },
  infoTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff", textAlign: "right", marginBottom: 4 },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", lineHeight: 20 },
  sectionBox: {
    backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1,
    borderColor: Colors.borderSubtle, padding: 16, marginBottom: 14,
  },
  sectionBoxTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right", marginBottom: 4 },
  label: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.text, textAlign: "right", marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: Colors.background, borderRadius: 12, padding: 13,
    color: Colors.text, fontSize: 14, fontFamily: "Cairo_400Regular",
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.borderSubtle },
  chipActive: { backgroundColor: UC, borderColor: UC },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },
  chipTextActive: { color: "#fff" },
  directCard: {
    backgroundColor: Colors.cardBg, borderRadius: 18, borderWidth: 1,
    borderColor: Colors.borderSubtle, padding: 16, marginBottom: 14,
  },
  directTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.text, textAlign: "right" },
  directBtn: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 7, paddingVertical: 12, borderRadius: 12,
  },
  directBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  submitBtn: { marginTop: 8, borderRadius: 16, overflow: "hidden" },
  submitGrad: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16,
  },
  submitText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
});
