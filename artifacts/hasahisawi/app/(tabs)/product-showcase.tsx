import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Linking, Platform, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";

type Product = {
  id: string;
  name: string;
  seller: string;
  category: "phones" | "fashion" | "home" | "food" | "crafts";
  price: string;
  phone: string;
  image?: string;
  badge?: string;
  tags: string[];
};

const CATEGORIES = [
  { key: "all", label: "الكل", icon: "apps", color: Colors.primary },
  { key: "phones", label: "هواتف", icon: "cellphone", color: "#0EA5E9" },
  { key: "fashion", label: "أزياء", icon: "tshirt-crew-outline", color: "#EC4899" },
  { key: "home", label: "منزل", icon: "sofa-outline", color: "#A855F7" },
  { key: "food", label: "أغذية", icon: "food-variant", color: "#F97316" },
  { key: "crafts", label: "حرف", icon: "palette-outline", color: "#14B8A6" },
] as const;

const PRODUCTS: Product[] = [
  { id: "p1", name: "Samsung A-series", seller: "موبايلات الحصاحيصا", category: "phones", price: "حسب المواصفات", phone: "0914000001", badge: "الأكثر طلباً", tags: ["جديد", "ضمان", "تقسيط"] },
  { id: "p2", name: "جلابية رجالية فاخرة", seller: "أناقة المدينة", category: "fashion", price: "من 18,000 ج", phone: "0914000002", badge: "محلي", tags: ["تفصيل", "ألوان", "مقاسات"] },
  { id: "p3", name: "طقم ضيافة", seller: "لمسة بيت", category: "home", price: "من 25,000 ج", phone: "0914000003", tags: ["منزل", "هدايا", "طلب خاص"] },
  { id: "p4", name: "حلويات مناسبات", seller: "مخبوزات البركة", category: "food", price: "بالطلب", phone: "0914000004", badge: "توصيل", tags: ["طازج", "مناسبات", "طلبات"] },
  { id: "p5", name: "أعمال يدوية نسائية", seller: "حواء للإبداع", category: "crafts", price: "حسب التصميم", phone: "0914000005", tags: ["يدوي", "هدايا", "تصميم خاص"] },
];

function ProductShowcase({ products }: { products: Product[] }) {
  return (
    <View style={styles.showcaseGrid}>
      {products.map((item, index) => {
        const cat = CATEGORIES.find(c => c.key === item.category)!;
        return (
          <Animated.View key={item.id} entering={FadeInDown.delay(90 + index * 55).springify()} style={styles.productCard}>
            <LinearGradient colors={[cat.color + "22", Colors.surface]} style={styles.productVisual}>
              {item.image ? <Image source={{ uri: item.image }} style={StyleSheet.absoluteFillObject} /> : <MaterialCommunityIcons name={cat.icon as any} size={42} color={cat.color} />}
              {item.badge ? <View style={[styles.badge, { backgroundColor: cat.color }]}><Text style={styles.badgeText}>{item.badge}</Text></View> : null}
            </LinearGradient>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.seller}>{item.seller}</Text>
              <View style={styles.tags}>{item.tags.map(tag => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View>
              <View style={styles.bottomRow}>
                <Text style={[styles.price, { color: cat.color }]}>{item.price}</Text>
                <AnimatedPress onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                  <View style={styles.callBtn}><Ionicons name="call" size={15} color="#001" /></View>
                </AnimatedPress>
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function ProductShowcaseScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]["key"]>("all");

  const products = useMemo(() => PRODUCTS.filter(item => {
    const byCat = category === "all" || item.category === category;
    const q = query.trim();
    const byQuery = !q || item.name.includes(q) || item.seller.includes(q) || item.tags.some(tag => tag.includes(q));
    return byCat && byQuery;
  }), [query, category]);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <LinearGradient colors={["#05231F", "#0D1F13", Colors.bg]} style={[styles.hero, { paddingTop: topPad + 16 }]}>
          <Animated.View entering={FadeIn.delay(80)} style={styles.heroIcon}>
            <Ionicons name="cube-outline" size={40} color="#fff" />
          </Animated.View>
          <Animated.Text entering={FadeInDown.delay(120).springify()} style={styles.title}>معرض المنتجات</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(180).springify()} style={styles.subtitle}>ProductShowcase لعرض المنتجات المختارة بصورة عصرية مع التواصل السريع</Animated.Text>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن منتج أو متجر..." placeholderTextColor={Colors.textMuted} style={styles.input} />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {CATEGORIES.map(cat => {
              const active = category === cat.key;
              return (
                <TouchableOpacity key={cat.key} onPress={() => setCategory(cat.key)} style={[styles.categoryChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}>
                  <MaterialCommunityIcons name={cat.icon as any} size={15} color={active ? "#001" : cat.color} />
                  <Text style={[styles.categoryText, active && { color: "#001" }]}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ProductShowcase products={products} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hero: { paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, alignItems: "center" },
  heroIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: "#14B8A630", borderWidth: 1, borderColor: "#14B8A660", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 25, color: Colors.textPrimary, textAlign: "center" },
  subtitle: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, textAlign: "center", fontSize: 13, lineHeight: 22, marginTop: 8 },
  body: { padding: 18, gap: 14 },
  searchBox: { height: 48, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", textAlign: "right" },
  categoryRow: { gap: 8, paddingVertical: 2 },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  categoryText: { fontFamily: "Cairo_600SemiBold", color: Colors.textSecondary, fontSize: 12 },
  showcaseGrid: { gap: 14 },
  productCard: { borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  productVisual: { height: 150, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 12, right: 12, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 11 },
  productInfo: { padding: 14, gap: 8 },
  productName: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 17, textAlign: "right" },
  seller: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 12, textAlign: "right" },
  tags: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  tag: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 10, backgroundColor: Colors.bgAlt, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  bottomRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  callBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
});
