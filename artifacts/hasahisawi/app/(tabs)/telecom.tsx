import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const companies = [
  { name: "زين السودان", color: "#7C3AED", text: "مساحة جاهزة للعروض والباقات والدعم والرعاية الرقمية." },
  { name: "MTN السودان", color: "#FACC15", text: "مساحة قريبة للتفعيل للحملات وخدمات المشتركين والإعلانات المحلية." },
  { name: "سوداني", color: "#22C55E", text: "مكتب رقمي داخل حصاحيصاوي لخدمات الإنترنت والاتصال والعروض." },
];

export default function TelecomScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Ionicons name="wifi-outline" size={36} color={Colors.primary} />
        <Text style={styles.title}>شركات الاتصالات</Text>
        <Text style={styles.subtitle}>مساحة مخصصة لشركات الاتصالات في السودان للتوأمة، الرعاية، الإعلانات، وخدمة المواطنين.</Text>
      </View>
      {companies.map((c) => (
        <View key={c.name} style={[styles.card, { borderColor: c.color + "66" }]}>
          <Text style={[styles.company, { color: c.color }]}>{c.name}</Text>
          <Text style={styles.body}>{c.text}</Text>
          <Text style={styles.soon}>قريباً — جاهزة للتفعيل من لوحة الإدارة بعد الاتفاق.</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  hero: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 18, alignItems: "center", borderWidth: 1, borderColor: Colors.primary + "33" },
  title: { color: Colors.textPrimary, fontSize: 22, fontFamily: "Cairo_700Bold", marginTop: 8 },
  subtitle: { color: Colors.textSecondary, textAlign: "center", lineHeight: 22, marginTop: 6 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, padding: 16, marginTop: 14, borderWidth: 1 },
  company: { fontSize: 18, fontFamily: "Cairo_700Bold", textAlign: "right" },
  body: { color: Colors.textSecondary, marginTop: 8, lineHeight: 22, textAlign: "right" },
  soon: { color: Colors.primary, marginTop: 12, fontFamily: "Cairo_700Bold", textAlign: "right" },
});
