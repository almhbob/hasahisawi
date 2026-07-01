import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Platform, Image, Modal, Alert, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import ModernHeader from "@/components/ui/ModernHeader";
import AnimatedPress from "@/components/AnimatedPress";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { uploadPostImage } from "@/lib/firebase/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

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
type Invoice = {
  id: string | number;
  invoice_number: string;
  total: number;
  paid_amount?: number;
  change_amount?: number;
  issued_at?: string;
  items: any[];
};
type Report = {
  period: string;
  summary: { invoice_count: number; sales_total: number; paid_total: number };
  top_products: Array<{ name: string; qty: number; total: number }>;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BUSINESSES_KEY = "food_pos_businesses_v1";
const PRODUCTS_KEY   = "food_pos_products_v1";
const INVOICES_KEY   = "food_pos_invoices_v1";

// All colors derived from the design system — no external hues
const TYPE_META = {
  restaurant: { label: "مطعم",           icon: "restaurant",  color: Colors.primary      },
  cafe:        { label: "كافتيريا",       icon: "cafe",        color: Colors.accent       },
  bakery:      { label: "مخبز وحلويات",  icon: "baguette",    color: Colors.accentDim    },
  juice:       { label: "عصائر ومثلجات", icon: "cup-water",   color: Colors.primaryLight },
} as const;

const CAT_META = {
  meals:   { label: "وجبات",     icon: "food",       color: Colors.primary      },
  drinks:  { label: "مشروبات",   icon: "cup",        color: Colors.primaryLight },
  dessert: { label: "حلويات",    icon: "cake-variant", color: Colors.accentDeep  },
  bakery:  { label: "مخبوزات",   icon: "baguette",   color: Colors.accentDim    },
  offers:  { label: "عروض",      icon: "tag-heart",  color: Colors.primaryDim   },
} as const;

const SEED_BUSINESSES: FoodBusiness[] = [
  { id: "r1", name: "مطعم النيل",       business_type: "restaurant", phone: "0912000001", address: "السوق الكبير",  description: "وجبات سودانية ومشاوي وطلبات عائلية", delivery_enabled: true,  takeaway_enabled: true, dine_in_enabled: true,  status: "approved" },
  { id: "r2", name: "كافتيريا الشباب", business_type: "cafe",       phone: "0912000002", address: "وسط المدينة",   description: "قهوة، شاي لبن، سندوتشات وجلسات",   delivery_enabled: false, takeaway_enabled: true, dine_in_enabled: true,  status: "approved" },
  { id: "r3", name: "مخبز البركة",     business_type: "bakery",     phone: "0912000003", address: "حي المزاد",     description: "مخبوزات وحلويات وطلبات مناسبات",   delivery_enabled: true,  takeaway_enabled: true, dine_in_enabled: false, status: "approved" },
];

const SEED_PRODUCTS: FoodProduct[] = [
  { id: "p1", business_id: "r1", name: "وجبة اليوم",      category: "meals",   description: "طبق رئيسي مع سلطة ومشروب",      price: 6500,  cost: 4200, stock: 30,  prep_minutes: 15, is_available: true },
  { id: "p2", business_id: "r1", name: "مشاوي مشكلة",    category: "meals",   description: "مشاوي طازجة مع خبز وسلطة",       price: 12500, cost: 8500, stock: 18,  prep_minutes: 25, is_available: true },
  { id: "p3", business_id: "r2", name: "قهوة سريعة",     category: "drinks",  description: "قهوة ساخنة جاهزة خلال دقائق",   price: 1200,  cost: 500,  stock: 100, prep_minutes: 3,  is_available: true },
  { id: "p4", business_id: "r2", name: "سندوتش دجاج",    category: "meals",   description: "سندوتش سريع للطلبات داخل المحل", price: 3500,  cost: 2100, stock: 40,  prep_minutes: 7,  is_available: true },
  { id: "p5", business_id: "r3", name: "بسبوسة",          category: "dessert", description: "قطعة بسبوسة طازجة",              price: 1800,  cost: 900,  stock: 60,  prep_minutes: 1,  is_available: true },
];

const fmt = (n: number) => `${Math.round(Number(n || 0)).toLocaleString("ar-SA")} ج.س`;
const imgOf = (p: FoodProduct) => p.images?.[0]?.image_url || p.images?.[0]?.url;

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RestaurantsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const apiUrl = getApiUrl();
  const { user } = useAuth();

  const [activeTab, setActiveTab]           = useState<"market" | "cashier" | "invoices" | "reports">("market");
  const [query, setQuery]                   = useState("");
  const [businessFilter, setBusinessFilter] = useState<"all" | FoodBusiness["business_type"]>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FoodProduct["category"]>("all");
  const [businesses, setBusinesses]         = useState<FoodBusiness[]>(SEED_BUSINESSES);
  const [products, setProducts]             = useState<FoodProduct[]>(SEED_PRODUCTS);
  const [cart, setCart]                     = useState<CartItem[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | number>("r1");
  const [invoices, setInvoices]             = useState<Invoice[]>([]);
  const [report, setReport]                 = useState<Report | null>(null);
  const [reportPeriod, setReportPeriod]     = useState<"day" | "month" | "year">("day");
  const [loading, setLoading]               = useState(false);
  const [productModal, setProductModal]     = useState(false);
  const [invoiceModal, setInvoiceModal]     = useState<Invoice | null>(null);

  const [newName,   setNewName]   = useState("");
  const [newPrice,  setNewPrice]  = useState("");
  const [newCost,   setNewCost]   = useState("");
  const [newStock,  setNewStock]  = useState("");
  const [newDesc,   setNewDesc]   = useState("");
  const [newCat,    setNewCat]    = useState<FoodProduct["category"]>("meals");
  const [newImages, setNewImages] = useState<string[]>([]);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { AsyncStorage.setItem(BUSINESSES_KEY, JSON.stringify(businesses)).catch(() => {}); }, [businesses]);
  useEffect(() => { AsyncStorage.setItem(PRODUCTS_KEY,   JSON.stringify(products)).catch(() => {}); }, [products]);
  useEffect(() => { AsyncStorage.setItem(INVOICES_KEY,   JSON.stringify(invoices)).catch(() => {}); }, [invoices]);

  async function loadAll() {
    setLoading(true);
    try {
      const [localB, localP, localI] = await Promise.all([
        AsyncStorage.getItem(BUSINESSES_KEY),
        AsyncStorage.getItem(PRODUCTS_KEY),
        AsyncStorage.getItem(INVOICES_KEY),
      ]);
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
        if (Array.isArray(j.products) && j.products.length)
          setProducts(j.products.map((p: any) => ({ ...p, price: Number(p.price || 0), cost: Number(p.cost || 0) })));
      }
    } catch {} finally { setLoading(false); }
  }

  const currentBusiness = businesses.find(b => String(b.id) === String(selectedBusinessId)) || businesses[0];

  const filteredProducts = useMemo(() => products.filter(p => {
    const business = businesses.find(b => String(b.id) === String(p.business_id));
    const q = query.trim();
    const byBusiness = businessFilter === "all" || business?.business_type === businessFilter;
    const byCat      = categoryFilter === "all" || p.category === categoryFilter;
    const byQ        = !q || p.name.includes(q) || p.description?.includes(q) || business?.name.includes(q);
    return p.is_available !== false && byBusiness && byCat && byQ;
  }), [products, businesses, query, businessFilter, categoryFilter]);

  const cashierProducts = useMemo(() =>
    products.filter(p => String(p.business_id) === String(selectedBusinessId) && p.is_available !== false),
    [products, selectedBusinessId],
  );

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const subtotal  = cart.reduce((sum, i) => sum + Number(i.product.price || 0) * i.qty, 0);

  function addToCart(product: FoodProduct) {
    setCart(prev => {
      const found = prev.find(x => String(x.product.id) === String(product.id));
      if (found) return prev.map(x => String(x.product.id) === String(product.id) ? { ...x, qty: x.qty + 1 } : x);
      return [...prev, { product, qty: 1 }];
    });
  }

  function dec(productId: string | number) {
    setCart(prev =>
      prev.map(x => String(x.product.id) === String(productId) ? { ...x, qty: x.qty - 1 } : x)
          .filter(x => x.qty > 0),
    );
  }

  async function pickProductImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return Alert.alert("إذن مطلوب", "اسمح للتطبيق بالوصول للصور");
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, selectionLimit: 5, quality: 0.85,
    });
    if (!pick.canceled) setNewImages(pick.assets.slice(0, 5).map(a => a.uri));
  }

  async function saveProduct() {
    if (!currentBusiness || !newName.trim() || !Number(newPrice))
      return Alert.alert("بيانات ناقصة", "أدخل اسم المنتج والسعر");
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
      name: newName.trim(), category: newCat,
      description: newDesc.trim(),
      price: Number(newPrice), cost: Number(newCost || 0),
      stock: Number(newStock || 0), prep_minutes: 10,
      is_available: true,
      images: imageUrls.map(url => ({ image_url: url, url })),
    };
    try {
      const res = await fetchWithTimeout(`${apiUrl}/api/food/products`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: currentBusiness.id, name: product.name, category: product.category,
          description: product.description, price: product.price, cost: product.cost,
          stock: product.stock, images: imageUrls,
        }),
      });
      if (res.ok) {
        const saved = await res.json();
        setProducts(prev => [{ ...product, ...saved, price: Number(saved.price || product.price), images: product.images }, ...prev]);
      } else {
        setProducts(prev => [product, ...prev]);
      }
    } catch { setProducts(prev => [product, ...prev]); }

    setNewName(""); setNewPrice(""); setNewCost(""); setNewStock("");
    setNewDesc(""); setNewImages([]); setProductModal(false); setLoading(false);
  }

  async function checkout(orderType: "takeaway" | "dine_in" | "delivery" = "takeaway") {
    if (!cart.length || !currentBusiness) return;
    const items = cart.map(i => ({ id: i.product.id, name: i.product.name, price: Number(i.product.price), qty: i.qty }));
    const localInvoice: Invoice = {
      id: Date.now(), invoice_number: `LOCAL-${Date.now()}`,
      total: subtotal, paid_amount: subtotal, change_amount: 0,
      issued_at: new Date().toISOString(), items,
    };
    try {
      const orderRes = await fetchWithTimeout(`${apiUrl}/api/food/orders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: currentBusiness.id, order_type: orderType, items, total: subtotal }),
      });
      let order: any = null;
      if (orderRes.ok) order = await orderRes.json();
      const invRes = await fetchWithTimeout(`${apiUrl}/api/food/invoices`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_id: currentBusiness.id, order_id: order?.id, items, paid_amount: subtotal, payment_method: "cash" }),
      });
      if (invRes.ok) {
        const inv = await invRes.json();
        localInvoice.id             = inv.id;
        localInvoice.invoice_number = inv.invoice_number;
        localInvoice.total          = Number(inv.total || subtotal);
        localInvoice.issued_at      = inv.issued_at;
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
        setReport({
          period,
          summary: { invoice_count: Number(j.summary?.invoice_count || 0), sales_total: Number(j.summary?.sales_total || 0), paid_total: Number(j.summary?.paid_total || 0) },
          top_products: j.top_products || [],
        });
        return;
      }
    } catch {}
    const now  = Date.now();
    const span = period === "year" ? 365 : period === "month" ? 30 : 1;
    const list = invoices.filter(i => now - new Date(i.issued_at || now).getTime() <= span * 86400000);
    const topMap = new Map<string, { name: string; qty: number; total: number }>();
    list.forEach(inv => (inv.items || []).forEach((it: any) => {
      const cur = topMap.get(it.name) || { name: it.name, qty: 0, total: 0 };
      cur.qty   += Number(it.qty || 1);
      cur.total += Number(it.price || 0) * Number(it.qty || 1);
      topMap.set(it.name, cur);
    }));
    setReport({
      period,
      summary: {
        invoice_count: list.length,
        sales_total:   list.reduce((s, i) => s + Number(i.total || 0), 0),
        paid_total:    list.reduce((s, i) => s + Number(i.paid_amount || i.total || 0), 0),
      },
      top_products: [...topMap.values()].sort((a, b) => b.total - a.total).slice(0, 10),
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>

        <ModernHeader
          title="المطاعم والكافتريات"
          subtitle="مؤسسات · منيو مصور · أسعار · سلة · كاشير · فواتير · تقارير"
          icon="restaurant-outline"
        >
          <View style={s.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              value={query} onChangeText={setQuery}
              placeholder="ابحث عن مطعم أو منتج..."
              placeholderTextColor={Colors.textMuted}
              style={s.searchInput}
            />
          </View>
        </ModernHeader>

        <View style={s.body}>

          {/* ── التبويبات الرئيسية ────────────────────────────────────────── */}
          <View style={s.tabs}>
            {([ ["market","السوق","storefront-outline"], ["cashier","الكاشير","calculator-outline"], ["invoices","الفواتير","receipt-outline"], ["reports","التقارير","bar-chart-outline"] ] as const).map(([key, label, icon]) => (
              <TouchableOpacity
                key={key}
                onPress={() => { setActiveTab(key); if (key === "reports") loadReport(reportPeriod); }}
                style={[s.tab, activeTab === key && s.tabOn]}
              >
                <Ionicons name={icon} size={16} color={activeTab === key ? Colors.white : Colors.textSecondary} />
                <Text style={[s.tabText, activeTab === key && s.tabTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── اختيار المحل (للكاشير والتقارير) ────────────────────────── */}
          {(activeTab === "cashier" || activeTab === "reports") && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              {businesses.map(b => (
                <TouchableOpacity
                  key={String(b.id)}
                  onPress={() => setSelectedBusinessId(b.id)}
                  style={[s.chip, String(selectedBusinessId) === String(b.id) && s.chipOn]}
                >
                  <Text style={[s.chipText, String(selectedBusinessId) === String(b.id) && s.chipTextOn]}>
                    {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* ══ السوق ════════════════════════════════════════════════════════ */}
          {activeTab === "market" && (
            <>
              {/* فلتر نوع المؤسسة */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                {(["all", "restaurant", "cafe", "bakery", "juice"] as const).map(key => {
                  const meta   = key === "all" ? { label: "الكل", color: Colors.primary, icon: "apps" } : TYPE_META[key];
                  const active = businessFilter === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setBusinessFilter(key)}
                      style={[s.filterChip, active && { borderColor: meta.color, backgroundColor: meta.color + "18" }]}
                    >
                      <MaterialCommunityIcons name={meta.icon as any} size={15} color={active ? meta.color : Colors.textMuted} />
                      <Text style={[s.filterText, active && { color: meta.color }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* فلتر الفئة */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                {(["all", "meals", "drinks", "dessert", "bakery", "offers"] as const).map(key => {
                  const meta   = key === "all" ? { label: "كل المنتجات", color: Colors.primary, icon: "apps" } : CAT_META[key];
                  const active = categoryFilter === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setCategoryFilter(key)}
                      style={[s.filterChip, active && { borderColor: meta.color, backgroundColor: meta.color + "18" }]}
                    >
                      <MaterialCommunityIcons name={meta.icon as any} size={15} color={active ? meta.color : Colors.textMuted} />
                      <Text style={[s.filterText, active && { color: meta.color }]}>{meta.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* قائمة المنتجات */}
              {filteredProducts.map((item, index) => (
                <ProductCard
                  key={String(item.id)}
                  item={item}
                  business={businesses.find(b => String(b.id) === String(item.business_id))}
                  onAdd={() => addToCart(item)}
                  index={index}
                />
              ))}
            </>
          )}

          {/* ══ الكاشير ══════════════════════════════════════════════════════ */}
          {activeTab === "cashier" && (
            <>
              <View style={s.sectionHead}>
                <View>
                  <Text style={s.sectionTitle}>كاشير {currentBusiness?.name}</Text>
                  <Text style={s.muted}>اختر المنتجات لتجهيز الطلبات داخل المحل بسرعة</Text>
                </View>
                <TouchableOpacity onPress={() => setProductModal(true)} style={s.primaryBtn}>
                  <Ionicons name="add" size={16} color={Colors.white} />
                  <Text style={s.primaryBtnText}>منتج</Text>
                </TouchableOpacity>
              </View>

              <View style={s.grid}>
                {cashierProducts.map(p => (
                  <TouchableOpacity key={String(p.id)} onPress={() => addToCart(p)} style={s.quickItem}>
                    <Text style={s.quickName}>{p.name}</Text>
                    <Text style={s.quickPrice}>{fmt(p.price)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <CartBox cart={cart} subtotal={subtotal} onDec={dec} onCheckout={checkout} />
            </>
          )}

          {/* ══ الفواتير ══════════════════════════════════════════════════════ */}
          {activeTab === "invoices" && (
            <>
              {invoices.length === 0
                ? <Empty icon="receipt-outline" text="لا توجد فواتير بعد" />
                : invoices.map(inv => (
                    <TouchableOpacity key={String(inv.id)} onPress={() => setInvoiceModal(inv)} style={s.invoiceCard}>
                      <Text style={s.invoiceNo}>{inv.invoice_number}</Text>
                      <Text style={s.invoiceMeta}>{new Date(inv.issued_at || Date.now()).toLocaleString("ar-SA")}</Text>
                      <Text style={s.invoiceTotal}>{fmt(inv.total)}</Text>
                    </TouchableOpacity>
                  ))
              }
            </>
          )}

          {/* ══ التقارير ══════════════════════════════════════════════════════ */}
          {activeTab === "reports" && (
            <>
              <View style={s.reportBtns}>
                {(["day", "month", "year"] as const).map(p => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => loadReport(p)}
                    style={[s.reportBtn, reportPeriod === p && s.reportBtnOn]}
                  >
                    <Text style={[s.reportBtnText, reportPeriod === p && s.reportBtnTextOn]}>
                      {p === "day" ? "اليوم" : p === "month" ? "الشهر" : "السنة"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {!report ? (
                <TouchableOpacity onPress={() => loadReport(reportPeriod)} style={s.primaryBtn}>
                  <Text style={s.primaryBtnText}>تحميل التقرير</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.reportCard}>
                  <Text style={s.sectionTitle}>
                    تقرير {reportPeriod === "day" ? "اليوم" : reportPeriod === "month" ? "الشهر" : "السنة"}
                  </Text>
                  <View style={s.kpis}>
                    <Kpi label="الفواتير"  value={String(report.summary.invoice_count)} />
                    <Kpi label="المبيعات"  value={fmt(report.summary.sales_total)}      />
                    <Kpi label="المحصّل"   value={fmt(report.summary.paid_total)}       />
                  </View>
                  <Text style={s.sectionTitle}>الأكثر مبيعًا</Text>
                  {report.top_products.length === 0
                    ? <Text style={s.muted}>لا توجد مبيعات في هذه الفترة</Text>
                    : report.top_products.map(x => (
                        <View key={x.name} style={s.topRow}>
                          <Text style={s.quickName}>{x.name}</Text>
                          <Text style={s.muted}>× {Number(x.qty).toLocaleString("ar-SA")}</Text>
                          <Text style={s.quickPrice}>{fmt(x.total)}</Text>
                        </View>
                      ))
                  }
                </View>
              )}
            </>
          )}

        </View>
      </ScrollView>

      {/* ── سلة عائمة (وضع السوق) ─────────────────────────────────────────── */}
      {cartCount > 0 && activeTab === "market" && (
        <View style={s.floatingCart}>
          <Text style={s.cartTitle}>السلة: {cartCount}</Text>
          <Text style={s.cartTotal}>{fmt(subtotal)}</Text>
          <TouchableOpacity onPress={() => checkout("takeaway")} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>إرسال الطلب</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── مودال إضافة منتج ──────────────────────────────────────────────── */}
      <Modal visible={productModal} transparent animationType="slide" onRequestClose={() => setProductModal(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={s.sectionTitle}>إضافة منتج للمحل</Text>

            <TouchableOpacity onPress={pickProductImages} style={s.imagePick}>
              {newImages.length
                ? <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                    {newImages.map((uri, i) => <Image key={uri + i} source={{ uri }} style={s.pickThumb} />)}
                  </ScrollView>
                : <>
                    <Ionicons name="images-outline" size={28} color={Colors.textMuted} />
                    <Text style={s.muted}>رفع صور المنتج حتى 5 صور</Text>
                  </>
              }
            </TouchableOpacity>

            <TextInput style={s.modalInput} value={newName}  onChangeText={setNewName}  placeholder="اسم المنتج"            placeholderTextColor={Colors.textMuted} />
            <TextInput style={s.modalInput} value={newPrice} onChangeText={setNewPrice} placeholder="السعر"                  placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
            <TextInput style={s.modalInput} value={newCost}  onChangeText={setNewCost}  placeholder="التكلفة (اختياري)"     placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
            <TextInput style={s.modalInput} value={newStock} onChangeText={setNewStock} placeholder="المخزون"                placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
            <TextInput style={[s.modalInput, { height: 76 }]} value={newDesc} onChangeText={setNewDesc} placeholder="وصف المنتج" placeholderTextColor={Colors.textMuted} multiline />

            <ScrollView horizontal contentContainerStyle={s.filterRow}>
              {Object.entries(CAT_META).map(([k, v]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setNewCat(k as any)}
                  style={[s.filterChip, newCat === k && { backgroundColor: v.color + "20", borderColor: v.color }]}
                >
                  <Text style={[s.filterText, newCat === k && { color: v.color }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => setProductModal(false)} style={s.cancelBtn}>
                <Text style={s.filterText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveProduct} style={s.primaryBtn}>
                {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={s.primaryBtnText}>حفظ</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <InvoiceModal invoice={invoiceModal} onClose={() => setInvoiceModal(null)} />
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProductCard({ item, business, onAdd, index }: {
  item: FoodProduct; business?: FoodBusiness; onAdd: () => void; index: number;
}) {
  const cat = CAT_META[item.category] || CAT_META.meals;
  return (
    <Animated.View entering={FadeInDown.delay(60 + index * 35).springify()} style={s.card}>
      <View style={s.productTop}>
        {imgOf(item)
          ? <Image source={{ uri: imgOf(item) }} style={s.foodImg} />
          : <View style={[s.foodImg, { backgroundColor: cat.color + "18" }]}>
              <MaterialCommunityIcons name={cat.icon as any} size={32} color={cat.color} />
            </View>
        }
        <View style={{ flex: 1 }}>
          <Text style={s.productName}>{item.name}</Text>
          <Text style={s.productMeta}>{business?.name || "مؤسسة"} · {cat.label} · {item.prep_minutes || 10} د</Text>
          <Text style={s.productDesc}>{item.description}</Text>
        </View>
      </View>
      <View style={s.productActions}>
        <Text style={[s.price, { color: cat.color }]}>{fmt(item.price)}</Text>
        <AnimatedPress onPress={onAdd}>
          <View style={s.addToCart}>
            <Ionicons name="cart" size={16} color={Colors.white} />
            <Text style={s.addToCartText}>إضافة</Text>
          </View>
        </AnimatedPress>
      </View>
    </Animated.View>
  );
}

function CartBox({ cart, subtotal, onDec, onCheckout }: {
  cart: CartItem[]; subtotal: number;
  onDec: (id: string | number) => void;
  onCheckout: (type?: any) => void;
}) {
  return (
    <View style={s.cartBox}>
      <Text style={s.sectionTitle}>سلة الكاشير</Text>
      {cart.length === 0
        ? <Text style={s.muted}>أضف منتجات للطلب</Text>
        : cart.map(i => (
            <View key={String(i.product.id)} style={s.cartLine}>
              <Text style={s.quickName}>{i.product.name}</Text>
              <Text style={s.muted}>× {i.qty}</Text>
              <Text style={s.quickPrice}>{fmt(i.product.price * i.qty)}</Text>
              <TouchableOpacity onPress={() => onDec(i.product.id)}>
                <Ionicons name="remove-circle" size={22} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          ))
      }
      <View style={s.cartFooter}>
        <Text style={s.cartTitle}>الإجمالي</Text>
        <Text style={s.cartTotal}>{fmt(subtotal)}</Text>
      </View>
      <View style={s.checkoutRow}>
        {[["dine_in","داخل المحل"], ["takeaway","استلام"], ["delivery","توصيل"]].map(([type, label]) => (
          <TouchableOpacity
            key={type}
            disabled={!cart.length}
            onPress={() => onCheckout(type)}
            style={[s.checkoutBtn, !cart.length && { opacity: 0.45 }]}
          >
            <Text style={s.checkoutBtnText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}

function Empty({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={42} color={Colors.textMuted} />
      <Text style={s.muted}>{text}</Text>
    </View>
  );
}

function InvoiceModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  if (!invoice) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBg}>
        <View style={s.modal}>
          <Text style={s.sectionTitle}>فاتورة {invoice.invoice_number}</Text>
          {invoice.items.map((it: any) => (
            <View key={it.name} style={s.cartLine}>
              <Text style={s.quickName}>{it.name}</Text>
              <Text style={s.muted}>× {it.qty}</Text>
              <Text style={s.quickPrice}>{fmt(it.price * it.qty)}</Text>
            </View>
          ))}
          <View style={s.cartFooter}>
            <Text style={s.cartTitle}>الإجمالي</Text>
            <Text style={s.cartTotal}>{fmt(invoice.total)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.primaryBtn}>
            <Text style={s.primaryBtnText}>إغلاق</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Layout
  container:  { flex: 1, backgroundColor: Colors.bg },
  body:       { padding: 18, gap: 14 },

  // Search
  searchBox:  { height: 48, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", textAlign: "right" },

  // Tabs
  tabs:        { flexDirection: "row-reverse", gap: 8 },
  tab:         { flex: 1, minHeight: 42, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, ...Colors.shadow.card },
  tabOn:       { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText:     { fontFamily: "Cairo_700Bold", color: Colors.textSecondary, fontSize: 11 },
  tabTextOn:   { color: Colors.white },

  // Filters
  filterRow:   { gap: 8, paddingVertical: 2 },
  filterChip:  { flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radius.pill },
  filterText:  { fontFamily: "Cairo_600SemiBold", color: Colors.textSecondary, fontSize: 12 },
  chip:        { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Colors.radius.pill },
  chipOn:      { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:    { fontFamily: "Cairo_600SemiBold", color: Colors.textSecondary, fontSize: 12 },
  chipTextOn:  { color: Colors.white },

  // Product card
  card:          { backgroundColor: Colors.surface, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12, ...Colors.shadow.card },
  productTop:    { flexDirection: "row-reverse", gap: 12, alignItems: "center" },
  foodImg:       { width: 86, height: 86, borderRadius: Colors.radius.lg, alignItems: "center", justifyContent: "center" },
  productName:   { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 16, textAlign: "right" },
  productMeta:   { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 11, textAlign: "right", marginTop: 2 },
  productDesc:   { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 12, textAlign: "right", marginTop: 4 },
  productActions: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  price:         { fontFamily: "Cairo_700Bold", fontSize: 15 },
  addToCart:     { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: Colors.radius.md },
  addToCartText: { fontFamily: "Cairo_700Bold", color: Colors.white, fontSize: 12 },

  // Cashier
  sectionHead:  { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sectionTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 17, textAlign: "right" },
  muted:        { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 12, textAlign: "right" },
  grid:         { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  quickItem:    { width: "47%", borderRadius: Colors.radius.md, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 6, ...Colors.shadow.card },
  quickName:    { flex: 1, fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right" },
  quickPrice:   { fontFamily: "Cairo_700Bold", color: Colors.primary },

  // Cart
  cartBox:      { backgroundColor: Colors.surface, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10, ...Colors.shadow.card },
  cartLine:     { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 7 },
  cartFooter:   { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingTop: 8 },
  cartTitle:    { fontFamily: "Cairo_700Bold", color: Colors.textPrimary },
  cartTotal:    { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 16 },
  checkoutRow:  { flexDirection: "row-reverse", gap: 8 },
  checkoutBtn:  { flex: 1, backgroundColor: Colors.primary, borderRadius: Colors.radius.sm, paddingVertical: 9, alignItems: "center" },
  checkoutBtnText: { fontFamily: "Cairo_700Bold", color: Colors.white, fontSize: 12 },

  // Floating cart
  floatingCart: { position: "absolute", left: 14, right: 14, bottom: 18, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Colors.radius.lg, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 10, ...Colors.shadow.raised },

  // Primary button (unified)
  primaryBtn:     { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Colors.radius.md },
  primaryBtnText: { fontFamily: "Cairo_700Bold", color: Colors.white, fontSize: 13 },

  // Invoices
  invoiceCard:  { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Colors.radius.lg, padding: 14, gap: 5, ...Colors.shadow.card },
  invoiceNo:    { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right" },
  invoiceMeta:  { fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "right", fontSize: 12 },
  invoiceTotal: { fontFamily: "Cairo_700Bold", color: Colors.primary, textAlign: "right" },

  // Reports
  reportBtns:     { flexDirection: "row-reverse", gap: 8 },
  reportBtn:      { flex: 1, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingVertical: 10, alignItems: "center" },
  reportBtnOn:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  reportBtnText:  { fontFamily: "Cairo_700Bold", color: Colors.textSecondary },
  reportBtnTextOn: { color: Colors.white },
  reportCard:     { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Colors.radius.lg, padding: 14, gap: 12, ...Colors.shadow.card },
  kpis:           { flexDirection: "row-reverse", gap: 8 },
  kpi:            { flex: 1, backgroundColor: Colors.bgAlt, borderRadius: Colors.radius.md, padding: 10, alignItems: "center" },
  kpiValue:       { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 14 },
  topRow:         { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 6 },

  // Empty
  empty: { alignItems: "center", justifyContent: "center", padding: 40, gap: 8 },

  // Modal
  modalBg:     { flex: 1, backgroundColor: Colors.overlay, justifyContent: "flex-end" },
  modal:       { backgroundColor: Colors.bg, borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, padding: 18, gap: 10, borderWidth: 1, borderColor: Colors.border, maxHeight: "88%" },
  imagePick:   { minHeight: 110, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed", backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", padding: 10 },
  pickThumb:   { width: 88, height: 88, borderRadius: Colors.radius.md },
  modalInput:  { minHeight: 46, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 12, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", textAlign: "right" },
  modalActions: { flexDirection: "row-reverse", gap: 10 },
  cancelBtn:   { flex: 1, height: 46, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface },
});
