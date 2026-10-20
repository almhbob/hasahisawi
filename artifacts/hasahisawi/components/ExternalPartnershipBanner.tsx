import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

const SECTORS = [
  { emoji: "🏥", label: "مستشفيات",  color: "#EF4444" },
  { emoji: "🎓", label: "جامعات",    color: "#3B82F6" },
  { emoji: "🏛️", label: "حكومية",    color: "#6366F1" },
  { emoji: "🏢", label: "شركات",     color: "#8B5CF6" },
  { emoji: "🤝", label: "منظمات",    color: "#10B981" },
  { emoji: "📡", label: "إعلام",     color: "#F59E0B" },
];

export default function ExternalPartnershipBanner() {
  const router = useRouter();

  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/external-partnership" as any);
  };

  return (
    <Animated.View entering={FadeInDown.delay(120)}>
      <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={s.card} accessibilityRole="button">
        <View style={s.header}>
          <View style={s.iconWrap}>
            <MaterialCommunityIcons name="handshake-outline" size={26} color={Colors.accentDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>شراكات من خارج المدينة</Text>
            <Text style={s.title}>هل تمثّل مؤسسة من خارج الحصاحيصا؟</Text>
            <Text style={s.subtitle}>قدّم طلب تعاون مع أهالي المدينة، ونرد عليك خلال 48 ساعة.</Text>
          </View>
        </View>

        <View style={s.sectorsRow}>
          {SECTORS.map((sec, i) => (
            <View key={i} style={s.sectorChip}>
              <Text style={s.sectorLabel}>{sec.label}</Text>
            </View>
          ))}
        </View>

        <View style={s.ctaBtn}>
          <Text style={s.ctaBtnText}>قدّم طلب التعاون</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 16, padding: 16, gap: 14,
    backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: Colors.border,
  },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconWrap: {
    width: 50, height: 50, borderRadius: 14, backgroundColor: Colors.accentSoft,
    alignItems: "center", justifyContent: "center",
  },
  kicker: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.accentDeep, marginBottom: 2 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15.5, lineHeight: 24, color: Colors.textPrimary },
  subtitle: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 20, color: Colors.textSecondary, marginTop: 2 },
  sectorsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sectorChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  sectorLabel: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textSecondary },
  ctaBtn: {
    minHeight: 46, borderRadius: 12, backgroundColor: Colors.primaryDeep,
    alignItems: "center", justifyContent: "center",
  },
  ctaBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff" },
});
