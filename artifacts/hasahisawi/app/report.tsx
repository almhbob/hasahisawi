import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import type { LostItem } from "./(tabs)/missing";
import { fsAddDoc, COLLECTIONS, isFirebaseAvailable } from "@/lib/firebase/firestore";

const CATEGORIES: { key: LostItem["category"]; label: string; icon: string }[] = [
  { key: "phone", label: "هاتف", icon: "phone-portrait-outline" },
  { key: "keys", label: "مفاتيح", icon: "key-outline" },
  { key: "wallet", label: "محفظة", icon: "wallet-outline" },
  { key: "documents", label: "وثائق", icon: "document-text-outline" },
  { key: "jewelry", label: "مجوهرات", icon: "diamond-outline" },
  { key: "bag", label: "حقيبة", icon: "bag-handle-outline" },
  { key: "other", label: "أخرى", icon: "ellipsis-horizontal-circle-outline" },
];

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<LostItem["category"]>("other");
  const [description, setDescription] = useState("");
  const [lastSeen, setLastSeen] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!itemName.trim()) { Alert.alert("خطأ", "يرجى إدخال اسم الغرض"); return; }
    if (!lastSeen.trim()) { Alert.alert("خطأ", "يرجى إدخال مكان الفقدان"); return; }
    if (!contactPhone.trim()) { Alert.alert("خطأ", "يرجى إدخال رقم التواصل"); return; }
    setSaving(true);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      if (!isFirebaseAvailable()) {
        Alert.alert("خطأ", "خدمة Firebase غير متاحة حالياً"); setSaving(false); return;
      }
      await fsAddDoc(COLLECTIONS.MISSING, {
        itemName: itemName.trim(),
        category,
        description: description.trim() || "لا يوجد وصف إضافي",
        lastSeen: lastSeen.trim(),
        contactPhone: contactPhone.trim(),
        status: "lost",
        postedBy: auth.user?.uid ?? null,
        createdAt: new Date().toISOString(),
      });
      Alert.alert("تم الإرسال", "تم نشر إعلانك بنجاح. نتمنى العثور على غرضك!", [
        { text: "حسناً", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("خطأ", "تعذر حفظ الإعلان. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  if (auth.isGuest || !auth.user) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }]}>
        <View style={{ paddingTop: topPad + 16, position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={{ backgroundColor: Colors.cardBg, borderRadius: 20, padding: 28, alignItems: "center", borderWidth: 1, borderColor: Colors.primary + "44" }}>
          <Ionicons name="lock-closed" size={48} color={Colors.primary} style={{ marginBottom: 16 }} />
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, marginBottom: 8, textAlign: "center" }}>
            تسجيل مطلوب
          </Text>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginBottom: 24 }}>
            يجب إنشاء حساب للإبلاغ عن المفقودات والتواصل مع المجتمع.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}>
            <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 15, color: Colors.cardBg }}>العودة</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-forward" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إعلان مفقود</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: bottomPad + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={17} color={Colors.primaryDim} />
          <Text style={styles.infoText}>
            أدخل تفاصيل الغرض المفقود لمساعدة المجتمع في إيجاده
          </Text>
        </View>

        {/* Category */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>نوع الغرض</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[styles.catBtn, category === c.key && styles.catBtnActive]}
                onPress={() => setCategory(c.key)}
              >
                <Ionicons
                  name={c.icon as any}
                  size={20}
                  color={category === c.key ? Colors.cardBg : Colors.textSecondary}
                />
                <Text style={[styles.catBtnText, category === c.key && styles.catBtnTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Main Info */}
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>اسم الغرض *</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: هاتف سامسونج أسود"
              placeholderTextColor={Colors.textMuted}
              value={itemName}
              onChangeText={setItemName}
              textAlign="right"
            />
          </View>
          <View style={styles.fieldSep} />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>الوصف</Text>
            <TextInput
              style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
              placeholder="اللون، العلامة التجارية، أي تفاصيل مميزة..."
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              textAlign="right"
            />
          </View>
        </View>

        {/* Location + Contact */}
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>مكان الفقدان *</Text>
            <TextInput
              style={styles.input}
              placeholder="الحي، الشارع، المنطقة..."
              placeholderTextColor={Colors.textMuted}
              value={lastSeen}
              onChangeText={setLastSeen}
              textAlign="right"
            />
          </View>
          <View style={styles.fieldSep} />
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>رقم التواصل *</Text>
            <TextInput
              style={styles.input}
              placeholder="+249..."
              placeholderTextColor={Colors.textMuted}
              value={contactPhone}
              onChangeText={setContactPhone}
              keyboardType="phone-pad"
              textAlign="right"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, saving && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Ionicons name="megaphone-outline" size={18} color={Colors.cardBg} />
          <Text style={styles.submitText}>{saving ? "جاري النشر..." : "نشر الإعلان"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg, paddingHorizontal: 16, paddingBottom: 16,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  infoBox: {
    backgroundColor: Colors.primaryDim + "12", borderRadius: 14,
    padding: 14, flexDirection: "row-reverse", gap: 10, alignItems: "flex-start",
  },
  infoText: {
    fontFamily: "Cairo_400Regular", fontSize: 13,
    color: Colors.primaryDim, textAlign: "right", flex: 1, lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.divider,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    overflow: "hidden",
  },
  field: { padding: 14 },
  fieldSep: { height: 1, backgroundColor: Colors.divider },
  fieldLabel: {
    fontFamily: "Cairo_600SemiBold", fontSize: 13,
    color: Colors.textSecondary, textAlign: "right", marginBottom: 8,
  },
  input: {
    fontFamily: "Cairo_400Regular", fontSize: 15,
    color: Colors.textPrimary, paddingVertical: 2,
  },
  catGrid: {
    flexDirection: "row-reverse", flexWrap: "wrap",
    gap: 8, padding: 14, paddingTop: 0,
  },
  catBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg,
  },
  catBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catBtnText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  catBtnTextActive: { color: Colors.cardBg },
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 18,
    paddingVertical: 16, flexDirection: "row-reverse",
    alignItems: "center", justifyContent: "center", gap: 10,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  submitText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.cardBg },
});
