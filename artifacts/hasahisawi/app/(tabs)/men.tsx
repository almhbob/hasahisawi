import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import OrgInviteCard from "@/components/OrgInviteCard";

type MenShopType = "shop" | "seller" | "tailor" | "shoes" | "accessories";

type MenShop = {
  id: string;
  name: string;
  type: MenShopType;
  address: string;
  phone: string;
  description: string;
  rating: number;
  tags: string[];
};

const TYPE_CONFIG: Record<MenShopType, { label: string; icon: string; color: string }> = {
  shop:        { label: "محل ملابس", icon: "storefront-outline", color: Colors.primary },
  seller:      { label: "بائع ملابس", icon: "account-tie-outline", color: Colors.accent },
  tailor:      { label: "ترزي", icon: "content-cut", color: "#0EA5E9" },
  shoes:       { label: "أحذية", icon: "shoe-formal", color: "#D97706" },
  accessories: { label: "إكسسوارات", icon: "watch-variant", color: "#64748B" },
};

const SAMPLE_SHOPS: MenShop[] = [
  { id: "m1", name: "أناقة الرجال", type: "shop", address: "السوق الكبير", phone: "", description: "ملابس رجالية جاهزة، قمصان، بناطلين، أطقم رسمية وكاجوال.", rating: 4.8, tags: ["جاهز", "رسمي", "كاجوال"] },
  { id: "m2", name: "بائع ملابس مستقل", type: "seller", address: "توصيل داخل المنطقة", phone: "", description: "عرض منتجات الملابس الرجالية من بائعين مستقلين مع إمكانية الطلب عبر التطبيق.", rating: 4.6, tags: ["طلبات", "توصيل", "عروض"] },
  { id: "m3", name: "خياطة رجالية", type: "tailor", address: "بالقرب من السوق", phone: "", description: "تفصيل جلابيب، عراقي، أطقم ومقاسات خاصة حسب الطلب.", rating: 4.7, tags: ["تفصيل", "مقاسات", "طلبات خاصة"] },
];

function callSeller(phone: string) {
  if (!phone) {
    Alert.alert("عبر التطبيق", "سيتم لاحقاً إتاحة التواصل والطلب مباشرة من داخل تطبيق حصاحيصاوي.");
    return;
  }
  Linking.openURL(`tel:${phone}`).catch(() => {});
}

export default function MenScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MenShopType | "all">("all");

  const filtered = useMemo(() => SAMPLE_SHOPS.filter((shop) => {
    const byType = filter === "all" || shop.type === filter;
    const byText = !query.trim() || shop.name.includes(query) || shop.description.includes(query) || shop.address.includes(query);
    return byType && byText;
  }), [query, filter]);

  return (
    <View style={s.root}>
      <LinearGradient colors={["#0B2816", Colors.bg]} style={[s.header, { paddingTop: topPad + 14 }]}> 
        <Animated.View entering={FadeIn.duration(450)} style={s.headerTop}>
          <View style={s.headerIcon}><MaterialCommunityIcons name="hanger" size={26} color={Colors.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>قسم الرجال</Text>
            <Text style={s.headerSub}>محلات الملابس · بائعون · تفصيل · أحذية</Text>
          </View>
        </Animated.View>

        <View style={s.heroCard}>
          <LinearGradient colors={[Colors.primary + "25", Colors.accent + "18"]} style={StyleSheet.absoluteFill} />
          <MaterialCommunityIcons name="storefront-plus-outline" size={34} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>مساحة جاهزة لمحلات وبائعي الملابس</Text>
            <Text style={s.heroText}>اعرض المنتجات، التصنيفات، العروض والطلبات داخل تطبيق حصاحيصاوي.</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={s.searchArea}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن محل أو بائع..." placeholderTextColor={Colors.textMuted} style={s.searchInput} textAlign="right" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {(["all", "shop", "seller", "tailor", "shoes", "accessories"] as const).map((key) => {
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
        <AnimatedPress onPress={() => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Alert.alert("انضم الآن", "سيتم استقبال طلبات المحلات والبائعين عبر التطبيق من لوحة الإدارة قريباً."); }}>
          <LinearGradient colors={[Colors.primary, Colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.joinBox}>
            <MaterialCommunityIcons name="account-plus-outline" size={25} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={s.joinTitle}>سجل محلك أو نشاطك</Text>
              <Text style={s.joinSub}>مساحة احترافية لعرض الملابس والعروض والوصول إلى العملاء.</Text>
            </View>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </LinearGradient>
        </AnimatedPress>

        {filtered.map((shop, index) => {
          const cfg = TYPE_CONFIG[shop.type];
          return (
            <Animated.View key={shop.id} entering={FadeInDown.delay(index * 55).springify()} style={[s.card, { borderColor: cfg.color + "35" }]}> 
              <LinearGradient colors={[cfg.color + "12", "transparent"]} style={StyleSheet.absoluteFill} />
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName}>{shop.name}</Text>
                  <View style={s.metaRow}>
                    <View style={[s.badge, { backgroundColor: cfg.color + "18" }]}>
                      <MaterialCommunityIcons name={cfg.icon as any} size={13} color={cfg.color} />
                      <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                    <View style={s.rating}><Ionicons name="star" size={13} color={Colors.accent} /><Text style={s.ratingText}>{shop.rating}</Text></View>
                  </View>
                </View>
                <View style={[s.roundIcon, { backgroundColor: cfg.color + "18" }]}><MaterialCommunityIcons name={cfg.icon as any} size={27} color={cfg.color} /></View>
              </View>
              <Text style={s.desc}>{shop.description}</Text>
              <View style={s.tags}>{shop.tags.map((tag) => <View key={tag} style={s.tag}><Text style={s.tagText}>{tag}</Text></View>)}</View>
              <View style={s.infoRow}><Ionicons name="location-outline" size={14} color={Colors.textMuted} /><Text style={s.infoText}>{shop.address}</Text></View>
              <TouchableOpacity onPress={() => callSeller(shop.phone)} style={[s.action, { borderColor: cfg.color + "35" }]}> 
                <Text style={[s.actionText, { color: cfg.color }]}>الدخول عبر التطبيق</Text>
                <Ionicons name="arrow-back" size={16} color={cfg.color} />
              </TouchableOpacity>
            </Animated.View>
          );
        })}
        <OrgInviteCard />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 16, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: Colors.primary + "20" },
  headerTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 14 },
  headerIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: Colors.accent + "18", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.accent + "35" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: Colors.textPrimary, textAlign: "right" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right" },
  heroCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, borderRadius: 20, padding: 15, overflow: "hidden", borderWidth: 1, borderColor: Colors.accent + "25" },
  heroTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  heroText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 2 },
  searchArea: { paddingTop: 12 },
  searchBox: { marginHorizontal: 16, flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 15, paddingHorizontal: 14, borderWidth: 1, borderColor: Colors.primary + "20" },
  searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", paddingVertical: 11 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: { flexDirection: "row-reverse", alignItems: "center", gap: 6, borderRadius: 13, borderWidth: 1, borderColor: Colors.divider, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.cardBg },
  filterText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  content: { padding: 16, gap: 13, paddingBottom: 120 },
  joinBox: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, marginBottom: 4 },
  joinTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff", textAlign: "right" },
  joinSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "rgba(255,255,255,0.84)", textAlign: "right" },
  card: { backgroundColor: Colors.cardBg, borderRadius: 20, padding: 15, overflow: "hidden", borderWidth: 1 },
  cardTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12, marginBottom: 9 },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 6 },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9 },
  badgeText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  rating: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  ratingText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.accent },
  roundIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  desc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 21, textAlign: "right" },
  tags: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tag: { backgroundColor: Colors.bg, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.divider },
  tagText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: Colors.textMuted },
  infoRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 11 },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
  action: { marginTop: 12, borderRadius: 13, borderWidth: 1, paddingVertical: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  actionText: { fontFamily: "Cairo_700Bold", fontSize: 13 },
});
