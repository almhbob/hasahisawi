import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";

type NumberEntry = {
  id: string;
  name: string;
  number: string;
  icon: string;
  color: string;
  note?: string;
};

type Category = {
  id: string;
  title: string;
  icon: string;
  color: string;
  numbers: NumberEntry[];
};

const CATEGORIES: Category[] = [
  {
    id: "emergency",
    title: "الطوارئ",
    icon: "warning-outline",
    color: "#EF4444",
    numbers: [
      { id: "police",    name: "الشرطة",                   number: "999",        icon: "shield-checkmark-outline", color: "#3B82F6", note: "متاح 24 ساعة" },
      { id: "ambulance", name: "الإسعاف",                   number: "998",        icon: "medkit-outline",           color: "#EF4444", note: "متاح 24 ساعة" },
      { id: "fire",      name: "الدفاع المدني والإطفاء",    number: "998",        icon: "flame-outline",            color: "#F97316", note: "متاح 24 ساعة" },
    ],
  },
  {
    id: "health",
    title: "الصحة",
    icon: "heart-outline",
    color: "#2D8A96",
    numbers: [
      { id: "hospital",  name: "مستشفى الحصاحيصا الحكومي", number: "0151234567", icon: "add-circle-outline",       color: "#2D8A96", note: "7ص – 5م" },
      { id: "clinic1",   name: "عيادة الطوارئ المركزية",   number: "0152345678", icon: "pulse-outline",            color: "#10B981", note: "24 ساعة" },
      { id: "pharmacy",  name: "صيدلية الإسعاف",           number: "0153456789", icon: "flask-outline",            color: "#8B5CF6", note: "24 ساعة" },
    ],
  },
  {
    id: "services",
    title: "الخدمات العامة",
    icon: "construct-outline",
    color: "#E07830",
    numbers: [
      { id: "water",    name: "مياه الشرب",     number: "0154567890", icon: "water-outline",        color: "#06B6D4" },
      { id: "electric", name: "الكهرباء",       number: "0155678901", icon: "flash-outline",        color: "#EAB308" },
      { id: "roads",    name: "إدارة الطرق",    number: "0156789012", icon: "car-outline",          color: "#F97316" },
      { id: "sanit",    name: "النظافة والصرف", number: "0157890123", icon: "trash-outline",        color: "#4A7459" },
    ],
  },
  {
    id: "government",
    title: "الجهات الحكومية",
    icon: "business-outline",
    color: "#6366F1",
    numbers: [
      { id: "locality",  name: "مفوضية المحلية",    number: "0158901234", icon: "business-outline",      color: "#6366F1" },
      { id: "civil",     name: "السجل المدني",      number: "0159012345", icon: "card-outline",          color: "#E07830" },
      { id: "courts",    name: "المحكمة",           number: "0150123456", icon: "scale-outline",         color: "#C4643A" },
      { id: "taxauth",   name: "الضرائب والجمارك", number: "0151234560", icon: "receipt-outline",       color: "#8B5CF6" },
    ],
  },
  {
    id: "education",
    title: "التعليم",
    icon: "school-outline",
    color: "#8B5CF6",
    numbers: [
      { id: "edu1",  name: "إدارة التعليم بالمنطقة",      number: "0152345679", icon: "school-outline",        color: "#8B5CF6" },
      { id: "edu2",  name: "امتحانات الشهادة السودانية",  number: "0153456780", icon: "document-text-outline", color: "#EC4899" },
    ],
  },
];

function NumberCard({ entry, index }: { entry: NumberEntry; index: number }) {
  const handleCall = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    Linking.openURL(`tel:${entry.number}`);
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify().damping(18)}>
      <AnimatedPress onPress={handleCall}>
        <View style={styles.card}>
          <View style={[styles.cardIcon, { backgroundColor: entry.color + "20" }]}>
            <Ionicons name={entry.icon as any} size={22} color={entry.color} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{entry.name}</Text>
            <Text style={[styles.cardNumber, { color: entry.color }]}>{entry.number}</Text>
            {entry.note && <Text style={styles.cardNote}>{entry.note}</Text>}
          </View>
          <View style={[styles.callBtn, { backgroundColor: entry.color + "18", borderColor: entry.color + "50" }]}>
            <Ionicons name="call" size={18} color={entry.color} />
            <Text style={[styles.callLabel, { color: entry.color }]}>اتصال</Text>
          </View>
        </View>
      </AnimatedPress>
    </Animated.View>
  );
}

function CategorySection({ cat, catIndex }: { cat: Category; catIndex: number }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Animated.View entering={FadeInDown.delay(catIndex * 80).springify()} style={styles.section}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          if (Platform.OS !== "web") Haptics.selectionAsync();
          setExpanded(v => !v);
        }}
      >
        <LinearGradient
          colors={[cat.color + "28", cat.color + "10"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.sectionHeader}
        >
          <View style={[styles.sectionIconWrap, { backgroundColor: cat.color + "25", borderColor: cat.color + "40" }]}>
            <Ionicons name={cat.icon as any} size={18} color={cat.color} />
          </View>
          <Text style={[styles.sectionTitle, { color: cat.color }]}>{cat.title}</Text>
          <View style={styles.sectionBadge}>
            <Text style={[styles.sectionBadgeText, { color: cat.color }]}>{cat.numbers.length}</Text>
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={Colors.textSecondary}
            style={{ marginRight: 4 }}
          />
        </LinearGradient>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.sectionBody}>
          {cat.numbers.map((entry, idx) => (
            <NumberCard key={entry.id} entry={entry} index={catIndex * 10 + idx} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

export default function NumbersScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const total = CATEGORIES.reduce((s, c) => s + c.numbers.length, 0);

  return (
    <View style={styles.root}>
      {/* Header */}
      <LinearGradient
        colors={[Colors.bg, Colors.cardBg]}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <Animated.View entering={FadeIn.delay(60).duration(500)} style={styles.headerContent}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="call" size={26} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>الأرقام المهمة</Text>
            <Text style={styles.headerSub}>{total} رقم في {CATEGORIES.length} أقسام — اضغط للاتصال المباشر</Text>
          </View>
        </Animated.View>

        {/* ملخص الطوارئ */}
        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.emergencyStrip}>
          <Ionicons name="alert-circle" size={16} color="#EF4444" />
          <Text style={styles.emergencyText}>طوارئ سريعة:</Text>
          <TouchableOpacity onPress={() => Linking.openURL("tel:999")} style={styles.emergencyChip}>
            <Ionicons name="shield" size={12} color="#3B82F6" />
            <Text style={[styles.emergencyChipText, { color: "#3B82F6" }]}>شرطة 999</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL("tel:998")} style={styles.emergencyChip}>
            <Ionicons name="medkit" size={12} color="#EF4444" />
            <Text style={[styles.emergencyChipText, { color: "#EF4444" }]}>إسعاف 998</Text>
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>

      {/* Categories */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {CATEGORIES.map((cat, idx) => (
          <CategorySection key={cat.id} cat={cat} catIndex={idx} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  /* Header */
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  headerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary + "20",
    borderWidth: 1,
    borderColor: Colors.primary + "40",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 26,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emergencyStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EF444415",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#EF444430",
    gap: 8,
    flexWrap: "wrap",
  },
  emergencyText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emergencyChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  emergencyChipText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },

  /* Scroll */
  scroll: { flex: 1 },

  /* Section */
  section: {
    marginBottom: 16,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: Colors.bg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  sectionBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },
  sectionBody: {
    backgroundColor: Colors.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },

  /* Card */
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.divider,
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  cardNumber: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    marginTop: 2,
    textAlign: "right",
    letterSpacing: 0.5,
  },
  cardNote: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "right",
    marginTop: 2,
  },
  callBtn: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
    minWidth: 52,
  },
  callLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 10,
  },
});
