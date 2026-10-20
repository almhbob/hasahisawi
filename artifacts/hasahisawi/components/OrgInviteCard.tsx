import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

type OrgStatus = "none" | "pending" | "approved";

async function fetchMyOrgStatus(token: string): Promise<OrgStatus> {
  try {
    const base = getApiUrl();
    if (!base) return "none";
    const res = await fetch(`${base}/api/institution-applications/mine/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return "none";
    const rows: Array<{ status: string }> = await res.json();
    if (!rows.length) return "none";
    const s = rows[0].status;
    if (s === "approved" || s === "signed") return "approved";
    if (s === "pending" || s === "reviewing" || s === "under_review") return "pending";
    return "none";
  } catch {
    return "none";
  }
}

interface Props {
  delay?: number;
}

export default function OrgInviteCard({ delay = 0 }: Props) {
  const router = useRouter();
  const { token, isGuest } = useAuth();
  const [status, setStatus] = useState<OrgStatus>("none");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!token || isGuest) { setChecked(true); return; }
    fetchMyOrgStatus(token).then(s => { setStatus(s); setChecked(true); });
  }, [token, isGuest]);

  // لا تظهر البطاقة إلا بعد الموافقة على الطلب واستيفاء المتطلبات
  if (!checked || !token || isGuest || status !== "approved") return null;

  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/org-join" as any);
  };

  return (
    <Animated.View entering={FadeInDown.delay(delay)} style={styles.wrapper}>
      <View style={styles.badge}>
        <Ionicons name="shield-checkmark" size={12} color={Colors.primaryDeep} />
        <Text style={styles.badgeText}>مؤسستك موثّقة</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.iconBg}>
          <MaterialCommunityIcons name="domain" size={24} color={Colors.primaryDeep} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>مؤسستك نشطة في حصاحيصاوي</Text>
          <Text style={styles.sub}>أدِر ملفك المؤسسي وتابع الطلبات والإشعارات والإحصاءات.</Text>
        </View>
      </View>

      <TouchableOpacity onPress={handlePress} activeOpacity={0.82} style={styles.btn} accessibilityRole="button">
        <Text style={styles.btnText}>إدارة مؤسستك</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16, marginVertical: 16, padding: 16, gap: 14,
    borderRadius: 16, backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: Colors.border,
  },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    backgroundColor: Colors.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  badgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: Colors.primaryDeep },
  content: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconBg: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.primarySoft,
    justifyContent: "center", alignItems: "center",
  },
  textBlock: { flex: 1, gap: 4 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 15.5, lineHeight: 24, color: Colors.textPrimary },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 20, color: Colors.textSecondary },
  btn: {
    minHeight: 46, borderRadius: 12, backgroundColor: Colors.primaryDeep,
    alignItems: "center", justifyContent: "center",
  },
  btnText: { fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff" },
});
