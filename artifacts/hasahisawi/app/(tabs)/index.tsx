import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Pressable, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";

const LOGO = require("@/assets/images/logo.png");

// ─────────────────────────────────────────────────────────────────────────────
// Home — "town board" layout:
//   greeting + search, then every service visible at once as a 4-column grid,
//   grouped into four families. Each family has ONE meaningful color (icon on a
//   flat tint) so people learn "red = health, blue = getting around".
//   No gradients, glows, glass or entrance animations: flat, sun-readable.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeHomeGender(value: string | null | undefined) {
  const g = String(value ?? "").trim().toLowerCase();
  if (["male", "m", "man", "ذكر", "رجل", "ولد"].includes(g)) return "male";
  if (["female", "f", "woman", "أنثى", "انثى", "امرأة", "امراة", "بنت"].includes(g)) return "female";
  return null;
}

type Service = {
  id: string;
  label: string;      // short label shown on the tile (≤ 2 lines)
  icon: any;
  iconType: "ionicons" | "material";
  route: any;
  isNew?: boolean;
};

type Family = { key: string; title: string; ink: string; tint: string; services: Service[] };

const FAMILIES: Family[] = [
  {
    key: "health", title: "الصحة والطوارئ", ink: "#B42318", tint: "#FCEBE9",
    services: [
      { id: "medical", label: "الدليل الطبي", icon: "medkit-outline", iconType: "ionicons", route: "/(tabs)/medical" },
      { id: "appointments", label: "المواعيد", icon: "calendar-check-outline", iconType: "material", route: "/(tabs)/appointments" },
      { id: "numbers", label: "أرقام مهمة", icon: "call-outline", iconType: "ionicons", route: "/(tabs)/numbers" },
      { id: "reports", label: "بلاغ سريع", icon: "megaphone-outline", iconType: "ionicons", route: "/(tabs)/reports" },
    ],
  },
  {
    key: "community", title: "المجتمع", ink: "#00664A", tint: "#E3F2EC",
    services: [
      { id: "social", label: "المجتمع", icon: "chatbubbles-outline", iconType: "ionicons", route: "/(tabs)/social" },
      { id: "missing", label: "المفقودات", icon: "search-outline", iconType: "ionicons", route: "/(tabs)/missing" },
      { id: "orgs", label: "المنظمات", icon: "hand-heart-outline", iconType: "material", route: "/(tabs)/orgs" },
      { id: "student", label: "الطلاب", icon: "school-outline", iconType: "ionicons", route: "/(tabs)/student" },
      { id: "women", label: "قسم المرأة", icon: "face-woman-outline", iconType: "material", route: "/(tabs)/women" },
      { id: "sports", label: "الرياضة", icon: "football-outline", iconType: "ionicons", route: "/(tabs)/sports" },
      { id: "culture", label: "الثقافة", icon: "palette-outline", iconType: "material", route: "/(tabs)/culture" },
    ],
  },
  {
    key: "market", title: "السوق والعمل", ink: "#8A6400", tint: "#FAF1D8",
    services: [
      { id: "market", label: "السوق", icon: "storefront-outline", iconType: "ionicons", route: "/(tabs)/market" },
      { id: "product-showcase", label: "المتاجر", icon: "bag-handle-outline", iconType: "ionicons", route: "/(tabs)/product-showcase", isNew: true },
      { id: "restaurants", label: "المطاعم", icon: "restaurant-outline", iconType: "ionicons", route: "/(tabs)/restaurants", isNew: true },
      { id: "jobs", label: "الوظائف", icon: "briefcase-outline", iconType: "ionicons", route: "/(tabs)/jobs" },
      { id: "cv-builder", label: "السيرة الذاتية", icon: "document-text-outline", iconType: "ionicons", route: "/(tabs)/cv-builder", isNew: true },
      { id: "lawyers", label: "المحامون", icon: "scale-balance", iconType: "material", route: "/(tabs)/lawyers" },
    ],
  },
  {
    key: "move", title: "التنقل والاتصالات", ink: "#1D5C8C", tint: "#E5EFF7",
    services: [
      { id: "transport", label: "مشاوير", icon: "car-side", iconType: "material", route: "/(tabs)/transport" },
      { id: "travel", label: "السفر", icon: "bus-outline", iconType: "ionicons", route: "/(tabs)/travel" },
      { id: "telecom", label: "الاتصالات", icon: "cellular-outline", iconType: "ionicons", route: "/(tabs)/telecom" },
      { id: "calendar", label: "التقويم", icon: "calendar-outline", iconType: "ionicons", route: "/(tabs)/calendar" },
    ],
  },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 18) return "مساء الخير";
  return "مساء النور";
}

const COLUMNS = 4;
const SIDE = 16;
const GAP = 10;

function ServiceTile({ item, family, width }: { item: Service; family: Family; width: number }) {
  const Icon = item.iconType === "ionicons" ? Ionicons : MaterialCommunityIcons;
  return (
    <Pressable
      onPress={() => router.push(item.route)}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.tilePressed]}
      accessibilityRole="button"
      accessibilityLabel={item.isNew ? `${item.label}، جديد` : item.label}
    >
      <View style={[styles.tileIcon, { backgroundColor: family.tint }]}>
        <Icon name={item.icon} size={26} color={family.ink} />
        {item.isNew && <View style={[styles.newDot, { backgroundColor: Colors.accent }]} />}
      </View>
      <Text style={styles.tileLabel} numberOfLines={2}>{item.label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 560);
  const tileWidth = Math.floor((contentWidth - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;
  const date = useMemo(
    () => new Date().toLocaleDateString("ar-SD", { weekday: "long", day: "numeric", month: "long" }),
    [],
  );
  const { user } = useAuth();
  const displayName = (user?.name?.trim().split(/\s+/)[0]) || "زائر";

  const families = useMemo(() => {
    const gender = normalizeHomeGender(user?.gender);
    const hideWomen = gender === "male" && user?.role !== "admin";
    return FAMILIES.map(f => ({
      ...f,
      services: hideWomen ? f.services.filter(s => s.id !== "women") : f.services,
    }));
  }, [user?.gender, user?.role]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120, alignItems: "center" }}
      >
        <View style={{ width: contentWidth }}>
          {/* Top bar */}
          <View style={[styles.topBar, { paddingTop: topPad }]}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
            <Text style={styles.brand}>حصاحيصاوي</Text>
            <Pressable
              onPress={() => router.push("/notifications" as any)}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.tilePressed]}
              accessibilityRole="button"
              accessibilityLabel="الإشعارات"
              hitSlop={6}
            >
              <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {/* Greeting */}
          <View style={styles.greetingBlock}>
            <Text style={styles.greeting}>{greeting()}، {displayName}</Text>
            <Text style={styles.date}>{date}</Text>
          </View>

          {/* Search */}
          <Pressable
            onPress={() => router.push("/(tabs)/search" as any)}
            style={({ pressed }) => [styles.search, pressed && { borderColor: Colors.primaryDeep }]}
            accessibilityRole="search"
            accessibilityLabel="ابحث عن خدمة أو مكان"
          >
            <Ionicons name="search" size={20} color={Colors.textSecondary} />
            <Text style={styles.searchText}>ابحث عن خدمة، صيدلية، محل…</Text>
          </Pressable>

          {/* Service families */}
          {families.map(f => (
            <View key={f.key} style={styles.family}>
              <View style={styles.familyHead}>
                <View style={[styles.familyMark, { backgroundColor: f.ink }]} />
                <Text style={styles.familyTitle}>{f.title}</Text>
              </View>
              <View style={styles.grid}>
                {f.services.map(s => <ServiceTile key={s.id} item={s} family={f} width={tileWidth} />)}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: SIDE, gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 10 },
  brand: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 21, lineHeight: 30, color: Colors.textPrimary },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: Colors.border,
  },

  greetingBlock: { paddingHorizontal: SIDE, marginTop: 18 },
  greeting: { fontFamily: "Cairo_700Bold", fontSize: 17, lineHeight: 26, color: Colors.textPrimary },
  date: { fontFamily: "Cairo_400Regular", fontSize: 13, lineHeight: 20, color: Colors.textSecondary, marginTop: 2 },

  search: {
    marginHorizontal: SIDE, marginTop: 14, height: 50, borderRadius: 14,
    backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: Colors.border,
    flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14,
  },
  searchText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary },

  family: { marginTop: 22, paddingHorizontal: SIDE },
  familyHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  familyMark: { width: 4, height: 16, borderRadius: 2 },
  familyTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, lineHeight: 22, color: Colors.textPrimary },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, rowGap: 16 },
  tile: { alignItems: "center", paddingTop: 2, borderRadius: 14 },
  tilePressed: { opacity: 0.6 },
  tileIcon: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  newDot: {
    position: "absolute", top: 6, end: 6, width: 9, height: 9, borderRadius: 5,
    borderWidth: 1.5, borderColor: "#FFFFFF",
  },
  tileLabel: {
    marginTop: 7, fontFamily: "Cairo_600SemiBold", fontSize: 12.5, lineHeight: 18,
    color: Colors.textPrimary, textAlign: "center",
  },
});
