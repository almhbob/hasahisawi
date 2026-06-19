import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Modal, Platform, Alert } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

export type ProductAudience = "women" | "men";

type ProductItem = {
  id: string;
  title: string;
  seller: string;
  price: string;
  category: string;
  images: string[];
  tags: string[];
};

const WOMEN_PRODUCTS: ProductItem[] = [
  {
    id: "w1",
    title: "طقم نسائي أنيق",
    seller: "مساحة أزياء حواء",
    price: "حسب العرض",
    category: "ملابس نسائية",
    images: [
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=80",
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=900&q=80",
      "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=900&q=80",
    ],
    tags: ["ملابس", "جديد", "طلب عبر التطبيق"],
  },
  {
    id: "w2",
    title: "مجموعة عناية وتجميل",
    seller: "ركن التجميل والعناية",
    price: "حسب المنتج",
    category: "مستحضرات تجميل",
    images: [
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&q=80",
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=900&q=80",
      "https://images.unsplash.com/photo-1612817288484-6f916006741a?w=900&q=80",
    ],
    tags: ["تجميل", "عناية", "عروض"],
  },
  {
    id: "w3",
    title: "عطور ومخمريات",
    seller: "مساحة العطور",
    price: "حسب الحجم",
    category: "عطور",
    images: [
      "https://images.unsplash.com/photo-1541643600914-78b084683601?w=900&q=80",
      "https://images.unsplash.com/photo-1594035910387-fea47794261f?w=900&q=80",
      "https://images.unsplash.com/photo-1585386959984-a41552231658?w=900&q=80",
    ],
    tags: ["عطور", "بخور", "هدايا"],
  },
];

const MEN_PRODUCTS: ProductItem[] = [
  {
    id: "m1",
    title: "قميص رجالي رسمي",
    seller: "محلات ملابس الرجال",
    price: "حسب العرض",
    category: "ملابس رجالية",
    images: [
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=900&q=80",
      "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=900&q=80",
      "https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?w=900&q=80",
    ],
    tags: ["رسمي", "رجالي", "جديد"],
  },
  {
    id: "m2",
    title: "طقم كاجوال رجالي",
    seller: "بائعو الملابس",
    price: "حسب المقاس",
    category: "كاجوال",
    images: [
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=900&q=80",
      "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=900&q=80",
      "https://images.unsplash.com/photo-1506629905607-d9c297d907e5?w=900&q=80",
    ],
    tags: ["كاجوال", "طلبات", "توصيل"],
  },
  {
    id: "m3",
    title: "أحذية وإكسسوارات",
    seller: "مساحة الأحذية والإكسسوارات",
    price: "حسب النوع",
    category: "أحذية",
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80",
      "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=900&q=80",
      "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=900&q=80",
    ],
    tags: ["أحذية", "إكسسوارات", "عروض"],
  },
];

export default function ProductShowcase({ audience }: { audience: ProductAudience }) {
  const [zoom, setZoom] = useState<{ product: ProductItem; image: string } | null>(null);
  const products = useMemo(() => audience === "women" ? WOMEN_PRODUCTS : MEN_PRODUCTS, [audience]);
  const accent = audience === "women" ? "#EC4899" : Colors.accent;
  const title = audience === "women" ? "مساحات عرض منتجات حواء" : "مساحات عرض منتجات الرجال";
  const subtitle = "3 صور لكل منتج · سعر واضح · صورة قابلة للتكبير";

  function requestProduct(product: ProductItem) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("الطلب عبر التطبيق", `سيتم لاحقاً فتح طلب المنتج مباشرة من داخل التطبيق: ${product.title}`);
  }

  return (
    <View style={s.wrap}>
      <View style={s.sectionHead}>
        <LinearGradient colors={[accent, accent + "66"]} style={s.headBar} />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {products.map((product) => (
          <View key={product.id} style={[s.card, { borderColor: accent + "30" }]}>
            <TouchableOpacity activeOpacity={0.92} onPress={() => setZoom({ product, image: product.images[0] })}>
              <Image source={{ uri: product.images[0] }} style={s.mainImage} resizeMode="cover" />
              <View style={[s.priceBadge, { backgroundColor: accent }]}>
                <Text style={s.priceText}>{product.price}</Text>
              </View>
            </TouchableOpacity>

            <View style={s.thumbsRow}>
              {product.images.slice(0, 3).map((image, index) => (
                <TouchableOpacity key={`${product.id}-${index}`} onPress={() => setZoom({ product, image })} activeOpacity={0.85}>
                  <Image source={{ uri: image }} style={[s.thumb, { borderColor: index === 0 ? accent : Colors.divider }]} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.productTitle} numberOfLines={1}>{product.title}</Text>
            <Text style={s.seller} numberOfLines={1}>{product.seller}</Text>
            <View style={s.tagsRow}>{product.tags.map((tag) => <View key={tag} style={s.tag}><Text style={s.tagText}>{tag}</Text></View>)}</View>
            <TouchableOpacity onPress={() => requestProduct(product)} style={[s.orderBtn, { borderColor: accent + "55" }]}>
              <Text style={[s.orderText, { color: accent }]}>اطلب عبر التطبيق</Text>
              <Ionicons name="arrow-back" size={15} color={accent} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>{zoom?.product.title}</Text>
                <Text style={s.modalSub}>{zoom?.product.category} · {zoom?.product.price}</Text>
              </View>
              <TouchableOpacity onPress={() => setZoom(null)} style={s.closeBtn}><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
            </View>
            {zoom && <Image source={{ uri: zoom.image }} style={s.zoomImage} resizeMode="contain" />}
            <View style={s.zoomThumbs}>
              {zoom?.product.images.slice(0, 3).map((image, index) => (
                <TouchableOpacity key={index} onPress={() => setZoom({ product: zoom.product, image })}>
                  <Image source={{ uri: image }} style={[s.zoomThumb, image === zoom.image && { borderColor: accent }]} />
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
  wrap: { marginVertical: 12 },
  sectionHead: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 12 },
  headBar: { width: 4, height: 34, borderRadius: 3 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  subtitle: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  row: { gap: 12, paddingRight: 2, paddingLeft: 4 },
  card: { width: 245, backgroundColor: Colors.cardBg, borderRadius: 20, borderWidth: 1, padding: 12, overflow: "hidden" },
  mainImage: { width: "100%", height: 160, borderRadius: 16, backgroundColor: Colors.bg },
  priceBadge: { position: "absolute", bottom: 10, right: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  priceText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  thumbsRow: { flexDirection: "row-reverse", gap: 7, marginTop: 9 },
  thumb: { width: 50, height: 44, borderRadius: 10, borderWidth: 1.5, backgroundColor: Colors.bg },
  productTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right", marginTop: 10 },
  seller: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textAlign: "right", marginTop: 2 },
  tagsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 5, marginTop: 9 },
  tag: { backgroundColor: Colors.bg, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: Colors.divider },
  tagText: { fontFamily: "Cairo_600SemiBold", fontSize: 9.5, color: Colors.textMuted },
  orderBtn: { marginTop: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 12, borderWidth: 1, paddingVertical: 10 },
  orderText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
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
