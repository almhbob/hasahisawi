import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";

type Restaurant = {
  id: string;
  name: string;
  type: "restaurant" | "cafe" | "bakery" | "juice";
  area: string;
  phone: string;
  hours: string;
  rating: number;
  tags: string[];
  specials: string[];
  delivery: boolean;
};

const TYPE_META = {
  restaurant: { label: "مطعم", icon: "restaurant", color: "#F97316" },
  cafe: { label: "كافتيريا", icon: "cafe", color: "#A855F7" },
  bakery: { label: "مخبز وحلويات", icon: "baguette", color: "#EAB308" },
  juice: { label: "عصائر ومثلجات", icon: "cup-water", color: "#14B8A6" },
} as const;

const RESTAURANTS: Restaurant[] = [
  {
    id: "r1",
    name: "مطعم النيل",
    type: "restaurant",
    area: "السوق الكبير",
    phone: "0912000001",
    hours: "9 ص - 11 م",
    rating: 4.7,
    tags: ["وجبات سودانية", "مشاوي", "توصيل"],
    specials: ["وجبة اليوم", "مشاوي مشكلة", "طلبات عائلية"],
    delivery: true,
  },
  {
    id: "r2",
    name: "كافتيريا الشباب",
    type: "cafe",
    area: "وسط المدينة",
    phone: "0912000002",
    hours: "7 ص - 12 م",
    rating: 4.5,
    tags: ["قهوة", "سندوتشات", "جلسات"],
    specials: ["قهوة سريعة", "شاي لبن", "سندوتشات"],
    delivery: false,
  },
  {
    id: "r3",
    name: "مخبز البركة",
    type: "bakery",
    area: "حي المزاد",
    phone: "0912000003",
    hours: "5 ص - 10 م",
    rating: 4.8,
    tags: ["مخبوزات", "حلويات", "طلبات مناسبات"],
    specials: ["خبز طازج", "بسبوسة", "كيك مناسبات"],
    delivery: true,
  },
  {
    id: "r4",
    name: "عصائر المدينة",
    type: "juice",
    area: "شارع المستشفى",
    phone: "0912000004",
    hours: "10 ص - 1 ص",
    rating: 4.6,
    tags: ["عصائر طبيعية", "آيس كريم", "مشروبات"],
    specials: ["مانجو", "ليمون نعناع", "مشروب طاقة طبيعي"],
    delivery: true,
  },
];

const FILTERS: ("all" | Restaurant["type"])[] = ["all", "restaurant", "cafe", "bakery", "juice"];

export default function RestaurantsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<typeof FILTERS[number]>("all");

  const list = useMemo(() => RESTAURANTS.filter(item => {
    const byType = filter === "all" || item.type === filter;
    const q = query.trim();
    const byQuery = !q || item.name.includes(q) || item.area.includes(q) || item.tags.some(t => t.includes(q));
    return byType && byQuery;
  }), [query, filter]);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <LinearGradient colors={["#241000", "#0D1F13", Colors.bg]} style={[styles.hero, { paddingTop: topPad + 16 }]}>
          <Animated.View entering={FadeIn.delay(80)} style={styles.heroIcon}>
            <Ionicons name="restaurant-outline" size={38} color="#fff" />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(120).springify()} style={styles.title}>المطاعم والكافتريات</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(180).springify()} style={styles.subtitle}>دليل سريع للمنيوهات والعروض والتوصيل داخل الحصاحيصا</Animated.Text>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن مطعم، كافتيريا، منطقة..." placeholderTextColor={Colors.textMuted} style={styles.input} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {FILTERS.map(key => {
              const active = key === filter;
              const meta = key === "all" ? { label: "الكل", color: Colors.primary, icon: "apps" } : TYPE_META[key];
              return (
                <TouchableOpacity key={key} onPress={() => setFilter(key)} style={[styles.filterChip, active && { borderColor: meta.color, backgroundColor: meta.color + "18" }]}>
                  <MaterialCommunityIcons name={meta.icon as any} size={15} color={active ? meta.color : Colors.textMuted} />
                  <Text style={[styles.filterText, active && { color: meta.color }]}>{meta.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {list.map((item, index) => {
            const meta = TYPE_META[item.type];
            return (
              <Animated.View key={item.id} entering={FadeInDown.delay(80 + index * 60).springify()} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.badge, { backgroundColor: meta.color + "20", borderColor: meta.color + "45" }]}>
                    <MaterialCommunityIcons name={meta.icon as any} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>{meta.label} · {item.area} · {item.hours}</Text>
                  </View>
                  <View style={styles.rating}><Ionicons name="star" size={12} color="#FBBF24" /><Text style={styles.ratingText}>{item.rating}</Text></View>
                </View>
                <View style={styles.tags}>{item.tags.map(tag => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View>
                <View style={styles.menuRow}>{item.specials.map(s => <View key={s} style={styles.menuItem}><Text style={styles.menuText}>{s}</Text></View>)}</View>
                <View style={styles.actions}>
                  <AnimatedPress onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                    <View style={styles.callBtn}><Ionicons name="call" size={16} color="#001" /><Text style={styles.callText}>اتصال</Text></View>
                  </AnimatedPress>
                  <View style={[styles.delivery, item.delivery && styles.deliveryOn]}>
                    <MaterialCommunityIcons name={item.delivery ? "truck-delivery" : "store-clock"} size={14} color={item.delivery ? "#3EFF9C" : Colors.textMuted} />
                    <Text style={[styles.deliveryText, item.delivery && { color: "#3EFF9C" }]}>{item.delivery ? "يدعم التوصيل" : "استلام من المحل"}</Text>
                  </View>
                </View>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hero: { paddingHorizontal: 20, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, alignItems: "center" },
  heroIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: "#F9731630", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#F9731660", marginBottom: 14 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 25, color: Colors.textPrimary, textAlign: "center" },
  subtitle: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 22 },
  body: { padding: 18, gap: 14 },
  searchBox: { height: 48, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", textAlign: "right" },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterChip: { flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  filterText: { fontFamily: "Cairo_600SemiBold", color: Colors.textSecondary, fontSize: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: 22, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12 },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  name: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 16, textAlign: "right" },
  meta: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 11, textAlign: "right", marginTop: 2 },
  rating: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FBBF2418", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  ratingText: { fontFamily: "Cairo_700Bold", color: "#FBBF24", fontSize: 11 },
  tags: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  tag: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, backgroundColor: Colors.bgAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  menuRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  menuItem: { backgroundColor: "#F9731612", borderColor: "#F9731630", borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  menuText: { fontFamily: "Cairo_600SemiBold", color: Colors.textPrimary, fontSize: 12 },
  actions: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  callBtn: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14 },
  callText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 12 },
  delivery: { flexDirection: "row", gap: 5, alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: Colors.bgAlt },
  deliveryOn: { backgroundColor: "#3EFF9C12" },
  deliveryText: { fontFamily: "Cairo_600SemiBold", color: Colors.textMuted, fontSize: 11 },
});
