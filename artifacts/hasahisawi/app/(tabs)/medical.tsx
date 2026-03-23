import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import Animated, { FadeInDown } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";

import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import GuestGate from "@/components/GuestGate";

export type Facility = {
  id: string;
  name: string;
  type: "pharmacy" | "hospital" | "clinic";
  address: string;
  phone: string;
  isOnCall: boolean;
  hours: string;
  specialties?: string[];
};

export const MEDICAL_KEY = "medical_facilities_v1";
const MEDICAL_INIT_KEY = "medical_facilities_initialized";

const SEED_FACILITIES: Facility[] = [
  { id: "med1", name: "صيدلية الشفاء", type: "pharmacy", address: "شارع السوق الكبير، حصاحيصا", phone: "+249912345678", isOnCall: true, hours: "24 ساعة" },
  { id: "med2", name: "صيدلية الأمل", type: "pharmacy", address: "حي الضحى، حصاحيصا", phone: "+249912345679", isOnCall: false, hours: "8ص - 10م" },
  { id: "med3", name: "صيدلية النيل", type: "pharmacy", address: "شارع المدارس، حصاحيصا", phone: "+249912345680", isOnCall: false, hours: "8ص - 9م" },
  { id: "med4", name: "صيدلية الرحمة", type: "pharmacy", address: "القرية الشمالية", phone: "+249912345681", isOnCall: true, hours: "24 ساعة" },
  { id: "med5", name: "مستشفى حصاحيصا الحكومي", type: "hospital", address: "المنطقة المركزية، حصاحيصا", phone: "+249912345682", isOnCall: true, hours: "24 ساعة", specialties: ["طوارئ", "جراحة", "أطفال", "نساء وتوليد"] },
  { id: "med6", name: "مستشفى الخيرية الأهلي", type: "hospital", address: "حي السلام، حصاحيصا", phone: "+249912345683", isOnCall: false, hours: "7ص - 5م", specialties: ["باطنية", "أطفال"] },
  { id: "med7", name: "عيادة الدكتور أحمد", type: "clinic", address: "شارع النيل، حصاحيصا", phone: "+249912345684", isOnCall: false, hours: "4م - 9م", specialties: ["طب عام"] },
  { id: "med8", name: "عيادة الأطفال المتخصصة", type: "clinic", address: "الحي الغربي، حصاحيصا", phone: "+249912345685", isOnCall: false, hours: "5م - 9م", specialties: ["أطفال"] },
];

export async function loadFacilities(): Promise<Facility[]> {
  const init = await AsyncStorage.getItem(MEDICAL_INIT_KEY);
  if (!init) {
    await AsyncStorage.setItem(MEDICAL_KEY, JSON.stringify(SEED_FACILITIES));
    await AsyncStorage.setItem(MEDICAL_INIT_KEY, "1");
    return SEED_FACILITIES;
  }
  const raw = await AsyncStorage.getItem(MEDICAL_KEY);
  return raw ? JSON.parse(raw) : [];
}

const FILTER_OPTIONS = [
  { key: "all", label: "الكل" },
  { key: "pharmacy", label: "صيدليات" },
  { key: "hospital", label: "مستشفيات" },
  { key: "clinic", label: "عيادات" },
  { key: "onCall", label: "مناوبة" },
];

export function getTypeIcon(type: Facility["type"]) {
  switch (type) {
    case "pharmacy": return "medical-bag";
    case "hospital": return "hospital-building";
    case "clinic": return "stethoscope";
  }
}

export function getTypeColor(type: Facility["type"]) {
  switch (type) {
    case "pharmacy": return Colors.primary;
    case "hospital": return "#2E7D9A";
    case "clinic": return "#6A5ACD";
  }
}

export function getTypeLabel(type: Facility["type"], t: any) {
  switch (type) {
    case "pharmacy": return t('medical', 'pharmacy');
    case "hospital": return t('medical', 'hospital');
    case "clinic": return t('medical', 'clinic');
  }
}

export default function MedicalScreen() {
  const { t, isRTL, lang, tr } = useLang();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [facilities, setFacilities] = useState<Facility[]>([]);

  const FILTER_OPTIONS = [
    { key: "all", label: t('medical', 'allTypes') },
    { key: "pharmacy", label: t('medical', 'pharmacy') },
    { key: "hospital", label: t('medical', 'hospital') },
    { key: "clinic", label: t('medical', 'clinic') },
    { key: "onCall", label: t('medical', 'onCall') },
  ];

  const load = async () => {
    const data = await loadFacilities();
    setFacilities(data);
  };

  useEffect(() => { load(); }, []);
  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = facilities.filter((f) => {
    const matchesSearch = search === "" || f.name.includes(search) || f.address.includes(search);
    const matchesFilter = filter === "all" || (filter === "onCall" ? f.isOnCall : f.type === filter);
    return matchesSearch && matchesFilter;
  });

  const handleCall = async (phone: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const clean = phone.replace(/[^0-9]/g, "");
    Alert.alert(t('common', 'contact'), t('common', 'contact'), [
      { text: t('common', 'cancel'), style: "cancel" },
      { text: "WhatsApp", onPress: () => Linking.openURL(`https://wa.me/${clean}`) },
      { text: t('medical', 'callPhone'), onPress: () => Linking.openURL(`tel:${phone}`) },
    ]);
  };

  const handleBook = (name: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(t('common', 'bookNow'), `${t('medical', 'bookAppointment')}: ${name}`);
  };

  const handleRate = (name: string) => {
    Alert.alert(t('common', 'rate'), `${t('common', 'rateService')}: ${name}`);
  };

  const openMaps = (address: string) => {
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address + " Hasahisa")}`);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.headerTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('medical', 'title')}</Text>
        <View style={[styles.searchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { textAlign: isRTL ? 'right' : 'left' }]}
            placeholder={t('medical', 'search')}
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow} contentContainerStyle={[styles.filtersContent, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {FILTER_OPTIONS.map((opt) => (
            <AnimatedPress
              key={opt.key}
              scaleDown={0.92}
              onPress={() => setFilter(opt.key)}
            >
              <View style={[styles.filterChip, filter === opt.key && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, filter === opt.key && styles.filterChipTextActive]}>{opt.label}</Text>
              </View>
            </AnimatedPress>
          ))}
        </ScrollView>
      </View>

      <GuestGate
        title={tr("الخدمات الطبية", "Medical Services")}
        preview={
          <View style={{ padding: 16, gap: 12 }}>
            {[
              { name: "صيدلية الشفاء", type: "صيدلية", hours: "24 ساعة", onCall: true },
              { name: "مستشفى حصاحيصا الحكومي", type: "مستشفى", hours: "24 ساعة", onCall: true },
              { name: "عيادة الدكتور أحمد", type: "عيادة", hours: "4م - 9م", onCall: false },
            ].map((item, i) => (
              <View key={i} style={{ backgroundColor: Colors.cardBg, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.divider, flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: Colors.cyber + "20", alignItems: "center", justifyContent: "center" }}>
                  <MaterialCommunityIcons name={i === 0 ? "medical-bag" : i === 1 ? "hospital-building" : "stethoscope"} size={20} color={Colors.cyber} />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary }}>{item.name}</Text>
                  <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted }}>{item.type} • {item.hours}</Text>
                </View>
                {item.onCall && (
                  <View style={{ backgroundColor: Colors.primary + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontFamily: "Cairo_500Medium", fontSize: 10, color: Colors.primary }}>متاح</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        }
        features={[
          { icon: "call-outline",      text: tr("اتصل بأي منشأة طبية مباشرة", "Call any medical facility directly") },
          { icon: "calendar-outline",  text: tr("احجز موعداً في عيادتك", "Book appointments at clinics") },
          { icon: "star-outline",      text: tr("قيّم الخدمات وشارك تجربتك", "Rate services and share your experience") },
        ]}
      >
      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: Platform.OS === "web" ? 100 : 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="hospital-box-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyText}>{t('medical', 'noResults')}</Text>
          </View>
        )}
        {filtered.map((facility, index) => {
          const color = getTypeColor(facility.type);
          return (
            <Animated.View key={facility.id} entering={FadeInDown.delay(index * 60).springify().damping(18)}>
            <View style={styles.card}>
              <View style={[styles.cardHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <View style={[styles.actionButtons, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <AnimatedPress onPress={() => handleCall(facility.phone)}>
                    <View style={styles.callBtn}>
                      <Ionicons name="call" size={20} color={Colors.cardBg} />
                    </View>
                  </AnimatedPress>
                  <AnimatedPress onPress={() => handleBook(facility.name)}>
                    <View style={[styles.callBtn, { backgroundColor: Colors.accent }]}>
                      <Ionicons name="calendar" size={20} color={Colors.cardBg} />
                    </View>
                  </AnimatedPress>
                  <AnimatedPress onPress={() => handleRate(facility.name)}>
                    <View style={[styles.callBtn, { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider }]}>
                      <Ionicons name="star-outline" size={20} color={Colors.textPrimary} />
                    </View>
                  </AnimatedPress>
                </View>
                <View style={[styles.cardHeaderRight, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <View style={[styles.nameRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    {facility.isOnCall && (
                      <View style={styles.onCallBadge}><Text style={styles.onCallText}>{t('medical', 'onCall')}</Text></View>
                    )}
                    <Text style={[styles.cardName, { textAlign: isRTL ? 'right' : 'left' }]}>{facility.name}</Text>
                  </View>
                  <View style={[styles.typeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <MaterialCommunityIcons name={getTypeIcon(facility.type)} size={14} color={color} />
                    <Text style={[styles.typeLabel, { color }]}>{getTypeLabel(facility.type, t)}</Text>
                  </View>
                </View>
                <View style={[styles.iconCircle, { backgroundColor: color + "18" }]}>
                  <MaterialCommunityIcons name={getTypeIcon(facility.type)} size={26} color={color} />
                </View>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.cardDetails}>
                <View style={[styles.detailRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Text style={[styles.detailValue, { textAlign: isRTL ? 'right' : 'left' }]}>{facility.hours}</Text>
                  <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                </View>
                <AnimatedPress onPress={() => openMaps(facility.address)}>
                  <View style={[styles.detailRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={[styles.detailValue, { color: Colors.primary, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>{facility.address}</Text>
                    <Ionicons name="location-outline" size={14} color={Colors.primary} />
                  </View>
                </AnimatedPress>
                {facility.specialties && facility.specialties.length > 0 && (
                  <View style={[styles.specialtiesRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    {facility.specialties.map((s) => (
                      <View key={s} style={styles.specialtyTag}>
                        <Text style={styles.specialtyText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
            </Animated.View>
          );
        })}
      </ScrollView>
      </GuestGate>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.cardBg, paddingHorizontal: 16, paddingBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary, textAlign: "right", marginBottom: 14 },
  searchRow: {
    flexDirection: "row-reverse", alignItems: "center", backgroundColor: Colors.bg,
    borderRadius: 12, paddingHorizontal: 12, gap: 8, marginBottom: 12,
  },
  searchIcon: { marginLeft: 4 },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 11 },
  filtersRow: { flexDirection: "row" },
  filtersContent: { flexDirection: "row-reverse", gap: 8, paddingLeft: 4 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },
  filterChipTextActive: { color: "#FFFFFF" },
  list: { flex: 1 },
  listContent: { padding: 14, gap: 12 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 16, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.cardBg, borderRadius: 18, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
    borderWidth: 1, borderColor: Colors.divider,
  },
  cardHeader: { flexDirection: "row-reverse", alignItems: "center", padding: 14, gap: 12 },
  iconCircle: { width: 52, height: 52, borderRadius: 13, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  cardHeaderRight: { flex: 1, alignItems: "flex-end" },
  nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardName: { fontFamily: "Cairo_600SemiBold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  onCallBadge: { backgroundColor: Colors.primary + "20", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  onCallText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary },
  typeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 3 },
  typeLabel: { fontFamily: "Cairo_500Medium", fontSize: 12 },
  actionButtons: { gap: 8, alignItems: "center" },
  callBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: "center", alignItems: "center" },
  cardDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 14 },
  cardDetails: { padding: 14, gap: 8 },
  detailRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  detailValue: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "right", flex: 1 },
  specialtiesRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 4 },
  specialtyTag: { backgroundColor: Colors.bgDeep, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  specialtyText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
});
