import React, { useState, useEffect } from "react";
import Colors from "@/constants/colors";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";

const MED = "#00966A";   // أخضر الهوية
const DEEP = "#004D36";
const GOLD = "#E8A900";

/** أرقام عربية/فارسية ← لاتينية، وفاصلة عشرية عربية ← نقطة */
const toLatin = (v: string) => v.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0)).replace(/[٫،,]/g, ".");

const BLOOD_TYPES = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "غير معروف"];

function ChipSelect({ options, selected, onSelect }: { options: string[]; selected: string; onSelect: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          onPress={() => onSelect(opt)}
          style={{
            paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20,
            backgroundColor: selected === opt ? MED : Colors.bg,
            borderWidth: 1, borderColor: selected === opt ? MED : Colors.divider,
          }}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === opt }}
        >
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: selected === opt ? "#fff" : Colors.textPrimary }}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function MedicalRecordSetupScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [bloodType, setBloodType] = useState("غير معروف");
  const [allergies, setAllergies] = useState("");
  const [chronicConditions, setChronicConditions] = useState("");
  const [currentMeds, setCurrentMeds] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!token) { setFetching(false); return; }
    fetchWithTimeout(`${getApiUrl()}/api/medical/my-record`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        const rec = d.record;
        if (!rec) return;
        if (rec.blood_type) setBloodType(rec.blood_type);
        if (rec.allergies) setAllergies(rec.allergies);
        if (rec.chronic_conditions) setChronicConditions(rec.chronic_conditions);
        if (rec.current_medications) setCurrentMeds(rec.current_medications);
        if (rec.emergency_contact_name) setEmergencyName(rec.emergency_contact_name);
        if (rec.emergency_contact_phone) setEmergencyPhone(rec.emergency_contact_phone);
        if (rec.emergency_contact_relation) setEmergencyRelation(rec.emergency_contact_relation);
        if (rec.height_cm) setHeight(String(rec.height_cm));
        if (rec.weight_kg) setWeight(String(rec.weight_kg));
        if (rec.notes) setNotes(rec.notes);
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [token]);

  async function save() {
    if (!token) return Alert.alert("خطأ", "يجب تسجيل الدخول أولاً");
    const h = height.trim() ? Number(toLatin(height.trim())) : null;
    const w = weight.trim() ? Number(toLatin(weight.trim())) : null;
    if (h !== null && (!Number.isFinite(h) || h < 40 || h > 250)) return Alert.alert("الطول", "أدخل الطول بالسنتيمتر بين 40 و250");
    if (w !== null && (!Number.isFinite(w) || w < 2 || w > 300)) return Alert.alert("الوزن", "أدخل الوزن بالكيلوجرام بين 2 و300");
    const phone = toLatin(emergencyPhone).replace(/[^\d+]/g, "");
    if (phone && phone.replace(/\D/g, "").length < 9) return Alert.alert("رقم الطوارئ", "رقم الهاتف غير مكتمل");
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/medical/my-record`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          blood_type: bloodType !== "غير معروف" ? bloodType : null,
          allergies: allergies.trim() || null,
          chronic_conditions: chronicConditions.trim() || null,
          current_medications: currentMeds.trim() || null,
          emergency_contact_name: emergencyName.trim() || null,
          emergency_contact_phone: phone || null,
          emergency_contact_relation: emergencyRelation.trim() || null,
          height_cm: h,
          weight_kg: w,
          notes: notes.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert("✅ تم الحفظ", "تم تحديث ملفك الطبي بنجاح", [
          { text: "رجوع", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert("خطأ", d.error || "فشل الحفظ");
      }
    } catch {
      Alert.alert("خطأ", "تعذر الاتصال بالخادم");
    }
    setLoading(false);
  }

  if (fetching) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={MED} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={[MED, DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={{ paddingTop: insets.top + 8, paddingBottom: 14 }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 16, gap: 10 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}
            accessibilityRole="button"
            accessibilityLabel="رجوع"
          >
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 18, color: "#fff" }}>الملف الطبي</Text>
            <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 12, color: "rgba(255,255,255,0.88)", marginTop: 1 }}>معلوماتك الصحية وجهة الاتصال الطارئ</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* فصيلة الدم */}
        <Animated.View entering={FadeInDown.delay(50)} style={sectionStyle}>
          <SectionHeader icon="water-outline" label="فصيلة الدم" color={MED} />
          <ChipSelect options={BLOOD_TYPES} selected={bloodType} onSelect={setBloodType} />
        </Animated.View>

        {/* القياسات */}
        <Animated.View entering={FadeInDown.delay(100)} style={sectionStyle}>
          <SectionHeader icon="body-outline" label="القياسات الجسدية" color={MED} />
          <View style={{ flexDirection: "row-reverse", gap: 12, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>الطول (سم)</Text>
              <TextInput
                value={height}
                onChangeText={setHeight}
                placeholder="مثال: 175"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                maxLength={5}
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>الوزن (كجم)</Text>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                placeholder="مثال: 70"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                maxLength={5}
                style={inputStyle}
              />
            </View>
          </View>
        </Animated.View>

        {/* الحساسية */}
        <Animated.View entering={FadeInDown.delay(150)} style={sectionStyle}>
          <SectionHeader icon="alert-circle-outline" label="الحساسية" color={GOLD} />
          <TextInput
            value={allergies}
            onChangeText={setAllergies}
            placeholder="مثال: حساسية من البنسلين، الفول السوداني..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
            style={[inputStyle, { textAlignVertical: "top", minHeight: 72, marginTop: 8 }]}
          />
        </Animated.View>

        {/* الأمراض المزمنة */}
        <Animated.View entering={FadeInDown.delay(200)} style={sectionStyle}>
          <SectionHeader icon="fitness-outline" label="الأمراض المزمنة" color={DEEP} />
          <TextInput
            value={chronicConditions}
            onChangeText={setChronicConditions}
            placeholder="مثال: السكري، ضغط الدم، الربو..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
            style={[inputStyle, { textAlignVertical: "top", minHeight: 72, marginTop: 8 }]}
          />
        </Animated.View>

        {/* الأدوية الحالية */}
        <Animated.View entering={FadeInDown.delay(250)} style={sectionStyle}>
          <SectionHeader icon="medical-outline" label="الأدوية الحالية" color={MED} />
          <TextInput
            value={currentMeds}
            onChangeText={setCurrentMeds}
            placeholder="الأدوية التي تتناولها بانتظام..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={3}
            style={[inputStyle, { textAlignVertical: "top", minHeight: 72, marginTop: 8 }]}
          />
        </Animated.View>

        {/* جهة الاتصال الطارئ */}
        <Animated.View entering={FadeInDown.delay(300)} style={sectionStyle}>
          <SectionHeader icon="call-outline" label="جهة الاتصال في حالات الطوارئ" color={GOLD} />
          <View style={{ gap: 10, marginTop: 8 }}>
            <View>
              <Text style={labelStyle}>الاسم</Text>
              <TextInput
                value={emergencyName}
                onChangeText={setEmergencyName}
                placeholder="اسم الشخص الذي يُتصل به عند الطوارئ"
                placeholderTextColor={Colors.textMuted}
                style={inputStyle}
              />
            </View>
            <View>
              <Text style={labelStyle}>رقم الهاتف</Text>
              <TextInput
                value={emergencyPhone}
                onChangeText={setEmergencyPhone}
                placeholder="مثال: 0912345678"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
                style={inputStyle}
              />
            </View>
            <View>
              <Text style={labelStyle}>صلة القرابة</Text>
              <TextInput
                value={emergencyRelation}
                onChangeText={setEmergencyRelation}
                placeholder="مثال: الأب، الأم، الزوج..."
                placeholderTextColor={Colors.textMuted}
                style={inputStyle}
              />
            </View>
          </View>
        </Animated.View>

        {/* ملاحظات إضافية */}
        <Animated.View entering={FadeInDown.delay(350)} style={sectionStyle}>
          <SectionHeader icon="document-text-outline" label="ملاحظات طبية إضافية" color={DEEP} />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="أي معلومات إضافية تودّ إبلاغ الطاقم الطبي بها..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={4}
            style={[inputStyle, { textAlignVertical: "top", minHeight: 88, marginTop: 8 }]}
          />
        </Animated.View>

        {/* زر الحفظ */}
        <Animated.View entering={FadeInDown.delay(400)}>
          <TouchableOpacity onPress={save} disabled={loading} style={{ borderRadius: 16, overflow: "hidden", marginTop: 8 }}>
            <LinearGradient colors={[MED, DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row-reverse", gap: 8 }}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <>
                  <Ionicons name="save-outline" size={20} color="#fff" />
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" }}>حفظ الملف الطبي</Text>
                </>
              }
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({ icon, label, color }: { icon: any; label: string; color: string }) {
  return (
    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color + "20", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14.5, color: Colors.textPrimary }}>{label}</Text>
    </View>
  );
}

const sectionStyle: any = {
  backgroundColor: Colors.cardBg,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: Colors.divider,
  padding: 14,
  marginBottom: 14,
};

const inputStyle: any = {
  backgroundColor: Colors.bg,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: Colors.divider,
  padding: 12,
  color: Colors.textPrimary,
  fontFamily: "Cairo_500Medium",
  fontSize: 14,
  textAlign: "right",
};

const labelStyle: any = {
  fontFamily: "Cairo_600SemiBold",
  fontSize: 13,
  color: Colors.textSecondary,
  textAlign: "right",
  marginBottom: 6,
};
