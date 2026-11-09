// صفحة المنتج المشتركة (سوق المتاجر وصفحة المتجر): الصورة كاملة دون قص، تمرير بين الصور، شريط مصغّرات،
// تكبير بملء الشاشة، السعر قبل وبعد الخصم، المخزون، الوصف، والإضافة للسلة.
import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Modal, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { fmtSdg } from "@/lib/cart";
import ImageLightbox from "@/components/ImageLightbox";

const GREEN = "#00966A";
const DEEP = "#004D36";

export type DetailProduct = {
  id: number; name: string; price: number; old_price?: number | null; discount_pct?: number; stock?: number | null;
  description?: string | null; images: string[]; is_available?: boolean;
};
export type DetailStore = { id: number; name: string; logo?: string | null; subtitle?: string };

export default function ProductDetailSheet({ p, qty, onAdd, onClose, store, closed }: {
  p: DetailProduct; qty: number; onAdd: (d: number) => void; onClose: () => void; store?: DetailStore; closed?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const W = Math.min(width, 560);
  const H = Math.min(W * 1.05, height * 0.55);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
  const ref = useRef<ScrollView>(null);
  const imgs = p.images.filter(Boolean);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIdx(Math.max(0, Math.min(imgs.length - 1, Math.round(e.nativeEvent.contentOffset.x / W))));
  const go = (i: number) => { setIdx(i); ref.current?.scrollTo({ x: i * W, animated: true }); };
  const unavailable = closed || p.is_available === false || p.stock === 0;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
        <View style={[st.sheet, { width: W, paddingBottom: insets.bottom + 14 }]}>
          <View style={{ height: H, backgroundColor: "#F1F4F2" }}>
            {imgs.length ? (
              <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} onScroll={onScroll} scrollEventThrottle={64}>
                {imgs.map((u) => (
                  <Pressable key={u} onPress={() => setZoom(u)} accessibilityLabel="تكبير الصورة">
                    {/* الصورة كاملة دون قص — مهم لصور المنتجات المكتوب عليها */}
                    <Image source={{ uri: u }} style={{ width: W, height: H }} resizeMode="contain" />
                  </Pressable>
                ))}
              </ScrollView>
            ) : <View style={[StyleSheet.absoluteFill, st.noImg]}><Ionicons name="image-outline" size={48} color={GREEN} /></View>}
            <Pressable onPress={onClose} style={st.close} accessibilityLabel="إغلاق"><Ionicons name="close" size={20} color="#fff" /></Pressable>
            {imgs.length ? (
              <Pressable onPress={() => setZoom(imgs[idx])} style={st.zoomBtn} accessibilityLabel="عرض بملء الشاشة">
                <Ionicons name="expand" size={15} color="#fff" /><Text style={st.zoomT}>تكبير</Text>
              </Pressable>
            ) : null}
            {imgs.length > 1 ? <View style={st.counter}><Text style={st.counterT}>{idx + 1} / {imgs.length}</Text></View> : null}
            {p.discount_pct ? <View style={st.disc}><Text style={st.discT}>خصم {p.discount_pct}%</Text></View> : null}
          </View>
          {imgs.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.thumbs}>
              {imgs.map((u, i) => (
                <Pressable key={u} onPress={() => go(i)} style={[st.thumb, i === idx && st.thumbOn]} accessibilityLabel={`الصورة ${i + 1}`}>
                  <Image source={{ uri: u }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            <Text style={st.name}>{p.name}</Text>
            <View style={st.priceRow}>
              <Text style={st.price}>{fmtSdg(p.price)}</Text>
              {p.old_price ? <Text style={st.old}>{fmtSdg(p.old_price)}</Text> : null}
              {p.old_price ? <Text style={st.save}>وفّر {fmtSdg(p.old_price - p.price)}</Text> : null}
            </View>
            {p.stock != null && p.stock > 0 ? <Text style={[st.muted, p.stock <= 3 && { color: "#8A4B00", fontFamily: "Cairo_700Bold" }]}>{p.stock <= 3 ? `تبقّى ${p.stock} فقط` : `متوفر: ${p.stock}`}</Text> : null}
            {p.description ? <Text style={st.desc}>{p.description}</Text> : null}
            {store ? (
              <Pressable onPress={() => { onClose(); router.push({ pathname: "/stores", params: { open: String(store.id) } } as any); }} style={st.storeRow}>
                <View style={st.storeLogo}>{store.logo ? <Image source={{ uri: store.logo }} style={{ width: 36, height: 36 }} /> : <Text style={st.storeInit}>{store.name.trim().charAt(0)}</Text>}</View>
                <View style={{ flex: 1 }}>
                  <Text style={st.storeN}>{store.name}</Text>
                  {store.subtitle ? <Text style={st.muted}>{store.subtitle}</Text> : null}
                </View>
                <Text style={st.link}>زيارة المتجر</Text>
              </Pressable>
            ) : null}
            {unavailable ? (
              <View style={[st.addBtn, { backgroundColor: Colors.divider, paddingVertical: 13 }]}><Text style={[st.addT, { color: Colors.textSecondary }]}>{closed ? "المتجر لا يستقبل طلبات الآن" : "غير متوفر حالياً"}</Text></View>
            ) : qty ? (
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <View style={[st.stepper, { flex: 1 }]}>
                  <Pressable onPress={() => onAdd(1)} style={st.stepBtn} accessibilityLabel="زيادة"><Ionicons name="add" size={18} color="#fff" /></Pressable>
                  <Text style={st.stepN}>{qty}</Text>
                  <Pressable onPress={() => onAdd(-1)} style={[st.stepBtn, { backgroundColor: Colors.bg }]} accessibilityLabel="إنقاص"><Ionicons name="remove" size={18} color={DEEP} /></Pressable>
                </View>
                <Pressable onPress={() => { onClose(); router.push("/cart" as any); }} style={[st.addBtn, { flex: 1.3, paddingVertical: 13 }]}><Text style={st.addT}>إتمام الطلب</Text></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => onAdd(1)} style={[st.addBtn, { paddingVertical: 14 }]} accessibilityRole="button"><Ionicons name="cart" size={18} color="#fff" /><Text style={[st.addT, { fontSize: 15 }]}>أضف للسلة · {fmtSdg(p.price)}</Text></Pressable>
            )}
          </ScrollView>
        </View>
      </View>
      <ImageLightbox uri={zoom} title={p.name} onClose={() => setZoom(null)} />
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "95%", backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  noImg: { alignItems: "center", justifyContent: "center", backgroundColor: GREEN + "0D" },
  close: { position: "absolute", top: 14, left: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  zoomBtn: { position: "absolute", bottom: 12, left: 12, flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  zoomT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  counter: { position: "absolute", bottom: 12, right: 12, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  counterT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  disc: { position: "absolute", top: 14, right: 14, backgroundColor: "#C62828", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 3 },
  discT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#fff" },
  thumbs: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  thumb: { width: 54, height: 54, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: "transparent", backgroundColor: "#F1F4F2" },
  thumbOn: { borderColor: GREEN },
  name: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right" },
  priceRow: { flexDirection: "row-reverse", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 22, color: DEEP },
  old: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textMuted, textDecorationLine: "line-through" },
  save: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#C62828" },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted, textAlign: "right" },
  desc: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 24 },
  storeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: Colors.divider, marginVertical: 4 },
  storeLogo: { width: 40, height: 40, borderRadius: 14, backgroundColor: GREEN + "12", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  storeInit: { fontFamily: "Cairo_700Bold", fontSize: 17, color: GREEN },
  storeN: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right" },
  link: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: GREEN },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: DEEP, borderRadius: 14 },
  addT: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  stepper: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: GREEN + "12", borderRadius: 14, padding: 4 },
  stepBtn: { width: 40, height: 38, borderRadius: 12, backgroundColor: DEEP, alignItems: "center", justifyContent: "center" },
  stepN: { fontFamily: "Cairo_700Bold", fontSize: 16, color: DEEP },
});
