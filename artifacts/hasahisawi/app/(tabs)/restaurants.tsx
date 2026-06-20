import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Linking, Platform, Image, Modal, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import AnimatedPress from "@/components/AnimatedPress";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { uploadPostImage } from "@/lib/firebase/storage";

type FoodBusiness = {
  id: string | number;
  name: string;
  business_type: "restaurant" | "cafe" | "bakery" | "juice";
  phone?: string;
  address?: string;
  description?: string;
  cover_url?: string;
  delivery_enabled?: boolean;
  takeaway_enabled?: boolean;
  dine_in_enabled?: boolean;
  status?: string;
};

type FoodProduct = {
  id: string | number;
  business_id: string | number;
  name: string;
  category: "meals" | "drinks" | "dessert" | "bakery" | "offers";
  description?: string;
  price: number;
  cost?: number;
  stock?: number | null;
  prep_minutes?: number;
  is_available?: boolean;
  images?: Array<{ image_url?: string; url?: string }>;
};

type CartItem = { product: FoodProduct; qty: number };
type Invoice = { id: string | number; invoice_number: string; total: number; paid_amount?: number; change_amount?: number; issued_at?: string; items: any[] };

type Report = { period: string; summary: { invoice_count: number; sales_total: number; paid_total: number }; top_products: Array<{ name: string; qty: number; total: number }> };

const BUSINESSES_KEY = "food_pos_businesses_v1";
const PRODUCTS_KEY = "food_pos_products_v1";
const INVOICES_KEY = "food_pos_invoices_v1";

const TYPE_META = {
  restaurant: { label: "مطعم", icon: "restaurant", color: "#F97316" },
  cafe: { label: "كافتيريا", icon: "cafe", color: "#A855F7" },
  bakery: { label: "مخبز وحلويات", icon: "baguette", color: "#EAB308" },
  juice: { label: "عصائر ومثلجات", icon: "cup-water", color: "#14B8A6" },
} as const;

const CAT_META = {
  meals: { label: "وجبات", icon: "food", color: "#F97316" },
  drinks: { label: "مشروبات", icon: "cup", color: "#14B8A6" },
  dessert: { label: "حلويات", icon: "cake-variant", color: "#EC4899" },
  bakery: { label: "مخبوزات", icon: "baguette", color: "#EAB308" },
  offers: { label: "عروض", icon: "tag-heart", color: "#22C55E" },
} as const;

const SEED_BUSINESSES: FoodBusiness[] = [
  { id: "r1", name: "مطعم النيل", business_type: "restaurant", phone: "0912000001", address: "السوق الكبير", description: "وجبات سودانية ومشاوي وطلبات عائلية", delivery_enabled: true, takeaway_enabled: true, dine_in_enabled: true, status: "approved" },
  { id: "r2", name: "كافتيريا الشباب", business_type: "cafe", phone: "0912000002", address: "وسط المدينة", description: "قهوة، شاي لبن، سندوتشات وجلسات", delivery_enabled: false, takeaway_enabled: true, dine_in_enabled: true, status: "approved" },
  { id: "r3", name: "مخبز البركة", business_type: "bakery", phone: "0912000003", address: "حي المزاد", description: "مخبوزات وحلويات وطلبات مناسبات", delivery_enabled: true, takeaway_enabled: true, dine_in_enabled: false, status: "approved" },
];

const SEED_PRODUCTS: FoodProduct[] = [
  { id: "p1", business_id: "r1", name: "وجبة اليوم", category: "meals", description: "طبق رئيسي مع سلطة ومشروب", price: 6500, cost: 4200, stock: 30, prep_minutes: 15, is_available: true },
  { id: "p2", business_id: "r1", name: "مشاوي مشكلة", category: "meals", description: "مشاوي طازجة مع خبز وسلطة", price: 12500, cost: 8500, stock: 18, prep_minutes: 25, is_available: true },
  { id: "p3", business_id: "r2", name: "قهوة سريعة", category: "drinks", description: "قهوة ساخنة جاهزة خلال دقائق", price: 1200, cost: 500, stock: 100, prep_minutes: 3, is_available: true },
  { id: "p4", business_id: "r2", name: "سندوتش دجاج", category: "meals", description: "سندوتش سريع للطلبات داخل المحل", price: 3500, cost: 2100, stock: 40, prep_minutes: 7, is_available: true },
  { id: "p5", business_id: "r3", name: "بسبوسة", category: "dessert", description: "قطعة بسبوسة طازجة", price: 1800, cost: 900, stock: 60, prep_minutes: 1, is_available: true },
];

const fmt = (n: number) => `${Math.round(Number(n || 0)).toLocaleString("ar-SA")} ج.س`;
const imgOf = (p: FoodProduct) => p.images?.[0]?.image_url || p.images?.[0]?.url;

export default function RestaurantsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const apiUrl = getApiUrl();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"market" | "cashier" | "invoices" | "reports">("market");
  const [query, setQuery] = useState("");
  const [businessFilter, setBusinessFilter] = useState<"all" | FoodBusiness["business_type"]>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FoodProduct["category"]>("all");
  const [businesses, setBusinesses] = useState<FoodBusiness[]>(SEED_BUSINESSES);
  const [products, setProducts] = useState<FoodProduct[]>(SEED_PRODUCTS);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | number>("r1");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [reportPeriod, setReportPeriod] = useState<"day" | "month" | "year">("day");
  const [loading, setLoading] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState<Invoice | null>(null);

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newStock, setNewStock] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCat, setNewCat] = useState<FoodProduct["category"]>("meals");
  const [newImages, setNewImages] = useState<string[]>([]);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { AsyncStorage.setItem(BUSINESSES_KEY, JSON.stringify(businesses)).catch(() => {}); }, [businesses]);
  useEffect(() => { AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products)).catch(() => {}); }, [products]);
  useEffect(() => { AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(invoices)).catch(() => {}); }, [invoices]);

  async function loadAll() {
    setLoading(true);
    try {
      const localB = await AsyncStorage.getItem(BUSINESSES_KEY);
      const localP = await AsyncStorage.getItem(PRODUCTS_KEY);
      const localI = await AsyncStorage.getItem(INVOICES_KEY);
      if (localB) setBusinesses(JSON.parse(localB));
      if (localP) setProducts(JSON.parse(localP));
      if (localI) setInvoices(JSON.parse(localI));
      const [bRes, pRes] = await Promise.all([
        fetchWithTimeout(`${apiUrl}/api/food/businesses`),
        fetchWithTimeout(`${apiUrl}/api/food/products`),
      ]);
      if (bRes.ok) {
        const j = await bRes.json();
        if (Array.isArray(j.businesses) && j.businesses.length) setBusinesses(j.businesses);
      }
      if (pRes.ok) {
        const j = await pRes.json();
        if (Array.isArray(j.products) && j.products.length) setProducts(j.products.map((p: any) => ({ ...p, price: Number(p.price || 0), cost: Number(p.cost || 0) })));
      }
    } catch {} finally { setLoading(false); }
  }

  const currentBusiness = businesses.find(b => String(b.id) === String(selectedBusinessId)) || businesses[0];
  const filteredProducts = useMemo(() => products.filter(p => {
    const business = businesses.find(b => String(b.id) === String(p.business_id));
    const q = query.trim();
    const byBusiness = businessFilter === "all" || business?.business_type === businessFilter;
    const byCat = categoryFilter === "all" || p.category === categoryFilter;
    const byQ = !q || p.name.includes(q) || p.description?.includes(q) || business?.name.includes(q);
    return p.is_available !== false && byBusiness && byCat && byQ;
  }), [products, businesses, query, businessFilter, categoryFilter]);

  const cashierProducts = useMemo(() => products.filter(p => String(p.business_id) === String(selectedBusinessId) && p.is_available !== false), [products, selectedBusinessId]);
  const subtotal = cart.reduce((sum, i) => sum + Number(i.product.price || 0) * i.qty, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  function addToCart(product: FoodProduct) {
    setCart(prev => {
      const found = prev.find(x => String(x.product.id) === String(product.id));
      if (found) return prev.map(x => String(x.product.id) === String(product.id) ? { ...x, qty: x.qty + 1 } : x);
      return [...prev, { product, qty: 1 }];
    });
  }
  function dec(productId: string | number) {
    setCart(prev => prev.map(x => String(x.product.id) === String(productId) ? { ...x, qty: x.qty - 1 } : x).filter(x => x.qty > 0));
  }

  async function pickProductImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return Alert.alert("إذن مطلوب", "اسمح للتطبيق بالوصول للصور");
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, selectionLimit: 5, quality: 0.85 });
    if (!pick.canceled) setNewImages(pick.assets.slice(0, 5).map(a => a.uri));
  }

  async function saveProduct() {
    if (!currentBusiness || !newName.trim() || !Number(newPrice)) return Alert.alert("بيانات ناقصة", "أدخل اسم المنتج والسعر");
    setLoading(true);
    let imageUrls = newImages;
    try {
      if (user?.id && newImages.length) {
        imageUrls = [];
        for (const uri of newImages) imageUrls.push(await uploadPostImage(String(user.id), uri));
      }
    } catch { imageUrls = newImages; }
    const product: FoodProduct = {
      id: `local-${Date.now()}`,
      business_id: currentBusiness.id,
      name: newName.trim(), category: newCat, description: newDesc.trim(),
      price: Number(newPrice), cost: Number(newCost || 0), stock: Number(newStock || 0), prep_minutes: 10,
      is_available: true, images: imageUrls.map((url, i) => ({ image_url: url, url })),
    };
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/food/products`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: currentBusiness.id, name: product.name, category: product.category, description: product.description, price: product.price, cost: product.cost, stock: product.stock, images: imageUrls }),
      });
      if (res.ok) {
        const saved = await res.json();
        setProducts(prev => [{ ...product, ...saved, price: Number(saved.price || product.price), images: product.images }, ...prev]);
      } else setProducts(prev => [product, ...prev]);
    } catch { setProducts(prev => [product, ...prev]); }
    setNewName(""); setNewPrice(""); setNewCost(""); setNewStock(""); setNewDesc(""); setNewImages([]); setProductModal(false); setLoading(false);
  }

  async function checkout(orderType: "takeaway" | "dine_in" | "delivery" = "takeaway") {
    if (!cart.length || !currentBusiness) return;
    const items = cart.map(i => ({ id: i.product.id, name: i.product.name, price: Number(i.product.price), qty: i.qty }));
    const localInvoice: Invoice = { id: Date.now(), invoice_number: `LOCAL-${Date.now()}`, total: subtotal, paid_amount: subtotal, change_amount: 0, issued_at: new Date().toISOString(), items };
    try {
      const orderRes = await fetchWithTimeout(`${apiUrl}/api/food/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business_id: currentBusiness.id, order_type: orderType, items, total: subtotal }) });
      let order: any = null;
      if (orderRes.ok) order = await orderRes.json();
      const invRes = await fetchWithTimeout(`${apiUrl}/api/food/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business_id: currentBusiness.id, order_id: order?.id, items, paid_amount: subtotal, payment_method: "cash" }) });
      if (invRes.ok) {
        const inv = await invRes.json();
        localInvoice.id = inv.id; localInvoice.invoice_number = inv.invoice_number; localInvoice.total = Number(inv.total || subtotal); localInvoice.issued_at = inv.issued_at;
      }
    } catch {}
    setInvoices(prev => [localInvoice, ...prev]);
    setInvoiceModal(localInvoice);
    setCart([]);
  }

  async function loadReport(period: "day" | "month" | "year" = reportPeriod) {
    setReportPeriod(period);
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/food/reports?business_id=${currentBusiness?.id || ""}&period=${period}`);
      if (res.ok) {
        const j = await res.json();
        setReport({ period, summary: { invoice_count: Number(j.summary?.invoice_count || 0), sales_total: Number(j.summary?.sales_total || 0), paid_total: Number(j.summary?.paid_total || 0) }, top_products: j.top_products || [] });
        return;
      }
    } catch {}
    const now = Date.now();
    const span = period === "year" ? 365 : period === "month" ? 30 : 1;
    const list = invoices.filter(i => now - new Date(i.issued_at || now).getTime() <= span * 86400000);
    const topMap = new Map<string, { name: string; qty: number; total: number }>();
    list.forEach(inv => (inv.items || []).forEach((it: any) => {
      const cur = topMap.get(it.name) || { name: it.name, qty: 0, total: 0 };
      cur.qty += Number(it.qty || 1); cur.total += Number(it.price || 0) * Number(it.qty || 1); topMap.set(it.name, cur);
    }));
    setReport({ period, summary: { invoice_count: list.length, sales_total: list.reduce((s, i) => s + Number(i.total || 0), 0), paid_total: list.reduce((s, i) => s + Number(i.paid_amount || i.total || 0), 0) }, top_products: [...topMap.values()].sort((a,b)=>b.total-a.total).slice(0,10) });
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <LinearGradient colors={["#241000", "#0D1F13", Colors.bg]} style={[styles.hero, { paddingTop: topPad + 16 }]}>
          <Animated.View entering={FadeIn.delay(80)} style={styles.heroIcon}><Ionicons name="restaurant-outline" size={38} color="#fff" /></Animated.View>
          <Animated.Text entering={FadeInDown.delay(120).springify()} style={styles.title}>المطاعم والكافتريات</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(180).springify()} style={styles.subtitle}>مؤسسات · منيو مصور · أسعار · سلة · كاشير · فواتير · تقارير مبيعات</Animated.Text>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.tabs}>{[
            ["market", "السوق", "storefront-outline"], ["cashier", "الكاشير", "calculator-outline"], ["invoices", "الفواتير", "receipt-outline"], ["reports", "التقارير", "bar-chart-outline"],
          ].map(([key,label,icon]) => <TouchableOpacity key={key} onPress={() => { setActiveTab(key as any); if (key === "reports") loadReport(reportPeriod); }} style={[styles.tab, activeTab === key && styles.tabOn]}><Ionicons name={icon as any} size={16} color={activeTab === key ? "#001" : Colors.textSecondary} /><Text style={[styles.tabText, activeTab === key && { color: "#001" }]}>{label}</Text></TouchableOpacity>)}</View>

          <View style={styles.searchBox}><Ionicons name="search" size={18} color={Colors.textMuted} /><TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن مطعم أو منتج..." placeholderTextColor={Colors.textMuted} style={styles.input} /></View>

          {(activeTab === "cashier" || activeTab === "reports") && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{businesses.map(b => <TouchableOpacity key={String(b.id)} onPress={() => setSelectedBusinessId(b.id)} style={[styles.businessChip, String(selectedBusinessId) === String(b.id) && styles.businessChipOn]}><Text style={[styles.filterText, String(selectedBusinessId) === String(b.id) && { color: "#001" }]}>{b.name}</Text></TouchableOpacity>)}</ScrollView>}

          {activeTab === "market" && <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{(["all", "restaurant", "cafe", "bakery", "juice"] as const).map(key => { const meta = key === "all" ? { label: "الكل", color: Colors.primary, icon: "apps" } : TYPE_META[key]; const active = businessFilter === key; return <TouchableOpacity key={key} onPress={() => setBusinessFilter(key)} style={[styles.filterChip, active && { borderColor: meta.color, backgroundColor: meta.color + "18" }]}><MaterialCommunityIcons name={meta.icon as any} size={15} color={active ? meta.color : Colors.textMuted} /><Text style={[styles.filterText, active && { color: meta.color }]}>{meta.label}</Text></TouchableOpacity>; })}</ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{(["all", "meals", "drinks", "dessert", "bakery", "offers"] as const).map(key => { const meta = key === "all" ? { label: "كل المنتجات", color: Colors.primary, icon: "apps" } : CAT_META[key]; const active = categoryFilter === key; return <TouchableOpacity key={key} onPress={() => setCategoryFilter(key)} style={[styles.filterChip, active && { borderColor: meta.color, backgroundColor: meta.color + "18" }]}><MaterialCommunityIcons name={meta.icon as any} size={15} color={active ? meta.color : Colors.textMuted} /><Text style={[styles.filterText, active && { color: meta.color }]}>{meta.label}</Text></TouchableOpacity>; })}</ScrollView>
            {filteredProducts.map((item, index) => <ProductCard key={String(item.id)} item={item} business={businesses.find(b => String(b.id) === String(item.business_id))} onAdd={() => addToCart(item)} index={index} />)}
          </>}

          {activeTab === "cashier" && <>
            <View style={styles.cashierHead}><View><Text style={styles.sectionTitle}>كاشير {currentBusiness?.name}</Text><Text style={styles.muted}>اختر المنتجات لتجهيز الطلبات داخل المحل بسرعة</Text></View><TouchableOpacity onPress={() => setProductModal(true)} style={styles.addBtn}><Ionicons name="add" size={16} color="#001" /><Text style={styles.addText}>منتج</Text></TouchableOpacity></View>
            <View style={styles.grid}>{cashierProducts.map(p => <TouchableOpacity key={String(p.id)} onPress={() => addToCart(p)} style={styles.quickItem}><Text style={styles.quickName}>{p.name}</Text><Text style={styles.quickPrice}>{fmt(p.price)}</Text></TouchableOpacity>)}</View>
            <CartBox cart={cart} subtotal={subtotal} onDec={dec} onCheckout={checkout} />
          </>}

          {activeTab === "invoices" && <>{invoices.length === 0 ? <Empty icon="receipt-outline" text="لا توجد فواتير بعد" /> : invoices.map(inv => <TouchableOpacity key={String(inv.id)} onPress={() => setInvoiceModal(inv)} style={styles.invoiceCard}><Text style={styles.invoiceNo}>{inv.invoice_number}</Text><Text style={styles.invoiceMeta}>{new Date(inv.issued_at || Date.now()).toLocaleString("ar-SA")}</Text><Text style={styles.invoiceTotal}>{fmt(inv.total)}</Text></TouchableOpacity>)}</>}

          {activeTab === "reports" && <>
            <View style={styles.reportBtns}>{(["day", "month", "year"] as const).map(p => <TouchableOpacity key={p} onPress={() => loadReport(p)} style={[styles.reportBtn, reportPeriod === p && styles.reportBtnOn]}><Text style={[styles.reportText, reportPeriod === p && { color: "#001" }]}>{p === "day" ? "اليوم" : p === "month" ? "الشهر" : "السنة"}</Text></TouchableOpacity>)}</View>
            {!report ? <TouchableOpacity onPress={() => loadReport(reportPeriod)} style={styles.addBtn}><Text style={styles.addText}>تحميل التقرير</Text></TouchableOpacity> : <View style={styles.reportCard}><Text style={styles.sectionTitle}>تقرير {reportPeriod === "day" ? "اليوم" : reportPeriod === "month" ? "الشهر" : "السنة"}</Text><View style={styles.kpis}><Kpi label="الفواتير" value={String(report.summary.invoice_count)} /><Kpi label="المبيعات" value={fmt(report.summary.sales_total)} /><Kpi label="المحصّل" value={fmt(report.summary.paid_total)} /></View><Text style={styles.sectionTitle}>الأكثر مبيعًا</Text>{report.top_products.length === 0 ? <Text style={styles.muted}>لا توجد مبيعات في هذه الفترة</Text> : report.top_products.map(x => <View key={x.name} style={styles.topRow}><Text style={styles.quickName}>{x.name}</Text><Text style={styles.muted}>× {Number(x.qty).toLocaleString("ar-SA")}</Text><Text style={styles.quickPrice}>{fmt(x.total)}</Text></View>)}</View>}
          </>}
        </View>
      </ScrollView>

      {cartCount > 0 && activeTab === "market" && <View style={styles.floatingCart}><Text style={styles.cartTitle}>السلة: {cartCount}</Text><Text style={styles.cartTotal}>{fmt(subtotal)}</Text><TouchableOpacity onPress={() => checkout("takeaway")} style={styles.checkout}><Text style={styles.checkoutText}>إرسال الطلب</Text></TouchableOpacity></View>}

      <Modal visible={productModal} transparent animationType="slide" onRequestClose={() => setProductModal(false)}><View style={styles.modalBg}><View style={styles.modal}><Text style={styles.sectionTitle}>إضافة منتج للمحل</Text><TouchableOpacity onPress={pickProductImages} style={styles.imagePick}>{newImages.length ? <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>{newImages.map((uri, i) => <Image key={uri+i} source={{ uri }} style={styles.pickThumb} />)}</ScrollView> : <><Ionicons name="images-outline" size={28} color={Colors.textMuted} /><Text style={styles.muted}>رفع صور المنتج حتى 5 صور</Text></>}</TouchableOpacity><TextInput style={styles.modalInput} value={newName} onChangeText={setNewName} placeholder="اسم المنتج" placeholderTextColor={Colors.textMuted} /><TextInput style={styles.modalInput} value={newPrice} onChangeText={setNewPrice} placeholder="السعر" placeholderTextColor={Colors.textMuted} keyboardType="numeric" /><TextInput style={styles.modalInput} value={newCost} onChangeText={setNewCost} placeholder="التكلفة الاختيارية" placeholderTextColor={Colors.textMuted} keyboardType="numeric" /><TextInput style={styles.modalInput} value={newStock} onChangeText={setNewStock} placeholder="المخزون" placeholderTextColor={Colors.textMuted} keyboardType="numeric" /><TextInput style={[styles.modalInput, { height: 76 }]} value={newDesc} onChangeText={setNewDesc} placeholder="وصف المنتج" placeholderTextColor={Colors.textMuted} multiline /><ScrollView horizontal contentContainerStyle={styles.filterRow}>{Object.entries(CAT_META).map(([k,v]) => <TouchableOpacity key={k} onPress={() => setNewCat(k as any)} style={[styles.filterChip, newCat === k && { backgroundColor: v.color, borderColor: v.color }]}><Text style={[styles.filterText, newCat === k && { color: "#001" }]}>{v.label}</Text></TouchableOpacity>)}</ScrollView><View style={styles.modalActions}><TouchableOpacity onPress={() => setProductModal(false)} style={styles.cancelBtn}><Text style={styles.filterText}>إلغاء</Text></TouchableOpacity><TouchableOpacity onPress={saveProduct} style={styles.saveBtn}>{loading ? <ActivityIndicator color="#001" /> : <Text style={styles.saveText}>حفظ</Text>}</TouchableOpacity></View></View></View></Modal>
      <InvoiceModal invoice={invoiceModal} onClose={() => setInvoiceModal(null)} />
    </View>
  );
}

function ProductCard({ item, business, onAdd, index }: { item: FoodProduct; business?: FoodBusiness; onAdd: () => void; index: number }) {
  const cat = CAT_META[item.category] || CAT_META.meals;
  return <Animated.View entering={FadeInDown.delay(60 + index * 35).springify()} style={styles.card}><View style={styles.productTop}>{imgOf(item) ? <Image source={{ uri: imgOf(item) }} style={styles.foodImg} /> : <View style={[styles.foodImg, { backgroundColor: cat.color + "22" }]}><MaterialCommunityIcons name={cat.icon as any} size={32} color={cat.color} /></View>}<View style={{ flex: 1 }}><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{business?.name || "مؤسسة"} · {cat.label} · {item.prep_minutes || 10} د</Text><Text style={styles.desc}>{item.description}</Text></View></View><View style={styles.actions}><Text style={[styles.price, { color: cat.color }]}>{fmt(item.price)}</Text><AnimatedPress onPress={onAdd}><View style={styles.callBtn}><Ionicons name="cart" size={16} color="#001" /><Text style={styles.callText}>إضافة</Text></View></AnimatedPress></View></Animated.View>;
}

function CartBox({ cart, subtotal, onDec, onCheckout }: { cart: CartItem[]; subtotal: number; onDec: (id: string | number) => void; onCheckout: (type?: any) => void }) {
  return <View style={styles.cartBox}><Text style={styles.sectionTitle}>سلة الكاشير</Text>{cart.length === 0 ? <Text style={styles.muted}>أضف منتجات للطلب</Text> : cart.map(i => <View key={String(i.product.id)} style={styles.cartLine}><Text style={styles.quickName}>{i.product.name}</Text><Text style={styles.muted}>× {i.qty}</Text><Text style={styles.quickPrice}>{fmt(i.product.price * i.qty)}</Text><TouchableOpacity onPress={() => onDec(i.product.id)}><Ionicons name="remove-circle" size={22} color="#EF4444" /></TouchableOpacity></View>)}<View style={styles.cartFooter}><Text style={styles.cartTitle}>الإجمالي</Text><Text style={styles.cartTotal}>{fmt(subtotal)}</Text></View><View style={styles.checkoutRow}><TouchableOpacity disabled={!cart.length} onPress={() => onCheckout("dine_in")} style={[styles.checkout, !cart.length && { opacity: .45 }]}><Text style={styles.checkoutText}>داخل المحل</Text></TouchableOpacity><TouchableOpacity disabled={!cart.length} onPress={() => onCheckout("takeaway")} style={[styles.checkout, !cart.length && { opacity: .45 }]}><Text style={styles.checkoutText}>استلام</Text></TouchableOpacity><TouchableOpacity disabled={!cart.length} onPress={() => onCheckout("delivery")} style={[styles.checkout, !cart.length && { opacity: .45 }]}><Text style={styles.checkoutText}>توصيل</Text></TouchableOpacity></View></View>;
}

function Kpi({ label, value }: { label: string; value: string }) { return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function Empty({ icon, text }: { icon: any; text: string }) { return <View style={styles.empty}><Ionicons name={icon} size={42} color={Colors.textMuted} /><Text style={styles.muted}>{text}</Text></View>; }
function InvoiceModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) { if (!invoice) return null; return <Modal visible transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBg}><View style={styles.modal}><Text style={styles.sectionTitle}>فاتورة {invoice.invoice_number}</Text>{invoice.items.map((it:any) => <View key={it.name} style={styles.cartLine}><Text style={styles.quickName}>{it.name}</Text><Text style={styles.muted}>× {it.qty}</Text><Text style={styles.quickPrice}>{fmt(it.price * it.qty)}</Text></View>)}<View style={styles.cartFooter}><Text style={styles.cartTitle}>الإجمالي</Text><Text style={styles.cartTotal}>{fmt(invoice.total)}</Text></View><TouchableOpacity onPress={onClose} style={styles.saveBtn}><Text style={styles.saveText}>إغلاق</Text></TouchableOpacity></View></View></Modal>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg }, hero: { paddingHorizontal: 20, paddingBottom: 28, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, alignItems: "center" }, heroIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: "#F9731630", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#F9731660", marginBottom: 14 }, title: { fontFamily: "Cairo_700Bold", fontSize: 25, color: Colors.textPrimary, textAlign: "center" }, subtitle: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", marginTop: 8, lineHeight: 22 }, body: { padding: 18, gap: 14 },
  tabs: { flexDirection: "row-reverse", gap: 8 }, tab: { flex: 1, minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 }, tabOn: { backgroundColor: Colors.primary, borderColor: Colors.primary }, tabText: { fontFamily: "Cairo_700Bold", color: Colors.textSecondary, fontSize: 11 },
  searchBox: { height: 48, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }, input: { flex: 1, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", textAlign: "right" }, filterRow: { gap: 8, paddingVertical: 2 }, filterChip: { flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 }, businessChip: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 }, businessChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary }, filterText: { fontFamily: "Cairo_600SemiBold", color: Colors.textSecondary, fontSize: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: 22, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12 }, productTop: { flexDirection: "row-reverse", gap: 12, alignItems: "center" }, foodImg: { width: 86, height: 86, borderRadius: 18, alignItems: "center", justifyContent: "center" }, name: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 16, textAlign: "right" }, meta: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 11, textAlign: "right", marginTop: 2 }, desc: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 12, textAlign: "right", marginTop: 4 }, actions: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 }, price: { fontFamily: "Cairo_700Bold", fontSize: 15 }, callBtn: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14 }, callText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 12 },
  cashierHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 12 }, sectionTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 17, textAlign: "right" }, muted: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 12, textAlign: "right" }, addBtn: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14 }, addText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 12 }, grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 }, quickItem: { width: "47%", borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 6 }, quickName: { flex: 1, fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right" }, quickPrice: { fontFamily: "Cairo_700Bold", color: Colors.primary },
  cartBox: { backgroundColor: Colors.surface, borderRadius: 22, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10 }, cartLine: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 7 }, cartFooter: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }, cartTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary }, cartTotal: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 16 }, checkoutRow: { flexDirection: "row-reverse", gap: 8 }, checkout: { backgroundColor: "#22C55E", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, alignItems: "center" }, checkoutText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 12 }, floatingCart: { position: "absolute", left: 14, right: 14, bottom: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  invoiceCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 18, padding: 14, gap: 5 }, invoiceNo: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right" }, invoiceMeta: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "right", fontSize: 12 }, invoiceTotal: { fontFamily: "Cairo_700Bold", color: Colors.primary, textAlign: "right" }, reportBtns: { flexDirection: "row-reverse", gap: 8 }, reportBtn: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingVertical: 10, alignItems: "center" }, reportBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary }, reportText: { fontFamily: "Cairo_700Bold", color: Colors.textSecondary }, reportCard: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 22, padding: 14, gap: 12 }, kpis: { flexDirection: "row-reverse", gap: 8 }, kpi: { flex: 1, backgroundColor: Colors.bgAlt, borderRadius: 14, padding: 10, alignItems: "center" }, kpiValue: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 14 }, topRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 6 }, empty: { alignItems: "center", justifyContent: "center", padding: 40, gap: 8 },
  modalBg: { flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }, modal: { backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 10, borderWidth: 1, borderColor: Colors.border, maxHeight: "88%" }, imagePick: { minHeight: 110, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed", backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", padding: 10 }, pickThumb: { width: 88, height: 88, borderRadius: 14 }, modalInput: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 12, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", textAlign: "right" }, modalActions: { flexDirection: "row-reverse", gap: 10 }, cancelBtn: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" }, saveBtn: { flex: 1, height: 46, borderRadius: 14, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" }, saveText: { fontFamily: "Cairo_700Bold", color: "#001" },
});
