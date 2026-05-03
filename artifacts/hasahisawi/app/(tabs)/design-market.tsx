import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const products = [
  { title: "شهادة تقديرية فاخرة", designer: "مصمم معتمد", price: "$3", category: "شهادات", color: "#D4AF37", note: "ملف عالي الجودة للطباعة PDF / PNG" },
  { title: "دعوة زواج كلاسيكية", designer: "استوديو مناسبات", price: "$5", category: "زواج", color: "#C084FC", note: "تصميم قابل للتعديل والتصدير بجودة عالية" },
  { title: "بوستر إعلان تجاري", designer: "مصمم تسويق", price: "$4", category: "إعلانات", color: "#F59E0B", note: "مناسب للنشر في المجتمع وواتساب وفيسبوك" },
  { title: "بطاقة تهنئة مولود", designer: "مصمم مناسبات", price: "$2", category: "تهاني", color: "#38BDF8", note: "نسخة مشاركة + نسخة طباعة" },
];

export default function DesignMarketScreen() {
  const buy = (title: string) => {
    Alert.alert("شراء التصميم", `سيتم ربط شراء ${title} عبر Google Play Billing وحفظه في مشترياتك.`);
  };

  const join = () => {
    Alert.alert(
      "اشتراك المصممين",
      "يدفع المصمم اشتراكاً شهرياً لعرض أعماله في المعرض، ويحصل على صفحة أعمال ومبيعات وتقارير."
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Ionicons name="brush-outline" size={38} color={Colors.primary} />
        <Text style={styles.title}>معرض التصاميم</Text>
        <Text style={styles.subtitle}>منصة لبيع شهادات تقديرية، دعوات زواج، بوسترات، بطاقات تهنئة وتصاميم عالية الجودة من مصممين مشتركين.</Text>
        <Pressable style={styles.joinBtn} onPress={join}>
          <Text style={styles.joinText}>اشترك كمصمم</Text>
        </Pressable>
      </View>

      <View style={styles.planCard}>
        <Text style={styles.planTitle}>نظام الربح المقترح</Text>
        <Text style={styles.planText}>• المصمم يشترك شهرياً لعرض أعماله.</Text>
        <Text style={styles.planText}>• التطبيق يحصل على عمولة من كل عملية بيع.</Text>
        <Text style={styles.planText}>• التحميل يكون بجودة عالية: PDF / PNG / JPG.</Text>
        <Text style={styles.planText}>• المعاينة بجودة منخفضة وعليها علامة مائية لحماية التصميم.</Text>
      </View>

      {products.map((item) => (
        <View key={item.title} style={[styles.card, { borderColor: item.color + "66" }]}>
          <View style={styles.cardTop}>
            <View style={[styles.iconBox, { backgroundColor: item.color + "22" }]}>
              <Ionicons name="image-outline" size={24} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.productTitle}>{item.title}</Text>
              <Text style={styles.designer}>{item.designer} · {item.category}</Text>
            </View>
            <Text style={[styles.price, { color: item.color }]}>{item.price}</Text>
          </View>
          <View style={[styles.preview, { borderColor: item.color + "44" }]}>
            <Text style={styles.previewText}>معاينة التصميم</Text>
            <Text style={styles.watermark}>حصاحيصاوي · Preview</Text>
          </View>
          <Text style={styles.note}>{item.note}</Text>
          <Pressable style={[styles.buyBtn, { backgroundColor: item.color }]} onPress={() => buy(item.title)}>
            <Text style={styles.buyText}>شراء وتحميل بجودة عالية</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingBottom: 36 },
  hero: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 18, alignItems: "center", borderWidth: 1, borderColor: Colors.primary + "33" },
  title: { color: Colors.textPrimary, fontSize: 24, fontFamily: "Cairo_700Bold", marginTop: 8 },
  subtitle: { color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginTop: 7 },
  joinBtn: { marginTop: 14, backgroundColor: Colors.primary, borderRadius: 13, paddingHorizontal: 18, paddingVertical: 10 },
  joinText: { color: "#fff", fontFamily: "Cairo_700Bold" },
  planCard: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14, marginTop: 14, borderWidth: 1, borderColor: Colors.divider },
  planTitle: { color: Colors.primary, fontFamily: "Cairo_700Bold", fontSize: 16, textAlign: "right" },
  planText: { color: Colors.textSecondary, marginTop: 6, lineHeight: 22, textAlign: "right" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14, marginTop: 14, borderWidth: 1 },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  iconBox: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  productTitle: { color: Colors.textPrimary, fontFamily: "Cairo_700Bold", fontSize: 16, textAlign: "right" },
  designer: { color: Colors.textMuted, marginTop: 3, textAlign: "right" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  preview: { height: 150, borderRadius: 16, borderWidth: 1, marginTop: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#00000022" },
  previewText: { color: Colors.textPrimary, fontFamily: "Cairo_700Bold" },
  watermark: { color: Colors.textMuted, marginTop: 8, fontSize: 12 },
  note: { color: Colors.textSecondary, marginTop: 10, textAlign: "right" },
  buyBtn: { marginTop: 12, borderRadius: 13, paddingVertical: 11, alignItems: "center" },
  buyText: { color: "#fff", fontFamily: "Cairo_700Bold" },
});
