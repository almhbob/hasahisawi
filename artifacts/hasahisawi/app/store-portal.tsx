import { filePart } from "@/lib/xplatform";
import { PauseControl } from "@/components/EntityNotice";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Modal,
  Alert,
  StyleSheet,
  RefreshControl,
  Linking,
  Image,
} from "react-native";
import { uploadFile } from "@/lib/firebase/storage";
import { compressImage, uploadErrorMessage } from "@/lib/compress-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import ModernHeader from "@/components/ui/ModernHeader";
import RtlScrollRow from "@/components/ui/RtlScrollRow";

// ─── Types ───────────────────────────────────────────────────────────────────

type StoreType =
  | "restaurant"
  | "cafe"
  | "boutique"
  | "grocery"
  | "pharmacy"
  | "sweets"
  | "electronics"
  | "general";

type MyStore = {
  id: number;
  name: string;
  type: StoreType;
  description: string;
  logo_url: string | null;
  cover_url: string | null;
  phone: string;
  address: string;
  working_hours: string;
  delivery_available: boolean;
  min_order: number;
  delivery_fee: number;
  status: "pending" | "active" | "suspended";
  created_at: string;
};

type Category = {
  id: number;
  name: string;
  sort_order: number;
};

type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  category_id: number | null;
  category_name?: string;
  is_available: boolean;
  gallery?: string[];
  old_price?: number | null;
  stock?: number | null;
  is_featured?: boolean;
};

type OrderItem = {
  name: string;
  qty: number;
  price: number;
};

type Order = {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_notes: string;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: "pending" | "confirmed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";
  created_at: string;
};

type TabKey = "overview" | "products" | "orders" | "settings";

// ─── Constants ───────────────────────────────────────────────────────────────

const STORE_TYPES: { key: StoreType; label: string; icon: string }[] = [
  { key: "restaurant", label: "مطعم", icon: "🍽️" },
  { key: "cafe", label: "كافتيريا", icon: "☕" },
  { key: "boutique", label: "بوتيك", icon: "👗" },
  { key: "grocery", label: "بقالة", icon: "🛒" },
  { key: "pharmacy", label: "صيدلية", icon: "💊" },
  { key: "sweets", label: "حلويات", icon: "🍰" },
  { key: "electronics", label: "إلكترونيات", icon: "📱" },
  { key: "general", label: "عام", icon: "🏪" },
];

const ORDER_STATUS_LABELS: Record<Order["status"], string> = {
  pending: "معلق",
  confirmed: "مؤكد",
  preparing: "جارٍ التجهيز",
  out_for_delivery: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};

const ORDER_STATUS_COLORS: Record<Order["status"], string> = {
  pending: "#FFC20A",
  confirmed: "#3B82F6",
  preparing: "#F97316",
  out_for_delivery: "#1F5C8A",
  delivered: "#009B67",
  cancelled: "#EF4444",
};

const CARD_SHADOW = {
  elevation: 2,
  shadowColor: "#14231D",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StorePortalScreen() {
  const { user, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // مدير التطبيق يفتح لوحة أي متجر: /store-portal?store=ID
  const { store: manageParam } = useLocalSearchParams<{ store?: string }>();
  const manageId = user?.role === "admin" && manageParam && /^\d+$/.test(String(manageParam)) ? String(manageParam) : null;

  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<MyStore | null>(null);
  const [noStore, setNoStore] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [refreshing, setRefreshing] = useState(false);

  const authHeader: Record<string, string> = manageId
    ? { Authorization: `Bearer ${token}`, "X-Manage-Store": manageId }
    : { Authorization: `Bearer ${token}` };
  const apiBase = getApiUrl();

  const fetchStore = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/store/my`, { headers: authHeader });
      if (res.status === 404) {
        setNoStore(true);
        setStore(null);
      } else if (res.ok) {
        const data = await res.json();
        setStore(data);
        setNoStore(false);
      } else {
        Alert.alert("خطأ", "تعذّر تحميل بيانات المتجر");
      }
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    fetchStore();
  }, [fetchStore]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStore();
  };

  if (loading) {
    return (
      <View style={[styles.centerFlex, { backgroundColor: Colors.bg }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>جاري التحميل…</Text>
      </View>
    );
  }

  if (noStore) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <ModernHeader
          title="بوابة المتجر"
          subtitle="سجّل متجرك الآن"
          showBack
          onBack={() => router.back()}
          gradient={Colors.gradients.brand}
        />
        <RegisterStoreView
          apiBase={apiBase}
          authHeader={authHeader}
          onSuccess={() => fetchStore()}
        />
      </View>
    );
  }

  if (store?.status === "pending") {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <ModernHeader
          title="بوابة المتجر"
          subtitle="قيد المراجعة"
          showBack
          onBack={() => router.back()}
          gradient={Colors.gradients.brand}
        />
        <PendingView store={store} onRefresh={() => { setRefreshing(true); fetchStore(); }} refreshing={refreshing} />
      </View>
    );
  }

  const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "overview", label: "الرئيسية", icon: "grid-outline" },
    { key: "products", label: "المنتجات", icon: "cube-outline" },
    { key: "orders", label: "الطلبات", icon: "receipt-outline" },
    { key: "settings", label: "الإعدادات", icon: "settings-outline" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <ModernHeader
        title={store?.name ?? "بوابة المتجر"}
        subtitle={manageId ? "لوحة التحكم · بصلاحية مدير التطبيق" : "لوحة التحكم"}
        showBack
        onBack={() => router.back()}
        gradient={Colors.gradients.brand}
      />

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons
                name={tab.icon}
                size={18}
                color={isActive ? Colors.primary : Colors.textMuted}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab Content */}
      {activeTab === "overview" && store && (
        <OverviewTab
          store={store}
          onStoreChange={setStore}
          apiBase={apiBase}
          authHeader={authHeader}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}
      {activeTab === "products" && store && (
        <ProductsTab
          storeId={store.id}
          apiBase={apiBase}
          authHeader={authHeader}
        />
      )}
      {activeTab === "orders" && store && (
        <OrdersTab
          apiBase={apiBase}
          authHeader={authHeader}
        />
      )}
      {activeTab === "settings" && store && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}><PauseControl type="store" id={store.id} /></View>
      )}
      {activeTab === "settings" && store && (
        <SettingsTab
          store={store}
          apiBase={apiBase}
          authHeader={authHeader}
          onSaved={(updated) => setStore(updated)}
        />
      )}
    </View>
  );
}

// ─── Register Store View ──────────────────────────────────────────────────────

function RegisterStoreView({
  apiBase,
  authHeader,
  onSuccess,
}: {
  apiBase: string;
  authHeader: Record<string, string>;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<StoreType>("general");
  const routerNav = useRouter();
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [womenOnly, setWomenOnly] = useState(false);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setLogoUri(await compressImage(result.assets[0], 800));
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال اسم المتجر");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("type", type);
      form.append("description", description.trim());
      form.append("phone", phone.trim());
      form.append("address", address.trim());
      form.append("working_hours", workingHours.trim());
      form.append("delivery_available", deliveryAvailable ? "true" : "false");
      form.append("min_order", minOrder || "0");
      form.append("delivery_fee", deliveryFee || "0");
      form.append("women_only", womenOnly ? "true" : "false");
      if (logoUri) {
        form.append("logo", await filePart(logoUri, "logo.jpg", "image/jpeg"));
      }
      const res = await fetch(`${apiBase}/api/store/register`, {
        method: "POST",
        headers: { ...authHeader },
        body: form,
      });
      if (res.ok) {
        Alert.alert("تم الإرسال", "تم إرسال طلب تسجيل المتجر بنجاح، سيتم مراجعته قريباً.");
        onSuccess();
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("خطأ", err?.error || "تعذّر إرسال الطلب");
      }
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Card 1: Store Info */}
      <Animated.View entering={FadeInDown.springify().delay(50)} style={styles.card}>
        <Text style={styles.cardTitle}>معلومات المتجر</Text>

        <Text style={styles.fieldLabel}>اسم المتجر *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="أدخل اسم المتجر"
          placeholderTextColor={Colors.textMuted}
          textAlign="right"
        />

        <Text style={styles.fieldLabel}>نوع المتجر</Text>
        {/* المطاعم والكافتيريات تُسجَّل من قسمها الخاص لتظهر فيه مع قائمة الطعام والطلبات */}
        <TouchableOpacity onPress={() => routerNav.push("/(tabs)/restaurants" as any)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#E8A90018", borderRadius: 12, padding: 10, marginBottom: 8 }}>
          <Ionicons name="restaurant-outline" size={18} color="#8A6A00" />
          <Text style={{ flex: 1, fontFamily: "Cairo_600SemiBold", fontSize: 12, color: "#5C4600", textAlign: "right" }}>مطعم أو كافتيريا؟ سجّله من قسم «المطاعم والكافيهات» ليظهر هناك مع قائمة الطعام</Text>
          <Ionicons name="chevron-back" size={16} color="#8A6A00" />
        </TouchableOpacity>
        <View style={styles.typeGrid}>
          {STORE_TYPES.filter((st) => st.key !== "restaurant" && st.key !== "cafe").map((st) => (
            <TouchableOpacity
              key={st.key}
              style={[styles.typeBtn, type === st.key && styles.typeBtnActive]}
              onPress={() => setType(st.key)}
            >
              <Text style={styles.typeEmoji}>{st.icon}</Text>
              <Text style={[styles.typeLabel, type === st.key && styles.typeLabelActive]}>
                {st.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>وصف المتجر</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="وصف مختصر عن المتجر"
          placeholderTextColor={Colors.textMuted}
          multiline
          numberOfLines={3}
          textAlign="right"
          textAlignVertical="top"
        />

        <Text style={styles.fieldLabel}>رقم الهاتف</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="09xxxxxxxxx"
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
          textAlign="right"
        />

        <Text style={styles.fieldLabel}>العنوان</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="عنوان المتجر"
          placeholderTextColor={Colors.textMuted}
          textAlign="right"
        />
      </Animated.View>

      {/* Card 2: Delivery Settings */}
      <Animated.View entering={FadeInDown.springify().delay(100)} style={styles.card}>
        <Text style={styles.cardTitle}>إعدادات التوصيل</Text>

        <View style={styles.switchRow}>
          <Switch
            value={deliveryAvailable}
            onValueChange={setDeliveryAvailable}
            trackColor={{ false: Colors.divider, true: Colors.primary + "40" }}
            thumbColor={deliveryAvailable ? Colors.primary : "#999"}
          />
          <Text style={styles.switchLabel}>تفعيل خدمة التوصيل</Text>
        </View>

        {deliveryAvailable && (
          <>
            <Text style={styles.fieldLabel}>رسوم التوصيل (ج.س)</Text>
            <TextInput
              style={styles.input}
              value={deliveryFee}
              onChangeText={setDeliveryFee}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>الحد الأدنى للطلب (ج.س)</Text>
            <TextInput
              style={styles.input}
              value={minOrder}
              onChangeText={setMinOrder}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              textAlign="right"
            />
          </>
        )}

        <Text style={styles.fieldLabel}>ساعات العمل</Text>
        <TextInput
          style={styles.input}
          value={workingHours}
          onChangeText={setWorkingHours}
          placeholder="مثال: 8ص - 10م"
          placeholderTextColor={Colors.textMuted}
          textAlign="right"
        />

        <View style={[styles.switchRow, { marginTop: 8, borderRadius: Colors.radius.md, backgroundColor: "#3B78A610", padding: 12, borderWidth: 1, borderColor: "#3B78A630" }]}>
          <Switch
            value={womenOnly}
            onValueChange={setWomenOnly}
            trackColor={{ false: Colors.divider, true: "#3B78A640" }}
            thumbColor={womenOnly ? "#3B78A6" : "#999"}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.switchLabel, { color: "#3B78A6" }]}>متجر نسائي خاص 🌸</Text>
            <Text style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted, textAlign: "right", marginTop: 2 }}>
              سيظهر في قسم ركن المرأة ضمن البوتيكات النسائية
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Card 3: Logo */}
      <Animated.View entering={FadeInDown.springify().delay(150)} style={styles.card}>
        <Text style={styles.cardTitle}>شعار المتجر</Text>
        <TouchableOpacity style={styles.imagePicker} onPress={pickLogo}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <Ionicons name="image-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.imagePickerText}>اختر شعار المتجر</Text>
            </View>
          )}
        </TouchableOpacity>
        {logoUri && (
          <TouchableOpacity onPress={pickLogo} style={styles.changeImageBtn}>
            <Text style={styles.changeImageText}>تغيير الصورة</Text>
          </TouchableOpacity>
        )}
      </Animated.View>

      {/* Submit Button */}
      <Animated.View entering={FadeInDown.springify().delay(200)}>
        <TouchableOpacity
          style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>إرسال الطلب</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

// ─── Pending View ─────────────────────────────────────────────────────────────

function PendingView({
  store,
  onRefresh,
  refreshing,
}: {
  store: MyStore;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, styles.centerContent]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
      }
    >
      <Animated.View entering={FadeInDown.springify()} style={styles.pendingWrap}>
        <Text style={styles.pendingIcon}>⏳</Text>
        <Text style={styles.pendingTitle}>طلبك قيد المراجعة</Text>
        <Text style={styles.pendingSubtitle}>
          سيتم مراجعة طلب تسجيل متجرك من قِبل الإدارة وإخطارك عند القبول.
        </Text>

        <View style={styles.card}>
          <InfoRow label="اسم المتجر" value={store.name} />
          <InfoRow label="النوع" value={STORE_TYPES.find((t) => t.key === store.type)?.label ?? store.type} />
          {store.phone ? <InfoRow label="الهاتف" value={store.phone} /> : null}
          {store.address ? <InfoRow label="العنوان" value={store.address} /> : null}
        </View>

        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 8 }]} onPress={onRefresh}>
          <Ionicons name="refresh" size={18} color="#fff" style={{ marginLeft: 6 }} />
          <Text style={styles.primaryBtnText}>تحديث الحالة</Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  store,
  onStoreChange,
  apiBase,
  authHeader,
  onRefresh,
  refreshing,
}: {
  store: MyStore;
  onStoreChange: (s: MyStore) => void;
  apiBase: string;
  authHeader: Record<string, string>;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const load = useCallback(async () => {
    try {
      const [ordRes, prodRes] = await Promise.all([
        fetch(`${apiBase}/api/store/my/orders`, { headers: authHeader }),
        fetch(`${apiBase}/api/store/my/products`, { headers: authHeader }),
      ]);
      if (ordRes.ok) setOrders(await ordRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
    } catch {}
    setLoadingData(false);
  }, [apiBase, authHeader]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toDateString();
  const todayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === today);
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const todaySales = todayOrders.reduce((sum, o) => sum + o.total, 0);
  const lastFive = [...orders].sort((a, b) => b.id - a.id).slice(0, 5);

  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { onRefresh(); load(); }}
          tintColor={Colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {loadingData ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <StoreBrandCard store={store} apiBase={apiBase} authHeader={authHeader} onChange={onStoreChange} />
          {/* Stats Grid */}
          <Animated.View entering={FadeInDown.springify().delay(50)} style={styles.statsGrid}>
            <StatCard label="طلبات اليوم" value={todayOrders.length.toString()} icon="receipt-outline" color={Colors.primary} />
            <StatCard label="طلبات معلّقة" value={pendingOrders.length.toString()} icon="time-outline" color="#FFC20A" />
            <StatCard label="مبيعات اليوم" value={`${todaySales.toFixed(0)} ج.س`} icon="cash-outline" color={Colors.primary} />
            <StatCard label="المنتجات" value={products.length.toString()} icon="cube-outline" color={Colors.primaryDeep} />
          </Animated.View>

          {/* Last Orders */}
          <Animated.View entering={FadeInDown.springify().delay(100)}>
            <Text style={styles.sectionTitle}>آخر الطلبات</Text>
            {lastFive.length === 0 ? (
              <EmptyState icon="receipt-outline" message="لا توجد طلبات بعد" />
            ) : (
              lastFive.map((order, i) => (
                <Animated.View
                  key={order.id}
                  entering={FadeInDown.springify().delay(120 + i * 40)}
                >
                  <MiniOrderCard order={order} />
                </Animated.View>
              ))
            )}
          </Animated.View>
        </>
      )}
    </ScrollView>
  );
}

/** هوية المتجر: الشعار والغلاف كما يراهما العملاء، مع تغييرهما مباشرة */
function StoreBrandCard({ store, apiBase, authHeader, onChange }: { store: MyStore; apiBase: string; authHeader: Record<string, string>; onChange: (s: MyStore) => void }) {
  const [busy, setBusy] = useState<"" | "logo" | "cover">("");
  const send = async (kind: "logo" | "cover", uri: string | null) => {
    setBusy(kind);
    try {
      const form = new FormData();
      if (uri) form.append(kind, await filePart(uri, `${kind}.jpg`, "image/jpeg"));
      else form.append(`remove_${kind}`, "true");
      const r = await fetch(`${apiBase}/api/store/my`, { method: "PUT", headers: { ...authHeader }, body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 413 ? "الصورة كبيرة جداً، اختر صورة أصغر" : j?.error || "تعذّر الحفظ");
      onChange(j);
    } catch (e: any) { Alert.alert("تعذّر التحديث", e?.message || ""); }
    finally { setBusy(""); }
  };
  const pick = async (kind: "logo" | "cover") => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images" as any, quality: 0.85, allowsEditing: true, aspect: kind === "logo" ? [1, 1] : [16, 9] });
    if (!r.canceled && r.assets[0]) send(kind, await compressImage(r.assets[0], kind === "logo" ? 800 : 1600));
  };
  const logoMenu = () => {
    if (!store.logo_url) { pick("logo"); return; }
    Alert.alert("شعار المتجر", "يظهر في سوق المتاجر وصفحة متجرك والسلة والطلبات", [
      { text: "تغيير الشعار", onPress: () => pick("logo") },
      { text: "إزالة الشعار", style: "destructive", onPress: () => send("logo", null) },
      { text: "إلغاء", style: "cancel" },
    ]);
  };
  const initial = (store.name || "م").trim().charAt(0);
  return (
    <Animated.View entering={FadeInDown.springify()} style={brand.card}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => pick("cover")} style={brand.cover} accessibilityRole="button" accessibilityLabel="تغيير صورة الغلاف">
        {store.cover_url ? <Image source={{ uri: store.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.primaryDeep }]} />}
        <View style={brand.coverBtn}>
          {busy === "cover" ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="image-outline" size={14} color="#fff" />}
          <Text style={brand.coverBtnT}>{store.cover_url ? "تغيير الغلاف" : "إضافة غلاف"}</Text>
        </View>
      </TouchableOpacity>
      <View style={brand.row}>
        <TouchableOpacity onPress={logoMenu} style={brand.logo} accessibilityRole="button" accessibilityLabel={store.logo_url ? "تغيير شعار المتجر" : "إضافة شعار المتجر"}>
          {store.logo_url ? <Image source={{ uri: store.logo_url }} style={brand.logoImg} /> : <Text style={brand.initial}>{initial}</Text>}
          <View style={brand.cam}>{busy === "logo" ? <ActivityIndicator size="small" color="#3D2C00" /> : <Ionicons name="camera" size={13} color="#3D2C00" />}</View>
        </TouchableOpacity>
        <View style={{ flex: 1, paddingTop: 30 }}>
          <Text style={brand.name} numberOfLines={1}>{store.name}</Text>
          <Text style={brand.hint}>{store.logo_url ? "اضغط الشعار لتغييره أو إزالته" : "أضف شعار متجرك ليتعرّف عليك العملاء في السوق"}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const brand = StyleSheet.create({
  card: { backgroundColor: Colors.cardBg, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: Colors.divider, marginBottom: 14 },
  cover: { height: 110, justifyContent: "flex-start", alignItems: "flex-start", padding: 10 },
  coverBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  coverBtnT: { fontFamily: "Cairo_600SemiBold", fontSize: 11.5, color: "#fff" },
  row: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12, paddingHorizontal: 14, paddingBottom: 14, marginTop: -36 },
  logo: { width: 76, height: 76, borderRadius: 24, backgroundColor: Colors.primary, borderWidth: 3, borderColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },
  logoImg: { width: 70, height: 70, borderRadius: 21 },
  initial: { fontFamily: "Cairo_700Bold", fontSize: 30, color: "#fff" },
  cam: { position: "absolute", bottom: -4, left: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: "#E8A900", borderWidth: 2, borderColor: Colors.cardBg, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: "Cairo_700Bold", fontSize: 17, color: Colors.textPrimary, textAlign: "right" },
  hint: { fontFamily: "Cairo_500Medium", fontSize: 12, color: Colors.textMuted, textAlign: "right" },
});

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  return (
    <View style={[styles.statCard, CARD_SHADOW]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniOrderCard({ order }: { order: Order }) {
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  return (
    <View style={[styles.miniOrderCard, CARD_SHADOW]}>
      <View style={styles.miniOrderRow}>
        <View style={[styles.statusDot, { backgroundColor: ORDER_STATUS_COLORS[order.status] }]} />
        <Text style={styles.miniOrderStatus}>{ORDER_STATUS_LABELS[order.status]}</Text>
        <Text style={styles.miniOrderId}>#{order.id}</Text>
      </View>
      <View style={[styles.miniOrderRow, { marginTop: 4 }]}>
        <Text style={styles.miniOrderTotal}>{order.total} ج.س</Text>
        <Text style={styles.miniOrderInfo}>
          {order.customer_name} — {itemCount} عناصر
        </Text>
      </View>
    </View>
  );
}

// ─── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab({
  storeId,
  apiBase,
  authHeader,
}: {
  storeId: number;
  apiBase: string;
  authHeader: Record<string, string>;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [catRes, prodRes] = await Promise.all([
        fetch(`${apiBase}/api/store/my/categories`, { headers: authHeader }),
        fetch(`${apiBase}/api/store/my/products`, { headers: authHeader }),
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (prodRes.ok) setProducts(await prodRes.json());
    } catch {}
    setLoading(false);
  }, [apiBase, authHeader]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredProducts =
    selectedCategory === null
      ? products
      : products.filter((p) => p.category_id === selectedCategory);

  const toggleAvailability = async (product: Product) => {
    const form = new FormData();
    form.append("name", product.name);
    form.append("price", product.price.toString());
    form.append("is_available", (!product.is_available).toString());
    try {
      const res = await fetch(`${apiBase}/api/store/my/products/${product.id}`, {
        method: "PUT",
        headers: { ...authHeader },
        body: form,
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, is_available: !p.is_available } : p))
        );
      }
    } catch {}
  };

  const deleteProduct = (id: number) => {
    Alert.alert("حذف المنتج", "هل تريد حذف هذا المنتج نهائياً؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await fetch(`${apiBase}/api/store/my/products/${id}`, {
              method: "DELETE",
              headers: authHeader,
            });
            if (res.ok) setProducts((prev) => prev.filter((p) => p.id !== id));
          } catch {}
        },
      },
    ]);
  };

  const deleteCategory = (id: number) => {
    Alert.alert("حذف التصنيف", "هل تريد حذف هذا التصنيف؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await fetch(`${apiBase}/api/store/my/categories/${id}`, {
              method: "DELETE",
              headers: authHeader,
            });
            if (res.ok) {
              setCategories((prev) => prev.filter((c) => c.id !== id));
              if (selectedCategory === id) setSelectedCategory(null);
            }
          } catch {}
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header row */}
      <View style={[styles.productsHeader, { flexDirection: "row-reverse" }]}>
        <Text style={styles.sectionTitle}>المنتجات</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => { setEditingProduct(null); setShowProductModal(true); }}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>إضافة منتج</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <RtlScrollRow
        contentContainerStyle={[styles.categoryStrip, {}]}
      >
        <TouchableOpacity
          style={[styles.categoryChip, selectedCategory === null && styles.categoryChipActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.categoryChipText, selectedCategory === null && styles.categoryChipTextActive]}>
            الكل
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <View key={cat.id} style={{ flexDirection: "row-reverse", alignItems: "center" }}>
            <TouchableOpacity
              style={[styles.categoryChip, selectedCategory === cat.id && styles.categoryChipActive]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Text style={[styles.categoryChipText, selectedCategory === cat.id && styles.categoryChipTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteCategory(cat.id)} style={styles.catDeleteBtn}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          style={[styles.categoryChip, { borderStyle: "dashed" }]}
          onPress={() => setShowCategoryModal(true)}
        >
          <Ionicons name="add" size={14} color={Colors.primary} />
          <Text style={[styles.categoryChipText, { color: Colors.primary }]}>تصنيف</Text>
        </TouchableOpacity>
      </RtlScrollRow>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {filteredProducts.length === 0 ? (
            <EmptyState icon="cube-outline" message="لا توجد منتجات في هذا التصنيف" />
          ) : (
            filteredProducts.map((product, i) => (
              <Animated.View key={product.id} entering={FadeInDown.springify().delay(i * 40)}>
                <ProductCard
                  product={product}
                  onEdit={() => { setEditingProduct(product); setShowProductModal(true); }}
                  onDelete={() => deleteProduct(product.id)}
                  onToggle={() => toggleAvailability(product)}
                />
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}

      <ProductModal
        visible={showProductModal}
        product={editingProduct}
        categories={categories}
        apiBase={apiBase}
        authHeader={authHeader}
        onClose={() => setShowProductModal(false)}
        onSaved={() => { setShowProductModal(false); loadData(); }}
      />

      <CategoryModal
        visible={showCategoryModal}
        apiBase={apiBase}
        authHeader={authHeader}
        onClose={() => setShowCategoryModal(false)}
        onSaved={() => { setShowCategoryModal(false); loadData(); }}
      />
    </View>
  );
}

function ProductCard({
  product,
  onEdit,
  onDelete,
  onToggle,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <View style={[styles.productCard, CARD_SHADOW, { flexDirection: "row-reverse" }]}>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={styles.productThumb} resizeMode="cover" />
      ) : (
        <View style={[styles.productThumb, styles.productThumbPlaceholder]}>
          <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={styles.productName}>{product.name}</Text>
        {product.category_name ? (
          <Text style={styles.productCategory}>{product.category_name}</Text>
        ) : null}
        <Text style={[styles.productPrice, { color: Colors.accent }]}>{product.price} ج.س{product.old_price ? <Text style={{ color: Colors.textMuted, textDecorationLine: "line-through", fontSize: 11 }}>  {product.old_price}</Text> : null}</Text>
        {product.stock != null || product.is_featured || (product.gallery?.length ?? 0) > 0 ? (
          <Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: product.stock === 0 ? "#B42318" : Colors.textMuted, textAlign: "right" }}>
            {[product.is_featured ? "⭐ مميّز" : "", product.stock != null ? (product.stock === 0 ? "نفدت الكمية" : `المتوفر ${product.stock}`) : "", product.gallery?.length ? `🖼 ${product.gallery.length + 1} صور` : ""].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
      <View style={styles.productActions}>
        <Switch
          value={product.is_available}
          onValueChange={onToggle}
          trackColor={{ false: Colors.divider, true: Colors.primary + "40" }}
          thumbColor={product.is_available ? Colors.primary : "#999"}
        />
        <View style={[styles.productBtns, { flexDirection: "row-reverse" }]}>
          <TouchableOpacity onPress={onEdit} style={styles.iconActionBtn}>
            <Ionicons name="create-outline" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={styles.iconActionBtn}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Product Modal ────────────────────────────────────────────────────────────

function ProductModal({
  visible,
  product,
  categories,
  apiBase,
  authHeader,
  onClose,
  onSaved,
}: {
  visible: boolean;
  product: Product | null;
  categories: Category[];
  apiBase: string;
  authHeader: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  // معرض الصور الإضافية + سعر قبل الخصم + المخزون + مميّز
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploadingGal, setUploadingGal] = useState(false);
  const [oldPrice, setOldPrice] = useState("");
  const [stock, setStock] = useState("");
  const [featured, setFeatured] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(product?.name ?? "");
      setPrice(product?.price?.toString() ?? "");
      setDescription(product?.description ?? "");
      setCategoryId(product?.category_id ?? null);
      setIsAvailable(product?.is_available ?? true);
      setImageUri(null);
      setGallery(product?.gallery ?? []);
      setOldPrice(product?.old_price ? String(product.old_price) : "");
      setStock(product?.stock != null ? String(product.stock) : "");
      setFeatured(!!product?.is_featured);
    }
  }, [visible, product]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images" as any,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(await compressImage(result.assets[0]));
    }
  };

  const addGallery = async () => {
    if (gallery.length >= 6) { Alert.alert("الحد الأقصى", "حتى 6 صور إضافية لكل منتج"); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images" as any, quality: 0.8, allowsMultipleSelection: true, selectionLimit: 6 - gallery.length });
    if (r.canceled) return;
    setUploadingGal(true);
    try {
      const urls: string[] = [];
      for (const a of r.assets.slice(0, 6 - gallery.length)) urls.push(await uploadFile(`stores/products/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`, await compressImage(a), { mimeType: "image/jpeg" }));
      setGallery((g) => [...g, ...urls].slice(0, 6));
    } catch (e: any) { Alert.alert("تعذّر رفع الصور", e?.message || ""); }
    finally { setUploadingGal(false); }
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert("تنبيه", "أدخل اسم المنتج"); return; }
    if (oldPrice.trim() && Number(oldPrice) <= Number(price)) { Alert.alert("سعر قبل الخصم", "يجب أن يكون أعلى من السعر الحالي — أو اتركه فارغاً"); return; }
    if (!price.trim()) { Alert.alert("تنبيه", "أدخل السعر"); return; }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("price", price.trim());
      form.append("description", description.trim());
      if (categoryId !== null) form.append("category_id", categoryId.toString());
      form.append("is_available", isAvailable.toString());
      form.append("gallery", JSON.stringify(gallery));
      form.append("old_price", oldPrice.trim());
      form.append("stock", stock.trim());
      form.append("is_featured", featured.toString());
      if (imageUri) {
        form.append("image", await filePart(imageUri, "product.jpg", "image/jpeg"));
      }
      const url = product
        ? `${apiBase}/api/store/my/products/${product.id}`
        : `${apiBase}/api/store/my/products`;
      const method = product ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { ...authHeader }, body: form });
      if (res.ok) {
        onSaved();
      } else {
        Alert.alert("خطأ", await uploadErrorMessage(res));
      }
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  };

  const selectedCatName = categories.find((c) => c.id === categoryId)?.name ?? "اختر تصنيفاً";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={[styles.modalHeader, { flexDirection: "row-reverse" }]}>
            <Text style={styles.modalTitle}>{product ? "تعديل المنتج" : "إضافة منتج جديد"}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Image */}
            <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.logoPreview} resizeMode="cover" />
              ) : product?.image_url ? (
                <Image source={{ uri: product.image_url }} style={styles.logoPreview} resizeMode="cover" />
              ) : (
                <View style={styles.imagePickerPlaceholder}>
                  <Ionicons name="camera-outline" size={32} color={Colors.textMuted} />
                  <Text style={styles.imagePickerText}>صورة المنتج</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>اسم المنتج *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="اسم المنتج"
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>السعر (ج.س) *</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              textAlign="right"
            />

            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>السعر قبل الخصم</Text>
                <TextInput style={styles.input} value={oldPrice} onChangeText={(v) => setOldPrice(v.replace(/[^0-9.]/g, ""))} placeholder="اختياري" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="right" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>الكمية المتوفرة</Text>
                <TextInput style={styles.input} value={stock} onChangeText={(v) => setStock(v.replace(/\D/g, ""))} placeholder="غير محدودة" placeholderTextColor={Colors.textMuted} keyboardType="number-pad" textAlign="right" />
              </View>
            </View>
            {oldPrice && Number(oldPrice) > Number(price) && Number(price) > 0 ? (
              <Text style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: "#B42318", textAlign: "right", marginTop: -4, marginBottom: 6 }}>
                🔖 خصم {Math.round((1 - Number(price) / Number(oldPrice)) * 100)}% يظهر للعملاء
              </Text>
            ) : null}

            <Text style={styles.fieldLabel}>معرض الصور (حتى 6)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse", paddingBottom: 6 }}>
              {gallery.map((u, i) => (
                <View key={u}>
                  <Image source={{ uri: u }} style={{ width: 72, height: 72, borderRadius: 12 }} />
                  <TouchableOpacity onPress={() => setGallery((g) => g.filter((_, j) => j !== i))} style={{ position: "absolute", top: 3, left: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }} accessibilityLabel="إزالة الصورة">
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {gallery.length < 6 ? (
                <TouchableOpacity onPress={addGallery} disabled={uploadingGal} style={{ width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: Colors.primary + "70", alignItems: "center", justifyContent: "center", backgroundColor: Colors.primary + "0A" }}>
                  {uploadingGal ? <ActivityIndicator color={Colors.primary} /> : <><Ionicons name="images-outline" size={22} color={Colors.primary} /><Text style={{ fontFamily: "Cairo_600SemiBold", fontSize: 11, color: Colors.primary }}>إضافة</Text></>}
                </TouchableOpacity>
              ) : null}
            </ScrollView>

            <View style={styles.switchRow}>
              <Switch value={featured} onValueChange={setFeatured} trackColor={{ false: Colors.divider, true: "#E8A90060" }} thumbColor={featured ? "#E8A900" : "#ccc"} />
              <Text style={styles.fieldLabel}>⭐ منتج مميّز (يظهر أولاً في سوق المتاجر)</Text>
            </View>

            <Text style={styles.fieldLabel}>التصنيف</Text>
            <TouchableOpacity
              style={[styles.input, { justifyContent: "center" }]}
              onPress={() => setShowCatPicker(!showCatPicker)}
            >
              <Text style={{ fontFamily: "Cairo_400Regular", color: Colors.textPrimary, textAlign: "right" }}>
                {selectedCatName}
              </Text>
            </TouchableOpacity>
            {showCatPicker && (
              <View style={styles.catPickerDropdown}>
                <TouchableOpacity
                  style={styles.catPickerItem}
                  onPress={() => { setCategoryId(null); setShowCatPicker(false); }}
                >
                  <Text style={styles.catPickerItemText}>بدون تصنيف</Text>
                </TouchableOpacity>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.catPickerItem}
                    onPress={() => { setCategoryId(c.id); setShowCatPicker(false); }}
                  >
                    <Text style={[styles.catPickerItemText, c.id === categoryId && { color: Colors.primary, fontFamily: "Cairo_600SemiBold" }]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>الوصف</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="وصف المنتج"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
              textAlign="right"
              textAlignVertical="top"
            />

            <View style={styles.switchRow}>
              <Switch
                value={isAvailable}
                onValueChange={setIsAvailable}
                trackColor={{ false: Colors.divider, true: Colors.primary + "40" }}
                thumbColor={isAvailable ? Colors.primary : "#999"}
              />
              <Text style={styles.switchLabel}>متاح للطلب</Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, saving && styles.primaryBtnDisabled, { marginTop: 8 }]}
              onPress={save}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>حفظ</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Category Modal ───────────────────────────────────────────────────────────

function CategoryModal({
  visible,
  apiBase,
  authHeader,
  onClose,
  onSaved,
}: {
  visible: boolean;
  apiBase: string;
  authHeader: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) setName(""); }, [visible]);

  const save = async () => {
    if (!name.trim()) { Alert.alert("تنبيه", "أدخل اسم التصنيف"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/store/my/categories`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) { onSaved(); }
      else { const e = await res.json().catch(() => ({})); Alert.alert("خطأ", e?.error || "تعذّر الحفظ"); }
    } catch { Alert.alert("خطأ", "تعذّر الاتصال"); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { maxHeight: 280 }]}>
          <View style={[styles.modalHeader, { flexDirection: "row-reverse" }]}>
            <Text style={styles.modalTitle}>إضافة تصنيف</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.fieldLabel}>اسم التصنيف</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="مثال: مشروبات ساخنة"
            placeholderTextColor={Colors.textMuted}
            textAlign="right"
            autoFocus
          />
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.primaryBtnDisabled, { marginTop: 12 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>إضافة</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────

type OrderFilter = "all" | "pending" | "active" | "done";

function OrdersTab({
  apiBase,
  authHeader,
}: {
  apiBase: string;
  authHeader: Record<string, string>;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/store/my/orders`, { headers: authHeader });
      if (res.ok) setOrders(await res.json());
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [apiBase, authHeader]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const updateStatus = async (orderId: number, status: Order["status"]) => {
    try {
      const res = await fetch(`${apiBase}/api/store/my/orders/${orderId}`, {
        method: "PATCH",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status } : o))
        );
      }
    } catch {}
  };

  const FILTERS: { key: OrderFilter; label: string }[] = [
    { key: "all", label: "الكل" },
    { key: "pending", label: "معلق" },
    { key: "active", label: "جارٍ" },
    { key: "done", label: "مكتمل" },
  ];

  const filtered = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "pending") return o.status === "pending";
    if (filter === "active") return ["confirmed", "preparing", "out_for_delivery"].includes(o.status);
    if (filter === "done") return ["delivered", "cancelled"].includes(o.status);
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.id - a.id);

  return (
    <View style={{ flex: 1 }}>
      {/* Filter tabs */}
      <View style={[styles.filterRow, { flexDirection: "row-reverse" }]}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadOrders(); }}
              tintColor={Colors.primary}
            />
          }
        >
          {sorted.length === 0 ? (
            <EmptyState icon="receipt-outline" message="لا توجد طلبات" />
          ) : (
            sorted.map((order, i) => (
              <Animated.View key={order.id} entering={FadeInDown.springify().delay(i * 40)}>
                <OrderCard order={order} onUpdateStatus={updateStatus} />
              </Animated.View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function OrderCard({
  order,
  onUpdateStatus,
}: {
  order: Order;
  onUpdateStatus: (id: number, status: Order["status"]) => void;
}) {
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const statusColor = ORDER_STATUS_COLORS[order.status];
  const dateStr = new Date(order.created_at).toLocaleDateString("ar-SA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const nextStatusMap: Partial<Record<Order["status"], { label: string; status: Order["status"] }>> = {
    pending: { label: "تأكيد الطلب", status: "confirmed" },
    confirmed: { label: "بدأ التجهيز", status: "preparing" },
    preparing: { label: "في الطريق", status: "out_for_delivery" },
    out_for_delivery: { label: "تم التوصيل", status: "delivered" },
  };

  const next = nextStatusMap[order.status];
  const canCancel = !["delivered", "cancelled"].includes(order.status);

  return (
    <View style={[styles.orderCard, CARD_SHADOW]}>
      {/* Row 1: ID + date + status */}
      <View style={[styles.orderRow, { flexDirection: "row-reverse" }]}>
        <Text style={styles.orderId}>#{order.id}</Text>
        <Text style={styles.orderDate}>{dateStr}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {ORDER_STATUS_LABELS[order.status]}
          </Text>
        </View>
      </View>

      {/* Row 2: customer + phone */}
      <View style={[styles.orderRow, { flexDirection: "row-reverse", marginTop: 8 }]}>
        <Ionicons name="person-outline" size={14} color={Colors.textMuted} style={{ marginLeft: 4 }} />
        <Text style={styles.orderCustomer}>{order.customer_name}</Text>
        {order.customer_phone ? (
          <TouchableOpacity
            style={[styles.callBtn, { flexDirection: "row-reverse", marginRight: "auto" }]}
            onPress={() => Linking.openURL(`tel:${order.customer_phone}`)}
          >
            <Ionicons name="call-outline" size={14} color={Colors.primary} />
            <Text style={styles.callBtnText}>اتصال</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Row 3: items summary */}
      <View style={[styles.orderRow, { flexDirection: "row-reverse", marginTop: 4 }]}>
        <Text style={styles.orderItems}>
          {itemCount} عناصر — إجمالي:{" "}
          <Text style={{ color: Colors.accent, fontFamily: "Cairo_600SemiBold" }}>
            {order.total} ج.س
          </Text>
        </Text>
      </View>

      {/* Address */}
      {order.customer_address ? (
        <View style={[styles.orderRow, { flexDirection: "row-reverse", marginTop: 4 }]}>
          <Ionicons name="location-outline" size={13} color={Colors.textMuted} style={{ marginLeft: 4 }} />
          <Text style={styles.orderAddress} numberOfLines={1}>{order.customer_address}</Text>
        </View>
      ) : null}

      {/* Notes */}
      {order.customer_notes ? (
        <View style={[styles.orderRow, { flexDirection: "row-reverse", marginTop: 4 }]}>
          <Ionicons name="chatbubble-outline" size={13} color={Colors.textMuted} style={{ marginLeft: 4 }} />
          <Text style={styles.orderAddress} numberOfLines={2}>{order.customer_notes}</Text>
        </View>
      ) : null}

      {/* Action buttons */}
      {(next || canCancel) && (
        <View style={[styles.orderActions, { flexDirection: "row-reverse" }]}>
          {next && (
            <TouchableOpacity
              style={styles.actionPrimaryBtn}
              onPress={() => onUpdateStatus(order.id, next.status)}
            >
              <Text style={styles.actionPrimaryBtnText}>{next.label}</Text>
            </TouchableOpacity>
          )}
          {canCancel && (
            <TouchableOpacity
              style={styles.actionCancelBtn}
              onPress={() =>
                Alert.alert("إلغاء الطلب", "هل تريد إلغاء هذا الطلب؟", [
                  { text: "لا", style: "cancel" },
                  { text: "إلغاء الطلب", style: "destructive", onPress: () => onUpdateStatus(order.id, "cancelled") },
                ])
              }
            >
              <Text style={styles.actionCancelBtnText}>إلغاء</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({
  store,
  apiBase,
  authHeader,
  onSaved,
}: {
  store: MyStore;
  apiBase: string;
  authHeader: Record<string, string>;
  onSaved: (updated: MyStore) => void;
}) {
  const [name, setName] = useState(store.name);
  const [type, setType] = useState<StoreType>(store.type);
  const [description, setDescription] = useState(store.description);
  const [phone, setPhone] = useState(store.phone);
  const [address, setAddress] = useState(store.address);
  const [workingHours, setWorkingHours] = useState(store.working_hours);
  const [deliveryAvailable, setDeliveryAvailable] = useState(store.delivery_available);
  const [deliveryFee, setDeliveryFee] = useState(store.delivery_fee?.toString() ?? "0");
  const [minOrder, setMinOrder] = useState(store.min_order?.toString() ?? "0");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const X = store as any;
  const [isOpen, setIsOpen] = useState<boolean>(X.is_open !== false);
  const [acceptsOrders, setAcceptsOrders] = useState<boolean>(X.accepts_orders !== false);
  const [pickup, setPickup] = useState<boolean>(X.pickup_available !== false);
  const [notifyOrders, setNotifyOrders] = useState<boolean>(X.notify_orders !== false);
  const [whatsapp, setWhatsapp] = useState<string>(X.whatsapp || "");
  const [payMethods, setPayMethods] = useState<string[]>(Array.isArray(X.payment_methods) && X.payment_methods.length ? X.payment_methods : ["cash"]);
  const [bankAccount, setBankAccount] = useState<string>(X.bank_account || "");
  const [workingDays, setWorkingDays] = useState<string>(X.working_days || "السبت - الخميس");
  const [announcement, setAnnouncement] = useState<string>(X.announcement || "");
  const [prepMinutes, setPrepMinutes] = useState<string>(X.prep_minutes ? String(X.prep_minutes) : "");
  const PAY_OPTS = [
    { k: "cash", l: "كاش عند الاستلام", i: "cash-outline" }, { k: "bankak", l: "بنكك", i: "phone-portrait-outline" },
    { k: "ocash", l: "أوكاش", i: "wallet-outline" }, { k: "fawry", l: "فوري", i: "flash-outline" }, { k: "transfer", l: "تحويل بنكي", i: "business-outline" },
  ];
  // تبديل فوري لحالة الفتح دون الحاجة لحفظ كل الإعدادات
  const quickToggle = async (field: "is_open" | "accepts_orders", value: boolean) => {
    if (field === "is_open") setIsOpen(value); else setAcceptsOrders(value);
    try {
      const form = new FormData();
      form.append(field, value ? "true" : "false");
      const res = await fetch(`${apiBase}/api/store/my`, { method: "PUT", headers: { ...authHeader }, body: form });
      if (res.ok) onSaved(await res.json());
      else throw new Error();
    } catch {
      if (field === "is_open") setIsOpen(!value); else setAcceptsOrders(!value);
      Alert.alert("خطأ", "تعذّر تحديث الحالة");
    }
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images" as any, quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) setLogoUri(await compressImage(result.assets[0], 800));
  };

  const pickCover = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images" as any, quality: 0.85, allowsEditing: true, aspect: [16, 9] });
    if (!result.canceled && result.assets[0]) setCoverUri(await compressImage(result.assets[0]));
  };

  const save = async () => {
    setSaving(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("type", type);
      form.append("description", description.trim());
      form.append("phone", phone.trim());
      form.append("address", address.trim());
      form.append("working_hours", workingHours.trim());
      form.append("delivery_available", deliveryAvailable ? "true" : "false");
      form.append("delivery_fee", deliveryFee || "0");
      form.append("min_order", minOrder || "0");
      form.append("pickup_available", pickup ? "true" : "false");
      form.append("notify_orders", notifyOrders ? "true" : "false");
      form.append("whatsapp", whatsapp.trim());
      form.append("payment_methods", payMethods.join(","));
      form.append("bank_account", bankAccount.trim());
      form.append("working_days", workingDays.trim());
      form.append("announcement", announcement.trim());
      form.append("prep_minutes", prepMinutes || "0");
      if (logoUri) {
        form.append("logo", await filePart(logoUri, "logo.jpg", "image/jpeg"));
      }
      if (coverUri) {
        form.append("cover", await filePart(coverUri, "cover.jpg", "image/jpeg"));
      }
      const res = await fetch(`${apiBase}/api/store/my`, {
        method: "PUT",
        headers: { ...authHeader },
        body: form,
      });
      if (res.ok) {
        const updated = await res.json();
        onSaved(updated);
        Alert.alert("تم", "تم حفظ إعدادات المتجر بنجاح");
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert("خطأ", err?.error || "تعذّر الحفظ");
      }
    } catch {
      Alert.alert("خطأ", "تعذّر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* حالة المتجر الآن — تبديل فوري */}
      <Animated.View entering={FadeInDown.springify()} style={[styles.card, { borderColor: isOpen ? Colors.primary + "55" : "#B4231855", borderWidth: 1.5 }]}>
        <Text style={styles.cardTitle}>حالة المتجر الآن</Text>
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          {[true, false].map((v) => (
            <TouchableOpacity key={String(v)} onPress={() => isOpen !== v && quickToggle("is_open", v)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
                borderColor: isOpen === v ? (v ? Colors.primary : "#B42318") : Colors.divider,
                backgroundColor: isOpen === v ? (v ? Colors.primary + "14" : "#B4231812") : "transparent" }}>
              <Ionicons name={v ? "storefront" : "moon"} size={20} color={isOpen === v ? (v ? Colors.primary : "#B42318") : Colors.textMuted} />
              <Text style={[styles.switchLabel, { marginTop: 4, color: isOpen === v ? (v ? Colors.primary : "#B42318") : Colors.textMuted }]}>{v ? "مفتوح" : "مغلق"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.switchRow, { marginTop: 10 }]}>
          <Switch value={acceptsOrders} onValueChange={(v) => quickToggle("accepts_orders", v)} trackColor={{ false: Colors.divider, true: Colors.primary + "40" }} thumbColor={acceptsOrders ? Colors.primary : "#999"} />
          <Text style={styles.switchLabel}>استقبال الطلبات من التطبيق</Text>
        </View>
        <Text style={[styles.fieldLabel, { marginTop: 4 }]}>{isOpen && acceptsOrders ? "الزبائن يرون متجرك مفتوحاً ويمكنهم الطلب." : "يظهر متجرك للزبائن مع شارة «مغلق / لا يستقبل طلبات» ولا تصلك طلبات جديدة."}</Text>
      </Animated.View>

      {/* Store Info */}
      <Animated.View entering={FadeInDown.springify().delay(50)} style={styles.card}>
        <Text style={styles.cardTitle}>معلومات المتجر</Text>

        <Text style={styles.fieldLabel}>اسم المتجر *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="اسم المتجر" placeholderTextColor={Colors.textMuted} textAlign="right" />

        <Text style={styles.fieldLabel}>نوع المتجر</Text>
        <View style={styles.typeGrid}>
          {STORE_TYPES.map((st) => (
            <TouchableOpacity
              key={st.key}
              style={[styles.typeBtn, type === st.key && styles.typeBtnActive]}
              onPress={() => setType(st.key)}
            >
              <Text style={styles.typeEmoji}>{st.icon}</Text>
              <Text style={[styles.typeLabel, type === st.key && styles.typeLabelActive]}>{st.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>وصف المتجر</Text>
        <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="وصف المتجر" placeholderTextColor={Colors.textMuted} multiline numberOfLines={3} textAlign="right" textAlignVertical="top" />

        <Text style={styles.fieldLabel}>رقم الهاتف</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="09xxxxxxxxx" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign="right" />

        <Text style={styles.fieldLabel}>العنوان</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="عنوان المتجر" placeholderTextColor={Colors.textMuted} textAlign="right" />
      </Animated.View>

      {/* Delivery Settings */}
      <Animated.View entering={FadeInDown.springify().delay(100)} style={styles.card}>
        <Text style={styles.cardTitle}>إعدادات التوصيل</Text>

        <View style={styles.switchRow}>
          <Switch
            value={deliveryAvailable}
            onValueChange={setDeliveryAvailable}
            trackColor={{ false: Colors.divider, true: Colors.primary + "40" }}
            thumbColor={deliveryAvailable ? Colors.primary : "#999"}
          />
          <Text style={styles.switchLabel}>تفعيل خدمة التوصيل</Text>
        </View>

        {deliveryAvailable && (
          <>
            <Text style={styles.fieldLabel}>رسوم التوصيل (ج.س)</Text>
            <TextInput style={styles.input} value={deliveryFee} onChangeText={setDeliveryFee} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="right" />

            <Text style={styles.fieldLabel}>الحد الأدنى للطلب (ج.س)</Text>
            <TextInput style={styles.input} value={minOrder} onChangeText={setMinOrder} placeholder="0" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="right" />
          </>
        )}

        <View style={styles.switchRow}>
          <Switch value={pickup} onValueChange={setPickup} trackColor={{ false: Colors.divider, true: Colors.primary + "40" }} thumbColor={pickup ? Colors.primary : "#999"} />
          <Text style={styles.switchLabel}>الاستلام من المتجر</Text>
        </View>

        <Text style={styles.fieldLabel}>أيام العمل</Text>
        <TextInput style={styles.input} value={workingDays} onChangeText={setWorkingDays} placeholder="السبت - الخميس" placeholderTextColor={Colors.textMuted} textAlign="right" />

        <Text style={styles.fieldLabel}>ساعات العمل</Text>
        <TextInput style={styles.input} value={workingHours} onChangeText={setWorkingHours} placeholder="مثال: 8ص - 10م" placeholderTextColor={Colors.textMuted} textAlign="right" />

        <Text style={styles.fieldLabel}>متوسط وقت التجهيز (دقيقة)</Text>
        <TextInput style={styles.input} value={prepMinutes} onChangeText={(t) => setPrepMinutes(t.replace(/\D/g, ""))} placeholder="مثال: 20" placeholderTextColor={Colors.textMuted} keyboardType="numeric" textAlign="right" />
      </Animated.View>

      {/* الدفع والتواصل */}
      <Animated.View entering={FadeInDown.springify().delay(120)} style={styles.card}>
        <Text style={styles.cardTitle}>الدفع والتواصل</Text>
        <Text style={styles.fieldLabel}>وسائل الدفع المقبولة</Text>
        <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
          {PAY_OPTS.map((o) => {
            const on = payMethods.includes(o.k);
            return (
              <TouchableOpacity key={o.k} onPress={() => setPayMethods(on ? payMethods.filter((x) => x !== o.k) : [...payMethods, o.k])}
                style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
                  borderColor: on ? Colors.primary : Colors.divider, backgroundColor: on ? Colors.primary + "14" : "transparent" }}>
                <Ionicons name={o.i as any} size={14} color={on ? Colors.primary : Colors.textMuted} />
                <Text style={[styles.switchLabel, { fontSize: 12.5, color: on ? Colors.primary : Colors.textSecondary }]}>{o.l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {payMethods.some((m) => m !== "cash") && (
          <>
            <Text style={styles.fieldLabel}>بيانات الحساب للتحويل (يظهر للزبون عند الطلب)</Text>
            <TextInput style={styles.input} value={bankAccount} onChangeText={setBankAccount} placeholder="مثال: بنكك 1234567 — اسم الحساب" placeholderTextColor={Colors.textMuted} textAlign="right" />
          </>
        )}
        <Text style={styles.fieldLabel}>واتساب المتجر</Text>
        <TextInput style={styles.input} value={whatsapp} onChangeText={setWhatsapp} placeholder="2499xxxxxxxx" placeholderTextColor={Colors.textMuted} keyboardType="phone-pad" textAlign="right" />
        <Text style={styles.fieldLabel}>إعلان يظهر أعلى صفحة متجرك</Text>
        <TextInput style={styles.input} value={announcement} onChangeText={setAnnouncement} maxLength={200} placeholder="مثال: خصم 10% على كل الطلبات هذا الأسبوع" placeholderTextColor={Colors.textMuted} textAlign="right" />
        <View style={styles.switchRow}>
          <Switch value={notifyOrders} onValueChange={setNotifyOrders} trackColor={{ false: Colors.divider, true: Colors.primary + "40" }} thumbColor={notifyOrders ? Colors.primary : "#999"} />
          <Text style={styles.switchLabel}>إشعار فوري عند وصول طلب جديد</Text>
        </View>
      </Animated.View>

      {/* Logo */}
      <Animated.View entering={FadeInDown.springify().delay(150)} style={styles.card}>
        <Text style={styles.cardTitle}>شعار المتجر</Text>
        <TouchableOpacity style={styles.imagePicker} onPress={pickLogo}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.logoPreview} resizeMode="cover" />
          ) : store.logo_url ? (
            <Image source={{ uri: store.logo_url }} style={styles.logoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <Ionicons name="image-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.imagePickerText}>اختر شعار المتجر</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={pickLogo} style={styles.changeImageBtn}>
          <Text style={styles.changeImageText}>تغيير الشعار</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Cover Image */}
      <Animated.View entering={FadeInDown.springify().delay(200)} style={styles.card}>
        <Text style={styles.cardTitle}>صورة الغلاف</Text>
        <TouchableOpacity style={styles.coverPicker} onPress={pickCover}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.coverPreview} resizeMode="cover" />
          ) : store.cover_url ? (
            <Image source={{ uri: store.cover_url }} style={styles.coverPreview} resizeMode="cover" />
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <Ionicons name="image-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.imagePickerText}>اختر صورة الغلاف</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={pickCover} style={styles.changeImageBtn}>
          <Text style={styles.changeImageText}>تغيير الغلاف</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View entering={FadeInDown.springify().delay(250)}>
        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
          onPress={save}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>حفظ الإعدادات</Text>}
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

// ─── Shared Small Components ──────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.infoRow, { flexDirection: "row-reverse" }]}>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}:</Text>
    </View>
  );
}

function EmptyState({ icon, message }: { icon: keyof typeof Ionicons.glyphMap; message: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={52} color={Colors.textMuted} />
      <Text style={styles.emptyStateText}>{message}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centerFlex: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "right",
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  centerContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  // Tab Bar
  tabBar: {
    flexDirection: "row-reverse",
    backgroundColor: Colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    gap: 3,
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  tabLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
  },
  tabLabelActive: {
    color: Colors.primary,
    fontFamily: "Cairo_600SemiBold",
  },

  // Cards
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    elevation: 2,
    shadowColor: "#14231D",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  cardTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: Colors.textPrimary,
    textAlign: "right",
    marginBottom: 4,
  },

  // Fields
  fieldLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textPrimary,
    textAlign: "right",
    marginTop: 4,
  },
  input: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    minHeight: 44,
  },
  multiline: {
    minHeight: 80,
    paddingTop: 10,
  },

  // Switch
  switchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  switchLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },

  // Store type grid
  typeGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  typeBtn: {
    width: "22%",
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bg,
    gap: 2,
  },
  typeBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  typeEmoji: {
    fontSize: 20,
  },
  typeLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },
  typeLabelActive: {
    color: Colors.primary,
    fontFamily: "Cairo_600SemiBold",
  },

  // Image Picker
  imagePicker: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: "dashed",
    overflow: "hidden",
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePickerPlaceholder: {
    alignItems: "center",
    gap: 8,
    padding: 20,
  },
  imagePickerText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
  },
  logoPreview: {
    width: "100%",
    height: 140,
  },
  coverPicker: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: "dashed",
    overflow: "hidden",
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  coverPreview: {
    width: "100%",
    height: 180,
  },
  changeImageBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  changeImageText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.primary,
    textAlign: "center",
  },

  // Primary button
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#fff",
    textAlign: "center",
  },

  // Pending
  pendingWrap: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
  },
  pendingIcon: {
    fontSize: 56,
    textAlign: "center",
  },
  pendingTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  pendingSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },

  // Info row
  infoRow: {
    gap: 8,
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  infoLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "right",
    minWidth: 80,
  },
  infoValue: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
    flex: 1,
  },

  // Stats
  statsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    width: "47%",
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 14,
    alignItems: "flex-end",
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    textAlign: "right",
  },
  statLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "right",
  },

  // Section title
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: Colors.textPrimary,
    textAlign: "right",
    marginTop: 4,
    marginBottom: 8,
  },

  // Mini order card
  miniOrderCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  miniOrderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  miniOrderStatus: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
    textAlign: "right",
  },
  miniOrderId: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  miniOrderTotal: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: Colors.accent,
    textAlign: "right",
    minWidth: 60,
  },
  miniOrderInfo: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
    textAlign: "right",
  },

  // Products header
  productsHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  addBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  addBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },

  // Category strip
  categoryStrip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: "center",
  },
  categoryChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    gap: 4,
  },
  categoryChipActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  categoryChipTextActive: {
    color: Colors.primary,
    fontFamily: "Cairo_600SemiBold",
  },
  catDeleteBtn: {
    marginRight: 2,
    padding: 2,
  },

  // Product card
  productCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  productThumb: {
    width: 54,
    height: 54,
    borderRadius: 10,
    marginLeft: 10,
  },
  productThumbPlaceholder: {
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  productName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  productCategory: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "right",
  },
  productPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  productActions: {
    alignItems: "center",
    gap: 6,
  },
  productBtns: {
    gap: 6,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Category picker dropdown
  catPickerDropdown: {
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: -8,
    marginBottom: 4,
    overflow: "hidden",
  },
  catPickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  catPickerItemText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(20,35,29,0.42)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: Colors.textPrimary,
    textAlign: "right",
  },

  // Order filter
  filterRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  filterChipActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontFamily: "Cairo_600SemiBold",
  },

  // Order card
  orderCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  orderRow: {
    alignItems: "center",
    gap: 8,
  },
  orderId: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  orderDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
    textAlign: "right",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    textAlign: "center",
  },
  orderCustomer: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textPrimary,
    textAlign: "right",
    flex: 1,
  },
  callBtn: {
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  callBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.primary,
  },
  orderItems: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "right",
    flex: 1,
  },
  orderAddress: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "right",
    flex: 1,
  },
  orderActions: {
    marginTop: 12,
    gap: 8,
  },
  actionPrimaryBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
  },
  actionPrimaryBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#fff",
    textAlign: "center",
  },
  actionCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EF4444",
    alignItems: "center",
  },
  actionCancelBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#EF4444",
    textAlign: "center",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 48,
  },
  emptyStateText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
