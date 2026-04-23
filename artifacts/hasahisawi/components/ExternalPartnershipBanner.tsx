import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
    <Animated.View entering={FadeInDown.delay(120).springify()}>
      <TouchableOpacity activeOpacity={0.92} onPress={handlePress}>
        <LinearGradient
          colors={["#1E293B", "#0F172A", "#020617"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.card}
        >
          {/* زخرفة علوية ذهبية */}
          <LinearGradient
            colors={["#FFD700", "#F0C040", "#C9A84C"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.topStripe}
          />

          {/* شارة "جديد" */}
          <View style={s.newBadge}>
            <Ionicons name="sparkles" size={10} color="#000" />
            <Text style={s.newBadgeText}>جديد</Text>
          </View>

          {/* الرأس */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              <LinearGradient
                colors={["#FFD700", "#F0C040"]}
                style={StyleSheet.absoluteFill}
              />
              <MaterialCommunityIcons name="handshake" size={28} color="#000" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>شراكات خارج المدينة</Text>
              <Text style={s.title}>هل تمثّل مؤسسة من خارج الحصاحيصا؟</Text>
              <Text style={s.subtitle}>قدّم طلب تعاون احترافي مع أهالي المدينة</Text>
            </View>
          </View>

          {/* القطاعات */}
          <View style={s.sectorsRow}>
            {SECTORS.map((sec, i) => (
              <View key={i} style={[s.sectorChip, { borderColor: sec.color + "60" }]}>
                <Text style={s.sectorEmoji}>{sec.emoji}</Text>
                <Text style={s.sectorLabel}>{sec.label}</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <View style={s.ctaRow}>
            <View style={s.ctaInfo}>
              <Ionicons name="time-outline" size={13} color="#FFD700" />
              <Text style={s.ctaInfoText}>الرد خلال 48 ساعة</Text>
            </View>
            <View style={s.ctaBtn}>
              <Text style={s.ctaBtnText}>تقديم طلب التعاون</Text>
              <Ionicons name="arrow-back" size={16} color="#000" />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18, padding: 16, overflow: "hidden",
    borderWidth: 1, borderColor: "rgba(255,215,0,0.25)",
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  topStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  newBadge: {
    position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#FFD700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, zIndex: 2,
  },
  newBadgeText: { fontSize: 10, fontWeight: "800", color: "#000" },

  header: { flexDirection: "row", gap: 14, alignItems: "center", marginBottom: 14, marginTop: 6 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden",
    shadowColor: "#FFD700", shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  kicker: { fontSize: 10, fontWeight: "700", color: "#FFD700", letterSpacing: 1, textAlign: "right", marginBottom: 3 },
  title: { fontSize: 14, fontWeight: "800", color: "#fff", textAlign: "right", lineHeight: 20 },
  subtitle: { fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 3, textAlign: "right" },

  sectorsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  sectorChip: {
    flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1,
  },
  sectorEmoji: { fontSize: 12 },
  sectorLabel: { fontSize: 10.5, color: "#fff", fontWeight: "600" },

  ctaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  ctaInfo: { flexDirection: "row", alignItems: "center", gap: 5 },
  ctaInfoText: { fontSize: 11, color: "#FFD700", fontWeight: "600" },
  ctaBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFD700", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
  },
  ctaBtnText: { fontSize: 13, fontWeight: "800", color: "#000" },
});
