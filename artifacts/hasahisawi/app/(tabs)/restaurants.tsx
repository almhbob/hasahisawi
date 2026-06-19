import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, Modal, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import OrgInviteCard from "@/components/OrgInviteCard";

type FoodType = "restaurant" | "cafeteria" | "fast" | "drink" | "dessert" | "offer";

type FoodProduct = {
  id: string;
  title: string;
  vendor: string;
  type: FoodType;
  price: string;
  oldPrice?: string;
  description: string;
  images: string[];
  tags: string[];
  available: boolean;
};

const TYPE_CONFIG: Record<FoodType, { label: string; icon: string; color: string }> = {
  restaurant: { label: "مطعم", icon: "silverware-fork-knife", color: Colors.primary },
  cafeteria:  { label: "كافتريا", icon: "coffee-outline", color: "#D97706" },
  fast:       { label: "وجبات سريعة", icon: "hamburger", color: "#EF4444" },
  drink:      { label: "مشروبات", icon: "cup", color: "#06B6D4" },
  dessert:    { label: "حلويات", icon: "cupcake", color: "#EC4899" },
  offer:      { label: "عرض", icon: "tag-multiple-outline", color: Colors.accent },
};

const PRODUCTS: FoodProduct[] = [
  {
    id: "f1",
    title: "وجبة برجر مع بطاطس",
    vendor: "كافتريا الحصاحيصا",
    type: "fast",
    price: "حسب العرض",
    oldPrice: "عرض اليوم",
    description: "وجبة متكاملة مناسبة للطلبات السريعة مع إمكانية إضافة مشروب.",
    images: [
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=900&q=80",
      "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=900&q=80",
      "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=900&q=80",
    ],
    tags: ["برجر", "بطاطس", "عرض"],
    available: true,
  },
  {
    id: "f2",
    title: "قهوة ومشروبات ساخنة",
    vendor: "ركن القهوة",
    type: "cafeteria",
    price: "حسب الحجم",
    description: "قهوة، شاي، كابتشينو ومشروبات ساخنة للكافتريات والمقاهي.",
    images: [
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900&q=80",
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=900&q=80",
      "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=900&q=80",
    ],
    tags: ["قهوة", "شاي", "كافتريا"],
    available: true,
  },
  {
    id: "f3",
    title: "وجبة سودانية منزلية",
    vendor: "مطعم اللمة",
    type: "restaurant",
    price: "حسب الطلب",
    description: "وجبات سودانية يومية، مناسب للعائلات والطلبات الجماعية.",
    images: [
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=900&q=80",
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&q=80",
      "https://images.unsplash.com/photo-1543353071-873f17a7a088?w=900&q=80",
    ],
    tags: ["غداء", "سوداني", "طلبات جماعية"],
    available: true,
  },
  {
    id: "f4",
    title: "عصائر وحلويات",
    vendor: "حلويات ومشروبات",
    type: "dessert",
    price: "حسب الصنف",
    description: "مساحة للعصائر، الحلويات، الكيك، البسبوسة والطلبات الخاصة.",
    images: [
      "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=900&q=80",
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=900&q=80",
      "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=900&q=80",
    ],
    tags: ["حلويات", "عصائر", "مناسبات"],
    available: true,
  },
];

function ProductCard({ item, onZoom }: { item: FoodProduct; onZoom: (item: FoodProduct, image: string) => void }) {
  const cfg = TYPE_CONFIG[item.type];
  return (
    <View style={[s.productCard, { borderColor: cfg.color + "35" }]}> 
      <TouchableOpacity activeOpacity={0.92} onPress={() => onZoom(item, item.images[0])}>
        <Image source={{ uri: item.images[0] }} style={s.productImage} resizeMode="cover" />
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={s.imageShade} />
        <View style={[s.priceBadge, { backgroundColor: cfg.color }]}>
          <Text style={s.price}>{item.price}</Text>
        </View>
        {item.oldPrice && <View style={s.offerBadge}><Text style={s.offerText}>{item.oldPrice}</Text></View>}
      </TouchableOpacity>
      <View style={s.thumbRow}>
        {item.images.slice(0, 3).map((img, i) => (
          <TouchableOpacity key={i} onPress={() => onZoom(item, img)}>
            <Image source={{ uri: img }} style={[s.thumb, { borderColor: i === 0 ? cfg.color : Colors.divider }]} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.productTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.productTitle}>{item.title}</Text>
          <Text style={s.vendor}>{item.vendor}</Text>
        </View>
        <View style={[s.typeBadge, { backgroundColor: cfg.color + "18" }]}>
          <MaterialCommunityIcons name={cfg.icon as any} size={13} color={cfg.color} />
          <Text style={[s.typeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <Text style={s.description}>{item.description}</Text>
      <View style={s.tagsRow}>{item.tags.map(tag => <View key={tag} style={s.tag}><Text style={s.tagText}>{tag}</Text></View>)}</View>
      <TouchableOpacity onPress={() => Alert.alert("اطلب عبر التطبيق", `سيتم فتح طلب ${item.title} من ${item.vendor} داخل التطبيق لاحقاً.`)} style={[s.orderBtn, { borderColor: cfg.color + "55" }]}> 
        <Text style={[s.orderText, { color: cfg.color }]}>اطلب الآن</Text>
        <Ionicons name="arrow-back" size={15} color={cfg.color} />
      </TouchableOpacity>
    </View>
  );
}

export default function RestaurantsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FoodType | "all">("all");
  const [zoom, setZoom] = useState<{ item: FoodProduct; image: string } | null>(null);

  const filtered = useMemo(() => PRODUCTS.filter(item => {
    const byType = filter === "all" || item.type === filter;
    const byText = !query.trim() || item.title.includes(query) || item.vendor.includes(query) || item.description.includes(query);
    return byType && byText;
  }), [query, filter]);

  function onZoom(item: FoodProduct, image: string) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setZoom({ item, image });
  }

  return (
    <View style={s.root}>
      <LinearGradient colors={["#0B2816", "#1F1205", Colors.bg]} style={[s.header, { paddingTop: topPad + 14 }]}> 
        <Animated.View entering={FadeIn.duration(450)} style={s.headerTop}>
          <View style={s.headerIcon}><MaterialCommunityIcons name="food-fork-drink" size={27} color={Colors.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>المطاعم والكافتريات</Text>
            <Text style={s.headerSub}>منتجات · عروض · وجبات · مشروبات</Text>
          </View>
        </Animated.View>
        <View style={s.heroCard}>
          <LinearGradient colors={[Colors.accent + "24", Colors.primary + "16"]} style={StyleSheet.absoluteFill} />
          <MaterialCommunityIcons name="store-plus-outline" size={34} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>مساحة عرض احترافية للمطاعم والكافتريات</Text>
            <Text style={s.heroText}>اعرض الوجبات، المنتجات، العروض اليومية، الأسعار والصور داخل التطبيق.</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={s.searchArea}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن وجبة أو مطعم..." placeholderTextColor={Colors.textMuted} style={s.searchInput} textAlign="right" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {(["all", "restaurant", "cafeteria", "fast", "drink", "dessert", "offer"] as const).map((key) => {
            const active = filter === key;
            const cfg = key === "all" ? { label: "الكل", color: Colors.primary, icon: "apps-outline" } : TYPE_CONFIG[key];
            return (
              <TouchableOpacity key={key} onPress={() => setFilter(key)} style={[s.filterChip, active && { borderColor: cfg.color, backgroundColor: cfg.color + "18" }]}> 
                <MaterialCommunityIcons name={cfg.icon as any} size={15} color={active ? cfg.color : Colors.textMuted} />
                <Text style={[s.filterText, active && { color: cfg.color }]}>{cfg.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <AnimatedPress onPress={() => Alert.alert("انضمام المطاعم", "سيتم استقبال طلبات المطاعم والكافتريات من لوحة الإدارة قريباً.")}> 
          <LinearGradient colors={[Colors.primary, Colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.joinBox}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={25} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={s.joinTitle}>سجل مطعمك أو كافتريتك</Text>
              <Text style={s.joinSub}>اعرض منتجاتك وعروضك اليومية واجعل الطلب عبر التطبيق.</Text>
            </View>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </LinearGradient>
        </AnimatedPress>

        <View style={s.offerStrip}>
          <MaterialCommunityIcons name="tag-heart-outline" size={22} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.offerTitle}>عروض اليوم</Text>
            <Text style={s.offerSub}>مساحة مخصصة للعروض والوجبات المخفضة والطلبات الجماعية.</Text>
          </View>
        </View>

        {filtered.map((item, index) => (
          <Animated.View key={item.id} entering={FadeInDown.delay(index * 50).springify()}>
            <ProductCard item={item} onZoom={onZoom} />
          </Animated.View>
        ))}
        <OrgInviteCard />
      </ScrollView>

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>{zoom?.item.title}</Text>
                <Text style={s.modalSub}>{zoom?.item.vendor} · {zoom?.item.price}</Text>
              </View>
              <TouchableOpacity onPress={() => setZoom(null)} style={s.closeBtn}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
            </View>
            {zoom && <Image source={{ uri: zoom.image }} style={s.zoomImage} resizeMode="contain" />}
            <View style={s.zoomThumbs}>
              {zoom?.item.images.slice(0, 3).map((img, i) => (
                <TouchableOpacity key={i} onPress={() => setZoom({ item: zoom.item, image: img })}>
                  <Image source={{ uri: img }} style={[s.zoomThumb, img === zoom.image && { borderColor: Colors.accent }]} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 16, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: Colors.accent + "20" },
  headerTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 14 },
  headerIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: Colors.accent + "18", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.accent + "35" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary, textAlign: "right" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  heroCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, borderRadius: 20, padding: 15, overflow: "hidden", borderWidth: 1, borderColor: Colors.accent + "25" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  heroText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 2 },
  searchArea: { paddingTop: 12 },
  searchBox: { marginHorizontal: 16, flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 15, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.accent + "20" },
  searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", paddingVertical: 11 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: { flexDirection: "row-reverse", alignItems: "center", gap: 6, borderRadius: 13, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.cardBg },
  filterText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  content: { padding: 16, gap: 13, paddingBottom: 120 },
  joinBox: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, marginBottom: 4 },
  joinTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff", textAlign: "right" },
  joinSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.84)", textAlign: "right" },
  offerStrip: { flexDirection: "row-reverse", gap: 10, alignItems: "center", backgroundColor: Colors.accent + "10", borderWidth: 1, borderColor: Colors.accent + "25", borderRadius: 18, padding: 14 },
  offerTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  offerSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  productCard: { backgroundColor: Colors.cardBg, borderRadius: 22, padding: 12, borderWidth: 1, overflow: "hidden" },
  productImage: { width: "100%", height: 190, borderRadius: 17, backgroundColor: Colors.bg },
  imageShade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 90, borderRadius: 17 },
  priceBadge: { position: "absolute", bottom: 10, right: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  price: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  offerBadge: { position: "absolute", top: 10, left: 10, backgroundColor: Colors.accent, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 4 },
  offerText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#111" },
  thumbRow: { flexDirection: "row-reverse", gap: 7, marginTop: 9 },
  thumb: { width: 58, height: 50, borderRadius: 11, borderWidth: 1.5, backgroundColor: Colors.bg },
  productTop: { flexDirection: "row-reverse", alignItems: "center", gap: 9, marginTop: 10 },
  productTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  vendor: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  typeBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
  typeText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  description: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 21, textAlign: "right", marginTop: 9 },
  tagsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: { backgroundColor: Colors.bg, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.divider },
  tagText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.textMuted },
  orderBtn: { marginTop: 12, borderRadius: 13, borderWidth: 1, paddingVertical: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  orderText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.86)", justifyContent: "center", padding: 14 },
  modalCard: { backgroundColor: "#07110B", borderRadius: 22, padding: 12, maxHeight: "92%", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  modalTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 10 },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff", textAlign: "right" },
  modalSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.65)", textAlign: "right" },
  closeBtn: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.10)" },
  zoomImage: { width: "100%", height: 410, borderRadius: 16, backgroundColor: "#000" },
  zoomThumbs: { flexDirection: "row-reverse", justifyContent: "center", gap: 8, marginTop: 12 },
  zoomThumb: { width: 64, height: 54, borderRadius: 12, borderWidth: 2, borderColor: "rgba(255,255,255,0.14)" },
});
