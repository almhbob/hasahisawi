// 🛍️ سوق المتاجر: معرض منتجات كل المتاجر المعتمدة (بوتيكات، عطور، أحذية، إلكترونيات…)
// مرتبط بالسلة الموحّدة، ولوحة إدارة لكل صاحب متجر (منتجات بمعرض صور، خصومات، مخزون، طلبات).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Image, ActivityIndicator, Modal, RefreshControl, useWindowDimensions, Linking, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
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
import ProductDetailSheet from "@/components/ProductDetailSheet";
import { confirmAction } from "@/lib/xplatform";
import RtlScrollRow from "@/components/ui/RtlScrollRow";

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
// دليل المحلات (المحلات المسجّلة بالاسم والتواصل فقط، بلا منتجات)
type Shop = { id: number; shop_name: string; owner_name?: string; category?: string; description?: string; address?: string; phone?: string; whatsapp?: string; working_hours?: string; logo_emoji?: string; is_verified?: boolean };
const SHOP_CAT_AR: Record<string, string> = { grocery: "بقالة", restaurant: "مطاعم", pharmacy: "صيدلية", clothing: "ملابس", electronics: "إلكترونيات", services: "خدمات", crafts: "حرف", other: "أخرى" };
type View3 = "products" | "stores" | "shops";
const VIEWS: [View3, string, string][] = [["products", "المنتجات", "pricetags-outline"], ["stores", "المتاجر", "storefront-outline"], ["shops", "دليل المحلات", "call-outline"]];
const TYPE_AR: Record<string, string> = { boutique: "بوتيك", general: "متجر", electronics: "إلكترونيات", sweets: "حلويات", grocery: "بقالة", pharmacy: "صيدلية", restaurant: "مطعم", cafe: "كافتيريا" };

export default function ProductShowcase() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { token, user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [adminOpen, setAdminOpen] = useState(false);
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
  const [view, setView] = useState<View3>("products");
  const [shops, setShops] = useState<Shop[] | null>(null);

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
  const loadShops = useCallback(async () => {
    try {
      const p = new URLSearchParams(); if (qDebounced) p.set("q", qDebounced);
      const r = await fetch(`${getApiUrl()}/api/merchants?${p}`);
      const j = await r.json().catch(() => ({}));
      setShops(Array.isArray(j?.merchants) ? j.merchants : []);
    } catch { setShops([]); } finally { setRefreshing(false); }
  }, [qDebounced]);
  useEffect(() => { if (view === "shops") loadShops(); }, [view, loadShops]);
  const storesShown = useMemo(() => (data?.stores ?? []).filter((s) => (!type || s.type === type) && (!qDebounced || s.name.includes(qDebounced))), [data, type, qDebounced]);
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); view === "shops" ? loadShops() : load(); }} tintColor={GREEN} />}>
        <LinearGradient colors={[GREEN, DEEP]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[st.hero, { paddingTop: insets.top + 8 }]}>
          <View style={st.heroOrb} />
          <View style={st.headRow}>
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)" as any))} style={st.round} accessibilityLabel="رجوع"><Ionicons name="chevron-forward" size={22} color="#fff" /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={st.heroT}>سوق المتاجر</Text>
              <Text style={st.heroS}>أزياء · عطور · أحذية · إلكترونيات — من متاجر الحصاحيصا المعتمدة</Text>
            </View>
            {token ? (
              <Pressable onPress={() => router.push({ pathname: "/stores", params: { tab: "myorders" } } as any)} style={st.round} accessibilityLabel="طلباتي">
                <Ionicons name="receipt-outline" size={20} color="#fff" />
              </Pressable>
            ) : null}
            <CartButton />
          </View>
          <View style={st.search}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder={view === "shops" ? "ابحث عن محل…" : view === "stores" ? "ابحث عن متجر…" : "ابحث عن منتج أو متجر…"} placeholderTextColor={Colors.textMuted} style={st.searchIn} returnKeyType="search" />
            {q ? <Pressable onPress={() => setQ("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={Colors.textMuted} /></Pressable> : null}
          </View>
          {isAdmin ? (
            <Pressable onPress={() => setAdminOpen(true)} style={st.ownerCta} accessibilityRole="button">
              <MaterialCommunityIcons name="shield-crown-outline" size={18} color="#3D2C00" />
              <Text style={st.ownerCtaT}>إدارة المتاجر (مدير التطبيق)</Text>
              <Ionicons name="chevron-back" size={16} color="#3D2C00" />
            </Pressable>
          ) : null}
          {isAdmin ? null : <Pressable onPress={() => router.push((token ? "/store-portal" : "/login") as any)} style={st.ownerCta} accessibilityRole="button">
            <MaterialCommunityIcons name={hasStore ? "view-dashboard-outline" : "storefront-plus-outline"} size={18} color="#3D2C00" />
            <Text style={st.ownerCtaT}>{hasStore ? "لوحة إدارة متجري" : "افتح متجرك في السوق — مجاناً"}</Text>
            <Ionicons name="chevron-back" size={16} color="#3D2C00" />
          </Pressable>}
        </LinearGradient>

        {/* الفلاتر (ثابتة أثناء التمرير) */}
        <View style={st.filters}>
          <View style={st.seg} accessibilityRole="tablist">
            {VIEWS.map(([k, l, ic]) => (
              <Pressable key={k} onPress={() => setView(k)} style={[st.segBtn, view === k && st.segOn]} accessibilityRole="tab" accessibilityState={{ selected: view === k }}>
                <Ionicons name={ic as any} size={15} color={view === k ? "#fff" : DEEP} />
                <Text style={[st.segT, view === k && { color: "#fff" }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
          {view !== "shops" ? <RtlScrollRow contentContainerStyle={st.chips}>
            {TYPES.map(([k, l, ic]) => (
              <Pressable key={k || "all"} onPress={() => setType(k)} style={[st.chip, type === k && st.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: type === k }}>
                <Ionicons name={ic as any} size={14} color={type === k ? "#fff" : DEEP} /><Text style={[st.chipT, type === k && { color: "#fff" }]}>{l}</Text>
              </Pressable>
            ))}
          </RtlScrollRow> : null}
          {view === "products" ? <RtlScrollRow contentContainerStyle={[st.chips, { paddingTop: 0 }]}>
            {SORTS.map(([k, l]) => (
              <Pressable key={k || "new"} onPress={() => setSort(k)} style={[st.sort, sort === k && st.sortOn]}>
                {k === "deals" ? <Ionicons name="pricetag" size={12} color={sort === k ? "#3D2C00" : "#B42318"} /> : null}
                <Text style={[st.sortT, sort === k && { color: "#3D2C00" }]}>{l}</Text>
              </Pressable>
            ))}
          </RtlScrollRow> : null}
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14, width: "100%", maxWidth: 1100, alignSelf: "center" }}>
          {view === "stores" ? <StoresGrid stores={storesShown} loading={!data} w={cardW} /> : null}
          {view === "shops" ? <ShopsList shops={shops} /> : null}
          {view !== "products" ? null : <>
          {/* المتاجر */}
          {data?.stores.length && !qDebounced ? (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text style={st.secT}>المتاجر</Text>
              <RtlScrollRow contentContainerStyle={{ gap: 10, flexDirection: "row-reverse" }}>
                {data.stores.map((s) => (
                  <Pressable key={s.id} onPress={() => router.push({ pathname: "/stores", params: { open: String(s.id) } } as any)} style={st.store}>
                    <View style={st.storeLogo}>{s.logo_url ? <Image source={{ uri: s.logo_url }} style={st.storeLogoImg} /> : <Text style={st.storeInit}>{s.name.trim().charAt(0)}</Text>}</View>
                    <Text style={st.storeN} numberOfLines={1}>{s.name}</Text>
                    <Text style={[st.storeS, { color: s.is_open === false ? "#B42318" : GREEN }]}>{s.is_open === false ? "مغلق الآن" : `${s.product_count} منتج`}</Text>
                  </Pressable>
                ))}
              </RtlScrollRow>
            </View>
          ) : null}

          {/* المميّز */}
          {featured.length && !qDebounced && !sort ? (
            <View style={{ gap: 8 }}>
              <Text style={st.secT}>⭐ مختارات مميّزة</Text>
              <RtlScrollRow contentContainerStyle={{ gap: 10, flexDirection: "row-reverse" }}>
                {featured.map((p) => <ProductCard key={`f${p.id}`} p={p} w={Math.min(200, cardW + 20)} qty={cart.qty("store", p.store_id, p.id)} onOpen={() => setOpen(p)} onAdd={(d) => add(p, d)} />)}
              </RtlScrollRow>
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
          </>}
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

      {adminOpen ? <AdminStoresSheet token={token} onClose={() => setAdminOpen(false)} /> : null}
      {open ? <ProductDetailSheet p={open} qty={cart.qty("store", open.store_id, open.id)} onAdd={(d) => add(open, d)} onClose={() => setOpen(null)}
        closed={open.store_open === false || open.store_accepts === false}
        store={{ id: open.store_id, name: open.store_name, logo: open.store_logo, subtitle: `${TYPE_AR[open.store_type] || "متجر"}${open.delivery_available ? ` · توصيل ${open.delivery_fee ? fmtSdg(open.delivery_fee) : "مجاني"}` : " · استلام من المتجر"}` }} /> : null}
    </View>
  );
}

function StoresGrid({ stores, loading, w }: { stores: StoreLite[]; loading: boolean; w: number }) {
  if (loading) return <ActivityIndicator color={GREEN} style={{ marginTop: 30 }} />;
  if (!stores.length) return (
    <View style={[st.empty, { marginTop: 8 }]}>
      <MaterialCommunityIcons name="storefront-outline" size={44} color={GREEN} />
      <Text style={st.emptyT}>لا توجد متاجر مطابقة</Text>
    </View>
  );
  return (
    <View style={[st.grid, { marginTop: 8 }]}>
      {stores.map((s) => (
        <Pressable key={s.id} onPress={() => router.push({ pathname: "/stores", params: { open: String(s.id) } } as any)} style={[st.card, { width: w }]} accessibilityRole="button" accessibilityLabel={s.name}>
          <View style={{ height: w * 0.5, backgroundColor: DEEP }}>
            {s.cover_url ? <Image source={{ uri: s.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          </View>
          <View style={{ alignItems: "center", marginTop: -28, paddingHorizontal: 8, paddingBottom: 12, gap: 2 }}>
            <View style={[st.storeLogo, { borderColor: "#fff" }]}>{s.logo_url ? <Image source={{ uri: s.logo_url }} style={st.storeLogoImg} /> : <Text style={st.storeInit}>{s.name.trim().charAt(0)}</Text>}</View>
            <Text style={[st.pName, { textAlign: "center" }]} numberOfLines={1}>{s.name}</Text>
            <Text style={[st.pStore, { textAlign: "center" }]}>{TYPE_AR[s.type] || "متجر"} · {s.product_count} منتج</Text>
            <Text style={[st.storeS, { color: s.is_open === false ? "#B42318" : GREEN }]}>{s.is_open === false ? "مغلق الآن" : s.delivery_available ? "مفتوح · توصيل" : "مفتوح"}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function ShopsList({ shops }: { shops: Shop[] | null }) {
  const digits = (v?: string) => String(v || "").replace(/[^\d+]/g, "");
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <Pressable onPress={() => router.push("/store-portal" as any)} style={[st.storeRow, { borderColor: GOLD, borderStyle: "dashed" }]}>
        <View style={[st.storeLogoSm, { backgroundColor: GOLD + "30" }]}><MaterialCommunityIcons name="storefront-plus-outline" size={20} color="#3D2C00" /></View>
        <View style={{ flex: 1 }}>
          <Text style={st.pName}>هل تملك محلاً؟</Text>
          <Text style={st.muted}>افتح متجراً بمنتجات وصور وسلة وطلبات — بدل الاكتفاء برقم التواصل</Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={DEEP} />
      </Pressable>
      {!shops ? <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} /> : !shops.length ? (
        <Text style={[st.muted, { textAlign: "center", marginTop: 10 }]}>لا توجد محلات مطابقة</Text>
      ) : shops.map((m) => (
        <View key={m.id} style={st.storeRow}>
          <View style={st.storeLogoSm}><Text style={{ fontSize: 20 }}>{m.logo_emoji || "🏪"}</Text></View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={st.pName} numberOfLines={1}>{m.shop_name}{m.is_verified ? "  ✓" : ""}</Text>
            <Text style={st.muted} numberOfLines={1}>{[SHOP_CAT_AR[m.category || ""] || "", m.address, m.working_hours].filter(Boolean).join(" · ")}</Text>
            {m.description ? <Text style={st.muted} numberOfLines={2}>{m.description}</Text> : null}
          </View>
          <View style={{ gap: 6 }}>
            {m.phone ? <Pressable onPress={() => Linking.openURL(`tel:${digits(m.phone)}`)} style={st.iconBtn} accessibilityLabel={`اتصال بـ ${m.shop_name}`}><Ionicons name="call" size={16} color="#fff" /></Pressable> : null}
            {m.whatsapp ? <Pressable onPress={() => Linking.openURL(`https://wa.me/${digits(m.whatsapp).replace(/^0/, "249")}`)} style={[st.iconBtn, { backgroundColor: GREEN }]} accessibilityLabel={`واتساب ${m.shop_name}`}><Ionicons name="logo-whatsapp" size={16} color="#fff" /></Pressable> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const STATUS_AR: Record<string, [string, string]> = { active: ["نشط", GREEN], pending: ["بانتظار الاعتماد", "#8A6A00"], suspended: ["موقوف", "#B42318"], rejected: ["مرفوض", "#B42318"] };

/** لوحة مدير التطبيق: كل المتاجر (حتى غير المعتمدة) مع الدخول إلى لوحة أي منها */
function AdminStoresSheet({ token, onClose }: { token: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<any[] | null>(null);
  const [legacy, setLegacy] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [note, setNote] = useState("");
  const api = (path: string, init: RequestInit = {}) => fetch(`${getApiUrl()}/api${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error || "تعذّر التنفيذ"); return j; });
  const load = useCallback(() => {
    api("/admin/stores").then(setList).catch((e) => setErr(e?.message || "تعذّر التحميل"));
    api("/admin/merchants/unmoved").then((j) => setLegacy(j.merchants || [])).catch(() => setLegacy([]));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const flash = (m: string) => { setNote(m); setTimeout(() => setNote(""), 4000); };
  const move = async (id?: number) => {
    setBusy(id ? `m${id}` : "all");
    try {
      const j = await api(id ? `/admin/merchants/${id}/to-store` : "/admin/merchants/to-store-all", { method: "POST" });
      flash(id ? `نُقل «${j.store?.name}» إلى سوق المتاجر` : `نُقل ${j.moved} محل إلى سوق المتاجر`);
      load();
    } catch (e: any) { flash(e?.message || "تعذّر النقل"); } finally { setBusy(""); }
  };
  const remove = async (s0: any) => {
    const ok = await confirmAction("حذف المتجر نهائياً", `«${s0.name}» — ستُحذف منتجاته (${Number(s0.product_count || 0)}) وطلباته ولا يمكن التراجع.`, "حذف", true);
    if (!ok) return;
    setBusy(`d${s0.id}`);
    try { await api(`/admin/stores/${s0.id}`, { method: "DELETE" }); flash(`حُذف «${s0.name}»`); load(); }
    catch (e: any) { flash(e?.message || "تعذّر الحذف"); } finally { setBusy(""); }
  };
  const go = (path: string, params?: any) => { onClose(); router.push((params ? { pathname: path, params } : path) as any); };
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[st.sheet, { width: "100%", maxWidth: 560, paddingBottom: insets.bottom + 14 }]}>
          <View style={{ padding: 16, gap: 4, flexDirection: "row-reverse", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={st.sName}>إدارة المتاجر</Text>
              <Text style={st.muted}>إدارة وتعديل وحذف المتاجر، ونقل محلات «دليل المحلات» إلى السوق</Text>
            </View>
            <Pressable onPress={onClose} style={[st.close, { position: "relative", top: 0, left: 0 }]} accessibilityLabel="إغلاق"><Ionicons name="close" size={20} color="#fff" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 10 }}>
            {note ? <Text style={[st.muted, { color: DEEP, fontFamily: "Cairo_700Bold", textAlign: "center" }]}>{note}</Text> : null}
            {legacy.length ? (
              <View style={st.legacyBox}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                  <Ionicons name="swap-horizontal" size={18} color="#8A6A00" />
                  <View style={{ flex: 1 }}>
                    <Text style={st.pName}>محلات تنتظر النقل إلى سوق المتاجر ({legacy.length.toLocaleString("ar-EG")})</Text>
                    <Text style={st.muted}>مسجّلة في «دليل المحلات» القديم بلا منتجات ولا سلة. بعد النقل تصير متاجر كاملة، ويستلم صاحبها لوحته تلقائياً عند دخوله برقم هاتفه.</Text>
                  </View>
                </View>
                {legacy.map((m) => (
                  <View key={m.id} style={st.legacyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.pName} numberOfLines={1}>{m.shop_name}</Text>
                      <Text style={st.muted} numberOfLines={1}>{m.owner_name} · {m.phone || "—"} · سيكون: {TYPE_AR[m.suggested_type] || "متجر"}</Text>
                    </View>
                    <Pressable onPress={() => move(m.id)} disabled={!!busy} style={st.moveBtn} accessibilityRole="button" accessibilityLabel={`نقل ${m.shop_name}`}>
                      {busy === `m${m.id}` ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.moveT}>نقل</Text>}
                    </Pressable>
                  </View>
                ))}
                {legacy.length > 1 ? (
                  <Pressable onPress={() => move()} disabled={!!busy} style={[st.moveBtn, { alignSelf: "stretch", paddingVertical: 10 }]} accessibilityRole="button">
                    {busy === "all" ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.moveT}>نقل الكل إلى سوق المتاجر</Text>}
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <Pressable onPress={() => go("/store-portal")} style={[st.storeRow, { borderColor: GOLD, borderStyle: "dashed" }]}>
              <View style={[st.storeLogoSm, { backgroundColor: GOLD + "30" }]}><Ionicons name="add" size={22} color="#3D2C00" /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.pName}>متجري (للتجربة)</Text>
                <Text style={st.muted}>افتح متجراً باسمك — يُعتمد فوراً لأنك المدير — أو ادخل لوحته إن كان موجوداً</Text>
              </View>
              <Ionicons name="chevron-back" size={18} color={DEEP} />
            </Pressable>
            {err ? <Text style={[st.muted, { color: "#B42318" }]}>{err}</Text> : !list ? <ActivityIndicator color={GREEN} style={{ marginVertical: 20 }} /> : !list.length ? (
              <Text style={[st.muted, { textAlign: "center", marginVertical: 12 }]}>لا توجد متاجر مسجّلة بعد — ابدأ بمتجر للتجربة من الأعلى</Text>
            ) : list.map((s) => {
              const [lbl, col] = STATUS_AR[s.status] ?? [s.status, Colors.textMuted];
              return (
                <View key={s.id} style={[st.storeRow, { flexWrap: "wrap" }]}>
                  <View style={st.storeLogoSm}>{s.logo_url ? <Image source={{ uri: s.logo_url }} style={{ width: 40, height: 40 }} /> : <Text style={[st.storeInit, { fontSize: 17 }]}>{String(s.name || "م").trim().charAt(0)}</Text>}</View>
                  <View style={{ flex: 1, minWidth: 150 }}>
                    <Text style={st.pName} numberOfLines={1}>{s.name}</Text>
                    <Text style={st.muted} numberOfLines={1}>{s.owner_name || "—"} · {Number(s.product_count || 0)} منتج · <Text style={{ color: col, fontFamily: "Cairo_700Bold" }}>{lbl}</Text></Text>
                    {s.pending_owner_phone ? <Text style={[st.muted, { color: "#8A6A00" }]}>بانتظار استلام صاحبه برقم {s.pending_owner_phone}</Text> : null}
                  </View>
                  <View style={{ flexDirection: "row-reverse", gap: 6 }}>
                    <Pressable onPress={() => go("/store-portal", { store: String(s.id) })} style={st.actBtn} accessibilityRole="button" accessibilityLabel={`إدارة ${s.name}`}>
                      <Ionicons name="grid-outline" size={14} color={DEEP} /><Text style={st.actT}>إدارة</Text>
                    </Pressable>
                    <Pressable onPress={() => go("/store-portal", { store: String(s.id), tab: "settings" })} style={st.actBtn} accessibilityRole="button" accessibilityLabel={`تعديل ${s.name}`}>
                      <Ionicons name="create-outline" size={14} color={DEEP} /><Text style={st.actT}>تعديل</Text>
                    </Pressable>
                    <Pressable onPress={() => remove(s)} disabled={!!busy} style={[st.actBtn, { borderColor: "#B4231840" }]} accessibilityRole="button" accessibilityLabel={`حذف ${s.name}`}>
                      {busy === `d${s.id}` ? <ActivityIndicator size="small" color="#B42318" /> : <Ionicons name="trash-outline" size={14} color="#B42318" />}
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  seg: { flexDirection: "row-reverse", gap: 6, marginHorizontal: 16, marginTop: 10, padding: 4, backgroundColor: Colors.cardBg, borderRadius: 14, borderWidth: 1, borderColor: Colors.divider },
  segBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 10 },
  segOn: { backgroundColor: DEEP },
  segT: { fontFamily: "Cairo_700Bold", fontSize: 13, color: DEEP },
  iconBtn: { width: 34, height: 34, borderRadius: 12, backgroundColor: DEEP, alignItems: "center", justifyContent: "center" },
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
  storeInit: { fontFamily: "Cairo_700Bold", fontSize: 24, color: GREEN },
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
  legacyBox: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: GOLD + "14", borderWidth: 1, borderColor: GOLD + "55" },
  legacyRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: Colors.cardBg, borderRadius: 12, padding: 10 },
  moveBtn: { alignItems: "center", justifyContent: "center", backgroundColor: DEEP, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7, minWidth: 56 },
  moveT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: "#fff" },
  actBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg },
  actT: { fontFamily: "Cairo_700Bold", fontSize: 12, color: DEEP },
  linkT: { fontFamily: "Cairo_700Bold", fontSize: 12.5, color: GREEN },
});
