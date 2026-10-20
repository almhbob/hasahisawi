import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, ActivityIndicator, FlatList,
  Dimensions, Platform, Alert, Linking,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import AnimatedPress from "@/components/AnimatedPress";
import OrgInviteCard from "@/components/OrgInviteCard";
import ModernHeader, { headerUI } from "@/components/ui/ModernHeader";


const { width } = Dimensions.get("window");
const BASE = getApiUrl() ?? "";

// ── نوع البيانات ─────────────────────────────────────────────────
type Package = {
  id: number; name: string; description: string;
  price_monthly: number; max_products: number;
  is_unlimited: boolean; is_featured: boolean;
  color: string; icon: string; features: string[];
  sort_order: number;
};
type Member = {
  id: number; shop_name: string; bio: string; avatar_url: string;
  whatsapp: string; instagram: string; categories: string[];
  rating: number; rating_count: number; product_count: number;
  package_name: string; pkg_color: string; pkg_icon: string; is_featured: boolean;
};
type Product = {
  id: number; member_id: number; title: string; description: string;
  category: string; price: number; images: string[];
  is_custom: boolean; delivery_days: number;
  shop_name: string; avatar_url: string; rating: number;
  orders_count: number;
};

// ── فئات التصاميم ────────────────────────────────────────────────
const CATEGORIES = [
  { key: "all",         label: "كل الفئات",    icon: "grid",              color: Colors.primary },
  { key: "invitations", label: "دعوات الأفراح", icon: "heart",             color: "#EC4899" },
  { key: "certificates",label: "شهادات",        icon: "ribbon",            color: "#F59E0B" },
  { key: "marbled",     label: "ورق مروس",      icon: "color-palette",     color: "#8B5CF6" },
  { key: "logos",       label: "لوجوهات",       icon: "prism",             color: "#06B6D4" },
  { key: "social",      label: "سوشيال ميديا",  icon: "share-social",      color: "#F97316" },
  { key: "banners",     label: "لافتات",        icon: "megaphone",         color: "#EF4444" },
];

const CAT_LABEL: Record<string, string> = {
  all: "كل الفئات", invitations: "دعوات", certificates: "شهادات",
  marbled: "ورق مروس", logos: "لوجوهات", social: "سوشيال ميديا", banners: "لافتات",
};

// ── مكوّن بطاقة المنتج ───────────────────────────────────────────
function ProductCard({ item, index, onOrder }: { item: Product; index: number; onOrder: (p: Product) => void }) {
  const cat = item.category;
  const catObj = CATEGORIES.find(c => c.key === cat);

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify().damping(14)} style={styles.productCard}>
      <AnimatedPress onPress={() => onOrder(item)} style={{ flex: 1 }}>
        {/* صورة / غلاف */}
        <View style={styles.productThumb}>
          <View style={styles.productThumbInner}>
            <Ionicons name={(catObj?.icon ?? "color-palette") as any} size={30} color={Colors.primaryDeep} />
          </View>
          {item.is_custom && (
            <View style={styles.customBadge}>
              <Text style={styles.customBadgeText}>مخصّص</Text>
            </View>
          )}
        </View>

        {/* معلومات */}
        <View style={styles.productInfo}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.productMeta}>
            <View style={styles.catChip}>
              <Text style={styles.catChipText}>{CAT_LABEL[cat] ?? cat}</Text>
            </View>
            <View style={styles.deliveryInfo}>
              <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
              <Text style={styles.deliveryText}>{item.delivery_days} أيام</Text>
            </View>
          </View>

          {/* المصمم */}
          <View style={styles.designerRow}>
            <View style={styles.designerAvatar}>
              <Text style={styles.designerAvatarText}>{item.shop_name?.charAt(0) ?? "م"}</Text>
            </View>
            <Text style={styles.designerName} numberOfLines={1}>{item.shop_name}</Text>
            {item.rating > 0 && (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={10} color={Colors.accent} />
                <Text style={styles.ratingText}>{Number(item.rating).toFixed(1)}</Text>
              </View>
            )}
          </View>

          {/* السعر + الطلب */}
          <View style={styles.productFooter}>
            <View>
              {item.price > 0 ? (
                <Text style={styles.priceText}>{item.price.toLocaleString()} ج.س</Text>
              ) : (
                <Text style={[styles.priceText, { color: Colors.primaryDeep }]}>بالتفاوض</Text>
              )}
            </View>
            <Pressable style={styles.orderBtn} onPress={() => onOrder(item)}>
              <Ionicons name="send" size={13} color="#fff" />
              <Text style={styles.orderBtnText}>اطلب</Text>
            </Pressable>
          </View>
        </View>
      </AnimatedPress>
    </Animated.View>
  );
}

// ── مكوّن بطاقة المصمم ───────────────────────────────────────────
function DesignerCard({ member, index, onContact }: { member: Member; index: number; onContact: (m: Member) => void }) {
  const pkgColor = Colors.primaryDeep;
  const initial  = member.shop_name?.charAt(0) ?? "م";

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(14)} style={styles.designerCard}>

      {/* أيقونة الباقة */}
      {member.is_featured && (
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>{member.pkg_icon ?? "⭐"}</Text>
        </View>
      )}

      {/* أفاتار */}
      <View style={styles.designerCardAvatar}>
        {member.avatar_url ? (
          <Text style={[styles.designerCardAvatarText, { color: pkgColor }]}>{initial}</Text>
        ) : (
          <Text style={[styles.designerCardAvatarText, { color: pkgColor }]}>{initial}</Text>
        )}
      </View>

      <Text style={styles.designerCardName} numberOfLines={1}>{member.shop_name}</Text>

      {/* تقييم */}
      {member.rating > 0 && (
        <View style={styles.designerRatingRow}>
          {[1,2,3,4,5].map(s => (
            <Ionicons key={s} name={s <= Math.round(Number(member.rating)) ? "star" : "star-outline"} size={12} color={Colors.accent} />
          ))}
          <Text style={styles.designerRatingCount}>({member.rating_count})</Text>
        </View>
      )}

      {/* إحصائيات */}
      <View style={styles.designerStats}>
        <View style={styles.designerStat}>
          <Text style={[styles.designerStatNum, { color: pkgColor }]}>{member.product_count ?? 0}</Text>
          <Text style={styles.designerStatLabel}>منتج</Text>
        </View>
        <View style={styles.designerStatDivider} />
        <View style={styles.designerStat}>
          <Text style={[styles.designerStatNum, { color: pkgColor }]}>{Number(member.rating).toFixed(1)}</Text>
          <Text style={styles.designerStatLabel}>تقييم</Text>
        </View>
      </View>

      {/* الباقة */}
      {member.package_name && (
        <View style={styles.pkgBadge}>
          <Text style={styles.pkgBadgeText}>{member.package_name}</Text>
        </View>
      )}

      {/* التواصل */}
      <Pressable style={styles.contactBtn} onPress={() => onContact(member)}>
        <Ionicons name="chatbubble-ellipses-outline" size={14} color={pkgColor} />
        <Text style={[styles.contactBtnText, { color: pkgColor }]}>تواصل</Text>
      </Pressable>
    </Animated.View>
  );
}

// ── مكوّن بطاقة الباقة ───────────────────────────────────────────
function PackageCard({
  pkg, selected, onSelect,
}: { pkg: Package; selected: boolean; onSelect: () => void }) {
  return (
    <Pressable onPress={onSelect}>
      <Animated.View entering={FadeInDown.delay(pkg.sort_order * 80).springify()}>
        <View style={[styles.pkgCard, selected && styles.pkgCardSelected]}>
          {selected && (
            <View style={styles.pkgSelectedRibbon}>
              <Text style={styles.pkgSelectedRibbonText}>محدّد ✓</Text>
            </View>
          )}

          <Text style={styles.pkgIcon}>{pkg.icon}</Text>
          <Text style={styles.pkgName}>{pkg.name}</Text>
          <Text style={styles.pkgDesc}>{pkg.description}</Text>

          <View style={styles.pkgPriceRow}>
            <Text style={styles.pkgPrice}>
              {pkg.price_monthly.toLocaleString()}
            </Text>
            <Text style={styles.pkgPriceSuffix}> ج.س / شهر</Text>
          </View>

          <View style={styles.pkgDivider} />

          {pkg.features.map((f, i) => (
            <View key={i} style={styles.pkgFeatureRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
              <Text style={styles.pkgFeatureText}>{f}</Text>
            </View>
          ))}

          <View style={[styles.pkgSelectBtn, selected && styles.pkgSelectBtnActive]}>
            <Text style={[styles.pkgSelectBtnText, selected && { color: "#fff" }]}>
              {selected ? "✓ محدّد" : "اختر هذه الباقة"}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ══════════════════════════════════════════════════════════════════
// الشاشة الرئيسية
// ══════════════════════════════════════════════════════════════════
export default function DesignGalleryScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, isGuest } = useAuth();

  // تبويبات
  const [activeTab, setActiveTab] = useState<"gallery"|"designers"|"subscribe">("gallery");

  // فئة المعرض
  const [selCat, setSelCat] = useState("all");

  // بيانات
  const [products, setProducts] = useState<Product[]>([]);
  const [members, setMembers]   = useState<Member[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading]   = useState(false);

  // نموذج الطلب
  const [orderModal, setOrderModal] = useState(false);
  const [orderProduct, setOrderProduct] = useState<Product|null>(null);
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cNotes, setCNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // نموذج الاشتراك
  const [selPkg, setSelPkg]         = useState<Package|null>(null);
  const [shopName, setShopName]     = useState("");
  const [bio, setBio]               = useState("");
  const [whatsapp, setWhatsapp]     = useState("");
  const [instagram, setInstagram]   = useState("");
  const [subLoading, setSubLoading] = useState(false);
  const [subDone, setSubDone]       = useState(false);

  // تواصل مع مصمم
  const [contactModal, setContactModal] = useState(false);
  const [contactMember, setContactMember] = useState<Member|null>(null);

  const fetchProducts = useCallback(async (cat = "all") => {
    if (!BASE) return;
    setLoading(true);
    try {
      const url = cat === "all"
        ? `${BASE}/api/design-gallery/products`
        : `${BASE}/api/design-gallery/products?category=${cat}`;
      const res = await fetch(url);
      if (res.ok) setProducts(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!BASE) return;
    try {
      const res = await fetch(`${BASE}/api/design-gallery/members`);
      if (res.ok) setMembers(await res.json());
    } catch {}
  }, []);

  const fetchPackages = useCallback(async () => {
    if (!BASE) return;
    try {
      const res = await fetch(`${BASE}/api/design-gallery/packages`);
      if (res.ok) setPackages(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchMembers();
    fetchPackages();
  }, []);

  const handleCatChange = (cat: string) => {
    setSelCat(cat);
    fetchProducts(cat);
  };

  const openOrder = (p: Product) => {
    setOrderProduct(p);
    setCName(""); setCPhone(""); setCNotes("");
    setOrderModal(true);
  };

  const submitOrder = async () => {
    if (!cName.trim() || !cPhone.trim()) {
      Alert.alert("تنبيه", "الاسم والهاتف مطلوبان");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/design-gallery/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: orderProduct?.id,
          member_id:  orderProduct?.member_id,
          customer_name:  cName,
          customer_phone: cPhone,
          customer_notes: cNotes,
        }),
      });
      if (res.ok) {
        setOrderModal(false);
        Alert.alert("تم الإرسال ✓", "تم إرسال طلبك للمصمم وسيتواصل معك قريباً");
      } else {
        Alert.alert("خطأ", "تعذّر إرسال الطلب");
      }
    } catch { Alert.alert("خطأ", "تحقق من الاتصال"); }
    setSubmitting(false);
  };

  const submitSubscription = async () => {
    if (isGuest || !token) {
      Alert.alert("تسجيل الدخول", "يجب تسجيل الدخول أولاً");
      return;
    }
    if (!selPkg) { Alert.alert("تنبيه", "اختر الباقة أولاً"); return; }
    if (!shopName.trim()) { Alert.alert("تنبيه", "أدخل اسم المتجر"); return; }
    setSubLoading(true);
    try {
      const res = await fetch(`${BASE}/api/design-gallery/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          package_id: selPkg.id,
          shop_name: shopName,
          bio, whatsapp, instagram,
        }),
      });
      if (res.ok) {
        setSubDone(true);
      } else {
        const data = await res.json();
        Alert.alert("خطأ", data.error ?? "تعذّر الاشتراك");
      }
    } catch { Alert.alert("خطأ", "تحقق من الاتصال"); }
    setSubLoading(false);
  };

  const openContact = (m: Member) => {
    setContactMember(m);
    setContactModal(true);
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ═══ Header ═══ */}
      <ModernHeader
        title="معرض التصاميم"
        subtitle="ابحث عن مصممك المثالي · اطلب تصميمك المخصص"
        icon="color-palette-outline"
      >
        {/* إحصائيات */}
        <Animated.View entering={FadeIn.delay(100).duration(600)} style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{members.length}</Text>
            <Text style={styles.heroStatLabel}>مصمم</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{products.length}</Text>
            <Text style={styles.heroStatLabel}>تصميم</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{packages.length}</Text>
            <Text style={styles.heroStatLabel}>باقة</Text>
          </View>
        </Animated.View>

        {/* ═══ تبويبات ═══ */}
        <View style={headerUI.segmentWrap}>
          {[
            { key: "gallery",    label: "المعرض",     icon: "grid-outline" },
            { key: "designers",  label: "المصممون",   icon: "people-outline" },
            { key: "subscribe",  label: "اشتراك المصممين", icon: "ribbon-outline" },
          ].map(t => (
            <Pressable key={t.key} style={[headerUI.segment, activeTab === t.key && headerUI.segmentActive]}
              onPress={() => setActiveTab(t.key as any)}>
              <Ionicons name={t.icon as any} size={15}
                color={activeTab === t.key ? Colors.primaryDeep : Colors.textMuted} />
              <Text numberOfLines={1} style={[headerUI.segmentText, styles.segmentLabel, activeTab === t.key && headerUI.segmentTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ModernHeader>

      {/* ═══ محتوى التبويبات ═══ */}

      {/* ──── المعرض ──── */}
      {activeTab === "gallery" && (
        <View style={{ flex: 1 }}>
          {/* فلتر الفئات */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.catsScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            {CATEGORIES.map(cat => (
              <Pressable key={cat.key} style={[headerUI.chip, selCat === cat.key && headerUI.chipActive]}
                onPress={() => handleCatChange(cat.key)}>
                <Ionicons name={cat.icon as any} size={14}
                  color={selCat === cat.key ? "#fff" : Colors.textSecondary} />
                <Text style={[headerUI.chipText, selCat === cat.key && headerUI.chipTextActive]}>{cat.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Colors.primaryDeep} size="large" />
            </View>
          ) : products.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="palette-swatch-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>لا توجد تصاميم بعد</Text>
              <Text style={styles.emptyText}>كن أول المصممين في المعرض!</Text>
            </View>
          ) : (
            <FlatList
              data={products}
              keyExtractor={i => String(i.id)}
              numColumns={2}
              columnWrapperStyle={{ gap: 10, paddingHorizontal: 16 }}
              contentContainerStyle={{ paddingTop: 4, paddingBottom: 100, gap: 10 }}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={<OrgInviteCard />}
              renderItem={({ item, index }) => (
                <ProductCard item={item} index={index} onOrder={openOrder} />
              )}
            />
          )}
        </View>
      )}

      {/* ──── المصممون ──── */}
      {activeTab === "designers" && (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 12, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}>
          {members.length === 0 ? (
            <View style={[styles.emptyWrap, { marginTop: 40 }]}>
              <Ionicons name="people-outline" size={64} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>لا يوجد مصممون بعد</Text>
              <Text style={styles.emptyText}>انضم وكن أول المصممين!</Text>
            </View>
          ) : (
            <View style={styles.designersGrid}>
              {members.map((m, i) => (
                <DesignerCard key={m.id} member={m} index={i} onContact={openContact} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ──── اشتراك المصممين ──── */}
      {activeTab === "subscribe" && (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {/* لافتة تحفيزية */}
          <View style={styles.subscribeHero}>
            <Text style={styles.subscribeHeroTitle}>انضم لمعرض التصاميم 🎨</Text>
            <Text style={styles.subscribeHeroSub}>
              عرّف بنفسك · ابعت تصاميمك · استقبل طلبات من الزبائن
            </Text>
          </View>

          {/* كيف يعمل المعرض */}
          <View style={styles.howSection}>
            <Text style={styles.sectionTitle}>كيف يعمل المعرض؟</Text>
            {[
              { n: "1", t: "اختر باقتك", s: "حدد الباقة المناسبة لحجم عملك" },
              { n: "2", t: "أرسل طلبك", s: "أدخل بيانات متجرك وانتظر التفعيل" },
              { n: "3", t: "أضف تصاميمك", s: "ارفع صور أعمالك وحدد الأسعار" },
              { n: "4", t: "استقبل الطلبات", s: "يتواصل معك الزبائن مباشرة" },
            ].map((s, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(i * 80)} style={styles.howStep}>
                <View style={styles.howNum}>
                  <Text style={styles.howNumText}>{s.n}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.howTitle}>{s.t}</Text>
                  <Text style={styles.howSub}>{s.s}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          {/* الباقات */}
          <Text style={[styles.sectionTitle, { paddingHorizontal: 16 }]}>اختر باقتك</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingBottom: 8 }}>
            {packages.map(pkg => (
              <PackageCard key={pkg.id} pkg={pkg}
                selected={selPkg?.id === pkg.id}
                onSelect={() => setSelPkg(pkg)} />
            ))}
          </ScrollView>

          {/* نموذج الاشتراك */}
          {selPkg && !subDone && (
            <Animated.View entering={FadeInDown.springify()} style={styles.subscribeForm}>
              <Text style={styles.sectionTitle}>بيانات المتجر</Text>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>اسم المتجر / الاستوديو *</Text>
                <TextInput
                  style={styles.formInput}
                  value={shopName} onChangeText={setShopName}
                  placeholder="مثال: استوديو إبداع..."
                  placeholderTextColor={Colors.textMuted}
                  textAlign="right"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>نبذة عن المتجر</Text>
                <TextInput
                  style={[styles.formInput, { height: 80, textAlignVertical: "top" }]}
                  value={bio} onChangeText={setBio}
                  placeholder="اكتب وصفاً مختصراً عن تخصصك..."
                  placeholderTextColor={Colors.textMuted}
                  multiline textAlign="right"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>رقم الواتساب</Text>
                <TextInput
                  style={styles.formInput}
                  value={whatsapp} onChangeText={setWhatsapp}
                  placeholder="0912345678"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad" textAlign="right"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.formLabel}>حساب إنستجرام (اختياري)</Text>
                <TextInput
                  style={styles.formInput}
                  value={instagram} onChangeText={setInstagram}
                  placeholder="@username"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none" textAlign="right"
                />
              </View>

              <Pressable
                style={[styles.submitBtn, subLoading && { opacity: 0.6 }]}
                onPress={submitSubscription}
                disabled={subLoading}
              >
                <View style={styles.submitBtnGrad}>
                  {subLoading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        <Text style={styles.submitBtnText}>أرسل طلب الاشتراك</Text>
                      </>
                  }
                </View>
              </Pressable>
            </Animated.View>
          )}

          {/* رسالة النجاح */}
          {subDone && (
            <Animated.View entering={FadeIn} style={styles.successCard}>
              <View style={styles.successGrad}>
                <Text style={styles.successIcon}>🎉</Text>
                <Text style={styles.successTitle}>تم إرسال طلبك!</Text>
                <Text style={styles.successText}>
                  سيتم مراجعة طلبك وتفعيل حسابك خلال 24 ساعة
                </Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* ══ Modal طلب تصميم ══ */}
      <Modal visible={orderModal} animationType="slide" transparent onRequestClose={() => setOrderModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOrderModal(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>🎨 اطلب تصميمك</Text>
            {orderProduct && (
              <View style={styles.orderProductInfo}>
                <View style={styles.orderProductGrad}>
                  <Ionicons name={(CATEGORIES.find(c=>c.key===orderProduct.category)?.icon ?? "color-palette") as any} size={22} color={Colors.primaryDeep} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderProductName} numberOfLines={1}>{orderProduct.title}</Text>
                  <Text style={styles.orderProductDesigner}>{orderProduct.shop_name}</Text>
                </View>
              </View>
            )}

            <View style={styles.formField}>
              <Text style={styles.formLabel}>اسمك الكريم *</Text>
              <TextInput style={styles.formInput} value={cName} onChangeText={setCName}
                placeholder="أدخل اسمك..." placeholderTextColor={Colors.textMuted} textAlign="right" />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>رقم هاتفك *</Text>
              <TextInput style={styles.formInput} value={cPhone} onChangeText={setCPhone}
                placeholder="0912345678" placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad" textAlign="right" />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>تفاصيل التصميم المطلوب</Text>
              <TextInput style={[styles.formInput, { height: 80, textAlignVertical: "top" }]}
                value={cNotes} onChangeText={setCNotes}
                placeholder="اذكر التفاصيل: الاسم، الألوان، الموضوع..."
                placeholderTextColor={Colors.textMuted} multiline textAlign="right" />
            </View>

            <Pressable style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={submitOrder} disabled={submitting}>
              <View style={styles.submitBtnGrad}>
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="send" size={18} color="#fff" />
                      <Text style={styles.submitBtnText}>أرسل الطلب</Text>
                    </>
                }
              </View>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ══ Modal تواصل مع مصمم ══ */}
      <Modal visible={contactModal} animationType="slide" transparent onRequestClose={() => setContactModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setContactModal(false)} />
          <View style={[styles.modalSheet, { maxHeight: 380 }]}>
            <View style={styles.modalHandle} />

            {contactMember && (
              <>
                <Text style={styles.modalTitle}>تواصل مع {contactMember.shop_name}</Text>
                <View style={{ gap: 12 }}>
                  {contactMember.whatsapp ? (
                    <Pressable
                      style={[styles.contactOptionBtn, { backgroundColor: "#25D36614", borderColor: "#25D36640" }]}
                      onPress={() => Linking.openURL(`https://wa.me/${contactMember.whatsapp?.replace(/\D/g,"")}`)}
                    >
                      <Ionicons name="logo-whatsapp" size={22} color="#1A9E4B" />
                      <Text style={[styles.contactOptionText, { color: "#1A9E4B" }]}>واتساب</Text>
                    </Pressable>
                  ) : null}
                  {contactMember.instagram ? (
                    <Pressable
                      style={[styles.contactOptionBtn, { backgroundColor: "#E1306C12", borderColor: "#E1306C40" }]}
                      onPress={() => Linking.openURL(`https://instagram.com/${contactMember.instagram?.replace("@","")}`)}
                    >
                      <Ionicons name="logo-instagram" size={22} color="#E1306C" />
                      <Text style={[styles.contactOptionText, { color: "#E1306C" }]}>إنستجرام</Text>
                    </Pressable>
                  ) : null}
                  {!contactMember.whatsapp && !contactMember.instagram && (
                    <Text style={{ color: Colors.textMuted, textAlign: "center", fontFamily: "Cairo_400Regular" }}>
                      لا توجد وسائل تواصل متاحة
                    </Text>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  /* ── Header stats ── */
  heroStats: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    backgroundColor: Colors.bg, borderRadius: Colors.radius.md,
    paddingVertical: 10, paddingHorizontal: 16,
  },
  heroStat: { alignItems: "center", flex: 1 },
  heroStatNum: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary },
  heroStatLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  heroStatDivider: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: Colors.border },
  segmentLabel: { fontSize: 12 },

  /* ── فئات ── */
  catsScroll: { flexGrow: 0 },

  /* ── بطاقة منتج ── */
  productCard: {
    flex: 1, backgroundColor: Colors.cardBg,
    borderRadius: Colors.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    overflow: "hidden",
  },
  productThumb: { height: 130, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface1 },
  productThumbInner: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.primarySoft,
  },
  customBadge: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: Colors.primaryDeep, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  customBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  productInfo: { padding: 10, gap: 6 },
  productTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, lineHeight: 18 },
  productMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  catChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: Colors.header.control,
  },
  catChipText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: Colors.textSecondary },
  deliveryInfo: { flexDirection: "row", alignItems: "center", gap: 3 },
  deliveryText: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  designerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  designerAvatar: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.primarySoft,
    alignItems: "center", justifyContent: "center",
  },
  designerAvatarText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: Colors.primaryDeep },
  designerName: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, flex: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  ratingText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: Colors.accentDeep },
  productFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  priceText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  orderBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: Colors.radius.pill,
    backgroundColor: Colors.primaryDeep,
  },
  orderBtnText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },

  /* ── بطاقة مصمم ── */
  designersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  designerCard: {
    width: (width - 44) / 2, borderRadius: Colors.radius.lg,
    backgroundColor: Colors.cardBg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    padding: 14, alignItems: "center", gap: 8, overflow: "hidden",
  },
  featuredBadge: {
    position: "absolute", top: 10, right: 10,
    width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.accentSoft,
  },
  featuredBadgeText: { fontSize: 14 },
  designerCardAvatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.primarySoft,
  },
  designerCardAvatarText: { fontFamily: "Cairo_700Bold", fontSize: 22 },
  designerCardName: {
    fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary, textAlign: "center",
  },
  designerRatingRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  designerRatingCount: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted, marginLeft: 2 },
  designerStats: { flexDirection: "row", alignItems: "center", gap: 12 },
  designerStat: { alignItems: "center" },
  designerStatNum: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  designerStatLabel: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  designerStatDivider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: Colors.border },
  pkgBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
    backgroundColor: Colors.accentSoft,
  },
  pkgBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: Colors.accentDeep },
  contactBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: Colors.radius.pill,
    backgroundColor: Colors.header.control, width: "100%", justifyContent: "center",
  },
  contactBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  /* ── باقات ── */
  pkgCard: {
    width: 240, borderRadius: Colors.radius.lg, padding: 20, gap: 10,
    backgroundColor: Colors.cardBg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
    overflow: "hidden",
  },
  pkgCardSelected: { borderWidth: 2, borderColor: Colors.primaryDeep },
  pkgSelectedRibbon: {
    position: "absolute", top: 14, left: -30,
    paddingHorizontal: 30, paddingVertical: 4, transform: [{ rotate: "40deg" }],
    backgroundColor: Colors.primaryDeep,
  },
  pkgSelectedRibbonText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  pkgIcon: { fontSize: 36, textAlign: "center" },
  pkgName: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "center" },
  pkgDesc: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center",
  },
  pkgPriceRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center" },
  pkgPrice: { fontFamily: "Cairo_700Bold", fontSize: 28, color: Colors.primaryDeep },
  pkgPriceSuffix: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  pkgDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.border, marginVertical: 4 },
  pkgFeatureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pkgFeatureText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1 },
  pkgSelectBtn: {
    paddingVertical: 10, borderRadius: Colors.radius.pill, alignItems: "center",
    marginTop: 6, backgroundColor: Colors.primarySoft,
  },
  pkgSelectBtnActive: { backgroundColor: Colors.primaryDeep },
  pkgSelectBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.primaryDeep },

  /* ── اشتراك ── */
  subscribeHero: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    paddingHorizontal: 20, paddingVertical: 20,
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  subscribeHeroTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.textPrimary, textAlign: "center", marginBottom: 6,
  },
  subscribeHeroSub: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center",
  },
  howSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 12 },
  sectionTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary,
    marginBottom: 12, marginTop: 8,
  },
  howStep: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg,
    padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  howNum: {
    width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.primarySoft,
  },
  howNumText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.primaryDeep },
  howTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  howSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  subscribeForm: { paddingHorizontal: 16, paddingTop: 8, gap: 0 },

  /* ── نموذج ── */
  formField: { marginBottom: 14 },
  formLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  formInput: {
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderStrong,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
    height: 48,
  },
  submitBtn: { borderRadius: Colors.radius.lg, overflow: "hidden", marginTop: 8 },
  submitBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, backgroundColor: Colors.primaryDeep,
  },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  successCard: {
    marginHorizontal: 16, marginTop: 16, borderRadius: Colors.radius.lg, overflow: "hidden",
    backgroundColor: Colors.cardBg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  successGrad: { padding: 28, alignItems: "center", gap: 10 },
  successIcon: { fontSize: 48 },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: Colors.primaryDeep },
  successText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },

  /* ── Modal ── */
  modalOverlay: {
    flex: 1, backgroundColor: Colors.overlay,
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: Colors.radius.xl, borderTopRightRadius: Colors.radius.xl,
    padding: 22, paddingBottom: 36, overflow: "hidden",
    backgroundColor: Colors.bg,
    maxHeight: "90%",
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.borderStrong, alignSelf: "center", marginBottom: 18,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary,
    textAlign: "center", marginBottom: 16,
  },
  orderProductInfo: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.cardBg, borderRadius: Colors.radius.lg,
    padding: 12, marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.border,
  },
  orderProductGrad: {
    width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.primarySoft,
  },
  orderProductName: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  orderProductDesigner: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textMuted },
  contactOptionBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, borderRadius: Colors.radius.lg, borderWidth: 1,
  },
  contactOptionText: { fontFamily: "Cairo_700Bold", fontSize: 16 },

  /* ── Loading / Empty ── */
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textSecondary },
  emptyText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textMuted },
});
