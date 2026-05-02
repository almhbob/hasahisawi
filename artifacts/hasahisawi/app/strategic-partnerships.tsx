import React, { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_STRATEGIC_PARTNERSHIPS,
  GOVERNMENT_POLICY_NOTICE,
  STRATEGIC_PARTNERSHIPS_STORE_KEY,
  getPartnershipInvite,
  shouldShowPartnership,
  type PartnershipType,
  type StrategicPartnership,
} from "@/lib/strategic-partnerships";

const CONTACT_EMAIL = "Hasahisawi@hotmail.com";

async function loadItems(): Promise<StrategicPartnership[]> {
  const raw = await AsyncStorage.getItem(STRATEGIC_PARTNERSHIPS_STORE_KEY);
  if (!raw) return DEFAULT_STRATEGIC_PARTNERSHIPS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_STRATEGIC_PARTNERSHIPS;
  } catch {
    return DEFAULT_STRATEGIC_PARTNERSHIPS;
  }
}

export default function StrategicPartnershipsScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "moderator";
  const [items, setItems] = useState<StrategicPartnership[]>(DEFAULT_STRATEGIC_PARTNERSHIPS);
  const [type, setType] = useState<PartnershipType>("telecom");

  useEffect(() => { loadItems().then(setItems); }, []);

  const visibleItems = useMemo(
    () => items.filter(i => i.type === type).filter(i => shouldShowPartnership(i, isAdmin)),
    [items, type, isAdmin],
  );

  const persist = async (next: StrategicPartnership[]) => {
    setItems(next);
    await AsyncStorage.setItem(STRATEGIC_PARTNERSHIPS_STORE_KEY, JSON.stringify(next));
  };

  const toggle = async (item: StrategicPartnership) => {
    const nextStatus = item.status === "active" ? "hidden" : "active";
    const next = items.map(i => i.id === item.id ? { ...i, status: nextStatus } : i);
    await persist(next);
    Alert.alert("تم", nextStatus === "active" ? "تم إظهار العنصر" : "تم إخفاء العنصر");
  };

  const invite = getPartnershipInvite(type);
  const mailSubject = type === "government" ? "دعوة شراكة حكومية مع حصاحيصاوي" : "دعوة شراكة اتصالات مع حصاحيصاوي";

  return (
    <View style={styles.root}>
      <LinearGradient colors={["#07130d", "#113321", "#07130d"]} style={styles.header}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="chevron-forward" size={24} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>الشراكات الاستراتيجية</Text>
            <Text style={styles.subtitle}>واجهة آمنة للجهات الحكومية وشركات الاتصالات بمستوى عالمي</Text>
          </View>
        </View>

        <View style={styles.segment}>
          <Pressable onPress={() => setType("telecom")} style={[styles.segmentButton, type === "telecom" && styles.segmentActive]}>
            <Ionicons name="cellular" size={18} color={type === "telecom" ? "#06140d" : Colors.textSecondary} />
            <Text style={[styles.segmentText, type === "telecom" && styles.segmentTextActive]}>الاتصالات</Text>
          </Pressable>
          <Pressable onPress={() => setType("government")} style={[styles.segmentButton, type === "government" && styles.segmentActive]}>
            <MaterialCommunityIcons name="bank-outline" size={18} color={type === "government" ? "#06140d" : Colors.textSecondary} />
            <Text style={[styles.segmentText, type === "government" && styles.segmentTextActive]}>الحكومية</Text>
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name={type === "government" ? "shield-check-outline" : "access-point-network"} size={30} color={Colors.accentLight} />
          </View>
          <Text style={styles.heroTitle}>{type === "government" ? "تكامل حكومي آمن" : "توأمة اتصالات مربحة"}</Text>
          <Text style={styles.heroText}>{invite}</Text>
          {type === "government" && <Text style={styles.policy}>{GOVERNMENT_POLICY_NOTICE}</Text>}
          <Pressable
            style={styles.mailButton}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(invite)}`)}
          >
            <Ionicons name="mail" size={18} color="#06140d" />
            <Text style={styles.mailText}>إرسال دعوة احترافية</Text>
          </Pressable>
        </View>

        {visibleItems.length === 0 && (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="eye-off-outline" size={42} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>لا توجد عناصر ظاهرة حالياً</Text>
            <Text style={styles.emptyText}>تم إخفاء الجهات الحكومية افتراضياً لحماية التطبيق من مخالفات المتجر. يمكنك إظهارها من حساب الإدارة بعد الاتفاق الرسمي.</Text>
          </View>
        )}

        {visibleItems.map(item => (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={[styles.cardIcon, item.type === "government" ? styles.gov : styles.tel]}>
                <MaterialCommunityIcons name={item.type === "government" ? "bank" : "sim"} size={23} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemTitle}>{item.title}</Text>
              </View>
              {isAdmin && <Text style={styles.adminPill}>{item.status === "active" ? "ظاهر" : "مخفي"}</Text>}
            </View>
            <Text style={styles.itemDesc}>{item.description}</Text>
            <View style={styles.serviceList}>{item.services.map((s, idx) => <Text key={idx} style={styles.service}>✓ {s}</Text>)}</View>
            {!!item.agreementNote && <Text style={styles.note}>{item.agreementNote}</Text>}
            {isAdmin && (
              <Pressable onPress={() => toggle(item)} style={styles.controlButton}>
                <Text style={styles.controlText}>{item.status === "active" ? "إخفاء حتى الاعتماد" : "إظهار بعد الاعتماد"}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  topRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  title: { color: Colors.textPrimary, fontSize: 24, fontFamily: "Cairo_700Bold", textAlign: "right" },
  subtitle: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Cairo_500Medium", textAlign: "right", marginTop: 3 },
  segment: { flexDirection: "row-reverse", gap: 10, marginTop: 18 },
  segmentButton: { flex: 1, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: Colors.divider, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  segmentActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  segmentText: { color: Colors.textSecondary, fontFamily: "Cairo_700Bold" },
  segmentTextActive: { color: "#06140d" },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  heroCard: { borderRadius: 26, padding: 18, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderGoldGlow },
  heroIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: Colors.accentGlow, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  heroTitle: { color: Colors.accentLight, fontFamily: "Cairo_700Bold", fontSize: 20, textAlign: "right", marginTop: 12 },
  heroText: { color: Colors.textSecondary, fontFamily: "Cairo_500Medium", fontSize: 14, lineHeight: 25, textAlign: "right", marginTop: 8 },
  policy: { color: Colors.warning, fontFamily: "Cairo_600SemiBold", fontSize: 12, lineHeight: 22, textAlign: "right", marginTop: 10 },
  mailButton: { marginTop: 16, minHeight: 52, borderRadius: 17, backgroundColor: Colors.accentLight, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
  mailText: { color: "#06140d", fontFamily: "Cairo_700Bold", fontSize: 15 },
  emptyCard: { borderRadius: 22, padding: 20, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider, alignItems: "center" },
  emptyTitle: { color: Colors.textPrimary, fontFamily: "Cairo_700Bold", fontSize: 17, marginTop: 10 },
  emptyText: { color: Colors.textSecondary, fontFamily: "Cairo_500Medium", textAlign: "center", lineHeight: 24, marginTop: 6 },
  card: { borderRadius: 24, padding: 16, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.borderGlow },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  cardIcon: { width: 52, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  gov: { backgroundColor: "#2563eb" },
  tel: { backgroundColor: "#f97316" },
  itemName: { color: Colors.textPrimary, fontFamily: "Cairo_700Bold", fontSize: 17, textAlign: "right" },
  itemTitle: { color: Colors.textSecondary, fontFamily: "Cairo_500Medium", fontSize: 12, textAlign: "right" },
  adminPill: { color: Colors.primary, backgroundColor: Colors.primary + "22", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, fontFamily: "Cairo_700Bold", fontSize: 11 },
  itemDesc: { color: Colors.textSecondary, fontFamily: "Cairo_500Medium", lineHeight: 24, textAlign: "right", marginTop: 12 },
  serviceList: { gap: 6, marginTop: 12 },
  service: { color: Colors.primaryLight, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  note: { color: Colors.accentLight, fontFamily: "Cairo_500Medium", textAlign: "right", marginTop: 12, lineHeight: 22 },
  controlButton: { marginTop: 14, minHeight: 46, borderRadius: 15, borderWidth: 1, borderColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  controlText: { color: Colors.primary, fontFamily: "Cairo_700Bold" },
});
