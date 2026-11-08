// 🛍️ سوق المتاجر: معرض منتجات كل المتاجر المعتمدة (بوتيكات، عطور، أحذية، إلكترونيات…)
// مرتبط بالسلة الموحّدة، ولوحة إدارة لكل صاحب متجر (منتجات بمعرض صور، خصومات، مخزون، طلبات).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Image, ActivityIndicator, Modal, RefreshControl, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import { useCart, fmtSdg, type CartVendor } from "@/lib/cart";
import CartButton from "@/components/CartButton";
import ImageLightbox from "@/components/ImageLightbox";

const GREEN = "#00966A";
const DEEP = "#004D36";
const GOLD = "#E8A900";
type Product = {
  id: number; store_id: number; name: string; description: string; price: number; old_price: number | null; discount_pct: number;
  images: string[]; stock: number | null; is_featured: boolean; store_name: string; store_logo?: string | null; store_type: string;
  store_open?: boolean; store_accepts?: boolean; delivery_available?: boolean; delivery_fee: number; min_order: number;
};
type StoreLite = { id: number; name: string; type: string; logo_url?: string | null; cover_url?: string | null; is_open?: boolean; product_count: number; delivery_available?: boolean };
const TYPES: [string, string, string][] = [["", "الكل", "apps"], ["boutique", "أزياء وبوتيك", "shirt-outline"], ["general", "عطور ومتنوع", "sparkles-outline"], ["electronics", "إلكترونيات", "phone-portrait-outline"], ["sweets", "حلويات", "ice-cream-outline"], ["grocery", "بقالة", "basket-outline"], ["pharmacy", "صيدلية", "medkit-outline"]];
const SORTS: [string, string][] = [["", "الأحدث"], ["deals", "العروض"], ["price_asc", "الأقل سعراً"], ["price_desc", "الأعلى سعراً"]];
const TYPE_AR: Record<string, string> = { boutique: "بوتيك", general: "متجر", electronics: "إلكترونيات", sweets: "حلويات", grocery: "بقالة", pharmacy: "صيدلية", restaurant: "مطعم", cafe: "كافتيريا" };

export default function ProductShowcase() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token } = useAuth();
  const cart = useCart();
  const [data, setData] = useState<{ products: Product[]; stores: StoreLite[] } | null>(null);
  const [err, setErr] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQD] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Product | null>(null);
  const [hasStore, setHasStore] = useState(false);

  useEffect(() => { const t = setTimeout(() => setQD(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  const load = useCallback(async () => {
    try {
      setErr("");
      const p = new URLSearchParams();
      if (type) p.set("type", type);
      if (qDebounced) p.set("q", qDebounced);
      if (sort === "deals") p.set("deals", "1"); else if (sort) p.set("sort", sort);
      const r = await fetch(`${getApiUrl()}/api/stores/feed?${p}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "تعذّر التحميل");
      setData(j);
    } catch (e: any) { setErr(e?.message || "تعذّر التحميل"); }
    finally { setRefreshing(false); }
  }, [type, sort, qDebounced]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!token) return;
    fetch(`${getApiUrl()}/api/store/my`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => setHasStore(r.ok)).catch(() => {});
  }, [token]);

  const cols = width >= 900 ? 4 : width >= 620 ? 3 : 2;
  const cardW = (Math.min(width, 1100) - 32 - (cols - 1) * 12) / cols;
  const vendorOf = (p: Product): CartVendor => ({ source: "store", id: p.store_id, name: p.store_name, logo: p.store_logo ?? null, deliveryFee: p.delivery_fee, minOrder: p.min_order, deliveryAvailable: !!p.delivery_available, kindLabel: TYPE_AR[p.store_type] });
  const add = (p: Product, d = 1) => cart.add(vendorOf(p), { id: p.id, name: p.name, price: p.price, image: p.images[0] ?? null, max: p.stock ?? 99 }, d);
  const featured = useMemo(() => (data?.products ?? []).filter((p) => p.is_featured).slice(0, 10), [data]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 190 }} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={GREEN} />}>
        <LinearGradient colors={[GREEN, DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[st.hero, { paddingTop: insets.top + 8 }]}>
          <View style={st.heroOrb} />
          <View style={st.headRow}>
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} style={st.round} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={st.heroT}>سوق المتاجر</Text>
              <Text style={st.heroS}>أزياء · عطور · أحذية · إلكترونيات — من متاجر الحصاحيصا المعتمدة</Text>
            </View>
            <CartButton />
          </View>
          <View style={st.search}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن منتج أو متجر…" placeholderTextColor={Colors.textMuted} style={st.searchIn} returnKeyType="search" />
            {q ? <Pressable onPress={() => setQ("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></Pressable> : null}
          </View>
          <Pressable onPress={() => router.push((token ? "/store-portal" : "/login") as any)} style={st.ownerCta} accessibilityRole="button">
            <MaterialCommunityIcons name={hasStore ? "view-dashboard-outline" : "storefront-plus-outline"} size={18} color="#3D2C00" />
            <Text style={st.ownerCtaT}>{hasStore ? "لوحة إدارة متجري" : "افتح متجرك في السوق — مجاناً"}</Text>
            <Ionicons name="chevron-back" size={16} color="#3D2C00" />
          </Pressable>
        </LinearGradient>

        {/* الفلاتر (ثابتة أثناء التمرير) */}
        <View style={st.filters}>
          <RtlRow contentContainerStyle={st.chips}>
            {TYPES.map(([k, l, ic]) => (
              <Pressable key={k || "all"} onPress={() => setType(k)} style={[st.chip, type === k && st.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: type === k }}>
                <Ionicons name={ic as any} size={14} color={type === k ? "#fff" : DEEP} /><Text style={[st.chipT, type === k && { color: "#fff" }]}>{l}</Text>
              </Pressable>
            ))}
          </RtlRow>
          <RtlRow contentContainerStyle={[st.chips, { paddingTop: 0 }]}>
            {SORTS.map(([k, l]) => (
              <Pressable key={k || "new"} onPress={() => setSort(k)} style={[st.sort, sort === k && st.sortOn]}>
                {k === "deals" ? <Ionicons name="pricetag" size={12} color={sort === k ? "#3D2C00" : "#B42318"} /> : null}
                <Text style={[st.sortT, sort === k && { color: "#3D2C00" }]}>{l}</Text>
              </Pressable>
            ))}
          </RtlRow>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14, width: "100%", maxWidth: 1100, alignSelf: "center" }}>
          {/* المتاجر */}
          {data?.stores.length && !qDebounced ? (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text style={st.secT}>المتاجر</Text>
              <RtlRow contentContainerStyle={{ gap: 10, flexDirection: "row-reverse" }}>
                {data.stores.map((s) => (
                  <Pressable key={s.id} onPress={() => router.push({ pathname: "/stores", params: { open: String(s.id) } } as any)} style={st.store}>
                    <View style={st.storeLogo}>{s.logo_url ? <Image source={{ uri: s.logo_url }} style={st.storeLogoImg} /> : <Ionicons name="storefront" size={22} color={GREEN} />}</View>
                    <Text style={st.storeN} numberOfLines={1}>{s.name}</Text>
                    <Text style={[st.storeS, { color: s.is_open === false ? "#B42318" : GREEN }]}>{s.is_open === false ? "مغلق الآن" : `${s.product_count} منتج`}</Text>
                  </Pressable>
                ))}
              </RtlRow>
            </View>
          ) : null}

          {/* المميّز */}
          {featured.length && !qDebounced && !sort ? (
            <View style={{ gap: 8 }}>
              <Text style={st.secT}>⭐ مختارات مميّزة</Text>
              <RtlRow contentContainerStyle={{ gap: 10, flexDirection: "row-reverse" }}>
                {featured.map((p) => <ProductCard key={`f${p.id}`} p={p} w={Math.min(200, cardW + 20)} qty={cart.qty("store", p.store_id, p.id)} onOpen={() => setOpen(p)} onAdd={(d) => add(p, d)} />)}
              </RtlRow>
            </View>
          ) : null}

          <Text style={st.secT}>{sort === "deals" ? "🔖 العروض والخصومات" : qDebounced ? `نتائج «${qDebounced}»` : "كل المنتجات"} {data ? `(${data.products.length})` : ""}</Text>
          {err ? <Text style={st.muted}>{err}</Text> : !data ? <ActivityIndicator color={GREEN} style={{ marginTop: 30 }} /> : !data.products.length ? (
            <View style={st.empty}>
              <MaterialCommunityIcons name="shopping-search" size={44} color={GREEN} />
              <Text style={st.emptyT}>{qDebounced || type || sort ? "لا توجد منتجات مطابقة" : "لا توجد منتجات بعد"}</Text>
              <Text style={st.muted}>أصحاب المتاجر يضيفون منتجاتهم من «لوحة إدارة متجري».</Text>
            </View>
          ) : (
            <View style={st.grid}>
              {data.products.map((p, i) => (
                <Animated.View key={p.id} entering={FadeInDown.delay(Math.min(i, 12) * 35).springify().damping(18)}>
                  <ProductCard p={p} w={cardW} qty={cart.qty("store", p.store_id, p.id)} onOpen={() => setOpen(p)} onAdd={(d) => add(p, d)} />
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {cart.count ? (
        <View style={[st.cartBar, { bottom: insets.bottom + 88 }]}>
          <Pressable onPress={() => router.push("/cart" as any)} style={st.cartBtn} accessibilityRole="button">
            <View style={st.cartN}><Text style={st.cartNT}>{cart.count}</Text></View>
            <Text style={st.cartT}>عرض السلة وإتمام الطلب</Text>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      {open ? <ProductSheet p={open} qty={cart.qty("store", open.store_id, open.id)} onAdd={(d) => add(open, d)} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

/** صف أفقي يبدأ من اليمين (الواجهة LTR على الويب، فنمرّر إلى النهاية عند العرض) */
function RtlRow({ contentContainerStyle, children }: { contentContainerStyle?: any; children: React.ReactNode }) {
  const ref = useRef<ScrollView>(null);
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ flexDirection: "row-reverse", flexGrow: 1 }, contentContainerStyle]}
      onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}>
      {children}
    </ScrollView>
  );
}

function ProductCard({ p, w, qty, onOpen, onAdd }: { p: Product; w: number; qty: number; onOpen: () => void; onAdd: (d: number) => void }) {
  const closed = p.store_open === false || p.store_accepts === false;
  return (
    <Pressable onPress={onOpen} style={[st.card, { width: w }]} accessibilityRole="button" accessibilityLabel={`${p.name} — ${fmtSdg(p.price)}`}>
      <View style={[st.imgBox, { height: w * 1.05 }]}>
        {p.images[0] ? <Image source={{ uri: p.images[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <View style={[StyleSheet.absoluteFill, st.noImg]}><Ionicons name="image-outline" size={30} color={GREEN} /></View>}
        {p.discount_pct ? <View style={st.disc}><Text style={st.discT}>-{p.discount_pct}%</Text></View> : null}
        {p.is_featured ? <View style={st.star}><Ionicons name="star" size={12} color="#3D2C00" /></View> : null}
        {p.images.length > 1 ? <View style={st.imgCount}><Ionicons name="images" size={11} color="#fff" /><Text style={st.imgCountT}>{p.images.length}</Text></View> : null}
        {p.stock != null && p.stock <= 3 ? <View style={st.low}><Text style={st.lowT}>تبقّى {p.stock}</Text></View> : null}
      </View>
      <View style={{ padding: 10, gap: 3 }}>
        <Text style={st.pName} numberOfLines={2}>{p.name}</Text>
        <Text style={st.pStore} numberOfLines={1}>{p.store_name}</Text>
        <View style={st.priceRow}>
          <Text style={st.price}>{fmtSdg(p.price)}</Text>
          {p.old_price ? <Text style={st.old}>{fmtSdg(p.old_price)}</Text> : null}
        </View>
        {closed ? <Text style={[st.pStore, { color: "#B42318" }]}>المتجر لا يستقبل طلبات الآن</Text> : qty ? (
          <View style={st.stepper}>
            <Pressable onPress={() => onAdd(1)} style={st.stepBtn} accessibilityLabel="زيادة"><Ionicons name="add" size={16} color="#fff" /></Pressable>
            <Text style={st.stepN}>{qty}</Text>
            <Pressable onPress={() => onAdd(-1)} style={[st.stepBtn, { backgroundColor: Colors.bg }]} accessibilityLabel="إنقاص"><Ionicons name={qty === 1 ? "trash-outline" : "remove"} size={15} color={qty === 1 ? "#B42318" : DEEP} /></Pressable>
          </View>
        ) : (
          <Pressable onPress={() => onAdd(1)} style={st.addBtn} accessibilityRole="button"><Ionicons name="cart-outline" size={15} color="#fff" /><Text style={st.addT}>أضف للسلة</Text></Pressable>
        )}
      </View>
    </Pressable>
  );
}

function ProductSheet({ p, qty, onAdd, onClose }: { p: Product; qty: number; onAdd: (d: number) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const W = Math.min(width, 560);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIdx(Math.round(e.nativeEvent.contentOffset.x / W));
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { width: W, paddingBottom: insets.bottom + 14 }]}>
          <View style={{ height: W * 0.9, backgroundColor: Colors.bg }}>
            {p.images.length ? (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} onScroll={onScroll} scrollEventThrottle={64}>
                {p.images.map((u) => (
                  <Pressable key={u} onPress={() => setZoom(u)} accessibilityLabel="تكبير الصورة"><Image source={{ uri: u }} style={{ width: W, height: W * 0.9 }} resizeMode="cover" /></Pressable>
                ))}
              </ScrollView>
            ) : <View style={[StyleSheet.absoluteFill, st.noImg]}><Ionicons name="image-outline" size={44} color={GREEN} /></View>}
            <Pressable onPress={onClose} style={st.close} accessibilityLabel="إغلاق"><Ionicons name="close" size={20} color="#fff" /></Pressable>
            {p.images.length > 1 ? <View style={st.dots}>{p.images.map((_, i) => <View key={i} style={[st.dot, i === idx && st.dotOn]} />)}</View> : null}
            {p.discount_pct ? <View style={[st.disc, { top: 14, right: 14 }]}><Text style={st.discT}>خصم {p.discount_pct}%</Text></View> : null}
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            <Text style={st.sName}>{p.name}</Text>
            <View style={st.priceRow}>
              <Text style={[st.price, { fontSize: 22 }]}>{fmtSdg(p.price)}</Text>
              {p.old_price ? <Text style={[st.old, { fontSize: 14 }]}>{fmtSdg(p.old_price)}</Text> : null}
              {p.old_price ? <Text style={st.save}>وفّر {fmtSdg(p.old_price - p.price)}</Text> : null}
            </View>
            {p.stock != null ? <Text style={[st.muted, p.stock <= 3 && { color: "#B42318", fontFamily: "Cairo_700Bold" }]}>{p.stock <= 3 ? `⚠️ تبقّى ${p.stock} فقط` : `متوفر: ${p.stock}`}</Text> : null}
            {p.description ? <Text style={st.desc}>{p.description}</Text> : null}
            <Pressable onPress={() => { onClose(); router.push({ pathname: "/stores", params: { open: String(p.store_id) } } as any); }} style={st.storeRow}>
              <View style={st.storeLogoSm}>{p.store_logo ? <Image source={{ uri: p.store_logo }} style={{ width: 36, height: 36 }} /> : <Ionicons name="storefront" size={18} color={GREEN} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={st.pName}>{p.store_name}</Text>
                <Text style={st.muted}>{TYPE_AR[p.store_type] || "متجر"}{p.delivery_available ? ` · توصيل ${p.delivery_fee ? fmtSdg(p.delivery_fee) : "مجاني"}` : " · استلام من المتجر"}</Text>
              </View>
              <Text style={st.linkT}>زيارة المتجر</Text>
            </Pressable>
            {qty ? (
              <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                <View style={[st.stepper, { flex: 1 }]}>
                  <Pressable onPress={() => onAdd(1)} style={st.stepBtn}><Ionicons name="add" size={18} color="#fff" /></Pressable>
                  <Text style={[st.stepN, { fontSize: 16 }]}>{qty}</Text>
                  <Pressable onPress={() => onAdd(-1)} style={[st.stepBtn, { backgroundColor: Colors.bg }]}><Ionicons name="remove" size={18} color={DEEP} /></Pressable>
                </View>
                <Pressable onPress={() => { onClose(); router.push("/cart" as any); }} style={[st.addBtn, { flex: 1.3, paddingVertical: 13 }]}><Text style={st.addT}>إتمام الطلب</Text></Pressable>
              </View>
            ) : (
              <Pressable onPress={() => onAdd(1)} style={[st.addBtn, { paddingVertical: 14 }]}><Ionicons name="cart" size={18} color="#fff" /><Text style={[st.addT, { fontSize: 15 }]}>أضف للسلة · {fmtSdg(p.price)}</Text></Pressable>
            )}
          </ScrollView>
        </View>
      </View>
      <ImageLightbox uri={zoom} title={p.name} onClose={() => setZoom(null)} />
    </Modal>
  );
}

const st = StyleSheet.create({
  hero: { paddingHorizontal: 16, paddingBottom: 16, gap: 12, overflow: "hidden" },
  heroOrb: { position: "absolute", top: -100, left: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(255,255,255,0.1)" },
  headRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  round: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  heroT: { fontFamily: "Cairo_700Bold", fontSize: 21, color: "#fff", textAlign: "right" },
  heroS: { fontFamily: "Cairo_500Medium", fontSize: 12, color: "rgba(255,255,255,0.88)", textAlign: "right" },
  search: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 12 },
  searchIn: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textPrimary, textAlign: "right", paddingVertical: 11 },
  ownerCta: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: GOLD, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, alignSelf: "flex-end" },
  ownerCtaT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#3D2C00" },
  filters: { backgroundColor: Colors.bg, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  chips: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  chip: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider },
  chipOn: { backgroundColor: DEEP, borderColor: DEEP },
  chipT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: DEEP },
  sort: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 10 },
  sortOn: { backgroundColor: GOLD + "40" },
  sortT: { fontFamily: "Cairo_600SemiBold", fontSize: 12.5, color: Colors.textSecondary },
  secT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right", marginTop: 4 },
  muted: { fontFamily: "Cairo_500Medium", fontSize: 12.5, color: Colors.textMuted, textAlign: "right" },
  store: { width: 92, alignItems: "center", gap: 3 },
  storeLogo: { width: 64, height: 64, borderRadius: 22, backgroundColor: Colors.cardBg, borderWidth: 2, borderColor: GOLD + "80", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  storeLogoImg: { width: 60, height: 60, borderRadius: 20 },
  storeN: { fontFamily: "Cairo_700Bold", fontSize: 12, color: Colors.textPrimary, textAlign: "center" },
  storeS: { fontFamily: "Cairo_600SemiBold", fontSize: 10.5, textAlign: "center" },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  card: { backgroundColor: Colors.cardBg, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: Colors.divider },
  imgBox: { width: "100%", backgroundColor: Colors.bg },
  noImg: { alignItems: "center", justifyContent: "center", backgroundColor: GREEN + "0D" },
  disc: { position: "absolute", top: 8, right: 8, backgroundColor: "#C62828", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  discT: { fontFamily: "Cairo_700Bold", fontSize: 11.5, color: "#fff" },
  star: { position: "absolute", top: 8, left: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
  imgCount: { position: "absolute", bottom: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  imgCountT: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#fff" },
  low: { position: "absolute", bottom: 8, right: 8, backgroundColor: "#FFF4E5", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  lowT: { fontFamily: "Cairo_700Bold", fontSize: 10.5, color: "#8A4B00" },
  pName: { fontFamily: "Cairo_700Bold", fontSize: 13.5, color: Colors.textPrimary, textAlign: "right", lineHeight: 20 },
  pStore: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, textAlign: "right" },
  priceRow: { flexDirection: "row-reverse", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  price: { fontFamily: "Cairo_700Bold", fontSize: 15, color: DEEP },
  old: { fontFamily: "Cairo_500Medium", fontSize: 11.5, color: Colors.textMuted, textDecorationLine: "line-through" },
  save: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#C62828" },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: DEEP, borderRadius: 12, paddingVertical: 8, marginTop: 4 },
  addT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#fff" },
  stepper: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: GREEN + "12", borderRadius: 12, padding: 3, marginTop: 4 },
  stepBtn: { width: 32, height: 30, borderRadius: 10, backgroundColor: DEEP, alignItems: "center", justifyContent: "center" },
  stepN: { fontFamily: "Cairo_700Bold", fontSize: 14, color: DEEP },
  empty: { alignItems: "center", gap: 6, padding: 26, backgroundColor: Colors.cardBg, borderRadius: 22, borderWidth: 1, borderColor: Colors.divider },
  emptyT: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary },
  cartBar: { position: "absolute", left: 0, right: 0, paddingHorizontal: 16 },
  cartBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 10, height: 54, borderRadius: 18, paddingHorizontal: 16, backgroundColor: DEEP, maxWidth: 560, width: "100%", alignSelf: "center" },
  cartN: { minWidth: 28, height: 28, borderRadius: 14, backgroundColor: GOLD, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  cartNT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#3D2C00" },
  cartT: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 14.5, color: "#fff", textAlign: "right" },
  overlay: { flex: 1, justifyContent: "flex-end", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "94%", backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  close: { position: "absolute", top: 14, left: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  dots: { position: "absolute", bottom: 12, alignSelf: "center", flexDirection: "row", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.55)" },
  dotOn: { width: 18, backgroundColor: "#fff" },
  sName: { fontFamily: "Cairo_700Bold", fontSize: 19, color: Colors.textPrimary, textAlign: "right" },
  desc: { fontFamily: "Cairo_500Medium", fontSize: 14, color: Colors.textSecondary, textAlign: "right", lineHeight: 24 },
  storeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, backgroundColor: Colors.cardBg, borderRadius: 16, padding: 10, borderWidth: 1, borderColor: Colors.divider, marginVertical: 4 },
  storeLogoSm: { width: 40, height: 40, borderRadius: 14, backgroundColor: GREEN + "12", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  linkT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: GREEN },
});
