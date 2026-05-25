import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

interface Props {
  delay?: number;
}

export default function OrgInviteCard({ delay = 0 }: Props) {
  const router = useRouter();

  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/org-join" as any);
  };

  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={styles.wrapper}>
      <LinearGradient
        colors={["#0B2E1A", "#0D3A20", "#0F4228"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* زخارف خلفية */}
        <View style={styles.dot1} />
        <View style={styles.dot2} />

        {/* شارة */}
        <View style={styles.badge}>
          <Ionicons name="star" size={10} color={Colors.accent} />
          <Text style={styles.badgeText}>للمؤسسات والجهات</Text>
        </View>

        {/* المحتوى */}
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <LinearGradient colors={[Colors.primary, Colors.primary + "CC"]} style={styles.iconBg}>
              <MaterialCommunityIcons name="domain-plus" size={22} color="#fff" />
            </LinearGradient>
          </View>

          <View style={styles.textBlock}>
            <Text style={styles.title}>سجِّل مؤسستك في حصاحيصاوي</Text>
            <Text style={styles.sub}>الوصول لأكثر من ٥٠٠٠ مستخدم · التسجيل مجاني</Text>
            <View style={styles.chips}>
              {["المدارس", "المستشفيات", "الشركات", "الجمعيات"].map((t, i) => (
                <View key={i} style={styles.chip}>
                  <Text style={styles.chipText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* زر */}
        <TouchableOpacity onPress={handlePress} activeOpacity={0.82} style={styles.btn}>
          <LinearGradient
            colors={[Colors.primary, Colors.primary + "E0"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.btnGrad}
          >
            <Text style={styles.btnText}>قدّم طلب الانضمام</Text>
            <Ionicons name="arrow-back" size={16} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 18,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
    borderWidth: 1,
    borderColor: Colors.primary + "35",
  },
  gradient: {
    padding: 18,
    gap: 14,
    position: "relative",
    overflow: "hidden",
  },
  dot1: {
    position: "absolute", width: 140, height: 140, borderRadius: 70,
    backgroundColor: Colors.primary + "0A", top: -50, left: -40,
  },
  dot2: {
    position: "absolute", width: 90, height: 90, borderRadius: 45,
    backgroundColor: Colors.accent + "0C", bottom: -30, right: -20,
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-end",
    backgroundColor: Colors.accent + "1A", borderWidth: 1, borderColor: Colors.accent + "35",
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20,
  },
  badgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.accent },

  content: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  iconWrap: {},
  iconBg: {
    width: 46, height: 46, borderRadius: 13,
    justifyContent: "center", alignItems: "center",
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  textBlock: { flex: 1, gap: 4 },
  title: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary,
    textAlign: "right",
  },
  sub: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary,
    textAlign: "right", lineHeight: 18,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: {
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20,
    backgroundColor: Colors.primary + "18",
    borderWidth: 1, borderColor: Colors.primary + "30",
  },
  chipText: { fontFamily: "Cairo_500Medium", fontSize: 10, color: Colors.primary },

  btn: { borderRadius: 12, overflow: "hidden" },
  btnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12,
  },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
});
