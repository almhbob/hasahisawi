import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Linking, Platform, Alert,
  Modal, ActivityIndicator, KeyboardAvoidingView, Keyboard, Image,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import AnimatedPress from "@/components/AnimatedPress";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import OrgInviteCard from "@/components/OrgInviteCard";
import ModernHeader from "@/components/ui/ModernHeader";


// ══════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════
type ServiceType = "salon" | "sewing" | "health" | "cooking" | "childcare" | "tip" | "handmade";

type WomenStoreProduct = {
  id: number;
  store_id: number;
  name: string;
  description: string;
  category: string;
  price: number;
  original_price: number | null;
  image_url: string | null;
  emoji: string;
  is_available: boolean;
  stock_count: number;
};

type WomenShop = {
  id: number;
  name: string;
  category: string;
  description: string;
  owner_name: string;
  phone: string;
  whatsapp: string;
  address: string;
  logo_url: string | null;
  working_hours: string;
  delivery_available: boolean;
  delivery_fee: number;
  min_order: number;
  is_featured: boolean;
  product_count: number;
};

type CartItem = { product: WomenStoreProduct; qty: number };
type Cart = Map<number, CartItem>;

type WomenService = {
  id: string;
  name: string;
  type: ServiceType;
  address: string;
  phone: string;
  hours: string;
  description: string;
  rating: number;
  tags: string[];
};

type HealthTip = {
  id: string;
  title: string;
  body: string;
  icon: string;
  color: string;
};

type Recipe = {
  id: string;
  name: string;
  time: string;
  ingredients: string[];
  steps: string[];
  icon: string;
};

// ══════════════════════════════════════════════════════
// DATA
// ══════════════════════════════════════════════════════

const HEALTH_TIPS: HealthTip[] = [
  { id: "ht1", title: "تغذية المرأة الحامل", body: "تناولي الحديد والحمض الفوليك وأوميجا-3 يومياً. تجنبي المأكولات النيئة والكافيين الزائد. شربي 8 أكواب ماء على الأقل يومياً.", icon: "heart-pulse", color: "#FF4FA3" },
  { id: "ht2", title: "فحوصات الصحة الدورية", body: "اعملي فحص صدر سنوياً وفحص دم كل 6 أشهر. ضغط الدم والسكر مهمان. زوري الطبيبة النسائية مرة في السنة.", icon: "clipboard-pulse", color: "#3E9CBF" },
  { id: "ht3", title: "الصحة النفسية للمرأة", body: "خصصي وقتاً يومياً لنفسك. التحدث مع المقربات يخفف التوتر. النوم الكافي 7-8 ساعات يحسن الصحة النفسية والجسدية.", icon: "emoticon-happy", color: "#A855F7" },
  { id: "ht4", title: "نصائح ما بعد الولادة", body: "الرضاعة الطبيعية مفيدة لك وللطفل. لا تترددي في طلب المساعدة. مارسي تمارين المشي بعد أسبوعين من الولادة الطبيعية.", icon: "baby-carriage", color: "#27AE68" },
];

const RECIPES: Recipe[] = [
  {
    id: "r1", name: "ملاح ضاني سوداني", time: "90 دقيقة",
    icon: "pot-steam",
    ingredients: ["لحم ضاني 500 جم", "طماطم 3 حبات", "بصل كبير", "توابل سودانية", "ويكة", "ملح وكسبرة وكمون"],
    steps: ["اقطع اللحم وتبّله بالتوابل وافرم البصل", "سخّن زيت في قدر واقلب البصل حتى يذهب", "أضف اللحم واقلب حتى يتحمر", "أضف الطماطم والماء واتركه 60 دقيقة على نار هادئة", "أضف الويكة في الأخير وأطبخ 10 دقائق"],
  },
  {
    id: "r2", name: "عصيدة بالملاح", time: "30 دقيقة",
    icon: "bowl-mix",
    ingredients: ["دقيق ذرة 2 كوب", "ماء 4 أكواب", "ملح", "للملاح: ملاح ضاني أو دجاج"],
    steps: ["اغلي الماء مع الملح", "أضف الدقيق تدريجياً مع التحريك", "اخفض النار وحرّك باستمرار 15 دقيقة", "شكّلها في وعاء وأضف الملاح في المنتصف"],
  },
  {
    id: "r3", name: "بسبوسة سودانية", time: "45 دقيقة",
    icon: "cake",
    ingredients: ["سميد 2 كوب", "سكر 1 كوب", "زبدة 100 جم", "بيض 2", "لبن رايب 1 كوب", "خميرة ملعقة صغيرة"],
    steps: ["اخلط السميد والسكر والبيض والزبدة", "أضف اللبن الرائب والخميرة", "صب في صينية مدهونة", "اخبز 25 دقيقة على 180 درجة", "اسكب القطر الفاتر فور الإخراج"],
  },
];

// ══════════════════════════════════════════════════════
// HELPER COMPONENTS
// ══════════════════════════════════════════════════════
function SectionHeader({ title, sub, color }: { title: string; sub?: string; color: string }) {
  return (
    <View style={sh.row}>
      <LinearGradient colors={[color, color + "60"]} style={sh.bar} />
      <View>
        <Text style={sh.title}>{title}</Text>
        {sub && <Text style={sh.sub}>{sub}</Text>}
      </View>
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  bar: { width: 4, height: 28, borderRadius: 2 },
  title: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  sub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
});

const TYPE_CONFIG: Record<ServiceType, { label: string; icon: string; color: string }> = {
  salon:     { label: "كوفيرة",        icon: "face-woman",         color: "#FF4FA3" },
  sewing:    { label: "خياطة",         icon: "needle",              color: "#A855F7" },
  health:    { label: "صحة المرأة",   icon: "heart-pulse",         color: "#3E9CBF" },
  cooking:   { label: "طبخ ومطبخ",    icon: "pot-steam",           color: Colors.accent },
  childcare: { label: "رعاية أطفال",  icon: "baby-face-outline",   color: Colors.primary },
  tip:       { label: "نصيحة",        icon: "lightbulb-on",        color: "#F0A500" },
  handmade:  { label: "أعمال يدوية",  icon: "hand-heart-outline",  color: "#14B8A6" },
};

const STORE_TYPE_LABELS: Record<string, string> = {
  boutique:  "بوتيك",
  restaurant: "مطعم",
  cafe:       "كافيه",
  grocery:    "بقالة",
  pharmacy:   "صيدلية",
  sweets:     "حلويات",
  electronics:"إلكترونيات",
  general:    "متجر عام",
};

// ══════════════════════════════════════════════════════
// SCREEN
// ══════════════════════════════════════════════════════
type SubTab = "services" | "health" | "recipes" | "handmade" | "boutiques" | "shops";

type WomenStore = {
  id: number;
  name: string;
  type: string;
  description: string | null;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  working_hours: string;
  delivery_available: boolean;
  min_order: number;
  delivery_fee: number;
  product_count: number;
  owner_name: string | null;
};

function normalizeWomenGender(value: string | null | undefined) {
  const g = String(value ?? "").trim().toLowerCase();
  if (["male", "m", "man", "ذكر", "رجل", "ولد"].includes(g)) return "male";
  if (["female", "f", "woman", "أنثى", "انثى", "امرأة", "امراة", "بنت"].includes(g)) return "female";
  return null;
}

export default function WomenScreen() {
  const { user, isGuest, setUserGender } = useAuth();
  const router = useRouter();
  const [settingGender, setSettingGender] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ServiceType | "all">("all");
  const [services, setServices] = useState<WomenService[]>([]);
  const [subTab, setSubTab] = useState<SubTab>("services");
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [expandedTip, setExpandedTip]       = useState<string | null>(null);
  const womenGender = normalizeWomenGender(user?.gender);
  const isWomenAdmin = user?.role === "admin";
  const isMaleBlocked = womenGender === "male" && !isWomenAdmin;
  const needsGenderForWomen = !womenGender && !isWomenAdmin;
  const [womenStores, setWomenStores]       = useState<WomenStore[]>([]);
  const [storesLoading, setStoresLoading]   = useState(false);
  const [storeSearch, setStoreSearch]       = useState("");

  // ── متاجر ركن المرأة ────────────────────────────────────────────────────────
  const [shops, setShops]                   = useState<WomenShop[]>([]);
  const [shopsLoading, setShopsLoading]     = useState(false);
  const [shopCategory, setShopCategory]     = useState("all");
  const [shopSearch, setShopSearch]         = useState("");
  const [selectedShop, setSelectedShop]     = useState<WomenShop | null>(null);
  const [shopProducts, setShopProducts]     = useState<WomenStoreProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [cart, setCart]                     = useState<Cart>(new Map());
  const [cartOpen, setCartOpen]             = useState(false);
  const [checkoutOpen, setCheckoutOpen]     = useState(false);
  const [checkoutName, setCheckoutName]     = useState("");
  const [checkoutPhone, setCheckoutPhone]   = useState("");
  const [checkoutAddress, setCheckoutAddress] = useState("");
  const [checkoutNotes, setCheckoutNotes]   = useState("");
  const [checkoutSending, setCheckoutSending] = useState(false);
  const [orderDone, setOrderDone]           = useState(false);
  const [applyShopModal, setApplyShopModal] = useState(false);
  const [applyName, setApplyName]           = useState("");
  const [applyCategory, setApplyCategory]   = useState("accessories");
  const [applyOwner, setApplyOwner]         = useState("");
  const [applyPhone, setApplyPhone]         = useState("");
  const [applyAddress, setApplyAddress]     = useState("");
  const [applyHours, setApplyHours]         = useState("9:00 - 21:00");
  const [applyDelivery, setApplyDelivery]   = useState(false);
  const [applyDesc, setApplyDesc]           = useState("");
  const [applySending, setApplySending]     = useState(false);
  const [applyDone, setApplyDone]           = useState(false);
  const [reqModal, setReqModal]             = useState(false);
  const [reqStore, setReqStore]             = useState<WomenShop | null>(null);
  const [reqName, setReqName]               = useState("");
  const [reqPhone, setReqPhone]             = useState("");
  const [reqDesc, setReqDesc]               = useState("");
  const [reqBudget, setReqBudget]           = useState("");
  const [reqSending, setReqSending]         = useState(false);
  const [reqDone, setReqDone]               = useState(false);

  // ── نموذج الانضمام ──────────────────────────────────────────────────────
  const [joinModal,    setJoinModal]   = useState(false);
  const [joinDone,     setJoinDone]    = useState(false);
  const [joinSending,  setJoinSending] = useState(false);
  const [joinName,     setJoinName]    = useState("");
  const [joinType,     setJoinType]    = useState<ServiceType>("salon");
  const [joinPhone,    setJoinPhone]   = useState("");
  const [joinAddress,  setJoinAddress] = useState("");
  const [joinDesc,     setJoinDesc]    = useState("");

  const JOIN_TYPES: { key: ServiceType; label: string; icon: string }[] = [
    { key: "salon",     label: "كوفيرة",        icon: "face-woman"        },
    { key: "sewing",    label: "خياطة",          icon: "needle"            },
    { key: "handmade",  label: "أعمال يدوية",   icon: "hand-heart-outline"},
    { key: "health",    label: "صحة المرأة",    icon: "heart-pulse"       },
    { key: "cooking",   label: "مطبخ منزلي",    icon: "pot-steam"         },
    { key: "childcare", label: "رعاية أطفال",   icon: "baby-face-outline" },
  ];

  function resetJoin() {
    setJoinName(""); setJoinPhone(""); setJoinAddress(""); setJoinDesc(""); setJoinType("salon");
  }

  async function submitJoinRequest() {
    if (!joinName.trim() || !joinPhone.trim())
      return Alert.alert("بيانات ناقصة", "الاسم ورقم الهاتف مطلوبان");
    Keyboard.dismiss();
    setJoinSending(true);
    try {
      const base = getApiUrl().replace(/\/$/, "");
      const res = await fetch(`${base}/api/women/join-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_name:   joinName.trim(),
          service_type: joinType,
          phone:        joinPhone.trim(),
          address:      joinAddress.trim(),
          description:  joinDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) return Alert.alert("خطأ", data.error ?? "حدث خطأ");
      resetJoin();
      setJoinDone(true);
    } catch {
      Alert.alert("خطأ في الاتصال", "تعذّر الاتصال بالخادم، حاولي مجدداً");
    } finally {
      setJoinSending(false);
    }
  }

  // ── دوال المتاجر ────────────────────────────────────────────────────────────
  const loadShops = async (cat?: string) => {
    setShopsLoading(true);
    try {
      const c = cat ?? shopCategory;
      const params = c !== "all" ? `?category=${c}` : "";
      const res = await fetch(`${getApiUrl()}/api/women/stores${params}`);
      if (res.ok) setShops(await res.json());
    } catch { /* offline */ } finally { setShopsLoading(false); }
  };

  const loadShopProducts = async (shopId: number) => {
    setProductsLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/women/stores/${shopId}/products`);
      if (res.ok) {
        const d = await res.json();
        setShopProducts(d.products ?? []);
      }
    } catch { /* offline */ } finally { setProductsLoading(false); }
  };

  function cartTotal(c: Cart): number {
    let t = 0;
    c.forEach(ci => { t += ci.product.price * ci.qty; });
    return t;
  }
  function cartCount(c: Cart): number {
    let n = 0;
    c.forEach(ci => { n += ci.qty; });
    return n;
  }

  function addToCart(product: WomenStoreProduct) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart(prev => {
      const next = new Map(prev);
      const existing = next.get(product.id);
      next.set(product.id, { product, qty: (existing?.qty ?? 0) + 1 });
      return next;
    });
  }
  function removeFromCart(productId: number) {
    setCart(prev => {
      const next = new Map(prev);
      const existing = next.get(productId);
      if (!existing) return prev;
      if (existing.qty <= 1) next.delete(productId);
      else next.set(productId, { ...existing, qty: existing.qty - 1 });
      return next;
    });
  }
  function clearCart() { setCart(new Map()); }

  async function submitOrder() {
    if (!selectedShop) return;
    if (!checkoutName.trim() || !checkoutPhone.trim())
      return Alert.alert("بيانات ناقصة", "الاسم والهاتف مطلوبان");
    if (!cart.size) return Alert.alert("السلة فارغة", "أضيفي منتجاً على الأقل");
    Keyboard.dismiss();
    setCheckoutSending(true);
    const items: { id: number; name: string; price: number; qty: number; emoji: string }[] = [];
    cart.forEach(ci => items.push({ id: ci.product.id, name: ci.product.name, price: ci.product.price, qty: ci.qty, emoji: ci.product.emoji }));
    const subtotal = cartTotal(cart);
    const deliveryFee = selectedShop.delivery_available && checkoutAddress.trim() ? selectedShop.delivery_fee : 0;
    try {
      const res = await fetch(`${getApiUrl()}/api/women/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: selectedShop.id,
          customer_name: checkoutName.trim(),
          customer_phone: checkoutPhone.trim(),
          customer_address: checkoutAddress.trim(),
          items, subtotal, delivery_fee: deliveryFee,
          total: subtotal + deliveryFee,
          notes: checkoutNotes.trim(),
        }),
      });
      if (!res.ok) { const d = await res.json(); return Alert.alert("خطأ", d.error ?? "فشل الإرسال"); }
      clearCart();
      setOrderDone(true);
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setCheckoutSending(false); }
  }

  async function submitApplyShop() {
    if (!applyName.trim() || !applyOwner.trim() || !applyPhone.trim())
      return Alert.alert("بيانات ناقصة", "اسم المتجر وصاحبته والهاتف مطلوبة");
    Keyboard.dismiss();
    setApplySending(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/women/stores/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: applyName.trim(), category: applyCategory, description: applyDesc.trim(),
          owner_name: applyOwner.trim(), phone: applyPhone.trim(),
          address: applyAddress.trim(), working_hours: applyHours.trim(),
          delivery_available: applyDelivery,
        }),
      });
      const d = await res.json();
      if (!res.ok) return Alert.alert("خطأ", d.error ?? "فشل الإرسال");
      setApplyDone(true);
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setApplySending(false); }
  }

  async function submitProductRequest() {
    if (!reqName.trim() || !reqPhone.trim() || !reqDesc.trim())
      return Alert.alert("بيانات ناقصة", "الاسم والهاتف والوصف مطلوبة");
    Keyboard.dismiss();
    setReqSending(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/women/product-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: reqStore?.id ?? null,
          customer_name: reqName.trim(), customer_phone: reqPhone.trim(),
          product_description: reqDesc.trim(), budget: reqBudget.trim(),
        }),
      });
      if (!res.ok) { const d = await res.json(); return Alert.alert("خطأ", d.error ?? "فشل الإرسال"); }
      setReqDone(true);
    } catch { Alert.alert("خطأ", "تعذّر الاتصال بالخادم"); }
    finally { setReqSending(false); }
  }

  useEffect(() => { if (subTab === "shops") loadShops(); }, [subTab]);
  useEffect(() => { if (selectedShop) loadShopProducts(selectedShop.id); }, [selectedShop]);

  const load = async () => {
    if (!user || isGuest || isMaleBlocked || needsGenderForWomen) return;
    try {
      const params = filter !== "all" ? `?type=${filter}` : "";
      const res = await fetch(`${getApiUrl()}/api/women-services${params}`);
      if (res.ok) {
        const data = await res.json();
        setServices((data.services || []).map((s: Record<string,unknown>) => ({
          id: String(s.id),
          name: s.name,
          type: s.type as ServiceType,
          address: s.address,
          phone: s.phone,
          hours: s.hours,
          description: s.description,
          rating: parseFloat(String(s.rating)),
          tags: s.tags || [],
        })));
      }
    } catch { /* offline */ }
  };

  const loadWomenStores = async () => {
    setStoresLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/stores?women_only=true`);
      if (res.ok) {
        const data = await res.json();
        setWomenStores(data);
      }
    } catch { /* offline */ } finally {
      setStoresLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => { if (subTab === "boutiques") loadWomenStores(); }, [subTab]);
  useFocusEffect(useCallback(() => { load(); }, []));

  const filtered = services.filter(s => {
    const matchSearch = search === "" || s.name.includes(search) || s.address.includes(search) || s.description.includes(search);
    const matchFilter = filter === "all" || s.type === filter;
    return matchSearch && matchFilter;
  });

  const handleCall = (phone: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("تواصل", "", [
      { text: "إلغاء", style: "cancel" },
      { text: "واتساب", onPress: () => Linking.openURL(`https://wa.me/${phone.replace(/\D/g, "")}`) },
      { text: "اتصال", onPress: () => Linking.openURL(`tel:${phone}`) },
    ]);
  };

  const servicesByType = (type: ServiceType) => services.filter(s => s.type === type);

  // ── حجب الزوار غير المسجّلين ─────────────────────────────────────────────
  if (isGuest || !user) {
    return (
      <View style={s.root}>
        <ModernHeader title="قسم المرأة" subtitle="خدمات · صحة · مطبخ سوداني" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <MaterialCommunityIcons name="lock-outline" size={64} color="#FF4FA3" style={{ marginBottom: 20 }} />
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text, textAlign: "center", marginBottom: 10 }}>
            هذا القسم للأعضاء المسجّلات فقط
          </Text>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, textAlign: "center", marginBottom: 28 }}>
            يُرجى إنشاء حساب أو تسجيل الدخول للوصول إلى قسم المرأة
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/login")}
            style={{ backgroundColor: Colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: Colors.radius.md }}
          >
            <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" }}>تسجيل الدخول</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── حجب الذكور ────────────────────────────────────────────────────────────
  if (isMaleBlocked) {
    return (
      <View style={s.root}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <MaterialCommunityIcons name="face-woman" size={64} color="#FF4FA3" style={{ marginBottom: 20 }} />
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text, textAlign: "center", marginBottom: 10 }}>
            قسم المرأة
          </Text>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, textAlign: "center" }}>
            هذا القسم محجوب تلقائياً على حسابات الذكور، ولا يمكن الدخول إليه إلا بحساب إدارة.
          </Text>
        </View>
      </View>
    );
  }

  // ── المستخدمة لم تحدّد جنسها بعد ──────────────────────────────────────────
  if (needsGenderForWomen) {
    return (
      <View style={s.root}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <MaterialCommunityIcons name="account-question-outline" size={64} color="#FF4FA3" style={{ marginBottom: 20 }} />
          <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.text, textAlign: "center", marginBottom: 10 }}>
            تأكيد الجنس
          </Text>
          <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted, textAlign: "center", marginBottom: 28 }}>
            لم يتم تحديد جنسك في حسابك بعد. يُرجى التحديد للمتابعة.
          </Text>
          <View style={{ flexDirection: "row-reverse", gap: 12, width: "100%" }}>
            {([
              { val: "female" as const, label: "أنثى", icon: "woman-outline" as const },
              { val: "male"   as const, label: "ذكر",  icon: "man-outline"   as const },
            ]).map(opt => (
              <TouchableOpacity
                key={opt.val}
                disabled={settingGender}
                onPress={async () => {
                  setSettingGender(true);
                  try { await setUserGender(opt.val); }
                  catch { Alert.alert("خطأ", "تعذّر تحديث الجنس"); }
                  finally { setSettingGender(false); }
                }}
                style={{
                  flex: 1, alignItems: "center", justifyContent: "center",
                  paddingVertical: 16, borderRadius: 14, borderWidth: 1.5,
                  borderColor: "#FF4FA3", backgroundColor: Colors.cardBg, gap: 6,
                }}
                activeOpacity={0.75}
              >
                <Ionicons name={opt.icon} size={28} color="#FF4FA3" />
                <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: "#FF4FA3" }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {settingGender && <ActivityIndicator color="#FF4FA3" style={{ marginTop: 18 }} />}
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <ModernHeader title="قسم المرأة" subtitle="خدمات · صحة · مطبخ سوداني">
        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { num: `${servicesByType("salon").length}`,    label: "كوفيرة",   color: "#FF4FA3" },
            { num: `${servicesByType("sewing").length}`,   label: "خياطة",    color: "#A855F7" },
            { num: `${servicesByType("handmade").length}`, label: "يدوية",    color: "#14B8A6" },
            { num: `${servicesByType("cooking").length}`,  label: "مطبخ",     color: Colors.accent },
          ].map((st, i) => (
            <View key={i} style={s.statItem}>
              <Text style={[s.statNum, { color: st.color }]}>{st.num}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Sub tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ ...s.subTabRow }}>
          {([
            ["services",   "الخدمات",      "storefront-outline",   "#FF4FA3"],
            ["shops",      "المتاجر",       "shopping-outline",     "#A855F7"],
            ["boutiques",  "بوتيكات",       "bag-personal-outline", "#8B5CF6"],
            ["handmade",   "يدوية",         "hand-heart-outline",   "#14B8A6"],
            ["health",     "صحة المرأة",   "heart-outline",        "#3E9CBF"],
            ["recipes",    "مطبخ سوداني",  "restaurant-outline",   Colors.accent],
          ] as [SubTab, string, string, string][]).map(([k, label, icon, color]) => (
            <TouchableOpacity key={k} style={[s.subTab, subTab === k && s.subTabActive]} onPress={() => setSubTab(k)}>
              {subTab === k && <LinearGradient colors={[color + "30", color + "10"]} style={StyleSheet.absoluteFill} />}
              <MaterialCommunityIcons name={icon as any} size={14} color={subTab === k ? color : Colors.textMuted} />
              <Text style={[s.subTabText, subTab === k && { color }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ModernHeader>

      {/* ══ TAB: SERVICES ══ */}
      {subTab === "services" && (
        <>
          {/* Search + filters */}
          <View style={s.searchSection}>
            <View style={s.searchRow}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="ابحث عن خدمة..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
                textAlign="right"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
              {([["all", "الكل"], ["salon", "كوفيرات"], ["sewing", "خياطة"], ["handmade", "يدوية"], ["health", "صحة"], ["cooking", "مطبخ"], ["childcare", "أطفال"]] as [ServiceType | "all", string][]).map(([k, label]) => (
                <TouchableOpacity key={k} style={[s.filterChip, filter === k && { backgroundColor: "#FF4FA3", borderColor: "#FF4FA3" }]} onPress={() => setFilter(k)}>
                  <Text style={[s.filterChipText, filter === k && { color: "#000" }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── بانر طلب الانضمام ── */}
          <Animated.View entering={FadeIn.duration(400)} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <TouchableOpacity
              style={jm.joinBanner}
              activeOpacity={0.88}
              onPress={() => { setJoinDone(false); setJoinModal(true); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <LinearGradient colors={["#FF4FA330", "#A855F720", "transparent"]} style={StyleSheet.absoluteFill} />
              <View style={jm.joinBannerIcon}>
                <MaterialCommunityIcons name="store-plus-outline" size={26} color="#FF4FA3" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={jm.joinBannerTitle}>انضمي معنا!</Text>
                <Text style={jm.joinBannerSub}>سجّلي كوفيرتك أو خدمتك وابدئي العمل</Text>
              </View>
              <View style={jm.joinBannerArrow}>
                <Ionicons name="chevron-back" size={18} color="#FF4FA3" />
              </View>
            </TouchableOpacity>
          </Animated.View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            {filtered.map((item, idx) => {
              const cfg = TYPE_CONFIG[item.type];
              return (
                <Animated.View key={item.id} entering={FadeInDown.delay(idx * 60).springify()}>
                  <View style={[s.card, { borderColor: cfg.color + "30" }]}>
                    <LinearGradient colors={[cfg.color + "08", "transparent"]} style={StyleSheet.absoluteFill} />

                    {/* Card header */}
                    <View style={s.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardName}>{item.name}</Text>
                        <View style={s.cardMeta}>
                          <View style={[s.typeBadge, { backgroundColor: cfg.color + "20" }]}>
                            <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.color} />
                            <Text style={[s.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                          </View>
                          <View style={s.ratingRow}>
                            <Ionicons name="star" size={13} color={Colors.accent} />
                            <Text style={s.ratingText}>{item.rating}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={[s.iconCircle, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
                        <MaterialCommunityIcons name={cfg.icon as any} size={26} color={cfg.color} />
                      </View>
                    </View>

                    {/* Description */}
                    <Text style={s.cardDesc}>{item.description}</Text>

                    {/* Tags */}
                    <View style={s.tagsRow}>
                      {item.tags.map(tag => (
                        <View key={tag} style={s.tag}>
                          <Text style={s.tagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Info */}
                    <View style={s.cardInfoRow}>
                      <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                      <Text style={s.cardInfoText}>{item.hours}</Text>
                      <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                      <Text style={s.cardInfoText} numberOfLines={1}>{item.address}</Text>
                    </View>

                    {/* Actions */}
                    <View style={s.cardActions}>
                      <AnimatedPress style={{ flex: 1 }} onPress={() => handleCall(item.phone)}>
                        <LinearGradient colors={[cfg.color, cfg.color + "CC"]} style={s.actionBtn}>
                          <Ionicons name="call-outline" size={16} color="#fff" />
                          <Text style={s.actionBtnText}>تواصل</Text>
                        </LinearGradient>
                      </AnimatedPress>
                      {(item.type === "salon" || item.type === "health") && (
                        <AnimatedPress style={{ flex: 1 }} onPress={() => Alert.alert("حجز موعد", `لحجز موعد في ${item.name} اضغط "حجز المواعيد" من الصفحة الرئيسية`)}>
                          <View style={[s.actionBtn, { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: cfg.color + "60" }]}>
                            <Ionicons name="calendar-outline" size={16} color={cfg.color} />
                            <Text style={[s.actionBtnText, { color: cfg.color }]}>حجز موعد</Text>
                          </View>
                        </AnimatedPress>
                      )}
                    </View>
                  </View>
                </Animated.View>
              );
            })}
            {filtered.length === 0 && (
              <View style={s.emptyState}>
                <MaterialCommunityIcons name="magnify" size={48} color={Colors.textMuted} />
                <Text style={s.emptyText}>لا توجد نتائج</Text>
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* ══ TAB: HEALTH ══ */}
      {subTab === "health" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <SectionHeader title="نصائح صحية للمرأة" sub="معلومات طبية موثوقة" color="#FF4FA3" />

          {HEALTH_TIPS.map((tip, i) => (
            <Animated.View key={tip.id} entering={FadeInDown.delay(i * 80).springify()}>
              <TouchableOpacity
                style={[s.tipCard, { borderColor: tip.color + "30" }]}
                onPress={() => setExpandedTip(expandedTip === tip.id ? null : tip.id)}
                activeOpacity={0.85}
              >
                <LinearGradient colors={[tip.color + "10", "transparent"]} style={StyleSheet.absoluteFill} />
                <View style={s.tipHeader}>
                  <View style={[s.tipIcon, { backgroundColor: tip.color + "20" }]}>
                    <MaterialCommunityIcons name={tip.icon as any} size={22} color={tip.color} />
                  </View>
                  <Text style={s.tipTitle}>{tip.title}</Text>
                  <Ionicons name={expandedTip === tip.id ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
                </View>
                {expandedTip === tip.id && (
                  <Animated.View entering={FadeIn.duration(200)}>
                    <View style={s.tipBody}>
                      <Text style={s.tipBodyText}>{tip.body}</Text>
                    </View>
                  </Animated.View>
                )}
              </TouchableOpacity>
            </Animated.View>
          ))}

          <SectionHeader title="مراكز صحة المرأة" sub="في الحصاحيصا" color="#3E9CBF" />
          {services.filter((sv) => sv.type === "health").map((item, i) => {
            const cfg = TYPE_CONFIG[item.type];
            return (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 60)}>
                <View style={[s.card, { borderColor: cfg.color + "30" }]}>
                  <LinearGradient colors={[cfg.color + "08", "transparent"]} style={StyleSheet.absoluteFill} />
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardName}>{item.name}</Text>
                      <Text style={s.cardDesc}>{item.description}</Text>
                    </View>
                    <View style={[s.iconCircle, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
                      <MaterialCommunityIcons name={cfg.icon as any} size={26} color={cfg.color} />
                    </View>
                  </View>
                  <View style={s.cardInfoRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.cardInfoText}>{item.hours}</Text>
                    <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.cardInfoText}>{item.address}</Text>
                  </View>
                  <AnimatedPress onPress={() => handleCall(item.phone)}>
                    <LinearGradient colors={[cfg.color, cfg.color + "CC"]} style={s.wideBtn}>
                      <Ionicons name="call-outline" size={16} color="#fff" />
                      <Text style={s.actionBtnText}>تواصل مع المركز</Text>
                    </LinearGradient>
                  </AnimatedPress>
                </View>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {/* ══ TAB: RECIPES ══ */}
      {subTab === "recipes" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <SectionHeader title="مطبخ سوداني" sub="وصفات تقليدية أصيلة" color={Colors.accent} />

          {RECIPES.map((recipe, i) => (
            <Animated.View key={recipe.id} entering={FadeInDown.delay(i * 80).springify()}>
              <TouchableOpacity
                style={[s.recipeCard, expandedRecipe === recipe.id && { borderColor: Colors.accent + "60" }]}
                onPress={() => setExpandedRecipe(expandedRecipe === recipe.id ? null : recipe.id)}
                activeOpacity={0.85}
              >
                {expandedRecipe === recipe.id && <LinearGradient colors={[Colors.accent + "12", "transparent"]} style={StyleSheet.absoluteFill} />}
                <View style={s.recipeHeader}>
                  <View style={[s.recipeIcon, { backgroundColor: Colors.accent + "20" }]}>
                    <MaterialCommunityIcons name={recipe.icon as any} size={28} color={Colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.recipeName}>{recipe.name}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                      <Text style={s.recipeTime}>{recipe.time}</Text>
                    </View>
                  </View>
                  <Ionicons name={expandedRecipe === recipe.id ? "chevron-up" : "chevron-down"} size={18} color={Colors.textMuted} />
                </View>

                {expandedRecipe === recipe.id && (
                  <Animated.View entering={FadeIn.duration(250)}>
                    <View style={s.recipeBody}>
                      <Text style={s.recipeSubTitle}>المقادير</Text>
                      {recipe.ingredients.map((ing, j) => (
                        <View key={j} style={s.ingredientRow}>
                          <View style={s.ingredientDot} />
                          <Text style={s.ingredientText}>{ing}</Text>
                        </View>
                      ))}
                      <Text style={[s.recipeSubTitle, { marginTop: 14 }]}>طريقة التحضير</Text>
                      {recipe.steps.map((step, j) => (
                        <View key={j} style={s.stepRow}>
                          <View style={[s.stepNum, { backgroundColor: Colors.accent }]}>
                            <Text style={s.stepNumText}>{j + 1}</Text>
                          </View>
                          <Text style={s.stepText}>{step}</Text>
                        </View>
                      ))}
                    </View>
                  </Animated.View>
                )}
              </TouchableOpacity>
            </Animated.View>
          ))}

          {/* مطابخ منزلية */}
          <SectionHeader title="مطابخ منزلية للطلب" sub="وجبات سودانية يومية" color={Colors.primary} />
          {services.filter((sv) => sv.type === "cooking").map((item, i) => {
            const cfg = TYPE_CONFIG[item.type];
            return (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 60)}>
                <View style={[s.card, { borderColor: cfg.color + "30" }]}>
                  <LinearGradient colors={[cfg.color + "08", "transparent"]} style={StyleSheet.absoluteFill} />
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardName}>{item.name}</Text>
                      <Text style={s.cardDesc}>{item.description}</Text>
                    </View>
                    <View style={[s.iconCircle, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" }]}>
                      <MaterialCommunityIcons name={cfg.icon as any} size={26} color={cfg.color} />
                    </View>
                  </View>
                  <View style={s.cardInfoRow}>
                    <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.cardInfoText}>{item.hours}</Text>
                    <View style={s.ratingRow}>
                      <Ionicons name="star" size={13} color={Colors.accent} />
                      <Text style={s.ratingText}>{item.rating}</Text>
                    </View>
                  </View>
                  <AnimatedPress onPress={() => handleCall(item.phone)}>
                    <LinearGradient colors={[cfg.color, cfg.color + "CC"]} style={s.wideBtn}>
                      <Ionicons name="call-outline" size={16} color="#fff" />
                      <Text style={s.actionBtnText}>اطلب الآن</Text>
                    </LinearGradient>
                  </AnimatedPress>
                </View>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}

      {/* ══ TAB: HANDMADE ══ */}
      {subTab === "handmade" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

          {/* بطاقة ترحيبية */}
          <Animated.View entering={FadeIn.duration(400)}>
            <View style={hm.introBanner}>
              <LinearGradient colors={["#14B8A630", "#14B8A610"]} style={StyleSheet.absoluteFill} />
              <MaterialCommunityIcons name="hand-heart-outline" size={36} color="#14B8A6" style={{ marginBottom: 10 }} />
              <Text style={hm.introTitle}>الأعمال اليدوية</Text>
              <Text style={hm.introSub}>
                دعمي الحِرَف اليدوية السودانية — اكتشفي منتجات مصنوعة بأيدي حصاحيصاويات موهوبات
              </Text>
            </View>
          </Animated.View>

          {/* أنواع الحِرَف */}
          <SectionHeader title="أنواع الحِرَف المتوفرة" sub="أختاري ما يناسبك" color="#14B8A6" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
            {([
              { icon: "yarn",               label: "تطريز وحياكة",  color: "#A855F7" },
              { icon: "candle",             label: "شمع وعطور",     color: "#F0A500" },
              { icon: "soap",               label: "صابون طبيعي",   color: "#3E9CBF" },
              { icon: "basket",             label: "سلال وخوص",     color: "#D97706" },
              { icon: "palette",            label: "رسم وزخرفة",    color: "#EC4899" },
              { icon: "crystal-ball",       label: "خزف وفخار",     color: "#8B5CF6" },
              { icon: "bag-personal-outline", label: "حقائب يدوية", color: "#14B8A6" },
              { icon: "gift-outline",       label: "هدايا مخصصة",   color: "#EF4444" },
            ]).map((cat, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(i * 50)}>
                <View style={hm.catChip}>
                  <LinearGradient colors={[cat.color + "20", cat.color + "08"]} style={StyleSheet.absoluteFill} />
                  <MaterialCommunityIcons name={cat.icon as any} size={20} color={cat.color} />
                  <Text style={[hm.catLabel, { color: cat.color }]}>{cat.label}</Text>
                </View>
              </Animated.View>
            ))}
          </ScrollView>

          {/* منتجات وخدمات من قاعدة البيانات */}
          <SectionHeader title="صانعات محليات" sub="تواصلي معهن مباشرة" color="#14B8A6" />
          {services.filter(sv => sv.type === "handmade").length === 0 ? (
            <Animated.View entering={FadeIn.duration(500)}>
              <View style={hm.emptyBanner}>
                <MaterialCommunityIcons name="hand-heart-outline" size={44} color="#14B8A650" />
                <Text style={hm.emptyTitle}>لا يوجد إدخالات بعد</Text>
                <Text style={hm.emptySub}>كوني أول من تُسجّل منتجاتها اليدوية في الحصاحيصا</Text>
                <TouchableOpacity
                  style={hm.emptyBtn}
                  onPress={() => { setJoinDone(false); setJoinType("handmade"); setJoinModal(true); }}
                >
                  <LinearGradient colors={["#14B8A6", "#0D9488"]} style={hm.emptyBtnGrad}>
                    <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#fff" />
                    <Text style={hm.emptyBtnText}>سجّلي منتجاتك الآن</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : (
            services.filter(sv => sv.type === "handmade").map((item, i) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(i * 60).springify()}>
                <View style={[s.card, { borderColor: "#14B8A630" }]}>
                  <LinearGradient colors={["#14B8A608", "transparent"]} style={StyleSheet.absoluteFill} />
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardName}>{item.name}</Text>
                      <View style={s.ratingRow}>
                        <Ionicons name="star" size={13} color={Colors.accent} />
                        <Text style={s.ratingText}>{item.rating}</Text>
                      </View>
                    </View>
                    <View style={[s.iconCircle, { backgroundColor: "#14B8A618", borderColor: "#14B8A630" }]}>
                      <MaterialCommunityIcons name="hand-heart-outline" size={26} color="#14B8A6" />
                    </View>
                  </View>
                  <Text style={s.cardDesc}>{item.description}</Text>
                  <View style={s.tagsRow}>
                    {item.tags.map(tag => (
                      <View key={tag} style={s.tag}><Text style={s.tagText}>{tag}</Text></View>
                    ))}
                  </View>
                  <View style={s.cardInfoRow}>
                    <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.cardInfoText}>{item.address}</Text>
                    <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                    <Text style={s.cardInfoText}>{item.hours}</Text>
                  </View>
                  <AnimatedPress onPress={() => handleCall(item.phone)}>
                    <LinearGradient colors={["#14B8A6", "#0D9488"]} style={s.wideBtn}>
                      <Ionicons name="call-outline" size={16} color="#fff" />
                      <Text style={s.actionBtnText}>تواصلي مع الصانعة</Text>
                    </LinearGradient>
                  </AnimatedPress>
                </View>
              </Animated.View>
            ))
          )}

          {/* نصيحة */}
          <View style={hm.tipCard}>
            <MaterialCommunityIcons name="lightbulb-on-outline" size={20} color="#F0A500" />
            <Text style={hm.tipText}>
              هل تصنعين منتجات يدوية؟ سجّلي معنا وابدئي في البيع والتسويق داخل مجتمع حصاحيصاوي.
            </Text>
          </View>

        </ScrollView>
      )}

      {/* ══ TAB: SHOPS (متاجر ركن المرأة) ══ */}
      {subTab === "shops" && (
        <View style={{ flex: 1 }}>
          {/* فلتر الفئات */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            {([
              ["all",         "الكل",         "🛍️"],
              ["accessories", "إكسسوارات",    "💍"],
              ["perfumes",    "عطور",          "🌹"],
              ["shoes",       "أحذية",         "👠"],
              ["clothing",    "ملابس",         "👗"],
              ["bags",        "حقائب",         "👜"],
              ["jewelry",     "مجوهرات",       "✨"],
              ["cosmetics",   "مستحضرات",     "💄"],
              ["general",     "متنوع",         "🛒"],
            ] as [string, string, string][]).map(([key, label, emoji]) => (
              <TouchableOpacity
                key={key}
                style={[sp.catChip, shopCategory === key && { backgroundColor: "#A855F7", borderColor: "#A855F7" }]}
                onPress={() => { setShopCategory(key); loadShops(key); }}
              >
                <Text style={{ fontSize: 14 }}>{emoji}</Text>
                <Text style={[sp.catChipText, shopCategory === key && { color: "#fff" }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* شريط البحث */}
          <View style={[s.searchRow, { marginHorizontal: 16, marginBottom: 8 }]}>
            <MaterialCommunityIcons name="magnify" size={18} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="ابحثي عن متجر..."
              placeholderTextColor={Colors.textMuted}
              value={shopSearch}
              onChangeText={setShopSearch}
              textAlign="right"
            />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

            {/* بانر إضافة متجر */}
            <TouchableOpacity style={sp.addBanner} onPress={() => { setApplyDone(false); setApplyShopModal(true); }}>
              <LinearGradient colors={["#A855F720", "#FF4FA310"]} style={StyleSheet.absoluteFill} />
              <MaterialCommunityIcons name="store-plus-outline" size={26} color="#A855F7" />
              <View style={{ flex: 1 }}>
                <Text style={sp.addBannerTitle}>افتحي متجرك في ركن المرأة!</Text>
                <Text style={sp.addBannerSub}>إكسسوارات، عطور، أحذية وأكثر — اعرضي منتجاتك لآلاف المستخدمات</Text>
              </View>
              <Ionicons name="chevron-back" size={18} color="#A855F7" />
            </TouchableOpacity>

            {/* زر طلب منتج خاص */}
            <TouchableOpacity
              style={sp.reqBanner}
              onPress={() => { setReqStore(null); setReqDone(false); setReqModal(true); }}
            >
              <LinearGradient colors={["#14B8A615", "transparent"]} style={StyleSheet.absoluteFill} />
              <MaterialCommunityIcons name="clipboard-text-search-outline" size={20} color="#14B8A6" />
              <Text style={sp.reqBannerText}>طلب منتج خاص / مخصص</Text>
              <Ionicons name="chevron-back" size={16} color="#14B8A6" />
            </TouchableOpacity>

            {shopsLoading ? (
              <ActivityIndicator color="#A855F7" size="large" style={{ marginTop: 30 }} />
            ) : shops.filter(sh => !shopSearch || sh.name.includes(shopSearch) || sh.description.includes(shopSearch)).length === 0 ? (
              <View style={sp.emptyBox}>
                <MaterialCommunityIcons name="store-off-outline" size={52} color="#A855F750" />
                <Text style={sp.emptyTitle}>لا توجد متاجر بعد في هذه الفئة</Text>
                <Text style={sp.emptySub}>كوني أول من تفتح متجرها هنا</Text>
              </View>
            ) : (
              shops
                .filter(sh => !shopSearch || sh.name.includes(shopSearch) || sh.description.includes(shopSearch))
                .map((shop, idx) => (
                  <Animated.View key={shop.id} entering={FadeInDown.delay(idx * 60).springify()}>
                    <TouchableOpacity
                      style={sp.shopCard}
                      activeOpacity={0.88}
                      onPress={() => { setSelectedShop(selectedShop?.id === shop.id ? null : shop); setShopProducts([]); }}
                    >
                      <LinearGradient colors={["#A855F70A", "transparent"]} style={StyleSheet.absoluteFill} />

                      {/* رأس البطاقة */}
                      <View style={sp.shopHeader}>
                        <View style={sp.shopLogoWrap}>
                          {shop.logo_url ? (
                            <Image source={{ uri: shop.logo_url }} style={sp.shopLogo} />
                          ) : (
                            <Text style={{ fontSize: 28 }}>
                              {shop.category === "perfumes" ? "🌹" : shop.category === "shoes" ? "👠" :
                               shop.category === "jewelry" ? "✨" : shop.category === "cosmetics" ? "💄" :
                               shop.category === "bags" ? "👜" : shop.category === "clothing" ? "👗" : "🛍️"}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={sp.shopName}>{shop.name}</Text>
                            {shop.is_featured && (
                              <View style={sp.featuredBadge}>
                                <MaterialCommunityIcons name="star" size={10} color="#F0A500" />
                                <Text style={sp.featuredText}>مميز</Text>
                              </View>
                            )}
                          </View>
                          <View style={sp.shopMeta}>
                            <View style={sp.catBadge}>
                              <Text style={sp.catBadgeText}>
                                {shop.category === "accessories" ? "إكسسوارات" : shop.category === "perfumes" ? "عطور" :
                                 shop.category === "shoes" ? "أحذية" : shop.category === "clothing" ? "ملابس" :
                                 shop.category === "bags" ? "حقائب" : shop.category === "jewelry" ? "مجوهرات" :
                                 shop.category === "cosmetics" ? "مستحضرات" : "متنوع"}
                              </Text>
                            </View>
                            {shop.delivery_available && (
                              <View style={sp.deliveryBadge}>
                                <MaterialCommunityIcons name="moped-outline" size={10} color={Colors.primary} />
                                <Text style={sp.deliveryText}>توصيل</Text>
                              </View>
                            )}
                            {shop.product_count > 0 && (
                              <Text style={sp.productCount}>{shop.product_count} منتج</Text>
                            )}
                          </View>
                        </View>
                      </View>

                      {shop.description ? <Text style={sp.shopDesc} numberOfLines={2}>{shop.description}</Text> : null}

                      <View style={sp.shopInfo}>
                        {shop.address ? <><MaterialCommunityIcons name="map-marker-outline" size={13} color={Colors.textMuted} /><Text style={sp.shopInfoText}>{shop.address}</Text></> : null}
                        <MaterialCommunityIcons name="clock-outline" size={13} color={Colors.textMuted} />
                        <Text style={sp.shopInfoText}>{shop.working_hours}</Text>
                      </View>

                      {/* أزرار */}
                      <View style={sp.shopActions}>
                        <AnimatedPress style={{ flex: 1 }} onPress={() => { setSelectedShop(selectedShop?.id === shop.id ? null : shop); setShopProducts([]); }}>
                          <LinearGradient colors={["#A855F7", "#7C3AED"]} style={sp.shopBtn}>
                            <MaterialCommunityIcons name="shopping-outline" size={15} color="#fff" />
                            <Text style={sp.shopBtnText}>{selectedShop?.id === shop.id ? "إخفاء المنتجات" : "عرض المنتجات"}</Text>
                          </LinearGradient>
                        </AnimatedPress>
                        <TouchableOpacity
                          style={sp.reqBtn}
                          onPress={() => { setReqStore(shop); setReqDone(false); setReqModal(true); }}
                        >
                          <MaterialCommunityIcons name="clipboard-edit-outline" size={16} color="#A855F7" />
                        </TouchableOpacity>
                        {shop.phone ? (
                          <TouchableOpacity style={sp.callBtn} onPress={() => handleCall(shop.phone)}>
                            <MaterialCommunityIcons name="phone-outline" size={16} color={Colors.primary} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </TouchableOpacity>

                    {/* المنتجات المنبثقة */}
                    {selectedShop?.id === shop.id && (
                      <Animated.View entering={FadeIn.duration(250)} style={sp.productsPanel}>
                        {productsLoading ? (
                          <ActivityIndicator color="#A855F7" style={{ padding: 20 }} />
                        ) : shopProducts.length === 0 ? (
                          <Text style={sp.noProductsText}>لا توجد منتجات متاحة حالياً</Text>
                        ) : (
                          <>
                            <View style={sp.productsPanelHeader}>
                              <Text style={sp.productsPanelTitle}>منتجات {shop.name}</Text>
                              {cartCount(cart) > 0 && (
                                <TouchableOpacity style={sp.cartBadgeBtn} onPress={() => setCartOpen(true)}>
                                  <MaterialCommunityIcons name="cart-outline" size={16} color="#fff" />
                                  <Text style={sp.cartBadgeText}>{cartCount(cart)}</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 6, paddingTop: 4 }}>
                              {shopProducts.map(prod => {
                                const inCart = cart.get(prod.id);
                                return (
                                  <View key={prod.id} style={sp.productCard}>
                                    {prod.image_url ? (
                                      <Image source={{ uri: prod.image_url }} style={sp.productImage} />
                                    ) : (
                                      <View style={sp.productEmoji}><Text style={{ fontSize: 32 }}>{prod.emoji}</Text></View>
                                    )}
                                    <Text style={sp.productName} numberOfLines={2}>{prod.name}</Text>
                                    <View style={sp.productPriceRow}>
                                      <Text style={sp.productPrice}>{prod.price.toLocaleString("en-US")} ج</Text>
                                      {prod.original_price && prod.original_price > prod.price ? (
                                        <Text style={sp.productOriginalPrice}>{prod.original_price.toLocaleString("en-US")}</Text>
                                      ) : null}
                                    </View>
                                    {inCart ? (
                                      <View style={sp.qtyRow}>
                                        <TouchableOpacity style={sp.qtyBtn} onPress={() => removeFromCart(prod.id)}>
                                          <MaterialCommunityIcons name="minus" size={14} color="#A855F7" />
                                        </TouchableOpacity>
                                        <Text style={sp.qtyText}>{inCart.qty}</Text>
                                        <TouchableOpacity style={sp.qtyBtn} onPress={() => addToCart(prod)}>
                                          <MaterialCommunityIcons name="plus" size={14} color="#A855F7" />
                                        </TouchableOpacity>
                                      </View>
                                    ) : (
                                      <TouchableOpacity style={sp.addToCartBtn} onPress={() => addToCart(prod)}>
                                        <MaterialCommunityIcons name="cart-plus" size={14} color="#fff" />
                                        <Text style={sp.addToCartText}>أضيفي</Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                );
                              })}
                            </ScrollView>
                          </>
                        )}

                        {/* زر إتمام الشراء */}
                        {cartCount(cart) > 0 && (
                          <TouchableOpacity style={sp.checkoutBanner} onPress={() => setCartOpen(true)}>
                            <LinearGradient colors={["#A855F7", "#7C3AED"]} style={StyleSheet.absoluteFill} />
                            <MaterialCommunityIcons name="cart-check" size={18} color="#fff" />
                            <Text style={sp.checkoutBannerText}>السلة ({cartCount(cart)} منتج) — {cartTotal(cart).toLocaleString("en-US")} ج</Text>
                            <Ionicons name="chevron-back" size={16} color="#fff" />
                          </TouchableOpacity>
                        )}
                      </Animated.View>
                    )}
                  </Animated.View>
                ))
            )}
          </ScrollView>
        </View>
      )}

      {/* ══ TAB: BOUTIQUES ══ */}
      {subTab === "boutiques" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

          {/* بانر ترحيبي */}
          <Animated.View entering={FadeIn.duration(400)}>
            <View style={bt.introBanner}>
              <LinearGradient colors={["#A855F730", "#FF4FA320"]} style={StyleSheet.absoluteFill} />
              <MaterialCommunityIcons name="shopping-outline" size={36} color="#A855F7" style={{ marginBottom: 8 }} />
              <Text style={bt.introTitle}>البوتيكات النسائية</Text>
              <Text style={bt.introSub}>
                تسوّقي بخصوصية تامة — عطور، ملابس، إكسسوارات وأكثر من بوتيكات حصاحيصاوية موثوقة
              </Text>
            </View>
          </Animated.View>

          {/* شريط البحث */}
          <View style={s.searchRow}>
            <MaterialCommunityIcons name="magnify" size={18} color={Colors.textMuted} />
            <TextInput
              style={s.searchInput}
              placeholder="ابحثي عن بوتيك..."
              placeholderTextColor={Colors.textMuted}
              value={storeSearch}
              onChangeText={setStoreSearch}
              textAlign="right"
            />
          </View>

          {storesLoading ? (
            <ActivityIndicator color="#A855F7" size="large" style={{ marginTop: 40 }} />
          ) : womenStores.length === 0 ? (
            <Animated.View entering={FadeIn.duration(500)}>
              <View style={bt.emptyBanner}>
                <MaterialCommunityIcons name="store-off-outline" size={52} color="#A855F750" />
                <Text style={bt.emptyTitle}>لا توجد بوتيكات بعد</Text>
                <Text style={bt.emptySub}>
                  كوني أول من تفتح بوتيكها في حصاحيصا — اضغطي على "فتح متجري" للبدء
                </Text>
                <TouchableOpacity
                  style={bt.openStoreBtn}
                  onPress={() => router.push("/store-portal" as any)}
                >
                  <LinearGradient colors={["#A855F7", "#7C3AED"]} style={bt.openStoreBtnGrad}>
                    <MaterialCommunityIcons name="store-plus-outline" size={18} color="#fff" />
                    <Text style={bt.openStoreBtnText}>فتح بوتيكي</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ) : (
            <>
              {womenStores
                .filter(st => !storeSearch || st.name.includes(storeSearch) || (st.description ?? "").includes(storeSearch) || (st.address ?? "").includes(storeSearch))
                .map((store, idx) => (
                <Animated.View key={store.id} entering={FadeInDown.delay(idx * 60).springify()}>
                  <View style={bt.storeCard}>
                    <LinearGradient colors={["#A855F710", "#FF4FA308"]} style={StyleSheet.absoluteFill} />

                    {/* رأس البطاقة */}
                    <View style={bt.storeHeader}>
                      <View style={bt.storeLogoWrap}>
                        {store.logo_url ? (
                          <Image
                            source={{ uri: store.logo_url }}
                            style={bt.storeLogo}
                          />
                        ) : (
                          <MaterialCommunityIcons name="shopping-outline" size={28} color="#A855F7" />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={bt.storeName}>{store.name}</Text>
                        <View style={bt.storeMeta}>
                          <View style={bt.typeChip}>
                            <MaterialCommunityIcons name="tag-outline" size={11} color="#A855F7" />
                            <Text style={bt.typeChipText}>{STORE_TYPE_LABELS[store.type] ?? store.type}</Text>
                          </View>
                          {store.delivery_available && (
                            <View style={bt.deliveryChip}>
                              <MaterialCommunityIcons name="moped-outline" size={11} color={Colors.primary} />
                              <Text style={bt.deliveryChipText}>توصيل</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>

                    {store.description ? (
                      <Text style={bt.storeDesc} numberOfLines={2}>{store.description}</Text>
                    ) : null}

                    {/* معلومات */}
                    <View style={bt.storeInfoRow}>
                      {store.address ? (
                        <>
                          <MaterialCommunityIcons name="map-marker-outline" size={13} color={Colors.textMuted} />
                          <Text style={bt.storeInfoText} numberOfLines={1}>{store.address}</Text>
                        </>
                      ) : null}
                      {store.working_hours ? (
                        <>
                          <MaterialCommunityIcons name="clock-outline" size={13} color={Colors.textMuted} />
                          <Text style={bt.storeInfoText}>{store.working_hours}</Text>
                        </>
                      ) : null}
                    </View>

                    {/* شارة عدد المنتجات */}
                    {store.product_count > 0 && (
                      <View style={bt.productsBadge}>
                        <MaterialCommunityIcons name="hanger" size={13} color="#A855F7" />
                        <Text style={bt.productsBadgeText}>{store.product_count} منتج</Text>
                      </View>
                    )}

                    {/* أزرار */}
                    <View style={bt.storeActions}>
                      <AnimatedPress
                        style={{ flex: 1 }}
                        onPress={() => router.push({ pathname: "/stores", params: { openStoreId: String(store.id) } } as any)}
                      >
                        <LinearGradient colors={["#A855F7", "#7C3AED"]} style={bt.actionBtn}>
                          <MaterialCommunityIcons name="shopping-outline" size={15} color="#fff" />
                          <Text style={bt.actionBtnText}>تسوّقي الآن</Text>
                        </LinearGradient>
                      </AnimatedPress>
                      {store.phone ? (
                        <AnimatedPress
                          style={bt.callBtn}
                          onPress={() => handleCall(store.phone!)}
                        >
                          <MaterialCommunityIcons name="phone-outline" size={18} color="#A855F7" />
                        </AnimatedPress>
                      ) : null}
                    </View>
                  </View>
                </Animated.View>
              ))}

              {/* زر فتح بوتيك جديد */}
              <TouchableOpacity
                style={bt.addStoreRow}
                onPress={() => router.push("/store-portal" as any)}
              >
                <LinearGradient colors={["#A855F720", "transparent"]} style={StyleSheet.absoluteFill} />
                <MaterialCommunityIcons name="store-plus-outline" size={20} color="#A855F7" />
                <Text style={bt.addStoreText}>فتح بوتيكي الخاص</Text>
                <MaterialCommunityIcons name="chevron-left" size={18} color="#A855F7" />
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

      {/* ══ زر الانضمام العائم ══════════════════════════════════════════════ */}
      <TouchableOpacity
        style={jm.fab}
        activeOpacity={0.88}
        onPress={() => { setJoinDone(false); setJoinModal(true); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
      >
        <LinearGradient colors={["#FF4FA3", "#A855F7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={jm.fabGrad}>
          <MaterialCommunityIcons name="store-plus-outline" size={20} color="#fff" />
          <Text style={jm.fabText}>طلب الانضمام</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* ══ مودال السلة ══════════════════════════════════════════════════════ */}
      <Modal visible={cartOpen} animationType="slide" transparent onRequestClose={() => setCartOpen(false)}>
        <View style={sp.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setCartOpen(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={sp.modalSheet}>
            <LinearGradient colors={["#F8F3FF", "#FFFFFF"]} style={sp.modalInner}>
              {/* رأس */}
              <View style={sp.modalHeader}>
                <TouchableOpacity onPress={() => setCartOpen(false)} style={sp.closeBtn}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <Text style={sp.modalTitle}>🛒 سلة التسوق</Text>
              </View>

              {orderDone ? (
                <Animated.View entering={FadeIn} style={sp.successBox}>
                  <LinearGradient colors={["#A855F720", "#7C3AED10"]} style={sp.successIcon}>
                    <Ionicons name="checkmark-circle" size={56} color="#A855F7" />
                  </LinearGradient>
                  <Text style={sp.successTitle}>تم إرسال طلبك بنجاح!</Text>
                  <Text style={sp.successSub}>ستتواصل معك صاحبة المتجر قريباً لتأكيد الطلب والتوصيل.</Text>
                  <TouchableOpacity onPress={() => { setCartOpen(false); setOrderDone(false); setCheckoutOpen(false); }} style={sp.successBtn}>
                    <LinearGradient colors={["#A855F7", "#7C3AED"]} style={sp.successBtnGrad}>
                      <Text style={sp.successBtnText}>حسناً، شكراً!</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : cartCount(cart) === 0 ? (
                <View style={{ alignItems: "center", padding: 40, gap: 12 }}>
                  <MaterialCommunityIcons name="cart-off" size={52} color="#A855F750" />
                  <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textSecondary }}>السلة فارغة</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {Array.from(cart.values()).map(ci => (
                    <View key={ci.product.id} style={sp.cartItem}>
                      <Text style={{ fontSize: 22 }}>{ci.product.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={sp.cartItemName}>{ci.product.name}</Text>
                        <Text style={sp.cartItemPrice}>{(ci.product.price * ci.qty).toLocaleString("en-US")} ج</Text>
                      </View>
                      <View style={sp.qtyRow}>
                        <TouchableOpacity style={sp.qtyBtn} onPress={() => removeFromCart(ci.product.id)}>
                          <MaterialCommunityIcons name="minus" size={14} color="#A855F7" />
                        </TouchableOpacity>
                        <Text style={sp.qtyText}>{ci.qty}</Text>
                        <TouchableOpacity style={sp.qtyBtn} onPress={() => addToCart(ci.product)}>
                          <MaterialCommunityIcons name="plus" size={14} color="#A855F7" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  <View style={sp.cartTotal}>
                    <Text style={sp.cartTotalLabel}>الإجمالي</Text>
                    <Text style={sp.cartTotalValue}>{cartTotal(cart).toLocaleString("en-US")} ج</Text>
                  </View>

                  {/* بيانات الشراء */}
                  <Text style={sp.fieldLabel}>اسمك الكامل *</Text>
                  <TextInput style={sp.input} value={checkoutName} onChangeText={setCheckoutName} placeholder="فاطمة أحمد" placeholderTextColor={Colors.textMuted} textAlign="right" />
                  <Text style={sp.fieldLabel}>رقم الهاتف *</Text>
                  <TextInput style={sp.input} value={checkoutPhone} onChangeText={setCheckoutPhone} placeholder="0912345678" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign="right" />
                  <Text style={sp.fieldLabel}>العنوان للتوصيل (اختياري)</Text>
                  <TextInput style={sp.input} value={checkoutAddress} onChangeText={setCheckoutAddress} placeholder="الحصاحيصا — الحي الشرقي" placeholderTextColor={Colors.textMuted} textAlign="right" />
                  <Text style={sp.fieldLabel}>ملاحظات</Text>
                  <TextInput style={[sp.input, { minHeight: 70, textAlignVertical: "top" }]} value={checkoutNotes} onChangeText={setCheckoutNotes} placeholder="أي طلبات خاصة..." placeholderTextColor={Colors.textMuted} multiline textAlign="right" />

                  <TouchableOpacity
                    style={[sp.submitBtn, checkoutSending && { opacity: 0.6 }]}
                    onPress={submitOrder}
                    disabled={checkoutSending}
                  >
                    <LinearGradient colors={["#A855F7", "#7C3AED"]} style={sp.submitBtnGrad}>
                      {checkoutSending ? <ActivityIndicator color="#fff" /> : (
                        <><MaterialCommunityIcons name="send-outline" size={18} color="#fff" /><Text style={sp.submitBtnText}>إرسال الطلب</Text></>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                  <View style={{ height: 20 }} />
                </ScrollView>
              )}
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ══ مودال طلب فتح متجر ════════════════════════════════════════════════ */}
      <Modal visible={applyShopModal} animationType="slide" transparent onRequestClose={() => setApplyShopModal(false)}>
        <View style={sp.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setApplyShopModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={sp.modalSheet}>
            <LinearGradient colors={["#F8F3FF", "#FFFFFF"]} style={sp.modalInner}>
              <View style={sp.modalHeader}>
                <TouchableOpacity onPress={() => setApplyShopModal(false)} style={sp.closeBtn}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <Text style={sp.modalTitle}>🏪 فتح متجر في ركن المرأة</Text>
              </View>

              {applyDone ? (
                <Animated.View entering={FadeIn} style={sp.successBox}>
                  <LinearGradient colors={["#A855F720", "#7C3AED10"]} style={sp.successIcon}>
                    <Ionicons name="checkmark-circle" size={56} color="#A855F7" />
                  </LinearGradient>
                  <Text style={sp.successTitle}>تم استلام طلبك!</Text>
                  <Text style={sp.successSub}>ستتم مراجعة طلبك من الإدارة والتواصل معك خلال 24 ساعة.</Text>
                  <TouchableOpacity onPress={() => { setApplyShopModal(false); setApplyDone(false); }} style={sp.successBtn}>
                    <LinearGradient colors={["#A855F7", "#7C3AED"]} style={sp.successBtnGrad}>
                      <Text style={sp.successBtnText}>حسناً</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={sp.fieldLabel}>نوع المتجر *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                    {[
                      ["accessories","💍","إكسسوارات"], ["perfumes","🌹","عطور"], ["shoes","👠","أحذية"],
                      ["clothing","👗","ملابس"], ["bags","👜","حقائب"], ["jewelry","✨","مجوهرات"],
                      ["cosmetics","💄","مستحضرات"], ["general","🛒","متنوع"],
                    ].map(([key, emoji, label]) => (
                      <TouchableOpacity
                        key={key}
                        style={[sp.typeChip, applyCategory === key && { borderColor: "#A855F7", backgroundColor: "#A855F718" }]}
                        onPress={() => setApplyCategory(key)}
                      >
                        <Text style={{ fontSize: 16 }}>{emoji}</Text>
                        <Text style={[sp.typeChipText, applyCategory === key && { color: "#A855F7" }]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {[
                    { label: "اسم المتجر *", val: applyName, set: setApplyName, ph: "متجر لمياء" },
                    { label: "اسمك الكامل *", val: applyOwner, set: setApplyOwner, ph: "فاطمة محمد" },
                    { label: "رقم الهاتف *", val: applyPhone, set: setApplyPhone, ph: "0912345678", kb: "phone-pad" as const },
                    { label: "العنوان / الحي", val: applyAddress, set: setApplyAddress, ph: "الحصاحيصا — الحي الشرقي" },
                    { label: "ساعات العمل", val: applyHours, set: setApplyHours, ph: "9:00 - 21:00" },
                  ].map(f => (
                    <View key={f.label}>
                      <Text style={sp.fieldLabel}>{f.label}</Text>
                      <TextInput style={sp.input} value={f.val} onChangeText={f.set} placeholder={f.ph} placeholderTextColor={Colors.textMuted} keyboardType={(f as any).kb ?? "default"} textAlign="right" />
                    </View>
                  ))}

                  <Text style={sp.fieldLabel}>وصف المتجر</Text>
                  <TextInput style={[sp.input, { minHeight: 75, textAlignVertical: "top" }]} value={applyDesc} onChangeText={setApplyDesc} placeholder="اكتبي وصفاً مختصراً لمنتجاتك..." placeholderTextColor={Colors.textMuted} multiline textAlign="right" />

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <TouchableOpacity
                      style={[sp.toggleBtn, applyDelivery && { backgroundColor: "#A855F720", borderColor: "#A855F7" }]}
                      onPress={() => setApplyDelivery(!applyDelivery)}
                    >
                      <MaterialCommunityIcons name={applyDelivery ? "checkbox-marked" : "checkbox-blank-outline"} size={18} color={applyDelivery ? "#A855F7" : Colors.textMuted} />
                      <Text style={[sp.toggleText, applyDelivery && { color: "#A855F7" }]}>خدمة التوصيل متاحة</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[sp.submitBtn, applySending && { opacity: 0.6 }]}
                    onPress={submitApplyShop}
                    disabled={applySending}
                  >
                    <LinearGradient colors={["#A855F7", "#7C3AED"]} style={sp.submitBtnGrad}>
                      {applySending ? <ActivityIndicator color="#fff" /> : (
                        <><MaterialCommunityIcons name="send-outline" size={18} color="#fff" /><Text style={sp.submitBtnText}>إرسال طلب فتح المتجر</Text></>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                  <View style={{ height: 24 }} />
                </ScrollView>
              )}
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ══ مودال طلب منتج خاص ════════════════════════════════════════════════ */}
      <Modal visible={reqModal} animationType="slide" transparent onRequestClose={() => setReqModal(false)}>
        <View style={sp.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setReqModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={sp.modalSheet}>
            <LinearGradient colors={["#F0FDFA", "#FFFFFF"]} style={sp.modalInner}>
              <View style={sp.modalHeader}>
                <TouchableOpacity onPress={() => setReqModal(false)} style={sp.closeBtn}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <Text style={sp.modalTitle}>📋 طلب منتج خاص</Text>
              </View>

              {reqDone ? (
                <Animated.View entering={FadeIn} style={sp.successBox}>
                  <LinearGradient colors={["#14B8A620", "#0D948810"]} style={sp.successIcon}>
                    <Ionicons name="checkmark-circle" size={56} color="#14B8A6" />
                  </LinearGradient>
                  <Text style={[sp.successTitle, { color: "#14B8A6" }]}>تم إرسال طلبك!</Text>
                  <Text style={sp.successSub}>
                    {reqStore ? `ستتواصل معك ${reqStore.name} قريباً.` : "ستتواصل معك الإدارة للمساعدة في إيجاد المنتج."}
                  </Text>
                  <TouchableOpacity onPress={() => { setReqModal(false); setReqDone(false); }} style={sp.successBtn}>
                    <LinearGradient colors={["#14B8A6", "#0D9488"]} style={sp.successBtnGrad}>
                      <Text style={sp.successBtnText}>حسناً</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {reqStore && (
                    <View style={[sp.reqStoreBanner]}>
                      <MaterialCommunityIcons name="store-outline" size={18} color="#14B8A6" />
                      <Text style={sp.reqStoreText}>الطلب من: {reqStore.name}</Text>
                    </View>
                  )}

                  {[
                    { label: "اسمك الكامل *", val: reqName, set: setReqName, ph: "فاطمة أحمد" },
                    { label: "رقم الهاتف *", val: reqPhone, set: setReqPhone, ph: "0912345678", kb: "phone-pad" as const },
                  ].map(f => (
                    <View key={f.label}>
                      <Text style={sp.fieldLabel}>{f.label}</Text>
                      <TextInput style={sp.input} value={f.val} onChangeText={f.set} placeholder={f.ph} placeholderTextColor={Colors.textMuted} keyboardType={(f as any).kb ?? "default"} textAlign="right" />
                    </View>
                  ))}

                  <Text style={sp.fieldLabel}>وصف المنتج المطلوب *</Text>
                  <TextInput
                    style={[sp.input, { minHeight: 90, textAlignVertical: "top" }]}
                    value={reqDesc} onChangeText={setReqDesc}
                    placeholder="مثال: حذاء كعب أحمر مقاس 39، أو عطر برائحة زهر الياسمين..."
                    placeholderTextColor={Colors.textMuted} multiline textAlign="right"
                  />
                  <Text style={sp.fieldLabel}>الميزانية المتوقعة</Text>
                  <TextInput style={sp.input} value={reqBudget} onChangeText={setReqBudget} placeholder="مثال: 500 - 1000 جنيه" placeholderTextColor={Colors.textMuted} textAlign="right" />

                  <TouchableOpacity
                    style={[sp.submitBtn, reqSending && { opacity: 0.6 }]}
                    onPress={submitProductRequest}
                    disabled={reqSending}
                  >
                    <LinearGradient colors={["#14B8A6", "#0D9488"]} style={sp.submitBtnGrad}>
                      {reqSending ? <ActivityIndicator color="#fff" /> : (
                        <><MaterialCommunityIcons name="send-outline" size={18} color="#fff" /><Text style={sp.submitBtnText}>إرسال الطلب</Text></>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                  <View style={{ height: 24 }} />
                </ScrollView>
              )}
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ══ مودال الانضمام ══════════════════════════════════════════════════ */}
      <Modal
        visible={joinModal}
        animationType="slide"
        transparent
        onRequestClose={() => setJoinModal(false)}
      >
        <View style={jm.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setJoinModal(false)} />

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={jm.sheet}>
            <LinearGradient colors={["#1A0830", "#0A1A10"]} style={jm.sheetInner}>

              {/* رأس المودال */}
              <View style={jm.sheetHeader}>
                <TouchableOpacity onPress={() => setJoinModal(false)} style={jm.closeBtn}>
                  <Ionicons name="close" size={22} color={Colors.textMuted} />
                </TouchableOpacity>
                <View style={jm.sheetTitleWrap}>
                  <MaterialCommunityIcons name="store-plus-outline" size={24} color="#FF4FA3" />
                  <Text style={jm.sheetTitle}>طلب الانضمام لقسم المرأة</Text>
                </View>
              </View>

              {joinDone ? (
                /* ── شاشة النجاح ── */
                <Animated.View entering={FadeIn} style={jm.successBox}>
                  <LinearGradient colors={["#FF4FA320", "#A855F710"]} style={jm.successIconWrap}>
                    <Ionicons name="checkmark-circle" size={56} color="#FF4FA3" />
                  </LinearGradient>
                  <Text style={jm.successTitle}>تم إرسال طلبك بنجاح!</Text>
                  <Text style={jm.successSub}>
                    سيتم مراجعة طلبك من قِبل الإدارة والتواصل معكِ قريباً عبر الهاتف.
                  </Text>
                  <TouchableOpacity
                    style={jm.successBtn}
                    onPress={() => { setJoinModal(false); setJoinDone(false); }}
                  >
                    <LinearGradient colors={["#FF4FA3", "#A855F7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={jm.successBtnGrad}>
                      <Text style={jm.successBtnText}>حسناً، شكراً!</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {/* ── نوع الخدمة ── */}
                  <Text style={jm.fieldLabel}>نوع الخدمة *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                    {JOIN_TYPES.map(jt => (
                      <TouchableOpacity
                        key={jt.key}
                        style={[jm.typeChip, joinType === jt.key && { borderColor: "#FF4FA3", backgroundColor: "#FF4FA318" }]}
                        onPress={() => setJoinType(jt.key)}
                      >
                        <MaterialCommunityIcons name={jt.icon as any} size={16} color={joinType === jt.key ? "#FF4FA3" : Colors.textMuted} />
                        <Text style={[jm.typeChipText, joinType === jt.key && { color: "#FF4FA3" }]}>{jt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* ── الحقول ── */}
                  {[
                    { label: "الاسم الكامل *",          val: joinName,    set: setJoinName,    placeholder: "فاطمة أحمد"        },
                    { label: "رقم الهاتف *",             val: joinPhone,   set: setJoinPhone,   placeholder: "0912345678", kb: "phone-pad" as const },
                    { label: "الحي / المنطقة",           val: joinAddress, set: setJoinAddress, placeholder: "الحصاحيصا — الحي الشرقي" },
                  ].map(f => (
                    <View key={f.label} style={{ marginBottom: 12 }}>
                      <Text style={jm.fieldLabel}>{f.label}</Text>
                      <TextInput
                        style={jm.input}
                        value={f.val}
                        onChangeText={f.set}
                        placeholder={f.placeholder}
                        placeholderTextColor={Colors.textMuted}
                        keyboardType={f.kb ?? "default"}
                        textAlign="right"
                      />
                    </View>
                  ))}

                  <View style={{ marginBottom: 12 }}>
                    <Text style={jm.fieldLabel}>وصف الخدمة</Text>
                    <TextInput
                      style={[jm.input, { minHeight: 85, textAlignVertical: "top" }]}
                      value={joinDesc}
                      onChangeText={setJoinDesc}
                      placeholder="اكتبي نبذة عن خدمتك، أوقات العمل، الأسعار..."
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      textAlign="right"
                    />
                  </View>

                  {/* ── زر الإرسال ── */}
                  <TouchableOpacity
                    style={[jm.sendBtn, joinSending && { opacity: 0.6 }]}
                    onPress={submitJoinRequest}
                    disabled={joinSending}
                  >
                    <LinearGradient colors={["#FF4FA3", "#A855F7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={jm.sendBtnGrad}>
                      {joinSending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="send-outline" size={18} color="#fff" />
                          <Text style={jm.sendBtnText}>إرسال طلب الانضمام</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={{ height: 24 }} />
                        <OrgInviteCard />
</ScrollView>
              )}
            </LinearGradient>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 16, paddingBottom: 0 },
  headerTop: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  headerIcon: { width: 46, height: 46, borderRadius: Colors.radius.md, backgroundColor: "#FF4FA320", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#FF4FA340" },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },

  statsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: Colors.radius.md, padding: 14, marginBottom: 10, gap: 8 },
  statItem: { flex: 1, alignItems: "center" },
  statNum: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: "rgba(255,255,255,0.82)" },

  subTabRow: { flexDirection: "row", gap: 8, paddingBottom: 4, paddingHorizontal: 0 },
  subTab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10, paddingHorizontal: 14, borderRadius: Colors.radius.sm, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", overflow: "hidden" },
  subTabActive: { borderColor: "#FF4FA360" },
  subTabText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "rgba(255,255,255,0.75)" },

  searchSection: { backgroundColor: Colors.cardBg },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg, borderRadius: Colors.radius.sm, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, gap: 8, ...Colors.shadow.card },
  searchInput: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 15, color: Colors.textPrimary, paddingVertical: 11 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Colors.radius.pill, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  filterChipText: { fontFamily: "Cairo_500Medium", fontSize: 13, color: Colors.textSecondary },

  card: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 16, gap: 12, borderWidth: 1, overflow: "hidden", ...Colors.shadow.card },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconCircle: { width: 52, height: 52, borderRadius: Colors.radius.md, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  cardName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  typeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Colors.radius.sm },
  typeBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Colors.radius.sm, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.divider },
  tagText: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary },
  cardInfoRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardInfoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  cardActions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: Colors.radius.md, paddingVertical: 12 },
  actionBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  wideBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: Colors.radius.md, paddingVertical: 13 },

  emptyState: { alignItems: "center", paddingTop: 50, gap: 10 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: 16, color: Colors.textMuted },

  // Health tips
  tipCard: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 14, borderWidth: 1, overflow: "hidden", ...Colors.shadow.card },
  tipHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  tipIcon: { width: 44, height: 44, borderRadius: Colors.radius.md, justifyContent: "center", alignItems: "center" },
  tipTitle: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textPrimary, textAlign: "right" },
  tipBody: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.divider },
  tipBodyText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, lineHeight: 24, textAlign: "right" },

  // Recipes
  recipeCard: { backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 16, borderWidth: 1, borderColor: Colors.divider, overflow: "hidden", ...Colors.shadow.card },
  recipeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  recipeIcon: { width: 54, height: 54, borderRadius: Colors.radius.md, justifyContent: "center", alignItems: "center" },
  recipeName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  recipeTime: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary },
  recipeBody: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.divider, gap: 8 },
  recipeSubTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primary, textAlign: "right" },
  ingredientRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  ingredientDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  ingredientText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right" },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
  stepNum: { width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center", flexShrink: 0, marginTop: 2 },
  stepNumText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#000" },
  stepText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1, textAlign: "right", lineHeight: 22 },
});

// ── أنماط نموذج الانضمام ─────────────────────────────────────────────────────
const jm = StyleSheet.create({
  // بانر في قائمة الخدمات
  joinBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg,
    borderWidth: 1.5, borderColor: "#FF4FA340",
    padding: 14, marginBottom: 4, overflow: "hidden", ...Colors.shadow.card,
  },
  joinBannerIcon: {
    width: 50, height: 50, borderRadius: Colors.radius.md,
    backgroundColor: "#FF4FA318", borderWidth: 1.5, borderColor: "#FF4FA340",
    alignItems: "center", justifyContent: "center",
  },
  joinBannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#FF4FA3", textAlign: "right" },
  joinBannerSub:   { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "right", marginTop: 1 },
  joinBannerArrow: {
    width: 32, height: 32, borderRadius: Colors.radius.sm,
    backgroundColor: "#FF4FA318", alignItems: "center", justifyContent: "center",
  },

  // زر عائم
  fab: {
    position: "absolute", bottom: 24, alignSelf: "center",
    borderRadius: Colors.radius.pill, overflow: "hidden",
    ...Colors.shadow.raised,
    shadowColor: "#FF4FA3",
  },
  fabGrad: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  fabText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // مودال
  overlay: {
    flex: 1, backgroundColor: "#00000088",
    justifyContent: "flex-end",
  },
  sheet: { maxHeight: "92%" },
  sheetInner: {
    borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl,
    padding: 20, paddingBottom: 36,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 20,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: Colors.radius.sm,
    backgroundColor: Colors.cardBg, alignItems: "center", justifyContent: "center",
  },
  sheetTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },

  // حقول
  fieldLabel: {
    fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary,
    textAlign: "right", marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.bg, borderRadius: Colors.radius.md, borderWidth: 1.5, borderColor: Colors.divider,
    color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.divider, borderRadius: Colors.radius.md,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg,
  },
  typeChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },

  // زر الإرسال
  sendBtn: { borderRadius: Colors.radius.lg, overflow: "hidden", marginTop: 4 },
  sendBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15,
  },
  sendBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  // نجاح
  successBox: { alignItems: "center", paddingVertical: 32, gap: 14 },
  successIconWrap: {
    width: 100, height: 100, borderRadius: Colors.radius.xl,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FF4FA340",
  },
  successTitle: { fontFamily: "Cairo_800ExtraBold", fontSize: 22, color: "#FF4FA3", textAlign: "center" },
  successSub: {
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary,
    textAlign: "center", lineHeight: 22, paddingHorizontal: 16,
  },
  successBtn: { borderRadius: Colors.radius.lg, overflow: "hidden", marginTop: 8, width: "80%" },
  successBtnGrad: { paddingVertical: 14, alignItems: "center" },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});

// ── أنماط قسم الأعمال اليدوية ────────────────────────────────────────────────
const hm = StyleSheet.create({
  introBanner: {
    borderRadius: Colors.radius.lg, padding: 20, alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: "#14B8A630", overflow: "hidden",
    backgroundColor: Colors.cardBg, ...Colors.shadow.card,
  },
  introTitle: { fontFamily: "Cairo_800ExtraBold", fontSize: 22, color: "#14B8A6", textAlign: "center" },
  introSub: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary,
    textAlign: "center", lineHeight: 22,
  },

  catChip: {
    flexDirection: "column", alignItems: "center", gap: 6,
    borderRadius: Colors.radius.lg, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.divider,
    minWidth: 84, overflow: "hidden",
  },
  catLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 11 },

  emptyBanner: {
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 28,
    alignItems: "center", gap: 10,
    borderWidth: 1.5, borderColor: "#14B8A620", ...Colors.shadow.card,
  },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
  emptyBtn: { borderRadius: Colors.radius.md, overflow: "hidden", marginTop: 8, width: "100%" },
  emptyBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
  },
  emptyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  tipCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "#F0A50010", borderRadius: Colors.radius.md, padding: 14,
    borderWidth: 1, borderColor: "#F0A50030",
  },
  tipText: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13,
    color: Colors.textSecondary, lineHeight: 22, textAlign: "right",
  },
});

// ── أنماط قسم المتاجر ────────────────────────────────────────────────────────
const sp = StyleSheet.create({
  // فلتر الفئات
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Colors.radius.pill, backgroundColor: Colors.cardBg,
    borderWidth: 1, borderColor: Colors.divider,
  },
  catChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },

  // بانرات
  addBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg,
    borderWidth: 1.5, borderColor: "#A855F740", padding: 14, overflow: "hidden", ...Colors.shadow.card,
  },
  addBannerTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#A855F7", textAlign: "right" },
  addBannerSub:   { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "right", marginTop: 2 },
  reqBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#14B8A608", borderRadius: Colors.radius.md,
    borderWidth: 1, borderColor: "#14B8A630", padding: 12, overflow: "hidden",
  },
  reqBannerText: { flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#14B8A6", textAlign: "right" },

  // بطاقة متجر
  shopCard: {
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 16, gap: 10,
    borderWidth: 1, borderColor: "#A855F730", overflow: "hidden", ...Colors.shadow.card,
  },
  shopHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  shopLogoWrap: {
    width: 60, height: 60, borderRadius: Colors.radius.md,
    backgroundColor: "#A855F710", borderWidth: 1, borderColor: "#A855F730",
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  shopLogo: { width: 60, height: 60, borderRadius: Colors.radius.md },
  shopName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  shopMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  featuredBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#F0A50018", paddingHorizontal: 7, paddingVertical: 3, borderRadius: Colors.radius.sm,
  },
  featuredText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: "#F0A500" },
  catBadge: { backgroundColor: "#A855F718", paddingHorizontal: 8, paddingVertical: 3, borderRadius: Colors.radius.sm },
  catBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#A855F7" },
  deliveryBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.successSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Colors.radius.sm,
  },
  deliveryText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary },
  productCount: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  shopDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },
  shopInfo: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  shopInfoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  shopActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  shopBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: Colors.radius.md, paddingVertical: 11,
  },
  shopBtnText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  reqBtn: {
    width: 40, height: 40, borderRadius: Colors.radius.md,
    borderWidth: 1.5, borderColor: "#A855F740", backgroundColor: "#A855F710",
    justifyContent: "center", alignItems: "center",
  },
  callBtn: {
    width: 40, height: 40, borderRadius: Colors.radius.md,
    borderWidth: 1.5, borderColor: Colors.borderSubtle, backgroundColor: Colors.successSoft,
    justifyContent: "center", alignItems: "center",
  },

  // لوحة المنتجات
  productsPanel: {
    backgroundColor: Colors.bg, borderRadius: Colors.radius.lg,
    borderWidth: 1, borderColor: "#A855F730", padding: 14, gap: 10,
    marginTop: -6,
  },
  productsPanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  productsPanelTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  noProductsText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted, textAlign: "center", padding: 20 },
  cartBadgeBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#A855F7", borderRadius: Colors.radius.sm, paddingHorizontal: 10, paddingVertical: 5,
  },
  cartBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },

  // بطاقة منتج
  productCard: {
    width: 130, backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md,
    padding: 10, gap: 6, borderWidth: 1, borderColor: Colors.divider, ...Colors.shadow.card,
  },
  productImage: { width: "100%", height: 90, borderRadius: Colors.radius.sm, resizeMode: "cover" },
  productEmoji: {
    width: "100%", height: 90, borderRadius: Colors.radius.sm,
    backgroundColor: "#A855F710", justifyContent: "center", alignItems: "center",
  },
  productName: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textPrimary, textAlign: "right" },
  productPriceRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  productPrice: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#A855F7" },
  productOriginalPrice: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted, textDecorationLine: "line-through" },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#A855F710", borderRadius: Colors.radius.sm, padding: 4 },
  qtyBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.cardBg, justifyContent: "center", alignItems: "center" },
  qtyText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#A855F7" },
  addToCartBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
    backgroundColor: "#A855F7", borderRadius: Colors.radius.sm, paddingVertical: 6,
  },
  addToCartText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },

  // بانر الدفع
  checkoutBanner: {
    flexDirection: "row", alignItems: "center", gap: 8, borderRadius: Colors.radius.md,
    paddingHorizontal: 14, paddingVertical: 12, overflow: "hidden", ...Colors.shadow.card,
  },
  checkoutBannerText: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },

  // empty
  emptyBox: { alignItems: "center", gap: 10, paddingVertical: 40 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textSecondary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },

  // مودالات
  modalOverlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  modalSheet: { maxHeight: "92%" },
  modalInner: { borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: Colors.radius.sm, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },

  // عناصر السلة
  cartItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: Colors.bg, borderRadius: Colors.radius.md, marginBottom: 8 },
  cartItemName: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: Colors.textPrimary, textAlign: "right" },
  cartItemPrice: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#A855F7" },
  cartTotal: { flexDirection: "row", justifyContent: "space-between", padding: 14, backgroundColor: "#A855F710", borderRadius: Colors.radius.md, marginBottom: 16 },
  cartTotalLabel: { fontFamily: "Cairo_700Bold", fontSize: 15, color: Colors.textSecondary },
  cartTotalValue: { fontFamily: "Cairo_800ExtraBold", fontSize: 16, color: "#A855F7" },

  // حقول
  fieldLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "right", marginBottom: 6 },
  input: {
    backgroundColor: Colors.bg, borderRadius: Colors.radius.md, borderWidth: 1.5, borderColor: Colors.divider,
    color: Colors.textPrimary, fontFamily: "Cairo_400Regular", fontSize: 14,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.divider, borderRadius: Colors.radius.md,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.bg,
  },
  typeChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textMuted },
  toggleBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: Colors.radius.md,
    borderWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.bg,
  },
  toggleText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textMuted },

  // زر الإرسال
  submitBtn: { borderRadius: Colors.radius.lg, overflow: "hidden", marginTop: 4 },
  submitBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },

  // نجاح
  successBox: { alignItems: "center", paddingVertical: 32, gap: 14 },
  successIcon: { width: 100, height: 100, borderRadius: Colors.radius.xl, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#A855F740" },
  successTitle: { fontFamily: "Cairo_800ExtraBold", fontSize: 22, color: "#A855F7", textAlign: "center" },
  successSub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center", lineHeight: 22, paddingHorizontal: 16 },
  successBtn: { borderRadius: Colors.radius.lg, overflow: "hidden", marginTop: 8, width: "80%" },
  successBtnGrad: { paddingVertical: 14, alignItems: "center" },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  // طلب متجر
  reqStoreBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#14B8A610", borderRadius: Colors.radius.md, padding: 10, marginBottom: 12,
  },
  reqStoreText: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: "#14B8A6", flex: 1, textAlign: "right" },
});

// ── أنماط قسم البوتيكات ───────────────────────────────────────────────────────
const bt = StyleSheet.create({
  introBanner: {
    borderRadius: Colors.radius.lg, padding: 20, alignItems: "center", gap: 6,
    borderWidth: 1.5, borderColor: "#A855F730", overflow: "hidden",
    backgroundColor: Colors.cardBg, ...Colors.shadow.card,
  },
  introTitle: { fontFamily: "Cairo_800ExtraBold", fontSize: 22, color: "#A855F7", textAlign: "center" },
  introSub: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary,
    textAlign: "center", lineHeight: 22,
  },

  emptyBanner: {
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 28,
    alignItems: "center", gap: 10,
    borderWidth: 1.5, borderColor: "#A855F720", ...Colors.shadow.card,
  },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 22 },
  openStoreBtn: { borderRadius: Colors.radius.md, overflow: "hidden", marginTop: 8, width: "100%" },
  openStoreBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
  },
  openStoreBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },

  storeCard: {
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 16, gap: 10,
    borderWidth: 1, borderColor: "#A855F730", overflow: "hidden", ...Colors.shadow.card,
  },
  storeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  storeLogoWrap: {
    width: 56, height: 56, borderRadius: Colors.radius.md,
    backgroundColor: "#A855F718", borderWidth: 1, borderColor: "#A855F730",
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  storeLogo: { width: 56, height: 56, borderRadius: Colors.radius.md },
  storeName: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary, textAlign: "right" },
  storeMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#A855F718", paddingHorizontal: 8, paddingVertical: 3, borderRadius: Colors.radius.sm,
  },
  typeChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "#A855F7" },
  deliveryChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.successSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Colors.radius.sm,
  },
  deliveryChipText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary },
  storeDesc: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, lineHeight: 22, textAlign: "right" },
  storeInfoRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  storeInfoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  productsBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end",
    backgroundColor: "#A855F712", paddingHorizontal: 10, paddingVertical: 4, borderRadius: Colors.radius.sm,
  },
  productsBadgeText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#A855F7" },
  storeActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: Colors.radius.md, paddingVertical: 12,
  },
  actionBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#fff" },
  callBtn: {
    width: 44, height: 44, borderRadius: Colors.radius.md,
    borderWidth: 1.5, borderColor: "#A855F740", backgroundColor: "#A855F710",
    justifyContent: "center", alignItems: "center",
  },

  addStoreRow: {
    flexDirection: "row", alignItems: "center", gap: 10, justifyContent: "center",
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg, padding: 16,
    borderWidth: 1, borderColor: "#A855F730", overflow: "hidden", ...Colors.shadow.card,
  },
  addStoreText: { fontFamily: "Cairo_600SemiBold", fontSize: 14, color: "#A855F7", flex: 1, textAlign: "center" },
});
