import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import ModernHeader from "@/components/ui/ModernHeader";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Types ───────────────────────────────────────────────────────────────────

type StoreType =
  | "all"
  | "restaurant"
  | "cafe"
  | "boutique"
  | "grocery"
  | "pharmacy"
  | "sweets"
  | "electronics"
  | "general";

type Store = {
  id: number;
  name: string;
  type: StoreType;
  description?: string;
  logo_url?: string;
  cover_url?: string;
  phone?: string;
  address?: string;
  working_hours?: string;
  delivery_available: boolean;
  min_order?: number;
  delivery_fee?: number;
  status: string;
  product_count?: number;
  owner_name?: string;
  created_at?: string;
};

type Category = {
  id: number;
  store_id: number;
  name: string;
  sort_order: number;
};

type Product = {
  id: number;
  store_id: number;
  category_id?: number;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  is_available: boolean;
  sort_order: number;
};

type CartItem = {
  product: Product;
  qty: number;
};

type StoreOrder = {
  id: number;
  store_name: string;
  store_logo?: string;
  store_type?: string;
  customer_name: string;
  total: number;
  status: string;
  created_at: string;
  items?: { name: string; price: number; qty: number }[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const STORE_TYPE_CONFIG: Record<
  StoreType,
  { label: string; icon: string; iconLib: "Ionicons" | "Material" }
> = {
  all:         { label: "الكل",        icon: "grid-outline",          iconLib: "Ionicons" },
  restaurant:  { label: "مطعم",        icon: "restaurant-outline",    iconLib: "Ionicons" },
  cafe:        { label: "كافتيريا",    icon: "cafe-outline",          iconLib: "Ionicons" },
  boutique:    { label: "بوتيك",       icon: "shirt-outline",         iconLib: "Ionicons" },
  grocery:     { label: "بقالة",       icon: "basket-outline",        iconLib: "Ionicons" },
  pharmacy:    { label: "صيدلية",      icon: "medical-outline",       iconLib: "Ionicons" },
  sweets:      { label: "حلويات",      icon: "ice-cream-outline",     iconLib: "Ionicons" },
  electronics: { label: "إلكترونيات",  icon: "phone-portrait-outline",iconLib: "Ionicons" },
  general:     { label: "عام",         icon: "storefront-outline",    iconLib: "Ionicons" },
};

const TYPE_KEYS = Object.keys(STORE_TYPE_CONFIG) as StoreType[];

const ORDER_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  pending:          { label: "قيد المراجعة",    color: "#B78200", bgColor: "#FFF8DA" },
  confirmed:        { label: "مؤكَّد",           color: "#1D66D4", bgColor: "#EBF2FF" },
  preparing:        { label: "جارٍ التجهيز",    color: "#C2580A", bgColor: "#FFF3E8" },
  out_for_delivery: { label: "في الطريق",       color: "#6B21A8", bgColor: "#F3E8FF" },
  delivered:        { label: "تم التوصيل",      color: Colors.primary, bgColor: Colors.primarySoft },
  cancelled:        { label: "ملغي",            color: "#B91C1C", bgColor: "#FEE2E2" },
};

const CARD_SHADOW = {
  elevation: 3,
  shadowColor: Colors.primary,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function storeTypeLabel(type: string): string {
  return STORE_TYPE_CONFIG[type as StoreType]?.label ?? type;
}

function formatPrice(price: number): string {
  return `${price.toLocaleString("ar-SD")} ج`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar-SD", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── TypeFilterIcon (small helper) ───────────────────────────────────────────

function TypeIcon({ type, size = 18, color }: { type: StoreType; size?: number; color: string }) {
  const cfg = STORE_TYPE_CONFIG[type];
  return (
    <Ionicons name={cfg.icon as keyof typeof Ionicons.glyphMap} size={size} color={color} />
  );
}

// ─── StoreCard ───────────────────────────────────────────────────────────────

function StoreCard({ store, index, onPress }: { store: Store; index: number; onPress: () => void }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <TouchableOpacity style={styles.storeCard} activeOpacity={0.82} onPress={onPress}>
        {/* Logo / Placeholder */}
        <View style={styles.storeCardLogoWrap}>
          {store.logo_url ? (
            <Image source={{ uri: store.logo_url }} style={styles.storeCardLogo} resizeMode="cover" />
          ) : (
            <View style={styles.storeCardLogoPlaceholder}>
              <MaterialCommunityIcons name="storefront-outline" size={28} color={Colors.primary} />
            </View>
          )}
          {store.delivery_available && (
            <View style={styles.deliveryBadge}>
              <MaterialCommunityIcons name="moped" size={10} color="#fff" />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.storeCardInfo}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={styles.storeCardName} numberOfLines={1}>{store.name}</Text>
          </View>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
            <View style={styles.typePill}>
              <Text style={styles.typePillText}>{storeTypeLabel(store.type)}</Text>
            </View>
            {store.delivery_available && store.delivery_fee !== undefined && (
              <View style={styles.feePill}>
                <Text style={styles.feePillText}>توصيل {formatPrice(store.delivery_fee)}</Text>
              </View>
            )}
          </View>
          {store.working_hours && (
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.storeCardMeta}>{store.working_hours}</Text>
            </View>
          )}
          {store.product_count !== undefined && (
            <Text style={styles.storeCardMeta}>{store.product_count} منتج</Text>
          )}
        </View>

        {/* Arrow */}
        <Ionicons name="chevron-back" size={18} color={Colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── ProductCard ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  qty,
  onAdd,
  onRemove,
}: {
  product: Product;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.productCard}>
      {product.image_url ? (
        <Image source={{ uri: product.image_url }} style={styles.productImage} resizeMode="cover" />
      ) : (
        <View style={styles.productImagePlaceholder}>
          <MaterialCommunityIcons name="food-outline" size={28} color={Colors.primary} />
        </View>
      )}
      <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
      <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>
      {!product.is_available ? (
        <View style={styles.unavailableBadge}>
          <Text style={styles.unavailableText}>غير متوفر</Text>
        </View>
      ) : qty === 0 ? (
        <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      ) : (
        <View style={styles.qtyRow}>
          <TouchableOpacity style={styles.qtyBtn} onPress={onRemove}>
            <Ionicons name="remove" size={16} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{qty}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={onAdd}>
            <Ionicons name="add" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── CartSheet ───────────────────────────────────────────────────────────────

function CartSheet({
  visible,
  cart,
  deliveryFee,
  onClose,
  onUpdateQty,
  onRemove,
  onCheckout,
}: {
  visible: boolean;
  cart: CartItem[];
  deliveryFee: number;
  onClose: () => void;
  onUpdateQty: (productId: number, delta: number) => void;
  onRemove: (productId: number) => void;
  onCheckout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const subtotal = cart.reduce((sum, ci) => sum + ci.product.price * ci.qty, 0);
  const total = subtotal + deliveryFee;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>سلة مشترياتك</Text>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
            {cart.map((ci) => (
              <View key={ci.product.id} style={styles.cartItem}>
                <TouchableOpacity onPress={() => onRemove(ci.product.id)} style={styles.cartRemoveBtn}>
                  <Ionicons name="trash-outline" size={16} color={Colors.dangerSoft} />
                </TouchableOpacity>
                <View style={styles.cartItemInfo}>
                  <Text style={styles.cartItemName} numberOfLines={1}>{ci.product.name}</Text>
                  <Text style={styles.cartItemPrice}>{formatPrice(ci.product.price * ci.qty)}</Text>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => onUpdateQty(ci.product.id, -1)}>
                    <Ionicons name="remove" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{ci.qty}</Text>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => onUpdateQty(ci.product.id, 1)}>
                    <Ionicons name="add" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.cartSummary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
              <Text style={styles.summaryLabel}>المجموع الفرعي</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryValue}>{formatPrice(deliveryFee)}</Text>
              <Text style={styles.summaryLabel}>رسوم التوصيل</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowTotal]}>
              <Text style={styles.summaryTotal}>{formatPrice(total)}</Text>
              <Text style={styles.summaryTotalLabel}>الإجمالي</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={onCheckout} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>متابعة الطلب</Text>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── CheckoutSheet ───────────────────────────────────────────────────────────

function CheckoutSheet({
  visible,
  cart,
  deliveryFee,
  customerName,
  customerPhone,
  customerAddress,
  customerNotes,
  submitting,
  onClose,
  onSetName,
  onSetPhone,
  onSetAddress,
  onSetNotes,
  onSubmit,
}: {
  visible: boolean;
  cart: CartItem[];
  deliveryFee: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNotes: string;
  submitting: boolean;
  onClose: () => void;
  onSetName: (v: string) => void;
  onSetPhone: (v: string) => void;
  onSetAddress: (v: string) => void;
  onSetNotes: (v: string) => void;
  onSubmit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const subtotal = cart.reduce((sum, ci) => sum + ci.product.price * ci.qty, 0);
  const total = subtotal + deliveryFee;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + 16, maxHeight: "92%" }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>تفاصيل طلبك</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Fields */}
            <Text style={styles.fieldLabel}>الاسم الكامل *</Text>
            <TextInput
              style={styles.inputField}
              value={customerName}
              onChangeText={onSetName}
              placeholder="أدخل اسمك الكامل"
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>رقم الهاتف *</Text>
            <TextInput
              style={styles.inputField}
              value={customerPhone}
              onChangeText={onSetPhone}
              placeholder="09XXXXXXXX"
              placeholderTextColor={Colors.textMuted}
              keyboardType="phone-pad"
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>عنوان التوصيل</Text>
            <TextInput
              style={styles.inputField}
              value={customerAddress}
              onChangeText={onSetAddress}
              placeholder="حيّك أو منطقتك"
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
            />

            <Text style={styles.fieldLabel}>ملاحظات (اختياري)</Text>
            <TextInput
              style={[styles.inputField, { height: 72, textAlignVertical: "top" }]}
              value={customerNotes}
              onChangeText={onSetNotes}
              placeholder="أي تعليمات خاصة للمتجر..."
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlign="right"
            />

            {/* Order summary */}
            <View style={[styles.cartSummary, { marginTop: 8 }]}>
              {cart.map((ci) => (
                <View key={ci.product.id} style={styles.summaryRow}>
                  <Text style={styles.summaryValue}>{formatPrice(ci.product.price * ci.qty)}</Text>
                  <Text style={styles.summaryLabel}>
                    {ci.product.name} × {ci.qty}
                  </Text>
                </View>
              ))}
              <View style={styles.dividerLine} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryValue}>{formatPrice(deliveryFee)}</Text>
                <Text style={styles.summaryLabel}>رسوم التوصيل</Text>
              </View>
              <View style={[styles.summaryRow, styles.summaryRowTotal]}>
                <Text style={styles.summaryTotal}>{formatPrice(total)}</Text>
                <Text style={styles.summaryTotalLabel}>الإجمالي</Text>
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && { opacity: 0.7 }]}
            onPress={onSubmit}
            activeOpacity={0.85}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>تأكيد الطلب (الدفع عند الاستلام)</Text>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── OrderSuccessModal ────────────────────────────────────────────────────────

function OrderSuccessModal({
  visible,
  orderId,
  onContinue,
}: {
  visible: boolean;
  orderId: number | null;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onContinue}>
      <View style={styles.successOverlay}>
        <Animated.View entering={ZoomIn.springify()} style={styles.successCard}>
          <Animated.View entering={ZoomIn.delay(100).springify()} style={styles.successIconWrap}>
            <Ionicons name="checkmark-circle" size={72} color={Colors.primary} />
          </Animated.View>
          <Text style={styles.successTitle}>تم تأكيد طلبك!</Text>
          {orderId && (
            <Text style={styles.successOrderId}>رقم الطلب: #{orderId}</Text>
          )}
          <Text style={styles.successDesc}>
            سيتواصل معك المتجر قريباً لتأكيد التوصيل
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={onContinue} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>متابعة التسوق</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── MyOrderCard ─────────────────────────────────────────────────────────────

function MyOrderCard({ order, index }: { order: StoreOrder; index: number }) {
  const statusCfg =
    ORDER_STATUS_CONFIG[order.status] ?? {
      label: order.status,
      color: Colors.textMuted,
      bgColor: Colors.divider,
    };

  const showDetails = () => {
    if (!order.items || order.items.length === 0) {
      Alert.alert("طلب #" + order.id, "لا تفاصيل متاحة");
      return;
    }
    const lines = order.items
      .map((it) => `• ${it.name} × ${it.qty} — ${formatPrice(it.price * it.qty)}`)
      .join("\n");
    Alert.alert(`طلب #${order.id}\n${order.store_name}`, lines);
  };

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <View style={styles.orderCard}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, flex: 1 }}>
          {order.store_logo ? (
            <Image source={{ uri: order.store_logo }} style={styles.orderLogo} resizeMode="cover" />
          ) : (
            <View style={styles.orderLogoPlaceholder}>
              <MaterialCommunityIcons name="storefront-outline" size={20} color={Colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.orderStoreName} numberOfLines={1}>{order.store_name}</Text>
            <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bgColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
          <Text style={styles.orderTotal}>{formatPrice(order.total)}</Text>
          <TouchableOpacity style={styles.detailsBtn} onPress={showDetails}>
            <Text style={styles.detailsBtnText}>التفاصيل</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── StoreDetailModal ─────────────────────────────────────────────────────────

function StoreDetailModal({
  visible,
  storeData,
  storeLoading,
  cart,
  onClose,
  onAddToCart,
  onRemoveFromCart,
  onViewCart,
}: {
  visible: boolean;
  storeData: { store: Store; categories: Category[]; products: Product[] } | null;
  storeLoading: boolean;
  cart: CartItem[];
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  onRemoveFromCart: (productId: number) => void;
  onViewCart: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [activeCatId, setActiveCatId] = useState<number | null>(null);

  useEffect(() => {
    if (storeData) setActiveCatId(null);
  }, [storeData]);

  const filteredProducts = storeData
    ? activeCatId === null
      ? storeData.products
      : storeData.products.filter((p) => p.category_id === activeCatId)
    : [];

  const cartCount = cart.reduce((sum, ci) => sum + ci.qty, 0);
  const cartQtyFor = (id: number) => cart.find((ci) => ci.product.id === id)?.qty ?? 0;

  const store = storeData?.store;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.detailModalRoot, { paddingTop: 0 }]}>
        {/* Cover / Header */}
        <View style={styles.detailCoverWrap}>
          {store?.cover_url ? (
            <Image source={{ uri: store.cover_url }} style={styles.detailCover} resizeMode="cover" />
          ) : (
            <View style={[styles.detailCover, { backgroundColor: Colors.primary + "22" }]} />
          )}
          {/* Overlay header row */}
          <View style={[styles.detailHeaderRow, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={styles.detailBackBtn} onPress={onClose}>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {/* Store info overlay */}
          <View style={styles.detailStoreInfoCard}>
            {store?.logo_url ? (
              <Image source={{ uri: store.logo_url }} style={styles.detailLogo} resizeMode="cover" />
            ) : (
              <View style={styles.detailLogoPlaceholder}>
                <MaterialCommunityIcons name="storefront-outline" size={26} color={Colors.primary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.detailStoreName}>{store?.name}</Text>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <View style={styles.typePill}>
                  <Text style={styles.typePillText}>{storeTypeLabel(store?.type ?? "general")}</Text>
                </View>
                {store?.delivery_available && (
                  <View style={styles.deliveryInfoBadge}>
                    <MaterialCommunityIcons name="moped" size={12} color={Colors.primary} />
                    <Text style={styles.deliveryInfoText}>
                      {store.delivery_fee !== undefined ? formatPrice(store.delivery_fee) : "توصيل متاح"}
                    </Text>
                  </View>
                )}
              </View>
              {store?.working_hours && (
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 3 }}>
                  <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
                  <Text style={styles.detailMeta}>{store.working_hours}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {storeLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>جاري تحميل المنتجات...</Text>
          </View>
        ) : (
          <>
            {/* Categories bar */}
            {storeData && storeData.categories.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catScroll}
                style={{ flexGrow: 0 }}
              >
                <TouchableOpacity
                  style={[styles.catBtn, activeCatId === null && styles.catBtnActive]}
                  onPress={() => setActiveCatId(null)}
                >
                  <Text style={[styles.catBtnText, activeCatId === null && styles.catBtnTextActive]}>
                    الكل
                  </Text>
                </TouchableOpacity>
                {storeData.categories
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.catBtn, activeCatId === cat.id && styles.catBtnActive]}
                      onPress={() => setActiveCatId(cat.id)}
                    >
                      <Text
                        style={[
                          styles.catBtnText,
                          activeCatId === cat.id && styles.catBtnTextActive,
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            )}

            {/* Products grid */}
            {filteredProducts.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="package-variant-closed" size={52} color={Colors.border} />
                <Text style={styles.emptyText}>لا توجد منتجات في هذا التصنيف</Text>
              </View>
            ) : (
              <FlatList
                data={filteredProducts}
                keyExtractor={(item) => String(item.id)}
                numColumns={2}
                columnWrapperStyle={{ flexDirection: "row-reverse", gap: 10, paddingHorizontal: 14 }}
                contentContainerStyle={{ paddingTop: 10, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <ProductCard
                    product={item}
                    qty={cartQtyFor(item.id)}
                    onAdd={() => onAddToCart(item)}
                    onRemove={() => onRemoveFromCart(item.id)}
                  />
                )}
              />
            )}
          </>
        )}

        {/* Floating Cart Button */}
        {cartCount > 0 && (
          <Animated.View entering={ZoomIn.springify()} style={[styles.floatingCartBtn, { bottom: insets.bottom + 20 }]}>
            <TouchableOpacity style={styles.floatingCartInner} onPress={onViewCart} activeOpacity={0.88}>
              <View style={styles.cartCountBadge}>
                <Text style={styles.cartCountText}>{cartCount}</Text>
              </View>
              <Text style={styles.floatingCartText}>عرض السلة</Text>
              <MaterialCommunityIcons name="cart-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function StoresScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();

  // Browse state
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<StoreType>("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"browse" | "myorders">("browse");

  // Store detail
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [storeData, setStoreData] = useState<{
    store: Store;
    categories: Category[];
    products: Product[];
  } | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  // Checkout fields
  const [customerName, setCustomerName] = useState(user?.name ?? "");
  const [customerPhone, setCustomerPhone] = useState(user?.phone ?? "");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Order result
  const [orderSuccess, setOrderSuccess] = useState<number | null>(null);

  // My orders
  const [myOrders, setMyOrders] = useState<StoreOrder[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState(false);

  // ── Fetch stores ────────────────────────────────────────────────────────────

  const fetchStores = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/stores?type=restaurant`);
      if (!res.ok) throw new Error("فشل تحميل المتاجر");
      const data = await res.json();
      setStores(Array.isArray(data) ? data : data.stores ?? []);
    } catch (e) {
      console.warn("fetchStores error", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // ── Fetch store detail ──────────────────────────────────────────────────────

  const openStore = async (store: Store) => {
    setSelectedStore(store);
    setCart([]);
    setStoreLoading(true);
    setStoreData(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/stores/${store.id}`);
      if (!res.ok) throw new Error("فشل تحميل المتجر");
      const data = await res.json();
      setStoreData({
        store: data.store ?? store,
        categories: data.categories ?? [],
        products: data.products ?? [],
      });
    } catch {
      Alert.alert("خطأ", "تعذّر تحميل تفاصيل المتجر. تحقق من الاتصال.");
    } finally {
      setStoreLoading(false);
    }
  };

  // ── Cart helpers ────────────────────────────────────────────────────────────

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.product.id === product.id);
      if (existing) {
        return prev.map((ci) =>
          ci.product.id === product.id ? { ...ci, qty: ci.qty + 1 } : ci
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.product.id === productId);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter((ci) => ci.product.id !== productId);
      return prev.map((ci) =>
        ci.product.id === productId ? { ...ci, qty: ci.qty - 1 } : ci
      );
    });
  };

  const updateQty = (productId: number, delta: number) => {
    if (delta > 0) {
      const product = cart.find((ci) => ci.product.id === productId)?.product;
      if (product) addToCart(product);
    } else {
      removeFromCart(productId);
    }
  };

  const deleteFromCart = (productId: number) => {
    setCart((prev) => prev.filter((ci) => ci.product.id !== productId));
  };

  // ── Submit order ────────────────────────────────────────────────────────────

  const handleSubmitOrder = async () => {
    if (!customerName.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال اسمك الكامل");
      return;
    }
    if (!customerPhone.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال رقم هاتفك");
      return;
    }
    if (!selectedStore) return;

    const subtotal = cart.reduce((sum, ci) => sum + ci.product.price * ci.qty, 0);
    const delivery_fee = selectedStore.delivery_fee ?? 0;
    const total = subtotal + delivery_fee;

    const body = {
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_address: customerAddress.trim(),
      customer_notes: customerNotes.trim(),
      items: cart.map((ci) => ({
        id: ci.product.id,
        name: ci.product.name,
        price: ci.product.price,
        qty: ci.qty,
      })),
      subtotal,
      delivery_fee,
      total,
    };

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${getApiUrl()}/api/stores/${selectedStore.id}/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message ?? "فشل إرسال الطلب");
      }
      const data = await res.json();
      setShowCheckout(false);
      setShowCart(false);
      setOrderSuccess(data?.order?.id ?? data?.id ?? null);
    } catch (e: any) {
      Alert.alert("خطأ", e.message ?? "تعذّر إرسال الطلب، حاول مجدداً");
    } finally {
      setSubmitting(false);
    }
  };

  // ── My orders ───────────────────────────────────────────────────────────────

  const fetchMyOrders = async () => {
    if (!token) {
      Alert.alert(
        "تسجيل الدخول مطلوب",
        "يرجى تسجيل الدخول لعرض طلباتك",
        [{ text: "حسناً" }]
      );
      return;
    }
    setMyOrdersLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/store/my-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("فشل تحميل الطلبات");
      const data = await res.json();
      setMyOrders(Array.isArray(data) ? data : data.orders ?? []);
    } catch {
      Alert.alert("خطأ", "تعذّر تحميل طلباتك");
    } finally {
      setMyOrdersLoading(false);
    }
  };

  const handleTabChange = (tab: "browse" | "myorders") => {
    setActiveTab(tab);
    if (tab === "myorders") {
      if (!token) {
        Alert.alert("تسجيل الدخول مطلوب", "يرجى تسجيل الدخول لعرض طلباتك");
        return;
      }
      fetchMyOrders();
    }
  };

  // ── Filtered stores ─────────────────────────────────────────────────────────

  const filteredStores = stores.filter((s) => {
    const matchType = typeFilter === "all" || s.type === typeFilter;
    const matchSearch =
      !search.trim() ||
      s.name.includes(search) ||
      (s.description ?? "").includes(search);
    return matchType && matchSearch;
  });

  // ── Success reset ───────────────────────────────────────────────────────────

  const handleSuccessContinue = () => {
    setOrderSuccess(null);
    setCart([]);
    setCustomerAddress("");
    setCustomerNotes("");
    setSelectedStore(null);
    setStoreData(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <ModernHeader
        title="متاجر الحصاحيصا"
        subtitle="تسوق، أطلب، استلم"
        showBack
        onBack={() => router.back()}
        gradient={Colors.gradients.brand}
      />

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "myorders" && styles.tabActive]}
          onPress={() => handleTabChange("myorders")}
        >
          <Text style={[styles.tabText, activeTab === "myorders" && styles.tabTextActive]}>
            طلباتي
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "browse" && styles.tabActive]}
          onPress={() => handleTabChange("browse")}
        >
          <Text style={[styles.tabText, activeTab === "browse" && styles.tabTextActive]}>
            تصفح المتاجر
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "browse" ? (
        <>
          {/* Type filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.typeFilterScroll}
            style={styles.typeFilterBar}
          >
            {TYPE_KEYS.map((t) => {
              const active = typeFilter === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeFilterItem, active && styles.typeFilterItemActive]}
                  onPress={() => setTypeFilter(t)}
                >
                  <TypeIcon type={t} size={16} color={active ? "#fff" : Colors.primary} />
                  <Text style={[styles.typeFilterText, active && styles.typeFilterTextActive]}>
                    {STORE_TYPE_CONFIG[t].label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="ابحث عن متجر..."
              placeholderTextColor={Colors.textMuted}
              textAlign="right"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Stores list */}
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>جاري تحميل المتاجر...</Text>
            </View>
          ) : filteredStores.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="storefront-outline" size={56} color={Colors.border} />
              <Text style={styles.emptyText}>لا توجد متاجر متطابقة</Text>
            </View>
          ) : (
            <FlatList
              data={filteredStores}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: insets.bottom + 24 }}
              showsVerticalScrollIndicator={false}
              onRefresh={() => fetchStores(true)}
              refreshing={refreshing}
              renderItem={({ item, index }) => (
                <StoreCard
                  store={item}
                  index={index}
                  onPress={() => openStore(item)}
                />
              )}
            />
          )}
        </>
      ) : (
        /* My orders tab */
        myOrdersLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>جاري تحميل طلباتك...</Text>
          </View>
        ) : myOrders.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="receipt-text-outline" size={56} color={Colors.border} />
            <Text style={styles.emptyText}>لا توجد طلبات سابقة</Text>
            <Text style={styles.emptySubText}>ابدأ التسوق من تبويب تصفح المتاجر</Text>
          </View>
        ) : (
          <FlatList
            data={myOrders}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <MyOrderCard order={item} index={index} />
            )}
          />
        )
      )}

      {/* Store Detail Modal */}
      <StoreDetailModal
        visible={!!selectedStore}
        storeData={storeData}
        storeLoading={storeLoading}
        cart={cart}
        onClose={() => {
          setSelectedStore(null);
          setStoreData(null);
          setCart([]);
        }}
        onAddToCart={addToCart}
        onRemoveFromCart={removeFromCart}
        onViewCart={() => setShowCart(true)}
      />

      {/* Cart Sheet */}
      <CartSheet
        visible={showCart}
        cart={cart}
        deliveryFee={selectedStore?.delivery_fee ?? 0}
        onClose={() => setShowCart(false)}
        onUpdateQty={updateQty}
        onRemove={deleteFromCart}
        onCheckout={() => {
          setShowCart(false);
          setShowCheckout(true);
        }}
      />

      {/* Checkout Sheet */}
      <CheckoutSheet
        visible={showCheckout}
        cart={cart}
        deliveryFee={selectedStore?.delivery_fee ?? 0}
        customerName={customerName}
        customerPhone={customerPhone}
        customerAddress={customerAddress}
        customerNotes={customerNotes}
        submitting={submitting}
        onClose={() => setShowCheckout(false)}
        onSetName={setCustomerName}
        onSetPhone={setCustomerPhone}
        onSetAddress={setCustomerAddress}
        onSetNotes={setCustomerNotes}
        onSubmit={handleSubmitOrder}
      />

      {/* Order success */}
      <OrderSuccessModal
        visible={orderSuccess !== null}
        orderId={orderSuccess}
        onContinue={handleSuccessContinue}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  // Tabs
  tabRow: {
    flexDirection: "row-reverse",
    marginHorizontal: 14,
    marginTop: 14,
    marginBottom: 2,
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    padding: 3,
    ...CARD_SHADOW,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13.5,
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: "#fff",
  },

  // Type filter
  typeFilterBar: {
    flexGrow: 0,
    marginTop: 10,
  },
  typeFilterScroll: {
    paddingHorizontal: 14,
    gap: 8,
    flexDirection: "row-reverse",
  },
  typeFilterItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeFilterItemActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeFilterText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12.5,
    color: Colors.primary,
  },
  typeFilterTextActive: {
    color: "#fff",
  },

  // Search
  searchWrap: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: Colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    ...CARD_SHADOW,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },

  // Store card
  storeCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...CARD_SHADOW,
  },
  storeCardLogoWrap: {
    position: "relative",
  },
  storeCardLogo: {
    width: 58,
    height: 58,
    borderRadius: 12,
    backgroundColor: Colors.primarySoft,
  },
  storeCardLogoPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 12,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.cardBg,
  },
  storeCardInfo: {
    flex: 1,
    gap: 3,
  },
  storeCardName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  storeCardMeta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11.5,
    color: Colors.textMuted,
    textAlign: "right",
  },

  // Pills
  typePill: {
    backgroundColor: Colors.primary + "15",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typePillText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: Colors.primary,
    textAlign: "right",
  },
  feePill: {
    backgroundColor: Colors.accent + "20",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  feePillText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: Colors.accentDeep,
    textAlign: "right",
  },

  // Product card
  productCard: {
    flex: 1,
    backgroundColor: Colors.cardBg,
    borderRadius: 14,
    padding: 10,
    margin: 5,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    ...CARD_SHADOW,
    minWidth: (SCREEN_WIDTH - 48) / 2,
    maxWidth: (SCREEN_WIDTH - 48) / 2,
  },
  productImage: {
    width: "100%",
    height: 100,
    borderRadius: 10,
    backgroundColor: Colors.primarySoft,
    marginBottom: 8,
  },
  productImagePlaceholder: {
    width: "100%",
    height: 100,
    borderRadius: 10,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  productName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12.5,
    color: Colors.textPrimary,
    textAlign: "right",
    width: "100%",
    marginBottom: 4,
  },
  productPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: Colors.accent,
    textAlign: "right",
    width: "100%",
    marginBottom: 8,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  unavailableBadge: {
    backgroundColor: Colors.dangerSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unavailableText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: Colors.danger,
    textAlign: "center",
  },
  qtyRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: Colors.textPrimary,
    minWidth: 20,
    textAlign: "center",
  },

  // Sheet overlay
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(20,35,29,0.44)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 12,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: Colors.divider,
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: Colors.textPrimary,
    textAlign: "right",
  },

  // Cart items
  cartItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  cartRemoveBtn: {
    padding: 4,
  },
  cartItemInfo: {
    flex: 1,
    gap: 2,
  },
  cartItemName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  cartItemPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12.5,
    color: Colors.accent,
    textAlign: "right",
  },

  // Cart summary
  cartSummary: {
    backgroundColor: Colors.primarySoft,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "right",
  },
  summaryValue: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textPrimary,
    textAlign: "left",
  },
  summaryRowTotal: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  summaryTotal: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: Colors.primary,
  },
  summaryTotalLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  dividerLine: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: 4,
  },

  // Primary button
  primaryBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  primaryBtnText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14.5,
    color: "#fff",
    textAlign: "center",
  },

  // Checkout fields
  fieldLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: Colors.textPrimary,
    textAlign: "right",
    marginBottom: 4,
    marginTop: 8,
  },
  inputField: {
    backgroundColor: Colors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },

  // Success modal
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(20,35,29,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  successCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    gap: 14,
    width: "100%",
    ...CARD_SHADOW,
  },
  successIconWrap: {
    marginBottom: 4,
  },
  successTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  successOrderId: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: Colors.accent,
    textAlign: "center",
  },
  successDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },

  // My orders
  orderCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    ...CARD_SHADOW,
  },
  orderLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.primarySoft,
  },
  orderLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  orderStoreName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: "right",
  },
  orderDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11.5,
    color: Colors.textMuted,
    textAlign: "right",
  },
  orderTotal: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: Colors.accent,
    textAlign: "left",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11.5,
    textAlign: "center",
  },
  detailsBtn: {
    backgroundColor: Colors.primary + "18",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  detailsBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: Colors.primary,
    textAlign: "center",
  },

  // Store detail modal
  detailModalRoot: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  detailCoverWrap: {
    position: "relative",
  },
  detailCover: {
    width: "100%",
    height: 180,
  },
  detailHeaderRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row-reverse",
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  detailBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(20,35,29,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  detailStoreInfoCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: Colors.cardBg,
    marginHorizontal: 14,
    marginTop: -28,
    borderRadius: 16,
    padding: 12,
    gap: 12,
    ...CARD_SHADOW,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailLogo: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: Colors.primarySoft,
  },
  detailLogoPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: Colors.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  detailStoreName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15.5,
    color: Colors.textPrimary,
    textAlign: "right",
    marginBottom: 4,
  },
  deliveryInfoBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  deliveryInfoText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: Colors.primary,
    textAlign: "right",
  },
  detailMeta: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11.5,
    color: Colors.textMuted,
    textAlign: "right",
  },

  // Categories bar
  catScroll: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    flexDirection: "row-reverse",
  },
  catBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  catBtnText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12.5,
    color: Colors.textMuted,
    textAlign: "center",
  },
  catBtnTextActive: {
    color: "#fff",
  },

  // Floating cart button
  floatingCartBtn: {
    position: "absolute",
    right: 16,
  },
  floatingCartInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 20,
    ...CARD_SHADOW,
    elevation: 6,
  },
  floatingCartText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#fff",
    textAlign: "right",
  },
  cartCountBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartCountText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#fff",
    textAlign: "center",
  },

  // Shared
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13.5,
    color: Colors.textMuted,
    textAlign: "center",
  },
  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  emptyText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: "center",
  },
  emptySubText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: Colors.textSubtle,
    textAlign: "center",
  },
});
