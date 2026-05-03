import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const services = ["رسالة تهنئة", "رسالة اعتذار", "رسالة تحفيزية", "همسة عتاب", "توصية هدية", "وصية أو نصيحة"];

export default function SaaiReadScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Ionicons name="heart-outline" size={42} color="#D4AF37" />
        </View>
        <Text style={styles.title}>ساعي ريد</Text>
        <Text style={styles.badge}>قريباً</Text>
        <Text style={styles.subtitle}>نوصّل إحساسك كما يجب أن يُقال</Text>
        <Text style={styles.body}>
          مساحة خاصة لطلب رسائل تهنئة، اعتذار، تحفيز، نصيحة، همسة عتاب، أو توصية هدية لشخص معيّن بسرية كاملة.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>الخدمات المخطط لها</Text>
        {services.map((item) => (
          <View key={item} style={styles.row}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#D4AF37" />
            <Text style={styles.rowText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.notice}>
        <Ionicons name="lock-closed-outline" size={22} color={Colors.primary} />
        <Text style={styles.noticeText}>الخدمة غير مفعلة حالياً. سيتم فتح الطلبات بعد تجهيز آلية التسعير، التحويل، التتبع، والتوصيل.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingBottom: 36 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 24, padding: 22, alignItems: "center", borderWidth: 1, borderColor: "#D4AF3744" },
  iconCircle: { width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center", backgroundColor: "#D4AF3718", borderWidth: 1, borderColor: "#D4AF3744" },
  title: { color: Colors.textPrimary, fontSize: 28, fontFamily: "Cairo_700Bold", marginTop: 12 },
  badge: { marginTop: 8, backgroundColor: "#D4AF3722", color: "#D4AF37", paddingHorizontal: 16, paddingVertical: 5, borderRadius: 999, fontFamily: "Cairo_700Bold" },
  subtitle: { color: Colors.primary, fontFamily: "Cairo_700Bold", marginTop: 12, fontSize: 16, textAlign: "center" },
  body: { color: Colors.textSecondary, lineHeight: 23, textAlign: "center", marginTop: 10 },
  section: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 16, marginTop: 16, borderWidth: 1, borderColor: Colors.divider },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: "Cairo_700Bold", textAlign: "right", marginBottom: 10 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 7 },
  rowText: { color: Colors.textSecondary, flex: 1, textAlign: "right", fontFamily: "Cairo_600SemiBold" },
  notice: { marginTop: 16, backgroundColor: Colors.primary + "12", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Colors.primary + "33", flexDirection: "row-reverse", gap: 10, alignItems: "center" },
  noticeText: { color: Colors.textPrimary, flex: 1, lineHeight: 22, textAlign: "right" },
});
