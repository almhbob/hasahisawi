import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, Modal, ActivityIndicator, FlatList,
  Dimensions, Platform, Alert, Linking,
} from "react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";
import AnimatedPress from "@/components/AnimatedPress";
import OrgInviteCard from "@/components/OrgInviteCard";


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

// ── تدرجات الفئات ────────────────────────────────────────────────
const CAT_GRAD: Record<string, [string,string]> = {
  invitations:  ["#EC4899","#BE185D"],
  certificates: ["#F59E0B","#D97706"],
  marbled:      ["#8B5CF6","#6D28D9"],
  logos:        ["#06B6D4","#0891B2"],
  social:       ["#F97316","#C2410C"],
  banners:      ["#EF4444","#B91C1C"],
  all:          ["#22C55E","#15803D"],
};

// ── مكوّن بطاقة المنتج ───────────────────────────────────────────
function ProductCard({ item, index, onOrder }: { item: Product; index: number; onOrder: (p: Product) => void }) {
  const cat = item.category;
  const grad = CAT_GRAD[cat] ?? ["#22C55E","#15803D"];
  const catObj = CATEGORIES.find(c => c.key === cat);

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify().damping(14)} style={styles.productCard}>
      <AnimatedPress onPress={() => onOrder(item)} style={{ flex: 1 }}>
        {/* صورة / غلاف */}
        <LinearGradient colors={[grad[0]+"30", grad[1]+"18"]} style={styles.productThumb}>
          <LinearGradient colors={[grad[0]+"80", grad[1]]} style={styles.productThumbInner}>
            <Ionicons name={(catObj?.icon ?? "color-palette") as any} size={32} color="#fff" />
          </LinearGradient>
          {item.is_custom && (
            <View style={styles.customBadge}>
              <Text style={styles.customBadgeText}>مخصّص</Text>
            </View>
          )}
        </LinearGradient>

        {/* معلومات */}
        <View style={styles.productInfo}>
          <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.productMeta}>
            <View style={[styles.catChip, { backgroundColor: grad[0]+"20", borderColor: grad[0]+"40" }]}>
              <Text style={[styles.catChipText, { color: grad[0] }]}>{CAT_LABEL[cat] ?? cat}</Text>
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
                <Ionicons name="star" size={10} color="#F59E0B" />
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
                <Text style={[styles.priceText, { color: Colors.primary }]}>بالتفاوض</Text>
              )}
            </View>
            <Pressable style={[styles.orderBtn, { backgroundColor: grad[0] }]} onPress={() => onOrder(item)}>
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
  const pkgColor = member.pkg_color ?? Colors.primary;
  const initial  = member.shop_name?.charAt(0) ?? "م";

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(14)} style={styles.designerCard}>
      <LinearGradient colors={[pkgColor+"18", pkgColor+"08"]} style={StyleSheet.absoluteFill} />
      <View style={[styles.designerCardBorder, { borderColor: pkgColor+"30" }]} />

      {/* أيقونة الباقة */}
      {member.is_featured && (
        <View style={[styles.featuredBadge, { backgroundColor: pkgColor }]}>
          <Text style={styles.featuredBadgeText}>{member.pkg_icon ?? "⭐"}</Text>
        </View>
      )}

      {/* أفاتار */}
      <View style={[styles.designerCardAvatar, { backgroundColor: pkgColor+"30", borderColor: pkgColor+"60" }]}>
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
            <Ionicons key={s} name={s <= Math.round(Number(member.rating)) ? "star" : "star-outline"} size={12} color="#F59E0B" />
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
        <View style={[styles.pkgBadge, { backgroundColor: pkgColor+"20", borderColor: pkgColor+"40" }]}>
          <Text style={[styles.pkgBadgeText, { color: pkgColor }]}>{member.package_name}</Text>
        </View>
      )}

      {/* التواصل */}
      <Pressable style={[styles.contactBtn, { borderColor: pkgColor+"50" }]} onPress={() => onContact(member)}>
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
        <View style={[styles.pkgCard, selected && { borderColor: pkg.color, borderWidth: 2 }]}>
          {selected && (
            <View style={[styles.pkgSelectedRibbon, { backgroundColor: pkg.color }]}>
              <Text style={styles.pkgSelectedRibbonText}>محدّد ✓</Text>
            </View>
          )}
          <LinearGradient colors={[pkg.color+"28", pkg.color+"0A"]} style={StyleSheet.absoluteFill} />

          <Text style={styles.pkgIcon}>{pkg.icon}</Text>
          <Text style={[styles.pkgName, { color: pkg.color }]}>{pkg.name}</Text>
          <Text style={styles.pkgDesc}>{pkg.description}</Text>

          <View style={styles.pkgPriceRow}>
            <Text style={[styles.pkgPrice, { color: pkg.color }]}>
              {pkg.price_monthly.toLocaleString()}
            </Text>
            <Text style={styles.pkgPriceSuffix}> ج.س / شهر</Text>
          </View>

          <View style={styles.pkgDivider} />

          {pkg.features.map((f, i) => (
            <View key={i} style={styles.pkgFeatureRow}>
              <Ionicons name="checkmark-circle" size={16} color={pkg.color} />
              <Text style={styles.pkgFeatureText}>{f}</Text>
            </View>
          ))}

          <View style={[styles.pkgSelectBtn, { backgroundColor: selected ? pkg.color : pkg.color+"20", borderColor: pkg.color }]}>
            <Text style={[styles.pkgSelectBtnText, { color: selected ? "#fff" : pkg.color }]}>
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
  const topPad = Platform.OS === "web" ? 67 : insets.top;

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
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* ═══ Hero ═══ */}
      <LinearGradient
        colors={["#1B0533","#0D1A2E","#0A0F0C"]}
        style={styles.hero}
      >
        {/* خلفية زخرفية */}
        <View style={styles.heroBubble1} />
        <View style={styles.heroBubble2} />

        <Animated.View entering={FadeIn.delay(100).duration(600)} style={styles.heroContent}>
          <View style={styles.heroIconRow}>
            <LinearGradient colors={["#A855F7","#EC4899"]} style={styles.heroIconWrap}>
              <MaterialCommunityIcons name="palette-swatch" size={28} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={styles.heroTitle}>معرض التصاميم</Text>
          <Text style={styles.heroSub}>
            ابحث عن مصممك المثالي · اطلب تصميمك المخصص
          </Text>

          {/* إحصائيات */}
          <View style={styles.heroStats}>
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
          </View>
        </Animated.View>
      </LinearGradient>

      {/* ═══ تبويبات ═══ */}
      <View style={styles.tabBar}>
        {[
          { key: "gallery",    label: "المعرض",     icon: "grid-outline" },
          { key: "designers",  label: "المصممون",   icon: "people-outline" },
          { key: "subscribe",  label: "اشتراك المصممين", icon: "ribbon-outline" },
        ].map(t => (
          <Pressable key={t.key} style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
            onPress={() => setActiveTab(t.key as any)}>
            <Ionicons name={t.icon as any} size={18}
              color={activeTab === t.key ? "#A855F7" : Colors.textMuted} />
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ═══ محتوى التبويبات ═══ */}

      {/* ──── المعرض ──── */}
      {activeTab === "gallery" && (
        <View style={{ flex: 1 }}>
          {/* فلتر الفئات */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.catsScroll} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
            {CATEGORIES.map(cat => (
              <Pressable key={cat.key} style={[styles.catBtn, selCat === cat.key && { backgroundColor: cat.color, borderColor: cat.color }]}
                onPress={() => handleCatChange(cat.key)}>
                <Ionicons name={cat.icon as any} size={14}
                  color={selCat === cat.key ? "#fff" : cat.color} />
                <Text style={[styles.catBtnText, selCat === cat.key && { color: "#fff" }]}>{cat.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#A855F7" size="large" />
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
          <LinearGradient colors={["#4C1D95","#1B0533"]} style={styles.subscribeHero}>
            <Text style={styles.subscribeHeroTitle}>انضم لمعرض التصاميم 🎨</Text>
            <Text style={styles.subscribeHeroSub}>
              عرّف بنفسك · ابعت تصاميمك · استقبل طلبات من الزبائن
            </Text>
          </LinearGradient>

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
                <LinearGradient colors={["#A855F7","#6D28D9"]} style={styles.howNum}>
                  <Text style={styles.howNumText}>{s.n}</Text>
                </LinearGradient>
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
                <LinearGradient colors={["#A855F7","#7C3AED"]} style={styles.submitBtnGrad}>
                  {subLoading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="checkmark-circle" size={20} color="#fff" />
                        <Text style={styles.submitBtnText}>أرسل طلب الاشتراك</Text>
                      </>
                  }
                </LinearGradient>
              </Pressable>
            </Animated.View>
          )}

          {/* رسالة النجاح */}
          {subDone && (
            <Animated.View entering={FadeIn} style={styles.successCard}>
              <LinearGradient colors={["#A855F7","#4C1D95"]} style={styles.successGrad}>
                <Text style={styles.successIcon}>🎉</Text>
                <Text style={styles.successTitle}>تم إرسال طلبك!</Text>
                <Text style={styles.successText}>
                  سيتم مراجعة طلبك وتفعيل حسابك خلال 24 ساعة
                </Text>
              </LinearGradient>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {/* ══ Modal طلب تصميم ══ */}
      <Modal visible={orderModal} animationType="slide" transparent onRequestClose={() => setOrderModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOrderModal(false)} />
          <View style={styles.modalSheet}>
            <LinearGradient colors={["#0F1814","#0A0F0C"]} style={StyleSheet.absoluteFill} />
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>🎨 اطلب تصميمك</Text>
            {orderProduct && (
              <View style={styles.orderProductInfo}>
                <LinearGradient
                  colors={CAT_GRAD[orderProduct.category] ?? ["#A855F7","#6D28D9"]}
                  style={styles.orderProductGrad}
                >
                  <Ionicons name={(CATEGORIES.find(c=>c.key===orderProduct.category)?.icon ?? "color-palette") as any} size={22} color="#fff" />
                </LinearGradient>
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
              <LinearGradient colors={["#A855F7","#7C3AED"]} style={styles.submitBtnGrad}>
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="send" size={18} color="#fff" />
                      <Text style={styles.submitBtnText}>أرسل الطلب</Text>
                    </>
                }
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ══ Modal تواصل مع مصمم ══ */}
      <Modal visible={contactModal} animationType="slide" transparent onRequestClose={() => setContactModal(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setContactModal(false)} />
          <View style={[styles.modalSheet, { maxHeight: 380 }]}>
            <LinearGradient colors={["#0F1814","#0A0F0C"]} style={StyleSheet.absoluteFill} />
            <View style={styles.modalHandle} />

            {contactMember && (
              <>
                <Text style={styles.modalTitle}>تواصل مع {contactMember.shop_name}</Text>
                <View style={{ gap: 12 }}>
                  {contactMember.whatsapp ? (
                    <Pressable
                      style={[styles.contactOptionBtn, { backgroundColor: "#25D36620", borderColor: "#25D36650" }]}
                      onPress={() => Linking.openURL(`https://wa.me/${contactMember.whatsapp?.replace(/\D/g,"")}`)}
                    >
                      <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                      <Text style={[styles.contactOptionText, { color: "#25D366" }]}>واتساب</Text>
                    </Pressable>
                  ) : null}
                  {contactMember.instagram ? (
                    <Pressable
                      style={[styles.contactOptionBtn, { backgroundColor: "#E1306C20", borderColor: "#E1306C50" }]}
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

  /* ── Hero ── */
  hero: { paddingBottom: 16, overflow: "hidden" },
  heroBubble1: {
    position: "absolute", width: 200, height: 200, borderRadius: 100,
    backgroundColor: "#A855F720", top: -60, right: -60,
  },
  heroBubble2: {
    position: "absolute", width: 150, height: 150, borderRadius: 75,
    backgroundColor: "#EC489920", bottom: -30, left: -30,
  },
  heroContent: { paddingHorizontal: 20, paddingTop: 10 },
  heroIconRow: { alignItems: "center", marginBottom: 12 },
  heroIconWrap: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  heroTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 26, color: Colors.textPrimary,
    textAlign: "center", marginBottom: 4,
  },
  heroSub: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary,
    textAlign: "center", lineHeight: 20, marginBottom: 16,
  },
  heroStats: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: Colors.radius.xl,
    paddingVertical: 12, paddingHorizontal: 20, gap: 0,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.10)",
  },
  heroStat: { alignItems: "center", flex: 1 },
  heroStatNum: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#A855F7" },
  heroStatLabel: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textMuted },
  heroStatDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.10)" },

  /* ── تبويبات ── */
  tabBar: {
    flexDirection: "row", backgroundColor: "rgba(255,255,255,0.04)",
    borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.08)",
  },
  tabItem: {
    flex: 1, alignItems: "center", paddingVertical: 10, gap: 3,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: "#A855F7" },
  tabLabel: { fontFamily: "Cairo_500Medium", fontSize: 11, color: Colors.textMuted },
  tabLabelActive: { color: "#A855F7", fontFamily: "Cairo_700Bold" },

  /* ── فئات ── */
  catsScroll: { flexGrow: 0 },
  catBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  catBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: Colors.textSecondary },

  /* ── بطاقة منتج ── */
  productCard: {
    flex: 1, backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: Colors.radius.lg, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  productThumb: { height: 130, alignItems: "center", justifyContent: "center" },
  productThumbInner: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  customBadge: {
    position: "absolute", top: 8, right: 8,
    backgroundColor: "rgba(168,85,247,0.85)", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  customBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  productInfo: { padding: 10, gap: 6 },
  productTitle: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textPrimary, lineHeight: 18 },
  productMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  catChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 0.5,
  },
  catChipText: { fontFamily: "Cairo_700Bold", fontSize: 9 },
  deliveryInfo: { flexDirection: "row", alignItems: "center", gap: 3 },
  deliveryText: { fontFamily: "Cairo_400Regular", fontSize: 10, color: Colors.textMuted },
  designerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  designerAvatar: {
    width: 20, height: 20, borderRadius: 7, backgroundColor: "#A855F730",
    alignItems: "center", justifyContent: "center",
  },
  designerAvatarText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#A855F7" },
  designerName: { fontFamily: "Cairo_400Regular", fontSize: 11, color: Colors.textSecondary, flex: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  ratingText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#F59E0B" },
  productFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  priceText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: Colors.textPrimary },
  orderBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  orderBtnText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" },

  /* ── بطاقة مصمم ── */
  designersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  designerCard: {
    width: (width - 44) / 2, borderRadius: Colors.radius.xl,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
    padding: 14, alignItems: "center", gap: 8, overflow: "hidden",
  },
  designerCardBorder: { position: "absolute", inset: 0, borderRadius: Colors.radius.xl, borderWidth: 1 },
  featuredBadge: {
    position: "absolute", top: 10, right: 10,
    width: 24, height: 24, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  featuredBadgeText: { fontSize: 14 },
  designerCardAvatar: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: "center", justifyContent: "center", borderWidth: 2,
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
  designerStatDivider: { width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.10)" },
  pkgBadge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 0.5,
  },
  pkgBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  contactBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)", width: "100%", justifyContent: "center",
  },
  contactBtnText: { fontFamily: "Cairo_600SemiBold", fontSize: 12 },

  /* ── باقات ── */
  pkgCard: {
    width: 240, borderRadius: Colors.radius.xl, padding: 20, gap: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  pkgSelectedRibbon: {
    position: "absolute", top: 14, left: -30,
    paddingHorizontal: 30, paddingVertical: 4, transform: [{ rotate: "40deg" }],
  },
  pkgSelectedRibbonText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  pkgIcon: { fontSize: 36, textAlign: "center" },
  pkgName: { fontFamily: "Cairo_700Bold", fontSize: 20, textAlign: "center" },
  pkgDesc: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center",
  },
  pkgPriceRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "center" },
  pkgPrice: { fontFamily: "Cairo_700Bold", fontSize: 28 },
  pkgPriceSuffix: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textMuted },
  pkgDivider: { height: 0.5, backgroundColor: "rgba(255,255,255,0.10)", marginVertical: 4 },
  pkgFeatureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pkgFeatureText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: Colors.textSecondary, flex: 1 },
  pkgSelectBtn: {
    paddingVertical: 10, borderRadius: 12, alignItems: "center",
    borderWidth: 1, marginTop: 6,
  },
  pkgSelectBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14 },

  /* ── اشتراك ── */
  subscribeHero: { paddingHorizontal: 20, paddingVertical: 24, marginBottom: 4 },
  subscribeHeroTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff", textAlign: "center", marginBottom: 6,
  },
  subscribeHeroSub: {
    fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.70)", textAlign: "center",
  },
  howSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 12 },
  sectionTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 16, color: Colors.textPrimary,
    marginBottom: 12, marginTop: 8,
  },
  howStep: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: Colors.radius.lg,
    padding: 14, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.08)",
  },
  howNum: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  howNumText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  howTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: Colors.textPrimary },
  howSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  subscribeForm: { paddingHorizontal: 16, paddingTop: 8, gap: 0 },

  /* ── نموذج ── */
  formField: { marginBottom: 14 },
  formLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  formInput: {
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: Colors.radius.md,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: Colors.textPrimary,
    height: 48,
  },
  submitBtn: { borderRadius: Colors.radius.lg, overflow: "hidden", marginTop: 8 },
  submitBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16,
  },
  submitBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  successCard: { marginHorizontal: 16, marginTop: 16, borderRadius: Colors.radius.xl, overflow: "hidden" },
  successGrad: { padding: 28, alignItems: "center", gap: 10 },
  successIcon: { fontSize: 48 },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff" },
  successText: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "rgba(255,255,255,0.80)", textAlign: "center" },

  /* ── Modal ── */
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.70)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, paddingBottom: 36, overflow: "hidden",
    borderTopWidth: 0.5, borderColor: "rgba(255,255,255,0.10)",
    maxHeight: "90%",
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.20)", alignSelf: "center", marginBottom: 18,
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 18, color: Colors.textPrimary,
    textAlign: "center", marginBottom: 16,
  },
  orderProductInfo: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: Colors.radius.lg,
    padding: 12, marginBottom: 16,
    borderWidth: 0.5, borderColor: "rgba(255,255,255,0.10)",
  },
  orderProductGrad: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
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
