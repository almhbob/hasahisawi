import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Linking } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import ModernHeader from "@/components/ui/ModernHeader";

const SERVICES = [
  { id: "barber", title: "حلاقين وصوالين", sub: "حجز سريع · عناية شعر ولحية", icon: "content-cut", color: "#38BDF8" },
  { id: "fashion", title: "أزياء رجالية", sub: "جلابيب · بدل · أحذية", icon: "tshirt-crew-outline", color: "#8B5CF6" },
  { id: "perfume", title: "عطور واكسسوارات", sub: "عطور · ساعات · محافظ", icon: "spray-bottle", color: "#FBBF24" },
  { id: "fitness", title: "رياضة ولياقة", sub: "صالات · مدربين · مكملات", icon: "dumbbell", color: "#22C55E" },
  { id: "craft", title: "حرف وصيانة", sub: "كهرباء · سباكة · نجارة", icon: "tools", color: "#F97316" },
  { id: "jobs", title: "فرص عمل وخدمات", sub: "عمالة · مهنيين · طلب خدمة", icon: "briefcase-outline", color: "#14B8A6" },
];

const PROVIDERS = [
  { name: "صالون الأناقة", type: "barber", area: "وسط المدينة", phone: "0913000001", tags: ["حلاقة", "عناية لحية", "حجز مسبق"] },
  { name: "أناقة الرجال", type: "fashion", area: "السوق", phone: "0913000002", tags: ["جلابيب", "أحذية", "اكسسوارات"] },
  { name: "عطور النيل", type: "perfume", area: "شارع المستشفى", phone: "0913000003", tags: ["عطور", "هدايا", "طلبات"] },
  { name: "فريق اللياقة", type: "fitness", area: "حي المزاد", phone: "0913000004", tags: ["تدريب", "تمارين", "اشتراكات"] },
];

export default function MenScreen() {
  const [selected, setSelected] = useState("all");
  const [joinName, setJoinName] = useState("");
  const [joinPhone, setJoinPhone] = useState("");

  const visibleProviders = selected === "all" ? PROVIDERS : PROVIDERS.filter(p => p.type === selected);

  function submitJoin() {
    if (!joinName.trim() || !joinPhone.trim()) {
      Alert.alert("بيانات ناقصة", "أدخل الاسم ورقم الهاتف لإرسال طلب الانضمام");
      return;
    }
    Alert.alert("تم الاستلام ✅", "تم تسجيل طلبك في قسم الرجال، وسيتم التواصل معك للمراجعة.");
    setJoinName("");
    setJoinPhone("");
  }

  return (
    <View style={styles.container}>
      <ModernHeader
        title="قسم الرجال"
        subtitle="خدمات الرجال في مكان واحد: حلاقة، أزياء، عطور، رياضة، وصيانة"
        icon="male-outline"
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.body}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <TouchableOpacity onPress={() => setSelected("all")} style={[styles.chip, selected === "all" && styles.chipActive]}>
              <Ionicons name="apps" size={14} color={selected === "all" ? "#001" : Colors.textMuted} />
              <Text style={[styles.chipText, selected === "all" && styles.chipTextActive]}>الكل</Text>
            </TouchableOpacity>
            {SERVICES.map(s => (
              <TouchableOpacity key={s.id} onPress={() => setSelected(s.id)} style={[styles.chip, selected === s.id && { backgroundColor: s.color, borderColor: s.color }]}>
                <MaterialCommunityIcons name={s.icon as any} size={14} color={selected === s.id ? "#001" : s.color} />
                <Text style={[styles.chipText, selected === s.id && styles.chipTextActive]}>{s.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.grid}>
            {SERVICES.map((s, i) => (
              <Animated.View key={s.id} entering={FadeInDown.delay(70 + i * 45).springify()} style={styles.serviceCard}>
                <View style={[styles.serviceIcon, { backgroundColor: s.color + "20", borderColor: s.color + "50" }]}>
                  <MaterialCommunityIcons name={s.icon as any} size={24} color={s.color} />
                </View>
                <Text style={styles.serviceTitle}>{s.title}</Text>
                <Text style={styles.serviceSub}>{s.sub}</Text>
              </Animated.View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>مزودو خدمات مقترحون</Text>
          {visibleProviders.map((p, index) => (
            <Animated.View key={p.phone} entering={FadeInDown.delay(100 + index * 60).springify()} style={styles.providerCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.providerName}>{p.name}</Text>
                <Text style={styles.providerMeta}>{p.area}</Text>
                <View style={styles.tags}>{p.tags.map(tag => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View>
              </View>
              <AnimatedPress onPress={() => Linking.openURL(`tel:${p.phone}`)}>
                <View style={styles.callBtn}><Ionicons name="call" size={16} color="#001" /></View>
              </AnimatedPress>
            </Animated.View>
          ))}

          <LinearGradient colors={["#38BDF815", "#8B5CF610"]} style={styles.joinCard}>
            <Text style={styles.joinTitle}>انضم كمزود خدمة</Text>
            <Text style={styles.joinSub}>أضف صالونك أو متجرك أو خدمتك لقسم الرجال</Text>
            <TextInput value={joinName} onChangeText={setJoinName} placeholder="اسم الخدمة / صاحب العمل" placeholderTextColor={Colors.textMuted} style={styles.input} />
            <TextInput value={joinPhone} onChangeText={setJoinPhone} placeholder="رقم الهاتف" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" style={styles.input} />
            <AnimatedPress onPress={submitJoin}>
              <View style={styles.submitBtn}><Text style={styles.submitText}>إرسال طلب الانضمام</Text><Ionicons name="arrow-back" size={16} color="#001" /></View>
            </AnimatedPress>
          </LinearGradient>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 18, gap: 16 },
  filterRow: { gap: 8, paddingVertical: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: Colors.radius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingVertical: 8, paddingHorizontal: 12 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: "Cairo_600SemiBold", color: Colors.textSecondary, fontSize: 12 },
  chipTextActive: { color: "#001" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  serviceCard: { width: "48%", minHeight: 130, borderRadius: Colors.radius.lg, backgroundColor: Colors.surface, padding: 13, alignItems: "center", justifyContent: "center", ...Colors.shadow.card },
  serviceIcon: { width: 48, height: 48, borderRadius: Colors.radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 8 },
  serviceTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 13, textAlign: "center" },
  serviceSub: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 10, textAlign: "center", marginTop: 3, lineHeight: 16 },
  sectionTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 17, textAlign: "right", marginTop: 4 },
  providerCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: Colors.radius.lg, padding: 13, ...Colors.shadow.card },
  providerName: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right", fontSize: 15 },
  providerMeta: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "right", fontSize: 11 },
  tags: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 5, marginTop: 8 },
  tag: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 10, backgroundColor: Colors.bgAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Colors.radius.pill },
  callBtn: { width: 42, height: 42, borderRadius: Colors.radius.md, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  joinCard: { borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: "#38BDF830", padding: 16, gap: 10 },
  joinTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 17, textAlign: "right" },
  joinSub: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 12, textAlign: "right" },
  input: { height: 46, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgAlt, paddingHorizontal: 12, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", textAlign: "right" },
  submitBtn: { height: 46, borderRadius: Colors.radius.md, backgroundColor: Colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 13 },
});
