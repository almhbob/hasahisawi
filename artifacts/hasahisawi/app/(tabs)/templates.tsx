import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";

const templates = [
  { title: "جمعة مباركة", type: "مجاني", text: "جمعة مباركة لأهل الحصاحيصا، جعلها الله جمعة خير وبركة.", color: "#22C55E" },
  { title: "إعلان متجر", type: "مدفوع", text: "عرض خاص اليوم فقط — زورونا واستفيدوا من التخفيضات.", color: "#F59E0B" },
  { title: "تهنئة زواج", type: "مدفوع", text: "أجمل التهاني بمناسبة الزواج، بارك الله لكما وبارك عليكما.", color: "#C084FC" },
  { title: "إعلان وظيفة", type: "مدفوع", text: "مطلوب موظف أو موظفة للعمل داخل الحصاحيصا — للتواصل عبر التطبيق.", color: "#38BDF8" },
];

export default function TemplatesScreen() {
  const useTemplate = (text: string, type: string) => {
    if (type === "مدفوع") {
      Alert.alert("قالب مدفوع", "سيتم ربط الشراء لاحقاً عبر Google Play Billing. حالياً يمكن استخدامه للمعاينة.");
    }
    router.push({ pathname: "/(tabs)/social", params: { templateText: text } } as any);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Ionicons name="color-palette-outline" size={36} color={Colors.primary} />
        <Text style={styles.title}>سوق القوالب</Text>
        <Text style={styles.subtitle}>قوالب جاهزة للمنشورات والإعلانات والتهاني داخل القسم الاجتماعي.</Text>
      </View>
      {templates.map((item) => (
        <View key={item.title} style={[styles.card, { borderColor: item.color + "66" }]}>
          <Text style={[styles.templateTitle, { color: item.color }]}>{item.title}</Text>
          <Text style={styles.type}>{item.type}</Text>
          <Text style={styles.preview}>{item.text}</Text>
          <Pressable style={[styles.button, { backgroundColor: item.color }]} onPress={() => useTemplate(item.text, item.type)}>
            <Text style={styles.buttonText}>استخدم القالب</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingBottom: 34 },
  hero: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 18, alignItems: "center", borderWidth: 1, borderColor: Colors.primary + "33", marginBottom: 14 },
  title: { color: Colors.textPrimary, fontSize: 23, fontFamily: "Cairo_700Bold", marginTop: 8 },
  subtitle: { color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginTop: 6 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1 },
  templateTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", textAlign: "right" },
  type: { color: Colors.textMuted, textAlign: "right", marginTop: 4 },
  preview: { color: Colors.textPrimary, lineHeight: 23, textAlign: "right", marginTop: 10 },
  button: { marginTop: 12, borderRadius: 13, paddingVertical: 11, alignItems: "center" },
  buttonText: { color: "#fff", fontFamily: "Cairo_700Bold" },
});
