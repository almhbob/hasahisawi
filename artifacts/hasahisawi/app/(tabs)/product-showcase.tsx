import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Linking, Platform, Image, Modal, Alert } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import ModernHeader from "@/components/ui/ModernHeader";
import AnimatedPress from "@/components/AnimatedPress";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl, fetchWithTimeout } from "@/lib/query-client";
import { uploadMarketImage } from "@/lib/firebase/storage";

type RetailCategory = "clothing" | "perfume" | "shoes" | "boutique" | "accessories" | "women";
type MerchantStatus = "pending" | "approved";

type Merchant = {
  id: string;
  shopName: string;
  ownerName: string;
  category: RetailCategory;
  phone: string;
  address: string;
  description: string;
  status: MerchantStatus;
  createdAt: string;
};

type Product = {
  id: string;
  merchantId: string;
  name: string;
  category: RetailCategory;
  price: number;
  oldPrice?: number;
  description: string;
  imageUri?: string;
  stock: number;
  isAvailable: boolean;
  createdAt: string;
};

type CartItem = { productId: string; qty: number };

const MERCHANTS_KEY = "retail_merchants_v1";
const PRODUCTS_KEY = "retail_products_v1";
const CART_KEY = "retail_cart_v1";

function normalizeGender(value: unknown): "male" | "female" | null {
  const g = String(value ?? "").trim().toLowerCase();
  if (["male", "m", "man", "ذكر", "رجل", "ولد"].includes(g)) return "male";
  if (["female", "f", "woman", "أنثى", "انثى", "امرأة", "امراة", "بنت"].includes(g)) return "female";
  return null;
}

const CATEGORIES: { key: "all" | RetailCategory; label: string; icon: string; color: string; womenOnly?: boolean }[] = [
  { key: "all", label: "الكل", icon: "apps", color: Colors.primary },
  { key: "women", label: "القسم النسائي", icon: "face-woman", color: "#EC4899", womenOnly: true },
  { key: "clothing", label: "ملابس", icon: "tshirt-crew-outline", color: "#EC4899" },
  { key: "perfume", label: "عطور", icon: "spray-bottle", color: "#A855F7" },
  { key: "shoes", label: "أحذية", icon: "shoe-sneaker", color: "#F97316" },
  { key: "boutique", label: "بوتيكات", icon: "storefront-outline", color: "#14B8A6" },
  { key: "accessories", label: "إكسسوارات", icon: "watch-variant", color: "#FBBF24" },
];

const SEED_MERCHANTS: Merchant[] = [
  { id: "m1", shopName: "بوتيك الأناقة", ownerName: "إدارة البوتيك", category: "boutique", phone: "0914000001", address: "السوق الكبير", description: "ملابس وإكسسوارات مختارة للنساء والرجال والأطفال", status: "approved", createdAt: new Date().toISOString() },
  { id: "m2", shopName: "عطور النيل", ownerName: "قسم العطور", category: "perfume", phone: "0914000002", address: "شارع المستشفى", description: "عطور فرنسية وشرقية وتركيبات خاصة", status: "approved", createdAt: new Date().toISOString() },
  { id: "m3", shopName: "أحذية المدينة", ownerName: "إدارة المتجر", category: "shoes", phone: "0914000003", address: "وسط الحصاحيصا", description: "أحذية رجالية ونسائية ورياضية", status: "approved", createdAt: new Date().toISOString() },
  { id: "m4", shopName: "مستلزمات المرأة", ownerName: "قسم النساء", category: "women", phone: "0914000004", address: "قسم خاص", description: "منتجات ومستلزمات نسائية تظهر للنساء والإدارة فقط", status: "approved", createdAt: new Date().toISOString() },
];

const SEED_PRODUCTS: Product[] = [
  { id: "p1", merchantId: "m1", name: "طقم خروج عصري", category: "clothing", price: 28000, oldPrice: 32000, description: "قماش مريح، مقاسات متعددة، ألوان موسمية", stock: 8, isAvailable: true, createdAt: new Date().toISOString() },
  { id: "p2", merchantId: "m2", name: "عطر شرقي فاخر", category: "perfume", price: 15000, description: "ثبات عالي وحجم مناسب للهدايا", stock: 12, isAvailable: true, createdAt: new Date().toISOString() },
  { id: "p3", merchantId: "m3", name: "حذاء رياضي خفيف", category: "shoes", price: 22000, oldPrice: 26000, description: "نعل مريح ومناسب للمشي اليومي", stock: 6, isAvailable: true, createdAt: new Date().toISOString() },
  { id: "p4", merchantId: "m4", name: "مستلزمات نسائية أساسية", category: "women", price: 9500, description: "قسم خاص بالنساء: مستلزمات شخصية ومنتجات عناية مختارة", stock: 20, isAvailable: true, createdAt: new Date().toISOString() },
];

function formatPrice(v: number) {
  return `${Math.round(v).toLocaleString("ar-SA")} ج.س`;
}

function apiNumId(id: string): number | null {
  return id.startsWith("api-") ? Number(id.slice(4)) || null : null;
}

export default function ProductShowcaseScreen() {
  const { user } = useAuth();
  const gender = normalizeGender(user?.gender);
  const canSeeWomenStore = user?.role === "admin" || gender === "female";

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | RetailCategory>("all");
  const [merchants, setMerchants] = useState<Merchant[]>(SEED_MERCHANTS);
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [joinOpen, setJoinOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [merchantCat, setMerchantCat] = useState<RetailCategory>("boutique");

  const [selectedMerchantId, setSelectedMerchantId] = useState("m1");
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [productStock, setProductStock] = useState("1");
  const [imageUri, setImageUri] = useState<string | undefined>();

  const [deliveryName, setDeliveryName] = useState(user?.name || "");
  const [deliveryPhone, setDeliveryPhone] = useState(user?.phone || "");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");

  const visibleCategories = useMemo(
    () => CATEGORIES.filter(c => !c.womenOnly || canSeeWomenStore),
    [canSeeWomenStore],
  );

  const approvedMerchants = useMemo(
    () => merchants.filter(m => m.status === "approved" && (m.category !== "women" || canSeeWomenStore)),
    [merchants, canSeeWomenStore],
  );

  useEffect(() => {
    (async () => {
      const [m, p, c] = await Promise.all([
        AsyncStorage.getItem(MERCHANTS_KEY), AsyncStorage.getItem(PRODUCTS_KEY), AsyncStorage.getItem(CART_KEY),
      ]);
      if (m) setMerchants(JSON.parse(m));
      if (p) setProducts(JSON.parse(p));
      if (c) setCart(JSON.parse(c));
    })().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/merchants`, {}, 12000).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : data.merchants ?? [];
      const apiMerchants: Merchant[] = list.map((m: any) => ({
        id: `api-${m.id}`,
        shopName: String(m.shop_name || ""),
        ownerName: String(m.owner_name || ""),
        category: (m.category || "boutique") as RetailCategory,
        phone: String(m.phone || m.whatsapp || ""),
        address: String(m.address || ""),
        description: String(m.description || ""),
        status: "approved",
        createdAt: m.created_at || new Date().toISOString(),
      }));
      if (!apiMerchants.length) return;
      setMerchants(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        return [...prev, ...apiMerchants.filter(m => !existingIds.has(m.id))];
      });
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/merchant-products`, {}, 12000).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : data.products ?? [];
      const apiProducts: Product[] = list.map((p: any) => ({
        id: `api-${p.id}`,
        merchantId: `api-${p.merchant_id}`,
        name: String(p.name || ""),
        category: (p.category || "boutique") as RetailCategory,
        price: Number(p.price || 0),
        oldPrice: p.old_price ? Number(p.old_price) : undefined,
        description: String(p.description || ""),
        imageUri: Array.isArray(p.images) && p.images[0]?.image_url ? p.images[0].image_url : undefined,
        stock: Number(p.stock || 0),
        isAvailable: !!p.is_available,
        createdAt: p.created_at || new Date().toISOString(),
      }));
      if (!apiProducts.length) return;
      setProducts(prev => {
        const existingIds = new Set(prev.map(x => x.id));
        return [...prev, ...apiProducts.filter(x => !existingIds.has(x.id))];
      });
    })();
  }, []);

  useEffect(() => { AsyncStorage.setItem(MERCHANTS_KEY, JSON.stringify(merchants)).catch(() => {}); }, [merchants]);
  useEffect(() => { AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products)).catch(() => {}); }, [products]);
  useEffect(() => { AsyncStorage.setItem(CART_KEY, JSON.stringify(cart)).catch(() => {}); }, [cart]);

  const filtered = useMemo(() => products.filter(item => {
    if (item.category === "women" && !canSeeWomenStore) return false;
    const merchant = merchants.find(m => m.id === item.merchantId);
    if (merchant?.status !== "approved") return false;
    const byCat = category === "all" || item.category === category;
    const q = query.trim();
    const byQuery = !q || item.name.includes(q) || item.description.includes(q) || merchant?.shopName.includes(q);
    return item.isAvailable && byCat && byQuery;
  }), [products, merchants, query, category, canSeeWomenStore]);

  const cartDetails = useMemo(() => cart.map(ci => {
    const product = products.find(p => p.id === ci.productId);
    if (!product || (product.category === "women" && !canSeeWomenStore)) return null;
    return { ...ci, product };
  }).filter(Boolean) as Array<CartItem & { product: Product }>, [cart, products, canSeeWomenStore]);
  const cartTotal = cartDetails.reduce((sum, x) => sum + x.product.price * x.qty, 0);
  const cartCount = cartDetails.reduce((sum, x) => sum + x.qty, 0);

  async function addMerchant() {
    if (!shopName.trim() || !ownerName.trim() || !phone.trim()) return Alert.alert("بيانات ناقصة", "أدخل اسم المحل، المسؤول، ورقم الهاتف");
    try {
      const res = await fetchWithTimeout(`${getApiUrl()}/api/merchants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_name: shopName.trim(),
          owner_name: ownerName.trim(),
          category: merchantCat,
          phone: phone.trim(),
          address: address.trim(),
          description: "متجر جديد قيد الاعتماد داخل سوق حصاحيصاوي",
        }),
      }, 12000);
      if (!res.ok) throw new Error("request_failed");
    } catch {
      return Alert.alert("تعذر إرسال الطلب", "تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    }
    setShopName(""); setOwnerName(""); setPhone(""); setAddress(""); setJoinOpen(false);
    Alert.alert("تم إرسال الطلب", "سيظهر المتجر في السوق بعد اعتماده من الإدارة.");
  }

  async function pickImage() {
    const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (res.status !== "granted") return Alert.alert("إذن مطلوب", "يجب السماح بالوصول للصور لرفع صورة المنتج");
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.85 });
    if (!pick.canceled && pick.assets[0]) setImageUri(pick.assets[0].uri);
  }

  async function addProduct() {
    const merchant = merchants.find(m => m.id === selectedMerchantId);
    const merchantNumId = merchant ? apiNumId(merchant.id) : null;
    const price = Number(productPrice.replace(/,/g, ""));
    const stock = Number(productStock || "1");
    if (!merchant || !productName.trim() || !price || price <= 0) return Alert.alert("بيانات ناقصة", "اختر المتجر وأدخل اسم المنتج والسعر");
    if (!merchantNumId) return Alert.alert("متجر غير صالح", "اختر متجراً معتمداً فعلياً من القائمة لإضافة منتج له");
    try {
      let hostedImageUri = imageUri;
      if (imageUri) hostedImageUri = await uploadMarketImage("products", imageUri).catch(() => imageUri);
      const res = await fetchWithTimeout(`${getApiUrl()}/api/merchant-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: merchantNumId,
          name: productName.trim(),
          category: merchant.category,
          description: productDesc.trim() || "منتج من متجر معتمد في السوق",
          price, stock: Math.max(1, stock),
          images: hostedImageUri ? [hostedImageUri] : [],
        }),
      }, 12000);
      if (!res.ok) throw new Error("request_failed");
      const saved = await res.json();
      const item: Product = {
        id: `api-${saved.id}`, merchantId: merchant.id, name: saved.name, category: merchant.category,
        price: Number(saved.price), description: saved.description || "", imageUri: hostedImageUri,
        stock: Number(saved.stock), isAvailable: true, createdAt: saved.created_at || new Date().toISOString(),
      };
      setProducts(prev => [item, ...prev]);
    } catch {
      return Alert.alert("تعذر حفظ المنتج", "تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    }
    setProductName(""); setProductPrice(""); setProductDesc(""); setProductStock("1"); setImageUri(undefined); setProductOpen(false);
  }

  function updatePrice(product: Product) {
    const numId = apiNumId(product.id);
    const applyNext = (next: number) => {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, oldPrice: p.price, price: next } : p));
      if (numId) {
        fetchWithTimeout(`${getApiUrl()}/api/merchant-products/${numId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ price: next, old_price: product.price }),
        }, 12000).catch(() => {});
      }
    };
    if (Platform.OS === "ios" && Alert.prompt) {
      Alert.prompt("تعديل السعر", "أدخل السعر الجديد بالجنيه السوداني", value => {
        const next = Number(String(value || "").replace(/,/g, ""));
        if (next > 0) applyNext(next);
      }, "plain-text", String(product.price));
      return;
    }
    const next = product.price + 1000;
    applyNext(next);
    Alert.alert("تم تحديث السعر", `تم رفع السعر إلى ${formatPrice(next)}.`);
  }

  function addToCart(product: Product) {
    setCart(prev => {
      const found = prev.find(x => x.productId === product.id);
      if (found) return prev.map(x => x.productId === product.id ? { ...x, qty: Math.min(product.stock, x.qty + 1) } : x);
      return [...prev, { productId: product.id, qty: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart(prev => prev.map(x => x.productId === productId ? { ...x, qty: Math.max(1, x.qty + delta) } : x));
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(x => x.productId !== productId));
  }

  function clearCart() {
    if (!cartDetails.length) return;
    Alert.alert("تفريغ السلة", "هل تريد حذف جميع المنتجات من السلة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "تفريغ", style: "destructive", onPress: () => setCart([]) },
    ]);
  }

  function checkout() {
    if (!cartDetails.length) return;
    setCheckoutOpen(true);
  }

  async function submitCheckout() {
    if (!deliveryName.trim() || !deliveryPhone.trim() || !deliveryAddress.trim()) {
      return Alert.alert("بيانات التوصيل ناقصة", "أدخل الاسم، الهاتف، ومكان التوصيل");
    }
    const firstMerchant = merchants.find(m => m.id === cartDetails[0].product.merchantId);
    const merchantNumId = firstMerchant ? apiNumId(firstMerchant.id) : null;
    try {
      await fetchWithTimeout(`${getApiUrl()}/api/marketplace-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: merchantNumId,
          customer_name: deliveryName.trim(),
          customer_phone: deliveryPhone.trim(),
          total: cartTotal,
          items: cartDetails.map(x => ({ product_id: x.productId, name: x.product.name, price: x.product.price, qty: x.qty })),
          notes: `التوصيل إلى: ${deliveryAddress.trim()}${deliveryNote.trim() ? ` — ${deliveryNote.trim()}` : ""}`,
        }),
      }, 12000);
    } catch {}
    const text = cartDetails.map(x => `- ${x.product.name} × ${x.qty} = ${formatPrice(x.product.price * x.qty)}`).join("%0A");
    const phone = firstMerchant?.phone || "0914000001";
    const msg = `طلب من سوق حصاحيصاوي:%0A${text}%0Aالإجمالي: ${formatPrice(cartTotal)}%0Aطريقة الدفع: الدفع عند الاستلام%0Aالاسم: ${deliveryName}%0Aالهاتف: ${deliveryPhone}%0Aالتوصيل إلى: ${deliveryAddress}%0Aملاحظات: ${deliveryNote || "لا توجد"}`;
    Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${msg}`).catch(() => {});
    setCheckoutOpen(false);
    setCart([]);
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <ModernHeader
          title="سوق المتاجر والبوتيكات"
          subtitle="ملابس · عطور · أحذية · بوتيكات · قسم نسائي — سلة شراء وتوصيل ودفع عند الاستلام"
          icon="storefront-outline"
        />

        <View style={styles.body}>
          <View style={styles.actionsRow}>
            <TouchableOpacity onPress={() => setJoinOpen(true)} style={styles.primaryBtn}><Text style={styles.primaryText}>انضم كتاجر</Text><Ionicons name="business-outline" size={16} color="#001" /></TouchableOpacity>
            <TouchableOpacity onPress={() => setProductOpen(true)} style={styles.secondaryBtn}><Text style={styles.secondaryText}>إضافة منتج</Text><Ionicons name="cloud-upload-outline" size={16} color={Colors.primary} /></TouchableOpacity>
          </View>

          <View style={styles.cartBar}>
            <Text style={styles.cartTitle}>السلة: {cartCount} منتج</Text>
            <Text style={styles.cartTotal}>{formatPrice(cartTotal)}</Text>
            <TouchableOpacity onPress={clearCart} style={[styles.clearBtn, !cartCount && { opacity: 0.35 }]} disabled={!cartCount}><Text style={styles.clearText}>تفريغ</Text></TouchableOpacity>
            <TouchableOpacity onPress={checkout} style={[styles.checkoutBtn, !cartCount && { opacity: 0.4 }]} disabled={!cartCount}><Text style={styles.checkoutText}>إتمام الطلب</Text></TouchableOpacity>
          </View>

          {cartDetails.length ? <View style={styles.cartList}>
            {cartDetails.map(x => <View key={x.productId} style={styles.cartItem}>
              <TouchableOpacity onPress={() => removeFromCart(x.productId)} style={styles.removeBtn}><Ionicons name="trash-outline" size={16} color="#fff" /></TouchableOpacity>
              <View style={{ flex: 1 }}><Text style={styles.cartItemName}>{x.product.name}</Text><Text style={styles.cartItemSub}>{formatPrice(x.product.price * x.qty)}</Text></View>
              <View style={styles.qtyBox}><TouchableOpacity onPress={() => changeQty(x.productId, -1)}><Text style={styles.qtyBtn}>−</Text></TouchableOpacity><Text style={styles.qtyText}>{x.qty}</Text><TouchableOpacity onPress={() => changeQty(x.productId, 1)}><Text style={styles.qtyBtn}>+</Text></TouchableOpacity></View>
            </View>)}
          </View> : null}

          <View style={styles.searchBox}><Ionicons name="search" size={18} color={Colors.textMuted} /><TextInput value={query} onChangeText={setQuery} placeholder="ابحث عن منتج أو متجر..." placeholderTextColor={Colors.textMuted} style={styles.input} /></View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {visibleCategories.map(cat => {
              const active = category === cat.key;
              return <TouchableOpacity key={cat.key} onPress={() => setCategory(cat.key)} style={[styles.categoryChip, active && { backgroundColor: cat.color, borderColor: cat.color }]}>
                <MaterialCommunityIcons name={cat.icon as any} size={15} color={active ? "#001" : cat.color} />
                <Text style={[styles.categoryText, active && { color: "#001" }]}>{cat.label}</Text>
              </TouchableOpacity>;
            })}
          </ScrollView>

          <Text style={styles.sectionTitle}>المتاجر المعتمدة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.merchantRow}>
            {approvedMerchants.map(m => {
              const meta = CATEGORIES.find(c => c.key === m.category) || CATEGORIES[0];
              return <View key={m.id} style={styles.merchantCard}><MaterialCommunityIcons name={meta.icon as any} size={25} color={meta.color} /><Text style={styles.merchantName}>{m.shopName}</Text><Text style={styles.merchantMeta}>{meta.label} · {m.address}</Text></View>;
            })}
          </ScrollView>

          <Text style={styles.sectionTitle}>معرض المنتجات</Text>
          {filtered.map((item, index) => {
            const merchant = merchants.find(m => m.id === item.merchantId);
            const cat = CATEGORIES.find(c => c.key === item.category) || CATEGORIES[0];
            return <Animated.View key={item.id} entering={FadeInDown.delay(70 + index * 45).springify()} style={styles.productCard}>
              <LinearGradient colors={[cat.color + "22", Colors.surface]} style={styles.productVisual}>{item.imageUri ? <Image source={{ uri: item.imageUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" /> : <MaterialCommunityIcons name={cat.icon as any} size={46} color={cat.color} />}<View style={[styles.badge, { backgroundColor: cat.color }]}><Text style={styles.badgeText}>{cat.label}</Text></View></LinearGradient>
              <View style={styles.productInfo}><Text style={styles.productName}>{item.name}</Text><Text style={styles.seller}>{merchant?.shopName || "متجر"} · المخزون {item.stock}</Text><Text style={styles.desc}>{item.description}</Text><View style={styles.bottomRow}><View><Text style={[styles.price, { color: cat.color }]}>{formatPrice(item.price)}</Text>{item.oldPrice ? <Text style={styles.oldPrice}>{formatPrice(item.oldPrice)}</Text> : null}</View><View style={styles.productActions}><AnimatedPress onPress={() => updatePrice(item)}><View style={styles.editBtn}><Ionicons name="create-outline" size={16} color={Colors.primary} /></View></AnimatedPress><AnimatedPress onPress={() => addToCart(item)}><View style={styles.cartBtn}><Ionicons name="cart" size={16} color="#001" /></View></AnimatedPress></View></View></View>
            </Animated.View>;
          })}
        </View>
      </ScrollView>

      <Modal visible={checkoutOpen} transparent animationType="slide" onRequestClose={() => setCheckoutOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>بيانات التوصيل والدفع</Text>
          <Text style={styles.payNote}>طريقة الدفع: الدفع عند الاستلام</Text>
          <TextInput style={styles.modalInput} value={deliveryName} onChangeText={setDeliveryName} placeholder="اسم المستلم" placeholderTextColor={Colors.textMuted} />
          <TextInput style={styles.modalInput} value={deliveryPhone} onChangeText={setDeliveryPhone} placeholder="رقم الهاتف" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
          <TextInput style={[styles.modalInput, { height: 74 }]} value={deliveryAddress} onChangeText={setDeliveryAddress} placeholder="مكان التوصيل بالتفصيل" placeholderTextColor={Colors.textMuted} multiline />
          <TextInput style={[styles.modalInput, { height: 64 }]} value={deliveryNote} onChangeText={setDeliveryNote} placeholder="ملاحظة اختيارية" placeholderTextColor={Colors.textMuted} multiline />
          <View style={styles.modalActions}><TouchableOpacity onPress={() => setCheckoutOpen(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>إلغاء</Text></TouchableOpacity><TouchableOpacity onPress={submitCheckout} style={styles.saveBtn}><Text style={styles.saveText}>إرسال الطلب</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={joinOpen} transparent animationType="slide" onRequestClose={() => setJoinOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>طلب انضمام متجر</Text>
          <TextInput style={styles.modalInput} value={shopName} onChangeText={setShopName} placeholder="اسم المحل / البوتيك" placeholderTextColor={Colors.textMuted} />
          <TextInput style={styles.modalInput} value={ownerName} onChangeText={setOwnerName} placeholder="اسم المسؤول" placeholderTextColor={Colors.textMuted} />
          <TextInput style={styles.modalInput} value={phone} onChangeText={setPhone} placeholder="رقم الهاتف" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" />
          <TextInput style={styles.modalInput} value={address} onChangeText={setAddress} placeholder="العنوان" placeholderTextColor={Colors.textMuted} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{visibleCategories.filter(c => c.key !== "all").map(c => <TouchableOpacity key={c.key} onPress={() => setMerchantCat(c.key as RetailCategory)} style={[styles.categoryChip, merchantCat === c.key && { backgroundColor: c.color, borderColor: c.color }]}><Text style={[styles.categoryText, merchantCat === c.key && { color: "#001" }]}>{c.label}</Text></TouchableOpacity>)}</ScrollView>
          <View style={styles.modalActions}><TouchableOpacity onPress={() => setJoinOpen(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>إلغاء</Text></TouchableOpacity><TouchableOpacity onPress={addMerchant} style={styles.saveBtn}><Text style={styles.saveText}>إرسال الطلب</Text></TouchableOpacity></View>
        </View></View>
      </Modal>

      <Modal visible={productOpen} transparent animationType="slide" onRequestClose={() => setProductOpen(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>إضافة منتج للتاجر</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{approvedMerchants.map(m => <TouchableOpacity key={m.id} onPress={() => setSelectedMerchantId(m.id)} style={[styles.categoryChip, selectedMerchantId === m.id && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}><Text style={[styles.categoryText, selectedMerchantId === m.id && { color: "#001" }]}>{m.shopName}</Text></TouchableOpacity>)}</ScrollView>
          <TouchableOpacity onPress={pickImage} style={styles.imagePick}>{imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} /> : <><Ionicons name="image-outline" size={26} color={Colors.textMuted} /><Text style={styles.imagePickText}>رفع صورة المنتج</Text></>}</TouchableOpacity>
          <TextInput style={styles.modalInput} value={productName} onChangeText={setProductName} placeholder="اسم المنتج" placeholderTextColor={Colors.textMuted} />
          <TextInput style={styles.modalInput} value={productPrice} onChangeText={setProductPrice} placeholder="السعر" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
          <TextInput style={styles.modalInput} value={productStock} onChangeText={setProductStock} placeholder="الكمية" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
          <TextInput style={[styles.modalInput, { height: 74 }]} value={productDesc} onChangeText={setProductDesc} placeholder="وصف المنتج" placeholderTextColor={Colors.textMuted} multiline />
          <View style={styles.modalActions}><TouchableOpacity onPress={() => setProductOpen(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>إلغاء</Text></TouchableOpacity><TouchableOpacity onPress={addProduct} style={styles.saveBtn}><Text style={styles.saveText}>حفظ المنتج</Text></TouchableOpacity></View>
        </View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  body: { padding: 18, gap: 14 },
  actionsRow: { flexDirection: "row-reverse", gap: 10 },
  primaryBtn: { flex: 1, height: 46, borderRadius: Colors.radius.md, backgroundColor: Colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  primaryText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 13 },
  secondaryBtn: { flex: 1, height: 46, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  secondaryText: { fontFamily: "Cairo_700Bold", color: Colors.primary, fontSize: 13 },
  cartBar: { borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, padding: 12, flexDirection: "row-reverse", alignItems: "center", gap: 8, flexWrap: "wrap", ...Colors.shadow.card },
  cartTitle: { flex: 1, fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right" },
  cartTotal: { fontFamily: "Cairo_700Bold", color: Colors.primary },
  checkoutBtn: { backgroundColor: "#14B8A6", borderRadius: Colors.radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  checkoutText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 12 },
  clearBtn: { backgroundColor: "#EF4444", borderRadius: Colors.radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  clearText: { fontFamily: "Cairo_700Bold", color: "#fff", fontSize: 12 },
  cartList: { borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, padding: 10, gap: 8, ...Colors.shadow.card },
  cartItem: { flexDirection: "row-reverse", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8 },
  removeBtn: { width: 34, height: 34, borderRadius: Colors.radius.sm, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center" },
  cartItemName: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, textAlign: "right" },
  cartItemSub: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, textAlign: "right", fontSize: 11 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.bg, borderRadius: Colors.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  qtyBtn: { color: Colors.primary, fontFamily: "Cairo_700Bold", fontSize: 18 },
  qtyText: { color: Colors.textPrimary, fontFamily: "Cairo_700Bold" },
  searchBox: { height: 48, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", textAlign: "right" },
  categoryRow: { gap: 8, paddingVertical: 2 },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, borderRadius: Colors.radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  categoryText: { fontFamily: "Cairo_600SemiBold", color: Colors.textSecondary, fontSize: 12 },
  sectionTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 17, textAlign: "right" },
  merchantRow: { gap: 10 },
  merchantCard: { width: 150, minHeight: 112, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, padding: 12, alignItems: "center", justifyContent: "center", ...Colors.shadow.card },
  merchantName: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 13, textAlign: "center", marginTop: 6 },
  merchantMeta: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 10, textAlign: "center", marginTop: 3 },
  productCard: { borderRadius: Colors.radius.xl, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, ...Colors.shadow.card },
  productVisual: { height: 160, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 12, right: 12, borderRadius: Colors.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontFamily: "Cairo_700Bold", color: "#001", fontSize: 11 },
  productInfo: { padding: 14, gap: 7 },
  productName: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 17, textAlign: "right" },
  seller: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, fontSize: 12, textAlign: "right" },
  desc: { fontFamily: "Cairo_400Regular", color: Colors.textSecondary, fontSize: 12, textAlign: "right", lineHeight: 20 },
  bottomRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  price: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" },
  oldPrice: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, textDecorationLine: "line-through", fontSize: 11, textAlign: "right" },
  productActions: { flexDirection: "row", gap: 8 },
  editBtn: { width: 42, height: 42, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  cartBtn: { width: 42, height: 42, borderRadius: Colors.radius.md, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "#0008", justifyContent: "flex-end" },
  modalCard: { backgroundColor: Colors.bg, borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, padding: 18, gap: 10, borderWidth: 1, borderColor: Colors.border },
  modalTitle: { fontFamily: "Cairo_700Bold", color: Colors.textPrimary, fontSize: 18, textAlign: "right" },
  payNote: { fontFamily: "Cairo_700Bold", color: Colors.accent, textAlign: "right", marginBottom: 4 },
  modalInput: { minHeight: 46, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, paddingHorizontal: 12, color: Colors.textPrimary, fontFamily: "Cairo_400Regular", textAlign: "right" },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, height: 46, borderRadius: Colors.radius.md, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  cancelText: { fontFamily: "Cairo_700Bold", color: Colors.textSecondary },
  saveBtn: { flex: 1, height: 46, borderRadius: Colors.radius.md, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
  saveText: { fontFamily: "Cairo_700Bold", color: "#001" },
  imagePick: { height: 110, borderRadius: Colors.radius.lg, borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed", backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imagePickText: { fontFamily: "Cairo_400Regular", color: Colors.textMuted, marginTop: 6 },
  preview: { width: "100%", height: "100%" },
});
