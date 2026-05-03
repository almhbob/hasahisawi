import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const messageTypes = [
  "ليك يا خريج 🎓",
  "حقك علي 💔",
  "ألف سلامة ليك 🤲",
  "إنت قدرها 💪",
  "تهنئة 🎉",
  "رسالة تحفيزية ✨",
  "همسة عتاب 💬",
  "توصية هدية 🎁",
  "نصيحة أو وصية 📜",
];

const executionOptions = [
  "نابض: كلام قلبك بخط يدي ✍️",
  "صياغة بالإنابة مع معاينة قبل الإرسال",
  "رسالة مطبوعة بتنسيق أنيق",
  "هدية تجيبها أنت ونحن نوصلها",
  "هدية نجهزها بعد اختيارك وموافقتك",
];

export default function SaaiReadScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Ionicons name="heart-outline" size={42} color="#D4AF37" />
        </View>
        <Text style={styles.title}>ساعي ريد</Text>
        <Text style={styles.nabed}>(نابض) كلام قلبك بخط يدي</Text>
        <Text style={styles.badge}>قريباً</Text>
        <Text style={styles.subtitle}>نوصّل إحساسك بطريقتك وبسرية كاملة</Text>
        <Text style={styles.body}>
          خدمة إنسانية راقية لطلب رسالة، هدية، نصيحة، تهنئة، تحفيز، حقك علي، أو همسة عتاب لشخص معيّن.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>أنواع الرسائل</Text>
        <View style={styles.chips}>
          {messageTypes.map((item) => (
            <View key={item} style={styles.chip}>
              <Text style={styles.chipText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>طريقة تنفيذ الطلب</Text>
        {executionOptions.map((item) => (
          <View key={item} style={styles.row}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#D4AF37" />
            <Text style={styles.rowText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>قواعد الخدمة عند التفعيل</Text>
        <Text style={styles.rule}>• يمكنك كتابة رسالتك حتى 500 كلمة، أو اختيار "خلّيها علينا" لنصيغها عنك.</Text>
        <Text style={styles.rule}>• ستطّلع على النص قبل الإرسال، والتعديلان الأولان مجاناً.</Text>
        <Text style={styles.rule}>• التعديل الثالث عليه تكلفة إضافية يحددها مسؤول القسم.</Text>
        <Text style={styles.rule}>• الهدية المرفوضة يتم إرجاعها لك، مع الحفاظ على سرية بياناتك.</Text>
        <Text style={styles.rule}>• التوصيل الآجل بدون تكلفة إضافية، والعاجل عليه تكلفة يحددها المشرف.</Text>
      </View>

      <View style={styles.notice}>
        <Ionicons name="lock-closed-outline" size={22} color={Colors.primary} />
        <Text style={styles.noticeText}>الخدمة غير مفعلة حالياً. سيتم فتح الطلبات بعد تجهيز التسعير اليدوي، التحويل، إثبات الدفع، التتبع، الإشعارات، والتقييم.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingBottom: 36 },
  hero: { backgroundColor: Colors.cardBg, borderRadius: 24, padding: 22, alignItems: "center", borderWidth: 1, borderColor: "#D4AF3744" },
  iconCircle: { width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center", backgroundColor: "#D4AF3718", borderWidth: 1, borderColor: "#D4AF3744" },
  title: { color: Colors.textPrimary, fontSize: 29, fontFamily: "Cairo_700Bold", marginTop: 12 },
  nabed: { color: "#D4AF37", fontSize: 16, fontFamily: "Cairo_700Bold", marginTop: 4, textAlign: "center" },
  badge: { marginTop: 10, backgroundColor: "#D4AF3722", color: "#D4AF37", paddingHorizontal: 16, paddingVertical: 5, borderRadius: 999, fontFamily: "Cairo_700Bold" },
  subtitle: { color: Colors.primary, fontFamily: "Cairo_700Bold", marginTop: 12, fontSize: 16, textAlign: "center" },
  body: { color: Colors.textSecondary, lineHeight: 23, textAlign: "center", marginTop: 10 },
  section: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 16, marginTop: 16, borderWidth: 1, borderColor: Colors.divider },
  sectionTitle: { color: Colors.textPrimary, fontSize: 17, fontFamily: "Cairo_700Bold", textAlign: "right", marginBottom: 10 },
  chips: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#D4AF3718", borderColor: "#D4AF3744", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: Colors.textPrimary, fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 7 },
  rowText: { color: Colors.textSecondary, flex: 1, textAlign: "right", fontFamily: "Cairo_600SemiBold" },
  rule: { color: Colors.textSecondary, lineHeight: 23, textAlign: "right", marginTop: 6 },
  notice: { marginTop: 16, backgroundColor: Colors.primary + "12", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Colors.primary + "33", flexDirection: "row-reverse", gap: 10, alignItems: "center" },
  noticeText: { color: Colors.textPrimary, flex: 1, lineHeight: 22, textAlign: "right" },
});
