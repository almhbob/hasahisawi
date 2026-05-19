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
import { getApiUrl } from "@/lib/query-client";

const UC  = "#6366F1";
const UC2 = "#A5B4FC";

const UNION_TYPES = [
  "اتحاد طلابي", "نقابة مهنية", "جمعية شبابية",
  "منظمة مجتمعية", "مجموعة ثقافية", "أخرى",
];

const TIERS = [
  { key: "basic",      label: "أساسي",    desc: "عرض في الدليل + صفحة تعريفية", color: "#6366F1" },
  { key: "premium",   label: "متقدم",    desc: "جميع مزايا الأساسي + إشعارات + فعاليات", color: "#F59E0B" },
  { key: "enterprise",label: "مؤسسي",    desc: "جميع المزايا + لوحة تحكم + دعم مباشر", color: "#22C55E" },
];

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

export default function UnionPartnershipApplyScreen() {
  const insets = useSafeAreaInsets();

  const [unionName, setUnionName]         = useState("");
  const [unionType, setUnionType]         = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone]                 = useState("");
  const [email, setEmail]                 = useState("");
  const [address, setAddress]             = useState("");
  const [description, setDescription]     = useState("");
  const [memberCount, setMemberCount]     = useState("");
  const [tier, setTier]                   = useState("basic");
  const [contracted, setContracted]       = useState(false);
  const [submitting, setSubmitting]       = useState(false);

  const handleSubmit = async () => {
    if (!unionName.trim())     { Alert.alert("تنبيه", "اسم الاتحاد/المنظمة مطلوب"); return; }
    if (!contactPerson.trim()) { Alert.alert("تنبيه", "اسم المسؤول مطلوب"); return; }
    if (!phone.trim())         { Alert.alert("تنبيه", "رقم الهاتف مطلوب"); return; }
    if (!contracted)           { Alert.alert("تنبيه", "يجب الموافقة على الشروط والأحكام قبل الإرسال"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/union-partnership/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          union_name: unionName.trim(),
          union_type: unionType || null,
          contact_person: contactPerson.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          address: address.trim() || null,
          description: description.trim() || null,
          membership_count: memberCount ? parseInt(memberCount) : null,
          requested_tier: tier,
          contract_accepted: true,
        }),
      });

      if (res.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "تم استلام الطلب",
          "شكراً لاهتمامكم بالانضمام لمنصة حصاحيصا.\nسيتواصل معكم فريقنا خلال 48 ساعة لإتمام إجراءات الشراكة.",
          [{ text: "حسناً", onPress: () => router.back() }]
        );
      } else {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "فشل إرسال الطلب");
      }
    } catch (e: any) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e.message || "تعذر إرسال الطلب");
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
          <Text style={s.headerTitle}>انضمام الاتحادات والمنظمات</Text>
          <Text style={s.headerSub}>طلب الشراكة مع منصة حصاحيصا</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* البطاقة التعريفية */}
        <Animated.View entering={FadeInDown.springify()} style={s.infoCard}>
          <View style={s.infoIcon}>
            <Ionicons name="people-outline" size={28} color={UC2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.infoTitle}>شراكة مؤسسية مع حصاحيصا</Text>
            <Text style={s.infoText}>
              انضم باتحادك أو منظمتك إلى منصة حصاحيصا واحصل على حضور رقمي يخدم
              أعضاءك ويُعرِّف بنشاطاتكم في المجتمع المحلي.
            </Text>
          </View>
        </Animated.View>

        {/* بيانات الاتحاد/المنظمة */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={s.sectionBox}>
          <Text style={s.sectionBoxTitle}>بيانات الجهة</Text>

          <FieldLabel text="اسم الاتحاد / المنظمة" required />
          <Input value={unionName} onChange={setUnionName} placeholder="أدخل الاسم الرسمي للجهة" />

          <FieldLabel text="نوع الجهة" />
          <ChipSelect options={UNION_TYPES} value={unionType} onSelect={setUnionType} />

          <FieldLabel text="عدد الأعضاء المسجلين" />
          <Input value={memberCount} onChange={setMemberCount} placeholder="مثال: 120" keyboardType="numeric" />

          <FieldLabel text="وصف مختصر عن الجهة ونشاطاتها" />
          <Input value={description} onChange={setDescription}
            placeholder="اذكر أهداف جهتك وأبرز نشاطاتها..." multiline numberOfLines={4} />

          <FieldLabel text="العنوان / الموقع الجغرافي" />
          <Input value={address} onChange={setAddress} placeholder="الحي، المدينة، الولاية" />
        </Animated.View>

        {/* بيانات التواصل */}
        <Animated.View entering={FadeInDown.delay(120).springify()} style={s.sectionBox}>
          <Text style={s.sectionBoxTitle}>جهة التواصل</Text>

          <FieldLabel text="اسم المسؤول / منسق الشراكة" required />
          <Input value={contactPerson} onChange={setContactPerson} placeholder="اسم الشخص المسؤول عن التواصل" />

          <FieldLabel text="رقم الهاتف" required />
          <Input value={phone} onChange={setPhone} placeholder="09XXXXXXXX" keyboardType="phone-pad" />

          <FieldLabel text="البريد الإلكتروني" />
          <Input value={email} onChange={setEmail} placeholder="contact@union.org" keyboardType="email-address" />
        </Animated.View>

        {/* باقة الاشتراك */}
        <Animated.View entering={FadeInDown.delay(180).springify()} style={s.sectionBox}>
          <Text style={s.sectionBoxTitle}>باقة الاشتراك المطلوبة</Text>
          <Text style={s.hintText}>
            سيحدد فريق الإدارة الرسوم السنوية بناءً على الباقة المختارة وحجم الجهة.
          </Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {TIERS.map(t => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTier(t.key)}
                style={[s.tierCard, tier === t.key && { borderColor: t.color, backgroundColor: t.color + "12" }]}
              >
                <View style={[s.tierDot, { backgroundColor: t.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.tierLabel, tier === t.key && { color: t.color }]}>{t.label}</Text>
                  <Text style={s.tierDesc}>{t.desc}</Text>
                </View>
                {tier === t.key && <Ionicons name="checkmark-circle" size={22} color={t.color} />}
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* الشروط والأحكام */}
        <Animated.View entering={FadeInDown.delay(240).springify()} style={s.contractBox}>
          <Text style={s.contractTitle}>الشروط والأحكام</Text>
          <Text style={s.contractText}>
            بالانضمام إلى منصة حصاحيصا، تلتزم جهتكم بتقديم معلومات صحيحة وحديثة،
            والالتزام بمعايير واحترام ضوابط المجتمع المحلي في كل ما يُنشر عبر المنصة.
            تحتفظ إدارة المنصة بحق رفض أي طلب أو إلغاء الشراكة في حال مخالفة الشروط.
            الرسوم السنوية تُدفع مقدماً وهي غير قابلة للاسترداد بعد تفعيل الخدمة.
          </Text>
          <TouchableOpacity
            onPress={() => setContracted(p => !p)}
            style={[s.agreeRow, contracted && s.agreeRowActive]}
            activeOpacity={0.8}
          >
            <View style={[s.checkbox, contracted && s.checkboxActive]}>
              {contracted && <Ionicons name="checkmark" size={13} color="#fff" />}
            </View>
            <Text style={[s.agreeText, contracted && { color: UC2 }]}>
              أوافق على الشروط والأحكام وأُقرّ بصحة المعلومات المقدَّمة
            </Text>
          </TouchableOpacity>
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
                  <Text style={s.submitText}>إرسال طلب الشراكة</Text>
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
  hintText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", lineHeight: 18 },
  tierCard: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    backgroundColor: Colors.background, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.borderSubtle, padding: 14,
  },
  tierDot: { width: 12, height: 12, borderRadius: 6 },
  tierLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.text, textAlign: "right" },
  tierDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  contractBox: {
    backgroundColor: "#0B1224", borderRadius: 18, borderWidth: 1,
    borderColor: "#6366F140", padding: 16, marginBottom: 16, gap: 10,
  },
  contractTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: UC2, textAlign: "right" },
  contractText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "right", lineHeight: 22 },
  agreeRow: {
    flexDirection: "row-reverse", alignItems: "flex-start", gap: 10,
    backgroundColor: Colors.cardBg, borderRadius: 12, borderWidth: 1,
    borderColor: Colors.borderSubtle, padding: 12,
  },
  agreeRowActive: { borderColor: UC, backgroundColor: UC + "10" },
  agreeText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, flex: 1, textAlign: "right", lineHeight: 20 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.borderSubtle, alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: UC, borderColor: UC },
  submitBtn: { marginTop: 8, borderRadius: 16, overflow: "hidden" },
  submitGrad: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16,
  },
  submitText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
});
